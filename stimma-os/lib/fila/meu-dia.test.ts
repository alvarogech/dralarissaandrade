import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade, type EntradaRegistro } from "./registro";
import { carregarFechamento, carregarFila, criarTarefaManual, editarTarefa, type Ator } from "./servico";
import { comentarFeedback, estadoFeedback, finalizarFeedback, gerarFeedback, listarFeedbacks } from "./entrega";
import { carregarRotina, salvarItemRotina } from "./rotina";
import { estadoExpediente, etapaDaQuery, proximaAcao, textoEstadoExpediente, type EntradaMeuDia } from "./meu-dia";
import type { FeedbackRow } from "./store";

// Percurso guiado da concierge (reestruturação de 27/10). Dados fictícios, store em memória.
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const HOJE = "2026-10-27"; // terça-feira

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T15:00:00Z")); // 12:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

const reg = (extra: Partial<EntradaRegistro>): EntradaRegistro => ({ eventoId: randomUUID(), alvos: [], categoria: "pendencia", contato: null, resposta: null, situacao: "informativo", ...extra });

async function tarefaDaGabi(m = criarStoreMemoria(), extra: Partial<Parameters<typeof criarTarefaManual>[2]> = {}) {
  const id = await criarTarefaManual(m.store, GESTAO, { novoPaciente: { nome: "TESTE Paula Exemplo" }, kind: "continuidade", acao: "Agendar fase 2", prazo: HOJE, responsavel: GABI.id, ...extra });
  return { ...m, id };
}

const entrada = (extra: Partial<EntradaMeuDia> = {}): EntradaMeuDia => ({
  rotinaRespondidos: 0, rotinaTotal: 24, rotinaImpedimentos: 0, eventosHoje: [], rotinaAssinatura: "", versoes: [], atrasadas: 0, paraHoje: 0, aguardandoGestao: 0, ...extra,
});
const versao = (extra: Partial<FeedbackRow>): FeedbackRow => ({
  id: randomUUID(), dia: HOJE, responsavel: GABI.id, versao: 1, status: "entregue", texto: "", contadores: { rotina_assinatura: "" }, eventos: [], substitui: null,
  geradoEm: "2026-10-27T20:00:00Z", entregueEm: "2026-10-27T20:00:00Z", copiadoEm: null, whatsappConfirmadoEm: null, observacaoGestao: null, ajusteSolicitadoEm: null, ajusteSolicitadoPor: null, ...extra,
});

describe("estado do expediente e próxima ação (tela inicial)", () => {
  it("sem nada registrado: não iniciado, começa pela rotina", () => {
    const s = estadoExpediente(entrada());
    expect(s.tipo).toBe("nao_iniciado");
    expect(textoEstadoExpediente(s)).toBe("Não iniciado");
    expect(proximaAcao(entrada())).toMatchObject({ etapa: "rotina", botao: "Começar meu dia" });
  });

  it("com rotina começada e atrasadas: em andamento, vai para pendências", () => {
    const e = entrada({ rotinaRespondidos: 5, atrasadas: 2 });
    expect(estadoExpediente(e).tipo).toBe("em_andamento");
    expect(proximaAcao(e)).toMatchObject({ etapa: "pendencias", botao: "Continuar meu trabalho", titulo: "Você tem 2 pendências atrasadas" });
  });

  it("tudo respondido e nada vencendo: sugere finalizar", () => {
    expect(proximaAcao(entrada({ rotinaRespondidos: 24 }))).toMatchObject({ etapa: "finalizar", titulo: "Tudo registrado por hoje" });
  });

  it("feedback entregue: enviado; registro novo depois do envio é sinalizado; ajuste da gestão tem prioridade", () => {
    const v = versao({ eventos: ["a"] });
    const enviado = estadoExpediente(entrada({ versoes: [v], eventosHoje: ["a"], rotinaRespondidos: 3 }));
    expect(enviado).toMatchObject({ tipo: "enviado", mudouDepois: false });
    expect(textoEstadoExpediente(enviado)).toBe("Feedback enviado às 17:00");
    expect(proximaAcao(entrada({ versoes: [v], eventosHoje: ["a"] }))).toMatchObject({ etapa: "finalizar", botao: "Ver feedback enviado" });
    expect(estadoExpediente(entrada({ versoes: [v], eventosHoje: ["a", "b"] }))).toMatchObject({ tipo: "enviado", mudouDepois: true });
    const ajuste = versao({ ajusteSolicitadoEm: "2026-10-27T21:00:00Z", observacaoGestao: "faltou a Paula" });
    expect(proximaAcao(entrada({ versoes: [ajuste] }))).toMatchObject({ etapa: "finalizar", titulo: "A gestão pediu um ajuste no seu feedback", texto: "“faltou a Paula”" });
  });

  it("etapa na URL: só aceita as três etapas", () => {
    expect(etapaDaQuery("pendencias")).toBe("pendencias");
    expect(etapaDaQuery("qualquer")).toBeNull();
    expect(etapaDaQuery(undefined)).toBeNull();
  });
});

describe("Finalizar e enviar feedback", () => {
  it("cenário A/F: envia numa ação só, sem expediente configurado; repetir não duplica; recarregar mantém enviado", async () => {
    const { store } = criarStoreMemoria(); // config de demonstração sem expediente: não bloqueia
    await registrarAtividade(store, GABI, reg({ assunto: "Impressora da recepção", situacao: "informativo", feito: "chamado aberto" }));
    const id = randomUUID();
    const r1 = await finalizarFeedback(store, GABI, { id, observacao: "Dia tranquilo." });
    expect(r1).toMatchObject({ jaEnviado: false, feedback: { status: "entregue", versao: 1 } });
    expect(r1.feedback.entregueEm).toBeTruthy();
    expect(r1.feedback.texto).toMatch(/\*Observações do dia\*\nDia tranquilo\./);
    // Clique repetido (mesmo id) e novo clique sem nada novo: devolvem o mesmo envio.
    expect(await finalizarFeedback(store, GABI, { id, observacao: "Dia tranquilo." })).toMatchObject({ jaEnviado: true, feedback: { id: r1.feedback.id } });
    expect(await finalizarFeedback(store, GABI, { id: randomUUID(), observacao: "Dia tranquilo." })).toMatchObject({ jaEnviado: true, feedback: { id: r1.feedback.id } });
    const estado = await estadoFeedback(store, GABI.id, HOJE);
    expect(estado.versoes).toHaveLength(1);
    expect(estado.situacao.tipo).toBe("entregue");
    // Gestão vê no histórico.
    expect((await listarFeedbacks(store, GESTAO)).map((f) => f.id)).toContain(r1.feedback.id);
  });

  it("só a concierge finaliza", async () => {
    const { store } = criarStoreMemoria();
    await expect(finalizarFeedback(store, GESTAO, { id: randomUUID() })).rejects.toThrow(/concierge/);
  });

  it("registro depois do envio: pede versão atualizada; com corrigir cria a versão 2 e preserva a 1", async () => {
    const { store } = criarStoreMemoria();
    const v1 = (await finalizarFeedback(store, GABI, { id: randomUUID() })).feedback;
    await registrarAtividade(store, GABI, reg({ assunto: "Fornecedor de luvas", situacao: "informativo", feito: "pedido confirmado" }));
    await expect(finalizarFeedback(store, GABI, { id: randomUUID() })).rejects.toThrow(/versão atualizada/);
    const v2 = (await finalizarFeedback(store, GABI, { id: randomUUID(), corrigir: true })).feedback;
    expect(v2).toMatchObject({ versao: 2, substitui: v1.id, status: "entregue" });
    expect((await estadoFeedback(store, GABI.id, HOJE)).versoes.map((v) => v.versao).sort()).toEqual([1, 2]);
  });

  it("ajuste pedido pela gestão: exige versão corrigida e a nova versão encerra o pedido", async () => {
    const { store } = criarStoreMemoria();
    const v1 = (await finalizarFeedback(store, GABI, { id: randomUUID() })).feedback;
    await comentarFeedback(store, GESTAO, { id: v1.id, observacao: "Faltou o retorno da Paula", solicitarAjuste: true });
    await expect(finalizarFeedback(store, GABI, { id: randomUUID() })).rejects.toThrow(/ajuste/);
    const v2 = (await finalizarFeedback(store, GABI, { id: randomUUID(), corrigir: true, observacao: "Paula retorna dia 03/11." })).feedback;
    expect(v2.versao).toBe(2);
    const versoes = (await estadoFeedback(store, GABI.id, HOJE)).versoes;
    expect(estadoExpediente(entrada({ versoes, eventosHoje: [] })).tipo).toBe("enviado");
  });

  it("versão gerada pela tela antiga e nunca entregue (caso de 26/10) é entregue sem criar outra", async () => {
    const { store } = criarStoreMemoria();
    const gerada = await gerarFeedback(store, GABI, { id: randomUUID() });
    const r = await finalizarFeedback(store, GABI, { id: randomUUID() });
    expect(r.feedback).toMatchObject({ id: gerada.id, versao: 1, status: "entregue" });
    expect((await estadoFeedback(store, GABI.id, HOJE)).versoes).toHaveLength(1);
  });

  it("cenário D: contato sem resposta + envio do feedback não fecham a tarefa", async () => {
    const m = await tarefaDaGabi();
    const item = (await carregarFila(m.store, HOJE, GABI.id)).itens.find((i) => i.alvo?.id === m.id)!;
    await registrarAtividade(m.store, GABI, reg({
      alvos: [{ tipo: "tarefa", id: m.id }], categoria: "continuidade", contato: "sim", canal: "whatsapp", resposta: "nao", situacao: "aguardando",
      proximaAcao: "Verificar se respondeu", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-29",
    }));
    await finalizarFeedback(m.store, GABI, { id: randomUUID() });
    const depois = (await carregarFila(m.store, HOJE, GABI.id)).itens.find((i) => i.id === item.id)!;
    expect(depois.status).not.toBe("concluida");
    expect(depois.due).toBe("2026-10-29");
    expect(m._dados.tarefas.find((t) => t.id === m.id)!.status).not.toMatch(/completed|cancelled/);
  });

  it("cenário C: impedimento da rotina exige motivo e próxima ação e aparece no feedback enviado", async () => {
    const { store } = criarStoreMemoria();
    await expect(salvarItemRotina(store, GABI, { itemKey: "agenda_hoje_amanha", estado: "impedimento" })).rejects.toThrow(/motivo/);
    await salvarItemRotina(store, GABI, { itemKey: "agenda_hoje_amanha", estado: "impedimento", motivo: "Simples Dental fora do ar", proximaAcao: "Conferir às 14h" });
    await salvarItemRotina(store, GABI, { itemKey: "novos_atendimentos", estado: "feito" });
    const { fechamento } = await carregarFechamento(store, HOJE, GABI.id);
    expect(fechamento.rotina?.impedimentos[0]).toMatchObject({ motivo: "Simples Dental fora do ar" });
    const r = await finalizarFeedback(store, GABI, { id: randomUUID() });
    expect(r.feedback.texto).toMatch(/Impedimento — Conferir a agenda de hoje e de amanhã: Simples Dental fora do ar; próxima ação: Conferir às 14h/);
  });

  it("cenário B: rotina salva no servidor continua lá ao voltar (nada depende do navegador)", async () => {
    const { store } = criarStoreMemoria();
    await salvarItemRotina(store, GABI, { itemKey: "novos_atendimentos", estado: "feito" });
    await salvarItemRotina(store, GABI, { itemKey: "contatos_30_dias", estado: "feito", metricas: { contatos_realizados: 4, precisa_conferir: 1 } });
    const de_novo = await carregarRotina(store, GABI);
    expect(de_novo.linhas.find((l) => l.itemKey === "contatos_30_dias")).toMatchObject({ estado: "feito", metricas: { contatos_realizados: 4, precisa_conferir: 1 } });
    expect(de_novo.editavel).toBe(true);
  });
});

describe("correção: histórico de tarefa sem paciente", () => {
  it("gestão cancela tarefa administrativa sem erro de banco e o histórico fica registrado (bug de 26/10)", async () => {
    const m = criarStoreMemoria();
    const id = await criarTarefaManual(m.store, GESTAO, { assunto: "Trocar cartucho da impressora", kind: "outro", acao: "Comprar cartucho", prazo: HOJE, responsavel: GABI.id });
    await editarTarefa(m.store, GESTAO, id, { cancelar: true, motivo: "já resolvido" });
    expect(m._dados.tarefas.find((t) => t.id === id)!.status).toBe("cancelled");
    const ev = m._dados.eventos.find((e) => e.alvos.some((a) => a.tarefaId === id) && e.kind === "encerramento");
    expect(ev).toMatchObject({ patientId: null, assunto: "Trocar cartucho da impressora" });
  });

  it("concierge não edita nem cancela tarefas (permissão no servidor)", async () => {
    const m = await tarefaDaGabi();
    await expect(editarTarefa(m.store, GABI, m.id, { cancelar: true, motivo: "x" })).rejects.toThrow();
    expect(m._dados.tarefas.find((t) => t.id === m.id)!.status).not.toBe("cancelled");
  });
});
