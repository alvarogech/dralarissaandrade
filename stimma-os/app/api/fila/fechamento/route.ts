import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { carregarFechamento, salvarNumeros } from "@/lib/fila/servico";
import type { NumerosDoDia } from "@/lib/fila/store";

/** Salva os números manuais do dia (agenda/caixa) e devolve o fechamento atualizado. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { dia: string; numeros: NumerosDoDia };
    await salvarNumeros(store, ator, b.dia, b.numeros);
    return carregarFechamento(store, b.dia);
  });
}
