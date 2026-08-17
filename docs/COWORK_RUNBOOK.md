# Cowork Runbook — STIMMA OS

Rotinas operacionais candidatas a rodar via Claude Cowork (ou, na ausência de Cowork disponível
no ambiente, via execução manual assistida por Claude Code + Chrome). Nenhuma rotina abaixo foi
configurada/agendada de fato ainda — este documento é o desenho de referência para quando o
Sync Engine e a Fase 4 estiverem estáveis.

## Estado real da automação (2026-08-17) — leia antes de assumir que algo roda sozinho

Tentamos deixar a auditoria matinal 100% automática (sem ninguém disparar) e batemos em dois
bloqueios reais, não contornados:

1. **Rotina agendada na nuvem** (mecanismo disponível neste ambiente para "cron") roda em
   sandbox isolado — sem acesso ao Chrome pareado do usuário nem à rede local. Não consegue ler
   o Simples Dental de jeito nenhum.
2. **Agendador de Tarefas local do Windows** rodando o Claude Code sem supervisão exigiria
   `--dangerously-skip-permissions` (bloqueado pelo classificador de segurança do ambiente sem
   autorização explícita) e, mesmo com escopo de ferramentas restrito
   (`--permission-mode dontAsk` + `--allowedTools`), o processo novo não estava autenticado
   ("Not logged in") — a sessão interativa não empresta login para um processo disparado de
   fora. Resolver isso exigiria o usuário rodar `claude /login` nesse contexto ou configurar uma
   chave de API separada — decisão dele, não tomada aqui.

**O que existe de verdade hoje**: um **gatilho manual intuitivo** — o comando
`/sync-agenda` (definido em `.claude/commands/sync-agenda.md`). O usuário roda esse comando
dentro de uma sessão normal do Claude Code (com supervisão normal, sem bypass de permissão), e
o Claude: lê a agenda de hoje no Simples Dental, normaliza, chama
`POST /api/sync/agenda` (https://stimma-os-gestor.netlify.app), e reporta quantos pacientes/
compromissos foram criados, atualizados, ficaram sem mudança, ou caíram em `requiresReview`. É
idempotente — pode rodar várias vezes no mesmo dia sem duplicar nada.

As rotinas abaixo continuam sendo o desenho de referência para quando (a) o usuário resolver o
login/autenticação de um processo não-interativo, ou (b) houver acesso real ao Claude Cowork.

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
