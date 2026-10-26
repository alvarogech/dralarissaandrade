"use client";

import { useState } from "react";
import clsx from "clsx";
import { AGENDA_RECENTE_MINUTOS, ROTULO_STATUS_AGENDA, exigeAtencao, type AgendaCarregada } from "@/lib/fila/agenda";
import type { CompromissoAgenda } from "@/lib/fila/store";
import { dataBr } from "./comum";

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
            {c.revisar ? "Conferir no Simples Dental · " : ""}{ROTULO_STATUS_AGENDA[c.status]}
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
  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label="Agenda de hoje e amanhã">
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
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
