"use client";

import clsx from "clsx";
import { PatientCard } from "./PatientCard";
import type { PipelineCard } from "@/lib/pipeline/board";
import type { PipelineStage } from "@/lib/rules/types";

export function StageColumn({
  stage,
  label,
  cards,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartCard,
  onCardClick,
}: {
  stage: PipelineStage;
  label: string;
  cards: PipelineCard[];
  isDropTarget: boolean;
  onDragOver: (stage: PipelineStage) => void;
  onDragLeave: () => void;
  onDrop: (stage: PipelineStage) => void;
  onDragStartCard: (patientId: string) => void;
  onCardClick: (card: PipelineCard) => void;
}) {
  const missingCount = cards.filter((c) => c.missingNextAction).length;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(stage);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(stage);
      }}
      className={clsx(
        "flex w-64 shrink-0 flex-col rounded-md border bg-surface-raised/40 transition-colors",
        isDropTarget ? "border-accent bg-accent-soft/40" : "border-border"
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
        <span className="text-xs text-text-muted">
          {cards.length}
          {missingCount > 0 && <span className="text-critical"> · {missingCount} sem ação</span>}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2" style={{ minHeight: 80 }}>
        {cards.length === 0 && (
          <p className="px-1 py-2 text-xs text-text-muted">Nenhuma paciente aqui.</p>
        )}
        {cards.map((card) => (
          <PatientCard
            key={card.patientId}
            card={card}
            onDragStart={onDragStartCard}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>
    </div>
  );
}
