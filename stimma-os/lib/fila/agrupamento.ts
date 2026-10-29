import { somarDias } from "./datas";

/**
 * Fila única da concierge: cartões por paciente, em cinco seções (atrasadas, hoje, aguardando,
 * próximas, concluídas hoje). Itens da mesma paciente que vencem em até 14 dias aparecem como
 * "pode ser tratado junto" — desmarcados por padrão; tratar junto é sempre uma escolha da
 * concierge, nunca automática.
 */
export const JANELA_JUNTO_DIAS = 14;

export type Secao = "atrasadas" | "hoje" | "aguardando" | "proximas" | "concluidas";

export interface ItemFila {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  tipo: string;
  titulo: string;
  status: "aberta" | "aguardando" | "concluida";
  /** Data em que a ação deve acontecer (AAAA-MM-DD). */
  due: string;
  concluidaEm?: string;
  valor?: number;
  detalhe?: string;
  contexto?: string;
  proximaAcao?: string;
  responsavel?: string;
  subtipo?: string;
  /** Área do acompanhamento (bloco do feedback). */
  categoria?: string;
  /** Assunto sem paciente vinculada. */
  semPaciente?: boolean;
  /** Reclamação/pedido de avaliação — aparece como ponto de atenção. */
  atencao?: boolean;
  /** Próxima etapa do cuidado (informada pela Dra.), separada da próxima ação administrativa. */
  etapa?: { definicao?: string; situacao?: string; data?: string; motivo?: string };
  aConferir?: string[];
  alvo?: { tipo: "marco" | "tarefa" | "atendimento"; id: string };
  /** Perfil responsável pela próxima ação (null = sem responsável definido). */
  responsavelId?: string | null;
  /** Em status "aguardando": esperando a paciente ou a gestão. */
  aguardando?: "paciente" | "gestao";
  origem?: string;
  /** Data da informação de origem. */
  origemData?: string;
  prioridade?: "alta" | "normal" | "baixa";
  /** Orientação da gestão e resultado esperado (o que fazer). */
  orientacao?: string;
  resultadoEsperado?: string;
  /** Solicitação extraordinária da gestão e quem pediu. */
  extraordinaria?: boolean;
  /** Retorno de contato sem resposta (regra global de follow-up) e o tipo dele. */
  followup?: string;
  solicitadoPor?: string;
  criadaEm?: string;
  /** Falta/cancelamento: ocorrência conhecida (ausente = não informada; nunca presumida). */
  ocorrencia?: "falta" | "cancelamento";
  dataOcorrencia?: string;
  /** Marcos: atendimento de referência e prazo original. */
  dataAtendimento?: string;
  prazoOriginal?: string;
  adiamentos?: number;
  /** Última atualização (último registro ou criação). */
  atualizadoEm?: string;
  /** Há registro de outra pessoa que este usuário ainda não leu no detalhe. */
  naoLido?: boolean;
}

export interface ItemJunto {
  item: ItemFila;
  marcado: false;
}

export interface CartaoPaciente {
  pacienteId: string;
  pacienteNome: string;
  itens: ItemFila[];
  junto: ItemJunto[];
  /** Dias de atraso do item mais antigo (0 = vence hoje). */
  atrasoDias: number;
}

export type Fila = Record<Secao, CartaoPaciente[]>;

function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((s) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b! - a!) / 86_400_000);
}

/** Seção-base do item; "hoje" vira "atrasadas" depois, por cartão, se algum item estiver vencido. */
export function secaoDoItem(it: ItemFila, hoje: string): Exclude<Secao, "atrasadas"> | null {
  if (it.status === "concluida") return it.concluidaEm === hoje ? "concluidas" : null;
  if (it.status === "aguardando") return "aguardando";
  return it.due <= hoje ? "hoje" : "proximas";
}

export function montarFila(itens: ItemFila[], hoje: string): Fila {
  const fila: Fila = { atrasadas: [], hoje: [], aguardando: [], proximas: [], concluidas: [] };
  const porSecao = new Map<Secao, Map<string, CartaoPaciente>>();
  const limiteJunto = somarDias(hoje, JANELA_JUNTO_DIAS);

  for (const it of itens) {
    const secao = secaoDoItem(it, hoje);
    if (!secao) continue;
    const mapa = porSecao.get(secao) ?? new Map<string, CartaoPaciente>();
    porSecao.set(secao, mapa);
    const cartao = mapa.get(it.pacienteId) ?? { pacienteId: it.pacienteId, pacienteNome: it.pacienteNome, itens: [], junto: [], atrasoDias: 0 };
    mapa.set(it.pacienteId, cartao);
    cartao.itens.push(it);
  }

  // Em "hoje", puxa as próximas da mesma paciente dentro da janela como sugestão; elas saem de "próximas".
  const hojeMapa = porSecao.get("hoje");
  const proxMapa = porSecao.get("proximas");
  if (hojeMapa && proxMapa) {
    for (const [pid, cartao] of hojeMapa) {
      const prox = proxMapa.get(pid);
      if (!prox) continue;
      const dentro = prox.itens.filter((i) => i.due <= limiteJunto);
      cartao.junto = dentro.sort((a, b) => a.due.localeCompare(b.due)).map((item) => ({ item, marcado: false }));
      prox.itens = prox.itens.filter((i) => i.due > limiteJunto);
      if (!prox.itens.length) proxMapa.delete(pid);
    }
  }

  for (const secao of ["hoje", "aguardando", "proximas", "concluidas"] as const) {
    const cartoes = [...(porSecao.get(secao)?.values() ?? [])];
    for (const c of cartoes) {
      c.itens.sort((a, b) => a.due.localeCompare(b.due));
      c.atrasoDias = secao === "hoje" ? Math.max(0, diasEntre(c.itens[0]!.due, hoje)) : 0;
    }
    cartoes.sort((a, b) => a.itens[0]!.due.localeCompare(b.itens[0]!.due) || a.pacienteNome.localeCompare(b.pacienteNome, "pt-BR"));
    if (secao === "hoje") {
      fila.atrasadas = cartoes.filter((c) => c.atrasoDias > 0);
      fila.hoje = cartoes.filter((c) => c.atrasoDias === 0);
    } else {
      fila[secao] = cartoes;
    }
  }
  return fila;
}
