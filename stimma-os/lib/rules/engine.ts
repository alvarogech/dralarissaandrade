import type {
  ClinicSnapshot,
  GeneratedAlert,
  GeneratedOpportunity,
  Appointment,
} from "./types";

/**
 * RuleEngine: 100% deterministico (datas, status, somas, matching). Nenhuma
 * chamada de IA aqui - ver docs/ARCHITECTURE.md ("determinístico vs. IA").
 *
 * Cobre o subconjunto P0 de docs/BUSINESS_RULES.md que e computavel a partir
 * do ClinicSnapshot atual (agenda + pacientes + financeiro + planos). Regras
 * que dependem de entidades ainda nao modeladas (tarefas, automation_runs,
 * consentimento de comunicacao, horarios vagos com candidatos) entram quando
 * essas entidades existirem no banco - ver docs/ROADMAP.md Fase 3+.
 */

const HOUR = 60 * 60 * 1000;

function hoursSince(now: Date, iso: string): number {
  return (now.getTime() - new Date(iso).getTime()) / HOUR;
}

function patientName(snapshot: ClinicSnapshot, patientId: string): string | null {
  return snapshot.patients.find((p) => p.id === patientId)?.fullName ?? null;
}

/** Regra 1 - pagamento nao localizado ate 60 min apos atendimento concluido. */
function ruleMissingPayment(snapshot: ClinicSnapshot, now: Date): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  for (const appt of snapshot.appointments) {
    if (appt.status !== "completed" || !appt.requiresPayment || !appt.completedAt) continue;
    if (hoursSince(now, appt.completedAt) < 1) continue;

    const hasPayment = snapshot.payments.some(
      (p) => p.appointmentId === appt.id && p.confirmedAt
    );
    if (hasPayment) continue;

    alerts.push({
      id: `missing-payment-${appt.id}`,
      ruleId: "financial_missing_payment",
      category: "financeiro",
      priority: "critical",
      patientId: appt.patientId,
      patientName: patientName(snapshot, appt.patientId),
      title: `Pagamento não localizado após atendimento de ${patientName(snapshot, appt.patientId) ?? "paciente"}`,
      recommendedAction: "Conferir lançamento financeiro do atendimento e confirmar recebimento.",
      assignedToRole: "financeiro",
      financialImpact: null,
      dueAt: null,
    });
  }
  return alerts;
}

/** Regra 2/10 - paciente ativo sem proxima etapa apos atendimento concluido (golden rule). */
function ruleNoNextStep(snapshot: ClinicSnapshot, now: Date): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  for (const appt of snapshot.appointments) {
    if (appt.status !== "completed" || !appt.completedAt) continue;
    const patient = snapshot.patients.find((p) => p.id === appt.patientId);
    if (!patient?.requiresContinuation) continue;

    const journey = snapshot.journeys.find((j) => j.patientId === appt.patientId);
    if (journey?.nextAction) continue;

    const hoursAgo = hoursSince(now, appt.completedAt);
    if (hoursAgo < 12) continue; // da tempo da equipe agendar antes de alertar

    alerts.push({
      id: `no-next-step-${appt.id}`,
      ruleId: "no_next_step",
      category: "jornada",
      priority: hoursAgo > 48 ? "critical" : "important",
      patientId: appt.patientId,
      patientName: patient.fullName,
      title: `${patient.fullName} está sem próxima etapa definida`,
      recommendedAction: "Definir e agendar o próximo passo (retorno, procedimento ou follow-up).",
      assignedToRole: "recepcao",
      financialImpact: null,
      dueAt: null,
    });
  }
  return alerts;
}

/** Regra 3 - avaliacao concluida sem plano aprovado e sem proxima acao em 48h. */
function ruleEvaluationNoContinuity(
  snapshot: ClinicSnapshot,
  now: Date
): GeneratedOpportunity[] {
  const opportunities: GeneratedOpportunity[] = [];
  for (const appt of snapshot.appointments) {
    if (appt.status !== "completed" || !appt.completedAt) continue;
    if (!/avalia/i.test(appt.reason)) continue;
    if (hoursSince(now, appt.completedAt) < 48) continue;

    const hasAcceptedPlan = snapshot.treatmentPlans.some(
      (tp) => tp.patientId === appt.patientId && tp.status === "accepted"
    );
    if (hasAcceptedPlan) continue;

    const journey = snapshot.journeys.find((j) => j.patientId === appt.patientId);
    if (journey?.nextAction) continue;

    const name = patientName(snapshot, appt.patientId) ?? "Paciente";
    opportunities.push({
      id: `evaluation-no-continuity-${appt.id}`,
      ruleId: "evaluation_no_continuity",
      type: "avaliacao_sem_fechamento",
      patientId: appt.patientId,
      patientName: name,
      title: `${name} avaliou e ainda não fechou plano`,
      estimatedValue: null,
      urgency: "alta",
    });
  }
  return opportunities;
}

/** Regra 6 - recebivel vencido. */
function ruleReceivableOverdue(snapshot: ClinicSnapshot, now: Date): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  for (const r of snapshot.receivables) {
    if (r.paidAt) continue;
    if (new Date(r.dueAt).getTime() > now.getTime()) continue;

    alerts.push({
      id: `receivable-overdue-${r.id}`,
      ruleId: "receivable_overdue",
      category: "financeiro",
      priority: "critical",
      patientId: r.patientId,
      patientName: patientName(snapshot, r.patientId),
      title: `Recebível vencido de ${patientName(snapshot, r.patientId) ?? "paciente"}`,
      recommendedAction: "Acionar cobrança conforme política da clínica.",
      assignedToRole: "financeiro",
      financialImpact: r.amount,
      dueAt: r.dueAt,
    });
  }
  return alerts;
}

/** Regra 7/8 - cancelamento: recuperacao do paciente e recuperacao do horario. */
function ruleCancellation(
  snapshot: ClinicSnapshot,
  now: Date
): { alerts: GeneratedAlert[]; opportunities: GeneratedOpportunity[] } {
  const alerts: GeneratedAlert[] = [];
  const opportunities: GeneratedOpportunity[] = [];

  for (const appt of snapshot.appointments) {
    if (appt.status !== "cancelled") continue;
    if (hoursSince(now, appt.startsAt) < 24 && new Date(appt.startsAt) > now) continue;

    const rescheduled = snapshot.appointments.some(
      (a) =>
        a.patientId === appt.patientId &&
        a.id !== appt.id &&
        a.status !== "cancelled" &&
        new Date(a.startsAt) > new Date(appt.startsAt)
    );

    const name = patientName(snapshot, appt.patientId) ?? "Paciente";
    if (!rescheduled) {
      opportunities.push({
        id: `cancellation-recovery-${appt.id}`,
        ruleId: "cancellation_patient_recovery",
        type: "recuperacao_paciente_cancelado",
        patientId: appt.patientId,
        patientName: name,
        title: `${name} cancelou e ainda não reagendou`,
        estimatedValue: null,
        urgency: "media",
      });
    }

    alerts.push({
      id: `schedule-gap-${appt.id}`,
      ruleId: "cancellation_schedule_gap",
      category: "agenda",
      priority: "opportunity",
      patientId: null,
      patientName: null,
      title: `Horário de ${new Date(appt.startsAt).toLocaleString("pt-BR")} ficou livre (cancelamento)`,
      recommendedAction: "Avaliar candidatos para preencher o horário (retorno pendente, antecipação, avaliação).",
      assignedToRole: "recepcao",
      financialImpact: null,
      dueAt: appt.startsAt,
    });
  }

  return { alerts, opportunities };
}

export interface RuleEngineResult {
  alerts: GeneratedAlert[];
  opportunities: GeneratedOpportunity[];
}

export function runRuleEngine(snapshot: ClinicSnapshot): RuleEngineResult {
  const now = new Date(snapshot.now);

  const alerts: GeneratedAlert[] = [
    ...ruleMissingPayment(snapshot, now),
    ...ruleNoNextStep(snapshot, now),
    ...ruleReceivableOverdue(snapshot, now),
  ];

  const opportunities: GeneratedOpportunity[] = [
    ...ruleEvaluationNoContinuity(snapshot, now),
  ];

  const cancellation = ruleCancellation(snapshot, now);
  alerts.push(...cancellation.alerts);
  opportunities.push(...cancellation.opportunities);

  return { alerts, opportunities };
}

const PRIORITY_WEIGHT: Record<GeneratedAlert["priority"], number> = {
  critical: 3,
  important: 2,
  opportunity: 1,
  informative: 0,
};

/** Ordena alertas por prioridade e depois por impacto financeiro (maior primeiro). */
export function sortAlertsByPriority(alerts: GeneratedAlert[]): GeneratedAlert[] {
  return [...alerts].sort((a, b) => {
    const byPriority = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (byPriority !== 0) return byPriority;
    return (b.financialImpact ?? 0) - (a.financialImpact ?? 0);
  });
}

/**
 * Gera as "3 prioridades do dia" combinando alertas e oportunidades por
 * impacto financeiro estimado, urgencia e prioridade - nunca por ordem
 * cronologica simples (requisito explicito do briefing).
 */
export function topPriorities(
  result: RuleEngineResult,
  limit = 3
): Array<{ title: string; action: string; score: number }> {
  const fromAlerts = result.alerts.map((a) => ({
    title: a.title,
    action: a.recommendedAction,
    score:
      PRIORITY_WEIGHT[a.priority] * 100 +
      (a.financialImpact ?? 0) / 100,
  }));

  const urgencyWeight = { alta: 3, media: 2, baixa: 1 } as const;
  const fromOpportunities = result.opportunities.map((o) => ({
    title: o.title,
    action: "Avaliar e acionar oportunidade.",
    score: urgencyWeight[o.urgency] * 80 + (o.estimatedValue ?? 0) / 100,
  }));

  return [...fromAlerts, ...fromOpportunities]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
