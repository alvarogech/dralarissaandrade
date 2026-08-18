-- STIMMA OS -- 0010: colunas de idempotencia para a integracao com Chatwoot
-- Ver docs/WHATSAPP_ARCHITECTURE.md e docs/DECISIONS.md (2026-08-18).
-- Aditivo: nenhuma tabela existente perde dado.

alter table conversations
  add column if not exists chatwoot_conversation_id text;

create unique index if not exists conversations_chatwoot_conversation_id_key
  on conversations (chatwoot_conversation_id)
  where chatwoot_conversation_id is not null;

alter table patients
  add column if not exists chatwoot_contact_id text;

create unique index if not exists patients_chatwoot_contact_id_key
  on patients (chatwoot_contact_id)
  where chatwoot_contact_id is not null;

create unique index if not exists messages_external_message_id_key
  on messages (conversation_id, external_message_id)
  where external_message_id is not null;
