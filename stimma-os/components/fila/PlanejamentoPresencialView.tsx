"use client";

import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import {
  RESPONSAVEIS_PLANEJAMENTO, SITUACAO_CURTA, acaoSugerida, conferido, precisaPendencia, registroPresencial, rotuloMotivoNao, validarPresencial,
  type EntradaPlanejamento, type ResponsavelPlanejamento, type ResultadoPlanejamento,
} from "@/lib/fila/planejamento";
import type { ContatoDaRotina } from "@/lib/fila/rotina";
import { CamposPlanejamento } from "./CamposPlanejamento";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr } from "./comum";

/**
 * Planejamento anual nos atendimentos presenciais do dia (dentro de "Cada atendimento do dia teve um
 * destino definido"): lista compacta do que já foi conferido e um formulário por paciente, que fica
 * aberto para a próxima. A Gabi registra o que confirmou com o profissional ou nos registros.
 */
interface Props {
  registros: ContatoDaRotina[];
  pacientes: { id: string; nome: string }[];
  usuarioId: string;
  hoje: string;
  proximoDiaUtil: string;
  editavel: boolean;
  onMudou: () => void;
}

export function linhaPresencial(d: Record<string, string>): string {
  if (d.planejamento === "sim") {
    const sit = d.planejamento_resultado === "fechado" && !conferido(d) ? "fechamento informado, a conferir" : SITUACAO_CURTA[d.planejamento_resultado as ResultadoPlanejamento] ?? "";
    return `Apresentado${d.planejamento_profissional ? ` por ${d.planejamento_profissional}` : ""} — ${sit}`;
  }
  if (d.planejamento === "nao") return `Não apresentado${d.planejamento_motivo_nao ? ` — ${rotuloMotivoNao(d.planejamento_motivo_nao).toLowerCase()}` : ""}`;
  if (d.planejamento === "nao_confirmado") return "Ainda não confirmado com o profissional";
  return "Não se aplica a este atendimento";
}

export function PlanejamentoPresencialView({ registros, pacientes, usuarioId, hoje, proximoDiaUtil, editavel, onMudou }: Props) {
  const [aberto, setAberto] = useState(false);
  const apresentados = registros.filter((r) => r.detalhes.planejamento === "sim").length;
  return (
    <section aria-label="Planejamento anual nos atendimentos de hoje" className="mt-2 flex flex-col gap-2">
      <p className="text-[13px] font-medium text-text-primary">Planejamento anual nos atendimentos de hoje</p>
      {registros.length > 0 && (
        <>
          <p className="text-[12.5px] text-text-muted">{registros.length} atendimento{registros.length === 1 ? "" : "s"} conferido{registros.length === 1 ? "" : "s"} · {apresentados} com planejamento apresentado</p>
          <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface">
            {registros.map((r) => (
              <li key={r.eventoId} className="px-3 py-1.5 text-[13px]">
                <span className="font-semibold text-text-primary">{r.paciente}</span> · <span className="text-text-secondary">{linhaPresencial(r.detalhes)}</span>
                {r.proxima && <span className="block text-[12.5px] text-text-muted">Próxima ação: {r.proxima}{r.prazo ? ` (${dataBr(r.prazo)})` : ""}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {editavel && !aberto && (
        <button type="button" className="self-start text-[13px] font-medium text-accent underline-offset-4 hover:underline" onClick={() => setAberto(true)}>+ Registrar planejamento de uma paciente</button>
      )}
      {editavel && aberto && <FormPresencial pacientes={pacientes} usuarioId={usuarioId} hoje={hoje} proximoDiaUtil={proximoDiaUtil} onSalvo={onMudou} onFechar={() => setAberto(false)} />}
    </section>
  );
}

function FormPresencial({ pacientes, usuarioId, hoje, proximoDiaUtil, onSalvo, onFechar }: { pacientes: { id: string; nome: string }[]; usuarioId: string; hoje: string; proximoDiaUtil: string; onSalvo: () => void; onFechar: () => void }) {
  const uid = useId();
  const idc = (c: string) => `${uid}-${c}`;
  const vazio: EntradaPlanejamento = { resposta: "" };
  const [plan, setPlan] = useState<EntradaPlanejamento>(vazio);
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [modoNovo, setModoNovo] = useState(false);
  const [pend, setPend] = useState<{ responsavel: ResponsavelPlanejamento | ""; acao: string; prazo: string }>({ responsavel: "", acao: "", prazo: proximoDiaUtil });
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
  const confirmado = ["profissional", "registros"].includes(plan.confirmacao ?? "");
  const pedePendencia = precisaPendencia(plan, confirmado);
  // Sugestão de quem cuida: confirmar/conferir é da Gabi; negociar é da Mel.
  const respPadrao: ResponsavelPlanejamento = plan.resposta === "nao_confirmado" || (plan.resultado === "fechado" && !confirmado) ? "gabi" : "comercial_externa";
  const responsavel = pend.responsavel || respPadrao;

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setFalha(null);
    const entrada = { pacienteId, nomeNovo: modoNovo ? busca : "", plan, pendencia: pedePendencia ? { responsavel, acao: pend.acao || acaoSugerida(plan), prazo: pend.prazo } : null };
    const lista = validarPresencial(entrada, hoje);
    if (!pacienteId && !modoNovo && busca.trim()) lista.unshift(["paciente", "Escolha a paciente na lista ou marque “ainda não cadastrada”."]);
    setErros(Object.fromEntries([...lista].reverse()));
    if (lista.length) return document.getElementById(idc(lista[0]![0]))?.focus();
    setSalvando(true);
    const r = await chamarApi("/api/fila/registro", "POST", registroPresencial({ ...entrada, eventoId }, usuarioId, hoje));
    setSalvando(false);
    if (!r.ok) return setFalha({ erro: r.incerto ? `${r.erro} Pode salvar de novo: não duplica.` : `Não conseguimos salvar: ${r.erro}`, status: r.status });
    setUltimo(nomeEscolhido ?? busca.trim());
    setPlan(vazio); setBusca(""); setPacienteId(null); setModoNovo(false); setErros({});
    setPend({ responsavel: "", acao: "", prazo: proximoDiaUtil });
    setEventoId(crypto.randomUUID());
    onSalvo();
  }

  const erro = (k: string) => (erros[k] ? <span id={`${idc(k)}-erro`} className="font-normal text-critical">{erros[k]}</span> : null);
  const inv = (k: string) => (erros[k] ? { "aria-invalid": true as const, "aria-describedby": `${idc(k)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-3 rounded-control border border-border-strong bg-surface-raised p-3" aria-label="Registrar planejamento anual de uma paciente">
      {ultimo && <p role="status" className="text-[13px] text-opportunity">✓ {ultimo} registrada. Pode registrar a próxima.</p>}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Paciente atendida *</span>
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
                <input type="checkbox" checked={modoNovo} onChange={(e) => setModoNovo(e.target.checked)} /> Ainda não cadastrada: identificar como “{busca.trim()}”
              </label>
            )}
          </>
        )}
        {erro("paciente")}
      </div>
      <CamposPlanejamento canal="presencial" valor={plan} onChange={setPlan} erros={erros} idc={idc} hoje={hoje} />
      {pedePendencia && (
        <div className="grid gap-3 sm:grid-cols-[170px_minmax(0,1fr)_160px]">
          <Campo label="Responsável">
            <select value={responsavel} onChange={(e) => setPend({ ...pend, responsavel: e.target.value as ResponsavelPlanejamento })} className={classeInput}>
              {RESPONSAVEIS_PLANEJAMENTO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
          <Campo label="Próxima ação *"><input id={idc("acao")} value={pend.acao} onChange={(e) => setPend({ ...pend, acao: e.target.value })} placeholder={acaoSugerida(plan)} {...inv("acao")} />{erro("acao")}</Campo>
          <Campo label="Prazo *"><input id={idc("prazo")} type="date" min={hoje} value={pend.prazo} onChange={(e) => setPend({ ...pend, prazo: e.target.value })} {...inv("prazo")} />{erro("prazo")}</Campo>
          <p className="text-[12.5px] text-text-muted sm:col-span-3">Proposta já em aberto para esta paciente é atualizada — não nasce outra. Em branco, a próxima ação fica como sugerida.</p>
        </div>
      )}
      {falha && <ErroAcao erro={falha.erro} status={falha.status} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar</Button>
        <Button type="button" variante="discreto" onClick={onFechar}>{ultimo ? "Concluir" : "Cancelar"}</Button>
      </div>
    </form>
  );
}
