"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FupQueueItem } from "@/lib/pipeline/fup-queue";

const LOSS_REASONS: Array<{ value: string; label: string }> = [
  { value: "price", label: "Preço" },
  { value: "no_response", label: "Não respondeu" },
  { value: "gave_up", label: "Desistiu" },
  { value: "competitor", label: "Concorrente" },
  { value: "fear", label: "Medo" },
  { value: "timing", label: "Timing" },
  { value: "moved_city", label: "Mudou de cidade" },
  { value: "no_clinical_indication", label: "Não possui indicação clínica" },
  { value: "other", label: "Outro" },
];

/**
 * Modo FUP — uma paciente por vez, sem precisar vasculhar o board (prompt
 * mestre §90). Usa o mesmo POST /api/pipeline/change-stage já testado no
 * board: "resolver" é uma troca de estágio para o mesmo estágio (só define
 * next_action + data); "sem continuidade" move para 'lost' com motivo
 * estruturado. Ao salvar, a paciente sai da fila local e a próxima abre
 * imediatamente — sem recarregar a página inteira.
 */
export function FupQueueView({ initialQueue }: { initialQueue: FupQueueItem[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [showLossForm, setShowLossForm] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [nextActionDueAt, setNextActionDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [lossDetail, setLossDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current = queue[0];
  const total = initialQueue.length;
  const position = total - queue.length + 1;

  function resetForm() {
    setShowLossForm(false);
    setNextAction("");
    setNextActionDueAt("");
    setReason("");
    setLossReason("");
    setLossDetail("");
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError(null);

    if (showLossForm && !lossReason) {
      setError("Selecione o motivo da perda.");
      return;
    }
    if (!showLossForm && (!nextAction.trim() || !nextActionDueAt)) {
      setError("Próxima ação e data são obrigatórias (regra de ouro).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/pipeline/change-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: current.patientId,
          toStage: showLossForm ? "lost" : current.stage,
          reason: showLossForm ? undefined : reason || undefined,
          nextAction: showLossForm ? undefined : nextAction,
          nextActionDueAt: showLossForm ? undefined : new Date(nextActionDueAt).toISOString(),
          lossReason: showLossForm ? lossReason : undefined,
          lossDetail: showLossForm ? lossDetail || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        setSaving(false);
        return;
      }

      setQueue((q) => q.slice(1));
      resetForm();
      setSaving(false);
      router.refresh();
    } catch {
      setError("Falha de rede — tente novamente.");
      setSaving(false);
    }
  }

  if (!current) {
    return (
      <Card className="text-center">
        <p className="text-lg font-medium text-text-primary">Tudo em dia 🎉</p>
        <p className="mt-1 text-sm text-text-secondary">
          Nenhuma paciente sem próxima ação no momento.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-text-muted">
        Paciente {position} de {total}
      </p>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-xl text-text-primary">{current.fullName}</h2>
            <p className="text-sm text-text-secondary">{current.stageLabel}</p>
            {current.phone && <p className="text-sm text-text-muted">{current.phone}</p>}
          </div>
          <div className="flex flex-col gap-1">
            {current.hasOpenReceivable && <Badge variant="important">Débito em aberto</Badge>}
            {current.hasUpcomingAppointment && <Badge variant="opportunity">Agendamento futuro</Badge>}
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          {showLossForm ? (
            <>
              <label className="text-xs font-medium text-text-secondary">
                Motivo da perda *
                <select
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">Selecione...</option>
                  {LOSS_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Detalhe (opcional)
                <Input className="mt-1" value={lossDetail} onChange={(e) => setLossDetail(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="text-xs font-medium text-text-secondary">
                Próxima ação *
                <Input
                  className="mt-1"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Ex.: Ligar para confirmar retorno"
                  autoFocus
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Data da próxima ação *
                <Input
                  className="mt-1"
                  type="date"
                  value={nextActionDueAt}
                  onChange={(e) => setNextActionDueAt(e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Motivo (opcional)
                <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}

          {error && <p className="text-sm text-critical">{error}</p>}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLossForm((v) => !v)}
              className="text-sm text-text-muted underline-offset-2 hover:underline"
            >
              {showLossForm ? "Cancelar — definir próxima ação" : "Sem continuidade"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setQueue((q) => q.slice(1));
                  resetForm();
                }}
                className="rounded-sm px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised"
              >
                Pular por agora
              </button>
              <Button type="submit" loading={saving} loadingText="Salvando…">
                Salvar e próxima
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
