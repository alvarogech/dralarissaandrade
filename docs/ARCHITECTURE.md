# Arquitetura — STIMMA OS

## Visão geral

```text
┌─────────────────────────────────────────────────────────────────┐
│  Simples Dental (sistema de terceiros, sem API pública)         │
│  Agenda · Pacientes · Vendas(Kanban) · Financeiro · Inteligência │
└───────────────┬─────────────────────────────────────────────────┘
                │ leitura: export estruturado + automação de navegador
                │ (Claude in Chrome / Cowork) — ver INTEGRATIONS.md
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sync Engine  → fetch · normalize · match · dedupe · compare ·   │
│                 upsert · emit_events · audit                     │
└───────────────┬─────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Event Store (Postgres/Supabase) — todo evento, qualquer origem  │
└───────────────┬─────────────────────────────────────────────────┘
                ▼
┌───────────────────────────┬───────────────────────────────────┐
│  Rule Engine (determinís- │  Opportunity Engine                │
│  tico: datas, status,     │  (avaliação sem continuidade,      │
│  matching, cálculos)      │   plano parado, cancelamento, ...) │
└───────────────┬───────────┴───────────────┬───────────────────┘
                ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Alert Engine → Task Engine → Notification Policy Engine         │
└───────────────┬─────────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js App (Hoje, Agenda, Pacientes, Oportunidades, Financeiro,│
│  Tarefas, Equipe, Relatórios, Atividade, STIMMA AI)              │
└─────────────────────────────────────────────────────────────────┘
```

## Princípio determinístico vs. IA

- **Determinístico (código, não LLM)**: está vencido? cálculo de dias, matching de paciente,
  soma financeira, status de tarefa, regra "avaliação sem próxima ação em 48h". Vive no
  `RuleEngine`.
- **IA (LLM, via STIMMA AI)**: interpretação, resumo, priorização contextual, explicação de
  causa→impacto→recomendação, linguagem natural, chat sobre os dados. Nunca decide sozinha
  fatos que o `RuleEngine` já calcula; consome esses fatos como ferramentas.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Backend**: Supabase — Postgres, Auth, Row Level Security, Storage, Edge Functions quando
  fizer sentido (ex. jobs agendados de sync/briefing).
- **Deploy**: GitHub → Netlify (mesmo padrão do `anamnese-app`).
- **Automação externa**: Claude in Chrome / Claude Cowork para o que o Simples Dental não expõe
  de outra forma. Ver [`INTEGRATIONS.md`](./INTEGRATIONS.md) e
  [`COWORK_RUNBOOK.md`](./COWORK_RUNBOOK.md).

## Camadas do domínio (motores)

- **Sync Engine**: idempotente por design. Toda entidade externa carrega
  `source, external_id, source_fingerprint, last_seen_at, last_synced_at`. Casos ambíguos de
  matching de paciente (nunca só por nome) viram `requires_review`, nunca um registro duplicado.
- **Rule Engine**: regras nomeadas, versionadas, testáveis isoladamente — nunca espalhadas em
  componentes de UI. Ver [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) para o catálogo.
- **Alert Engine**: prioriza (`CRÍTICO/IMPORTANTE/OPORTUNIDADE/INFORMATIVO`), calcula impacto
  financeiro estimado, atribui responsável.
- **Opportunity Engine**: gera oportunidades complementares às nativas do Simples Dental
  (paciente sem próxima etapa, plano parado, cancelamento não recuperado, reativação).
- **Notification Policy Engine**: decide feed vs. push. Tudo entra no feed; push só para o que
  exige interrupção.

## Segurança e dados de saúde

Ver [`SECURITY.md`](./SECURITY.md). Resumo: Supabase Auth + RLS em todas as tabelas, RBAC
próprio do STIMMA OS (não confundir com as 89 permissões nativas do Simples Dental), secrets
fora do código/frontend, audit log obrigatório em toda automação, minimização de dados clínicos
(o STIMMA OS é gerencial — trabalha com IDs, status e valores, não prontuário).

## Por que app separado do `anamnese-app`

Ver [`DECISIONS.md`](./DECISIONS.md).
