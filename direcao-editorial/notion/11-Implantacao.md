# 11 — Implantação real no Notion (Fase 2.1)

Data: 2026-11-24 · Workspace: espaço pessoal do Álvaro (membros: Álvaro e Larissa) · Via: conector
MCP do Notion, na conta do Álvaro · IDs: `deploy/implantacao.json`.

## O que foi criado (e conferido pela resposta da API)
| Item | Quantidade | Conferência |
|---|---|---|
| Página-mãe privada + 5 subpáginas | 6 | IDs retornados |
| Bases | 11 | Schema devolvido batendo com o DDL; Status com 11 estados, grupos certos e **sem** opções padrão sobrando |
| Relações de duas vias | 11 | Espelhos com os nomes certos ("Conteúdos afetados", "Evidências"…) |
| Fórmulas e rollups | 9 | Aceitos após o ajuste descrito abaixo |
| Views | 35 criadas (26 nas páginas, 2 formulários, 7 abas de base) + view padrão de Conteúdos enxugada | Filtros conferidos no retorno de cada criação |
| Inventário importado | 57 registros | 27 pendências, 6 referências, 3 aprendizados, 21 conteúdos; P-00 com 4 conteúdos ligados no espelho |
| Simulação | 20 registros marcados [SIMULAÇÃO] | Ver `12-Simulacao-operacional.md` |

## Diferenças entre a documentação e a API real (resolvidas)
| Achado | Efeito | Solução adotada |
|---|---|---|
| Fórmula com `current.prop()` sobre relação é **recusada** ("X is not a valid property") | "Para hoje", "Planejados" e "Publicados" falharam | Rollups: Planejados e Publicados contam caixas auxiliares ("Conta: planejado/publicado") |
| Filtro de view sobre **fórmula** é **descartado em silêncio** (a view é criada sem filtro) | "Atrasados" mostraria tudo | Filtros diretos por data e status. O validador agora bloqueia filtro em fórmula |
| Filtro de view sobre **rollup** também é descartado | "Stories de hoje" ficaria sem filtro | Stories usam "Publicação prevista = hoje", como o feed. O rollup foi removido |
| `= today` não casa com data em intervalo | "Semana vigente" vazia | Filtro: início do período após uma semana atrás e até hoje |
| `update_view` com FILTER **substitui** o filtro inteiro | Perda do filtro de formato | Sempre regravar todas as condições (`CLEAR FILTER; …`) |
| Formulário não pode ser view vinculada em página | Recusa genérica | Formulário como aba da base, com link na página da Larissa |
| Gráfico (chart) **funciona** pela API | (documentado antes como manual) | Gráficos por pilar e por objetivo criados |
| Consulta SQL pelo conector exige plano **Business** | Sem contagens agregadas pelo conector | Conferência por view salva (permitida) e por página; o n8n usará a API REST, que não tem essa trava |

## Etapas que dependem de você (uma de cada vez)

### Etapa 1 — Mover e compartilhar a central (agora)
1. No Notion, abra **Central Editorial | Larissa Andrade** (página privada sua).
2. Se quiser, arraste-a para um teamspace ou para a página que preferir.
3. **Compartilhar → Convidar:** Larissa (já é membro do workspace) com **Pode editar**.
4. Social media: convide pelo e-mail dela com **Pode editar**. Se ela não for membro, entra como convidada.
5. Na página **Motor (técnico)**: abra Compartilhar e **remova** o acesso da Larissa e da social media (ou deixe a social media como "Pode ver").
6. Em cada base dentro de **Bases**: ⋯ → **Bloquear base**, para ninguém mudar colunas por acidente (a edição de linhas continua livre).

### Etapa 2 — Formulários (5 minutos)
- Conteúdos › aba **Registrar ideia**: adicionar a pergunta **Relato** ("Conte mais, se quiser"); em Origem, valor fixo **Larissa**.
- Referências › aba **Guardar referência**: perguntas **Link** e **Por que é útil**; Origem fixa **Larissa**.

### Etapa 3 — Teste de 1 minuto com cada pessoa (ver `12-Simulacao-operacional.md`)

### Etapa 4 — Integração interna para o n8n (só na Fase 4; não precisa agora)
1. notion.so/profile/integrations → **Nova integração** → Interna → nome "Central Editorial (n8n)".
2. Capacidades: ler, atualizar e inserir conteúdo. Sem acesso a e-mails de usuários.
3. Na página **Central Editorial**: ⋯ → Conexões → adicionar a integração.
4. O token fica **só** nas credenciais do n8n. Nunca no chat, em arquivo do repositório nem em log.

### Etapa 5 — Limpar a simulação (depois da validação)
Conteúdos › aba **Simulação**: selecionar tudo → Arquivar. Fazer o mesmo nas outras bases, filtrando por Origem = Simulação.
Nada é apagado de forma permanente.
