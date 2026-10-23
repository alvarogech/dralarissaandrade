import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { COOKIE_PAPEL_DEMO } from "@/lib/fila/acesso";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Só no modo demonstração (sem Supabase): alterna a visão entre gestão e concierge. */
export async function GET(request: NextRequest) {
  if (isSupabaseConfigured()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const papel = request.nextUrl.searchParams.get("papel") === "gabi" ? "gabi" : "gestao";
  // Location relativo: mantém o mesmo host (localhost vs 127.0.0.1 = sessões de cookie distintas).
  const res = new NextResponse(null, { status: 303, headers: { Location: "/trabalho" } });
  res.cookies.set(COOKIE_PAPEL_DEMO, papel, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
