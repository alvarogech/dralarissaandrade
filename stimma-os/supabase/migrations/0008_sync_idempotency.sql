-- STIMMA OS -- 0008: colunas de idempotencia para o Sync Engine
-- Ver docs/INTEGRATIONS.md. appointments ainda nao tinha source_fingerprint/
-- last_seen_at/last_synced_at (so patient_external_ids tinha, na 0002).

alter table appointments
  add column if not exists source_fingerprint text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists requires_review boolean not null default false;

-- Idempotencia real: mesmo compromisso do Simples Dental nunca vira duas
-- linhas. NULL em sd_appointment_id fica de fora do indice (compromissos
-- criados manualmente no STIMMA OS nao tem esse identificador).
create unique index if not exists appointments_source_external_id_key
  on appointments (source, sd_appointment_id)
  where sd_appointment_id is not null;
