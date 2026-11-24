# Direção Editorial | Larissa Andrade

Central editorial inteligente para o Instagram da Dra. Larissa Andrade: planejamento semanal,
direcionamento diário, roteiros, captação, produção e análise de resultados.
Stack prevista: Claude API, Notion, n8n e Google Drive. **Sem publicação automática no
Instagram na v1**: produção, aprovação e publicação continuam humanas.

Projeto independente dentro deste repositório (não faz parte do STIMMA OS nem do anamnese-app).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `fontes/` | Material bruto recebido (levantamento do Trello, plano mestre). Não editar. |
| `base-de-conhecimento/` | Documentos estruturados que o agente lê. Fase 1. |
| `DECISIONS.md` | Decisões tomadas e por quê. |

## Fases

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Base de conhecimento + perguntas pendentes | **Em andamento** (v0 pronta, aguardando respostas da Larissa) |
| 2 | Estrutura do Notion | Não iniciada |
| 3 | Instruções e prompts do agente | Não iniciada |
| 4 | Workflows n8n | Não iniciada |
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
