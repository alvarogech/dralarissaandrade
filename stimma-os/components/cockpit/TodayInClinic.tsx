import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Appointment } from "@/lib/rules/types";

const STATUS_LABEL: Record<Appointment["status"], string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "Falta",
  rescheduled: "Reagendado",
};

export function TodayInClinic({
  appointments,
  patientNameById,
}: {
  appointments: Appointment[];
  patientNameById: Map<string, string>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Hoje na clínica
      </h2>
      <Card>
        {appointments.length === 0 ? (
          <p className="text-sm text-text-secondary">Nenhum compromisso relevante hoje.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {appointments.map((appt) => (
              <li key={appt.id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {patientNameById.get(appt.patientId) ?? "Paciente"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {appt.reason} · {appt.professionalName}
                  </p>
                </div>
                <Badge variant={appt.status === "cancelled" ? "critical" : "neutral"}>
                  {STATUS_LABEL[appt.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
