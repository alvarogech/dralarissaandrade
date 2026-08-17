# CLAUDE.md — guia para sessões futuras neste repositório

Este repositório contém **múltiplos projetos independentes** para a operação da Dra. Larissa
Andrade / Clínica Stimma. Antes de qualquer trabalho, identifique em qual projeto você está:

- `/` (raiz) — site estático piloto (Instagram bio).
- `anamnese-app/` — Next.js + Supabase, anamnese digital + painel de revisão. Tem seu próprio
  `README.md` com instruções completas de setup.
- `stimma-os/` — **STIMMA OS**, o foco principal de desenvolvimento contínuo daqui em diante.
  Tem seu próprio `package.json`, seu próprio projeto Supabase, seu próprio deploy Netlify.

## O que é o STIMMA OS (resumo — contexto completo em `docs/`)

**O STIMMA OS é o CRM inteligente e automatizado da Clínica Stimma** — o sistema operacional da
jornada da paciente, do primeiro contato à recorrência por anos, com WhatsApp como canal
operacional principal (pivô de 2026-08-17 — ver `docs/DECISIONS.md`). Continua sendo também o
"COO digital" do gestor (Álvaro): observa agenda, financeiro, oportunidades, equipe e tarefas, e
transforma isso em ação priorizada — não em mais um dashboard. Princípio central inalterado:
**todo paciente ativo precisa ter um próximo passo definido** (status + responsável + próxima
ação + data — a "regra de ouro", ver `docs/CRM_RULES.md`).

Leia nesta ordem antes de mexer em algo:

1. [`docs/CRM_MASTER_SPEC.md`](./docs/CRM_MASTER_SPEC.md) — filosofia, jornada, telas por papel, MVP.
2. [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md) — missão, escopo, matriz de autonomia.
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — como as peças se conectam.
4. [`docs/DATABASE.md`](./docs/DATABASE.md) + [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) — schema (original + extensão CRM).
5. [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) + [`docs/CRM_RULES.md`](./docs/CRM_RULES.md) — catálogo de regras.
6. [`docs/AUTOMATION_ENGINE.md`](./docs/AUTOMATION_ENGINE.md) — motor de eventos/automações configuráveis.
7. [`docs/WHATSAPP_ARCHITECTURE.md`](./docs/WHATSAPP_ARCHITECTURE.md) — inbox, provider abstrato, estado real (mock).
8. [`docs/AI_ARCHITECTURE.md`](./docs/AI_ARCHITECTURE.md) — ferramentas de IA, guardrails.
9. [`docs/SIMPLES_DENTAL_MAP.md`](./docs/SIMPLES_DENTAL_MAP.md) — o que o Simples Dental já
   faz nativamente (não duplicar — agenda/ficha/Kanban de orçamento/financeiro básico; o
   pipeline de relacionamento e o WhatsApp são território novo, não duplicação).
10. [`docs/SECURITY.md`](./docs/SECURITY.md) — limites absolutos, LGPD, audit log.
11. [`docs/DECISIONS.md`](./docs/DECISIONS.md) — por que as coisas são como são.
12. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — em que fase o projeto está agora.

## Regras de execução deste projeto

- **Autonomia alta em decisões técnicas reversíveis** (arquitetura, componentes, nomenclatura,
  banco): decida e documente em `docs/DECISIONS.md`, não pergunte.
- **Nunca pare em documentação ou em "compilou"**: uma funcionalidade só está pronta segundo o
  Definition of Done em `docs/PROJECT_SPEC.md` — testada no navegador, com dados reais/seed,
  commitada.
- **Determinístico vs. IA**: cálculo, data, status, matching → código no `RuleEngine`, nunca
  LLM. Interpretação, resumo, priorização em linguagem natural → IA. Ver `ARCHITECTURE.md`.
- **EXECUTE → VERIFY → COMMIT**, nunca `EXECUTE → ASSUME SUCCESS` — vale para qualquer
  automação, especialmente as que tocam o Simples Dental via navegador.
- **Simples Dental não tem API pública confirmada.** Qualquer automação de leitura/escrita deve
  usar texto/accessibility-tree, nunca coordenadas fixas, e deve emitir
  `automation.requires_review` em vez de adivinhar quando a estrutura da tela mudar.
- **Nunca**: inventar dado, inventar integração, afirmar teste/sync não realizado, presumir
  sucesso de automação, armazenar senha, expor secret, alterar dado clínico real por teste,
  excluir dado real, fazer diagnóstico/indicação clínica, enviar mensagem real ao paciente sem
  a política de aprovação, ou executar ação financeira irreversível sem aprovação Nível C.
- **CRM — específico**: nunca mesclar pacientes automaticamente (perguntar antes — ver
  `docs/CRM_RULES.md` §9); nunca mover paciente para "perdida" sem motivo estruturado; nunca
  excluir paciente perdida (ela continua existindo); nunca deixar "adiar" sem data obrigatória;
  nunca enviar mensagem de nível 2/3 automaticamente (sempre aprovação humana); nunca fingir que
  o WhatsApp está integrado de verdade enquanto rodar em `WHATSAPP_PROVIDER=mock`.

## Como rodar `stimma-os/` localmente

```bash
cd stimma-os
npm install
cp .env.example .env.local   # preencher com as chaves do projeto Supabase do STIMMA OS
npm run dev
```

## Como testar

```bash
cd stimma-os
npm run test        # unit + integration (Vitest)
npm run build        # valida tipos e build de produção
```

Depois de qualquer mudança de UI relevante, abrir no navegador (Claude in Chrome ou o Browser
pane) e testar o fluxo real antes de considerar concluído — ver `docs/PROJECT_SPEC.md`.

## Como fazer deploy

GitHub → Netlify, mesmo padrão do `anamnese-app` (`netlify.toml` com `@netlify/plugin-nextjs`,
base directory = `stimma-os`). Variáveis de ambiente cadastradas no painel do Netlify, nunca no
repositório.

## Segurança — resumo (detalhe em `docs/SECURITY.md`)

Dados de saúde/financeiros. RLS em toda tabela. RBAC próprio do STIMMA OS (não confundir com as
89 permissões nativas do Simples Dental). Secrets fora do frontend e fora do git. Audit log
obrigatório em toda automação. Minimização de dados clínicos — este sistema é gerencial, não um
prontuário.
