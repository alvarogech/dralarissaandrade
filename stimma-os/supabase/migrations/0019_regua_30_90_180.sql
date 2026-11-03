-- STIMMA OS -- 0019: régua de acompanhamento 30 · 90 · 180 dias (decisão da gestão, 29/10/2026)
--
-- O terceiro marco era "6 meses" de calendário. Passa a ser 180 dias CORRIDOS a partir do
-- atendimento de referência. O código interno continua 'm6' (restrição do banco e registros
-- existentes); muda a data e o nome exibido ("Acompanhamento de 180 dias").
--
-- Segurança dos dados:
--   * nada é apagado; históricos concluídos, contatados, dispensados ou invalidados não mudam;
--   * só marcos m6 FUTUROS, ainda 'previsto', sem registro vinculado e nunca adiados
--     (due_current = due_original) e cuja data veio da regra antiga são recalculados;
--   * se a nova data já tiver passado, o marco fica como está (não vira atraso de repente);
--   * o gatilho trg_follow_up_milestone_history grava 'datas_recalculadas' com a data antiga e a
--     nova, então a data originalmente registrada fica no histórico.
-- Não existe marco de 60 dias no banco (60 dias só existiu na rotina da concierge, já removido).

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
    d := case k when 'd30' then p_data + 30 when 'd90' then p_data + 90 else p_data + 180 end;
    insert into follow_up_milestones (organization_id, appointment_id, patient_id, kind, due_original, due_current)
      values (a.organization_id, a.id, a.patient_id, k, d, d)
    on conflict (appointment_id, kind) do update
      set due_original = excluded.due_original, due_current = excluded.due_current, updated_at = now()
      where follow_up_milestones.status = 'previsto'
        and follow_up_milestones.due_original <> excluded.due_original
        and not exists (select 1 from event_links el where el.milestone_id = follow_up_milestones.id);
  end loop;
end $$;

revoke all on function confirmar_atendimento_realizado(uuid, date, uuid) from public, anon, authenticated;
grant execute on function confirmar_atendimento_realizado(uuid, date, uuid) to service_role;

update follow_up_milestones m
   set due_original = a.data_realizada + 180, due_current = a.data_realizada + 180, updated_at = now()
  from appointments a
 where a.id = m.appointment_id
   and m.kind = 'm6'
   and m.status = 'previsto'
   and m.due_current = m.due_original
   and a.data_realizada is not null
   and m.due_original = (a.data_realizada + interval '6 months')::date
   and m.due_original <> a.data_realizada + 180
   and a.data_realizada + 180 >= (now() at time zone 'America/Sao_Paulo')::date
   and not exists (select 1 from event_links el where el.milestone_id = m.id);

-- Verificação pós-escrita:
-- select count(*) from follow_up_milestones;                                   -- mesmo número de antes
-- select count(*) from follow_up_milestones m join appointments a on a.id = m.appointment_id
--   where m.kind = 'm6' and m.status = 'previsto' and m.due_current = m.due_original
--     and m.due_original = (a.data_realizada + interval '6 months')::date
--     and a.data_realizada + 180 >= current_date and m.due_original <> a.data_realizada + 180
--     and not exists (select 1 from event_links el where el.milestone_id = m.id);  -- 0
-- select count(*) from follow_up_milestone_history where change = 'datas_recalculadas' and changed_at > now() - interval '1 hour';
-- Reverter: recriar a função da 0012 (6 months) e, se preciso, voltar as datas pelo histórico.
