"use client";

import clsx from "clsx";
import {
  CONFIRMACOES_PRESENCIAL, MOTIVOS_NAO_APRESENTADO, RESPOSTAS_PLANEJAMENTO, RESULTADOS_PLANEJAMENTO,
  type Canal, type EntradaPlanejamento, type RespostaPlanejamento, type ResultadoPlanejamento,
} from "@/lib/fila/planejamento";
import { Campo, classeInput } from "./comum";

/**
 * Campos do planejamento anual, iguais no presencial e no WhatsApp (condicionais: só aparece o que a
 * resposta pede; nada financeiro sem fechamento; motivo nunca obrigatório quando ainda não se sabe).
 */
interface Props {
  canal: Canal;
  valor: EntradaPlanejamento;
  onChange: (v: EntradaPlanejamento) => void;
  erros: Record<string, string>;
  idc: (campo: string) => string;
  hoje: string;
  /** No WhatsApp a pergunta é opcional (nem toda conversa trata de planejamento). */
  opcional?: boolean;
}

export function CamposPlanejamento({ canal, valor: p, onChange, erros, idc, hoje, opcional }: Props) {
  const set = <K extends keyof EntradaPlanejamento>(k: K, v: EntradaPlanejamento[K]) => onChange({ ...p, [k]: v });
  const fech = (k: keyof NonNullable<EntradaPlanejamento["fechamento"]>, v: string) => onChange({ ...p, fechamento: { ...p.fechamento, [k]: v } });
  const erro = (k: string) => (erros[k] ? <span id={`${idc(k)}-erro`} className="text-[12.5px] font-normal text-critical">{erros[k]}</span> : null);
  const inv = (k: string) => (erros[k] ? { "aria-invalid": true as const, "aria-describedby": `${idc(k)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });
  const chips = <T extends string>(lista: readonly (readonly [T, string])[], atual: string | undefined, escolher: (v: T) => void, id: string, rotulo: string) => (
    <div id={idc(id)} tabIndex={-1} role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {lista.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={atual === k} onClick={() => escolher(k)}
          className={clsx("min-h-9 rounded-control border px-2.5 text-[12.5px]", atual === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border-strong bg-surface text-text-secondary hover:bg-surface-hover")}>
          {atual === k && <span aria-hidden>✓ </span>}{l}
        </button>
      ))}
    </div>
  );

  return (
    <fieldset className="flex flex-col gap-3 rounded-control border border-border bg-surface p-2.5">
      <legend className="px-1 text-[12.5px] font-medium text-text-secondary">
        {canal === "presencial" ? "Foi apresentado algum planejamento anual para a paciente? *" : `Foi apresentado algum planejamento anual durante a conversa comercial?${opcional ? "" : " *"}`}
      </legend>
      {chips(RESPOSTAS_PLANEJAMENTO, p.resposta, (v: RespostaPlanejamento) => onChange({ ...p, resposta: p.resposta === v && opcional ? "" : v }), "planResposta", "Planejamento anual apresentado")}
      {erro("planResposta")}

      {p.resposta === "sim" && (
        <>
          <Campo label="Resultado *">
            <select id={idc("planResultado")} value={p.resultado ?? ""} onChange={(e) => set("resultado", e.target.value as ResultadoPlanejamento)} {...inv("planResultado")}>
              <option value="">Escolha…</option>
              {RESULTADOS_PLANEJAMENTO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {erro("planResultado")}
          </Campo>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label={canal === "presencial" ? "Profissional responsável *" : "Responsável pela conversa"}>
              <input id={idc("planResponsavel")} value={p.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value)} placeholder={canal === "presencial" ? "ex.: Dra. Larissa" : "Mel"} {...inv("planResponsavel")} />
              {erro("planResponsavel")}
            </Campo>
            <Campo label="Planejamento (se souber)"><input value={p.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)} className={classeInput} placeholder="ex.: planejamento facial anual" /></Campo>
            <Campo label="Data da apresentação"><input id={idc("planData")} type="date" max={hoje} value={p.data ?? ""} onChange={(e) => set("data", e.target.value)} {...inv("planData")} />{erro("planData")}</Campo>
          </div>
          {canal === "presencial" && (
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-medium text-text-secondary">Como você confirmou? *</legend>
              {chips(CONFIRMACOES_PRESENCIAL, p.confirmacao, (v) => set("confirmacao", v), "planConfirmacao", "Como você confirmou")}
              {erro("planConfirmacao")}
              {p.confirmacao === "informado" && <p className="mt-1 text-[12.5px] text-important">Fica como “pendente de conferência” até você confirmar com o profissional ou nos registros.</p>}
            </fieldset>
          )}
          {p.resultado === "fechado" && (
            <div className="grid gap-3 rounded-control border border-border bg-surface-raised p-2.5 sm:grid-cols-2">
              <p className="text-[12.5px] text-text-muted sm:col-span-2">Só conta como fechamento quando conferido em fonte oficial. O valor contratado não entra nos recebimentos do dia.</p>
              <Campo label="Data do fechamento"><input id={idc("planFechData")} type="date" max={hoje} value={p.fechamento?.data ?? ""} onChange={(e) => fech("data", e.target.value)} {...inv("planFechData")} />{erro("planFechData")}</Campo>
              <Campo label="Valor (se conhecido e confirmado)"><input id={idc("planValor")} inputMode="decimal" value={p.fechamento?.valor ?? ""} onChange={(e) => fech("valor", e.target.value)} placeholder="ex.: 4.800,00" {...inv("planValor")} />{erro("planValor")}</Campo>
              <Campo label="Responsável pela venda"><input value={p.fechamento?.vendedor ?? ""} onChange={(e) => fech("vendedor", e.target.value)} className={classeInput} /></Campo>
              <Campo label="Referência do registro (se houver)"><input value={p.fechamento?.referencia ?? ""} onChange={(e) => fech("referencia", e.target.value)} className={classeInput} placeholder="ex.: orçamento nº no Simples Dental" /></Campo>
            </div>
          )}
          {p.resultado === "sem_interesse" && (
            <div className="flex flex-col gap-2">
              <Campo label="Motivo (se conhecido)"><input value={p.motivoRecusa ?? ""} onChange={(e) => set("motivoRecusa", e.target.value)} className={classeInput} /></Campo>
              <label className="flex items-center gap-2 text-[13px] text-text-primary"><input type="checkbox" checked={!!p.naoContatar} onChange={(e) => set("naoContatar", e.target.checked)} /> Pediu para não receber novos contatos sobre isso</label>
            </div>
          )}
          <Campo label="Observação (objetiva)"><input value={p.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} className={classeInput} /></Campo>
          <label className="flex items-center gap-2 text-[12.5px] text-text-secondary"><input type="checkbox" checked={!!p.outra} onChange={(e) => set("outra", e.target.checked)} /> É uma proposta diferente de outra já em aberto para esta paciente</label>
        </>
      )}
      {p.resposta === "nao" && (
        <Campo label="Motivo (se conhecido)">
          <select value={p.motivoNao ?? ""} onChange={(e) => set("motivoNao", e.target.value)} className={classeInput}>
            <option value="">Não sei / não informar</option>
            {MOTIVOS_NAO_APRESENTADO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
      )}
      {p.resposta === "nao_confirmado" && (
        <Campo label="O que precisa ser esclarecido com o profissional">
          <input value={p.esclarecer ?? ""} onChange={(e) => set("esclarecer", e.target.value)} className={classeInput} placeholder="ex.: perguntar à Dra. se apresentou o planejamento" />
        </Campo>
      )}
    </fieldset>
  );
}
