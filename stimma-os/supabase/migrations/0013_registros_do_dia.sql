-- STIMMA OS — 0013: registros do dia da concierge (aditiva, sem remover nem reclassificar dados)
-- Ver docs/DECISIONS.md (2026-10-23). NÃO APLICADA. Aplicar pelo SQL Editor e rodar a verificação ao final.
--
-- 1. Eventos ganham campos explícitos do registro (contato/resposta sim|não|não se aplica,
--    resultado, situação, categoria) e podem existir sem paciente (alerta administrativo com assunto).
-- 2. Tarefas ganham tipos de acompanhamento novos e podem ter "assunto" sem paciente.
-- 3. Estado do dia: prioridades escolhidas (até 5) e seções marcadas "sem ocorrências".
-- 4. Marcos passam a ser escolhidos por atendimento (nova assinatura da função; a antiga continua).

-- ---------------------------------------------------------------- eventos
alter table interaction_events
  add column if not exists categoria text,
  add column if not exists contato text,
  add column if not exists resposta text,
  add column if not exists resultado text,
  add column if not exists situacao text,
  add column if not exists assunto text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

-- Assunto sem paciente (ex.: pendência administrativa). Afrouxar NOT NULL não altera dado existente.
alter table interaction_events alter column patient_id drop not null;

alter table interaction_events drop constraint if exists interaction_events_kind_check;
alter table interaction_events add constraint interaction_events_kind_check
  check (kind in ('contato','resposta','agendamento_obtido','cancelamento','recebimento_confirmado',
    'atendimento_realizado','adiamento','encerramento','encaminhamento','correcao','registro'));

alter table interaction_events drop constraint if exists interaction_events_contato_check;
alter table interaction_events add constraint interaction_events_contato_check
  check (contato is null or contato in ('sim','nao','na'));
alter table interaction_events drop constraint if exists interaction_events_resposta_check;
alter table interaction_events add constraint interaction_events_resposta_check
  check (resposta is null or resposta in ('sim','nao','na'));
alter table interaction_events drop constraint if exists interaction_events_categoria_check;
alter table interaction_events add constraint interaction_events_categoria_check
  check (categoria is null or categoria in ('agenda','oportunidade','recorrencia','continuidade',
    'pos_atendimento','relacionamento','pendencia','encaminhamento'));
alter table interaction_events drop constraint if exists interaction_events_alvo_check;
alter table interaction_events add constraint interaction_events_alvo_check
  check (patient_id is not null or nullif(btrim(assunto), '') is not null);

-- ---------------------------------------------------------------- tarefas (casos)
alter table tasks add column if not exists assunto text;

alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check
  check (kind is null or kind in ('cobranca','recuperacao_falta','continuidade','relacionamento','encaminhamento','outro',
    'agenda','oportunidade','recorrencia','pos_atendimento','pendencia'));

-- ---------------------------------------------------------------- estado do dia
alter table daily_manual_figures
  add column if not exists prioridades jsonb not null default '[]'::jsonb,
  add column if not exists secoes jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- marcos escolhidos por atendimento
-- Mesma regra da 0012, mas cria/recalcula só os marcos indicados (subconjunto de d30/d90/m6).
-- Marcos já existentes de tipos não escolhidos são preservados (nunca apagados nem reclassificados).
create or replace function confirmar_atendimento_realizado(p_appointment_id uuid, p_data date, p_actor uuid, p_marcos text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_patient uuid;
  v_anulado timestamptz;
  k text;
  d date;
begin
  if p_marcos is null or not (p_marcos <@ array['d30','d90','m6']) then raise exception 'marcos inválidos'; end if;
  select organization_id, patient_id, anulado_em into v_org, v_patient, v_anulado
    from appointments where id = p_appointment_id for update;
  if not found then raise exception 'atendimento inexistente'; end if;
  if v_anulado is not null then raise exception 'atendimento anulado não pode ser confirmado'; end if;
  if p_data is null then raise exception 'data exata do atendimento é obrigatória'; end if;
  if p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'data no futuro'; end if;

  update appointments set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    data_realizada = p_data,
    data_status = 'exata',
    realizado_confirmado_em = coalesce(realizado_confirmado_em, now()),
    realizado_confirmado_por = coalesce(realizado_confirmado_por, p_actor)
  where id = p_appointment_id;

  foreach k in array p_marcos loop
    d := case k when 'd30' then p_data + 30 when 'd90' then p_data + 90 else (p_data + interval '6 months')::date end;
    insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current)
      values (v_org, p_appointment_id, v_patient, k, d, d)
    on conflict (appointment_id, kind) do update
      set due_original = excluded.due_original, due_current = excluded.due_current, updated_at = now()
      where follow_up_milestones.status = 'previsto'
        and follow_up_milestones.due_original <> excluded.due_original
        and not exists (select 1 from event_links el where el.milestone_id = follow_up_milestones.id);
  end loop;
end $$;

revoke all on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) from public, anon, authenticated;
grant execute on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) to service_role;

-- ---------------------------------------------------------------- verificação pós-escrita
-- select column_name from information_schema.columns where table_name = 'interaction_events'
--   and column_name in ('categoria','contato','resposta','resultado','situacao','assunto','payload');   -- 7 linhas
-- select is_nullable from information_schema.columns where table_name = 'interaction_events' and column_name = 'patient_id'; -- YES
-- select column_name from information_schema.columns where table_name = 'daily_manual_figures' and column_name in ('prioridades','secoes'); -- 2
-- select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'confirmar_atendimento_realizado'; -- 2 linhas (3 e 4 argumentos)
-- select count(*) from follow_up_milestones; -- mesmo número de antes (nada apagado)
