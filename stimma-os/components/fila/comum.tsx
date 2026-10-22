"use client";

import { useState } from "react";
import clsx from "clsx";

/** Chamada às rotas da fila: erro do servidor sempre vira mensagem visível (nunca sucesso falso). */
export async function chamarApi<T>(url: string, method: "GET" | "POST" | "PATCH" = "POST", body?: unknown): Promise<{ ok: true; data: T } | { ok: false; erro: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: (j as { error?: string }).error ?? `Falha (${res.status}). Nada foi salvo.` };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Nada foi salvo." };
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
  marco: "Marco", cobranca: "Cobrança", recuperacao_falta: "Falta", continuidade: "Continuidade", relacionamento: "Relacionamento",
  encaminhamento: "Encaminhamento", conferir_atendimento: "Conferir", outro: "Outro", atendimento_realizado: "Atendimento realizado",
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
};

interface EventoHist {
  id: string;
  kind: string;
  occurredOn: string;
  notes: string | null;
  autor: string;
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
              <span className="text-text-muted">{dataBr(e.occurredOn)}</span> · <strong>{ROTULO_EVENTO[e.kind] ?? e.kind}</strong> · {e.autor}
              {e.notes ? ` — ${e.notes}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
