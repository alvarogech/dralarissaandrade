import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "./lib/supabase/middleware";
import { isAuthorized } from "./lib/auth-guard";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);

  // Modo demonstração: sem Supabase configurado, não há como autenticar —
  // a rota fica acessível com o aviso de demo (ver app/(app)/layout.tsx).
  if (!supabase) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { active: boolean } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", user.id)
      .maybeSingle();
    profile = data as { active: boolean } | null;
  }

  if (!isAuthorized(user, profile)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/hoje/:path*"],
};
