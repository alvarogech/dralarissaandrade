-- STIMMA OS — 0003: agenda e financeiro basico (leitura do Simples Dental)

create type appointment_status as enum (
  'scheduled','confirmed','completed','cancelled','no_show','rescheduled'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid references professionals(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'scheduled',
  reason text,
  requires_payment boolean not null default false,
  completed_at timestamptz,
  sd_appointment_id text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete set null,
  patient_id uuid not null references patients(id) on delete cascade,
  amount numeric(12,2) not null,
  confirmed_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table receivables (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  amount numeric(12,2) not null,
  due_at timestamptz not null,
  paid_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table appointments enable row level security;
alter table appointment_events enable row level security;
alter table payments enable row level security;
alter table receivables enable row level security;

create policy "appointments: read within org" on appointments
  for select using (organization_id = current_profile_org());

create policy "appointment_events: read via appointment org" on appointment_events
  for select using (
    exists (select 1 from appointments a where a.id = appointment_id and a.organization_id = current_profile_org())
  );

create policy "payments: read via patient org" on payments
  for select using (
    exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org())
  );

create policy "receivables: read via patient org" on receivables
  for select using (
    exists (select 1 from patients p where p.id = patient_id and p.organization_id = current_profile_org())
  );
