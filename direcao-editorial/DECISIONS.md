# Decisões — Direção Editorial

## 2026-11-24 — Nomenclatura oficial: Método ERA
**Decisão (Álvaro):** o método oficial é **Método ERA**. "Método LA™" não é mais usado.
**Por quê:** o plano mestre apontava risco de misturar dois posicionamentos.
**Consequência:** toda a base, prompts e conteúdos usam "Método ERA". Qualquer material antigo
que cite LA™ deve ser sinalizado para revisão, nunca reaproveitado como está. O significado de
cada letra ainda precisa ser confirmado (ver P-01).

## 2026-11-24 — Projeto mora em `direcao-editorial/`
**Decisão (técnica, reversível):** pasta própria na raiz do repositório, separada do STIMMA OS.
**Por quê:** domínio diferente (marca pessoal/conteúdo vs. CRM da clínica), stack diferente
(Notion + n8n vs. Next.js + Supabase). Pode virar repositório próprio quando houver código de
integração.

## 2026-11-24 — Base de conhecimento com fonte e status em cada trecho
**Decisão (técnica):** todo item da base é marcado como [Trello], [Plano mestre], [Decisão],
[Hipótese] ou [Pendente P-xx].
**Por quê:** a regra "não inventar" só é verificável se cada afirmação tiver origem. Permite ao
agente distinguir fato de proposta e de lacuna.

## 2026-11-24 — Fonte bruta separada da base
**Decisão (técnica):** o levantamento do Trello fica intacto em `fontes/`; a base reorganiza.
**Por quê:** rastreabilidade. Se houver dúvida sobre um trecho da base, a origem está preservada.

## 2026-11-24 — Decisões da equipe na aprovação da Fase 1
1. **Método ERA** é a nomenclatura oficial; significado e etapas dependem da Larissa (P-01, P-02).
2. **Stories:** 5 a 6 por dia é meta operacional flexível, conforme relevância e disponibilidade (P-18 respondida).
3. **HOF:** permitido em contexto informal (caixinhas). Na comunicação clínica, nome do procedimento (P-08 respondida).
4. **Novembro/2026** do Trello é inventário histórico. Nada é presumido como publicado; nenhum conteúdo importado recebe data de publicação.
5. **Não esperar todas as pendências** para avançar no desenvolvimento.

## 2026-11-24 — Fase 2: modelagem do Notion
- **11 bases, não 10 nem 1.** Rotina da Larissa virou campo de Dias (só faz sentido junto do dia). Ideias e Stories são Conteúdos (views). Entraram duas bases novas: Recomendações do agente (separa proposta da IA de decisão humana) e Execuções (log técnico).
- **Dono por campo** no `schema.json`. O Notion não restringe edição por propriedade, então a regra é garantida pelo n8n: trava manual + hash da última escrita do agente + campo humano nunca sobrescrito. Mudança em campo humano vira Recomendação.
- **Status com 11 estados**, mais a fórmula Etapa (6 palavras) para a interface da social media. "Bloqueado" do plano mestre = "Aguardando informação" + Bloqueio + Pendência ligada.
- **Prioridades do dia** em 3 relações fixas no Dia (Prioridade 1 a 3), em vez de campo no Conteúdo: a prioridade é do dia, não da peça.
- **"Com quem está" é select, e não pessoa.** O n8n consegue preencher sem IDs de usuário. "Responsável" (pessoa) é opcional.
- **Textos longos no corpo da página** (limite de 2000 caracteres por campo na API).
- **Setup pela API** (`/v1/databases`, `/v1/data_sources`, `/v1/views`, Notion-Version 2026-03-11), com simulação padrão, idempotência por arquivo de estado e relatório de falhas. Ficam manuais (a API não cobre): permissões, perguntas de formulário, gráficos e botões.
- **Webhooks só como acelerador.** A entrega é "no máximo uma vez", então toda automação tem varredura periódica.
- **Blocos do questionário** numerados pela ordem de impacto (o que mais destrava vem primeiro).

## 2026-11-24 — Fase 2.1: implantação e autonomia
- **Implantação pelo conector MCP do Notion** (conta do Álvaro), não por token. Nenhum segredo trafegou nem foi salvo. A integração interna com token só será criada na Fase 4, para o n8n.
- **Três níveis de autonomia** (`notion/schema/autonomia.json`): A automático e registrado, B com aprovação de quem decide, C sempre humano. A Larissa deixa de aprovar conteúdo de rotina e passa a validar só o nível C. "Aprovado por/em" virou "Validado por/em".
- **Rascunho do agente** é uma seção própria no corpo do conteúdo. O agente escreve ali no nível A sem tocar no Roteiro da equipe.
- **Views na DSL do Notion** (`layout.json` › `configure`), aplicadas pelo conector. Achados da API real: filtro sobre fórmula ou rollup é descartado em silêncio; `current.prop()` em fórmula é recusado; formulário só como aba da base; gráfico funciona; consulta SQL do conector exige plano Business. O validador passou a bloquear filtros em fórmula e rollup.
- **Simulação nas mesmas bases**, marcada (Origem = Simulação, `[SIMULAÇÃO]`, Chave `sim:`), arquivável por uma view. Escolha do Álvaro.
- **Stories usam "Publicação prevista"** como os demais formatos, em vez de depender do Dia; o rollup "Data do dia" foi removido.
- **Importação integral do Trello** gera primeiro um plano revisável (`trello-plano.mjs`); nunca escreve direto.

## 2026-11-24 — Fase 3: inteligência editorial
- **Um modelo, dez módulos, não multiagente.** Uma instrução mestra comum e um módulo por workflow. Multiagente só se a avaliação mostrar um workflow que precise de outro modelo ou de outra instrução base. O que é determinístico (seleção de contexto, radar de repetição, revisão mecânica, permissões) é código, e não IA.
- **Contratos com JSON Schema** e verificação em código das ações antes de gravar no Notion: dono do campo, trava, nível de autonomia e fontes obrigatórias. O schema da API não garante limites de contagem, por isso eles são conferidos em código.
- **Produção recusa simulação:** `montarPacote` lança erro se sobrar qualquer registro com Origem = Simulação.
- **Base nova Histórias:** um relato real tem ciclo próprio (autorização, envolvidos, quantas vezes foi usado) e alimenta vários conteúdos. Como campo de Conteúdos, ele se perderia.
- **Aprendizado em degraus:** hipótese, preferência (2 ou mais ocorrências), evidência (3 ou mais, com métrica) e diretriz aprovada (sempre humana). Uma edição isolada não vira regra.
- **Saídas de exemplo escritas na sessão, e não pela API**, porque rodar a API exige credencial e gasto que o Álvaro ainda não aprovou. O caminho `--api` está pronto.
- **Relações de mão dupla** valem nas duas bases para o verificador de ações (o espelho herda o dono da relação original).
