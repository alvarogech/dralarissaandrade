# 02b — Propriedades de cada base

> **Gerado** por `node scripts/gerar-doc.mjs` a partir de `schema/schema.json`. Não edite à mão.
>
> Dono = quem pode escrever no campo. O agente (IA) só escreve em campos "Agente (IA)" ou "Sistema"; mudanças em campos humanos viram uma Recomendação.

## Propriedades comuns

Presentes em todas as bases (Execuções usa só ID e datas).

| Propriedade | Tipo | Dono | Descrição |
|---|---|---|---|
| ID | ID único | Sistema | Identificador estável legível (prefixo por base). Nunca muda. |
| Chave | Texto | Sistema | Chave externa estável e de idempotência. Ex.: trello:C-01, pendencia:P-01, agente:planejamento-semanal:2026-W49:3. Única por base. |
| Origem | Seleção | Sistema | Quem originou a informação (autoria lógica). Created by mostra a integração quando o n8n cria; Origem mostra de onde veio. |
| Criado por | Criado por | Sistema |  |
| Criado em | Data de criação | Sistema |  |
| Atualizado por | Editado por | Sistema |  |
| Atualizado em | Data de edição | Sistema |  |

## Propriedades de sincronização (técnicas, ocultas)

Presentes nas bases que o agente escreve: Conteúdos, Semanas, Dias, Captação, Pendências e decisões, Histórias, Aprendizados.

| Propriedade | Tipo | Descrição |
|---|---|---|
| Versão | Número | Incrementada a cada escrita do agente aplicada. |
| Hash do agente | Texto | SHA-256 dos campos do agente na última escrita dele. Se o hash atual diferir, houve edição humana: o agente não sobrescreve. |
| Última escrita do agente | Data |  |
| Sincronização | Seleção |  |
| Execução | Relação | Última execução do n8n que escreveu nesta página. |

## 📝 Conteúdos (prefixo CON)

Fonte única de cada peça de conteúdo, inclusive ideias (Status = Ideia) e sequências de stories.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Título | Título | Equipe (humano) |  |
| Status | Status | Equipe (humano) | Ideia [To-do] · Planejado [To-do] · Aguardando informação [To-do] · Aguardando captação [To-do] · Em produção [In progress] · Aguardando aprovação [In progress] · Aprovado [In progress] · Agendado [In progress] · Publicado [Complete] · Analisado [Complete] · Arquivado [Complete] |
| Formato | Seleção | Equipe (humano) | Reels · Carrossel · Sequência de stories · Foto · A definir |
| Pilar | Seleção | Equipe (humano) | Autoridade · Desejo e prova social · Conexão |
| Objetivo | Seleção | Equipe (humano) | Descoberta · Engajamento · Educação · Construção de confiança · Quebra de objeção · Geração de desejo · Conversão · Fidelização |
| Prioridade | Seleção | Equipe (humano) | Alta · Média · Baixa |
| Com quem está | Seleção | Equipe (humano) | Larissa · Social media · Gestão. Quem precisa agir agora. Select (e não pessoa) para o n8n conseguir preencher sem IDs de usuário. |
| Responsável | Pessoa | Equipe (humano) | Opcional. Pessoa no Notion, para notificações e 'Minhas tarefas'. |
| Prazo de produção | Data | Equipe (humano) |  |
| Publicação prevista | Data | Equipe (humano) |  |
| Publicado em | Data | Social media |  |
| Link da publicação | URL | Social media |  |
| Tema | Seleção múltipla | Equipe (humano) | Planejamento individual · Associação de procedimentos · Acompanhamento ao longo dos anos · Naturalidade · Procedimento isolado · Envelhecimento · Método ERA · Primeira consulta · Pele · Fé · Maternidade · Família · Vida empresarial · Emagrecimento · Rotina. Fase 3 (radar de repetição). Tema editorial; vocabulário controlado. |
| Argumento central | Texto | Equipe (humano) | Fase 3 (radar). A ideia principal em uma frase. O agente preenche ao criar; depois é da equipe. |
| Procedimentos citados | Seleção múltipla | Equipe (humano) | Peeling · Full face · Peptídeos · Plasma IQ. Fase 3 (radar). Só procedimentos já citados na base. |
| História | Relação | Equipe (humano) | → Histórias (espelho: "Conteúdos"). Fase 3. História real que originou o conteúdo. |
| Gancho | Texto | Equipe (humano) | Abertura curta. Roteiro, direção criativa e legenda ficam no corpo da página (limite de 2000 caracteres por campo de texto da API). |
| CTA | Texto | Equipe (humano) |  |
| Bloqueio | Texto | Equipe (humano) | O que falta para avançar, em uma frase. |
| Informação clínica pendente | Caixa | Equipe (humano) |  |
| Autorização de imagem | Seleção | Equipe (humano) | Não se aplica · Pendente · Registrada |
| Já publicado? (Trello) | Seleção | Social media | A confirmar · Sim · Não. Só para o inventário de nov/2026. Nunca presumido. |
| Notas de origem | Texto | Sistema | De onde veio (lista, semana, cartão do Trello; ou mensagem da Larissa). |
| Cartão do Trello | URL | Sistema | Link do cartão de origem. O Trello continua como fonte histórica até a migração ser confirmada. |
| ID do cartão Trello | Texto | Sistema | ID do cartão no export JSON. Usado para casar a importação integral sem duplicar. |
| Relato | Texto | Equipe (humano) | Texto livre de quem trouxe a ideia (formulário da Larissa ou da social media). Nunca reescrito pelo agente. |
| Dificuldades | Texto | Social media | Social media registra o que travou a produção. |
| Pedir revisão ao agente | Caixa | Equipe (humano) | Marcar dispara a revisão sob demanda. O n8n desmarca ao concluir. |
| O que revisar | Texto | Equipe (humano) |  |
| Travar para o agente | Caixa | Equipe (humano) | Marcado: o agente nunca altera nem sugere mudanças nesta página. |
| Validação da Larissa | Seleção | Larissa | Não necessária · Necessária · Validado. Nível C. Necessária só quando há afirmação clínica inédita, caso clínico, imagem de paciente ou posicionamento inédito. Conteúdo rotineiro dentro das diretrizes não passa pela Larissa. |
| Motivo da validação | Seleção múltipla | Agente (IA) | Afirmação clínica inédita · Caso clínico · Imagem de paciente · Posicionamento inédito. O agente ou a equipe marcam; só um humano desmarca. |
| Validado por | Pessoa | Larissa |  |
| Validado em | Data | Larissa |  |
| Semana | Relação | Equipe (humano) | → Semanas (espelho: "Conteúdos") |
| Dia | Relação | Equipe (humano) | → Dias (espelho: "Conteúdos do dia"). Dia de produção ou de stories. |
| Prioridade comercial | Relação | Gestão | → Prioridades comerciais (espelho: "Conteúdos") |
| Captação | Relação | Equipe (humano) | → Captação (espelho: "Conteúdos") |
| Pendências | Relação | Equipe (humano) | → Pendências e decisões (espelho: "Conteúdos afetados") |
| Referências | Relação | Equipe (humano) | → Referências (espelho: "Conteúdos") |
| Métricas | Relação | Sistema | → Métricas (espelho: "Conteúdo") |
| Aprendizados | Relação | Agente (IA) | → Aprendizados (espelho: "Evidências") |
| Recomendações | Relação | Sistema | → Recomendações do agente (espelho: "Conteúdo") |
| Etapa | Fórmula | Sistema | `ifs(prop("Status") == "Ideia", "Ideia", ["Planejado", "Aguardando informação", "Aguardando captação"].includes(prop("Status")), "A fazer", prop("Status") == "Em produção", "Produzindo", prop("Status") == "Aguardando aprovação", "Com a Larissa", ["Aprovado", "Agendado"].includes(prop("Status")), "Pronto", ["Publicado", "Analisado"].includes(prop("Status")), "Publicado", "Arquivado")`. Status simplificado para a social media. |
| Atrasado | Fórmula | Sistema | `or(and(!empty(prop("Prazo de produção")), dateBetween(today(), prop("Prazo de produção"), "days") > 0, !["Aprovado", "Agendado", "Publicado", "Analisado", "Arquivado"].includes(prop("Status"))), and(!empty(prop("Publicação prevista")), dateBetween(today(), prop("Publicação prevista"), "days") > 0, !["Publicado", "Analisado", "Arquivado"].includes(prop("Status"))))` |
| Dias até publicar | Fórmula | Sistema | `dateBetween(prop("Publicação prevista"), today(), "days")` |
| Conta: planejado | Fórmula | Sistema | `!["Ideia", "Arquivado"].includes(prop("Status"))`. Auxiliar oculto para o rollup Planejados de Semanas. |
| Conta: publicado | Fórmula | Sistema | `["Publicado", "Analisado"].includes(prop("Status"))`. Auxiliar oculto para o rollup Publicados de Semanas. |

Corpo da página (modelo): **Rascunho do agente**, **Roteiro**, **Direção criativa**, **Legenda**, **Notas da equipe**.

## 🗓️ Semanas (prefixo SEM)

Planejamento semanal: intenção, narrativas, capacidade real e prioridades comerciais da semana.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Semana | Título | Sistema | Ex.: 2026-W49 · 30/11 a 06/12 |
| Período | Data | Sistema |  |
| Status do plano | Seleção | Equipe (humano) | Preliminar do agente · Ajustado pela equipe · Encerrado. Nível A: o plano preliminar entra em uso direto. Mudança estratégica relevante vira Recomendação nível B para a gestão. |
| Intenção editorial | Texto | Agente (IA) |  |
| Narrativas | Texto | Agente (IA) |  |
| Capacidade de produção | Seleção | Gestão | Normal · Reduzida · Mínima |
| Restrições da semana | Texto | Gestão | Viagem, agenda cheia, feriado, campanha. |
| Revisão de sexta | Texto | Agente (IA) |  |
| Prioridades comerciais | Relação | Gestão | → Prioridades comerciais (espelho: "Semanas") |
| Vigente | Fórmula | Sistema | `and(formatDate(dateStart(prop("Período")), "YYYY-MM-DD") <= formatDate(today(), "YYYY-MM-DD"), formatDate(dateEnd(prop("Período")), "YYYY-MM-DD") >= formatDate(today(), "YYYY-MM-DD"))` |
| Planejados | undefined | Sistema |  |
| Publicados | undefined | Sistema |  |

## ☀️ Dias (prefixo DIA)

Uma página por dia: a rotina contada pela Larissa (dela) e o direcionamento do agente (dele), lado a lado. Substitui uma base separada de rotina.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Dia | Título | Sistema | Ex.: Ter 01/12 |
| Data | Data | Sistema |  |
| Semana | Relação | Sistema | → Semanas (espelho: "Dias") |
| Minha rotina | Texto | Larissa | A Larissa conta o dia em texto livre. O agente nunca escreve aqui. |
| Disponibilidade para gravar | Seleção | Larissa | Tenho tempo · Pouco tempo · Sem tempo |
| Intenção do dia | Texto | Agente (IA) |  |
| Prioridade 1 | Relação | Agente (IA) | → Conteúdos (só ida) |
| Prioridade 2 | Relação | Agente (IA) | → Conteúdos (só ida) |
| Prioridade 3 | Relação | Agente (IA) | → Conteúdos (só ida) |
| Direcionamento | Seleção | Sistema | Aguardando rotina · Gerado pelo agente · Ajustado pela equipe · Sem direcionamento |
| Observações da social media | Texto | Social media |  |
| É hoje | Fórmula | Sistema | `formatDate(prop("Data"), "YYYY-MM-DD") == formatDate(today(), "YYYY-MM-DD")` |

Corpo da página (modelo): **Direcionamento do agente**, **Stories sugeridos**, **Captação do dia**, **Avisos**.

## 🎥 Captação (prefixo CAP)

Pedidos de foto, vídeo e áudio. Um pedido pode servir a vários conteúdos (mesma sessão de gravação).

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Pedido | Título | Equipe (humano) |  |
| Status | Seleção | Equipe (humano) | A solicitar · Solicitado à Larissa · Agendado · Captado · No Drive · Cancelado |
| Tipo | Seleção | Equipe (humano) | Vídeo falado · Take espontâneo · Imagem de apoio · Foto · Antes e depois · Áudio |
| Quem capta | Seleção | Equipe (humano) | Larissa sozinha · Social media · Juntas |
| Como gravar | Texto | Agente (IA) | Orientação rápida: enquadramento, fala, duração. |
| Onde | Texto | Equipe (humano) |  |
| Quando | Data | Equipe (humano) |  |
| Requer autorização de paciente | Caixa | Equipe (humano) |  |
| Link no Drive | URL | Social media |  |

## ❓ Pendências e decisões (prefixo PEN)

Perguntas para a Larissa, decisões da gestão e impedimentos. Fonte única das perguntas P-xx.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Pendência | Título | Equipe (humano) |  |
| Tipo | Seleção | Equipe (humano) | Pergunta para a Larissa · Decisão da gestão · Pergunta para a social media · Impedimento |
| Status | Seleção | Equipe (humano) | Aberta · Parcial · Respondida · Cancelada |
| Quem responde | Seleção | Equipe (humano) | Larissa · Gestão · Social media |
| Prioridade | Seleção | Equipe (humano) | Alta · Média · Baixa |
| Bloco do questionário | Seleção | Sistema | 1. Método ERA · 2. Casos e pacientes · 3. Família e exposição · 4. Rotina e gravação · 5. Procedimentos · 6. Minha história · 7. Meu jeito de falar |
| Resposta | Texto | Equipe (humano) | Resposta humana. O agente nunca escreve aqui; ele pode sugerir uma transcrição via Recomendação. |
| Respondida em | Data | Equipe (humano) |  |
| Documento da base | Texto | Sistema |  |
| Código | Texto | Sistema | P-xx herdado de base-de-conhecimento/00-Perguntas-pendentes.md. |

## 📖 Histórias (prefixo HIS)

Banco de histórias reais com potencial editorial. Uma história pode originar vários conteúdos ao longo do tempo. Nunca inventada: o relato é da Larissa ou da equipe.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| História | Título | Equipe (humano) |  |
| Tipo | Seleção | Equipe (humano) | História profissional · Percepção de consulta · Pergunta recebida · Maternidade · Vida empresarial · Fé e família · Aprendizado pessoal · Mudança de opinião · Experiência clínica autorizada |
| Relato | Texto | Larissa | Como aconteceu, nas palavras de quem viveu. O agente pode copiar literalmente da rotina, nunca reescrever nem completar. |
| Data do acontecimento | Data | Equipe (humano) |  |
| Envolve | Seleção múltipla | Equipe (humano) | Paciente · Filha · Marido · Mãe · Equipe · Ninguém além dela |
| Identificação | Seleção | Equipe (humano) | Sem identificação · Identificável. Identificável exige autorização registrada. |
| Autorização | Seleção | Gestão | Não necessária · Pendente · Registrada |
| Status | Seleção | Equipe (humano) | Nova · Pronta para usar · Usada · Não usar · Arquivada. Só 'Pronta para usar' entra em roteiro. 'Nova' aparece para a equipe confirmar. |
| Potencial | Seleção | Agente (IA) | Alto · Médio · Baixo |
| Pilares | Seleção múltipla | Equipe (humano) | Autoridade · Desejo e prova social · Conexão |
| Dia de origem | Relação | Sistema | → Dias (só ida) |
| Vezes usada | undefined | Sistema |  |

## 🔖 Referências (prefixo REF)

Perfis, posts e técnicas de comunicação. Estudo de formato, nunca cópia.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Referência | Título | Equipe (humano) |  |
| Link | URL | Equipe (humano) |  |
| Tipo | Seleção | Equipe (humano) | Perfil · Post · Reels · Tendência · Técnica |
| Por que é útil | Texto | Equipe (humano) |  |
| Pilar | Seleção múltipla | Equipe (humano) | Autoridade · Desejo e prova social · Conexão |
| Duração | Seleção | Equipe (humano) | Formato duradouro · Tendência passageira |
| Status | Seleção | Equipe (humano) | Nova · Aprovada · Descartada · A confirmar |
| Arquivo | Arquivos | Equipe (humano) |  |
| Data da referência | Data | Equipe (humano) |  |
| Formato observado | Seleção | Equipe (humano) | Reels · Carrossel · Stories · Foto |
| Gancho observado | Texto | Agente (IA) |  |
| Estrutura narrativa | Texto | Agente (IA) |  |
| Possibilidade de adaptação | Texto | Agente (IA) |  |
| Adequação à marca | Seleção | Agente (IA) | Alta · Média · Baixa · Não adequada |
| Limitações éticas ou clínicas | Texto | Agente (IA) |  |

## 📈 Métricas (prefixo MET)

Uma leitura por conteúdo por janela (D+1, D+7, D+30). Várias leituras por conteúdo, por isso base própria.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Leitura | Título | Sistema | Ex.: CON-12 · D+7 |
| Janela | Seleção | Sistema | D+1 · D+7 · D+30 |
| Data da leitura | Data | Sistema |  |
| Fonte | Seleção | Sistema | Instagram Insights (manual) · API do Instagram · CRM STIMMA OS |
| Alcance | Número | Sistema |  |
| Alcance de não seguidores | Número | Sistema |  |
| Visualizações | Número | Sistema |  |
| Retenção média (%) | Número | Sistema |  |
| Tempo médio (s) | Número | Sistema |  |
| Salvamentos | Número | Sistema |  |
| Compartilhamentos | Número | Sistema |  |
| Comentários | Número | Sistema |  |
| Respostas | Número | Sistema |  |
| Novos seguidores | Número | Sistema |  |
| Conversas qualificadas | Número | Gestão |  |
| Agendamentos atribuídos | Número | Gestão |  |

## 🧠 Aprendizados (prefixo APR)

Memória editorial. Separa percepção de evidência.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Aprendizado | Título | Agente (IA) |  |
| Status | Seleção | Gestão | Hipótese · Em teste · Preferência · Evidência · Diretriz aprovada · Refutado. Fase 3: hipótese (1 ocorrência), preferência (escolha humana repetida), evidência (métrica em 3+ publicações), diretriz aprovada (só a gestão). |
| Área | Seleção | Agente (IA) | Tema · Gancho · Formato · Pilar · Horário · Comercial · Operação · Linguagem · Abordagem |
| Evidência | Texto | Agente (IA) |  |
| Próxima verificação | Data | Agente (IA) |  |
| Fonte do aprendizado | Seleção | Agente (IA) | Escolha humana · Métrica · Pesquisa · Decisão da gestão |
| Ocorrências | Número | Agente (IA) |  |

## 🎯 Prioridades comerciais (prefixo PRI)

O que a clínica precisa vender ou ocupar em cada período. Definido pela gestão, consultado pelo agente.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Prioridade | Título | Gestão |  |
| Período | Data | Gestão |  |
| Status | Seleção | Gestão | Proposta do agente · Planejada · Ativa · Encerrada. Nível B: campanhas só ficam Planejadas ou Ativas por decisão da gestão. |
| Procedimento ou serviço | Texto | Gestão |  |
| Meta | Texto | Gestão |  |
| Peso | Seleção | Gestão | Alta · Média · Baixa |

## 💡 Recomendações do agente (prefixo REC)

Tudo o que a IA propõe e ainda não é decisão humana. Separação explícita entre sugestão e decisão.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Recomendação | Título | Agente (IA) |  |
| Tipo | Seleção | Agente (IA) | Novo conteúdo · Revisão de roteiro · Mudança de data · Plano semanal · Direcionamento diário · Nova pendência · Novo aprendizado · Possível duplicidade |
| Nível | Seleção | Agente (IA) | A · Automático · B · Precisa de aprovação · C · Validação humana. Ver schema/autonomia.json. A: já aplicada, registrada para histórico e reversão. B e C: só aplicam depois da decisão. |
| Quem decide | Seleção | Agente (IA) | Social media · Larissa · Gestão |
| Decisão | Seleção | Equipe (humano) | Aguardando decisão · Aplicada automaticamente · Aceita · Aceita com ajustes · Recusada · Revertida · Aplicada · Obsoleta |
| Proposta | Texto | Agente (IA) | Resumo legível. O payload completo (JSON) fica no corpo da página. |
| Por quê | Texto | Agente (IA) |  |
| Fontes consultadas | Texto | Agente (IA) | IDs de conteúdos, aprendizados e documentos da base usados. |
| Comentário da decisão | Texto | Equipe (humano) |  |
| Decidido por | Pessoa | Equipe (humano) |  |
| Decidido em | Data | Equipe (humano) |  |
| Semana | Relação | Agente (IA) | → Semanas (só ida) |
| Dia | Relação | Agente (IA) | → Dias (só ida) |
| Possível duplicata de | Relação | Agente (IA) | → Conteúdos (só ida) |

## ⚙️ Execuções (prefixo EXE)

Log técnico de cada execução do n8n: idempotência, custo, erro e reprocessamento. Só gestão.

| Propriedade | Tipo | Dono | Opções / detalhe |
|---|---|---|---|
| Workflow | Seleção | Sistema | planejamento-semanal · direcionamento-diario · processar-ideia · revisao-sob-demanda · pendencias-diarias · revisao-sexta · analise-desempenho · revisao-mensal · setup · importacao |
| Status | Seleção | Sistema | Em andamento · Sucesso · Sucesso parcial · Erro · Reprocessar · Reprocessada · Ignorada (duplicada) |
| Chave de idempotência | Texto | Sistema | Ex.: planejamento-semanal:2026-W49. Duas execuções com a mesma chave e Sucesso não podem coexistir. |
| Tentativa | Número | Sistema |  |
| Início | Data | Sistema |  |
| Fim | Data | Sistema |  |
| Modelo | Seleção | Sistema | claude-opus-5-5 · claude-sonnet-5-5 · claude-haiku-5-5 · sem IA |
| Versão do prompt | Texto | Sistema |  |
| Tokens de entrada | Número | Sistema |  |
| Tokens de saída | Número | Sistema |  |
| Tokens em cache | Número | Sistema |  |
| Custo estimado (US$) | Número | Sistema |  |
| Itens criados | Número | Sistema |  |
| Itens preservados | Número | Sistema | Escritas puladas porque a equipe editou ou travou a página. |
| Erro | Texto | Sistema | Mensagem sanitizada. Nunca contém chave, token ou dado clínico. |
| Reprocessar | Caixa | Gestão | Gestão marca para o n8n tentar de novo com a mesma chave. |
| Execução no n8n | URL | Sistema |  |
