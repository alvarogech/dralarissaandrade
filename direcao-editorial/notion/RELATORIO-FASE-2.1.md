# Relatório da Fase 2.1 · Implantação e validação operacional

Data: 2026-11-24 · Central no Notion: **Central Editorial | Larissa Andrade** (página privada do
Álvaro; mover e compartilhar na Etapa 1 de `11-Implantacao.md`).

## Testado de verdade (com resposta da API ou consulta às views)
| Funcionalidade | Como foi testado |
|---|---|
| 11 bases com 260 propriedades, relações de duas vias, status com grupos, IDs estáveis (CON-, PEN-, …) | Schema devolvido pela API após cada criação; ID "PEN-1" conferido numa página |
| 35 views (24 com filtro) nas páginas Hoje, Larissa e Gestão, mais as abas das bases | Filtros conferidos no retorno da criação; 12 views consultadas com dados (ver `12-Simulacao-operacional.md`) |
| Gráficos por pilar e por objetivo | Criados pela API |
| Importação do inventário (57 registros) sem data de publicação, com Origem Trello, pilar, objetivo, status, bloqueios, pendências, validação clínica e autorização de imagem | Retorno da criação; relação espelho P-00 → 4 conteúdos |
| Simulação de uma semana com os 9 cenários pedidos, mais 2 extras | Views retornaram exatamente o registro esperado, depois de 2 correções |
| Respostas de 1 minuto para a social media (produzir, publicar, pedir, atrasados, depende da Larissa) | Cada view devolveu o item certo da simulação |
| Níveis de autonomia A, B e C no schema e nos dados | Recomendações A ("Aplicada automaticamente") e B ("Aguardando decisão") aparecem para quem decide |
| Validador offline (3560 verificações) e planejador do Trello (8 asserções) | `node scripts/validar.mjs` e `node test/trello-plano.test.mjs` |

## Apenas planejado (não testado)
| Item | Por quê |
|---|---|
| Uso real pela social media e pela Larissa (tempo, celular, onde travam) | Precisa das pessoas: roteiro na Etapa 3 de `12-Simulacao-operacional.md` |
| Permissões e acesso da equipe | A API não gerencia compartilhamento. Passo a passo na Etapa 1 de `11-Implantacao.md` |
| Proteção de edição humana (hash, trava, dono do campo) **em execução** | Os campos existem e estão documentados; quem aplica é o n8n (Fase 4) |
| Perguntas dos formulários | Configuração manual (Etapa 2) |
| Importação integral do Trello | Aguardando o JSON (P-00); o plano revisável está pronto e testado com amostra |
| Integração interna e token para o n8n | Etapa 4, só na Fase 4 |

## Diferenças entre a documentação e a API real
Seis achados, todos resolvidos e registrados em `11-Implantacao.md`. Os mais importantes:
- O Notion **descarta em silêncio** filtros sobre fórmula ou rollup. Teria deixado "Atrasados" mostrando tudo; o validador agora bloqueia isso.
- A consulta SQL do conector **exige plano Business**. Não afeta o n8n, que usa a API REST.

## Critérios de aceitação da Fase 2.1
| Critério | Situação |
|---|---|
| Central efetivamente criada no Notion | ✅ |
| Conteúdos históricos importados e identificados | ✅ 21 conteúdos e 27 pendências, Origem Trello, Chave `trello:` |
| Visualizações principais funcionando | ✅ conferidas com dados |
| Permissões da equipe configuradas | ⏳ **depende de você** (Etapa 1) |
| Alterações humanas protegidas | ✅ estrutura (trava, hash, dono, Rascunho do agente separado); ⏳ execução na Fase 4 |
| Níveis de autonomia definidos | ✅ `09-Niveis-de-autonomia.md` + `schema/autonomia.json` |
| Simulação operacional validada | ✅ pelas views; ⏳ falta o teste com as duas pessoas (Etapa 3) |
| Pendências técnicas documentadas | ✅ |

**A Fase 2.1 fecha** depois das Etapas 1 a 3. Não avancei para a Fase 3.

## Decisões que dependem da equipe
1. E-mail da social media para o convite (ou prefere convidar você mesmo).
2. Onde fica a central: teamspace ou página pessoal compartilhada.
3. Notion Business: só vale a pena se a gestão quiser contagens por SQL pelo conector. O n8n não precisa dele.
4. P-00: exportar o JSON do Trello.
5. P-24: onde fica a autorização de imagem. Hoje 5 conteúdos reais aguardam isso.
