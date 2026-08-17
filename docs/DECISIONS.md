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

## 2026-08-17 — Primitivos de UI escritos à mão em vez de instalar shadcn/ui agora

O briefing pede shadcn/ui. Para a primeira fatia do cockpit, os primitivos (Button, Card,
Badge, StatusDot) foram escritos à mão em Tailwind puro, seguindo a mesma linguagem visual que
shadcn usaria (tokens de cor via CSS vars, `class-variance-authority`-like via `clsx`), para não
depender do CLI/registry do shadcn nesta sessão. Trocar por componentes gerados pelo `shadcn add`
é direto quando fizer sentido — nenhuma decisão de design foi tomada que dependa de ser
especificamente shadcn.

## 2026-08-13 — Stack confirmada sem alterações

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui no frontend; Supabase (Postgres + Auth
+ RLS) no backend; Netlify no deploy. Nenhuma incompatibilidade técnica foi encontrada que
justificasse desviar do briefing.
