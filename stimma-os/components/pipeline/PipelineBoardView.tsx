"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StageColumn } from "./StageColumn";
import { MoveStageDialog, type MoveStageTarget } from "./MoveStageDialog";
import { PIPELINE_STAGES, type PipelineBoard, type PipelineCard } from "@/lib/pipeline/board";
import type { PipelineStage } from "@/lib/rules/types";

/**
 * Orquestra o board: arrastar um card para outra coluna (drag-and-drop
 * nativo, sem dependência nova) abre o MoveStageDialog — a mudança de
 * estágio só é aplicada depois que a Gabi preenche próxima ação + data (ou
 * motivo de perda), nunca direto no drop (regra de ouro reforçada na UI, não
 * só alertada depois — ver docs/CRM_RULES.md).
 */
export function PipelineBoardView({ board }: { board: PipelineBoard }) {
  const router = useRouter();
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [draggingPatientId, setDraggingPatientId] = useState<string | null>(null);
  const [target, setTarget] = useState<MoveStageTarget | null>(null);

  function findCard(patientId: string): { card: PipelineCard; stage: PipelineStage } | null {
    for (const stage of PIPELINE_STAGES) {
      const card = board[stage.key].find((c) => c.patientId === patientId);
      if (card) return { card, stage: stage.key };
    }
    return null;
  }

  function handleDrop(toStage: PipelineStage) {
    setDragOverStage(null);
    if (!draggingPatientId) return;

    const found = findCard(draggingPatientId);
    setDraggingPatientId(null);
    if (!found) return;

    if (found.stage === toStage) return; // solto na mesma coluna, nada a fazer

    setTarget({
      patientId: found.card.patientId,
      patientName: found.card.fullName,
      fromStage: found.stage,
      toStage,
    });
  }

  function handleCardClick(card: PipelineCard) {
    setTarget({
      patientId: card.patientId,
      patientName: card.fullName,
      fromStage: card.stage,
      toStage: card.stage,
    });
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <StageColumn
            key={stage.key}
            stage={stage.key}
            label={stage.label}
            cards={board[stage.key]}
            isDropTarget={dragOverStage === stage.key}
            onDragOver={setDragOverStage}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={handleDrop}
            onDragStartCard={setDraggingPatientId}
            onCardClick={handleCardClick}
          />
        ))}
      </div>

      {target && (
        <MoveStageDialog
          target={target}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
