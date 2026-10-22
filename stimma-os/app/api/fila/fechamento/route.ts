import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { carregarFechamento, salvarNumeros } from "@/lib/fila/servico";
import type { NumerosDoDia } from "@/lib/fila/store";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Gera o feedback do dia a partir dos registros reais (prévia para copiar). */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ store }) => carregarFechamento(store, request.nextUrl.searchParams.get("dia") ?? undefined));
}

/** Salva os números manuais do dia (agenda/caixa) e devolve o fechamento atualizado. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { dia: string; numeros: NumerosDoDia };
    await salvarNumeros(store, ator, b.dia, b.numeros);
    return carregarFechamento(store, b.dia);
  });
}
