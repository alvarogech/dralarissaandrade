"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { FeedbackComRegistros } from "@/lib/fila/entrega";
import { Campo, chamarApi, classeInput, dataBr, horaBr } from "./comum";

/**
 * Gestão: histórico dos feedbacks entregues pela concierge (por data e responsável), situação da
 * entrega, conteúdo de cada versão, registros que originaram o resumo e observação/pedido de
 * ajuste. A gestão não produz feedback próprio. Também configura o expediente (sem ele, nada é
 * cobrado: "Expediente não configurado").
 */
interface Props {
  hoje: string;
  dia: string | null;
  feedbacks: FeedbackComRegistros[];
  conciergeNome: string;
  situacaoHoje: string;
  expediente: { diasExpediente: number[] | null; horarioFechamento: string | null; excecoes: string[]; diasSemAtualizacao: number };
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function FeedbacksView({ hoje, dia, feedbacks, conciergeNome, situacaoHoje, expediente }: Props) {
  const porDia = new Map<string, FeedbackComRegistros[]>();
  for (const f of feedbacks) porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), f]);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="fb-eyebrow">Acompanhamento da gestão</p>
          <h1 className="font-serif text-[26px] leading-tight text-text-primary">Feedbacks da {conciergeNome}</h1>
        </div>
        <p className="text-sm text-text-secondary">Hoje ({dataBr(hoje)}): <strong className="text-text-primary">{situacaoHoje}</strong></p>
      </header>

      <form className="flex flex-wrap items-end gap-2" action="/feedbacks">
        <Campo label="Ver um dia"><input type="date" name="dia" max={hoje} defaultValue={dia ?? ""} className={classeInput} /></Campo>
        <Button type="submit">Ver</Button>
        {dia && <a href="/feedbacks" className="text-sm text-text-muted underline">últimos 30 dias</a>}
      </form>

      {!feedbacks.length && (
        <p className="rounded-[12px] border border-dashed border-border p-5 text-sm text-text-secondary">
          {dia ? `Nenhum feedback gerado ou entregue em ${dataBr(dia)}.` : "Nenhum feedback gerado ou entregue nos últimos 30 dias."}
        </p>
      )}
      {[...porDia.entries()].map(([d, versoes]) => (
        <section key={d} className="flex flex-col gap-2">
          <h2 className="font-serif text-[19px] text-text-primary">{dataBr(d)}</h2>
          {versoes.map((f) => <CartaoFeedback key={f.id} f={f} />)}
        </section>
      ))}

      <Expediente inicial={expediente} />
    </div>
  );
}

function CartaoFeedback({ f }: { f: FeedbackComRegistros }) {
  const router = useRouter();
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function comentar(solicitarAjuste: boolean) {
    setErro(null);
    setSalvando(true);
    const r = await chamarApi("/api/fila/feedback-diario", "POST", { operacao: "comentar", id: f.id, observacao: obs, solicitarAjuste });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setObs("");
    router.refresh();
  }

  return (
    <article className="fb-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-text-primary">{f.responsavelNome}</span>
        <span className="text-text-muted">· versão {f.versao}{f.substitui ? " (corrigida)" : ""}</span>
        <span className={clsx("rounded-full px-2 py-0.5 text-xs", f.status === "entregue" ? "bg-opportunity-bg text-opportunity" : "bg-surface-raised text-text-secondary")}>
          {f.status === "entregue" ? `Entregue ${f.entregueEm ? horaBr(f.entregueEm) : ""}` : "Gerado — ainda não entregue"}
        </span>
        {f.copiadoEm && <span className="text-xs text-text-muted">copiado {horaBr(f.copiadoEm)}</span>}
        {f.whatsappConfirmadoEm && <span className="text-xs text-text-muted">envio WhatsApp confirmado {horaBr(f.whatsappConfirmadoEm)}</span>}
        {f.ajusteSolicitadoEm && <span className="text-xs text-important">ajuste solicitado {horaBr(f.ajusteSolicitadoEm)}</span>}
      </div>
      <details className="mt-2" open={f.status === "entregue" && !f.observacaoGestao}>
        <summary className="cursor-pointer text-sm text-text-secondary">Conteúdo entregue</summary>
        <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-raised p-3 font-sans text-[13px] text-text-primary">{f.texto}</pre>
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-text-secondary">Registros que originaram o resumo ({f.registros.length})</summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {f.registros.map((r) => <li key={r.id} className="text-text-secondary"><span className="text-text-muted">{r.hora} · {r.autor}</span> — {r.texto || r.tipo}</li>)}
          {!f.registros.length && <li className="text-text-muted">Nenhum registro no dia.</li>}
        </ul>
      </details>
      {f.observacaoGestao && <p className="mt-2 text-sm text-text-secondary">Sua observação: “{f.observacaoGestao}”</p>}
      {f.status === "entregue" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Campo label="Observação ou ajuste solicitado"><input value={obs} onChange={(e) => setObs(e.target.value)} className={`${classeInput} min-w-[260px]`} /></Campo>
          <button type="button" className="fb-chip" disabled={!obs.trim() || salvando} onClick={() => comentar(false)}>Registrar observação</button>
          <button type="button" className="fb-chip" disabled={!obs.trim() || salvando} onClick={() => comentar(true)}>Solicitar ajuste</button>
          {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
        </div>
      )}
    </article>
  );
}

function Expediente({ inicial }: { inicial: Props["expediente"] }) {
  const router = useRouter();
  const [dias, setDias] = useState<number[]>(inicial.diasExpediente ?? []);
  const [horario, setHorario] = useState(inicial.horarioFechamento ?? "");
  const [excecoes, setExcecoes] = useState<string[]>(inicial.excecoes);
  const [nova, setNova] = useState("");
  const [semAtualizacao, setSemAtualizacao] = useState(String(inicial.diasSemAtualizacao));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const configurado = !!inicial.diasExpediente?.length && !!inicial.horarioFechamento;

  async function salvar() {
    setMsg(null);
    setSalvando(true);
    const r = await chamarApi("/api/fila/config", "POST", { diasExpediente: dias.length ? dias : null, horarioFechamento: horario || null, excecoes, diasSemAtualizacao: Number(semAtualizacao) });
    setSalvando(false);
    if (!r.ok) return setMsg({ ok: false, t: r.erro });
    setMsg({ ok: true, t: "Expediente salvo." });
    router.refresh();
  }

  return (
    <details className="fb-card p-4" open={!configurado}>
      <summary className="cursor-pointer font-serif text-[18px] text-text-primary">Expediente da concierge {configurado ? "" : "— não configurado"}</summary>
      <p className="mt-2 text-xs text-text-muted">Fuso America/Sao_Paulo. Sem dias e horário configurados, o sistema não cobra a entrega nem declara atraso.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DIAS.map((d, i) => (
          <button key={d} type="button" className="fb-chip" data-ativo={dias.includes(i)} onClick={() => setDias(dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort())}>{d}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Campo label="Horário de fechamento"><input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className={classeInput} /></Campo>
        <Campo label="“Sem atualização” depois de (dias)"><input type="number" min={1} max={60} value={semAtualizacao} onChange={(e) => setSemAtualizacao(e.target.value)} className={classeInput} /></Campo>
        <div className="flex items-end gap-2">
          <Campo label="Exceção (sem expediente)"><input type="date" value={nova} onChange={(e) => setNova(e.target.value)} className={classeInput} /></Campo>
          <button type="button" className="fb-chip" disabled={!nova} onClick={() => { setExcecoes([...new Set([...excecoes, nova])].sort()); setNova(""); }}>Incluir</button>
        </div>
      </div>
      {excecoes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {excecoes.map((d) => <li key={d}><button type="button" className="fb-chip" onClick={() => setExcecoes(excecoes.filter((x) => x !== d))}>{dataBr(d)} ✕</button></li>)}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" loading={salvando} loadingText="Salvando…" onClick={salvar}>Salvar expediente</Button>
        {msg && <span className={clsx("text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</span>}
      </div>
    </details>
  );
}
