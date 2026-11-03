"use client";

import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Campo, ErroAcao, chamarApi, classeInput } from "./comum";

/**
 * Ocorrência da conferência da agenda (encaixe, cancelamento, confirmação pendente, preparação…).
 * Só existe quando algo relevante aconteceu — conferência sem ocorrência é só "Feito". Paciente é
 * opcional; o que foi feito (providência) é obrigatório. Ficou pendente (inclusive à espera de um
 * profissional)? Vira uma próxima ação com data, acompanhada até resolver. Confirmação pendente
 * nunca tem nova tentativa depois da consulta (o servidor confere).
 */
export const TIPOS_OCORRENCIA = [
  ["confirmacao", "Confirmação pendente"],
  ["preparacao", "Procedimento, material ou preparação"],
  ["encaixe", "Encaixe"],
  ["cancelamento", "Cancelamento"],
  ["remarcacao", "Remarcação"],
  ["atraso", "Atraso"],
  ["outro", "Outro"],
] as const;

export function FormOcorrenciaAgenda({ pacientes, usuarioId, hoje, proximoDiaUtil, onSalvo, onFechar }: {
  pacientes: { id: string; nome: string }[]; usuarioId: string; hoje: string; proximoDiaUtil: string; onSalvo: () => void; onFechar: () => void;
}) {
  const uid = useId();
  const idc = (c: string) => `${uid}-${c}`;
  const [tipo, setTipo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [modoNovo, setModoNovo] = useState(false);
  const [dataConsulta, setDataConsulta] = useState("");
  const [profissional, setProfissional] = useState("");
  const [providencia, setProvidencia] = useState("");
  const [pendente, setPendente] = useState(false);
  const [dependeProfissional, setDependeProfissional] = useState(false);
  const [proxima, setProxima] = useState("");
  const [prazo, setPrazo] = useState(proximoDiaUtil);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t.length < 2 ? [] : pacientes.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 6);
  }, [busca, pacientes]);
  const nomeEscolhido = pacienteId ? pacientes.find((p) => p.id === pacienteId)?.nome : null;
  const rotulo = TIPOS_OCORRENCIA.find(([k]) => k === tipo)?.[1] ?? "";

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setFalha(null);
    const e: [string, string][] = [];
    if (!tipo) e.push(["tipo", "Escolha o tipo da ocorrência."]);
    if (!pacienteId && !modoNovo && busca.trim()) e.push(["paciente", "Escolha a paciente na lista, use “não está no cadastro” ou apague o nome."]);
    if (!providencia.trim()) e.push(["providencia", "Diga o que foi feito (a providência adotada)."]);
    if (pendente && !proxima.trim()) e.push(["proxima", "Escreva o que ainda falta fazer."]);
    if (pendente && (!prazo || prazo < hoje)) e.push(["prazo", "Escolha a data (hoje ou depois)."]);
    if (pendente && tipo === "confirmacao" && dataConsulta && prazo > dataConsulta) e.push(["prazo", "A nova tentativa de confirmação precisa ser até a data da consulta."]);
    setErros(Object.fromEntries([...e].reverse()));
    if (e.length) return document.getElementById(idc(e[0]![0]))?.focus();
    setSalvando(true);
    const detalhes: Record<string, string> = { rotina_item: "agenda_hoje_amanha", tipo_ocorrencia: tipo, acao: `Ocorrência da agenda: ${rotulo}` };
    if (profissional.trim()) detalhes.profissional_comunicado = profissional.trim();
    if (dataConsulta) detalhes.data_consulta = dataConsulta;
    if (pendente && dependeProfissional) detalhes.depende_profissional = "sim";
    const r = await chamarApi("/api/fila/registro", "POST", {
      eventoId, alvos: [], categoria: "agenda",
      pacienteId: pacienteId || null, novoPaciente: !pacienteId && modoNovo && nomeNovo.trim() ? { nome: nomeNovo.trim() } : undefined,
      assunto: !pacienteId && !(modoNovo && nomeNovo.trim()) ? `Agenda — ${rotulo}` : undefined,
      contexto: "Agenda e alinhamento", contato: null, resposta: null,
      feito: `${rotulo}: ${providencia.trim()}${profissional.trim() ? ` (comunicado a ${profissional.trim()})` : ""}`,
      situacao: pendente ? "pendente" : "informativo",
      ...(pendente ? { proximaAcao: proxima.trim(), prazo, responsavel: `perfil:${usuarioId}` } : {}),
      detalhes,
    });
    setSalvando(false);
    if (!r.ok) return setFalha({ erro: r.incerto ? `${r.erro} Pode salvar de novo: não duplica.` : `Não conseguimos salvar: ${r.erro}`, status: r.status });
    setOk(true);
    setTipo(""); setBusca(""); setPacienteId(null); setNomeNovo(""); setModoNovo(false); setDataConsulta(""); setProfissional(""); setProvidencia(""); setPendente(false); setDependeProfissional(false); setProxima("");
    setEventoId(crypto.randomUUID());
    onSalvo();
  }

  const erro = (k: string) => (erros[k] ? <span id={`${idc(k)}-erro`} className="font-normal text-critical">{erros[k]}</span> : null);
  const inv = (k: string) => (erros[k] ? { "aria-invalid": true as const, "aria-describedby": `${idc(k)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });

  return (
    <form onSubmit={salvar} noValidate className="mt-2 grid gap-3 rounded-control border border-border-strong bg-surface-raised p-3 sm:grid-cols-2" aria-label="Registrar ocorrência da agenda">
      {ok && <p role="status" className="text-[13px] text-opportunity sm:col-span-2">✓ Ocorrência registrada. Pode registrar outra.</p>}
      <Campo label="Tipo da ocorrência *">
        <select id={idc("tipo")} value={tipo} onChange={(e) => setTipo(e.target.value)} {...inv("tipo")}>
          <option value="">Escolha…</option>
          {TIPOS_OCORRENCIA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {erro("tipo")}
      </Campo>
      <Campo label="Paciente (se for o caso)">
        {nomeEscolhido ? (
          <span className="text-[14px] text-text-primary">{nomeEscolhido} <button type="button" className="text-[12.5px] text-text-muted underline" onClick={() => setPacienteId(null)}>trocar</button></span>
        ) : (
          <>
            <input id={idc("paciente")} value={busca} onChange={(e) => { setBusca(e.target.value); setNomeNovo(e.target.value); setModoNovo(false); }} {...inv("paciente")} placeholder="Buscar pelo nome (opcional)" />
            {candidatos.length > 0 && (
              <ul className="rounded-control border border-border bg-surface">
                {candidatos.map((p) => <li key={p.id}><button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => { setPacienteId(p.id); setBusca(""); setNomeNovo(""); }}>{p.nome}</button></li>)}
              </ul>
            )}
            {busca.trim().length >= 2 && (
              <label className="flex items-center gap-1.5 text-[12.5px] font-normal text-text-secondary">
                <input type="checkbox" checked={modoNovo} onChange={(e) => setModoNovo(e.target.checked)} /> Não está no cadastro: usar “{busca.trim()}”
              </label>
            )}
            {erro("paciente")}
          </>
        )}
      </Campo>
      {tipo === "confirmacao" && <Campo label="Data da consulta"><input type="date" value={dataConsulta} onChange={(e) => setDataConsulta(e.target.value)} className={classeInput} /></Campo>}
      <Campo label="Profissional comunicado (se necessário)"><input value={profissional} onChange={(e) => setProfissional(e.target.value)} className={classeInput} placeholder="ex.: Dra. Larissa" /></Campo>
      <Campo label="Providência adotada *" largo>
        <input id={idc("providencia")} value={providencia} onChange={(e) => setProvidencia(e.target.value)} {...inv("providencia")} placeholder="ex.: avisei a Dra. sobre o encaixe das 15h e separei o material" />
        {erro("providencia")}
      </Campo>
      <label className="flex min-h-9 items-center gap-2 text-[14px] text-text-primary sm:col-span-2">
        <input type="checkbox" checked={pendente} onChange={(e) => setPendente(e.target.checked)} /> Ficou algo pendente?
      </label>
      {pendente && (
        <>
          <Campo label="O que falta fazer *"><input id={idc("proxima")} value={proxima} onChange={(e) => setProxima(e.target.value)} {...inv("proxima")} placeholder="ex.: confirmar com a paciente até as 17h" />{erro("proxima")}</Campo>
          <Campo label="Até quando *"><input id={idc("prazo")} type="date" min={hoje} max={tipo === "confirmacao" && dataConsulta ? dataConsulta : undefined} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...inv("prazo")} />{erro("prazo")}</Campo>
          <label className="flex min-h-9 items-center gap-2 text-[13.5px] text-text-secondary sm:col-span-2">
            <input type="checkbox" checked={dependeProfissional} onChange={(e) => setDependeProfissional(e.target.checked)} /> Depende da resposta do profissional
          </label>
        </>
      )}
      {falha && <div className="sm:col-span-2"><ErroAcao erro={falha.erro} status={falha.status} /></div>}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar ocorrência</Button>
        <Button type="button" variante="discreto" onClick={onFechar}>{ok ? "Concluir" : "Cancelar"}</Button>
      </div>
    </form>
  );
}
