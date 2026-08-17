import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "@/lib/rules/types";

/**
 * Centraliza toda mudança de patient_journeys.stage — ver docs/CRM_RULES.md #2
 * ("mudança de estágio nunca é silenciosa"). Nenhum outro lugar do código deve
 * fazer `update patient_journeys` direto: sempre passar por aqui, para
 * garantir que pipeline_history recebe uma linha correspondente, sempre.
 *
 * Grava pipeline_history primeiro (log imutável) e só depois atualiza
 * patient_journeys (cache do estado atual) — se o segundo passo falhar, o
 * histórico real já existe e pode ser reconciliado; o inverso deixaria o
 * histórico incompleto silenciosamente.
 */
export interface ChangeStageParams {
  patientId: string;
  toStage: PipelineStage;
  reason?: string;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  changedBy?: string | null;
  automationRuleId?: string | null;
}

export async function changeStage(
  supabase: SupabaseClient,
  params: ChangeStageParams
): Promise<{ fromStage: PipelineStage | null }> {
  const { data: current } = await supabase
    .from("patient_journeys")
    .select("stage")
    .eq("patient_id", params.patientId)
    .maybeSingle();

  const fromStage: PipelineStage | null = current?.stage ?? null;

  await supabase.from("pipeline_history").insert({
    patient_id: params.patientId,
    from_stage: fromStage,
    to_stage: params.toStage,
    reason: params.reason ?? null,
    next_action: params.nextAction ?? null,
    next_action_due_at: params.nextActionDueAt ?? null,
    changed_by: params.changedBy ?? null,
    automation_rule_id: params.automationRuleId ?? null,
  });

  const journeyFields = {
    stage: params.toStage,
    next_action: params.nextAction ?? null,
    next_action_due_at: params.nextActionDueAt ?? null,
    updated_by: params.changedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  if (current) {
    await supabase.from("patient_journeys").update(journeyFields).eq("patient_id", params.patientId);
  } else {
    await supabase.from("patient_journeys").insert({ patient_id: params.patientId, ...journeyFields });
  }

  return { fromStage };
}
