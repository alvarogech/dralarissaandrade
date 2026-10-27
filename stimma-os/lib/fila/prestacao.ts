import { estadoCaixa, textoCaixa, type EstadoCaixa } from "./caixa";
import { itemDoEvento, resultadoDoEvento, ROTULO_RESULTADO } from "./contato-rotina";
import { itemDaRotina, type ResultadoContato } from "./rotina-itens";
import { carregarFechamento, carregarFila } from "./servico";
import type { ItemFila } from "./agrupamento";
import type { EventoRow, FilaStore } from "./store";

/**
 * Prestação de contas do dia — UM montador para a prévia do fechamento, a versão enviada e o que a
 * gestão consulta (mesmos registros, nenhuma segunda fonte de verdade). Parte do fechamento por
 * áreas (registros com pacientes, rotina, pendências, prioridades) e acrescenta: contatos da rotina
 * por atividade e resultado, conferência de recebimentos, solicitações da gestão, decisões
 * necessárias e observação. Nada é digitado de novo: tudo vem do que foi registrado ao longo do dia.
 */
export interface ContatosPorAtividade {
  item: string;
  rotulo: string;
  total: number;
  porResultado: { resultado: string; n: number }[];
}

export interface Prestacao {
  texto: string;
  contadores: Record<string, unknown>;
  eventos: string[];
  fechamento: Awaited<ReturnType<typeof carregarFechamento>>["fechamento"];
  eventosRows: EventoRow[];
  caixa: EstadoCaixa;
  contatos: ContatosPorAtividade[];
  solicitacoes: ItemFila[];
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function contatosPorAtividade(eventos: EventoRow[]): ContatosPorAtividade[] {
  const por = new Map<string, Map<string, number>>();
  for (const e of eventos) {
    const k = itemDoEvento(e.payload);
    if (!k) continue;
    const r = resultadoDoEvento(e.payload);
    const rot = r ? ROTULO_RESULTADO[r as ResultadoContato] : "registrado";
    const m = por.get(k) ?? new Map<string, number>();
    m.set(rot, (m.get(rot) ?? 0) + 1);
    por.set(k, m);
  }
  return [...por.entries()].map(([item, m]) => {
    const def = itemDaRotina(item);
    return {
      item, rotulo: def?.pacientes?.acao ?? def?.curto ?? item,
      total: [...m.values()].reduce((a, b) => a + b, 0),
      porResultado: [...m.entries()].map(([resultado, n]) => ({ resultado, n })).sort((a, b) => b.n - a.n),
    };
  });
}

export function situacaoSolicitacao(i: ItemFila, dia: string): string {
  if (i.status === "concluida") return `entregue${i.detalhe ? ` — ${i.detalhe}` : ""}`;
  if (i.aguardando === "gestao") return "aguardando decisão da gestão";
  if (i.due < dia) return `atrasada (prazo ${dataBr(i.due)})`;
  return `aberta (prazo ${dataBr(i.due)})`;
}

export async function montarPrestacao(store: FilaStore, responsavel: string, dia: string, opts: { observacao?: string | null; decisoes?: string | null } = {}): Promise<Prestacao> {
  const [{ fechamento, texto, eventos }, caixaRow, fila] = await Promise.all([
    carregarFechamento(store, dia, responsavel), store.conferenciaCaixa(dia), carregarFila(store, dia),
  ]);
  const caixa = estadoCaixa(caixaRow);
  const contatos = contatosPorAtividade(eventos);
  const solicitacoes = fila.itens.filter((i) => i.extraordinaria && (i.responsavelId === responsavel || i.aguardando === "gestao") && (i.status !== "concluida" || i.concluidaEm === dia));

  const extra: string[] = [];
  if (contatos.length) {
    extra.push("*Contatos da rotina*");
    for (const c of contatos) extra.push(`• ${c.rotulo}: ${c.total} paciente${c.total === 1 ? "" : "s"} — ${c.porResultado.map((r) => `${r.n} ${r.resultado.toLowerCase()}`).join(", ")}`);
    extra.push("");
  }
  extra.push("*Recebimentos do dia*", `• ${textoCaixa(caixa)}`, "");
  if (solicitacoes.length) {
    extra.push("*Solicitações da gestão*");
    for (const s of solicitacoes) extra.push(`• ${s.titulo}${s.semPaciente ? "" : ` (${s.pacienteNome})`}${s.solicitadoPor ? ` — pedida por ${s.solicitadoPor}` : ""}: ${situacaoSolicitacao(s, dia)}`);
    extra.push("");
  }
  const decisoes = opts.decisoes?.trim();
  if (decisoes) extra.push("*Decisões necessárias da gestão*", decisoes, "");

  // Seções novas entram antes das prioridades (que fecham o texto).
  const marca = "*Prioridades para o próximo dia útil";
  const i = texto.indexOf(marca);
  let final = i >= 0 ? `${texto.slice(0, i)}${extra.join("\n")}\n${texto.slice(i)}` : `${texto}\n\n${extra.join("\n")}`;
  const observacao = opts.observacao?.trim();
  if (observacao) final += `\n\n*Observações do dia*\n${observacao}`;

  const contadores: Record<string, unknown> = {
    ...(fechamento.contadores as unknown as Record<string, unknown>),
    rotina_assinatura: fechamento.rotina?.assinatura ?? "",
    caixa_assinatura: caixaRow ? `${caixaRow.situacao}:${caixaRow.previsto ?? ""}:${caixaRow.recebido ?? ""}:${caixaRow.justificativa ?? ""}` : "",
    contatos_rotina: contatos.reduce((n, c) => n + c.total, 0),
  };
  if (observacao) contadores.observacao_concierge = observacao;
  if (decisoes) contadores.decisoes_concierge = decisoes;
  return { texto: final.replace(/\n{3,}/g, "\n\n"), contadores, eventos: eventos.map((e) => e.id).sort(), fechamento, eventosRows: eventos, caixa, contatos, solicitacoes };
}
