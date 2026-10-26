import { hojeSaoPaulo, isDiaIso } from "./datas";
import { ErroRegra, type Ator } from "./servico";
import type { FilaStore, RotinaItemRow } from "./store";

/**
 * Rotina diária da concierge — checklist geral do expediente (início, durante, fechamento).
 * Registra só o ESTADO da conferência (feito, não se aplica, impedimento); não copia conteúdo
 * clínico, documentos, valores ou dados bancários, e não cria tarefas por paciente: os casos de
 * pacientes continuam nas tarefas/marcos/registros. Quando a ação já é uma tarefa, o item aponta
 * para ela (sem duplicar). Estado por usuário e por dia (America/Sao_Paulo); cada dia começa do zero
 * e os anteriores ficam como histórico.
 */
export * from "./rotina-itens";
import { CHAVES_LINK_ROTINA, ESTADOS_ROTINA, ITENS_ROTINA, itemValeNoDia, linkSeguro, normalizarMetricas, type ChaveLinkRotina, type EstadoRotina, type MetricasRotina } from "./rotina-itens";

export interface EntradaRotina {
  itemKey: string;
  estado: EstadoRotina;
  motivo?: string;
  proximaAcao?: string;
  prazo?: string | null;
  /** "perfil:<uuid>" | gestao | comercial_externa | dra_larissa */
  responsavel?: string | null;
  tarefaId?: string | null;
  /** Quantidades do item (só as previstas no catálogo; sem nomes, telefones ou valores). */
  metricas?: MetricasRotina | null;
}

const limpo = (v?: string | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

export interface RotinaCarregada {
  dia: string;
  usuarioId: string;
  linhas: RotinaItemRow[];
  /** Impedimentos do último dia registrado antes deste (seguem visíveis no dia novo). */
  doDiaAnterior: { dia: string; linhas: RotinaItemRow[] } | null;
  editavel: boolean;
  /** Links configurados (fila_config.links_rotina); ausente = item sem link. */
  links: Partial<Record<ChaveLinkRotina, string>>;
}

/** Concierge lê e edita a própria rotina; a gestão consulta a da concierge (somente leitura). */
export async function carregarRotina(store: FilaStore, ator: Ator, p: { dia?: string; usuarioId?: string } = {}): Promise<RotinaCarregada> {
  const hoje = hojeSaoPaulo();
  const dia = p.dia && isDiaIso(p.dia) && p.dia <= hoje ? p.dia : hoje;
  let usuarioId = ator.id;
  if (p.usuarioId && p.usuarioId !== ator.id) {
    if (!ator.gestao) throw new ErroRegra("Só a gestão consulta a rotina de outra pessoa.", 403);
    if (!(await store.perfis()).some((x) => x.id === p.usuarioId)) throw new ErroRegra("Usuário não encontrado.", 404);
    usuarioId = p.usuarioId;
  }
  const [linhas, anterior, config] = await Promise.all([store.rotina(usuarioId, dia), store.rotinaAnterior(usuarioId, dia), store.config()]);
  const impedimentos = anterior ? anterior.linhas.filter((l) => l.estado === "impedimento") : [];
  const links: Partial<Record<ChaveLinkRotina, string>> = {};
  for (const k of CHAVES_LINK_ROTINA) {
    const l = linkSeguro(config.linksRotina?.[k]);
    if (l) links[k] = l;
  }
  return {
    dia, usuarioId, linhas,
    doDiaAnterior: anterior && impedimentos.length ? { dia: anterior.dia, linhas: impedimentos } : null,
    editavel: usuarioId === ator.id && !ator.gestao && dia === hoje,
    links,
  };
}

export async function salvarItemRotina(store: FilaStore, ator: Ator, e: EntradaRotina): Promise<RotinaItemRow> {
  if (ator.gestao) throw new ErroRegra("A rotina é preenchida pela concierge; a gestão consulta.", 403);
  const item = ITENS_ROTINA.find((i) => i.key === e.itemKey);
  if (!item) throw new ErroRegra("Item de rotina inválido.");
  if (!(ESTADOS_ROTINA as readonly string[]).includes(e.estado)) throw new ErroRegra("Estado inválido.");
  const hoje = hojeSaoPaulo();
  // Itens semanais/mensais só valem no dia deles (data local da clínica).
  if (!itemValeNoDia(item, hoje)) throw new ErroRegra("Este item não faz parte da rotina de hoje.");
  const m = normalizarMetricas(item, e.metricas);
  if (!m.ok) throw new ErroRegra(m.erro);
  const impedimento = e.estado === "impedimento";
  const motivo = impedimento ? limpo(e.motivo) : null;
  const proxima = impedimento ? limpo(e.proximaAcao) : null;
  if (impedimento && !motivo) throw new ErroRegra("Com impedimento: informe o motivo.");
  if (impedimento && !proxima) throw new ErroRegra("Com impedimento: informe a próxima ação.");
  const prazo = impedimento && e.prazo ? e.prazo : null;
  if (prazo && (!isDiaIso(prazo) || prazo < hoje)) throw new ErroRegra("Prazo inválido (hoje ou depois).");
  let responsavel = impedimento ? limpo(e.responsavel) : null;
  if (responsavel?.startsWith("perfil:") && !(await store.perfis()).some((x) => x.id === responsavel!.slice(7))) throw new ErroRegra("Responsável inválido.");
  if (responsavel && !responsavel.startsWith("perfil:") && !["gestao", "comercial_externa", "dra_larissa"].includes(responsavel)) responsavel = null;
  let tarefaId: string | null = null;
  if (e.tarefaId) {
    // Relaciona a uma tarefa existente em vez de criar outra.
    const t = await store.tarefa(e.tarefaId);
    if (!t) throw new ErroRegra("Tarefa relacionada não encontrada.", 404);
    tarefaId = t.id;
  }
  const linha: RotinaItemRow = {
    userId: ator.id, dia: hoje, itemKey: e.itemKey, estado: e.estado, motivo, proximaAcao: proxima, prazo, responsavel, tarefaId,
    metricas: m.metricas, updatedBy: ator.id, updatedAt: new Date().toISOString(),
  };
  try {
    await store.salvarItemRotina(linha);
  } catch (err) {
    // Banco sem a coluna de quantidades (0016 não aplicada): erro claro, nada salvo.
    if (item.metricas && /metricas/i.test(err instanceof Error ? err.message : String(err))) {
      throw new ErroRegra("As quantidades ainda não podem ser salvas: falta aplicar a migration 0016 no banco. Nada foi salvo; avise a gestão.", 503);
    }
    throw err;
  }
  // Auditoria só com estado e quantidades (nunca dados de paciente).
  await store.auditar({ actor: ator.email, action: "fila_rotina_item", target: `daily_routine_items/${hoje}/${e.itemKey}`, after: { estado: e.estado, tarefaId, temImpedimento: impedimento, metricas: m.metricas } });
  return linha;
}
