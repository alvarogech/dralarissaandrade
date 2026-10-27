import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAppointmentFingerprint } from "./fingerprint";
import { resolvePatient, SYNC_SOURCE as SOURCE } from "./resolve-patient";
import type { NormalizedAppointment, SyncItemResult, SyncRunSummary } from "./types";

/**
 * Orquestra o Sync Engine: para cada compromisso normalizado (ja extraido
 * da tela pelo Claude/Cowork), casa o paciente e faz upsert idempotente do
 * compromisso. So a extracao (ler a tela) e agentica — tudo aqui e
 * deterministico e roda sobre o resultado ja normalizado.
 *
 * Compromisso ja gravado (mesmo sd_appointment_id) mantem o vinculo que tem —
 * nao depende de casar a paciente de novo. Compromisso novo cuja paciente nao
 * pode ser vinculada com seguranca (so o nome bate) e gravado SEM paciente, com
 * o nome lido do SD e requires_review: aparece na agenda, nunca e vinculado por
 * nome sozinho (migration 0017). Falha ao gravar vira "revisar", nunca "criado".
 *
 * Usa o cliente service_role (bypassa RLS de proposito — e uma automacao de
 * sistema, nao uma acao de um usuario logado, actor_type='claude' no audit
 * log). Ver docs/SECURITY.md.
 */
export async function runAgendaSync(
  supabase: SupabaseClient,
  organizationId: string,
  items: NormalizedAppointment[],
  /** Quem disparou: automação (padrão) ou uma pessoa logada (botão "Sincronizar agenda"). */
  autoria: { actor: string; actorType: "claude" | "human" } = { actor: "claude", actorType: "claude" }
): Promise<SyncRunSummary> {
  const results: SyncItemResult[] = [];

  for (const item of items) {
    const existente = item.sdAppointmentId ? await buscarCompromisso(supabase, item.sdAppointmentId) : null;

    // Já gravado e já vinculado: só atualiza o compromisso.
    if (existente?.patient_id) {
      const acao = await atualizarCompromisso(supabase, existente, existente.patient_id, item);
      results.push({ input: item, patientAction: "use_existing", appointmentAction: acao, patientId: existente.patient_id });
      continue;
    }

    const patientResult = await resolvePatient(supabase, organizationId, item.patient);
    const patientId = patientResult.action === "requires_review" ? null : patientResult.patientId;
    const acao = existente
      ? await atualizarCompromisso(supabase, existente, patientId, item)
      : await inserirCompromisso(supabase, organizationId, patientId, item);
    results.push({
      input: item,
      patientAction: patientResult.action,
      // Sem vínculo seguro: o compromisso é gravado (aparece na agenda), mas conta como "revisar".
      appointmentAction: patientId ? acao : "requires_review",
      ...(patientId ? { patientId } : {}),
      ...(!patientId ? { gravadoSemVinculo: acao !== "requires_review" } : {}),
    });
  }

  const summary: SyncRunSummary = {
    total: results.length,
    created: results.filter((r) => r.appointmentAction === "created").length,
    updated: results.filter((r) => r.appointmentAction === "updated").length,
    unchanged: results.filter((r) => r.appointmentAction === "unchanged").length,
    requiresReview: results.filter((r) => r.appointmentAction === "requires_review").length,
    results,
  };

  await supabase.from("automation_runs").insert({
    organization_id: organizationId,
    routine: "agenda_sync",
    status: "completed",
    finished_at: new Date().toISOString(),
    summary,
  });

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor: autoria.actor,
    actor_type: autoria.actorType,
    action: "sync_agenda",
    target: "appointments",
    source: "sync_engine",
    reason: `Sync da agenda: ${summary.created} criados, ${summary.updated} atualizados, ${summary.unchanged} sem mudança, ${summary.requiresReview} pendentes de revisão.`,
    after: summary,
    status: "completed",
  });

  return summary;
}

type Existente = { id: string; patient_id: string | null; source_fingerprint: string | null };

async function buscarCompromisso(supabase: SupabaseClient, sdAppointmentId: string): Promise<Existente | null> {
  const { data } = await supabase
    .from("appointments")
    .select("id, patient_id, source_fingerprint")
    .eq("source", SOURCE)
    .eq("sd_appointment_id", sdAppointmentId)
    .maybeSingle();
  return (data as Existente | null) ?? null;
}

async function atualizarCompromisso(
  supabase: SupabaseClient,
  existing: Existente,
  patientId: string | null,
  item: NormalizedAppointment
): Promise<"updated" | "unchanged" | "requires_review"> {
  const fingerprint = computeAppointmentFingerprint(item);
  const now = new Date().toISOString();
  const vinculou = !existing.patient_id && !!patientId;
  if (existing.source_fingerprint === fingerprint && !vinculou) {
    await supabase.from("appointments").update({ last_seen_at: now }).eq("id", existing.id);
    return "unchanged";
  }
  const { error } = await supabase
    .from("appointments")
    .update({
      // Nunca troca um vínculo existente por nada; só preenche quando passa a ser seguro.
      ...(patientId ? { patient_id: patientId, requires_review: false } : {}),
      ...(!existing.patient_id ? { sd_patient_name: item.patient.fullName } : {}),
      starts_at: item.startsAt,
      ends_at: item.endsAt,
      status: item.status,
      reason: item.reason,
      requires_payment: item.requiresPayment,
      source_fingerprint: fingerprint,
      last_seen_at: now,
      last_synced_at: now,
    })
    .eq("id", existing.id);
  return error ? "requires_review" : "updated";
}

async function inserirCompromisso(
  supabase: SupabaseClient,
  organizationId: string,
  patientId: string | null,
  item: NormalizedAppointment
): Promise<"created" | "requires_review"> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("appointments").insert({
    organization_id: organizationId,
    patient_id: patientId,
    sd_patient_name: patientId ? null : item.patient.fullName,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    status: item.status,
    reason: item.reason,
    requires_payment: item.requiresPayment,
    sd_appointment_id: item.sdAppointmentId ?? null,
    source: SOURCE,
    source_fingerprint: computeAppointmentFingerprint(item),
    last_seen_at: now,
    last_synced_at: now,
    // Sem sd_appointment_id nao ha como deduplicar num proximo pull; sem paciente
    // vinculada, alguem precisa conferir — os dois casos ficam marcados para revisao.
    requires_review: !item.sdAppointmentId || !patientId,
  });
  // Ex.: banco ainda sem a 0017 recusa compromisso sem paciente — não finge que gravou.
  return error ? "requires_review" : "created";
}
