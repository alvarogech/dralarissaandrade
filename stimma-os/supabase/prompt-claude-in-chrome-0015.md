Tarefa: aplicar a migration 0015 (rotina diária da concierge) no Supabase do STIMMA OS e verificar. Trabalhe só no SQL Editor deste projeto, siga os passos na ordem e, ao primeiro erro ou divergência, pare e me reporte o texto exato.

Regras:
- Não rode nenhum SQL além dos que estão abaixo. Não edite, não exclua e não altere dados.
- Não altere configurações do projeto, chaves, usuários ou políticas fora do que a migration faz.
- Se aparecer pedido de login, senha ou confirmação diferente das previstas aqui, PARE e me avise.
- O SQL abaixo não tem comentários nem asteriscos; cole exatamente como está. Se as quebras de linha sumirem ao colar, tudo bem.

PASSO 1 — Abrir o projeto certo
Projeto "stimma-os", ref fjxvseuopzhfwdraszvp, organização "larissaandrade.odonto@gmail.com's Org". Não use outro projeto nem o conector MCP do Supabase.
Abra https://supabase.com/dashboard/project/fjxvseuopzhfwdraszvp/sql/new, confirme nome e ref na URL e crie uma query nova e vazia. Se pedir login ou disser que não tem acesso, PARE e me avise.

PASSO 2 — Checagem prévia (só leitura)
Rode exatamente:

select (select count(1) from information_schema.tables where table_schema='public' and table_name='daily_routine_items') as tabela_rotina, (select count(1) from tasks) as tarefas_antes, (select count(1) from interaction_events) as eventos_antes, (select count(1) from daily_feedbacks) as feedbacks_antes;

Esperado: tabela_rotina = 0 (se for 1, a migration já foi aplicada: PARE e me mostre). Anote os outros números.

PASSO 3 — Aplicar a migration
Apague o editor, cole o SQL abaixo INTEIRO e clique em Run. Confira antes que começa com "create table if not exists daily_routine_items" e termina com "organization_id = current_profile_org());". O Supabase pode avisar "destructive operation" por causa de "drop policy if exists": é esperado (a política é recriada na sequência) — pode confirmar esse aviso específico. Qualquer outro aviso ou erro: PARE e me mostre a mensagem exata.

===== INÍCIO DO SQL =====
create table if not exists daily_routine_items ( organization_id uuid not null references organizations(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade, day date not null, item_key text not null, estado text not null check (estado in ('a_fazer','feito','nao_se_aplica','impedimento')), motivo text, proxima_acao text, prazo date, responsavel text, task_id uuid references tasks(id) on delete set null, updated_by uuid not null references profiles(id), updated_at timestamptz not null default now(), primary key (organization_id, user_id, day, item_key), check (estado <> 'impedimento' or (nullif(btrim(motivo), '') is not null and nullif(btrim(proxima_acao), '') is not null)) );

create index if not exists daily_routine_items_dia_idx on daily_routine_items (organization_id, day);

alter table daily_routine_items enable row level security;

drop policy if exists "daily_routine_items: read within org" on daily_routine_items;

create policy "daily_routine_items: read within org" on daily_routine_items for select using (organization_id = current_profile_org());
===== FIM DO SQL =====

PASSO 4 — Verificação (só leitura)
Apague o editor e rode exatamente:

select (select count(1) from information_schema.tables where table_schema='public' and table_name='daily_routine_items') as tabela_rotina, (select count(1) from daily_routine_items) as linhas_rotina, (select count(1) from pg_policies where tablename='daily_routine_items') as politicas, (select count(1) from tasks) as tarefas_depois, (select count(1) from interaction_events) as eventos_depois, (select count(1) from daily_feedbacks) as feedbacks_depois;

Esperado: tabela_rotina = 1, linhas_rotina = 0, politicas = 1, e tarefas/eventos/feedbacks iguais ao passo 2.

Me devolva as tabelas dos passos 2 e 4 completas e qualquer aviso que tenha aparecido.
