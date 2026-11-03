"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ROTULO_RESULTADO, SITUACOES_CONTATO, camposDoResultado, escolhaEfetiva, registroDoContato, validarContato, type EntradaContato } from "@/lib/fila/contato-rotina";
import type { ItemRotina, ResultadoContato } from "@/lib/fila/rotina-itens";
import { Campo, ErroAcao, chamarApi, classeInput, dataBr } from "./comum";

/**
 * Registro rápido de uma paciente numa atividade da rotina. Duas perguntas, nesta ordem:
 * (A) o que aconteceu com o contato — respondeu, aguardando resposta, sem resposta ou não realizado —
 * e (B), só se ela respondeu, o desfecho. Sem resposta sempre deixa a próxima tentativa com data (o
 * servidor garante e reaproveita o retorno que já estiver aberto). No pós-procedimento, quando a
 * paciente responde, o relato dela é obrigatório; "necessita atenção do profissional" registra o
 * encaminhamento — a concierge não avalia sintomas. Depois de salvar, fica pronto para a próxima.
 */
interface Props {
  item: ItemRotina;
  pacientes: { id: string; nome: string }[];
  usuarioId: string;
  hoje: string;
  proximoDiaUtil: string;
  /** Data sugerida para a próxima tentativa, por tipo de atividade (regra de retorno). */
  prazoSugerido?: string;
  onSalvo: () => void;
  onFechar: () => void;
  aviso?: string;
}

interface Recente { dia: string; atividade: string; resultado: string; marco: string | null }

const agoraLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function FormContatoRotina({ item, pacientes, usuarioId, hoje, proximoDiaUtil, prazoSugerido, onSalvo, onFechar, aviso }: Props) {
  const cfg = item.pacientes!;
  const uid = useId();
  const idc = (c: string) => `${uid}-${c}`;
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [modoNovo, setModoNovo] = useState(false);
  const [situacao, setSituacao] = useState<ResultadoContato | null>(cfg.semTentativa && cfg.resultados.length === 1 ? cfg.resultados[0]! : null);
  const [desfecho, setDesfecho] = useState<ResultadoContato | null>(null);
  const [relato, setRelato] = useState("");
  const [comAtencao, setComAtencao] = useState(false);
  const [atencao, setAtencao] = useState({ profissional: "", motivo: "", em: agoraLocal(), estado: "aguardando_profissional" as "aguardando_profissional" | "profissional_orientou" });
  const [observacao, setObservacao] = useState("");
  const [proxima, setProxima] = useState("");
  const [prazo, setPrazo] = useState(prazoSugerido ?? proximoDiaUtil);
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
  const respondeu = situacao === "respondeu";
  const efetiva = situacao ? escolhaEfetiva({ resultado: situacao, desfecho, atencao: comAtencao ? atencao : null }) : null;
  const c = efetiva ? camposDoResultado(efetiva) : null;

  useEffect(() => {
    setRecentes(null);
    if (!pacienteId) return;
    let vivo = true;
    void chamarApi<{ contatos: Recente[] }>(`/api/fila/contatos-recentes?pacienteId=${pacienteId}`, "GET").then((r) => { if (vivo && r.ok) setRecentes(r.data.contatos); });
    return () => { vivo = false; };
  }, [pacienteId]);

  // A próxima ação sugerida acompanha a escolha (sem apagar o que a concierge escreveu).
  useEffect(() => {
    if (!c) return;
    setProxima((p) => (p && !Object.values(ROTULO_RESULTADO).includes(p) && !["Verificar se respondeu", "Tentar contato de novo", "Fazer o contato", "Acompanhar o retorno do profissional", "Contato da comercial externa", "Confirmar o pagamento no Simples Dental"].includes(p) ? p : c.proximaPadrao));
  }, [efetiva]); // eslint-disable-line react-hooks/exhaustive-deps

  function limparParaProxima(nome: string) {
    setUltimo(nome);
    setBusca(""); setPacienteId(null); setNomeNovo(""); setModoNovo(false);
    setObservacao(""); setRelato(""); setAgendadoPara(""); setPergunta(""); setJustificativa(""); setPedeJustificativa(false);
    setComAtencao(false); setAtencao({ profissional: "", motivo: "", em: agoraLocal(), estado: "aguardando_profissional" });
    if (!(cfg.semTentativa && cfg.resultados.length === 1)) setSituacao(null);
    setDesfecho(null);
    setEventoId(crypto.randomUUID());
    setErros({});
  }

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setFalha(null);
    const entrada: Omit<EntradaContato, "eventoId" | "item"> = {
      resultado: situacao ?? "respondeu", desfecho: respondeu ? desfecho : null, pacienteId, nomeNovo: modoNovo ? nomeNovo : "", observacao, relato,
      atencao: respondeu && comAtencao ? atencao : null, proximaAcao: proxima, prazo, agendadoPara, pergunta,
      responsavel: `perfil:${usuarioId}`, justificativaRepeticao: pedeJustificativa ? justificativa : undefined,
    };
    const lista = validarContato({ ...entrada, item }, hoje);
    if (!situacao) lista.unshift(["situacao", cfg.semTentativa ? "Escolha o resultado." : "Diga o que aconteceu com o contato."]);
    if (respondeu && !cfg.relato && !desfecho) lista.push(["desfecho", "Escolha o desfecho da conversa."]);
    if (pedeJustificativa && !justificativa.trim()) lista.push(["justificativa", "Explique por que o contato se repete."]);
    setErros(Object.fromEntries([...lista].reverse()));
    if (lista.length) return document.getElementById(idc(lista[0]![0]))?.focus();
    setSalvando(true);
    const r = await chamarApi("/api/fila/registro", "POST", registroDoContato({ ...entrada, eventoId, item }));
    setSalvando(false);
    if (!r.ok) {
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
  const chips = (opcoes: readonly ResultadoContato[], valor: ResultadoContato | null, escolher: (r: ResultadoContato) => void, id: string, rotulo: string) => (
    <div id={idc(id)} tabIndex={-1} role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {opcoes.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={valor === r} onClick={() => { escolher(r); setErros({}); }}
          className={clsx("min-h-9 rounded-control border px-3 text-[13px] transition-colors", valor === r ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
          {valor === r && <span aria-hidden>✓ </span>}{ROTULO_RESULTADO[r]}
        </button>
      ))}
    </div>
  );

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

      {cfg.semTentativa ? (
        cfg.resultados.length > 1 && (
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Resultado *</legend>
            {chips(cfg.resultados, situacao, setSituacao, "situacao", "Resultado")}
            {erro("situacao")}
          </fieldset>
        )
      ) : (
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-text-secondary">O que aconteceu com o contato? *</legend>
          {chips(SITUACOES_CONTATO, situacao, (r) => { setSituacao(r); if (r !== "respondeu") { setDesfecho(null); setComAtencao(false); } }, "situacao", "Situação do contato")}
          {erro("situacao")}
        </fieldset>
      )}

      {respondeu && cfg.relato && (
        <Campo label={`${cfg.relato.rotulo} *`}>
          <span className="font-normal text-text-muted">{cfg.relato.ajuda}</span>
          <textarea id={idc("relato")} rows={3} value={relato} onChange={(e) => { setRelato(e.target.value); if (erros.relato && e.target.value.trim()) setErros(({ relato: _r, ...resto }) => resto); }} {...inv("relato")} />
          {erro("relato")}
        </Campo>
      )}
      {respondeu && cfg.atencaoProfissional && (
        <div className="flex flex-col gap-2 rounded-control border border-border bg-surface p-2.5">
          <label className="flex min-h-9 items-center gap-2 text-[14px] text-text-primary">
            <input type="checkbox" checked={comAtencao} onChange={(e) => setComAtencao(e.target.checked)} /> Necessita atenção do profissional?
          </label>
          {comAtencao && (
            <>
              <p role="note" className="rounded-control bg-critical-bg px-2.5 py-1.5 text-[12.5px] text-critical">Se houver qualquer sinal de urgência, acione agora o protocolo de atendimento da clínica — não espere um retorno programado. Aqui você registra o relato e o encaminhamento, sem avaliar.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo label="Profissional responsável *">
                  <input id={idc("profissional")} list={idc("profissionais")} value={atencao.profissional} onChange={(e) => setAtencao({ ...atencao, profissional: e.target.value })} {...inv("profissional")} />
                  <datalist id={idc("profissionais")}><option value="Dra. Larissa" /></datalist>
                  {erro("profissional")}
                </Campo>
                <Campo label="Encaminhado em"><input type="datetime-local" value={atencao.em} onChange={(e) => setAtencao({ ...atencao, em: e.target.value })} className={classeInput} /></Campo>
                <Campo label="Motivo do encaminhamento *" largo><input id={idc("motivo")} value={atencao.motivo} onChange={(e) => setAtencao({ ...atencao, motivo: e.target.value })} {...inv("motivo")} placeholder="o que a paciente relatou que precisa ser visto" />{erro("motivo")}</Campo>
                <Campo label="Estado do acompanhamento" largo>
                  <select value={atencao.estado} onChange={(e) => setAtencao({ ...atencao, estado: e.target.value as typeof atencao.estado })} className={classeInput}>
                    <option value="aguardando_profissional">Aguardando retorno do profissional (fica em acompanhamento)</option>
                    <option value="profissional_orientou">Profissional já orientou</option>
                  </select>
                </Campo>
              </div>
            </>
          )}
        </div>
      )}
      {respondeu && !(comAtencao && atencao.estado === "aguardando_profissional") && (
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Desfecho{cfg.relato ? " (se houver)" : " *"}</legend>
          {chips(cfg.resultados, desfecho, (r) => setDesfecho(desfecho === r && cfg.relato ? null : r), "desfecho", "Desfecho")}
          {erro("desfecho")}
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
      {situacao && (
        <Campo label={c?.observacaoObrigatoria && !(respondeu && cfg.relato) ? (efetiva === "nao_realizado" ? "Por que não foi feito? *" : efetiva === "orientacao" ? "Qual orientação foi dada? *" : "O que ficou resolvido? *") : "Observação (opcional)"}>
          <input id={idc("observacao")} value={observacao} onChange={(e) => setObservacao(e.target.value)} {...inv("observacao")} placeholder={cfg.cobranca ? "ex.: vai pagar na sexta" : "curta, sem dados clínicos"} />
          {erro("observacao")}
        </Campo>
      )}
      {pedeJustificativa && (
        <Campo label="Por que repetir este contato? *"><input id={idc("justificativa")} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} {...inv("justificativa")} />{erro("justificativa")}</Campo>
      )}
      {c?.continuidade && <p className="text-[12.5px] text-text-muted">A tentativa fica registrada e a próxima volta na data escolhida. Se já houver um retorno aberto desta paciente para o mesmo assunto, ele é reprogramado — não nasce outro.</p>}
      {efetiva === "promessa_pagamento" && <p className="text-[12.5px] text-text-muted">Promessa não é recebimento: o pagamento só conta quando confirmado no Simples Dental.</p>}

      {falha && <ErroAcao erro={falha.erro} status={falha.status} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={salvando} loadingText="Salvando…">Salvar paciente</Button>
        <Button type="button" variante="discreto" onClick={onFechar}>{ultimo ? "Concluir" : "Cancelar"}</Button>
        <span className="text-[12px] text-text-muted">Nenhuma mensagem é enviada.</span>
      </div>
    </form>
  );
}
