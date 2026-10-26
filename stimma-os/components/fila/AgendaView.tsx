"use client";

import { useState } from "react";
import clsx from "clsx";
import { ROTULO_STATUS_AGENDA, exigeAtencao, type AgendaCarregada } from "@/lib/fila/agenda";
import type { CompromissoAgenda } from "@/lib/fila/store";
import { dataBr, horaBr } from "./comum";

/**
 * Agenda de hoje e amanhã — só o que o sync trouxe do Simples Dental, em leitura. Sem
 * sincronização no dia, avisa para conferir no Simples Dental (nunca inventa compromissos).
 */
const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

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
  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label="Agenda de hoje e amanhã">
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span>
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">Agenda de hoje e amanhã</span>
          <span className={clsx("mt-0.5 block text-[13px]", agenda.atualizada ? "text-text-secondary" : "font-medium text-important")}>
            {agenda.atualizada
              ? `Sincronizada às ${hora(agenda.ultimaSync!)} · ${agenda.itensHoje.length} hoje · ${agenda.itensAmanha.length} amanhã${atencao ? ` · ${atencao} para conferir` : ""}`
              : `Sem sincronização hoje${agenda.ultimaSync ? ` (última: ${horaBr(agenda.ultimaSync)})` : ""} — confira a agenda no Simples Dental`}
          </span>
        </span>
        <span aria-hidden className="text-[13px] text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && (
        <div className="grid gap-4 border-t border-border px-4 pb-4 pt-3 md:grid-cols-2">
          {!agenda.atualizada && (
            <p role="status" className="rounded-control border border-important bg-important-bg px-3 py-2 text-[13.5px] text-important md:col-span-2">
              Os dados abaixo podem estar desatualizados. A agenda oficial é a do Simples Dental: confira lá antes de agir. Nada é confirmado ou remarcado por aqui.
            </p>
          )}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Hoje · {dataBr(agenda.hoje)}</h3>
            <Lista itens={agenda.itensHoje} vazio={agenda.atualizada ? "Nenhum compromisso sincronizado para hoje." : "Sem dados sincronizados para hoje."} />
          </div>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Amanhã · {dataBr(agenda.amanha)}</h3>
            <Lista itens={agenda.itensAmanha} vazio={agenda.atualizada ? "Nenhum compromisso sincronizado para amanhã." : "Sem dados sincronizados para amanhã."} />
          </div>
        </div>
      )}
    </section>
  );
}
