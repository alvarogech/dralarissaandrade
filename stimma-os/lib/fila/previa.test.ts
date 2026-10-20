import { describe, expect, it } from "vitest";
import { lerLote } from "./contrato";
import { hashConteudo, montarPrevia, resumoPrevia, type EstadoAtual } from "./previa";

// Dados fictícios — nunca dados reais de pacientes.
const estado: EstadoAtual = {
  pacientes: [
    { id: "p1", nome: "Mariana Exemplo", sd_codigo: "1042", telefone: "(62) 99999-0001" },
    { id: "p2", nome: "Joana Teste", sd_codigo: "877", sd_numero: "55" },
  ],
  registros: [],
  atendimentos: [{ pacienteId: "p1", data: "2026-10-10" }],
};

function previa(itens: unknown[], est: EstadoAtual = estado) {
  const r = lerLote(JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: "2026-10-20" }, itens }));
  if (!r.ok) throw new Error(r.erro);
  return montarPrevia(r.itens, est);
}

const atend = (extra: Record<string, unknown> = {}) => ({ tipo: "atendimento_realizado", paciente: { sd_codigo: "1042" }, data_atendimento: "2026-10-15", status_no_sd: "Finalizada", ...extra });

describe("montarPrevia", () => {
  it("item novo de paciente existente e de paciente nova", () => {
    const p = previa([atend({ chave_origem: "a1" }), atend({ chave_origem: "a2", paciente: { sd_codigo: "9999" } })]);
    expect(p[0]).toMatchObject({ classificacao: "novo", pacienteId: "p1" });
    expect(p[1]).toMatchObject({ classificacao: "novo", pacienteId: null });
  });

  it("duplicado dentro do lote: mesma chave ou mesmo conteúdo", () => {
    const p = previa([atend({ chave_origem: "a1" }), atend({ chave_origem: "a1", data_atendimento: "2026-10-14" }), { tipo: "continuidade", paciente: { sd_codigo: "877" }, contexto: "x" }, { tipo: "continuidade", paciente: { sd_codigo: "877" }, contexto: "x" }]);
    expect(p.map((x) => x.classificacao)).toEqual(["novo", "duplicado", "novo", "duplicado"]);
  });

  it("reenvio sem mudança é duplicado; com mudança é atualização; já trabalhado é conflito", () => {
    const r = lerLote(JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: "2026-10-19" }, itens: [atend({ chave_origem: "a1" })] }));
    if (!r.ok) throw new Error();
    const hash = hashConteudo(r.itens[0]!.item!);
    const igual = previa([atend({ chave_origem: "a1" })], { ...estado, registros: [{ chave_origem: "a1", conteudoHash: hash, trabalhado: false }] });
    expect(igual[0]!.classificacao).toBe("duplicado"); // consultado em outro dia, mesmo conteúdo
    const mudou = previa([atend({ chave_origem: "a1", data_atendimento: "2026-10-14" })], { ...estado, registros: [{ chave_origem: "a1", conteudoHash: hash, trabalhado: false }] });
    expect(mudou[0]!.classificacao).toBe("atualizacao");
    const trabalhado = previa([atend({ chave_origem: "a1", data_atendimento: "2026-10-14" })], { ...estado, registros: [{ chave_origem: "a1", conteudoHash: hash, trabalhado: true }] });
    expect(trabalhado[0]!.classificacao).toBe("conflito");
  });

  it("atendimento sem chave na mesma data de um existente é possível duplicidade", () => {
    const p = previa([atend({ data_atendimento: "2026-10-10" }), atend({ data_atendimento: "2026-10-16" }), atend({ data_atendimento: "2026-10-16", status_no_sd: "Atendido" })]);
    expect(p.map((x) => x.classificacao)).toEqual(["possivel_duplicidade", "novo", "possivel_duplicidade"]);
  });

  it("nome + telefone nunca vincula sozinho: vira sugestão", () => {
    const p = previa([{ tipo: "continuidade", paciente: { nome: "Mariana Exemplo", telefone: "+55 62 99999-0001" }, contexto: "x" }]);
    expect(p[0]).toMatchObject({ classificacao: "vinculo_pendente", pacienteId: null, sugestoes: ["p1"] });
  });

  it("ID novo do SD com telefone já cadastrado também pede confirmação", () => {
    const p = previa([{ tipo: "continuidade", paciente: { sd_codigo: "5000", telefone: "62999990001" }, contexto: "x" }]);
    expect(p[0]).toMatchObject({ classificacao: "vinculo_pendente", sugestoes: ["p1"] });
  });

  it("identificadores conflitantes não vinculam", () => {
    const p = previa([
      { tipo: "continuidade", paciente: { sd_codigo: "1042", sd_numero: "55" }, contexto: "x" },
      { tipo: "continuidade", paciente: { sd_codigo: "877", sd_numero: "56" }, contexto: "y" },
    ]);
    expect(p[0]!.classificacao).toBe("vinculo_pendente");
    expect(p[1]!.motivo).toMatch(/sd_numero diverge/);
  });

  it("itens inválidos aparecem como erro e o resumo conta tudo", () => {
    const p = previa([atend({ chave_origem: "a1" }), { tipo: "inexistente", paciente: { sd_codigo: "1" } }]);
    expect(p[1]!.classificacao).toBe("erro");
    expect(resumoPrevia(p)).toMatchObject({ novo: 1, erro: 1 });
  });
});
