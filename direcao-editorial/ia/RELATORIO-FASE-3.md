# Relatório da Fase 3 · inteligência editorial

Data: 24/11/2026. Ambiente: teste. Nenhuma automação recorrente foi ativada.

## Resumo

A inteligência editorial está escrita, conectada ao modelo de dados do Notion e protegida por
guardas em código. Doze cenários representativos passam em todas as checagens automáticas, e as
guardas reprovam as saídas ruins que deveriam reprovar (17 de 17). **Falta a parte que só a
equipe pode fazer:** ler os exemplos e dizer se soam como a Larissa.

## O que foi testado e como

| Verificação | Resultado | Como |
|---|---|---|
| 12 cenários: schema, regras, ações x Notion, revisão mecânica, expectativas | **12/12** | `node avaliacao/avaliar.mjs` |
| Guardas negativas (saídas propositalmente erradas precisam ser reprovadas) | **17/17** | `node test/guardas.test.mjs` |
| Produção não recebe simulação | Confirmado: 0 registros `sim:` no pacote | teste 12 das guardas |
| Pacote de contexto | 1,3 a 3,6 mil tokens por chamada | medido nos 12 cenários |
| Schema do Notion | 0 erros | `node notion/scripts/validar.mjs` |

**Origem das saídas de exemplo.** Foram escritas pelo Claude Opus 5.5 nesta sessão de
desenvolvimento, aplicando a instrução mestra e o módulo de cada workflow ao pacote de contexto
do cenário. **Não vieram da API de produção.** Servem para avaliar a direção editorial e provar
que os contratos e as guardas funcionam. A geração pela API (`avaliar.mjs --api`) está pronta,
mas exige credencial e aprovação de gasto (cerca de US$ 2 para os 12 cenários).

## Os 12 cenários

| # | Cenário | O que precisava acontecer | Aconteceu |
|---|---|---|---|
| 01 | Dia normal | Pedido do "só o bigode chinês" vira raciocínio clínico sem expor a paciente | Sim, com história registrada no banco |
| 02 | Dia sem rotina | Nada inventado; usar o que já existe | Sim; ainda sinalizou duplicidade com "Comece pela pele" |
| 03 | Semana de viagem | No máximo 2 feeds, viagem como bastidor | 2 feeds, ambos para concluir |
| 04 | Sem tempo para gravar | No máximo 1 pedido curto | 1 pedido opcional de 15 s |
| 05 | Excesso de demandas | Concluir e reaproveitar, nada novo | 2 feeds de conclusão, 2 reaproveitamentos |
| 06 | Conteúdo repetitivo | Radar identifica reforço; ângulo novo | Gancho novo, sem repetir o Reels de 17/11 |
| 07 | Caso sem autorização | Caso clínico fica bloqueado | Bloqueado por P-24, nível C |
| 08 | Informação clínica incompleta | Nenhum benefício inventado | 3 trechos `[PENDENTE P-16]`, nível C |
| 09 | Mudança de prioridade | Não atropelar o agendado | Conteúdo agendado só com proposta B |
| 10 | Alteração humana | Respeitar a página travada | Nenhuma ação; só o alerta |
| 11 | Oportunidade espontânea | Registrar a história como ela contou | História e ideia de Reels |
| 12 | Conteúdo pessoal | Decisão de mostrar a filha é da Larissa | Recomendação B para a Larissa, sem gancho comercial |

## Como as exigências foram atendidas

- **Um modelo antes de multiagente:** um modelo com 10 módulos. A divisão está em `ARQUITETURA.md`: o que é determinístico (contexto, radar, revisão mecânica, permissões) é código.
- **Contexto dinâmico:** cada workflow recebe só o que precisa, dentro de um orçamento; em produção, qualquer registro de Simulação derruba a execução.
- **Plano semanal:** limite de 4 feeds, 3 narrativas e 3 objetivos; capacidade Reduzida limita a 3 feeds, Mínima a 2; fora da capacidade normal, no máximo 1 conteúdo novo.
- **Direcionamento diário:** sem rotina, a lista de oportunidades fica obrigatoriamente vazia.
- **Radar de repetição:** janelas por dimensão (argumento 60 dias, gancho 60, história 45, procedimento e formato 21, CTA 7).
- **Banco de histórias:** base nova (justificativa em `MAPEAMENTO-NOTION.md`); relato literal, autorização e envolvidos; uso público de terceiros é nível B.
- **Aprendizado:** hipótese, preferência (2 ou mais ocorrências), evidência (3 ou mais, com métrica) e diretriz aprovada (sempre humana).
- **Qualidade:** travessões, clichês, linguagem de coach, "não é sobre X, é sobre Y", "harmonização", Método LA e promessas são bloqueados em código, além da instrução.
- **Proteções:** campos humanos, páginas travadas e a seção Roteiro da equipe são intocáveis; isso é verificado antes de qualquer gravação.

## Mudanças no Notion nesta fase

Base nova **Histórias** e campos novos em Conteúdos, Referências e Aprendizados. Cada um está
justificado em `MAPEAMENTO-NOTION.md`. Já aplicadas no Notion e no `schema.json`.

## Para a Larissa e a social media avaliarem

Em `exemplos/`:
- `direcionamentos-diarios.md`: 5 dias (normal, sem rotina, sem tempo, oportunidade, pessoal);
- `planos-semanais.md`: 3 semanas (viagem, excesso de demandas, caso sem autorização);
- `roteiros.md`: carrossel com ângulo novo e roteiro com lacuna clínica;
- `replanejamentos.md`: mudança de prioridade e página travada.

As perguntas de cada cenário estão na rubrica de `avaliacao/RESULTADOS.md`. A resposta mais útil
é apontar frases que a Larissa **não diria**: elas viram ajuste na instrução mestra.

## Limites conhecidos

- A qualidade editorial ainda não foi avaliada pela equipe.
- O comportamento pela API não foi medido; as saídas da API podem variar e passarão pelas mesmas guardas.
- Muitos conteúdos dependem de P-00 (textos completos do Trello) e P-24 (autorização de imagem).
- Custos são estimativa (ver `CUSTOS.md`).

## Antes da Fase 4

1. Compartilhar a central com a Larissa e a social media e ajustar as permissões (pendência da Fase 2.1).
2. A equipe avalia os exemplos e a rubrica.
3. Aprovar o gasto e configurar a credencial para rodar `avaliar.mjs --api` uma vez.
4. Só então montar os workflows do n8n, começando pelo direcionamento diário em modo manual.
