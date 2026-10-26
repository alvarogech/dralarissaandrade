import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemEntrada } from "./contrato";
import { hashConteudo, type RegistroExistente } from "./previa";
import { itemDaRotina } from "./rotina-itens";
import { CONFIG_VAZIA, type AtendimentoRow, type CompromissoAgenda, type EventoRow, type FeedbackRow, type FilaConfig, type FilaStore, type MarcoRow, type RotinaItemRow, type TarefaRow } from "./store";

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
    dataAtendimento: (Array.isArray(m.appointments) ? m.appointments[0] : m.appointments)?.data_realizada ?? null,
  };
}
function tarefaRow(t: Rec): TarefaRow {
  return {
    id: t.id, patientId: t.patient_id ?? null, assunto: t.assunto ?? null, kind: t.kind, title: t.title, chaveOrigem: t.chave_origem, status: t.status,
    due: t.next_action_due ?? String(t.due_at ?? t.created_at).slice(0, 10), aConferir: t.a_conferir ?? [], payload: t.payload ?? {},
    financialImpact: t.financial_impact === null ? null : Number(t.financial_impact), closedReason: t.closed_reason, updatedAt: t.updated_at ?? t.created_at,
    temEventoVinculado: (t.event_links ?? []).length > 0,
    assignedTo: t.assigned_to ?? null, nextAction: t.next_action ?? null, origem: t.origem ?? null, origemData: t.origem_data ?? null,
    aguardando: t.aguardando ?? null, prioridade: t.prioridade ?? null, prazoOriginal: t.prazo_original ?? null, adiamentos: t.adiamentos ?? 0, criadoEm: t.created_at,
  };
}

function rotinaRow(r: Rec): RotinaItemRow {
  return {
    userId: r.user_id, dia: r.day, itemKey: r.item_key, estado: r.estado, motivo: r.motivo ?? null, proximaAcao: r.proxima_acao ?? null,
    prazo: r.prazo ?? null, responsavel: r.responsavel ?? null, tarefaId: r.task_id ?? null,
    // Antes da 0016 a coluna não existe: lê como "sem quantidades".
    metricas: r.metricas && typeof r.metricas === "object" && !Array.isArray(r.metricas) ? r.metricas : {},
    updatedBy: r.updated_by, updatedAt: r.updated_at,
  };
}

/** Origem dos compromissos sincronizados da agenda (lib/sync/resolve-patient.ts). */
const ORIGEM_AGENDA = "simples_dental_browser";

function feedbackRow(f: Rec): FeedbackRow {
  return {
    id: f.id, dia: f.day, responsavel: f.responsavel, versao: f.versao, status: f.status, texto: f.texto, contadores: f.contadores ?? {}, eventos: f.eventos ?? [],
    substitui: f.substitui ?? null, geradoEm: f.gerado_em, entregueEm: f.entregue_em ?? null, copiadoEm: f.copiado_em ?? null,
    whatsappConfirmadoEm: f.whatsapp_confirmado_em ?? null, observacaoGestao: f.observacao_gestao ?? null,
    ajusteSolicitadoEm: f.ajuste_solicitado_em ?? null, ajusteSolicitadoPor: f.ajuste_solicitado_por ?? null,
  };
}

const COLUNA_FEEDBACK: Record<string, string> = {
  status: "status", texto: "texto", contadores: "contadores", eventos: "eventos", geradoEm: "gerado_em", entregueEm: "entregue_em", copiadoEm: "copiado_em",
  whatsappConfirmadoEm: "whatsapp_confirmado_em", observacaoGestao: "observacao_gestao", ajusteSolicitadoEm: "ajuste_solicitado_em", ajusteSolicitadoPor: "ajuste_solicitado_por",
};

const COLS_ATEND = "id, patient_id, chave_origem, data_realizada, data_status, realizado_confirmado_em, anulado_em, created_at";
const COLS_MARCO = "id, appointment_id, patient_id, kind, due_original, due_current, status, status_reason, updated_at, event_links(event_id), appointments(data_realizada)";
const COLS_TAREFA = "id, patient_id, assunto, kind, title, chave_origem, status, next_action_due, due_at, a_conferir, payload, financial_impact, closed_reason, updated_at, created_at, assigned_to, next_action, origem, origem_data, aguardando, prioridade, prazo_original, adiamentos, event_links(event_id)";
const COLS_EVENTO = "id, patient_id, kind, occurred_on, channel, notes, amount, amount_origin, scheduled_for, created_by, recorded_at, categoria, contato, resposta, resultado, situacao, assunto, payload, event_links(milestone_id, task_id)";

function eventoRow(e: Rec): EventoRow {
  return {
    id: e.id, patientId: e.patient_id ?? null, kind: e.kind, occurredOn: e.occurred_on, channel: e.channel, notes: e.notes,
    amount: e.amount === null ? null : Number(e.amount), amountOrigin: e.amount_origin, scheduledFor: e.scheduled_for, createdBy: e.created_by, registradoEm: e.recorded_at,
    categoria: e.categoria ?? null, contato: e.contato ?? null, resposta: e.resposta ?? null, resultado: e.resultado ?? null,
    situacao: e.situacao ?? null, assunto: e.assunto ?? null, payload: e.payload ?? {},
    alvos: (e.event_links ?? []).map((l: Rec) => (l.milestone_id ? { marcoId: l.milestone_id } : { tarefaId: l.task_id })),
  };
}

/** Faixa de UUIDs que começam com o prefixo (até 8 hex) — para resolver a referência curta do feedback. */
function faixaUuid(prefixo: string): [string, string] | null {
  if (!/^[0-9a-f]{4,8}$/i.test(prefixo)) return null;
  const p = prefixo.toLowerCase();
  return [`${p.padEnd(8, "0")}-0000-0000-0000-000000000000`, `${p.padEnd(8, "f")}-ffff-ffff-ffff-ffffffffffff`];
}

export function criarStoreSupabase(db: SupabaseClient, org: string): FilaStore {
  // Configuração lida uma vez por requisição (perfis, fila e feedback consultam a mesma linha).
  let configCache: Promise<FilaConfig> | null = null;
  async function lerConfig(): Promise<FilaConfig> {
    const { data, error } = await db.from("fila_config").select("*").eq("organization_id", org).maybeSingle();
    falhou(error, "config");
    if (!data) return { ...CONFIG_VAZIA };
    return {
      conciergeId: data.concierge_id ?? null, conciergeNome: data.concierge_nome ?? null, gestorId: data.gestor_id ?? null,
      diasExpediente: data.dias_expediente ?? null, horarioFechamento: data.horario_fechamento ? String(data.horario_fechamento).slice(0, 5) : null,
      excecoes: data.excecoes ?? [], diasSemAtualizacao: data.dias_sem_atualizacao ?? 3,
      linksRotina: data.links_rotina && typeof data.links_rotina === "object" && !Array.isArray(data.links_rotina) ? data.links_rotina : {},
    };
  }
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
      const { data, error } = await db.from("interaction_events").select(COLS_EVENTO).eq("organization_id", org).eq("occurred_on", dia).order("recorded_at");
      falhou(error, "eventosDoDia");
      return (data ?? []).map(eventoRow);
    },
    async eventosDoAlvo(alvo) {
      const col = alvo.marcoId ? "milestone_id" : "task_id";
      const { data: links, error } = await db.from("event_links").select("event_id").eq(col, alvo.marcoId ?? alvo.tarefaId!);
      falhou(error, "eventosDoAlvo/links");
      const ids = (links ?? []).map((l: Rec) => l.event_id);
      if (!ids.length) return [];
      const { data, error: e2 } = await db.from("interaction_events").select(COLS_EVENTO).eq("organization_id", org).in("id", ids).order("recorded_at");
      falhou(e2, "eventosDoAlvo");
      return (data ?? []).map(eventoRow);
    },
    async resolverRef(tipo, prefixo) {
      const faixa = faixaUuid(prefixo);
      if (!faixa) return [];
      const { data, error } = await db.from(tipo === "tarefa" ? "tasks" : "follow_up_milestones").select("id").eq("organization_id", org).gte("id", faixa[0]).lte("id", faixa[1]);
      falhou(error, "resolverRef");
      return (data ?? []).map((r: Rec) => r.id as string);
    },
    async perfis() {
      const { data, error } = await db.from("profiles").select("id, full_name").eq("organization_id", org).eq("active", true).order("full_name");
      falhou(error, "perfis");
      // Nome de exibição configurado (ex.: a conta da recepção aparece como "Gabi", não como e-mail).
      const c = await store.config();
      return (data ?? []).map((p: Rec) => ({ id: p.id, nome: p.id === c.conciergeId && c.conciergeNome ? c.conciergeNome : p.full_name }));
    },
    config() {
      configCache ??= lerConfig().catch((e) => {
        configCache = null;
        throw e;
      });
      return configCache;
    },
    async rotina(userId, dia) {
      const { data, error } = await db.from("daily_routine_items").select("*").eq("organization_id", org).eq("user_id", userId).eq("day", dia);
      falhou(error, "rotina");
      return (data ?? []).map(rotinaRow);
    },
    async rotinaAnterior(userId, dia) {
      const { data: ult, error } = await db.from("daily_routine_items").select("day").eq("organization_id", org).eq("user_id", userId).lt("day", dia).order("day", { ascending: false }).limit(1).maybeSingle();
      falhou(error, "rotinaAnterior");
      if (!ult) return null;
      return { dia: ult.day as string, linhas: await store.rotina(userId, ult.day as string) };
    },
    async agenda(de, ate) {
      // Janela em horário de Brasília: de 00:00 do primeiro dia até 00:00 do dia seguinte ao último.
      const fimExclusivo = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
      const [compromissos, sync] = await Promise.all([
        db.from("appointments").select("id, starts_at, ends_at, status, reason, requires_review, last_synced_at, patients(full_name), professionals(full_name)")
          .eq("organization_id", org).eq("source", ORIGEM_AGENDA).gte("starts_at", `${de}T00:00:00-03:00`).lt("starts_at", fimExclusivo).order("starts_at"),
        db.from("automation_runs").select("finished_at").eq("organization_id", org).eq("routine", "agenda_sync").eq("status", "completed").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      falhou(compromissos.error, "agenda");
      const um = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Rec | undefined;
      return {
        itens: ((compromissos.data ?? []) as Rec[]).map((a): CompromissoAgenda => ({
          id: a.id, inicio: a.starts_at, fim: a.ends_at ?? null, status: a.status, paciente: um(a.patients)?.full_name ?? "Paciente",
          profissional: um(a.professionals)?.full_name ?? null, motivo: a.reason ?? null, revisar: !!a.requires_review, sincronizadoEm: a.last_synced_at ?? null,
        })),
        ultimaSync: (sync.data?.finished_at as string | undefined) ?? null,
      };
    },
    async leituras(userId, ids) {
      if (!ids.length) return {};
      const { data, error } = await db.from("task_reads").select("task_id, read_at").eq("user_id", userId).in("task_id", ids);
      falhou(error, "leituras");
      return Object.fromEntries((data ?? []).map((r: Rec) => [r.task_id, r.read_at]));
    },
    async ultimosEventos(ids) {
      if (!ids.length) return {};
      const { data, error } = await db.from("event_links").select("task_id, interaction_events!inner(recorded_at, created_by, organization_id)").in("task_id", ids).eq("interaction_events.organization_id", org);
      falhou(error, "ultimosEventos");
      const out: Record<string, { em: string; por: string }> = {};
      for (const r of (data ?? []) as Rec[]) {
        const e = Array.isArray(r.interaction_events) ? r.interaction_events[0] : r.interaction_events;
        if (!e) continue;
        if (!out[r.task_id] || out[r.task_id]!.em < e.recorded_at) out[r.task_id] = { em: e.recorded_at, por: e.created_by };
      }
      return out;
    },
    async feedbacks(f) {
      let q = db.from("daily_feedbacks").select("*").eq("organization_id", org);
      if (f.dia) q = q.eq("day", f.dia);
      if (f.responsavel) q = q.eq("responsavel", f.responsavel);
      if (f.desde) q = q.gte("day", f.desde);
      const { data, error } = await q.order("day", { ascending: false }).order("versao", { ascending: false }).limit(200);
      falhou(error, "feedbacks");
      return (data ?? []).map(feedbackRow);
    },
    async feedback(id) {
      const { data, error } = await db.from("daily_feedbacks").select("*").eq("organization_id", org).eq("id", id).maybeSingle();
      falhou(error, "feedback");
      return data ? feedbackRow(data) : null;
    },
    async loteDoHash(hash) {
      const { data, error } = await db.from("import_batches").select("id, status, created_at, import_items(row_index, resultado, resolution, aplicado_em, erro)").eq("organization_id", org).eq("payload_hash", hash).maybeSingle();
      falhou(error, "loteDoHash");
      if (!data) return null;
      return {
        id: data.id, status: data.status, criadoEm: data.created_at,
        itens: ((data.import_items ?? []) as Rec[]).map((i) => ({ index: i.row_index, resultado: i.resultado, aplicado: !!i.aplicado_em, resolution: i.resolution ?? null, erro: i.erro ?? null })),
      };
    },
    async numerosDoDia(dia) {
      const { data } = await db.from("daily_manual_figures").select("*").eq("organization_id", org).eq("day", dia).maybeSingle();
      if (!data) return null;
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return { agendaPrevista: n(data.agenda_prevista), agendaRealizada: n(data.agenda_realizada), caixaPrevisto: n(data.caixa_previsto), caixaRecebido: n(data.caixa_recebido), caixaSituacao: data.caixa_situacao };
    },
    async estadoDoDia(dia) {
      const { data, error } = await db.from("daily_manual_figures").select("prioridades, secoes").eq("organization_id", org).eq("day", dia).maybeSingle();
      falhou(error, "estadoDoDia");
      return { prioridades: Array.isArray(data?.prioridades) ? data!.prioridades : [], secoes: (data?.secoes as Rec) ?? {} };
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
    async abrirLote(l) {
      const { data: ex } = await db.from("import_batches").select("id").eq("organization_id", org).eq("payload_hash", l.hash).maybeSingle();
      if (ex) return ex.id as string;
      const { data, error } = await db.from("import_batches")
        .insert({ organization_id: org, created_by: l.criadoPor, payload_hash: l.hash, origem: l.origem, consultado_em: l.consultadoEm, status: "em_andamento" })
        .select("id").single();
      if (error && /duplicate|unique/i.test(error.message)) {
        // Outra requisição abriu o mesmo lote ao mesmo tempo: usa o dela.
        const { data: d2 } = await db.from("import_batches").select("id").eq("organization_id", org).eq("payload_hash", l.hash).single();
        return d2!.id as string;
      }
      falhou(error, "abrirLote");
      return data!.id as string;
    },
    async registrarItemLote(loteId, i) {
      falhou((await db.from("import_items").upsert({
        batch_id: loteId, row_index: i.index, tipo: i.tipo, chave_origem: i.chaveOrigem ?? null, resultado: i.resultado, payload: i.payload,
        resolution: i.resolution ?? null, aplicado_em: i.aplicado ? new Date().toISOString() : null, erro: i.erro ?? null,
      }, { onConflict: "batch_id,row_index" })).error, "registrarItemLote");
    },
    async concluirLote(loteId) {
      falhou((await db.from("import_batches").update({ status: "confirmado" }).eq("organization_id", org).eq("id", loteId)).error, "concluirLote");
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
      // Sempre os três marcos (30 dias, 90 dias, 6 meses): regra atômica do banco (0012/0014).
      falhou((await db.rpc("confirmar_atendimento_realizado", { p_appointment_id: id, p_data: data, p_actor: ator })).error, "confirmarAtendimento");
    },
    async anularAtendimento(id, motivo, ator) {
      falhou((await db.rpc("anular_atendimento", { p_appointment_id: id, p_motivo: motivo, p_actor: ator })).error, "anularAtendimento");
    },
    async criarTarefa(t) {
      const { data, error } = await db.from("tasks").insert({
        organization_id: org, patient_id: t.patientId, assunto: t.assunto ?? null, title: t.title, source: "fila_entrada", kind: t.kind, chave_origem: t.chaveOrigem,
        origem: t.origem, origem_data: t.origemData, a_conferir: t.aConferir, payload: t.payload, financial_impact: t.financialImpact,
        next_action_due: t.due, due_at: meioDia(t.due), updated_at: new Date().toISOString(),
        assigned_to: t.assignedTo ?? null, next_action: t.nextAction ?? null, prioridade: t.prioridade ?? null,
        status: t.status ?? "open", aguardando: t.aguardando ?? null, waiting_since: t.status === "waiting" ? new Date().toISOString() : null,
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
        categoria: e.categoria ?? null, contato: e.contato ?? null, resposta: e.resposta ?? null, resultado: e.resultado ?? null,
        situacao: e.situacao ?? null, assunto: e.assunto ?? null, payload: e.payload ?? {},
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
      if (t.title !== undefined) patch.title = t.title;
      if (t.nextAction !== undefined) patch.next_action = t.nextAction;
      if (t.assignedTo !== undefined) patch.assigned_to = t.assignedTo;
      if (t.payload !== undefined) patch.payload = t.payload;
      if (t.financialImpact !== undefined) patch.financial_impact = t.financialImpact;
      if (t.waiting !== undefined || t.status !== undefined) patch.waiting_since = t.waiting ? new Date().toISOString() : null;
      if (t.aguardando !== undefined) patch.aguardando = t.aguardando;
      if (t.prioridade !== undefined) patch.prioridade = t.prioridade;
      if (t.prazoOriginal !== undefined) patch.prazo_original = t.prazoOriginal;
      if (t.adiamentos !== undefined) patch.adiamentos = t.adiamentos;
      falhou((await db.from("tasks").update(patch).eq("organization_id", org).eq("id", id)).error, "atualizarTarefa");
    },
    async salvarNumeros(dia, n, ator) {
      falhou((await db.from("daily_manual_figures").upsert({
        organization_id: org, day: dia, agenda_prevista: n.agendaPrevista, agenda_realizada: n.agendaRealizada, caixa_previsto: n.caixaPrevisto,
        caixa_recebido: n.caixaRecebido, caixa_situacao: n.caixaSituacao, updated_by: ator, updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,day" })).error, "salvarNumeros");
    },
    async salvarEstadoDoDia(dia, e, ator) {
      const linha: Rec = { organization_id: org, day: dia, updated_by: ator, updated_at: new Date().toISOString() };
      if (e.prioridades !== undefined) linha.prioridades = e.prioridades;
      if (e.secoes !== undefined) linha.secoes = e.secoes;
      falhou((await db.from("daily_manual_figures").upsert(linha, { onConflict: "organization_id,day" })).error, "salvarEstadoDoDia");
    },
    async salvarItemRotina(r) {
      falhou((await db.from("daily_routine_items").upsert({
        organization_id: org, user_id: r.userId, day: r.dia, item_key: r.itemKey, estado: r.estado, motivo: r.motivo, proxima_acao: r.proximaAcao,
        prazo: r.prazo, responsavel: r.responsavel, task_id: r.tarefaId, updated_by: r.updatedBy, updated_at: r.updatedAt,
        // Só itens com quantidades gravam a coluna (0016): os demais continuam funcionando sem ela.
        ...(itemDaRotina(r.itemKey)?.metricas ? { metricas: r.metricas } : {}),
      }, { onConflict: "organization_id,user_id,day,item_key" })).error, "salvarItemRotina");
    },
    async salvarConfig(c, ator) {
      configCache = null;
      const linha: Rec = { organization_id: org, updated_by: ator, updated_at: new Date().toISOString() };
      if (c.diasExpediente !== undefined) linha.dias_expediente = c.diasExpediente;
      if (c.horarioFechamento !== undefined) linha.horario_fechamento = c.horarioFechamento;
      if (c.excecoes !== undefined) linha.excecoes = c.excecoes;
      if (c.diasSemAtualizacao !== undefined) linha.dias_sem_atualizacao = c.diasSemAtualizacao;
      if (c.linksRotina !== undefined) linha.links_rotina = c.linksRotina;
      falhou((await db.from("fila_config").upsert(linha, { onConflict: "organization_id" })).error, "salvarConfig");
    },
    async marcarLido(tarefaId, userId) {
      falhou((await db.from("task_reads").upsert({ task_id: tarefaId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: "task_id,user_id" })).error, "marcarLido");
    },
    async inserirFeedback(f) {
      const { error } = await db.from("daily_feedbacks").upsert({
        id: f.id, organization_id: org, day: f.dia, responsavel: f.responsavel, versao: f.versao, status: f.status, texto: f.texto, contadores: f.contadores,
        eventos: f.eventos, substitui: f.substitui, gerado_em: f.geradoEm, entregue_em: f.entregueEm,
      }, { onConflict: "id", ignoreDuplicates: true });
      falhou(error, "inserirFeedback");
    },
    async atualizarFeedback(id, f) {
      const patch: Rec = {};
      for (const [k, v] of Object.entries(f)) if (v !== undefined) patch[COLUNA_FEEDBACK[k]!] = v;
      falhou((await db.from("daily_feedbacks").update(patch).eq("organization_id", org).eq("id", id)).error, "atualizarFeedback");
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
