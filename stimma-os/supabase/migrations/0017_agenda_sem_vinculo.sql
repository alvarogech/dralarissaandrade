-- STIMMA OS -- 0017: agenda do Simples Dental mesmo sem vinculo confirmado com a paciente
--
-- Ate aqui uma consulta lida do Simples Dental so era gravada se a paciente fosse vinculada com
-- certeza (codigo do SD ou telefone). A tela da agenda so expoe nome e data de nascimento, entao
-- toda paciente que ja existia no STIMMA OS com o mesmo nome caia em "revisar" e a consulta sumia
-- da agenda (27/10: 5 consultas lidas, 1 gravada). Agora a consulta e gravada sem paciente,
-- com o nome como aparece no SD e requires_review = true -- nunca se vincula por nome sozinho.
-- Aditiva e reversivel: nenhuma linha existente muda.

alter table appointments alter column patient_id drop not null;

alter table appointments add column if not exists sd_patient_name text;

-- Sem paciente so vale para o que veio do Simples Dental, com o nome lido e marcado para revisao.
alter table appointments drop constraint if exists appointments_paciente_ou_nome_sd;
alter table appointments add constraint appointments_paciente_ou_nome_sd
  check (patient_id is not null or (source = 'simples_dental_browser' and nullif(btrim(sd_patient_name), '') is not null and requires_review));

-- Reverter (se precisar, depois de vincular ou remover as linhas sem paciente):
--   alter table appointments drop constraint appointments_paciente_ou_nome_sd;
--   alter table appointments alter column patient_id set not null;
