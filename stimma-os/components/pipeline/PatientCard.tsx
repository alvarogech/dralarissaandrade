"use client";

import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import type { PipelineCard } from "@/lib/pipeline/board";

const URGENCY_LABEL: Record<NonNullable<PipelineCard["dueUrgency"]>, string> = {
  atrasado: "Atrasado",
  hoje: "Hoje",
  amanha: "Amanhã",
  esta_semana: "Esta semana",
  futuro: "Agendado",
};

const URGENCY_VARIANT: Record<NonNullable<PipelineCard["dueUrgency"]>, "critical" | "important" | "opportunity" | "neutral"> = {
  atrasado: "critical",
  hoje: "important",
  amanha: "opportunity",
  esta_semana: "neutral",
  futuro: "neutral",
};

export function PatientCard({
  card,
  onDragStart,
  onClick,
}: {
  card: PipelineCard;
  onDragStart: (patientId: string) => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.patientId);
        onDragStart(card.patientId);
      }}
      onClick={onClick}
      className={clsx(
        "cursor-grab select-none rounded-sm border bg-surface p-3 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        card.missingNextAction ? "border-critical/40" : "border-border"
      )}
    >
      <p className="font-medium text-text-primary">{card.fullName}</p>

      {card.missingNextAction ? (
        <div className="mt-2">
          <Badge variant="critical">Sem próxima ação</Badge>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1">
          {card.dueUrgency && (
            <Badge variant={URGENCY_VARIANT[card.dueUrgency]}>{URGENCY_LABEL[card.dueUrgency]}</Badge>
          )}
          <p className="text-xs text-text-secondary">{card.nextAction}</p>
        </div>
      )}
    </div>
  );
}
