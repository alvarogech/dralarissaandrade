import type { WhatsAppProvider } from "./provider";
import type { ConversationRef, InboundMessage, MessageStatus, SendResult } from "./types";

/**
 * Implementação concreta de WhatsAppProvider sobre a Application API do
 * Chatwoot self-hosted — ver docs/WHATSAPP_ARCHITECTURE.md e a decisão de
 * 2026-08-18 em docs/DECISIONS.md.
 *
 * Endpoints, autenticação e corpo de REQUEST usados aqui foram confirmados
 * na documentação oficial (developers.chatwoot.com) nesta sessão. O formato
 * exato do corpo de RESPOSTA de cada endpoint não foi verificado contra uma
 * instância real (nenhuma existe ainda) — o parsing abaixo tenta os formatos
 * mais comuns da API (`payload` envelope) e lança um erro claro se nenhum
 * bater, em vez de assumir sucesso silenciosamente (ver EXECUTE → VERIFY →
 * COMMIT em docs/SECURITY.md). Validar contra uma instância real antes de
 * usar em produção.
 */
export interface ChatwootConfig {
  baseUrl: string;
  accountId: string;
  inboxId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

interface ChatwootContact {
  id: number;
  phone_number?: string;
}

interface ChatwootConversation {
  id: number;
  status?: string;
}

interface ChatwootMessage {
  id: number;
  content: string;
  message_type: number | string;
  status?: string;
  created_at?: number | string;
  conversation_id?: number;
  sender?: { phone_number?: string };
}

/** created_at do Chatwoot pode vir como epoch em segundos (number) ou ISO string. */
function parseChatwootTimestamp(createdAt: number | string | undefined): Date {
  if (typeof createdAt === "number") return new Date(createdAt * 1000);
  if (typeof createdAt === "string" && createdAt) return new Date(createdAt);
  return new Date();
}

function unwrapPayload<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "payload" in data) {
    const payload = (data as { payload: unknown }).payload;
    if (Array.isArray(payload)) return payload as T[];
  }
  return [];
}

function unwrapSingle<T extends { id: number }>(data: unknown, label: string): T {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.id === "number") return obj as unknown as T;
    if (obj.payload && typeof (obj.payload as Record<string, unknown>).id === "number") {
      return obj.payload as T;
    }
  }
  throw new Error(
    `ChatwootProvider: resposta inesperada de ${label} — formato de corpo não reconhecido. ` +
      "Confirmar contra a instância real e ajustar o parsing (ver docs/WHATSAPP_ARCHITECTURE.md)."
  );
}

export class ChatwootProvider implements WhatsAppProvider {
  constructor(private readonly config: ChatwootConfig) {}

  private get fetchImpl(): typeof fetch {
    return this.config.fetchImpl ?? fetch;
  }

  private headers() {
    return { api_access_token: this.config.accessToken, "Content-Type": "application/json" };
  }

  private url(path: string): string {
    return `${this.config.baseUrl}/api/v1/accounts/${this.config.accountId}${path}`;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(this.url(path), { ...init, headers: this.headers() });
    if (!res.ok) {
      throw new Error(`ChatwootProvider: ${init?.method ?? "GET"} ${path} falhou com status ${res.status}`);
    }
    return res.json();
  }

  private async findContactByPhone(phone: string): Promise<ChatwootContact | null> {
    const data = await this.request(`/contacts/search?q=${encodeURIComponent(phone)}`);
    const matches = unwrapPayload<ChatwootContact>(data);
    return matches.find((c) => c.phone_number === phone) ?? matches[0] ?? null;
  }

  private async createContact(phone: string): Promise<ChatwootContact> {
    const data = await this.request("/contacts", {
      method: "POST",
      body: JSON.stringify({ inbox_id: Number(this.config.inboxId), phone_number: phone, name: phone }),
    });
    return unwrapSingle<ChatwootContact>(data, "POST /contacts");
  }

  private async resolveConversation(phone: string): Promise<ChatwootConversation> {
    const contact = (await this.findContactByPhone(phone)) ?? (await this.createContact(phone));

    const conversationsData = await this.request(`/contacts/${contact.id}/conversations`);
    const conversations = unwrapPayload<ChatwootConversation>(conversationsData);
    const open = conversations.find((c) => c.status === "open" || c.status === "pending");
    if (open) return open;

    const created = await this.request("/conversations", {
      method: "POST",
      body: JSON.stringify({
        source_id: phone,
        inbox_id: Number(this.config.inboxId),
        contact_id: contact.id,
        status: "open",
      }),
    });
    return unwrapSingle<ChatwootConversation>(created, "POST /conversations");
  }

  private encodeMessageId(conversationId: number, messageId: number): string {
    return `${conversationId}:${messageId}`;
  }

  private decodeMessageId(externalMessageId: string): { conversationId: number; messageId: number } {
    const [conversationId, messageId] = externalMessageId.split(":").map(Number);
    if (!conversationId || !messageId) {
      throw new Error(`ChatwootProvider: externalMessageId inválido "${externalMessageId}" (esperado "conversationId:messageId")`);
    }
    return { conversationId, messageId };
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    try {
      const conversation = await this.resolveConversation(to);
      const data = await this.request(`/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: body, message_type: "outgoing" }),
      });
      const message = unwrapSingle<ChatwootMessage>(data, "POST .../messages");
      return { externalMessageId: this.encodeMessageId(conversation.id, message.id), status: "sent" };
    } catch (error) {
      return { externalMessageId: "", status: "failed", error: (error as Error).message };
    }
  }

  async sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<SendResult> {
    try {
      const conversation = await this.resolveConversation(to);
      const data = await this.request(`/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: templateName,
          message_type: "outgoing",
          template_params: {
            name: templateName,
            // category/language sao placeholders — precisam refletir o template
            // real aprovado pela Meta quando a conta existir de verdade.
            category: "UTILITY",
            language: "pt_BR",
            processed_params: params,
          },
        }),
      });
      const message = unwrapSingle<ChatwootMessage>(data, "POST .../messages (template)");
      return { externalMessageId: this.encodeMessageId(conversation.id, message.id), status: "sent" };
    } catch (error) {
      return { externalMessageId: "", status: "failed", error: (error as Error).message };
    }
  }

  async sendMedia(): Promise<SendResult> {
    throw new Error(
      "ChatwootProvider.sendMedia: endpoint de Application API para mídia não confirmado nesta " +
        "sessão (provavelmente multipart/form-data com attachments[]) — ver docs/WHATSAPP_ARCHITECTURE.md."
    );
  }

  async fetchMessages(conversationExternalId: string, since?: Date): Promise<InboundMessage[]> {
    const data = await this.request(`/conversations/${conversationExternalId}/messages`);
    const messages = unwrapPayload<ChatwootMessage>(data);
    return messages
      .filter((m) => (m.message_type === "incoming" || m.message_type === 0) && m.content)
      .filter((m) => !since || parseChatwootTimestamp(m.created_at) >= since)
      .map((m) => ({
        externalMessageId: this.encodeMessageId(Number(conversationExternalId), m.id),
        externalConversationId: conversationExternalId,
        phone: m.sender?.phone_number ?? "",
        body: m.content,
        createdAt: parseChatwootTimestamp(m.created_at).toISOString(),
      }));
  }

  async getConversation(phone: string): Promise<ConversationRef | null> {
    const contact = await this.findContactByPhone(phone);
    if (!contact) return null;

    const conversationsData = await this.request(`/contacts/${contact.id}/conversations`);
    const conversations = unwrapPayload<ChatwootConversation>(conversationsData);
    const conversation = conversations[0];
    if (!conversation) return null;

    return {
      externalConversationId: String(conversation.id),
      externalContactId: String(contact.id),
      phone,
    };
  }

  async getStatus(externalMessageId: string): Promise<MessageStatus> {
    const { conversationId, messageId } = this.decodeMessageId(externalMessageId);
    const data = await this.request(`/conversations/${conversationId}/messages`);
    const messages = unwrapPayload<ChatwootMessage>(data);
    const message = messages.find((m) => m.id === messageId);
    if (!message?.status) return "unknown";
    if (["sent", "delivered", "read", "failed"].includes(message.status)) {
      return message.status as MessageStatus;
    }
    return "unknown";
  }

  async markAsRead(): Promise<void> {
    throw new Error(
      "ChatwootProvider.markAsRead: nenhum endpoint de Application API para marcar mensagem " +
        "como lida foi confirmado nesta sessão — ver docs/WHATSAPP_ARCHITECTURE.md."
    );
  }
}
