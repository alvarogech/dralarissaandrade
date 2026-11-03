import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade, type EntradaRegistro } from "./registro";
import { carregarFila, editarTarefa, historico, type Ator } from "./servico";
import { salvarItemRotina } from "./rotina";
import { itemDaRotina, itensDoDia, ITENS_ROTINA, type ResultadoContato } from "./rotina-itens";
import { registroDoContato, validarContato, type EntradaContato } from "./contato-rotina";
import { prazoFollowup, proximoCicloCobranca, somarDiasUteis } from "./followup";
import { datasDosMarcos, planejarMarcos, ROTULO_MARCO } from "./marcos";
import { montarPrestacao } from "./prestacao";
import type { FilaStore } from "./store";

// Rotina da Gabi: agenda, pós-procedimento, retorno obrigatório e régua 30/90/180 (29/10). Fictício.
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const QUI = "2026-10-29"; // quinta-feira

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T15:00:00Z")); // 12:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

const POS = itemDaRotina("pos_procedimento_ontem")!;
const contato = (e: Partial<EntradaContato> & { resultado: ResultadoContato }, item = POS): EntradaContato => ({ eventoId: randomUUID(), item, responsavel: `perfil:${GABI.id}`, ...e });
const registrar = (store: FilaStore, e: EntradaContato) => registrarAtividade(store, GABI, registroDoContato(e));

async function comPaciente(m = criarStoreMemoria()) {
  await registrar(m.store, contato({ resultado: "respondeu", nomeNovo: "TESTE Rita Exemplo", relato: "Disse que está bem, sem dor." }));
  return { ...m, pid: m._dados.eventos.at(-1)!.patientId! };
}

describe("A. conferência da agenda", () => {
  it("uma atividade com roteiro de 10 pontos; concluir não pede paciente; ocorrência é opcional e enxuta", async () => {
    const m = criarStoreMemoria();
    const agenda = itemDaRotina("agenda_hoje_amanha")!;
    expect(agenda.texto).toBe("Conferir agenda, confirmações e alinhamento com os profissionais");
    expect(agenda.roteiro).toHaveLength(10);
    expect(agenda.ocorrencias).toBe(true);
    expect(ITENS_ROTINA.map((i) => i.key)).not.toContain("novos_atendimentos");
    expect(ITENS_ROTINA.map((i) => i.key)).not.toContain("preparacao_equipe");
    await expect(salvarItemRotina(m.store, GABI, { itemKey: "agenda_hoje_amanha", estado: "feito" })).resolves.toMatchObject({ estado: "feito" });
    // Ocorrência sem paciente e sem pendência: só o registro.
    const base: EntradaRegistro = { eventoId: randomUUID(), alvos: [], categoria: "agenda", assunto: "Agenda — Encaixe", contato: null, resposta: null, situacao: "informativo", feito: "Encaixe: avisei a Dra. e separei o material", detalhes: { rotina_item: "agenda_hoje_amanha", tipo_ocorrencia: "encaixe", profissional_comunicado: "Dra. Larissa" } };
    await registrarAtividade(m.store, GABI, base);
    expect(m._dados.tarefas).toHaveLength(0);
    // Pendência que depende do profissional: fica acompanhável.
    await registrarAtividade(m.store, GABI, { ...base, eventoId: randomUUID(), situacao: "pendente", proximaAcao: "Confirmar com a Dra. o tempo do procedimento", prazo: "2026-10-30", responsavel: `perfil:${GABI.id}`, detalhes: { ...base.detalhes!, depende_profissional: "sim" } });
    expect(m._dados.tarefas).toHaveLength(1);
  });

  it("confirmação de consulta: nova tentativa nunca depois da consulta", async () => {
    const m = await comPaciente();
    const conf: EntradaRegistro = { eventoId: randomUUID(), alvos: [], categoria: "agenda", pacienteId: m.pid, contato: "sim", resposta: "nao", situacao: "aguardando", proximaAcao: "Confirmar de novo", responsavel: `perfil:${GABI.id}`, prazo: "2026-11-05", detalhes: { rotina_item: "agenda_hoje_amanha", tipo_ocorrencia: "confirmacao", data_consulta: "2026-10-30" } };
    await expect(registrarAtividade(m.store, GABI, conf)).rejects.toThrow(/até a data da consulta/);
    expect(prazoFollowup("confirmacao", QUI, { dataConsulta: "2026-10-29" })).toBe(QUI); // consulta hoje: tenta hoje
  });
});

describe("B/C. pós-procedimento", () => {
  it("B: respondeu exige o relato — vazio ou só espaços não salva (tela e servidor)", async () => {
    const m = criarStoreMemoria();
    expect(validarContato({ item: POS, resultado: "respondeu", nomeNovo: "TESTE Ana", relato: "   ", responsavel: `perfil:${GABI.id}` }, QUI)).toEqual([["relato", expect.stringMatching(/como a paciente relatou/)]]);
    await expect(registrar(m.store, contato({ resultado: "respondeu", nomeNovo: "TESTE Ana", relato: "   " }))).rejects.toThrow(/descreva/i);
    await registrar(m.store, contato({ resultado: "respondeu", nomeNovo: "TESTE Ana", relato: "Relatou leve inchaço, melhorando." }));
    expect(m._dados.eventos.at(-1)).toMatchObject({ resposta: "sim", resultado: "Relatou leve inchaço, melhorando." });
  });

  it("B: necessita atenção do profissional registra o encaminhamento e mantém o caso acompanhado", async () => {
    const m = criarStoreMemoria();
    await registrar(m.store, contato({ resultado: "respondeu", nomeNovo: "TESTE Bia", relato: "Relatou dor forte desde ontem.", atencao: { profissional: "Dra. Larissa", motivo: "dor forte relatada", em: "2026-10-29T10:15", estado: "aguardando_profissional" }, proximaAcao: "Acompanhar o retorno do profissional", prazo: QUI }));
    const ev = m._dados.eventos.at(-1)!;
    expect(ev).toMatchObject({ situacao: "encaminhado" });
    expect(ev.payload?.detalhes).toMatchObject({ atencao_profissional: "sim", profissional: "Dra. Larissa", estado_acompanhamento: "aguardando_profissional" });
    expect(m._dados.tarefas.at(-1)).toMatchObject({ status: "waiting" });
  });

  it("C: sem resposta salva a tentativa e cria o retorno no próximo dia útil, mesmo sem data informada", async () => {
    const m = criarStoreMemoria();
    const e = registroDoContato(contato({ resultado: "aguardando_resposta", nomeNovo: "TESTE Cida" }));
    await registrarAtividade(m.store, GABI, { ...e, prazo: undefined, proximaAcao: undefined }); // servidor completa
    const t = m._dados.tarefas.at(-1)!;
    expect(t).toMatchObject({ due: "2026-10-30", nextAction: "Verificar se respondeu", status: "waiting" });
    expect(t.payload).toMatchObject({ followup: "rotina:pos_procedimento_ontem", tipo_followup: "pos_procedimento" });
    expect(m._dados.eventos.at(-1)).toMatchObject({ contato: "sim", resposta: "nao" });
  });
});

describe("D/E/I. retorno sem duplicar", () => {
  it("D: nova tentativa sem resposta reprograma o mesmo retorno e guarda as duas tentativas", async () => {
    const m = await comPaciente();
    await registrar(m.store, contato({ resultado: "aguardando_resposta", pacienteId: m.pid, proximaAcao: "Verificar se respondeu", prazo: "2026-10-30" }));
    vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
    await registrar(m.store, contato({ resultado: "nao_respondeu", pacienteId: m.pid, proximaAcao: "Tentar contato de novo", prazo: "2026-11-02" }));
    const abertas = m._dados.tarefas.filter((t) => t.patientId === m.pid);
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toMatchObject({ due: "2026-11-02", status: "open", nextAction: "Tentar contato de novo" });
    expect((await historico(m.store, { tipo: "tarefa", id: abertas[0]!.id })).filter((e) => e.contato === "sim" && e.resposta === "nao")).toHaveLength(2);
  });

  it("E: responder não encerra sozinho; o retorno só fecha quando resolvido de fato", async () => {
    const m = await comPaciente();
    await registrar(m.store, contato({ resultado: "aguardando_resposta", pacienteId: m.pid, proximaAcao: "Verificar se respondeu", prazo: "2026-10-30" }));
    const t = m._dados.tarefas.find((x) => x.patientId === m.pid)!;
    // Resposta com nova ação: continua aberto.
    await registrarAtividade(m.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], categoria: "pos_atendimento", contato: "sim", resposta: "sim", resultado: "Ainda com dúvida sobre o cuidado", situacao: "pendente", proximaAcao: "Ligar amanhã", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-30" });
    expect(m._dados.tarefas.find((x) => x.id === t.id)!.status).toBe("open");
    // Resolvido: fecha com o resultado.
    await registrarAtividade(m.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], categoria: "pos_atendimento", contato: "sim", resposta: "sim", resultado: "Orientada; sem queixas", situacao: "resolvido" });
    expect(m._dados.tarefas.find((x) => x.id === t.id)).toMatchObject({ status: "completed", closedReason: "Orientada; sem queixas" });
  });

  it("I: reenviar o mesmo registro (duplo clique, rede) não cria outra tarefa nem outro evento", async () => {
    const m = await comPaciente();
    const e = contato({ resultado: "nao_respondeu", pacienteId: m.pid, proximaAcao: "Tentar contato de novo", prazo: "2026-10-30" });
    await registrar(m.store, e);
    await expect(registrar(m.store, e)).resolves.toMatchObject({ duplicado: true });
    expect(m._dados.tarefas.filter((t) => t.patientId === m.pid)).toHaveLength(1);
    expect(m._dados.eventos.filter((x) => x.id === e.eventoId)).toHaveLength(1);
  });

  it("encerrar uma sequência sem resposta exige motivo", async () => {
    const m = await comPaciente();
    await registrar(m.store, contato({ resultado: "nao_respondeu", pacienteId: m.pid, proximaAcao: "Tentar de novo", prazo: "2026-10-30" }));
    const t = m._dados.tarefas.find((x) => x.patientId === m.pid)!;
    await expect(registrarAtividade(m.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: t.id }], categoria: "pos_atendimento", contato: "sim", resposta: "nao", situacao: "dispensado" })).rejects.toThrow(/motivo/);
  });
});

describe("prazos padrão do retorno", () => {
  it("dias úteis, ciclo de cobrança e confirmação limitada à consulta", () => {
    expect(somarDiasUteis("2026-10-30", 1)).toBe("2026-11-02"); // sexta → segunda
    expect(prazoFollowup("continuidade", QUI)).toBe("2026-11-02");
    expect(prazoFollowup("recorrencia", QUI)).toBe("2026-11-03");
    expect(proximoCicloCobranca("2026-10-26")).toBe("2026-10-30"); // segunda → sexta
    expect(prazoFollowup("cobranca", "2026-10-30")).toBe("2026-11-02");
    expect(prazoFollowup("confirmacao", QUI, { dataConsulta: "2026-10-29" })).toBe(QUI);
  });
});

describe("F/G. régua 30 · 90 · 180", () => {
  it("F: atendimento gera 30, 90 e 180 dias corridos; não há marco nem rotina de 60 dias", () => {
    expect(datasDosMarcos("2026-10-29")).toEqual({ d30: "2026-11-28", d90: "2027-01-27", m6: "2027-04-27" });
    expect(Object.values(ROTULO_MARCO)).toEqual(["30 dias", "90 dias", "180 dias"]);
    expect(ITENS_ROTINA.some((i) => /60 dias/.test(i.texto) || i.key === "contatos_60_dias")).toBe(false);
    expect(itensDoDia(QUI).map((i) => i.key)).toContain("contatos_180_dias");
  });

  it("G: marco futuro intocado da regra antiga é recalculado; trabalhado mantém a data do histórico", () => {
    const antigo = "2027-04-29"; // 29/10/2026 + 6 meses de calendário
    expect(planejarMarcos("2026-10-29", [{ kind: "m6", status: "previsto", dueOriginal: antigo, temEventoVinculado: false }], ["m6"])).toEqual([{ kind: "m6", acao: "recalcular", de: antigo, due: "2027-04-27" }]);
    expect(planejarMarcos("2026-10-29", [{ kind: "m6", status: "contatado", dueOriginal: antigo, temEventoVinculado: true }], ["m6"])[0]).toMatchObject({ acao: "manter", due: antigo });
  });
});

describe("H. fechamento", () => {
  it("tentativas, respostas, sem resposta e retornos aparecem; duas tentativas da mesma paciente = 1 paciente", async () => {
    const m = await comPaciente(); // 1 contato com resposta (Rita)
    await registrar(m.store, contato({ resultado: "aguardando_resposta", nomeNovo: "TESTE Dora", proximaAcao: "Verificar se respondeu", prazo: "2026-10-30" }));
    const dora = m._dados.eventos.at(-1)!.patientId!;
    await registrar(m.store, contato({ resultado: "nao_respondeu", pacienteId: dora, proximaAcao: "Tentar contato de novo", prazo: "2026-10-30" }));
    const p = await montarPrestacao(m.store, GABI.id, QUI);
    expect(p.indicadores).toMatchObject({ tentativas: 3, pacientesContatadas: 2, comResposta: 1, semResposta: 2, followupsProgramados: 1, posAcompanhados: 2, posSemResposta: 1 });
    expect(p.texto).toMatch(/\*Indicadores do dia\*\n• Contatos realizados: 3 tentativas \(2 pacientes\) · com resposta: 1 · sem resposta: 2/);
  });
});

describe("J. permissões", () => {
  it("a gestão vê o retorno criado pela Gabi; a Gabi não edita nem cancela tarefas", async () => {
    const m = await comPaciente();
    await registrar(m.store, contato({ resultado: "nao_respondeu", pacienteId: m.pid, proximaAcao: "Tentar de novo", prazo: "2026-10-30" }));
    const t = m._dados.tarefas.find((x) => x.patientId === m.pid)!;
    expect((await carregarFila(m.store, QUI, GESTAO.id)).itens.find((i) => i.alvo?.id === t.id)).toMatchObject({ followup: "pos_procedimento" });
    await expect(editarTarefa(m.store, GABI, t.id, { cancelar: true, motivo: "x" })).rejects.toThrow(/gestão/);
  });
});
