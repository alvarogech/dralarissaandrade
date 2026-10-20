import { describe, expect, it } from "vitest";
import { hashLote, lerLote } from "./contrato";

const loteBase = (itens: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: "2026-10-20T09:40:00-03:00", ...extra }, itens });

describe("lerLote", () => {
  it("recusa texto que não é JSON e contrato desconhecido", () => {
    expect(lerLote("isso não é json")).toEqual({ ok: false, erro: "O texto colado não é um JSON válido." });
    expect(lerLote(JSON.stringify({ contrato: "outro", lote: {}, itens: [] })).ok).toBe(false);
  });

  it("exige origem e data da consulta no lote", () => {
    const r = lerLote(JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental" }, itens: [{}] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/consultado_em/);
  });

  it("aceita atendimento realizado com data exata e status finalizado", () => {
    const r = lerLote(loteBase([{ tipo: "atendimento_realizado", chave_origem: "sd-atend-1", paciente: { nome: "Mariana Exemplo", sd_codigo: "1042" }, data_atendimento: "2026-10-15", status_no_sd: "Finalizada" }]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itens[0]!.erros).toEqual([]);
      expect(r.itens[0]!.item?.origem).toBe("simples_dental");
      expect(r.itens[0]!.item?.consultado_em).toBe("2026-10-20T09:40:00-03:00");
    }
  });

  it("consulta só agendada não vira atendimento realizado", () => {
    const r = lerLote(loteBase([{ tipo: "atendimento_realizado", paciente: { sd_codigo: "1" }, data_atendimento: "2026-10-15", status_no_sd: "Confirmada" }]));
    if (r.ok) expect(r.itens[0]!.erros.join(" ")).toMatch(/não indica atendimento realizado/);
  });

  it("data aproximada não é aceita para atendimento", () => {
    const r = lerLote(loteBase([{ tipo: "atendimento_realizado", paciente: { sd_codigo: "1" }, data_atendimento: "2026-10", status_no_sd: "Finalizada" }]));
    if (r.ok) expect(r.itens[0]!.erros.join(" ")).toMatch(/data_atendimento exata/);
  });

  it("identificação: sem ID do SD e sem nome+telefone é erro; só nome+telefone vai para vinculação", () => {
    const r = lerLote(loteBase([
      { tipo: "continuidade", paciente: { nome: "Só Nome" }, contexto: "x" },
      { tipo: "continuidade", paciente: { nome: "Nome", telefone: "62999990000" }, contexto: "x" },
    ]));
    if (r.ok) {
      expect(r.itens[0]!.erros.join(" ")).toMatch(/identificação insuficiente/);
      expect(r.itens[1]!.erros).toEqual([]);
      expect(r.itens[1]!.avisos.join(" ")).toMatch(/vinculação manual/);
    }
  });

  it("nota de IA fica só como contexto, separada dos dados", () => {
    const r = lerLote(loteBase([{ tipo: "relacionamento", subtipo: "reativacao", paciente: { sd_numero: "92" }, ultimo_atendimento: "2025-03", nota_ia: "parece ter interesse", a_conferir: ["ultimo_atendimento"] }]));
    if (r.ok) {
      expect(r.itens[0]!.item?.nota_ia).toBe("parece ter interesse");
      expect(r.itens[0]!.item?.dados).not.toHaveProperty("nota_ia");
      expect(r.itens[0]!.item?.a_conferir).toEqual(["ultimo_atendimento"]);
    }
  });

  it("valida cobrança, falta e encaminhamento", () => {
    const r = lerLote(loteBase([
      { tipo: "cobranca", paciente: { sd_codigo: "877" }, valor: "450", a_conferir: ["valor"] },
      { tipo: "recuperacao_falta", paciente: { sd_codigo: "1201" }, data_ocorrencia: "2026-10-18", ocorrencia: "sumiu" },
      { tipo: "encaminhamento", paciente: { sd_codigo: "3" }, para: "comercial_externa" },
    ]));
    if (r.ok) {
      expect(r.itens[0]!.erros.join(" ")).toMatch(/valor precisa ser um número/);
      expect(r.itens[1]!.erros.join(" ")).toMatch(/falta.*cancelamento/);
      expect(r.itens[2]!.erros.join(" ")).toMatch(/motivo/);
    }
  });
});

describe("hashLote", () => {
  it("mesmo conteúdo com chaves em outra ordem dá o mesmo hash", () => {
    const a = JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "x", consultado_em: "2026-10-20" }, itens: [{ tipo: "cobranca", valor: 1 }] });
    const b = JSON.stringify({ itens: [{ valor: 1, tipo: "cobranca" }], lote: { consultado_em: "2026-10-20", origem: "x" }, contrato: "stimma-entrada-v1" });
    expect(hashLote(a)).toBe(hashLote(b));
    expect(hashLote(a)).not.toBe(hashLote(a.replace('"valor":1', '"valor":2')));
  });
});
