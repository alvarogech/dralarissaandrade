import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade } from "./registro";
import { carregarFila, criarTarefaManual, historico, salvarEstadoDoDia, type Ator } from "./servico";
import { finalizarFeedback, listarFeedbacks } from "./entrega";
import { contatosDaRotina, salvarItemRotina } from "./rotina";
import { itemDaRotina, itensDoDia, type ResultadoContato } from "./rotina-itens";
import { registroDoContato, validarContato } from "./contato-rotina";
import { carregarCaixa, diferencaCaixa, salvarCaixa, textoCaixa } from "./caixa";
import { prioridadesHerdadas, resolverPrioridade, salvarRascunho } from "./prioridades";
import { montarPrestacao } from "./prestacao";
import { etapaDaQuery } from "./meu-dia";
import type { FilaStore } from "./store";

// Rotina em duas etapas e prestação de contas (27/10). Cenários 1–15 do pedido. Dados fictícios.
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const OUTRA: Ator = { id: "00000000-0000-4000-8000-0000000000aa", email: "outra@exemplo.test", gestao: false };
const TER = "2026-10-27";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T15:00:00Z")); // terça, 12:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

async function contato(store: FilaStore, itemKey: string, resultado: ResultadoContato, nome: string, extra: Record<string, string> = {}) {
  const item = itemDaRotina(itemKey)!;
  const entrada = { resultado, nomeNovo: nome, responsavel: `perfil:${GABI.id}`, proximaAcao: "Verificar se respondeu", prazo: "2026-10-29", ...extra };
  expect(validarContato(entrada, TER)).toEqual([]);
  return registrarAtividade(store, GABI, registroDoContato({ ...entrada, eventoId: randomUUID(), item }));
}

describe("rotina: atividades simples × atividades com pacientes", () => {
  it("cenário 1: conferência operacional é concluída sem informar paciente", async () => {
    const { store } = criarStoreMemoria();
    await expect(salvarItemRotina(store, GABI, { itemKey: "agenda_hoje_amanha", estado: "feito" })).resolves.toMatchObject({ estado: "feito" });
  });

  it("cenário 2: contato com paciente não fica “feito” sem a paciente identificada", async () => {
    const { store } = criarStoreMemoria();
    await expect(salvarItemRotina(store, GABI, { itemKey: "contatos_30_dias", estado: "feito" })).rejects.toThrow(/Registre ao menos uma paciente/);
    expect(validarContato({ resultado: "contato_realizado", responsavel: `perfil:${GABI.id}` }, TER)).toEqual([["paciente", expect.stringMatching(/Informe a paciente/)]]);
    await contato(store, "contatos_30_dias", "contato_realizado", "TESTE Ana Exemplo");
    await expect(salvarItemRotina(store, GABI, { itemKey: "contatos_30_dias", estado: "feito" })).resolves.toMatchObject({ estado: "feito" });
  });

  it("cenário 3 e 12: três pacientes com resultados diferentes aparecem no fechamento, sem redigitar", async () => {
    const { store } = criarStoreMemoria();
    await contato(store, "contatos_30_dias", "agendou", "TESTE Ana Exemplo", { agendadoPara: "2026-11-03" });
    await contato(store, "contatos_30_dias", "aguardando_resposta", "TESTE Bia Exemplo");
    await contato(store, "contatos_30_dias", "nao_respondeu", "TESTE Carla Exemplo", { proximaAcao: "Tentar contato de novo" });
    await salvarItemRotina(store, GABI, { itemKey: "contatos_30_dias", estado: "feito" });
    await salvarItemRotina(store, GABI, { itemKey: "preparacao_equipe", estado: "nao_se_aplica" });

    const lista = (await contatosDaRotina(store, GABI.id, TER)).contatos_30_dias!;
    expect(lista.map((c) => c.paciente).sort()).toEqual(["TESTE Ana Exemplo", "TESTE Bia Exemplo", "TESTE Carla Exemplo"]);
    const p = await montarPrestacao(store, GABI.id, TER);
    expect(p.contatos).toEqual([expect.objectContaining({ item: "contatos_30_dias", total: 3 })]);
    expect(p.contatos[0]!.porResultado.map((x) => x.resultado).sort()).toEqual(["Agendamento realizado", "Aguardando resposta", "Não consegui falar / não respondeu"]);
    expect(p.fechamento.rotina?.feitos).toContain("Acompanhamentos de 30 dias");
    expect(p.fechamento.rotina?.naoSeAplica).toContain("Confirmar a preparação da recepção, da equipe e dos ambientes");
    expect(p.texto).toMatch(/\*Contatos da rotina\*\n• Acompanhamento de 30 dias: 3 pacientes/);
    // Cada paciente entra no fechamento com o resultado (nome abreviado no texto), sem redigitar.
    const linhas = p.fechamento.blocos.flatMap((b) => b.linhas).filter((l) => l.item === "Contatos de 30 dias");
    expect(linhas).toHaveLength(3);
    expect(p.texto.match(/TESTE E\. · Contatos de 30 dias/g)).toHaveLength(3);
  });

  it("cenário 4: contato sem resposta fica registrado como realizado e a próxima ação continua aberta", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento_ontem", "aguardando_resposta", "TESTE Dora Exemplo");
    const ev = m._dados.eventos.at(-1)!;
    expect(ev).toMatchObject({ contato: "sim", resposta: "nao", situacao: "aguardando" });
    const tarefa = m._dados.tarefas.find((t) => t.patientId === ev.patientId)!;
    expect(tarefa).toMatchObject({ due: "2026-10-29", nextAction: "Verificar se respondeu" });
    expect(tarefa.status).not.toMatch(/completed|cancelled/);
  });

  it("cenário 5: o mesmo marco para a mesma paciente não se repete sem motivo", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "contatos_30_dias", "contato_realizado", "TESTE Eva Exemplo");
    const pacienteId = m._dados.eventos.at(-1)!.patientId!;
    const item = itemDaRotina("contatos_30_dias")!;
    const de_novo = (j?: string) => registrarAtividade(m.store, GABI, registroDoContato({ eventoId: randomUUID(), item, resultado: "contato_realizado", pacienteId, responsavel: `perfil:${GABI.id}`, justificativaRepeticao: j }));
    await expect(de_novo()).rejects.toThrow(/já teve o acompanhamento de 30 dias registrado em 27\/10\/2026/);
    await expect(de_novo("paciente pediu para falar de novo amanhã")).resolves.toMatchObject({ duplicado: false });
  });

  it("cenário 6: segunda e sexta a cobrança aparece e registra as pacientes cobradas (terça não)", async () => {
    vi.setSystemTime(new Date("2026-10-26T15:00:00Z")); // segunda
    expect(itensDoDia("2026-10-26").map((i) => i.key)).toContain("cobrancas_simples_dental");
    expect(itensDoDia("2026-10-30").map((i) => i.key)).toContain("cobrancas_simples_dental");
    expect(itensDoDia(TER).map((i) => i.key)).not.toContain("cobrancas_simples_dental");
    const { store } = criarStoreMemoria();
    const item = itemDaRotina("cobrancas_simples_dental")!;
    await registrarAtividade(store, GABI, registroDoContato({ eventoId: randomUUID(), item, resultado: "pagamento_confirmado", nomeNovo: "TESTE Fabi Exemplo", responsavel: `perfil:${GABI.id}` }));
    await salvarItemRotina(store, GABI, { itemKey: "cobrancas_simples_dental", estado: "feito" });
    expect((await contatosDaRotina(store, GABI.id, "2026-10-26")).cobrancas_simples_dental).toEqual([expect.objectContaining({ paciente: "TESTE Fabi Exemplo", resultado: "Pagamento confirmado" })]);
  });

  it("cenário 7: promessa de pagamento não conta como recebimento confirmado", async () => {
    vi.setSystemTime(new Date("2026-10-30T15:00:00Z")); // sexta
    const m = criarStoreMemoria();
    const item = itemDaRotina("cobrancas_simples_dental")!;
    await registrarAtividade(m.store, GABI, registroDoContato({ eventoId: randomUUID(), item, resultado: "promessa_pagamento", nomeNovo: "TESTE Gil Exemplo", responsavel: `perfil:${GABI.id}`, proximaAcao: "Confirmar o pagamento no Simples Dental", prazo: "2026-11-03" }));
    const ev = m._dados.eventos.at(-1)!;
    expect(ev.situacao).toBe("aguardando");
    expect((ev.payload?.detalhes as Record<string, string>).pagamento_confirmado).toBeUndefined();
    const p = await montarPrestacao(m.store, GABI.id, "2026-10-30");
    expect(p.contatos[0]!.porResultado).toEqual([{ resultado: "Promessa de pagamento", n: 1 }]);
    expect(p.caixa.tipo).toBe("nao_conferido"); // nada vira recebimento sozinho
  });
});

describe("recebimentos previstos e realizados", () => {
  it("cenário 8: diferença = previsto − recebido, sem chamar de inadimplência; gestão consulta, não registra", async () => {
    const { store } = criarStoreMemoria();
    expect(diferencaCaixa(1500.5, 1200.25)).toBe(300.25);
    const e = await salvarCaixa(store, GABI, { previsto: 1500.5, recebido: 1200.25, justificativa: "uma paciente remarcou" });
    expect(e).toMatchObject({ tipo: "conferido", diferenca: 300.25 });
    expect(textoCaixa(e)).toMatch(/Previsto R\$\s?1\.500,50 · recebido R\$\s?1\.200,25 · diferença de R\$\s?300,25 — uma paciente remarcou/);
    expect(textoCaixa(e)).not.toMatch(/inadimpl/i);
    await expect(carregarCaixa(store, GESTAO)).resolves.toMatchObject({ tipo: "conferido" });
    await expect(salvarCaixa(store, GESTAO, { previsto: 1, recebido: 1 })).rejects.toThrow(/concierge/);
    await expect(salvarCaixa(store, GABI, { previsto: -5, recebido: 0 })).rejects.toThrow(/Previsto/);
  });

  it("cenário 14: quem não é a concierge nem a gestão não vê valores", async () => {
    const { store } = criarStoreMemoria();
    await salvarCaixa(store, GABI, { previsto: 100, recebido: 100 });
    await expect(carregarCaixa(store, OUTRA)).rejects.toMatchObject({ status: 403 });
    await expect(salvarCaixa(store, OUTRA, { previsto: 1, recebido: 1 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("solicitações da gestão", () => {
  it("cenário 9: Álvaro atribui, a Gabi executa e registra o resultado, a gestão consulta a entrega", async () => {
    const m = criarStoreMemoria();
    const id = await criarTarefaManual(m.store, GESTAO, { assunto: "TESTE Organizar arquivo de termos", kind: "outro", acao: "Organizar os termos assinados", prazo: TER, responsavel: GABI.id, extraordinaria: true, solicitadoPor: "Álvaro" });
    await expect(criarTarefaManual(m.store, GESTAO, { assunto: "x", kind: "outro", acao: "x", prazo: TER, responsavel: GABI.id, extraordinaria: true })).rejects.toThrow(/quem solicitou/);
    const item = (await carregarFila(m.store, TER, GABI.id)).itens.find((i) => i.alvo?.id === id)!;
    expect(item).toMatchObject({ extraordinaria: true, solicitadoPor: "Álvaro" });
    await registrarAtividade(m.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], categoria: "pendencia", contato: "na", resposta: "na", situacao: "resolvido", resultado: "Termos organizados por ano" });
    await salvarRascunho(m.store, GABI, { prioridadesConfirmadas: true });
    const f = (await finalizarFeedback(m.store, GABI, { id: randomUUID() })).feedback;
    expect(f.texto).toMatch(/\*Solicitações da gestão\*\n• Organizar os termos assinados — pedida por Álvaro: entregue/);
    expect((await listarFeedbacks(m.store, GESTAO)).find((x) => x.id === f.id)?.texto).toMatch(/pedida por Álvaro: entregue/);
  });

  it("cenário 10: solicitação não executada continua visível no dia seguinte (atrasada)", async () => {
    const m = criarStoreMemoria();
    const id = await criarTarefaManual(m.store, GESTAO, { assunto: "TESTE Ligar para fornecedor", kind: "outro", acao: "Ligar para o fornecedor", prazo: TER, responsavel: GABI.id, extraordinaria: true, solicitadoPor: "Dra. Larissa" });
    vi.setSystemTime(new Date("2026-10-28T15:00:00Z"));
    const item = (await carregarFila(m.store, "2026-10-28", GABI.id)).itens.find((i) => i.alvo?.id === id)!;
    expect(item).toMatchObject({ status: "aberta", extraordinaria: true, solicitadoPor: "Dra. Larissa", due: TER });
    const p = await montarPrestacao(m.store, GABI.id, "2026-10-28");
    expect(p.texto).toMatch(/Ligar para o fornecedor — pedida por Dra\. Larissa: atrasada \(prazo 27\/10\/2026\)/);
  });
});

describe("prioridades para o próximo dia útil", () => {
  it("cenário 11: definida no fechamento, aparece no dia seguinte sem duplicar e pode ser resolvida", async () => {
    const m = criarStoreMemoria();
    const p = { ref: null, texto: "Confirmar retorno da paciente", paciente: "TESTE Ana", data: "2026-10-28", prioridade: "alta" as const, origem: "manual", proxima: "Ligar às 9h" };
    await salvarEstadoDoDia(m.store, GABI, TER, { prioridades: [p, { ...p }] }); // repetida: entra uma vez
    vi.setSystemTime(new Date("2026-10-28T15:00:00Z"));
    const h = (await prioridadesHerdadas(m.store, "2026-10-28"))!;
    expect(h.dia).toBe(TER);
    expect(h.itens).toEqual([expect.objectContaining({ texto: "Confirmar retorno da paciente", paciente: "TESTE Ana", prioridade: "alta", proxima: "Ligar às 9h", indice: 0 })]);
    await resolverPrioridade(m.store, GABI, { dia: TER, indice: 0 });
    expect((await prioridadesHerdadas(m.store, "2026-10-28"))!.itens[0]!.resolvidaEm).toBeTruthy();
    await expect(resolverPrioridade(m.store, GESTAO, { dia: TER, indice: 0 })).rejects.toThrow(/concierge/);
  });

  it("o envio exige revisar as prioridades (mesmo que seja “nenhuma”)", async () => {
    const { store } = criarStoreMemoria();
    await expect(finalizarFeedback(store, GABI, { id: randomUUID() })).rejects.toMatchObject({ status: 422 });
    await salvarRascunho(store, GABI, { prioridadesConfirmadas: true, decisoes: "Precisamos decidir o parcelamento da Ana" });
    const f = (await finalizarFeedback(store, GABI, { id: randomUUID(), decisoes: "Precisamos decidir o parcelamento da Ana" })).feedback;
    expect(f.texto).toMatch(/\*Decisões necessárias da gestão\*\nPrecisamos decidir o parcelamento da Ana/);
  });
});

describe("histórico e dias sem movimento", () => {
  it("cenário 13: pendências e histórico seguem acessíveis sem a etapa intermediária", async () => {
    const m = criarStoreMemoria();
    const id = await criarTarefaManual(m.store, GESTAO, { novoPaciente: { nome: "TESTE Helô Exemplo" }, kind: "continuidade", acao: "Agendar fase 2", prazo: TER, responsavel: GABI.id });
    await registrarAtividade(m.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", resposta: "nao", situacao: "aguardando", proximaAcao: "Verificar", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-29" });
    expect((await carregarFila(m.store, TER, GABI.id)).itens.find((i) => i.alvo?.id === id)).toMatchObject({ status: "aguardando" });
    expect((await historico(m.store, { tipo: "tarefa", id })).length).toBeGreaterThan(0);
    expect(etapaDaQuery("pendencias")).toBe("rotina");
  });

  it("cenário 15: dia sem pacientes, sem recebimentos e sem solicitações fecha sem registro fictício", async () => {
    const { store } = criarStoreMemoria();
    for (const i of itensDoDia(TER)) await salvarItemRotina(store, GABI, { itemKey: i.key, estado: "nao_se_aplica" });
    await expect(salvarCaixa(store, GABI, { semRecebimentos: true })).resolves.toMatchObject({ tipo: "sem_recebimentos" });
    await salvarEstadoDoDia(store, GABI, TER, { prioridades: [] });
    await salvarRascunho(store, GABI, { prioridadesConfirmadas: true });
    const f = (await finalizarFeedback(store, GABI, { id: randomUUID() })).feedback;
    expect(f.texto).toMatch(/Conferido: sem recebimentos hoje\./);
    expect(f.texto).not.toMatch(/Contatos da rotina|Solicitações da gestão/);
  });
});
