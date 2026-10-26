import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { carregarRotina, salvarItemRotina, type EntradaRotina } from "@/lib/fila/rotina";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Rotina do dia: a concierge lê a própria; a gestão pode consultar a de outra pessoa (?usuario=). */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ ator, store }) =>
    carregarRotina(store, ator, { dia: request.nextUrl.searchParams.get("dia") ?? undefined, usuarioId: request.nextUrl.searchParams.get("usuario") ?? undefined }));
}

/** Marca um item da rotina de hoje (só a própria concierge; a gestão recebe 403). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => ({ item: await salvarItemRotina(store, ator, (await request.json()) as EntradaRotina) }));
}
