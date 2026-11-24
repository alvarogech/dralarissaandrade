# Central Editorial no Notion (Fase 2)

| Arquivo | Entregável |
|---|---|
| [RELATORIO-FASE-2.md](RELATORIO-FASE-2.md) | Relatório: o que está pronto, o que configurar, o que depende da equipe |
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
