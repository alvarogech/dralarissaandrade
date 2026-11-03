import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { anularRegistro, registrarAtividade } from "./registro";
import { contatosDaRotina, salvarItemRotina } from "./rotina";
import { itemDaRotina, itemValeNoDia } from "./rotina-itens";
import { montarPrestacao } from "./prestacao";
import { podeVerCaixa as podeVerNominal } from "./caixa";
import { registroDaConferencia, resumirComercial, validarConferencia, type EntradaConferencia, type RegistroComercial } from "./conferencia-comercial";
import type { Ator } from "./servico";
import type { FilaStore } from "./store";

// Conferência comercial da Mel na rotina da Gabi (29/10). Nomes fictícios.
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const OUTRA: Ator = { id: "00000000-0000-4000-8000-000000000099", email: "outra@exemplo.test", gestao: false };
const QUI = "2026-10-29";
const ITEM = itemDaRotina("conferencia_mel")!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T21:00:00Z")); // 18:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

const entrada = (e: Partial<EntradaConferencia>): EntradaConferencia => ({
  eventoId: randomUUID(), grupo: "novo_lead", situacao: "atendimento_iniciado", conferencia: "conversa", resultado: "Mel respondeu e enviou valores", ...e,
});
const conferir = (store: FilaStore, e: Partial<EntradaConferencia>, ator = GABI) => registrarAtividade(store, ator, registroDaConferencia(entrada(e), ator.id));
const comerciais = async (store: FilaStore): Promise<RegistroComercial[]> =>
  ((await contatosDaRotina(store, GABI.id, QUI)).conferencia_mel ?? []).map((r) => ({ eventoId: r.eventoId, pacienteId: r.pacienteId, paciente: r.paciente, detalhes: r.detalhes, proxima: r.proxima, prazo: r.prazo }));

describe("conferência comercial — Mel", () => {
  it("1. atividade das conferências finais, de segunda a sexta, com checklist", () => {
    expect(ITEM).toMatchObject({ grupo: "finais", texto: "Conferir atendimentos comerciais da Mel", conferenciaComercial: true });
    expect(ITEM.roteiro!.length).toBeGreaterThanOrEqual(5);
    expect(itemValeNoDia(ITEM, QUI)).toBe(true); // quinta
    expect(itemValeNoDia(ITEM, "2026-10-31")).toBe(false); // sábado
    expect(itemValeNoDia(ITEM, "2026-11-01")).toBe(false); // domingo
  });

  it("2. registra várias pacientes nominalmente, inclusive lead ainda não cadastrado (identificação provisória)", async () => {
    const m = criarStoreMemoria();
    await conferir(m.store, { nomeNovo: "TESTE Lia Lead", servico: "harmonização facial" });
    await conferir(m.store, { nomeNovo: "TESTE Bruna Follow", grupo: "follow_up", situacao: "followup_realizado", resultado: "Mel fez follow-up, paciente vai pensar" });
    await conferir(m.store, { nomeNovo: "TESTE Carla Agenda", grupo: "agendamento", situacao: "avaliacao_agendada", conferencia: "simples_dental", agendamento: { data: "2026-11-04", hora: "10:00" }, resultado: "Avaliação marcada" });
    const regs = await comerciais(m.store);
    expect(regs.map((r) => r.paciente)).toEqual(["TESTE Lia Lead", "TESTE Bruna Follow", "TESTE Carla Agenda"]);
    expect(regs[2]!.detalhes).toMatchObject({ grupo: "agendamento", conferencia: "simples_dental", agendamento_data: "2026-11-04" });
    expect(m._dados.pacientes).toHaveLength(3); // lead novo vira cadastro explícito, sem código inventado
  });

  it("3. validação na tela e no servidor: paciente, motivo de não conferido, data do agendamento, resultado", async () => {
    const m = criarStoreMemoria();
    const { eventoId: _, ...sem } = entrada({ conferencia: "nao_conferido", resultado: " " });
    expect(validarConferencia(sem, QUI).map(([k]) => k)).toEqual(["paciente", "motivo", "resultado"]);
    expect(validarConferencia({ ...sem, nomeNovo: "X", grupo: "agendamento", motivoNaoConferido: "sem acesso", resultado: "ok" }, QUI).map(([k]) => k)).toEqual(["agendaData"]);
    await expect(conferir(m.store, {})).rejects.toThrow(/nominal/);
    await expect(conferir(m.store, { nomeNovo: "TESTE Ana", conferencia: "nao_conferido" })).rejects.toThrow(/por que não foi possível/);
    await expect(conferir(m.store, { nomeNovo: "TESTE Ana", grupo: "agendamento" })).rejects.toThrow(/data do agendamento/);
    await expect(conferir(m.store, { nomeNovo: "TESTE Ana", resultado: "  " })).rejects.toThrow(/resultado/);
    expect(m._dados.eventos).toHaveLength(0);
  });

  it("4. resumo automático: leads, follow-ups, agendadas, divergências e o que foi só informado pela Mel", () => {
    const r = (d: Record<string, string>, id = randomUUID()): RegistroComercial => ({ eventoId: randomUUID(), pacienteId: id, paciente: "P", detalhes: d, proxima: null, prazo: null });
    const ana = randomUUID();
    const res = resumirComercial([
      r({ grupo: "novo_lead", situacao_comercial: "atendimento_iniciado", conferencia: "conversa" }, ana),
      r({ grupo: "novo_lead", situacao_comercial: "nao_atendida", conferencia: "conversa" }),
      r({ grupo: "follow_up", situacao_comercial: "aguardando_paciente", conferencia: "informado_mel" }, ana),
      r({ grupo: "agendamento", situacao_comercial: "avaliacao_agendada", conferencia: "simples_dental", agendamento_data: "2026-11-04" }),
      r({ grupo: "divergencia", situacao_comercial: "nao_atendida", conferencia: "divergencia", divergencia: "lead_sem_atendimento" }),
    ]);
    expect(res).toMatchObject({ pacientesUnicas: 4, novosLeads: 2, leadsSemAtendimento: 1, followups: 1, semResposta: 1, agendadas: 1, agendamentosConferidos: 1, divergencias: 1, naoVerificados: 1 });
  });

  it("5. pendência comercial fica com a Mel e não duplica: mesma paciente e assunto atualiza o acompanhamento aberto", async () => {
    const m = criarStoreMemoria();
    await conferir(m.store, { nomeNovo: "TESTE Dora", situacao: "aguardando_mel", pendencia: { responsavel: "comercial_externa", acao: "Mel enviar orçamento", prazo: "2026-10-30" } });
    const pid = m._dados.eventos.at(-1)!.patientId!;
    expect(m._dados.tarefas).toHaveLength(1);
    expect(m._dados.tarefas[0]).toMatchObject({ assignedTo: null, payload: expect.objectContaining({ responsavel: "comercial_externa", followup: "rotina:conferencia_mel" }) });
    await conferir(m.store, { pacienteId: pid, grupo: "follow_up", situacao: "aguardando_paciente", pendencia: { responsavel: "comercial_externa", acao: "Mel cobrar resposta", prazo: "2026-11-03" } });
    expect(m._dados.tarefas).toHaveLength(1);
    expect(m._dados.tarefas[0]!.due).toBe("2026-11-03");
  });

  it("6. 'sem movimentação' só com confirmação e só sem pacientes registradas; nada é concluído vazio", async () => {
    const m = criarStoreMemoria();
    await expect(salvarItemRotina(m.store, GABI, { itemKey: "conferencia_mel", estado: "feito" })).rejects.toThrow(/confirme que não houve movimentação/);
    await expect(salvarItemRotina(m.store, GABI, { itemKey: "conferencia_mel", estado: "feito", metricas: { sem_movimentacao: true } })).resolves.toMatchObject({ estado: "feito" });
    await conferir(m.store, { nomeNovo: "TESTE Eva" });
    await expect(salvarItemRotina(m.store, GABI, { itemKey: "conferencia_mel", estado: "feito", metricas: { sem_movimentacao: true } })).rejects.toThrow(/Há pacientes registradas/);
    await expect(salvarItemRotina(m.store, GABI, { itemKey: "conferencia_mel", estado: "feito", metricas: { sem_movimentacao: false } })).resolves.toMatchObject({ estado: "feito" });
  });

  it("7. remover registro incorreto: motivo obrigatório, só quem registrou, sem apagar, com auditoria", async () => {
    const m = criarStoreMemoria();
    await conferir(m.store, { nomeNovo: "TESTE Fabi" });
    const id = m._dados.eventos.at(-1)!.id;
    await expect(anularRegistro(m.store, GABI, { eventoId: id, motivo: " " })).rejects.toThrow(/por que/);
    await expect(anularRegistro(m.store, GESTAO, { eventoId: id, motivo: "duplicado" })).rejects.toThrow(/Só quem fez/);
    await anularRegistro(m.store, GABI, { eventoId: id, motivo: "registrada em duplicidade" });
    expect(m._dados.eventos).toHaveLength(1); // preservado no histórico
    expect(m._dados.eventos[0]!.payload?.anulado).toMatchObject({ motivo: "registrada em duplicidade", por: GABI.id });
    expect(await comerciais(m.store)).toHaveLength(0);
    expect(m._dados.auditoria.at(-1)).toMatchObject({ action: "fila_registro_anulado" });
    // Registro que abriu pendência: correção é pela própria pendência.
    await conferir(m.store, { nomeNovo: "TESTE Gil", pendencia: { responsavel: "comercial_externa", acao: "Mel ligar", prazo: "2026-10-30" } });
    await expect(anularRegistro(m.store, GABI, { eventoId: m._dados.eventos.at(-1)!.id, motivo: "erro" })).rejects.toThrow(/acompanhamento/);
  });

  it("8. a conferência não conta como contato nem retorno da Gabi", async () => {
    const m = criarStoreMemoria();
    await conferir(m.store, { nomeNovo: "TESTE Hana", pendencia: { responsavel: "comercial_externa", acao: "Mel enviar valores", prazo: "2026-10-30" } });
    const p = await montarPrestacao(m.store, GABI.id, QUI);
    expect(p.indicadores).toMatchObject({ tentativas: 0, comResposta: 0, followupsProgramados: 0 });
    expect(p.contatos.find((c) => c.rotulo.includes("Mel"))).toBeUndefined();
    expect(p.comercial.registros).toHaveLength(1);
  });

  it("9. fechamento: seção nominal agrupada, com pendências para os próximos dias, no mesmo texto da entrega", async () => {
    const m = criarStoreMemoria();
    await conferir(m.store, { nomeNovo: "TESTE Iara", servico: "botox", pendencia: { responsavel: "comercial_externa", acao: "Mel retornar com horários", prazo: "2026-10-30" } });
    await conferir(m.store, { nomeNovo: "TESTE Joana", grupo: "agendamento", situacao: "avaliacao_agendada", conferencia: "informado_mel", agendamento: { data: "2026-11-05" }, resultado: "Mel informou avaliação marcada" });
    const p = await montarPrestacao(m.store, GABI.id, QUI);
    expect(p.texto).toContain("*Conferência comercial — Mel*");
    expect(p.texto).toContain("NOVOS LEADS\n• TESTE I. — interesse: botox");
    expect(p.texto).toContain("AGENDAMENTOS\n• TESTE J. — Avaliação agendada");
    expect(p.texto).toContain("PENDÊNCIAS COMERCIAIS EM ABERTO");
    expect(p.fechamento.pendentesAbertas).toHaveLength(0); // pendência da Mel não vira pendência nem prioridade da Gabi
    expect(p.fechamento.prioridades).toHaveLength(0);
    expect(p.comercial.pendentes).toEqual([expect.objectContaining({ responsavel: "Mel (comercial)", prazo: "2026-10-30" })]);
    expect(p.comercial.resumo).toMatchObject({ agendadas: 1, naoVerificados: 1 });

    const vazio = await montarPrestacao(criarStoreMemoria().store, GABI.id, QUI);
    expect(vazio.texto).toContain("Conferência ainda não registrada hoje.");
  });

  it("10. histórico nominal só para a concierge configurada e a gestão", async () => {
    const m = criarStoreMemoria();
    expect(await podeVerNominal(m.store, GABI)).toBe(true);
    expect(await podeVerNominal(m.store, GESTAO)).toBe(true);
    expect(await podeVerNominal(m.store, OUTRA)).toBe(false);
  });
});
