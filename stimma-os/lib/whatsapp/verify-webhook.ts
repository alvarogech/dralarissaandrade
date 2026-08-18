import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificação de assinatura de webhook do Chatwoot — ver
 * docs/WHATSAPP_ARCHITECTURE.md. Esquema confirmado na documentação oficial:
 * `X-Chatwoot-Signature: sha256=` + HMAC-SHA256(secret, `${timestamp}.${corpo bruto}`),
 * junto com `X-Chatwoot-Timestamp`. Puro e testável sem rede — nunca confiar
 * em payload não assinado (ver docs/SECURITY.md).
 */
export interface VerifyChatwootWebhookParams {
  rawBody: string;
  timestamp: string;
  signatureHeader: string | null;
  secret: string;
}

export function verifyChatwootSignature(params: VerifyChatwootWebhookParams): boolean {
  const { rawBody, timestamp, signatureHeader, secret } = params;
  if (!signatureHeader || !timestamp) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
