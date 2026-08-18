import { describe, expect, it, vi } from "vitest";
import { ChatwootProvider } from "./chatwoot-provider";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function buildConfig(fetchImpl: typeof fetch) {
  return {
    baseUrl: "https://chatwoot.example.com",
    accountId: "1",
    inboxId: "5",
    accessToken: "token-123",
    fetchImpl,
  };
}

describe("ChatwootProvider.sendText", () => {
  it("cria contato e conversa quando nao existem, e envia a mensagem", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body as string });

      if (u.includes("/contacts/search")) return jsonResponse({ payload: [] });
      if (u.endsWith("/contacts") && init?.method === "POST") {
        return jsonResponse({ id: 42, phone_number: "+5562999990000" });
      }
      if (u.includes("/contacts/42/conversations")) return jsonResponse({ payload: [] });
      if (u.endsWith("/conversations") && init?.method === "POST") {
        return jsonResponse({ id: 900, status: "open" });
      }
      if (u.includes("/conversations/900/messages") && init?.method === "POST") {
        return jsonResponse({ id: 7001, content: "Oi", message_type: "outgoing" });
      }
      throw new Error(`URL inesperada no teste: ${u}`);
    }) as unknown as typeof fetch;

    const provider = new ChatwootProvider(buildConfig(fetchImpl));
    const result = await provider.sendText("+5562999990000", "Oi, tudo bem?");

    expect(result).toEqual({ externalMessageId: "900:7001", status: "sent" });
    expect(calls.some((c) => c.url.includes("/contacts?") === false && c.url.endsWith("/contacts") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/conversations") && c.method === "POST")).toBe(true);
    expect(calls.every((c) => c.url.startsWith("https://chatwoot.example.com/api/v1/accounts/1"))).toBe(true);
  });

  it("reaproveita contato e conversa ja abertos em vez de criar de novo", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes("/contacts/search")) {
        return jsonResponse({ payload: [{ id: 42, phone_number: "+5562999990000" }] });
      }
      if (u.includes("/contacts/42/conversations")) {
        return jsonResponse({ payload: [{ id: 900, status: "open" }] });
      }
      if (u.includes("/conversations/900/messages") && init?.method === "POST") {
        return jsonResponse({ id: 7002, content: "Oi de novo", message_type: "outgoing" });
      }
      throw new Error(`URL inesperada no teste: ${u} (${init?.method})`);
    }) as unknown as typeof fetch;

    const provider = new ChatwootProvider(buildConfig(fetchImpl));
    const result = await provider.sendText("+5562999990000", "Oi de novo");

    expect(result).toEqual({ externalMessageId: "900:7002", status: "sent" });
  });

  it("retorna status=failed com o erro quando a API do Chatwoot responde com erro", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500)) as unknown as typeof fetch;

    const provider = new ChatwootProvider(buildConfig(fetchImpl));
    const result = await provider.sendText("+5562999990000", "Oi");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });
});

describe("ChatwootProvider.getStatus", () => {
  it("busca o status da mensagem na conversa codificada no externalMessageId", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/conversations/900/messages")) {
        return jsonResponse({ payload: [{ id: 7001, content: "Oi", message_type: "outgoing", status: "delivered" }] });
      }
      throw new Error(`URL inesperada: ${u}`);
    }) as unknown as typeof fetch;

    const provider = new ChatwootProvider(buildConfig(fetchImpl));
    const status = await provider.getStatus("900:7001");

    expect(status).toBe("delivered");
  });
});

describe("ChatwootProvider — metodos nao confirmados", () => {
  it("sendMedia lanca erro explicito em vez de fingir sucesso", async () => {
    const provider = new ChatwootProvider(buildConfig(vi.fn() as unknown as typeof fetch));
    await expect(provider.sendMedia("+5562999990000", "https://example.com/foto.jpg")).rejects.toThrow(
      /não confirmado/
    );
  });

  it("markAsRead lanca erro explicito em vez de fingir sucesso", async () => {
    const provider = new ChatwootProvider(buildConfig(vi.fn() as unknown as typeof fetch));
    await expect(provider.markAsRead("900:7001")).rejects.toThrow(/confirmado/);
  });
});
