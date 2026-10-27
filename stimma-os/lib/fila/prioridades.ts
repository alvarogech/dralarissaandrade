import { hojeSaoPaulo, isDiaIso, somarDias } from "./datas";
import { ErroRegra, type Ator } from "./servico";
import type { FilaStore, PrioridadeDoDia, RascunhoFechamento } from "./store";

/**
 * Prioridades para o próximo dia útil e rascunho do fechamento.
 *
 * As prioridades escolhidas no fechamento ficam gravadas no dia em que foram escolhidas e aparecem
 * no topo da rotina do dia seguinte ("herdadas") — sem copiar nada: a prioridade aponta para a
 * origem (tarefa [T-…]/[M-…]) quando existe; a manual pode ser marcada como resolvida, e isso fica
 * registrado no dia de origem. Atividades recorrentes não viram prioridade sozinhas.
 */
export const MAX_PRIORIDADES = 8;
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function limparPrioridade(p: Partial<PrioridadeDoDia>): PrioridadeDoDia | null {
  const t = texto(p.texto, 200);
  if (!t) return null;
  const data = typeof p.data === "string" && isDiaIso(p.data) ? p.data : null;
  return {
    ref: texto(p.ref, 20), texto: t, paciente: texto(p.paciente, 120), data, prioridade: p.prioridade === "alta" ? "alta" : p.prioridade === "normal" ? "normal" : null,
    origem: texto(p.origem, 60), proxima: texto(p.proxima, 200), resolvidaEm: texto(p.resolvidaEm, 40), resolvidaPor: texto(p.resolvidaPor, 60),
  };
}

export function limparPrioridades(lista: unknown): PrioridadeDoDia[] {
  if (!Array.isArray(lista)) throw new ErroRegra("Prioridades inválidas.");
  if (lista.length > MAX_PRIORIDADES) throw new ErroRegra(`Escolha até ${MAX_PRIORIDADES} prioridades.`);
  const vistas = new Set<string>();
  // Mesma prioridade duas vezes (mesma origem ou mesmo texto) não duplica.
  return lista.map((p) => limparPrioridade(p as Partial<PrioridadeDoDia>)).filter((p): p is PrioridadeDoDia => {
    if (!p) return false;
    const chave = p.ref ?? p.texto.toLowerCase();
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

export interface PrioridadesHerdadas {
  /** Dia em que foram escolhidas (o último dia com prioridades antes de hoje, até 7 dias atrás). */
  dia: string;
  itens: (PrioridadeDoDia & { indice: number })[];
}

export async function prioridadesHerdadas(store: FilaStore, hoje = hojeSaoPaulo()): Promise<PrioridadesHerdadas | null> {
  for (let k = 1; k <= 7; k++) {
    const dia = somarDias(hoje, -k);
    const e = await store.estadoDoDia(dia);
    if (e.prioridades.length) return { dia, itens: e.prioridades.map((p, indice) => ({ ...p, indice })) };
  }
  return null;
}

/** Marca uma prioridade manual herdada como resolvida (fica registrado no dia de origem). */
export async function resolverPrioridade(store: FilaStore, ator: Ator, p: { dia: string; indice: number; desfazer?: boolean }) {
  if (ator.gestao) throw new ErroRegra("Quem resolve as prioridades do dia é a concierge.", 403);
  const hoje = hojeSaoPaulo();
  if (!isDiaIso(p.dia) || p.dia >= hoje || p.dia < somarDias(hoje, -7)) throw new ErroRegra("Prioridade de outro período.");
  const estado = await store.estadoDoDia(p.dia);
  const alvo = estado.prioridades[p.indice];
  if (!alvo) throw new ErroRegra("Prioridade não encontrada.", 404);
  if (alvo.ref) throw new ErroRegra("Esta prioridade segue a tarefa de origem: registre o andamento nela.");
  const prioridades = estado.prioridades.map((x, i) => (i === p.indice ? { ...x, resolvidaEm: p.desfazer ? null : new Date().toISOString(), resolvidaPor: p.desfazer ? null : ator.id } : x));
  await store.salvarEstadoDoDia(p.dia, { prioridades }, ator.id);
  await store.auditar({ actor: ator.email, action: p.desfazer ? "fila_prioridade_reaberta" : "fila_prioridade_resolvida", target: `daily_manual_figures/${p.dia}`, after: { indice: p.indice } });
}

/** Rascunho do fechamento (observação, decisões, prioridades revisadas), salvo no servidor. */
export async function salvarRascunho(store: FilaStore, ator: Ator, r: RascunhoFechamento): Promise<RascunhoFechamento> {
  if (ator.gestao) throw new ErroRegra("O fechamento do dia é da concierge; a gestão consulta.", 403);
  const dia = hojeSaoPaulo();
  const atual = (await store.estadoDoDia(dia)).rascunho ?? {};
  const novo: RascunhoFechamento = {
    ...atual,
    ...(r.observacao !== undefined ? { observacao: texto(r.observacao, 2000) ?? "" } : {}),
    ...(r.decisoes !== undefined ? { decisoes: texto(r.decisoes, 2000) ?? "" } : {}),
    ...(r.prioridadesConfirmadas !== undefined ? { prioridadesConfirmadas: r.prioridadesConfirmadas === true } : {}),
    salvoEm: new Date().toISOString(),
  };
  await store.salvarEstadoDoDia(dia, { rascunho: novo }, ator.id);
  return novo;
}
