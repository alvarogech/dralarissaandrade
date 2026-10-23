-- STIMMA OS — 0014: trabalho por perfil, comunicação na tarefa, entrega formal do feedback e
-- lote de entrada retomável. Aditiva: só cria tabelas/colunas, amplia constraints e preenche
-- configuração/estado novo; não apaga nem reclassifica dados existentes.
-- Ver docs/DECISIONS.md (2026-10-24). NÃO APLICADA. Aplicar pelo SQL Editor e rodar a verificação ao final.

-- ---------------------------------------------------------------- configuração da fila (por organização)
-- Quem é a concierge e o gestor, nome de exibição e expediente. Expediente começa NÃO configurado
-- (null): o sistema não presume horário de ninguém e não cobra entrega sem configuração.
create table if not exists fila_config (
  organization_id uuid primary key references organizations(id) on delete cascade,
  concierge_id uuid references profiles(id),
  concierge_nome text,
  gestor_id uuid references profiles(id),
  dias_expediente int[],                 -- 0 = domingo … 6 = sábado
  horario_fechamento time,
  excecoes date[] not null default '{}', -- dias sem expediente (feriados, folgas)
  dias_sem_atualizacao int not null default 3 check (dias_sem_atualizacao between 1 and 60),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- Concierge = a conta clinica.stimma@gmail.com com papel reception (identificação confirmada pelo
-- gestor em 2026-10-22). Gestor = o único admin ativo da mesma organização. Se qualquer uma das
-- duas não for inequívoca (zero ou mais de uma), fica null e a interface mostra "configuração pendente".
insert into fila_config (organization_id, concierge_id, concierge_nome, gestor_id)
select c.organization_id, c.id, 'Gabi',
  (select p.id from profiles p join user_roles ur on ur.user_id = p.id join roles r on r.id = ur.role_id
    where r.key = 'admin' and p.active and p.organization_id = c.organization_id
    and (select count(*) from profiles p2 join user_roles ur2 on ur2.user_id = p2.id join roles r2 on r2.id = ur2.role_id
         where r2.key = 'admin' and p2.active and p2.organization_id = c.organization_id) = 1)
from profiles c
join auth.users u on u.id = c.id
where lower(u.email) = 'clinica.stimma@gmail.com'
  and c.active
  and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = c.id and r.key = 'reception')
  and (select count(*) from auth.users u2 where lower(u2.email) = 'clinica.stimma@gmail.com') = 1
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------- tarefas: quem espera quem, prioridade, adiamentos
alter table tasks
  add column if not exists aguardando text,
  add column if not exists prioridade text,
  add column if not exists prazo_original date,
  add column if not exists adiamentos int not null default 0;

alter table tasks drop constraint if exists tasks_aguardando_check;
alter table tasks add constraint tasks_aguardando_check check (aguardando is null or aguardando in ('paciente','gestao'));
alter table tasks drop constraint if exists tasks_prioridade_check;
alter table tasks add constraint tasks_prioridade_check check (prioridade is null or prioridade in ('alta','normal','baixa'));

-- Tarefas que já estavam "aguardando" eram sempre resposta da paciente.
update tasks set aguardando = 'paciente' where status = 'waiting' and aguardando is null and kind is not null;

-- ---------------------------------------------------------------- eventos: mensagens no contexto da tarefa
-- 'nota' = orientação, pergunta/impedimento, resposta da gestão ou decisão (payload.tipo). Não conta
-- como contato nem como registro do feedback.
alter table interaction_events drop constraint if exists interaction_events_kind_check;
alter table interaction_events add constraint interaction_events_kind_check
  check (kind in ('contato','resposta','agendamento_obtido','cancelamento','recebimento_confirmado',
    'atendimento_realizado','adiamento','encerramento','encaminhamento','correcao','registro','nota'));

-- Leitura real do histórico por usuário (gravada ao abrir o detalhe da tarefa, não ao ver a lista).
create table if not exists task_reads (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

-- ---------------------------------------------------------------- entrega formal do feedback diário
create table if not exists daily_feedbacks (
  id uuid primary key,                   -- gerado no cliente: repetir o clique não duplica
  organization_id uuid not null references organizations(id) on delete cascade,
  day date not null,
  responsavel uuid not null references profiles(id),
  versao int not null,
  status text not null check (status in ('gerado','entregue')),
  texto text not null,
  contadores jsonb not null default '{}'::jsonb,
  eventos uuid[] not null default '{}',  -- registros que originaram o resumo
  substitui uuid references daily_feedbacks(id),
  gerado_em timestamptz not null default now(),
  entregue_em timestamptz,
  copiado_em timestamptz,                -- copiar não comprova envio
  whatsapp_confirmado_em timestamptz,    -- confirmação manual de quem enviou
  observacao_gestao text,
  ajuste_solicitado_em timestamptz,
  ajuste_solicitado_por uuid references profiles(id),
  unique (organization_id, day, responsavel, versao)
);
create index if not exists daily_feedbacks_dia_idx on daily_feedbacks (organization_id, day desc);

-- ---------------------------------------------------------------- lote de entrada retomável
alter table import_batches drop constraint if exists import_batches_status_check;
alter table import_batches add constraint import_batches_status_check
  check (status in ('previa','em_andamento','confirmado','descartado'));
alter table import_items
  add column if not exists aplicado_em timestamptz,
  add column if not exists erro text;
-- Lotes antigos: item aplicado = teve decisão (automática ou da gestão) e não foi ignorado.
update import_items i set aplicado_em = b.created_at
  from import_batches b
  where b.id = i.batch_id and i.aplicado_em is null and i.resolution is not null
    and coalesce(i.resolution->>'acao', '') <> 'ignorar';

-- ---------------------------------------------------------------- marcos sempre completos
-- A sobrecarga com p_marcos (0013) passa a ignorar a escolha: confirmar um atendimento realizado
-- sempre cria os três marcos (30 dias, 90 dias, 6 meses). Mesma transação, mesma trava.
create or replace function confirmar_atendimento_realizado(p_appointment_id uuid, p_data date, p_actor uuid, p_marcos text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform confirmar_atendimento_realizado(p_appointment_id, p_data, p_actor);
end $$;
revoke all on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) from public, anon, authenticated;
grant execute on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) to service_role;

-- Regularização: cria SÓ os marcos obrigatórios ausentes de atendimentos já confirmados com data
-- exata. Não altera datas nem status de marcos existentes, não registra contato. Idempotente.
insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current)
select a.organization_id, a.id, a.patient_id, k.kind,
  case k.kind when 'd30' then a.data_realizada + 30 when 'd90' then a.data_realizada + 90 else (a.data_realizada + interval '6 months')::date end,
  case k.kind when 'd30' then a.data_realizada + 30 when 'd90' then a.data_realizada + 90 else (a.data_realizada + interval '6 months')::date end
from appointments a
cross join (values ('d30'), ('d90'), ('m6')) as k(kind)
where a.realizado_confirmado_em is not null and a.anulado_em is null
  and a.data_status = 'exata' and a.data_realizada is not null
on conflict (appointment_id, kind) do nothing;

-- ---------------------------------------------------------------- RLS (leitura por organização; escrita só via service role)
alter table fila_config enable row level security;
alter table task_reads enable row level security;
alter table daily_feedbacks enable row level security;
drop policy if exists "fila_config: read within org" on fila_config;
create policy "fila_config: read within org" on fila_config for select using (organization_id = current_profile_org());
drop policy if exists "task_reads: read own" on task_reads;
create policy "task_reads: read own" on task_reads for select using (user_id = auth.uid());
drop policy if exists "daily_feedbacks: read within org" on daily_feedbacks;
create policy "daily_feedbacks: read within org" on daily_feedbacks for select using (organization_id = current_profile_org());

-- ---------------------------------------------------------------- verificação pós-escrita
-- select concierge_nome, concierge_id is not null as concierge_ok, gestor_id is not null as gestor_ok, dias_expediente, horario_fechamento from fila_config; -- 1 linha, Gabi, true, true, null, null
-- select count(1) from information_schema.columns where table_name = 'tasks' and column_name in ('aguardando','prioridade','prazo_original','adiamentos'); -- 4
-- select table_name from information_schema.tables where table_schema = 'public' and table_name in ('fila_config','task_reads','daily_feedbacks'); -- 3
-- select count(1) from import_items where aplicado_em is not null; -- itens aplicados dos lotes antigos
-- select count(1) from follow_up_milestones; -- igual ou maior que antes (nada apagado)
-- select a.id from appointments a where a.realizado_confirmado_em is not null and a.anulado_em is null and (a.data_realizada is null or a.data_status <> 'exata'); -- referência não confiável: revisar
