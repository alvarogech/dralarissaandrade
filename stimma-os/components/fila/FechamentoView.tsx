"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Fechamento } from "@/lib/fila/fechamento";
import { Campo, chamarApi, numeroBr } from "./comum";

interface Dados {
  fechamento: Fechamento;
  texto: string;
}

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Fechamento do dia. "Gerar feedback" monta a mensagem a partir dos registros reais da fila;
 * agenda e caixa da clínica são campos manuais opcionais (não são calculados a partir de uma
 * lista parcial). O texto é copiado, nunca enviado.
 */
export function FechamentoView({ dia, hoje, inicial }: { dia: string; hoje: string; inicial: Dados }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const n = inicial.fechamento.numeros;
  const [f, setF] = useState({
    agendaPrevista: txt(n?.agendaPrevista), agendaRealizada: txt(n?.agendaRealizada),
    caixaPrevisto: txt(n?.caixaPrevisto), caixaRecebido: txt(n?.caixaRecebido), caixaSituacao: n?.caixaSituacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function gerar() {
    setErro(null);
    setAviso(null);
    setCarregando("gerar");
    const r = await chamarApi<Dados>(`/api/fila/fechamento?dia=${dia}`, "GET");
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    setDados(r.data);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const numeros = { agendaPrevista: numeroBr(f.agendaPrevista), agendaRealizada: numeroBr(f.agendaRealizada), caixaPrevisto: numeroBr(f.caixaPrevisto), caixaRecebido: numeroBr(f.caixaRecebido), caixaSituacao: f.caixaSituacao };
    if (Object.values(numeros).some((v) => typeof v === "number" && Number.isNaN(v))) return setErro("Algum número está em formato inválido.");
    setCarregando("salvar");
    const r = await chamarApi<Dados>("/api/fila/fechamento", "POST", { dia, numeros });
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    setDados(r.data);
    setAviso("Números salvos e feedback atualizado.");
  }

  async function copiar() {
    if (!dados) return;
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
          <p className="text-sm text-text-secondary">A mensagem usa os registros reais da fila deste dia.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Dia
          <Input type="date" value={dia} max={hoje} onChange={(e) => e.target.value && router.push(`/fechamento?dia=${e.target.value}`)} className="w-auto" />
        </label>
      </header>

      <form onSubmit={salvar} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted sm:col-span-2">Totais da clínica (opcionais, do Simples Dental)</p>
        <Campo label="Agenda prevista"><Input inputMode="numeric" value={f.agendaPrevista} onChange={set("agendaPrevista")} /></Campo>
        <Campo label="Agenda realizada"><Input inputMode="numeric" value={f.agendaRealizada} onChange={set("agendaRealizada")} /></Campo>
        <Campo label="Caixa previsto (R$)"><Input inputMode="decimal" value={f.caixaPrevisto} onChange={set("caixaPrevisto")} /></Campo>
        <Campo label="Caixa recebido (R$)"><Input inputMode="decimal" value={f.caixaRecebido} onChange={set("caixaRecebido")} /></Campo>
        <Campo label="Situação do caixa (opcional)" largo><Input value={f.caixaSituacao} onChange={set("caixaSituacao")} placeholder="ex.: conferido com a recepção" /></Campo>
        <div className="sm:col-span-2"><Button type="submit" loading={carregando === "salvar"} loadingText="Salvando…">Salvar totais</Button></div>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={gerar} loading={carregando === "gerar"} loadingText="Gerando…">Gerar feedback</Button>
          {dados && <Button type="button" onClick={copiar} className="bg-surface-raised text-text-primary">Copiar para o WhatsApp</Button>}
          {aviso && <span className="text-sm text-opportunity">{aviso}</span>}
          {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
        </div>
        {dados ? (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface-raised/60 p-4 font-sans text-sm text-text-primary">{dados.texto}</pre>
        ) : (
          <p className="rounded-md border border-border p-4 text-sm text-text-muted">Clique em “Gerar feedback” para montar a mensagem com o que foi registrado hoje.</p>
        )}
      </section>
    </div>
  );
}
