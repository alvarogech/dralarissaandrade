# Seleção de contexto

Código: `lib/contexto.mjs` (`montarPacote(workflow, snapshot, {hoje, ambiente})`).

## Como funciona
1. **Snapshot:** o n8n lê o Notion e normaliza os campos (chave, titulo, status, formato, pilar, objetivo, tema, argumento, procedimentos, gancho, cta, prazo, publicacao_prevista, publicado_em, com_quem, validacao, motivo_validacao, autorizacao, bloqueio, pendencias, travado, editado_pela_equipe, historia, origem…).
2. **Filtro de ambiente:** em `producao`, tudo que tem Origem = Simulação sai, e o código **lança erro** se sobrar algum registro. Em `teste`, a simulação pode entrar.
3. **Recorte por workflow** (`ORCAMENTOS`): cada workflow recebe só o que usa. O diário, por exemplo, recebe até 15 conteúdos abertos e 14 dias de publicados; a análise recebe métricas e nenhum conteúdo aberto.
4. **Ordenação por relevância:** atrasados primeiro, depois os que publicam nos próximos 7 dias, depois os em produção; pendências por quantos conteúdos destravam; aprendizados com diretriz e evidência antes de hipótese; histórias menos usadas primeiro.
5. **Radar:** resumo do que foi dito nos últimos 60 dias, por tema (argumento, gancho, história). No roteiro, a comparação completa com o conteúdo-alvo.
6. **Compactação:** campos vazios saem do pacote.

## O que fica fora do pacote, e por quê
- **Base de conhecimento:** vai no prefixo em cache, com a instrução mestra, porque não muda a cada chamada.
- **Histórico completo, corpos de página e textos longos de roteiros antigos:** o radar usa só tema, argumento, gancho e história.
- **Dados de pacientes:** o pacote nunca leva nome, imagem ou dado clínico de paciente; só o status de autorização.

## Tamanho esperado
| Workflow | Pacote (tokens, aprox.) |
|---|---|
| Direcionamento diário | 3 a 5 mil |
| Plano semanal | 6 a 10 mil |
| Roteiro | 2 a 4 mil |
| Análise de desempenho | 4 a 8 mil |

Medido sobre os cenários de teste por `avaliacao/avaliar.mjs` (estimativa de 4 caracteres por token).
