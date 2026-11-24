# 04 — Responsabilidades e permissões

## Matriz de responsabilidades (R = faz · A = aprova/decide · C = consultada · I = informada)

| Atividade | Larissa | Social media | Gestão | Agente (IA) |
|---|---|---|---|---|
| Contar a rotina do dia | **R** | I | | C (lê) |
| Gerar direcionamento diário | I | I | | **R** |
| Ajustar prioridades do dia | | **R** | I | |
| Plano semanal | C | C | I (aprova só mudança estratégica) | **R** (nível A, preliminar) |
| Prioridades comerciais | C | I | **R/A** | C (lê) |
| Registrar ideia | **R** | **R** | R | R (como Recomendação) |
| Escrever ou ajustar roteiro | C | **R** | I | R (nível A, só em "Rascunho do agente") |
| Sugerir formato novo | C | **R** | I | R (como Recomendação) |
| Alterar data de publicação | I | **R** | I | R (como Recomendação) |
| Pedir material à Larissa | I | **R** | | R (cria pedido de Captação) |
| Gravar | **R** | R | | |
| Aprovar conteúdo de rotina | I | **A** | | |
| Validar clínico, caso, resultado ou posicionamento inédito (nível C) | **A** | R | I | ✗ só sinaliza |
| Aprovar campanha ou mudança estratégica (nível B) | C | I | **A** | R (propõe) |
| Agendar e publicar no Instagram | I | **R** | | ✗ nunca |
| Responder pergunta clínica | **R** | | | ✗ nunca inventa |
| Registrar dificuldade | | **R** | I | C (lê) |
| Pedir revisão ao agente | R | **R** | R | executa |
| Lançar métricas | | **R** (manual por enquanto) | C | R (análise) |
| Promover aprendizado a "Validado por dados" | | | **A** | R (propõe) |
| Reprocessar execução com erro | | | **R** | executa |

> Níveis de autonomia do agente (A automático, B com aprovação, C humano): ver `09-Niveis-de-autonomia.md`.

## Dono de cada campo (regra que as automações respeitam)
Cada propriedade tem um dono no `schema.json`. A lista completa está em `02b-Propriedades.md`.

| Dono | O agente pode escrever? |
|---|---|
| Larissa · Social media · Gestão · Equipe | **Não.** Mudança proposta vira Recomendação. Única exceção: preencher um campo humano **vazio** de uma página que o próprio agente criou e que ainda está em Ideia ou Planejado, sem edição humana. |
| Agente | Sim, se a página não estiver travada e o hash bater (ninguém editou desde a última escrita dele). Se não bater, vira Recomendação. |
| Sistema | Só o n8n e o próprio Notion. |

**A autonomia da social media é total nos campos dela.** Ela edita roteiro, data, formato e
status direto. As automações detectam a edição (hash diferente, ou "Atualizado por" diferente
da integração) e **param de escrever** naquela página. Se quiser blindar, ela marca "Travar
para o agente".

## Permissões no Notion (configuração manual)
A API **não** gerencia permissões, então isso é feito à mão. O Notion não restringe a edição por
propriedade, só por página ou base. Por isso a regra de dono de campo acima é garantida pelas
automações, não pelo Notion.

| Página ou base | Larissa | Social media | Gestão | Conexão n8n |
|---|---|---|---|---|
| Central Editorial (raiz) | Pode editar conteúdo | Pode editar conteúdo | Acesso total | Acesso (conectada) |
| Hoje / Larissa / Gestão | Pode editar conteúdo | Pode editar conteúdo | Acesso total | Acesso |
| Bases (dados) | **Pode editar conteúdo** (edita linhas, não altera estrutura) | **Pode editar conteúdo** | Acesso total | Acesso |
| Motor (técnico) | Sem acesso | Pode ver | Acesso total | Acesso |

"Pode editar conteúdo" em bases impede alguém de apagar uma coluna ou mudar uma opção por
acidente, o que quebraria a integração. Confira no plano contratado se esse nível existe para
convidados. Se não existir, a alternativa é deixar a social media como membro com "Pode editar"
e combinar que a estrutura só muda pela gestão.

Pessoas: a social media pode entrar como **convidada**, sem custo de assento, se o plano
permitir. Larissa e gestão entram como membros.
