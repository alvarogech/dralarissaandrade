import type { PatientCandidate, PatientMatchDecision } from "./types";

/**
 * Decide o que fazer com um paciente normalizado, dado os candidatos ja
 * encontrados no banco (por telefone e/ou nome exato). Pura — nao toca o
 * banco. A chamada real primeiro tenta casar por external_id
 * (patient_external_ids) fora desta funcao; isso aqui e o que sobra quando
 * nao ha external_id conhecido ainda.
 *
 * Principio (docs/SIMPLES_DENTAL_MAP.md / INTEGRATIONS.md): nunca depender
 * so de nome. Telefone com match unico e confiavel o bastante para usar
 * direto; nome sozinho, mesmo com match unico, vira requires_review — nunca
 * cria duplicata silenciosamente, mas tambem nunca vincula sem confirmacao.
 */
export function decidePatientMatch(
  input: { phone?: string; fullName: string },
  candidates: PatientCandidate[]
): PatientMatchDecision {
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;

  if (normalizedPhone) {
    const byPhone = candidates.filter((c) => c.phone && normalizePhone(c.phone) === normalizedPhone);
    if (byPhone.length === 1) {
      return { action: "use_existing", patientId: byPhone[0]!.id };
    }
    if (byPhone.length > 1) {
      return {
        action: "requires_review",
        reason: "Mais de um paciente cadastrado com o mesmo telefone.",
        candidateIds: byPhone.map((c) => c.id),
      };
    }
  }

  const normalizedName = normalizeName(input.fullName);
  const byName = candidates.filter((c) => normalizeName(c.fullName) === normalizedName);

  if (byName.length === 0) {
    return { action: "create" };
  }

  return {
    action: "requires_review",
    reason:
      byName.length === 1
        ? "Nome bate com um paciente existente, mas sem telefone/ID confirmando — não vincula automaticamente."
        : "Mais de um paciente existente com o mesmo nome.",
    candidateIds: byName.map((c) => c.id),
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
