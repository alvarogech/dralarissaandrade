-- STIMMA OS — 0007: seed inicial (organizacao, roles, permissoes, equipe, parametros)
-- Dados reais de configuracao da clinica — NAO e dado de paciente fictício
-- misturado com produção; usar apenas em projeto de desenvolvimento/staging.

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Clínica Stimma');

insert into clinics (organization_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Clínica Stimma — unidade principal');

insert into roles (organization_id, key, label) values
  ('00000000-0000-0000-0000-000000000001', 'admin', 'Gestor geral'),
  ('00000000-0000-0000-0000-000000000001', 'professional', 'Profissional clínica'),
  ('00000000-0000-0000-0000-000000000001', 'reception', 'Recepção / comercial'),
  ('00000000-0000-0000-0000-000000000001', 'clinical_support', 'Apoio clínico (ASB)'),
  ('00000000-0000-0000-0000-000000000001', 'spa', 'SPA');

insert into permissions (key, label) values
  ('alerts.view', 'Ver alertas'),
  ('alerts.resolve', 'Resolver alertas'),
  ('tasks.view', 'Ver tarefas'),
  ('tasks.assign', 'Atribuir tarefas'),
  ('opportunities.view', 'Ver oportunidades'),
  ('opportunities.manage', 'Gerenciar oportunidades'),
  ('financial.view', 'Ver financeiro'),
  ('financial.approve', 'Aprovar ações financeiras (Nível C)'),
  ('team.view', 'Ver equipe'),
  ('settings.manage', 'Gerenciar configurações');

insert into business_goals (organization_id, key, label, value) values
  ('00000000-0000-0000-0000-000000000001', 'evaluation_price', 'Valor da avaliação', 250.00),
  ('00000000-0000-0000-0000-000000000001', 'evaluation_price_exceptional', 'Avaliação — condição excepcional', 100.00),
  ('00000000-0000-0000-0000-000000000001', 'monthly_new_plans_target', 'Meta de novos planos/mês', 5),
  ('00000000-0000-0000-0000-000000000001', 'daily_new_patient_target', 'Meta de aquisição — pacientes novos/dia útil', 1),
  ('00000000-0000-0000-0000-000000000001', 'annual_ticket_reference', 'Ticket anual de referência', 15000.00);

-- Nota: os perfis de Álvaro, Dra. Larissa, Gabi, Dine e Jaynnes sao criados
-- via Supabase Auth (Authentication -> Users), nao aqui — mesmo fluxo do
-- anamnese-app (ver stimma-os/README.md). Apos criar cada usuario, associar
-- a role correspondente em user_roles e marcar profiles.active = true.
