"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { CODIGO_FAVORITO_AGENDA, HREF_FAVORITO_AGENDA } from "@/lib/fila/agenda-favorito";
import { AGENDA_RECENTE_MINUTOS, ROTULO_STATUS_AGENDA, exigeAtencao, type AgendaCarregada } from "@/lib/fila/agenda";
import type { CompromissoAgenda } from "@/lib/fila/store";
import { chamarApi, classeInput, dataBr } from "./comum";

/**
 * Agenda de hoje e amanhã — só o que o sync trouxe do Simples Dental, em leitura. Sem
 * sincronização no dia, avisa para conferir no Simples Dental (nunca inventa compromissos).
 */
const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
/** Data completa e horário (Brasília) da última sincronização conhecida. */
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(", ", " às ");
const idade = (min: number) => (min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} dias`);

function Lista({ itens, vazio }: { itens: CompromissoAgenda[]; vazio: string }) {
  if (!itens.length) return <p className="py-2 text-sm text-text-muted">{vazio}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {itens.map((c) => (
        <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-[14px]">
          <span className="w-12 shrink-0 tabular-nums text-text-secondary">{hora(c.inicio)}</span>
          <span className="min-w-0 flex-1 font-medium text-text-primary">{c.paciente}</span>
          <span className={clsx("text-[12.5px]", exigeAtencao(c) ? "font-medium text-important" : "text-text-secondary")}>
            {c.revisar ? "Conferir cadastro · " : ""}{ROTULO_STATUS_AGENDA[c.status]}
          </span>
          {(c.profissional || c.motivo) && <span className="basis-full pl-[60px] text-[12.5px] text-text-muted">{[c.profissional, c.motivo].filter(Boolean).join(" · ")}</span>}
        </li>
      ))}
    </ul>
  );
}

export function AgendaView({ agenda }: { agenda: AgendaCarregada }) {
  const [aberta, setAberta] = useState(false);
  const atencao = [...agenda.itensHoje, ...agenda.itensAmanha].filter(exigeAtencao).length;
  // Sincronizada hoje, mas há muitas horas: mostra como retrato, não como agenda atual.
  const antiga = agenda.atualizada && (agenda.minutosDesdeSync ?? 0) > AGENDA_RECENTE_MINUTOS;
  const confiavel = agenda.atualizada && !antiga;
  const ultima = agenda.ultimaSync ? `${dataHora(agenda.ultimaSync)}${agenda.minutosDesdeSync !== null ? ` (${idade(agenda.minutosDesdeSync)})` : ""}` : null;
  const [sincronizando, setSincronizando] = useState(false);
  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label="Agenda de hoje e amanhã">
      <div className="flex flex-wrap items-center gap-2 pr-4">
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex min-w-0 flex-1 basis-[260px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span>
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">Agenda de hoje e amanhã</span>
          <span role={confiavel ? undefined : "status"} className={clsx("mt-0.5 block text-[13px]", confiavel ? "text-text-secondary" : "font-medium text-important")}>
            {confiavel
              ? `Sincronizada hoje às ${hora(agenda.ultimaSync!)} · ${agenda.itensHoje.length} hoje · ${agenda.itensAmanha.length} amanhã${atencao ? ` · ${atencao} para conferir` : ""}`
              : antiga
                ? `Última sincronização: ${ultima} — pode ter mudado; confira a agenda no Simples Dental`
                : `Sem sincronização hoje · última sincronização conhecida: ${ultima ?? "nenhuma registrada"} — confira a agenda no Simples Dental`}
          </span>
        </span>
        <span aria-hidden className="text-[13px] text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      <Button type="button" className="mb-3 ml-4 sm:mb-0 sm:ml-0" variante={sincronizando ? "primario" : "secundario"} aria-expanded={sincronizando} onClick={() => setSincronizando(!sincronizando)}>Sincronizar agenda</Button>
      </div>
      {sincronizando && <PainelSincronizar onConcluir={() => { setSincronizando(false); setAberta(true); }} />}
      {aberta && (
        <div className="grid gap-4 border-t border-border px-4 pb-4 pt-3 md:grid-cols-2">
          {!confiavel && (
            <p role="status" className="rounded-control border border-important bg-important-bg px-3 py-2 text-[13.5px] text-important md:col-span-2">
              {agenda.ultimaSync ? `Retrato da última sincronização (${dataHora(agenda.ultimaSync)}), não a agenda atual.` : "Nenhuma sincronização registrada."} A agenda oficial é a do Simples Dental: confira lá antes de agir. Nada é confirmado ou remarcado por aqui.
            </p>
          )}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Hoje · {dataBr(agenda.hoje)}{!confiavel && " · dados possivelmente desatualizados"}</h3>
            <Lista itens={agenda.itensHoje} vazio={agenda.atualizada ? "Nenhum compromisso sincronizado para hoje." : "Sem dados sincronizados para hoje — confira no Simples Dental."} />
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Amanhã · {dataBr(agenda.amanha)}{!confiavel && " · dados possivelmente desatualizados"}</h3>
            <Lista itens={agenda.itensAmanha} vazio={agenda.atualizada ? "Nenhum compromisso sincronizado para amanhã." : "Sem dados sincronizados para amanhã — confira no Simples Dental."} />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Sincronizar a agenda com o login de quem clica (sem segredo compartilhado): o favorito
 * "STIMMA · Copiar agenda" lê a tela do Simples Dental no navegador e o texto é colado aqui.
 */
function PainelSincronizar({ onConcluir }: { onConcluir: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<{ total: number; created: number; updated: number; unchanged: number; requiresReview: number; recusados: { paciente: string; motivo: string }[] } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function colarDaAreaDeTransferencia() {
    try {
      setTexto(await navigator.clipboard.readText());
    } catch {
      setErro("Não consegui ler a área de transferência: cole manualmente no campo (Ctrl+V).");
    }
  }

  async function enviar() {
    setErro(null);
    setRes(null);
    setEnviando(true);
    const r = await chamarApi<NonNullable<typeof res>>("/api/fila/agenda/sincronizar", "POST", { texto });
    setEnviando(false);
    if (!r.ok) return setErro(r.incerto ? `${r.erro} Pode enviar de novo: a sincronização não duplica consultas.` : r.erro);
    setRes(r.data);
    router.refresh();
  }

  async function copiarInstrucao() {
    const instrucao = `Na aba da agenda do Simples Dental (visão Dia ou Semana, com hoje e amanhã visíveis), execute este código só de leitura e me devolva o texto JSON que ele gerar, sem alterar nada:

${CODIGO_FAVORITO_AGENDA}`;
    try {
      await navigator.clipboard.writeText(instrucao);
      setCopiado("Instrução copiada. Cole na extensão do Claude e traga o resultado para cá.");
    } catch {
      setCopiado("Não consegui copiar automaticamente.");
    }
  }

  return (
    <div className="border-t border-border px-4 pb-4 pt-3">
      <ol className="flex flex-col gap-3 text-[14px] text-text-primary">
        <li>
          <span className="font-medium">1. Uma vez só:</span> arraste este botão para a barra de favoritos do Chrome{" "}
          <span
            className="ml-1 inline-flex"
            // Favorito (bookmarklet): link "javascript:" montado em HTML para o React não bloqueá-lo.
            dangerouslySetInnerHTML={{ __html: `<a href="${HREF_FAVORITO_AGENDA.replace(/"/g, "&quot;")}" onclick="event.preventDefault();alert('Arraste este botão para a barra de favoritos e use-o na agenda do Simples Dental.')" class="inline-flex items-center rounded-control border border-accent bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent">STIMMA · Copiar agenda</a>` }}
          />
          <span className="block text-[12.5px] text-text-muted">Se a barra não aparecer: Ctrl+Shift+B.</span>
        </li>
        <li><span className="font-medium">2.</span> Abra a <a href="https://app.simplesdental.com/simples/agenda" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">agenda do Simples Dental</a> (visão Dia ou Semana, com hoje e amanhã) e clique no favorito. Ele só lê a tela e copia as consultas.</li>
        <li>
          <span className="font-medium">3.</span> Volte aqui, cole e sincronize:
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder='{"formato":"stimma-agenda-v1", …}' className={clsx(classeInput, "mt-2 font-mono text-[12px]")} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variante="secundario" onClick={colarDaAreaDeTransferencia}>Colar</Button>
            <Button type="button" loading={enviando} loadingText="Sincronizando…" disabled={!texto.trim()} onClick={enviar}>Sincronizar agora</Button>
            {res && <Button type="button" variante="discreto" onClick={onConcluir}>Ver agenda</Button>}
          </div>
        </li>
      </ol>
      {erro && <p role="alert" className="mt-3 rounded-control border border-critical bg-critical-bg px-3 py-2 text-[13.5px] text-critical">{erro}</p>}
      {res && (
        <div role="status" className="mt-3 rounded-control border border-opportunity bg-opportunity-bg px-3 py-2 text-[13.5px] text-opportunity">
          <p className="font-medium">Agenda sincronizada: {res.total} consulta(s) — {res.created} nova(s), {res.updated} atualizada(s), {res.unchanged} sem mudança.</p>
          {res.requiresReview > 0 && <p className="text-important">{res.requiresReview} precisa(m) de conferência: nome que pode corresponder a mais de uma paciente.</p>}
          {res.recusados.map((x, n) => <p key={n} className="text-important">Não sincronizado: {x.paciente} — {x.motivo}</p>)}
        </div>
      )}
      <p className="mt-3 text-[12.5px] text-text-muted">
        Nada é confirmado, remarcado ou alterado no Simples Dental. Pode sincronizar quantas vezes quiser: a mesma consulta não é duplicada.{" "}
        Prefere usar a extensão do Claude? <button type="button" className="text-accent underline underline-offset-4" onClick={copiarInstrucao}>Copiar instrução para a extensão</button>
        {copiado && <span className="ml-1">{copiado}</span>}
      </p>
    </div>
  );
}
