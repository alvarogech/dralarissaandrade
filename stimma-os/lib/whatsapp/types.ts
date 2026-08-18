export interface SendResult {
  externalMessageId: string;
  status: "sent" | "failed";
  error?: string;
}

export interface InboundMessage {
  externalMessageId: string;
  externalConversationId: string;
  phone: string;
  body: string;
  createdAt: string;
}

export interface ConversationRef {
  externalConversationId: string;
  externalContactId: string;
  phone: string;
}

export type MessageStatus = "sent" | "delivered" | "read" | "failed" | "unknown";
