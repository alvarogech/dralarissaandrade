"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ESTADOS_ROTINA, GRUPOS_ROTINA, MAX_QUANTIDADE, ROTULO_ESTADO_ROTINA, itensDoDia, textoDoItem, textoMetricas, type EstadoRotina, type ItemRotina, type MetricasRotina } from "@/lib/fila/rotina-itens";
import type { RotinaCarregada } from "@/lib/fila/rotina";
import type { RotinaItemRow } from "@/lib/fila/store";
import { Campo, chamarApi, classeInput, dataBr, horaBr } from "./comum";

/**
 * Rotina do dia da concierge: três grupos (início, durante, fechamento), cada item com quatro
 * estados. Itens semanais/mensais (cobranças seg/sex, contatos 15/30/90 dias, resgate, dia 20)
 * só aparecem no dia deles. Só o estado da conferência e quantidades são gravados — nada de nomes,
 * telefones, valores, documentos ou dados clínicos. "Com impedimento" pede motivo e próxima ação
 * (prazo, responsável e tarefa relacionada são opcionais). Cada marcação é salva na hora,
 * confirmada pelo servidor; a gestão vê em leitura (quem marca é a concierge, pela conta dela).
 */
interface Props {
  rotina: RotinaCarregada;
  perfis: { id: string; nome: string }[];
  /** Tarefas abertas que podem ser relacionadas a um item (evita criar duplicata). */
  tarefas: { id: string; rotulo: string }[];
  hoje: string;
  /** Título exibido (ex.: "Rotina da Gabi" para a gestão). */
  titulo: string;
  abertaInicial?: boolean;
  /** Explica por que a rotina está em leitura (ex.: "a Gabi marca pela conta dela"). */
  motivoLeitura?: string;
  /** Gestão: mostra onde configurar links ausentes. */
  gestao?: boolean;
}

const TOM: Record<EstadoRotina, string> = {
  a_fazer: "border-border-strong bg-surface text-text-secondary",
  feito: "border-opportunity bg-opportunity-bg text-opportunity",
  nao_se_aplica: "border-border bg-surface-raised text-text-muted",
  impedimento: "border-critical bg-critical-bg text-critical",
};
const RESPONSAVEIS_EXTERNOS = [["gestao", "Gestão"], ["comercial_externa", "Comercial Externa"], ["dra_larissa", "Dra. Larissa"]] as const;

export function RotinaView({ rotina, perfis, tarefas, hoje, titulo, abertaInicial = true, motivoLeitura, gestao = false }: Props) {
  const [linhas, setLinhas] = useState<Record<string, RotinaItemRow>>(() => Object.fromEntries(rotina.linhas.map((l) => [l.itemKey, l])));
  const [aberta, setAberta] = useState(abertaInicial);
  // Só os itens que valem no dia (data local da clínica): fixos + semanais/mensais do dia.
  const itensDia = itensDoDia(rotina.dia);
  const doDia = itensDia.filter((i) => i.agenda);
  const estado = (k: string): EstadoRotina => linhas[k]?.estado ?? "a_fazer";
  const contagem = (g: string) => {
    const itens = itensDia.filter((i) => i.grupo === g);
    return { total: itens.length, marcados: itens.filter((i) => estado(i.key) !== "a_fazer").length };
  };
  const impedimentos = itensDia.filter((i) => estado(i.key) === "impedimento").length;
  const marcados = itensDia.filter((i) => estado(i.key) !== "a_fazer").length;
  const editavel = rotina.editavel;
  const nomeResp = (r: string | null) => (!r ? null : r.startsWith("perfil:") ? perfis.find((p) => p.id === r.slice(7))?.nome ?? null : RESPONSAVEIS_EXTERNOS.find(([k]) => k === r)?.[1] ?? null);

  return (
    <section className="mb-6 rounded-card border border-border bg-surface" aria-label={titulo}>
      <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span>
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">{titulo}</span>
          <span className="mt-0.5 block text-[13px] text-text-secondary">
            {dataBr(rotina.dia)} · {marcados}/{itensDia.length} marcados
            {impedimentos > 0 && <span className="font-medium text-critical"> · {impedimentos} com impedimento</span>}
            {!editavel && <span className="text-text-muted"> · somente leitura{motivoLeitura ? ` (${motivoLeitura})` : ""}</span>}
          </span>
          {doDia.length > 0 && (
            <span className="mt-0.5 block text-[12.5px] text-text-secondary">Hoje também: {doDia.map((i) => i.curto ?? i.texto).join(" · ")}</span>
          )}
        </span>
        <span className="flex items-center gap-3 text-[12.5px] text-text-muted">
          {GRUPOS_ROTINA.map((g) => { const c = contagem(g.id); return <span key={g.id} className="hidden sm:inline">{g.titulo} {c.marcados}/{c.total}</span>; })}
          <span aria-hidden>{aberta ? "▴" : "▾"}</span>
        </span>
      </button>

      {aberta && (
        <div className="border-t border-border px-4 pb-4">
          {rotina.doDiaAnterior && (
            <div role="status" className="mt-3 rounded-control border border-important bg-important-bg px-3 py-2 text-[13.5px] text-important">
              <p className="font-medium">Impedimentos registrados em {dataBr(rotina.doDiaAnterior.dia)} (o dia de hoje começa do zero; confira se seguem):</p>
              <ul className="mt-1 list-disc pl-5">
                {rotina.doDiaAnterior.linhas.map((l) => (
                  <li key={l.itemKey}>{textoDoItem(l.itemKey)} — {l.motivo}; próxima ação: {l.proximaAcao}{l.prazo ? ` até ${dataBr(l.prazo)}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
          {GRUPOS_ROTINA.map((g) => (
            <div key={g.id} className="mt-4">
              <h3 className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                {g.titulo}<span className="font-normal normal-case tracking-normal">{contagem(g.id).marcados}/{contagem(g.id).total}</span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </h3>
              <ul className="flex flex-col divide-y divide-border">
                {itensDia.filter((i) => i.grupo === g.id).map((i) => (
                  <LinhaRotina key={i.key} item={i} linha={linhas[i.key]} editavel={editavel} perfis={perfis} tarefas={tarefas} hoje={hoje} nomeResp={nomeResp}
                    link={i.link ? rotina.links[i.link.config] ?? null : null} gestao={gestao}
                    onSalvo={(l) => setLinhas((x) => ({ ...x, [l.itemKey]: l }))} />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-4 text-[12.5px] text-text-muted">
            Estados e quantidades entram no feedback do dia automaticamente (nada é enviado sozinho). Casos de pacientes continuam nas tarefas e no Simples Dental — a rotina não cria tarefas por paciente.
          </p>
        </div>
      )}
    </section>
  );
}

/** Valores do formulário de quantidades (texto para números; booleano para sim/não). */
type FormMetricas = Record<string, string | boolean>;
const formDeMetricas = (item: ItemRotina, m?: MetricasRotina): FormMetricas =>
  Object.fromEntries((item.metricas ?? []).map((d) => [d.key, d.tipo === "sim_nao" ? m?.[d.key] === true : typeof m?.[d.key] === "number" ? String(m[d.key]) : ""]));
function metricasDoForm(item: ItemRotina, f: FormMetricas): { ok: true; m: MetricasRotina } | { ok: false; erro: string } {
  const m: MetricasRotina = {};
  for (const d of item.metricas ?? []) {
    const v = f[d.key];
    if (d.tipo === "sim_nao") { if (v === true) m[d.key] = true; continue; }
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) continue; // vazio = não informado (não vira zero)
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTIDADE) return { ok: false, erro: `${d.rotulo}: use um número inteiro de 0 a ${MAX_QUANTIDADE}.` };
    m[d.key] = n;
  }
  return { ok: true, m };
}

function LinhaRotina({ item, linha, editavel, perfis, tarefas, hoje, nomeResp, onSalvo, link, gestao }: {
  item: ItemRotina; linha?: RotinaItemRow; editavel: boolean; perfis: Props["perfis"]; tarefas: Props["tarefas"]; hoje: string;
  nomeResp: (r: string | null) => string | null; onSalvo: (l: RotinaItemRow) => void; link: string | null; gestao: boolean;
}) {
  const router = useRouter();
  const atual: EstadoRotina = linha?.estado ?? "a_fazer";
  const [formImpedimento, setFormImpedimento] = useState(false);
  const [f, setF] = useState({ motivo: linha?.motivo ?? "", proximaAcao: linha?.proximaAcao ?? "", prazo: linha?.prazo ?? "", responsavel: linha?.responsavel ?? "", tarefaId: linha?.tarefaId ?? "" });
  const [fm, setFm] = useState<FormMetricas>(() => formDeMetricas(item, linha?.metricas));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const resumoMetricas = textoMetricas(item, linha?.metricas);

  async function salvar(estado: EstadoRotina) {
    setMsg(null);
    const qm = metricasDoForm(item, fm);
    if (!qm.ok) return setMsg({ ok: false, t: qm.erro });
    setSalvando(true);
    const r = await chamarApi<{ item: RotinaItemRow }>("/api/fila/rotina", "POST", {
      itemKey: item.key, estado,
      ...(estado === "impedimento" ? { motivo: f.motivo, proximaAcao: f.proximaAcao, prazo: f.prazo || null, responsavel: f.responsavel || null } : {}),
      tarefaId: f.tarefaId || null,
      ...(item.metricas ? { metricas: qm.m } : {}),
    });
    setSalvando(false);
    if (!r.ok) return setMsg({ ok: false, t: r.incerto ? `${r.erro} Pode marcar de novo: o estado é substituído, não duplicado.` : r.erro });
    onSalvo(r.data.item);
    setFormImpedimento(false);
    setMsg({ ok: true, t: "Salvo" });
    router.refresh(); // atualiza a prévia do feedback e os indicadores
  }

  function escolher(e: EstadoRotina) {
    if (e === "impedimento") return setFormImpedimento(true);
    void salvar(e);
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="text-[14.5px] text-text-primary">
            {item.texto}
            {item.agenda && <span className="ml-2 inline-flex items-center rounded-sm border border-border px-1.5 align-middle text-[11.5px] font-medium leading-5 text-text-secondary">{item.agenda.rotulo}</span>}
          </p>
          {item.dica && <p className="text-[12.5px] text-text-muted">{item.dica}</p>}
          {item.link && (link
            ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-[12.5px] text-accent underline underline-offset-4">{item.link.rotulo} <span aria-hidden>↗</span><span className="sr-only"> (abre em nova aba)</span></a>
            : gestao && <p className="text-[12px] text-text-muted">Link do script não configurado (Feedbacks › Links da rotina).</p>)}
          {resumoMetricas && <p className="mt-0.5 text-[13px] text-text-secondary">{resumoMetricas}</p>}
          {atual === "impedimento" && linha && (
            <p className="mt-1 text-[13px] text-critical">
              Impedimento: {linha.motivo} · Próxima ação: {linha.proximaAcao}{nomeResp(linha.responsavel) ? ` (${nomeResp(linha.responsavel)})` : ""}{linha.prazo ? ` até ${dataBr(linha.prazo)}` : ""}
            </p>
          )}
          {linha?.tarefaId && <p className="text-[12.5px] text-text-secondary">Relacionado a: {tarefas.find((t) => t.id === linha.tarefaId)?.rotulo ?? "tarefa existente"}</p>}
          {linha && linha.estado !== "a_fazer" && <p className="text-[11.5px] text-text-muted">atualizado {horaBr(linha.updatedAt)}</p>}
        </div>
        {editavel ? (
          <div role="group" aria-label={`Estado: ${item.texto}`} className="flex flex-wrap gap-1">
            {ESTADOS_ROTINA.map((e) => (
              <button key={e} type="button" disabled={salvando} aria-pressed={atual === e} onClick={() => escolher(e)}
                className={clsx("min-h-8 rounded-control border px-2.5 text-[12.5px] transition-colors disabled:opacity-60",
                  atual === e ? `${TOM[e]} font-medium` : "border-border bg-surface text-text-secondary hover:bg-surface-hover")}>
                {atual === e && <span aria-hidden>✓ </span>}{ROTULO_ESTADO_ROTINA[e]}
              </button>
            ))}
          </div>
        ) : (
          <span className={clsx("inline-flex items-center rounded-sm border px-1.5 text-[12px] font-medium leading-5", TOM[atual])}>{ROTULO_ESTADO_ROTINA[atual]}</span>
        )}
      </div>
      {editavel && item.metricas && (
        <form onSubmit={(ev) => { ev.preventDefault(); void salvar(atual); }} className="mt-2 flex flex-wrap items-end gap-2" aria-label={`Quantidades: ${item.texto}`}>
          {item.metricas.map((d) => d.tipo === "sim_nao" ? (
            <label key={d.key} className="flex min-h-8 items-center gap-1.5 text-[12.5px] text-text-secondary">
              <input type="checkbox" checked={fm[d.key] === true} onChange={(e) => setFm({ ...fm, [d.key]: e.target.checked })} /> {d.rotulo}
            </label>
          ) : (
            <label key={d.key} className="flex flex-col text-[12px] text-text-secondary">
              <span>{d.rotulo}{d.meta ? ` (meta ${d.meta})` : ""}</span>
              <input type="number" inputMode="numeric" min={0} max={MAX_QUANTIDADE} step={1} value={String(fm[d.key] ?? "")}
                onChange={(e) => setFm({ ...fm, [d.key]: e.target.value })} className={clsx(classeInput, "w-28")} />
            </label>
          ))}
          <Button type="submit" variante="secundario" disabled={salvando || (atual === "impedimento" && !(f.motivo.trim() && f.proximaAcao.trim()))}>Salvar quantidades</Button>
        </form>
      )}
      {formImpedimento && editavel && (
        <form onSubmit={(ev) => { ev.preventDefault(); void salvar("impedimento"); }} className="mt-2 grid gap-2 rounded-control border border-critical bg-surface-raised p-3 sm:grid-cols-2">
          <Campo label="Motivo do impedimento *" largo><input required value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} className={classeInput} /></Campo>
          <Campo label="Próxima ação *" largo><input required value={f.proximaAcao} onChange={(e) => setF({ ...f, proximaAcao: e.target.value })} className={classeInput} /></Campo>
          <Campo label="Prazo"><input type="date" min={hoje} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} className={classeInput} /></Campo>
          <Campo label="Responsável pela próxima ação">
            <select value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} className={classeInput}>
              <option value="">— não definido —</option>
              {perfis.map((p) => <option key={p.id} value={`perfil:${p.id}`}>{p.nome}</option>)}
              {RESPONSAVEIS_EXTERNOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
          {tarefas.length > 0 && (
            <Campo label="Relacionar a uma tarefa existente (opcional)" largo>
              <select value={f.tarefaId} onChange={(e) => setF({ ...f, tarefaId: e.target.value })} className={classeInput}>
                <option value="">— nenhuma —</option>
                {tarefas.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </Campo>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar impedimento</Button>
            <Button type="button" variante="discreto" onClick={() => setFormImpedimento(false)}>Cancelar</Button>
          </div>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("mt-1 text-[12.5px]", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</p>}
    </li>
  );
}
