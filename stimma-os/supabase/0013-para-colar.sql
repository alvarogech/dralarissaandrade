alter table interaction_events add column if not exists categoria text, add column if not exists contato text, add column if not exists resposta text, add column if not exists resultado text, add column if not exists situacao text, add column if not exists assunto text, add column if not exists payload jsonb not null default '{}'::jsonb;

alter table interaction_events alter column patient_id drop not null;

alter table interaction_events drop constraint if exists interaction_events_kind_check;

alter table interaction_events add constraint interaction_events_kind_check check (kind in ('contato','resposta','agendamento_obtido','cancelamento','recebimento_confirmado', 'atendimento_realizado','adiamento','encerramento','encaminhamento','correcao','registro'));

alter table interaction_events drop constraint if exists interaction_events_contato_check;

alter table interaction_events add constraint interaction_events_contato_check check (contato is null or contato in ('sim','nao','na'));

alter table interaction_events drop constraint if exists interaction_events_resposta_check;

alter table interaction_events add constraint interaction_events_resposta_check check (resposta is null or resposta in ('sim','nao','na'));

alter table interaction_events drop constraint if exists interaction_events_categoria_check;

alter table interaction_events add constraint interaction_events_categoria_check check (categoria is null or categoria in ('agenda','oportunidade','recorrencia','continuidade', 'pos_atendimento','relacionamento','pendencia','encaminhamento'));

alter table interaction_events drop constraint if exists interaction_events_alvo_check;

alter table interaction_events add constraint interaction_events_alvo_check check (patient_id is not null or nullif(btrim(assunto), '') is not null);

alter table tasks add column if not exists assunto text;

alter table tasks drop constraint if exists tasks_kind_check;

alter table tasks add constraint tasks_kind_check check (kind is null or kind in ('cobranca','recuperacao_falta','continuidade','relacionamento','encaminhamento','outro', 'agenda','oportunidade','recorrencia','pos_atendimento','pendencia'));

alter table daily_manual_figures add column if not exists prioridades jsonb not null default '[]'::jsonb, add column if not exists secoes jsonb not null default '{}'::jsonb;

create or replace function confirmar_atendimento_realizado(p_appointment_id uuid, p_data date, p_actor uuid, p_marcos text[]) returns void language plpgsql security definer set search_path = public as $$ declare v_org uuid; v_patient uuid; v_anulado timestamptz; k text; d date; begin if p_marcos is null or not (p_marcos <@ array['d30','d90','m6']) then raise exception 'marcos inválidos'; end if; select organization_id, patient_id, anulado_em into v_org, v_patient, v_anulado from appointments where id = p_appointment_id for update; if not found then raise exception 'atendimento inexistente'; end if; if v_anulado is not null then raise exception 'atendimento anulado não pode ser confirmado'; end if; if p_data is null then raise exception 'data exata do atendimento é obrigatória'; end if; if p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'data no futuro'; end if; update appointments set status = 'completed', completed_at = coalesce(completed_at, now()), data_realizada = p_data, data_status = 'exata', realizado_confirmado_em = coalesce(realizado_confirmado_em, now()), realizado_confirmado_por = coalesce(realizado_confirmado_por, p_actor) where id = p_appointment_id; foreach k in array p_marcos loop d := case k when 'd30' then p_data + 30 when 'd90' then p_data + 90 else (p_data + interval '6 months')::date end; insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current) values (v_org, p_appointment_id, v_patient, k, d, d) on conflict (appointment_id, kind) do update set due_original = excluded.due_original, due_current = excluded.due_current, updated_at = now() where follow_up_milestones.status = 'previsto' and follow_up_milestones.due_original <> excluded.due_original and not exists (select 1 from event_links el where el.milestone_id = follow_up_milestones.id); end loop; end $$;

revoke all on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) from public, anon, authenticated;

grant execute on function confirmar_atendimento_realizado(uuid, date, uuid, text[]) to service_role;
