import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade, type EntradaRegistro } from "./registro";
import { carregarFechamento, carregarFila, confirmarEntrada, criarTarefaManual, salvarEstadoDoDia, type Ator } from "./servico";

// Cenários de validação do registro do dia (dados fictícios, store em memória).
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const RESP = `perfil:${GABI.id}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const reg = (extra: Partial<EntradaRegistro>): EntradaRegistro => ({ eventoId: randomUUID(), alvos: [], categoria: "pendencia", contato: null, resposta: null, situacao: "informativo", ...extra });

async function comPaciente() {
  const m = criarStoreMemoria();
  const pid = await m.store.criarPaciente({ nome: "TESTE DE AUDITORIA Ana", sd_codigo: "9001" }, GESTAO.id);
  return { ...m, pid };
}

describe("registro do dia", () => {
  it("registro espontâneo com a fila vazia, sem pendência, não cria tarefa artificial", async () => {
    const { store, _dados, pid } = await comPaciente();
    await registrarAtividade(store, GABI, reg({ categoria: "relacionamento", pacienteId: pid, contato: "sim", canal: "whatsapp", resposta: "nao", feito: "parabéns pelo aniversário", situacao: "informativo" }));
    expect(_dados.tarefas).toHaveLength(0);
    expect(_dados.eventos[0]).toMatchObject({ kind: "contato", contato: "sim", resposta: "nao", categoria: "relacionamento" });
  });

  it("pendência exige próxima ação, responsável e prazo; não-preenchido ≠ não", async () => {
    const { store, _dados, pid } = await comPaciente();
    await expect(registrarAtividade(store, GABI, reg({ categoria: "oportunidade", pacienteId: pid, situacao: "pendente" }))).rejects.toThrow(/próxima ação/);
    await expect(registrarAtividade(store, GABI, reg({ categoria: "oportunidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Enviar horários" }))).rejects.toThrow(/responsável/);
    await expect(registrarAtividade(store, GABI, reg({ categoria: "oportunidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Enviar horários", responsavel: RESP }))).rejects.toThrow(/prazo/);
    await registrarAtividade(store, GABI, reg({ categoria: "oportunidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Enviar horários", responsavel: RESP, prazo: "2026-10-22", detalhes: { interesse: "clareamento" } }));
    expect(_dados.tarefas[0]).toMatchObject({ kind: "oportunidade", due: "2026-10-22", status: "open", assignedTo: GABI.id, nextAction: "Enviar horários" });
    expect(_dados.eventos[0]).toMatchObject({ contato: null, resposta: null }); // nada marcado sozinho
  });

  it("ação em tarefa existente; contato sem resposta segue aberto; resposta posterior no mesmo caso", async () => {
    const { store, _dados } = criarStoreMemoria();
    const id = await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Bia" }, kind: "continuidade", acao: "Agendar fase 2", prazo: "2026-10-20", responsavel: GABI.id });
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", canal: "whatsapp", resposta: "nao", feito: "mensagem com horários", situacao: "aguardando", proximaAcao: "Verificar se respondeu", responsavel: RESP, prazo: "2026-10-21" }));
    expect(_dados.tarefas[0]).toMatchObject({ status: "waiting", due: "2026-10-21" });
    // dia seguinte: paciente responde (não houve novo contato)
    vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "na", resposta: "sim", resultado: "prefere sábado", situacao: "pendente", proximaAcao: "Oferecer sábado 26/10", responsavel: RESP, prazo: "2026-10-22" }));
    expect(_dados.tarefas).toHaveLength(1); // mesmo caso, sem duplicar
    expect(_dados.tarefas[0]).toMatchObject({ status: "open", due: "2026-10-22" });
    const { fechamento } = await carregarFechamento(store, "2026-10-21");
    expect(fechamento.contadores).toMatchObject({ tentativasContato: 0, respostas: 1 });
    // o dia anterior continua mostrando o contato sem resposta, não a situação atual
    const ontem = await carregarFechamento(store, "2026-10-20");
    expect(ontem.fechamento.contadores).toMatchObject({ tentativasContato: 1, respostas: 0 });
    expect(ontem.texto).toContain("aguardando resposta");
  });

  it("agendamento fica em acompanhamento até o comparecimento; não vira atendimento", async () => {
    const { store, _dados } = criarStoreMemoria();
    const id = await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Caio" }, kind: "continuidade", acao: "Agendar", prazo: "2026-10-20", responsavel: GABI.id });
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", resposta: "sim", resultado: "aceitou", situacao: "agendado", agendadoPara: "2026-10-27" }));
    expect(_dados.atendimentos).toHaveLength(0);
    const comp = _dados.tarefas.find((t) => t.payload.subtipo === "comparecimento")!;
    expect(comp).toMatchObject({ due: "2026-10-27", status: "open" });
    vi.setSystemTime(new Date("2026-10-27T18:00:00Z"));
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id: comp.id }], categoria: "agenda", contato: "na", resposta: "na", situacao: "compareceu" }));
    expect(_dados.atendimentos[0]).toMatchObject({ dataStatus: "pendente_validacao" });
    expect(_dados.marcos).toHaveLength(0); // marcos só depois de confirmar no Simples Dental
  });

  it("falta sem remarcação gera continuidade; resolvido não exige próxima ação", async () => {
    const { store, _dados, pid } = await comPaciente();
    await registrarAtividade(store, GABI, reg({ categoria: "agenda", pacienteId: pid, detalhes: { ocorrencia: "falta", horario: "14:00" }, contato: "nao", resposta: "na", situacao: "pendente", proximaAcao: "Ligar para remarcar", responsavel: RESP, prazo: "2026-10-21" }));
    expect(_dados.tarefas[0]).toMatchObject({ kind: "recuperacao_falta", due: "2026-10-21" });
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id: _dados.tarefas[0]!.id }], categoria: "agenda", contato: "sim", resposta: "sim", resultado: "remarcou por conta própria", situacao: "resolvido" }));
    expect(_dados.tarefas[0]).toMatchObject({ status: "completed", closedReason: "remarcou por conta própria" });
  });

  it("alerta administrativo sem paciente; outras áreas exigem paciente", async () => {
    const { store, _dados } = criarStoreMemoria();
    await expect(registrarAtividade(store, GABI, reg({ categoria: "oportunidade", assunto: "algo", situacao: "informativo", feito: "x" }))).rejects.toThrow(/paciente/);
    await registrarAtividade(store, GABI, reg({ categoria: "pendencia", assunto: "Impressora da recepção", detalhes: { tipo_pendencia: "Equipamento ou estrutura" }, situacao: "pendente", proximaAcao: "Chamar técnico", responsavel: "gestao", prazo: "2026-10-21" }));
    expect(_dados.tarefas[0]).toMatchObject({ patientId: null, assunto: "Impressora da recepção", kind: "pendencia" });
    const f = await carregarFila(store);
    expect(f.fila.proximas[0]!.pacienteNome).toBe("Impressora da recepção");
    expect(f.fila.proximas[0]!.itens[0]!.responsavel).toBe("Gestão");
  });

  it("duplo clique não duplica; registro na mesma paciente não une casos automaticamente", async () => {
    const { store, _dados, pid } = await comPaciente();
    const e = reg({ categoria: "pos_atendimento", pacienteId: pid, contato: "sim", resposta: "sim", resultado: "gostou do resultado", situacao: "resolvido", atencao: false });
    await registrarAtividade(store, GABI, e);
    expect(await registrarAtividade(store, GABI, e)).toMatchObject({ duplicado: true });
    expect(_dados.eventos).toHaveLength(1);
    await registrarAtividade(store, GABI, reg({ categoria: "oportunidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Avaliar clareamento", responsavel: RESP, prazo: "2026-10-22" }));
    await registrarAtividade(store, GABI, reg({ categoria: "continuidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Fase 2", responsavel: RESP, prazo: "2026-10-23" }));
    expect(_dados.tarefas).toHaveLength(2); // assuntos distintos, casos distintos
  });

  it("etapa clínica futura não vira atraso; a ação administrativa vencida continua visível", async () => {
    const { store, pid } = await comPaciente();
    await registrarAtividade(store, GABI, reg({ categoria: "continuidade", pacienteId: pid, situacao: "pendente", proximaAcao: "Confirmar data da fase 2", responsavel: RESP, prazo: "2026-10-20", etapa: { definicao: "fase 2 do clareamento", situacao: "prevista", data: "2026-12-10" } }));
    vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
    const f = await carregarFila(store);
    expect(f.fila.atrasadas[0]!.itens[0]).toMatchObject({ due: "2026-10-20", etapa: { data: "2026-12-10" } });
  });

  it("prioridades: até 8, persistidas e refletidas; sem ocorrências refletida no feedback", async () => {
    const { store } = criarStoreMemoria();
    await expect(salvarEstadoDoDia(store, GABI, "2026-10-20", { prioridades: Array.from({ length: 9 }, (_, i) => ({ ref: null, texto: `p${i}` })) })).rejects.toThrow(/até 8/);
    await salvarEstadoDoDia(store, GABI, "2026-10-20", { prioridades: [{ ref: null, texto: "Confirmar agenda de quinta" }], secoes: { recorrencia: "sem_ocorrencias" } });
    const { texto } = await carregarFechamento(store, "2026-10-20");
    expect(texto).toContain("• Confirmar agenda de quinta");
    expect(texto).toContain("*Recorrência e follow-up*\n• Sem ocorrências.");
  });
});
