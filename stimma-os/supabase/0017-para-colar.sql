alter table appointments alter column patient_id drop not null;
alter table appointments add column if not exists sd_patient_name text;
alter table appointments drop constraint if exists appointments_paciente_ou_nome_sd;
alter table appointments add constraint appointments_paciente_ou_nome_sd check (patient_id is not null or (source = 'simples_dental_browser' and nullif(btrim(sd_patient_name), '') is not null and requires_review));
