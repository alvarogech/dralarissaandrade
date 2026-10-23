"use client";

import { useState } from "react";
import clsx from "clsx";

/**
 * Chamada às rotas da fila: erro do servidor sempre vira mensagem visível (nunca sucesso falso).
 * "Nada foi salvo" só aparece quando o servidor afirma isso. Se a resposta não chega (504, queda de
 * rede), o resultado é INCERTO — `incerto: true` — e a tela deve consultar o que foi gravado antes
 * de sugerir repetir (os registros usam id do cliente, então repetir o mesmo envio não duplica).
 */
export async function chamarApi<T>(url: string, method: "GET" | "POST" | "PATCH" = "POST", body?: unknown): Promise<{ ok: true; data: T } | { ok: false; erro: string; incerto?: boolean; status?: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (j as { error?: string } | null)?.error;
      if (msg) return { ok: false, erro: msg, status: res.status };
      return { ok: false, incerto: true, status: res.status, erro: `A resposta do servidor não chegou (falha ${res.status}). O resultado é incerto: confira o que foi salvo antes de repetir.` };
    }
    return { ok: true, data: (j ?? {}) as T };
  } catch {
    return { ok: false, incerto: true, erro: "Sem conexão com o servidor. Se o envio chegou a sair, pode ter sido salvo: confira antes de repetir." };
  }
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
export const numeroBr = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export const ROTULO_TIPO: Record<string, string> = {
  marco: "Marco", cobranca: "Cobrança", recuperacao_falta: "Falta/cancelamento", continuidade: "Continuidade", relacionamento: "Relacionamento",
  encaminhamento: "Encaminhamento", conferir_atendimento: "Conferir", outro: "Outro", atendimento_realizado: "Atendimento realizado",
  agenda: "Agenda", oportunidade: "Oportunidade", recorrencia: "Recorrência", pos_atendimento: "Pós-atendimento", pendencia: "Pendência",
};

export function Campo({ label, largo, children }: { label: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <label className={clsx("flex flex-col gap-1 text-xs text-text-secondary", largo && "sm:col-span-2")}>
      {label}
      {children}
    </label>
  );
}

export const classeInput = "w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";

const ROTULO_EVENTO: Record<string, string> = {
  contato: "Contato", resposta: "Resposta", agendamento_obtido: "Agendamento", cancelamento: "Faltou", recebimento_confirmado: "Recebimento",
  atendimento_realizado: "Compareceu", adiamento: "Adiamento", encerramento: "Encerramento", encaminhamento: "Encaminhamento", correcao: "Ajuste da gestão",
  registro: "Registro de execução", nota: "Mensagem",
};
export const ROTULO_NOTA: Record<string, string> = {
  orientacao: "Orientação", pergunta: "Pergunta ou impedimento", resposta_gestao: "Resposta da gestão", decisao: "Decisão",
};

export interface EventoHist {
  id: string;
  kind: string;
  occurredOn: string;
  notes: string | null;
  autor: string;
  registradoEm?: string;
  situacao?: string | null;
  payload?: Record<string, unknown>;
}

export const horaBr = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

export function rotuloEvento(e: EventoHist): string {
  if (e.kind === "nota") return ROTULO_NOTA[String(e.payload?.tipo ?? "")] ?? "Mensagem";
  return ROTULO_EVENTO[e.kind] ?? e.kind;
}

/** Histórico de um item, carregado sob demanda. */
export function Historico({ tipo, id }: { tipo: "tarefa" | "marco"; id: string }) {
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<EventoHist[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(!aberto);
    if (eventos || aberto) return;
    const r = await chamarApi<{ eventos: EventoHist[] }>(`/api/fila/historico?tipo=${tipo}&id=${id}`, "GET");
    if (r.ok) setEventos(r.data.eventos);
    else setErro(r.erro);
  }

  return (
    <div className="text-xs">
      <button type="button" onClick={abrir} className="text-text-muted underline">{aberto ? "Ocultar histórico" : "Histórico"}</button>
      {aberto && (
        <div className="mt-1 rounded-sm border border-border p-2">
          {erro && <p className="text-critical">{erro}</p>}
          {!erro && !eventos && <p className="text-text-muted">Carregando…</p>}
          {eventos && !eventos.length && <p className="text-text-muted">Nenhum registro ainda.</p>}
          {eventos?.map((e) => (
            <p key={e.id} className="text-text-secondary">
              <span className="text-text-muted">{e.registradoEm ? horaBr(e.registradoEm) : dataBr(e.occurredOn)}</span> · <strong>{rotuloEvento(e)}</strong> · {e.autor}
              {e.notes ? ` — ${e.notes}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
