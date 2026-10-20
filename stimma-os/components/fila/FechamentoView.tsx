"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Fechamento } from "@/lib/fila/fechamento";

interface Dados {
  fechamento: Fechamento;
  texto: string;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Fechamento do dia. Os números de acompanhamento vêm dos registros feitos na fila; agenda e
 * caixa são digitados (o Simples Dental não tem API). O texto é copiado, nunca enviado.
 */
export function FechamentoView({ dia, hoje, inicial }: { dia: string; hoje: string; inicial: Dados }) {
  const router = useRouter();
  const [dados, setDados] = useState(inicial);
  const n = inicial.fechamento.numeros;
  const [f, setF] = useState({
    agendaPrevista: txt(n?.agendaPrevista), agendaRealizada: txt(n?.agendaRealizada),
    caixaPrevisto: txt(n?.caixaPrevisto), caixaRecebido: txt(n?.caixaRecebido), caixaSituacao: n?.caixaSituacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setSalvando(true);
    const res = await fetch("/api/fila/fechamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dia, numeros: { agendaPrevista: num(f.agendaPrevista), agendaRealizada: num(f.agendaRealizada), caixaPrevisto: num(f.caixaPrevisto), caixaRecebido: num(f.caixaRecebido), caixaSituacao: f.caixaSituacao } }),
    });
    setSalvando(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro((j as { error?: string }).error ?? `Falha (${res.status}).`);
    setDados(j as Dados);
    setAviso("Números salvos.");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(dados.texto);
      setAviso("Texto copiado. Cole no WhatsApp.");
    } catch {
      setErro("Não consegui copiar automaticamente. Selecione o texto e copie.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-text-primary">Fechamento do dia</h1>
          <p className="text-sm text-text-secondary">Montado a partir do que foi registrado na fila.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Dia
          <Input type="date" value={dia} max={hoje} onChange={(e) => e.target.value && router.push(`/fechamento?dia=${e.target.value}`)} className="w-auto" />
        </label>
      </header>

      <form onSubmit={salvar} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted sm:col-span-2">Agenda e caixa (do Simples Dental)</p>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">Agenda prevista<Input inputMode="numeric" value={f.agendaPrevista} onChange={set("agendaPrevista")} /></label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">Agenda realizada<Input inputMode="numeric" value={f.agendaRealizada} onChange={set("agendaRealizada")} /></label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">Caixa previsto (R$)<Input inputMode="decimal" value={f.caixaPrevisto} onChange={set("caixaPrevisto")} /></label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">Caixa recebido (R$)<Input inputMode="decimal" value={f.caixaRecebido} onChange={set("caixaRecebido")} /></label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">Situação do caixa (opcional)<Input value={f.caixaSituacao} onChange={set("caixaSituacao")} placeholder="ex.: conferido com a recepção" /></label>
        <div className="sm:col-span-2"><Button type="submit" loading={salvando} loadingText="Salvando…">Salvar números</Button></div>
      </form>

      <section className="flex flex-col gap-3">
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface-raised/60 p-4 font-sans text-sm text-text-primary">{dados.texto}</pre>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={copiar}>Copiar para o WhatsApp</Button>
          {aviso && <span className="text-sm text-opportunity">{aviso}</span>}
          {erro && <span className="text-sm text-critical">{erro}</span>}
        </div>
      </section>
    </div>
  );
}
