Continuação da migration 0013 (passos 3 e 4). O passo 2 já rodou e bateu com o esperado: 0 | 0 | 1 | 0 | 0 | 0. Não precisa repetir.

O SQL abaixo foi refeito para chegar intacto mesmo se as quebras de linha se perderem: não tem nenhum comentário "--" nem nenhum asterisco, e cada comando termina em ";". Cole-o exatamente como está, sem mudar nenhum caractere. Se as quebras de linha sumirem ao colar, tudo bem: não muda o resultado.

Regras: rode só o SQL deste prompt, no mesmo projeto stimma-os (ref fjxvseuopzhfwdraszvp) e no mesmo SQL Editor. Não altere dados. Se aparecer pedido de login, senha ou qualquer confirmação diferente da prevista, PARE e me avise.

Antes de clicar em Run, confira duas coisas no editor:
- o texto começa com "alter table interaction_events add column if not exists categoria text," e termina com "to service_role;";
- aparecem 19 ";" fora do corpo da função (entre os "$$" há outros ";", e isso é normal).

PASSO 3 — Aplicar a migration
Apague o editor, cole o SQL abaixo INTEIRO e clique em Run. O Supabase pode avisar "destructive operation" por causa de "drop constraint if exists" e "drop not null". É esperado: as constraints são recriadas mais amplas e nenhum dado é apagado. Pode confirmar esse aviso específico. Qualquer outro aviso ou erro: PARE e me mostre a mensagem exata.

===== INÍCIO DO SQL =====
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
===== FIM DO SQL =====

PASSO 4 — Verificação (só leitura)
Apague o editor e rode exatamente a consulta abaixo (ela usa count(1) de propósito, sem asterisco):

select (select count(1) from information_schema.columns where table_schema='public' and table_name='interaction_events' and column_name in ('categoria','contato','resposta','resultado','situacao','assunto','payload')) as colunas_novas_eventos, (select is_nullable from information_schema.columns where table_schema='public' and table_name='interaction_events' and column_name='patient_id') as patient_id_anulavel, (select count(1) from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='assunto') as tasks_assunto, (select count(1) from information_schema.columns where table_schema='public' and table_name='daily_manual_figures' and column_name in ('prioridades','secoes')) as colunas_novas_dia, (select string_agg(pg_get_function_identity_arguments(oid), ' | ') from pg_proc where proname='confirmar_atendimento_realizado') as assinaturas_funcao, (select count(1) from follow_up_milestones) as marcos_depois, (select count(1) from interaction_events) as eventos_depois, (select count(1) from tasks) as tarefas_depois;

Esperado:
- colunas_novas_eventos = 7
- patient_id_anulavel = YES
- tasks_assunto = 1
- colunas_novas_dia = 2
- assinaturas_funcao: duas assinaturas, uma com 3 argumentos e outra com 4 terminando em "p_marcos text[]"
- marcos_depois = 0, eventos_depois = 0, tarefas_depois = 0 (os mesmos números do passo 2)

Me devolva a tabela do passo 4 e qualquer aviso que tenha aparecido.
