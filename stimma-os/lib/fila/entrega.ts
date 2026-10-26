import { hojeSaoPaulo, isDiaIso, somarDias } from "./datas";
import { situacaoEntrega, type SituacaoEntrega } from "./expediente";
import { carregarFechamento, ErroRegra, type Ator } from "./servico";
import type { FeedbackRow, FilaStore } from "./store";

/**
 * Entrega formal do feedback diário. Estados:
 *  - rascunho   → nada gravado; a prévia é montada ao vivo dos registros persistidos;
 *  - gerado     → versão congelada para revisão (gerar de novo substitui a versão ainda não entregue);
 *  - entregue   → ação explícita "Entregar à gestão": grava horário, conteúdo e registros de origem.
 * Corrigir depois da entrega cria uma nova versão; a entregue continua consultável.
 * Copiar o texto e confirmar envio pelo WhatsApp são marcas separadas — nenhuma delas é entrega,
 * e nada é enviado automaticamente.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirConcierge(ator: Ator) {
  if (ator.gestao) throw new ErroRegra("O feedback diário é entregue pela concierge; a gestão acompanha em “Feedbacks da Gabi”.", 403);
}

async function montar(store: FilaStore, responsavel: string, dia: string) {
  const { fechamento, texto, eventos } = await carregarFechamento(store, dia, responsavel);
  // A assinatura da rotina vai junto: mudar o checklist depois de gerar exige gerar de novo.
  const contadores = { ...(fechamento.contadores as unknown as Record<string, unknown>), rotina_assinatura: fechamento.rotina?.assinatura ?? "" };
  return { texto, contadores, eventos: eventos.map((e) => e.id).sort() };
}

/** A versão gerada ainda corresponde aos registros e à rotina atuais? */
function mesmaBase(f: FeedbackRow, m: { eventos: string[]; contadores: Record<string, unknown> }): boolean {
  return m.eventos.join(",") === [...f.eventos].sort().join(",") && String(f.contadores.rotina_assinatura ?? "") === String(m.contadores.rotina_assinatura ?? "");
}

export interface EstadoDoFeedback {
  dia: string;
  versoes: FeedbackRow[];
  situacao: SituacaoEntrega;
}

export async function estadoFeedback(store: FilaStore, responsavel: string, dia = hojeSaoPaulo(), agora = new Date()): Promise<EstadoDoFeedback> {
  const [versoes, config] = await Promise.all([store.feedbacks({ dia, responsavel }), store.config()]);
  const situacao: SituacaoEntrega = dia === hojeSaoPaulo(agora)
    ? situacaoEntrega(config, versoes, agora)
    : versoes.some((v) => v.status === "entregue") ? situacaoEntrega(config, versoes, agora) : { tipo: "sem_expediente" };
  return { dia, versoes, situacao };
}

export async function gerarFeedback(store: FilaStore, ator: Ator, p: { id: string; dia?: string }): Promise<FeedbackRow> {
  exigirConcierge(ator);
  if (!UUID.test(p.id)) throw new ErroRegra("Identificador inválido.");
  const dia = p.dia ?? hojeSaoPaulo();
  if (!isDiaIso(dia) || dia > hojeSaoPaulo()) throw new ErroRegra("Dia inválido.");
  const repetido = await store.feedback(p.id);
  if (repetido) return repetido; // clique repetido
  const versoes = await store.feedbacks({ dia, responsavel: ator.id });
  const ultima = versoes.sort((a, b) => b.versao - a.versao)[0];
  const m = await montar(store, ator.id, dia);
  const agora = new Date().toISOString();
  if (ultima?.status === "gerado") {
    await store.atualizarFeedback(ultima.id, { texto: m.texto, contadores: m.contadores, eventos: m.eventos, geradoEm: agora });
    return (await store.feedback(ultima.id))!;
  }
  const nova: FeedbackRow = {
    id: p.id, dia, responsavel: ator.id, versao: (ultima?.versao ?? 0) + 1, status: "gerado", texto: m.texto, contadores: m.contadores, eventos: m.eventos,
    substitui: ultima?.id ?? null, geradoEm: agora, entregueEm: null, copiadoEm: null, whatsappConfirmadoEm: null, observacaoGestao: null, ajusteSolicitadoEm: null, ajusteSolicitadoPor: null,
  };
  await store.inserirFeedback(nova);
  await store.auditar({ actor: ator.email, action: "fila_feedback_gerado", target: `daily_feedbacks/${nova.id}`, after: { dia, versao: nova.versao } });
  return (await store.feedback(nova.id)) ?? nova;
}

export async function entregarFeedback(store: FilaStore, ator: Ator, id: string): Promise<FeedbackRow> {
  exigirConcierge(ator);
  const f = await store.feedback(id);
  if (!f) throw new ErroRegra("Gere o feedback antes de entregar.", 404);
  if (f.responsavel !== ator.id) throw new ErroRegra("Só quem gerou pode entregar este feedback.", 403);
  if (f.status === "entregue") return f; // reenvio do mesmo clique
  const m = await montar(store, ator.id, f.dia);
  if (!mesmaBase(f, m)) {
    throw new ErroRegra("Há registros ou itens da rotina alterados desde que o feedback foi gerado. Gere de novo para entregar a versão atual.", 409);
  }
  await store.atualizarFeedback(id, { status: "entregue", entregueEm: new Date().toISOString() });
  await store.auditar({ actor: ator.email, action: "fila_feedback_entregue", target: `daily_feedbacks/${id}`, after: { dia: f.dia, versao: f.versao } });
  return (await store.feedback(id))!;
}

/** Marca que o texto foi copiado (não comprova envio nem entrega). */
export async function marcarCopiado(store: FilaStore, ator: Ator, id: string) {
  const f = await store.feedback(id);
  if (!f || f.responsavel !== ator.id) throw new ErroRegra("Feedback não encontrado.", 404);
  await store.atualizarFeedback(id, { copiadoEm: new Date().toISOString() });
}

/** Confirmação manual de quem enviou pelo WhatsApp (o sistema não envia nada). */
export async function confirmarWhatsapp(store: FilaStore, ator: Ator, id: string) {
  const f = await store.feedback(id);
  if (!f || f.responsavel !== ator.id) throw new ErroRegra("Feedback não encontrado.", 404);
  if (f.status !== "entregue") throw new ErroRegra("Entregue no sistema antes de confirmar o envio pelo WhatsApp.");
  await store.atualizarFeedback(id, { whatsappConfirmadoEm: new Date().toISOString() });
}

/** Gestão: observação e, se for o caso, pedido de ajuste (a concierge vê e reenvia uma nova versão). */
export async function comentarFeedback(store: FilaStore, ator: Ator, p: { id: string; observacao: string; solicitarAjuste?: boolean }) {
  if (!ator.gestao) throw new ErroRegra("Só a gestão comenta ou pede ajuste.", 403);
  const f = await store.feedback(p.id);
  if (!f) throw new ErroRegra("Feedback não encontrado.", 404);
  if (f.status !== "entregue") throw new ErroRegra("Só se comenta um feedback entregue.");
  const obs = p.observacao?.trim();
  if (!obs) throw new ErroRegra("Escreva a observação.");
  await store.atualizarFeedback(p.id, { observacaoGestao: obs, ...(p.solicitarAjuste ? { ajusteSolicitadoEm: new Date().toISOString(), ajusteSolicitadoPor: ator.id } : {}) });
  await store.auditar({ actor: ator.email, action: p.solicitarAjuste ? "fila_feedback_ajuste" : "fila_feedback_observacao", target: `daily_feedbacks/${p.id}`, after: { observacao: obs } });
}

export interface FeedbackComRegistros extends FeedbackRow {
  responsavelNome: string;
  registros: { id: string; hora: string; autor: string; tipo: string; texto: string }[];
}

/** Histórico de feedbacks (gestão: todos; concierge: os próprios), com os registros de origem. */
export async function listarFeedbacks(store: FilaStore, ator: Ator, p: { desde?: string; dia?: string } = {}): Promise<FeedbackComRegistros[]> {
  const desde = p.desde && isDiaIso(p.desde) ? p.desde : somarDias(hojeSaoPaulo(), -30);
  const lista = await store.feedbacks({ desde: p.dia ? undefined : desde, dia: p.dia, responsavel: ator.gestao ? undefined : ator.id });
  const perfis = new Map((await store.perfis()).map((x) => [x.id, x.nome]));
  const porDia = new Map<string, Awaited<ReturnType<FilaStore["eventosDoDia"]>>>();
  const out: FeedbackComRegistros[] = [];
  for (const f of lista) {
    if (!porDia.has(f.dia)) porDia.set(f.dia, await store.eventosDoDia(f.dia));
    const ids = new Set(f.eventos);
    out.push({
      ...f, responsavelNome: perfis.get(f.responsavel) ?? "—",
      registros: porDia.get(f.dia)!.filter((e) => ids.has(e.id)).map((e) => ({
        id: e.id, autor: perfis.get(e.createdBy) ?? "—", tipo: e.situacao ?? e.kind, texto: e.notes ?? "",
        hora: e.registradoEm ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(e.registradoEm)) : "",
      })),
    });
  }
  return out;
}
