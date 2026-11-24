# Central Editorial no Notion (Fase 2)

| Arquivo | Entregável |
|---|---|
| [RELATORIO-FASE-2.1.md](RELATORIO-FASE-2.1.md) | **Fase 2.1:** implantação real, testado x planejado |
| [11-Implantacao.md](11-Implantacao.md) | O que foi criado no Notion, achados da API, etapas que dependem de você |
| [12-Simulacao-operacional.md](12-Simulacao-operacional.md) | Semana simulada e resultado das views |
| [09-Niveis-de-autonomia.md](09-Niveis-de-autonomia.md) | Níveis A, B e C do agente |
| [10-Consulta-da-inteligencia.md](10-Consulta-da-inteligencia.md) | Como a Fase 3 vai ler as fontes |
| [13-Importacao-Trello.md](13-Importacao-Trello.md) | Importação integral do Trello (aguardando o JSON) |
| [RELATORIO-FASE-2.md](RELATORIO-FASE-2.md) | Relatório da Fase 2 (histórico) |
| [01-Arquitetura.md](01-Arquitetura.md) | Arquitetura e capacidades verificadas da API do Notion |
| [02-Modelo-de-dados.md](02-Modelo-de-dados.md) | Bases, relações, fonte única, ciclo de vida |
| [02b-Propriedades.md](02b-Propriedades.md) | Propriedades e tipos (gerado do schema) |
| [03-Paginas-e-visualizacoes.md](03-Paginas-e-visualizacoes.md) | Páginas Hoje, Larissa e Gestão, e as views |
| [04-Responsabilidades-e-permissoes.md](04-Responsabilidades-e-permissoes.md) | Matriz de responsabilidades, dono de campo, permissões |
| [05-Integracao-n8n.md](05-Integracao-n8n.md) | Contrato para n8n e Claude API |
| [06-Configuracao.md](06-Configuracao.md) | Passo a passo de configuração |
| [07-Criterios-de-aceite.md](07-Criterios-de-aceite.md) | Critérios de aceitação |
| [08-Mapeamento-importacao.md](08-Mapeamento-importacao.md) | Mapeamento do inventário (gerado) |
| [../base-de-conhecimento/13-Questionario-Larissa.md](../base-de-conhecimento/13-Questionario-Larissa.md) | Questionário da Larissa por áudio |

## Fonte única
- `schema/schema.json` — bases e propriedades (com dono de cada campo)
- `schema/layout.json` — páginas e views
- `import/inventario.json` — inventário do Trello, pendências, referências, hipóteses

## Comandos (Node 18+, sem dependências)
```powershell
node scripts/validar.mjs          # testes offline (coerência entre schema, layout e inventário)
node scripts/gerar-doc.mjs        # regenera 02b e 08 a partir dos JSON
node scripts/setup.mjs            # simulação do setup
node scripts/setup.mjs --apply    # cria no Notion (precisa de .env)
node scripts/importar.mjs --apply # importa o inventário (deduplica pela Chave)
```
Depois de mudar qualquer JSON: rodar `validar` e `gerar-doc`.
