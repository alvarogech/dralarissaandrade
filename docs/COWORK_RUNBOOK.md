# Cowork Runbook — STIMMA OS

Rotinas operacionais candidatas a rodar via Claude Cowork (ou, na ausência de Cowork disponível
no ambiente, via execução manual assistida por Claude Code + Chrome). Nenhuma rotina abaixo foi
configurada/agendada de fato ainda — este documento é o desenho de referência para quando o
Sync Engine e a Fase 4 estiverem estáveis.

## 07:00 — Auditoria matinal

- **Objetivo**: sincronizar agenda e financeiro do dia antes do início do expediente.
- **Frequência**: diária, dias úteis.
- **Prompt**: "Abra o Simples Dental (sessão já autenticada), leia a agenda do dia da Dra.
  Larissa, confira confirmações pendentes, detecte horários vazios relevantes, e sincronize os
  eventos no STIMMA OS. Não altere nada — apenas leia."
- **Sites**: `app.simplesdental.com` (Agenda, Inteligência).
- **Entradas**: nenhuma (sessão já autenticada).
- **Ações permitidas**: navegação, leitura, export estruturado quando disponível.
- **Ações proibidas**: qualquer clique que altere status, valor ou dado de paciente.
- **Saída esperada**: eventos `appointment.*` no Event Store; alerta se a estrutura da tela
  mudou (`automation.requires_review`).
- **Regra de aprovação**: nenhuma — Nível A (somente leitura).
- **Tratamento de erro**: se a sessão não estiver autenticada, parar e notificar Álvaro — nunca
  solicitar/armazenar senha.

## Verificação periódica de agenda (durante o dia)

- **Objetivo**: capturar novos agendamentos, cancelamentos e alterações sem polling excessivo.
- **Frequência**: a definir conforme volume real de agenda (evitar polling contínuo; preferir
  intervalo de dezenas de minutos, não segundos).
- **Ações permitidas/proibidas**: mesmas da auditoria matinal.
- **Saída esperada**: eventos incrementais (delta desde o último `last_synced_at`).

## Pós-atendimento (ao longo do dia)

- **Objetivo**: identificar atendimentos concluídos, conferir pagamento e próximo passo.
- **Frequência**: acionada por evento (novo `Finalizada` na agenda), não por horário fixo.
- **Saída esperada**: dispara a sequência de `AUTOMATIONS.md` (pós-atendimento automático).
- **Regra de aprovação**: Nível A/B — gera alerta/tarefa automaticamente; não lança pagamento.

## Fim do dia

- **Objetivo**: base de dados para o `STIMMA CLOSE`.
- **Ações**: auditoria financeira do dia, conferência de agenda, tarefas em aberto,
  oportunidades novas/atualizadas.
- **Regra de aprovação**: Nível A (leitura e agregação).

## Semanal / Mensal

- **Objetivo**: base de dados para `STIMMA WEEKLY` e `BUSINESS REVIEW`.
- **Ações**: agregação de métricas já coletadas nas rotinas diárias — não requer nova leitura
  pesada do Simples Dental além do incremental já sincronizado.

## Tratamento de erro (regra geral de todas as rotinas)

Se a estrutura esperada da página não for encontrada (seletor semântico ausente, texto
diferente do esperado), a rotina para aquele item específico, registra
`automation.requires_review` com o que foi observado, e segue para o próximo item — nunca
"adivinha" e executa uma ação potencialmente errada.
