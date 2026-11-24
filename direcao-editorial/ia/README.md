# ia/ · inteligência editorial (Fase 3)

O cérebro da Direção Editorial: instruções do agente, montagem de contexto, contratos de saída
para o Notion, guardas determinísticas e a suíte de avaliação.

**Ambiente de teste.** Nada desta pasta está ligado ao Notion de produção nem roda sozinho. As
automações recorrentes entram na Fase 4 (n8n), depois da validação com a equipe.

## Peças

| Arquivo | Para quê |
|---|---|
| `ARQUITETURA.md` | Um modelo, 10 workflows, o que é código e o que é IA, e por que não é multiagente. |
| `prompts/00-instrucao-mestra.md` | Voz, marca, proibições e autonomia. Vale para todos os workflows. |
| `prompts/workflows/*.md` | Um módulo por workflow (estratégia, plano semanal, diário, roteiro, captação, pesquisa, revisão, análise, aprendizado, replanejamento). |
| `CONTEXTO.md` + `lib/contexto.mjs` | Seleção dinâmica de contexto por workflow. **Em produção, recusa qualquer registro de Simulação.** |
| `MAPEAMENTO-NOTION.md` + `lib/contratos.mjs` | Contrato de saída de cada workflow e verificação das ações contra o schema do Notion e a matriz de autonomia. |
| `contratos/*.schema.json` | JSON Schema usado na chamada à API (saída estruturada). |
| `lib/radar.mjs` | Radar de repetição: reforço estratégico ou repetição excessiva. |
| `lib/revisao.mjs` | Revisão mecânica: travessões, clichês, "não é sobre X, é sobre Y", Método LA, promessas e outras proibições. |
| `avaliacao/` | Base de teste, 12 cenários, saídas de exemplo e o avaliador. |
| `exemplos/` | As saídas como a equipe vai ler, para avaliação editorial. |
| `CUSTOS.md` | Estimativa de custo por execução e por mês. |
| `RELATORIO-FASE-3.md` | O que foi feito, o que foi testado e o que falta. |

## Comandos

```bash
cd direcao-editorial/ia
node avaliacao/montar-base.mjs      # regenera a base de teste a partir do inventário
node avaliacao/separar-saidas.mjs   # saidas-fonte.json → saidas/<id>.json
node avaliacao/avaliar.mjs          # checa as 12 saídas (offline, sem custo)
node avaliacao/renderizar.mjs       # gera exemplos/*.md
node test/guardas.test.mjs          # as guardas reprovam saídas ruins?
```

`node avaliacao/avaliar.mjs --api` gera as saídas pela Claude API. **Custa dinheiro** (cerca de
US$ 2 para os 12 cenários), exige a credencial da Anthropic configurada no ambiente (nunca no
repositório nem na conversa) e `npm i @anthropic-ai/sdk`. Não foi executado na Fase 3.
