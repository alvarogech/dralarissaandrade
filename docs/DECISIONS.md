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
