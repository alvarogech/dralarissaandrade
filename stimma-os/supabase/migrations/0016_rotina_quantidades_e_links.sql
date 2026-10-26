-- STIMMA OS — 0016: quantidades da rotina diária e links configuráveis da rotina.
-- Aditiva: só cria colunas (com padrão vazio) e checks; não altera nem apaga dados existentes,
-- não mexe em políticas. Aplicada em 26/10/2026 pelo SQL Editor (verificação: colunas 1 e 1, checks 2, contagens inalteradas).
--
-- daily_routine_items.metricas: quantidades por item da rotina (ex.: pendências revisadas,
--   cobranças efetuadas, respostas aguardadas, contatos realizados, "precisa conferir").
--   Só números e sim/não — nunca nomes, telefones, valores ou dados bancários (validado no servidor,
--   lib/fila/rotina-itens.ts → normalizarMetricas). Sem a coluna, a rotina funciona, mas as
--   quantidades não são salvas (a tela avisa).
-- fila_config.links_rotina: links configurados pela gestão (ex.: {"script_aniversario": "https://…"}).
--   Sem link, o item da rotina aparece sem botão (nenhuma URL é inventada).

alter table daily_routine_items add column if not exists metricas jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_routine_items_metricas_objeto') then
    alter table daily_routine_items add constraint daily_routine_items_metricas_objeto check (jsonb_typeof(metricas) = 'object');
  end if;
end $$;

alter table fila_config add column if not exists links_rotina jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fila_config_links_rotina_objeto') then
    alter table fila_config add constraint fila_config_links_rotina_objeto check (jsonb_typeof(links_rotina) = 'object');
  end if;
end $$;

-- verificação pós-escrita
-- select (select count(1) from information_schema.columns where table_name = 'daily_routine_items' and column_name = 'metricas') as col_metricas, -- 1
--        (select count(1) from information_schema.columns where table_name = 'fila_config' and column_name = 'links_rotina') as col_links;      -- 1
