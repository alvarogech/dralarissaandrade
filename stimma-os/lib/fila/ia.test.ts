import { afterEach, describe, expect, it } from "vitest";
import { converterLevantamento, iaConfigurada, normalizarItemIA } from "./ia";
import { validarItem } from "./contrato";

// Sem rede: valida só o que roda no servidor antes/depois da chamada.
const chaveOriginal = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = chaveOriginal;
});

describe("ia", () => {
  it("sem chave configurada, falha com mensagem clara e nada é criado", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(iaConfigurada()).toBe(false);
    await expect(converterLevantamento("qualquer texto", "2026-10-20")).rejects.toMatchObject({ status: 503 });
  });

  it("normaliza a saída: remove nulls, gera chave estável e passa pelo validador do contrato", () => {
    const item = normalizarItemIA({
      tipo: "cobranca", paciente: { nome: "Joana Teste", sd_codigo: "877", sd_numero: null, telefone: null },
      acao: "Cobrar parcela 3/6", contexto: null, prazo: null, valor: 450, vencimento: "2026-10-18", data_atendimento: null,
      status_no_sd: null, data_ocorrencia: null, ocorrencia: null, para: null, motivo: null, a_conferir: ["valor"], evidencia: "parcela 3/6 R$ 450 vencida",
    });
    expect(item).not.toHaveProperty("contexto");
    expect(item.chave_origem).toBe("auto:cobranca:877:2026-10-18");
    const v = validarItem(item, 0, { origem: "teste", consultado_em: "2026-10-20" });
    expect(v.erros).toEqual([]);
    expect(v.item?.a_conferir).toEqual(["valor"]);
  });

  it("atendimento só agendado vindo da IA é barrado pelo validador", () => {
    const item = normalizarItemIA({ tipo: "atendimento_realizado", paciente: { nome: "Nina", sd_codigo: "9", sd_numero: null, telefone: null }, data_atendimento: "2026-10-15", status_no_sd: "Agendado", a_conferir: [], evidencia: "x" });
    expect(validarItem(item, 0, { origem: "teste", consultado_em: "2026-10-20" }).erros.join(" ")).toMatch(/não indica atendimento realizado/);
  });
});
