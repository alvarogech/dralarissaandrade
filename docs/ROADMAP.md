# Roadmap — STIMMA OS

## Fase 0 — Discovery real ✅ (2026-08-13)

Sessão do Simples Dental já autenticada explorada em modo somente-leitura. Resultado:
[`SIMPLES_DENTAL_MAP.md`](./SIMPLES_DENTAL_MAP.md).

## Fase 1 — Fundação (em andamento)

Projeto Next.js `stimma-os/`, projeto Supabase dedicado, schema inicial (`DATABASE.md`), auth,
RBAC próprio, design system, layout base, Event Store, audit log, dados seed.

## Fase 2 — Cockpit

Tela "Hoje" (Precisa de você / Prioridades do dia / Hoje na clínica / Feed ao vivo), Agenda,
Tarefas, Alertas, Oportunidades — operando sobre dados seed/manuais primeiro, para provar UX e
lógica antes de depender do sync real.

## Fase 3 — Inteligência

`RuleEngine`, `AlertEngine`, `OpportunityEngine` com o subconjunto P0 de `BUSINESS_RULES.md`;
`STIMMA BRIEF`/`CLOSE`; relatórios iniciais.

## Fase 4 — Simples Dental (leitura)

Sync Engine real via Claude in Chrome/Cowork + exportações estruturadas. Meta: baixa taxa de
`requires_review` antes de avançar para escrita.

**Primeira leitura real feita manualmente em 2026-08-17**: os 5 atendimentos reais confirmados
na agenda da Dra. Larissa do dia foram lidos do Simples Dental (somente leitura, via Chrome já
autenticado) e gravados em `patients`/`appointments` no Supabase, com aprovação explícita do
usuário antes da escrita. Isso foi um pull manual único, sem matching por `external_id` — as 5
linhas ficaram sem `sd_appointment_id`.

**Sync Engine construído em 2026-08-17** (`stimma-os/lib/sync/`): motor determinístico e
testado (27 testes, incluindo um fake do Supabase em memória para nunca precisar tocar dado
real em teste) que recebe compromissos já normalizados (a extração da tela continua sendo
agêntica — Chrome/Cowork) e faz:

- **Matching de paciente**: por `patient_external_ids` (source + external_id) primeiro; sem
  isso, por telefone (match único e confiável); nome sozinho **nunca** vincula automaticamente
  — vira `requires_review`, mesmo com match único (`lib/sync/patient-matching.ts`).
- **Idempotência de compromisso**: fingerprint do conteúdo relevante
  (`lib/sync/fingerprint.ts`) + índice único `(source, sd_appointment_id)` — rodar de novo com
  o mesmo conteúdo não duplica nem gera evento; conteúdo diferente atualiza em vez de duplicar.
- **Sem `sd_appointment_id`**: cria mas marca `requires_review = true` na própria linha —
  honesto sobre não conseguir deduplicar isso num próximo pull.
- Registra `automation_runs` e `audit_logs` (`actor_type = 'claude'`) a cada execução.

Exposto em `POST /api/sync/agenda` (protegido por `SYNC_API_SECRET`), testado de ponta a ponta
contra o banco real em produção (autenticação errada → 401; payload vazio → grava
`automation_runs`/`audit_logs` reais, confirmado por consulta). **O que ainda falta** para isso
virar o Sync Engine "de verdade" descrito em `INTEGRATIONS.md`: (1) a extração real da agenda do
Simples Dental capturando `sd_appointment_id`/`sd_patient_id` estáveis (a extração de hoje, no
pull manual, não capturou esses IDs — por isso os 5 registros já existentes não vão deduplicar
sozinhos num próximo sync); (2) uma rotina recorrente disparando isso (Fase 7 / Cowork) em vez
de eu chamar manualmente.

## Fase 5 — Simples Dental (escrita)

Ações selecionadas, começando por lançamento de pagamento já conciliado, sempre
`PREPARAR → APROVAR → EXECUTAR → VERIFICAR`. Sem autonomia financeira irrestrita.

## Fase 6 — Automação operacional

Reduzir intervenção humana progressivamente, conforme confiabilidade comprovada em produção.

## Fase 7 — Cowork / rotinas

Configurar rotinas de `COWORK_RUNBOOK.md` no ambiente do usuário quando disponível.

**Tentativa real em 2026-08-17**: automação 100% sem supervisão (cron na nuvem, depois
Agendador de Tarefas do Windows) esbarrou em dois bloqueios reais e documentados —
ver `docs/COWORK_RUNBOOK.md` ("Estado real da automação"). Solução entregue por enquanto:
gatilho manual intuitivo (`/sync-agenda`), com supervisão normal, idempotente.

## Fase 8 — CRM: fundação do pipeline (2026-08-18 — board funcional)

Ver `CRM_MASTER_SPEC.md`, `DATABASE_SCHEMA.md`, `CRM_RULES.md`. Schema: enum de pipeline
expandido para 18 estágios, `pipeline_history` (histórico imutável), tags/origem/indicação,
planejamento (`treatment_plans`/`items`), biblioteca de casos, objeções, satisfação,
manutenção/revisão anual — `0009_crm_foundation.sql`. Reaproveita `patients`/`tasks`/
`opportunities`/`alerts`/`automation_runs` já existentes em vez de recriar (ver
`DATABASE_SCHEMA.md` §Reconciliação).

**Board funcional em `/pipeline`** (`app/pipeline/`, `components/pipeline/`): 18 colunas,
arrastar-e-soltar nativo (sem dependência nova) ou clique no card abrem o mesmo formulário —
próxima ação + data obrigatórias (ou motivo de perda estruturado quando o destino é "Perdida"),
nunca um `UPDATE` direto sem histórico. `POST /api/pipeline/change-stage` aplica via
`lib/pipeline/change-stage.ts` (já testado) e grava `audit_logs`. Os 34 pacientes reais foram
migrados de `patient_journeys` vazio para um estágio honesto derivado só de dado observável
(agendamento → `confirmed`, recebível em aberto → `active_recurrence`, nunca inventado) — todos
sem `next_action`, então aparecem corretamente como violação da regra de ouro
("2 pacientes sem próxima ação" no demo vira, no banco real, 34 — é o ponto de partida esperado,
não um bug).

Verificado nesta sessão: grouping/labels/urgência (`lib/pipeline/board.test.ts`), formulário de
mudança de estágio com validação client-side + tratamento de erro (testado interativamente em
modo demonstração — sem credencial de login para testar contra o banco real de dentro desta
sessão). Arrastar-e-soltar não pôde ser simulado no navegador sandboxed (DnD nativo do HTML5 não
é acionado por eventos de mouse sintéticos), mas o handler de drop e `changeStage` estão cobertos
por teste unitário.

## Fase 9 — CRM: WhatsApp

`WhatsAppProvider` (interface + mock + `ChatwootProvider` — ver `WHATSAPP_ARCHITECTURE.md` e
decisão de 2026-08-18 em `DECISIONS.md`), webhook assinado do Chatwoot, Inbox de 3 colunas.
Código pronto e testado (`lib/whatsapp/`, `app/api/webhooks/chatwoot/`); falta apenas a instância
Chatwoot real existir (decisão de hospedagem/custo do usuário) e a conta WhatsApp Business/Meta
para sair do modo mock — desenvolvido e testável com o mock enquanto isso.

## Fase 10 — CRM: motor de follow-up e Modo FUP

`AUTOMATION_ENGINE.md` (regras 1–18), tela "Modo FUP" (uma paciente por vez, mensagem pronta,
adiar exige data), Central de Exceções.

## Fase 11 — CRM: execução, pós-procedimento, recorrência

`procedure_sessions`, `post_procedure_protocols`, retornos, `maintenance_cycles`,
`annual_reviews`, score de recorrência interno.

## Fase 12 — CRM: inteligência e IA gerencial

`AI_ARCHITECTURE.md` — extração automática de conversa, próxima melhor ação, busca em linguagem
natural, dashboards de gestão (funil visual, LTV, coortes). Bloqueado por chave de LLM de
produção configurada para este uso — contrato de ferramentas já definido, não implementado.

## Status atual (atualizado a cada marco relevante)

- [x] Fase 0 — Discovery
- [x] Fase 1 — Fundação (schema/auth/RBAC/cockpit base já em produção)
- [x] Fase 2 — Cockpit ("Hoje" em produção)
- [x] Fase 3 — Inteligência (RuleEngine com subconjunto P0)
- [~] Fase 4 — Simples Dental (leitura) — Sync Engine construído e testado; pull manual real feito; rotina automática ainda não
- [ ] Fase 5 — Simples Dental (escrita)
- [ ] Fase 6 — Automação operacional
- [~] Fase 7 — Cowork / rotinas — gatilho manual (`/sync-agenda`) entregue; automação sem supervisão bloqueada
- [~] Fase 8 — CRM: fundação do pipeline — schema aplicado, board funcional em `/pipeline`, 34 pacientes reais migrados; falta Modo FUP e Central de Exceções (Fase 10)
- [ ] Fase 9 — CRM: WhatsApp
- [ ] Fase 10 — CRM: motor de follow-up e Modo FUP
- [ ] Fase 11 — CRM: execução, pós-procedimento, recorrência
- [ ] Fase 12 — CRM: inteligência e IA gerencial
