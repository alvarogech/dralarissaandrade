import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { carregarCaixa, salvarCaixa, type EntradaCaixa } from "@/lib/fila/caixa";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Conferência de recebimentos do dia (concierge e gestão; permissão conferida no servidor). */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => ({ caixa: await carregarCaixa(store, ator, request.nextUrl.searchParams.get("dia") ?? undefined) }));
}

/** Registra os totais conferidos hoje no Simples Dental (só a concierge). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => ({ caixa: await salvarCaixa(store, ator, (await request.json()) as EntradaCaixa) }));
}
