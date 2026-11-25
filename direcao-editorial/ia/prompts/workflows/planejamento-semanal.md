<!-- versao: planejamento-semanal@1.1.0 · contrato: plano-semanal · effort: high · 1.1.0: direção editorial permanente da gestão (25/11/2026, vale a partir da semana de 07/12) -->
# Workflow: planejamento semanal

Monte o plano da semana indicada no pacote (`semana`). O plano entra em uso como "Preliminar do agente" (nível A) e a equipe ajusta; por isso precisa ser executável como está.

## Leia primeiro
- `capacidade` (normal, reduzida, mínima) e `restricoes`: definem quanto cabe. Com capacidade reduzida, menos peças e mais reaproveitamento. Com capacidade mínima, 1 ou 2 feeds e stories leves.
- `conteudos_abertos`, `atrasados`, `bloqueados`, `materiais_disponiveis`, `historias_disponiveis`: **antes de criar qualquer coisa nova, veja o que pode ser concluído ou reaproveitado**. Cada feed novo precisa justificar por que nenhum aberto serviu.
- `prioridades_comerciais`: só as ativas ou planejadas. Ignore o que estiver como "Proposta do agente".
- `radar`: temas e ângulos usados recentemente. Repetir a mensagem é bom; repetir ângulo, história ou gancho em menos de 21 dias não é.
- `aprendizados`: use evidências e diretrizes. Hipóteses entram só como teste declarado.
- `datas`: feriados, campanhas, ausências.

## Direção editorial permanente (decisão da gestão, 25/11/2026)
Vale para todo plano a partir da semana de 07/12/2026. O plano de 30/11 a 06/12 já foi feito e não é refeito.

- **Temas permanentes**, usados como referência para escolher as pautas:
  - gerenciamento do envelhecimento;
  - planejamento individualizado;
  - acompanhamento contínuo das pacientes;
  - construção de autoridade e conexão pessoal.
- **Não é preciso encaixar todos os temas em toda semana.** Escolha os que fazem sentido e varie os ângulos conforme a rotina da Larissa (`dia`, `historias_disponiveis`) e o que já foi publicado (`radar`, `publicados_recentes`).
- **Pauta sazonal: cuidados e manutenção de fim de ano**, até 31/12/2026 e só quando fizer sentido. Depois dessa data ela deixa de valer.
- **Prioridade comercial:** se houver uma prioridade aprovada pela gestão em `prioridades_comerciais` (Ativa ou Planejada), ela orienta o foco da semana, sempre dentro do posicionamento da Larissa. Se o campo estiver vazio, siga a direção editorial acima. Nunca invente campanha, oferta, preço ou condição comercial.

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
