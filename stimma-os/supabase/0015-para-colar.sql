create table if not exists daily_routine_items ( organization_id uuid not null references organizations(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade, day date not null, item_key text not null, estado text not null check (estado in ('a_fazer','feito','nao_se_aplica','impedimento')), motivo text, proxima_acao text, prazo date, responsavel text, task_id uuid references tasks(id) on delete set null, updated_by uuid not null references profiles(id), updated_at timestamptz not null default now(), primary key (organization_id, user_id, day, item_key), check (estado <> 'impedimento' or (nullif(btrim(motivo), '') is not null and nullif(btrim(proxima_acao), '') is not null)) );

create index if not exists daily_routine_items_dia_idx on daily_routine_items (organization_id, day);

alter table daily_routine_items enable row level security;

drop policy if exists "daily_routine_items: read within org" on daily_routine_items;

create policy "daily_routine_items: read within org" on daily_routine_items for select using (organization_id = current_profile_org());
