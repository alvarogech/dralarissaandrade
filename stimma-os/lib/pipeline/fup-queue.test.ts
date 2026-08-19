import { describe, expect, it } from "vitest";
import { buildFupQueue } from "./fup-queue";
import type { Appointment, Patient, PatientJourney, Receivable } from "@/lib/rules/types";

const patients: Patient[] = [
  { id: "p1", fullName: "Ana", requiresContinuation: true, phone: "+5562900000001" },
  { id: "p2", fullName: "Bia", requiresContinuation: true, phone: null },
  { id: "p3", fullName: "Clara (em dia)", requiresContinuation: true, phone: null },
  { id: "p4", fullName: "Duda (perdida)", requiresContinuation: false, phone: null },
  { id: "p5", fullName: "Elis (sem jornada)", requiresContinuation: true, phone: null },
];

const journeys: PatientJourney[] = [
  { patientId: "p1", stage: "active_recurrence", nextAction: null, nextActionDueAt: null },
  { patientId: "p2", stage: "confirmed", nextAction: "Confirmar", nextActionDueAt: null },
  { patientId: "p3", stage: "return_visit", nextAction: "Ligar", nextActionDueAt: "2026-09-01T00:00:00.000Z" },
  { patientId: "p4", stage: "lost", nextAction: null, nextActionDueAt: null },
];

const receivables: Receivable[] = [
  { id: "r1", patientId: "p1", amount: 500, dueAt: "2026-08-01T00:00:00.000Z", paidAt: null },
];

const appointments: Appointment[] = [
  {
    id: "a1",
    patientId: "p2",
    professionalName: "Dra. Larissa",
    startsAt: "2026-08-20T14:00:00.000Z",
    endsAt: "2026-08-20T15:00:00.000Z",
    status: "confirmed",
    reason: "Avaliação",
    requiresPayment: false,
  },
];

describe("buildFupQueue", () => {
  it("inclui apenas pacientes com jornada, nao perdidas, e sem next_action completo", () => {
    const queue = buildFupQueue(patients, journeys, receivables, appointments);
    const ids = queue.map((q) => q.patientId);

    expect(ids).toContain("p1"); // sem next_action nem data
    expect(ids).toContain("p2"); // tem next_action mas sem data
    expect(ids).not.toContain("p3"); // em dia
    expect(ids).not.toContain("p4"); // perdida
    expect(ids).not.toContain("p5"); // sem jornada -- outra violacao, nao entra aqui
  });

  it("preenche contexto observavel (recebivel em aberto, agendamento futuro) sem inventar nada", () => {
    const queue = buildFupQueue(patients, journeys, receivables, appointments);
    const ana = queue.find((q) => q.patientId === "p1")!;
    const bia = queue.find((q) => q.patientId === "p2")!;

    expect(ana.hasOpenReceivable).toBe(true);
    expect(ana.hasUpcomingAppointment).toBe(false);
    expect(bia.hasUpcomingAppointment).toBe(true);
    expect(bia.hasOpenReceivable).toBe(false);
  });

  it("ordena pela posicao do estagio no funil", () => {
    const queue = buildFupQueue(patients, journeys, receivables, appointments);
    // confirmed (indice 7) vem antes de active_recurrence (indice 15)
    expect(queue.map((q) => q.patientId)).toEqual(["p2", "p1"]);
  });
});
