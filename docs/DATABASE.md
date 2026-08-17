# Banco de dados — STIMMA OS

Postgres via Supabase, projeto dedicado (ver [`DECISIONS.md`](./DECISIONS.md)). RLS habilitado
em todas as tabelas. Migrations em `stimma-os/supabase/migrations/`, numeradas e aplicadas em
ordem — mesmo padrão do `anamnese-app`.

## Convenções

- `id uuid primary key default gen_random_uuid()` em todas as tabelas.
- `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger).
- Toda entidade sincronizada de fonte externa carrega: `source, external_id,
  source_fingerprint, last_seen_at, last_synced_at` (idempotência — ver `SIMPLES_DENTAL_MAP.md`
  e `INTEGRATIONS.md`).
- Enums Postgres para status fechados (não strings livres).
- Nunca guardar segredo/token em tabela sem `encryption` adequada — ver `SECURITY.md`.

## Entidades (MVP e visão completa)

Implementadas no MVP (Fase 1) estão marcadas `[MVP]`; as demais entram conforme o roadmap.

```text
organizations [MVP]        -- 1 registro: Clínica Stimma
clinics [MVP]

users [MVP]                -- espelha auth.users (Supabase Auth)
roles [MVP]                -- admin, professional, reception, clinical_support, spa (seed)
permissions [MVP]          -- ações do STIMMA OS, não as 89 do Simples Dental
user_roles [MVP]

professionals [MVP]

patients [MVP]             -- mínimo necessário à gestão, não prontuário
patient_external_ids [MVP] -- source, external_id (matching com Simples Dental)
patient_journeys [MVP]     -- estado do pipeline (ver enum abaixo) + next_action
patient_events [MVP]

appointments [MVP]
appointment_events [MVP]

treatment_plans
treatment_plan_items

payments [MVP]
receivables [MVP]
financial_transactions

opportunities [MVP]
opportunity_events

tasks [MVP]
task_events

alerts [MVP]

approvals
automation_actions
automation_runs

business_goals [MVP]
daily_metrics
monthly_metrics

integrations
integration_connections
sync_runs
external_records

ai_insights
ai_conversations

notifications

audit_logs [MVP]
```

## Enums centrais

```sql
create type patient_pipeline_stage as enum (
  'lead','evaluation_scheduled','evaluation_confirmed','evaluation_completed',
  'plan_presented','negotiation','plan_accepted','treatment_started',
  'treatment_active','follow_up','maintenance','reactivation','inactive'
);

create type appointment_status as enum (
  'scheduled','confirmed','completed','cancelled','no_show','rescheduled'
);

create type alert_priority as enum ('critical','important','opportunity','informative');

create type alert_status as enum ('open','in_progress','resolved','dismissed');

create type task_status as enum ('open','in_progress','waiting','completed','cancelled');

create type opportunity_status as enum ('open','working','won','lost');

create type automation_actor_type as enum
  ('human','system','claude','cowork','browser_automation');

create type approval_level as enum ('a_auto','b_auto_log','c_human_approval','d_human_only');
```

## Tabelas centrais do MVP (resumo de colunas — DDL completo nas migrations)

- **`patients`**: `id, org_id, full_name, phone, birth_date, sd_patient_id (external), created_at`.
  Sem CPF/dado clínico salvo aqui — só o necessário para vincular e contatar.
- **`patient_journeys`**: `patient_id (fk), stage (patient_pipeline_stage), next_action text,
  next_action_due_at, requires_continuation boolean, updated_by, updated_at`. É aqui que a
  "golden rule" (`next_action != null`) é verificada.
- **`appointments`**: `id, patient_id, professional_id, starts_at, ends_at, status, reason,
  requires_payment boolean, sd_appointment_id (external)`.
- **`opportunities`**: `id, patient_id, type, estimated_opportunity_value numeric,
  confirmed_sale_value numeric, invoiced_value numeric, received_value numeric, status,
  probability, urgency, assigned_to, source_rule_id`. Os quatro campos de valor **nunca são
  somados entre si automaticamente** — ver `PROJECT_SPEC.md` (North Star / valor recuperado).
- **`alerts`**: `id, category, priority (alert_priority), patient_id nullable, assigned_to,
  source, financial_impact numeric, due_at, recommended_action text, status (alert_status)`.
- **`tasks`**: `id, title, description, patient_id nullable, source, assigned_to, priority,
  due_at, checklist jsonb, financial_impact numeric, status (task_status), depends_on uuid[],
  automation_allowed boolean`.
- **`automation_actions`** / **`automation_runs`**: registram toda ação de automação —
  `actor_type (automation_actor_type), approval_level, before jsonb, after jsonb, verification
  jsonb, status`. Base do princípio EXECUTE → VERIFY → COMMIT.
- **`audit_logs`**: `actor, actor_type, action, target, before, after, source, reason,
  timestamp, verification, status` — conforme especificado no briefing, sem exceção.

## RLS (padrão)

- Nenhuma tabela é legível/gravável por `anon`. Toda leitura/escrita exige `authenticated` **e**
  vínculo ativo em `user_roles` para a organização.
- Escrita em tabelas financeiras/de automação restrita a roles com a permission explícita
  (`permissions` + `user_roles`), nunca por e-mail/nome hardcoded.
- `audit_logs` é append-only: sem `UPDATE`/`DELETE` via policy, nem para admin, exceto via
  função `security definer` auditada à parte.

## Migrações iniciais planejadas (`stimma-os/supabase/migrations/`)

`0001_core.sql` (organizations, clinics, users bridge, roles, permissions, user_roles),
`0002_patients_journey.sql`, `0003_appointments.sql`, `0004_opportunities_tasks_alerts.sql`,
`0005_automation_audit.sql`, `0006_business_goals.sql`, `0007_seed.sql`.
