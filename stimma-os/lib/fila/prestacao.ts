import { estadoCaixa, textoCaixa, type EstadoCaixa } from "./caixa";
import { itemDoEvento, resultadoDoEvento, ROTULO_RESULTADO } from "./contato-rotina";
import { itemDaRotina, itemValeNoDia, type ResultadoContato } from "./rotina-itens";
import { ITEM_CONFERENCIA, resumirComercial, rotuloResponsavel, textoComercial, type RegistroComercial, type ResumoComercial } from "./conferencia-comercial";
import { nomeCurto } from "./fechamento";
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

/**
 * Indicadores do dia, só a partir dos registros (nada digitado de novo). Tentativas ≠ pacientes:
 * a mesma paciente com duas tentativas conta 2 tentativas e 1 paciente.
 */
export interface IndicadoresDia {
  tentativas: number;
  pacientesContatadas: number;
  comResposta: number;
  semResposta: number;
  naoRealizados: number;
  followupsProgramados: number;
  followupsConcluidos: number;
  followupsVencidos: number;
  posAcompanhados: number;
  posSemResposta: number;
  encaminhadosProfissional: number;
  pendenciasGestao: number;
}

export function indicadoresDoDia(eventos: EventoRow[], itens: ItemFila[], dia: string, responsavel: string): IndicadoresDia {
  const det = (e: EventoRow) => (e.payload?.detalhes ?? {}) as Record<string, unknown>;
  const feitos = eventos.filter((e) => e.contato === "sim");
  const semResp = eventos.filter((e) => e.contato === "sim" && e.resposta === "nao");
  const pos = eventos.filter((e) => det(e).rotina_item === "pos_procedimento_ontem");
  const distintas = (lista: EventoRow[]) => new Set(lista.map((e) => e.patientId ?? `assunto:${e.assunto ?? e.id}`)).size;
  const programados = new Set(
    eventos.filter((e) => e.situacao === "aguardando" || e.situacao === "pendente").flatMap((e) => e.alvos.map((a) => a.tarefaId).filter((x): x is string => !!x)),
  );
  const meus = itens.filter((i) => i.responsavelId === responsavel);
  return {
    tentativas: feitos.length,
    pacientesContatadas: distintas(feitos),
    comResposta: eventos.filter((e) => e.resposta === "sim").length,
    semResposta: semResp.length,
    naoRealizados: eventos.filter((e) => e.contato === "nao").length,
    followupsProgramados: programados.size,
    followupsConcluidos: meus.filter((i) => i.followup && i.status === "concluida" && i.concluidaEm === dia).length,
    followupsVencidos: meus.filter((i) => i.followup && i.status !== "concluida" && i.due < dia).length,
    posAcompanhados: distintas(pos),
    posSemResposta: distintas(pos.filter((e) => e.contato === "nao" || e.resposta === "nao")),
    encaminhadosProfissional: eventos.filter((e) => det(e).atencao_profissional === "sim").length,
    pendenciasGestao: itens.filter((i) => i.status !== "concluida" && i.aguardando === "gestao").length,
  };
}

export function textoIndicadores(i: IndicadoresDia): string[] {
  return [
    `• Contatos realizados: ${i.tentativas} tentativa${i.tentativas === 1 ? "" : "s"} (${i.pacientesContatadas} paciente${i.pacientesContatadas === 1 ? "" : "s"}) · com resposta: ${i.comResposta} · sem resposta: ${i.semResposta}${i.naoRealizados ? ` · não realizados: ${i.naoRealizados}` : ""}`,
    `• Retornos (follow-ups): ${i.followupsProgramados} programado${i.followupsProgramados === 1 ? "" : "s"} hoje · ${i.followupsConcluidos} concluído${i.followupsConcluidos === 1 ? "" : "s"} · ${i.followupsVencidos} vencido${i.followupsVencidos === 1 ? "" : "s"}`,
    `• Pós-procedimento: ${i.posAcompanhados} paciente${i.posAcompanhados === 1 ? "" : "s"} acompanhada${i.posAcompanhados === 1 ? "" : "s"} · ${i.posSemResposta} sem resposta · ${i.encaminhadosProfissional} encaminhada${i.encaminhadosProfissional === 1 ? "" : "s"} ao profissional`,
    `• Aguardando ação da gestão: ${i.pendenciasGestao}`,
  ];
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
  indicadores: IndicadoresDia;
  comercial: { registros: RegistroComercial[]; resumo: ResumoComercial; semMovimentacao: boolean; pendentes: { paciente: string; acao: string; prazo: string; responsavel: string }[] };
}

/** Pendência comercial aberta (da Mel ou de quem ficou responsável), vinda dos acompanhamentos. */
function pendentesComerciais(itens: ItemFila[]) {
  return itens.filter((i) => i.retornoDe === `rotina:${ITEM_CONFERENCIA}` && i.status !== "concluida")
    .map((i) => ({ paciente: i.pacienteNome, acao: i.proximaAcao ?? i.titulo, prazo: i.due, responsavel: !i.responsavel || i.responsavel === "Comercial Externa" ? rotuloResponsavel("comercial_externa") : i.responsavel }));
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function contatosPorAtividade(eventos: EventoRow[]): ContatosPorAtividade[] {
  const por = new Map<string, Map<string, number>>();
  for (const e of eventos) {
    const k = itemDoEvento(e.payload);
    if (!k || k === ITEM_CONFERENCIA) continue; // a conferência comercial tem seção própria
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

  // Conferência comercial da Mel não é contato nem retorno da Gabi: fica fora dos indicadores dela.
  const indicadores = indicadoresDoDia(eventos.filter((e) => itemDoEvento(e.payload) !== ITEM_CONFERENCIA), fila.itens, dia, responsavel);

  // Conferência comercial da Mel: nomes + situação, a partir dos registros salvos (nada redigitado).
  const evComerciais = eventos.filter((e) => itemDoEvento(e.payload) === ITEM_CONFERENCIA);
  const [nomesCom, linhasRotina] = await Promise.all([
    store.nomesPacientes([...new Set(evComerciais.map((e) => e.patientId).filter((x): x is string => !!x))]),
    store.rotina(responsavel, dia),
  ]);
  const registrosCom: RegistroComercial[] = evComerciais.map((e) => ({
    eventoId: e.id, pacienteId: e.patientId ?? null, paciente: (e.patientId && nomesCom[e.patientId]) || e.assunto || "Paciente",
    detalhes: Object.fromEntries(Object.entries((e.payload?.detalhes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
    proxima: typeof e.payload?.proxima === "string" ? e.payload.proxima : null, prazo: typeof e.payload?.prazo === "string" ? e.payload.prazo : null,
  }));
  const semMovimentacao = linhasRotina.find((l) => l.itemKey === ITEM_CONFERENCIA)?.metricas?.sem_movimentacao === true;
  const pendentesCom = pendentesComerciais(fila.itens);
  const itemConf = itemDaRotina(ITEM_CONFERENCIA);
  const mostraComercial = registrosCom.length > 0 || semMovimentacao || pendentesCom.length > 0 || (!!itemConf && itemValeNoDia(itemConf, dia));
  const extra: string[] = ["*Indicadores do dia*", ...textoIndicadores(indicadores), ""];
  if (contatos.length) {
    extra.push("*Contatos da rotina*");
    for (const c of contatos) extra.push(`• ${c.rotulo}: ${c.total} paciente${c.total === 1 ? "" : "s"} — ${c.porResultado.map((r) => `${r.n} ${r.resultado.toLowerCase()}`).join(", ")}`);
    extra.push("");
  }
  if (mostraComercial) extra.push(...textoComercial(registrosCom, semMovimentacao, pendentesCom, nomeCurto), "");
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
  return { texto: final.replace(/\n{3,}/g, "\n\n"), contadores, eventos: eventos.map((e) => e.id).sort(), fechamento, eventosRows: eventos, caixa, contatos, solicitacoes, indicadores,
    comercial: { registros: registrosCom, resumo: resumirComercial(registrosCom, semMovimentacao), semMovimentacao, pendentes: pendentesCom } };
}
