-- STIMMA OS -- 0009: fundacao do CRM (pipeline de 18 estagios, WhatsApp, planejamento,
-- pos-procedimento, recorrencia). Ver docs/DATABASE_SCHEMA.md e docs/DECISIONS.md (2026-08-17).
-- Aditivo: nenhuma tabela existente perde dado. Unica mudanca estrutural em tabela existente e
-- o tipo de patient_journeys.stage (migrado com mapeamento explicito abaixo).

-- ============================================================================
-- 1. Pipeline expandido (13 -> 18 estagios) + historico imutavel
-- ============================================================================

create type crm_pipeline_stage as enum (
  'new_lead','first_contact_done','motivation_identified','case_sent',
  'evaluation_offered','evaluation_scheduled','payment_pending','confirmed',
  'attended','plan_presented','objection_tracking','plan_accepted',
  'execution_in_phases','post_procedure','return_visit','active_recurrence',
  'reactivation','lost'
);

alter table patient_journeys alter column stage drop default;

alter table patient_journeys
  alter column stage type crm_pipeline_stage
  using (
    case stage::text
      when 'lead' then 'new_lead'
      when 'evaluation_scheduled' then 'evaluation_scheduled'
      when 'evaluation_confirmed' then 'confirmed'
      when 'evaluation_completed' then 'attended'
      when 'plan_presented' then 'plan_presented'
      when 'negotiation' then 'objection_tracking'
      when 'plan_accepted' then 'plan_accepted'
      when 'treatment_started' then 'execution_in_phases'
      when 'treatment_active' then 'execution_in_phases'
      when 'follow_up' then 'return_visit'
      when 'maintenance' then 'active_recurrence'
      when 'reactivation' then 'reactivation'
      when 'inactive' then 'lost'
      else 'new_lead'
    end
  )::crm_pipeline_stage;

alter table patient_journeys alter column stage set default 'new_lead'::crm_pipeline_stage;

drop type patient_pipeline_stage;

create table pipeline_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  from_stage crm_pipeline_stage,
  to_stage crm_pipeline_stage not null,
  reason text,
  next_action text,
  next_action_due_at timestamptz,
  changed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Origem do lead, indicacao, motivo de perda
-- ============================================================================

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  unique (organization_id, key)
);

alter table patients
  add column if not exists lead_source_id uuid references lead_sources(id),
  add column if not exists referred_by_patient_id uuid references patients(id),
  add column if not exists campaign text,
  add column if not exists loss_reason text,
  add column if not exists loss_detail text,
  add column if not exists last_interaction_at timestamptz;

-- ============================================================================
-- 3. Tags
-- ============================================================================

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

-- ============================================================================
-- 4. WhatsApp / inteligencia comercial (ver docs/WHATSAPP_ARCHITECTURE.md — provider e mock)
-- ============================================================================

create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  channel text not null default 'whatsapp',
  external_thread_id text,
  phone text not null,
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null,
  level text,
  body text not null,
  sent_by uuid references profiles(id),
  ai_suggested boolean not null default false,
  external_message_id text,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table interaction_summaries (
  patient_id uuid primary key references patients(id) on delete cascade,
  summary text,
  motivation text,
  motivation_quote text,
  desired_outcome text,
  main_fear text,
  main_objection text,
  intent_level text,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 5. Biblioteca de casos
-- ============================================================================

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

-- storage_path aponta para bucket PRIVADO do Supabase Storage (criacao do bucket e passo
-- manual/administrativo, fora desta migration) — nunca URL publica direta. Ver docs/SECURITY.md.
create table case_media (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references clinical_cases(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'photo',
  created_at timestamptz not null default now()
);

create table case_tags (
  case_id uuid not null references clinical_cases(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (case_id, tag_id)
);

-- ============================================================================
-- 6. Planejamento e execucao
-- ============================================================================

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
  status text not null default 'planned'
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
  status text not null default 'planned',
  notes text
);

create table objections (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  treatment_plan_id uuid references treatment_plans(id) on delete set null,
  category text not null,
  detail text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 7. Pos-procedimento, retorno, manutencao, revisao anual, satisfacao, indicacao
-- ============================================================================

create table post_procedure_protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  procedure_name text not null,
  label text not null
);

create table protocol_steps (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references post_procedure_protocols(id) on delete cascade,
  offset_hours int not null,
  message_template text,
  step_type text not null default 'message'
);

create table returns (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  procedure_session_id uuid references procedure_sessions(id) on delete set null,
  expected_at date,
  status text not null default 'expected',
  created_at timestamptz not null default now()
);

create table maintenance_cycles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  category text not null,
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
  scale int,
  qualitative text,
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

-- ============================================================================
-- 8. Automacao configuravel (ver docs/AUTOMATION_ENGINE.md)
-- ============================================================================

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  trigger_event text not null,
  condition jsonb not null default '{}'::jsonb,
  delay_minutes int not null default 0,
  action text not null,
  assigned_role text,
  message_template text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

alter table pipeline_history
  add column if not exists automation_rule_id uuid references automation_rules(id);

-- ============================================================================
-- 9. Modo FUP — adiar sempre exige data (docs/CRM_RULES.md #4)
-- ============================================================================

alter table tasks
  add column if not exists postponed_to timestamptz,
  add column if not exists postpone_reason text,
  add column if not exists channel text;

alter table tasks
  add constraint tasks_postpone_requires_date
  check (postpone_reason is null or postponed_to is not null);

-- ============================================================================
-- 10. RLS — mesmo padrao das migrations anteriores: leitura por organizacao,
--     escrita apenas via service role (Route Handlers) por enquanto.
-- ============================================================================

alter table pipeline_history enable row level security;
alter table lead_sources enable row level security;
alter table tags enable row level security;
alter table patient_tags enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table interaction_summaries enable row level security;
alter table clinical_cases enable row level security;
alter table case_media enable row level security;
alter table case_tags enable row level security;
alter table treatment_plans enable row level security;
alter table treatment_plan_items enable row level security;
alter table procedure_sessions enable row level security;
alter table objections enable row level security;
alter table post_procedure_protocols enable row level security;
alter table protocol_steps enable row level security;
alter table returns enable row level security;
alter table maintenance_cycles enable row level security;
alter table annual_reviews enable row level security;
alter table satisfaction enable row level security;
alter table referrals enable row level security;
alter table automation_rules enable row level security;

create policy "pipeline_history: read via patient org" on pipeline_history
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "lead_sources: read within org" on lead_sources
  for select using (organization_id = current_profile_org());
create policy "tags: read within org" on tags
  for select using (organization_id = current_profile_org());
create policy "patient_tags: read via patient org" on patient_tags
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "conversations: read within org" on conversations
  for select using (organization_id = current_profile_org());
create policy "messages: read via conversation org" on messages
  for select using (exists (select 1 from conversations c where c.id = conversation_id and c.organization_id = current_profile_org()));
create policy "interaction_summaries: read via patient org" on interaction_summaries
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "clinical_cases: read within org" on clinical_cases
  for select using (organization_id = current_profile_org());
create policy "case_media: read via case org" on case_media
  for select using (exists (select 1 from clinical_cases c where c.id = case_id and c.organization_id = current_profile_org()));
create policy "case_tags: read via case org" on case_tags
  for select using (exists (select 1 from clinical_cases c where c.id = case_id and c.organization_id = current_profile_org()));
create policy "treatment_plans: read within org" on treatment_plans
  for select using (organization_id = current_profile_org());
create policy "treatment_plan_items: read via plan org" on treatment_plan_items
  for select using (exists (select 1 from treatment_plans tp where tp.id = treatment_plan_id and tp.organization_id = current_profile_org()));
create policy "procedure_sessions: read via patient org" on procedure_sessions
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "objections: read via patient org" on objections
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "post_procedure_protocols: read within org" on post_procedure_protocols
  for select using (organization_id = current_profile_org());
create policy "protocol_steps: read via protocol org" on protocol_steps
  for select using (exists (select 1 from post_procedure_protocols pp where pp.id = protocol_id and pp.organization_id = current_profile_org()));
create policy "returns: read via patient org" on returns
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "maintenance_cycles: read via patient org" on maintenance_cycles
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "annual_reviews: read via patient org" on annual_reviews
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "satisfaction: read via patient org" on satisfaction
  for select using (exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org()));
create policy "referrals: read via referrer org" on referrals
  for select using (exists (select 1 from patients p where p.id = referrer_patient_id and p.organization_id = current_profile_org()));
create policy "automation_rules: read within org" on automation_rules
  for select using (organization_id = current_profile_org());
