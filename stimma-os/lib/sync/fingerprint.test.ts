import { describe, expect, it } from "vitest";
import { computeAppointmentFingerprint } from "./fingerprint";
import type { NormalizedAppointment } from "./types";

function baseInput(overrides: Partial<NormalizedAppointment> = {}): NormalizedAppointment {
  return {
    source: "simples_dental_browser",
    patient: { fullName: "Fernanda Lima" },
    startsAt: "2026-08-17T18:00:00.000Z",
    endsAt: "2026-08-17T19:00:00.000Z",
    status: "confirmed",
    reason: "retorno",
    requiresPayment: false,
    ...overrides,
  };
}

describe("computeAppointmentFingerprint", () => {
  it("é estável para o mesmo conteúdo", () => {
    expect(computeAppointmentFingerprint(baseInput())).toBe(computeAppointmentFingerprint(baseInput()));
  });

  it("muda quando o status muda", () => {
    const a = computeAppointmentFingerprint(baseInput({ status: "confirmed" }));
    const b = computeAppointmentFingerprint(baseInput({ status: "completed" }));
    expect(a).not.toBe(b);
  });

  it("muda quando o horário muda", () => {
    const a = computeAppointmentFingerprint(baseInput());
    const b = computeAppointmentFingerprint(baseInput({ endsAt: "2026-08-17T19:30:00.000Z" }));
    expect(a).not.toBe(b);
  });

  it("ignora diferenças de maiúsculas/espaço no motivo", () => {
    const a = computeAppointmentFingerprint(baseInput({ reason: "Retorno" }));
    const b = computeAppointmentFingerprint(baseInput({ reason: "  retorno  " }));
    expect(a).toBe(b);
  });
});
