import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { CONTRATO } from "@/lib/fila/contrato";
import { hojeSaoPaulo, isDiaIso } from "@/lib/fila/datas";
import { converterLevantamento, iaConfigurada } from "@/lib/fila/ia";
import { ErroRegra } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Converte o texto colado em um lote `stimma-entrada-v1` para a prévia editável. JSON no formato
 * do contrato passa direto; texto/Markdown vai para a IA no servidor. Nada é gravado aqui.
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator }) => {
    if (!ator.gestao) throw new ErroRegra("Só a gestão pode lançar entradas.", 403);
    const b = (await request.json()) as { texto?: string; origem?: string; dataReferencia?: string };
    const texto = typeof b.texto === "string" ? b.texto.trim() : "";
    if (!texto) throw new ErroRegra("Cole o conteúdo do levantamento.");
    if (texto.length > 60_000) throw new ErroRegra("Texto grande demais para uma conversão. Divida em partes.");
    try {
      const j = JSON.parse(texto) as { contrato?: string };
      if (j && j.contrato === CONTRATO) return { via: "json", lote: texto, iaDisponivel: iaConfigurada() };
    } catch {
      // não é JSON: segue para a IA
    }
    const ref = b.dataReferencia && isDiaIso(b.dataReferencia) ? b.dataReferencia : hojeSaoPaulo();
    const itens = await converterLevantamento(texto, ref);
    const lote = { contrato: CONTRATO, lote: { origem: b.origem?.trim() || "levantamento colado (texto)", consultado_em: new Date().toISOString(), ferramenta: "conversao_ia" }, itens };
    return { via: "ia", lote: JSON.stringify(lote, null, 2), iaDisponivel: true };
  });
}
