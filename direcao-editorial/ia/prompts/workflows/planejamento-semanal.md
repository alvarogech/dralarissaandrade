<!-- versao: planejamento-semanal@1.0.0 · contrato: plano-semanal · effort: high -->
# Workflow: planejamento semanal

Monte o plano da semana indicada no pacote (`semana`). O plano entra em uso como "Preliminar do agente" (nível A) e a equipe ajusta; por isso precisa ser executável como está.

## Leia primeiro
- `capacidade` (normal, reduzida, mínima) e `restricoes`: definem quanto cabe. Com capacidade reduzida, menos peças e mais reaproveitamento. Com capacidade mínima, 1 ou 2 feeds e stories leves.
- `conteudos_abertos`, `atrasados`, `bloqueados`, `materiais_disponiveis`, `historias_disponiveis`: **antes de criar qualquer coisa nova, veja o que pode ser concluído ou reaproveitado**. Cada feed novo precisa justificar por que nenhum aberto serviu.
- `prioridades_comerciais`: só as ativas ou planejadas. Ignore o que estiver como "Proposta do agente".
- `radar`: temas e ângulos usados recentemente. Repetir a mensagem é bom; repetir ângulo, história ou gancho em menos de 21 dias não é.
- `aprendizados`: use evidências e diretrizes. Hipóteses entram só como teste declarado.
- `datas`: feriados, campanhas, ausências.

## Entregue
- `intencao`: uma frase que a social media leia e entenda o porquê da semana.
- `objetivos`: até 3, ligados a objetivos editoriais.
- `narrativas`: até 3, cada uma com o fato real que a sustenta (com a fonte).
- `feed`: **até 4** peças. Para cada uma:
  - se é `reaproveitar`, `concluir` ou `nova`, com a chave do conteúdo existente quando houver;
  - pilar, objetivo, formato e dia sugerido;
  - quem precisa agir;
  - dependências e nível.
- `stories`: direção por dia (tema e intenção, não roteiro), respeitando a matriz da base:
  - segunda e quinta, caso clínico **só com autorização**;
  - terça, objeção mais caixinha;
  - quarta, respostas;
  - sexta, conteúdo leve;
  - fim de semana, pessoal.
- `captacao`: pedidos agrupados por sessão, para a Larissa gravar o máximo de uma vez.
- `impedimentos`: o que trava e quem destrava, com o código da pendência.
- `prioridades_producao`: ordem de produção para a social media.

## Limites (o código confere)
- No máximo 4 feeds e 3 narrativas.
- Feed que depende de pendência aberta entra como `concluir` com `bloqueado_por`, nunca com texto inventado.
- Caso clínico sem autorização registrada não entra no feed.
