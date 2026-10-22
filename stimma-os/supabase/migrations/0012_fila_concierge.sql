-- STIMMA OS — 0012: fila da concierge (entrada da gestão, marcos automáticos, eventos)
-- Ver docs/PLANO_FILA_CONCIERGE.md e docs/DECISIONS.md (2026-10-20).
-- APLICADA em produção (stimma-os, fjxvseuopzhfwdraszvp) em 2026-10-21 pelo SQL Editor; verificação ao final conferida.
--
-- Conceitos separados:
--   atendimento de referência  = appointments confirmado como realizado
--   marco previsto             = follow_up_milestones (1 linha por atendimento × marco)
--   tarefa executável          = tasks (estendida)
--   evento real                = interaction_events (só cresce) + event_links (vínculo explícito)

-- Identificadores do Simples Dental ficam em patient_external_ids, separados por source:
--   'sd_codigo' | 'sd_numero' | 'sd_ficha_id' | 'feedback_html' (migração). Nunca equivalentes.

-- ---------------------------------------------------------------- atendimentos de referência
alter table appointments
  add column if not exists data_realizada date,
  add column if not exists realizado_confirmado_em timestamptz,
  add column if not exists realizado_confirmado_por uuid references profiles(id),
  add column if not exists data_status text not null default 'exata',
  add column if not exists anulado_em timestamptz,
  add column if not exists anulado_por uuid references profiles(id),
  add column if not exists anulado_motivo text,
  add column if not exists chave_origem text,
  add column if not exists origem_consultada_em timestamptz;

alter table appointments drop constraint if exists appointments_data_status_check;
alter table appointments add constraint appointments_data_status_check
  check (data_status in ('exata','pendente_validacao'));

create unique index if not exists appointments_org_chave_origem_key
  on appointments (organization_id, chave_origem) where chave_origem is not null;

-- ---------------------------------------------------------------- marcos
create table if not exists follow_up_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in ('d30','d90','m6')),
  due_original date not null,      -- nunca muda depois que o marco foi trabalhado
  due_current date not null,       -- adiamento muda só esta
  status text not null default 'previsto'
    check (status in ('previsto','contatado','contemplado','dispensado','invalidado')),
  status_reason text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, kind)    -- impossível duplicar por construção
);
create index if not exists follow_up_milestones_queue_idx
  on follow_up_milestones (organization_id, status, due_current);

create table if not exists follow_up_milestone_history (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references follow_up_milestones(id) on delete cascade,
  change text not null,            -- 'criado' | 'datas_recalculadas' | 'status' | 'adiado'
  before jsonb,
  after jsonb,
  changed_at timestamptz not null default now()
);

create or replace function trg_follow_up_milestone_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into follow_up_milestone_history (milestone_id, change, after)
      values (new.id, 'criado', jsonb_build_object('due_original', new.due_original, 'status', new.status));
  elsif new.due_original is distinct from old.due_original then
    insert into follow_up_milestone_history (milestone_id, change, before, after)
      values (new.id, 'datas_recalculadas', jsonb_build_object('due_original', old.due_original), jsonb_build_object('due_original', new.due_original));
  elsif new.status is distinct from old.status then
    insert into follow_up_milestone_history (milestone_id, change, before, after)
      values (new.id, 'status', jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'reason', new.status_reason));
  elsif new.due_current is distinct from old.due_current then
    insert into follow_up_milestone_history (milestone_id, change, before, after)
      values (new.id, 'adiado', jsonb_build_object('due_current', old.due_current), jsonb_build_object('due_current', new.due_current));
  end if;
  return new;
end $$;

drop trigger if exists follow_up_milestone_history on follow_up_milestones;
create trigger follow_up_milestone_history after insert or update on follow_up_milestones
  for each row execute function trg_follow_up_milestone_history();

-- ---------------------------------------------------------------- tarefas executáveis
alter table tasks
  add column if not exists kind text,
  add column if not exists chave_origem text,
  add column if not exists origem text,
  add column if not exists origem_data date,
  add column if not exists a_conferir text[] not null default '{}',
  add column if not exists next_action text,
  add column if not exists next_action_due date,
  add column if not exists waiting_since timestamptz,
  add column if not exists closed_reason text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists legacy_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check
  check (kind is null or kind in ('cobranca','recuperacao_falta','continuidade','relacionamento','encaminhamento','outro'));

create unique index if not exists tasks_org_chave_origem_key
  on tasks (organization_id, chave_origem) where chave_origem is not null;

-- ---------------------------------------------------------------- eventos reais
create table if not exists interaction_events (
  id uuid primary key,             -- gerado no cliente: enviar duas vezes não duplica
  organization_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in ('contato','resposta','agendamento_obtido','cancelamento',
    'recebimento_confirmado','atendimento_realizado','adiamento','encerramento','encaminhamento','correcao')),
  occurred_on date not null,       -- quando aconteceu (base da análise por data de corte)
  recorded_at timestamptz not null default now(),
  channel text,
  notes text,
  amount numeric(12,2),
  amount_origin text,              -- recebimento: 'parcela' | 'divida_antiga' | 'nova_contratacao' | ...
  scheduled_for date,              -- agendamento: data da consulta (≠ data em que foi marcado)
  corrects_event_id uuid references interaction_events(id),
  created_by uuid not null references profiles(id),
  legacy_id text
);
create index if not exists interaction_events_day_idx on interaction_events (organization_id, occurred_on);
create index if not exists interaction_events_patient_idx on interaction_events (patient_id, occurred_on);

create table if not exists event_links (
  event_id uuid not null references interaction_events(id) on delete cascade,
  milestone_id uuid references follow_up_milestones(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  check ((milestone_id is null) <> (task_id is null))
);
create unique index if not exists event_links_milestone_key on event_links (event_id, milestone_id) where milestone_id is not null;
create unique index if not exists event_links_task_key on event_links (event_id, task_id) where task_id is not null;

-- ---------------------------------------------------------------- entrada em lote
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references profiles(id),
  payload_hash text not null,
  origem text not null,
  consultado_em timestamptz not null,
  status text not null default 'previa' check (status in ('previa','confirmado','descartado')),
  created_at timestamptz not null default now(),
  unique (organization_id, payload_hash)   -- reenviar o mesmo lote não reprocessa
);

create table if not exists import_items (
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_index int not null,
  tipo text not null,
  chave_origem text,
  resultado text not null check (resultado in ('novo','atualizacao','duplicado','possivel_duplicidade','vinculo_pendente','conflito','erro')),
  payload jsonb not null,
  resolution jsonb,
  primary key (batch_id, row_index)
);

-- ---------------------------------------------------------------- números manuais do fechamento
create table if not exists daily_manual_figures (
  organization_id uuid not null references organizations(id) on delete cascade,
  day date not null,
  agenda_prevista int,
  agenda_realizada int,
  caixa_previsto numeric(12,2),
  caixa_recebido numeric(12,2),
  caixa_situacao text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, day)
);

-- ---------------------------------------------------------------- regras automáticas (atômicas)
-- Confirma um atendimento como realizado e cria/atualiza os 3 marcos na mesma transação.
-- Idempotente: chamar de novo com a mesma data não muda nada; com outra data, recalcula só
-- marcos ainda 'previsto' e sem evento vinculado. 6 meses = meses de calendário (o Postgres
-- ajusta para o último dia válido: 31/08 + 6 meses = 28/02).
create or replace function confirmar_atendimento_realizado(p_appointment_id uuid, p_data date, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a appointments%rowtype;
  k text;
  d date;
begin
  select * into a from appointments where id = p_appointment_id for update;
  if not found then raise exception 'atendimento inexistente'; end if;
  if a.anulado_em is not null then raise exception 'atendimento anulado não pode ser confirmado'; end if;
  if p_data is null then raise exception 'data exata do atendimento é obrigatória'; end if;
  if p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'data no futuro'; end if;

  update appointments set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    data_realizada = p_data,
    data_status = 'exata',
    realizado_confirmado_em = coalesce(realizado_confirmado_em, now()),
    realizado_confirmado_por = coalesce(realizado_confirmado_por, p_actor)
  where id = a.id;

  foreach k in array array['d30','d90','m6'] loop
    d := case k when 'd30' then p_data + 30 when 'd90' then p_data + 90 else (p_data + interval '6 months')::date end;
    insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current)
      values (a.organization_id, a.id, a.patient_id, k, d, d)
    on conflict (appointment_id, kind) do update
      set due_original = excluded.due_original, due_current = excluded.due_current, updated_at = now()
      where follow_up_milestones.status = 'previsto'
        and follow_up_milestones.due_original <> excluded.due_original
        and not exists (select 1 from event_links el where el.milestone_id = follow_up_milestones.id);
  end loop;
end $$;

-- Anula um lançamento feito por engano: marcos pendentes viram 'invalidado' (com motivo);
-- marcos já trabalhados são preservados. Só a gestão chama (checado no Route Handler).
create or replace function anular_atendimento(p_appointment_id uuid, p_motivo text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo é obrigatório'; end if;
  update appointments set anulado_em = now(), anulado_por = p_actor, anulado_motivo = p_motivo
    where id = p_appointment_id and anulado_em is null;
  if not found then raise exception 'atendimento inexistente ou já anulado'; end if;
  update follow_up_milestones m set status = 'invalidado', status_reason = p_motivo, updated_at = now()
    where m.appointment_id = p_appointment_id and m.status = 'previsto'
      and not exists (select 1 from event_links el where el.milestone_id = m.id);
end $$;

revoke all on function confirmar_atendimento_realizado(uuid, date, uuid) from public, anon, authenticated;
revoke all on function anular_atendimento(uuid, text, uuid) from public, anon, authenticated;
-- Só o service role (Route Handlers, depois da checagem de papel) executa as regras.
grant execute on function confirmar_atendimento_realizado(uuid, date, uuid) to service_role;
grant execute on function anular_atendimento(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------- RLS (leitura por organização; escrita só via service role)
alter table follow_up_milestones enable row level security;
alter table follow_up_milestone_history enable row level security;
alter table interaction_events enable row level security;
alter table event_links enable row level security;
alter table import_batches enable row level security;
alter table import_items enable row level security;
alter table daily_manual_figures enable row level security;

create policy "follow_up_milestones: read within org" on follow_up_milestones
  for select using (organization_id = current_profile_org());
create policy "follow_up_milestone_history: read via milestone org" on follow_up_milestone_history
  for select using (exists (select 1 from follow_up_milestones m where m.id = milestone_id and m.organization_id = current_profile_org()));
create policy "interaction_events: read within org" on interaction_events
  for select using (organization_id = current_profile_org());
create policy "event_links: read via event org" on event_links
  for select using (exists (select 1 from interaction_events e where e.id = event_id and e.organization_id = current_profile_org()));
create policy "import_batches: read within org" on import_batches
  for select using (organization_id = current_profile_org());
create policy "import_items: read via batch org" on import_items
  for select using (exists (select 1 from import_batches b where b.id = batch_id and b.organization_id = current_profile_org()));
create policy "daily_manual_figures: read within org" on daily_manual_figures
  for select using (organization_id = current_profile_org());

-- ---------------------------------------------------------------- verificação pós-escrita
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in ('follow_up_milestones','follow_up_milestone_history',
--   'interaction_events','event_links','import_batches','import_items','daily_manual_figures');      -- 7 linhas
-- select proname from pg_proc where proname in ('confirmar_atendimento_realizado','anular_atendimento'); -- 2 linhas
-- select ('2026-08-31'::date + interval '6 months')::date;                                            -- 2027-02-28
