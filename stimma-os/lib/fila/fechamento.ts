import type { Fila } from "./agrupamento";
import type { EventoRow, NumerosDoDia } from "./store";

/**
 * Fechamento do dia: montado a partir dos eventos registrados (nunca digitado de novo) + os
 * números manuais de agenda/caixa. O texto é copiado pela concierge para o WhatsApp — nada é
 * enviado automaticamente. Nomes saem abreviados (primeiro nome + inicial).
 */
export interface Fechamento {
  dia: string;
  contatos: number;
  contatosMarcos: number;
  respostas: number;
  agendamentos: { paciente: string; data: string }[];
  recebimentos: { paciente: string; valor: number; origem: string }[];
  encerrados: number;
  adiados: number;
  pendentesHoje: number;
  atrasados: number;
  aguardando: number;
  aConferir: number;
  numeros: NumerosDoDia | null;
}

export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1]![0]!.toUpperCase()}.`;
}

export function montarFechamento(dia: string, eventos: EventoRow[], fila: Fila, nomes: Record<string, string>, numeros: NumerosDoDia | null): Fechamento {
  const nome = (id: string) => nomeCurto(nomes[id] ?? "Paciente");
  const de = (k: EventoRow["kind"]) => eventos.filter((e) => e.kind === k);
  const itensHoje = fila.hoje.flatMap((c) => c.itens);
  return {
    dia,
    contatos: de("contato").length,
    contatosMarcos: de("contato").filter((e) => e.alvos.some((a) => a.marcoId)).length,
    respostas: de("resposta").length,
    agendamentos: de("agendamento_obtido").map((e) => ({ paciente: nome(e.patientId), data: e.scheduledFor ?? "" })),
    recebimentos: de("recebimento_confirmado").map((e) => ({ paciente: nome(e.patientId), valor: e.amount ?? 0, origem: e.amountOrigin ?? "" })),
    encerrados: de("encerramento").length,
    adiados: de("adiamento").length,
    pendentesHoje: itensHoje.filter((i) => i.tipo !== "conferir_atendimento").length,
    atrasados: itensHoje.filter((i) => i.tipo !== "conferir_atendimento" && i.due < dia).length,
    aguardando: fila.aguardando.reduce((n, c) => n + c.itens.length, 0),
    aConferir: itensHoje.filter((i) => i.tipo === "conferir_atendimento").length,
    numeros,
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function textoWhatsapp(f: Fechamento): string {
  const [y, m, d] = f.dia.split("-").map(Number) as [number, number, number];
  const l: string[] = [`*Fechamento — ${dataBr(f.dia)} (${DIAS[new Date(y, m - 1, d).getDay()]})*`, ""];
  const n = f.numeros;
  if (n && (n.agendaPrevista !== null || n.agendaRealizada !== null)) {
    l.push(`*Agenda:* ${n.agendaPrevista ?? "—"} previstos · ${n.agendaRealizada ?? "—"} realizados`);
  }
  if (n && (n.caixaPrevisto !== null || n.caixaRecebido !== null)) {
    const sit = n.caixaSituacao ? ` — ${n.caixaSituacao}` : "";
    l.push(`*Caixa:* ${n.caixaPrevisto !== null ? brl(n.caixaPrevisto) : "—"} previsto · ${n.caixaRecebido !== null ? brl(n.caixaRecebido) : "—"} recebido${sit}`);
  }
  if (l.length > 2) l.push("");

  l.push("*Acompanhamento*");
  l.push(`• Contatos: ${f.contatos}${f.contatosMarcos ? ` (marcos 30/90/6m: ${f.contatosMarcos})` : ""}`);
  l.push(`• Respostas: ${f.respostas}`);
  l.push(`• Agendamentos obtidos: ${f.agendamentos.length}`);
  for (const a of f.agendamentos) l.push(`   – ${a.paciente}: consulta em ${dataBr(a.data)}`);
  const total = f.recebimentos.reduce((s, r) => s + r.valor, 0);
  l.push(`• Recebimentos confirmados: ${f.recebimentos.length}${f.recebimentos.length ? ` — ${brl(total)}` : ""}`);
  for (const r of f.recebimentos) l.push(`   – ${r.paciente}: ${brl(r.valor)} (${r.origem.replace(/_/g, " ")})`);
  if (f.adiados) l.push(`• Adiados (com nova data): ${f.adiados}`);
  if (f.encerrados) l.push(`• Encerrados: ${f.encerrados}`);
  l.push("");

  l.push("*Pendências*");
  l.push(`• Para hoje ainda sem ação: ${f.pendentesHoje}${f.atrasados ? ` (${f.atrasados} atrasadas)` : ""}`);
  l.push(`• Aguardando resposta: ${f.aguardando}`);
  if (f.aConferir) l.push(`• Atendimentos a conferir no Simples Dental: ${f.aConferir}`);
  return l.join("\n");
}
