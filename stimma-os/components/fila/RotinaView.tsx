"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ESTADOS_ROTINA, GRUPOS_ROTINA, MAX_QUANTIDADE, ROTULO_ESTADO_ROTINA, itensDoDia, textoDoItem, textoMetricas, type EstadoRotina, type GrupoRotina, type ItemRotina, type MetricasRotina } from "@/lib/fila/rotina-itens";
import type { ContatoDaRotina, RotinaCarregada } from "@/lib/fila/rotina";
import { FormContatoRotina } from "./FormContatoRotina";
import { ConferenciaComercialView } from "./ConferenciaComercialView";
import { PlanejamentoPresencialView } from "./PlanejamentoPresencialView";
import { FormOcorrenciaAgenda } from "./FormOcorrenciaAgenda";
import { prazoFollowup, tipoFollowup } from "@/lib/fila/followup";
import type { RotinaItemRow } from "@/lib/fila/store";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr, soHora } from "./comum";

/**
 * Rotina do dia da concierge: três grupos recolhíveis (início, durante, fechamento) com progresso,
 * cada item com quatro estados num seletor compacto. Itens semanais/mensais (cobranças seg/sex,
 * contatos 15/30/90 dias, resgate, dia 20) só aparecem no dia deles. Só o estado e quantidades são
 * gravados — nada de nomes, telefones, valores, documentos ou dados clínicos.
 *
 * Salvamento: cada escolha é enviada na hora; "Salvo" só aparece depois da confirmação do servidor.
 * Se falhar, a escolha continua na tela com "Tentar novamente" (nada some). Quantidades salvam ao
 * sair do campo — sem botão extra. "Com impedimento" pede motivo e próxima ação, com a explicação
 * junto do campo. A gestão vê em leitura (quem marca é a concierge, pela conta dela).
 */
interface Props {
  rotina: RotinaCarregada;
  perfis: { id: string; nome: string }[];
  /** Tarefas abertas que podem ser relacionadas a um item (evita criar duplicata). */
  tarefas: { id: string; rotulo: string }[];
  hoje: string;
  /** Título exibido (ex.: "Rotina da Gabi" para a gestão). */
  titulo: string;
  abertaInicial?: boolean;
  /** Explica por que a rotina está em leitura (ex.: "a Gabi marca pela conta dela"). */
  motivoLeitura?: string;
  /** Gestão: mostra onde configurar links ausentes. */
  gestao?: boolean;
  /** Dentro do percurso guiado: sem cabeçalho recolhível próprio (a etapa já tem título). */
  embutida?: boolean;
  /**
   * Conteúdo de cada grupo além dos itens fixos (prioridades herdadas, solicitações da gestão,
   * acompanhamentos em aberto, conferência de recebimentos, agenda). `resumo` aparece no cabeçalho.
   */
  extras?: Partial<Record<GrupoRotina, { conteudo: React.ReactNode; resumo?: string; atencao?: boolean }>>;
  /** Pacientes já registradas hoje em cada atividade com pacientes. */
  contatos?: Record<string, ContatoDaRotina[]>;
  pacientes?: { id: string; nome: string }[];
  usuarioId?: string;
  proximoDiaUtil?: string;
}

const TOM: Record<EstadoRotina, string> = {
  a_fazer: "border-border-strong bg-surface text-text-secondary",
  feito: "border-opportunity bg-opportunity-bg text-opportunity",
  nao_se_aplica: "border-border-strong bg-surface-raised text-text-secondary",
  impedimento: "border-critical bg-critical-bg text-critical",
};
const ROTULO_CURTO: Record<EstadoRotina, string> = { a_fazer: "A fazer", feito: "Feito", nao_se_aplica: "Não se aplica", impedimento: "Impedimento" };
const RESPONSAVEIS_EXTERNOS = [["gestao", "Gestão"], ["comercial_externa", "Comercial Externa"], ["dra_larissa", "Dra. Larissa"]] as const;

export interface ContagemRotina { total: number; respondidos: number; feitos: number; naoSeAplica: number; impedimentos: number }

export function contarRotina(itens: ItemRotina[], estado: (k: string) => EstadoRotina): ContagemRotina {
  const c = { total: itens.length, respondidos: 0, feitos: 0, naoSeAplica: 0, impedimentos: 0 };
  for (const i of itens) {
    const e = estado(i.key);
    if (e !== "a_fazer") c.respondidos++;
    if (e === "feito") c.feitos++;
    if (e === "nao_se_aplica") c.naoSeAplica++;
    if (e === "impedimento") c.impedimentos++;
  }
  return c;
}

/** "3 feitas · 1 não se aplica · 1 com impedimento" — respondida ≠ executada. */
export function detalheContagem(c: ContagemRotina): string {
  return [c.feitos ? `${c.feitos} feita${c.feitos > 1 ? "s" : ""}` : "", c.naoSeAplica ? `${c.naoSeAplica} não se aplica` : "", c.impedimentos ? `${c.impedimentos} com impedimento` : ""].filter(Boolean).join(" · ");
}

export function RotinaView({ rotina, perfis, tarefas, hoje, titulo, abertaInicial = true, motivoLeitura, gestao = false, embutida = false, extras = {}, contatos = {}, pacientes = [], usuarioId = "", proximoDiaUtil = hoje }: Props) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Record<string, RotinaItemRow>>(() => Object.fromEntries(rotina.linhas.map((l) => [l.itemKey, l])));
  const [aberta, setAberta] = useState(abertaInicial);
  // Só os itens que valem no dia (data local da clínica): fixos + semanais/mensais do dia.
  const itensDia = itensDoDia(rotina.dia);
  const doDia = itensDia.filter((i) => i.agenda);
  const estado = (k: string): EstadoRotina => linhas[k]?.estado ?? "a_fazer";
  const total = contarRotina(itensDia, estado);
  const editavel = rotina.editavel;
  const nomeResp = (r: string | null) => (!r ? null : r.startsWith("perfil:") ? perfis.find((p) => p.id === r.slice(7))?.nome ?? null : RESPONSAVEIS_EXTERNOS.find(([k]) => k === r)?.[1] ?? null);

  // Grupos abertos: lembra a escolha do dia; sem escolha, abre o primeiro com itens a fazer.
  const chave = `stimma-rotina-grupos:${rotina.dia}`;
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    const primeiro = GRUPOS_ROTINA.find((g) => itensDia.some((i) => i.grupo === g.id && estado(i.key) === "a_fazer"));
    // Prioridades de hoje sempre abertas quando existem; depois, o primeiro grupo com algo a fazer.
    const abrir = [extras.prioridades ? "prioridades" : null, primeiro?.id ?? null].filter((x): x is string => !!x);
    return new Set(editavel ? abrir : GRUPOS_ROTINA.map((g) => g.id));
  });
  useEffect(() => {
    if (!editavel) return;
    try {
      const s = JSON.parse(localStorage.getItem(chave) ?? "null");
      // Preferência do dia, mas o que pede atenção (atraso) abre de qualquer jeito.
      if (Array.isArray(s)) setAbertos(new Set([...s.filter((x) => typeof x === "string"), ...GRUPOS_ROTINA.filter((g) => extras[g.id]?.atencao).map((g) => g.id)]));
    } catch { /* sem armazenamento: fica o padrão */ }
  }, [chave, editavel]); // eslint-disable-line react-hooks/exhaustive-deps
  function alternarGrupo(id: string) {
    const n = new Set(abertos);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setAbertos(n);
    try { localStorage.setItem(chave, JSON.stringify([...n])); } catch { /* ignora */ }
  }

  // Atualiza o resto da página (resumo, feedback) um pouco depois da última marcação.
  const atualizar = useRef<ReturnType<typeof setTimeout> | null>(null);
  function aoSalvar(l: RotinaItemRow) {
    setLinhas((x) => ({ ...x, [l.itemKey]: l }));
    if (atualizar.current) clearTimeout(atualizar.current);
    atualizar.current = setTimeout(() => router.refresh(), 1200);
  }
  useEffect(() => () => { if (atualizar.current) clearTimeout(atualizar.current); }, []);

  const corpo = (
    <>
      {rotina.doDiaAnterior && (
        <div role="status" className="mt-3 rounded-control border border-important bg-important-bg px-3 py-2 text-[13.5px] text-important">
          <p className="font-medium">Impedimentos registrados em {dataBr(rotina.doDiaAnterior.dia)} (o dia de hoje começa do zero; confira se seguem):</p>
          <ul className="mt-1 list-disc pl-5">
            {rotina.doDiaAnterior.linhas.map((l) => (
              <li key={l.itemKey}>{textoDoItem(l.itemKey)} — {l.motivo}; próxima ação: {l.proximaAcao}{l.prazo ? ` até ${dataBr(l.prazo)}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      {editavel && <p className="mt-3 text-[13.5px] text-text-secondary">Marque o que aconteceu em cada atividade. Cada marcação é salva na hora.</p>}
      <div className="mt-3 flex flex-col gap-2.5">
        {GRUPOS_ROTINA.map((g) => {
          const itens = itensDia.filter((i) => i.grupo === g.id);
          const extra = extras[g.id];
          if (!itens.length && !extra) return null;
          const c = contarRotina(itens, estado);
          const aberto = abertos.has(g.id);
          const det = detalheContagem(c);
          return (
            <section key={g.id} className="overflow-hidden rounded-card border border-border bg-surface">
              <h3>
                <button type="button" onClick={() => alternarGrupo(g.id)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-text-primary">{g.titulo}</span>
                    <span className="mt-0.5 block text-[13px] text-text-secondary">
                      {itens.length > 0 && <>{c.respondidos} de {c.total} registradas{det ? <span className="text-text-muted"> · {det}</span> : null}</>}
                      {itens.length > 0 && extra?.resumo ? " · " : null}
                      {extra?.resumo && <span className={extra.atencao ? "font-medium text-critical" : undefined}>{extra.resumo}</span>}
                    </span>
                  </span>
                  {itens.length > 0 && (
                    <span aria-hidden className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-raised sm:block">
                      <span className={clsx("block h-full", c.respondidos === c.total ? "bg-opportunity" : "bg-accent")} style={{ width: `${c.total ? (c.respondidos / c.total) * 100 : 0}%` }} />
                    </span>
                  )}
                  {itens.length > 0 && c.respondidos === c.total && !extra && <span className="text-[12.5px] font-medium text-opportunity">Concluído</span>}
                  <span aria-hidden className="text-text-muted">{aberto ? "▴" : "▾"}</span>
                </button>
              </h3>
              {aberto && (
                <div className="border-t border-border">
                  {itens.length > 0 && (
                    <ul className="flex flex-col divide-y divide-border px-4">
                      {itens.map((i) => (
                        <LinhaRotina key={i.key} item={i} linha={linhas[i.key]} editavel={editavel} perfis={perfis} tarefas={tarefas} hoje={hoje} nomeResp={nomeResp}
                          link={i.link ? rotina.links[i.link.config] ?? null : null} gestao={gestao} onSalvo={aoSalvar}
                          contatos={contatos[i.key] ?? []} pacientes={pacientes} usuarioId={usuarioId} proximoDiaUtil={proximoDiaUtil} aoRegistrar={() => router.refresh()} />
                      ))}
                    </ul>
                  )}
                  {extra && <div className={clsx("px-4 pb-4", itens.length ? "border-t border-border pt-3" : "pt-3")}>{extra.conteudo}</div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-text-muted">
        Estados e quantidades entram no feedback do dia automaticamente (nada é enviado sozinho). Casos de pacientes continuam nas pendências e no Simples Dental — a rotina não cria tarefas por paciente.
      </p>
    </>
  );

  if (embutida) {
    return (
      <section aria-label={titulo}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] text-text-secondary">
            <strong className="text-text-primary">{total.respondidos} de {total.total}</strong> atividades registradas
            {detalheContagem(total) && <span className="text-text-muted"> · {detalheContagem(total)}</span>}
          </p>
          {doDia.length > 0 && <p className="text-[12.5px] text-text-secondary">Hoje também: {doDia.map((i) => i.curto ?? i.texto).join(" · ")}</p>}
        </div>
        {!editavel && <p className="mt-1 text-[12.5px] text-text-muted">Somente leitura{motivoLeitura ? ` (${motivoLeitura})` : ""}.</p>}
        {corpo}
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label={titulo}>
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span>
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">{titulo}</span>
          <span className="mt-0.5 block text-[13px] text-text-secondary">
            {dataBr(rotina.dia)} · {total.respondidos}/{total.total} registradas
            {total.impedimentos > 0 && <span className="font-medium text-critical"> · {total.impedimentos} com impedimento</span>}
            {!editavel && <span className="text-text-muted"> · somente leitura{motivoLeitura ? ` (${motivoLeitura})` : ""}</span>}
          </span>
          {doDia.length > 0 && <span className="mt-0.5 block text-[12.5px] text-text-secondary">Hoje também: {doDia.map((i) => i.curto ?? i.texto).join(" · ")}</span>}
        </span>
        <span aria-hidden className="text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && <div className="border-t border-border px-4 pb-4">{corpo}</div>}
    </section>
  );
}

/** Valores do formulário de quantidades (texto para números; booleano para sim/não). */
type FormMetricas = Record<string, string | boolean>;
const formDeMetricas = (item: ItemRotina, m?: MetricasRotina): FormMetricas =>
  Object.fromEntries((item.metricas ?? []).map((d) => [d.key, d.tipo === "sim_nao" ? m?.[d.key] === true : typeof m?.[d.key] === "number" ? String(m[d.key]) : ""]));
function metricasDoForm(item: ItemRotina, f: FormMetricas): { ok: true; m: MetricasRotina } | { ok: false; campo: string; erro: string } {
  const m: MetricasRotina = {};
  for (const d of item.metricas ?? []) {
    const v = f[d.key];
    if (d.tipo === "sim_nao") { if (v === true) m[d.key] = true; continue; }
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) continue; // vazio = não informado (não vira zero)
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTIDADE) return { ok: false, campo: d.key, erro: `Use um número inteiro de 0 a ${MAX_QUANTIDADE}.` };
    m[d.key] = n;
  }
  return { ok: true, m };
}
const mesmasMetricas = (a: MetricasRotina, b: MetricasRotina | null | undefined) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());

type Envio = { estado: EstadoRotina; metricas?: MetricasRotina; impedimento?: { motivo: string; proximaAcao: string; prazo: string; responsavel: string; tarefaId: string } };

function LinhaRotina({ item, linha, editavel, perfis, tarefas, hoje, nomeResp, onSalvo, link, gestao, contatos, pacientes, usuarioId, proximoDiaUtil, aoRegistrar }: {
  item: ItemRotina; linha?: RotinaItemRow; editavel: boolean; perfis: Props["perfis"]; tarefas: Props["tarefas"]; hoje: string;
  nomeResp: (r: string | null) => string | null; onSalvo: (l: RotinaItemRow) => void; link: string | null; gestao: boolean;
  contatos: ContatoDaRotina[]; pacientes: { id: string; nome: string }[]; usuarioId: string; proximoDiaUtil: string; aoRegistrar: () => void;
}) {
  // Atividade com pacientes: "Feito" só depois de ao menos uma paciente registrada.
  const [formPaciente, setFormPaciente] = useState<null | "livre" | "concluir">(null);
  const [formOcorrencia, setFormOcorrencia] = useState(false);
  const [registradasAgora, setRegistradasAgora] = useState(0);
  const salvo: EstadoRotina = linha?.estado ?? "a_fazer";
  const [pendente, setPendente] = useState<Envio | null>(null);
  const [status, setStatus] = useState<"ocioso" | "salvando" | "salvo" | "erro">("ocioso");
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [formImpedimento, setFormImpedimento] = useState(false);
  const [f, setF] = useState({ motivo: linha?.motivo ?? "", proximaAcao: linha?.proximaAcao ?? "", prazo: linha?.prazo ?? "", responsavel: linha?.responsavel ?? "", tarefaId: linha?.tarefaId ?? "" });
  const [errosImp, setErrosImp] = useState<{ motivo?: string; proximaAcao?: string }>({});
  const [fm, setFm] = useState<FormMetricas>(() => formDeMetricas(item, linha?.metricas));
  const [erroMetrica, setErroMetrica] = useState<{ campo: string; erro: string } | null>(null);
  const seq = useRef(0);
  const refMotivo = useRef<HTMLInputElement>(null);
  const refProxima = useRef<HTMLInputElement>(null);
  const atual: EstadoRotina = pendente?.estado ?? salvo;
  const resumoMetricas = textoMetricas(item, linha?.metricas);
  const id = `rotina-${item.key}`;
  const conferencia = !!item.conferenciaComercial;
  const semMovimentacao = linha?.metricas?.sem_movimentacao === true;

  async function enviar(envio: Envio): Promise<boolean> {
    const n = ++seq.current;
    setPendente(envio);
    setStatus("salvando");
    setFalha(null);
    const imp = envio.impedimento;
    const r = await chamarApi<{ item: RotinaItemRow }>("/api/fila/rotina", "POST", {
      itemKey: item.key, estado: envio.estado,
      ...(envio.estado === "impedimento" && imp ? { motivo: imp.motivo, proximaAcao: imp.proximaAcao, prazo: imp.prazo || null, responsavel: imp.responsavel || null } : {}),
      tarefaId: imp?.tarefaId || linha?.tarefaId || null,
      ...(item.metricas ? { metricas: envio.metricas ?? linha?.metricas ?? {} } : {}),
    });
    if (n !== seq.current) return false; // uma escolha mais nova já foi enviada
    if (!r.ok) {
      setStatus("erro");
      setFalha({ erro: r.incerto ? "Não conseguimos confirmar se esta informação foi salva." : `Não conseguimos salvar esta informação. ${r.erro}`, status: r.status });
      return false;
    }
    setPendente(null);
    setStatus("salvo");
    setFormImpedimento(false);
    onSalvo(r.data.item);
    return true;
  }

  function escolher(e: EstadoRotina) {
    if (e === "impedimento") {
      setFormImpedimento(true);
      setTimeout(() => refMotivo.current?.focus(), 0);
      return;
    }
    setFormImpedimento(false);
    if (e === "feito" && item.pacientes && contatos.length + registradasAgora === 0 && !(conferencia && semMovimentacao)) {
      setFormPaciente("concluir");
      return;
    }
    const q = item.metricas ? metricasDoForm(item, fm) : null;
    void enviar({ estado: e, metricas: q ? (q.ok ? q.m : linha?.metricas ?? {}) : undefined });
  }

  function salvarImpedimento(ev: React.FormEvent) {
    ev.preventDefault();
    const erros: typeof errosImp = {};
    if (!f.motivo.trim()) erros.motivo = "Explique brevemente o que dificultou a execução, para que a gestão possa acompanhar.";
    if (!f.proximaAcao.trim()) erros.proximaAcao = "Informe o que vai ser feito em seguida (ex.: tentar de novo amanhã às 9h).";
    setErrosImp(erros);
    if (erros.motivo) return refMotivo.current?.focus();
    if (erros.proximaAcao) return refProxima.current?.focus();
    void enviar({ estado: "impedimento", impedimento: { ...f, motivo: f.motivo.trim(), proximaAcao: f.proximaAcao.trim() } });
  }

  // Quantidades: salvam ao sair do campo (ou Enter), só se mudaram; o estado atual é mantido.
  function salvarMetricas() {
    const q = metricasDoForm(item, fm);
    if (!q.ok) return setErroMetrica({ campo: q.campo, erro: q.erro });
    setErroMetrica(null);
    if (mesmasMetricas(q.m, pendente?.metricas ?? linha?.metricas)) return;
    void enviar({ estado: atual === "a_fazer" ? "feito" : atual, metricas: q.m, impedimento: atual === "impedimento" ? { ...f } : undefined });
  }

  function tentarDeNovo() {
    if (pendente) void enviar(pendente);
  }

  const mostrarQuantidades = editavel && !conferencia && item.metricas && (atual === "feito" || Object.keys(linha?.metricas ?? {}).length > 0);

  return (
    <li className="py-3" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-[14.5px] text-text-primary">
            {item.texto}
            {item.agenda && <span className="ml-2 inline-flex items-center rounded-sm border border-border px-1.5 align-middle text-[11.5px] font-medium leading-5 text-text-secondary">{item.agenda.rotulo}</span>}
          </p>
          {item.dica && <p className="text-[12.5px] text-text-muted">{item.dica}</p>}
          {item.link && (link
            ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-[12.5px] text-accent underline underline-offset-4">{item.link.rotulo} <span aria-hidden>↗</span><span className="sr-only"> (abre em nova aba)</span></a>
            : gestao && <p className="text-[12px] text-text-muted">Link do script não configurado (Feedbacks › Links da rotina).</p>)}
          {!editavel && resumoMetricas && <p className="mt-0.5 text-[13px] text-text-secondary">{resumoMetricas}</p>}
          {salvo === "impedimento" && linha && !formImpedimento && (
            <p className="mt-1 text-[13px] text-critical">
              Impedimento: {linha.motivo} · Próxima ação: {linha.proximaAcao}{nomeResp(linha.responsavel) ? ` (${nomeResp(linha.responsavel)})` : ""}{linha.prazo ? ` até ${dataBr(linha.prazo)}` : ""}
              {editavel && <> · <button type="button" className="underline underline-offset-4" onClick={() => { setFormImpedimento(true); setTimeout(() => refMotivo.current?.focus(), 0); }}>editar</button></>}
            </p>
          )}
          {linha?.tarefaId && <p className="text-[12.5px] text-text-secondary">Relacionado a: {tarefas.find((t) => t.id === linha.tarefaId)?.rotulo ?? "tarefa existente"}</p>}
        </div>
        {editavel ? (
          <div role="radiogroup" aria-label={`O que aconteceu: ${item.texto}`} className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-control border border-border-strong bg-border-strong sm:inline-flex sm:w-auto sm:gap-0 sm:bg-surface">
            {ESTADOS_ROTINA.map((e, k) => (
              <button key={e} type="button" role="radio" aria-checked={atual === e} onClick={() => escolher(e)}
                className={clsx("min-h-10 px-2.5 text-[12.5px] transition-colors focus-visible:relative focus-visible:z-10 sm:min-h-9", k > 0 && "sm:border-l sm:border-border-strong",
                  atual === e ? `${TOM[e]} font-semibold` : "bg-surface text-text-secondary hover:bg-surface-hover")}>
                {atual === e && <span aria-hidden>✓ </span>}
                <span className="sm:hidden">{ROTULO_CURTO[e]}</span><span className="hidden sm:inline">{ROTULO_ESTADO_ROTINA[e]}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className={clsx("inline-flex items-center rounded-sm border px-1.5 text-[12px] font-medium leading-5", TOM[salvo])}>{ROTULO_ESTADO_ROTINA[salvo]}</span>
        )}
      </div>

      {item.roteiro && (
        <details className="mt-1.5 rounded-control border border-border bg-surface-raised">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[13px] text-text-secondary">O que conferir ({item.roteiro.length} pontos)</summary>
          <ol className="list-decimal space-y-0.5 border-t border-border px-2.5 py-2 pl-7 text-[13px] text-text-secondary">{item.roteiro.map((r) => <li key={r}>{r}</li>)}</ol>
        </details>
      )}
      {item.ocorrencias && (contatos.length > 0 || editavel) && (
        <div className="mt-2">
          {contatos.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-[13px] text-text-secondary" aria-label="Ocorrências registradas">
              {contatos.map((x) => <li key={x.eventoId}>{x.resultado} · <span className="text-text-primary">{x.paciente}</span></li>)}
            </ul>
          )}
          {editavel && !formOcorrencia && (
            <button type="button" className="mt-1 text-[13px] font-medium text-accent underline-offset-4 hover:underline" onClick={() => setFormOcorrencia(true)}>+ Registrar ocorrência</button>
          )}
          {editavel && formOcorrencia && (
            <FormOcorrenciaAgenda pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil} onSalvo={aoRegistrar} onFechar={() => setFormOcorrencia(false)} />
          )}
        </div>
      )}
      {conferencia && (
        <>
          {formPaciente === "concluir" && !contatos.length && <p role="status" className="mt-2 text-[13px] text-important">Para marcar como feito, registre as pacientes conferidas ou confirme que não houve movimentação comercial.</p>}
          <ConferenciaComercialView registros={contatos} pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil}
            editavel={editavel} semMovimentacao={semMovimentacao}
            onSemMovimento={() => enviar({ estado: "feito", metricas: { sem_movimentacao: true } })}
            onMudou={() => {
              aoRegistrar();
              // Registrou paciente: "sem movimentação" deixa de valer; pediu "Feito" antes: conclui agora.
              if (semMovimentacao) void enviar({ estado: "feito", metricas: { sem_movimentacao: false } });
              else if (formPaciente === "concluir" && atual !== "feito") { setFormPaciente(null); void enviar({ estado: "feito", metricas: {} }); }
            }} />
        </>
      )}
      {item.planejamentoAnual && (contatos.length > 0 || editavel) && (
        <PlanejamentoPresencialView registros={contatos} pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil} editavel={editavel} onMudou={aoRegistrar} />
      )}
      {item.pacientes && !conferencia && (contatos.length > 0 || editavel) && (
        <div className="mt-2">
          {contatos.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-[13px] text-text-secondary" aria-label={`Pacientes registradas: ${item.curto ?? item.texto}`}>
              {contatos.map((x) => <li key={x.eventoId}><span className="text-text-primary">{x.paciente}</span> · {x.resultado}</li>)}
            </ul>
          )}
          {item.pacientes.meta && <p className="text-[12.5px] text-text-muted">{contatos.length} de {item.pacientes.meta} (meta do dia)</p>}
          {editavel && !formPaciente && (
            <button type="button" className="mt-1 text-[13px] font-medium text-accent underline-offset-4 hover:underline" onClick={() => setFormPaciente("livre")}>
              + Registrar paciente{contatos.length ? "" : "s"}
            </button>
          )}
          {editavel && formPaciente && (
            <FormContatoRotina item={item} pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil}
              prazoSugerido={prazoFollowup(tipoFollowup(item.pacientes.categoria, item.key), hoje)}
              aviso={formPaciente === "concluir" && contatos.length + registradasAgora === 0 ? "Para marcar como feito, registre quem foi contatada (uma ou mais pacientes)." : undefined}
              onSalvo={() => {
                setRegistradasAgora((n) => n + 1);
                aoRegistrar();
                // Pediu "Feito" antes de registrar: conclui depois da primeira paciente gravada.
                if (formPaciente === "concluir" && atual !== "feito") void enviar({ estado: "feito", metricas: item.metricas ? linha?.metricas ?? {} : undefined });
              }}
              onFechar={() => setFormPaciente(null)} />
          )}
        </div>
      )}

      {mostrarQuantidades && (
        <div className="mt-2 flex flex-wrap items-end gap-3" role="group" aria-label={`Quantidades: ${item.texto}`}>
          {item.metricas!.map((d) => d.tipo === "sim_nao" ? (
            <label key={d.key} className="flex min-h-9 items-center gap-1.5 text-[13px] text-text-secondary">
              <input type="checkbox" checked={fm[d.key] === true} onChange={(e) => { setFm({ ...fm, [d.key]: e.target.checked }); }} onBlur={salvarMetricas} /> {d.rotulo}
            </label>
          ) : (
            <label key={d.key} className="flex flex-col gap-1 text-[12.5px] text-text-secondary">
              <span>{d.rotulo}{d.meta ? ` (meta ${d.meta})` : ""}</span>
              <input type="number" inputMode="numeric" min={0} max={MAX_QUANTIDADE} step={1} value={String(fm[d.key] ?? "")}
                aria-invalid={erroMetrica?.campo === d.key || undefined}
                onChange={(e) => setFm({ ...fm, [d.key]: e.target.value })} onBlur={salvarMetricas}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarMetricas(); } }}
                className={clsx(classeInput, "w-28", erroMetrica?.campo === d.key && "border-critical")} />
            </label>
          ))}
          {erroMetrica && <p role="alert" className="w-full text-[12.5px] text-critical">{item.metricas!.find((d) => d.key === erroMetrica.campo)?.rotulo}: {erroMetrica.erro}</p>}
        </div>
      )}

      {formImpedimento && editavel && (
        <form onSubmit={salvarImpedimento} noValidate className="mt-2 grid gap-3 rounded-control border border-critical bg-surface-raised p-3 sm:grid-cols-2">
          <p className="text-[13px] text-text-secondary sm:col-span-2">Explique brevemente o que dificultou a execução. A gestão vê isso no seu feedback.</p>
          <Campo label="O que impediu? *" largo>
            <input ref={refMotivo} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} aria-invalid={!!errosImp.motivo || undefined}
              aria-describedby={errosImp.motivo ? `${id}-motivo` : undefined} className={clsx(classeInput, errosImp.motivo && "border-critical")} placeholder="ex.: Simples Dental fora do ar à tarde" />
            {errosImp.motivo && <span id={`${id}-motivo`} className="font-normal text-critical">{errosImp.motivo}</span>}
          </Campo>
          <Campo label="Próxima ação *" largo>
            <input ref={refProxima} value={f.proximaAcao} onChange={(e) => setF({ ...f, proximaAcao: e.target.value })} aria-invalid={!!errosImp.proximaAcao || undefined}
              aria-describedby={errosImp.proximaAcao ? `${id}-proxima` : undefined} className={clsx(classeInput, errosImp.proximaAcao && "border-critical")} placeholder="ex.: fazer amanhã às 9h" />
            {errosImp.proximaAcao && <span id={`${id}-proxima`} className="font-normal text-critical">{errosImp.proximaAcao}</span>}
          </Campo>
          <Campo label="Prazo (opcional)"><input type="date" min={hoje} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} className={classeInput} /></Campo>
          <Campo label="Quem faz a próxima ação (opcional)">
            <select value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} className={classeInput}>
              <option value="">— não definido —</option>
              {perfis.map((p) => <option key={p.id} value={`perfil:${p.id}`}>{p.nome}</option>)}
              {RESPONSAVEIS_EXTERNOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
          {tarefas.length > 0 && (
            <Campo label="Relacionar a uma pendência existente (opcional)" largo>
              <select value={f.tarefaId} onChange={(e) => setF({ ...f, tarefaId: e.target.value })} className={classeInput}>
                <option value="">— nenhuma —</option>
                {tarefas.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </Campo>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" loading={status === "salvando" && pendente?.estado === "impedimento"} loadingText="Salvando…">Salvar impedimento</Button>
            <Button type="button" variante="discreto" onClick={() => { setFormImpedimento(false); setErrosImp({}); if (pendente?.estado === "impedimento") { setPendente(null); setStatus("ocioso"); setFalha(null); } }}>Cancelar</Button>
          </div>
        </form>
      )}

      <div aria-live="polite" className="min-h-0">
        {status === "salvando" && !formImpedimento && <p className="mt-1 text-[12px] text-text-muted">Salvando…</p>}
        {status === "salvo" && linha && <p className="mt-1 text-[12px] text-opportunity">✓ Salvo às {soHora(linha.updatedAt)}</p>}
        {status === "ocioso" && linha && linha.estado !== "a_fazer" && editavel && <p className="mt-1 text-[11.5px] text-text-muted">Registrado às {soHora(linha.updatedAt)}</p>}
      </div>
      {status === "erro" && falha && <ErroAcao className="mt-2" erro={falha.erro} status={falha.status} onTentar={tentarDeNovo} />}
    </li>
  );
}
