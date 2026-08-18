"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PIPELINE_STAGES } from "@/lib/pipeline/board";
import type { PipelineStage } from "@/lib/rules/types";

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

export interface MoveStageTarget {
  patientId: string;
  patientName: string;
  fromStage: PipelineStage;
  toStage: PipelineStage;
}

export function MoveStageDialog({
  target,
  onClose,
  onSaved,
}: {
  target: MoveStageTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isSameStage = target.fromStage === target.toStage;
  const isLost = target.toStage === "lost";
  const stageLabel = PIPELINE_STAGES.find((s) => s.key === target.toStage)?.label ?? target.toStage;

  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDueAt, setNextActionDueAt] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [lossDetail, setLossDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isLost && !lossReason) {
      setError("Selecione o motivo da perda.");
      return;
    }
    if (!isLost && (!nextAction.trim() || !nextActionDueAt)) {
      setError("Próxima ação e data são obrigatórias (regra de ouro).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/pipeline/change-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: target.patientId,
          toStage: target.toStage,
          reason: reason || undefined,
          nextAction: isLost ? undefined : nextAction,
          nextActionDueAt: isLost ? undefined : new Date(nextActionDueAt).toISOString(),
          lossReason: isLost ? lossReason : undefined,
          lossDetail: isLost ? lossDetail || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError("Falha de rede — tente novamente.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-lg">
        <h2 className="font-serif text-lg text-text-primary">{target.patientName}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {isSameStage ? "Atualizar próxima ação" : `Mover para: ${stageLabel}`}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          {isLost ? (
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
                <Input
                  className="mt-1"
                  value={lossDetail}
                  onChange={(e) => setLossDetail(e.target.value)}
                  placeholder="Contexto adicional"
                />
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
                  placeholder="Ex.: Ligar para confirmar avaliação"
                  required
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Data da próxima ação *
                <Input
                  className="mt-1"
                  type="date"
                  value={nextActionDueAt}
                  onChange={(e) => setNextActionDueAt(e.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Motivo da mudança (opcional)
                <Input
                  className="mt-1"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: Respondeu no WhatsApp"
                />
              </label>
            </>
          )}

          {error && <p className="text-sm text-critical">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-4 py-2 text-sm text-text-secondary hover:bg-surface-raised"
            >
              Cancelar
            </button>
            <Button type="submit" loading={saving} loadingText="Salvando…">
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
