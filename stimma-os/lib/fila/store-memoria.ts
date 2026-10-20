import { randomUUID } from "crypto";
import { hashConteudo } from "./previa";
import { planejarAnulacao, planejarMarcos } from "./marcos";
import type { ItemEntrada } from "./contrato";
import type { AtendimentoRow, EventoRow, FilaStore, MarcoRow, NumerosDoDia, TarefaRow } from "./store";

/**
 * Store em memória: testes e modo demonstração (sem Supabase configurado). Espelha as regras
 * atômicas do banco (confirmar_atendimento_realizado / anular_atendimento) usando as mesmas
 * funções puras de marcos.ts. Nunca é usada com Supabase configurado.
 */
export function criarStoreMemoria() {
  const pacientes: { id: string; nome: string; telefone?: string; ids: Record<string, string> }[] = [];
  const atendimentos: AtendimentoRow[] = [];
  const marcos: Omit<MarcoRow, "temEventoVinculado">[] = [];
  const tarefas: Omit<TarefaRow, "temEventoVinculado">[] = [];
  const eventos: EventoRow[] = [];
  const lotes: { id: string; hash: string; itens: { chaveOrigem?: string; resultado: string; payload: unknown }[] }[] = [];
  const numeros = new Map<string, NumerosDoDia>();
  const auditoria: { action: string; target: string }[] = [];
  const agora = () => new Date().toISOString();

  const vinculado = (f: (a: EventoRow["alvos"][number]) => boolean) => eventos.some((e) => e.alvos.some(f));
  const comVinculoM = (m: Omit<MarcoRow, "temEventoVinculado">): MarcoRow => ({ ...m, temEventoVinculado: vinculado((a) => a.marcoId === m.id) });
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
    async eventosDoDia(d) {
      return eventos.filter((e) => e.occurredOn === d);
    },
    async numerosDoDia(d) {
      return numeros.get(d) ?? null;
    },

    async criarLote(l) {
      const id = randomUUID();
      lotes.push({ id, hash: l.hash, itens: l.itens });
      return id;
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
      tarefas.push({ id, patientId: t.patientId, kind: t.kind, title: t.title, chaveOrigem: t.chaveOrigem, status: "open", due: t.due, aConferir: t.aConferir, payload: t.payload, financialImpact: t.financialImpact, closedReason: null, updatedAt: agora() });
      return id;
    },
    async atualizarTarefaEntrada(id, t) {
      const x = tarefas.find((y) => y.id === id);
      if (x) Object.assign(x, t, { updatedAt: agora() });
    },
    async registrarEvento(e) {
      if (!eventos.some((x) => x.id === e.id)) eventos.push(e);
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
    async auditar(a) {
      auditoria.push({ action: a.action, target: a.target });
    },
  };

  return { store, _dados: { pacientes, atendimentos, marcos, tarefas, eventos, lotes, auditoria } };
}

// Modo demonstração: uma instância por processo do servidor de desenvolvimento.
const globalDemo = globalThis as unknown as { __filaDemo?: ReturnType<typeof criarStoreMemoria> };
export function storeDemo() {
  globalDemo.__filaDemo ??= criarStoreMemoria();
  return globalDemo.__filaDemo;
}
