# Mapeamento das saídas com o Notion implantado

Todas as ações saem no formato `acoes[]` (ver `lib/contratos.mjs`):
`{nivel, tipo, base, chave, campos[{campo, valor}], quem_decide, motivo, fontes}`.
`checarAcoes()` recusa qualquer ação que escreva em campo protegido ou de dono humano no nível A.

## Para onde vai cada saída
| Saída | Base · campo | Dono | Nível típico |
|---|---|---|---|
| Plano semanal: intenção, narrativas | Semanas · Intenção editorial, Narrativas | Agente | A |
| Plano semanal: status | Semanas · Status do plano = "Preliminar do agente" | (equipe muda depois) | A, só ao criar |
| Feed planejado (existente) | Conteúdos · Semana, Prioridade | Equipe | A se não editado; senão B |
| Feed novo | Conteúdos (novo, Status Ideia ou Planejado, Origem Agente, Chave `agente:...`) | — | A |
| Direcionamento do dia | Dias · Intenção do dia, Prioridade 1 a 3, Direcionamento = "Gerado pelo agente"; corpo: seções do agente | Agente | A |
| Stories sugeridos | Dias · corpo "Stories sugeridos" (ou Conteúdo "Sequência de stories" novo) | Agente | A |
| Pedido de captação | Captação (novo, Status "A solicitar") | — | A |
| Roteiro | Conteúdos · corpo "Rascunho do agente" | Agente | A (C se houver pendência clínica) |
| Mudança em roteiro, data ou formato decidido pela equipe | Recomendações (Nível B, Quem decide) | — | B |
| Impedimento novo | Pendências e decisões (novo) + Conteúdos · Bloqueio | Equipe (Bloqueio só se não editado) | A |
| Validação clínica necessária | Conteúdos · Validação da Larissa = "Necessária", Motivo da validação | Larissa / Agente | C (só escala) |
| História da rotina | Histórias (novo, Status Nova, Relato literal, Dia de origem) | — | A |
| Análise de referência | Referências · Gancho observado, Estrutura narrativa, Possibilidade de adaptação, Adequação à marca, Limitações | Agente | A |
| Aprendizado | Aprendizados (novo) · Status Hipótese ou Preferência, Fonte, Ocorrências, Evidências | — | A; Diretriz só B |
| Campanha ou mudança estratégica | Recomendações (B, Gestão) | — | B |
| Execução | Execuções (sempre) | Sistema | — |

## Campos que o agente **nunca** escreve
Autorização de imagem · Validado por/em · Resposta / Respondida em · Minha rotina ·
Disponibilidade para gravar · Publicado em · Link da publicação · Decisão / Decidido por/em ·
Travar para o agente · Status do plano (depois de criado) · seções "Roteiro" e "Notas da equipe"
do corpo.

## Identificadores, versão e duplicidade
- **Chave** em toda criação: `agente:<workflow>:<AAAA-MM-DD ou semana>:<n>`. Antes de criar, o n8n consulta a Chave; se já existe, atualiza (quando pode) ou ignora.
- **Duplicidade de conteúdo:** antes de criar um Conteúdo, o `radar` compara com os últimos 90 dias. Se der `repeticao_excessiva`, a ação vira Recomendação "Possível duplicidade" (B).
- **Versão:** a cada escrita aplicada, Versão + 1, Hash do agente, Última escrita do agente e Execução. Cada Execução guarda a versão do prompt (`mestra@1.0.0`, `diario@1.0.0`…).
- **Dependências:** `bloqueado_por` e `fontes` usam o Código (P-xx) e a Chave. O n8n resolve para IDs de página.

## Por que foram criados campos e uma base nova (Fase 3)
| Mudança | Justificativa |
|---|---|
| Base **Histórias** | Uma história gera vários conteúdos ao longo do tempo e tem ciclo próprio (Nova → Pronta → Usada), privacidade própria (Envolve, Identificação, Autorização) e precisa de contagem de uso. Num campo de Conteúdos, isso se perderia. |
| Conteúdos · **Tema**, **Argumento central**, **Procedimentos citados**, **História** | O radar de repetição precisa comparar essas dimensões. Sem elas, só teria título e gancho. |
| Referências · 7 campos de análise | Pedidos pelo fluxo de pesquisa (gancho, estrutura, adaptação, adequação, limitações, data, formato). |
| Aprendizados · status **Preferência**, **Evidência**, **Diretriz aprovada**; **Fonte**, **Ocorrências** | Classificação pedida (hipótese, preferência, evidência, diretriz) e regra de que uma ocorrência não vira regra. |
