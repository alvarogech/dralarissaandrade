import type { WhatsAppProvider } from "./provider";
import type { ConversationRef, InboundMessage, MessageStatus, SendResult } from "./types";

/**
 * Provider padrão enquanto nenhuma instância Chatwoot real existir
 * (`WHATSAPP_PROVIDER=mock`, ver docs/WHATSAPP_ARCHITECTURE.md). Nunca faz
 * uma chamada HTTP real — só registra em memória e avisa alto no log, para
 * nunca ser confundido com envio de verdade.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  private nextId = 1;
  readonly sentMessages: Array<{ to: string; body: string }> = [];

  private log(action: string, to: string) {
    // eslint-disable-next-line no-console
    console.warn(`[MOCK WhatsApp] ${action} para ${to} — mensagem NÃO enviada de verdade (sem provider configurado).`);
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    this.log("sendText", to);
    this.sentMessages.push({ to, body });
    return { externalMessageId: `mock-${this.nextId++}`, status: "sent" };
  }

  async sendTemplate(to: string, templateName: string): Promise<SendResult> {
    this.log(`sendTemplate(${templateName})`, to);
    return { externalMessageId: `mock-${this.nextId++}`, status: "sent" };
  }

  async sendMedia(to: string): Promise<SendResult> {
    this.log("sendMedia", to);
    return { externalMessageId: `mock-${this.nextId++}`, status: "sent" };
  }

  async fetchMessages(): Promise<InboundMessage[]> {
    return [];
  }

  async getConversation(): Promise<ConversationRef | null> {
    return null;
  }

  async getStatus(): Promise<MessageStatus> {
    return "sent";
  }

  async markAsRead(): Promise<void> {
    return;
  }
}
