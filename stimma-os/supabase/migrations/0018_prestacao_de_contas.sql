-- STIMMA OS -- 0018: prestacao de contas da concierge (conferencia de recebimentos e rascunho)
--
-- 1. Conferencia de recebimentos do dia: totais previsto x recebido conferidos no Simples Dental
--    (fonte oficial). Sem valor por paciente, sem dado bancario ou de cartao. Tabela propria, SEM
--    politica de leitura para o navegador: so o servidor (service role) le e grava, depois de
--    conferir que quem pede e a concierge configurada ou a gestao.
-- 2. Rascunho do fechamento (observacao, decisoes, prioridades revisadas) no estado do dia, para
--    nao depender do navegador.
-- Aditiva e reversivel: nenhuma linha existente muda.

create table if not exists daily_cash_reviews (
  organization_id uuid not null references organizations(id) on delete cascade,
  day date not null,
  situacao text not null check (situacao in ('conferido', 'sem_recebimentos')),
  previsto numeric(12,2) check (previsto is null or previsto >= 0),
  recebido numeric(12,2) check (recebido is null or recebido >= 0),
  justificativa text,
  conferido_por uuid references profiles(id),
  conferido_em timestamptz not null default now(),
  primary key (organization_id, day),
  check (situacao = 'sem_recebimentos' or (previsto is not null and recebido is not null))
);

alter table daily_cash_reviews enable row level security;
-- Intencional: nenhuma policy de select/insert para authenticated. Valores financeiros nao sao
-- lidos pelo navegador; a tela consulta pela API, que confere o perfil no servidor.

alter table daily_manual_figures add column if not exists rascunho jsonb;

-- Reverter:
--   drop table daily_cash_reviews;
--   alter table daily_manual_figures drop column rascunho;
