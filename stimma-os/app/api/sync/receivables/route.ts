import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runReceivablesSync } from "@/lib/sync/sync-receivables";
import type { NormalizedReceivable } from "@/lib/sync/types";

/**
 * Mesmo padrão de /api/sync/agenda (ver esse arquivo para o porquê do
 * segredo compartilhado). Recebe recebíveis já normalizados.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  if (!process.env.SYNC_API_SECRET || secret !== process.env.SYNC_API_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    items?: NormalizedReceivable[];
  };

  if (!body.organizationId || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "organizationId e items são obrigatórios" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const summary = await runReceivablesSync(supabase, body.organizationId, body.items);

  return NextResponse.json(summary);
}
