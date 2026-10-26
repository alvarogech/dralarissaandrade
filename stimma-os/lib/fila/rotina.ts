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
import { ESTADOS_ROTINA, ITENS_ROTINA, type EstadoRotina } from "./rotina-itens";

export interface EntradaRotina {
  itemKey: string;
  estado: EstadoRotina;
  motivo?: string;
  proximaAcao?: string;
  prazo?: string | null;
  /** "perfil:<uuid>" | gestao | comercial_externa | dra_larissa */
  responsavel?: string | null;
  tarefaId?: string | null;
}

const limpo = (v?: string | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

export interface RotinaCarregada {
  dia: string;
  usuarioId: string;
  linhas: RotinaItemRow[];
  /** Impedimentos do último dia registrado antes deste (seguem visíveis no dia novo). */
  doDiaAnterior: { dia: string; linhas: RotinaItemRow[] } | null;
  editavel: boolean;
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
  const [linhas, anterior] = await Promise.all([store.rotina(usuarioId, dia), store.rotinaAnterior(usuarioId, dia)]);
  const impedimentos = anterior ? anterior.linhas.filter((l) => l.estado === "impedimento") : [];
  return {
    dia, usuarioId, linhas,
    doDiaAnterior: anterior && impedimentos.length ? { dia: anterior.dia, linhas: impedimentos } : null,
    editavel: usuarioId === ator.id && !ator.gestao && dia === hoje,
  };
}

export async function salvarItemRotina(store: FilaStore, ator: Ator, e: EntradaRotina): Promise<RotinaItemRow> {
  if (ator.gestao) throw new ErroRegra("A rotina é preenchida pela concierge; a gestão consulta.", 403);
  if (!ITENS_ROTINA.some((i) => i.key === e.itemKey)) throw new ErroRegra("Item de rotina inválido.");
  if (!(ESTADOS_ROTINA as readonly string[]).includes(e.estado)) throw new ErroRegra("Estado inválido.");
  const hoje = hojeSaoPaulo();
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
    updatedBy: ator.id, updatedAt: new Date().toISOString(),
  };
  await store.salvarItemRotina(linha);
  await store.auditar({ actor: ator.email, action: "fila_rotina_item", target: `daily_routine_items/${hoje}/${e.itemKey}`, after: { estado: e.estado, tarefaId, temImpedimento: impedimento } });
  return linha;
}
