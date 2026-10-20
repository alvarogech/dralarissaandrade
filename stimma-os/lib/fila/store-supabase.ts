import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemEntrada } from "./contrato";
import { hashConteudo, type RegistroExistente } from "./previa";
import type { AtendimentoRow, EventoRow, FilaStore, MarcoRow, TarefaRow } from "./store";

/**
 * Store real. Recebe o cliente service role (só em Route Handlers / Server Components) e a
 * organização do usuário autenticado — todo select e insert é filtrado por ela, porque o
 * service role ignora RLS. Ver docs/SECURITY.md.
 */
const IDS_SD = ["sd_codigo", "sd_numero", "sd_ficha_id"] as const;

function falhou(error: { message: string } | null, onde: string) {
  if (error) throw new Error(`${onde}: ${error.message}`);
}

const meioDia = (d: string) => `${d}T12:00:00-03:00`;

type Rec = Record<string, any>;

function atendRow(a: Rec): AtendimentoRow {
  return {
    id: a.id, patientId: a.patient_id, chaveOrigem: a.chave_origem, dataRealizada: a.data_realizada,
    dataStatus: a.data_status, realizadoConfirmado: !!a.realizado_confirmado_em, anulado: !!a.anulado_em, createdAt: a.created_at,
  };
}
function marcoRow(m: Rec): MarcoRow {
  return {
    id: m.id, appointmentId: m.appointment_id, patientId: m.patient_id, kind: m.kind, dueOriginal: m.due_original, dueCurrent: m.due_current,
    status: m.status, statusReason: m.status_reason, updatedAt: m.updated_at, temEventoVinculado: (m.event_links ?? []).length > 0,
  };
}
function tarefaRow(t: Rec): TarefaRow {
  return {
    id: t.id, patientId: t.patient_id, kind: t.kind, title: t.title, chaveOrigem: t.chave_origem, status: t.status,
    due: t.next_action_due ?? String(t.due_at ?? t.created_at).slice(0, 10), aConferir: t.a_conferir ?? [], payload: t.payload ?? {},
    financialImpact: t.financial_impact === null ? null : Number(t.financial_impact), closedReason: t.closed_reason, updatedAt: t.updated_at ?? t.created_at,
    temEventoVinculado: (t.event_links ?? []).length > 0,
  };
}

const COLS_ATEND = "id, patient_id, chave_origem, data_realizada, data_status, realizado_confirmado_em, anulado_em, created_at";
const COLS_MARCO = "id, appointment_id, patient_id, kind, due_original, due_current, status, status_reason, updated_at, event_links(event_id)";
const COLS_TAREFA = "id, patient_id, kind, title, chave_origem, status, next_action_due, due_at, a_conferir, payload, financial_impact, closed_reason, updated_at, created_at, event_links(event_id)";

export function criarStoreSupabase(db: SupabaseClient, org: string): FilaStore {
  const store: FilaStore = {
    async pacientes() {
      const { data, error } = await db.from("patients").select("id, full_name, phone, patient_external_ids(source, external_id)").eq("organization_id", org);
      falhou(error, "pacientes");
      return (data ?? []).map((p: Rec) => {
        const out: Rec = { id: p.id, nome: p.full_name, telefone: p.phone ?? undefined };
        for (const e of p.patient_external_ids ?? []) if ((IDS_SD as readonly string[]).includes(e.source)) out[e.source] = e.external_id;
        return out as Awaited<ReturnType<FilaStore["pacientes"]>>[number];
      });
    },
    async registrosPorChave(chaves) {
      if (!chaves.length) return [];
      const { data, error } = await db
        .from("import_items")
        .select("chave_origem, payload, import_batches!inner(organization_id, created_at)")
        .in("chave_origem", chaves)
        .in("resultado", ["novo", "atualizacao"])
        .eq("import_batches.organization_id", org);
      falhou(error, "registrosPorChave");
      const ultimo = new Map<string, Rec>();
      for (const r of (data ?? []) as Rec[]) {
        const prev = ultimo.get(r.chave_origem);
        const quando = (x: Rec) => (Array.isArray(x.import_batches) ? x.import_batches[0] : x.import_batches)?.created_at ?? "";
        if (!prev || quando(r) > quando(prev)) ultimo.set(r.chave_origem, r);
      }
      const out: RegistroExistente[] = [];
      for (const [chave, r] of ultimo) {
        const item = (r.payload as { item: ItemEntrada }).item;
        if (!item) continue;
        let trabalhado = false;
        const a = await store.atendimentoPorChave(chave);
        if (a) {
          const { data: ms } = await db.from("follow_up_milestones").select("status, event_links(event_id)").eq("appointment_id", a.id);
          trabalhado = (ms ?? []).some((m: Rec) => m.status !== "previsto" || (m.event_links ?? []).length > 0);
        } else {
          const t = await store.tarefaPorChave(chave);
          trabalhado = !!t && (t.status !== "open" || t.temEventoVinculado);
        }
        out.push({ chave_origem: chave, conteudoHash: hashConteudo(item), trabalhado });
      }
      return out;
    },
    async atendimentosDe(ids) {
      const set = new Set(ids);
      const { data, error } = await db.from("appointments").select("patient_id, data_realizada, chave_origem").eq("organization_id", org).not("data_realizada", "is", null).is("anulado_em", null);
      falhou(error, "atendimentosDe");
      return (data ?? []).filter((a: Rec) => set.has(a.patient_id)).map((a: Rec) => ({ pacienteId: a.patient_id, data: a.data_realizada, chave_origem: a.chave_origem ?? undefined }));
    },
    async loteExiste(hash) {
      const { data } = await db.from("import_batches").select("id").eq("organization_id", org).eq("payload_hash", hash).maybeSingle();
      return !!data;
    },
    async atendimentoPorChave(chave) {
      const { data } = await db.from("appointments").select(COLS_ATEND).eq("organization_id", org).eq("chave_origem", chave).maybeSingle();
      return data ? atendRow(data) : null;
    },
    async atendimento(id) {
      const { data } = await db.from("appointments").select(COLS_ATEND).eq("organization_id", org).eq("id", id).maybeSingle();
      return data ? atendRow(data) : null;
    },
    async atendimentosPendentes() {
      const { data, error } = await db.from("appointments").select(COLS_ATEND).eq("organization_id", org).eq("data_status", "pendente_validacao").is("realizado_confirmado_em", null).is("anulado_em", null);
      falhou(error, "atendimentosPendentes");
      return (data ?? []).map(atendRow);
    },
    async tarefaPorChave(chave) {
      const { data } = await db.from("tasks").select(COLS_TAREFA).eq("organization_id", org).eq("chave_origem", chave).maybeSingle();
      return data ? tarefaRow(data) : null;
    },
    async marcosAtivos(desde) {
      const { data, error } = await db.from("follow_up_milestones").select(COLS_MARCO).eq("organization_id", org)
        .or(`status.in.(previsto,contatado),and(status.in.(contemplado,dispensado),updated_at.gte.${desde})`);
      falhou(error, "marcosAtivos");
      return (data ?? []).map(marcoRow);
    },
    async marco(id) {
      const { data } = await db.from("follow_up_milestones").select(COLS_MARCO).eq("organization_id", org).eq("id", id).maybeSingle();
      return data ? marcoRow(data) : null;
    },
    async tarefasAtivas(desde) {
      const { data, error } = await db.from("tasks").select(COLS_TAREFA).eq("organization_id", org).not("kind", "is", null)
        .or(`status.in.(open,in_progress,waiting),and(status.in.(completed,cancelled),updated_at.gte.${desde})`);
      falhou(error, "tarefasAtivas");
      return (data ?? []).map(tarefaRow);
    },
    async tarefa(id) {
      const { data } = await db.from("tasks").select(COLS_TAREFA).eq("organization_id", org).eq("id", id).maybeSingle();
      return data ? tarefaRow(data) : null;
    },
    async nomesPacientes(ids) {
      if (!ids.length) return {};
      const { data, error } = await db.from("patients").select("id, full_name").eq("organization_id", org).in("id", ids);
      falhou(error, "nomesPacientes");
      return Object.fromEntries((data ?? []).map((p: Rec) => [p.id, p.full_name]));
    },
    async eventoExiste(id) {
      const { data } = await db.from("interaction_events").select("id").eq("id", id).maybeSingle();
      return !!data;
    },
    async eventosDoDia(dia) {
      const { data, error } = await db.from("interaction_events")
        .select("id, patient_id, kind, occurred_on, channel, notes, amount, amount_origin, scheduled_for, created_by, event_links(milestone_id, task_id)")
        .eq("organization_id", org).eq("occurred_on", dia);
      falhou(error, "eventosDoDia");
      return (data ?? []).map((e: Rec): EventoRow => ({
        id: e.id, patientId: e.patient_id, kind: e.kind, occurredOn: e.occurred_on, channel: e.channel, notes: e.notes,
        amount: e.amount === null ? null : Number(e.amount), amountOrigin: e.amount_origin, scheduledFor: e.scheduled_for, createdBy: e.created_by,
        alvos: (e.event_links ?? []).map((l: Rec) => (l.milestone_id ? { marcoId: l.milestone_id } : { tarefaId: l.task_id })),
      }));
    },
    async numerosDoDia(dia) {
      const { data } = await db.from("daily_manual_figures").select("*").eq("organization_id", org).eq("day", dia).maybeSingle();
      if (!data) return null;
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return { agendaPrevista: n(data.agenda_prevista), agendaRealizada: n(data.agenda_realizada), caixaPrevisto: n(data.caixa_previsto), caixaRecebido: n(data.caixa_recebido), caixaSituacao: data.caixa_situacao };
    },

    async criarLote(l) {
      const { data, error } = await db.from("import_batches")
        .insert({ organization_id: org, created_by: l.criadoPor, payload_hash: l.hash, origem: l.origem, consultado_em: l.consultadoEm, status: "confirmado" })
        .select("id").single();
      falhou(error, "criarLote");
      const { error: e2 } = await db.from("import_items").insert(l.itens.map((i) => ({
        batch_id: data!.id, row_index: i.index, tipo: i.tipo, chave_origem: i.chaveOrigem ?? null, resultado: i.resultado, payload: i.payload, resolution: i.resolution ?? null,
      })));
      falhou(e2, "criarLote/itens");
      return data!.id as string;
    },
    async criarPaciente(ref) {
      const nome = ref.nome ?? `Paciente SD ${ref.sd_codigo ?? ref.sd_numero ?? ref.sd_ficha_id}`;
      const { data, error } = await db.from("patients").insert({ organization_id: org, full_name: nome, phone: ref.telefone ?? null }).select("id").single();
      falhou(error, "criarPaciente");
      const ext = IDS_SD.filter((k) => ref[k]).map((k) => ({ patient_id: data!.id, source: k, external_id: ref[k]!, last_seen_at: new Date().toISOString() }));
      if (ext.length) falhou((await db.from("patient_external_ids").insert(ext)).error, "criarPaciente/ids");
      return data!.id as string;
    },
    async criarAtendimento(a) {
      const { data, error } = await db.from("appointments").insert({
        organization_id: org, patient_id: a.patientId, starts_at: meioDia(a.data), ends_at: meioDia(a.data), source: "fila_entrada",
        chave_origem: a.chaveOrigem, data_realizada: a.data, data_status: a.dataStatus, origem_consultada_em: a.consultadoEm,
      }).select("id").single();
      falhou(error, "criarAtendimento");
      return data!.id as string;
    },
    async atualizarDataAtendimento(id, data) {
      falhou((await db.from("appointments").update({ data_realizada: data }).eq("organization_id", org).eq("id", id)).error, "atualizarDataAtendimento");
    },
    async confirmarAtendimento(id, data, ator) {
      falhou((await db.rpc("confirmar_atendimento_realizado", { p_appointment_id: id, p_data: data, p_actor: ator })).error, "confirmarAtendimento");
    },
    async anularAtendimento(id, motivo, ator) {
      falhou((await db.rpc("anular_atendimento", { p_appointment_id: id, p_motivo: motivo, p_actor: ator })).error, "anularAtendimento");
    },
    async criarTarefa(t) {
      const { data, error } = await db.from("tasks").insert({
        organization_id: org, patient_id: t.patientId, title: t.title, source: "fila_entrada", kind: t.kind, chave_origem: t.chaveOrigem,
        origem: t.origem, origem_data: t.origemData, a_conferir: t.aConferir, payload: t.payload, financial_impact: t.financialImpact,
        next_action_due: t.due, due_at: meioDia(t.due), updated_at: new Date().toISOString(),
      }).select("id").single();
      falhou(error, "criarTarefa");
      return data!.id as string;
    },
    async atualizarTarefaEntrada(id, t) {
      falhou((await db.from("tasks").update({ title: t.title, a_conferir: t.aConferir, payload: t.payload, financial_impact: t.financialImpact, updated_at: new Date().toISOString() }).eq("organization_id", org).eq("id", id)).error, "atualizarTarefaEntrada");
    },
    async registrarEvento(e) {
      const { error } = await db.from("interaction_events").upsert({
        id: e.id, organization_id: org, patient_id: e.patientId, kind: e.kind, occurred_on: e.occurredOn, channel: e.channel, notes: e.notes,
        amount: e.amount, amount_origin: e.amountOrigin, scheduled_for: e.scheduledFor, created_by: e.createdBy,
      }, { onConflict: "id", ignoreDuplicates: true });
      falhou(error, "registrarEvento");
      if (e.alvos.length) {
        falhou((await db.from("event_links").insert(e.alvos.map((a) => ({ event_id: e.id, milestone_id: a.marcoId ?? null, task_id: a.tarefaId ?? null })))).error, "registrarEvento/vinculos");
      }
    },
    async atualizarMarco(id, m) {
      const patch: Rec = { updated_at: new Date().toISOString() };
      if (m.status !== undefined) patch.status = m.status;
      if (m.statusReason !== undefined) patch.status_reason = m.statusReason;
      if (m.dueCurrent !== undefined) patch.due_current = m.dueCurrent;
      falhou((await db.from("follow_up_milestones").update(patch).eq("organization_id", org).eq("id", id)).error, "atualizarMarco");
    },
    async atualizarTarefa(id, t) {
      const patch: Rec = { updated_at: new Date().toISOString() };
      if (t.status !== undefined) patch.status = t.status;
      if (t.due !== undefined) {
        patch.next_action_due = t.due;
        patch.due_at = meioDia(t.due);
      }
      if (t.closedReason !== undefined) patch.closed_reason = t.closedReason;
      patch.waiting_since = t.waiting ? new Date().toISOString() : null;
      falhou((await db.from("tasks").update(patch).eq("organization_id", org).eq("id", id)).error, "atualizarTarefa");
    },
    async salvarNumeros(dia, n, ator) {
      falhou((await db.from("daily_manual_figures").upsert({
        organization_id: org, day: dia, agenda_prevista: n.agendaPrevista, agenda_realizada: n.agendaRealizada, caixa_previsto: n.caixaPrevisto,
        caixa_recebido: n.caixaRecebido, caixa_situacao: n.caixaSituacao, updated_by: ator, updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,day" })).error, "salvarNumeros");
    },
    async auditar(a) {
      await db.from("audit_logs").insert({
        organization_id: org, actor: a.actor, actor_type: "human", action: a.action, target: a.target,
        before: a.before ?? null, after: a.after ?? null, source: "fila_concierge", reason: a.reason ?? null, status: "completed",
      });
    },
  };
  return store;
}
