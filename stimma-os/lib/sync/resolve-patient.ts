import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePatientMatch } from "./patient-matching";
import type { PatientCandidate } from "./types";

export const SYNC_SOURCE = "simples_dental_browser";

export type ResolvePatientResult =
  | { action: "use_existing" | "create"; patientId: string }
  | { action: "requires_review" };

/**
 * Resolve um paciente normalizado (de agenda, financeiro, ou qualquer outra
 * origem do Simples Dental) para um patient_id do STIMMA OS — compartilhado
 * por todos os syncs (agenda, financeiro, ...) para que a regra de matching
 * seja uma única fonte de verdade. Ver docs/INTEGRATIONS.md.
 */
export async function resolvePatient(
  supabase: SupabaseClient,
  organizationId: string,
  input: { sdPatientId?: string; phone?: string; fullName: string }
): Promise<ResolvePatientResult> {
  const { sdPatientId, phone, fullName } = input;

  if (sdPatientId) {
    const { data: existingLink } = await supabase
      .from("patient_external_ids")
      .select("patient_id")
      .eq("source", SYNC_SOURCE)
      .eq("external_id", sdPatientId)
      .maybeSingle();

    if (existingLink) {
      await supabase
        .from("patient_external_ids")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("source", SYNC_SOURCE)
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
        source: SYNC_SOURCE,
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
      source: SYNC_SOURCE,
      external_id: sdPatientId,
      last_seen_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    });
  }

  return { action: "create", patientId: newPatient.id };
}
