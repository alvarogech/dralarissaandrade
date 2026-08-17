import type { ClinicSnapshot } from "@/lib/rules/types";

/**
 * Dados FICTÍCIOS para desenvolvimento e demonstração da interface sem um
 * banco Supabase conectado (ver docs/ROADMAP.md — Fase 2 opera sobre dados
 * seed antes do sync real do Simples Dental). Nenhum nome, valor ou dado
 * aqui corresponde a paciente real da clínica.
 */
export function buildDemoSnapshot(now: Date = new Date()): ClinicSnapshot {
  const iso = (hoursOffset: number) =>
    new Date(now.getTime() + hoursOffset * 60 * 60 * 1000).toISOString();

  return {
    now: now.toISOString(),
    patients: [
      { id: "demo-1", fullName: "Fernanda Lima (demo)", requiresContinuation: true },
      { id: "demo-2", fullName: "Rodrigo Alves (demo)", requiresContinuation: true },
      { id: "demo-3", fullName: "Beatriz Nunes (demo)", requiresContinuation: false },
      { id: "demo-4", fullName: "Camila Torres (demo)", requiresContinuation: true },
    ],
    journeys: [
      { patientId: "demo-1", stage: "execution_in_phases", nextAction: null, nextActionDueAt: null },
      {
        patientId: "demo-2",
        stage: "return_visit",
        nextAction: "Retorno em 30 dias",
        nextActionDueAt: iso(24 * 20),
      },
      { patientId: "demo-4", stage: "attended", nextAction: null, nextActionDueAt: null },
    ],
    appointments: [
      {
        id: "demo-appt-1",
        patientId: "demo-1",
        professionalName: "Dra. Larissa",
        startsAt: iso(-30),
        endsAt: iso(-29),
        status: "completed",
        reason: "Procedimento — preenchedores",
        requiresPayment: true,
        completedAt: iso(-29),
      },
      {
        id: "demo-appt-2",
        patientId: "demo-4",
        professionalName: "Dra. Larissa",
        startsAt: iso(-60),
        endsAt: iso(-59),
        status: "completed",
        reason: "Avaliação",
        requiresPayment: false,
        completedAt: iso(-59),
      },
      {
        id: "demo-appt-3",
        patientId: "demo-3",
        professionalName: "Dra. Larissa",
        startsAt: iso(-20),
        endsAt: iso(-19),
        status: "cancelled",
        reason: "Retorno",
        requiresPayment: false,
      },
      {
        id: "demo-appt-4",
        patientId: "demo-2",
        professionalName: "Dra. Larissa",
        startsAt: iso(2),
        endsAt: iso(3),
        status: "confirmed",
        reason: "Primeira consulta",
        requiresPayment: false,
      },
    ],
    payments: [],
    receivables: [
      {
        id: "demo-rec-1",
        patientId: "demo-3",
        amount: 850,
        dueAt: iso(-72),
        paidAt: null,
      },
    ],
    treatmentPlans: [],
  };
}
