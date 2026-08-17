# CRM Rules — catálogo de regras da jornada

Regras determinísticas específicas da jornada comercial/relacionamento (complementa
`BUSINESS_RULES.md`, que cobre as regras originais de agenda/financeiro/Simples Dental). Todas
vivem no `RuleEngine` — nenhuma é decidida por IA.

## 1. Regra de ouro (P0 — a mais importante do documento inteiro)

**Toda paciente com `patient_journeys.stage` fora de `lost`/`inactive` precisa ter, ao mesmo
tempo**: `stage` definido (sempre tem, é `not null`), um responsável (`assigned_to` em pelo menos
uma task aberta OU `patient_journeys.updated_by`), `next_action` preenchido, `next_action_due_at`
preenchido. Violação de qualquer um → `create_alert(category='no_next_action', priority='critical')`.

Implementação: `lib/rules/golden-rule.ts`, função pura `checkGoldenRule(patient, journey,
openTasks): GoldenRuleViolation | null` — testável sem banco, mesmo padrão de `engine.ts`.

## 2. Mudança de estágio nunca é silenciosa

Toda escrita em `patient_journeys.stage` é acompanhada, na mesma operação, de uma linha em
`pipeline_history` (ver `DATABASE_SCHEMA.md`) com `reason`, `next_action`, `next_action_due_at`.
Uma função `changeStage()` centraliza isso — nunca um `UPDATE patient_journeys` direto em
múltiplos lugares do código.

## 3. Cadências de follow-up (configuráveis, valores iniciais do prompt mestre)

| Contexto | Cadência | Ação |
|---|---|---|
| Lead novo sem resposta | SLA configurável (ex. 30–60 min) | alerta crítico |
| Lead parou de responder | D+1 leve/contextual, D+3 nova abordagem por motivação, D+7 última tentativa | depois: move para `reactivation`, nunca excluído |
| Plano apresentado sem fechamento | D+1 relacionamento, D+3 retomar objetivo, D+7 nova tentativa, D+15 follow-up estratégico, D+30 reativação | nunca fica "esquecido" em `plan_presented` além de D+30 sem virar tarefa |
| Ausência (no-show) | imediato | FUP de ausência com motivo estruturado + tentativa de reagendamento |
| Reativação por inatividade | segmentos 3/6/9/12/12+ meses | lista semanal (`weekly_reactivation_list`) |

Nenhuma mensagem de reativação ou D+N é um texto genérico — sempre compõe com
`interaction_summaries`/`treatment_plans` via `AI_ARCHITECTURE.md` (nível 2, aprovação humana).

## 4. Adiar nunca significa esquecer

Ao adiar uma task/follow-up, a UI **obriga** uma de: amanhã, 3 dias, 7 dias, ou data
personalizada — nunca um "depois" sem data. Campo `tasks.postponed_to` é `not null` quando
`postpone_reason` está preenchido (validação de aplicação, não é possível salvar um adiamento sem
data).

## 5. Perda exige motivo estruturado

Mover `patient_journeys.stage` para `lost` exige `patients.loss_reason` preenchido (enum:
`price | no_response | gave_up | competitor | fear | timing | moved_city |
no_clinical_indication | other`). Paciente perdida **nunca é excluída** — todo o histórico
(`pipeline_history`, `messages`, `treatment_plans`) permanece.

## 6. Objeção sempre categorizada, nunca só "não fechou"

Toda entrada em `objections` tem `category` de um enum fechado (ver `DATABASE_SCHEMA.md`). O
follow-up sugerido pela IA (nível 2) usa a categoria como parâmetro determinístico de qual
template puxar — a IA personaliza o texto, não decide a estratégia.

## 7. Oportunidade clinicamente indicada nunca é "venda cruzada automática"

Uma linha em `opportunities` com `type='clinically_indicated'` só é criada quando há um registro
prévio de indicação clínica real (nota da Larissa em `treatment_plans`/`clinical_notes` ou
`annual_reviews`) — a IA só pode **lembrar** uma indicação já registrada, nunca gerar uma nova a
partir de padrão de compra ou heurística de venda.

## 8. Manutenção e revisão anual não substituem avaliação clínica

`maintenance_cycles.periodicity_days` e `annual_reviews.due_at` geram **tarefa de
relacionamento** dentro da janela prevista, nunca um agendamento automático ou uma indicação de
procedimento — a confirmação da janela real é sempre humana
(`maintenance_cycles.confirmed_by_professional`).

## 9. Deduplicação de paciente

Antes de criar uma `patients` nova a partir de um número de WhatsApp desconhecido, checar
telefone normalizado contra `patients.phone` existentes. Se houver candidato por nome similar sem
telefone batendo, **perguntar antes de mesclar** — nunca mesclar automaticamente (seção 79 do
prompt original), nunca criar duplicata silenciosa.

## 10. Central de exceções = união das violações acima

A lista de `CRM_MASTER_SPEC.md §13` (lead sem resposta, paciente sem próxima ação, plano sem
follow-up, pagamento pendente, pós não realizado, retorno vencido, paciente ativa sem próxima
etapa, manutenção vencida, paciente insatisfeita, plano sem movimentação) é a superfície visível
de exatamente estas regras — não uma lista de UI arbitrária, mas o retrato do `AlertEngine`
avaliando as regras 1–9 continuamente.
