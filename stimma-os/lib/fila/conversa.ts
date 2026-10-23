import { hojeSaoPaulo, isDiaIso } from "./datas";
import { ErroRegra, type Ator } from "./servico";
import type { FilaStore } from "./store";

/**
 * Comunicação no contexto da tarefa (sem chat à parte): orientação, pergunta/impedimento,
 * resposta da gestão e decisão viram eventos "nota" ligados à tarefa, com autor, data e horário.
 * Não contam como contato nem entram no feedback como registro.
 *
 *  - A concierge pergunta → a tarefa vai para "Aguardando gestão" e a próxima ação passa ao gestor.
 *  - A gestão responde/decide → pode devolver a próxima ação (com prazo) à concierge.
 * Encaminhar nunca encerra o caso.
 */
export const TIPOS_MENSAGEM = ["orientacao", "pergunta", "resposta_gestao", "decisao"] as const;
export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];

export const ROTULO_MENSAGEM: Record<TipoMensagem, string> = {
  orientacao: "Orientação", pergunta: "Pergunta ou impedimento", resposta_gestao: "Resposta da gestão", decisao: "Decisão",
};

export interface EntradaMensagem {
  eventoId: string;
  tarefaId: string;
  tipo: TipoMensagem;
  texto: string;
  /** Concierge: até quando precisa da resposta (revisão). */
  prazo?: string;
  /** Gestão: devolve a próxima ação a alguém, com prazo. */
  devolver?: { proximaAcao: string; prazo: string; responsavel?: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function enviarMensagem(store: FilaStore, ator: Ator, m: EntradaMensagem): Promise<{ duplicado: boolean }> {
  if (!UUID.test(m.eventoId)) throw new ErroRegra("eventoId inválido.");
  if (await store.eventoExiste(m.eventoId)) return { duplicado: true };
  if (!(TIPOS_MENSAGEM as readonly string[]).includes(m.tipo)) throw new ErroRegra("Tipo de mensagem inválido.");
  const texto = m.texto?.trim();
  if (!texto) throw new ErroRegra("Escreva a mensagem.");
  const t = await store.tarefa(m.tarefaId);
  if (!t) throw new ErroRegra("Tarefa não encontrada.", 404);
  if (["completed", "cancelled"].includes(t.status)) throw new ErroRegra("Tarefa encerrada: o histórico está preservado. Crie uma nova tarefa se precisar.");
  if (ator.gestao && m.tipo === "pergunta") throw new ErroRegra("Pergunta é da concierge; a gestão registra orientação, resposta ou decisão.");
  if (!ator.gestao && m.tipo !== "pergunta") throw new ErroRegra("A concierge registra perguntas ou impedimentos; orientação e decisão são da gestão.", 403);

  const hoje = hojeSaoPaulo();
  const config = await store.config();
  const perfis = await store.perfis();
  let patch: Parameters<FilaStore["atualizarTarefa"]>[1] | null = null;
  let devolvidaPara: string | null = null;

  if (m.tipo === "pergunta") {
    if (!config.gestorId) throw new ErroRegra("Gestor não configurado: não há para quem enviar a pergunta. Avise a administração.");
    if (!m.prazo || !isDiaIso(m.prazo) || m.prazo < hoje) throw new ErroRegra("Informe até quando precisa da resposta (hoje ou depois).");
    patch = { status: "waiting", waiting: true, aguardando: "gestao", assignedTo: config.gestorId, nextAction: `Responder: ${texto.slice(0, 160)}`, due: m.prazo };
  } else if (m.devolver) {
    const proxima = m.devolver.proximaAcao?.trim();
    if (!proxima) throw new ErroRegra("Ao devolver, informe a próxima ação.");
    if (!isDiaIso(m.devolver.prazo) || m.devolver.prazo < hoje) throw new ErroRegra("Ao devolver, informe o prazo (hoje ou depois).");
    devolvidaPara = m.devolver.responsavel ?? config.conciergeId;
    if (!devolvidaPara || !perfis.some((p) => p.id === devolvidaPara)) throw new ErroRegra("Escolha para quem devolver a próxima ação.");
    patch = { status: "open", aguardando: null, assignedTo: devolvidaPara, nextAction: proxima, due: m.devolver.prazo };
  }

  const nome = (id: string | null) => perfis.find((p) => p.id === id)?.nome ?? "—";
  await store.registrarEvento({
    id: m.eventoId, patientId: t.patientId, assunto: t.patientId ? null : t.assunto ?? t.title, kind: "nota", occurredOn: hoje, channel: null,
    notes: texto, amount: null, amountOrigin: null, scheduledFor: null, createdBy: ator.id,
    payload: {
      tipo: m.tipo, texto,
      ...(m.tipo === "pergunta" ? { prazo: m.prazo, para: nome(config.gestorId) } : {}),
      ...(m.devolver && devolvidaPara ? { devolvida_para: nome(devolvidaPara), proxima: m.devolver.proximaAcao.trim(), prazo: m.devolver.prazo } : {}),
    },
    alvos: [{ tarefaId: t.id }],
  });
  if (patch) await store.atualizarTarefa(t.id, patch);
  await store.marcarLido(t.id, ator.id); // quem escreveu já leu
  await store.auditar({ actor: ator.email, action: `fila_mensagem_${m.tipo}`, target: `tasks/${t.id}`, after: { evento: m.eventoId, devolvidaPara } });
  return { duplicado: false };
}

/** Registra que o usuário abriu o detalhe (histórico completo) da tarefa. */
export async function marcarTarefaLida(store: FilaStore, ator: Ator, tarefaId: string) {
  const t = await store.tarefa(tarefaId);
  if (!t) throw new ErroRegra("Tarefa não encontrada.", 404);
  await store.marcarLido(tarefaId, ator.id);
}
