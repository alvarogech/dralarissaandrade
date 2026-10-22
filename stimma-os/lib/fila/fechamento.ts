import { somarDias } from "./datas";
import type { Fila, ItemFila } from "./agrupamento";
import type { EventoRow, NumerosDoDia } from "./store";

/**
 * Fechamento do dia: montado a partir dos eventos registrados (nunca digitado de novo) + os
 * números manuais de agenda (opcionais — totais da clínica não são inventados a partir de uma
 * lista parcial). Sem totais financeiros nesta versão (módulo financeiro suspenso): uma cobrança
 * aparece só como ação realizada, e um recebimento só quando a concierge o registrou. O texto é copiado pela concierge para o WhatsApp; nada é enviado.
 *
 * Cada item leva uma referência curta ([T-1a2b3c] tarefa, [M-1a2b3c] marco): quando o feedback
 * é colado de volta na gestão, a referência liga a linha à tarefa sem depender de nome.
 * Nomes saem abreviados (primeiro nome + inicial).
 */
export interface LinhaAcao {
  ref: string;
  paciente: string;
  item: string;
  texto: string;
}

export interface Fechamento {
  dia: string;
  acoes: LinhaAcao[];
  contagens: { contatos: number; respostas: number; agendamentos: number; recebimentos: number; valorRecebido: number; encerrados: number; adiados: number };
  aguardando: { ref: string; paciente: string; item: string }[];
  agendamentos: { ref: string; paciente: string; data: string }[];
  recebimentos: { ref: string; paciente: string; valor: number; origem: string }[];
  cobrancasAbertas: { quantidade: number; total: number };
  pendentesHoje: number;
  atrasados: number;
  aConferir: number;
  prioridades: { ref: string; paciente: string; item: string; due: string }[];
  proximoDia: string;
  numeros: NumerosDoDia | null;
}

export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1]![0]!.toUpperCase()}.`;
}

export function refDoItem(alvo: { tipo: "marco" | "tarefa" | "atendimento"; id: string }): string {
  return `${alvo.tipo === "marco" ? "M" : alvo.tipo === "tarefa" ? "T" : "A"}-${alvo.id.replace(/-/g, "").slice(0, 6)}`;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Próximo dia útil (seg–sex) depois de `dia`. */
export function proximoDiaUtil(dia: string): string {
  let d = somarDias(dia, 1);
  for (;;) {
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    const dow = new Date(y, m - 1, dd).getDay();
    if (dow !== 0 && dow !== 6) return d;
    d = somarDias(d, 1);
  }
}

function descreverEvento(e: EventoRow): string {
  const nota = e.notes ? `: ${e.notes}` : "";
  const canal = e.channel ? ` por ${e.channel}` : "";
  switch (e.kind) {
    case "contato": return `contato${canal}${nota}`;
    case "resposta": return `respondeu${canal}${nota}`;
    case "agendamento_obtido": return `agendou consulta para ${dataBr(e.scheduledFor ?? "")}${nota}`;
    case "recebimento_confirmado": return `recebimento confirmado ${brl(e.amount ?? 0)} (${(e.amountOrigin ?? "").replace(/_/g, " ")})${nota}`;
    case "adiamento": return `adiado${nota}`;
    case "encerramento": return `encerrado${nota}`;
    case "atendimento_realizado": return `compareceu à consulta${nota}`;
    case "cancelamento": return `faltou à consulta${nota}`;
    case "correcao": return `ajustado pela gestão${nota}`;
    default: return `${e.kind}${nota}`;
  }
}

/**
 * `itens` = todos os itens conhecidos da fila (abertos e encerrados recentes), usados para
 * dar nome e referência aos alvos dos eventos.
 */
export function montarFechamento(dia: string, eventos: EventoRow[], fila: Fila, itens: ItemFila[], nomes: Record<string, string>, numeros: NumerosDoDia | null): Fechamento {
  const porAlvo = new Map(itens.filter((i) => i.alvo).map((i) => [i.alvo!.id, i]));
  const nome = (id: string) => nomeCurto(nomes[id] ?? "Paciente");
  const acoes: LinhaAcao[] = [];
  const agendamentos: Fechamento["agendamentos"] = [];
  const recebimentos: Fechamento["recebimentos"] = [];

  for (const e of eventos) {
    const alvos = e.alvos.map((a) => porAlvo.get(a.marcoId ?? a.tarefaId ?? "")).filter((x): x is ItemFila => !!x);
    const ref = alvos.map((a) => refDoItem(a.alvo!)).join(" ") || "—";
    const item = alvos.map((a) => a.titulo).join(" + ") || "item";
    acoes.push({ ref, paciente: nome(e.patientId), item, texto: descreverEvento(e) });
    if (e.kind === "agendamento_obtido") agendamentos.push({ ref, paciente: nome(e.patientId), data: e.scheduledFor ?? "" });
    if (e.kind === "recebimento_confirmado") recebimentos.push({ ref, paciente: nome(e.patientId), valor: e.amount ?? 0, origem: e.amountOrigin ?? "" });
  }

  const abertos = [...fila.atrasadas, ...fila.hoje, ...fila.aguardando, ...fila.proximas].flatMap((c) => c.itens);
  const cobrancas = abertos.filter((i) => i.tipo === "cobranca");
  const itensHoje = [...fila.atrasadas, ...fila.hoje].flatMap((c) => c.itens);
  const proximoDia = proximoDiaUtil(dia);
  const prioridades = [...fila.atrasadas, ...fila.hoje, ...fila.proximas]
    .flatMap((c) => c.itens.map((i) => ({ i, nome: c.pacienteNome })))
    .filter(({ i }) => i.status === "aberta" && i.due <= proximoDia)
    .sort((a, b) => a.i.due.localeCompare(b.i.due))
    .slice(0, 12)
    .map(({ i, nome: n }) => ({ ref: refDoItem(i.alvo!), paciente: nomeCurto(n), item: i.titulo, due: i.due }));

  const conta = (k: EventoRow["kind"]) => eventos.filter((e) => e.kind === k).length;
  return {
    dia,
    acoes,
    contagens: {
      contatos: conta("contato"), respostas: conta("resposta"), agendamentos: conta("agendamento_obtido"), recebimentos: conta("recebimento_confirmado"),
      valorRecebido: recebimentos.reduce((s, r) => s + r.valor, 0), encerrados: conta("encerramento"), adiados: conta("adiamento"),
    },
    aguardando: fila.aguardando.flatMap((c) => c.itens.map((i) => ({ ref: refDoItem(i.alvo!), paciente: nomeCurto(c.pacienteNome), item: i.titulo }))),
    agendamentos,
    recebimentos,
    cobrancasAbertas: { quantidade: cobrancas.length, total: cobrancas.reduce((s, i) => s + (i.valor ?? 0), 0) },
    pendentesHoje: itensHoje.filter((i) => i.tipo !== "conferir_atendimento").length,
    atrasados: fila.atrasadas.flatMap((c) => c.itens).filter((i) => i.tipo !== "conferir_atendimento").length,
    aConferir: itensHoje.filter((i) => i.tipo === "conferir_atendimento").length,
    prioridades,
    proximoDia,
    numeros,
  };
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return DIAS[new Date(y, m - 1, d).getDay()];
};

export function textoWhatsapp(f: Fechamento): string {
  const l: string[] = [`*Fechamento — ${dataBr(f.dia)} (${diaSemana(f.dia)})*`, ""];
  const n = f.numeros;
  if (n && (n.agendaPrevista !== null || n.agendaRealizada !== null)) {
    l.push(`*Agenda:* ${n.agendaPrevista ?? "—"} previstos · ${n.agendaRealizada ?? "—"} realizados`);
  }
  if (l.length > 2) l.push("");

  l.push(`*Ações do dia* (${f.acoes.length})`);
  if (!f.acoes.length) l.push("• Nenhuma ação registrada na fila hoje.");
  for (const a of f.acoes) l.push(`• ${a.paciente} — ${a.item}: ${a.texto} [${a.ref}]`);
  l.push("");

  l.push(`*Aguardando resposta* (${f.aguardando.length})`);
  for (const a of f.aguardando) l.push(`• ${a.paciente} — ${a.item} [${a.ref}]`);
  if (!f.aguardando.length) l.push("• Ninguém aguardando.");
  l.push("");

  l.push(`*Agendamentos obtidos* (${f.agendamentos.length})`);
  for (const a of f.agendamentos) l.push(`• ${a.paciente} — consulta em ${dataBr(a.data)} [${a.ref}]`);
  l.push("");

  l.push("*Pendências*");
  l.push(`• Para hoje ainda sem ação: ${f.pendentesHoje}${f.atrasados ? ` (${f.atrasados} atrasadas)` : ""}`);
  if (f.aConferir) l.push(`• Atendimentos a conferir no Simples Dental: ${f.aConferir}`);
  l.push("");

  l.push(`*Prioridades para ${dataBr(f.proximoDia)} (${diaSemana(f.proximoDia)})*`);
  if (!f.prioridades.length) l.push("• Nada vencendo.");
  for (const p of f.prioridades) l.push(`• ${p.paciente} — ${p.item}${p.due < f.proximoDia ? ` (desde ${dataBr(p.due)})` : ""} [${p.ref}]`);
  return l.join("\n");
}
