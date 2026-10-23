"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Classificacao, ItemPrevia } from "@/lib/fila/previa";
import type { Resolucao, ResultadoEntrada, ResultadoPrevia } from "@/lib/fila/servico";
import { Campo, ROTULO_TIPO, chamarApi, classeInput, numeroBr } from "./comum";

/**
 * Levantamento do Simples Dental → propostas de tarefa para a concierge. Texto/Markdown é
 * convertido no servidor (IA) ou JSON no formato do contrato entra direto; tudo vira uma prévia
 * EDITÁVEL, conferida pelo servidor (vínculo, duplicidade) antes de publicar. Também serve para
 * criar itens manualmente quando a conversão falhar.
 */
export interface LinhaEditor {
  uid: string;
  tipo: string;
  nome: string;
  sd_codigo: string;
  telefone: string;
  acao: string;
  contexto: string;
  prazo: string;
  valor: string;
  vencimento: string;
  data_atendimento: string;
  status_no_sd: string;
  data_ocorrencia: string;
  ocorrencia: string;
  para: string;
  motivo: string;
  a_conferir: string;
  evidencia: string;
  chave_origem: string;
  /** Marcos pertinentes ao atendimento realizado (orientação clínica). */
  marcos: string[];
}

let seq = 0;
export function linhaVazia(extra: Partial<LinhaEditor> = {}): LinhaEditor {
  return {
    uid: `l${++seq}`, tipo: "outro", nome: "", sd_codigo: "", telefone: "", acao: "", contexto: "", prazo: "", valor: "", vencimento: "",
    data_atendimento: "", status_no_sd: "", data_ocorrencia: "", ocorrencia: "", para: "", motivo: "", a_conferir: "", evidencia: "", chave_origem: "", marcos: ["d30", "d90", "m6"], ...extra,
  };
}

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function linhaDeItem(o: Record<string, unknown>): LinhaEditor {
  const p = (o.paciente ?? {}) as Record<string, unknown>;
  return linhaVazia({
    tipo: s(o.tipo) || "outro", nome: s(p.nome), sd_codigo: s(p.sd_codigo ?? p.sd_numero), telefone: s(p.telefone), acao: s(o.acao), contexto: s(o.contexto),
    prazo: s(o.prazo), valor: o.valor === undefined || o.valor === null ? "" : String(o.valor).replace(".", ","), vencimento: s(o.vencimento),
    data_atendimento: s(o.data_atendimento), status_no_sd: s(o.status_no_sd), data_ocorrencia: s(o.data_ocorrencia), ocorrencia: s(o.ocorrencia),
    para: s(o.para), motivo: s(o.motivo), a_conferir: Array.isArray(o.a_conferir) ? (o.a_conferir as string[]).join(", ") : "",
    evidencia: s(o.evidencia ?? o.nota_ia), chave_origem: s(o.chave_origem),
    ...(Array.isArray(o.marcos) ? { marcos: (o.marcos as unknown[]).map(String) } : {}),
  });
}

function itemDaLinha(l: LinhaEditor): Record<string, unknown> {
  const o: Record<string, unknown> = { tipo: l.tipo, paciente: {} };
  const p = o.paciente as Record<string, string>;
  if (l.nome.trim()) p.nome = l.nome.trim();
  if (l.sd_codigo.trim()) p.sd_codigo = l.sd_codigo.trim();
  if (l.telefone.trim()) p.telefone = l.telefone.trim();
  for (const k of ["acao", "contexto", "prazo", "vencimento", "data_atendimento", "status_no_sd", "data_ocorrencia", "ocorrencia", "para", "motivo", "chave_origem"] as const) {
    if (l[k].trim()) o[k] = l[k].trim();
  }
  const v = numeroBr(l.valor);
  if (v !== null) o.valor = Number.isNaN(v) ? l.valor : v;
  o.a_conferir = l.a_conferir.split(",").map((x) => x.trim()).filter(Boolean);
  if (l.tipo === "atendimento_realizado") o.marcos = l.marcos;
  if (l.evidencia.trim()) o.nota_ia = `trecho de origem: ${l.evidencia.trim()}`;
  return o;
}

const ROTULO: Record<Classificacao, { label: string; variant: "opportunity" | "informative" | "neutral" | "important" | "critical" }> = {
  novo: { label: "Novo", variant: "opportunity" },
  atualizacao: { label: "Atualização", variant: "informative" },
  duplicado: { label: "Duplicado", variant: "neutral" },
  possivel_duplicidade: { label: "Possível duplicidade", variant: "important" },
  vinculo_pendente: { label: "Vínculo pendente", variant: "important" },
  conflito: { label: "Conflito", variant: "critical" },
  erro: { label: "Erro", variant: "critical" },
};

const TIPOS = ["cobranca", "recuperacao_falta", "continuidade", "relacionamento", "encaminhamento", "atendimento_realizado", "outro"];

export function LevantamentoView({ linhas, setLinhas }: { linhas: LinhaEditor[]; setLinhas: (f: (l: LinhaEditor[]) => LinhaEditor[]) => void }) {
  const [texto, setTexto] = useState("");
  const [origem, setOrigem] = useState("Simples Dental (via extensão do navegador)");
  const [previa, setPrevia] = useState<ResultadoPrevia | null>(null);
  const [resolucoes, setResolucoes] = useState<Record<number, Resolucao>>({});
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);

  function loteAtual(): string {
    const hojeBrasilia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    return JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: origem.trim() || "manual", consultado_em: hojeBrasilia }, itens: linhas.map(itemDaLinha) });
  }

  function editar(uid: string, campo: keyof LinhaEditor, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.uid === uid ? { ...l, [campo]: valor } : l)));
    setPrevia(null);
    setResolucoes({});
  }

  async function converter() {
    setErro(null);
    setAviso(null);
    setResultado(null);
    setCarregando("converter");
    const r = await chamarApi<{ via: "json" | "ia"; lote: string }>("/api/fila/entrada/converter", "POST", { texto, origem });
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    const lote = JSON.parse(r.data.lote) as { lote?: { origem?: string }; itens?: Record<string, unknown>[] };
    const novas = (lote.itens ?? []).map(linhaDeItem);
    if (lote.lote?.origem && r.data.via === "json") setOrigem(lote.lote.origem);
    setLinhas((ls) => [...ls, ...novas]);
    setPrevia(null);
    setAviso(r.data.via === "ia" ? `A IA propôs ${novas.length} item(ns). Confira cada campo: nada foi gravado.` : `${novas.length} item(ns) lidos do formato estruturado.`);
  }

  async function revisar() {
    setErro(null);
    setCarregando("previa");
    const r = await chamarApi<ResultadoPrevia>("/api/fila/entrada/previa", "POST", { texto: loteAtual() });
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    setPrevia(r.data);
    setResolucoes({});
  }

  async function publicar() {
    setErro(null);
    setCarregando("publicar");
    const r = await chamarApi<ResultadoEntrada>("/api/fila/entrada/confirmar", "POST", { texto: loteAtual(), resolucoes });
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    setResultado(r.data);
    setPrevia(null);
    setLinhas(() => []);
    setTexto("");
  }

  const porIndice = new Map<number, ItemPrevia>((previa?.previa ?? []).map((p) => [p.index, p]));
  const nome = (id: string) => previa?.pacientes.find((p) => p.id === id)?.nome ?? id;
  const vaiAplicar = previa ? previa.previa.filter((p) => {
    const r = resolucoes[p.index];
    if (r?.acao === "ignorar") return false;
    return p.classificacao === "novo" || p.classificacao === "atualizacao" || (p.classificacao === "vinculo_pendente" && (r?.acao === "vincular" || r?.acao === "nova")) || (p.classificacao === "possivel_duplicidade" && r?.acao === "aceitar");
  }).length : 0;

  return (
    <div className="flex flex-col gap-5">
      {resultado && (
        <div className="rounded-md border border-opportunity bg-opportunity-bg p-4 text-sm text-text-primary">
          <p className="font-medium">Publicado na fila da concierge.</p>
          <p>
            {resultado.tarefas} tarefa(s), {resultado.atendimentosConfirmados} atendimento(s) com marcos criados, {resultado.atendimentosPendentes} a conferir.
            {resultado.naoAplicados.length ? ` ${resultado.naoAplicados.length} não aplicado(s) — ficam registrados no lote.` : ""}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <Campo label="Cole o levantamento (texto, Markdown ou JSON stimma-entrada-v1)">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} className={`${classeInput} font-mono text-xs`}
            placeholder={"Ex.: Joana Teste (cód. 877) — parcela 3/6 de R$ 450,00 vencida em 18/10, sem pagamento no SD.\nLia Exemplo (cód. 878) faltou à consulta de 18/10."} />
        </Campo>
        <Campo label="Origem da informação">
          <input value={origem} onChange={(e) => setOrigem(e.target.value)} className={classeInput} />
        </Campo>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={converter} loading={carregando === "converter"} loadingText="Convertendo…" disabled={!texto.trim()}>Converter em propostas</Button>
          <button type="button" onClick={() => { setLinhas((ls) => [...ls, linhaVazia()]); setPrevia(null); }} className="rounded-sm border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-raised">
            + Item manual
          </button>
        </div>
        {aviso && <p className="text-sm text-text-secondary">{aviso}</p>}
        {erro && <p role="alert" className="text-sm text-critical">{erro}</p>}
      </section>

      {linhas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-primary">Propostas ({linhas.length}) — revise e corrija antes de publicar</h2>
          {linhas.map((l, i) => {
            const p = porIndice.get(i);
            const r = resolucoes[i];
            return (
              <div key={l.uid} className="rounded-md border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-text-muted">#{i + 1}</span>
                  {p && <Badge variant={ROTULO[p.classificacao].variant}>{ROTULO[p.classificacao].label}</Badge>}
                  {p && p.classificacao !== "erro" && <span className="text-text-secondary">{p.motivo}</span>}
                  <button type="button" onClick={() => { setLinhas((ls) => ls.filter((x) => x.uid !== l.uid)); setPrevia(null); setResolucoes({}); }} className="ml-auto text-xs text-text-muted underline">remover</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Campo label="Tipo de tarefa">
                    <select value={l.tipo} onChange={(e) => editar(l.uid, "tipo", e.target.value)} className={classeInput}>
                      {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Paciente"><input value={l.nome} onChange={(e) => editar(l.uid, "nome", e.target.value)} className={classeInput} /></Campo>
                  <Campo label="Código no Simples Dental"><input value={l.sd_codigo} onChange={(e) => editar(l.uid, "sd_codigo", e.target.value)} className={classeInput} /></Campo>
                  {l.tipo !== "atendimento_realizado" && (
                    <>
                      <Campo label="Ação solicitada" largo><input value={l.acao} onChange={(e) => editar(l.uid, "acao", e.target.value)} className={classeInput} /></Campo>
                      <Campo label="Prazo"><input type="date" value={l.prazo} onChange={(e) => editar(l.uid, "prazo", e.target.value)} className={classeInput} /></Campo>
                    </>
                  )}
                  <Campo label="Contexto" largo><input value={l.contexto} onChange={(e) => editar(l.uid, "contexto", e.target.value)} className={classeInput} /></Campo>
                  <Campo label="Telefone (opcional)"><input value={l.telefone} onChange={(e) => editar(l.uid, "telefone", e.target.value)} className={classeInput} /></Campo>
                  {l.tipo === "cobranca" && (
                    <>
                      <Campo label="Valor (R$)"><input inputMode="decimal" value={l.valor} onChange={(e) => editar(l.uid, "valor", e.target.value)} className={classeInput} /></Campo>
                      <Campo label="Vencimento"><input type="date" value={l.vencimento} onChange={(e) => editar(l.uid, "vencimento", e.target.value)} className={classeInput} /></Campo>
                    </>
                  )}
                  {l.tipo === "atendimento_realizado" && (
                    <>
                      <Campo label="Data exata do atendimento"><input type="date" value={l.data_atendimento} onChange={(e) => editar(l.uid, "data_atendimento", e.target.value)} className={classeInput} /></Campo>
                      <Campo label="Status no Simples Dental"><input value={l.status_no_sd} onChange={(e) => editar(l.uid, "status_no_sd", e.target.value)} className={classeInput} placeholder="Finalizado" /></Campo>
                      <fieldset className="text-xs text-text-secondary sm:col-span-3">
                        <legend>Marcos pertinentes (conforme orientação da Dra. Larissa)</legend>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm">
                          {([["d30", "30 dias"], ["d90", "90 dias"], ["m6", "6 meses"]] as const).map(([k, rot]) => (
                            <label key={k} className="flex items-center gap-1.5">
                              <input type="checkbox" checked={l.marcos.includes(k)} onChange={() => { setLinhas((ls) => ls.map((x) => (x.uid === l.uid ? { ...x, marcos: x.marcos.includes(k) ? x.marcos.filter((m) => m !== k) : [...x.marcos, k] } : x))); setPrevia(null); }} /> {rot}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  )}
                  {l.tipo === "recuperacao_falta" && (
                    <>
                      <Campo label="Data da falta/cancelamento"><input type="date" value={l.data_ocorrencia} onChange={(e) => editar(l.uid, "data_ocorrencia", e.target.value)} className={classeInput} /></Campo>
                      <Campo label="Ocorrência">
                        <select value={l.ocorrencia} onChange={(e) => editar(l.uid, "ocorrencia", e.target.value)} className={classeInput}>
                          <option value="">Escolha…</option><option value="falta">Falta</option><option value="cancelamento">Cancelamento</option>
                        </select>
                      </Campo>
                    </>
                  )}
                  {l.tipo === "encaminhamento" && (
                    <>
                      <Campo label="Para">
                        <select value={l.para} onChange={(e) => editar(l.uid, "para", e.target.value)} className={classeInput}>
                          <option value="">Escolha…</option><option value="gabi">Concierge</option><option value="gestao">Gestão</option><option value="dra_larissa">Dra. Larissa</option><option value="comercial_externa">Comercial externa</option>
                        </select>
                      </Campo>
                      <Campo label="Motivo"><input value={l.motivo} onChange={(e) => editar(l.uid, "motivo", e.target.value)} className={classeInput} /></Campo>
                    </>
                  )}
                  <Campo label="Campos a conferir (separe por vírgula)" largo><input value={l.a_conferir} onChange={(e) => editar(l.uid, "a_conferir", e.target.value)} className={classeInput} /></Campo>
                </div>
                {l.evidencia && <p className="mt-2 text-xs text-text-muted">Trecho de origem (não é fato confirmado): “{l.evidencia}”</p>}
                {p && p.erros.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-critical">{p.erros.map((e) => <li key={e}>{e}</li>)}</ul>}
                {p && p.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-important">{p.avisos.map((e) => <li key={e}>{e}</li>)}</ul>}
                {p?.classificacao === "vinculo_pendente" && (
                  <select className={`${classeInput} mt-2`} value={r?.acao === "vincular" ? `v:${r.pacienteId}` : r?.acao ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const novo = { ...resolucoes };
                      if (!v) delete novo[i];
                      else novo[i] = v.startsWith("v:") ? { acao: "vincular", pacienteId: v.slice(2) } : ({ acao: v } as Resolucao);
                      setResolucoes(novo);
                    }}>
                    <option value="">Deixar pendente (não publicar agora)</option>
                    {p.sugestoes.map((id) => <option key={id} value={`v:${id}`}>É a mesma paciente: {nome(id)}</option>)}
                    <option value="nova">É outra paciente: cadastrar nova</option>
                  </select>
                )}
                {p?.classificacao === "possivel_duplicidade" && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                    <input type="checkbox" checked={r?.acao === "aceitar"} onChange={(e) => { const n = { ...resolucoes }; if (e.target.checked) n[i] = { acao: "aceitar" }; else delete n[i]; setResolucoes(n); }} />
                    Conferi: é outra pendência, pode publicar
                  </label>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={revisar} loading={carregando === "previa"} loadingText="Conferindo…">{previa ? "Conferir de novo" : "Conferir prévia"}</Button>
            {previa && (
              <Button onClick={publicar} loading={carregando === "publicar"} loadingText="Publicando…" disabled={previa.jaImportado || vaiAplicar === 0}>
                Publicar {vaiAplicar} para a concierge
              </Button>
            )}
            {previa?.jaImportado && <span className="text-sm text-critical">Este conteúdo já foi publicado antes.</span>}
            {!previa && <span className="text-xs text-text-muted">A conferência verifica vínculo de paciente e duplicidade. Nada é gravado antes de publicar.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
