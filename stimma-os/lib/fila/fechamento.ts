import { somarDias } from "./datas";
import type { Fila, ItemFila } from "./agrupamento";
import type { Categoria, EstadoDoDia, EventoRow, NumerosDoDia, PrioridadeDoDia } from "./store";
import { itemDaRotina, type ResumoRotina } from "./rotina-itens";
import { contagemConsistente, contarRegistros, fraseDoRegistro, lerRegistro, normalizarTexto } from "./leitura-registro";

/**
 * Feedback do dia, montado SÓ dos eventos persistidos daquela data (ações em tarefas e registros
 * espontâneos) + agenda manual + prioridades escolhidas. Cada evento entra em um único bloco
 * (pela área); resultados de hoje ficam separados das ações de hoje; um caso antigo que recebeu
 * resposta hoje entra como resultado, sem inventar contato. Dias anteriores não são reescritos
 * pela situação atual: para eles só aparecem os eventos daquele dia e o que foi gravado nele.
 *
 * Cada linha segue a regra paciente → ação → resposta → desfecho → próximo passo, lida por
 * leitura-registro.ts (a mesma leitura que alimenta os contadores). Referências curtas ([T-1a2b3c]
 * tarefa, [M-1a2b3c] marco) ficam nos dados do fechamento e na versão entregue — não no texto do
 * WhatsApp (03/11). Nomes saem abreviados.
 */
export interface LinhaFeedback {
  ref: string;
  paciente: string;
  item: string;
  texto: string;
  /** Agrupa os registros da mesma paciente numa linha só por área. */
  pacienteChave: string;
  /** resultado de hoje (resposta, resolvido, agendado, compareceu/faltou) x ação de hoje */
  resultado: boolean;
  atencao: boolean;
  /** O que falta para o registro ser compreensível (vazio = completo). */
  incompleto: string[];
  /** Mensagem sem retorno esperado (aniversário): entra agregada. */
  mensagem: boolean;
}

export const BLOCOS = [
  { id: "agenda", titulo: "Agenda e comparecimento", categorias: ["agenda"] },
  { id: "oportunidade", titulo: "Oportunidades internas", categorias: ["oportunidade"] },
  { id: "continuidade", titulo: "Continuidade de tratamentos", categorias: ["continuidade"] },
  { id: "recorrencia", titulo: "Acompanhamentos (30/90/180 dias) e resgate", categorias: ["recorrencia"] },
  { id: "pos", titulo: "Pós-atendimento e relacionamento", categorias: ["pos_atendimento", "relacionamento"] },
  { id: "pendencia", titulo: "Cobranças, encaminhamentos e alertas", categorias: ["pendencia", "encaminhamento"] },
] as const satisfies readonly { id: string; titulo: string; categorias: readonly Categoria[] }[];

export interface Bloco {
  id: (typeof BLOCOS)[number]["id"];
  titulo: string;
  linhas: LinhaFeedback[];
  /** Revisado e marcado "sem ocorrências" (só vale sem registros). */
  semOcorrencias: boolean;
}

/** Fórmulas em leitura-registro.ts (contarRegistros) — as mesmas da prestação de contas e da tela. */
export interface Contadores {
  /** Eventos da concierge no dia (ajustes da gestão não contam). */
  registros: number;
  /** Tentativas efetivas de contato (cada registro conta uma; mensagem de aniversário não conta). */
  tentativasContato: number;
  /** Pacientes distintas com tentativa. */
  pacientesContatadas: number;
  /** Respostas reais descritas (resposta vazia ou genérica não conta). */
  respostas: number;
  pacientesResponderam: number;
  /** Marcadas como "respondeu" sem a resposta descrita (aparecem como incompletas). */
  respostasIncompletas: number;
  semResposta: number;
  naoRealizados: number;
  /** Mensagens sem retorno esperado (aniversário). */
  mensagens: number;
  registrosIncompletos: number;
  /** tentativas = respondeu + resposta incompleta + sem resposta (falso = classificação a conferir). */
  consistente: boolean;
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
  pendentesAbertas: { ref: string; paciente: string; item: string; quando: string; aguardando: boolean; vencida: boolean; gestao: boolean; due: string | null }[];
  /** Situação atual das pendências (só no dia de hoje; null em dias anteriores). */
  situacaoPendencias: { abertas: number; vencidas: number; aguardandoPaciente: number; aguardandoGestao: number } | null;
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
    const r = lerRegistro(e);
    const p = (e.payload ?? {}) as Record<string, unknown>;
    let texto = fraseDoRegistro(r);
    // Recebimento registrado numa ação da fila (formato anterior): valor e origem, sem presumir mais nada.
    if (e.kind === "recebimento_confirmado" && e.amount) texto = `${texto === "Registro sem descrição." ? "" : `${texto} `}Recebimento registrado: ${brl(e.amount)}${e.amountOrigin ? ` (${e.amountOrigin.replace(/_/g, " ")})` : ""}.`.trim();
    bloco.linhas.push({
      ref: alvos.map((a) => refDoItem(a.alvo!)).join(" "),
      paciente: nomeDe(e),
      pacienteChave: e.patientId ?? `assunto:${e.assunto ?? e.id}`,
      // Contato feito numa atividade da rotina: o rótulo é a atividade (não a tarefa de retorno que ele criou).
      item: ((p.detalhes as Record<string, unknown> | undefined)?.rotina_item && typeof p.contexto === "string" ? p.contexto : null)
        ?? (alvos.map((a) => a.titulo).join(" + ") || (typeof p.contexto === "string" ? p.contexto : ROTULO_CATEGORIA[cat] ?? "registro")),
      texto,
      resultado: r.estado === "respondeu" || ["agendou", "resolvido", "compareceu", "faltou"].includes(r.desfecho ?? ""),
      atencao: r.atencao || r.desfecho === "encaminhado_profissional",
      incompleto: r.incompleto,
      mensagem: r.estado === "mensagem",
    });
  }
  for (const [i, b] of BLOCOS.entries()) {
    blocos[i]!.semOcorrencias = !blocos[i]!.linhas.length && b.categorias.some((c) => estado.secoes[c] === "sem_ocorrencias");
  }

  const c = contarRegistros(daConcierge);
  const contadores: Contadores = {
    registros: c.registros,
    tentativasContato: c.tentativas,
    pacientesContatadas: c.pacientesContatadas,
    respostas: c.respostas,
    pacientesResponderam: c.pacientesResponderam,
    respostasIncompletas: c.respostasIncompletas,
    semResposta: c.semResposta,
    naoRealizados: c.naoRealizados,
    mensagens: c.mensagens,
    agendamentos: c.agendamentos,
    comparecimentos: daConcierge.filter((e) => e.situacao === "compareceu" || (!e.situacao && e.kind === "atendimento_realizado")).length,
    faltas: daConcierge.filter((e) => e.situacao === "faltou" || (!e.situacao && e.kind === "cancelamento")).length,
    resolvidos: c.resolvidos,
    registrosIncompletos: c.registrosIncompletos,
    marcosTrabalhados: new Set(daConcierge.flatMap((e) => e.alvos.map((a) => a.marcoId).filter(Boolean))).size,
    consistente: contagemConsistente(c),
  };

  const proximoDia = proximoDiaUtil(dia);
  // Pendência comercial que ficou com a Mel (ou a gestão) sai daqui: tem seção própria na prestação.
  const daGabi = (i: ItemFila) => !((i.retornoDe === "rotina:conferencia_mel" || i.retornoDe?.startsWith("planejamento:")) && !i.responsavelId);
  const aguardando = fila.aguardando.flatMap((c) => c.itens.map((i) => ({ i, nome: c.pacienteNome }))).filter(({ i }) => daGabi(i));
  const abertas = [...fila.atrasadas, ...fila.hoje, ...fila.proximas]
    .flatMap((c) => c.itens.map((i) => ({ i, nome: c.pacienteNome })))
    .filter(({ i }) => i.status === "aberta" && i.tipo !== "conferir_atendimento" && daGabi(i));
  const abertasProximas = abertas.filter(({ i }) => i.due <= proximoDia);
  const nomeItem = (i: ItemFila, n: string) => (i.semPaciente ? n : nomeCurto(n));
  const pendentesAbertas = historico ? [] : [
    ...abertasProximas.map(({ i, nome }) => ({
      ref: refDoItem(i.alvo!), paciente: nomeItem(i, nome), item: tituloComOrigem(i), quando: i.due < dia ? `vencida desde ${dataBr(i.due)}` : `prazo ${dataBr(i.due)}`,
      aguardando: false, vencida: i.due < dia, gestao: false, due: i.due,
    })),
    ...aguardando.map(({ i, nome }) => ({
      ref: refDoItem(i.alvo!), paciente: nomeItem(i, nome), item: tituloComOrigem(i), quando: `${i.aguardando === "gestao" ? "aguardando gestão" : "aguardando resposta"}${i.due ? ` (rever em ${dataBr(i.due)})` : ""}`,
      aguardando: true, vencida: !!i.due && i.due < dia, gestao: i.aguardando === "gestao", due: i.due,
    })),
  ];
  const situacaoPendencias = historico ? null : {
    abertas: abertas.length + aguardando.length,
    vencidas: abertas.filter(({ i }) => i.due < dia).length + aguardando.filter(({ i }) => i.due && i.due < dia).length,
    aguardandoPaciente: aguardando.filter(({ i }) => i.aguardando !== "gestao").length,
    aguardandoGestao: aguardando.filter(({ i }) => i.aguardando === "gestao").length,
  };

  const sugestoes = historico ? [] : [
    ...itens.filter((i) => i.status !== "concluida" && i.atencao).map((i) => ({ i, motivo: "atenção (reclamação ou pedido de avaliação)" })),
    ...abertasProximas.filter(({ i }) => i.due < dia).map(({ i }) => ({ i, motivo: "vencida" })),
    ...abertasProximas.filter(({ i }) => i.due >= dia).map(({ i }) => ({ i, motivo: `prazo ${dataBr(i.due)}` })),
    ...aguardando.filter(({ i }) => i.due && i.due <= proximoDia).map(({ i }) => ({ i, motivo: "aguardando resposta" })),
  ]
    .filter((s, idx, arr) => arr.findIndex((x) => x.i.id === s.i.id) === idx)
    .slice(0, 10)
    .map(({ i, motivo }) => ({ ref: refDoItem(i.alvo!), texto: `${i.semPaciente ? i.pacienteNome : nomeCurto(i.pacienteNome)} — ${tituloComOrigem(i)}`, motivo }));

  const prioridadesEscolhidas = estado.prioridades.length > 0;
  const itensHoje = [...fila.atrasadas, ...fila.hoje].flatMap((c) => c.itens);
  return {
    dia, historico, blocos, contadores,
    agenda: { prevista: numeros?.agendaPrevista ?? null, realizada: numeros?.agendaRealizada ?? null },
    pendentesAbertas, situacaoPendencias,
    prioridades: prioridadesEscolhidas ? estado.prioridades : sugestoes.slice(0, 5).map((s) => ({ ref: s.ref, texto: s.texto })),
    prioridadesEscolhidas, sugestoes, proximoDia, numeros,
    atrasados: fila.atrasadas.flatMap((c) => c.itens).filter((i) => i.tipo !== "conferir_atendimento").length,
    aConferir: itensHoje.filter((i) => i.tipo === "conferir_atendimento").length,
    rotina,
  };
}

/**
 * Título da pendência com a atividade de origem quando o título sozinho é genérico — duas pendências
 * "Verificar se respondeu" da mesma paciente vindas de acompanhamentos diferentes ficam distinguíveis
 * (são obrigações diferentes; a mesma obrigação já é reaproveitada no registro, ver followup.ts).
 */
export function tituloComOrigem(i: Pick<ItemFila, "titulo" | "retornoDe">): string {
  const chave = i.retornoDe ?? "";
  const origem = chave.startsWith("rotina:") ? itemDaRotina(chave.slice(7))?.curto ?? null : null;
  return origem && !normalizarTexto(i.titulo).includes(normalizarTexto(origem)) ? `${i.titulo} (${origem.toLowerCase()})` : i.titulo;
}

/** Partes da prestação de contas que não saem do fechamento por áreas (montadas em prestacao.ts). */
export interface ExtrasWhatsapp {
  /** Conferência de recebimentos (linhas já prontas). */
  financeiro?: string[];
  /** Conferência comercial e planejamentos (linhas com os próprios títulos). */
  comercial?: string[];
  solicitacoes?: string[];
  /** Pendências que aguardam a gestão (linhas prontas) — vão em "Atenção da gestão". */
  decisoesGestao?: string[];
  decisoesTexto?: string | null;
  observacao?: string | null;
  /** Quantidade de retornos vencidos/outros números de rotina já calculados. */
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Fechamento para o WhatsApp — relatório executivo, não transcrição do banco:
 * resumo → agenda → continuidade → acompanhamentos → pós/relacionamento → oportunidades/cobranças →
 * comercial → financeiro → atenção da gestão → prioridades. Sem códigos internos (as referências
 * ficam no sistema, ligadas à versão entregue), sem campos vazios e sem seções vazias. Mensagens de
 * aniversário entram agregadas; cada paciente com movimentação relevante aparece uma vez por área.
 */
export function textoWhatsapp(f: Fechamento, x: ExtrasWhatsapp = {}): string {
  const l: string[] = [`*STIMMA | Fechamento — ${dataBr(f.dia)} (${diaSemana(f.dia)})*`, ""];
  const c = f.contadores;

  // 1. Resumo do dia (só números confiáveis; nada conferido = não aparece como zero)
  l.push("*Resumo do dia*");
  if (!c.tentativasContato && !c.respostas && !c.respostasIncompletas && !c.mensagens && !c.registros) l.push("• Nenhum registro de paciente hoje.");
  else {
    if (c.tentativasContato) l.push(`• Pacientes contatadas: ${c.pacientesContatadas}${c.tentativasContato !== c.pacientesContatadas ? ` (${plural(c.tentativasContato, "tentativa", "tentativas")})` : ""}`);
    const resp = [
      `Responderam: ${c.pacientesResponderam}`,
      c.semResposta ? `sem resposta: ${c.semResposta}` : "",
      c.respostasIncompletas ? `resposta não descrita: ${c.respostasIncompletas}` : "",
      c.naoRealizados ? `contatos não realizados: ${c.naoRealizados}` : "",
    ].filter(Boolean);
    if (c.tentativasContato || c.respostas) l.push(`• ${resp.join(" · ")}`);
    l.push(`• Agendamentos: ${c.agendamentos} · Pendências resolvidas: ${c.resolvidos}`);
    if (c.registrosIncompletos) l.push(`• ⚠️ Registros incompletos: ${c.registrosIncompletos} (identificados abaixo)`);
  }
  const atencaoN = f.blocos.reduce((n, b) => n + b.linhas.filter((y) => y.atencao).length, 0);
  if (f.situacaoPendencias) {
    const s = f.situacaoPendencias;
    l.push(`• Pendências em aberto: ${s.abertas}${s.vencidas ? ` (${plural(s.vencidas, "vencida", "vencidas")})` : ""}${s.aguardandoGestao ? ` · aguardando a gestão: ${s.aguardandoGestao}` : ""}`);
  }
  if (atencaoN) l.push(`• ⚠️ Pacientes que precisam de atenção: ${atencaoN}`);
  if (f.rotina?.registrada) {
    const r = f.rotina;
    const total = r.feitos.length + r.naoSeAplica.length + r.pendentes.length + r.impedimentos.length;
    l.push(`• Rotina: ${r.feitos.length} de ${total} itens feitos${r.naoSeAplica.length ? ` · ${r.naoSeAplica.length} não se aplicam` : ""}${r.pendentes.length ? ` · ainda a fazer: ${r.pendentes.length}` : ""}`);
    for (const q of r.quantidades) l.push(`• ${q.atencao ? "⚠️ " : ""}${q.item}: ${q.texto}`);
  } else if (f.rotina) l.push("• Rotina não registrada.");
  l.push("");

  // 2–4. Áreas com pacientes: uma linha por paciente (registros do dia juntos, na ordem)
  for (const b of f.blocos) {
    const temAgenda = b.id === "agenda" && (f.agenda.prevista !== null || f.agenda.realizada !== null);
    const linhas = b.linhas.filter((y) => !y.mensagem);
    const mensagens = b.linhas.filter((y) => y.mensagem);
    if (!linhas.length && !mensagens.length && !b.semOcorrencias && !temAgenda) continue;
    l.push(`*${b.titulo}*`);
    if (temAgenda) {
      const dif = f.agenda.prevista !== null && f.agenda.realizada !== null ? f.agenda.prevista - f.agenda.realizada : null;
      l.push(`• Agenda: ${f.agenda.prevista ?? "não conferida"} previstos · ${f.agenda.realizada ?? "não conferida"} realizados${dif ? ` (diferença de ${dif} para conferir — não é necessariamente falta)` : ""}`);
    }
    if (b.semOcorrencias) l.push("• Sem ocorrências.");
    const porPaciente = new Map<string, LinhaFeedback[]>();
    for (const y of linhas) porPaciente.set(y.pacienteChave, [...(porPaciente.get(y.pacienteChave) ?? []), y]);
    const variosItens = new Set(linhas.map((y) => y.item)).size > 1;
    const grupos = [...porPaciente.values()].sort((a, z) => Number(z.some((y) => y.atencao || y.incompleto.length)) - Number(a.some((y) => y.atencao || y.incompleto.length)));
    for (const g of grupos) {
      const rotulo = variosItens ? ` · ${[...new Set(g.map((y) => y.item))].join(" + ")}` : "";
      const texto = g.map((y, i) => (i ? `Depois: ${y.texto}` : y.texto)).join(" ");
      l.push(`• ${g.some((y) => y.atencao) ? "⚠️ " : ""}${g[0]!.paciente}${rotulo} — ${texto}`);
    }
    if (mensagens.length) {
      const porItem = new Map<string, number>();
      for (const y of mensagens) porItem.set(y.item, (porItem.get(y.item) ?? 0) + 1);
      for (const [item, n] of porItem) l.push(`• ${item}: ${plural(n, "mensagem enviada", "mensagens enviadas")}.`);
    }
    l.push("");
  }

  // 5. Comercial e planejamentos (seções próprias, já com título)
  if (x.comercial?.length) l.push(...x.comercial, "");

  // 6. Financeiro
  if (x.financeiro?.length) l.push("*Financeiro*", ...x.financeiro.map((y) => `• ${y}`), "");

  if (x.solicitacoes?.length) l.push("*Solicitações da gestão*", ...x.solicitacoes.map((y) => `• ${y}`), "");

  // 7. Atenção da gestão — só o que precisa de decisão, autorização ou ciência
  const atencao: string[] = [];
  for (const p of f.pendentesAbertas.filter((y) => y.gestao)) atencao.push(`${p.paciente} — ${p.item}${p.due ? ` (resposta até ${dataBr(p.due)})` : ""}`);
  for (const d of x.decisoesGestao ?? []) atencao.push(d);
  for (const i of f.rotina?.impedimentos ?? []) atencao.push(`Impedimento na rotina — ${i.item}: ${i.motivo}${i.proxima ? `; próximo passo: ${i.proxima}` : ""}${i.responsavel ? ` (${i.responsavel})` : ""}${i.prazo ? ` até ${dataBr(i.prazo)}` : ""}`);
  const incompletos = f.blocos.flatMap((b) => b.linhas.filter((y) => y.incompleto.length).map((y) => `${y.paciente} (${y.item.toLowerCase()})`));
  if (incompletos.length) atencao.push(`Registros sem a informação essencial (orientação, resposta ou resultado): ${incompletos.join(", ")}`);
  if (!f.contadores.consistente) atencao.push("Os totais de contato não fecham com os registros — conferir antes de usar os números.");
  const decisoes = x.decisoesTexto?.trim();
  if (atencao.length || decisoes) {
    l.push("*Atenção da gestão*", ...atencao.map((y) => `• ${y}`));
    if (decisoes) l.push(`• Decisões pedidas pela Gabi: ${decisoes}`);
    l.push("");
  }

  // 8. Prioridades do próximo dia útil (escolhidas ou sugeridas; sem listar todas as tarefas abertas)
  l.push(`*Prioridades — ${diaSemana(f.proximoDia)}, ${dataBr(f.proximoDia)}*${f.prioridadesEscolhidas ? "" : f.prioridades.length ? " (sugeridas)" : ""}`);
  if (!f.prioridades.length) l.push("• Nenhuma definida.");
  for (const p of f.prioridades) {
    const extra = [p.prioridade === "alta" ? "prioridade alta" : "", p.paciente ? `paciente: ${p.paciente}` : "", p.data ? `até ${dataBr(p.data)}` : "", p.proxima ? `próxima ação: ${p.proxima}` : "", p.origem ? `origem: ${p.origem}` : ""].filter(Boolean);
    l.push(`• ${p.texto}${extra.length ? ` (${extra.join("; ")})` : ""}`);
  }
  if (!f.historico) {
    const vencidas = f.pendentesAbertas.filter((y) => y.vencida && !y.gestao && !f.prioridades.some((p) => p.ref === y.ref));
    if (vencidas.length) {
      l.push(`Vencidas fora das prioridades (${vencidas.length}):`);
      for (const p of vencidas.slice(0, 5)) l.push(`• ${p.paciente} — ${p.item} (${p.quando})`);
      if (vencidas.length > 5) l.push(`• e mais ${vencidas.length - 5} no STIMMA OS.`);
    }
    if (f.aConferir) l.push(`• Atendimentos a conferir no Simples Dental: ${f.aConferir}`);
  }

  const obs = x.observacao?.trim();
  if (obs) l.push("", "*Observações do dia*", obs);
  return l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
