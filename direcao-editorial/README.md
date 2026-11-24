# Direção Editorial | Larissa Andrade

Central editorial inteligente para o Instagram da Dra. Larissa Andrade: planejamento semanal,
direcionamento diário, roteiros, captação, produção e análise de resultados.
Stack em piloto: tarefas agendadas do Claude Code + conector do Notion (assinatura). Alternativa futura: Claude API + n8n. **Sem publicação automática no
Instagram na v1**: produção, aprovação e publicação continuam humanas.

Projeto independente dentro deste repositório (não faz parte do STIMMA OS nem do anamnese-app).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `fontes/` | Material bruto recebido (levantamento do Trello, plano mestre). Não editar. |
| `base-de-conhecimento/` | Documentos estruturados que o agente lê. Fase 1. |
| `notion/` | Fase 2: estrutura da Central Editorial no Notion (schema, layout, scripts, importação). |
| `ia/` | Fase 3: inteligência editorial (prompts, contexto, contratos, guardas, avaliação, exemplos). |
| `ia/operacao/` | Fase 4A: operação pelas tarefas agendadas do Claude Code (pipeline `operar.mjs` e `RUNBOOK.md`). |
| `DECISIONS.md` | Decisões tomadas e por quê. |

## Fases

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Base de conhecimento + perguntas pendentes | **Aprovada** (respostas da Larissa entram aos poucos) |
| 2 | Estrutura do Notion | Concluída no repositório |
| 2.1 | Implantação e validação | **Implantada no Notion**; faltam permissões e teste com as pessoas (ver `notion/RELATORIO-FASE-2.1.md`) |
| 3 | Inteligência editorial | **Concluída em teste**: 12/12 cenários; falta a avaliação editorial da equipe (ver `ia/RELATORIO-FASE-3.md`) |
| 4A | Piloto com tarefas agendadas do Claude Code + Notion | **Em teste**: tarefas criadas desativadas (ver `ia/operacao/RELATORIO-FASE-4A.md`) |
| 4 | Workflows n8n (API) | Adiada; alternativa futura |
| 5 | Validação em cenários reais | Não iniciada |
| 6 | Manuais, guia de instalação, custos | Não iniciada |

## Convenção de status usada na base

Todo trecho da base indica de onde veio e o quanto é confiável:

- **[Trello]** — veio do quadro do Trello (ver `fontes/trello-levantamento-2026-11.md`).
- **[Plano mestre]** — proposta do plano mestre, ainda não validada pela Larissa.
- **[Decisão]** — decidido pelo Álvaro (registrado em `DECISIONS.md`).
- **[Hipótese]** — percepção ainda não confirmada por dado ou pela Larissa.
- **[Pendente P-xx]** — lacuna; a pergunta correspondente está em `base-de-conhecimento/00-Perguntas-pendentes.md`.

Regra: o agente **nunca** completa uma lacuna por conta própria. Se o dado está pendente, ele
pergunta ou deixa o conteúdo bloqueado.
