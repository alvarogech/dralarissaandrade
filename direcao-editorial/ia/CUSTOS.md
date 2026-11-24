# Estimativa de custo da inteligência editorial

**Estimativa, não medição.** Nenhuma chamada à API foi feita na Fase 3. O custo real será medido
pela base Execuções (tokens de entrada, saída e cache por execução) a partir da Fase 4.

## Preço usado (Claude Opus 5.5, por milhão de tokens)

| Item | US$ |
|---|---|
| Entrada | 4,00 |
| Saída (inclui o raciocínio interno) | 20,00 |
| Leitura de cache | 0,20 |
| Escrita de cache (5 min) | 5,00 |

## Tamanho medido de cada parte

| Parte | Tokens | Fonte |
|---|---|---|
| Instrução mestra + base de conhecimento (prefixo fixo) | cerca de 9 mil | arquivos de `prompts/` e `base-de-conhecimento/` |
| Módulo do workflow | 0,6 a 1,2 mil | `prompts/workflows/` |
| Pacote de contexto | **1,3 a 3,6 mil** (medido nos 12 cenários) | `avaliacao/RESULTADOS.md` |
| Saída visível | 1 a 3 mil | saídas de exemplo |
| Raciocínio interno | 1 a 7 mil, conforme o effort | estimativa |

## Sobre o cache

O cache de prompt dura 5 minutos. As execuções do dia são espaçadas (direcionamento de manhã,
roteiro à tarde), então **na maior parte das vezes o cache expira** e cada chamada paga a escrita
(um pouco mais cara que a entrada normal). O cache só compensa quando execuções saem em
sequência, por exemplo roteiro e revisão do mesmo conteúdo ou o lote de domingo (análise, plano
e aprendizado). A conta abaixo usa o caso pessimista: sem acerto de cache.

## Custo por execução

| Workflow | Effort | Entrada | Saída | US$ por execução |
|---|---|---|---|---|
| Direcionamento diário | medium | ~13 mil | ~6 mil | **~0,17** |
| Plano semanal | high | ~14 mil | ~10 mil | ~0,26 |
| Roteiro | medium | ~11 mil | ~6 mil | ~0,16 |
| Revisão | low | ~11 mil | ~1,5 mil | ~0,07 |
| Replanejamento | medium | ~13 mil | ~4 mil | ~0,13 |
| Análise de desempenho | high | ~14 mil | ~8 mil | ~0,22 |
| Aprendizado | medium | ~11 mil | ~3 mil | ~0,10 |
| Pesquisa (organiza referências que a equipe trouxe) | low | ~11 mil | ~2 mil | ~0,08 |
| Estratégia mensal | high | ~16 mil | ~10 mil | ~0,26 |

## Custo mensal estimado

| Uso | Execuções no mês | US$ |
|---|---|---|
| Direcionamento diário (dias úteis + sábado) | 26 | 4,40 |
| Plano semanal | 4 | 1,05 |
| Roteiros | 16 (4 feeds por semana) | 2,55 |
| Revisões (1 a 2 por roteiro) | 24 | 1,70 |
| Replanejamentos | 6 | 0,80 |
| Análises | 4 | 0,90 |
| Aprendizado | 4 | 0,40 |
| Pesquisa | 6 | 0,50 |
| Estratégia | 1 | 0,26 |
| Repetições por erro de schema ou regra (cerca de 15%) | | 1,90 |
| **Total** | | **cerca de US$ 14,50 por mês** |

Faixa provável: **US$ 10 a 25 por mês**. Sobe se a equipe pedir muitas versões do mesmo
roteiro; cai se o cache acertar com frequência.

## Alavancas, se o custo precisar cair

- **Effort menor** em diário e roteiro (de medium para low): corta perto de 40% da saída nesses
  dois workflows. Só depois de comparar a qualidade nos 12 cenários.
- **Lote de domingo** (análise, aprendizado e plano em sequência): o cache passa a acertar.
- **Trocar de modelo** em revisão e pesquisa: é uma decisão do Álvaro e deve ser testada nos
  cenários antes, nunca assumida.

O que **não** entra nesta conta: n8n, Notion e Google Drive (cobrados à parte, se houver) e a
Fase 5 (testes com a API, que precisam de aprovação de gasto antes de rodar).
