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

/** Números do dia gravados na entrega (mesmos critérios do texto). */
const CONTADORES: [string, string][] = [
  ["registros", "Registros"], ["tentativasContato", "Contatos"], ["pacientesContatadas", "Pacientes contatadas"], ["respostas", "Respostas"],
  ["agendamentos", "Agendamentos"], ["comparecimentos", "Comparecimentos"], ["resolvidos", "Resolvidos"], ["marcosTrabalhados", "Marcos trabalhados"],
];

/** Lê o texto do WhatsApp (mesma fonte) em seções para leitura na tela — o texto copiado não muda. */
function secoesDoTexto(texto: string): { titulo: string; linhas: string[] }[] {
  const out: { titulo: string; linhas: string[] }[] = [];
  for (const bruta of texto.split("\n")) {
    const l = bruta.trim();
    if (!l || /^\*Fechamento/.test(l) || /^Registros: \d/.test(l)) continue;
    const t = /^\*([^*]+)\*(.*)$/.exec(l);
    if (t) out.push({ titulo: `${t[1]!.trim()}${t[2] ? t[2] : ""}`, linhas: [] });
    else if (out.length) out[out.length - 1]!.linhas.push(l.replace(/^•\s*/, ""));
  }
  return out;
}

export function FeedbacksView({ hoje, dia, feedbacks, conciergeNome, situacaoHoje, expediente }: Props) {
  const porDia = new Map<string, FeedbackComRegistros[]>();
  for (const f of feedbacks) porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), f]);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fb-eyebrow">Acompanhamento da gestão</p>
          <h1 className="fb-titulo mt-2">Feedbacks da {conciergeNome}</h1>
          <p className="mt-1.5 text-sm text-text-secondary">O que foi realizado, o que segue aberto e o que depende de decisão.</p>
        </div>
        <div className="rounded-card border border-border bg-surface px-4 py-3">
          <p className="text-[12px] text-text-muted">Hoje · {dataBr(hoje)}</p>
          <p className="mt-0.5 text-sm font-medium text-text-primary">{situacaoHoje}</p>
          {!expediente.diasExpediente?.length || !expediente.horarioFechamento ? <a href="#expediente" className="text-[13px] text-accent underline underline-offset-4">Configurar expediente</a> : null}
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-2" action="/feedbacks">
        <Campo label="Ver um dia"><input type="date" name="dia" max={hoje} defaultValue={dia ?? ""} className={classeInput} /></Campo>
        <Button type="submit" variante="secundario">Ver</Button>
        {dia && <a href="/feedbacks" className="text-sm text-text-muted underline">últimos 30 dias</a>}
      </form>

      {!feedbacks.length && (
        <p className="rounded-[12px] border border-dashed border-border p-5 text-sm text-text-secondary">
          {dia ? `Nenhum feedback gerado ou entregue em ${dataBr(dia)}.` : "Nenhum feedback gerado ou entregue nos últimos 30 dias."}
        </p>
      )}
      {[...porDia.entries()].map(([d, versoes]) => (
        <section key={d} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-3 font-serif text-[24px] font-medium text-text-primary">{dataBr(d)}<span aria-hidden className="h-px flex-1 bg-border" /></h2>
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

  const [copiado, setCopiado] = useState<string | null>(null);
  const secoes = secoesDoTexto(f.texto);
  const segue = (t: string) => /permanecem abertas|prioridades/i.test(t);
  const pendentes = secoes.filter((s) => segue(s.titulo));
  const realizados = secoes.filter((s) => !segue(s.titulo));
  const marcas = [
    f.copiadoEm && `Copiado ${horaBr(f.copiadoEm)} (não comprova envio)`,
    f.whatsappConfirmadoEm && `Envio pelo WhatsApp confirmado ${horaBr(f.whatsappConfirmadoEm)}`,
  ].filter(Boolean) as string[];

  async function copiar() {
    try {
      await navigator.clipboard.writeText(f.texto);
      setCopiado("Texto copiado no formato do WhatsApp.");
    } catch {
      setCopiado("Não consegui copiar. Abra o texto completo e selecione.");
    }
  }

  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-5 py-3.5">
        <p className="text-[15px] font-semibold text-text-primary">{f.responsavelNome}</p>
        <span className="text-[13px] text-text-muted">Versão {f.versao}{f.substitui ? " · corrigida" : ""}</span>
        <span className={clsx("inline-flex items-center rounded-sm border px-1.5 text-[12px] font-medium leading-5",
          f.status === "entregue" ? "border-opportunity bg-opportunity-bg text-opportunity" : "border-border bg-surface-raised text-text-secondary")}>
          {f.status === "entregue" ? `Entregue às ${f.entregueEm ? horaBr(f.entregueEm).split(" ").pop() : ""}` : "Gerado — ainda não entregue"}
        </span>
        {f.ajusteSolicitadoEm && <span className="inline-flex items-center rounded-sm border border-important bg-important-bg px-1.5 text-[12px] font-medium leading-5 text-important">Ajuste solicitado</span>}
      </header>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {CONTADORES.map(([k, rot]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <p className="text-[12px] text-text-muted">{rot}</p>
            <p className="font-serif text-[26px] font-medium leading-tight tabular-nums text-text-primary">{String(f.contadores[k] ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">O que foi realizado</h3>
          {!realizados.length && <p className="text-sm text-text-muted">Nenhum registro de ação no dia.</p>}
          {realizados.map((s) => (
            <div key={s.titulo} className="mb-3">
              <p className="text-[13.5px] font-semibold text-text-primary">{s.titulo}</p>
              <ul className="mt-1 flex flex-col gap-1 text-[14px] text-text-secondary">
                {s.linhas.map((l, n) => <li key={n} className={clsx("border-l-2 pl-2.5", /^Resultado —/.test(l) ? "border-opportunity" : "border-border")}>{l}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">O que segue · decisões</h3>
          {pendentes.map((s) => (
            <div key={s.titulo} className="mb-3">
              <p className="text-[13.5px] font-semibold text-text-primary">{s.titulo}</p>
              <ul className="mt-1 flex flex-col gap-1 text-[14px] text-text-secondary">
                {s.linhas.map((l, n) => (
                  <li key={n} className={clsx("border-l-2 pl-2.5", /aguardando gestão/i.test(l) ? "border-important text-text-primary" : /vencida/i.test(l) ? "border-critical" : "border-border")}>
                    {/aguardando gestão/i.test(l) && <span className="mr-1 font-medium text-important">Decisão da gestão:</span>}{l}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        <Button type="button" variante="secundario" onClick={copiar}>Copiar texto do WhatsApp</Button>
        <details className="text-sm">
          <summary className="cursor-pointer px-2 py-2 text-text-secondary">Ver texto completo</summary>
          <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface-raised p-3 font-sans text-[13px] leading-relaxed text-text-primary">{f.texto}</pre>
        </details>
        {copiado && <span role="status" className="text-[13px] text-text-secondary">{copiado}</span>}
        {marcas.map((m) => <span key={m} className="text-[12.5px] text-text-muted">{m}</span>)}
      </div>

      <details className="border-t border-border px-5 py-3">
        <summary className="cursor-pointer text-sm text-text-secondary">Registros que originaram o resumo ({f.registros.length})</summary>
        {!f.registros.length ? <p className="mt-2 text-sm text-text-muted">Nenhum registro no dia.</p> : (
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead className="text-[12px] text-text-muted"><tr><th scope="col" className="py-1.5 pr-3 font-medium">Hora</th><th scope="col" className="py-1.5 pr-3 font-medium">Autor</th><th scope="col" className="py-1.5 font-medium">Registro</th></tr></thead>
            <tbody>
              {f.registros.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-1.5 pr-3 tabular-nums text-text-muted">{r.hora}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-text-secondary">{r.autor}</td>
                  <td className="py-1.5 text-text-primary">{r.texto || r.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
      <div className="px-5 pb-4">
      {f.observacaoGestao && <p className="mt-1 rounded-control bg-surface-raised px-3 py-2 text-sm text-text-secondary">Sua observação: “{f.observacaoGestao}”</p>}
      {f.status === "entregue" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1"><Campo label="Observação ou ajuste para a concierge"><input value={obs} onChange={(e) => setObs(e.target.value)} className={classeInput} /></Campo></div>
          <Button type="button" variante="secundario" disabled={!obs.trim() || salvando} onClick={() => comentar(false)}>Registrar observação</Button>
          <Button type="button" disabled={!obs.trim() || salvando} onClick={() => comentar(true)}>Solicitar ajuste</Button>
          {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
        </div>
      )}
      </div>
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
    // Nada é presumido: precisa de ao menos um dia e do horário de fechamento.
    if (!dias.length) return setMsg({ ok: false, t: "Escolha ao menos um dia de expediente." });
    if (!horario) return setMsg({ ok: false, t: "Informe o horário de fechamento." });
    setSalvando(true);
    const r = await chamarApi("/api/fila/config", "POST", { diasExpediente: dias, horarioFechamento: horario, excecoes, diasSemAtualizacao: Number(semAtualizacao) });
    setSalvando(false);
    if (!r.ok) return setMsg({ ok: false, t: r.erro });
    setMsg({ ok: true, t: `Expediente salvo: ${dias.map((d) => DIAS[d]).join(", ")} · fechamento às ${horario}${excecoes.length ? ` · ${excecoes.length} exceção(ões)` : ""}. A cobrança do feedback passa a seguir este horário.` });
    router.refresh();
  }

  return (
    <details id="expediente" className="fb-card scroll-mt-6 p-5" open={!configurado}>
      <summary className="cursor-pointer font-serif text-[22px] font-medium text-text-primary">Expediente da concierge{configurado ? "" : <span className="ml-2 align-middle font-sans text-[13px] font-medium text-important">não configurado</span>}</summary>
      <p className="mt-2 text-xs text-text-muted">Fuso America/Sao_Paulo. Sem dias e horário configurados, o sistema não cobra a entrega nem declara atraso. Nenhum padrão é gravado automaticamente.</p>
      {configurado && <p className="mt-1 text-[13px] text-text-secondary">Atual: {(inicial.diasExpediente ?? []).map((d) => DIAS[d]).join(", ")} · fechamento às {inicial.horarioFechamento}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DIAS.map((d, i) => (
          <button key={d} type="button" className="fb-chip" data-ativo={dias.includes(i)} onClick={() => setDias(dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort())}>{d}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Campo label="Horário de fechamento"><input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className={classeInput} /></Campo>
        <Campo label="“Sem atualização” depois de (dias)"><input type="number" min={1} max={60} value={semAtualizacao} onChange={(e) => setSemAtualizacao(e.target.value)} className={classeInput} /></Campo>
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1"><Campo label="Exceção (sem expediente)"><input type="date" value={nova} onChange={(e) => setNova(e.target.value)} className={classeInput} /></Campo></div>
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
        {msg && <span role={msg.ok ? "status" : "alert"} className={clsx("text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</span>}
      </div>
    </details>
  );
}
