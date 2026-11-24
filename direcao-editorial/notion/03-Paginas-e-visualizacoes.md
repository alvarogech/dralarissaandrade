# 03 — Páginas e visualizações

Definição executável: `schema/layout.json`. O setup cria as páginas e as views pela API; o que a
API não cobre está marcado como **[manual]**.

```
✨ Central Editorial | Larissa Andrade
├── 🏠 Hoje | Social media
├── 🎬 Larissa
├── 📊 Gestão
├── 🗄️ Bases        (as 10 bases completas; a equipe raramente precisa abrir)
└── ⚙️ Motor (técnico)  (Execuções; só gestão)
```

## 🏠 Hoje | Social media
Feita para ser lida de cima para baixo, em 2 minutos, sem abrir documento nenhum.

| # | Seção | Base · tipo | Filtro | Colunas visíveis |
|---|---|---|---|---|
| 1 | Intenção da semana | Semanas · lista | Vigente | Intenção editorial, Narrativas, Capacidade, Restrições |
| 2 | Hoje | Dias · tabela | É hoje | Intenção do dia, **Prioridade 1, 2, 3**, Minha rotina, Disponibilidade, Direcionamento |
| 3 | Stories de hoje | Conteúdos · lista | Sequência de stories + Para hoje | Pilar, Objetivo, Gancho, Etapa |
| 4 | Próximas publicações do feed | Conteúdos · tabela | Publica em 0 a 14 dias, exceto stories | Data, Formato, Pilar, Etapa, Com quem está |
| 5 | Pedir à Larissa | Captação · tabela | A solicitar, sem ser só da social media | Pedido, Tipo, Como gravar, Quando, Conteúdos |
| 6 | Aguardando edição | Conteúdos · tabela | Em produção | Formato, Prazo, Publicação, Atrasado |
| 7 | Aguardando aprovação da Larissa | Conteúdos · tabela | Aguardando aprovação | Formato, Publicação |
| 8 | Pendências e impedimentos | Conteúdos · tabela | Aguardando informação | Bloqueio, Pendências, Info clínica pendente |
| 9 | Sugestões do agente para decidir | Recomendações · tabela | Aguardando decisão | Tipo, Proposta, Por quê, Conteúdo, Decisão |
| 10 | Meu quadro | Conteúdos · quadro por Status | Sem Ideia, Analisado e Arquivado | Formato, Publicação, Com quem está |

"Até três prioridades": o agente preenche Prioridade 1 a 3 do dia e nunca mais que isso. A
social media pode trocar à mão, e então o Direcionamento passa a "Ajustado pela equipe".

**Direcionamento em texto:** o corpo da página do Dia (Direcionamento do agente, Stories
sugeridos, Captação do dia, Avisos) abre com um clique no dia, na seção 2.

## 🎬 Larissa
Cinco minutos por dia, na ordem em que ela pensa.

| # | Seção | O que ela faz |
|---|---|---|
| 1 | Como é o meu dia hoje | Escreve a rotina no campo "Minha rotina" e marca a disponibilidade (Tenho tempo, Pouco tempo, Sem tempo). É o gatilho do direcionamento. |
| 2 | O que preciso gravar | Lê o pedido e a orientação rápida ("Como gravar", Onde, Quando). |
| 3 | Para eu aprovar | Galeria. Abre, lê e muda o Status para Aprovado, ou comenta o que mudar. |
| 4 | Perguntas para mim | Lista por bloco do questionário. Responde no campo Resposta, ou por áudio (ver `13-Questionario-Larissa.md`). |
| 5 | Tive uma ideia ou aconteceu algo | **Formulário** da base Conteúdos. Status Ideia, Origem Larissa. **[manual: perguntas]** |
| 6 | Quero guardar um link | **Formulário** da base Referências. **[manual: perguntas]** |

Tudo que ela escreve fica nos campos dela (Minha rotina, Relato, Resposta), que o agente nunca
reescreve.

## 📊 Gestão
| Seção | Base · tipo | Para quê |
|---|---|---|
| Estratégia vigente | Semanas · tabela | Intenção da semana, status do plano, **Planejados x Publicados** (fórmulas) |
| Prioridades comerciais | Prioridades · tabela | O que o agente deve favorecer |
| Calendário do mês | Conteúdos · calendário por Publicação prevista | Visão mensal |
| Distribuição por pilar | Conteúdos · quadro por Pilar | Equilíbrio entre autoridade, desejo e conexão. **[manual: gráfico por pilar e objetivo]** |
| Atrasados e bloqueados | Conteúdos · tabela | Atrasado ou Aguardando informação |
| Indicadores | Métricas · tabela | Leituras recentes |
| Aprendizados | Aprendizados · quadro por Status | Hipótese → Em teste → Validado / Refutado |
| Decisões pendentes | Pendências · tabela | O que depende da gestão |
| Saúde da automação | Execuções · tabela | Erros, sucesso parcial, reprocessamentos, custo |

## Views extras dentro das bases
- **Conteúdos:** Banco de ideias · Inventário Trello (nov/2026) · Técnico (gestão)
- **Pendências:** Questionário da Larissa (quadro por bloco)
- **Captação:** Agenda de captação (calendário)
- **Recomendações:** Histórico

## Regra de propriedades visíveis
Cada view mostra de 3 a 8 colunas. O setup oculta todas as outras. Os campos técnicos (Chave,
Versão, Hash, Sincronização, Execução) só aparecem na view "Técnico (gestão)".
