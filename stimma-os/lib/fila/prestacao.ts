import { estadoCaixa, linhasCaixa, type EstadoCaixa } from "./caixa";
import { itemDoEvento, resultadoDoEvento, ROTULO_RESULTADO } from "./contato-rotina";
import { itemDaRotina, itemValeNoDia, type ResultadoContato } from "./rotina-itens";
import { ITEM_CONFERENCIA, resumirComercial, rotuloResponsavel, textoComercial, type RegistroComercial, type ResumoComercial } from "./conferencia-comercial";
import { nomeCurto, textoWhatsapp } from "./fechamento";
import { contarRegistros } from "./leitura-registro";
import { carteiraPlanejamento, ehPlanejamento, gruposPlanejamento, registroAuxiliar, resumirPlanejamento, textoPlanejamento, type CarteiraPlanejamento, type RegistroPlanejamento, type ResumoPlanejamento } from "./planejamento";
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
 * Indicadores do dia, só a partir dos registros (nada digitado de novo) e pela MESMA contagem do
 * fechamento (leitura-registro.ts — fórmulas documentadas lá). Tentativas ≠ pacientes: a mesma
 * paciente com duas tentativas conta 2 tentativas e 1 paciente. Resposta vazia ou genérica não conta
 * como resposta (vai em respostasIncompletas); mensagem de aniversário não é tentativa.
 */
export interface IndicadoresDia {
  tentativas: number;
  pacientesContatadas: number;
  /** Respostas reais descritas. */
  comResposta: number;
  pacientesResponderam: number;
  respostasIncompletas: number;
  semResposta: number;
  naoRealizados: number;
  mensagens: number;
  agendamentos: number;
  resolvidos: number;
  registrosIncompletos: number;
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
  const c = contarRegistros(eventos);
  const pos = eventos.filter((e) => det(e).rotina_item === "pos_procedimento_ontem");
  const distintas = (lista: EventoRow[]) => new Set(lista.map((e) => e.patientId ?? `assunto:${e.assunto ?? e.id}`)).size;
  const programados = new Set(
    eventos.filter((e) => e.situacao === "aguardando" || e.situacao === "pendente").flatMap((e) => e.alvos.map((a) => a.tarefaId).filter((x): x is string => !!x)),
  );
  const meus = itens.filter((i) => i.responsavelId === responsavel);
  return {
    tentativas: c.tentativas,
    pacientesContatadas: c.pacientesContatadas,
    comResposta: c.respostas,
    pacientesResponderam: c.pacientesResponderam,
    respostasIncompletas: c.respostasIncompletas,
    semResposta: c.semResposta,
    naoRealizados: c.naoRealizados,
    mensagens: c.mensagens,
    agendamentos: c.agendamentos,
    resolvidos: c.resolvidos,
    registrosIncompletos: c.registrosIncompletos,
    followupsProgramados: programados.size,
    followupsConcluidos: meus.filter((i) => i.followup && i.status === "concluida" && i.concluidaEm === dia).length,
    followupsVencidos: meus.filter((i) => i.followup && i.status !== "concluida" && i.due < dia).length,
    posAcompanhados: distintas(pos),
    posSemResposta: distintas(pos.filter((e) => e.contato === "nao" || e.resposta === "nao")),
    encaminhadosProfissional: c.encaminhadosProfissional,
    pendenciasGestao: itens.filter((i) => i.status !== "concluida" && i.aguardando === "gestao").length,
  };
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
  planejamento: { registros: RegistroPlanejamento[]; carteira: CarteiraPlanejamento[]; resumo: ResumoPlanejamento; grupos: ReturnType<typeof gruposPlanejamento> };
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
    if (!k || registroAuxiliar(e.payload?.detalhes as Record<string, unknown> | undefined)) continue; // conferência da Mel e planejamento têm seção própria
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
  const [{ fechamento, eventos }, caixaRow, fila] = await Promise.all([
    carregarFechamento(store, dia, responsavel), store.conferenciaCaixa(dia), carregarFila(store, dia),
  ]);
  const caixa = estadoCaixa(caixaRow);
  const contatos = contatosPorAtividade(eventos);
  const solicitacoes = fila.itens.filter((i) => i.extraordinaria && (i.responsavelId === responsavel || i.aguardando === "gestao") && (i.status !== "concluida" || i.concluidaEm === dia));

  // Conferência comercial da Mel não é contato nem retorno da Gabi: fica fora dos indicadores dela.
  const indicadores = indicadoresDoDia(eventos.filter((e) => !registroAuxiliar(e.payload?.detalhes as Record<string, unknown> | undefined)), fila.itens, dia, responsavel);

  // Conferência comercial da Mel: nomes + situação, a partir dos registros salvos (nada redigitado).
  const evComerciais = eventos.filter((e) => itemDoEvento(e.payload) === ITEM_CONFERENCIA);
  const evPlan = eventos.filter((e) => ehPlanejamento((e.payload?.detalhes ?? {}) as Record<string, unknown>));
  const [nomesCom, linhasRotina, agendaDia] = await Promise.all([
    store.nomesPacientes([...new Set([...evComerciais, ...evPlan].map((e) => e.patientId).filter((x): x is string => !!x))]),
    store.rotina(responsavel, dia),
    store.agenda(dia, dia).catch(() => null),
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

  // Planejamentos anuais: registros do dia (presencial e WhatsApp) + carteira em aberto (acumulada).
  const registrosPlan: RegistroPlanejamento[] = evPlan.map((e) => ({
    eventoId: e.id, pacienteId: e.patientId ?? null, paciente: (e.patientId && nomesCom[e.patientId]) || e.assunto || "Paciente",
    detalhes: Object.fromEntries(Object.entries((e.payload?.detalhes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
    proxima: typeof e.payload?.proxima === "string" ? e.payload.proxima : null, prazo: typeof e.payload?.prazo === "string" ? e.payload.prazo : null,
    responsavelProxima: typeof e.payload?.responsavel === "string" ? e.payload.responsavel : null,
  }));
  const carteira = carteiraPlanejamento(fila.itens);
  const atendimentosAgenda = agendaDia ? agendaDia.itens.filter((a) => a.inicio.slice(0, 10) === dia && !["cancelled", "no_show", "rescheduled"].includes(a.status)).length : null;

  // Um texto só, montado pelo gerador do fechamento (fechamento.ts) com as seções da prestação.
  const comercial: string[] = [];
  if (mostraComercial) comercial.push(...textoComercial(registrosCom, semMovimentacao, pendentesCom, nomeCurto), "");
  if (registrosPlan.length || carteira.length || (atendimentosAgenda ?? 0) > 0) comercial.push(...textoPlanejamento(registrosPlan, carteira, atendimentosAgenda, nomeCurto));
  const observacao = opts.observacao?.trim();
  const decisoes = opts.decisoes?.trim();
  const final = textoWhatsapp(fechamento, {
    comercial: comercial.length ? comercial : undefined,
    financeiro: linhasCaixa(caixa),
    solicitacoes: solicitacoes.map((s) => `${s.titulo}${s.semPaciente ? "" : ` (${nomeCurto(s.pacienteNome)})`}${s.solicitadoPor ? ` — pedida por ${s.solicitadoPor}` : ""}: ${situacaoSolicitacao(s, dia)}`),
    decisoesTexto: decisoes, observacao,
  });

  const contadores: Record<string, unknown> = {
    ...(fechamento.contadores as unknown as Record<string, unknown>),
    rotina_assinatura: fechamento.rotina?.assinatura ?? "",
    caixa_assinatura: caixaRow ? `${caixaRow.situacao}:${caixaRow.previsto ?? ""}:${caixaRow.recebido ?? ""}:${caixaRow.justificativa ?? ""}` : "",
    contatos_rotina: contatos.reduce((n, c) => n + c.total, 0),
  };
  if (observacao) contadores.observacao_concierge = observacao;
  if (decisoes) contadores.decisoes_concierge = decisoes;
  return { texto: final, contadores, eventos: eventos.map((e) => e.id).sort(), fechamento, eventosRows: eventos, caixa, contatos, solicitacoes, indicadores,
    comercial: { registros: registrosCom, resumo: resumirComercial(registrosCom, semMovimentacao), semMovimentacao, pendentes: pendentesCom },
    planejamento: { registros: registrosPlan, carteira, resumo: resumirPlanejamento(registrosPlan, carteira, atendimentosAgenda), grupos: gruposPlanejamento(registrosPlan, carteira) } };
}
