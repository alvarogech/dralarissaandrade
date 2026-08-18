import { ChatwootProvider } from "./chatwoot-provider";
import { MockWhatsAppProvider } from "./mock-provider";
import type { WhatsAppProvider } from "./provider";

/**
 * Seleciona o provider por variável de ambiente — mesmo padrão de
 * NEXT_PUBLIC_SUPABASE_URL ausente → modo demonstração (ver README.md).
 * Padrão é sempre 'mock' quando WHATSAPP_PROVIDER não está definida, nunca
 * assume que uma instância Chatwoot real existe.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER ?? "mock";

  if (provider === "chatwoot") {
    const baseUrl = process.env.CHATWOOT_BASE_URL;
    const accountId = process.env.CHATWOOT_ACCOUNT_ID;
    const inboxId = process.env.CHATWOOT_INBOX_ID;
    const accessToken = process.env.CHATWOOT_ACCESS_TOKEN;

    if (!baseUrl || !accountId || !inboxId || !accessToken) {
      throw new Error(
        "WHATSAPP_PROVIDER=chatwoot exige CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, " +
          "CHATWOOT_INBOX_ID e CHATWOOT_ACCESS_TOKEN configurados — ver .env.example."
      );
    }

    return new ChatwootProvider({ baseUrl, accountId, inboxId, accessToken });
  }

  return new MockWhatsAppProvider();
}
