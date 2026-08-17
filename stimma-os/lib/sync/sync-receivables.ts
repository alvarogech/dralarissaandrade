import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePatient, SYNC_SOURCE as SOURCE } from "./resolve-patient";
import type { NormalizedReceivable, ReceivableSyncItemResult, ReceivableSyncSummary } from "./types";

/**
 * Sync de recebíveis (débitos em atraso, etc.). Reaproveita o mesmo
 * resolvePatient do sync de agenda — mesma regra de matching, uma única
 * fonte de verdade. Sem ID estável de recebível no Simples Dental (o
 * relatório de débitos não expõe um), então a idempotência aqui é mais
 * simples: mesmo paciente + mesmo valor + mesmo vencimento não duplica.
 */
export async function runReceivablesSync(
  supabase: SupabaseClient,
  organizationId: string,
  items: NormalizedReceivable[]
): Promise<ReceivableSyncSummary> {
  const results: ReceivableSyncItemResult[] = [];

  for (const item of items) {
    const patientResult = await resolvePatient(supabase, organizationId, item.patient);

    if (patientResult.action === "requires_review") {
      results.push({ input: item, patientAction: "requires_review", receivableAction: "requires_review" });
      continue;
    }

    const patientId = patientResult.patientId;

    const { data: existing } = await supabase
      .from("receivables")
      .select("id")
      .eq("patient_id", patientId)
      .eq("amount", item.amount)
      .eq("due_at", item.dueAt)
      .maybeSingle();

    if (existing) {
      results.push({
        input: item,
        patientAction: patientResult.action,
        receivableAction: "skipped_duplicate",
        patientId,
      });
      continue;
    }

    await supabase.from("receivables").insert({
      patient_id: patientId,
      amount: item.amount,
      due_at: item.dueAt,
      paid_at: null,
      source: SOURCE,
    });

    results.push({ input: item, patientAction: patientResult.action, receivableAction: "created", patientId });
  }

  const summary: ReceivableSyncSummary = {
    total: results.length,
    created: results.filter((r) => r.receivableAction === "created").length,
    skippedDuplicate: results.filter((r) => r.receivableAction === "skipped_duplicate").length,
    requiresReview: results.filter((r) => r.receivableAction === "requires_review").length,
    results,
  };

  await supabase.from("automation_runs").insert({
    organization_id: organizationId,
    routine: "receivables_sync",
    status: "completed",
    finished_at: new Date().toISOString(),
    summary,
  });

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor: "claude",
    actor_type: "claude",
    action: "sync_receivables",
    target: "receivables",
    source: "sync_engine",
    reason: `Sync de recebíveis: ${summary.created} criados, ${summary.skippedDuplicate} já existentes, ${summary.requiresReview} pendentes de revisão.`,
    after: summary,
    status: "completed",
  });

  return summary;
}
