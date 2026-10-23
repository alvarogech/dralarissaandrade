"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
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
}

const ROTULO_PRIORIDADE = { alta: "Prioridade alta", normal: "Prioridade normal", baixa: "Prioridade baixa" } as const;

function diasDesde(iso: string | undefined, hoje: string): number | null {
  if (!iso) return null;
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const [a, b] = [d, hoje].map((s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
  return Math.round((b! - a!) / 86_400_000);
}

export function TrabalhoView(p: PropsTrabalho) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<FiltrosTrabalho>(p.filtrosIniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const pessoas: Pessoas = { eu: p.eu, conciergeId: p.config.conciergeId, gestorId: p.config.gestorId };
  const nomeConcierge = p.config.conciergeNome ?? "concierge";

  // Filtros na URL, sem recarregar a página. Reaplica depois de cada atualização dos dados
  // (router.refresh volta a URL ao estado interno do Next).
  useEffect(() => {
    const q = filtrosParaQuery(f);
    const alvo = q ? `${pathname}?${q}` : pathname;
    if (`${window.location.pathname}${window.location.search}` !== alvo) window.history.replaceState(window.history.state, "", alvo);
  }, [f, pathname, p.itens]);

  const base = useMemo(() => filtrarBase(p.itens, f, pessoas), [p.itens, f, pessoas.eu, pessoas.conciergeId, pessoas.gestorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => contarPorSituacao(base, p.hoje), [base, p.hoje]);
  const lista = useMemo(() => filtrarTrabalho(p.itens, f, pessoas, p.hoje), [p.itens, f, p.hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const executaveis = lista.filter((i) => !marcoForaDaJanela(i, p.hoje));
  const marcosFuturos = lista.filter((i) => marcoForaDaJanela(i, p.hoje));
  // Atualização nova (orientação, resposta, devolução) aparece mesmo fora da seleção atual.
  const novidades = base.filter((i) => i.naoLido && i.status !== "concluida" && !lista.includes(i));
  const dependeDeMim = filtrarBase(p.itens, { ...f, dependeDeMim: true, responsavel: "todos" }, pessoas).filter((i) => situacaoTrabalho(i, p.hoje) !== "concluida");
  const semResponsavel = p.itens.filter((i) => i.status !== "concluida" && !responsavelEfetivo(i, pessoas));
  const naoLidos = p.itens.filter((i) => i.naoLido && i.status !== "concluida").length;
  const origens = [...new Set(p.itens.map((i) => i.origem).filter((x): x is string => !!x))].sort();
  const tipos = [...new Set(p.itens.map((i) => (i.subtipo === "comparecimento" ? "comparecimento" : i.tipo)))].sort();

  const so = (s: SituacaoTrabalho) => setF({ ...f, situacoes: [s], dependeDeMim: false });
  const alternarSituacao = (s: SituacaoTrabalho) => setF({ ...f, situacoes: f.situacoes.includes(s) ? f.situacoes.filter((x) => x !== s) : [...f.situacoes, s] });

  return (
    <ProvedorFila valor={{ hoje: p.hoje, proximoDiaUtil: p.proximoDiaUtil, usuarioId: p.eu, perfis: p.perfis, pacientes: p.pacientes, itens: p.itens, gestao: p.gestao, conciergeId: p.config.conciergeId, gestorId: p.config.gestorId }}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="fb-eyebrow">Dra. Larissa Andrade · {dataBr(p.hoje)}</p>
          <h1 className="font-serif text-[26px] leading-tight text-text-primary">{p.gestao ? `Trabalho da ${nomeConcierge}` : "Meu trabalho"}</h1>
        </div>
        {p.feedbackHoje && (
          <a href={p.gestao ? "/feedbacks" : "/fila"} className={clsx("rounded-full border px-3 py-1 text-xs", p.feedbackHoje.tipo === "pendente" ? "border-critical text-critical" : p.feedbackHoje.tipo === "entregue" ? "border-opportunity text-opportunity" : "border-border text-text-secondary")}>
            Feedback de hoje: {p.feedbackHoje.texto}
          </a>
        )}
      </header>

      {p.gestao && !p.config.conciergeId && (
        <p className="mb-4 rounded-md border border-important bg-important-bg p-3 text-sm text-important">
          Configuração pendente: a conta da concierge não está identificada de forma inequívoca. Tarefas importadas ficam sem responsável até a configuração (migration 0014).
        </p>
      )}

      {/* Indicadores: cada um abre exatamente a lista que contou (mesmos filtros). */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SITUACOES_TRABALHO.map((s) => (
          <button key={s} type="button" onClick={() => so(s)} aria-pressed={f.situacoes.length === 1 && f.situacoes[0] === s && !f.dependeDeMim}
            className={clsx("fb-card px-3 py-2 text-left", f.situacoes.includes(s) && !f.dependeDeMim && "ring-2 ring-accent")}>
            <span className="block text-[10px] uppercase tracking-wide text-text-muted">{ROTULO_SITUACAO_TRABALHO[s]}</span>
            <span className={clsx("font-serif text-[24px] leading-none", s === "atrasada" && contagem[s] ? "text-critical" : "text-text-primary")}>{contagem[s]}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {p.gestao && (
          <button type="button" className="fb-chip" data-ativo={f.dependeDeMim} onClick={() => setF({ ...f, dependeDeMim: !f.dependeDeMim, situacoes: f.dependeDeMim ? f.situacoes : [], responsavel: "todos" })}>
            Depende de mim · {dependeDeMim.length}
          </button>
        )}
        {p.gestao && semResponsavel.length > 0 && <span className="text-xs text-important">{semResponsavel.length} sem responsável (aparecem em “Depende de mim”)</span>}
        {naoLidos > 0 && <span className="text-xs text-accent">● {naoLidos} com atualização não lida</span>}
        <span className="text-xs text-text-muted">Cada item conta em uma situação só. “Sem atualização” = nada registrado há {p.config.diasSemAtualizacao}+ dias.</span>
      </div>

      <details className="fb-card mb-4 p-3" open={f.situacoes.length !== 2 || f.responsavel !== (p.gestao ? "todos" : "eu") || !!f.busca}>
        <summary className="cursor-pointer text-sm text-text-secondary">Filtros {f.busca || f.tipo || f.origem || f.prioridade || f.ate ? "(ativos)" : ""}</summary>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SITUACOES_TRABALHO.map((s) => (
            <button key={s} type="button" className="fb-chip" data-ativo={f.situacoes.includes(s)} onClick={() => alternarSituacao(s)}>{ROTULO_SITUACAO_TRABALHO[s]}</button>
          ))}
          <button type="button" className="fb-chip" data-ativo={f.situacoes.length === 0} onClick={() => setF({ ...f, situacoes: [] })}>Todas</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Campo label="Responsável">
            <select value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value as FiltrosTrabalho["responsavel"] })} className={classeInput}>
              <option value="todos">Todos</option>
              <option value="eu">Eu</option>
              {p.gestao && <option value="concierge">{nomeConcierge}</option>}
              {!p.gestao && <option value="gestor">Gestão</option>}
              <option value="sem">Sem responsável</option>
            </select>
          </Campo>
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
          <Campo label="Paciente ou assunto"><input value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} className={classeInput} placeholder="buscar" /></Campo>
        </div>
      </details>

      {novidades.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-accent">● Atualizações novas fora desta seleção ({novidades.length})</h2>
          <ul className="flex flex-col gap-2.5">
            {novidades.map((i) => <CartaoTrabalho key={i.id} item={i} {...p} pessoas={pessoas} aberto={aberto === i.id} onToggle={() => setAberto(aberto === i.id ? null : i.id)} />)}
          </ul>
        </section>
      )}
      {executaveis.length === 0 && marcosFuturos.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-5 text-sm text-text-secondary">
          {p.itens.length === 0 ? "Nenhuma tarefa cadastrada ainda." : `Nenhum item nesta seleção (${f.situacoes.map((s) => ROTULO_SITUACAO_TRABALHO[s]).join(", ") || "todas as situações"}).`}{" "}
          {f.situacoes.length > 0 && <button type="button" className="text-accent underline" onClick={() => setF({ ...f, situacoes: [] })}>ver todas</button>}
          {!p.gestao && <> · Algo novo no expediente? Registre em <a className="text-accent underline" href="/fila">Feedback diário</a>.</>}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {executaveis.map((i) => <CartaoTrabalho key={i.id} item={i} {...p} pessoas={pessoas} aberto={aberto === i.id} onToggle={() => setAberto(aberto === i.id ? null : i.id)} />)}
        </ul>
      )}
      {marcosFuturos.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-secondary">Marcos de acompanhamento futuros ({marcosFuturos.length}) — previstos para depois de {JANELA_MARCOS_DIAS} dias</summary>
          <ul className="mt-2 flex flex-col gap-2.5">
            {marcosFuturos.map((i) => <CartaoTrabalho key={i.id} item={i} {...p} pessoas={pessoas} aberto={aberto === i.id} onToggle={() => setAberto(aberto === i.id ? null : i.id)} />)}
          </ul>
        </details>
      )}
    </ProvedorFila>
  );
}

function CartaoTrabalho({ item: i, aberto, onToggle, pessoas, ...p }: PropsTrabalho & { item: ItemFila; aberto: boolean; onToggle: () => void; pessoas: Pessoas }) {
  const sit = situacaoTrabalho(i, p.hoje);
  const resp = responsavelEfetivo(i, pessoas);
  const nomeResp = resp ? p.perfis.find((x) => x.id === resp)?.nome ?? "—" : i.responsavel ?? null;
  const parado = i.status !== "concluida" && i.alvo?.tipo === "tarefa" ? diasDesde(i.atualizadoEm, p.hoje) : null;
  const semProxima = i.status !== "concluida" && i.alvo?.tipo === "tarefa" && !i.proximaAcao && i.status === "aguardando";
  return (
    <li className={clsx("rounded-[12px] border bg-surface p-4", i.naoLido ? "border-accent" : "border-border")}>
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={aberto}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {i.naoLido && <span className="text-xs font-medium text-accent">● nova atualização</span>}
            <Badge variant={sit === "atrasada" ? "critical" : sit === "aguardando_gestao" ? "important" : "informative"}>{ROTULO_SITUACAO_TRABALHO[sit].replace(/s$/, "")}</Badge>
            <Badge variant="neutral">{i.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[i.tipo] ?? i.tipo}</Badge>
            {i.prioridade === "alta" && <Badge variant="critical">Prioridade alta</Badge>}
            {i.atencao && <Badge variant="critical">Atenção</Badge>}
            {!!i.adiamentos && <Badge variant="important">{i.adiamentos} adiamento(s)</Badge>}
            {parado !== null && parado >= p.config.diasSemAtualizacao && <Badge variant="important">sem atualização há {parado} dias</Badge>}
            {semProxima && <Badge variant="important">sem próxima ação</Badge>}
          </div>
          <p className="mt-1 font-medium text-text-primary">{i.pacienteNome}{i.semPaciente && <span className="ml-1 text-xs font-normal text-text-muted">(assunto administrativo)</span>}</p>
          <p className="text-sm text-text-primary">{i.titulo}{i.valor !== undefined ? ` · ${brl(i.valor)}` : ""}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {i.status === "concluida" ? `Concluída${i.concluidaEm ? ` em ${dataBr(i.concluidaEm)}` : ""}` : `${sit === "aguardando_paciente" || sit === "aguardando_gestao" ? "Revisar em" : "Prazo"} ${dataBr(i.due)}`}
            {" · "}{nomeResp ? `Responsável: ${nomeResp}` : <span className="text-important">sem responsável</span>}
            {i.proximaAcao && i.status !== "concluida" ? ` · Próxima ação: ${i.proximaAcao}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-text-muted">{aberto ? "▴" : "▾"}</span>
      </button>
      {aberto && <DetalheItem item={i} {...p} pessoas={pessoas} nomeResp={nomeResp} />}
    </li>
  );
}

function Linha({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return <div className="flex gap-2 text-sm"><dt className="w-36 shrink-0 text-text-muted">{k}</dt><dd className="min-w-0 text-text-primary">{v}</dd></div>;
}

function DetalheItem({ item: i, pessoas, nomeResp, ...p }: PropsTrabalho & { item: ItemFila; pessoas: Pessoas; nomeResp: string | null }) {
  const [eventos, setEventos] = useState<EventoHist[] | null>(null);
  const [erroHist, setErroHist] = useState<string | null>(null);
  const [acao, setAcao] = useState<"andamento" | "mensagem" | "editar" | null>(null);
  const alvo = i.alvo;

  useEffect(() => {
    if (!alvo || alvo.tipo === "atendimento") return;
    // Abrir o detalhe = ler o histórico completo: só aqui a atualização conta como lida.
    void chamarApi<{ eventos: EventoHist[] }>(`/api/fila/historico?tipo=${alvo.tipo}&id=${alvo.id}&ler=1`, "GET").then((r) => (r.ok ? setEventos(r.data.eventos) : setErroHist(r.erro)));
  }, [alvo]);

  if (alvo?.tipo === "atendimento") return <div className="mt-3 border-t border-border pt-3"><ConferirAtendimento item={i} gestao={p.gestao} /></div>;
  const aberta = i.status !== "concluida";
  const ROT_AGUARDANDO = { paciente: "Aguardando paciente", gestao: "Aguardando gestão" } as const;
  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3">
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">O que fazer</h3>
        <dl className="flex flex-col gap-1">
          <Linha k="Ação" v={i.titulo} />
          <Linha k={i.semPaciente ? "Assunto" : "Paciente"} v={i.pacienteNome} />
          <Linha k="Contexto" v={i.contexto} />
          <Linha k="Orientação da gestão" v={i.orientacao} />
          <Linha k="Resultado esperado" v={i.resultadoEsperado} />
          <Linha k="Ocorrência" v={i.tipo === "recuperacao_falta" ? (i.ocorrencia ? `${i.ocorrencia === "falta" ? "Falta" : "Cancelamento"}${i.dataOcorrencia ? ` em ${dataBr(i.dataOcorrencia)}` : ""}` : <span className="text-important">não informada — confira antes de agir</span>) : undefined} />
          <Linha k="Atendimento de referência" v={i.tipo === "marco" && i.dataAtendimento ? dataBr(i.dataAtendimento) : undefined} />
          <Linha k="Prazo original" v={i.prazoOriginal && i.prazoOriginal !== i.due ? dataBr(i.prazoOriginal) : undefined} />
          <Linha k="Responsável" v={nomeResp ?? <span className="text-important">sem responsável</span>} />
          <Linha k="Prioridade" v={i.alvo?.tipo === "tarefa" ? ROTULO_PRIORIDADE[i.prioridade ?? "normal"] : undefined} />
          <Linha k="Prazo" v={dataBr(i.due)} />
          <Linha k="Origem" v={i.origem ? `${i.origem}${i.origemData ? ` · informação de ${dataBr(i.origemData)}` : ""}` : undefined} />
          <Linha k="A conferir" v={i.aConferir?.length ? <span className="text-important">{i.aConferir.join(", ")} (dado pendente de conferência)</span> : undefined} />
        </dl>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">O que aconteceu</h3>
        {erroHist && <p className="text-sm text-critical">Não consegui carregar o histórico: {erroHist}</p>}
        {!erroHist && !eventos && <p className="text-sm text-text-muted">Carregando histórico…</p>}
        {eventos && !eventos.length && <p className="text-sm text-text-muted">Nenhum registro ainda.</p>}
        {eventos && eventos.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {eventos.map((e) => (
              <li key={e.id} className={clsx("rounded-[8px] border px-2.5 py-1.5 text-sm", e.kind === "nota" ? "border-accent/40 bg-accent-soft/40" : "border-border")}>
                <span className="text-xs text-text-muted">{e.registradoEm ? horaBr(e.registradoEm) : dataBr(e.occurredOn)} · {e.autor}</span>
                <span className="ml-1.5 text-xs font-semibold text-text-secondary">{rotuloEvento(e)}</span>
                {e.notes && <p className="text-text-primary">{e.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">O que vem agora</h3>
        <dl className="flex flex-col gap-1">
          <Linha k="Situação" v={i.status === "concluida" ? `Concluída${i.detalhe ? ` — ${i.detalhe}` : ""}` : i.status === "aguardando" ? ROT_AGUARDANDO[i.aguardando ?? "paciente"] : "Aberta / a fazer"} />
          <Linha k="Próxima ação" v={aberta ? i.proximaAcao ?? <span className="text-text-muted">não definida — a ação é a do título</span> : undefined} />
          <Linha k="Responsável" v={aberta ? nomeResp ?? "—" : undefined} />
          <Linha k={i.status === "aguardando" ? "Revisar em" : "Prazo"} v={aberta ? dataBr(i.due) : undefined} />
        </dl>
      </section>

      {aberta && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fb-chip" data-ativo={acao === "andamento"} onClick={() => setAcao(acao === "andamento" ? null : "andamento")}>Registrar andamento</button>
          {i.alvo?.tipo === "tarefa" && (
            <button type="button" className="fb-chip" data-ativo={acao === "mensagem"} onClick={() => setAcao(acao === "mensagem" ? null : "mensagem")}>
              {p.gestao ? "Orientar / responder" : "Pedir orientação à gestão"}
            </button>
          )}
          {p.gestao && i.alvo?.tipo === "tarefa" && <button type="button" className="fb-chip" data-ativo={acao === "editar"} onClick={() => setAcao(acao === "editar" ? null : "editar")}>Editar tarefa</button>}
        </div>
      )}
      {acao === "andamento" && <PainelAndamento item={i} hoje={p.hoje} itens={p.itens} onSalvo={() => setAcao(null)} />}
      {acao === "mensagem" && <FormMensagem item={i} {...p} onSalvo={() => setAcao(null)} />}
      {acao === "editar" && <EditarTarefa item={i} perfis={p.perfis} onSalvo={() => setAcao(null)} />}
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
