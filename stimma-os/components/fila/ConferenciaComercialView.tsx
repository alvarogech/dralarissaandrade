"use client";

import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import {
  CONFERENCIAS, DIVERGENCIAS, GRUPOS_COMERCIAIS, RESPONSAVEIS_COMERCIAIS, SITUACOES_COMERCIAIS, linhaComercial, precisaAgendamento, precisaDivergencia,
  registroDaConferencia, resumirComercial, rotuloConferencia, rotuloGrupo, rotuloResponsavel, rotuloSituacao, validarConferencia,
  type Conferencia, type EntradaConferencia, type GrupoComercial, type RegistroComercial, type SituacaoComercial,
} from "@/lib/fila/conferencia-comercial";
import type { ContatoDaRotina } from "@/lib/fila/rotina";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr } from "./comum";

/**
 * Conferência comercial — Mel, dentro da rotina da Gabi. Resumo no topo, lista compacta por paciente
 * (expande para detalhes e para remover um registro incorreto, com motivo) e um formulário rápido que
 * fica aberto para a próxima paciente. A Gabi confere e registra; a negociação continua com a Mel
 * (pendência comercial nasce com a Mel como responsável). Sem movimentação no dia: confirmação
 * explícita, sem nome fictício.
 */
interface Props {
  registros: ContatoDaRotina[];
  pacientes: { id: string; nome: string }[];
  usuarioId: string;
  hoje: string;
  proximoDiaUtil: string;
  editavel: boolean;
  semMovimentacao: boolean;
  /** Conclui a atividade com "sem movimentação" (estado feito + confirmação gravada). */
  onSemMovimento: () => Promise<boolean>;
  onMudou: () => void;
}

export function ConferenciaComercialView({ registros, pacientes, usuarioId, hoje, proximoDiaUtil, editavel, semMovimentacao, onSemMovimento, onMudou }: Props) {
  const regs: RegistroComercial[] = registros.map((r) => ({ eventoId: r.eventoId, pacienteId: r.pacienteId, paciente: r.paciente, detalhes: r.detalhes, proxima: r.proxima, prazo: r.prazo }));
  const resumo = resumirComercial(regs, semMovimentacao);
  const [aberto, setAberto] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const chip = (k: string, v: number, tom?: string) => (
    <span key={k} className={clsx("rounded-control border px-2 py-1 text-[12.5px]", tom ?? "border-border bg-surface text-text-secondary")}>{k}: <strong className="tabular-nums">{v}</strong></span>
  );

  return (
    <section aria-label="Conferência comercial — Mel" className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {chip("Novos leads", resumo.novosLeads)}
        {chip("Follow-ups", resumo.followups)}
        {chip("Avaliações agendadas", resumo.agendadas)}
        {chip("Aguardando resposta", resumo.semResposta + regs.filter((r) => r.detalhes.grupo !== "follow_up" && ["aguardando_paciente", "aguardando_mel"].includes(r.detalhes.situacao_comercial ?? "")).length)}
        {chip("Divergências", resumo.divergencias, resumo.divergencias ? "border-critical bg-critical-bg text-critical" : undefined)}
        {regs.length > 0 && chip("Conferidos por você", resumo.verificados, resumo.verificados < regs.length ? "border-important bg-important-bg text-important" : "border-opportunity bg-opportunity-bg text-opportunity")}
      </div>
      {regs.length > 0 && <p className="text-[12.5px] text-text-muted">{regs.length} registro{regs.length === 1 ? "" : "s"} · {resumo.pacientesUnicas} paciente{resumo.pacientesUnicas === 1 ? "" : "s"} · {resumo.verificados} de {regs.length} conferido{regs.length === 1 ? "" : "s"} por você (o resto foi só informado pela Mel ou não deu para conferir).</p>}

      {regs.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface">
          {regs.map((r) => <LinhaRegistro key={r.eventoId} r={r} editavel={editavel} onMudou={onMudou} />)}
        </ul>
      )}

      {semMovimentacao && !regs.length && <p className="text-[13.5px] text-opportunity">✓ Conferido: sem movimentação comercial identificada hoje.</p>}

      {editavel && !aberto && (
        <button type="button" className="self-start text-[13px] font-medium text-accent underline-offset-4 hover:underline" onClick={() => setAberto(true)}>+ Adicionar paciente</button>
      )}
      {editavel && aberto && <FormConferencia pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil} onSalvo={onMudou} onFechar={() => setAberto(false)} />}

      {editavel && !regs.length && !semMovimentacao && !aberto && (
        <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-raised p-2.5">
          <label className="flex items-start gap-2 text-[13.5px] text-text-primary">
            <input type="checkbox" className="mt-1" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
            Confirmo que conferi as conversas comerciais de hoje e não houve movimentação (nenhum lead, follow-up ou agendamento).
          </label>
          <Button type="button" variante="secundario" disabled={!confirmo} loading={ocupado} loadingText="Salvando…" className="self-start"
            onClick={async () => { setOcupado(true); await onSemMovimento(); setOcupado(false); }}>
            Concluir sem movimentação comercial
          </Button>
        </div>
      )}
    </section>
  );
}

function LinhaRegistro({ r, editavel, onMudou }: { r: RegistroComercial; editavel: boolean; onMudou: () => void }) {
  const d = r.detalhes;
  const [remover, setRemover] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const verificado = d.conferencia === "conversa" || d.conferencia === "simples_dental";

  async function anular() {
    setFalha(null);
    if (!motivo.trim()) return setFalha({ erro: "Diga por que o registro está sendo removido." });
    setOcupado(true);
    const res = await chamarApi("/api/fila/registro/anular", "POST", { eventoId: r.eventoId, motivo });
    setOcupado(false);
    if (!res.ok) return setFalha({ erro: res.erro, status: res.status });
    onMudou();
  }

  return (
    <li className="px-3 py-2">
      <details>
        <summary className="cursor-pointer list-none">
          <p className="text-[14px] font-semibold text-text-primary">{r.paciente}</p>
          <p className="text-[12.5px] text-text-secondary">{rotuloGrupo(d.grupo)}{d.servico ? ` · ${d.servico}` : ""} · {rotuloSituacao(d.situacao_comercial)}</p>
          <p className="text-[13px] text-text-primary">Resultado: {d.resultado_conferencia}</p>
          {r.proxima && <p className="text-[12.5px] text-text-secondary">Próxima ação: {rotuloResponsavel(d.responsavel_pendencia)} — {r.proxima}{r.prazo ? ` (${dataBr(r.prazo)})` : ""}</p>}
          <p className={clsx("text-[12.5px]", d.conferencia === "divergencia" ? "text-critical" : verificado ? "text-opportunity" : "text-important")}>Conferência: {rotuloConferencia(d.conferencia)}</p>
        </summary>
        <div className="mt-1.5 border-t border-border pt-1.5 text-[12.5px] text-text-secondary">
          <p>{linhaComercial(r)}</p>
          {editavel && !remover && <button type="button" className="mt-1 text-text-muted underline" onClick={() => setRemover(true)}>Remover registro incorreto</button>}
          {editavel && remover && (
            <div className="mt-1.5 flex flex-wrap items-end gap-2">
              <Campo label="Motivo da remoção *"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={classeInput} placeholder="ex.: paciente registrada em duplicidade" /></Campo>
              <Button type="button" variante="secundario" loading={ocupado} loadingText="Removendo…" onClick={() => void anular()}>Remover</Button>
              <Button type="button" variante="discreto" onClick={() => setRemover(false)}>Cancelar</Button>
            </div>
          )}
          {falha && <ErroAcao className="mt-1.5" erro={falha.erro} status={falha.status} />}
        </div>
      </details>
    </li>
  );
}

function FormConferencia({ pacientes, usuarioId, hoje, proximoDiaUtil, onSalvo, onFechar }: { pacientes: { id: string; nome: string }[]; usuarioId: string; hoje: string; proximoDiaUtil: string; onSalvo: () => void; onFechar: () => void }) {
  const uid = useId();
  const idc = (c: string) => `${uid}-${c}`;
  const vazio = { grupo: "" as GrupoComercial | "", servico: "", situacao: "" as SituacaoComercial | "", conferencia: "" as Conferencia | "", motivo: "", data: "", hora: "", profissional: "", divergencia: "", resultado: "", temPendencia: false, responsavel: "comercial_externa" as "comercial_externa" | "gabi" | "gestao", acao: "", prazo: proximoDiaUtil };
  const [f, setF] = useState(vazio);
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [modoNovo, setModoNovo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t.length < 2 ? [] : pacientes.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 6);
  }, [busca, pacientes]);
  const nomeEscolhido = pacienteId ? pacientes.find((p) => p.id === pacienteId)?.nome : null;
  const set = <K extends keyof typeof vazio>(k: K, v: (typeof vazio)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setFalha(null);
    const entrada: Omit<EntradaConferencia, "eventoId"> = {
      pacienteId, nomeNovo: modoNovo ? busca : "", grupo: f.grupo, servico: f.servico, situacao: f.situacao, conferencia: f.conferencia, motivoNaoConferido: f.motivo,
      agendamento: precisaAgendamento(f) ? { data: f.data, hora: f.hora, profissional: f.profissional } : undefined,
      divergencia: precisaDivergencia(f) ? f.divergencia : undefined, resultado: f.resultado,
      pendencia: f.temPendencia ? { responsavel: f.responsavel, acao: f.acao, prazo: f.prazo } : null,
    };
    const lista = validarConferencia(entrada, hoje);
    if (!pacienteId && !modoNovo && busca.trim()) lista.unshift(["paciente", "Escolha a paciente na lista ou marque “lead ainda não cadastrado”."]);
    setErros(Object.fromEntries([...lista].reverse()));
    if (lista.length) return document.getElementById(idc(lista[0]![0]))?.focus();
    setSalvando(true);
    const r = await chamarApi("/api/fila/registro", "POST", registroDaConferencia({ ...entrada, eventoId }, usuarioId));
    setSalvando(false);
    if (!r.ok) return setFalha({ erro: r.incerto ? `${r.erro} Pode salvar de novo: não duplica.` : `Não conseguimos salvar: ${r.erro}`, status: r.status });
    setUltimo(nomeEscolhido ?? busca.trim());
    setF(vazio); setBusca(""); setPacienteId(null); setModoNovo(false); setErros({});
    setEventoId(crypto.randomUUID());
    onSalvo();
  }

  const erro = (k: string) => (erros[k] ? <span id={`${idc(k)}-erro`} className="font-normal text-critical">{erros[k]}</span> : null);
  const inv = (k: string) => (erros[k] ? { "aria-invalid": true as const, "aria-describedby": `${idc(k)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });
  const chips = <T extends string>(lista: readonly (readonly [T, string])[], valor: string, escolher: (v: T) => void, id: string, rotulo: string) => (
    <div id={idc(id)} tabIndex={-1} role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {lista.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} onClick={() => escolher(k)}
          className={clsx("min-h-9 rounded-control border px-2.5 text-[12.5px]", valor === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
          {valor === k && <span aria-hidden>✓ </span>}{l}
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-3 rounded-control border border-border-strong bg-surface-raised p-3" aria-label="Adicionar paciente à conferência comercial">
      {ultimo && <p role="status" className="text-[13px] text-opportunity">✓ {ultimo} registrada. Pode adicionar a próxima.</p>}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Paciente *</span>
        {nomeEscolhido ? (
          <p className="text-[14.5px] text-text-primary">{nomeEscolhido} <button type="button" className="ml-1 text-[12.5px] text-text-muted underline" onClick={() => setPacienteId(null)}>trocar</button></p>
        ) : (
          <>
            <input id={idc("paciente")} value={busca} onChange={(e) => { setBusca(e.target.value); setModoNovo(false); }} placeholder="Buscar pelo nome (mín. 2 letras)" {...inv("paciente")} />
            {candidatos.length > 0 && (
              <ul className="rounded-control border border-border bg-surface">
                {candidatos.map((p) => <li key={p.id}><button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => { setPacienteId(p.id); setBusca(""); }}>{p.nome}</button></li>)}
              </ul>
            )}
            {busca.trim().length >= 2 && (
              <label className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                <input type="checkbox" checked={modoNovo} onChange={(e) => setModoNovo(e.target.checked)} /> Lead ainda não cadastrado: identificar como “{busca.trim()}” (provisório, confira no Simples Dental depois)
              </label>
            )}
          </>
        )}
        {erro("paciente")}
      </div>
      <fieldset><legend className="mb-1 text-[12.5px] font-medium text-text-secondary">Tipo de movimentação *</legend>{chips(GRUPOS_COMERCIAIS, f.grupo, (v) => set("grupo", v), "grupo", "Tipo de movimentação")}{erro("grupo")}</fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Serviço de interesse (se souber)"><input value={f.servico} onChange={(e) => set("servico", e.target.value)} className={classeInput} placeholder="ex.: harmonização facial" /></Campo>
        <Campo label="Situação do contato *">
          <select id={idc("situacao")} value={f.situacao} onChange={(e) => set("situacao", e.target.value as SituacaoComercial)} {...inv("situacao")}>
            <option value="">Escolha…</option>
            {SITUACOES_COMERCIAIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {erro("situacao")}
        </Campo>
      </div>
      {precisaAgendamento(f) && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Data do agendamento *"><input id={idc("agendaData")} type="date" value={f.data} onChange={(e) => set("data", e.target.value)} {...inv("agendaData")} />{erro("agendaData")}</Campo>
          <Campo label="Horário"><input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} className={classeInput} /></Campo>
          <Campo label="Profissional (se souber)"><input value={f.profissional} onChange={(e) => set("profissional", e.target.value)} className={classeInput} /></Campo>
        </div>
      )}
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-medium text-text-secondary">Como você conferiu? *</legend>
        {chips(CONFERENCIAS, f.conferencia, (v) => set("conferencia", v), "conferencia", "Como você conferiu")}
        {erro("conferencia")}
        {precisaAgendamento(f) && f.conferencia === "informado_mel" && <p className="mt-1 text-[12.5px] text-important">Agendamento só informado pela Mel fica como “aguardando conferência” — confira no Simples Dental quando puder.</p>}
      </fieldset>
      {f.conferencia === "nao_conferido" && <Campo label="Por que não foi possível conferir? *"><input id={idc("motivo")} value={f.motivo} onChange={(e) => set("motivo", e.target.value)} {...inv("motivo")} />{erro("motivo")}</Campo>}
      {precisaDivergencia(f) && (
        <Campo label="Tipo de divergência *">
          <select id={idc("divergencia")} value={f.divergencia} onChange={(e) => set("divergencia", e.target.value)} {...inv("divergencia")}>
            <option value="">Escolha…</option>
            {DIVERGENCIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {erro("divergencia")}
        </Campo>
      )}
      <Campo label="Resultado *">
        <input id={idc("resultado")} value={f.resultado} onChange={(e) => set("resultado", e.target.value)} {...inv("resultado")} placeholder="ex.: Mel esclareceu dúvidas e agendou avaliação" />
        {erro("resultado")}
      </Campo>
      <label className="flex min-h-9 items-center gap-2 text-[14px] text-text-primary">
        <input type="checkbox" checked={f.temPendencia} onChange={(e) => set("temPendencia", e.target.checked)} /> Ficou uma próxima ação pendente?
      </label>
      {f.temPendencia && (
        <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_160px]">
          <Campo label="Responsável">
            <select value={f.responsavel} onChange={(e) => set("responsavel", e.target.value as typeof f.responsavel)} className={classeInput}>
              {RESPONSAVEIS_COMERCIAIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
          <Campo label="Ação necessária *"><input id={idc("acao")} value={f.acao} onChange={(e) => set("acao", e.target.value)} {...inv("acao")} placeholder="ex.: novo contato da Mel" />{erro("acao")}</Campo>
          <Campo label="Prazo *"><input id={idc("prazo")} type="date" min={hoje} value={f.prazo} onChange={(e) => set("prazo", e.target.value)} {...inv("prazo")} />{erro("prazo")}</Campo>
        </div>
      )}
      {f.temPendencia && <p className="text-[12.5px] text-text-muted">Se a paciente já tiver uma pendência comercial aberta, ela é atualizada — não nasce outra. A ação comercial continua com a Mel, salvo se você escolher outro responsável.</p>}
      {falha && <ErroAcao erro={falha.erro} status={falha.status} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar paciente</Button>
        <Button type="button" variante="discreto" onClick={onFechar}>{ultimo ? "Concluir" : "Cancelar"}</Button>
      </div>
    </form>
  );
}
