# Relatório da Fase 2 · Central Editorial no Notion

Data: 2026-11-24 · Situação: **estrutura pronta e validada no repositório. Ainda não criada no
Notion** (depende de token e página-mãe, que só a gestão pode fornecer).

## O que está pronto
| Entregável | Onde | Verificação |
|---|---|---|
| Arquitetura | `01-Arquitetura.md` | Revisada |
| Modelo das bases e relações | `02-Modelo-de-dados.md`, `schema/schema.json` | Validador: 0 erros em 3209 verificações |
| Propriedades e tipos | `02b-Propriedades.md` (gerado) | Gerado do schema, sem divergência possível |
| Páginas e views | `03-Paginas-e-visualizacoes.md`, `schema/layout.json` | Cada filtro, coluna, ordenação e agrupamento validado contra o schema |
| Matriz de responsabilidades e permissões | `04-Responsabilidades-e-permissoes.md` | Revisada |
| Mapeamento da importação | `08-Mapeamento-importacao.md`, `import/inventario.json` | 16 conteúdos + 5 ideias + 27 pendências; nenhuma data fictícia (validador) |
| Questionário da Larissa | `../base-de-conhecimento/13-Questionario-Larissa.md` | 7 blocos curtos por áudio, ordenados por impacto |
| Procedimento de configuração | `06-Configuracao.md` | Revisado |
| Estratégia de integração n8n | `05-Integracao-n8n.md` | Contrato definido; implementação é a Fase 4 |
| Critérios de aceitação | `07-Criterios-de-aceite.md` | Blocos A e C ✅; bloco B depende do Notion |
| Scripts de setup e importação | `scripts/` | Simulação roda; **`--apply` nunca foi executado** |

**Números:** 11 bases · 253 propriedades (cada view mostra de 3 a 8) · 6 páginas · 31 views ·
57 registros para importar.

### Verificação das capacidades da API do Notion (feita antes de definir o que automatizar)
Documentação oficial consultada em 2026-11-24, Notion-Version **2026-03-11**. Automatizável:
bases, propriedades (inclusive relação de duas vias, fórmula, ID único e status com grupos),
views com filtro, ordenação, colunas e agrupamento (API de views lançada em 19/03/2026), views
vinculadas dentro de páginas, e webhooks. **Não automatizável:** permissões, perguntas de
formulário, configuração de gráfico, botões e automações nativas. Detalhes e links em
`01-Arquitetura.md`.

## Como os pedidos foram atendidos
- **Social media sem depender do Claude:** a página Hoje tem as 9 seções pedidas, mais o
  quadro. Ela nunca precisa abrir a base de conhecimento.
- **Larissa em poucos minutos:** uma página, 6 passos. Rotina em um campo, ideia e link por
  formulário, aprovação em galeria, perguntas por bloco.
- **Gestão:** as 9 visões pedidas. "Estratégia vigente" mostra a semana; a estratégia de longo
  prazo continua no repositório, de propósito.
- **Sem duplicação:** a rotina não ganhou base (é campo do Dia); ideias e stories não ganharam
  base (são Conteúdos). As únicas bases novas são Recomendações e Execuções.
- **IA x decisão humana:** tudo que a IA propõe sobre trabalho humano vai para Recomendações.
  Cada campo tem dono, e o n8n respeita trava, hash e dono antes de escrever.
- **Ciclo de vida:** os 11 estados ficam no Status. A social media vê 6 etapas simples
  (fórmula Etapa) e mexe em 5 estados no dia a dia.
- **Pronto para automação:** ID estável, Chave de idempotência, Origem, Versão, Hash, Execução,
  base de log com custo, erro e reprocessamento.

## O que precisa ser configurado (gestão)
1. Criar a conexão interna no Notion e a página-mãe; preencher `notion/.env` (passos 1 a 3 de `06-Configuracao.md`).
2. Rodar `setup.mjs --apply` e `importar.mjs --apply`, e me trazer o relatório. **Falhas, se
   houver, aparecem listadas e eu corrijo.** Dois pontos da API eu só consigo confirmar nesse
   primeiro uso: o agrupamento por opção de status e a configuração de colunas nas views de
   lista e galeria.
3. Ajustes manuais do passo 7: formulários, gráficos, permissões, convites e limpeza das
   opções padrão de status.
4. Rodar os testes de uso B5 a B7 com a Larissa e a social media.

## Decisões que dependem da equipe
| # | Decisão | Quem | Por que importa agora |
|---|---|---|---|
| 1 | Plano do Notion contratado (Free, Plus ou Business) | Gestão | Muda o limite de API (3 ou 10 req/s), gráficos, convidados e o nível "Pode editar conteúdo" |
| 2 | Social media entra como convidada ou como membro? | Gestão | Permissões e custo |
| 3 | **P-24:** onde fica a autorização de imagem das pacientes | Gestão | Bloqueia 4 conteúdos de prova social |
| 4 | **P-12:** prioridades comerciais de dez/2026 e jan/2027 | Gestão | Sem isso o primeiro plano semanal não tem direção comercial |
| 5 | **P-00:** exportar o Trello em JSON (roteiros completos e links) | Gestão | 4 roteiros prontos estão sem texto na central |
| 6 | Canal do áudio do questionário (WhatsApp para a social media ou formulário) | Gestão + Larissa | Define quem transcreve para o Notion |
| 7 | **P-11:** Venda e Topo de funil como objetivos, mantendo 3 pilares | Gestão | Já modelado assim; confirmar |
| 8 | Responder o Bloco 1 do questionário (Método ERA) | Larissa | Destrava a peça central da semana 4 |

## O que **não** foi feito, de propósito
- Nenhuma chamada real ao Notion, porque não há token. Nada foi simulado como sucesso.
- Nenhum workflow n8n nem prompt (Fases 3 e 4).
- Nenhuma publicação automática no Instagram.
- Nenhuma alteração fora de `direcao-editorial/`.
