import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { resolvePatientFromAnamnese, type AnamneseIntakeInput } from "@/lib/intake/resolve-patient-from-anamnese";

/**
 * Recebe a notificação do anamnese-app quando uma paciente preenche a
 * anamnese (docs/ANAMNESE_INTAKE.md). Protegida por segredo compartilhado —
 * mesmo padrão de /api/sync/agenda. Sistemas diferentes, sem banco
 * compartilhado; esta é a única ponte entre eles.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-intake-secret");
  if (!process.env.ANAMNESE_INTAKE_SECRET || secret !== process.env.ANAMNESE_INTAKE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<AnamneseIntakeInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  if (!body.anamneseId || !body.type || !body.fullName || (!body.phone && !body.email)) {
    return NextResponse.json(
      { error: "anamneseId, type, fullName e (phone ou email) são obrigatórios" },
      { status: 400 }
    );
  }

  const input: AnamneseIntakeInput = {
    anamneseId: body.anamneseId,
    type: body.type,
    fullName: body.fullName,
    phone: body.phone ?? null,
    birthDate: body.birthDate ?? null,
    email: body.email ?? null,
    appointmentDate: body.appointmentDate ?? null,
    origem: body.origem ?? null,
    origemOutro: body.origemOutro ?? null,
  };

  const supabase = createSupabaseServiceClient();

  const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "organização não encontrada" }, { status: 500 });
  }

  const result = await resolvePatientFromAnamnese(supabase, org.id, input);

  await supabase.from("audit_logs").insert({
    organization_id: org.id,
    actor: "anamnese-app",
    actor_type: "system",
    action: "anamnese_intake",
    target:
      result.action === "requires_review" ? "patients" : `patients/${result.patientId}`,
    source: "anamnese_intake",
    reason:
      result.action === "requires_review"
        ? result.reason
        : `Anamnese ${input.anamneseId} (${input.type}) — ${result.action}`,
    after: { anamneseId: input.anamneseId, result },
    status: result.action === "requires_review" ? "requires_review" : "completed",
  });

  if (result.action === "requires_review") {
    return NextResponse.json({ ok: true, requiresReview: true });
  }

  return NextResponse.json({ ok: true, patientId: result.patientId, action: result.action });
}
