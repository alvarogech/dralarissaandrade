import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria } from "./store-memoria";
import { analisarFeedback, anularAtendimento, carregarFechamento, carregarFila, confirmarAtendimentoPendente, confirmarEntrada, criarTarefaManual, editarTarefa, historico, previaEntrada, registrarAcao, type Ator } from "./servico";

// Dados fictícios; store em memória — nunca o banco real.
const GESTAO: Ator = { id: "u-gestao", email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: "u-gabi", email: "concierge@exemplo.test", gestao: false };

const lote = (itens: unknown[], consultado = "2026-10-20T09:00:00-03:00") =>
  JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: consultado }, itens });
const atend = (extra: Record<string, unknown> = {}) => ({ tipo: "atendimento_realizado", chave_origem: "sd-a1", paciente: { nome: "Mariana Exemplo", sd_codigo: "1042" }, data_atendimento: "2026-10-15", status_no_sd: "Finalizada", ...extra });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("entrada", () => {
  it("só a gestão confirma; atendimento realizado gera os 3 marcos de uma vez", async () => {
    const { store, _dados } = criarStoreMemoria();
    await expect(confirmarEntrada(store, GABI, lote([atend()]))).rejects.toThrow(/gestão/);
    const r = await confirmarEntrada(store, GESTAO, lote([atend()]));
    expect(r).toMatchObject({ aplicados: 1, atendimentosConfirmados: 1 });
    expect(_dados.marcos.map((m) => [m.kind, m.dueOriginal])).toEqual([["d30", "2026-11-14"], ["d90", "2027-01-13"], ["m6", "2027-04-15"]]);
    expect(_dados.pacientes).toHaveLength(1);
  });

  it("mesmo lote de novo não reaplica nada (retomada); reconsulta sem mudança não duplica nada", async () => {
    const { store, _dados } = criarStoreMemoria();
    await confirmarEntrada(store, GESTAO, lote([atend()]));
    const repetido = await confirmarEntrada(store, GESTAO, lote([atend()]));
    expect(repetido).toMatchObject({ aplicados: 0, jaAplicados: [0], concluido: true });
    const r = await confirmarEntrada(store, GESTAO, lote([atend()], "2026-10-20T11:00:00-03:00"));
    expect(r.aplicados).toBe(0);
    expect(r.naoAplicados[0]!.classificacao).toBe("duplicado");
    expect(_dados.marcos).toHaveLength(3);
  });

  it("correção de data recalcula marcos intocados e preserva os trabalhados", async () => {
    const { store, _dados } = criarStoreMemoria();
    await confirmarEntrada(store, GESTAO, lote([atend()]));
    const d30 = _dados.marcos.find((m) => m.kind === "d30")!;
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "marco", id: d30.id }], acao: "contato", canal: "whatsapp" });
    // item trabalhado → conflito, nada é sobrescrito
    const r = await confirmarEntrada(store, GESTAO, lote([atend({ data_atendimento: "2026-10-14" })], "2026-10-20T12:00:00-03:00"));
    expect(r.naoAplicados[0]!.classificacao).toBe("conflito");
    expect(_dados.marcos.find((m) => m.kind === "d90")!.dueOriginal).toBe("2027-01-13");
  });

  it("data ou status a conferir: fica pendente, sem marcos, até alguém confirmar", async () => {
    const { store, _dados } = criarStoreMemoria();
    const r = await confirmarEntrada(store, GESTAO, lote([atend({ a_conferir: ["status_no_sd"] })]));
    expect(r.atendimentosPendentes).toBe(1);
    expect(_dados.marcos).toHaveLength(0);
    const f = await carregarFila(store);
    expect(f.fila.hoje[0]!.itens[0]!.tipo).toBe("conferir_atendimento");
    await confirmarAtendimentoPendente(store, GABI, _dados.atendimentos[0]!.id, "2026-10-15");
    expect(_dados.marcos).toHaveLength(3);
    expect((await carregarFila(store)).fila.hoje).toEqual([]);
  });

  it("vínculo por telefone exige decisão explícita da gestão", async () => {
    const { store, _dados } = criarStoreMemoria();
    await confirmarEntrada(store, GESTAO, lote([atend({ paciente: { nome: "Mariana Exemplo", sd_codigo: "1042", telefone: "62999990001" } })]));
    const texto = lote([{ tipo: "continuidade", paciente: { nome: "Mariana", telefone: "(62) 99999-0001" }, contexto: "fase 2" }]);
    const p = await previaEntrada(store, texto);
    expect(p.previa[0]!.classificacao).toBe("vinculo_pendente");
    const semDecisao = await confirmarEntrada(store, GESTAO, texto);
    expect(semDecisao.aplicados).toBe(0);
    expect(_dados.tarefas).toHaveLength(0);
    const texto2 = lote([{ tipo: "continuidade", paciente: { nome: "Mariana", telefone: "(62) 99999-0001" }, contexto: "fase 2" }], "2026-10-20T13:00:00-03:00");
    const r = await confirmarEntrada(store, GESTAO, texto2, { 0: { acao: "vincular", pacienteId: p.pacientes[0]!.id } });
    expect(r.tarefas).toBe(1);
    expect(_dados.pacientes).toHaveLength(1);
  });

  it("anulação: só gestão, com motivo, preserva marco trabalhado", async () => {
    const { store, _dados } = criarStoreMemoria();
    await confirmarEntrada(store, GESTAO, lote([atend()]));
    const d30 = _dados.marcos.find((m) => m.kind === "d30")!;
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "marco", id: d30.id }], acao: "contato" });
    const id = _dados.atendimentos[0]!.id;
    await expect(anularAtendimento(store, GABI, id, "engano")).rejects.toThrow(/gestão/);
    await expect(anularAtendimento(store, GESTAO, id, " ")).rejects.toThrow(/motivo/);
    await anularAtendimento(store, GESTAO, id, "lançado na paciente errada");
    expect(_dados.marcos.map((m) => m.status)).toEqual(["contatado", "invalidado", "invalidado"]);
  });
});

describe("ações na fila", () => {
  async function comCobranca() {
    const m = criarStoreMemoria();
    await confirmarEntrada(m.store, GESTAO, lote([atend(), { tipo: "cobranca", chave_origem: "sd-c1", paciente: { sd_codigo: "1042" }, valor: 450, vencimento: "2026-10-18" }]));
    return m;
  }

  it("evento reenviado com o mesmo id não duplica", async () => {
    const { store, _dados } = await comCobranca();
    const t = _dados.tarefas[0]!;
    const e = { eventoId: randomUUID(), alvos: [{ tipo: "tarefa" as const, id: t.id }], acao: "contato" as const };
    expect(await registrarAcao(store, GABI, e)).toEqual({ duplicado: false });
    expect(await registrarAcao(store, GABI, e)).toEqual({ duplicado: true });
    expect(_dados.eventos).toHaveLength(1);
  });

  it("adiar exige data e motivo; preserva a data original do marco", async () => {
    const { store, _dados } = await comCobranca();
    const d30 = _dados.marcos.find((m) => m.kind === "d30")!;
    await expect(registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "marco", id: d30.id }], acao: "adiar", novaData: "2026-11-20" })).rejects.toThrow(/justificativa/);
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "marco", id: d30.id }], acao: "adiar", novaData: "2026-11-20", motivo: "viajando" });
    expect(_dados.marcos.find((m) => m.id === d30.id)).toMatchObject({ dueOriginal: "2026-11-14", dueCurrent: "2026-11-20", status: "previsto" });
  });

  it("recebimento só em cobrança, com valor e origem; fecha a tarefa", async () => {
    const { store, _dados } = await comCobranca();
    const t = _dados.tarefas[0]!;
    const d30 = _dados.marcos[0]!;
    await expect(registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "marco", id: d30.id }], acao: "recebimento", valor: 10, origemValor: "parcela" })).rejects.toThrow(/cobrança/);
    await expect(registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], acao: "recebimento", valor: 450 })).rejects.toThrow(/origem/);
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], acao: "recebimento", valor: 450, origemValor: "parcela" });
    expect(_dados.tarefas[0]!.status).toBe("completed");
    const f = await carregarFila(store);
    expect(f.fila.concluidas[0]!.itens[0]!.id).toBe(`tarefa:${t.id}`);
  });

  it("tratar junto: um evento ligado a vários itens da mesma paciente", async () => {
    const { store, _dados } = await comCobranca();
    const [t, d30] = [_dados.tarefas[0]!, _dados.marcos[0]!];
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }, { tipo: "marco", id: d30.id }], acao: "agendamento", agendadoPara: "2026-10-27" });
    expect(_dados.eventos[0]!.alvos).toHaveLength(2);
    expect(_dados.marcos[0]!.status).toBe("contemplado");
    expect(_dados.tarefas[0]!.status).toBe("completed");
  });

  it("não aceita data futura nem item já encerrado", async () => {
    const { store, _dados } = await comCobranca();
    const t = _dados.tarefas[0]!;
    await expect(registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], acao: "contato", data: "2026-10-21" })).rejects.toThrow(/data/);
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], acao: "encerrar", desfecho: "dispensado", motivo: "já pago na recepção" });
    await expect(registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], acao: "contato" })).rejects.toThrow(/encerrado/);
  });

  it("fila: cobrança vencida aparece em atrasadas; marcos distantes ficam fora do horizonte", async () => {
    const { store } = await comCobranca();
    const f = await carregarFila(store);
    expect(f.fila.atrasadas).toHaveLength(1);
    expect(f.fila.atrasadas[0]!.atrasoDias).toBe(2);
    expect(f.fila.atrasadas[0]!.itens[0]!.valor).toBe(450);
    expect(f.fila.proximas[0]!.itens.map((i) => i.titulo)).toEqual(["Acompanhamento de 30 dias"]);
    expect(f.maisTarde).toBe(2);
  });
});
