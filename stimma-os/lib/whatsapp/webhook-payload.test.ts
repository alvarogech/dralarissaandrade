import { describe, expect, it } from "vitest";
import { extractInboundMessage } from "./webhook-payload";

describe("extractInboundMessage", () => {
  it("extrai telefone de conversation.meta.sender quando presente", () => {
    const result = extractInboundMessage({
      event: "message_created",
      id: 1,
      content: "Oi, gostaria de saber sobre preenchimento",
      message_type: "incoming",
      conversation: { id: 900, meta: { sender: { phone_number: "+5562999990000" } } },
    });

    expect(result).toEqual({
      externalConversationId: "900",
      phone: "+5562999990000",
      body: "Oi, gostaria de saber sobre preenchimento",
      createdAt: expect.any(String),
    });
  });

  it("cai para contact_inbox.source_id quando meta.sender nao tem telefone", () => {
    const result = extractInboundMessage({
      event: "message_created",
      id: 2,
      content: "Oi",
      message_type: "incoming",
      conversation: { id: 901, contact_inbox: { source_id: "+5562988887777" } },
    });

    expect(result?.phone).toBe("+5562988887777");
  });

  it("retorna phone null (nao inventa) quando nenhum campo conhecido tem o telefone", () => {
    const result = extractInboundMessage({
      event: "message_created",
      id: 3,
      content: "Oi",
      message_type: "incoming",
      conversation: { id: 902 },
    });

    expect(result?.phone).toBeNull();
  });

  it("ignora mensagens outgoing (enviadas pela clinica)", () => {
    const result = extractInboundMessage({
      event: "message_created",
      id: 4,
      content: "Confirmado!",
      message_type: "outgoing",
      conversation: { id: 903 },
    });

    expect(result).toBeNull();
  });

  it("ignora eventos que nao sao message_created", () => {
    const result = extractInboundMessage({
      event: "conversation_status_changed",
      id: 5,
      content: null,
      message_type: "incoming",
    });

    expect(result).toBeNull();
  });
});
