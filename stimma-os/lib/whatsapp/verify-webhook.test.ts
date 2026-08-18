import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyChatwootSignature } from "./verify-webhook";

const SECRET = "whsec_test_123";

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

describe("verifyChatwootSignature", () => {
  it("aceita uma assinatura valida", () => {
    const timestamp = "1755500000";
    const rawBody = JSON.stringify({ event: "message_created", id: 1 });

    const result = verifyChatwootSignature({
      rawBody,
      timestamp,
      signatureHeader: sign(timestamp, rawBody),
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it("rejeita quando o corpo foi alterado depois de assinado", () => {
    const timestamp = "1755500000";
    const rawBody = JSON.stringify({ event: "message_created", id: 1 });
    const signature = sign(timestamp, rawBody);

    const result = verifyChatwootSignature({
      rawBody: JSON.stringify({ event: "message_created", id: 2 }),
      timestamp,
      signatureHeader: signature,
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it("rejeita quando o secret esta errado", () => {
    const timestamp = "1755500000";
    const rawBody = JSON.stringify({ event: "message_created" });

    const result = verifyChatwootSignature({
      rawBody,
      timestamp,
      signatureHeader: sign(timestamp, rawBody, "outro-secret"),
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it("rejeita quando falta o header de assinatura", () => {
    const result = verifyChatwootSignature({
      rawBody: "{}",
      timestamp: "1755500000",
      signatureHeader: null,
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it("rejeita um header sem o prefixo sha256=", () => {
    const result = verifyChatwootSignature({
      rawBody: "{}",
      timestamp: "1755500000",
      signatureHeader: "deadbeef",
      secret: SECRET,
    });

    expect(result).toBe(false);
  });
});
