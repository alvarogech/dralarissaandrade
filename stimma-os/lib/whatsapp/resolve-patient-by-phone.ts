import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePatientMatch } from "@/lib/sync/patient-matching";
import type { PatientCandidate } from "@/lib/sync/types";
import { changeStage } from "@/lib/pipeline/change-stage";

export const WHATSAPP_SOURCE = "chatwoot";

export type ResolveByPhoneResult =
  | { action: "use_existing" | "created"; patientId: string }
  | { action: "requires_review"; reason: string };

/**
 * Resolve um paciente pelo telefone recebido no webhook do Chatwoot — nunca
 * cria duplicata silenciosa (mesmo princípio do Sync Engine do Simples
 * Dental, ver docs/CRM_RULES.md #9). Uma lead nova via WhatsApp ainda não
 * tem nome conhecido; usa o telefone como nome provisório até a Gabi/IA
 * identificar quem é.
 */
export async function resolvePatientByPhone(
  supabase: SupabaseClient,
  organizationId: string,
  phone: string
): Promise<ResolveByPhoneResult> {
  const { data: candidateRows } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("organization_id", organizationId);

  const candidates: PatientCandidate[] = (candidateRows ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phone: c.phone,
  }));

  const decision = decidePatientMatch({ phone, fullName: phone }, candidates);

  if (decision.action === "use_existing") {
    return { action: "use_existing", patientId: decision.patientId };
  }

  if (decision.action === "requires_review") {
    return { action: "requires_review", reason: decision.reason };
  }

  const { data: newPatient, error } = await supabase
    .from("patients")
    .insert({
      organization_id: organizationId,
      full_name: phone,
      phone,
      requires_continuation: true,
      last_interaction_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !newPatient) {
    return { action: "requires_review", reason: "Falha ao criar paciente a partir do WhatsApp." };
  }

  await changeStage(supabase, {
    patientId: newPatient.id,
    toStage: "new_lead",
    reason: "Primeira mensagem recebida pelo WhatsApp",
  });

  return { action: "created", patientId: newPatient.id };
}
