# Segurança — STIMMA OS

Dados de saúde e financeiros exigem cuidado elevado. Este documento é o contrato mínimo — toda
funcionalidade nova deve ser checada contra ele antes de "concluída" (ver Definition of Done em
`PROJECT_SPEC.md`).

## Autenticação e autorização

- Supabase Auth (e-mail/senha), mesmo padrão do `anamnese-app`. Sem cadastro público — usuário
  só existe se criado manualmente por quem administra.
- RBAC próprio do STIMMA OS (`roles`, `permissions`, `user_roles`) — não confundir com as 89
  permissões nativas do Simples Dental, que continuam vivendo lá.
- RLS em 100% das tabelas. Nenhuma tabela liberada para `anon`.
- Novo usuário nasce inativo (mesmo padrão do `anamnese-app`: trigger cria perfil `active =
  false`); ativação manual por quem administra.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` e qualquer token de automação **nunca** no frontend, nunca
  commitados. `.env.local` fora do git (`.gitignore`), `.env.example` documenta as chaves sem
  valores.
- Variáveis de produção só no painel do Netlify/Supabase.

## Audit log

Toda ação automatizada (Nível B, C e D quando aplicável) grava em `audit_logs`: quem, o quê,
quando, onde, por quê, qual informação originou a ação, qual resultado, se foi verificada.
`actor_type` distingue `human/system/claude/cowork/browser_automation`. Tabela append-only.

## Princípio EXECUTE → VERIFY → COMMIT

Nenhuma automação (interna ou via navegador) é considerada bem-sucedida só porque um clique ou
um `INSERT` foi disparado. Toda ação de automação relevante precisa: reexecutar uma leitura de
confirmação, comparar contra o esperado, e só então marcar sucesso em `automation_runs`.

## LGPD / minimização de dados

- STIMMA OS é gerencial: guarda IDs, status, valores e datas — não prontuário completo.
- Nenhum dado clínico em logs, notificações, prompts de IA ou analytics.
- Rascunhos de formulário (se algum existir no STIMMA OS) nunca em `localStorage`.
- Consentimento de comunicação por paciente é lido do Simples Dental (toggles nativos) antes de
  qualquer notificação — nunca assumido como positivo.

## STIMMA AI — limites de ferramenta

O agente de IA interno nunca executa SQL arbitrário em produção. Só chama ferramentas internas
tipadas e auditadas (`getTodayAppointments`, `getPatient`, `getFinancialSummary`,
`createTask`, `prepareFinancialAction`, etc. — ver `AUTOMATIONS.md`). `prepareFinancialAction`
prepara, nunca executa — execução é sempre Nível C (aprovação humana).

## Limites absolutos (nunca, mesmo com alta autonomia)

Não inventar dados; não inventar integração inexistente; não afirmar que testou sem ter
testado; não afirmar que sincronizou sem ter sincronizado; não presumir sucesso de automação;
não armazenar senha; não expor secret; não alterar dado clínico real por teste; não excluir
informação real; não fazer diagnóstico ou indicar tratamento; não enviar mensagem real ao
paciente sem a política de aprovação definida; não efetuar ação financeira irreversível sem
autorização.
