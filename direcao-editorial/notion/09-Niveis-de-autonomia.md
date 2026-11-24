# 09 — Níveis de autonomia do agente

Fonte executável: `schema/autonomia.json` (lido pelo n8n nas Fases 3 e 4 e conferido por `scripts/validar.mjs`).

## Os três níveis
| Nível | O que é | Como aparece no Notion |
|---|---|---|
| **A · Automático** | O agente executa sozinho e registra. | Recomendação com Decisão "Aplicada automaticamente", para histórico e reversão. |
| **B · Precisa de aprovação** | O agente propõe; aplica só depois do "Aceita". | Recomendação "Aguardando decisão", com Quem decide = Social media, Larissa ou Gestão. Aparece na página de quem decide. |
| **C · Validação humana** | O agente nunca executa. Só sinaliza. | "Validação da Larissa = Necessária" mais o motivo; conteúdo na seção "O que preciso validar" da Larissa. |

## A · Execução automática (com limites)
| Ação | Limite |
|---|---|
| Planejamento editorial preliminar | Semana com "Preliminar do agente". Se a equipe já ajustou, só propõe. |
| Direcionamento diário | Não sobrescreve um Dia "Ajustado pela equipe". |
| Priorizar demandas | Só antes de "Aprovado" e sem edição humana na prioridade. |
| Roteiro preliminar | Só na seção **Rascunho do agente** do corpo. A seção **Roteiro** é da equipe. |
| Ideias no banco | Status Ideia, Origem Agente, no máximo 5 por semana, com checagem de duplicidade. |
| Sugerir captação | Cria "A solicitar". Quem pede à Larissa é a social media. |
| Identificar impedimentos | Preenche Bloqueio e liga Pendência; se a equipe editou, só avisa. |
| Reorganizar não aprovados | Só Ideia, Planejado e Aguardando; move no máximo 7 dias e nunca para antes de hoje; no máximo 3 por dia. |
| Marcar validação necessária | Só escala. Desmarcar é humano. |

## B · Mediante aprovação
| Ação | Quem decide |
|---|---|
| Alterar conteúdo Aprovado, Agendado ou Publicado | Social media |
| Alterar compromisso assumido (data, prazo, captação definidos por humano) | Quem definiu (social media, por padrão) |
| Campanhas e prioridades comerciais | Gestão |
| Posicionamento profissional inédito | Larissa |
| Mudança estratégica relevante (pilares, metas, matriz, mais de 30% do plano) | Gestão |

## C · Sempre humano
Afirmação clínica inédita · divulgação de caso clínico · autorização de uso de imagem ·
publicação no Instagram.

## Quem faz o quê (resumo)
- **Social media:** autonomia operacional total dentro das diretrizes. Edita, adapta, organiza, produz, agenda e publica. Decide as recomendações B de rotina.
- **Larissa:** valida só o que é clínico, caso, resultado ou posicionamento novo. **Não aprova conteúdo de rotina.**
- **Gestão:** campanhas, prioridades comerciais, mudanças estratégicas e autorização de imagem.

## O que mudou em relação à Fase 2
- "Aguardando aprovação" deixou de ser etapa obrigatória. O conteúdo de rotina vai de Em produção direto para Agendado, pelas mãos da social media.
- "Aprovado por / em" passou a se chamar **Validado por / em** e é usado só no nível C.
- Recomendações ganharam **Nível** e **Quem decide**.
- O agente ganhou uma seção própria no corpo do conteúdo (**Rascunho do agente**). Ele escreve ali sem tocar no trabalho humano.

## Proteções que continuam valendo em todos os níveis
"Travar para o agente", o hash de edição humana e o dono de cada campo. O nível A não passa
por cima disso: se a equipe editou, a ação vira B para quem editou.
