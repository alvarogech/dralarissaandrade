# AI Architecture — STIMMA OS CRM

Estende `AUTOMATIONS.md` (STIMMA AI original — ferramentas internas, sem SQL arbitrário) com os
casos de uso de CRM: extração de conversa, próxima melhor ação, resumo, busca em linguagem
natural. Princípio inalterado: **determinístico decide fatos, IA interpreta e prioriza** (ver
`ARCHITECTURE.md`). A IA nunca é a fonte da verdade de um número, data ou status — sempre consome
o que o `RuleEngine`/`AutomationEngine` já calculou.

## Estado real hoje

Nenhuma chave de LLM de produção está configurada para o CRM ainda. O que existe nesta rodada é o
contrato de ferramentas (tool use) e os guardrails — a mesma disciplina já seguida com o
`STIMMA AI` original (`SECURITY.md`: "nunca executa SQL arbitrário", "só chama ferramentas
internas tipadas e auditadas").

## Três usos de IA no CRM

1. **Extração de conversa** (seção 9 do prompt original) — roda de forma assíncrona após cada
   mensagem inbound relevante, escreve em `interaction_summaries`. Nunca sobrescreve
   `motivation_quote` (a frase original da paciente) — só adiciona/atualiza a interpretação
   estruturada ao lado dela.
2. **Sugestão de mensagem (nível 2)** — ver `AUTOMATION_ENGINE.md`. A IA recebe o contexto
   (histórico, motivação, plano, tempo desde contato) via ferramentas tipadas, nunca acesso bruto
   ao banco, e devolve um rascunho + a razão da sugestão (seção 82: toda recomendação explica de
   onde veio). Gabi sempre aprova ou edita antes de enviar — nunca envio automático em nível 2/3.
3. **Busca em linguagem natural** (seção 57) e **próxima melhor ação por paciente** (seção 37) —
   consultas de leitura, compostas a partir das mesmas ferramentas, nunca SQL gerado pelo modelo.

## Ferramentas internas (estende o catálogo de `AUTOMATIONS.md`)

```text
já existentes: getTodayAppointments · getPatient · getPatientJourney · getOpenOpportunities ·
getFinancialSummary · getOverdueReceivables · getScheduleGaps · getPendingTasks ·
getStaffWorkload · getBusinessMetrics · searchPatients · createTask · createOpportunity ·
prepareFinancialAction

novas para o CRM: getConversationHistory · getInteractionSummary · getTreatmentPlan ·
getPipelineHistory · getPatientsWithoutNextAction (golden rule) · getFollowupsDue ·
getObjectionsByPatient · getClinicalCasesByTag · suggestMessage (nunca sendMessage — enviar é
sempre ação humana ou automação de nível 1 já configurada, não uma tool da IA conversacional) ·
searchPatientsNaturalLanguage (traduz a pergunta em filtros estruturados sobre as tools acima,
nunca em SQL)
```

## Guardrails (seção 83 do prompt original — vinculante, não aspiracional)

A IA nunca: inventa informação, procedimento realizado, valor ou agendamento; altera dado clínico
sem ação explícita de quem tem permissão; oferece diagnóstico ou promete resultado; envia
mensagem sensível sem a política de aprovação; infere condição médica sem registro profissional
existente. Na dúvida, a resposta é "precisa de revisão humana", nunca uma suposição apresentada
como fato.

## Por que a extração de conversa não é sincronizamente bloqueante

Rodar em segundo plano evita que o webhook (`WHATSAPP_ARCHITECTURE.md`) fique esperando uma
chamada de LLM antes de confirmar recebimento ao provider — mesma razão pela qual
`AUTOMATION_ENGINE.md` mantém `delay_minutes` como conceito de primeira classe: automação não é
tempo real por padrão, é confiável primeiro.

## Implementação

`lib/ai/` (a criar): `tools.ts` (as tools acima, tipadas, cada uma um wrapper fino sobre uma
query já usada em `lib/data/`), `guardrails.ts` (validação de saída antes de qualquer sugestão
chegar à UI — nunca um texto de nível 2/3 sem passar por essa checagem), `provider.ts` (camada
abstrata de LLM, mesmo espírito do `WhatsAppProvider` — não acoplar a um modelo específico).
