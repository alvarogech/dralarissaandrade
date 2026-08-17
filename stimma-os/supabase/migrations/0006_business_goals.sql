-- STIMMA OS — 0006: parametros de negocio (Configuracoes do Negocio)
-- Ver docs/PROJECT_SPEC.md — todos os valores sao editaveis, nunca hardcoded.

create table business_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null, -- ex: 'evaluation_price', 'monthly_new_plans_target'
  label text not null,
  value numeric(12,2) not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

alter table business_goals enable row level security;

create policy "business_goals: read within org" on business_goals
  for select using (organization_id = current_profile_org());
