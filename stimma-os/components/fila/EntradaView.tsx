"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Classificacao } from "@/lib/fila/previa";
import type { Resolucao, ResultadoEntrada, ResultadoPrevia } from "@/lib/fila/servico";

const ROTULO: Record<Classificacao, { label: string; variant: "opportunity" | "informative" | "neutral" | "important" | "critical" }> = {
  novo: { label: "Novo", variant: "opportunity" },
  atualizacao: { label: "Atualização", variant: "informative" },
  duplicado: { label: "Duplicado", variant: "neutral" },
  possivel_duplicidade: { label: "Possível duplicidade", variant: "important" },
  vinculo_pendente: { label: "Vínculo pendente", variant: "important" },
  conflito: { label: "Conflito", variant: "critical" },
  erro: { label: "Erro", variant: "critical" },
};

const TIPO: Record<string, string> = {
  atendimento_realizado: "Atendimento realizado", cobranca: "Cobrança", recuperacao_falta: "Falta/cancelamento",
  continuidade: "Continuidade", relacionamento: "Relacionamento", encaminhamento: "Encaminhamento",
};

export function EntradaView() {
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<ResultadoPrevia | null>(null);
  const [resolucoes, setResolucoes] = useState<Record<number, Resolucao>>({});
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function chamar<T>(url: string, body: unknown): Promise<T | null> {
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro((j as { error?: string }).error ?? `Falha (${res.status}).`);
        return null;
      }
      return j as T;
    } finally {
      setCarregando(false);
    }
  }

  async function verPrevia() {
    setResultado(null);
    setResolucoes({});
    setPrevia(await chamar<ResultadoPrevia>("/api/fila/entrada/previa", { texto }));
  }

  async function confirmar() {
    const r = await chamar<ResultadoEntrada>("/api/fila/entrada/confirmar", { texto, resolucoes });
    if (r) {
      setResultado(r);
      setPrevia(null);
      setTexto("");
    }
  }

  const nome = (id: string) => previa?.pacientes.find((p) => p.id === id)?.nome ?? id;
  const contagem = previa ? Object.entries(ROTULO).map(([k, v]) => ({ k, ...v, n: previa.previa.filter((p) => p.classificacao === k).length })).filter((c) => c.n) : [];
  const vaiAplicar = previa ? previa.previa.filter((p) => {
    const r = resolucoes[p.index];
    if (r?.acao === "ignorar") return false;
    return p.classificacao === "novo" || p.classificacao === "atualizacao" || (p.classificacao === "vinculo_pendente" && (r?.acao === "vincular" || r?.acao === "nova")) || (p.classificacao === "possivel_duplicidade" && r?.acao === "aceitar");
  }).length : 0;

  return (
    <div className="flex flex-col gap-5">
      {resultado && (
        <div className="rounded-md border border-opportunity bg-opportunity-bg p-4 text-sm text-text-primary">
          <p className="font-medium">Entrada confirmada.</p>
          <p>
            {resultado.aplicados} aplicados: {resultado.atendimentosConfirmados} atendimentos com marcos criados, {resultado.atendimentosPendentes} a conferir, {resultado.tarefas} tarefas.
            {resultado.naoAplicados.length ? ` ${resultado.naoAplicados.length} não aplicados (ficam registrados no lote para revisão).` : ""}
          </p>
        </div>
      )}

      <textarea
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setPrevia(null); }}
        rows={previa ? 4 : 12}
        spellCheck={false}
        placeholder='{"contrato": "stimma-entrada-v1", "lote": {"origem": "simples_dental", "consultado_em": "…"}, "itens": [ … ]}'
        className="w-full rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <Button onClick={verPrevia} loading={carregando && !previa} loadingText="Lendo…" disabled={!texto.trim()}>Ver prévia</Button>
        {erro && <p className="text-sm text-critical">{erro}</p>}
      </div>

      {previa && (
        <section className="flex flex-col gap-4">
          <div className="text-sm text-text-secondary">
            Origem <strong>{previa.cabecalho.origem}</strong>, consultado em <strong>{previa.cabecalho.consultado_em}</strong>.
            {previa.jaImportado && <span className="ml-1 font-medium text-critical">Este lote já foi importado: confirmar não fará nada.</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contagem.map((c) => <Badge key={c.k} variant={c.variant}>{c.label}: {c.n}</Badge>)}
          </div>

          <ul className="flex flex-col gap-2">
            {previa.previa.map((p) => {
              const r = resolucoes[p.index];
              const ref = p.item?.paciente;
              return (
                <li key={p.index} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-text-muted">#{p.index + 1}</span>
                    <Badge variant={ROTULO[p.classificacao].variant}>{ROTULO[p.classificacao].label}</Badge>
                    <span className="text-text-primary">{p.item ? TIPO[p.item.tipo] : "Item inválido"}</span>
                    {ref && <span className="text-text-secondary">· {ref.nome ?? "sem nome"}{ref.sd_codigo ? ` (cód. ${ref.sd_codigo})` : ""}</span>}
                    {p.item?.tipo === "atendimento_realizado" && <span className="text-text-muted">· {String(p.item.dados.data_atendimento)}</span>}
                  </div>
                  {p.classificacao !== "erro" && <p className="mt-1 text-text-secondary">{p.motivo}</p>}
                  {p.erros.length > 0 && <ul className="mt-1 list-disc pl-5 text-critical">{p.erros.map((e) => <li key={e}>{e}</li>)}</ul>}
                  {p.avisos.length > 0 && <ul className="mt-1 list-disc pl-5 text-important">{p.avisos.map((e) => <li key={e}>{e}</li>)}</ul>}
                  {p.item?.nota_ia && <p className="mt-1 text-xs text-text-muted">Nota da IA (só contexto, não é fato): {p.item.nota_ia}</p>}

                  {p.classificacao === "vinculo_pendente" && (
                    <select
                      className="mt-2 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm"
                      value={r?.acao === "vincular" ? `v:${r.pacienteId}` : r?.acao ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const novo = { ...resolucoes };
                        if (!v) delete novo[p.index];
                        else novo[p.index] = v.startsWith("v:") ? { acao: "vincular", pacienteId: v.slice(2) } : ({ acao: v } as Resolucao);
                        setResolucoes(novo);
                      }}
                    >
                      <option value="">Deixar pendente (não aplicar agora)</option>
                      {p.sugestoes.map((id) => <option key={id} value={`v:${id}`}>É a mesma paciente: {nome(id)}</option>)}
                      <option value="nova">É outra paciente: cadastrar nova</option>
                    </select>
                  )}
                  {p.classificacao === "possivel_duplicidade" && (
                    <label className="mt-2 flex items-center gap-2 text-text-secondary">
                      <input type="checkbox" checked={r?.acao === "aceitar"} onChange={(e) => {
                        const novo = { ...resolucoes };
                        if (e.target.checked) novo[p.index] = { acao: "aceitar" };
                        else delete novo[p.index];
                        setResolucoes(novo);
                      }} />
                      Conferi: é outro atendimento, pode aplicar
                    </label>
                  )}
                  {(p.classificacao === "novo" || p.classificacao === "atualizacao") && (
                    <label className="mt-2 flex items-center gap-2 text-text-muted">
                      <input type="checkbox" checked={r?.acao === "ignorar"} onChange={(e) => {
                        const novo = { ...resolucoes };
                        if (e.target.checked) novo[p.index] = { acao: "ignorar" };
                        else delete novo[p.index];
                        setResolucoes(novo);
                      }} />
                      Não aplicar este item
                    </label>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <Button onClick={confirmar} loading={carregando} loadingText="Gravando…" disabled={previa.jaImportado || vaiAplicar === 0}>
              Confirmar {vaiAplicar} {vaiAplicar === 1 ? "item" : "itens"}
            </Button>
            <span className="text-xs text-text-muted">Os demais ficam registrados no lote, sem efeito na fila.</span>
          </div>
        </section>
      )}
    </div>
  );
}
