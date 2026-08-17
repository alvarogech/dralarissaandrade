-- STIMMA OS — 0005: automacao e auditoria (EXECUTE -> VERIFY -> COMMIT)
-- Ver docs/SECURITY.md — audit_logs e append-only, sem excecao.

create type automation_actor_type as enum ('human','system','claude','cowork','browser_automation');
create type approval_level as enum ('a_auto','b_auto_log','c_human_approval','d_human_only');

create table approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  requested_by_actor_type automation_actor_type not null,
  approval_level approval_level not null,
  payload jsonb not null default '{}'::jsonb,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz not null default now()
);

create table automation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  approval_id uuid references approvals(id),
  actor_type automation_actor_type not null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  verification jsonb,
  status text not null default 'pending', -- pending | verified | failed | requires_review
  created_at timestamptz not null default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  routine text not null, -- ex: 'auditoria_matinal'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running | completed | failed | requires_review
  summary jsonb
);

-- Append-only: sem policy de update/delete para ninguem.
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor text not null,
  actor_type automation_actor_type not null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  source text not null,
  reason text,
  verification jsonb,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

alter table approvals enable row level security;
alter table automation_actions enable row level security;
alter table automation_runs enable row level security;
alter table audit_logs enable row level security;

create policy "approvals: read within org" on approvals
  for select using (organization_id = current_profile_org());
create policy "automation_actions: read within org" on automation_actions
  for select using (organization_id = current_profile_org());
create policy "automation_runs: read within org" on automation_runs
  for select using (organization_id = current_profile_org());
create policy "audit_logs: read within org" on audit_logs
  for select using (organization_id = current_profile_org());
-- audit_logs: insercao apenas via service role (Route Handlers de confianca) — sem policy de insert para authenticated.
