"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Classificacao, ItemPrevia } from "@/lib/fila/previa";
import type { Resolucao, ResultadoEntrada, ResultadoPrevia } from "@/lib/fila/servico";

/** Itens por requisição (mesmo valor do servidor, TAMANHO_TRECHO). */
const TAMANHO_TRECHO = 5;
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
  /** Identificadores do Simples Dental, sempre separados (nunca equivalentes entre si). */
  sd_numero: string;
  sd_ficha_id: string;
  /** Demais campos do item original (subtipo, data_aniversario, procedimento…), devolvidos intactos ao publicar. */
  extras: Record<string, unknown>;
}

/** Campos que o editor já representa; o resto do item vai em `extras`. */
const CAMPOS_EDITOR = ["tipo", "paciente", "acao", "contexto", "prazo", "valor", "vencimento", "data_atendimento", "status_no_sd", "data_ocorrencia", "ocorrencia", "para", "motivo", "a_conferir", "evidencia", "nota_ia", "chave_origem"];

/** Rascunho local das propostas (conveniência do navegador: sobrevive a recarregar a página). */
const CHAVE_RASCUNHO = "stimma-levantamento-rascunho";

let seq = 0;
export function linhaVazia(extra: Partial<LinhaEditor> = {}): LinhaEditor {
  return {
    uid: `l${++seq}`, tipo: "outro", nome: "", sd_codigo: "", telefone: "", acao: "", contexto: "", prazo: "", valor: "", vencimento: "",
    data_atendimento: "", status_no_sd: "", data_ocorrencia: "", ocorrencia: "", para: "", motivo: "", a_conferir: "", evidencia: "", chave_origem: "",
    sd_numero: "", sd_ficha_id: "", extras: {}, ...extra,
  };
}

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function linhaDeItem(o: Record<string, unknown>): LinhaEditor {
  const p = (o.paciente ?? {}) as Record<string, unknown>;
  return linhaVazia({
    tipo: s(o.tipo) || "outro", nome: s(p.nome), sd_codigo: s(p.sd_codigo), sd_numero: s(p.sd_numero), sd_ficha_id: s(p.sd_ficha_id), telefone: s(p.telefone), acao: s(o.acao), contexto: s(o.contexto),
    prazo: s(o.prazo), valor: o.valor === undefined || o.valor === null ? "" : String(o.valor).replace(".", ","), vencimento: s(o.vencimento),
    data_atendimento: s(o.data_atendimento), status_no_sd: s(o.status_no_sd), data_ocorrencia: s(o.data_ocorrencia), ocorrencia: s(o.ocorrencia),
    para: s(o.para), motivo: s(o.motivo), a_conferir: Array.isArray(o.a_conferir) ? (o.a_conferir as string[]).join(", ") : "",
    evidencia: s(o.evidencia ?? o.nota_ia), chave_origem: s(o.chave_origem),
    extras: Object.fromEntries(Object.entries(o).filter(([k]) => !CAMPOS_EDITOR.includes(k))),
  });
}

function itemDaLinha(l: LinhaEditor): Record<string, unknown> {
  const o: Record<string, unknown> = { ...(l.extras ?? {}), tipo: l.tipo, paciente: {} };
  const p = o.paciente as Record<string, string>;
  if (l.nome.trim()) p.nome = l.nome.trim();
  if (l.sd_codigo.trim()) p.sd_codigo = l.sd_codigo.trim();
  if ((l.sd_numero ?? "").trim()) p.sd_numero = l.sd_numero.trim();
  if ((l.sd_ficha_id ?? "").trim()) p.sd_ficha_id = l.sd_ficha_id.trim();
  if (l.telefone.trim()) p.telefone = l.telefone.trim();
  for (const k of ["acao", "contexto", "prazo", "vencimento", "data_atendimento", "status_no_sd", "data_ocorrencia", "ocorrencia", "para", "motivo", "chave_origem"] as const) {
    if (l[k].trim()) o[k] = l[k].trim();
  }
  const v = numeroBr(l.valor);
  if (v !== null) o.valor = Number.isNaN(v) ? l.valor : v;
  o.a_conferir = l.a_conferir.split(",").map((x) => x.trim()).filter(Boolean);
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
  /** Cobranças marcadas como exceção (viram tarefa); as demais ficam na rotina de segunda e sexta. */
  const [excecoesCobranca, setExcecoesCobranca] = useState<number[]>([]);
  // Mudou a prévia/propostas: decisões anteriores (vínculo, duplicidade, exceção) deixam de valer.
  const limparDecisoes = () => {
    setResolucoes({});
    setExcecoesCobranca([]);
  };
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);
  /** Publicação em trechos: progresso e o que já está comprovadamente salvo. */
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [salvos, setSalvos] = useState<{ aplicados: number[]; comErro: { index: number; erro: string }[]; status: string | null } | null>(null);

  // Rascunho: recupera as propostas editadas se a página recarregar no meio (nunca é a fonte de verdade).
  useEffect(() => {
    try {
      const r = localStorage.getItem(CHAVE_RASCUNHO);
      if (r && !linhas.length) {
        const d = JSON.parse(r) as { linhas: LinhaEditor[]; origem: string };
        if (d.linhas?.length) {
          // Rascunhos antigos não têm os campos novos: completa com os padrões.
          setLinhas(() => d.linhas.map((x) => ({ ...linhaVazia(), ...x })));
          if (d.origem) setOrigem(d.origem);
          setAviso(`Propostas recuperadas do rascunho deste navegador (${d.linhas.length}). Confira antes de publicar.`);
        }
      }
    } catch { /* armazenamento indisponível: segue sem rascunho */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      if (linhas.length) localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ linhas, origem }));
      else localStorage.removeItem(CHAVE_RASCUNHO);
    } catch { /* ignora */ }
  }, [linhas, origem]);

  // O dia da consulta faz parte do conteúdo (e do hash do lote): retomar no mesmo dia identifica o mesmo lote.
  const [consultadoEm] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  function loteAtual(): string {
    return JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: origem.trim() || "manual", consultado_em: consultadoEm }, itens: linhas.map(itemDaLinha) });
  }

  async function consultarSalvos(texto: string) {
    const r = await chamarApi<{ existe: boolean; status: string | null; aplicados: number[]; comErro: { index: number; erro: string }[] }>("/api/fila/entrada/estado", "POST", { texto });
    if (r.ok) setSalvos(r.data.existe ? { aplicados: r.data.aplicados, comErro: r.data.comErro, status: r.data.status } : null);
    return r.ok ? r.data : null;
  }

  function editar(uid: string, campo: keyof LinhaEditor, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.uid === uid ? { ...l, [campo]: valor } : l)));
    setPrevia(null);
    limparDecisoes();
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
    setResolucoes({}); // exceções de cobrança continuam (mesmos itens)
    await consultarSalvos(loteAtual());
  }

  /**
   * Publica em trechos pequenos (cada requisição termina bem dentro do tempo da função). Se um trecho
   * falhar ou a resposta não chegar, consulta o que está salvo e oferece retomar só o que falta —
   * as propostas editadas continuam na tela.
   */
  async function publicar() {
    setErro(null);
    setCarregando("publicar");
    const texto = loteAtual();
    const ja = new Set(salvos?.aplicados ?? []);
    const indices = linhas.map((_, i) => i).filter((i) => !ja.has(i));
    const acumulado: ResultadoEntrada = { loteId: "", aplicados: 0, atendimentosConfirmados: 0, atendimentosPendentes: 0, tarefas: 0, naoAplicados: [], jaAplicados: [...ja], concluido: false, semResponsavel: 0 };
    setProgresso({ feitos: 0, total: indices.length });
    for (let k = 0; k < indices.length; k += TAMANHO_TRECHO) {
      const trecho = indices.slice(k, k + TAMANHO_TRECHO);
      const r = await chamarApi<ResultadoEntrada>("/api/fila/entrada/confirmar", "POST", { texto, resolucoes, indices: trecho, excecoesCobranca });
      if (!r.ok) {
        const estado = await consultarSalvos(texto);
        setCarregando(null);
        setProgresso(null);
        const salvosAgora = estado?.aplicados.length ?? 0;
        return setErro(`${r.erro} ${estado ? `Confirmado no banco: ${salvosAgora} de ${linhas.length} item(ns) publicados.` : "Não consegui confirmar o que foi salvo."} Suas correções continuam aqui; use “Retomar publicação” para enviar só o que falta.`);
      }
      acumulado.loteId = r.data.loteId;
      acumulado.aplicados += r.data.aplicados;
      acumulado.atendimentosConfirmados += r.data.atendimentosConfirmados;
      acumulado.atendimentosPendentes += r.data.atendimentosPendentes;
      acumulado.tarefas += r.data.tarefas;
      acumulado.semResponsavel += r.data.semResponsavel;
      acumulado.naoAplicados.push(...r.data.naoAplicados);
      acumulado.concluido = r.data.concluido;
      setProgresso({ feitos: Math.min(k + TAMANHO_TRECHO, indices.length), total: indices.length });
    }
    setCarregando(null);
    setProgresso(null);
    setResultado(acumulado);
    setPrevia(null);
    setSalvos(null);
    setLinhas(() => []);
    setTexto("");
  }

  const porIndice = new Map<number, ItemPrevia>((previa?.previa ?? []).map((p) => [p.index, p]));
  const nome = (id: string) => previa?.pacientes.find((p) => p.id === id)?.nome ?? id;
  const vaiAplicar = previa ? previa.previa.filter((p) => {
    if (salvos?.aplicados.includes(p.index)) return false;
    const r = resolucoes[p.index];
    if (r?.acao === "ignorar") return false;
    if (p.item?.tipo === "cobranca" && !excecoesCobranca.includes(p.index)) return false; // rotineira: fica no checklist
    return p.classificacao === "novo" || p.classificacao === "atualizacao" || (p.classificacao === "vinculo_pendente" && (r?.acao === "vincular" || r?.acao === "nova")) || (p.classificacao === "possivel_duplicidade" && r?.acao === "aceitar");
  }).length : 0;

  // Etapas reais do fluxo (só indicam onde se está; nenhuma é obrigatória a mais).
  const etapa = resultado && !linhas.length ? 4 : previa ? 3 : linhas.length ? 2 : 1;
  const ETAPAS = ["Colar levantamento", "Revisar propostas", "Conferir prévia", "Publicar"];

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Etapas da entrada">
        {ETAPAS.map((t, k) => {
          const n = k + 1;
          const estado = n < etapa ? "feita" : n === etapa ? "atual" : "futura";
          return (
            <li key={t} aria-current={estado === "atual" ? "step" : undefined}
              className={clsx("flex items-center gap-2 border-t-2 pt-2 text-[13px]", estado === "atual" ? "border-accent font-medium text-text-primary" : estado === "feita" ? "border-graphite text-text-secondary" : "border-border text-text-muted")}>
              <span className="tabular-nums">{estado === "feita" ? "✓" : `${n}.`}</span>{t}
            </li>
          );
        })}
      </ol>
      {resultado && (
        <div className="rounded-card border border-opportunity bg-opportunity-bg p-4 text-sm text-text-primary">
          <p className="font-medium">Publicado na fila da concierge.</p>
          <p>
            {resultado.tarefas} tarefa(s), {resultado.atendimentosConfirmados} atendimento(s) com os três marcos criados, {resultado.atendimentosPendentes} a conferir.
            {resultado.jaAplicados.length ? ` ${resultado.jaAplicados.length} já estavam publicados e não foram repetidos.` : ""}
            {resultado.naoAplicados.length ? ` ${resultado.naoAplicados.length} não aplicado(s) — ficam registrados no lote; cole o mesmo conteúdo para resolvê-los depois.` : ""}
            {resultado.semResponsavel ? ` ${resultado.semResponsavel} tarefa(s) sem responsável (concierge não configurada) — atribua em “Trabalho da Gabi”.` : ""}
          </p>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <Campo label="Cole o levantamento (texto, Markdown ou JSON stimma-entrada-v1)">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={9} className={`${classeInput} font-mono text-[12.5px] leading-relaxed`}
            placeholder={"Ex.: Joana Teste (cód. 877) — parcela 3/6 de R$ 450,00 vencida em 18/10, sem pagamento no SD.\nLia Exemplo (cód. 878) faltou à consulta de 18/10."} />
        </Campo>
        <Campo label="Origem da informação">
          <input value={origem} onChange={(e) => setOrigem(e.target.value)} className={classeInput} />
        </Campo>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={converter} loading={carregando === "converter"} loadingText="Convertendo…" disabled={!texto.trim()}>Converter em propostas</Button>
          <button type="button" onClick={() => { setLinhas((ls) => [...ls, linhaVazia()]); setPrevia(null); }} className="fb-chip">
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
              <div key={l.uid} className="rounded-card border border-border bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-text-muted">#{i + 1}</span>
                  {salvos?.aplicados.includes(i) ? <Badge variant="opportunity">Já publicado</Badge> : p && <Badge variant={ROTULO[p.classificacao].variant}>{ROTULO[p.classificacao].label}</Badge>}
                  {salvos?.comErro.find((x) => x.index === i) && <Badge variant="critical">falhou: {salvos.comErro.find((x) => x.index === i)!.erro.slice(0, 60)}</Badge>}
                  {p && p.classificacao !== "erro" && <span className="text-text-secondary">{p.motivo}</span>}
                  <button type="button" onClick={() => { setLinhas((ls) => ls.filter((x) => x.uid !== l.uid)); setPrevia(null); limparDecisoes(); }} className="ml-auto text-xs text-text-muted underline">remover</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Campo label="Tipo de tarefa">
                    <select value={l.tipo} onChange={(e) => editar(l.uid, "tipo", e.target.value)} className={classeInput}>
                      {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Paciente"><input value={l.nome} onChange={(e) => editar(l.uid, "nome", e.target.value)} className={classeInput} /></Campo>
                  <Campo label="Código interno (SD)"><input value={l.sd_codigo} onChange={(e) => editar(l.uid, "sd_codigo", e.target.value)} className={classeInput} /></Campo>
                  <Campo label="Número (SD)"><input value={l.sd_numero} onChange={(e) => editar(l.uid, "sd_numero", e.target.value)} className={classeInput} /></Campo>
                  <Campo label="ID da ficha (SD)"><input value={l.sd_ficha_id} onChange={(e) => editar(l.uid, "sd_ficha_id", e.target.value)} className={classeInput} /></Campo>
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
                      <p className="text-xs text-text-muted sm:col-span-3">Confirmado como realizado, gera automaticamente os acompanhamentos de 30, 90 e 180 dias.</p>
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
                {l.tipo === "cobranca" && (
                  <div className="mt-2 rounded-control border border-border bg-surface-raised px-3 py-2 text-[13px] text-text-secondary">
                    <p>Cobrança rotineira <strong className="font-medium text-text-primary">não vira tarefa</strong>: a conferência de parcelas vencidas é feita pela concierge no Simples Dental, na rotina de segunda e sexta. Fica registrada no lote como não aplicada.</p>
                    <label className="mt-1.5 flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5" checked={excecoesCobranca.includes(i)} onChange={(e) => setExcecoesCobranca(e.target.checked ? [...excecoesCobranca, i] : excecoesCobranca.filter((x) => x !== i))} />
                      <span>É uma exceção que exige ação específica ou decisão da gestão — criar tarefa individual (descreva a ação em “Ação solicitada”).</span>
                    </label>
                  </div>
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
              <Button onClick={publicar} loading={carregando === "publicar"} loadingText={progresso ? `Publicando ${progresso.feitos}/${progresso.total}…` : "Publicando…"} disabled={vaiAplicar === 0}>
                {salvos?.aplicados.length ? `Retomar publicação (${vaiAplicar} restante(s))` : `Publicar ${vaiAplicar} para a concierge`}
              </Button>
            )}
            {previa && (() => {
              const rotineiras = previa.previa.filter((p) => p.item?.tipo === "cobranca" && !excecoesCobranca.includes(p.index)).length;
              return rotineiras ? <span className="text-sm text-text-secondary">{rotineiras} cobrança(s) rotineira(s) não viram tarefa (ficam na rotina de segunda e sexta).</span> : null;
            })()}
            {salvos && <span className="text-sm text-text-secondary">Este lote já existe no banco ({salvos.status === "confirmado" ? "concluído" : "publicação interrompida"}): {salvos.aplicados.length} item(ns) publicados. Só o que falta será enviado.</span>}
            {!previa && <span className="text-xs text-text-muted">A conferência verifica vínculo de paciente e duplicidade. Nada é gravado antes de publicar.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
