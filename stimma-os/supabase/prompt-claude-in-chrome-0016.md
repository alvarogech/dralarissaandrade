Tarefa: aplicar a migration 0016 (quantidades da rotina e links da rotina) no Supabase do STIMMA OS e verificar. Trabalhe só no SQL Editor deste projeto, siga os passos na ordem e, ao primeiro erro ou divergência, pare e me reporte o texto exato.

Regras:
- Não rode nenhum SQL além dos que estão abaixo. Não edite, não exclua e não altere dados.
- Não altere configurações do projeto, chaves, usuários ou políticas.
- Se aparecer pedido de login, senha ou qualquer confirmação/aviso, PARE e me avise (esta migration não tem "drop": não deve aparecer aviso de operação destrutiva).
- O SQL abaixo não tem comentários nem asteriscos; cole exatamente como está. Se as quebras de linha sumirem ao colar, tudo bem.

PASSO 1 — Abrir o projeto certo
Projeto "stimma-os", ref fjxvseuopzhfwdraszvp, organização "larissaandrade.odonto@gmail.com's Org". Não use outro projeto nem o conector MCP do Supabase.
Abra https://supabase.com/dashboard/project/fjxvseuopzhfwdraszvp/sql/new, confirme nome e ref na URL e crie uma query nova e vazia. Se pedir login ou disser que não tem acesso, PARE e me avise.

PASSO 2 — Checagem prévia (só leitura)
Rode exatamente:

select (select count(1) from information_schema.columns where table_schema='public' and table_name='daily_routine_items' and column_name='metricas') as col_metricas, (select count(1) from information_schema.columns where table_schema='public' and table_name='fila_config' and column_name='links_rotina') as col_links, (select count(1) from daily_routine_items) as rotina_antes, (select count(1) from fila_config) as config_antes, (select count(1) from tasks) as tarefas_antes;

Esperado: col_metricas = 0 e col_links = 0 (se algum for 1, PARE e me mostre). Anote os outros números.

PASSO 3 — Aplicar a migration
Apague o editor, cole o SQL abaixo INTEIRO e clique em Run. Confira antes que começa com "alter table daily_routine_items add column if not exists metricas" e termina com "end if; end $$;".

===== INÍCIO DO SQL =====
alter table daily_routine_items add column if not exists metricas jsonb not null default '{}'::jsonb; do $$ begin if not exists (select 1 from pg_constraint where conname = 'daily_routine_items_metricas_objeto') then alter table daily_routine_items add constraint daily_routine_items_metricas_objeto check (jsonb_typeof(metricas) = 'object'); end if; end $$; alter table fila_config add column if not exists links_rotina jsonb not null default '{}'::jsonb; do $$ begin if not exists (select 1 from pg_constraint where conname = 'fila_config_links_rotina_objeto') then alter table fila_config add constraint fila_config_links_rotina_objeto check (jsonb_typeof(links_rotina) = 'object'); end if; end $$;
===== FIM DO SQL =====

PASSO 4 — Verificação (só leitura)
Apague o editor e rode exatamente:

select (select count(1) from information_schema.columns where table_schema='public' and table_name='daily_routine_items' and column_name='metricas') as col_metricas, (select count(1) from information_schema.columns where table_schema='public' and table_name='fila_config' and column_name='links_rotina') as col_links, (select count(1) from pg_constraint where conname in ('daily_routine_items_metricas_objeto','fila_config_links_rotina_objeto')) as checks, (select count(1) from daily_routine_items) as rotina_depois, (select count(1) from fila_config) as config_depois, (select count(1) from tasks) as tarefas_depois;

Esperado: col_metricas = 1, col_links = 1, checks = 2, e rotina/config/tarefas iguais ao passo 2.
Me devolva as tabelas dos passos 2 e 4 completas e qualquer aviso que tenha aparecido.
