import { randomUUID } from "crypto";
import { hashConteudo } from "./previa";
import { planejarAnulacao, planejarMarcos } from "./marcos";
import type { ItemEntrada } from "./contrato";
import { CONFIG_VAZIA, type AtendimentoRow, type CompromissoAgenda, type ConferenciaCaixa, type EstadoDoDia, type EventoRow, type FeedbackRow, type FilaConfig, type FilaStore, type LoteEstado, type MarcoRow, type NumerosDoDia, type RotinaItemRow, type TarefaRow } from "./store";

/**
 * Store em memória: testes e modo demonstração (sem Supabase configurado). Espelha as regras
 * atômicas do banco (confirmar_atendimento_realizado / anular_atendimento) usando as mesmas
 * funções puras de marcos.ts. Nunca é usada com Supabase configurado.
 */
export const PERFIS_DEMO = [
  { id: "00000000-0000-4000-8000-000000000001", nome: "Gestão (demonstração)" },
  { id: "00000000-0000-4000-8000-000000000002", nome: "Gabi (demonstração)" },
];

export function criarStoreMemoria(configInicial: Partial<FilaConfig> = { conciergeId: PERFIS_DEMO[1]!.id, conciergeNome: "Gabi", gestorId: PERFIS_DEMO[0]!.id }) {
  const pacientes: { id: string; nome: string; telefone?: string; ids: Record<string, string> }[] = [];
  const atendimentos: AtendimentoRow[] = [];
  const marcos: Omit<MarcoRow, "temEventoVinculado">[] = [];
  const tarefas: Omit<TarefaRow, "temEventoVinculado">[] = [];
  const eventos: EventoRow[] = [];
  const lotes: { id: string; hash: string; status: LoteEstado["status"]; criadoEm: string; itens: { index?: number; chaveOrigem?: string; resultado: string; payload: unknown; resolution?: unknown; aplicado?: boolean; erro?: string | null }[] }[] = [];
  let config: FilaConfig = { ...CONFIG_VAZIA, ...configInicial };
  const leituras = new Map<string, string>();
  const feedbacks: FeedbackRow[] = [];
  const rotinas: RotinaItemRow[] = [];
  /** Demonstração/testes: agenda vazia e sem sincronização (nunca inventa compromissos). */
  const agendaDemo: { itens: CompromissoAgenda[]; ultimaSync: string | null } = { itens: [], ultimaSync: null };
  const numeros = new Map<string, NumerosDoDia>();
  const estados = new Map<string, EstadoDoDia>();
  const caixas = new Map<string, ConferenciaCaixa>();
  const auditoria: { action: string; target: string }[] = [];
  // Relógio monotônico: dois registros no mesmo milissegundo continuam ordenados (testes).
  let ultimo = 0;
  const agora = () => {
    ultimo = Math.max(Date.now(), ultimo + 1);
    return new Date(ultimo).toISOString();
  };
  /** Testes: simula queda de rede antes de gravar o item N de um lote. */
  const falhaSimulada: { antesDoItem: number | null } = { antesDoItem: null };

  const vinculado = (f: (a: EventoRow["alvos"][number]) => boolean) => eventos.some((e) => e.alvos.some(f));
  const comVinculoM = (m: Omit<MarcoRow, "temEventoVinculado">): MarcoRow => ({ ...m, temEventoVinculado: vinculado((a) => a.marcoId === m.id), dataAtendimento: atendimentos.find((a) => a.id === m.appointmentId)?.dataRealizada ?? null });
  const comVinculoT = (t: Omit<TarefaRow, "temEventoVinculado">): TarefaRow => ({ ...t, temEventoVinculado: vinculado((a) => a.tarefaId === t.id) });
  const dia = (iso: string) => iso.slice(0, 10);

  const store: FilaStore = {
    async pacientes() {
      return pacientes.map((p) => ({ id: p.id, nome: p.nome, telefone: p.telefone, ...p.ids }));
    },
    async registrosPorChave(chaves) {
      const out = [];
      for (const chave of chaves) {
        const recebido = lotes.flatMap((l) => l.itens).filter((i) => i.chaveOrigem === chave && (i.resultado === "novo" || i.resultado === "atualizacao")).pop();
        if (!recebido) continue;
        const item = (recebido.payload as { item: ItemEntrada }).item;
        const a = atendimentos.find((x) => x.chaveOrigem === chave);
        const t = tarefas.find((x) => x.chaveOrigem === chave);
        const trabalhado = a
          ? marcos.some((m) => m.appointmentId === a.id && (m.status !== "previsto" || vinculado((l) => l.marcoId === m.id)))
          : t ? t.status !== "open" || vinculado((l) => l.tarefaId === t.id) : false;
        out.push({ chave_origem: chave, conteudoHash: hashConteudo(item), trabalhado });
      }
      return out;
    },
    async atendimentosDe(ids) {
      return atendimentos.filter((a) => ids.includes(a.patientId) && !a.anulado && a.dataRealizada).map((a) => ({ pacienteId: a.patientId, data: a.dataRealizada!, chave_origem: a.chaveOrigem ?? undefined }));
    },
    async loteExiste(hash) {
      return lotes.some((l) => l.hash === hash);
    },
    async atendimentoPorChave(chave) {
      return atendimentos.find((a) => a.chaveOrigem === chave) ?? null;
    },
    async atendimento(id) {
      return atendimentos.find((a) => a.id === id) ?? null;
    },
    async atendimentosPendentes() {
      return atendimentos.filter((a) => a.dataStatus === "pendente_validacao" && !a.realizadoConfirmado && !a.anulado);
    },
    async tarefaPorChave(chave) {
      const t = tarefas.find((x) => x.chaveOrigem === chave);
      return t ? comVinculoT(t) : null;
    },
    async tarefasAbertasDoPaciente(patientId) {
      return tarefas.filter((x) => x.patientId === patientId && (x.status === "open" || x.status === "waiting")).map(comVinculoT);
    },
    async marcosAtivos(desde) {
      return marcos.filter((m) => ["previsto", "contatado"].includes(m.status) || (m.status !== "invalidado" && dia(m.updatedAt) >= desde)).map(comVinculoM);
    },
    async marco(id) {
      const m = marcos.find((x) => x.id === id);
      return m ? comVinculoM(m) : null;
    },
    async tarefasAtivas(desde) {
      return tarefas.filter((t) => !["completed", "cancelled"].includes(t.status) || dia(t.updatedAt) >= desde).map(comVinculoT);
    },
    async tarefa(id) {
      const t = tarefas.find((x) => x.id === id);
      return t ? comVinculoT(t) : null;
    },
    async nomesPacientes(ids) {
      return Object.fromEntries(pacientes.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.nome]));
    },
    async eventoExiste(id) {
      return eventos.some((e) => e.id === id);
    },
    async eventosDoAlvo(alvo) {
      return eventos.filter((e) => e.alvos.some((a) => (alvo.marcoId && a.marcoId === alvo.marcoId) || (alvo.tarefaId && a.tarefaId === alvo.tarefaId)));
    },
    async resolverRef(tipo, prefixo) {
      const p = prefixo.toLowerCase();
      return (tipo === "tarefa" ? tarefas : marcos).filter((r) => r.id.toLowerCase().startsWith(p)).map((r) => r.id);
    },
    async perfis() {
      return PERFIS_DEMO;
    },
    async eventosDoDia(d) {
      return eventos.filter((e) => e.occurredOn === d);
    },
    async eventosRecentesDoPaciente(patientId, desde) {
      return eventos.filter((e) => e.patientId === patientId && e.occurredOn >= desde).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
    },
    async conferenciaCaixa(d) {
      return caixas.get(d) ?? null;
    },
    async numerosDoDia(d) {
      return numeros.get(d) ?? null;
    },
    async estadoDoDia(d) {
      return estados.get(d) ?? { prioridades: [], secoes: {} };
    },
    async config() {
      return { ...config };
    },
    async leituras(userId, ids) {
      return Object.fromEntries(ids.filter((id) => leituras.has(`${id}|${userId}`)).map((id) => [id, leituras.get(`${id}|${userId}`)!]));
    },
    async ultimosEventos(ids) {
      const out: Record<string, { em: string; por: string }> = {};
      for (const e of eventos) {
        for (const a of e.alvos) {
          if (!a.tarefaId || !ids.includes(a.tarefaId)) continue;
          const em = e.registradoEm ?? agora();
          if (!out[a.tarefaId] || out[a.tarefaId]!.em <= em) out[a.tarefaId] = { em, por: e.createdBy };
        }
      }
      return out;
    },
    async feedbacks(f) {
      return feedbacks
        .filter((x) => (!f.dia || x.dia === f.dia) && (!f.responsavel || x.responsavel === f.responsavel) && (!f.desde || x.dia >= f.desde))
        .map((x) => ({ ...x }))
        .sort((a, b) => b.dia.localeCompare(a.dia) || b.versao - a.versao);
    },
    async feedback(id) {
      const x = feedbacks.find((y) => y.id === id);
      return x ? { ...x } : null;
    },
    async rotina(userId, d) {
      return rotinas.filter((r) => r.userId === userId && r.dia === d).map((r) => ({ ...r }));
    },
    async rotinaAnterior(userId, d) {
      const dias = [...new Set(rotinas.filter((r) => r.userId === userId && r.dia < d).map((r) => r.dia))].sort();
      const ultimo = dias.pop();
      return ultimo ? { dia: ultimo, linhas: rotinas.filter((r) => r.userId === userId && r.dia === ultimo).map((r) => ({ ...r })) } : null;
    },
    async agenda(de, ate) {
      return { itens: agendaDemo.itens.filter((i) => i.inicio.slice(0, 10) >= de && i.inicio.slice(0, 10) <= ate), ultimaSync: agendaDemo.ultimaSync };
    },
    async loteDoHash(hash) {
      const l = lotes.find((x) => x.hash === hash);
      if (!l) return null;
      return { id: l.id, status: l.status, criadoEm: l.criadoEm, itens: l.itens.filter((i) => i.index !== undefined).map((i) => ({ index: i.index!, resultado: i.resultado, aplicado: !!i.aplicado, resolution: i.resolution ?? null, erro: i.erro ?? null })) };
    },

    async criarLote(l) {
      const id = randomUUID();
      lotes.push({ id, hash: l.hash, status: "confirmado", criadoEm: agora(), itens: l.itens.map((i) => ({ ...i, aplicado: !!i.resolution && (i.resolution as { acao?: string }).acao !== "ignorar" })) });
      return id;
    },
    async abrirLote(l) {
      const ex = lotes.find((x) => x.hash === l.hash);
      if (ex) return ex.id;
      const id = randomUUID();
      lotes.push({ id, hash: l.hash, status: "em_andamento", criadoEm: agora(), itens: [] });
      return id;
    },
    async registrarItemLote(loteId, i) {
      const l = lotes.find((x) => x.id === loteId)!;
      if (falhaSimulada.antesDoItem === i.index) {
        falhaSimulada.antesDoItem = null;
        throw new Error("falha simulada de rede");
      }
      const idx = l.itens.findIndex((x) => x.index === i.index);
      if (idx >= 0) l.itens[idx] = { ...i };
      else l.itens.push({ ...i });
    },
    async concluirLote(loteId) {
      lotes.find((x) => x.id === loteId)!.status = "confirmado";
    },
    async criarPaciente(ref) {
      const id = randomUUID();
      const ids: Record<string, string> = {};
      for (const k of ["sd_codigo", "sd_numero", "sd_ficha_id"] as const) if (ref[k]) ids[k] = ref[k]!;
      pacientes.push({ id, nome: ref.nome ?? `Paciente SD ${ref.sd_codigo ?? ref.sd_numero ?? ref.sd_ficha_id}`, telefone: ref.telefone, ids });
      return id;
    },
    async criarAtendimento(a) {
      const id = randomUUID();
      atendimentos.push({ id, patientId: a.patientId, chaveOrigem: a.chaveOrigem, dataRealizada: a.data, dataStatus: a.dataStatus, realizadoConfirmado: false, anulado: false, createdAt: agora() });
      return id;
    },
    async atualizarDataAtendimento(id, data) {
      const a = atendimentos.find((x) => x.id === id);
      if (a) a.dataRealizada = data;
    },
    async confirmarAtendimento(id, data) {
      const a = atendimentos.find((x) => x.id === id);
      if (!a) throw new Error("atendimento inexistente");
      if (a.anulado) throw new Error("atendimento anulado não pode ser confirmado");
      Object.assign(a, { dataRealizada: data, dataStatus: "exata", realizadoConfirmado: true });
      const existentes = marcos.filter((m) => m.appointmentId === id).map(comVinculoM);
      for (const acao of planejarMarcos(data, existentes)) {
        if (acao.acao === "inserir") {
          marcos.push({ id: randomUUID(), appointmentId: id, patientId: a.patientId, kind: acao.kind, dueOriginal: acao.due, dueCurrent: acao.due, status: "previsto", statusReason: null, updatedAt: agora() });
        } else if (acao.acao === "recalcular") {
          const m = marcos.find((x) => x.appointmentId === id && x.kind === acao.kind)!;
          Object.assign(m, { dueOriginal: acao.due, dueCurrent: acao.due, updatedAt: agora() });
        }
      }
    },
    async anularAtendimento(id, motivo) {
      const a = atendimentos.find((x) => x.id === id);
      if (!a || a.anulado) throw new Error("atendimento inexistente ou já anulado");
      a.anulado = true;
      const doAtend = marcos.filter((m) => m.appointmentId === id);
      planejarAnulacao(doAtend.map(comVinculoM)).forEach((acao, i) => {
        if (acao.acao === "invalidar") Object.assign(doAtend[i]!, { status: "invalidado", statusReason: motivo, updatedAt: agora() });
      });
    },
    async criarTarefa(t) {
      const id = randomUUID();
      tarefas.push({
        id, patientId: t.patientId, assunto: t.assunto ?? null, kind: t.kind, title: t.title, chaveOrigem: t.chaveOrigem, status: "open", due: t.due, aConferir: t.aConferir,
        payload: t.payload, financialImpact: t.financialImpact, closedReason: null, updatedAt: agora(),
        assignedTo: t.assignedTo ?? null, nextAction: t.nextAction ?? null, origem: t.origem, origemData: t.origemData,
        prioridade: t.prioridade ?? null, aguardando: t.aguardando ?? null, adiamentos: 0, prazoOriginal: null, criadoEm: agora(),
      });
      if (t.status) tarefas[tarefas.length - 1]!.status = t.status;
      return id;
    },
    async atualizarTarefaEntrada(id, t) {
      const x = tarefas.find((y) => y.id === id);
      if (x) Object.assign(x, t, { updatedAt: agora() });
    },
    async registrarEvento(e) {
      // Espelha a restrição interaction_events_alvo_check do banco (paciente ou assunto).
      if (!e.patientId && !e.assunto?.trim()) throw new Error('registrarEvento: new row for relation "interaction_events" violates check constraint "interaction_events_alvo_check"');
      if (!eventos.some((x) => x.id === e.id)) eventos.push({ ...e, registradoEm: e.registradoEm ?? agora() });
    },
    async atualizarMarco(id, m) {
      const x = marcos.find((y) => y.id === id);
      if (x) Object.assign(x, Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)), { updatedAt: agora() });
    },
    async atualizarTarefa(id, t) {
      const x = tarefas.find((y) => y.id === id);
      if (!x) return;
      const { waiting: _w, ...resto } = t;
      Object.assign(x, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)), { updatedAt: agora() });
    },
    async salvarNumeros(d, n) {
      numeros.set(d, n);
    },
    async salvarEstadoDoDia(d, e) {
      const atual = estados.get(d) ?? { prioridades: [], secoes: {} };
      estados.set(d, { ...atual, ...e });
    },
    async salvarConfig(c) {
      config = { ...config, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) };
    },
    async sincronizarAgenda(itens) {
      // Demonstração: espelha o resultado em memória (sem banco), para testar o botão.
      let created = 0, updated = 0;
      for (const n of itens) {
        const i = agendaDemo.itens.findIndex((x) => x.id === n.sdAppointmentId);
        const c: CompromissoAgenda = { id: n.sdAppointmentId ?? randomUUID(), inicio: n.startsAt, fim: n.endsAt, status: n.status as CompromissoAgenda["status"], paciente: n.patient.fullName, profissional: null, motivo: n.reason, revisar: !n.sdAppointmentId, sincronizadoEm: agora() };
        if (i >= 0) { agendaDemo.itens[i] = c; updated++; } else { agendaDemo.itens.push(c); created++; }
      }
      agendaDemo.ultimaSync = agora();
      return { total: itens.length, created, updated, unchanged: 0, requiresReview: 0 };
    },
    async salvarConferenciaCaixa(c) {
      caixas.set(c.dia, { ...c });
    },
    async salvarItemRotina(r) {
      const i = rotinas.findIndex((x) => x.userId === r.userId && x.dia === r.dia && x.itemKey === r.itemKey);
      if (i >= 0) rotinas[i] = { ...r };
      else rotinas.push({ ...r });
    },
    async marcarLido(tarefaId, userId) {
      leituras.set(`${tarefaId}|${userId}`, agora());
    },
    async inserirFeedback(f) {
      if (feedbacks.some((x) => x.id === f.id)) return;
      if (feedbacks.some((x) => x.dia === f.dia && x.responsavel === f.responsavel && x.versao === f.versao)) throw new Error("versão já existe");
      feedbacks.push({ ...f });
    },
    async atualizarFeedback(id, f) {
      const x = feedbacks.find((y) => y.id === id);
      if (x) Object.assign(x, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)));
    },
    async auditar(a) {
      auditoria.push({ action: a.action, target: a.target });
    },
  };

  return { store, _dados: { pacientes, atendimentos, marcos, tarefas, eventos, lotes, auditoria, feedbacks, rotinas, agendaDemo, caixas, estados }, falhaSimulada };
}

// Modo demonstração: uma instância por processo do servidor de desenvolvimento.
const globalDemo = globalThis as unknown as { __filaDemo?: ReturnType<typeof criarStoreMemoria> };
export function storeDemo() {
  globalDemo.__filaDemo ??= criarStoreMemoria();
  return globalDemo.__filaDemo;
}
