# Plano — Fila da concierge e marcos automáticos no STIMMA OS

> Proposta de arquitetura e implementação por fases (2026-10-20). **Nada foi publicado nem alterado
> em produção.** Substitui, por fases, o `feedback-concierge.html` (arquivo local, nunca commitado,
> dados em `localStorage`).

---

## 1. Diagnóstico

### O que já existe (verificado no repositório e no Netlify em 2026-10-20)

| Peça | Estado real |
|---|---|
| **STIMMA OS** (`stimma-os/`) | Next.js 14 + Supabase (`sa-east-1`), no ar em **`https://app.larissaandrade.com.br`** (site Netlify `stimma-os-gestor`, deploy contínuo do `main` deste repositório). |
| Autenticação | Supabase Auth com convite por e-mail. Usuários reais: Álvaro (admin), Dra. Larissa (professional), Gabi (`clinica.stimma@gmail.com`, reception). |
| Banco | 11 migrations aplicadas. Já há `patients`, `patient_external_ids` (`unique(source, external_id)`), `appointments` (status `completed`, `sd_appointment_id`, índice de idempotência), `tasks` + `task_events`, `pipeline_history`, `audit_logs`, `automation_actions`. RLS: leitura por organização; escrita só por Route Handlers com service role. |
| Telas | `/hoje` (cockpit do gestor), `/pipeline`, `/pipeline/fup` (fila de pacientes sem próxima ação), intake automático da anamnese. |
| Site público | `www.larissaandrade.com.br` = site Netlify `stimma`, repositório **separado** (`alvarosia`). A anamnese está em `anamnese.larissaandrade.com.br`. |
| Netlify | Equipe no plano **Pro** (US$ 20/mês fixo, membros ilimitados, 3.000 créditos/mês — conferido em netlify.com/pricing). |
| `feedback-concierge.html` | Rico em regras (marcos 30/90/6m, eventos determinísticos, data de corte, backup JSON), mas é **um único navegador**: a gestão não consegue mandar tarefa para a Gabi em outro dispositivo, e muitos fatos são digitados em várias seções. |

### Problemas a resolver

1. **Dois sistemas paralelos.** O HTML local e o STIMMA OS guardam pacientes e próximas ações separadamente.
2. **Digitação repetida.** O mesmo fato vai para Recorrência, Continuidade, Relacionamento e para o fechamento.
3. **Marcos opcionais e manuais.** A Gabi precisa abrir um modal e marcar caixas; atendimentos esquecidos não geram nada.
4. **Conferências manuais em excesso.** A conferência antes do contato, a conferência semanal e os "nada a registrar" repetem informação.
5. **Sem continuidade entre dispositivos e sem backup no servidor.**

### Decisão central

**Não criar uma plataforma nova.** A fila da Gabi vira um **módulo do STIMMA OS**, no mesmo domínio,
banco, login e regras de acesso que já estão em produção. Isso elimina um controle paralelo em vez de
criar mais um.

---

## 2. Arquitetura

### Recomendada — módulo no STIMMA OS (A)

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | Next.js 14 do `stimma-os/` (novas rotas `/fila`, `/entrada`, `/fechamento`) | Já publicado, com layout, auth guard e testes (Vitest). |
| Endereço | **`app.larissaandrade.com.br`** (já ativo, com TLS) | Não é preciso criar `gestao.`; o site público fica intocado em outro site/repositório. |
| Banco | Supabase `stimma-os` (Postgres) | Já tem pacientes, agenda e tarefas; RLS por organização. |
| Autenticação | Supabase Auth com convite (já em uso) | Gabi e Álvaro já têm conta. |
| Regras de acesso | RLS no banco + papel checado no servidor | Dados protegidos no banco, não só escondidos na tela. |
| Regras automáticas | **Funções Postgres transacionais** (RPC `security definer`) chamadas por Route Handlers | Marcos gerados de forma atômica, com `ON CONFLICT`: sem geração parcial e sem duplicidade em retentativas. |
| Backups | Plano Free (decidido): exportação semanal automática + botão de exportação + `supabase db dump` mensal, guardados fora do Supabase | O Free não tem backup diário; ver §13. |

### Alternativa — HTML atual + Supabase direto do navegador (B)

Manter o `feedback-concierge.html` como interface e trocar o `localStorage` por `supabase-js` com
políticas RLS de escrita.

- **Vantagem:** reaproveita a tela atual.
- **Desvantagens:** duplica pacientes e tarefas que já existem no STIMMA OS; a lógica de marcos fica no
  navegador (e a geração deixa de ser transacional); um arquivo de 250 KB é difícil de manter.

**Não recomendada.**

---

## 3. Conceitos (não misturar)

| Conceito | O que é | Onde vive |
|---|---|---|
| **Atendimento de referência** | Atendimento confirmado como **realizado**, com data exata, paciente e identificador | `appointments` (status `completed` + `realizado_confirmado_em`) |
| **Marco previsto** | Contato de 30 dias, 90 dias ou 6 meses derivado de um atendimento | `follow_up_milestones` (1 linha por atendimento × marco) |
| **Tarefa executável** | Algo que a Gabi precisa fazer: cobrança, recuperação de falta, continuidade, relacionamento/reativação, encaminhamento | `tasks` (estendida) |
| **Evento real** | Algo que aconteceu: contato, resposta, agendamento obtido, recebimento confirmado, atendimento realizado, adiamento, encerramento | `interaction_events` (só cresce) + `event_links` |

**Um marco não vira tarefa.** A fila mostra os marcos vencidos e as tarefas abertas **agrupados por
paciente**, num único cartão.

---

## 4. Fluxos

### Álvaro (gestão)

1. Pede à extensão do Chrome: "levante os atendimentos realizados de 13 a 19/10 e as cobranças vencidas, no formato STIMMA".
2. Cola o resultado em **`/entrada` → Colar lote**.
3. Revisa a **prévia**: novos, atualizações, duplicados ignorados, possíveis duplicidades, erros e campos "a conferir".
4. Resolve os vínculos que faltam (paciente não encontrada → buscar e vincular ou cadastrar) e confirma.
5. Atendimentos geram os três marcos automaticamente; as demais linhas viram tarefas na fila.

Para um caso isolado, usa o **formulário rápido** (mesmos campos, um item por vez).

### Gabi (concierge)

1. Abre **`/fila`**: *Hoje e atrasadas · Aguardando resposta · Próximas · Concluídas*.
2. Cada cartão de paciente mostra o motivo, o contexto, a origem e a data da informação, o prazo, o último contato, o responsável e a próxima ação.
3. Ações rápidas: **registrar contato · registrar resposta · próxima ação e prazo · registrar agendamento · confirmar realização · adiar com motivo · encaminhar · encerrar com motivo**.
4. Ao registrar um contato, escolhe explicitamente quais itens daquele cartão ele contempla.
5. No fim do dia, abre **`/fechamento`**: o texto já está montado a partir dos eventos. Ela só confere os poucos campos manuais e copia para o WhatsApp.

### Exemplo completo (fictício)

- **20/10, Álvaro cola um lote** com:
  - atendimento de **Mariana Exemplo** (cód. SD 1042) realizado em **15/10**;
  - uma cobrança de **Rita Exemplo**, R$ 450,00, com o valor "a conferir".
- **A prévia acusa:**
  - um atendimento já enviado na semana anterior (mesma `chave_origem` → ignorado);
  - um atendimento sem identificador da mesma paciente e data de outro → "possível duplicidade", para revisão.
- **Ao confirmar:**
  - Mariana ganha os marcos **14/11 (30 dias), 13/01/2027 (90 dias) e 15/04/2027 (6 meses)**;
  - a cobrança vira tarefa com o selo "valor a conferir".
- **14/11, na fila da Gabi:** o cartão da Mariana traz o marco de 30 dias (atendimento de 15/10) e, como "pode ser tratado junto", o marco de 90 dias de um atendimento anterior (20/08 → 18/11), desmarcado por padrão.
- **A Gabi envia uma mensagem só.** Registra o contato e marca os dois marcos, porque a conversa cobriu as duas finalidades.
- **15/11:** resposta registrada.
- **22/11:** agendamento obtido para 02/12.
- **Fechamento de 14/11:** "1 paciente contatada · 1 contato · 2 marcos contemplados (30 dias, 90 dias)".

---

## 5. Estrutura mínima dos dados (migration 0012, proposta)

```sql
-- Identificadores do Simples Dental: separados, nunca equivalentes
--   patient_external_ids.source ∈ ('sd_codigo','sd_numero','sd_ficha_id','feedback_html')

alter table appointments
  add column realizado_confirmado_em timestamptz,
  add column realizado_confirmado_por uuid references profiles(id),
  add column data_status text not null default 'exata'
    check (data_status in ('exata','pendente_validacao')),
  add column anulado_em timestamptz,
  add column anulado_motivo text,
  add column chave_origem text;              -- id do evento no SD, quando houver
create unique index appointments_org_chave_origem
  on appointments (organization_id, chave_origem) where chave_origem is not null;

create table follow_up_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  appointment_id uuid not null references appointments(id),
  patient_id uuid not null references patients(id),
  kind text not null check (kind in ('d30','d90','m6')),
  due_original date not null,                -- nunca muda depois de trabalhado
  due_current date not null,                 -- adiamento muda só esta
  status text not null default 'previsto'
    check (status in ('previsto','contatado','contemplado','dispensado','invalidado')),
  status_reason text,
  legacy_id text,                            -- id do marco no HTML (migração)
  created_at timestamptz not null default now(),
  unique (appointment_id, kind)              -- impede duplicidade por construção
);

alter table tasks
  add column kind text check (kind in ('cobranca','recuperacao_falta','continuidade',
    'relacionamento','encaminhamento','outro')),
  add column chave_origem text,
  add column origem text, add column origem_data date,
  add column a_conferir text[] not null default '{}',   -- campos ainda não verificados
  add column next_action text, add column next_action_due date,
  add column waiting_since timestamptz;
create unique index tasks_org_chave_origem
  on tasks (organization_id, chave_origem) where chave_origem is not null;

create table interaction_events (            -- só cresce; correção = novo evento
  id uuid primary key,                       -- gerado no cliente = chave de idempotência
  organization_id uuid not null, patient_id uuid not null references patients(id),
  kind text not null check (kind in ('contato','resposta','agendamento_obtido',
    'cancelamento','recebimento_confirmado','atendimento_realizado','adiamento',
    'encerramento','encaminhamento','correcao')),
  occurred_on date not null,                 -- quando aconteceu
  recorded_at timestamptz not null default now(),
  channel text, notes text,
  amount numeric(12,2), amount_origin text,  -- recebimento: valor e origem (parcela, dívida, venda)
  scheduled_for date,                        -- agendamento: data da consulta
  created_by uuid not null references profiles(id),
  legacy_id text
);
create table event_links (                   -- vínculo explícito evento → marco/tarefa
  event_id uuid references interaction_events(id),
  milestone_id uuid references follow_up_milestones(id),
  task_id uuid references tasks(id),
  check ((milestone_id is null) <> (task_id is null)),
  unique (event_id, milestone_id), unique (event_id, task_id)
);

create table import_batches (id uuid primary key, organization_id uuid, created_by uuid,
  payload_hash text not null, origem text not null, consultado_em timestamptz not null,
  status text not null, created_at timestamptz default now(),
  unique (organization_id, payload_hash));   -- reenviar o mesmo lote não reprocessa
create table import_items (batch_id uuid references import_batches(id), row_index int,
  tipo text, chave_origem text, resultado text, -- novo|atualizacao|duplicado|possivel_duplicidade|erro|conflito
  payload jsonb, resolution jsonb, primary key (batch_id, row_index));

create table daily_manual_figures (          -- os poucos números sem fonte confiável
  organization_id uuid, day date, agenda_prevista int, agenda_realizada int,
  caixa_previsto numeric(12,2), caixa_recebido numeric(12,2), caixa_situacao text,
  updated_by uuid, primary key (organization_id, day));
```

Toda escrita passa por Route Handler, que confere o papel e grava em `audit_logs`, como já é feito hoje.
Leitura: RLS por organização. A recepção não lê valores financeiros detalhados se isso for decidido (ver §10).

---

## 6. Formato para colar ou importar (contrato `stimma-entrada-v1`)

**Primeira versão: área de colar JSON + prévia**, com o formulário rápido para casos avulsos.

| Opção | Avaliação |
|---|---|
| Formulário rápido | Ótimo para 1 item; lento para lotes. **Entra junto, como complemento.** |
| **Colar lista estruturada (JSON)** | A extensão gera o texto, você cola e revisa a prévia. Não exige extensão própria nem API. **Recomendada.** |
| Importar arquivo JSON/CSV | Mesmo contrato, um passo a mais (salvar arquivo). CSV fica para depois, se a extensão não produzir JSON bem. |
| Extensão preenchendo formulário | Frágil (depende de seletores e cliques), lento e difícil de revisar em lote. Não recomendada. |

```json
{
  "contrato": "stimma-entrada-v1",
  "lote": {
    "origem": "simples_dental",
    "consultado_em": "2026-10-20T09:40:00-03:00",
    "consultado_por": "alvaro",
    "ferramenta": "claude_chrome",
    "periodo": { "de": "2026-10-13", "ate": "2026-10-19" }
  },
  "itens": [
    {
      "tipo": "atendimento_realizado",
      "chave_origem": "sd-atend-88213",
      "paciente": { "nome": "Mariana Exemplo", "sd_codigo": "1042", "sd_numero": "318", "telefone": "62999990000" },
      "data_atendimento": "2026-10-15",
      "status_no_sd": "Finalizada",
      "profissional": "Dra. Larissa",
      "procedimento": "Toxina botulínica",
      "a_conferir": [],
      "nota_ia": "Paciente comentou interesse em skinbooster."
    },
    {
      "tipo": "cobranca",
      "chave_origem": "sd-receb-5512-parc3",
      "paciente": { "nome": "Rita Exemplo", "sd_codigo": "877" },
      "valor": 450.00, "vencimento": "2026-10-10", "descricao": "Parcela 3/6",
      "a_conferir": ["valor"]
    },
    { "tipo": "recuperacao_falta", "chave_origem": "sd-agenda-99120",
      "paciente": { "nome": "Bia Exemplo", "sd_codigo": "1201" },
      "data_ocorrencia": "2026-10-18", "ocorrencia": "falta", "a_conferir": [] },
    { "tipo": "continuidade", "paciente": { "nome": "Paula Exemplo", "sd_codigo": "655" },
      "contexto": "3ª sessão de bioestimulador ainda sem agenda", "a_conferir": ["contexto"] },
    { "tipo": "relacionamento", "subtipo": "reativacao",
      "paciente": { "nome": "Lia Exemplo", "sd_numero": "92" },
      "ultimo_atendimento": "2025-03", "a_conferir": ["ultimo_atendimento"] },
    { "tipo": "encaminhamento", "paciente": { "nome": "Joana Exemplo", "telefone": "62988887777" },
      "para": "comercial_externa", "motivo": "pediu condições de pagamento", "a_conferir": [] }
  ]
}
```

**Regras da entrada**

- **Obrigatórios:**
  - `lote.origem` e `lote.consultado_em` (pode ser sobrescrito por item);
  - `tipo`;
  - pelo menos um identificador do Simples Dental, ou nome + telefone (este último caso vai para vinculação manual);
  - para atendimento: `data_atendimento` no formato AAAA-MM-DD **e** `status_no_sd` indicando realizado.
- **Verificado × a conferir:**
  - tudo que estiver em `a_conferir` aparece com selo e **não** vira fato até alguém confirmar;
  - `nota_ia` é só contexto, nunca diagnóstico, dívida confirmada ou ação executada;
  - data aproximada ("2025-03") só é aceita onde o contrato permite (último atendimento), e nunca gera marco.
- **Idempotência:**
  - reenviar o mesmo lote é reconhecido pelo hash e não reprocessa;
  - item com a mesma `chave_origem` atualiza só campos não trabalhados;
  - sem `chave_origem`: mesma paciente + mesma data vira "possível duplicidade", sem fusão automática.
- **Conflito:** se a Gabi já registrou resultado no item, a importação **nunca sobrescreve**; vai para revisão.

---

## 7. Marcos automáticos

### Geração (`confirmar_atendimento_realizado(appointment_id, data)`, numa única transação)

1. Valida: paciente vinculada, data exata, não futura, `data_status = 'exata'`, atendimento não anulado.
2. Marca o atendimento como realizado, com `realizado_confirmado_em/por`.
3. Insere `d30 = data + 30 dias`, `d90 = data + 90 dias`, `m6 = (data + interval '6 months')::date`.
   O Postgres já ajusta para o último dia válido do mês: 31/08 → 28/02.
4. Usa `insert … on conflict (appointment_id, kind) do update` **somente** quando o marco ainda está `previsto` e sem evento vinculado.
5. Grava em `audit_logs`. Ou entram os três, ou nenhum.

### Casos especiais

| Situação | Comportamento |
|---|---|
| Reabrir, salvar, reenviar ou importar o mesmo atendimento | `unique(appointment_id, kind)`: nenhum marco duplicado. |
| Novo atendimento da mesma paciente | Novos 3 marcos; os anteriores continuam. |
| Corrigir a data do atendimento | Marcos `previsto` sem evento são recalculados; marcos já trabalhados ficam como estão, com nota "data de referência corrigida em …". |
| Lançamento feito por engano | `anular_atendimento(id, motivo)`: marcos pendentes viram `invalidado`, com motivo; os trabalhados são preservados; tudo registrado no histórico. |
| Registro antigo sem data exata | `data_status = 'pendente_validacao'`: não gera marcos até alguém informar a data. |
| Cadastro, orçamento, pagamento ou consulta só agendada | Não geram marcos. Só a confirmação de **realizado** gera. |

### Contatos repetidos — agrupamento na fila

- A fila monta **um cartão por paciente** com tudo o que vence até hoje, mais o que vence nos próximos **14 dias** em "pode ser tratado junto" (desmarcado).
- Ao registrar um contato, os itens vencidos do cartão vêm pré-selecionados. A Gabi **confirma** quais o contato contemplou e grava um evento com N vínculos em `event_links`.
- Nada é marcado como cumprido por proximidade de datas. Cada marco continua sendo uma linha própria, para rastreabilidade.

---

## 8. O que simplificar ou remover do HTML atual

| Hoje no HTML | Na plataforma |
|---|---|
| Seções Recorrência, Continuidade, Relacionamento, Pós-atendimento, Oportunidades e Faltas como formulários separados | **Uma fila.** O tipo da tarefa classifica; o mesmo evento alimenta todos os resumos. |
| Modal "planejar marcos" (30/90/6m/outro) | **Removido.** Gerado automaticamente pela confirmação de realizado. "Outro prazo" vira tarefa avulsa. |
| Conferência antes do contato (bloco com 7 campos) | **Removida.** O cartão já mostra o último contato e o próximo agendamento conhecido; uma nota opcional no contato basta. |
| Conferência semanal dos atendimentos | **Substituída** pela entrada da gestão com `chave_origem`; a prévia já acusa duplicidade e item sem vínculo. |
| "Nada a registrar" em cada seção, badges de verificação | **Removidos.** O fechamento é derivado dos eventos. |
| Placar, prioridades, follow-ups, aguardando resposta, retornos | **Calculados.** Prioridades sugeridas pela fila (vencidas, aguardando, reclamação). |
| Elegíveis/abordados (manual) | Ficam de fora do MVP. Voltam só se houver fonte; senão, campo manual opcional. |
| Agenda prevista/realizada e caixa | Ficam em **poucos campos manuais**, marcados como "informado manualmente". |
| Backup JSON e `localStorage` | Substituídos por banco + backup do servidor; o JSON vira só fonte de migração. |
| Contemplado em outro contato | Vínculo explícito no momento do contato (§7). |
| Carry-over diário, rascunho por data | **Desnecessários.** A tarefa existe até ser encerrada; não há cópia diária. |

---

## 9. MVP em fases (estimativas de esforço, não verificadas)

| Fase | Entrega | Pronto quando | Esforço |
|---|---|---|---|
| **0. Preparação** | Projeto Supabase de **staging** (dados fictícios) e variáveis por contexto no Netlify; migration 0012 em staging | Deploy de preview do branch usa staging, nunca produção | 0,5 dia |
| **1. Entrada da gestão** | `/entrada`: formulário rápido + colar lote + prévia + confirmação; RPC dos marcos; anulação e correção | Lote reenviado não duplica; atendimento gera exatamente 3 marcos; data errada/anulação testadas | 2–3 dias |
| **2. Fila da Gabi** | `/fila` com 4 abas, cartão por paciente, ações rápidas, eventos e vínculos | Tarefa criada pelo Álvaro aparece no celular da Gabi; contato com 2 vínculos registra 1 evento | 3–4 dias |
| **3. Fechamento automático** | `/fechamento` do dia a partir dos eventos + campos manuais + prévia e cópia para WhatsApp | Fechamento sem nenhuma redigitação; pacientes únicas × contatos × marcos separados | 1–2 dias |
| **4. Migração do HTML** | Importador do backup JSON → staging → revisão → produção | Nada duplicado; vínculos incertos na fila de revisão | 2 dias |
| **5. Indicadores** | 6 indicadores por data de corte (§11) | Mesmo corte reproduz o mesmo resultado depois de novos registros | 2 dias |

Testes em Vitest contra o fake em memória (padrão do projeto) e verificação no navegador antes de cada merge.

---

## 10. Migração, validação e publicação

### Migração do backup JSON do HTML

1. **Pacientes:** cada `pid` do HTML vira `patient_external_ids(source='feedback_html')`.
   - O casamento com as pacientes do STIMMA OS é **sugerido** (código SD igual → forte; nome + telefone → só sugestão) e **confirmado na tela**.
   - Sem vínculo confiável: a paciente entra na fila de vinculação. Nada é fundido automaticamente.
2. **Atendimentos de referência:** criados só a partir de marcos com `refData` exata (`origem = 'migracao_feedback_html'`).
   - Esses atendimentos **não** disparam a geração automática; os marcos existentes são importados como estão (`legacy_id`), sem recriar.
3. **Marcos:** `due_original` = data prevista do HTML. Status, tentativas, dispensas e vínculos viram eventos com `legacy_id` e as datas originais.
   - Respostas e agendamentos sem data ficam marcados "sem data — fora do histórico".
4. **Casos abertos dos fechamentos:** o último dia em que cada `caseId` aparece vira uma tarefa aberta, com a próxima ação e o prazo.
   - Os eventos derivados (contato, resposta, agendamento, atendimento) são importados uma vez, pelo id determinístico.
5. **Ensaio e repetição:** primeiro em staging, com relatório (importados, ignorados por já existirem, pendentes de revisão). Reimportar o mesmo arquivo não muda nada.

### Publicação sem afetar o site público

- O site público (`stimma` / `alvarosia`) **não é tocado**. Tudo acontece no site `stimma-os-gestor`.
- Desenvolvimento em branch; o deploy de preview aponta para o Supabase de staging (variáveis por contexto no Netlify).
  O `main` publica sozinho em `app.larissaandrade.com.br`, então **merge só depois da verificação**.
- Migrations em produção pelo SQL Editor, com consulta de verificação depois de cada escrita (regra do projeto).
- Rotas novas visíveis só para os papéis certos; o HTML continua disponível até a Fase 4 terminar (uso paralelo de 1–2 semanas).

### Segurança

- Acesso por convite.
- RLS no banco: leitura por organização; escrita por Route Handler/RPC que confere o papel (admin = tudo; reception = fila, eventos e encaminhamentos; sem importar lotes nem anular atendimentos).
- Chave service role só em variável do Netlify, nunca `NEXT_PUBLIC_*` nem no repositório.
- `created_by` em todo evento + `audit_logs`.
- Nenhum dado de paciente em página pública ou em URL sem login. Os previews também exigem login e usam dados fictícios.
- Retentativas: `interaction_events.id` é gerado no cliente (enviar duas vezes não duplica); lotes têm hash; atendimentos e tarefas têm `chave_origem` única.

---

## 11. Indicadores essenciais (Fase 5)

Base: **apenas o que foi inserido na plataforma.** Nenhum indicador fala em cobertura da clínica inteira.

| Indicador | Numerador ÷ denominador |
|---|---|
| Tarefas vencidas | Tarefas abertas com prazo < data de corte (posição no corte) |
| Pacientes sem próxima ação | Pacientes com tarefa ou marco aberto e sem próxima ação/prazo (posição) |
| Marcos previstos × contatados | Marcos com `due_original` no período e ≤ corte, contatados ou contemplados até o corte ÷ os mesmos, menos os dispensados/invalidados até o corte |
| Tempo de resposta operacional | Mediana de (1º contato − entrada do item na fila), em dias, para itens que entraram no período |
| Agendamentos obtidos após acompanhamento | `agendamento_obtido` vinculado a marco/tarefa com `occurred_on` ≤ corte. É sequência observada, não causalidade |
| Cobranças acompanhadas e recebimentos confirmados | Tarefas de cobrança com contato no período; recebimentos confirmados com valor e origem. Cobrança enviada ≠ pago; parcela ≠ nova contratação |

**Data de corte:** cada fato conta pela data em que aconteceu (`occurred_on` ≤ corte). Os eventos só
crescem e correções são novos eventos, então registros posteriores não reescrevem períodos já fechados.
Taxa com denominador zero = "não se aplica"; período sem registros = "sem dados".

---

## 12. Custos

| Item | Custo | Situação |
|---|---|---|
| Netlify Pro (equipe) | US$ 20/mês, fixo | **Já pago.** Esta mudança não acrescenta custo previsível. |
| Domínio e subdomínio `app.` | — | Já existe e está ativo. |
| Supabase (produção) | **US$ 0 — plano Free (decidido).** O Pro custaria US$ 25/mês, com backups diários de 7 dias | Sem backup automático do Supabase: compensado pela exportação semanal e pelo dump mensal (§13). |
| Supabase staging | US$ 0 (Free, só dados fictícios) | Pausa por inatividade não importa. |
| PITR (recuperação a qualquer momento) | US$ 100/mês | **Não recomendado agora.** |
| Extensão do Chrome / Claude | Assinatura já existente | Sem custo novo. |

Preços conferidos em supabase.com/pricing e netlify.com/pricing em 2026-10-20.
**Custo incremental estimado: US$ 0 por mês** (com Supabase Free).

---

## 13. Decisões tomadas (2026-10-20)

1. **Supabase no plano Free.** Consequências e mitigação:
   - **Sem backup diário automático.** Para compensar:
     - exportação automática semanal (função agendada no Netlify, que gera um JSON de todas as tabelas da fila e guarda num local privado);
     - botão "Exportar backup" para a gestão;
     - `supabase db dump` manual mensal, guardado fora do Supabase.
   - **Pausa após 1 semana sem uso.** O uso diário evita a pausa. Em férias ou recesso, uma consulta diária leve, agendada, mantém o projeto ativo; se pausar, a reativação é manual no painel e nenhum dado se perde.
   - **Staging:** o Free permite 2 projetos ativos por organização. Se a conta já estiver no limite, os testes usam o banco local do Supabase CLI.
   - **Revisitar** se o volume crescer ou se a perda de até 1 semana de dados entre exportações se mostrar inaceitável (Pro: US$ 25/mês).
2. **Gestão e Gabi** podem confirmar "realizado", com autoria registrada; anular é só da gestão.
3. **A Gabi vê os valores** nas tarefas de cobrança dela.
4. **Janela de agrupamento:** 14 dias.
5. **Endereço:** `app.larissaandrade.com.br`.
6. **HTML aposentado** depois de 2 semanas de uso paralelo, ao final da migração.
7. **Comercial externa e Dra. Larissa** entram depois do MVP.
8. **Prioridade:** a fila da concierge é o foco agora. O STIMMA OS (pipeline, cockpit, sincronização com o Simples Dental, WhatsApp) não avança nesta etapa; vai ser desenvolvido em volta da fila depois.

Escolhas técnicas reversíveis seguem a regra do projeto: registradas em `docs/DECISIONS.md` durante a implementação.
