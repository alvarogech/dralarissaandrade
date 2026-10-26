alter table daily_routine_items add column if not exists metricas jsonb not null default '{}'::jsonb;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'daily_routine_items_metricas_objeto') then alter table daily_routine_items add constraint daily_routine_items_metricas_objeto check (jsonb_typeof(metricas) = 'object'); end if; end $$;

alter table fila_config add column if not exists links_rotina jsonb not null default '{}'::jsonb;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'fila_config_links_rotina_objeto') then alter table fila_config add constraint fila_config_links_rotina_objeto check (jsonb_typeof(links_rotina) = 'object'); end if; end $$;
