# Catálogo de regras candidatas — STIMMA OS

Prioridade = `impacto gerencial × impacto financeiro × frequência × confiabilidade da automação
÷ complexidade`. P0 = obrigatória no MVP. P1 = alta prioridade, próxima onda. P2 = depois.

Todas as regras rodam no `RuleEngine` (determinístico). Nenhuma decide diagnóstico ou conduta
clínica (Nível D é sempre humano).

| # | Regra | Gatilho | Condição | Ação | Prioridade |
|---|-------|---------|----------|------|------------|
| 1 | Pagamento não localizado | `appointment.completed` | requer pagamento e não encontrado em 60 min | `alert(financial_missing_payment)` | P0 |
| 2 | Sem próxima etapa pós-atendimento | `appointment.completed` | `next_appointment = null` e paciente requer continuidade | `create_opportunity(no_next_step)`, `assign(recepção)` | P0 |
| 3 | Avaliação sem continuidade | `appointment.completed` (avaliação) | sem plano aprovado e sem próxima ação em 48h | `create_opportunity(evaluation_no_continuity)` | P0 |
| 4 | Plano aprovado não iniciado | `treatment_plan.accepted` | nenhum procedimento marcado em N dias | `alert(plan_not_started)` | P0 |
| 5 | Tratamento sem próxima etapa | tratamento ativo | nenhuma consulta futura agendada | `alert(treatment_no_next_step)` | P0 |
| 6 | Recebível vencido | `receivable.due` passa da data | não pago | `alert(receivable_overdue)`, impacto financeiro = valor | P0 |
| 7 | Cancelamento — recuperação do paciente | `appointment.cancelled` | sem reagendamento em 24h | `create_opportunity(cancellation_patient_recovery)` | P0 |
| 8 | Cancelamento — recuperação do horário | `appointment.cancelled` | horário permanece livre | `emit(schedule.gap_detected)` | P0 |
| 9 | Horário vago relevante | `schedule.gap_detected` | horário de valor (ex. período nobre) | listar candidatos (antecipação, retorno, plano parado) para Gabi | P0 |
| 10 | Golden rule — paciente sem next_action | qualquer atualização de jornada | `next_action = null` em paciente ativo | `create_alert(no_next_action)` | P0 |
| 11 | Planejamento apresentado sem resposta 24h | `treatment_plan.presented` | 24h sem status | `alert` informativo (verificar) | P0 |
| 12 | Planejamento apresentado sem resposta 48h | idem | 48h sem status | `create_task(Gabi, follow_up)` | P0 |
| 13 | Planejamento apresentado sem resposta 7d | idem | 7 dias sem status | reanálise/oportunidade de reativação | P1 |
| 14 | Divergência de valor em pagamento | `payment.confirmed` | valor ≠ orçamento/orçado | `alert(financial_divergence)` | P1 |
| 15 | Duplicidade de lançamento | sync financeiro | mesmo paciente/valor/data em duplicidade | `requires_review` | P1 |
| 16 | Falta (no-show) | `appointment.no_show` | — | `create_opportunity(reactivation_candidate)`, notificar recepção | P0 |
| 17 | Reativação — sem retorno esperado | regra de calendário (ex. retorno de manutenção) | paciente não retornou no prazo esperado | `create_opportunity(reactivation)` — nunca inventa indicação clínica, só usa alerta de retorno já registrado | P1 |
| 18 | Pré-atendimento — briefing | N horas antes de atendimento relevante | — | gera briefing curto (última consulta, plano em andamento, pendência administrativa) | P0 |
| 19 | Confirmação pendente próxima do horário | agendamento sem confirmação | faltam < X horas | `alert` para recepção | P1 |
| 20 | Aniversariante próximo | dado nativo do Simples Dental | 30 dias | oportunidade de relacionamento (baixa prioridade financeira, alta em fidelização) | P2 |
| 21 | Carga de tarefa por pessoa da equipe | `task.created/completed` | acúmulo/atraso por responsável | resumo em "Minha equipe" | P1 |
| 22 | Tarefa do sistema vencida | `task.overdue` | prazo passado | `alert`, prioridade automática | P0 |
| 23 | Auditoria — atendimento sem pagamento nem exceção registrada | fechamento do dia | — | listar no `STIMMA CLOSE` | P0 |
| 24 | Auditoria — pagamento sem atendimento vinculado | fechamento do dia | — | `alert(financial_missing_payment)` inverso | P1 |
| 25 | Ocupação de agenda abaixo da média | análise semanal | dia da semana com ocupação < média histórica | insight no `STIMMA WEEKLY` (causa→impacto→recomendação) | P1 |
| 26 | Ticket médio fora do esperado | análise mensal | desvio relevante vs. referência (R$ 15.000/ano) | insight no `BUSINESS REVIEW` | P2 |
| 27 | Meta de vendas em risco | comparação com meta nativa do Simples Dental | ritmo atual não atinge a meta do mês | `alert` informativo, prioridade do dia | P1 |
| 28 | Paciente com débito em atraso + consulta futura marcada | cruzamento agenda × financeiro | débito > 0 e consulta em N dias | `alert` para recepção preparar cobrança antes do atendimento | P1 |
| 29 | Consentimento de comunicação ausente/negado | antes de qualquer notificação ao paciente | toggle de comunicação = off no Simples Dental | bloquear envio, registrar motivo | P0 |
| 30 | Ação de automação requer revisão | qualquer step de automação de navegador | estrutura da tela mudou / resultado inesperado | `automation.requires_review`, não executa a ação | P0 |

## MVP (P0) — subconjunto real para a primeira entrega funcional

Dado que a Fase 4/5 (sync real com o Simples Dental) ainda depende de automação de navegador
estabilizada, o MVP do `RuleEngine` roda sobre **dados semeados/manuais** primeiro (para provar
a lógica, a UI e o fluxo de aprovação) e é conectado ao sync real assim que a Fase 4 amadurecer:
regras 1, 2, 3, 6, 7, 8, 9, 10, 16, 18, 22, 29, 30.
