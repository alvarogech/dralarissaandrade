/**
 * Extração defensiva de dados do payload de webhook do Chatwoot. O formato
 * exato de onde o telefone do contato aparece (`conversation.meta.sender`,
 * `conversation.contact_inbox.source_id`, etc.) não foi confirmado contra uma
 * instância real nesta sessão — em vez de assumir um único caminho e falhar
 * silenciosamente, tenta os caminhos documentados/observados publicamente e
 * sinaliza `requires_review` quando nenhum bate (ver docs/WHATSAPP_ARCHITECTURE.md
 * e o princípio de nunca adivinhar em docs/SIMPLES_DENTAL_MAP.md).
 */
export interface ChatwootMessageWebhook {
  event: string;
  id: number;
  content: string | null;
  message_type: string | number;
  created_at?: string | number;
  conversation?: {
    id: number;
    contact_inbox?: { source_id?: string };
    meta?: { sender?: { phone_number?: string; name?: string } };
    contact?: { phone_number?: string; name?: string };
  };
}

export interface ExtractedInboundMessage {
  externalConversationId: string;
  phone: string | null;
  body: string;
  createdAt: string;
}

export function extractInboundMessage(payload: ChatwootMessageWebhook): ExtractedInboundMessage | null {
  if (payload.event !== "message_created") return null;
  if (payload.message_type !== "incoming" && payload.message_type !== 0) return null;
  if (!payload.conversation || !payload.content) return null;

  const phone =
    payload.conversation.meta?.sender?.phone_number ??
    payload.conversation.contact?.phone_number ??
    payload.conversation.contact_inbox?.source_id ??
    null;

  return {
    externalConversationId: String(payload.conversation.id),
    phone,
    body: payload.content,
    createdAt:
      typeof payload.created_at === "number"
        ? new Date(payload.created_at * 1000).toISOString()
        : payload.created_at ?? new Date().toISOString(),
  };
}
