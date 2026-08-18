import type { ConversationRef, InboundMessage, MessageStatus, SendResult } from "./types";

/**
 * Camada abstrata de WhatsApp — ver docs/WHATSAPP_ARCHITECTURE.md. Nenhum
 * código de negócio deve chamar um provider concreto diretamente; sempre
 * através desta interface, obtida via lib/whatsapp/get-provider.ts. Toda
 * implementação real precisa gravar `external_message_id`, `status` e
 * `timestamp` em `messages` — nunca inventar um "sent" sem confirmação.
 */
export interface WhatsAppProvider {
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<SendResult>;
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<SendResult>;
  fetchMessages(conversationExternalId: string, since?: Date): Promise<InboundMessage[]>;
  getConversation(phone: string): Promise<ConversationRef | null>;
  getStatus(externalMessageId: string): Promise<MessageStatus>;
  markAsRead(externalMessageId: string): Promise<void>;
}

export type { ConversationRef, InboundMessage, MessageStatus, SendResult };
