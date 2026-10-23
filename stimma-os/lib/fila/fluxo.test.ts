import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria } from "./store-memoria";
import { analisarFeedback, carregarFechamento, carregarFila, confirmarAtendimentoPendente, confirmarEntrada, criarTarefaManual, editarTarefa, historico, registrarAcao, type Ator } from "./servico";

// Fluxo completo da auditoria: gestão alimenta → concierge executa → sistema registra →
// feedback é gerado → colado de volta sem duplicar. Dados fictícios, store em memória.
const GESTAO: Ator = { id: "00000000-0000-4000-8000-000000000001", email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: "00000000-0000-4000-8000-000000000002", email: "concierge@exemplo.test", gestao: false };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("gestão: tarefas manuais, edição e histórico", () => {
  it("cria tarefa manual para paciente nova; só a gestão", async () => {
    const { store, _dados } = criarStoreMemoria();
    const base = { novoPaciente: { nome: "Helena Fictícia", sd_codigo: "4040" }, kind: "continuidade" as const, acao: "Ligar para marcar fase 2", contexto: "clareamento", prazo: "2026-10-22", responsavel: GABI.id };
    await expect(criarTarefaManual(store, GABI, base)).rejects.toThrow(/gestão/);
    const id = await criarTarefaManual(store, GESTAO, base);
    expect(_dados.tarefas.find((t) => t.id === id)).toMatchObject({ title: "Ligar para marcar fase 2", due: "2026-10-22", kind: "continuidade" });
    expect(_dados.pacientes).toHaveLength(1);
  });

  it("reagendar exige motivo e fica no histórico com autor; tarefa encerrada pela Gabi não é editada", async () => {
    const { store } = criarStoreMemoria();
    const id = await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "Helena Fictícia" }, kind: "outro", acao: "Confirmar documento", prazo: "2026-10-21", responsavel: GABI.id });
    await expect(editarTarefa(store, GESTAO, id, { prazo: "2026-10-25" })).rejects.toThrow(/motivo/);
    await editarTarefa(store, GESTAO, id, { prazo: "2026-10-25", motivo: "paciente viajando" });
    const h = await historico(store, { tipo: "tarefa", id });
    expect(h[0]).toMatchObject({ kind: "correcao", autor: "Gestão (demonstração)" });
    expect(h[0]!.notes).toContain("prazo: 21/10/2026 → 25/10/2026");
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], acao: "encerrar", desfecho: "resolvido", motivo: "documento recebido" });
    await expect(editarTarefa(store, GESTAO, id, { acao: "outra coisa" })).rejects.toThrow(/preservado/);
    const h2 = await historico(store, { tipo: "tarefa", id });
    expect(h2.map((e) => e.autor)).toEqual(["Gestão (demonstração)", "Gabi (demonstração)"]);
  });
});

describe("continuidade automática", () => {
  async function comTarefa() {
    const m = criarStoreMemoria();
    const id = await criarTarefaManual(m.store, GESTAO, { novoPaciente: { nome: "Íris Teste", sd_codigo: "5050" }, kind: "recuperacao_falta", acao: "Remarcar consulta", prazo: "2026-10-20", responsavel: GABI.id });
    return { ...m, id };
  }

  it("agendamento cria a tarefa de confirmar comparecimento na data da consulta", async () => {
    const { store, _dados, id } = await comTarefa();
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], acao: "agendamento", agendadoPara: "2026-10-27" });
    expect(_dados.tarefas.find((t) => t.payload.subtipo === "comparecimento")).toMatchObject({ due: "2026-10-27", status: "open" });
    expect(_dados.tarefas.find((t) => t.id === id)!.status).toBe("completed");
  });

  it("compareceu vira atendimento a conferir (marcos só após confirmação); faltou cria recuperação", async () => {
    const { store, _dados, id } = await comTarefa();
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], acao: "agendamento", agendadoPara: "2026-10-19" });
    const comp = _dados.tarefas.find((t) => t.payload.subtipo === "comparecimento")!;
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: comp.id }], acao: "comparecimento", compareceu: true });
    expect(_dados.atendimentos[0]).toMatchObject({ dataStatus: "pendente_validacao", dataRealizada: "2026-10-19" });
    expect(_dados.marcos).toHaveLength(0);
    await confirmarAtendimentoPendente(store, GABI, _dados.atendimentos[0]!.id, "2026-10-19");
    expect(_dados.marcos).toHaveLength(3);

    const outra = await comTarefa();
    await registrarAcao(outra.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: outra.id }], acao: "agendamento", agendadoPara: "2026-10-19" });
    const c2 = outra._dados.tarefas.find((t) => t.payload.subtipo === "comparecimento")!;
    await registrarAcao(outra.store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: c2.id }], acao: "comparecimento", compareceu: false });
    expect(outra._dados.tarefas.find((t) => t.kind === "recuperacao_falta" && t.id !== outra.id)).toMatchObject({ due: "2026-10-21", status: "open" });
  });

  it("contato sem resposta guarda a próxima ação e vai para aguardando", async () => {
    const { store, _dados, id } = await comTarefa();
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id }], acao: "contato", canal: "whatsapp", notas: "sem resposta", proximaAcao: "ligar à tarde" });
    expect(_dados.tarefas.find((t) => t.id === id)).toMatchObject({ status: "waiting", nextAction: "ligar à tarde" });
    const f = await carregarFila(store);
    expect(f.fila.aguardando[0]!.itens[0]!.proximaAcao).toBe("ligar à tarde");
  });
});

describe("ação executada ≠ objetivo resolvido; virada de dia", () => {
  it("cobrança sem resposta fica aberta, sem pagamento presumido; agendamento não presume comparecimento", async () => {
    const { store, _dados } = criarStoreMemoria();
    const cob = await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Ana" }, kind: "cobranca", acao: "Cobrar parcela 2/5", prazo: "2026-10-20", responsavel: GABI.id, valor: 300 });
    const fal = await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Bia" }, kind: "recuperacao_falta", acao: "Remarcar", prazo: "2026-10-20", responsavel: GABI.id });
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: cob }], acao: "contato", canal: "whatsapp", notas: "cobrança enviada, sem resposta", novaData: "2026-10-22", proximaAcao: "ligar" });
    expect(_dados.tarefas.find((t) => t.id === cob)).toMatchObject({ status: "open", due: "2026-10-22", nextAction: "ligar" });
    expect(_dados.eventos.some((e) => e.kind === "recebimento_confirmado")).toBe(false);

    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: fal }], acao: "agendamento", agendadoPara: "2026-10-27" });
    expect(_dados.atendimentos).toHaveLength(0); // agendado não é atendido
    expect(_dados.marcos).toHaveLength(0); // e não gera marcos

    const { texto } = await carregarFechamento(store, "2026-10-20");
    expect(texto).toContain("cobrança enviada, sem resposta"); // ação realizada…
    expect(texto).not.toMatch(/recebimento confirmado|Recebimentos confirmados/); // …sem presumir recebimento
    expect(texto).toContain("agendou consulta para 27/10/2026");
  });

  it("virada de dia: pendências continuam e tarefas futuras entram na data certa (fuso de Brasília)", async () => {
    const { store } = criarStoreMemoria();
    await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Caio" }, kind: "continuidade", acao: "Agendar fase 2", prazo: "2026-10-23", responsavel: GABI.id });
    await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE DE AUDITORIA Duda" }, kind: "outro", acao: "Retornar orçamento", prazo: "2026-10-20", responsavel: GABI.id });
    let f = await carregarFila(store);
    expect(f.fila.hoje.map((c) => c.pacienteNome)).toEqual(["TESTE DE AUDITORIA Duda"]);
    expect(f.fila.proximas.map((c) => c.pacienteNome)).toEqual(["TESTE DE AUDITORIA Caio"]);
    // 23/10 às 00:30 em Brasília = 03:30 UTC
    vi.setSystemTime(new Date("2026-10-23T03:30:00Z"));
    f = await carregarFila(store);
    expect(f.hoje).toBe("2026-10-23");
    expect(f.fila.atrasadas.map((c) => c.pacienteNome)).toEqual(["TESTE DE AUDITORIA Duda"]);
    expect(f.fila.hoje.map((c) => c.pacienteNome)).toEqual(["TESTE DE AUDITORIA Caio"]);
  });
});

describe("auditoria do fluxo completo", () => {
  it("levantamento → fila → ações → feedback → colado de volta sem duplicar; marcos exatos", async () => {
    const { store, _dados } = criarStoreMemoria();
    // 1. gestão publica levantamento (formato estruturado)
    const lote = JSON.stringify({
      contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: "2026-10-20T09:00:00-03:00" },
      itens: [
        { tipo: "cobranca", chave_origem: "sd-c1", paciente: { nome: "Joana Teste", sd_codigo: "877" }, valor: 450, vencimento: "2026-10-20", acao: "Cobrar parcela 3/6" },
        { tipo: "recuperacao_falta", chave_origem: "sd-f1", paciente: { nome: "Lia Exemplo", sd_codigo: "878" }, data_ocorrencia: "2026-10-18", ocorrencia: "falta", acao: "Remarcar falta" },
        { tipo: "atendimento_realizado", chave_origem: "sd-a1", paciente: { nome: "Nina Demo", sd_codigo: "879" }, data_atendimento: "2026-10-15", status_no_sd: "Finalizado" },
      ],
    });
    const r = await confirmarEntrada(store, GESTAO, lote);
    expect(r).toMatchObject({ tarefas: 2, atendimentosConfirmados: 1 });
    // 10. marcos exatos, mesmo reenviando o lançamento (com outra hora de consulta)
    await confirmarEntrada(store, GESTAO, lote.replace("09:00:00", "11:00:00"));
    expect(_dados.marcos).toHaveLength(3);
    expect(_dados.tarefas).toHaveLength(2);

    // 2. a concierge vê as tarefas
    const f = await carregarFila(store);
    const cobranca = _dados.tarefas.find((t) => t.chaveOrigem === "sd-c1")!;
    const falta = _dados.tarefas.find((t) => t.chaveOrigem === "sd-f1")!;
    expect(f.fila.hoje.flatMap((c) => c.itens).map((i) => i.titulo).sort()).toEqual(["Cobrar parcela 3/6", "Remarcar falta"]);

    // 3. contato sem resposta + próxima ação; 4. outra concluída com resultado
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: falta.id }], acao: "contato", canal: "whatsapp", notas: "sem resposta", novaData: "2026-10-22", proximaAcao: "tentar ligação" });
    await registrarAcao(store, GABI, { eventoId: randomUUID(), alvos: [{ tipo: "tarefa", id: cobranca.id }], acao: "recebimento", valor: 450, origemValor: "parcela" });

    // 5. feedback reflete as ações
    const { texto } = await carregarFechamento(store, "2026-10-20");
    expect(texto).toContain("Lia E. · Remarcar falta: contato por WhatsApp: sem resposta — próxima ação: tentar ligação");
    expect(texto).toMatch(/Joana T\. · Cobrar parcela 3\/6: .*recebimento registrado R\$\s?450,00/);
    expect(texto).not.toMatch(/Recebimentos confirmados|Cobranças em aberto/); // sem totais financeiros

    // 6–7. colado de volta: consulta o registrado, não recria a concluída nem duplica a aberta
    const antes = _dados.tarefas.length;
    const analise = await analisarFeedback(store, GESTAO, texto);
    expect(analise.dia).toBe("2026-10-20");
    const porId = Object.fromEntries(analise.linhas.filter((l) => l.alvo).map((l) => [l.alvo!.id, l.situacao]));
    expect(porId[cobranca.id]).toBe("concluido");
    expect(porId[falta.id]).toBe("na_fila");
    expect(_dados.tarefas.length).toBe(antes);
    await expect(analisarFeedback(store, GABI, texto)).rejects.toThrow(/gestão/);
  });

  it("feedback antigo sem referência fica para revisão, com a data do próprio feedback", async () => {
    const { store } = criarStoreMemoria();
    const r = await analisarFeedback(store, GESTAO, "Feedback 15/10/2026\n• Maria pediu para ligar amanhã\n• Cobrança enviada para Ana");
    expect(r.dia).toBe("2026-10-15");
    expect(r.linhas.map((l) => l.situacao)).toEqual(["sem_referencia", "sem_referencia"]);
  });
});
