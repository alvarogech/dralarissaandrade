import { describe, expect, it } from "vitest";
import { datasDosMarcos, planejarAnulacao, planejarMarcos, type MarcoExistente } from "./marcos";
import { somarMeses } from "./datas";

describe("datasDosMarcos", () => {
  it("30 e 90 dias corridos, 6 meses de calendário", () => {
    expect(datasDosMarcos("2026-10-15")).toEqual({ d30: "2026-11-14", d90: "2027-01-13", m6: "2027-04-15" });
  });

  it("6 meses ajusta para o último dia válido do mês", () => {
    expect(datasDosMarcos("2026-08-31").m6).toBe("2027-02-28");
    expect(somarMeses("2027-08-31", 6)).toBe("2028-02-29");
    expect(somarMeses("2026-03-31", 6)).toBe("2026-09-30");
  });
});

describe("planejarMarcos", () => {
  it("atendimento novo gera exatamente três marcos", () => {
    const acoes = planejarMarcos("2026-10-15", []);
    expect(acoes.map((a) => a.acao)).toEqual(["inserir", "inserir", "inserir"]);
    expect(acoes).toHaveLength(3);
  });

  it("reenviar o mesmo atendimento não muda nada", () => {
    const existentes: MarcoExistente[] = [
      { kind: "d30", status: "previsto", dueOriginal: "2026-11-14", temEventoVinculado: false },
      { kind: "d90", status: "previsto", dueOriginal: "2027-01-13", temEventoVinculado: false },
      { kind: "m6", status: "previsto", dueOriginal: "2027-04-15", temEventoVinculado: false },
    ];
    expect(planejarMarcos("2026-10-15", existentes).every((a) => a.acao === "manter")).toBe(true);
  });

  it("corrigir a data recalcula só os intocados e preserva os trabalhados", () => {
    const existentes: MarcoExistente[] = [
      { kind: "d30", status: "contatado", dueOriginal: "2026-11-14", temEventoVinculado: true },
      { kind: "d90", status: "previsto", dueOriginal: "2027-01-13", temEventoVinculado: false },
      { kind: "m6", status: "previsto", dueOriginal: "2027-04-15", temEventoVinculado: true },
    ];
    const acoes = planejarMarcos("2026-10-14", existentes);
    expect(acoes[0]).toMatchObject({ kind: "d30", acao: "manter", due: "2026-11-14" });
    expect(acoes[1]).toEqual({ kind: "d90", acao: "recalcular", de: "2027-01-13", due: "2027-01-12" });
    expect(acoes[2]).toMatchObject({ kind: "m6", acao: "manter" });
  });

  it("anulação invalida só os marcos ainda não trabalhados", () => {
    const existentes: MarcoExistente[] = [
      { kind: "d30", status: "contatado", dueOriginal: "2026-11-14", temEventoVinculado: true },
      { kind: "d90", status: "previsto", dueOriginal: "2027-01-13", temEventoVinculado: false },
      { kind: "m6", status: "previsto", dueOriginal: "2027-04-15", temEventoVinculado: false },
    ];
    expect(planejarAnulacao(existentes).map((a) => a.acao)).toEqual(["manter", "invalidar", "invalidar"]);
  });
});
