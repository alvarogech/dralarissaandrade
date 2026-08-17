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
- `supabase/migrations/` — schema (ver `docs/DATABASE.md`), pronto para aplicar assim que o
  projeto Supabase do STIMMA OS existir.

## Deploy

GitHub → Netlify, base directory `stimma-os`, mesmo padrão do `anamnese-app` (ver
`netlify.toml`).
