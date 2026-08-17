-- STIMMA OS — 0004: oportunidades, tarefas, alertas
-- Ver docs/BUSINESS_RULES.md e docs/PROJECT_SPEC.md (matriz de autonomia).

create type opportunity_status as enum ('open','working','won','lost');
create type task_status as enum ('open','in_progress','waiting','completed','cancelled');
create type alert_priority as enum ('critical','important','opportunity','informative');
create type alert_status as enum ('open','in_progress','resolved','dismissed');

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  type text not null,
  status opportunity_status not null default 'open',
  -- Nunca somar estes quatro campos entre si — ver docs/DATABASE.md.
  estimated_opportunity_value numeric(12,2),
  confirmed_sale_value numeric(12,2),
  invoiced_value numeric(12,2),
  received_value numeric(12,2),
  probability numeric(4,3),
  urgency text,
  assigned_to uuid references profiles(id),
  source_rule_id text,
  created_at timestamptz not null default now()
);

create table opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  patient_id uuid references patients(id) on delete set null,
  source text not null default 'manual',
  assigned_to uuid references profiles(id),
  priority text not null default 'normal',
  due_at timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  financial_impact numeric(12,2),
  status task_status not null default 'open',
  depends_on uuid[] not null default '{}',
  automation_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category text not null,
  priority alert_priority not null,
  patient_id uuid references patients(id) on delete set null,
  assigned_to uuid references profiles(id),
  source text not null default 'rule_engine',
  financial_impact numeric(12,2),
  due_at timestamptz,
  recommended_action text,
  status alert_status not null default 'open',
  source_rule_id text,
  created_at timestamptz not null default now()
);

alter table opportunities enable row level security;
alter table opportunity_events enable row level security;
alter table tasks enable row level security;
alter table task_events enable row level security;
alter table alerts enable row level security;

create policy "opportunities: read within org" on opportunities
  for select using (organization_id = current_profile_org());
create policy "opportunity_events: read via opportunity org" on opportunity_events
  for select using (
    exists (select 1 from opportunities o where o.id = opportunity_id and o.organization_id = current_profile_org())
  );
create policy "tasks: read within org" on tasks
  for select using (organization_id = current_profile_org());
create policy "task_events: read via task org" on task_events
  for select using (
    exists (select 1 from tasks t where t.id = task_id and t.organization_id = current_profile_org())
  );
create policy "alerts: read within org" on alerts
  for select using (organization_id = current_profile_org());
