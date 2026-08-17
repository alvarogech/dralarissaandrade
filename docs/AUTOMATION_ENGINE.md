# Automation Engine — STIMMA OS CRM

Motor de eventos + automações configuráveis (não hardcoded) que conecta o `RuleEngine`
determinístico existente à jornada da paciente. Ver `DATABASE_SCHEMA.md#automation_rules` para o
schema e `AI_ARCHITECTURE.md` para onde a IA entra (só na composição da mensagem, nunca na
decisão de disparo).

## Princípio

`trigger_event` (o que aconteceu) + `condition` (jsonb — o que precisa ser verdade) + `delay` +
`action` + `assigned_role` + `message_template` = uma linha em `automation_rules`, ativável/
desativável sem deploy. O motor nunca decide *se* dispara com IA — isso é sempre determinístico
(mesmo princípio de `ARCHITECTURE.md`: determinístico vs. IA). A IA só entra na *composição* da
mensagem de nível 2 (relacionamento), nunca na decisão de nível 1 (operacional automático).

## Catálogo de eventos (`trigger_event`)

Estende o Event Store já existente (`patient_events`, `opportunity_events`, `task_events`,
`appointment_events`) com os eventos de CRM:

```text
lead.created · lead.first_response · motivation.identified · case.sent ·
evaluation.offered · evaluation.scheduled · payment.pending · payment.confirmed ·
appointment.confirmed · appointment.no_show · appointment.completed ·
plan.presented · plan.accepted · plan.rejected · plan.objection_logged ·
procedure.completed · followup.due · return.due · maintenance.due ·
annual_review.due · patient.inactive · patient.reactivated · satisfaction.recorded ·
referral.requested
```

Cada evento é emitido pelo mesmo padrão já usado (`*_events` tables com `type` + `payload jsonb`)
ou, quando o evento pertence diretamente à paciente, em `patient_events`. Nenhum evento novo é
inventado sem um gatilho real (uma escrita de estado que já acontece na aplicação) — o motor não
"finge" eventos.

## Fluxo de execução de uma regra

```text
evento emitido → motor busca automation_rules ativas com trigger_event correspondente →
avalia condition (função pura, mesmo estilo do RuleEngine) → se verdadeiro, agenda action após
delay_minutes → action roda (create_task | create_alert | send_message_l1 | suggest_message_l2) →
grava automation_runs + audit_logs (actor_type='system') → se send_message_l1, chama
WhatsAppProvider.sendText diretamente; se suggest_message_l2, cria uma Task com o rascunho da IA
anexado, nunca envia sozinho.
```

Nível 3 (clínico) nunca é uma `action` de automação — é sempre uma tarefa atribuída a Larissa.

## Automações prioritárias do MVP (mapeadas para o catálogo acima)

| # | `key` | Trigger | Condição | Ação | Nível |
|---|-------|---------|----------|------|-------|
| 1 | `lead_no_response_sla` | `lead.created` | sem `lead.first_response` dentro do SLA configurado | `create_alert` — "Leads aguardando resposta" | A |
| 2 | `lead_followup_24h` | `lead.created` (sem resposta da paciente) | 24h sem nova mensagem inbound | `suggest_message_l2` | B |
| 3 | `lead_followup_3d` | idem | 3 dias | `suggest_message_l2` (nova abordagem por motivação) | B |
| 4 | `lead_followup_7d` | idem | 7 dias | `suggest_message_l2` (última tentativa da sequência) | B |
| 5 | `evaluation_confirmation` | `evaluation.scheduled` | N horas antes | `send_message_l1` (anamnese + confirmação + localização) | A |
| 6 | `evaluation_payment_pending` | `evaluation.scheduled` | pagamento não identificado | `create_task` (Gabi) | A |
| 7 | `attended_without_plan` | `appointment.completed` (avaliação) | sem `treatment_plans` criado em 48h | `create_alert` | A |
| 8 | `plan_presented_no_action_24h` | `plan.presented` | 24h sem status | `create_alert` informativo | A |
| 9 | `plan_presented_no_action_48h` | `plan.presented` | 48h sem status | `create_task` (Gabi, follow-up) | B |
| 10 | `plan_presented_no_action_7d` | `plan.presented` | 7 dias | `suggest_message_l2` (follow-up estratégico) | B |
| 11 | `plan_presented_no_action_30d` | `plan.presented` | 30 dias | move para `reactivation` (ver `CRM_RULES.md`) | B |
| 12 | `post_procedure_protocol` | `procedure.completed` | protocolo existe para o procedimento | agenda `protocol_steps` como tarefas/mensagens futuras | A |
| 13 | `return_due` | `return.due` | retorno vencido | `create_task` | A |
| 14 | `active_patient_no_next_step` | qualquer atualização de jornada | paciente `active_recurrence` sem `next_action` | `create_alert` (golden rule — ver `CRM_RULES.md`) | A |
| 15 | `maintenance_window_approaching` | cálculo diário sobre `maintenance_cycles` | dentro da janela - N dias | `create_task` (relacionamento) | A |
| 16 | `annual_review_due` | cálculo diário sobre `annual_reviews` | 12 meses desde plano/revisão anterior | `create_alert` | A |
| 17 | `weekly_reactivation_list` | agendado (semanal) | pacientes inativas por segmento (3/6/9/12 meses) | gera lista, não envia nada sozinho | A |
| 18 | `patient_no_next_action` | qualquer atualização de jornada | regra de ouro violada | `create_alert` (crítico) | A |

Todas as `action` de nível B/C exigem aprovação antes de enviar mensagem real ao paciente — ver
`SECURITY.md` (nunca `EXECUTE → ASSUME SUCCESS`, nunca envio automático de nível 2/3).

## Implementação

`lib/automation/` (a criar): `engine.ts` (avalia `condition` contra o payload do evento — funções
puras, testáveis isoladamente, mesmo padrão de `lib/rules/engine.ts`), `events.ts` (tipos dos
eventos do catálogo acima), `actions.ts` (uma função por `action`, cada uma delegando para
`RuleEngine`/`WhatsAppProvider`/tabelas, nunca lógica de negócio duplicada). Sem scheduler
próprio no MVP — reaproveita o mesmo padrão de gatilho manual (`/sync-agenda`) documentado em
`COWORK_RUNBOOK.md` até existir um scheduler confiável (ver `ROADMAP.md` Fase 7).
