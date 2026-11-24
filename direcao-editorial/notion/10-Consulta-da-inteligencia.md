# 10 — Como a inteligência editorial vai consultar as fontes (preparação da Fase 3)

Nada aqui está implementado. Este é o contrato de leitura que a Fase 3 (prompts) e a Fase 4 (n8n)
vão seguir. Todas as consultas usam a **API REST do Notion pela integração interna** (não o
conector MCP, que no plano atual não permite consultas com SQL; ver `11-Implantacao.md`).

## Pacote de contexto por workflow
| Fonte | Onde | Como filtrar | Planejamento semanal | Direcionamento diário | Roteiro | Análise |
|---|---|---|---|---|---|---|
| Base de conhecimento | `base-de-conhecimento/*.md` (repositório) | Arquivos inteiros, com prompt caching | ✔ | 01, 03, 07 | 01, 03, 04, 06, 08, 11 | 05, 10 |
| Histórico de conteúdos | Conteúdos | Publicação ou edição nos últimos 90 dias, mais tudo que está aberto | ✔ | Abertos | Mesmo pilar e tema | Publicados |
| Prioridades comerciais | Prioridades comerciais | Status Ativa ou Planejada, com período que cruza a semana. **Nunca** "Proposta do agente" | ✔ | ✔ | Se ligado | ✔ |
| Rotina da Larissa | Dias.Minha rotina e Disponibilidade | Dia de hoje e os 2 anteriores | Semana anterior | ✔ | | |
| Capacidade de produção | Semanas.Capacidade e Restrições; Captação aberta | Semana vigente | ✔ | ✔ | | |
| Pendências | Pendências e decisões | Status Aberta ou Parcial; e Respondidas, para usar as respostas | ✔ | ✔ | Ligadas ao conteúdo | |
| Métricas | Métricas | Leituras D+7 e D+30 dos últimos 60 dias | Resumo | | | ✔ |
| Aprendizados | Aprendizados | Status ≠ Refutado. "Hipótese" entra **marcada como hipótese** | ✔ | | ✔ | ✔ |

## Regras de leitura
1. **Simulação fica de fora**: sempre filtrar `Origem ≠ Simulação`.
2. **Respostas de pendência são fonte de verdade clínica.** Se a pendência está Aberta, o agente
   não preenche a lacuna; o conteúdo fica "Aguardando informação".
3. **Hipótese não é fato.** Aprendizado com status Hipótese entra no prompt com essa etiqueta.
4. **O agente lê a base de conhecimento do repositório, não do Notion.** O Notion tem o estado
   operacional; a estratégia longa fica versionada no Git.
5. **Tamanho:** cada pacote tem limite (por exemplo, 40 conteúdos e 20 aprendizados). Acima
   disso, o n8n resume deterministicamente: contagens por pilar e títulos recentes.

## Saída esperada (para validar antes de escrever)
JSON com schema por workflow (definido na Fase 3). Toda ação traz `nivel` (A/B/C), conforme
`schema/autonomia.json`, e `fontes` (IDs consultados), que vai para "Fontes consultadas" da
Recomendação.

## Limites conhecidos da API (validados na Fase 2.1)
- Fórmulas sobre relação (`current.prop`) não são aceitas: usar os rollups existentes.
- Filtro sobre fórmula ou rollup não é aceito nas views; nas consultas do n8n, filtrar por data e status diretamente.
- O n8n calcula "hoje" no fuso America/Sao_Paulo; não usar as fórmulas "É hoje" e "Vigente" como filtro.
