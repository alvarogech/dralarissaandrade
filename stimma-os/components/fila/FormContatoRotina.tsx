"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ROTULO_RESULTADO, camposDoResultado, registroDoContato, validarContato } from "@/lib/fila/contato-rotina";
import type { ItemRotina, ResultadoContato } from "@/lib/fila/rotina-itens";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr } from "./comum";

/**
 * Registro rápido de uma paciente numa atividade da rotina (aniversário, pós-procedimento, 30/60/90
 * dias, cobrança…). Paciente do cadastro (ou nome digitado, sem inventar identificador), resultado
 * em um toque e só os campos que o resultado pede. Cada paciente vira um registro do dia — o mesmo
 * que alimenta histórico, próxima ação e fechamento. Depois de salvar, o formulário fica pronto para
 * a próxima paciente (várias na mesma atividade, cada uma com o seu resultado).
 */
interface Props {
  item: ItemRotina;
  pacientes: { id: string; nome: string }[];
  usuarioId: string;
  hoje: string;
  proximoDiaUtil: string;
  /** Chamado depois de cada paciente gravada (com confirmação do servidor). */
  onSalvo: () => void;
  onFechar: () => void;
  /** Aviso no topo (ex.: "registre a paciente antes de concluir"). */
  aviso?: string;
}

interface Recente { dia: string; atividade: string; resultado: string; marco: string | null }

export function FormContatoRotina({ item, pacientes, usuarioId, hoje, proximoDiaUtil, onSalvo, onFechar, aviso }: Props) {
  const cfg = item.pacientes!;
  const uid = useId();
  const idc = (c: string) => `${uid}-${c}`;
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [modoNovo, setModoNovo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoContato | null>(cfg.resultados.length === 1 ? cfg.resultados[0]! : null);
  const [observacao, setObservacao] = useState("");
  const [proxima, setProxima] = useState("");
  const [prazo, setPrazo] = useState(proximoDiaUtil);
  const [agendadoPara, setAgendadoPara] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [pedeJustificativa, setPedeJustificativa] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [recentes, setRecentes] = useState<Recente[] | null>(null);
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());

  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t.length < 2 ? [] : pacientes.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 6);
  }, [busca, pacientes]);
  const nomeEscolhido = pacienteId ? pacientes.find((p) => p.id === pacienteId)?.nome : null;
  const c = resultado ? camposDoResultado(resultado) : null;

  // Contatos recentes da paciente escolhida (ex.: cobrada na segunda; marco já feito).
  useEffect(() => {
    setRecentes(null);
    if (!pacienteId) return;
    let vivo = true;
    void chamarApi<{ contatos: Recente[] }>(`/api/fila/contatos-recentes?pacienteId=${pacienteId}`, "GET").then((r) => { if (vivo && r.ok) setRecentes(r.data.contatos); });
    return () => { vivo = false; };
  }, [pacienteId]);

  function escolherResultado(r: ResultadoContato) {
    setResultado(r);
    setErros({});
    const padrao = camposDoResultado(r).proximaPadrao;
    setProxima((p) => (p && !Object.values(ROTULO_RESULTADO).includes(p) ? p : padrao));
  }

  function limparParaProxima(nome: string) {
    setUltimo(nome);
    setBusca(""); setPacienteId(null); setNomeNovo(""); setModoNovo(false);
    setObservacao(""); setAgendadoPara(""); setPergunta(""); setJustificativa(""); setPedeJustificativa(false);
    if (cfg.resultados.length > 1) setResultado(null);
    setEventoId(crypto.randomUUID());
    setErros({});
  }

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setFalha(null);
    const entrada = {
      resultado: resultado ?? cfg.resultados[0]!, pacienteId, nomeNovo: modoNovo ? nomeNovo : "", observacao, proximaAcao: proxima, prazo, agendadoPara, pergunta,
      responsavel: `perfil:${usuarioId}`, justificativaRepeticao: pedeJustificativa ? justificativa : undefined,
    };
    const lista = validarContato(entrada, hoje);
    if (!resultado) lista.unshift(["resultado", "Escolha o resultado do contato."]);
    if (pedeJustificativa && !justificativa.trim()) lista.push(["justificativa", "Explique por que o contato se repete."]);
    setErros(Object.fromEntries([...lista].reverse()));
    if (lista.length) return document.getElementById(idc(lista[0]![0]))?.focus();
    setSalvando(true);
    const r = await chamarApi("/api/fila/registro", "POST", registroDoContato({ ...entrada, eventoId, item }));
    setSalvando(false);
    if (!r.ok) {
      // Marco já registrado para esta paciente: pede o motivo junto do campo, sem apagar nada.
      if (r.status === 409 && /já teve o acompanhamento/.test(r.erro)) {
        setPedeJustificativa(true);
        setErros({ justificativa: r.erro });
        setTimeout(() => document.getElementById(idc("justificativa"))?.focus(), 0);
        return;
      }
      setFalha({ erro: r.incerto ? `${r.erro} Pode salvar de novo: este registro não será duplicado.` : `Não conseguimos salvar: ${r.erro}`, status: r.status });
      return;
    }
    limparParaProxima(nomeEscolhido ?? nomeNovo.trim());
    onSalvo();
  }

  const erro = (k: string) => (erros[k] ? <span id={`${idc(k)}-erro`} className="font-normal text-critical">{erros[k]}</span> : null);
  const inv = (k: string) => (erros[k] ? { "aria-invalid": true as const, "aria-describedby": `${idc(k)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });

  return (
    <form onSubmit={salvar} noValidate className="mt-2 flex flex-col gap-3 rounded-control border border-border-strong bg-surface-raised p-3" aria-label={`Registrar paciente: ${item.texto}`}>
      {aviso && <p role="status" className="text-[13.5px] font-medium text-accent">{aviso}</p>}
      {ultimo && <p role="status" className="text-[13px] text-opportunity">✓ {ultimo} registrada. Pode registrar a próxima paciente.</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-text-secondary">Paciente *</span>
        {nomeEscolhido ? (
          <p className="text-[14.5px] text-text-primary">{nomeEscolhido} <button type="button" className="ml-1 text-[12.5px] text-text-muted underline" onClick={() => setPacienteId(null)}>trocar</button></p>
        ) : modoNovo ? (
          <div className="flex flex-wrap items-center gap-2">
            <input id={idc("paciente")} value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome completo, como no Simples Dental" {...inv("paciente")} />
            <button type="button" className="text-[12.5px] text-text-muted underline" onClick={() => setModoNovo(false)}>buscar no cadastro</button>
          </div>
        ) : (
          <div>
            <input id={idc("paciente")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome (mín. 2 letras)" {...inv("paciente")} />
            {candidatos.length > 0 && (
              <ul className="mt-1 rounded-control border border-border bg-surface">
                {candidatos.map((p) => <li key={p.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover" onClick={() => { setPacienteId(p.id); setBusca(""); }}>{p.nome}</button></li>)}
              </ul>
            )}
            <button type="button" className="mt-1 text-[12.5px] text-text-secondary underline underline-offset-4" onClick={() => { setModoNovo(true); setNomeNovo(busca); }}>
              {busca.trim().length >= 2 && !candidatos.length ? "Não encontrei: digitar o nome" : "Paciente não está no cadastro"}
            </button>
          </div>
        )}
        {erro("paciente")}
        {recentes && recentes.length > 0 && (
          <p className="text-[12.5px] text-important">Contato recente: {recentes.slice(0, 2).map((r) => `${dataBr(r.dia)} · ${r.atividade}${r.resultado ? ` (${r.resultado.toLowerCase()})` : ""}`).join(" · ")}</p>
        )}
      </div>

      {cfg.resultados.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Resultado *</legend>
          <div id={idc("resultado")} tabIndex={-1} role="radiogroup" aria-label="Resultado do contato" className="flex flex-wrap gap-1.5">
            {cfg.resultados.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={resultado === r} onClick={() => escolherResultado(r)}
                className={clsx("min-h-9 rounded-control border px-3 text-[13px] transition-colors", resultado === r ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
                {resultado === r && <span aria-hidden>✓ </span>}{ROTULO_RESULTADO[r]}
              </button>
            ))}
          </div>
          {erro("resultado")}
        </fieldset>
      )}

      {c?.agendamento && (
        <Campo label="Data da consulta *"><input id={idc("agendadoPara")} type="date" value={agendadoPara} onChange={(e) => setAgendadoPara(e.target.value)} {...inv("agendadoPara")} />{erro("agendadoPara")}</Campo>
      )}
      {c?.pergunta && (
        <Campo label="O que a gestão precisa decidir? *"><input id={idc("pergunta")} value={pergunta} onChange={(e) => setPergunta(e.target.value)} {...inv("pergunta")} placeholder="ex.: pode parcelar em 3x?" />{erro("pergunta")}</Campo>
      )}
      {(c?.continuidade || c?.pergunta) && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          {c?.continuidade && <Campo label="Próximo passo *"><input id={idc("proxima")} value={proxima} onChange={(e) => setProxima(e.target.value)} {...inv("proxima")} />{erro("proxima")}</Campo>}
          <Campo label={`${c?.rotuloData ?? "Quando"} *`}><input id={idc("prazo")} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...inv("prazo")} />{erro("prazo")}</Campo>
        </div>
      )}
      <Campo label={c?.observacaoObrigatoria ? "O que ficou resolvido? *" : "Observação (opcional)"}>
        <input id={idc("observacao")} value={observacao} onChange={(e) => setObservacao(e.target.value)} {...inv("observacao")} placeholder={cfg.cobranca ? "ex.: vai pagar na sexta" : "curta, sem dados clínicos"} />
        {erro("observacao")}
      </Campo>
      {pedeJustificativa && (
        <Campo label="Por que repetir este contato? *"><input id={idc("justificativa")} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} {...inv("justificativa")} />{erro("justificativa")}</Campo>
      )}
      {resultado && (c?.continuidade || c?.pergunta) && <p className="text-[12.5px] text-text-muted">O contato fica registrado e o próximo passo volta na data escolhida.</p>}
      {resultado === "promessa_pagamento" && <p className="text-[12.5px] text-text-muted">Promessa não é recebimento: o pagamento só conta quando confirmado no Simples Dental.</p>}

      {falha && <ErroAcao erro={falha.erro} status={falha.status} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar paciente</Button>
        <Button type="button" variante="discreto" onClick={onFechar}>{ultimo ? "Concluir" : "Cancelar"}</Button>
        <span className="text-[12px] text-text-muted">Nenhuma mensagem é enviada.</span>
      </div>
    </form>
  );
}
