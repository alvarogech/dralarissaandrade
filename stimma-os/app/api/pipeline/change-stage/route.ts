import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isAuthorized } from "@/lib/auth-guard";
import { changeStage } from "@/lib/pipeline/change-stage";
import type { PipelineStage } from "@/lib/rules/types";

const LOSS_REASONS = [
  "price",
  "no_response",
  "gave_up",
  "competitor",
  "fear",
  "timing",
  "moved_city",
  "no_clinical_indication",
  "other",
] as const;

interface ChangeStageBody {
  patientId?: string;
  toStage?: PipelineStage;
  reason?: string;
  nextAction?: string;
  nextActionDueAt?: string;
  lossReason?: (typeof LOSS_REASONS)[number];
  lossDetail?: string;
}

/**
 * Move uma paciente de estágio no pipeline — a única forma suportada de
 * mudar patient_journeys.stage a partir da UI (ver docs/CRM_RULES.md #2).
 * Autenticação por sessão (mesma barreira do middleware); escrita real via
 * service role, porque não há policy de insert/update para `authenticated`
 * ainda nestas tabelas (ver docs/DATABASE_SCHEMA.md §RLS).
 *
 * Regra de ouro aplicada aqui, não só alertada depois (docs/CRM_RULES.md #1,
 * #5): mover para qualquer estágio exige next_action + next_action_due_at;
 * mover para 'lost' exige lossReason estruturado em vez disso.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { active: boolean } | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("active").eq("id", user.id).maybeSingle();
    profile = data;
  }

  if (!isAuthorized(user, profile)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChangeStageBody;

  if (!body.patientId || !body.toStage) {
    return NextResponse.json({ error: "patientId e toStage são obrigatórios" }, { status: 400 });
  }

  if (body.toStage === "lost") {
    if (!body.lossReason || !LOSS_REASONS.includes(body.lossReason)) {
      return NextResponse.json(
        { error: "Mover para 'lost' exige lossReason estruturado (ver docs/CRM_RULES.md #5)." },
        { status: 400 }
      );
    }
  } else if (!body.nextAction || !body.nextActionDueAt) {
    return NextResponse.json(
      { error: "Toda mudança de estágio exige nextAction e nextActionDueAt (regra de ouro)." },
      { status: 400 }
    );
  }

  const service = createSupabaseServiceClient();

  const { data: patient } = await service
    .from("patients")
    .select("organization_id")
    .eq("id", body.patientId)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "paciente não encontrada" }, { status: 404 });
  }

  const { fromStage } = await changeStage(service, {
    patientId: body.patientId,
    toStage: body.toStage,
    reason: body.toStage === "lost" ? body.lossReason : body.reason,
    nextAction: body.toStage === "lost" ? null : body.nextAction,
    nextActionDueAt: body.toStage === "lost" ? null : body.nextActionDueAt,
    changedBy: user!.id,
  });

  if (body.toStage === "lost") {
    await service
      .from("patients")
      .update({ loss_reason: body.lossReason, loss_detail: body.lossDetail ?? null })
      .eq("id", body.patientId);
  }

  await service.from("audit_logs").insert({
    organization_id: patient.organization_id,
    actor: user!.email ?? user!.id,
    actor_type: "human",
    action: "pipeline_change_stage",
    target: `patients/${body.patientId}`,
    before: { stage: fromStage },
    after: { stage: body.toStage },
    source: "pipeline_board",
    reason: body.toStage === "lost" ? body.lossReason : body.reason ?? null,
    status: "completed",
  });

  return NextResponse.json({ ok: true, fromStage, toStage: body.toStage });
}
