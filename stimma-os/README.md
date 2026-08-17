# STIMMA OS

Camada de inteligência e automação sobre o Simples Dental para o gestor da operação da
Dra. Larissa Andrade (Clínica Stimma). Contexto completo em [`../docs/`](../docs/) e
[`../CLAUDE.md`](../CLAUDE.md).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # opcional — sem isso, roda em modo demonstração
npm run dev
```

Acesse `http://localhost:3000` — redireciona para `/hoje` (cockpit principal). Sem
`NEXT_PUBLIC_SUPABASE_URL` configurada, a tela roda em **modo demonstração** com dados
fictícios (`lib/seed/seed-data.ts`), para permitir desenvolver e testar a interface antes do
banco existir.

## Testes

```bash
npm run test        # RuleEngine, auth-guard
npm run typecheck
npm run build
```

## Estrutura

- `lib/rules/` — `RuleEngine` determinístico (ver `docs/BUSINESS_RULES.md`). Puro TypeScript,
  sem dependência de banco — testável isoladamente.
- `lib/seed/` — dados fictícios para modo demonstração.
- `lib/supabase/` — clientes Supabase (browser, service role, middleware) — mesmo padrão do
  `anamnese-app`.
- `app/hoje/` — cockpit principal ("Precisa de você", prioridades do dia, hoje na clínica,
  oportunidades).
- `supabase/migrations/` — schema (ver `docs/DATABASE.md`), aplicado no projeto Supabase real
  (`stimma-os`, org `larissaandrade.odonto@gmail.com`).
- `lib/sync/` — Sync Engine (matching de paciente + upsert idempotente de compromisso, ver
  `docs/INTEGRATIONS.md`). Exposto em `POST /api/sync/agenda`.

## Sincronizar a agenda de hoje

Dentro de uma sessão normal do Claude Code, rode o comando `/sync-agenda`. Ele lê a agenda de
hoje no Simples Dental (Chrome já autenticado) e sincroniza com o banco — é seguro rodar várias
vezes no mesmo dia (idempotente). Ver `docs/COWORK_RUNBOOK.md` para por que isso é manual e não
automático ainda.

## Deploy

Em produção: **https://stimma-os-gestor.netlify.app**. GitHub → Netlify, base directory
`stimma-os` (ver `netlify.toml`). Variáveis de ambiente cadastradas no painel do Netlify, nunca
no repositório.
