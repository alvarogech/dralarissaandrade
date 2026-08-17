import type { NormalizedAppointment } from "./types";

/**
 * Fingerprint deterministico do conteudo relevante de um compromisso.
 * Se dois pulls seguidos produzem o mesmo fingerprint, nada mudou na fonte
 * e o Sync Engine nao precisa gerar evento nem tocar o banco (ver
 * docs/ARCHITECTURE.md — Sync Engine / idempotencia).
 */
export function computeAppointmentFingerprint(input: NormalizedAppointment): string {
  const parts = [
    input.startsAt,
    input.endsAt,
    input.status,
    input.reason.trim().toLowerCase(),
    input.requiresPayment ? "1" : "0",
    input.patient.fullName.trim().toLowerCase(),
  ];
  return simpleHash(parts.join("|"));
}

/**
 * Hash simples e estavel (nao criptografico — nao precisa ser, so precisa
 * detectar mudanca de conteudo). Evita depender de crypto do Node para que
 * esta funcao rode igual no browser e no servidor.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
