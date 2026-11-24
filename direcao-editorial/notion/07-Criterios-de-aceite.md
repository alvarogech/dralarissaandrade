# 07 — Critérios de aceitação da Fase 2

Legenda: ✅ verificado no repositório · ⏳ só pode ser verificado no Notion real, depois do setup.

## A. Estrutura (verificável offline)
| # | Critério | Como verificar | Situação |
|---|---|---|---|
| A1 | Schema, layout e inventário coerentes (relações, opções, filtros, colunas e fórmulas apontam para coisas que existem) | `node scripts/validar.mjs` → 0 erros | ✅ |
| A2 | O validador detecta erro de verdade | Teste com 3 erros injetados (opção inválida, data fictícia, filtro inválido): todos detectados | ✅ |
| A3 | Toda base integrada tem ID, Chave, Origem, criado e editado por/em | `02b-Propriedades.md` | ✅ |
| A4 | Cada informação tem uma fonte única | `02-Modelo-de-dados.md` | ✅ |
| A5 | Recomendação da IA separada da decisão humana | Base Recomendações + dono por campo | ✅ |
| A6 | Inventário: 16 conteúdos e 5 ideias, com origem, pilar, objetivo, status, bloqueios e pendências; nenhuma data de publicação | Validador + `08-Mapeamento-importacao.md` | ✅ |
| A7 | Nenhum token no repositório | `.env` no `.gitignore`; scripts leem do ambiente | ✅ |
| A8 | Nenhuma publicação automática no Instagram | Não existe workflow nem campo para isso | ✅ |

## B. No Notion (após `setup --apply` e `importar --apply`)
| # | Critério | Situação |
|---|---|---|
| B1 | Setup roda até o fim e lista as falhas; rodar de novo não duplica nada | ⏳ |
| B2 | Importação: 27 pendências, 6 referências, 3 aprendizados, 21 conteúdos; rodar de novo dá "Preservados: 57, Criados: 0" | ⏳ |
| B3 | As relações Conteúdos ↔ Pendências aparecem nos dois lados, com os nomes de espelho corretos | ⏳ |
| B4 | As fórmulas funcionam: Etapa, Atrasado, Para hoje, É hoje, Vigente, Planejados e Publicados | ⏳ |
| B5 | **Teste da social media:** com um Dia e uma Semana de exemplo, ela responde em até 2 minutos, só pela página Hoje: o que fazer primeiro, o que pedir à Larissa e o que está travado | ⏳ |
| B6 | **Teste da Larissa:** pelo celular, em até 5 minutos, conta a rotina, registra uma ideia por formulário e aprova um conteúdo | ⏳ |
| B7 | **Teste da gestão:** encontra atrasados e bloqueados, planejado x publicado e decisões pendentes sem abrir as bases | ⏳ |
| B8 | Cada view mostra no máximo 8 colunas e nenhum campo técnico | ⏳ |
| B9 | Permissões: a social media não consegue apagar uma coluna | ⏳ |
| B10 | A execução de setup aparece na base Execuções | ⏳ |

## C. Prontidão para a Fase 3 e a Fase 4
| # | Critério | Situação |
|---|---|---|
| C1 | Chaves de idempotência definidas para cada workflow | ✅ `05-Integracao-n8n.md` |
| C2 | Regra de preservação de edição humana definida (trava + hash + dono do campo) | ✅ |
| C3 | Campos de erro, custo, tentativa e reprocessamento existem | ✅ base Execuções |
| C4 | Fallback por varredura para webhooks perdidos | ✅ definido; implementação na Fase 4 |

A Fase 2 fica **concluída** quando A, B e C estiverem todos ✅. Hoje A e C estão completos e B
depende do token e da página-mãe (ver `06-Configuracao.md`).
