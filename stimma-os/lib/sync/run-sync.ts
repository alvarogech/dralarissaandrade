import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAppointmentFingerprint } from "./fingerprint";
import { decidePatientMatch } from "./patient-matching";
import type { NormalizedAppointment, PatientCandidate, SyncItemResult, SyncRunSummary } from "./types";

const SOURCE = "simples_dental_browser";

/**
 * Orquestra o Sync Engine: para cada compromisso normalizado (ja extraido
 * da tela pelo Claude/Cowork), casa o paciente e faz upsert idempotente do
 * compromisso. So a extracao (ler a tela) e agentica — tudo aqui e
 * deterministico e roda sobre o resultado ja normalizado.
 *
 * Usa o cliente service_role (bypassa RLS de proposito — e uma automacao de
 * sistema, nao uma acao de um usuario logado, actor_type='claude' no audit
 * log). Ver docs/SECURITY.md.
 */
export async function runAgendaSync(
  supabase: SupabaseClient,
  organizationId: string,
  items: NormalizedAppointment[]
): Promise<SyncRunSummary> {
  const results: SyncItemResult[] = [];

  for (const item of items) {
    const patientResult = await resolvePatient(supabase, organizationId, item);

    if (patientResult.action === "requires_review") {
      results.push({
        input: item,
        patientAction: "requires_review",
        appointmentAction: "requires_review",
      });
      continue;
    }

    const patientId = patientResult.patientId;
    const appointmentResult = await upsertAppointment(supabase, organizationId, patientId, item);

    results.push({
      input: item,
      patientAction: patientResult.action,
      appointmentAction: appointmentResult,
      patientId,
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
    actor: "claude",
    actor_type: "claude",
    action: "sync_agenda",
    target: "appointments",
    source: "sync_engine",
    reason: `Sync da agenda: ${summary.created} criados, ${summary.updated} atualizados, ${summary.unchanged} sem mudança, ${summary.requiresReview} pendentes de revisão.`,
    after: summary,
    status: "completed",
  });

  return summary;
}

async function resolvePatient(
  supabase: SupabaseClient,
  organizationId: string,
  item: NormalizedAppointment
): Promise<{ action: "use_existing" | "create"; patientId: string } | { action: "requires_review" }> {
  const { sdPatientId, phone, fullName } = item.patient;

  if (sdPatientId) {
    const { data: existingLink } = await supabase
      .from("patient_external_ids")
      .select("patient_id")
      .eq("source", SOURCE)
      .eq("external_id", sdPatientId)
      .maybeSingle();

    if (existingLink) {
      await supabase
        .from("patient_external_ids")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("source", SOURCE)
        .eq("external_id", sdPatientId);
      return { action: "use_existing", patientId: existingLink.patient_id };
    }
  }

  const { data: candidateRows } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("organization_id", organizationId);

  const candidates: PatientCandidate[] = (candidateRows ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phone: c.phone,
  }));

  const decision = decidePatientMatch({ phone, fullName }, candidates);

  if (decision.action === "use_existing") {
    if (sdPatientId) {
      await supabase.from("patient_external_ids").insert({
        patient_id: decision.patientId,
        source: SOURCE,
        external_id: sdPatientId,
        last_seen_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });
    }
    return { action: "use_existing", patientId: decision.patientId };
  }

  if (decision.action === "requires_review") {
    return { action: "requires_review" };
  }

  const { data: newPatient, error } = await supabase
    .from("patients")
    .insert({
      organization_id: organizationId,
      full_name: fullName,
      phone: phone ?? null,
      requires_continuation: true,
    })
    .select("id")
    .single();

  if (error || !newPatient) {
    return { action: "requires_review" };
  }

  if (sdPatientId) {
    await supabase.from("patient_external_ids").insert({
      patient_id: newPatient.id,
      source: SOURCE,
      external_id: sdPatientId,
      last_seen_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    });
  }

  return { action: "create", patientId: newPatient.id };
}

async function upsertAppointment(
  supabase: SupabaseClient,
  organizationId: string,
  patientId: string,
  item: NormalizedAppointment
): Promise<"created" | "updated" | "unchanged"> {
  const fingerprint = computeAppointmentFingerprint(item);
  const now = new Date().toISOString();

  if (item.sdAppointmentId) {
    const { data: existing } = await supabase
      .from("appointments")
      .select("id, source_fingerprint")
      .eq("source", SOURCE)
      .eq("sd_appointment_id", item.sdAppointmentId)
      .maybeSingle();

    if (existing) {
      if (existing.source_fingerprint === fingerprint) {
        await supabase.from("appointments").update({ last_seen_at: now }).eq("id", existing.id);
        return "unchanged";
      }

      await supabase
        .from("appointments")
        .update({
          patient_id: patientId,
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
      return "updated";
    }
  }

  await supabase.from("appointments").insert({
    organization_id: organizationId,
    patient_id: patientId,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    status: item.status,
    reason: item.reason,
    requires_payment: item.requiresPayment,
    sd_appointment_id: item.sdAppointmentId ?? null,
    source: SOURCE,
    source_fingerprint: fingerprint,
    last_seen_at: now,
    last_synced_at: now,
    // Sem sd_appointment_id nao ha como deduplicar num proximo pull —
    // marca para revisao humana em vez de fingir idempotencia que nao existe.
    requires_review: !item.sdAppointmentId,
  });

  return "created";
}
