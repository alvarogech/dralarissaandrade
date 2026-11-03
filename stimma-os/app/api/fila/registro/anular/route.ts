import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { anularRegistro } from "@/lib/fila/registro";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Remove (anula, sem apagar) um registro feito por engano hoje, com motivo e auditoria. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { eventoId?: string; motivo?: string };
    await anularRegistro(store, ator, { eventoId: b.eventoId ?? "", motivo: b.motivo ?? "" });
    return { ok: true };
  });
}
