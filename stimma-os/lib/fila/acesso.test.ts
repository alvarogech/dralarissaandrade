import { describe, expect, it, vi } from "vitest";

// Reproduz o defeito de produção de 22/10/2026 (digests 544180059 / 1891141404 / 2039825317):
// usuário logado, mas SUPABASE_SERVICE_ROLE_KEY ausente no servidor. A página não pode quebrar.
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "x@exemplo.test" } } }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não configuradas.");
  },
  isSupabaseConfigured: () => true,
}));

const { sessaoDaPagina, rotaFila } = await import("./acesso");

describe("falta de configuração no servidor", () => {
  it("página recebe estado 'indisponível' com motivo legível, sem exceção", async () => {
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await sessaoDaPagina("/fila");
    expect(s.tipo).toBe("indisponivel");
    if (s.tipo === "indisponivel") {
      expect(s.motivo).toMatch(/configuração do servidor está incompleta/);
      expect(s.motivo).not.toMatch(/SUPABASE/); // detalhe técnico só no log
    }
    expect(erroLog).toHaveBeenCalled();
    erroLog.mockRestore();
  });

  it("rota de API responde 503 com 'nada foi salvo', nunca sucesso", async () => {
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn(async () => ({ ok: true }));
    const res = await rotaFila(fn);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/Nada foi salvo/);
    expect(fn).not.toHaveBeenCalled();
    erroLog.mockRestore();
  });
});
