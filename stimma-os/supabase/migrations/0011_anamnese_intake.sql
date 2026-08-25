-- STIMMA OS -- 0011: coluna de e-mail para receber a integracao com o anamnese-app
-- Ver docs/ANAMNESE_INTAKE.md. Aditivo: nenhuma tabela existente perde dado.

alter table patients
  add column if not exists email text;
