"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { textoCaixa, type EstadoCaixa } from "@/lib/fila/caixa";
import type { Fechamento } from "@/lib/fila/fechamento";
import type { EstadoExpediente } from "@/lib/fila/meu-dia";
import type { ContatosPorAtividade, IndicadoresDia } from "@/lib/fila/prestacao";
import type { FeedbackRow, PrioridadeDoDia, RascunhoFechamento } from "@/lib/fila/store";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr, soHora } from "./comum";

/**
 * Etapa 2 — "Fechamento do dia": prestação de contas consolidada. Tudo o que foi registrado na rotina
 * (atividades, pacientes e resultados, acompanhamentos, cobranças, recebimentos, solicitações da
 * gestão, impedimentos) já vem preenchido; a concierge só complementa observações, decisões para a
 * gestão e as prioridades do próximo dia útil (obrigatório revisar, mesmo que seja "nenhuma").
 * Rascunho fica no servidor. "Feedback enviado com sucesso!" só depois da confirmação do servidor;
 * repetir o clique não duplica. Enviar não conclui pendências nem manda mensagem a ninguém.
 */
export interface SolicitacaoResumo { id: string; titulo: string; paciente: string | null; solicitadoPor: string | null; situacao: string }
export interface Sugestao { ref: string | null; texto: string; motivo: string; paciente?: string | null; data?: string | null; origem: string }

interface Props {
  hoje: string;
  proximoDia: string;
  fechamento: Fechamento;
  /** Texto completo da prestação (mesmo montador do envio e da gestão). */
  texto: string;
  estado: EstadoExpediente;
  entregue: FeedbackRow | null;
  aguardandoGestao: number;
  atrasadas: number;
  contatos: ContatosPorAtividade[];
  caixa: EstadoCaixa;
  solicitacoes: SolicitacaoResumo[];
  rascunho: RascunhoFechamento;
  prioridades: PrioridadeDoDia[];
  sugestoes: Sugestao[];
  indicadores: IndicadoresDia;
}

function Linha({ k, v, tom }: { k: string; v: React.ReactNode; tom?: "critico" | "atencao" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 last:border-b-0">
      <dt className="text-[14px] text-text-secondary">{k}</dt>
      <dd className={clsx("text-right text-[15px] font-semibold tabular-nums", tom === "critico" ? "text-critical" : tom === "atencao" ? "text-important" : "text-text-primary")}>{v}</dd>
    </div>
  );
}

function Lista({ titulo, itens, vazio, aberta }: { titulo: string; itens: string[]; vazio?: string; aberta?: boolean }) {
  if (!itens.length && !vazio) return null;
  return (
    <details className="rounded-control border border-border bg-surface" open={aberta}>
      <summary className="cursor-pointer px-3 py-2 text-[14px] text-text-primary">{titulo} ({itens.length})</summary>
      <ul className="list-disc space-y-0.5 border-t border-border px-3 py-2 pl-7 text-[13.5px] text-text-secondary">
        {itens.length ? itens.map((t, k) => <li key={k}>{t}</li>) : <li className="list-none text-text-muted">{vazio}</li>}
      </ul>
    </details>
  );
}

const PRIORIDADE_VAZIA: PrioridadeDoDia = { ref: null, texto: "", paciente: "", data: null, prioridade: "normal", origem: "manual", proxima: "" };

export function FinalizarDiaView(p: Props) {
  const { hoje, fechamento: f, estado, entregue } = p;
  const router = useRouter();
  const [obs, setObs] = useState(p.rascunho.observacao ?? String(entregue?.contadores.observacao_concierge ?? ""));
  const [decisoes, setDecisoes] = useState(p.rascunho.decisoes ?? String(entregue?.contadores.decisoes_concierge ?? ""));
  const [salvoEm, setSalvoEm] = useState(p.rascunho.salvoEm ?? null);
  const [erroRascunho, setErroRascunho] = useState<{ erro: string; status?: number } | null>(null);
  const [prios, setPrios] = useState<PrioridadeDoDia[]>(p.prioridades);
  const [confirmadas, setConfirmadas] = useState(!!p.rascunho.prioridadesConfirmadas);
  const [salvandoPrios, setSalvandoPrios] = useState(false);
  const [erroPrios, setErroPrios] = useState<{ erro: string; status?: number } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; status?: number; conflito?: boolean } | null>(null);
  const [sucesso, setSucesso] = useState<FeedbackRow | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [idEnvio, setIdEnvio] = useState(() => crypto.randomUUID());
  const refSucesso = useRef<HTMLHeadingElement>(null);
  const refFalha = useRef<HTMLDivElement>(null);
  const refPrios = useRef<HTMLElement>(null);

  // Rascunho no servidor: salva ao sair do campo (só se mudou).
  const salvoRef = useRef({ observacao: obs, decisoes });
  async function salvarRascunho(campo: "observacao" | "decisoes", valor: string) {
    if (salvoRef.current[campo] === valor) return;
    setErroRascunho(null);
    const r = await chamarApi<{ rascunho: RascunhoFechamento }>("/api/fila/dia", "POST", { rascunho: { [campo]: valor } });
    if (!r.ok) return setErroRascunho({ erro: `Não conseguimos salvar o rascunho. ${r.erro}`, status: r.status });
    salvoRef.current = { ...salvoRef.current, [campo]: valor };
    setSalvoEm(r.data.rascunho.salvoEm ?? null);
    router.refresh();
  }

  async function salvarPrioridades(lista: PrioridadeDoDia[]) {
    setErroPrios(null);
    const faltando = lista.findIndex((x) => !x.texto.trim());
    if (faltando >= 0) return setErroPrios({ erro: `Prioridade ${faltando + 1}: escreva a descrição (ou remova).` });
    setSalvandoPrios(true);
    const a = await chamarApi("/api/fila/dia", "POST", { dia: hoje, prioridades: lista });
    if (!a.ok) { setSalvandoPrios(false); return setErroPrios({ erro: `Não conseguimos salvar as prioridades. ${a.erro}`, status: a.status }); }
    const b = await chamarApi<{ rascunho: RascunhoFechamento }>("/api/fila/dia", "POST", { rascunho: { prioridadesConfirmadas: true } });
    setSalvandoPrios(false);
    if (!b.ok) return setErroPrios({ erro: `Não conseguimos salvar as prioridades. ${b.erro}`, status: b.status });
    setConfirmadas(true);
    setSalvoEm(b.data.rascunho.salvoEm ?? null);
    router.refresh();
  }

  const incluir = (s: Sugestao) => {
    if (prios.some((x) => (s.ref && x.ref === s.ref) || x.texto === s.texto) || prios.length >= 8) return;
    setPrios([...prios, { ref: s.ref, texto: s.texto, paciente: s.paciente ?? null, data: s.data ?? null, prioridade: "normal", origem: s.origem, proxima: null }]);
    setConfirmadas(false);
  };
  const mudar = (i: number, campo: keyof PrioridadeDoDia, v: string | null) => { setPrios(prios.map((x, k) => (k === i ? { ...x, [campo]: v } : x))); setConfirmadas(false); };

  const r = f.rotina;
  const semRegistro = r?.pendentes ?? [];
  const pacientes = f.blocos.flatMap((b) => b.linhas.map((l) => `${l.paciente} · ${l.item}: ${l.texto}`));
  const avisos = [
    semRegistro.length ? `${semRegistro.length} atividade${semRegistro.length === 1 ? "" : "s"} da rotina ainda sem registro.` : null,
    r?.impedimentos.length ? `${r.impedimentos.length} atividade${r.impedimentos.length === 1 ? "" : "s"} com impedimento: a gestão vai ver o motivo.` : null,
    p.caixa.tipo === "nao_conferido" ? "A conferência de recebimentos não foi feita hoje." : null,
    p.caixa.tipo === "conferido" && p.caixa.diferenca !== 0 && !p.caixa.justificativa ? "Há diferença nos recebimentos sem justificativa." : null,
    p.atrasadas ? `${p.atrasadas} pendência${p.atrasadas === 1 ? "" : "s"} atrasada${p.atrasadas === 1 ? "" : "s"} continua${p.atrasadas === 1 ? "" : "m"} aberta${p.atrasadas === 1 ? "" : "s"}.` : null,
  ].filter((x): x is string => !!x);

  const jaEnviado = estado.tipo === "enviado" && !estado.mudouDepois && !sucesso;
  const corrigir = estado.tipo === "ajuste_solicitado" || (estado.tipo === "enviado" && estado.mudouDepois);
  const rotuloBotao = estado.tipo === "ajuste_solicitado" ? "Enviar versão corrigida" : estado.tipo === "enviado" && estado.mudouDepois ? "Enviar versão atualizada" : "Finalizar e enviar prestação de contas";

  async function enviar() {
    setFalha(null);
    setEnviando(true);
    const res = await chamarApi<{ feedback: FeedbackRow; jaEnviado: boolean }>("/api/fila/feedback-diario", "POST", { operacao: "finalizar", id: idEnvio, dia: hoje, observacao: obs, decisoes, corrigir });
    setEnviando(false);
    if (!res.ok) {
      setFalha({
        erro: res.incerto ? "Não recebemos a confirmação do envio. Pode não ter sido enviado: toque em “Tentar novamente” (não duplica)." : `Ainda não foi enviado. ${res.erro}`,
        status: res.status, conflito: res.status === 409 || res.status === 422,
      });
      setTimeout(() => refFalha.current?.focus(), 0);
      return;
    }
    setSucesso(res.data.feedback);
    setRevisando(false);
    setIdEnvio(crypto.randomUUID());
    router.refresh();
    setTimeout(() => refSucesso.current?.focus(), 50);
  }

  function aoClicarFinalizar() {
    if (!confirmadas) {
      setErroPrios({ erro: "Revise as prioridades para o próximo dia útil antes de enviar (pode ser “não há prioridades”)." });
      refPrios.current?.scrollIntoView({ block: "center" });
      return;
    }
    if (avisos.length) { setRevisando(true); return; }
    void enviar();
  }

  const enviadoAgora = sucesso ?? (jaEnviado ? entregue : null);
  const textoEnviado = enviadoAgora?.texto ?? entregue?.texto ?? "";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-text-muted" aria-live="polite">
        {enviadoAgora ? "Prestação de contas enviada." : salvoEm ? `Rascunho salvo às ${soHora(salvoEm)}. Ainda não enviado.` : "Rascunho: ainda não enviado."}
      </p>

      {enviadoAgora && (
        <section aria-labelledby="fb-enviado" className="rounded-card border border-opportunity bg-opportunity-bg p-5">
          <h3 id="fb-enviado" ref={refSucesso} tabIndex={-1} className="font-serif text-[26px] font-medium leading-tight text-opportunity outline-none">
            <span aria-hidden>✓ </span>{sucesso ? "Feedback enviado com sucesso!" : "Sua prestação de contas de hoje já foi enviada"}
          </h3>
          <p className="mt-1 text-[15px] text-text-primary">Seu resumo do dia foi registrado e está disponível para a gestão.</p>
          <p className="mt-1 text-[13.5px] text-text-secondary">Enviado em {dataBr(enviadoAgora.dia)} às {enviadoAgora.entregueEm ? soHora(enviadoAgora.entregueEm) : "—"} · versão {enviadoAgora.versao}</p>
          <div className="mt-3"><Button type="button" variante="secundario" aria-expanded={verTexto} onClick={() => setVerTexto(!verTexto)}>{verTexto ? "Esconder feedback enviado" : "Ver feedback enviado"}</Button></div>
          {verTexto && <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface p-3 font-sans text-[13px] leading-relaxed text-text-primary">{textoEnviado}</pre>}
        </section>
      )}
      {estado.tipo === "ajuste_solicitado" && !sucesso && (
        <section role="status" className="rounded-card border border-important bg-important-bg p-4 text-[14.5px] text-important">
          <p className="font-semibold">A gestão pediu um ajuste (versão {estado.versao}).</p>
          {estado.observacao && <p className="mt-1">“{estado.observacao}”</p>}
          <p className="mt-1 text-[13.5px]">Complete os registros e envie a versão corrigida. A anterior continua guardada.</p>
        </section>
      )}
      {estado.tipo === "enviado" && estado.mudouDepois && !sucesso && (
        <section role="status" className="rounded-card border border-informative bg-informative-bg p-4 text-[14.5px] text-informative">
          <p className="font-semibold">Enviado às {entregue?.entregueEm ? soHora(entregue.entregueEm) : "—"}, e você registrou algo depois disso.</p>
          <p className="mt-1 text-[13.5px]">Se quiser que a gestão veja, envie a versão atualizada. A anterior continua guardada.</p>
        </section>
      )}

      <section aria-labelledby="resumo-dia" className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <h3 id="resumo-dia" className="font-serif text-[22px] font-medium text-text-primary">Resumo do seu dia</h3>
        <p className="mt-0.5 text-[13px] text-text-muted">Preparado com base no que você registrou. Nada aqui precisa ser digitado de novo.</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="fb-eyebrow mb-1">Rotina</h4>
            {r ? (
              <>
                <dl>
                  <Linha k="Executadas" v={r.feitos.length} />
                  <Linha k="Não se aplica" v={r.naoSeAplica.length} />
                  <Linha k="Com impedimento" v={r.impedimentos.length} tom={r.impedimentos.length ? "critico" : undefined} />
                  <Linha k="Ainda sem registro" v={semRegistro.length} tom={semRegistro.length ? "atencao" : undefined} />
                </dl>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Lista titulo="Com impedimento" itens={r.impedimentos.map((i) => `${i.item}: ${i.motivo} — próxima ação: ${i.proxima}`)} aberta />
                  <Lista titulo="Ainda sem registro" itens={semRegistro} />
                </div>
              </>
            ) : <p className="text-[14px] text-text-muted">A rotina não está disponível agora; o resto do resumo continua valendo.</p>}
            <h4 className="fb-eyebrow mb-1 mt-4">Recebimentos</h4>
            <p className={clsx("text-[14px]", p.caixa.tipo === "nao_conferido" ? "text-important" : "text-text-primary")}>{textoCaixa(p.caixa)}</p>
          </div>
          <div>
            <h4 className="fb-eyebrow mb-1">Contatos e retornos</h4>
            <dl>
              <Linha k="Contatos realizados" v={`${p.indicadores.tentativas} (${p.indicadores.pacientesContatadas} paciente${p.indicadores.pacientesContatadas === 1 ? "" : "s"})`} />
              <Linha k="Com resposta / sem resposta" v={`${p.indicadores.comResposta} / ${p.indicadores.semResposta}`} />
              <Linha k="Retornos programados hoje" v={p.indicadores.followupsProgramados} />
              <Linha k="Retornos concluídos hoje" v={p.indicadores.followupsConcluidos} />
              <Linha k="Retornos vencidos" v={p.indicadores.followupsVencidos} tom={p.indicadores.followupsVencidos ? "critico" : undefined} />
              <Linha k="Pós-procedimento: acompanhadas / sem resposta" v={`${p.indicadores.posAcompanhados} / ${p.indicadores.posSemResposta}`} />
              <Linha k="Encaminhadas ao profissional" v={p.indicadores.encaminhadosProfissional} tom={p.indicadores.encaminhadosProfissional ? "atencao" : undefined} />
            </dl>
            <h4 className="fb-eyebrow mb-1 mt-4">Pacientes e acompanhamentos</h4>
            <dl>
              <Linha k="Registros do dia" v={f.contadores.registros} />
              <Linha k="Agendamentos" v={f.contadores.agendamentos} />
              <Linha k="Resolvidos hoje" v={f.contadores.resolvidos} />
              <Linha k="Continuam abertas" v={f.pendentesAbertas.length} />
              <Linha k="Aguardando a gestão" v={p.aguardandoGestao} tom={p.aguardandoGestao ? "atencao" : undefined} />
            </dl>
            <div className="mt-2 flex flex-col gap-1.5">
              {p.contatos.length > 0 && <Lista titulo="Contatos da rotina por atividade" aberta itens={p.contatos.map((c) => `${c.rotulo}: ${c.total} — ${c.porResultado.map((x) => `${x.n} ${x.resultado.toLowerCase()}`).join(", ")}`)} />}
              <Lista titulo="Pacientes e resultados" itens={pacientes} vazio="Nenhum registro com paciente hoje." />
              <Lista titulo="Solicitações da gestão" itens={p.solicitacoes.map((s) => `${s.titulo}${s.paciente ? ` (${s.paciente})` : ""}${s.solicitadoPor ? ` — ${s.solicitadoPor}` : ""}: ${s.situacao}`)} />
              <Lista titulo="Continuam abertas" itens={f.pendentesAbertas.map((x) => `${x.paciente} — ${x.item} (${x.quando})`)} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:p-5 lg:grid-cols-2">
        <div>
          <label htmlFor="decisoes-final" className="block text-[15px] font-semibold text-text-primary">Situações que exigem decisão da gestão</label>
          <p className="mt-0.5 text-[13px] text-text-muted">Opcional. O que precisa de resposta de Álvaro ou da Dra. Larissa.</p>
          <textarea id="decisoes-final" rows={3} value={decisoes} onChange={(e) => setDecisoes(e.target.value)} onBlur={() => void salvarRascunho("decisoes", decisoes)} maxLength={2000} className={clsx(classeInput, "mt-2")} />
        </div>
        <div>
          <label htmlFor="obs-final" className="block text-[15px] font-semibold text-text-primary">Algo importante que a gestão precisa saber?</label>
          <p className="mt-0.5 text-[13px] text-text-muted">Opcional. Não precisa repetir o que já está registrado.</p>
          <textarea id="obs-final" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} onBlur={() => void salvarRascunho("observacao", obs)} maxLength={2000} className={clsx(classeInput, "mt-2")}
            placeholder="Registre alguma ocorrência, dúvida ou informação importante do dia." />
        </div>
        {erroRascunho && <div className="lg:col-span-2"><ErroAcao erro={erroRascunho.erro} status={erroRascunho.status} /></div>}
      </section>

      <section ref={refPrios} aria-labelledby="prios-titulo" className={clsx("rounded-card border bg-surface p-4 sm:p-5", confirmadas ? "border-border" : "border-accent")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="prios-titulo" className="font-serif text-[22px] font-medium text-text-primary">Prioridades para o próximo dia útil ({dataBr(p.proximoDia)})</h3>
          <span className={clsx("text-[13px] font-medium", confirmadas ? "text-opportunity" : "text-accent")}>{confirmadas ? "✓ Revisadas" : "Obrigatório revisar"}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-text-muted">Aparecem no topo da sua rotina no próximo dia útil. Atividades da rotina já voltam sozinhas: aqui vai só o que precisa de atenção especial.</p>
        {p.sugestoes.length > 0 && (
          <div className="mt-3">
            <p className="text-[12.5px] font-medium text-text-secondary">Sugestões (toque para incluir)</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {p.sugestoes.map((s, k) => {
                const ja = prios.some((x) => (s.ref && x.ref === s.ref) || x.texto === s.texto);
                return (
                  <li key={k}><button type="button" disabled={ja} onClick={() => incluir(s)} className={clsx("rounded-control border px-2.5 py-1.5 text-left text-[13px]", ja ? "border-opportunity bg-opportunity-bg text-opportunity" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
                    {ja ? "✓ " : "+ "}{s.texto} <span className="text-text-muted">· {s.motivo}</span>
                  </button></li>
                );
              })}
            </ul>
          </div>
        )}
        {prios.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {prios.map((x, i) => (
              <li key={i} className="grid gap-2 rounded-control border border-border p-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_150px_auto]">
                <Campo label={`Prioridade ${i + 1} *`}><input value={x.texto} onChange={(e) => mudar(i, "texto", e.target.value)} className={classeInput} /></Campo>
                <Campo label="Paciente (se houver)"><input value={x.paciente ?? ""} onChange={(e) => mudar(i, "paciente", e.target.value)} className={classeInput} /></Campo>
                <Campo label="Data prevista"><input type="date" min={hoje} value={x.data ?? ""} onChange={(e) => mudar(i, "data", e.target.value || null)} className={classeInput} /></Campo>
                <div className="flex items-end gap-2">
                  <label className="flex min-h-10 items-center gap-1.5 text-[13px] text-text-secondary"><input type="checkbox" checked={x.prioridade === "alta"} onChange={(e) => mudar(i, "prioridade", e.target.checked ? "alta" : "normal")} /> Alta</label>
                  <button type="button" className="min-h-10 text-[13px] text-text-muted underline" onClick={() => { setPrios(prios.filter((_, k) => k !== i)); setConfirmadas(false); }}>remover</button>
                </div>
                <div className="sm:col-span-4"><Campo label="Próxima ação (opcional)"><input value={x.proxima ?? ""} onChange={(e) => mudar(i, "proxima", e.target.value)} className={classeInput} /></Campo></div>
                {x.origem && <p className="text-[12px] text-text-muted sm:col-span-4">Origem: {x.origem}{x.ref ? ` [${x.ref}]` : ""}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="fb-chip" disabled={prios.length >= 8} onClick={() => { setPrios([...prios, { ...PRIORIDADE_VAZIA }]); setConfirmadas(false); }}>+ Nova prioridade</button>
          <Button type="button" loading={salvandoPrios} loadingText="Salvando…" onClick={() => void salvarPrioridades(prios)}>
            {prios.length ? "Confirmar prioridades" : "Não há prioridades para amanhã"}
          </Button>
        </div>
        {erroPrios && <ErroAcao className="mt-2" erro={erroPrios.erro} status={erroPrios.status} />}
      </section>

      {revisando && !enviando && (
        <section role="alertdialog" aria-labelledby="rev-titulo" className="rounded-card border border-important bg-important-bg p-4">
          <h3 id="rev-titulo" className="text-[16px] font-semibold text-important">Antes de enviar, confira:</h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[14px] text-text-primary">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="mt-2 text-[13px] text-text-secondary">Você pode enviar assim mesmo. Enviar não conclui pendências e não manda mensagem para pacientes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void enviar()}>Confirmar e enviar</Button>
            <Button type="button" variante="secundario" onClick={() => setRevisando(false)}>Voltar e revisar</Button>
          </div>
        </section>
      )}
      {falha && (
        <div ref={refFalha} tabIndex={-1} className="outline-none">
          <ErroAcao erro={falha.erro} status={falha.status} onTentar={falha.conflito ? undefined : () => void enviar()} />
        </div>
      )}
      {(!enviadoAgora || corrigir) && (
        <div className="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-4 sm:p-5">
          <Button type="button" className="min-h-12 px-7 text-[16px]" loading={enviando} loadingText="Enviando…" disabled={revisando} onClick={aoClicarFinalizar}>{rotuloBotao}</Button>
          <p className="text-[12.5px] text-text-muted">{confirmadas ? "A prestação de contas vai para a gestão no sistema. Nada é enviado por WhatsApp automaticamente." : "Revise as prioridades para o próximo dia útil para liberar o envio."}</p>
        </div>
      )}

      <details className="rounded-card border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-[14px] text-text-secondary">Ver o texto completo {enviadoAgora && !corrigir ? "enviado" : "que será enviado"}</summary>
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap border-t border-border bg-surface-raised p-4 font-sans text-[13px] leading-relaxed text-text-primary">{enviadoAgora && !corrigir ? textoEnviado : p.texto}</pre>
      </details>
      <p className="text-[13px] text-text-muted">Registros por área e fechamentos anteriores: <a href="/fila" className="text-accent underline underline-offset-4">Registros e histórico</a>.</p>
    </div>
  );
}
