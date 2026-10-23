/**
 * Leitura determinística do feedback colado de volta na gestão. Funciona sem IA para o formato
 * gerado em /fechamento: cada linha traz referências curtas ([T-1a2b3c] tarefa, [M-1a2b3c] marco)
 * que ligam a linha ao item real no banco — nada é ligado por nome.
 * Linhas sem referência (feedbacks antigos, texto livre) ficam para revisão manual ou para a IA.
 */
export interface LinhaFeedback {
  secao: string;
  texto: string;
  refs: { tipo: "tarefa" | "marco" | "atendimento"; prefixo: string; ref: string }[];
}

export interface FeedbackLido {
  /** Dia do feedback (AAAA-MM-DD) — base para interpretar "amanhã" etc. null = pedir revisão. */
  dia: string | null;
  /** true quando o cabeçalho "*Fechamento — DD/MM/AAAA*" do formato da plataforma foi reconhecido. */
  formatoDaPlataforma: boolean;
  linhas: LinhaFeedback[];
}

const REF = /\b([TMA])-([0-9a-f]{6})\b/gi;
const TIPO_REF = { T: "tarefa", M: "marco", A: "atendimento" } as const;

function dataBrParaIso(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.getMonth() === Number(m) - 1 && dt.getDate() === Number(d) ? iso : null;
}

export function lerFeedback(texto: string): FeedbackLido {
  const cab = /Fechamento\s*[—–-]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(texto);
  let dia = cab ? dataBrParaIso(cab[1]!, cab[2]!, cab[3]!) : null;
  if (!dia) {
    // Feedback antigo: só aceita uma data completa explícita no início; senão, revisão.
    const qualquer = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto.slice(0, 200));
    dia = qualquer ? dataBrParaIso(qualquer[1]!, qualquer[2]!, qualquer[3]!) : null;
  }

  const linhas: LinhaFeedback[] = [];
  let secao = "";
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l) continue;
    const titulo = /^\*([^*]+)\*\s*(\(\d+\))?$/.exec(l);
    if (titulo) {
      secao = titulo[1]!.trim().toLowerCase();
      continue;
    }
    if (/^\*fechamento/i.test(l) || /^\*(agenda|caixa):/i.test(l)) continue;
    // Primeira linha sem marcador que só carrega a data é cabeçalho, não pendência.
    if (!linhas.length && !secao && !/^[•\-–*]/.test(l) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(l) && l.length < 60) continue;
    const conteudo = l.replace(/^[•\-–*]\s*/, "").trim();
    if (!conteudo) continue;
    const refs = [...conteudo.matchAll(REF)].map((m) => ({
      tipo: TIPO_REF[m[1]!.toUpperCase() as keyof typeof TIPO_REF],
      prefixo: m[2]!.toLowerCase(),
      ref: `${m[1]!.toUpperCase()}-${m[2]!.toLowerCase()}`,
    }));
    linhas.push({ secao, texto: conteudo, refs });
  }
  return { dia, formatoDaPlataforma: !!cab, linhas };
}

/** Linhas sem informação acionável (contagens e mensagens de "nada"). */
export function linhaSemConteudo(texto: string): boolean {
  return /^(nenhuma ação|ninguém aguardando|nada vencendo|recebimentos confirmados:|cobranças em aberto|para hoje ainda sem ação|atendimentos a conferir|registros: \d|agenda: |sem ocorrências|nenhuma até o próximo dia útil|nenhuma definida)/i.test(texto);
}
