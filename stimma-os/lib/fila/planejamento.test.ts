import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade } from "./registro";
import { montarPrestacao } from "./prestacao";
import { registroDaConferencia, validarConferencia, type EntradaConferencia } from "./conferencia-comercial";
import { registroPresencial, validarPresencial, type EntradaPlanejamento, type EntradaPresencial } from "./planejamento";
import type { Ator } from "./servico";
import type { FilaStore } from "./store";

// Planejamento anual: apresentação, aceite e fechamento, presencial e WhatsApp (outubro/2026). Fictício.
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const dia = (d: string) => vi.setSystemTime(new Date(`${d}T15:00:00Z`)); // 12:00 em São Paulo

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); dia("2026-10-29"); });
afterEach(() => vi.useRealTimers());

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const MEL = { responsavel: "comercial_externa" as const, acao: "Mel retomar contato", prazo: "2026-11-30" };

function presencial(store: FilaStore, plan: EntradaPlanejamento, e: Partial<EntradaPresencial> = {}) {
  return registrarAtividade(store, GABI, registroPresencial({ eventoId: randomUUID(), plan, ...e }, GABI.id, hoje()));
}
function whatsapp(store: FilaStore, plan: EntradaPlanejamento, e: Partial<EntradaConferencia> = {}) {
  return registrarAtividade(store, GABI, registroDaConferencia({
    eventoId: randomUUID(), grupo: "follow_up", situacao: "followup_realizado", conferencia: "conversa", resultado: "Conversa sobre o planejamento", planejamento: plan, ...e,
  }, GABI.id, hoje()));
}
const SIM = (resultado: EntradaPlanejamento["resultado"], extra: Partial<EntradaPlanejamento> = {}): EntradaPlanejamento =>
  ({ resposta: "sim", resultado, responsavel: "Dra. Larissa", confirmacao: "profissional", tipo: "Planejamento facial anual", ...extra });
const pid = (m: ReturnType<typeof criarStoreMemoria>) => m._dados.eventos.at(-1)!.patientId!;
const tarefasPlan = (m: ReturnType<typeof criarStoreMemoria>) => m._dados.tarefas.filter((t) => String(t.payload.followup ?? "").startsWith("planejamento:"));

describe("planejamento anual", () => {
  it("1. presencial em avaliação: uma oportunidade, apresentada presencialmente, com follow-up da Mel", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, SIM("avaliando"), { nomeNovo: "TESTE Maria Exemplo", pendencia: MEL });
    const t = tarefasPlan(m);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ assignedTo: null, due: "2026-11-30", status: "open" });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ apresentadosPresencial: 1, apresentadosWhatsapp: 0, oportunidades: 1, fechados: 0, followupsPendentes: 1 });
    expect(p.planejamento.grupos.presencial).toEqual(["Maria Exemplo — Dra. Larissa — em avaliação".replace("Maria Exemplo", "TESTE Maria Exemplo")]);
  });

  it("2. WhatsApp, conferido na conversa e fechado: conta um fechamento, sem follow-up", async () => {
    const m = criarStoreMemoria();
    await whatsapp(m.store, { resposta: "sim", resultado: "fechado", fechamento: { valor: "4.800,00", vendedor: "Mel" } }, { nomeNovo: "TESTE Ana Exemplo", grupo: "novo_lead" });
    expect(m._dados.eventos.at(-1)!.payload?.detalhes).toMatchObject({ planejamento_canal: "whatsapp", planejamento_fechou: "sim", planejamento_valor: "4800.00", planejamento_profissional: "Mel" });
    expect(tarefasPlan(m)).toHaveLength(0);
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ apresentadosWhatsapp: 1, fechados: 1, oportunidades: 1 });
    expect(p.planejamento.grupos.fechamentos[0]).toMatch(/origem: WhatsApp — R\$\s?4\.800,00/);
  });

  it("3/8/9. presencial → follow-up da Mel pelo WhatsApp → fechamento em outro dia: uma oportunidade, um fechamento", async () => {
    const m = criarStoreMemoria();
    dia("2026-10-26");
    await presencial(m.store, SIM("avaliando"), { nomeNovo: "TESTE Bia Exemplo", pendencia: MEL });
    const id = pid(m);
    dia("2026-10-27");
    await whatsapp(m.store, { resposta: "sim", resultado: "interesse" }, { pacienteId: id, pendencia: { ...MEL, prazo: "2026-10-29" } });
    await whatsapp(m.store, { resposta: "sim", resultado: "aceito" }, { pacienteId: id, pendencia: { ...MEL, acao: "Mel enviar contrato", prazo: "2026-10-29" } });
    expect(tarefasPlan(m)).toHaveLength(1); // mesma oportunidade, mesmo acompanhamento
    const ids = new Set(m._dados.eventos.map((e) => (e.payload?.detalhes as Record<string, string>).oportunidade_id));
    expect(ids.size).toBe(1);
    const dia27 = await montarPrestacao(m.store, GABI.id, "2026-10-27");
    expect(dia27.planejamento.resumo).toMatchObject({ apresentadosPresencial: 0, apresentadosWhatsapp: 0, oportunidades: 0, aceitos: 1, fechados: 0 });

    dia("2026-10-29");
    await whatsapp(m.store, { resposta: "sim", resultado: "fechado", fechamento: { data: "2026-10-29" } }, { pacienteId: id, conferencia: "simples_dental" });
    expect(tarefasPlan(m)[0]).toMatchObject({ status: "completed" });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ apresentadosPresencial: 0, apresentadosWhatsapp: 0, fechados: 1, followupsPendentes: 0 });
    expect(p.planejamento.grupos.fechamentos).toEqual(["TESTE Bia Exemplo — origem: Presencial (continuidade: WhatsApp) — valor não confirmado"]);
    // Fechamento informado de novo para a mesma oportunidade: não conta outro.
    await whatsapp(m.store, { resposta: "sim", resultado: "fechado" }, { pacienteId: id });
    expect((await montarPrestacao(m.store, GABI.id, hoje())).planejamento.resumo.fechados).toBe(1);
  });

  it("4/10. aceito não é fechamento e exige próxima ação (tela e servidor)", async () => {
    const m = criarStoreMemoria();
    const semPendencia = { pacienteId: null, nomeNovo: "TESTE Clara", plan: SIM("aceito") };
    expect(validarPresencial(semPendencia, hoje()).map(([k]) => k)).toEqual(["acao", "prazo"]);
    await expect(presencial(m.store, SIM("aceito"), { nomeNovo: "TESTE Clara" })).rejects.toThrow(/próxima ação/);
    expect(validarConferencia({ nomeNovo: "TESTE Clara", grupo: "follow_up", situacao: "followup_realizado", conferencia: "conversa", resultado: "ok", planejamento: { resposta: "sim", resultado: "avaliando" } }, hoje()).map(([k]) => k)).toEqual(["temPendencia"]);
    await presencial(m.store, SIM("aceito"), { nomeNovo: "TESTE Clara", pendencia: { responsavel: "comercial_externa", acao: "Acompanhar formalização", prazo: "2026-10-30" } });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ aceitos: 1, fechados: 0, followupsPendentes: 1 });
  });

  it("5. recusa: motivo (opcional), pedido de não contato e acompanhamento encerrado", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, SIM("avaliando"), { nomeNovo: "TESTE Dora", pendencia: MEL });
    await whatsapp(m.store, { resposta: "sim", resultado: "sem_interesse", motivoRecusa: "prefere decidir ano que vem", naoContatar: true }, { pacienteId: pid(m) });
    expect(tarefasPlan(m)[0]).toMatchObject({ status: "cancelled" });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ semFechamento: 1, followupsPendentes: 0, oportunidades: 1 });
    expect(p.planejamento.grupos.naoFechados).toEqual(["TESTE Dora — prefere decidir ano que vem (pediu para não receber novos contatos)"]);
  });

  it("6. ainda não confirmado: pendência de esclarecimento com o profissional", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, { resposta: "nao_confirmado", responsavel: "Dra. Larissa", esclarecer: "perguntar à Dra. no fim do dia" }, { nomeNovo: "TESTE Eva", pendencia: { responsavel: "gabi", acao: "Confirmar com a Dra. Larissa", prazo: "2026-10-30" } });
    expect(m._dados.tarefas.at(-1)).toMatchObject({ assignedTo: GABI.id });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ pendentesConferencia: 1, apresentadosPresencial: 0 });
    expect(p.planejamento.grupos.pendentes).toEqual(["TESTE Eva — confirmar se o planejamento foi apresentado (perguntar à Dra. no fim do dia)"]);
  });

  it("7. não se aplica e não apresentado: só o registro, motivo opcional", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, { resposta: "nao_se_aplica" }, { nomeNovo: "TESTE Fabi" });
    await presencial(m.store, { resposta: "nao" }, { nomeNovo: "TESTE Gil" }); // sem inventar justificativa
    await presencial(m.store, { resposta: "nao", motivoNao: "nao_abordada" }, { nomeNovo: "TESTE Hana" });
    expect(m._dados.tarefas).toHaveLength(0);
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ atendimentosConferidos: 3, apresentadosPresencial: 0, oportunidades: 0 });
  });

  it("11. fechamento só conta conferido; informado vira pendência; valor nunca entra nos recebimentos", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, SIM("fechado", { confirmacao: "informado", fechamento: { valor: "3000" } }), { nomeNovo: "TESTE Iara", pendencia: { responsavel: "gabi", acao: "Conferir no Simples Dental", prazo: "2026-10-30" } });
    await expect(presencial(m.store, SIM("avaliando", { confirmacao: "" }), { nomeNovo: "TESTE Jade", pendencia: MEL })).rejects.toThrow(/presunção/);
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ fechados: 0, pendentesConferencia: 1, apresentadosPresencial: 1 });
    expect(p.planejamento.grupos.presencial[0]).toMatch(/fechamento informado, aguardando conferência/);
    expect(p.texto).toContain("*Planejamentos anuais — Apresentações e fechamentos*");
    expect(p.texto).toMatch(/APRESENTADOS PRESENCIALMENTE\n• TESTE I\. — Dra\. Larissa/);
    expect(p.texto).toMatch(/INFORMAÇÕES PENDENTES\n• TESTE I\. — conferir o fechamento/);
    expect(p.texto).toContain("Conferência de recebimentos não realizada hoje.");
    expect(p.texto).not.toMatch(/Recebimentos do dia\*\n• .*3\.000/);
  });

  it("12. compatível: não conta como contato da Gabi, pendência da Mel fora da lista dela, proposta distinta separada", async () => {
    const m = criarStoreMemoria();
    await presencial(m.store, SIM("avaliando"), { nomeNovo: "TESTE Lu", pendencia: MEL });
    await presencial(m.store, SIM("avaliando", { tipo: "Programa corporal", outra: true }), { pacienteId: pid(m), pendencia: MEL });
    expect(tarefasPlan(m)).toHaveLength(2); // propostas efetivamente distintas
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.resumo).toMatchObject({ oportunidades: 2, apresentadosPresencial: 2 });
    expect(p.indicadores).toMatchObject({ tentativas: 0, followupsProgramados: 0 });
    expect(p.contatos).toHaveLength(0);
    expect(p.fechamento.pendentesAbertas).toHaveLength(0);
    expect(p.fechamento.contadores.registros).toBe(0);
  });
});

describe("planejamento anual — relatório", () => {
  it("apresentado e fechado no mesmo dia: a lista de apresentados mostra a situação atual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); dia("2026-10-29");
    const m = criarStoreMemoria();
    await presencial(m.store, SIM("avaliando"), { nomeNovo: "TESTE Nina", pendencia: MEL });
    await whatsapp(m.store, { resposta: "sim", resultado: "fechado" }, { pacienteId: pid(m) });
    const p = await montarPrestacao(m.store, GABI.id, hoje());
    expect(p.planejamento.grupos.presencial).toEqual(["TESTE Nina — Dra. Larissa — fechado"]);
    expect(p.planejamento.resumo).toMatchObject({ apresentadosPresencial: 1, apresentadosWhatsapp: 0, oportunidades: 1, fechados: 1, followupsPendentes: 0 });
  });
});
