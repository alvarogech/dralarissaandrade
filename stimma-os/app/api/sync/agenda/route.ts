import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runAgendaSync } from "@/lib/sync/run-sync";
import type { NormalizedAppointment } from "@/lib/sync/types";

/**
 * Recebe compromissos JA NORMALIZADOS (extraidos da tela do Simples Dental
 * por automacao de navegador — Claude in Chrome ou Cowork) e persiste de
 * forma idempotente via runAgendaSync. Protegida por segredo compartilhado
 * porque escreve dado de paciente — nunca deixar publica sem essa checagem.
 * Ver docs/COWORK_RUNBOOK.md e docs/SECURITY.md.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  if (!process.env.SYNC_API_SECRET || secret !== process.env.SYNC_API_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    items?: NormalizedAppointment[];
  };

  if (!body.organizationId || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "organizationId e items são obrigatórios" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const summary = await runAgendaSync(supabase, body.organizationId, body.items);

  return NextResponse.json(summary);
}
