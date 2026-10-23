Tarefa: aplicar a migration 0014 (trabalho por perfil, comunicação na tarefa, entrega do feedback, lote retomável) no Supabase do STIMMA OS e verificar. Trabalhe só no SQL Editor deste projeto, siga os passos na ordem e, ao primeiro erro ou divergência, pare e me reporte o texto exato.

Regras:
- Não rode nenhum SQL além dos que estão abaixo. Não edite, não exclua e não altere dados por conta própria.
- Não altere configurações do projeto, chaves, usuários ou políticas fora do que a migration faz.
- Se aparecer pedido de login, senha ou confirmação diferente das previstas aqui, PARE e me avise.
- Todo SQL abaixo não tem comentários "--" nem asteriscos; cole exatamente como está. Se as quebras de linha sumirem ao colar, tudo bem.

PASSO 1 — Abrir o projeto certo
Projeto "stimma-os", ref fjxvseuopzhfwdraszvp, organização "larissaandrade.odonto@gmail.com's Org". Não use outro projeto nem o conector MCP do Supabase.
Abra https://supabase.com/dashboard/project/fjxvseuopzhfwdraszvp/sql/new, confirme nome e ref na URL e crie uma query nova e vazia. Se pedir login ou disser que não tem acesso, PARE e me avise.
Dica: em blocos longos, injete o SQL com monaco.editor.getEditors()[0].setValue(textoDoSQL) e confira que o editor ficou com o texto completo antes de clicar em Run.

PASSO 2 — Checagem prévia (só leitura)
Rode exatamente:

select (select count(1) from information_schema.tables where table_schema='public' and table_name in ('fila_config','task_reads','daily_feedbacks')) as tabelas_novas, (select count(1) from information_schema.columns where table_schema='public' and table_name='tasks' and column_name in ('aguardando','prioridade','prazo_original','adiamentos')) as colunas_novas_tasks, (select count(1) from auth.users where lower(email)='clinica.stimma@gmail.com') as contas_concierge, (select count(1) from profiles p join user_roles ur on ur.user_id=p.id join roles r on r.id=ur.role_id where r.key='admin' and p.active) as admins_ativos, (select count(1) from tasks) as tarefas_antes, (select count(1) from follow_up_milestones) as marcos_antes, (select count(1) from interaction_events) as eventos_antes, (select count(1) from import_items where resolution is not null and coalesce(resolution->>'acao','') <> 'ignorar') as itens_aplicados_lote_antigo;

Esperado: tabelas_novas = 0 e colunas_novas_tasks = 0 (se forem diferentes, a migration já foi aplicada: PARE e me mostre). contas_concierge e admins_ativos devem ser 1 cada; se não forem, NÃO pare — só me informe (a configuração fica pendente e o sistema avisa). Anote todos os números.

PASSO 3 — Aplicar a migration
Apague o editor, cole o SQL abaixo INTEIRO e clique em Run. Antes, confira que começa com "create table if not exists fila_config" e termina com "organization_id = current_profile_org());". O Supabase pode avisar "destructive operation" por causa de "drop constraint if exists" e "drop policy if exists": é esperado (são recriados na sequência, sem apagar dados) — pode confirmar esse aviso específico. Qualquer outro aviso ou erro: PARE e me mostre a mensagem exata.

===== INÍCIO DO SQL =====
create table if not exists fila_config ( organization_id uuid primary key references organizations(id) on delete cascade, concierge_id uuid references profiles(id), concierge_nome text, gestor_id uuid references profiles(id), dias_expediente int[], horario_fechamento time, excecoes date[] not null default '{}', dias_sem_atualizacao int not null default 3 check (dias_sem_atualizacao between 1 and 60), updated_by uuid references profiles(id), updated_at timestamptz not null default now() );

insert into fila_config (organization_id, concierge_id, concierge_nome, gestor_id) select c.organization_id, c.id, 'Gabi', (select p.id from profiles p join user_roles ur on ur.user_id = p.id join roles r on r.id = ur.role_id where r.key = 'admin' and p.active and p.organization_id = c.organization_id and (select count(1) from profiles p2 join user_roles ur2 on ur2.user_id = p2.id join roles r2 on r2.id = ur2.role_id where r2.key = 'admin' and p2.active and p2.organization_id = c.organization_id) = 1) from profiles c join auth.users u on u.id = c.id where lower(u.email) = 'clinica.stimma@gmail.com' and c.active and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = c.id and r.key = 'reception') and (select count(1) from auth.users u2 where lower(u2.email) = 'clinica.stimma@gmail.com') = 1 on conflict (organization_id) do nothing;

alter table tasks add column if not exists aguardando text, add column if not exists prioridade text, add column if not exists prazo_original date, add column if not exists adiamentos int not null default 0;

alter table tasks drop constraint if exists tasks_aguardando_check;

alter table tasks add constraint tasks_aguardando_check check (aguardando is null or aguardando in ('paciente','gestao'));

alter table tasks drop constraint if exists tasks_prioridade_check;

alter table tasks add constraint tasks_prioridade_check check (prioridade is null or prioridade in ('alta','normal','baixa'));

update tasks set aguardando = 'paciente' where status = 'waiting' and aguardando is null and kind is not null;

alter table interaction_events drop constraint if exists interaction_events_kind_check;

alter table interaction_events add constraint interaction_events_kind_check check (kind in ('contato','resposta','agendamento_obtido','cancelamento','recebimento_confirmado', 'atendimento_realizado','adiamento','encerramento','encaminhamento','correcao','registro','nota'));

create table if not exists task_reads ( task_id uuid not null references tasks(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade, read_at timestamptz not null default now(), primary key (task_id, user_id) );

create table if not exists daily_feedbacks ( id uuid primary key, organization_id uuid not null references organizations(id) on delete cascade, day date not null, responsavel uuid not null references profiles(id), versao int not null, status text not null check (status in ('gerado','entregue')), texto text not null, contadores jsonb not null default '{}'::jsonb, eventos uuid[] not null default '{}', substitui uuid references daily_feedbacks(id), gerado_em timestamptz not null default now(), entregue_em timestamptz, copiado_em timestamptz, whatsapp_confirmado_em timestamptz, observacao_gestao text, ajuste_solicitado_em timestamptz, ajuste_solicitado_por uuid references profiles(id), unique (organization_id, day, responsavel, versao) );

create index if not exists daily_feedbacks_dia_idx on daily_feedbacks (organization_id, day desc);

alter table import_batches drop constraint if exists import_batches_status_check;

alter table import_batches add constraint import_batches_status_check check (status in ('previa','em_andamento','confirmado','descartado'));

alter table import_items add column if not exists aplicado_em timestamptz, add column if not exists erro text;

update import_items i set aplicado_em = b.created_at from import_batches b where b.id = i.batch_id and i.aplicado_em is null and i.resolution is not null and coalesce(i.resolution->>'acao', '') <> 'ignorar';

create or replace function confirmar_atendimento_realizado(p_appointment_id uuid, p_data date, p_actor uuid, p_marcos text[]) returns void language plpgsql security definer set search_path = public as $$ begin perform confirmar_atendimento_realizado(p_appointment_id, p_data, p_actor); end $$;

revoke all on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) from public, anon, authenticated;

grant execute on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) to service_role;

insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current) select a.organization_id, a.id, a.patient_id, k.kind, case k.kind when 'd30' then a.data_realizada + 30 when 'd90' then a.data_realizada + 90 else (a.data_realizada + interval '6 months')::date end, case k.kind when 'd30' then a.data_realizada + 30 when 'd90' then a.data_realizada + 90 else (a.data_realizada + interval '6 months')::date end from appointments a cross join (values ('d30'), ('d90'), ('m6')) as k(kind) where a.realizado_confirmado_em is not null and a.anulado_em is null and a.data_status = 'exata' and a.data_realizada is not null on conflict (appointment_id, kind) do nothing;

alter table fila_config enable row level security;

alter table task_reads enable row level security;

alter table daily_feedbacks enable row level security;

drop policy if exists "fila_config: read within org" on fila_config;

create policy "fila_config: read within org" on fila_config for select using (organization_id = current_profile_org());

drop policy if exists "task_reads: read own" on task_reads;

create policy "task_reads: read own" on task_reads for select using (user_id = auth.uid());

drop policy if exists "daily_feedbacks: read within org" on daily_feedbacks;

create policy "daily_feedbacks: read within org" on daily_feedbacks for select using (organization_id = current_profile_org());
===== FIM DO SQL =====

PASSO 4 — Verificação (só leitura)
Apague o editor e rode exatamente:

select (select count(1) from information_schema.tables where table_schema='public' and table_name in ('fila_config','task_reads','daily_feedbacks')) as tabelas_novas, (select count(1) from information_schema.columns where table_schema='public' and table_name='tasks' and column_name in ('aguardando','prioridade','prazo_original','adiamentos')) as colunas_novas_tasks, (select concierge_nome from fila_config limit 1) as concierge_nome, (select concierge_id is not null from fila_config limit 1) as concierge_ok, (select gestor_id is not null from fila_config limit 1) as gestor_ok, (select dias_expediente is null and horario_fechamento is null from fila_config limit 1) as expediente_nao_configurado, (select count(1) from tasks) as tarefas_depois, (select count(1) from follow_up_milestones) as marcos_depois, (select count(1) from interaction_events) as eventos_depois, (select count(1) from import_items where aplicado_em is not null) as itens_aplicados, (select count(1) from appointments a where a.realizado_confirmado_em is not null and a.anulado_em is null and (a.data_realizada is null or a.data_status <> 'exata')) as atendimentos_para_revisar;

Esperado: tabelas_novas = 3; colunas_novas_tasks = 4; concierge_nome = Gabi; concierge_ok = true e gestor_ok = true (se o passo 2 deu 1 e 1); expediente_nao_configurado = true; tarefas_depois e eventos_depois iguais ao passo 2; marcos_depois igual ou maior que marcos_antes (só cria marcos obrigatórios que faltavam); itens_aplicados = itens_aplicados_lote_antigo; atendimentos_para_revisar = 0.

Me devolva as tabelas dos passos 2 e 4 completas e qualquer aviso que tenha aparecido.
