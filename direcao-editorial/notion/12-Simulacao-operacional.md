# 12 — Simulação operacional (semana 2026-W48, 23 a 29/11)

Todos os registros têm **[SIMULAÇÃO]** no título, Origem = Simulação e Chave começando com `sim:`.
São dados fictícios para testar a navegação, não conteúdo real.

## O que foi simulado
| Cenário pedido | Registro | Onde deve aparecer |
|---|---|---|
| Planejamento semanal | Semana W48 (Preliminar do agente, capacidade Reduzida) + Recomendação nível A aplicada | Hoje › Intenção da semana; Gestão › Semanas |
| Quatro conteúdos de feed | F1 Reels (em produção, prazo hoje) · F2 Carrossel (agendado para hoje) · F3 Carrossel caso clínico (aguardando validação) · F4 Reels conexão (atrasado) | Produzir hoje, Publicar hoje, Para eu validar, Atrasados |
| Direcionamento diário de stories | Dia "Ter 24/11" com intenção, Prioridade 1 a 3 e corpo com stories sugeridos; S1 Sequência de stories | Hoje › Direcionamento de hoje; Stories de hoje |
| Demandas de captação | 3 pedidos: vídeo falado (a solicitar), bastidor das 15h (solicitado à Larissa), takes em casa (agendado, juntas) | Pedir à Larissa; Larissa › O que preciso gravar |
| Conteúdo aguardando aprovação | F3 (Validação da Larissa = Necessária, caso clínico + imagem de paciente) | Larissa › O que preciso validar; Dependem da Larissa |
| Uma pendência clínica | "Posso citar o tempo de duração do resultado no Reels F1?" ligada ao F1 | Larissa › Perguntas para mim |
| Uma alteração solicitada pela social media | F2 com "Pedir revisão ao agente" + "O que revisar"; resposta simulada do agente como Recomendação **nível B** (F2 já agendado) | Hoje › Sugestões do agente que precisam de você |
| Um conteúdo atrasado | F4 (prazo 20/11, publicação 22/11, em produção) | Atrasados; Gestão › Atrasados e bloqueados |
| Oportunidade espontânea da rotina | Rotina do dia cita o retorno de paciente desde 2020; vira Ideia O1 + pedido de bastidor + Recomendação nível A | Banco de ideias; Larissa › O que preciso gravar |
| Extra: campanha | Prioridade "Proposta do agente" + Recomendação **nível B** para a gestão | Gestão › Recomendações para a gestão |
| Extra: erro de automação | Execução "Erro" com Reprocessar marcado | Gestão › Saúde da automação |

## Resultado das views (consultadas em 2026-11-24, no modo view, com os filtros salvos)
| View | Esperado | Obtido |
|---|---|---|
| Produzir hoje | F1 | ✅ F1 |
| Publicar hoje | F2 | ✅ F2 |
| Atrasados | F4 | ✅ F4 (antes da correção: filtro descartado) |
| Stories de hoje | S1 | ✅ S1 |
| Semana vigente | W48 | ✅ W48 (antes da correção: vazia) |
| Hoje (Dia) | Ter 24/11 com 3 prioridades e rotina | ✅ |
| Pedir à Larissa | Vídeo falado | ✅ |
| Para eu gravar (Larissa) | Bastidor 15h + takes em casa | ✅ 2 itens |
| Para eu validar (Larissa) | F3 + conteúdos clínicos reais do Trello | ✅ 8 itens (F3 + 7 do Trello) |
| Para decidir (social) | Recomendação B do F2 | ✅ |
| Para a gestão | Recomendação B da campanha | ✅ |
| Execuções com problema | Execução com erro | ✅ |

## Achados de experiência
1. **"Para eu validar" começa com 8 itens**, porque 7 conteúdos reais do Trello dependem de informação clínica. Isso é o retrato real do inventário e cai à medida que ela responde o questionário. Sugestão: começar pelo Bloco 1 (Método ERA).
2. Resposta em **1 minuto** para a social media: as 5 perguntas pedidas estão no topo da página Hoje, cada uma com uma tabela de no máximo 5 colunas.
3. **O que ainda não foi testado com pessoas:** o tempo real que a social media e a Larissa levam, e a leitura no celular. Esse é o teste da Etapa 3 (abaixo).

## Roteiro do teste com pessoas (Etapa 3)
**Social media (cronometrar 1 minuto), só pela página Hoje:**
1. O que você produz hoje? (esperado: F1)
2. O que sai hoje? (F2 e os stories S1)
3. O que você precisa pedir à Larissa? (vídeo falado)
4. O que está atrasado? (F4)
5. O que depende da Larissa? (F3 e itens do Trello)

**Larissa (cronometrar 5 minutos), no celular, só pela página Larissa:**
1. Contar a rotina de amanhã no Dia "Qua 25/11".
2. Ver o que gravar.
3. Abrir F3 e marcar "Validado" (ou comentar).
4. Responder a pergunta clínica simulada.
5. Registrar uma ideia pelo formulário.

Anotar onde cada uma travou: isso vira o ajuste final antes da Fase 3.
