# Database Schema — extensão CRM

Este documento estende [`DATABASE.md`](./DATABASE.md) (schema original do STIMMA OS, já aplicado
— `0001`–`0008`) com as entidades novas exigidas pelo [`CRM_MASTER_SPEC.md`](./CRM_MASTER_SPEC.md).
Convenções (RLS, `organization_id`, `source/external_id`, enums fechados) são as mesmas —
ver `DATABASE.md` §Convenções. Migration: `0009_crm_foundation.sql`.

## Reconciliação com o schema existente (o que **não** é recriado)

- **`leads` não vira tabela separada.** O prompt original lista `patients` e `leads` como
  entidades distintas; o STIMMA OS já unifica isso em `patients` + `patient_journeys.stage`
  (uma paciente em estágio `new_lead` é, na prática, um lead). Duas tabelas para a mesma pessoa
  criaria o problema de deduplicação que o próprio prompt (seção 79) pede para evitar. Uma
  `patients` row nasce no primeiro contato, nunca é recriada como "outra entidade" ao avançar no
  funil.
- **`opportunities` já existe** (0004) e cobre "oportunidades clinicamente indicadas" (seção 42
  do prompt) — não recriar; usar `type = 'clinically_indicated'` e os campos de valor já
  existentes (nunca somados — ver `DATABASE.md`).
- **`automation_runs`/`automation_actions`/`audit_logs` já existem** (0005) e cobrem o log de
  execução de automação — a novidade é `automation_rules` (a *configuração* de trigger/condição/
  delay/ação, ver `AUTOMATION_ENGINE.md`), não o log.
- **`tasks` já existe** (0004) — o "Modo FUP" (prompt §90) e as tarefas de follow-up usam a
  tabela `tasks` existente com `source = 'followup'`, não uma tabela `followups` paralela.
  Campos que faltavam para o Modo FUP (motivo de adiamento, canal) entram como colunas novas em
  `tasks`, não uma tabela nova.

## Enum de pipeline — expandido para os 18 estágios

`patient_pipeline_stage` (13 valores, 0002) é substituído por `crm_pipeline_stage` (18 valores,
mapeamento 1:1 dos antigos + os novos do prompt mestre). Coluna `patient_journeys.stage` migra de
tipo com `case` explícito — ver migration. Nenhum dado real de pipeline existia além do estágio
padrão (`lead`), então a migração é de baixo risco.

```sql
create type crm_pipeline_stage as enum (
  'new_lead','first_contact_done','motivation_identified','case_sent',
  'evaluation_offered','evaluation_scheduled','payment_pending','confirmed',
  'attended','plan_presented','objection_tracking','plan_accepted',
  'execution_in_phases','post_procedure','return_visit','active_recurrence',
  'reactivation','lost'
);
```

## `pipeline_history` — histórico imutável de estágio (nunca sobrescrito)

Substitui a dependência do genérico `patient_events` para mudança de estágio — grava sempre os
quatro campos que o prompt (seção 5) exige por mudança.

```sql
create table pipeline_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  from_stage crm_pipeline_stage,
  to_stage crm_pipeline_stage not null,
  reason text,
  next_action text,
  next_action_due_at timestamptz,
  automation_rule_id uuid references automation_rules(id),
  changed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

`patient_journeys` continua sendo o "estado atual" (leitura rápida para a UI); `pipeline_history`
é o log append-only. Toda escrita em `patient_journeys.stage` é seguida, na mesma transação, por
uma linha em `pipeline_history` — nunca a primeira sem a segunda (ver implementação em
`lib/rules/`).

## Origem do lead

```sql
create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,   -- instagram | google | referral | organic | event | partnership | other
  label text not null,
  unique (organization_id, key)
);
```

`patients` ganha `lead_source_id uuid references lead_sources(id)`, `referred_by_patient_id uuid
references patients(id)` (quando origem = indicação), `campaign text`.

## Tags

```sql
create table tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  unique (organization_id, label)
);

create table patient_tags (
  patient_id uuid not null references patients(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (patient_id, tag_id)
);
```

## Inteligência comercial e WhatsApp

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null, -- null até resolver o lead
  channel text not null default 'whatsapp',
  external_thread_id text,       -- id da conversa no provider
  phone text not null,
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null,        -- inbound | outbound
  level text,                     -- 1_operational | 2_relationship | 3_clinical (outbound apenas)
  body text not null,
  sent_by uuid references profiles(id), -- null quando automatico
  ai_suggested boolean not null default false,
  external_message_id text,
  status text not null default 'sent', -- sent | delivered | read | failed
  created_at timestamptz not null default now()
);

-- Resumo vivo da conversa + campos extraidos (sempre com a frase original preservada).
create table interaction_summaries (
  patient_id uuid primary key references patients(id) on delete cascade,
  summary text,
  motivation text,
  motivation_quote text,          -- frase original da paciente, nunca sobrescrita pela interpretacao
  desired_outcome text,
  main_fear text,
  main_objection text,
  intent_level text,               -- low | medium | high
  updated_at timestamptz not null default now()
);
```

## Biblioteca de casos

```sql
create table clinical_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category text,
  age_range text,
  main_complaint text,
  objective text,
  procedures text[],
  description text,
  clinician_notes text,
  created_at timestamptz not null default now()
);

create table case_media (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references clinical_cases(id) on delete cascade,
  storage_path text not null,     -- Supabase Storage privado, nunca URL publica direta
  kind text not null default 'photo', -- photo_before | photo_after | other
  created_at timestamptz not null default now()
);

create table case_tags (
  case_id uuid not null references clinical_cases(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (case_id, tag_id)
);
```

## Planejamento e execução

```sql
create table treatment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references professionals(id),
  objective text,
  investment_total numeric(12,2),
  discount numeric(12,2),
  conditions text,
  valid_until date,
  status text not null default 'presented',
  -- presented | analyzing | objection | accepted | partially_accepted | in_execution | completed | paused
  presented_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid not null references treatment_plans(id) on delete cascade,
  procedure_name text not null,
  quantity int not null default 1,
  sequence_order int not null default 1,
  priority text,
  investment numeric(12,2),
  status text not null default 'planned' -- planned | scheduled | done | skipped
);

create table procedure_sessions (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_item_id uuid references treatment_plan_items(id) on delete set null,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references professionals(id),
  appointment_id uuid references appointments(id) on delete set null,
  procedure_name text not null,
  planned_at date,
  performed_at timestamptz,
  value numeric(12,2),
  status text not null default 'planned', -- planned | done | cancelled
  notes text
);

create table objections (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  treatment_plan_id uuid references treatment_plans(id) on delete set null,
  category text not null, -- price | payment_method | fear | time | needs_to_discuss | ...
  detail text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
```

## Pós-procedimento, retorno, manutenção, revisão

```sql
create table post_procedure_protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  procedure_name text not null,
  label text not null
);

create table protocol_steps (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references post_procedure_protocols(id) on delete cascade,
  offset_hours int not null, -- 0 = imediato, 24 = D+1, 168 = D+7 ...
  message_template text,
  step_type text not null default 'message' -- message | task | clinical_return
);

create table returns (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  procedure_session_id uuid references procedure_sessions(id) on delete set null,
  expected_at date,
  status text not null default 'expected', -- expected | scheduled | confirmed | done | overdue
  created_at timestamptz not null default now()
);

create table maintenance_cycles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  category text not null, -- ex: botox, preenchimento
  periodicity_days int not null,
  confirmed_by_professional boolean not null default false,
  last_done_at date,
  next_window_start date,
  next_window_end date
);

create table annual_reviews (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  due_at date not null,
  completed_at timestamptz,
  notes text
);

create table satisfaction (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  procedure_session_id uuid references procedure_sessions(id) on delete set null,
  scale int, -- 1..5, opcional
  qualitative text, -- muito_satisfeita | satisfeita | neutra | insatisfeita | requer_atencao
  notes text,
  created_at timestamptz not null default now()
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_patient_id uuid not null references patients(id) on delete cascade,
  referred_patient_id uuid references patients(id) on delete set null,
  referred_name text,
  requested_at date,
  converted boolean not null default false,
  created_at timestamptz not null default now()
);
```

## Automação configurável

```sql
create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,               -- ex: 'lead_no_response_24h'
  trigger_event text not null,     -- ver AUTOMATION_ENGINE.md — catalogo de eventos
  condition jsonb not null default '{}'::jsonb,
  delay_minutes int not null default 0,
  action text not null,            -- create_task | create_alert | send_message_l1 | suggest_message_l2
  assigned_role text,              -- ex: 'reception'
  message_template text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

## Colunas novas em tabelas existentes

```sql
alter table tasks
  add column if not exists postponed_to timestamptz,     -- "adiar" sempre exige data (secao 91)
  add column if not exists postpone_reason text,
  add column if not exists channel text;                 -- whatsapp | call | in_person

alter table patients
  add column if not exists lead_source_id uuid references lead_sources(id),
  add column if not exists referred_by_patient_id uuid references patients(id),
  add column if not exists campaign text,
  add column if not exists loss_reason text,              -- obrigatorio ao mover para "lost" (secao 92)
  add column if not exists loss_detail text;
```

## RLS

Mesmo padrão de `DATABASE.md`: leitura `select` restrita a `organization_id = current_profile_org()`
(direto ou via join até a paciente/plano/organização). Nenhuma policy de `insert`/`update`/`delete`
para `authenticated` nestas tabelas ainda — toda escrita passa por Route Handlers server-side
(service role) até existir necessidade real de escrita direta do cliente, mesmo padrão já usado
em `payments`/`receivables`/`appointments`. `case_media.storage_path` nunca aponta para bucket
público — ver `SECURITY.md`.
