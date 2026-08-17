# Automações — STIMMA OS

## Pós-atendimento automático (`appointment.completed`)

Sequência executada automaticamente (Nível A/B) sempre que o Sync Engine confirma um
atendimento concluído:

```text
CheckPayment → CheckNextAppointment → CheckOpenTreatment → CheckTreatmentPlan →
CheckCommercialFollowUp → CheckReturnAlert → UpdatePatientJourney → CalculatePatientValue →
CreateNecessaryTasks → GenerateNecessaryAlerts
```

Cada `Check*` é uma função determinística do `RuleEngine` (ver `BUSINESS_RULES.md`, regras
1–3, 5, 16), não uma chamada de IA.

## Pré-atendimento inteligente

N horas antes de um atendimento relevante da Dra. Larissa, gera um briefing curto: última
consulta, plano em andamento, próxima etapa prevista, status do último pagamento, pendência
administrativa — nunca informação clínica desnecessária.

## STIMMA BRIEF / STIMMA CLOSE / STIMMA WEEKLY / BUSINESS REVIEW

- **BRIEF** (manhã): pacientes do dia, avaliações, faturamento previsto, horários livres,
  pendências de ontem, recebíveis vencidos, carga da equipe, 3 prioridades do dia.
- **CLOSE** (fim do dia): previstos vs. atendidos, faltas, cancelamentos, avaliações, planos,
  faturamento, recebido, divergências, próximos passos, oportunidades, tarefas pendentes — e a
  pergunta final: "o que ficou para amanhã?".
- **WEEKLY**: análise causa → impacto → recomendação, não só números.
- **BUSINESS REVIEW** (mensal): funil completo + 5 decisões mais importantes para o mês
  seguinte.

Todos gerados por composição de dados determinísticos (Rule/Alert/Opportunity Engine) +
sumarização por IA (STIMMA AI) — nunca o inverso.

## STIMMA AI — ferramentas internas (tool use)

```text
getTodayAppointments · getPatient · getPatientJourney · getOpenOpportunities ·
getFinancialSummary · getOverdueReceivables · getScheduleGaps · getPendingTasks ·
getStaffWorkload · getBusinessMetrics · searchPatients · createTask · createOpportunity ·
prepareFinancialAction
```

Sem SQL arbitrário exposto ao modelo (ver `SECURITY.md`). `prepareFinancialAction` só prepara;
execução é sempre Nível C.

## Lançamento de pagamento assistido (visão futura — Fase 5)

```text
pagamento_detectado → dados_interpretados → lançamento_preparado → validação →
aprovação (Nível C) → Chrome/Cowork executa no Simples Dental → Claude confere → STIMMA OS
registra sucesso
```

Nunca `EXECUTE → ASSUME SUCCESS` (ver `SECURITY.md`).
