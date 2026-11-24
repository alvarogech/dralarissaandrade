# Relatório da Fase 4A · piloto de operação editorial autônoma

Data: 24/11/2026. Arquitetura: tarefas agendadas do Claude Code na nuvem + conector do Notion, na assinatura atual.
Nenhuma API paga, nenhum n8n, nenhum serviço contratado. **Agendamentos recorrentes criados e desativados.**

## 1. Configuração realizada

| Item | Situação |
|---|---|
| Repositório | 7 commits do `direcao-editorial/` enviados a `alvarogech/dralarissaandrade` (público, por decisão do Álvaro). Nada de outros projetos. |
| Tarefa A · planejamento semanal | `trig_01Qjkcg5eQhgQJD3KXCM8yLs`, segunda 6h (America/Sao_Paulo), **desativada** |
| Tarefa B · direcionamento diário | `trig_01Jw1uvydFWH2vKmq6Qq9VX3`, todo dia 6h30 (America/Sao_Paulo), **desativada** |
| Tarefa de teste | `trig_012TNZ3JoSNwpJiixu76uShg`, avulsa, modo piloto-teste (já executada 2 vezes; não se repete sozinha) |
| Modelo | claude-opus-5-5 nas três |
| Ambiente | nuvem da Anthropic (funciona com o computador desligado) |
| Pipeline | `ia/operacao/operar.mjs` + `mapa.mjs`, roteiro em `RUNBOOK.md` |
| Notion | 10 views "Agente · leitura" (uma por base); 3 registros de teste fixos; página "Piloto 4A · acompanhamento de 21 dias" em Gestão |

## 2. Permissões concedidas

- **Conectores:** só o Notion. Supabase, Netlify, Google Drive, Google Sheets e os demais ficaram de fora (o teste confirmou que só o Notion apareceu).
- **GitHub:** só como origem do repositório (clonagem). Não é conector; a tarefa tem instrução de não fazer commit nem push, e `ConnectGitHub` está bloqueado.
- **Ferramentas do Notion:** liberadas fetch, consulta, criar página e atualizar página. Bloqueadas 36 outras, entre elas excluir páginas, bases e comentários, mover, criar base, alterar views e propriedades, comentários e calendário.

## 3. Resultado da execução na nuvem

Duas execuções de teste, cada uma com 4 a 5 minutos.

| | Teste 1 (14h15) | Teste 2 (14h32) |
|---|---|---|
| Repositório clonado, Node 22 | ✅ | ✅ |
| Notion lido (10 bases, por view) | ✅ | ✅ |
| Simulação fora do contexto | ✅ (23 registros de simulação lidos, 0 no pacote) | ✅ |
| Instrução mestra, base e módulo aplicados | ✅ | ✅ |
| Guardas em código (validação na 1ª tentativa) | ✅ | ✅ |
| Sondas de preservação (travado e agendado barrados) | ✅ | ✅ |
| Criação de registros de teste | ✅ 2 criados | ✅ 1 criado |
| Atualização de registro de teste (propriedades e seções do corpo) | ❌ cancelada (ver abaixo) | ✅ 7 operações |
| Alterações humanas preservadas (conferido depois) | ✅ intactas | ✅ intactas |
| Conferência depois da escrita | ⚠️ status errado | ⚠️ falso negativo |
| Registro na base Execuções | ✅ | ✅ |

**Teste 1:** o agente salvou a releitura do Dia depois de rodar a conferência; a guarda cancelou as 5 escritas no Dia, como devia, mas o registro saiu como "Sucesso".
Corrigido: releitura faltando agora para o comando com erro (sem cancelar nada), e cancelamento que não vem de alteração humana conta como falha.

**Teste 2:** tudo foi gravado. A conferência apontou 2 seções como não confirmadas porque o Notion devolve o negrito como `<b>`. Conferi a página manualmente: o texto está lá. Corrigido na versão `operacao@4a.2` e verificado localmente com o formato real. **Não houve uma terceira execução na nuvem com essa correção.**

Os dois registros na base Execuções receberam uma nota da revisão com o que de fato aconteceu.

## 4. Exemplo do direcionamento gerado (Dia de teste, rotina fictícia)

> **Intenção do dia:** Usar a pergunta real de hoje ("dá para fazer só um pouquinho para ninguém perceber?") para mostrar como a Larissa pensa o planejamento, sem expor a paciente e sem prometer nada.
>
> **Prioridades:** 1. Só um pouquinho pra ninguém perceber (vídeo falado da tarde, stories hoje, Reels guardado). 2. Momento consulta. 3. Não indico protocolo Ctrl C, Ctrl V (parado em P-00, só cobrar a gestão).
>
> **Stories:** "Hoje uma paciente me perguntou se dava para fazer só um pouquinho, para ninguém perceber." Depois o vídeo falado e a caixinha "Qual dúvida você tem medo de perguntar na consulta?"
>
> **Captação:** fala de 30 a 40 s à tarde, celular na vertical, sem identificar a paciente, sem citar quantidade, produto ou duração de resultado.
>
> **Para a Larissa:** registrar as palavras exatas da paciente; P-07, P-20, P-02.
>
> **Avisos:** pouco tempo para gravar, então um pedido só; rotina fictícia (teste).

A social media encontra isso no próprio Dia, no Notion, sem abrir o Claude.

## 5. Registros criados no Notion (todos de teste, Origem = Simulação, `[TESTE 4A]`)

- Dia `[TESTE 4A] Ter 24/11` (criado para o teste, recebeu o direcionamento)
- Conteúdos `[TESTE 4A] Conteúdo travado pela equipe` e `[TESTE 4A] Conteúdo agendado` (sondas; intactos)
- Conteúdo `[TESTE 4A] Só um pouquinho pra ninguém perceber` (Ideia, com rascunho do agente)
- Captação `[TESTE 4A] Vídeo falado: a pergunta do só um pouquinho`
- História `[TESTE 4A] A paciente que pediu só um pouquinho para ninguém perceber`
- 2 Execuções `[TESTE 4A] direcionamento-diario 2026-11-24`
- 10 views "Agente · leitura" e a página "Piloto 4A · acompanhamento de 21 dias"

Nenhum registro real foi alterado. No modo teste, mudanças em registros reais (por exemplo, prioridade do C-02) ficaram só no relatório.

## 6. Limitações encontradas

1. **Bloqueio de ferramentas não verificado.** A lista de ferramentas permitidas do conector não restringiu o que a sessão enxergou (o teste 2 listou todas as ferramentas do Notion). Foi acrescentada uma lista de 36 ferramentas proibidas; ela está gravada nas duas tarefas, mas ainda não foi verificada em execução.
2. **O conector age como o usuário do Álvaro no Notion**, com acesso a todo o workspace. Restringir à Central Editorial depende das instruções e do código (o plano só aponta para as bases da Central), não de uma permissão técnica.
3. **Cota de consultas do Notion:** em planos que não são Business, as consultas SQL e "rows" têm limite por hora (esgotou no teste local). O pipeline usa só o modo view e o fetch, que não têm essa cota.
4. **Horário aproximado:** a plataforma avisa que a execução pode começar alguns minutos depois (o diário aparece como 6h38).
5. **Rotina da Larissa:** às 6h30 a rotina do dia costuma estar vazia; sem ela, o direcionamento usa só o que já existe. O agente cria o Dia de amanhã todo dia, para a Larissa preencher na noite anterior.
6. **Plano semanal testado só localmente**, não na nuvem.
7. **Prioridades 2 e 3** apareceram no texto do Dia de teste, mas só a Prioridade 1 ficou como relação. Investigar na primeira execução real.
8. **Uso da assinatura:** cada execução usou de 43 a 57 passos do Opus em 4 a 5 minutos. O impacto no limite de uso só aparece com o piloto.
9. **Repositório público:** a base de conhecimento está aberta na internet (decisão registrada).

## 7. Pendências para a ativação definitiva

1. Aprovar uma execução curta para confirmar que as 36 ferramentas proibidas não aparecem mais na sessão. Ou decidir ativar mesmo sem essa confirmação.
2. Compartilhar a Central com a Larissa e a social media (pendência da Fase 2.1) e combinar o preenchimento da rotina na noite anterior.
3. Ativar as tarefas A e B (eu ativo quando você aprovar).
4. Decidir o que fazer com os registros de teste: arquivar ou manter visíveis como exemplo. Não serão excluídos sem a sua confirmação.
5. Começar o acompanhamento de 21 dias na página do Notion.

---

# Validação final (24/11, tarde)

**Parecer: pronto com ressalvas.**

| Verificação | Resultado |
|---|---|
| Ferramentas proibidas do Notion (excluir, mover, criar base, alterar views e propriedades, comentar) | Indisponíveis na tarefa (restrição técnica, confirmada na nuvem) |
| Plano semanal na nuvem | Sucesso: Semana com intenção e plano no corpo; 3 conteúdos existentes relacionados (nenhum novo); 2 captações; 1 pendência; 1 recomendação |
| Direcionamento diário | Sucesso: coerente com a semana; Prioridades 1, 2 e 3 como relação; normalização de HTML e conferência pós-escrita OK |
| Repetição na mesma rodada | Barrada ("Ignorada (duplicada)"), nada criado |
| Alteração humana (Intenção do dia reescrita) | Preservada; a proposta do agente virou recomendação para a social media |
| Sondas (travado, agendado, editado) | Barradas e intactas |
| Registros de teste | Arquivados por status, nada excluído; views operacionais filtram Origem = Simulação; produção remove simulação do snapshot |

**Ressalvas:** o conector do Notion tem leitura em todo o workspace e escreve com o usuário do Álvaro (sem escopo por página, conforme a documentação oficial; restrição à Central depende do código e das instruções). As seções do corpo escritas pelo agente podem ser reescritas por ele (o guia orienta a equipe a editar em Roteiro, Notas e Observações). A base Execuções mantém o histórico dos testes (sem filtro de Origem). Narrativas da semana: corrigido no código depois da validação (não reexecutado na nuvem).
