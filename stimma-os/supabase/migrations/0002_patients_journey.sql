-- STIMMA OS — 0002: pacientes (minimizados) e jornada
-- Sem dado clinico. Ver docs/SECURITY.md (minimizacao) e docs/SIMPLES_DENTAL_MAP.md.

create type patient_pipeline_stage as enum (
  'lead','evaluation_scheduled','evaluation_confirmed','evaluation_completed',
  'plan_presented','negotiation','plan_accepted','treatment_started',
  'treatment_active','follow_up','maintenance','reactivation','inactive'
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  birth_date date,
  requires_continuation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotencia / matching com o Simples Dental — nunca so por nome.
-- Ver docs/INTEGRATIONS.md.
create table patient_external_ids (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  source text not null, -- 'simples_dental_browser' | 'manual' | ...
  external_id text not null,
  source_fingerprint text,
  requires_review boolean not null default false,
  last_seen_at timestamptz,
  last_synced_at timestamptz,
  unique (source, external_id)
);

create table patient_journeys (
  patient_id uuid primary key references patients(id) on delete cascade,
  stage patient_pipeline_stage not null default 'lead',
  next_action text,
  next_action_due_at timestamptz,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table patient_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  type text not null,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table patients enable row level security;
alter table patient_external_ids enable row level security;
alter table patient_journeys enable row level security;
alter table patient_events enable row level security;

create policy "patients: read within org" on patients
  for select using (organization_id = current_profile_org());

create policy "patient_external_ids: read via patient org" on patient_external_ids
  for select using (
    exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org())
  );

create policy "patient_journeys: read via patient org" on patient_journeys
  for select using (
    exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org())
  );

create policy "patient_events: read via patient org" on patient_events
  for select using (
    exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org())
  );
