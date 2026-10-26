"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { CobrancaLegada } from "@/lib/fila/cobrancas";
import { Campo, chamarApi, classeInput, dataBr } from "./comum";

/**
 * Cobranças individuais antigas (levantamentos importados) que saíram da fila operacional: a
 * conferência de parcelas vencidas agora é o item da rotina de segunda e sexta. Nada foi apagado,
 * encerrado ou alterado no banco.
 *  - Concierge: só a contagem, sem nomes nem valores.
 *  - Gestão: visão administrativa agrupada (nome, ação, prazo) e a opção de manter um caso como
 *    exceção na fila da concierge (com motivo, histórico e auditoria). Cancelar/editar continua
 *    em "Entrada e tarefas › Tarefas".
 */
export function CobrancasLegadasView({ itens, gestao, nomeConcierge }: { itens: CobrancaLegada[]; gestao: boolean; nomeConcierge: string }) {
  const [aberta, setAberta] = useState(false);
  if (!itens.length) return null;
  if (!gestao) {
    return (
      <p role="note" className="mb-6 rounded-card border border-border bg-surface-raised px-4 py-3 text-[13.5px] text-text-secondary">
        {itens.length} cobrança(s) individual(is) antiga(s) saíram da sua lista: a conferência de parcelas vencidas agora é feita no Simples Dental, na rotina de segunda e sexta. Casos que exigem ação específica voltam para cá pela gestão.
      </p>
    );
  }
  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label="Cobranças individuais antigas">
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span>
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">Cobranças individuais antigas ({itens.length})</span>
          <span className="mt-0.5 block text-[13px] text-text-secondary">
            Fora da fila da {nomeConcierge}: a cobrança rotineira é conferida na rotina de segunda e sexta. Preservadas no banco, sem exclusão nem encerramento.
          </span>
        </span>
        <span aria-hidden className="text-[13px] text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && (
        <div className="border-t border-border px-4 pb-4">
          <p className="mt-3 text-[12.5px] text-text-muted">
            Para encerrar ou cancelar, use Entrada e tarefas › Tarefas (sempre com motivo e histórico). Marque como exceção só o caso que exige ação específica ou decisão da gestão.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {itens.map((c) => <Linha key={c.id} c={c} nomeConcierge={nomeConcierge} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Linha({ c, nomeConcierge }: { c: CobrancaLegada; nomeConcierge: string }) {
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function marcar() {
    setMsg(null);
    setSalvando(true);
    const r = await chamarApi(`/api/fila/tarefas/${c.id}`, "PATCH", { excecaoCobranca: true, motivo });
    setSalvando(false);
    if (!r.ok) return setMsg({ ok: false, t: r.erro });
    setMsg({ ok: true, t: `Mantida como exceção na fila da ${nomeConcierge}.` });
    setForm(false);
    router.refresh();
  }

  return (
    <li className="py-2.5 text-[14px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-text-primary">{c.paciente}</span>
        <span className="min-w-0 flex-1 text-text-secondary">{c.titulo}</span>
        <span className="text-[12.5px] text-text-muted">prazo {dataBr(c.due)}{c.aguardandoPaciente ? " · aguardando paciente" : ""} · {c.ref}</span>
        {!form && <button type="button" className="fb-chip" onClick={() => setForm(true)}>Manter como exceção</button>}
      </div>
      {form && (
        <form onSubmit={(e) => { e.preventDefault(); void marcar(); }} className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <Campo label="Qual ação específica ou decisão este caso exige? *"><input required value={motivo} onChange={(e) => setMotivo(e.target.value)} className={classeInput} /></Campo>
          </div>
          <Button type="submit" loading={salvando} loadingText="Salvando…" disabled={!motivo.trim()}>Confirmar exceção</Button>
          <Button type="button" variante="discreto" onClick={() => setForm(false)}>Cancelar</Button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("mt-1 text-[12.5px]", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</p>}
    </li>
  );
}
