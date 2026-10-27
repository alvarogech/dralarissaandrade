"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { ItemFila } from "@/lib/fila/agrupamento";
import {
  JANELA_MARCOS_DIAS, ROTULO_SITUACAO_TRABALHO, SITUACOES_TRABALHO, contarPorSituacao, filtrarBase, filtrarTrabalho, filtrosParaQuery,
  marcoForaDaJanela, responsavelEfetivo, situacaoTrabalho, type FiltrosTrabalho, type Pessoas, type SituacaoTrabalho,
} from "@/lib/fila/trabalho";
import { Campo, ROTULO_TIPO, brl, chamarApi, classeInput, dataBr, horaBr, rotuloEvento, type EventoHist } from "./comum";
import { ProvedorFila } from "./contexto";
import { ConferirAtendimento, LinhaItem } from "./FilaView";
import { FormRegistro } from "./FormRegistro";

/**
 * Visão de trabalho comum — a mesma lista para gestão ("Trabalho da Gabi") e concierge ("Meu
 * trabalho"). Os indicadores contam com os mesmos filtros e critérios da lista que abrem; os
 * filtros ficam na URL (abrir/fechar um detalhe ou recarregar não perde a seleção). Marcos
 * futuros ficam recolhidos; o padrão mostra o que é executável hoje.
 *
 * Composição: indicadores de urgência em destaque (atrasadas, hoje, decisões da gestão), estados
 * de acompanhamento em linha secundária; busca, situação e responsável sempre à mão, o resto em
 * "Mais filtros". No desktop o detalhe abre num painel lateral; no celular, no próprio cartão.
 */
export interface PropsTrabalho {
  hoje: string;
  proximoDiaUtil: string;
  itens: ItemFila[];
  eu: string;
  gestao: boolean;
  perfis: { id: string; nome: string }[];
  pacientes: { id: string; nome: string }[];
  config: { conciergeId: string | null; gestorId: string | null; conciergeNome: string | null; diasSemAtualizacao: number };
  /** Situação da entrega do feedback de hoje (texto pronto) — null se não se aplica. */
  feedbackHoje: { texto: string; tipo: string } | null;
  filtrosIniciais: FiltrosTrabalho;
  /** Seleção padrão do perfil (destino de "Limpar filtros"). */
  filtrosPadrao: FiltrosTrabalho;
  /** Expediente da concierge configurado (sem ele, a gestão vê o aviso com link). */
  expedienteConfigurado?: boolean;
  /** Rotina do dia e agenda (montadas na página), exibidas logo abaixo do cabeçalho. */
  antes?: React.ReactNode;
  /**
   * Percurso guiado da concierge (etapa "Pendências"): sem cabeçalho, indicadores nem filtros
   * avançados — a lista vem agrupada pelo que fazer primeiro, e a URL da etapa é preservada.
   */
  guiado?: boolean;
  /** Guiado: mostra só estes itens (ex.: prioridades de hoje, solicitações da gestão). */
  somenteIds?: string[];
  /** Guiado: esconde itens já mostrados em outra seção da rotina (sem duplicar). */
  excluirIds?: string[];
  /** Guiado compacto: só os cartões, com o detalhe aberto no próprio cartão (dentro da rotina). */
  compacto?: boolean;
  /** Texto quando a lista compacta está vazia. */
  vazio?: string;
}

const ROTULO_PRIORIDADE = { alta: "Prioridade alta", normal: "Prioridade normal", baixa: "Prioridade baixa" } as const;
const ROTULO_SITUACAO_ITEM: Record<SituacaoTrabalho, string> = {
  atrasada: "Atrasada", hoje: "Hoje", aguardando_paciente: "Aguardando paciente", aguardando_gestao: "Aguardando gestão", proxima: "Próxima ação", marco_futuro: "Marco futuro", concluida: "Concluída",
};
const TOM_SITUACAO: Record<SituacaoTrabalho, string> = {
  atrasada: "border-critical bg-critical-bg text-critical",
  hoje: "border-graphite bg-graphite text-white",
  aguardando_gestao: "border-important bg-important-bg text-important",
  aguardando_paciente: "border-border-strong bg-surface text-text-secondary",
  proxima: "border-border bg-surface-raised text-text-secondary",
  marco_futuro: "border-informative bg-informative-bg text-informative",
  concluida: "border-opportunity bg-opportunity-bg text-opportunity",
};
const PRIMARIOS: SituacaoTrabalho[] = ["atrasada", "hoje", "aguardando_gestao"];
const SECUNDARIOS: SituacaoTrabalho[] = ["aguardando_paciente", "proxima", "marco_futuro", "concluida"];
const ABERTAS: SituacaoTrabalho[] = SITUACOES_TRABALHO.filter((s) => s !== "concluida");

function diasDesde(iso: string | undefined, hoje: string): number | null {
  if (!iso) return null;
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const [a, b] = [d, hoje].map((s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
  return Math.round((b! - a!) / 86_400_000);
}

function dataPorExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
}

/** Painel lateral só quando há largura (≥ 1280px, já com a navegação); abaixo disso o detalhe abre no cartão. */
function useLargo(): boolean {
  const [largo, setLargo] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const at = () => setLargo(mq.matches);
    at();
    mq.addEventListener("change", at);
    return () => mq.removeEventListener("change", at);
  }, []);
  return largo;
}

export function TrabalhoView(p: PropsTrabalho) {
  const pathname = usePathname();
  const [f, setF] = useState<FiltrosTrabalho>(p.filtrosIniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const [maisFiltros, setMaisFiltros] = useState(!!(p.filtrosIniciais.tipo || p.filtrosIniciais.origem || p.filtrosIniciais.prioridade || p.filtrosIniciais.ate));
  const largo = useLargo();
  const pessoas: Pessoas = { eu: p.eu, conciergeId: p.config.conciergeId, gestorId: p.config.gestorId };
  const nomeConcierge = p.config.conciergeNome ?? "concierge";

  // Filtros na URL, sem recarregar a página. Reaplica depois de cada atualização dos dados
  // (router.refresh volta a URL ao estado interno do Next).
  useEffect(() => {
    if (p.guiado) return; // no percurso guiado a URL guarda a etapa, não filtros
    const q = filtrosParaQuery(f);
    const alvo = q ? `${pathname}?${q}` : pathname;
    if (`${window.location.pathname}${window.location.search}` !== alvo) window.history.replaceState(window.history.state, "", alvo);
  }, [f, pathname, p.itens, p.guiado]);

  const base = useMemo(() => filtrarBase(p.itens, f, pessoas), [p.itens, f, pessoas.eu, pessoas.conciergeId, pessoas.gestorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => contarPorSituacao(base, p.hoje), [base, p.hoje]);
  const lista = useMemo(() => filtrarTrabalho(p.itens, f, pessoas, p.hoje), [p.itens, f, p.hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  // Marcos futuros só dominam a lista quando escolhidos sozinhos; em seleções mistas ficam recolhidos.
  const soMarcos = f.situacoes.length === 1 && f.situacoes[0] === "marco_futuro";
  const executaveis = soMarcos ? lista : lista.filter((i) => situacaoTrabalho(i, p.hoje) !== "marco_futuro");
  const marcosFuturos = soMarcos ? [] : lista.filter((i) => situacaoTrabalho(i, p.hoje) === "marco_futuro");
  // Atualização nova (orientação, resposta, devolução) aparece mesmo fora da seleção atual.
  const novidades = base.filter((i) => i.naoLido && i.status !== "concluida" && !lista.includes(i));
  const dependeDeMim = filtrarBase(p.itens, { ...f, dependeDeMim: true, responsavel: "todos" }, pessoas).filter((i) => situacaoTrabalho(i, p.hoje) !== "concluida");
  // Mesmo universo e filtros da lista que o indicador abre (responsável "sem", situações abertas).
  const semResponsavel = filtrarBase(p.itens, { ...f, responsavel: "sem", dependeDeMim: false }, pessoas).filter((i) => situacaoTrabalho(i, p.hoje) !== "concluida");
  const filtrandoSem = f.responsavel === "sem" && !f.dependeDeMim && f.situacoes.length === ABERTAS.length;
  const origens = [...new Set(p.itens.map((i) => i.origem).filter((x): x is string => !!x))].sort();
  const tipos = [...new Set(p.itens.map((i) => (i.subtipo === "comparecimento" ? "comparecimento" : i.tipo)))].sort();
  const selecionado = p.itens.find((i) => i.id === aberto) ?? null;

  const so = (s: SituacaoTrabalho) => setF({ ...f, situacoes: [s], dependeDeMim: false });
  const alternarSituacao = (s: SituacaoTrabalho) => setF({ ...f, situacoes: f.situacoes.includes(s) ? f.situacoes.filter((x) => x !== s) : [...f.situacoes, s] });
  const alterado = filtrosParaQuery(f) !== filtrosParaQuery(p.filtrosPadrao);
  const rotuloResp = { todos: "Todos os responsáveis", eu: "Só meus", concierge: nomeConcierge, gestor: "Gestão", sem: "Sem responsável" } as const;
  const ativos: { k: string; t: string; limpar: () => void }[] = [
    ...(f.dependeDeMim ? [{ k: "mim", t: "Depende de mim", limpar: () => setF({ ...f, dependeDeMim: false }) }] : []),
    ...(f.busca ? [{ k: "busca", t: `“${f.busca}”`, limpar: () => setF({ ...f, busca: "" }) }] : []),
    ...(f.tipo ? [{ k: "tipo", t: `Tipo: ${f.tipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[f.tipo] ?? f.tipo}`, limpar: () => setF({ ...f, tipo: "" }) }] : []),
    ...(f.origem ? [{ k: "origem", t: `Origem: ${f.origem}`, limpar: () => setF({ ...f, origem: "" }) }] : []),
    ...(f.prioridade ? [{ k: "prio", t: ROTULO_PRIORIDADE[f.prioridade], limpar: () => setF({ ...f, prioridade: "" }) }] : []),
    ...(f.ate ? [{ k: "ate", t: `Prazo até ${dataBr(f.ate)}`, limpar: () => setF({ ...f, ate: "" }) }] : []),
  ];
  const abrir = (id: string) => setAberto(aberto === id ? null : id);
  const cartao = (i: ItemFila) => (
    <CartaoTrabalho key={i.id} item={i} {...p} pessoas={pessoas} aberto={aberto === i.id} inline={!largo} onToggle={() => abrir(i.id)} />
  );

  const indicador = (s: SituacaoTrabalho, primario: boolean) => {
    const ativo = f.situacoes.length === 1 && f.situacoes[0] === s && !f.dependeDeMim;
    return (
      <button key={s} type="button" onClick={() => so(s)} aria-pressed={ativo}
        className={clsx(
          "group relative rounded-card border bg-surface text-left transition-colors hover:border-border-strong",
          primario ? "px-4 pb-3 pt-3.5" : "flex items-baseline justify-between gap-3 px-3.5 py-2.5",
          ativo ? "border-graphite ring-1 ring-graphite" : "border-border",
        )}>
        {ativo && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 rounded-t-card bg-accent" />}
        <span className={clsx("block font-medium text-text-secondary", primario ? "text-[12.5px]" : "text-[13px]")}>
          {s === "aguardando_gestao" && p.gestao ? <><span className="sm:hidden">Decisão da gestão</span><span className="hidden sm:inline">Aguardando decisão da gestão</span></> : ROTULO_SITUACAO_TRABALHO[s]}
          {ativo && <span className="sr-only"> (filtro ativo)</span>}
        </span>
        <span className={clsx("tabular-nums", primario ? "mt-1 block font-serif text-[40px] font-medium leading-none" : "text-[18px] font-medium", s === "atrasada" && contagem[s] ? "text-critical" : "text-text-primary")}>
          {contagem[s]}
        </span>
      </button>
    );
  };

  const valorFila = { hoje: p.hoje, proximoDiaUtil: p.proximoDiaUtil, usuarioId: p.eu, perfis: p.perfis, pacientes: p.pacientes, itens: p.itens, gestao: p.gestao, conciergeId: p.config.conciergeId, gestorId: p.config.gestorId };
  const painelLateral = largo && selecionado && (
    <aside className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto rounded-card border border-border bg-surface shadow-raised" aria-label="Detalhe da tarefa">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
        <div className="min-w-0">
          <p className="fb-eyebrow">{ROTULO_SITUACAO_ITEM[situacaoTrabalho(selecionado, p.hoje)]} · {selecionado.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[selecionado.tipo] ?? selecionado.tipo}</p>
          <h2 className="mt-1 font-serif text-[24px] font-medium leading-tight text-text-primary">{selecionado.pacienteNome}</h2>
        </div>
        <button type="button" onClick={() => setAberto(null)} className="rounded-control px-2 py-1 text-text-muted hover:bg-surface-hover hover:text-text-primary" aria-label="Fechar detalhe">✕</button>
      </div>
      <div className="px-5 pb-5">
        <DetalheItem key={selecionado.id} item={selecionado} {...p} pessoas={pessoas} nomeResp={nomeDoResponsavel(selecionado, pessoas, p.perfis)} />
      </div>
    </aside>
  );

  if (p.guiado) {
    const excluir = new Set(p.excluirIds ?? []);
    const somente = p.somenteIds ? new Set(p.somenteIds) : null;
    const abertas = somente
      ? p.itens.filter((i) => somente.has(i.id))
      : filtrarTrabalho(p.itens, { ...f, situacoes: [], responsavel: "eu", dependeDeMim: false, tipo: "", origem: "", prioridade: "", ate: "" }, pessoas, p.hoje)
        .filter((i) => situacaoTrabalho(i, p.hoje) !== "concluida" && !excluir.has(i.id));
    if (p.compacto) {
      return (
        <ProvedorFila valor={valorFila}>
          {abertas.length ? (
            <ul className="flex flex-col gap-2">
              {abertas.map((i) => <CartaoTrabalho key={i.id} item={i} {...p} pessoas={pessoas} aberto={aberto === i.id} inline onToggle={() => abrir(i.id)} />)}
            </ul>
          ) : <p className="text-[13.5px] text-text-muted">{p.vazio ?? "Nada por aqui."}</p>}
        </ProvedorFila>
      );
    }
    const por = (s: SituacaoTrabalho) => abertas.filter((i) => situacaoTrabalho(i, p.hoje) === s);
    return (
      <ProvedorFila valor={valorFila}>
        <div className={clsx("grid items-start gap-5", largo && selecionado && "xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]")}>
          <div className="min-w-0">
            <PendenciasGuiadas por={por} busca={f.busca} onBusca={(b) => setF({ ...f, busca: b })} cartao={cartao} vazio={p.itens.length === 0} />
          </div>
          {painelLateral}
        </div>
      </ProvedorFila>
    );
  }

  return (
    <ProvedorFila valor={valorFila}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fb-eyebrow">{dataPorExtenso(p.hoje)}</p>
          <h1 className="fb-titulo mt-2">{p.gestao ? `Trabalho da ${nomeConcierge}` : "Meu trabalho"}</h1>
          <p className="mt-1.5 text-sm text-text-secondary">{p.gestao ? "Tarefas, marcos e conferências da concierge, numa única lista." : "Comece pelas atrasadas e pelas de hoje."}</p>
        </div>
        {p.feedbackHoje && (
          <a href={p.gestao ? "/feedbacks" : "/fila"}
            className={clsx("inline-flex min-h-9 items-center gap-2 rounded-control border px-3 text-[13px] transition-colors hover:bg-surface-hover",
              p.feedbackHoje.tipo === "pendente" ? "border-critical text-critical" : p.feedbackHoje.tipo === "entregue" ? "border-opportunity text-opportunity" : "border-border-strong text-text-secondary")}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            Feedback de hoje: {p.feedbackHoje.texto}
          </a>
        )}
      </header>

      {p.antes}

      {p.gestao && p.expedienteConfigurado === false && (
        <p role="status" className="mb-6 rounded-card border border-important bg-important-bg p-3 text-sm text-important">
          Expediente da concierge não configurado: ela registra e envia o feedback normalmente, mas o sistema não sabe a partir de que horário cobrar nem marcar atraso.{" "}
          <a href="/feedbacks#expediente" className="font-medium underline underline-offset-4">Configurar expediente</a>
        </p>
      )}

      {p.gestao && !p.config.conciergeId && (
        <p role="status" className="mb-6 rounded-card border border-important bg-important-bg p-3 text-sm text-important">
          Configuração pendente: a conta da concierge não está identificada de forma inequívoca. Tarefas importadas ficam sem responsável até a configuração.
        </p>
      )}

      {p.gestao && <SolicitacoesGestao itens={p.itens} hoje={p.hoje} cartao={cartao} />}

      {/* Indicadores: cada um abre exatamente a lista que contou (mesmos filtros). */}
      <section aria-label="Indicadores" className="mb-6">
        <div className="grid grid-cols-3 gap-2.5">{PRIMARIOS.map((s) => indicador(s, true))}</div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {SECUNDARIOS.map((s) => indicador(s, false))}
        </div>
        {p.gestao && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={f.dependeDeMim}
              onClick={() => setF({ ...f, dependeDeMim: !f.dependeDeMim, situacoes: f.dependeDeMim ? p.filtrosPadrao.situacoes : [], responsavel: "todos" })}
              className={clsx("relative flex items-baseline justify-between gap-3 rounded-card border px-3.5 py-2.5 text-left transition-colors",
                f.dependeDeMim ? "border-accent bg-accent text-white" : "border-transparent bg-accent-soft text-accent hover:bg-[#efdfe1]")}>
              <span className="text-[13px] font-medium">Depende de mim</span>
              <span className="text-[18px] font-medium tabular-nums">{dependeDeMim.length}</span>
            </button>
            <button type="button" aria-pressed={filtrandoSem}
              onClick={() => setF(filtrandoSem ? p.filtrosPadrao : { ...f, responsavel: "sem", dependeDeMim: false, situacoes: [...ABERTAS] })}
              className={clsx("relative flex items-baseline justify-between gap-3 rounded-card border px-3.5 py-2.5 text-left transition-colors",
                filtrandoSem ? "border-important bg-important text-white" : semResponsavel.length ? "border-important bg-important-bg text-important" : "border-border bg-surface text-text-secondary")}>
              <span className="text-[13px] font-medium">Sem responsável</span>
              <span className="text-[18px] font-medium tabular-nums">{semResponsavel.length}</span>
            </button>
          </div>
        )}
        <p className="mt-2.5 text-[12.5px] text-text-muted">
          Cada item conta em uma situação só · “Marcos futuros” são acompanhamentos previstos para depois de {JANELA_MARCOS_DIAS} dias, não tarefas do dia · “sem atualização” = nada registrado há {p.config.diasSemAtualizacao}+ dias.
        </p>
      </section>

      {/* Filtros: busca, situação e responsável à mão; o resto recolhido. */}
      <section aria-label="Filtros" className="mb-5 rounded-card border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Buscar paciente ou assunto</span>
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></svg>
            <input value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} className={clsx(classeInput, "pl-9")} placeholder="Buscar paciente ou assunto" />
          </label>
          <label>
            <span className="sr-only">Responsável</span>
            <select value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value as FiltrosTrabalho["responsavel"] })} className={clsx(classeInput, "w-auto")}>
              <option value="todos">{rotuloResp.todos}</option>
              <option value="eu">{rotuloResp.eu}</option>
              {p.gestao && <option value="concierge">{nomeConcierge}</option>}
              {!p.gestao && <option value="gestor">{rotuloResp.gestor}</option>}
              <option value="sem">{rotuloResp.sem}</option>
            </select>
          </label>
          <button type="button" className="fb-chip" aria-expanded={maisFiltros} onClick={() => setMaisFiltros(!maisFiltros)}>
            Mais filtros{ativos.filter((a) => ["tipo", "origem", "prio", "ate"].includes(a.k)).length ? ` (${ativos.filter((a) => ["tipo", "origem", "prio", "ate"].includes(a.k)).length})` : ""} {maisFiltros ? "▴" : "▾"}
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Situação">
          {SITUACOES_TRABALHO.map((s) => (
            <button key={s} type="button" className="fb-chip" data-ativo={f.situacoes.includes(s)} aria-pressed={f.situacoes.includes(s)} onClick={() => alternarSituacao(s)}>
              {f.situacoes.includes(s) && <span aria-hidden>✓</span>}{ROTULO_SITUACAO_TRABALHO[s]}
            </button>
          ))}
          <button type="button" className="fb-chip" data-ativo={f.situacoes.length === 0} aria-pressed={f.situacoes.length === 0} onClick={() => setF({ ...f, situacoes: [] })}>Todas</button>
        </div>
        {maisFiltros && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Tipo">
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={classeInput}>
                <option value="">Todos</option>
                {tipos.map((t) => <option key={t} value={t}>{t === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[t] ?? t}</option>)}
              </select>
            </Campo>
            <Campo label="Origem">
              <select value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} className={classeInput}>
                <option value="">Todas</option>
                {origens.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as FiltrosTrabalho["prioridade"] })} className={classeInput}>
                <option value="">Todas</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option>
              </select>
            </Campo>
            <Campo label="Prazo até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} className={classeInput} /></Campo>
          </div>
        )}
        {(ativos.length > 0 || alterado) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[13px]">
            <span className="text-text-muted">Filtrando:</span>
            {ativos.map((a) => (
              <button key={a.k} type="button" onClick={a.limpar} className="inline-flex items-center gap-1 rounded-sm bg-surface-raised px-2 py-0.5 text-text-secondary hover:text-text-primary" aria-label={`Remover filtro ${a.t}`}>
                {a.t} <span aria-hidden>×</span>
              </button>
            ))}
            {f.responsavel !== p.filtrosPadrao.responsavel && <span className="rounded-sm bg-surface-raised px-2 py-0.5 text-text-secondary">{rotuloResp[f.responsavel]}</span>}
            <button type="button" className="ml-auto text-accent underline-offset-4 hover:underline" onClick={() => setF(p.filtrosPadrao)}>Limpar filtros</button>
          </div>
        )}
      </section>

      <div className={clsx("grid items-start gap-5", largo && selecionado && "xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]")}>
        <div className="min-w-0">
          {novidades.length > 0 && (
            <section className="mb-5" aria-label="Atualizações novas">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-accent"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />Atualizações novas fora desta seleção ({novidades.length})</h2>
              <ul className="flex flex-col gap-2">{novidades.map(cartao)}</ul>
            </section>
          )}
          <h2 className="sr-only">Lista de trabalho</h2>
          {executaveis.length === 0 && marcosFuturos.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-strong px-5 py-6 text-sm text-text-secondary">
              <p className="font-medium text-text-primary">
                {p.itens.length === 0 ? "Nenhuma tarefa cadastrada ainda." : f.situacoes.length === 1 && f.situacoes[0] === "atrasada" ? "Nenhuma tarefa atrasada." : f.situacoes.length === 1 && f.situacoes[0] === "hoje" ? "Nenhuma tarefa para hoje." : "Nenhum resultado para os filtros selecionados."}
              </p>
              <p className="mt-1">
                {alterado ? <button type="button" className="text-accent underline-offset-4 hover:underline" onClick={() => setF(p.filtrosPadrao)}>Limpar filtros</button> : f.situacoes.length > 0 && <button type="button" className="text-accent underline-offset-4 hover:underline" onClick={() => setF({ ...f, situacoes: [] })}>Ver todas as situações</button>}
                {!p.gestao && <> · Algo novo no expediente? Registre em <a className="text-accent underline-offset-4 hover:underline" href="/fila">Feedback diário</a>.</>}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">{executaveis.map(cartao)}</ul>
          )}
          {marcosFuturos.length > 0 && (
            <details className="mt-5 rounded-card border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm text-text-secondary">Marcos de acompanhamento futuros ({marcosFuturos.length}) — previstos para depois de {JANELA_MARCOS_DIAS} dias</summary>
              <ul className="flex flex-col gap-2 border-t border-border p-3">{marcosFuturos.map(cartao)}</ul>
            </details>
          )}
        </div>
        {painelLateral}
      </div>
    </ProvedorFila>
  );
}

/**
 * Gestão: solicitações extraordinárias (pedidas por Álvaro ou pela Dra. Larissa) num relance —
 * entregues, abertas, atrasadas e aguardando decisão — com o mesmo cartão/detalhe das tarefas.
 */
function SolicitacoesGestao({ itens, hoje, cartao }: { itens: ItemFila[]; hoje: string; cartao: (i: ItemFila) => React.ReactNode }) {
  const sol = itens.filter((i) => i.extraordinaria);
  if (!sol.length) return null;
  const abertas = sol.filter((i) => i.status !== "concluida");
  const atrasadas = abertas.filter((i) => i.due < hoje);
  const decisao = abertas.filter((i) => i.aguardando === "gestao");
  const entregues = sol.filter((i) => i.status === "concluida");
  return (
    <details className="mb-6 rounded-card border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3">
        <span className="text-[15px] font-semibold text-text-primary">Solicitações extraordinárias</span>
        <span className="ml-2 text-[13px] text-text-secondary">
          {abertas.length} aberta{abertas.length === 1 ? "" : "s"}
          {atrasadas.length ? <span className="font-medium text-critical"> · {atrasadas.length} atrasada{atrasadas.length === 1 ? "" : "s"}</span> : null}
          {decisao.length ? <span className="font-medium text-important"> · {decisao.length} aguardando sua decisão</span> : null}
          {` · ${entregues.length} entregue${entregues.length === 1 ? "" : "s"}`}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        {abertas.length > 0 && <ul className="flex flex-col gap-2">{abertas.map(cartao)}</ul>}
        {entregues.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Entregues (com o resultado registrado pela concierge)</p>
            <ul className="flex flex-col gap-2">{entregues.map(cartao)}</ul>
          </div>
        )}
      </div>
    </details>
  );
}

const SECOES_GUIADAS: { s: SituacaoTrabalho; titulo: string; ajuda: string; recolhida?: boolean }[] = [
  { s: "atrasada", titulo: "Atrasadas", ajuda: "Passaram do prazo: comece por aqui." },
  { s: "hoje", titulo: "Para hoje", ajuda: "Vencem hoje." },
  { s: "aguardando_gestao", titulo: "Aguardando a gestão", ajuda: "Você pediu orientação; a resposta aparece aqui." },
  { s: "aguardando_paciente", titulo: "Aguardando a paciente", ajuda: "Verifique na data indicada em cada uma." },
  { s: "proxima", titulo: "Próximas ações", ajuda: "Ainda não venceram.", recolhida: true },
  { s: "marco_futuro", titulo: "Marcos de acompanhamento futuros", ajuda: `Previstos para depois de ${JANELA_MARCOS_DIAS} dias — não são tarefas de hoje.`, recolhida: true },
];

/** Etapa 2 do percurso guiado: o que fazer primeiro, em grupos; nada de filtros técnicos à vista. */
function PendenciasGuiadas({ por, busca, onBusca, cartao, vazio }: { por: (s: SituacaoTrabalho) => ItemFila[]; busca: string; onBusca: (b: string) => void; cartao: (i: ItemFila) => React.ReactNode; vazio: boolean }) {
  const [registroLivre, setRegistroLivre] = useState(false);
  const total = SECOES_GUIADAS.reduce((n, x) => n + por(x.s).length, 0);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-text-secondary">Casos que continuam em acompanhamento. Abra um e toque em <strong className="text-text-primary">Registrar andamento</strong> para dizer o que aconteceu; o que continuar pendente volta sozinho na data escolhida.</p>
      <nav aria-label="Resumo das pendências" className="flex flex-wrap gap-2">
        {SECOES_GUIADAS.filter((x) => !x.recolhida).map((x) => (
          <a key={x.s} href={`#sec-${x.s}`} className={clsx("inline-flex min-h-10 items-center gap-2 rounded-control border px-3 text-[13.5px]",
            x.s === "atrasada" && por(x.s).length ? "border-critical bg-critical-bg text-critical" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
            {x.titulo} <strong className="tabular-nums">{por(x.s).length}</strong>
          </a>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar paciente ou assunto</span>
          <input value={busca} onChange={(e) => onBusca(e.target.value)} className={classeInput} placeholder="Buscar paciente ou assunto" />
        </label>
        <Button type="button" variante={registroLivre ? "primario" : "secundario"} aria-expanded={registroLivre} onClick={() => setRegistroLivre(!registroLivre)}>
          + Registrar algo que não está na lista
        </Button>
      </div>
      {registroLivre && (
        <section className="rounded-card border border-border bg-surface p-4" aria-label="Registro sem pendência prévia">
          <p className="mb-3 font-serif text-[22px] font-medium text-text-primary">Registrar algo do dia</p>
          <FormRegistro alvos={[]} onSalvo={() => setRegistroLivre(false)} onCancelar={() => setRegistroLivre(false)} />
        </section>
      )}
      {total === 0 && (
        <div className="rounded-card border border-dashed border-border-strong px-5 py-6 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">{busca ? "Nada encontrado nessa busca." : vazio ? "Nenhuma pendência cadastrada ainda." : "Nenhuma pendência aberta para você agora."}</p>
          <p className="mt-1">As que vencem hoje ou estão atrasadas aparecem em “Prioridades de hoje”.</p>
        </div>
      )}
      {SECOES_GUIADAS.map((x) => {
        const itens = por(x.s);
        if (!itens.length) return null;
        const cabecalho = (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={clsx("text-[16px] font-semibold", x.s === "atrasada" ? "text-critical" : "text-text-primary")}>{x.titulo} ({itens.length})</span>
            <span className="text-[13px] text-text-muted">{x.ajuda}</span>
          </span>
        );
        return x.recolhida ? (
          <details key={x.s} id={`sec-${x.s}`} className="rounded-card border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3">{cabecalho}</summary>
            <ul className="flex flex-col gap-2 border-t border-border p-3">{itens.map(cartao)}</ul>
          </details>
        ) : (
          <section key={x.s} id={`sec-${x.s}`} aria-label={x.titulo} className="scroll-mt-24">
            <h2 className="mb-2">{cabecalho}</h2>
            <ul className="flex flex-col gap-2">{itens.map(cartao)}</ul>
          </section>
        );
      })}
    </div>
  );
}

function nomeDoResponsavel(i: ItemFila, pessoas: Pessoas, perfis: { id: string; nome: string }[]): string | null {
  const resp = responsavelEfetivo(i, pessoas);
  return resp ? perfis.find((x) => x.id === resp)?.nome ?? "—" : i.responsavel ?? null;
}

function CartaoTrabalho({ item: i, aberto, inline, onToggle, pessoas, ...p }: PropsTrabalho & { item: ItemFila; aberto: boolean; inline: boolean; onToggle: () => void; pessoas: Pessoas }) {
  const sit = situacaoTrabalho(i, p.hoje);
  const nomeResp = nomeDoResponsavel(i, pessoas, p.perfis);
  const parado = i.status !== "concluida" && i.alvo?.tipo === "tarefa" ? diasDesde(i.atualizadoEm, p.hoje) : null;
  const semProxima = i.status !== "concluida" && i.alvo?.tipo === "tarefa" && !i.proximaAcao && i.status === "aguardando";
  const sinais = [
    i.prioridade === "alta" ? { t: "Prioridade alta", c: "text-critical" } : null,
    i.atencao ? { t: "Atenção", c: "text-critical" } : null,
    i.adiamentos ? { t: `Adiada ${i.adiamentos}×`, c: "text-important" } : null,
    parado !== null && parado >= p.config.diasSemAtualizacao ? { t: `Sem atualização há ${parado} dias`, c: "text-important" } : null,
    semProxima ? { t: "Sem próxima ação", c: "text-important" } : null,
    i.aConferir?.length ? { t: "Dados a conferir", c: "text-important" } : null,
  ].filter((x): x is { t: string; c: string } => !!x);
  const prazo = i.status === "concluida"
    ? `Concluída${i.concluidaEm ? ` em ${dataBr(i.concluidaEm)}` : ""}`
    : `${sit === "aguardando_paciente" || sit === "aguardando_gestao" ? "Revisar em" : "Prazo"} ${dataBr(i.due)}`;
  return (
    <li className={clsx("overflow-hidden rounded-card border bg-surface transition-colors", aberto ? "border-graphite ring-1 ring-graphite" : i.naoLido ? "border-accent" : "border-border hover:border-border-strong")}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left" aria-expanded={aberto}>
        <div className="min-w-0 flex-1">
          {/* Nível 1 — paciente ou assunto */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {i.naoLido && <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />Nova atualização</span>}
            <p className="truncate text-[15.5px] font-semibold text-text-primary">
              {i.pacienteNome}
              {i.semPaciente && <span className="ml-1.5 text-[12.5px] font-normal text-text-muted">assunto administrativo</span>}
            </p>
          </div>
          {/* Nível 2 — ação esperada */}
          <p className="mt-0.5 text-[14.5px] text-text-primary">{i.titulo}{i.valor !== undefined ? ` · ${brl(i.valor)}` : ""}</p>
          {i.proximaAcao && i.status !== "concluida" && i.proximaAcao !== i.titulo && <p className="mt-0.5 text-[13.5px] text-text-secondary">Próxima ação: {i.proximaAcao}</p>}
          {/* Nível 3 — situação e prazo (+ sinais de continuidade, sempre em texto) */}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className={clsx("inline-flex items-center rounded-sm border px-1.5 text-[12px] font-medium leading-5", TOM_SITUACAO[sit])}>{ROTULO_SITUACAO_ITEM[sit]}</span>
            <span className={clsx("tabular-nums", sit === "atrasada" ? "font-medium text-critical" : "text-text-secondary")}>{prazo}</span>
            {sinais.map((s) => <span key={s.t} className={clsx("before:mr-2 before:text-text-muted before:content-['·']", s.c)}>{s.t}</span>)}
          </p>
          {/* Nível 4 — metadados */}
          <p className="mt-1 text-[12.5px] text-text-muted">
            {nomeResp ? `Responsável: ${nomeResp}` : <span className="font-medium text-important">Sem responsável</span>}
            {" · "}{i.extraordinaria ? `Solicitação da gestão${i.solicitadoPor ? ` · pedida por ${i.solicitadoPor}` : ""}` : i.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[i.tipo] ?? i.tipo}
            {i.origem ? ` · ${i.origem}` : ""}
          </p>
        </div>
        <span aria-hidden className="mt-1 shrink-0 text-[13px] text-text-muted">{aberto ? (inline ? "▴" : "◂") : inline ? "▾" : "▸"}</span>
        <span className="sr-only">{aberto ? "Fechar tarefa" : "Abrir tarefa"}</span>
      </button>
      {aberto && inline && <div className="border-t border-border px-4 pb-4"><DetalheItem item={i} {...p} pessoas={pessoas} nomeResp={nomeResp} /></div>}
    </li>
  );
}

function Linha({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 py-1 text-[14px]">
      <dt className="text-text-muted">{k}</dt>
      <dd className="min-w-0 text-text-primary">{v}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{titulo}</h3>
      {children}
    </section>
  );
}

function DetalheItem({ item: i, pessoas, nomeResp, ...p }: PropsTrabalho & { item: ItemFila; pessoas: Pessoas; nomeResp: string | null }) {
  const [eventos, setEventos] = useState<EventoHist[] | null>(null);
  const [erroHist, setErroHist] = useState<string | null>(null);
  const [acao, setAcao] = useState<"andamento" | "mensagem" | "editar" | "cancelar" | null>(null);
  const alvo = i.alvo;
  void pessoas;

  useEffect(() => {
    if (!alvo || alvo.tipo === "atendimento") return;
    // Abrir o detalhe = ler o histórico completo: só aqui a atualização conta como lida.
    void chamarApi<{ eventos: EventoHist[] }>(`/api/fila/historico?tipo=${alvo.tipo}&id=${alvo.id}&ler=1`, "GET").then((r) => (r.ok ? setEventos(r.data.eventos) : setErroHist(r.erro)));
  }, [alvo]);

  if (alvo?.tipo === "atendimento") return <div className="pt-4"><ConferirAtendimento item={i} gestao={p.gestao} /></div>;
  const aberta = i.status !== "concluida";
  const ROT_AGUARDANDO = { paciente: "Aguardando paciente", gestao: "Aguardando gestão" } as const;
  return (
    <div className="flex flex-col gap-4 pt-4">
      <Bloco titulo="O que fazer">
        <dl>
          <Linha k="Ação" v={i.titulo} />
          <Linha k={i.semPaciente ? "Assunto" : "Paciente"} v={i.pacienteNome} />
          <Linha k="Contexto" v={i.contexto} />
          <Linha k="Solicitado por" v={i.extraordinaria ? `${i.solicitadoPor ?? "gestão"}${i.criadaEm ? ` em ${dataBr(i.criadaEm.slice(0, 10))}` : ""}` : undefined} />
          <Linha k="Orientação da gestão" v={i.orientacao} />
          <Linha k="Resultado esperado" v={i.resultadoEsperado} />
          <Linha k="Ocorrência" v={i.tipo === "recuperacao_falta" ? (i.ocorrencia ? `${i.ocorrencia === "falta" ? "Falta" : "Cancelamento"}${i.dataOcorrencia ? ` em ${dataBr(i.dataOcorrencia)}` : ""}` : <span className="text-important">Não informada — confira antes de agir</span>) : undefined} />
          <Linha k="Atendimento de referência" v={i.tipo === "marco" && i.dataAtendimento ? dataBr(i.dataAtendimento) : undefined} />
          <Linha k="Prazo original" v={i.prazoOriginal && i.prazoOriginal !== i.due ? dataBr(i.prazoOriginal) : undefined} />
          <Linha k="Prioridade" v={i.alvo?.tipo === "tarefa" ? ROTULO_PRIORIDADE[i.prioridade ?? "normal"] : undefined} />
          <Linha k="Origem" v={i.origem ? `${i.origem}${i.origemData ? ` · informação de ${dataBr(i.origemData)}` : ""}` : undefined} />
          <Linha k="A conferir" v={i.aConferir?.length ? <span className="text-important">{i.aConferir.join(", ")} (pendente de conferência)</span> : undefined} />
        </dl>
      </Bloco>

      <Bloco titulo="O que aconteceu">
        {erroHist && <p role="alert" className="text-sm text-critical">Não consegui carregar o histórico: {erroHist}</p>}
        {!erroHist && !eventos && <p className="text-sm text-text-muted" aria-live="polite">Carregando histórico…</p>}
        {eventos && !eventos.length && <p className="text-sm text-text-muted">Nenhum registro ainda.</p>}
        {eventos && eventos.length > 0 && (
          <ol className="relative ml-1.5 border-l border-border pl-4">
            {eventos.map((e) => (
              <li key={e.id} className="relative pb-3 last:pb-0">
                <span aria-hidden className={clsx("absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-surface", e.kind === "nota" ? "bg-accent" : "bg-border-strong")} />
                <p className="text-[12.5px] text-text-muted">
                  <span className="font-medium text-text-secondary">{rotuloEvento(e)}</span> · {e.autor} · {e.registradoEm ? horaBr(e.registradoEm) : dataBr(e.occurredOn)}
                </p>
                {e.notes && <p className="text-[14px] text-text-primary">{e.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </Bloco>

      <Bloco titulo="O que vem agora">
        <dl>
          <Linha k="Situação" v={i.status === "concluida" ? `Concluída${i.detalhe ? ` — ${i.detalhe}` : ""}` : i.status === "aguardando" ? ROT_AGUARDANDO[i.aguardando ?? "paciente"] : "Aberta — a fazer"} />
          <Linha k="Próxima ação" v={aberta ? i.proximaAcao ?? <span className="text-text-muted">A ação do título</span> : undefined} />
          <Linha k="Responsável" v={aberta ? nomeResp ?? <span className="font-medium text-important">Sem responsável</span> : undefined} />
          <Linha k={i.status === "aguardando" ? "Revisar em" : "Prazo"} v={aberta ? dataBr(i.due) : undefined} />
        </dl>
      </Bloco>

      {aberta && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="button" variante={acao === "andamento" ? "primario" : "secundario"} aria-pressed={acao === "andamento"} onClick={() => setAcao(acao === "andamento" ? null : "andamento")}>Registrar andamento</Button>
          {i.alvo?.tipo === "tarefa" && (
            <Button type="button" variante={acao === "mensagem" ? "primario" : "secundario"} aria-pressed={acao === "mensagem"} onClick={() => setAcao(acao === "mensagem" ? null : "mensagem")}>
              {p.gestao ? "Orientar / responder" : "Pedir orientação"}
            </Button>
          )}
          {p.gestao && i.alvo?.tipo === "tarefa" && <Button type="button" variante={acao === "editar" ? "primario" : "secundario"} aria-pressed={acao === "editar"} onClick={() => setAcao(acao === "editar" ? null : "editar")}>Editar tarefa</Button>}
          {p.gestao && i.alvo?.tipo === "tarefa" && (
            <button type="button" aria-pressed={acao === "cancelar"} onClick={() => setAcao(acao === "cancelar" ? null : "cancelar")}
              className={clsx("inline-flex min-h-10 items-center rounded-control border px-4 text-sm font-medium transition-colors",
                acao === "cancelar" ? "border-critical bg-critical text-white" : "border-critical bg-surface text-critical hover:bg-critical-bg")}>
              Cancelar tarefa
            </button>
          )}
        </div>
      )}
      {acao === "andamento" && <PainelAndamento item={i} hoje={p.hoje} itens={p.itens} onSalvo={() => setAcao(null)} />}
      {acao === "mensagem" && <FormMensagem item={i} {...p} onSalvo={() => setAcao(null)} />}
      {acao === "editar" && <EditarTarefa item={i} perfis={p.perfis} onSalvo={() => setAcao(null)} />}
      {acao === "cancelar" && <CancelarTarefa item={i} onFechar={() => setAcao(null)} />}
    </div>
  );
}

/**
 * Registro agrupado: o item aberto vem marcado; outros itens da mesma paciente dentro da janela de
 * trabalho aparecem como sugestão (desmarcados); marcos futuros só entram com justificativa.
 * Um registro = um evento ligado aos itens escolhidos (um contato conta uma vez).
 */
function PainelAndamento({ item, hoje, itens, onSalvo }: { item: ItemFila; hoje: string; itens: ItemFila[]; onSalvo: () => void }) {
  const mesmos = itens.filter((x) => x.id !== item.id && x.pacienteId === item.pacienteId && x.status !== "concluida" && x.alvo && x.alvo.tipo !== "atendimento");
  const naJanela = mesmos.filter((x) => !marcoForaDaJanela(x, hoje));
  const futuros = mesmos.filter((x) => marcoForaDaJanela(x, hoje));
  const [sel, setSel] = useState<Set<string>>(new Set([item.id]));
  const escolhidos = [item, ...mesmos].filter((x) => sel.has(x.id));
  const exigeJustificativa = escolhidos.some((x) => marcoForaDaJanela(x, hoje));
  const alternar = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      {mesmos.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Itens deste registro (cada um mantém o próprio histórico)</legend>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={sel.has(item.id)} onChange={() => alternar(item.id)} /><LinhaItem item={item} /></label>
          {naJanela.map((x) => <label key={x.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={sel.has(x.id)} onChange={() => alternar(x.id)} /><LinhaItem item={x} /></label>)}
          {futuros.length > 0 && <p className="mt-1 text-xs text-text-muted">Previstos para depois de {JANELA_MARCOS_DIAS} dias — só marque com justificativa:</p>}
          {futuros.map((x) => <label key={x.id} className="flex items-start gap-2 text-sm text-text-secondary"><input type="checkbox" className="mt-1" checked={sel.has(x.id)} onChange={() => alternar(x.id)} /><LinhaItem item={x} /></label>)}
        </fieldset>
      )}
      {escolhidos.length ? <FormRegistro key={escolhidos.map((x) => x.id).join(",")} alvos={escolhidos} exigeJustificativa={exigeJustificativa} onSalvo={onSalvo} /> : <p className="text-sm text-text-muted">Marque ao menos um item.</p>}
    </div>
  );
}

function FormMensagem({ item, gestao, proximoDiaUtil, hoje, config, perfis, onSalvo }: PropsTrabalho & { item: ItemFila; onSalvo: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState(gestao ? (item.aguardando === "gestao" ? "resposta_gestao" : "orientacao") : "pergunta");
  const [texto, setTexto] = useState("");
  const [prazo, setPrazo] = useState(proximoDiaUtil);
  const [devolver, setDevolver] = useState(gestao && item.aguardando === "gestao");
  const [proxima, setProxima] = useState("");
  const [para, setPara] = useState(config.conciergeId ?? "");
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const r = await chamarApi("/api/fila/mensagem", "POST", {
      eventoId, tarefaId: item.alvo!.id, tipo, texto,
      prazo: tipo === "pergunta" ? prazo : undefined,
      devolver: gestao && devolver ? { proximaAcao: proxima, prazo, responsavel: para || undefined } : undefined,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.incerto ? `${r.erro} Pode reenviar: a mesma mensagem não é duplicada.` : r.erro);
    setEventoId(crypto.randomUUID());
    router.refresh();
    onSalvo();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      {gestao ? (
        <Campo label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={classeInput}>
            <option value="orientacao">Orientação</option><option value="resposta_gestao">Resposta à dúvida</option><option value="decisao">Decisão</option>
          </select>
        </Campo>
      ) : (
        <p className="text-sm text-text-secondary">A tarefa vai para “Aguardando gestão” e a próxima ação passa para a gestão até a resposta.</p>
      )}
      <Campo label={gestao ? "Mensagem *" : "Dúvida ou impedimento *"}><textarea required rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className={classeInput} /></Campo>
      {!gestao && <Campo label="Preciso da resposta até *"><input type="date" required min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} className={classeInput} /></Campo>}
      {gestao && (
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} /> Devolver a próxima ação, com prazo
        </label>
      )}
      {gestao && devolver && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Próxima ação *"><input required value={proxima} onChange={(e) => setProxima(e.target.value)} className={classeInput} /></Campo>
          <Campo label="Para *">
            <select value={para} onChange={(e) => setPara(e.target.value)} className={classeInput}>
              {perfis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Prazo *"><input type="date" required min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} className={classeInput} /></Campo>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-critical">{erro}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={salvando} loadingText="Enviando…">{gestao ? "Registrar na tarefa" : "Enviar à gestão"}</Button>
        <span className="text-xs text-text-muted">Fica no histórico da tarefa. Nenhuma mensagem é enviada à paciente.</span>
      </div>
    </form>
  );
}

/**
 * Cancelamento pela gestão: motivo obrigatório e confirmação explícita. A tarefa não é apagada —
 * fica como "cancelada" com o motivo, autor e horário no histórico (os registros da Gabi ficam
 * intactos). A permissão é conferida no servidor (só gestão).
 */
function CancelarTarefa({ item, onFechar }: { item: ItemFila; onFechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function cancelar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    if (!confirmar) return setConfirmar(true);
    setSalvando(true);
    const r = await chamarApi(`/api/fila/tarefas/${item.alvo!.id}`, "PATCH", { cancelar: true, motivo: motivo.trim() });
    setSalvando(false);
    if (!r.ok) return setErro(r.incerto ? `${r.erro} Recarregue a página para ver se a tarefa já aparece como cancelada.` : r.erro);
    router.refresh();
    onFechar();
  }

  return (
    <form onSubmit={cancelar} className="flex flex-col gap-3 rounded-[10px] border border-critical bg-critical-bg p-3">
      <p className="text-sm text-text-primary">
        Cancelar <strong>{item.titulo}</strong> ({item.pacienteNome}). A tarefa sai da fila da Gabi, mas não é apagada: fica como cancelada, com o motivo e o histórico preservados.
      </p>
      <Campo label="Motivo do cancelamento *">
        <input required value={motivo} onChange={(e) => { setMotivo(e.target.value); setConfirmar(false); }} className={classeInput} placeholder="ex.: paciente já resolveu direto com a Dra." />
      </Campo>
      {erro && <p role="alert" className="text-sm text-critical">{erro}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={salvando}
          className="inline-flex min-h-10 items-center rounded-control bg-critical px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {salvando ? "Cancelando…" : confirmar ? "Confirmar cancelamento" : "Cancelar tarefa"}
        </button>
        <Button type="button" variante="discreto" onClick={onFechar}>Voltar</Button>
        {confirmar && !salvando && <span role="status" className="text-[13px] text-critical">Clique em “Confirmar cancelamento” para concluir.</span>}
      </div>
    </form>
  );
}

function EditarTarefa({ item, perfis, onSalvo }: { item: ItemFila; perfis: { id: string; nome: string }[]; onSalvo: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ acao: item.titulo, orientacao: item.orientacao ?? "", resultadoEsperado: item.resultadoEsperado ?? "", prazo: item.due, prioridade: item.prioridade ?? "normal", responsavel: item.responsavelId ?? "", motivo: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function salvar(cancelar: boolean) {
    setErro(null);
    setSalvando(true);
    const r = await chamarApi(`/api/fila/tarefas/${item.alvo!.id}`, "PATCH", cancelar
      ? { cancelar: true, motivo: v.motivo }
      : { acao: v.acao, orientacao: v.orientacao, resultadoEsperado: v.resultadoEsperado, prazo: v.prazo, prioridade: v.prioridade === "normal" ? null : v.prioridade, responsavel: v.responsavel || null, motivo: v.motivo || undefined });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
    onSalvo();
  }

  return (
    <div className="grid gap-2 rounded-[10px] border border-border p-3 sm:grid-cols-3">
      <Campo label="Ação" largo><input value={v.acao} onChange={set("acao")} className={classeInput} /></Campo>
      <Campo label="Prazo"><input type="date" value={v.prazo} onChange={set("prazo")} className={classeInput} /></Campo>
      <Campo label="Orientação" largo><input value={v.orientacao} onChange={set("orientacao")} className={classeInput} /></Campo>
      <Campo label="Prioridade"><select value={v.prioridade} onChange={set("prioridade")} className={classeInput}><option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option></select></Campo>
      <Campo label="Resultado esperado" largo><input value={v.resultadoEsperado} onChange={set("resultadoEsperado")} className={classeInput} /></Campo>
      <Campo label="Responsável">
        <select value={v.responsavel} onChange={set("responsavel")} className={classeInput}>
          {!v.responsavel && <option value="">— escolha —</option>}
          {perfis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </Campo>
      <Campo label="Motivo (obrigatório para adiar, reagendar ou cancelar)" largo><input value={v.motivo} onChange={set("motivo")} className={classeInput} /></Campo>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button onClick={() => salvar(false)} loading={salvando} loadingText="Salvando…">Salvar alterações</Button>
        <button type="button" disabled={salvando} onClick={() => salvar(true)} className="rounded-sm border border-critical px-3 py-2 text-sm text-critical">Cancelar tarefa</button>
        {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
      </div>
      <p className="text-xs text-text-muted sm:col-span-3">Alterações ficam no histórico com autor e horário; os registros da execução não são apagados.</p>
    </div>
  );
}
