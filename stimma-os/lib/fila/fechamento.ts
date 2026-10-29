import { somarDias } from "./datas";
import type { Fila, ItemFila } from "./agrupamento";
import type { Categoria, EstadoDoDia, EventoRow, NumerosDoDia, PrioridadeDoDia } from "./store";
import type { ResumoRotina } from "./rotina-itens";

/**
 * Feedback do dia, montado SÓ dos eventos persistidos daquela data (ações em tarefas e registros
 * espontâneos) + agenda manual + prioridades escolhidas. Cada evento entra em um único bloco
 * (pela área); resultados de hoje ficam separados das ações de hoje; um caso antigo que recebeu
 * resposta hoje entra como resultado, sem inventar contato. Dias anteriores não são reescritos
 * pela situação atual: para eles só aparecem os eventos daquele dia e o que foi gravado nele.
 *
 * Referências curtas ([T-1a2b3c] tarefa, [M-1a2b3c] marco) permitem colar o feedback de volta na
 * gestão sem depender de nomes. Nomes saem abreviados. Sem totais financeiros nesta versão.
 */
export interface LinhaFeedback {
  ref: string;
  paciente: string;
  item: string;
  texto: string;
  /** resultado de hoje (resposta, resolvido, agendado, compareceu/faltou) x ação de hoje */
  resultado: boolean;
  atencao: boolean;
}

export const BLOCOS = [
  { id: "agenda", titulo: "Agenda e comparecimento", categorias: ["agenda"] },
  { id: "oportunidade", titulo: "Oportunidades internas", categorias: ["oportunidade"] },
  { id: "recorrencia", titulo: "Recorrência e follow-up", categorias: ["recorrencia"] },
  { id: "continuidade", titulo: "Continuidade", categorias: ["continuidade"] },
  { id: "pos", titulo: "Pós-atendimento e relacionamento", categorias: ["pos_atendimento", "relacionamento"] },
  { id: "pendencia", titulo: "Pendências e alertas", categorias: ["pendencia", "encaminhamento"] },
] as const satisfies readonly { id: string; titulo: string; categorias: readonly Categoria[] }[];

export interface Bloco {
  id: (typeof BLOCOS)[number]["id"];
  titulo: string;
  linhas: LinhaFeedback[];
  /** Revisado e marcado "sem ocorrências" (só vale sem registros). */
  semOcorrencias: boolean;
}

export interface Contadores {
  /** Eventos da concierge no dia (ajustes da gestão não contam). */
  registros: number;
  /** Contato realizado = sim (cada registro conta uma tentativa). */
  tentativasContato: number;
  /** Pacientes distintas com contato realizado. */
  pacientesContatadas: number;
  /** Houve resposta = sim (não somam como contato). */
  respostas: number;
  agendamentos: number;
  comparecimentos: number;
  faltas: number;
  /** Casos encerrados como resolvidos hoje. */
  resolvidos: number;
  /** Marcos de acompanhamento distintos trabalhados nos registros do dia (um contato com 2 marcos = 1 contato, 2 marcos). */
  marcosTrabalhados: number;
}

export interface Fechamento {
  dia: string;
  /** Dia anterior a hoje: sem "pendências abertas" calculadas pela situação atual. */
  historico: boolean;
  blocos: Bloco[];
  contadores: Contadores;
  agenda: { prevista: number | null; realizada: number | null };
  pendentesAbertas: { ref: string; paciente: string; item: string; quando: string; aguardando: boolean }[];
  prioridades: PrioridadeDoDia[];
  prioridadesEscolhidas: boolean;
  sugestoes: { ref: string; texto: string; motivo: string }[];
  proximoDia: string;
  numeros: NumerosDoDia | null;
  /** Compat.: usados pelo resumo lateral da tela. */
  atrasados: number;
  aConferir: number;
  /** Rotina do dia da responsável (só no feedback de uma pessoa). */
  rotina: ResumoRotina | null;
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
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return DIAS[new Date(y, m - 1, d).getDay()];
};

/** Próximo dia útil (seg–sex) depois de `dia` — o mesmo termo em toda a interface. */
export function proximoDiaUtil(dia: string): string {
  let d = somarDias(dia, 1);
  for (;;) {
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    const dow = new Date(y, m - 1, dd).getDay();
    if (dow !== 0 && dow !== 6) return d;
    d = somarDias(d, 1);
  }
}

const CANAL: Record<string, string> = { whatsapp: " por WhatsApp", ligacao: " por ligação", presencial: " presencial", outro: "" };
const ROTULO_CATEGORIA: Record<string, string> = {
  agenda: "agenda", oportunidade: "oportunidade", recorrencia: "recorrência", continuidade: "continuidade", pos_atendimento: "pós-atendimento",
  relacionamento: "relacionamento", pendencia: "alerta", encaminhamento: "encaminhamento",
};

const CAT_DO_ITEM = (i: ItemFila | undefined): Categoria => (i?.categoria as Categoria | undefined) ?? (i?.tipo === "marco" ? "recorrencia" : "pendencia");

const contatoSim = (e: EventoRow) => e.contato === "sim" || (e.contato == null && e.kind === "contato");
const respostaSim = (e: EventoRow) => e.resposta === "sim" || (e.resposta == null && e.kind === "resposta");

function descrever(e: EventoRow): { texto: string; resultado: boolean } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  // Eventos antigos (antes do registro do dia) guardavam a descrição só em `notes`.
  const feito = typeof p.feito === "string" ? p.feito : e.situacao ? null : e.notes;
  if (contatoSim(e)) partes.push(`contato${CANAL[e.channel ?? ""] ?? (e.channel ? ` por ${e.channel}` : "")}${feito ? `: ${feito}` : ""}`);
  else if (feito) partes.push(feito);
  if (e.contato === "nao") partes.push("contato não realizado");
  if (respostaSim(e)) partes.push(`resposta: ${e.resultado ?? "registrada"}`);
  else if (e.resposta === "nao") partes.push("sem resposta");
  let resultado = respostaSim(e);
  switch (e.situacao ?? (e.kind === "agendamento_obtido" ? "agendado" : e.kind === "atendimento_realizado" ? "compareceu" : e.kind === "cancelamento" ? "faltou" : e.kind === "encerramento" ? "resolvido" : null)) {
    case "agendado": partes.push(`agendou consulta para ${dataBr(e.scheduledFor ?? "")}`); resultado = true; break;
    case "compareceu": partes.push("compareceu à consulta (conferir no Simples Dental)"); resultado = true; break;
    case "faltou": partes.push("faltou à consulta"); resultado = true; break;
    case "resolvido": partes.push(`resolvido${e.resultado && !respostaSim(e) ? `: ${e.resultado}` : ""}`); resultado = true; break;
    case "dispensado": partes.push("encerrado sem resolver"); break;
    case "aguardando": partes.push("aguardando resposta"); break;
    case "aguardando_gestao": partes.push(`aguardando gestão${typeof p.pergunta === "string" ? ` (${p.pergunta})` : ""}`); break;
    case "encaminhado": partes.push("encaminhado"); break;
  }
  if (typeof p.proxima === "string" && p.proxima) partes.push(`próxima: ${p.proxima}${p.responsavel ? ` (${p.responsavel})` : ""}${typeof p.prazo === "string" ? ` até ${dataBr(p.prazo)}` : ""}`);
  if (!partes.length && e.notes) partes.push(e.notes);
  if (e.kind === "recebimento_confirmado" && e.amount) partes.push(`recebimento registrado ${brl(e.amount)}${e.amountOrigin ? ` (${e.amountOrigin.replace(/_/g, " ")})` : ""}`);
  return { texto: partes.join("; ") || e.kind, resultado };
}

export interface EntradaFechamento {
  dia: string;
  hoje: string;
  eventos: EventoRow[];
  fila: Fila;
  itens: ItemFila[];
  nomes: Record<string, string>;
  numeros: NumerosDoDia | null;
  estado: EstadoDoDia;
  rotina?: ResumoRotina | null;
}

export function montarFechamento({ dia, hoje, eventos, fila, itens, nomes, numeros, estado, rotina = null }: EntradaFechamento): Fechamento {
  const historico = dia < hoje;
  const porAlvo = new Map(itens.filter((i) => i.alvo).map((i) => [i.alvo!.id, i]));
  const daConcierge = eventos.filter((e) => e.kind !== "correcao" && e.kind !== "nota");
  const nomeDe = (e: EventoRow) => (e.patientId ? nomeCurto(nomes[e.patientId] ?? "Paciente") : e.assunto ?? "Assunto");

  const blocos: Bloco[] = BLOCOS.map((b) => ({ id: b.id, titulo: b.titulo, linhas: [], semOcorrencias: false }));
  for (const e of daConcierge) {
    const alvos = e.alvos.map((a) => porAlvo.get(a.marcoId ?? a.tarefaId ?? "")).filter((x): x is ItemFila => !!x);
    const cat: Categoria = (e.categoria as Categoria | null) ?? CAT_DO_ITEM(alvos[0]);
    const bloco = blocos[BLOCOS.findIndex((b) => (b.categorias as readonly string[]).includes(cat))] ?? blocos[blocos.length - 1]!;
    const { texto, resultado } = descrever(e);
    const p = (e.payload ?? {}) as Record<string, unknown>;
    bloco.linhas.push({
      ref: alvos.map((a) => refDoItem(a.alvo!)).join(" "),
      paciente: nomeDe(e),
      // Contato feito numa atividade da rotina: o rótulo é a atividade (não a tarefa de retorno que ele criou).
      item: ((p.detalhes as Record<string, unknown> | undefined)?.rotina_item && typeof p.contexto === "string" ? p.contexto : null)
        ?? (alvos.map((a) => a.titulo).join(" + ") || (typeof p.contexto === "string" ? p.contexto : ROTULO_CATEGORIA[cat] ?? "registro")),
      texto, resultado, atencao: p.atencao === true,
    });
  }
  for (const [i, b] of BLOCOS.entries()) {
    blocos[i]!.semOcorrencias = !blocos[i]!.linhas.length && b.categorias.some((c) => estado.secoes[c] === "sem_ocorrencias");
  }

  const comContato = daConcierge.filter(contatoSim);
  const contadores: Contadores = {
    registros: daConcierge.length,
    tentativasContato: comContato.length,
    pacientesContatadas: new Set(comContato.map((e) => e.patientId ?? `assunto:${e.assunto}`)).size,
    respostas: daConcierge.filter(respostaSim).length,
    agendamentos: daConcierge.filter((e) => e.situacao === "agendado" || (!e.situacao && e.kind === "agendamento_obtido")).length,
    comparecimentos: daConcierge.filter((e) => e.situacao === "compareceu" || (!e.situacao && e.kind === "atendimento_realizado")).length,
    faltas: daConcierge.filter((e) => e.situacao === "faltou" || (!e.situacao && e.kind === "cancelamento")).length,
    resolvidos: daConcierge.filter((e) => e.situacao === "resolvido" || (!e.situacao && e.kind === "encerramento")).length,
    marcosTrabalhados: new Set(daConcierge.flatMap((e) => e.alvos.map((a) => a.marcoId).filter(Boolean))).size,
  };

  const proximoDia = proximoDiaUtil(dia);
  // Pendência comercial que ficou com a Mel (ou a gestão) sai daqui: tem seção própria na prestação.
  const daGabi = (i: ItemFila) => !(i.retornoDe === "rotina:conferencia_mel" && !i.responsavelId);
  const aguardando = fila.aguardando.flatMap((c) => c.itens.map((i) => ({ i, nome: c.pacienteNome }))).filter(({ i }) => daGabi(i));
  const abertasProximas = [...fila.atrasadas, ...fila.hoje, ...fila.proximas]
    .flatMap((c) => c.itens.map((i) => ({ i, nome: c.pacienteNome })))
    .filter(({ i }) => i.status === "aberta" && i.due <= proximoDia && i.tipo !== "conferir_atendimento" && daGabi(i));
  const nomeItem = (i: ItemFila, n: string) => (i.semPaciente ? n : nomeCurto(n));
  const pendentesAbertas = historico ? [] : [
    ...abertasProximas.map(({ i, nome }) => ({ ref: refDoItem(i.alvo!), paciente: nomeItem(i, nome), item: i.titulo, quando: i.due < dia ? `vencida desde ${dataBr(i.due)}` : `prazo ${dataBr(i.due)}`, aguardando: false })),
    ...aguardando.map(({ i, nome }) => ({ ref: refDoItem(i.alvo!), paciente: nomeItem(i, nome), item: i.titulo, quando: `${i.aguardando === "gestao" ? "aguardando gestão" : "aguardando resposta"}${i.due ? ` (rever em ${dataBr(i.due)})` : ""}`, aguardando: true })),
  ];

  const sugestoes = historico ? [] : [
    ...itens.filter((i) => i.status !== "concluida" && i.atencao).map((i) => ({ i, motivo: "atenção (reclamação ou pedido de avaliação)" })),
    ...abertasProximas.filter(({ i }) => i.due < dia).map(({ i }) => ({ i, motivo: "vencida" })),
    ...abertasProximas.filter(({ i }) => i.due >= dia).map(({ i }) => ({ i, motivo: `prazo ${dataBr(i.due)}` })),
    ...aguardando.filter(({ i }) => i.due && i.due <= proximoDia).map(({ i }) => ({ i, motivo: "aguardando resposta" })),
  ]
    .filter((s, idx, arr) => arr.findIndex((x) => x.i.id === s.i.id) === idx)
    .slice(0, 10)
    .map(({ i, motivo }) => ({ ref: refDoItem(i.alvo!), texto: `${i.semPaciente ? i.pacienteNome : nomeCurto(i.pacienteNome)} — ${i.titulo}`, motivo }));

  const prioridadesEscolhidas = estado.prioridades.length > 0;
  const itensHoje = [...fila.atrasadas, ...fila.hoje].flatMap((c) => c.itens);
  return {
    dia, historico, blocos, contadores,
    agenda: { prevista: numeros?.agendaPrevista ?? null, realizada: numeros?.agendaRealizada ?? null },
    pendentesAbertas,
    prioridades: prioridadesEscolhidas ? estado.prioridades : sugestoes.slice(0, 5).map((s) => ({ ref: s.ref, texto: s.texto })),
    prioridadesEscolhidas, sugestoes, proximoDia, numeros,
    atrasados: fila.atrasadas.flatMap((c) => c.itens).filter((i) => i.tipo !== "conferir_atendimento").length,
    aConferir: itensHoje.filter((i) => i.tipo === "conferir_atendimento").length,
    rotina,
  };
}

export function textoWhatsapp(f: Fechamento): string {
  const l: string[] = [`*Fechamento — ${dataBr(f.dia)} (${diaSemana(f.dia)})*`, ""];
  const c = f.contadores;
  l.push(`Registros: ${c.registros} · Tentativas de contato: ${c.tentativasContato} (${c.pacientesContatadas} pacientes) · Respostas: ${c.respostas} · Agendamentos: ${c.agendamentos} · Comparecimentos: ${c.comparecimentos} · Resolvidos: ${c.resolvidos}${c.marcosTrabalhados ? ` · Marcos trabalhados: ${c.marcosTrabalhados}` : ""}`);
  l.push("");

  for (const b of f.blocos) {
    const temAgenda = b.id === "agenda" && (f.agenda.prevista !== null || f.agenda.realizada !== null);
    if (!b.linhas.length && !b.semOcorrencias && !temAgenda) continue;
    l.push(`*${b.titulo}*`);
    if (temAgenda) {
      const dif = f.agenda.prevista !== null && f.agenda.realizada !== null ? f.agenda.prevista - f.agenda.realizada : null;
      l.push(`• Agenda: ${f.agenda.prevista ?? "—"} previstos · ${f.agenda.realizada ?? "—"} realizados${dif ? ` (diferença de ${dif} para conferir — não é necessariamente falta)` : ""}`);
    }
    if (b.semOcorrencias) l.push("• Sem ocorrências.");
    const acoes = b.linhas.filter((x) => !x.resultado);
    const resultados = b.linhas.filter((x) => x.resultado);
    const ref = (x: LinhaFeedback) => (x.ref ? ` [${x.ref}]` : "");
    for (const x of resultados) l.push(`• ${x.atencao ? "⚠️ " : ""}Resultado — ${x.paciente} · ${x.item}: ${x.texto}${ref(x)}`);
    for (const x of acoes) l.push(`• ${x.atencao ? "⚠️ " : ""}${x.paciente} · ${x.item}: ${x.texto}${ref(x)}`);
    l.push("");
  }

  // Rotina do dia: estados do checklist, sem valores nem dados de paciente.
  if (f.rotina) {
    const r = f.rotina;
    l.push("*Rotina do dia*");
    if (!r.registrada) l.push("• Rotina não registrada.");
    else {
      if (r.feitos.length) l.push(`• Concluídos (${r.feitos.length}): ${r.feitos.join("; ")}`);
      if (r.naoSeAplica.length) l.push(`• Não se aplica (${r.naoSeAplica.length}): ${r.naoSeAplica.join("; ")}`);
      // Quantidades da rotina (cobranças, aniversários, contatos, resgate): só números, sem pacientes.
      for (const q of r.quantidades) l.push(`• ${q.atencao ? "⚠️ " : ""}${q.item} — ${q.texto}`);
      for (const i of r.impedimentos) l.push(`• ⚠️ Impedimento — ${i.item}: ${i.motivo}; próxima ação: ${i.proxima}${i.responsavel ? ` (${i.responsavel})` : ""}${i.prazo ? ` até ${dataBr(i.prazo)}` : ""}`);
      if (r.pendentes.length) l.push(`• Ainda a fazer (${r.pendentes.length}): ${r.pendentes.join("; ")}`);
    }
    l.push("");
  }

  if (!f.historico) {
    l.push(`*Pendências que permanecem abertas* (${f.pendentesAbertas.length})`);
    if (!f.pendentesAbertas.length) l.push("• Nenhuma até o próximo dia útil.");
    for (const p of f.pendentesAbertas) l.push(`• ${p.paciente} — ${p.item} (${p.quando}) [${p.ref}]`);
    if (f.aConferir) l.push(`• Atendimentos a conferir no Simples Dental: ${f.aConferir}`);
    l.push("");
  }

  l.push(`*Prioridades para o próximo dia útil (${diaSemana(f.proximoDia)}, ${dataBr(f.proximoDia)})*${f.prioridadesEscolhidas ? "" : f.prioridades.length ? " — sugeridas" : ""}`);
  if (!f.prioridades.length) l.push("• Nenhuma definida.");
  for (const p of f.prioridades) {
    const extra = [p.prioridade === "alta" ? "prioridade alta" : "", p.paciente ? `paciente: ${p.paciente}` : "", p.data ? `até ${dataBr(p.data)}` : "", p.proxima ? `próxima ação: ${p.proxima}` : "", p.origem ? `origem: ${p.origem}` : ""].filter(Boolean);
    l.push(`• ${p.texto}${extra.length ? ` (${extra.join("; ")})` : ""}${p.ref ? ` [${p.ref}]` : ""}`);
  }
  return l.join("\n").replace(/\n{3,}/g, "\n\n");
}
