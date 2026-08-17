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

## Status atual (atualizado a cada marco relevante)

- [x] Fase 0 — Discovery
- [ ] Fase 1 — Fundação (em andamento nesta sessão)
- [ ] Fase 2 — Cockpit
- [ ] Fase 3 — Inteligência
- [ ] Fase 4 — Simples Dental (leitura)
- [ ] Fase 5 — Simples Dental (escrita)
- [ ] Fase 6 — Automação operacional
- [ ] Fase 7 — Cowork / rotinas
