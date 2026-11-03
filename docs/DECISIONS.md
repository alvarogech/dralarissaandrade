# Decisões de arquitetura — STIMMA OS

Registro das decisões técnicas tomadas de forma autônoma durante a construção, com o
porquê. Decisões reversíveis e de baixo risco — não bloqueadas para aprovação prévia, conforme
diretriz do projeto.

## 2026-08-13 — STIMMA OS é um app novo, separado do `anamnese-app`

**Contexto encontrado**: o repositório já continha `anamnese-app/`, um app Next.js 14 +
Supabase + Netlify funcional (não commitado ainda, sem projeto Supabase provisionado) para
duas anamneses digitais (HOF e Odontologia) enviadas ao paciente, com um painel interno de
revisão para a equipe (`/painel`), auth via Supabase (e-mail/senha), RLS, e uma migration de
audit log. Também existe um site institucional estático na raiz (`index.html` / `script.js`) e
um gerador de instruções pós-procedimento (`larissa-andrade-gerador-pos-procedimento.html`).

**Decisão**: o STIMMA OS será um projeto Next.js **novo e independente**, em `stimma-os/`, com
**seu próprio projeto Supabase dedicado** (não vinculado ao Supabase do `anamnese-app`, que
ainda nem foi criado).

**Por quê**:
- Domínios de dados diferentes: `anamnese-app` coleta e armazena **respostas de anamnese**
  (dado de saúde sensível, enviado publicamente pelo paciente antes da consulta). STIMMA OS é
  uma **camada de gestão interna** (agenda, financeiro, oportunidades, equipe) — minimização de
  dados (LGPD) pede fronteiras de acesso e de banco separadas, não uma tabela `patients` gigante
  compartilhando contexto clínico e contexto operacional/financeiro.
- Superfícies de ameaça diferentes: `anamnese-app` tem um formulário público (superfície de
  ataque voltada à internet, com anti-abuso, Turnstile etc.). STIMMA OS é 100% autenticado,
  uso interno da equipe. Misturar os dois aumenta o raio de exposição de ambos.
- Ciclo de vida diferente: `anamnese-app` já está pronto para deploy; STIMMA OS está começando
  agora. Acoplar os dois deploys (mesmo projeto Netlify/Supabase) criaria risco de regressão
  cruzada.
- Reaproveitamento sem acoplamento: o padrão técnico do `anamnese-app` (Next.js App Router +
  TypeScript + Tailwind + `@supabase/ssr` + RLS + Netlify + tabela `profiles` com `role`/`active`
  + audit log) é comprovadamente adequado para esta clínica e será **replicado** como convenção
  no STIMMA OS, não importado como dependência.
- Futuro: se fizer sentido, o STIMMA OS pode futuramente **ler** (nunca escrever) um resumo não
  clínico do `anamnese-app` (ex.: "anamnese pendente/recebida" como evento), via view read-only
  ou export, quando os dois projetTeams Supabase existirem. Isso é um passo de integração
  posterior, não uma razão para uni-los agora.

**Reversibilidade**: alta. Nenhum dado real foi criado ainda em nenhum dos dois; se no futuro
fizer sentido consolidar, é uma migração de schema, não uma reescrita de produto.

## 2026-08-13 — Nome do produto confirma "STIMMA"

O Simples Dental já tem a clínica cadastrada como **"Clínica Stimma"**. Isso não é coincidência
com o nome provisório do prompt — é a marca real da operação. Mantido "STIMMA OS" como nome
definitivo do produto (não apenas provisório).

## 2026-08-13 — Fase 4/5 (Simples Dental) dependem de automação de navegador, não de API

Confirmado por discovery real (ver [`SIMPLES_DENTAL_MAP.md`](./SIMPLES_DENTAL_MAP.md)): não há
indício de API pública/documentada. A ordem de preferência de integração definida no briefing
(API → MCP → banco/webhook → Chrome → Cowork → importação → automação de interface) é aplicada
assim: sem API/MCP disponível, a leitura inicial (Fase 4) usará **exportação estruturada** onde
existir (`Exportar` em Pacientes/Financeiro/Indicadores) como primeira opção, e **automação de
navegador via Claude in Chrome/Cowork** como complemento para o que não é exportável (ex. status
de agenda em tempo real, funil de Vendas). Escrita (Fase 5) fica para depois da leitura
estabilizada, começando por fluxo `PREPARAR → APROVAR → EXECUTAR → VERIFICAR`.

## 2026-08-13 — Banco de dados: Supabase novo, projeto dedicado

Verificados os projetos Supabase existentes na conta (via MCP): nenhum pertence a esta clínica
(`makarios@igrejaemaus.com.br's Project` e `nossa-agenda` são de outros contextos), e essa conta
já estava no limite de 2 projetos gratuitos. O usuário optou por conectar uma organização
Supabase separada (`larissaandrade.odonto@gmail.com's Org`) especificamente para esta clínica.

## 2026-08-17 — Projeto Supabase do STIMMA OS provisionado via Chrome (não via MCP)

O conector MCP do Supabase deste ambiente está autenticado na conta antiga (`makarios`) e não
enxerga a nova organização `larissaandrade.odonto@gmail.com's Org` — são contas diferentes. Como
o Chrome já estava autenticado nessa nova conta, o projeto **`stimma-os`** (ref
`fjxvseuopzhfwdraszvp`, região `sa-east-1`) foi criado e as 7 migrations foram aplicadas
diretamente pela SQL Editor do painel Supabase, via automação de navegador (não digitação
direta no Monaco, que travou com blocos grandes — o conteúdo foi injetado via
`monaco.editor.getEditors()[0].setValue(...)` e cada migration foi conferida com uma query de
verificação antes de seguir para a próxima — EXECUTE → VERIFY → COMMIT). Resultado verificado:
26 tabelas no schema `public`, seed com 1 organização, 5 roles, 10 permissions e 5 metas de
negócio. Chaves gravadas em `stimma-os/.env.local` (fora do git). Nenhum usuário de equipe foi
criado — isso requer e-mails reais de cada pessoa e fica como passo manual (ver
`stimma-os/README.md`), assim como no `anamnese-app`.

Esse projeto Supabase específico não é gerenciável pelas ferramentas MCP nesta sessão; qualquer
migration futura precisa ser aplicada da mesma forma (SQL Editor via navegador) ou o MCP precisa
ser reconectado a esta conta.

## 2026-08-17 — Ativação dos dois primeiros usuários reais

O usuário criou manualmente dois usuários no Supabase Auth (Authentication → Users):
`alvaroh.gyn@gmail.com` e `larissaandrade.odonto@gmail.com`. Claude ativou os perfis
(`profiles.active = true`), vinculou à organização Clínica Stimma, atribuiu roles (`admin` para
Álvaro, `professional` para Larissa) e criou o registro correspondente em `professionals` para
Larissa — verificado por consulta após a escrita. Gabi, Dine e Jaynnes ficam para quando o
usuário tiver os e-mails reais; nada foi inventado.

## 2026-08-17 — Primeiro pull manual de dados reais do Simples Dental (com aprovação explícita)

Antes de escrever qualquer paciente/agendamento real no banco do STIMMA OS, o Claude Code
parou (bloqueio automático do classificador de segurança do ambiente) e pediu confirmação
explícita ao usuário, que respondeu "sim". Só então os 5 atendimentos confirmados de hoje
(17/08) da agenda da Dra. Larissa foram lidos do Simples Dental (somente leitura) e gravados em
`patients`/`appointments`, com verificação pós-escrita (consulta conferindo nomes, horários,
status). Nenhum CPF ou dado clínico foi copiado — apenas nome, horário e o texto do motivo da
consulta já exibido na agenda. O cockpit "Hoje" (`app/hoje/page.tsx` +
`lib/data/clinic-snapshot.ts`) passou a consultar o Supabase real via sessão do usuário
(RLS), caindo para o modo demonstração só se não houver nenhum paciente cadastrado. Ver
`docs/ROADMAP.md` (Fase 4) para o que isso é e o que ainda não é (não é o Sync Engine
automatizado).

## 2026-08-17 — Deploy real em Netlify (`stimma-os-gestor`)

Com aprovação explícita do usuário (push para GitHub + criação do site), o STIMMA OS foi
publicado em produção: `https://stimma-os-gestor.netlify.app`. Site Netlify novo e dedicado
(não reaproveitou nenhum dos outros ~13 sites já existentes na conta, incluindo um chamado só
"stimma" de outro contexto — mesma lógica de isolamento do projeto Supabase). Variáveis de
ambiente (URL/chaves do Supabase, `SYNC_API_SECRET`) cadastradas direto no painel Netlify, nunca
no repositório. Testado ao vivo: rota protegida por segredo (401 sem ele), `/api/sync/agenda`
gravando `automation_runs`/`audit_logs` reais em produção.

## 2026-08-17 — Automação 100% sem supervisão tentada e não alcançada; gatilho manual entregue

Duas tentativas de deixar a leitura da agenda rodando sozinha, ambas com bloqueio real (não
contornado à força): rotina agendada na nuvem não alcança o Chrome pareado nem a rede local;
Agendador de Tarefas do Windows rodando o Claude Code sem supervisão exigiria bypass total de
permissão (bloqueado pelo classificador do ambiente; o usuário autorizou escopo restrito, mas o
processo novo apareceu como não autenticado). Em vez de forçar um contorno arriscado ou fingir
que funciona, a solução entregue foi um **gatilho manual intuitivo**: comando `/sync-agenda`
(`.claude/commands/sync-agenda.md`, não versionado — `.claude/` está no `.gitignore` — mas
documentado por extenso em `docs/COWORK_RUNBOOK.md` para poder ser recriado). Detalhe completo
em `docs/COWORK_RUNBOOK.md`.

## 2026-08-17 — Financeiro no cockpit + import real de recebíveis vencidos

Com aprovação explícita do usuário, os 30 recebíveis vencidos reais visíveis em
Inteligência → "Pacientes com débitos em atraso" foram lidos (nome, valor, dias em atraso,
telefone quando disponível — sem CPF) e sincronizados via `POST /api/sync/receivables`
(reaproveita o mesmo `resolvePatient` do sync de agenda). Resultado real: 29 criados, 1
`requires_review` (Jovenal de Andrade e Silva — já existia no banco pelo pull de agenda desta
manhã, mas sem telefone cadastrado; o motor corretamente recusou vincular só pelo nome). Total
real em recebíveis vencidos no banco: R$ 43.699,06. O card "Financeiro" do cockpit Hoje
(`components/cockpit/FinancialSummary.tsx`) já lê isso pela `getClinicSnapshot()` existente —
nenhuma mudança na tela foi necessária além de plugar o novo card.

## 2026-08-17 — Primitivos de UI escritos à mão em vez de instalar shadcn/ui agora

O briefing pede shadcn/ui. Para a primeira fatia do cockpit, os primitivos (Button, Card,
Badge, StatusDot) foram escritos à mão em Tailwind puro, seguindo a mesma linguagem visual que
shadcn usaria (tokens de cor via CSS vars, `class-variance-authority`-like via `clsx`), para não
depender do CLI/registry do shadcn nesta sessão. Trocar por componentes gerados pelo `shadcn add`
é direto quando fizer sentido — nenhuma decisão de design foi tomada que dependa de ser
especificamente shadcn.

## 2026-08-17 — STIMMA OS vira o CRM (não mais só "camada de observação")

**Contexto**: até aqui, `PROJECT_SPEC.md` definia o STIMMA OS explicitamente como "não é um
dashboard, CRM ou relatório financeiro" — uma camada de alerta/oportunidade que lê o Simples
Dental e nunca duplica seus módulos (agenda, Vendas/Kanban, pacientes). O usuário entregou um
prompt mestre extenso e explícito pedindo a construção de **um CRM próprio** (pipeline de 18
estágios, inbox de WhatsApp, motor de follow-up, IA de conversa, planejamento/execução/
financeiro por paciente, dashboards de gestão) — muito além do escopo original.

**Decisão**: tratar isso como evolução do mesmo produto, não um projeto novo. `stimma-os/`
continua sendo o único app, o mesmo banco Supabase, a mesma equipe (Álvaro, Larissa, Gabi,
Dine), o mesmo `RuleEngine`/`Sync Engine`/audit log já construídos. A missão em
`PROJECT_SPEC.md` é reescrita para refletir o CRM como norte, mas os princípios de segurança,
minimização de dado clínico, autonomia por nível (A/B/C/D) e EXECUTE→VERIFY→COMMIT **não
mudam** — só se aplicam a uma superfície bem maior agora.

**Por que isso não contradiz "não duplicar o Simples Dental"**: o Simples Dental não tem CRM,
WhatsApp, motor de follow-up nem IA — só agenda, ficha, Kanban de orçamento e financeiro básico.
O pipeline de relacionamento (lead → recorrência) e o WhatsApp são território que o Simples
Dental nunca cobriu; o STIMMA OS não recria a agenda nem o Kanban nativo de Vendas, ele modela a
**jornada comercial/relacionamento por cima**, e onde fizer sentido, cruza com o que já é lido
de lá (agendamento, débito). O princípio de "ler e cruzar, não reconstruir" continua valendo
especificamente para agenda/financeiro nativo — não se aplica ao pipeline de relacionamento, que
o Simples Dental nunca teve.

**O que muda de fato no schema existente**: `patient_journeys` (uma linha por paciente, sem
histórico) vira insuficiente frente à exigência explícita do prompt mestre de nunca sobrescrever
histórico de estágio — ver `DATABASE_SCHEMA.md` (nova tabela `pipeline_history`, enum de estágio
expandido de 13 para os 18 estágios do prompt mestre, mantendo os já existentes como subconjunto
compatível).

**O que fica fora desta rodada (sem credencial/tempo para fingir que existe)**: WhatsApp Business
API real (provider mockado até existir número/token oficial — ver `WHATSAPP_ARCHITECTURE.md`),
LLM de produção para extração automática de conversa (interface definida, sem chave configurada
em produção ainda), telas de Inbox/Modo FUP/dashboards de gestão completos (ficam no roadmap,
Fase 2 em diante — ver `ROADMAP.md`). Documentar e não fingir testado é o mesmo princípio já
seguido com o Simples Dental.

## 2026-08-17 — Migration 0009 (fundação do CRM) aplicada e verificada em produção

`stimma-os/supabase/migrations/0009_crm_foundation.sql` foi aplicado ao projeto Supabase real
(`fjxvseuopzhfwdraszvp`) pelo SQL Editor via Chrome (mesma técnica de injeção no Monaco das
migrations anteriores — MCP ainda não alcança este projeto). Antes de rodar: o editor sinalizou
"Potential issue detected — destructive operations" por causa do `drop type
patient_pipeline_stage` (esperado — é o enum antigo, substituído pelo `crm_pipeline_stage` de 18
estágios com mapeamento explícito de cada valor antigo; nenhuma tabela é dropada). Confirmado e
executado.

**Verificação pós-escrita (EXECUTE → VERIFY → COMMIT)**: `total_tables` 26 → 48 (+22, bate exato
com as tabelas novas da migration); `crm_pipeline_stage` existe (1), `patient_pipeline_stage` não
existe mais (0); `patients` = 34 linhas, `appointments` = 5 — nenhuma alterada, nenhum dado
perdido. **Achado real, não esperado**: `patient_journeys` está com **0 linhas** — os 34
pacientes reais (5 da agenda + 29 do import de recebíveis, ver decisão de 2026-08-17 anterior)
nunca tiveram uma jornada de pipeline criada. Ou seja, a "regra de ouro" ainda não tem o que
validar de verdade — isso vira o próximo passo concreto (backfill de `patient_journeys` para os
pacientes reais existentes, ao implementar `lib/rules/golden-rule.ts`), não um problema da
migration em si.

## 2026-08-25 — WhatsApp/Chatwoot adiado por decisão do usuário

O usuário criou a conta no Chatwoot Cloud e chegou a pedir o prompt de vinculação (Account ID,
Access Token, Inbox do WhatsApp Cloud API, webhook — ver decisão de 2026-08-18 abaixo), mas
decidiu **não seguir com a integração agora**: "não usarei o Chatwoot no momento".

**O que isso muda tecnicamente**: nada precisou ser desfeito. `WHATSAPP_PROVIDER` já tinha
`mock` como padrão desde que o código foi escrito (ver decisão de 2026-08-18) — nenhuma variável
`CHATWOOT_*` chegou a ser configurada no Netlify, então o sistema já estava, na prática, rodando
sem a integração. O ajuste desta decisão foi só de expectativa/documentação: `ROADMAP.md` marca
a Fase 9 (WhatsApp) como adiada em vez de "próxima", e a Fase 10 (Modo FUP/motor de follow-up)
deixa claro que opera inteiramente por entrada manual — nenhuma tela do CRM hoje pressupõe
mensagem de WhatsApp chegando sozinha.

**Por que isso não é um problema para o MVP**: `CRM_MASTER_SPEC.md` §14 lista WhatsApp como parte
do MVP original do prompt mestre, mas o pipeline (`/pipeline`) e o Modo FUP (`/pipeline/fup`) já
respondem às perguntas centrais do MVP (seção 106 do prompt mestre — "quem preciso contatar
hoje?", "quem está sem próxima ação?") com dado inserido manualmente por Gabi/Larissa. WhatsApp
automatiza a *entrada* de leads e o *envio* de mensagem; não é pré-requisito para o pipeline
funcionar como sistema de acompanhamento.

**Retomar no futuro**: todo o código já escrito (`lib/whatsapp/`, `app/api/webhooks/chatwoot/`)
continua no repositório, testado, sem custo de manutenção (não roda, não é chamado). Reativar é
configurar as variáveis de ambiente quando/se o usuário decidir — não deve exigir reescrever
nada, a menos que a decisão de usar Chatwoot mude para outro provider.

## 2026-08-18 — Avaliação e adoção do Chatwoot como backend do WhatsApp

**Pedido do usuário**: avaliar se faz sentido usar o Chatwoot no CRM e, se sim, adicionar ao
projeto. Antes de decidir, os fatos abaixo foram verificados na documentação oficial
(`developers.chatwoot.com`, `chatwoot.com`) nesta sessão — nada foi assumido de memória sem
checar, para não arriscar inventar uma integração (ver limite absoluto em `SECURITY.md`):

- Licença **MIT**, código aberto, self-hostable via Docker (depende de Postgres, Redis e
  Sidekiq — pode apontar para serviços gerenciados via variáveis de ambiente).
- Suporta WhatsApp via **WhatsApp Cloud API oficial**, além de 360dialog/Twilio como alternativa.
- **Application API** documentada e estável: `POST .../contacts`, `GET .../contacts/search`,
  `GET .../contacts/{id}/conversations`, `POST .../conversations`,
  `POST .../conversations/{id}/messages`, `GET .../conversations/{id}/messages` — autenticação
  via header `api_access_token`.
- **Webhooks assinados**: `X-Chatwoot-Signature` (HMAC-SHA256 de `{timestamp}.{corpo}`) +
  `X-Chatwoot-Timestamp`, eventos incluindo `message_created`, `conversation_created`,
  `conversation_status_changed`, `contact_created`/`updated`.
- **Dashboard Apps** (iframe com contexto de conversa/contato via window event) existem, mas
  **não foram adotados** nesta decisão — expor a interface do Chatwoot para a Gabi contradiria a
  exigência explícita do prompt mestre de ela nunca precisar alternar de tela. O STIMMA OS
  continua sendo a única interface; o Chatwoot roda como peça de infraestrutura por trás dela.

**Decisão: adotar Chatwoot self-hosted como a implementação concreta de `WhatsAppProvider`**,
mantendo a interface abstrata (ver `WHATSAPP_ARCHITECTURE.md`). Por quê:

- Resolve a parte mais cara de construir do zero (status de entrega, mídia, templates
  aprovados, reconexão de sessão) sem prender o STIMMA OS a um único BSP — o Chatwoot já
  abstrai isso.
- MIT + self-hosted dá controle total do dado (relevante para LGPD/minimização, já um princípio
  do projeto) — evita depender do Chatwoot Cloud hospedado fora do Brasil para dado de paciente.
- Webhooks assinados encaixam direto no princípio já existente de nunca confiar em payload não
  verificado.

**O que fica deliberadamente em aberto (decisão de infraestrutura/custo, não técnica)**: onde
hospedar a instância Chatwoot (VPS, região, custo mensal) e quando de fato criar a conta
WhatsApp Business/Meta — isso não foi provisionado nem terá custo incorrido sem o usuário
decidir explicitamente. O código (`ChatwootProvider`, webhook, migration de IDs externos) foi
implementado e testado contra endpoints/payloads simulados, exatamente como o `MockWhatsAppProvider`
já existente — nada disso depende da instância real existir para o resto do CRM continuar
evoluindo. `WHATSAPP_PROVIDER=mock` continua sendo o padrão até essa decisão de infra ser tomada.

## 2026-08-13 — Stack confirmada sem alterações

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui no frontend; Supabase (Postgres + Auth
+ RLS) no backend; Netlify no deploy. Nenhuma incompatibilidade técnica foi encontrada que
justificasse desviar do briefing.

## 2026-10-20 — Fila da concierge vira a prioridade, construída dentro do STIMMA OS

Plano completo: [`PLANO_FILA_CONCIERGE.md`](./PLANO_FILA_CONCIERGE.md). Decidido pelo usuário:

- A fila da concierge (entrada da gestão → fila da Gabi → execução → fechamento automático)
  substitui o `feedback-concierge.html` (arquivo local, `localStorage`). É **a prioridade atual**;
  pipeline, cockpit, sync e WhatsApp do STIMMA OS ficam parados e serão desenvolvidos em volta da
  fila depois.
- Construída **dentro do STIMMA OS** (mesmo app, banco, login e domínio
  `app.larissaandrade.com.br`), só com rotas novas (`/entrada`, `/fila`, `/fechamento`), para não
  criar um segundo cadastro de pacientes nem exigir migração futura.
- **Supabase no plano Free** (sem backup diário automático): compensado por exportação semanal
  automática, botão de exportação para a gestão e `supabase db dump` mensal fora do Supabase.
- Todo atendimento confirmado como realizado gera, automaticamente e de forma atômica, os marcos de
  30 dias, 90 dias e 6 meses (`unique(appointment_id, kind)`). Gestão e Gabi podem confirmar
  "realizado" (autoria registrada); anular é só da gestão.
- Fila agrupa por paciente com janela de 14 dias; um contato só contempla marcos/tarefas por vínculo
  explícito. A Gabi vê os valores das tarefas de cobrança dela.
- Comercial externa e Dra. Larissa entram depois do MVP. HTML aposentado após 2 semanas de uso
  paralelo, ao fim da migração.

## 2026-10-20 — Fila: store dupla (Supabase/memória), gestão = papel `admin`, modo demonstração isolado

- A regra de negócio da fila (`stimma-os/lib/fila/servico.ts`) fala com uma interface `FilaStore`
  com duas implementações: `store-supabase.ts` (service role, sempre filtrando por
  `organization_id` porque o service role ignora RLS) e `store-memoria.ts` (testes e modo
  demonstração). Assim o fluxo inteiro é testado no Vitest e no navegador sem nunca criar dado de
  teste no banco real. A store em memória replica as funções atômicas do banco usando as mesmas
  funções puras de `marcos.ts`; a fonte de verdade em produção continua sendo
  `confirmar_atendimento_realizado` / `anular_atendimento` (migration 0012).
- "Gestão" = usuário com o papel `admin` em `user_roles`. Só a gestão cola a entrada e anula
  lançamentos; qualquer perfil ativo trabalha a fila e confirma atendimento realizado.
- `npm run dev:demo` (porta 3101) sobe o app com as chaves do Supabase **vazias**: o `@next/env`
  não sobrescreve variável que já existe no ambiente, então o `.env.local` (que aponta para
  produção) não tem efeito sobre elas e tudo cai na store em memória, com aviso visível de
  demonstração. Uma primeira tentativa usando `__NEXT_PROCESSED_ENV` não funcionou (o Next ainda
  carregou o `.env.local`); a falha foi detectada antes de qualquer escrita.
- Cobrança vencida entra na fila com a data real de vencimento (aparece como atrasada), não com a
  data do dia.
- A migration 0012 ganhou `tasks.updated_at` (a tabela não tinha) e `grant execute ... to
  service_role` explícito nas duas funções, além do `revoke` de `public/anon/authenticated`.
- Pendente para depois do MVP: anular atendimento já confirmado a partir de um card de marco (hoje
  a anulação aparece no item "conferir atendimento"), exportação/backup e importador do JSON do
  `feedback-concierge.html`.

## 2026-10-21 — Migration 0012 (fila da concierge) aplicada e verificada em produção

Aplicada no projeto `stimma-os` (`fjxvseuopzhfwdraszvp`, conta `larissaandrade.odonto@gmail.com`)
pelo SQL Editor via Claude in Chrome, com checagem prévia (nenhuma tabela da 0012 existia). As
cinco consultas de verificação passaram: 7 tabelas novas, 2 funções
(`confirmar_atendimento_realizado`, `anular_atendimento`), `31/08 + 6 meses = 2027-02-28`, colunas
novas em `appointments`/`tasks` e RLS ligado nas 7 tabelas. Nenhum dado existente foi alterado.
O código das telas (`/entrada`, `/fila`, `/fechamento`) continua só no branch `fila-concierge`,
ainda não publicado.

## 2026-10-22 — Fila: fluxo completo gestão → concierge → feedback → continuidade

Auditoria pedida pelo usuário mostrou lacunas na primeira versão (entrada só JSON, sem prévia
editável, sem importação de feedback, sem gestão manual de tarefas). Corrigido, aproveitando o que
existia:

- **Prévia editável** em /entrada (aba Levantamento): toda proposta pode ser corrigida (paciente,
  tipo, ação, contexto, prazo, valores, datas, origem) e é reconferida no servidor (vínculo,
  duplicidade) antes de publicar. Itens manuais no mesmo editor.
- **Conversão de texto livre por IA**, só no servidor (`lib/fila/ia.ts`, `@anthropic-ai/sdk`,
  modelo `claude-opus-5-5`, saída em JSON schema, `fallbacks: "default"`). O texto colado vai
  delimitado como dado; a saída passa pelo validador do contrato e pela prévia; nunca vira tarefa
  sem confirmação. Ref de tarefa inventada pela IA rebaixa a proposta para "revisar". Para a IA vão
  só referência curta + primeiro nome e inicial das tarefas abertas (minimização). Chave em
  `ANTHROPIC_API_KEY` (Netlify), **ainda não configurada**: sem ela a rota responde 503 com
  mensagem clara e a interface oferece JSON/manual. Custo estimado: ~US$ 0,03–0,10 por conversão
  (US$ 4/US$ 20 por milhão de tokens de entrada/saída).
- **Feedback com referências curtas** (`[T-1a2b3c]` tarefa, `[M-…]` marco): o feedback gerado em
  /fechamento, colado de volta na gestão, é lido sem IA (`lib/fila/feedback.ts`) e comparado com o
  banco — concluído não é recriado, aberto segue na fila, nada é duplicado. Linhas sem referência
  ficam para revisão manual ou sugestão da IA (com a data do próprio feedback como base).
- **Gestão manual de tarefas** (aba Tarefas): criar, editar, atribuir, reagendar e cancelar; toda
  mudança vira evento `correcao`/`encerramento` com autor e data (histórico visível) + audit log.
  Tarefa encerrada pela concierge não é editada — o resultado dela é preservado.
- **Continuidade automática**: agendamento cria "Confirmar comparecimento" na data da consulta;
  compareceu → atendimento "a conferir" (marcos só após confirmação no SD); faltou → tarefa de
  recuperação. Contato/resposta/adiamento guardam a próxima ação (texto) além da data.
- **Fila com seção "Atrasadas"** separada de "Hoje". "Resolver / encerrar" distingue objetivo
  resolvido (com resultado) de encerrar sem resolver.
- **Fechamento**: botão "Gerar feedback" com ações, resultados, aguardando, agendamentos,
  cobranças/recebimentos, pendências e prioridades do próximo dia útil; totais da clínica seguem
  como campos manuais opcionais.
- **Modo demonstração**: papel alternável (gestão/concierge) por cookie, só sem Supabase; usado na
  auditoria com duas sessões (localhost e 127.0.0.1) contra o mesmo servidor.

## 2026-10-22 — Causa das exceções em /entrada, /fila e /fechamento em produção

Logs do Netlify (digests 1891141404, 544180059, 2039825317): as três rotas falhavam com
`SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não configuradas` — **a variável
`SUPABASE_SERVICE_ROLE_KEY` não existe no ambiente do site `stimma-os-gestor` no Netlify**. Causa
única: as três passam por `contextoDaSessao()` (service role); `/hoje` não usa e por isso abria.
As consultas de leitura da fila foram validadas contra o banco real com a chave do `.env.local`
(`npm run fila:verificar-leitura`, só leitura): todas funcionam.

Correções de código (não dispensam a variável): páginas nunca mais derrubam — sem sessão vão ao
login, falha de configuração/consulta vira tela "indisponível" com "tentar novamente" e detalhe só
no log; `error.tsx` por rota; APIs respondem 503 "nada foi salvo" em vez de 500 sem corpo; 401 com
"sessão expirou". Sinais internos do Next (DYNAMIC_SERVER_USAGE/NEXT_*) são repassados e as rotas
`/api/fila/*` são `force-dynamic` (o try/catch novo engolia o sinal no build). `/hoje`: recebíveis
vencidos deixam de se repetir em três áreas (detalhe no Financeiro, um item nas prioridades), ações
com valor/data, atalho para a Fila; itens de menu não implementados marcados "em breve".
Outras rotas que usam service role (`/api/intake/anamnese`, `/api/sync/*`, `/api/pipeline/*`)
também dependem da mesma variável.

## 2026-10-22 — Primeira versão concentrada na rotina da concierge; financeiro por paciente suspenso

- **Módulo financeiro por paciente suspenso** (`lib/rules/modulos.ts`, `MODULO_FINANCEIRO_ATIVO =
  false`): recebíveis, saldos, parcelas, alertas de inadimplência/pagamento e prioridades geradas a
  partir deles não aparecem no `/hoje`, no Modo FUP (selo "débito em aberto") nem alimentam
  prioridades. Nada foi apagado do banco; o motor de regras continua calculando e o filtro fica na
  saída para a interface. Tarefas manuais de cobrança criadas pela gestão seguem na fila.
- **Feedback e tela da concierge sem totais financeiros**: saem a seção Financeiro, o caixa e os
  totais de cobranças/recebimentos; uma cobrança aparece como ação realizada e um recebimento só
  quando a concierge o registrou. Valores de caixa já gravados são reenviados intactos ao salvar a
  agenda (não aparecem, não são apagados).
- **Página principal = `/fila`** (Feedback diário); login e definição de senha levam para lá.
- **Botão "Sair"** no topo do menu lateral (computador) e na barra de abas (celular): `signOut()`
  no Supabase Auth + `location.replace("/login")`. O middleware passa a proteger `/` e marca as
  páginas protegidas com `Cache-Control: private, no-store`, para o "Voltar" não reexibir dados.

## 2026-10-23 — Registro do dia, formulário único "Registrar" e migration 0013

- **Registro espontâneo** ("+ Adicionar registro do dia"), mesmo com a fila vazia. Os tipos são agenda
  (falta/cancelamento/amanhã), oportunidade interna, recorrência/reativação, continuidade,
  pós-atendimento, aniversário/relacionamento, pendência/alerta e encaminhamento Gabi↔Comercial
  Externa. Não há prospecção de leads.
  - A paciente é escolhida por busca e os casos abertos dela aparecem para vincular, sempre por
    escolha explícita. Nada é mesclado automaticamente.
  - "Não cadastrada" cria a paciente explicitamente. Pendência e agenda aceitam assunto sem
    paciente.
- **Um só formulário** (`components/fila/FormRegistro.tsx`, regras em `lib/fila/registro.ts`) para
  item da fila e registro espontâneo.
  - Contato e resposta são tri-estado (sim/não/não se aplica), o vazio significa "não preenchido" e
    nada é marcado sozinho.
  - Mensagem sem retorno fica "aguardando". Contato não encerra o caso.
  - "Agendado" cria um acompanhamento de comparecimento: agendamento ≠ atendido.
  - Pendência exige próxima ação + responsável + prazo. "Resolvido" fecha sem próxima ação.
    "Informativo" não cria tarefa.
  - Reclamação de pós-atendimento é só "atenção", sem interpretação clínica. Oportunidade não tem
    campos financeiros.
  - Etapa clínica futura não conta como atraso administrativo.
  - O `eventoId` gerado no cliente torna o duplo clique idempotente.
- **Feedback** montado só de eventos persistidos, em blocos por área. Cada evento aparece num bloco
  só, separando resultados, ações e pendências abertas.
  - Um caso antigo respondido hoje conta como resultado, sem contato inventado.
  - Dias anteriores não usam a situação atual (`historico`).
  - Os contadores excluem correções e contam tentativas e pacientes separadamente.
  - "Sem ocorrências" é um estado salvo, diferente de "ainda não revisada".
  - Prioridades: até 5, sugeridas ou manuais, persistidas, sempre para o próximo dia útil. O botão
    redundante "Gerar feedback" saiu.
- **Marcos de continuidade escolhidos ao conferir o atendimento**, todos marcados por padrão. Só os
  escolhidos são criados e os existentes nunca são tocados.
- **Migration 0013** (só aditiva):
  - novas colunas em `interaction_events`, com `patient_id` passando a anulável e o alvo sendo
    paciente ou assunto;
  - `tasks.assunto` e novos tipos de tarefa;
  - `daily_manual_figures.prioridades/secoes`;
  - sobrecarga `confirmar_atendimento_realizado(..., p_marcos text[])`.
  - Precisa ser aplicada **antes** do deploy deste código, porque o store já seleciona as colunas
    novas.

## 2026-10-24 — Auditoria dos acessos Álvaro × Gabi: trabalho por perfil, comunicação na tarefa, entrega formal e lote retomável

Diagnóstico (consulta só leitura ao banco de produção em 2026-10-23):
- **504 na entrada de 51 itens**: o lote foi salvo por inteiro (import_batches `confirmado`, 20 pacientes,
  18 atendimentos → 54 marcos, 1 tarefa). O Netlify cortou a resposta, a função terminou; "Nada foi salvo"
  era falso (vinha do cliente para qualquer 5xx). 25 itens ficaram "vínculo pendente" sem caminho de retomada.
- **54 marcos abertos** = 18 atendimentos × 3, todos futuros; **34 pacientes sem próxima ação** no Pipeline é
  outra entidade (paciente do CRM), não tarefa. **1 tarefa** na Gestão = a única tarefa executável.
- **Nomes inconsistentes**: o perfil da recepção tem `full_name` = e-mail; a tela forçava "Gabi"; formulários
  ofereciam "Ninguém".
- **Cancelamento abrindo como falta**: o formulário ignorava `payload.ocorrencia` e presumia "falta".
- **Código de acesso**: o provedor envia 8 dígitos; a interface dizia 6.

Decisões:
- **Configuração da fila** (`fila_config`, 0014): concierge = conta `clinica.stimma@gmail.com` com papel
  reception (identificação confirmada pelo gestor em 2026-10-22), nome de exibição "Gabi", gestor = único admin
  ativo. Sem identificação inequívoca fica null e a interface mostra "configuração pendente". Expediente começa
  não configurado (sem cobrança de entrega nem atraso).
- **Navegação por perfil**, sem itens "em breve". Gestão: Trabalho da Gabi · Entrada e tarefas · Feedbacks da
  Gabi. Concierge: Meu trabalho · Feedback diário. `/` e `/hoje` → `/trabalho`; `/fila` da gestão → `/feedbacks`;
  `/fechamento` → área unificada. Pipeline fica fora da navegação. Permissão real continua nas rotas (403).
- **Visão de trabalho comum** (`lib/fila/trabalho.ts`): tarefas, marcos e conferências na mesma lista, sem
  fundir tabelas; cada item em UMA situação (atrasada, hoje, aguardando paciente, aguardando gestão, próxima,
  concluída), então os indicadores somam e abrem a mesma lista. Filtros na URL. Marcos além de 7 dias recolhidos.
  Aguardando paciente com revisão vencida volta para hoje/atrasada.
- **Comunicação na tarefa** (`lib/fila/conversa.ts`): eventos `nota` (orientação, pergunta/impedimento, resposta,
  decisão) com autor e horário; pergunta da concierge → `aguardando = gestao` e próxima ação com o gestor;
  resposta da gestão pode devolver a próxima ação com prazo. Não lido = registro de outra pessoa depois da última
  abertura do detalhe (`task_reads`, gravado só ao abrir o detalhe).
- **Responsável obrigatório** para publicar tarefa manual; importadas vão para a concierge configurada;
  encaminhar à gestão transfere a próxima ação ao gestor; tarefas administrativas sem paciente (assunto).
- **Continuidade**: aguardando paciente exige data de revisão; resolver exige resultado; mensagem sem resposta
  não resolve; cobrança só resolve com pagamento confirmado; adiar sem contato exige motivo, preserva
  `prazo_original` e conta `adiamentos`. "Sem atualização" = `dias_sem_atualizacao` (padrão 3, configurável).
- **Marcos obrigatórios**: confirmar atendimento realizado sempre cria 30 dias, 90 dias e 6 meses (a sobrecarga
  com `p_marcos` passa a ignorar a escolha). Regularização na 0014 cria só os ausentes (hoje: nenhum).
  Registro agrupado: só o item aberto vem marcado; marco futuro exige justificativa; um evento por registro
  (contadores separam contatos, pacientes e marcos trabalhados).
- **Entrega formal do feedback** (`daily_feedbacks`, `lib/fila/entrega.ts`): rascunho (prévia ao vivo) → gerado
  → entregue (ação explícita, idempotente); registros novos depois de gerar exigem gerar de novo; correção cria
  nova versão e preserva a entregue; gestão comenta/pede ajuste; copiado e "enviado pelo WhatsApp" são marcas
  separadas e nada é enviado automaticamente. O feedback respeita autoria: só registros e pendências da concierge.
- **Lote retomável**: o lote é aberto antes de aplicar e cada item grava o resultado logo depois (`aplicado_em`);
  o cliente publica em trechos de 5 itens; falha ou resposta perdida → consulta `/api/fila/entrada/estado` e
  retoma só o que falta; propostas editadas ficam na tela (e num rascunho local do navegador).
  "Nada foi salvo" só aparece quando o servidor afirma; resposta ausente = "resultado incerto".
- **Código de acesso**: `lib/auth/otp.ts` (8 dígitos, texto, colagem com espaços/hífen).

Migration 0014 (aditiva) precisa ser aplicada **antes** do deploy: o código seleciona as colunas e tabelas novas.

## 2026-10-26 — Redesign "Arquitetura do Olhar" (identidade Dra. Larissa Andrade)

- **Tokens** em `app/globals.css`: grafite #252827 (estrutura), canvas #F5F2ED (fundo), branco (superfícies), bordô
  #642E35 (seleção e ação principal), borda #E3DED7. Contraste AA conferido; o "muted" da marca #827B74 (3,7:1)
  fica só em elementos não textuais — texto apagado usa #6B645D (5,2:1). Estados (erro, atenção, sucesso, informação)
  com fundo suave e sempre com texto. Escala de 4px, raio 6px (controles) / 8px (cards), sombra mínima.
- **Tipografia**: Canela Deck e Neue Haas Grotesk não têm licença no projeto → Cormorant Garamond (títulos, números de
  destaque, com algarismos alinhados) + Inter (todo o resto), auto-hospedadas por `next/font`.
- **Tema operacional `.tema-la`** sempre claro; o modo escuro do sistema continua só nas telas legadas (pipeline).
- **Monograma oficial** (arquivo enviado pela gestão) em `public/brand/` (creme e grafite) e no ícone da aba.
- **Shell**: coluna grafite com monograma e navegação por perfil (item ativo com régua bordô + `aria-current`);
  no celular, barra grafite curta com "Sair" e abas logo abaixo.
- **/trabalho**: atrasadas, hoje e decisão da gestão em destaque; acompanhamento em linha secundária; busca, situação
  e responsável sempre visíveis, tipo/origem/prioridade/prazo em "Mais filtros", filtros ativos removíveis e "Limpar
  filtros". Cartão em quatro níveis (paciente → ação → situação e prazo → metadados), sinais em texto. Detalhe em
  painel lateral a partir de 1280px; abaixo disso, no próprio cartão.
- **/entrada**: régua das etapas reais (colar → revisar → conferir → publicar), abas em linha.
- **/feedbacks**: números do dia gravados na entrega, "o que foi realizado" × "o que segue · decisões" lidos do mesmo
  texto do WhatsApp (o texto copiado não muda), registros de origem em tabela.
- **Login**: painel institucional grafite (monograma, assinatura) + formulário claro; no celular, faixa curta.
- Nenhuma regra de negócio, contrato de API, migração, permissão ou autenticação foi alterada.

## 2026-10-26 — Rotina diária da concierge, agenda em leitura e indicadores separados

- **Rotina** (`lib/fila/rotina-itens.ts` catálogo puro, `lib/fila/rotina.ts` regras, migration 0015 `daily_routine_items`):
  20 itens fixos em três grupos (início, durante, fechamento), estado por usuário × dia (America/Sao_Paulo):
  a fazer · feito · não se aplica · com impedimento (motivo e próxima ação obrigatórios — também por constraint;
  prazo, responsável e tarefa relacionada opcionais). Dia novo começa do zero; impedimentos do último dia
  registrado aparecem como aviso. Só o estado da conferência é gravado: sem valores, dados bancários, documentos
  ou conteúdo clínico, e nenhum item cria tarefa por paciente (pode apontar para uma tarefa existente).
  Concierge edita a própria rotina de hoje; gestão só consulta (POST da gestão = 403). Cada marcação vai para o
  audit log com usuário e horário.
- **Feedback**: a montagem do fechamento de uma pessoa inclui a seção "Rotina do dia" (concluídos, não se aplica,
  impedimentos com motivo/próxima ação/responsável/prazo, ainda a fazer). A assinatura da rotina fica nos
  contadores da versão gerada: mudar o checklist depois de gerar exige gerar de novo (mesma regra dos registros).
  Nada é entregue, copiado ou enviado automaticamente.
- **Indicadores**: nova situação `marco_futuro` (marco previsto para depois de 7 dias), separada de "Próximas
  ações"; indicador "Sem responsável" com o mesmo universo da lista que abre. Marcos futuros só aparecem
  expandidos quando escolhidos sozinhos.
- **Agenda** (`lib/fila/agenda.ts`): leitura dos compromissos sincronizados (`appointments.source =
  simples_dental_browser`) de hoje e amanhã e da última execução concluída de `agenda_sync`; sem sincronização no
  dia, a tela manda conferir no Simples Dental. Nada é confirmado, remarcado ou inventado.
- **Expediente**: salvar exige ao menos um dia e o horário; a gestão vê aviso com link quando não configurado;
  nenhum padrão é gravado.
- **Feedback anterior** (`lib/fila/continuidade.ts`): depois da IA, revisão determinística — nova tarefa igual a
  uma aberta (mesma paciente e ação) vira "Já na fila — ignorada"; sem ação explícita vira "revisar"; "encerrar"
  baseado só em contato vira acompanhamento. Cada sugestão mostra o motivo.
- **Desempenho**: configuração lida uma vez por requisição (cache no store), consultas independentes da fila e
  da página de trabalho em paralelo; rotina e agenda falham isoladas, com "tentar novamente".
- Migration 0015 precisa ser aplicada **antes** do deploy (o feedback da concierge lê a rotina).

## 2026-10-27 — "Meu trabalho" da concierge como percurso guiado e envio do feedback em um passo

Relato da Gabi (27/10): "ontem não preenchi porque fiquei confusa" / "não estava dando certo ir para o próximo
passo". Diagnóstico pelos logs do Netlify de 26/10 (horário de Brasília):
- 18:12 — o feedback foi **gerado** (único POST em `/api/fila/feedback-diario`) e **nunca entregue**: o fluxo
  pedia dois botões em sequência ("Gerar para revisão" → "Entregar à gestão"), e o segundo passo não ficou claro.
- 18:10–18:14 — POSTs em `/api/fila/registro` e `/api/fila/atendimento` recusados (400) por validações do
  formulário de registro (próxima ação/prazo/motivo de adiamento etc.), com a mensagem só no rodapé de um
  formulário longo.
- 18:13 — PATCH de tarefa pela gestão com **500**: `interaction_events_alvo_check` — evento de tarefa **sem
  paciente** gravado sem `assunto`. A tarefa era atualizada antes do evento, então podia mudar sem histórico.
- 09:31 — rotina com 401 (sessão expirada); a mensagem existia, mas sem caminho para entrar de novo.
- "Expediente não configurado" **não bloqueava** nada: era só o texto da situação da entrega (configuração da
  gestão para saber quando cobrar). Para a concierge, deixa de aparecer; para a gestão, o aviso diz isso.

Decisões:
- **Percurso guiado** (`components/fila/MeuDiaView.tsx`, `lib/fila/meu-dia.ts`): tela inicial com saudação,
  estado do dia (Não iniciado · Em andamento · Feedback enviado · Ajuste pedido), "O que fazer agora" calculado do
  que está gravado e três etapas (Minha rotina → Pendências e acompanhamentos → Finalizar meu dia) com "Etapa N de
  3", "Voltar" e "Continuar". Navegar nunca bloqueia; a etapa fica em `?etapa=` e é lembrada no dia.
- **Envio em um passo** (`finalizarFeedback` em `lib/fila/entrega.ts`, operação `finalizar`): monta do que está
  gravado + observação opcional e entrega numa ação. Idempotente: mesmo id ou novo clique sem novidade devolvem o
  envio existente; registro depois do envio ou ajuste pedido só geram versão nova com `corrigir` (a anterior fica).
  Versão "gerada" antiga e nunca entregue é entregue sem criar outra. Não mexe em tarefas nem envia mensagens.
  As operações `gerar`/`entregar` continuam na API (compatibilidade), mas a interface não as usa mais; a página
  `/fila` vira "Registros e histórico" e aponta para "Finalizar meu dia".
- **Rotina**: grupos recolhíveis com "N de M registradas · feitas · não se aplica · com impedimento"; seletor
  compacto; "Salvo" só após confirmação do servidor; falha mantém a escolha com "Tentar novamente"; quantidades
  salvam ao sair do campo (sem "Salvar quantidades") e só aparecem quando a atividade está feita.
- **Registro de andamento**: pergunta "O que aconteceu com esta paciente?" com atalhos que só preenchem os estados
  existentes (contato, resposta, situação) — nenhuma enumeração nova. Validação espelhada no cliente, com a
  explicação junto do campo e foco nele; o servidor continua sendo a palavra final.
- **Correção do 500**: `assuntoDoEvento` (`lib/fila/assunto.ts`) em todo evento de tarefa sem paciente
  (edição/cancelamento, ação, encerramento, registro); em `editarTarefa` o histórico é gravado antes da mudança.
  O store em memória passou a espelhar a restrição do banco, para os testes pegarem o caso.
- Sem migration, sem mudança de permissão: tudo continua conferido no servidor (testado: concierge recebe 403 ao
  criar, editar/cancelar tarefa ou comentar feedback).

## 2026-10-27 — Agenda: consulta do Simples Dental aparece mesmo sem vínculo confirmado com a paciente

Sintoma: a agenda mostrava uma consulta por dia. A sincronização de 27/10 leu as 5 consultas de hoje e amanhã,
mas gravou só 1: as outras caíram em `requires_review` porque o nome batia com uma paciente já cadastrada e a
tela da agenda não expõe código nem telefone (só nome e data de nascimento, em `fcSeg.eventRange.def.extendedProps`;
a chamada `/consultas?minimal` não traz o id da paciente). Como `appointments.patient_id` era obrigatório, a
consulta simplesmente não era gravada. Segundo defeito: uma consulta já gravada (mesmo `sd_appointment_id`)
passava de novo pelo casamento de paciente e, ao bater o nome com a paciente criada na leitura anterior, sumia.

Decisões:
- Migration 0017 (aditiva): `patient_id` passa a aceitar nulo **só** para origem `simples_dental_browser`, com
  `sd_patient_name` e `requires_review` (constraint). Nenhuma linha existente muda; reversível.
- Sync: consulta já gravada mantém o vínculo que tem; consulta nova sem vínculo seguro é gravada sem paciente,
  com o nome do SD, e aparece na agenda como "Conferir cadastro". Nunca se vincula por nome sozinho
  (CRM_RULES §9). Nome **e** data de nascimento iguais a um único cadastro = vínculo (dois identificadores);
  uma consulta sem vínculo passa a ser vinculada quando isso se confirma numa leitura seguinte.
- Erro ao gravar vira "revisar", nunca "criado" (antes o erro do insert era ignorado).
- O favorito passa a ler nome, data de nascimento e status dos dados do evento (fallback no texto da tela). A
  data de nascimento só é usada para vincular (e gravada ao criar paciente nova); não é exibida.
- O pipeline (`clinic-snapshot`) ignora compromissos ainda sem paciente.
- A 0017 precisa ser aplicada **antes** do deploy: a agenda passa a ler `sd_patient_name`.

## 2026-10-27 — Agenda: consulta do Simples Dental aparece mesmo sem vínculo confirmado com a paciente

Sintoma: a agenda mostrava uma consulta por dia. A sincronização de 27/10 leu as 5 consultas de hoje e amanhã,
mas gravou só 1: as outras caíram em `requires_review` porque o nome batia com uma paciente já cadastrada e a
tela da agenda não expõe código nem telefone (só nome e data de nascimento, em `fcSeg.eventRange.def.extendedProps`;
a chamada `/consultas?minimal` não traz o id da paciente). Como `appointments.patient_id` era obrigatório, a
consulta simplesmente não era gravada. Segundo defeito: uma consulta já gravada (mesmo `sd_appointment_id`)
passava de novo pelo casamento de paciente e, ao bater o nome com a paciente criada na leitura anterior, sumia.

Decisões:
- Migration 0017 (aditiva): `patient_id` passa a aceitar nulo **só** para origem `simples_dental_browser`, com
  `sd_patient_name` e `requires_review` (constraint). Nenhuma linha existente muda; reversível.
- Sync: consulta já gravada mantém o vínculo que tem; consulta nova sem vínculo seguro é gravada sem paciente,
  com o nome do SD, e aparece na agenda como "Conferir cadastro". Nunca se vincula por nome sozinho
  (CRM_RULES §9). Nome **e** data de nascimento iguais a um único cadastro = vínculo (dois identificadores);
  uma consulta sem vínculo passa a ser vinculada quando isso se confirma numa leitura seguinte.
- Erro ao gravar vira "revisar", nunca "criado" (antes o erro do insert era ignorado).
- O favorito passa a ler nome, data de nascimento e status dos dados do evento (fallback no texto da tela). A
  data de nascimento só é usada para vincular (e gravada ao criar paciente nova); não é exibida.
- O pipeline (`clinic-snapshot`) ignora compromissos ainda sem paciente.
- A 0017 precisa ser aplicada **antes** do deploy: a agenda passa a ler `sd_patient_name`.

## 2026-10-27 — Rotina da Gabi em duas etapas e prestação de contas consolidada

- **Duas etapas** (`MeuDiaView`, `lib/fila/meu-dia.ts`): Minha rotina → Fechamento do dia. "Pendências e
  acompanhamentos" deixou de ser etapa: as tarefas continuam no banco e no histórico e entram na rotina —
  atrasadas e de hoje em "Prioridades de hoje", solicitações em "Solicitações da gestão", o resto recolhido em
  "Acompanhamentos em aberto" (cada pendência aparece uma vez; mesmo cartão com Registrar andamento, Pedir
  orientação e histórico). Links antigos `?etapa=pendencias|finalizar` levam a rotina|fechamento.
- **Grupos da rotina**: Prioridades de hoje · Início do dia · Relacionamento com pacientes · Financeiro ·
  Solicitações da gestão · Conferências finais. Saíram do checklist os itens que duplicavam outro lugar
  (follow-ups do dia, informar a gestão, retornos agendados, encaminhamentos feitos, três conferências de
  pagamento → uma). As chaves que ficaram são as mesmas; registros antigos não mudam de sentido.
- **Atividades com pacientes (tipo B)** (`PacientesDoItem` no catálogo, `lib/fila/contato-rotina.ts`): cada
  paciente vira um **registro do dia** (o mesmo de sempre: histórico, próxima ação, tarefa de retorno quando o
  caso continua, feedback). Resultados rápidos por atividade, mapeados para contato/resposta/situação existentes —
  nenhuma enumeração nova no banco; vínculo com a atividade em `payload.detalhes.rotina_item`. "Feito" numa
  atividade tipo B exige ao menos uma paciente registrada nela no dia (servidor); clicar "Feito" antes abre o
  formulário e conclui depois da primeira paciente. Paciente do cadastro ou nome digitado (cadastro novo
  explícito, sem inventar código do SD). Contatos recentes da paciente aparecem antes de registrar.
- **Marcos 15/30/60/90 dias**: mesmo marco para a mesma paciente em 25 dias só se repete com motivo (409 +
  campo de justificativa). Contagem a partir do retorno/atendimento de referência, como já era. Distribuição
  semanal preservada (15 seg, 30 ter, 90 qua); **60 dias entrou na quinta-feira** (não havia configuração) —
  ajustar no catálogo se a Dra. preferir outro dia.
- **Pós-procedimento de ontem**: item diário + lembrete com as consultas sincronizadas do último dia útil até
  ontem (na segunda inclui sexta e fim de semana), sempre mandando conferir no SD; nunca afirma procedimento.
- **Cobranças de inadimplentes** (seg/sex): por paciente, sem valores; "promessa de pagamento" fica aguardando
  com data e não é recebimento; "pagamento confirmado" só com confirmação no SD.
- **Recebimentos do dia** (`lib/fila/caixa.ts`, migration 0018 `daily_cash_reviews`): totais previsto ×
  recebido, diferença = previsto − recebido, justificativa, "sem recebimentos" e "não conferido" distintos.
  Tabela sem leitura pelo navegador; API confere que é a concierge configurada (grava) ou a gestão (consulta).
  Auditoria sem os valores. Diferença nunca é chamada de inadimplência.
- **Solicitações da gestão**: tarefas existentes com `payload.extraordinaria` + `solicitado_por` (Álvaro ou
  Dra. Larissa, registrado pela gestão). Gestão vê abertas/atrasadas/aguardando decisão/entregues no
  "Trabalho da Gabi".
- **Prioridades do próximo dia útil** (`lib/fila/prioridades.ts`): até 8, com paciente, data, prioridade,
  origem e próxima ação; sugestões de pendências, solicitações e impedimentos (sem repetir a mesma origem);
  revisão **obrigatória** para enviar (pode ser "não há"). No dia seguinte aparecem no topo; a ligada a tarefa
  segue a tarefa, a manual é marcada resolvida no dia de origem.
- **Fechamento** (`lib/fila/prestacao.ts`): um único montador para prévia, envio e gestão. Acrescenta contatos
  da rotina por atividade e resultado, recebimentos, solicitações, decisões necessárias e observação ao
  fechamento por áreas. Rascunho (observação, decisões, prioridades revisadas) no servidor
  (`daily_manual_figures.rascunho`, 0018). Mudança na conferência de recebimentos depois do envio também
  pede versão atualizada.
- 0018 precisa ser aplicada **antes** do deploy (a rotina lê `daily_cash_reviews` e `rascunho`).

## 2026-10-29 — Agenda com roteiro, pós-procedimento com relato, retorno obrigatório e régua 30 · 90 · 180

- **Conferência da agenda**: "agenda de hoje e amanhã", "novos atendimentos" e "preparação da recepção"
  viraram uma atividade só — "Conferir agenda, confirmações e alinhamento com os profissionais" (mesma chave
  `agenda_hoje_amanha`) — com um roteiro de 10 pontos expansível (não são campos). Sem ocorrência, basta
  "Feito". Ocorrência (`FormOcorrenciaAgenda`): tipo, paciente opcional (nome digitado só vira cadastro se a
  concierge escolher "não está no cadastro"), profissional comunicado, providência obrigatória e pendência
  opcional — inclusive "depende do profissional" — que vira acompanhamento com data. Nenhum disparo de
  WhatsApp.
- **Registro de contato em duas camadas** (`contato-rotina.ts`): (A) situação — paciente respondeu ·
  realizado, aguardando resposta · realizado, sem resposta · não realizado; (B) desfecho só quando respondeu —
  orientação, agendamento, comercial, profissional, resolvido, nova ação (e os de cobrança). Valores antigos
  (`contato_realizado`, `mensagem_enviada`…) continuam com rótulo. Aniversário fica sem camada de tentativa
  (mensagem que não pede resposta não gera retorno).
- **Pós-procedimento**: quando a paciente responde, "Como a paciente se encontra?" é obrigatório (tela e
  servidor; só espaços não vale). "Necessita atenção do profissional?" registra profissional, motivo, data/hora
  e estado; com "aguardando retorno do profissional" o caso fica em acompanhamento (situação `encaminhado`).
  Aviso fixo para acionar o protocolo de urgência da clínica; a concierge registra o relato, não avalia.
- **Regra global de retorno** (`lib/fila/followup.ts`, aplicada em `registrarAtividade`, servidor):
  contato sem resposta (contato = não, ou contato = sim e resposta = não) só é aceito com próxima tentativa
  (aguardando/pendente) ou encerramento com motivo. Sem data, o servidor usa o prazo padrão; sem próxima ação,
  a tentativa óbvia. Prazos (parâmetros, num só lugar): pós-procedimento 1 dia útil, continuidade 2,
  recorrência 3, reativação 3, cobrança no próximo ciclo (seg/sex, sem passar do prazo da pendência),
  confirmação nunca depois da consulta. Nenhum prazo anterior configurado no sistema conflitava.
- **Sem duplicar**: registro espontâneo com pendência procura retorno aberto da mesma paciente e do mesmo
  assunto (`payload.followup`, por atividade da rotina ou área) e o reprograma — a tentativa entra no histórico
  da mesma tarefa. Reenvio do mesmo registro já era idempotente (id do evento). Responder não encerra sozinho:
  só "resolvido" (ou agendamento/compareceu) fecha. Nova tentativa depois de uma sem resposta não conta como
  "marco repetido".
- **Régua 30 · 90 · 180 dias corridos**: o terceiro marco (código interno `m6`, mantido) passa a 180 dias em
  vez de 6 meses de calendário — função do banco (migration 0019), espelho em TS, nome "Acompanhamento de 180
  dias" em toda a tela. A 0019 recalcula só marcos m6 futuros, intocados, nunca adiados e com data da regra
  antiga; o gatilho de histórico guarda a data original. O 60 dias (só existia na rotina) saiu; "Acompanhamentos
  de 180 dias" ficou na quinta. Os contatos de 15 dias (segunda), que não fazem parte da régua, continuam.
- **Fechamento**: "Indicadores do dia" no texto e na tela — tentativas × pacientes, com/sem resposta, não
  realizados, retornos programados/concluídos/vencidos, pós-procedimento acompanhado/sem resposta, encaminhadas
  ao profissional, pendências da gestão — tudo derivado dos registros.
- A 0019 precisa ser aplicada **antes** do deploy para que novos atendimentos já gerem 180 dias no banco (sem
  ela, nada quebra: o banco continua gerando 6 meses até ser aplicada).

## 2026-10-29 — Conferência comercial da Mel dentro da rotina da Gabi

- **Uma atividade, não um sistema comercial paralelo**: "Conferir atendimentos comerciais da Mel" (chave
  `conferencia_mel`, conferências finais, segunda a sexta) com roteiro de 8 pontos. Cada paciente conferida é um
  registro do dia comum (`interaction_events`, categoria `oportunidade`, `detalhes.rotina_item = conferencia_mel`)
  com tipo (novo lead / follow-up / agendamento / oportunidade / divergência / outra), situação do contato (8
  opções), forma de conferência (conversa, Simples Dental, só informado pela Mel, divergência, não foi possível +
  motivo), resultado e, se houver, próxima ação com responsável e prazo. Sem migration.
- **Não conta como contato da Gabi**: `contato`/`resposta` ficam nulos; os eventos saem dos blocos do fechamento
  dela, dos "contatos por atividade" e dos indicadores. Têm seção própria "Conferência comercial — Mel" (números,
  relatório nominal por grupo, pendências em aberto) no mesmo montador de prestação — tela, texto enviado e
  visão da gestão são o mesmo conteúdo.
- **A Mel não tem perfil no sistema**: ela é o responsável externo já existente `comercial_externa` (rótulo
  "Mel (comercial)"). A pendência comercial nasce sem `assigned_to`, e pela regra de retorno (`followup =
  rotina:conferencia_mel`) a mesma paciente com o mesmo assunto **atualiza** o acompanhamento aberto em vez de
  criar outro. Pendência da Mel não aparece como pendência nem prioridade sugerida da Gabi.
- **Sem movimentação**: concluir a atividade sem pacientes exige marcar a confirmação explícita (métrica
  `sem_movimentacao`); o servidor recusa se houver registro do dia. Nada de paciente fictícia.
- **Remover registro incorreto = anular, nunca apagar**: `POST /api/fila/registro/anular` marca
  `payload.anulado {motivo, por, em}` e audita `fila_registro_anulado`. Só quem registrou, só no mesmo dia, motivo
  obrigatório; se o registro abriu/atualizou um acompanhamento, a correção é pela própria pendência. Anulados
  saem de listas, contagens e fechamento. Edição in-place não foi feita: anular + registrar de novo preserva a
  trilha sem mexer em pendências já criadas.
- **Privacidade**: o histórico nominal (`/api/fila/contatos-recentes`) passou a exigir concierge configurada ou
  gestão (mesma regra de `podeVerCaixa`). Nada é lido automaticamente do WhatsApp nem enviado sozinho.

## 2026-10-29 — Planejamento anual: apresentação, aceitação e fechamento (presencial e WhatsApp)

- **Dimensão do acompanhamento, não módulo à parte**: o presencial entra na atividade "Cada atendimento do dia
  teve um destino definido" (registro nominal por paciente atendida); o WhatsApp entra no registro da conferência
  comercial da Mel (pergunta opcional por paciente). Ambos são registros do dia comuns (`interaction_events`,
  categoria `oportunidade`) com campos `planejamento_*` em `detalhes`. Sem migration.
- **Oportunidade única por paciente + planejamento**: o servidor resolve `oportunidade_id` a partir do histórico
  da paciente (400 dias): continua a oportunidade aberta (mesmo tipo, quando informado; senão a mais recente),
  ou a já fechada quando o fechamento é informado de novo; senão nasce uma nova com o id do próprio registro.
  "É outra proposta" força uma nova. O registro guarda `planejamento_novo` (primeira apresentação),
  `planejamento_origem` (canal da primeira) e `planejamento_fechou` (primeiro fechamento conferido) — por isso
  apresentação de ontem fechada hoje conta só como fechamento de hoje, e presencial → WhatsApp é uma oportunidade.
- **Estados separados**: avaliando / interesse / aceito exigem próxima ação + responsável + prazo (o acompanhamento
  usa a chave `planejamento:<oportunidade>` na regra de retorno — nunca duplica entre canais). Aceito não é
  fechamento. Fechado só conta conferido (presencial: com o profissional ou nos registros; WhatsApp: na conversa
  ou no Simples Dental); informado fica "pendente de conferência" com próxima ação. Fechamento conferido conclui
  o acompanhamento; recusa o cancela (motivo opcional; "pediu para não receber contatos" registrado).
- **Sem presunção, sem justificativa inventada**: "Sim" presencial exige profissional e forma de confirmação;
  "Não" aceita motivo opcional ("motivo ainda não informado"); "Ainda não foi possível confirmar" vira pendência
  de esclarecimento (sugestão: Gabi).
- **Responsabilidade**: próxima ação comercial sugerida para a Mel (`comercial_externa`); conferências para a
  Gabi. Propostas sem responsável interno não aparecem como pendência/prioridade da Gabi nem nos indicadores dela.
- **Fechamento do dia**: seção "Planejamentos anuais — Apresentações e fechamentos" (tela + texto enviado, mesmo
  montador): números do dia separados da carteira acumulada (acompanhamentos `planejamento:*` em aberto) e grupos
  nominais (apresentados presencialmente / pelo WhatsApp com a situação atual, fechamentos do dia com origem e
  valor confirmado, em avaliação, não fechados, informações pendentes). Valor contratado nunca entra nos
  recebimentos. "Atendimentos do dia" vem da agenda sincronizada (cancelados, faltas e remarcados fora).
- **Correção**: registro errado se corrige com novo registro da mesma oportunidade (o último manda, trilha
  preservada) ou, se não abriu acompanhamento, anulando com motivo.
