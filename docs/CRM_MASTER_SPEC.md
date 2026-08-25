# CRM Master Spec — STIMMA OS

Especificação consolidada do CRM inteligente e automatizado da Clínica Stimma, destilada do
prompt mestre completo do usuário (2026-08-17). Este documento é a referência funcional; o
schema vive em [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md), as automações em
[`AUTOMATION_ENGINE.md`](./AUTOMATION_ENGINE.md), o WhatsApp em
[`WHATSAPP_ARCHITECTURE.md`](./WHATSAPP_ARCHITECTURE.md), a IA em
[`AI_ARCHITECTURE.md`](./AI_ARCHITECTURE.md), as regras de negócio da jornada em
[`CRM_RULES.md`](./CRM_RULES.md).

## 1. Filosofia central

O CRM não deve parecer uma máquina de vendas. A experiência é **sofisticada + humana +
organizada + personalizada + consultiva**. Venda é consequência de autoridade, confiança,
clareza, diagnóstico e acompanhamento — nunca de pressão, escassez falsa ou linguagem de call
center. Filosofia clínica: **Naturalidade Planejada com cuidado longitudinal**. A paciente deve
sentir "existe alguém que me conhece e cuida da minha evolução", nunca "estão tentando me
vender algo".

## 2. Jornada completa

`Lead → relacionamento → avaliação → plano → execução → acompanhamento → manutenção → novos
ciclos → recorrência`

Sete momentos: posicionamento/entrada, autoridade, pré-atendimento, experiência na clínica,
primeira consulta, pós-atendimento, recorrência. O CRM assume principalmente a partir da entrada
do lead.

## 3. Recorrência (definição)

Paciente recorrente ≠ "voltou pra fazer Botox". É quem tem planejamento ativo, retorna
periodicamente, executa em fases, faz manutenção, confia na Dra. Larissa, indica outras pessoas,
permanece relacionada por anos. Toda oportunidade futura fica vinculada a avaliação clínica real,
nunca a venda cruzada genérica — a IA só pode **lembrar** que "Larissa registrou indicação
clínica para X anteriormente", nunca inventar uma.

## 4. Regra de ouro (validação global)

Nenhuma paciente ativa pode ficar sem **status atual + responsável + próxima ação + data da
próxima ação**. Ausência de qualquer um gera alerta. Indicador de dashboard:
`PACIENTES SEM PRÓXIMA AÇÃO`, meta = zero. Implementação: `lib/rules/golden-rule.ts` (ver
task de implementação) + `CRM_RULES.md`.

## 5. Pipeline principal (18 estágios)

```text
1. Novo lead                    10. Compareceu
2. Primeiro contato realizado   11. Plano apresentado
3. Motivação identificada       12. Objeção em acompanhamento
4. Caso/prova enviado           13. Plano aceito
5. Avaliação oferecida          14. Execução em fases
6. Avaliação agendada           15. Pós-procedimento
7. Pagamento pendente           16. Retorno
8. Confirmada                   17. Recorrência ativa
9. (reservado — compat. legado) 18a. Reativação / 18b. Perdida sem continuidade
```

Toda mudança de estágio grava, sem exceção e sem nunca sobrescrever: timestamp, usuário
responsável, motivo, próxima ação esperada, automação eventualmente disparada. Ver tabela
`pipeline_history` em `DATABASE_SCHEMA.md`.

## 6. Perfil 360º da paciente

Uma tela única: cabeçalho (foto, nome, WhatsApp, idade, status, responsável, classificação,
última interação, próxima ação + destaque HOJE/ATRASADO/AMANHÃ/ESTA SEMANA), depois
identificação, origem (+ indicação, se aplicável), inteligência comercial (motivação nas
palavras da própria paciente, receio, objeção, intenção), timeline completa, financeiro
(contratado/recebido/executado — nunca somados), planejamento, oportunidades clinicamente
indicadas, satisfação, indicações geradas.

## 7. Campos de inteligência comercial

Guardados por extração automática da conversa de WhatsApp sempre que possível (nunca formulário
extenso para a Gabi preencher): motivação, resultado desejado, receio, procedimento/profissional
anterior, experiência anterior, objeção, nível de intenção, prazo desejado, caso enviado e
reação, avaliação oferecida/agendada, motivo para não agendar. A frase original da paciente é
sempre preservada ao lado do campo estruturado (nunca só a interpretação da IA).

## 8. WhatsApp como centro operacional

Inbox de 3 colunas (conversas / conversa atual / resumo inteligente da paciente). A Gabi nunca
precisa trocar de tela. Mensagens em 3 níveis:

- **Nível 1 — operacional**: pode ser automática quando configurada (confirmação, lembrete,
  formulário, orientação administrativa).
- **Nível 2 — relacionamento/comercial**: IA sugere, humano aprova/edita antes de enviar.
- **Nível 3 — clínico**: a IA nunca diagnostica, prescreve, promete resultado ou decide conduta —
  sempre direciona para Larissa.

Nenhuma mensagem começa com saudação genérica ("Olá, tudo bem?"). Sempre referência real ao
histórico da paciente. Ver `AI_ARCHITECTURE.md` §guardrails e `WHATSAPP_ARCHITECTURE.md`.

## 9. Motor de follow-up (FUP)

Não é D+1/D+3/D+7 cego — o motor decide **quem, quando, por quê, como abordar**, considerando
motivação, objeção, plano, tempo desde contato, urgência clínica. Cadências configuráveis por
contexto (lead novo, lead parado, plano apresentado sem fechamento, ausência, reativação — ver
`CRM_RULES.md`). Toda tarefa adiada exige nova data explícita (nunca "depois" sem data). Toda
perda exige motivo estruturado. Paciente perdida nunca é apagada.

## 10. Planejamento — plano único

A clínica não apresenta 5 pacotes para "descobrir quanto a paciente paga". Larissa registra **o
plano que entende como ideal** (`Plano Principal`). Impedimento financeiro/agenda não altera o
diagnóstico — gera uma **estratégia de execução** do mesmo plano (fases, priorização, forma de
pagamento), nunca um plano diferente.

## 11. Financeiro — três números nunca somados

`VALOR CONTRATADO` (aprovado pela paciente) ≠ `VALOR RECEBIDO` (dinheiro efetivo) ≠ `VALOR
EXECUTADO` (procedimentos já realizados). Já era um princípio do STIMMA OS original (ver
`opportunities` em `DATABASE.md`) — agora se estende a `treatment_plans`.

## 12. Telas por papel (visão alvo, construída incrementalmente)

- **Gabi**: "Bom dia, Gabi" — prioridades do dia por categoria, botões grandes (Responder leads /
  Fazer follow-ups / Confirmar amanhã / Pós-procedimento / Reativar), Modo FUP (uma paciente por
  vez, mensagem pronta, adiar exige data, próxima ação obrigatória ao concluir).
- **Larissa**: pacientes de hoje com resumo de leitura <30s (motivo, objetivo, receio, indicação,
  histórico, casos enviados), botões pós-consulta (Plano apresentado / Plano aceito / Requer
  follow-up / Próximo passo).
- **Álvaro**: dashboard executivo (mesma base do cockpit "Hoje" já existente, expandido) +
  seção "O que exige minha atenção?" (exceções relevantes selecionadas pela IA, nunca lista
  completa).

## 13. Central de exceções (prioridade sobre relatórios)

Mais importante que dashboards: mostrar o que está errado. Lista viva: lead sem resposta,
paciente sem próxima ação, plano apresentado sem follow-up, pagamento pendente, pós não
realizado, retorno vencido, paciente ativa sem próxima etapa, manutenção vencida, paciente
insatisfeita, plano sem movimentação. Isso substitui e estende o `AlertEngine` já existente.

## 14. MVP (o que precisa funcionar primeiro — seção 105/106 do prompt original)

Paciente + lead + WhatsApp + pipeline + responsável + próxima ação + tarefas + avaliação + plano
+ follow-up + pós + retorno. Critério de sucesso: o sistema responde imediatamente a perguntas
como "quem preciso contatar hoje?", "quem marcou avaliação e não pagou?", "quem recebeu plano e
não fechou, qual foi a objeção?", "quem está sem próxima ação?". Se não responder isso com
facilidade, não está pronto.

**Ajuste de 2026-08-25**: WhatsApp foi adiado por decisão do usuário (ver `DECISIONS.md`) — o
MVP em operação hoje cobre pipeline + responsável + próxima ação + tarefas por entrada manual
(Gabi/Larissa usando `/pipeline` e `/pipeline/fup`), sem depender de mensagem chegando sozinha.
As perguntas do critério de sucesso acima já são respondidas nesse modo; WhatsApp automatiza a
*captura* de lead e o *envio* de mensagem quando for retomado, não é bloqueador do pipeline em si.

## 15. Guardrails de IA (resumo — detalhe em `AI_ARCHITECTURE.md`)

A IA nunca inventa informação, procedimento, valor ou agendamento; nunca diagnostica, prescreve
ou promete resultado; nunca envia mensagem sensível sem a política de aprovação (Nível 2/3);
sempre explica a razão da sugestão (dado de origem); na dúvida, pede revisão humana.

## 16. O que fica fora do MVP (seção 103 do prompt original)

Estoque, ERP completo, folha de pagamento, contabilidade/fiscal, dezenas de relatórios, qualquer
coisa que desvie do núcleo: paciente + relacionamento + FUP + consulta + plano + execução + pós
+ retorno + recorrência.

## 17. Ordem de desenvolvimento

Ver [`ROADMAP.md`](./ROADMAP.md) — as 8 fases do prompt original (Fundação, WhatsApp, Follow-up,
Consulta/Plano, Execução, Pós/Retorno, Recorrência, Inteligência) foram encaixadas nas fases já
em andamento do STIMMA OS (0–4 já parcialmente feitas), não substituídas.

## 18. Decisão de produto (regra de desempate, seção 114 do prompt original)

Rotina mais simples > mais funcionalidades. Mostrar a próxima ação > mais relatórios. Automatizar
o processo, preservar a conversa humana > mais automação por si só.
