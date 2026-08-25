import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePatientMatch } from "@/lib/sync/patient-matching";
import type { PatientCandidate } from "@/lib/sync/types";
import { changeStage } from "@/lib/pipeline/change-stage";
import { decideAnamneseStage, nextBusinessDay } from "./anamnese-stage";

export const ANAMNESE_LEAD_SOURCE_KEY = "anamnese";

export interface AnamneseIntakeInput {
  anamneseId: string;
  type: "hof" | "odontologia";
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  email: string | null;
  appointmentDate: string | null;
  origem: string | null;
  origemOutro: string | null;
}

export type AnamneseIntakeResult =
  | { action: "created"; patientId: string }
  | { action: "existing_task_created"; patientId: string }
  | { action: "requires_review"; reason: string };

/**
 * Resolve uma paciente a partir de uma submissão de anamnese (ver
 * docs/ANAMNESE_INTAKE.md). Nunca vincula só por nome (mesma regra do Sync
 * Engine do Simples Dental, docs/CRM_RULES.md #9). Paciente nova entra no
 * pipeline com estágio + próxima ação definidos desde a criação — nunca sem
 * próxima ação (regra de ouro). Paciente já existente nunca tem o estágio
 * alterado por aqui — só uma tarefa de revisão, porque ela pode já estar em
 * qualquer ponto do funil.
 */
export async function resolvePatientFromAnamnese(
  supabase: SupabaseClient,
  organizationId: string,
  input: AnamneseIntakeInput
): Promise<AnamneseIntakeResult> {
  const { data: candidateRows } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("organization_id", organizationId);

  const candidates: PatientCandidate[] = (candidateRows ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phone: c.phone,
  }));

  const decision = decidePatientMatch(
    { phone: input.phone ?? undefined, fullName: input.fullName },
    candidates
  );

  if (decision.action === "requires_review") {
    return { action: "requires_review", reason: decision.reason };
  }

  if (decision.action === "use_existing") {
    await supabase.from("tasks").insert({
      organization_id: organizationId,
      patient_id: decision.patientId,
      title: `Nova anamnese recebida (${input.type === "hof" ? "HOF" : "Odontologia"})`,
      source: "anamnese_intake",
      priority: "normal",
      due_at: nextBusinessDay(new Date()).toISOString(),
    });
    return { action: "existing_task_created", patientId: decision.patientId };
  }

  const leadSourceId = await findOrCreateLeadSource(supabase, organizationId);
  const campaign = input.origem === "outro" ? input.origemOutro : input.origem;

  const { data: newPatient, error } = await supabase
    .from("patients")
    .insert({
      organization_id: organizationId,
      full_name: input.fullName,
      phone: input.phone,
      birth_date: input.birthDate,
      email: input.email,
      lead_source_id: leadSourceId,
      campaign: campaign ?? null,
      requires_continuation: true,
    })
    .select("id")
    .single();

  if (error || !newPatient) {
    return { action: "requires_review", reason: "Falha ao criar paciente a partir da anamnese." };
  }

  await tagPatientByType(supabase, organizationId, newPatient.id, input.type);

  const { stage, nextAction } = decideAnamneseStage(input.appointmentDate);
  await changeStage(supabase, {
    patientId: newPatient.id,
    toStage: stage,
    reason: `Preencheu anamnese (${input.type}, id ${input.anamneseId})`,
    nextAction,
    nextActionDueAt: nextBusinessDay(new Date()).toISOString(),
  });

  return { action: "created", patientId: newPatient.id };
}

async function findOrCreateLeadSource(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", ANAMNESE_LEAD_SOURCE_KEY)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("lead_sources")
    .insert({
      organization_id: organizationId,
      key: ANAMNESE_LEAD_SOURCE_KEY,
      label: "Formulário de anamnese",
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

async function tagPatientByType(
  supabase: SupabaseClient,
  organizationId: string,
  patientId: string,
  type: "hof" | "odontologia"
): Promise<void> {
  const label = type === "hof" ? "HOF" : "Odontologia";

  const { data: existingTag } = await supabase
    .from("tags")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("label", label)
    .maybeSingle();

  const tagId =
    existingTag?.id ??
    (
      await supabase
        .from("tags")
        .insert({ organization_id: organizationId, label })
        .select("id")
        .single()
    ).data?.id;

  if (tagId) {
    await supabase.from("patient_tags").insert({ patient_id: patientId, tag_id: tagId });
  }
}
