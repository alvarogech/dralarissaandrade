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
usuário antes da escrita. Isso **não é ainda o Sync Engine** descrito em `INTEGRATIONS.md` —
foi um pull manual, único, sem `patient_external_ids`/matching por `external_id`, sem
idempotência automática e sem rotina recorrente. O cockpit "Hoje" já lê esses dados reais do
Supabase (`lib/data/clinic-snapshot.ts`) em vez do modo demonstração. Constrói o Sync Engine de
verdade (idempotente, com matching robusto, rodando por rotina) é o próximo passo real desta
fase — não presumir que já existe só porque o primeiro pull funcionou.

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
