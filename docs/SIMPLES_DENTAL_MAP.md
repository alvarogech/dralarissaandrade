# Mapa real do Simples Dental — Clínica Stimma (Dra. Larissa Andrade)

> Levantamento feito por discovery **somente leitura**, via Chrome já autenticado (sessão de
> Larissa), em 2026-08-13. Nenhum dado foi criado, editado ou excluído durante a investigação.
> Nenhum PII real de paciente (nome completo, CPF, telefone) foi copiado para este documento —
> apenas estrutura de telas, campos e status.
>
> Não existe API pública documentada do Simples Dental. Toda integração futura dependerá de
> automação de navegador (Claude in Chrome / Cowork) até que isso mude — ver
> [`INTEGRATIONS.md`](./INTEGRATIONS.md).

## Identidade da clínica no sistema

- Nome da clínica cadastrado: **Clínica Stimma** (confirma o nome "STIMMA" já é a marca real
  da operação, não uma invenção do projeto).
- Nome usado nas comunicações: "Dra. Larissa Andrade".
- Responsável legal: Larissa Soares de Andrade Ferreira — perfil "Dentista administrador(a)".
- URL base do sistema: `https://app.simplesdental.com/simples/...` (SPA, requer sessão
  autenticada; sem indício de API REST/pública documentada nas telas navegadas).

## Navegação principal (sidebar)

`Inteligência · Pacientes · Agenda · Vendas · Financeiro · Simples Pay · Controle de prótese ·
Marketing · Estoque · Loja` — e, no rodapé, `Ajustes · Como funciona · Simples IA`.

Módulos **explorados em profundidade**: Inteligência, Pacientes, Agenda, Vendas, Financeiro,
Ajustes (Clínica/Equipe). Módulos **vistos apenas na navegação, não aprofundados** (baixa
prioridade para o MVP do STIMMA OS): Simples Pay (gateway de pagamento próprio), Controle de
prótese, Marketing, Estoque, Loja.

## Agenda

- Visualização semanal (`/simples/agenda`), filtro por profissional, navegação por dia/semana/mês.
- Cada compromisso tem: paciente (nome + telefone + avatar), data/hora início-fim, **status**
  (observado: `Confirmada`, `Finalizada`; a UI sugere também cancelamento/falta, não confirmados
  visualmente nesta sessão), profissional responsável, alternância "Lembrar por WhatsApp Web",
  e uma tag de **"Motivo da consulta"** (ex.: "Primeira consulta") — funciona como o "tipo de
  atendimento" citado no briefing.
- Compromissos concluídos aparecem com um botão de cópia/edição/exclusão no popover — ou seja,
  a agenda permite edição inline; qualquer automação de escrita futura precisa navegar esse
  popover, não uma página separada.
- Não foi identificado, nesta rodada, um endpoint de "horários livres" dedicado — a leitura de
  gaps precisa ser inferida varrendo a grade (dia inteiro sem blocos == livre).

## Pacientes

- Lista (`/simples/pacientes`): nome, "posição" (campo aparentemente pouco preenchido), idade,
  CPF, celular, ícone de WhatsApp direto, editar, abrir ficha. Busca por nome/CPF/celular.
  Exportável.
- Ficha do paciente (`/simples/pacientes/{id}/...`) tem abas: **Sobre, Orçamentos, Tratamentos,
  Anamnese, Imagens, Documentos, Débitos**.
  - **Sobre**: dados pessoais (código interno, número, CPF, nascimento, idade, sexo, celular),
    plano (ex. "Particular"), painel de **Comunicação** com três toggles de consentimento:
    lembrete automático de consulta, mensagens de serviço prestado, campanha de marketing —
    isso já é um registro de opt-in/opt-out por paciente que o STIMMA OS deve respeitar e não
    duplicar.
  - Existe um app de paciente nativo, **"Meu Doutor"**, com convite via código — um portal do
    paciente já pronto (relevante: não precisamos construir um portal de paciente do zero).
  - **Orçamentos**: quando vazio, a própria tela do Simples Dental explica o fluxo nativo —
    *"Orçamentos em aberto viram automaticamente oportunidades no menu Vendas"* e *"Acompanhe os
    orçamentos em aberto e aprovados no menu Inteligência"*. Ou seja, **o Simples Dental já tem
    um motor de oportunidades embutido** ligado a orçamentos.

## Vendas (= Funil de oportunidades nativo)

- `/simples/vendas`: quadro Kanban com colunas **Em aberto → Em andamento → Concluído /
  Perdida**, mais suporte a **criar novas etapas customizadas**.
- Cada cartão = uma oportunidade gerada a partir de um orçamento/consulta (ex. "Primeira
  Consulta"), com indicador de dias em aberto.
- Filtro por tipo (ex. "Primeiras consultas") e por período.
- **Implicação de arquitetura**: o `OpportunityEngine` do STIMMA OS não deve recriar este
  Kanban. Deve **ler** as oportunidades nativas (via sync/automação) e **complementar** com as
  oportunidades que o Simples Dental não modela nativamente (paciente sem próxima etapa,
  reativação, horário vago) — ver [`BUSINESS_RULES.md`](./BUSINESS_RULES.md).

## Financeiro

- Sub-telas: **Fluxo de Caixa, Fechamento de Caixa, Transações, Nota Fiscal, Comissões,
  Carteira Digital**.
- Fluxo de Caixa: totais do dia (Receitas / Despesas / Saldo, cada um com "a receber/a pagar" e
  "total previsto"), lista de lançamentos com data, nome (vinculado a paciente), forma de
  lançamento (ex. "Boleto Integrado"), valor, status (ícone de confirmado), menu de ações.
  Lançamentos de taxa aparecem separados e vinculados ao lançamento principal.
- Existe integração de cobrança "Boleto Integrado" e um módulo próprio de pagamento (**Simples
  Pay**) — pagamentos podem já estar conciliados automaticamente quando processados por ele.

## Inteligência (dashboard nativo)

Esse módulo é o mais relevante para não duplicarmos esforço — o Simples Dental **já calcula**
boa parte dos indicadores que o STIMMA OS pretende gerar:

- **Indicadores** (`/simples/dashboard/indicadores`): débitos em atraso (R$), orçamentos em
  aberto e reprovados (R$), aniversariantes nos próximos 30 dias, análise de receitas
  (por profissional/plano/tratamento/especialidade, filtrável por período, exportável),
  resumo financeiro do mês (receitas/despesas/saldo, previsto x realizado), painel de
  Pacientes (total cadastrados, aniversariantes, atendidos nos últimos 6 meses, **pacientes
  com débito em atraso**, novos pacientes no mês, e — crucial — **"pacientes com tratamento em
  aberto sem consulta"**, contador direto que já é quase a Oportunidade 4 do briefing), Metas
  de Vendas (meta mensal editável, necessário vender/dia, gráfico realizado x objetivo),
  Orçamentos (aprovados por período, quantidade/valor).
- **Relatórios** (`/simples/dashboard/relatorios`): catálogo de relatórios agrupados por
  categoria — Pacientes (Análise de crédito, Aniversariantes, Pacientes indicados),
  Agendamentos, Vendas, Financeiro, Marketing (submenus existem; conteúdo detalhado não
  aprofundado nesta rodada).
- **Ortodontia** e **Tarefas**: abas existentes, não abertas nesta rodada (baixa prioridade —
  Dra. Larissa atua em HOF/estética, não ortodontia).

## Ajustes (equipe e permissões)

- `/simples/ajustes/clinica`: dados cadastrais, horário de funcionamento, fuso, config fiscal,
  localização.
- `/simples/ajustes/equipe`: lista de todos os profissionais/usuários com e-mail, **papel**
  (`Dentista`, `Secretário(a)`, `Gerente`, `Dentista administrador(a)`), e um contador de
  **permissões granulares no formato "X de 89 permissões"** — confirma que o Simples Dental já
  tem um sistema RBAC fino nativo. O STIMMA OS não precisa replicar essas 89 permissões; precisa
  de um RBAC próprio e mais simples, orientado às ações do STIMMA OS (ver
  [`DATABASE.md`](./DATABASE.md)), mantendo o Simples Dental como fonte de verdade para
  permissões *dentro* dele.
- Convites pendentes/expirados também aparecem aqui — sinal de que a equipe já é gerenciada
  ativamente dentro do Simples Dental.
- Outras abas do menu Ajustes vistas mas não abertas: Nota Fiscal, Planos, Anamnese, Contrato,
  Categorias, Contas financeiras, Cadeiras, **Copiloto** (nome sugere um assistente de IA
  nativo), Comunicação, Taxas maquininha.

## Conclusões para a arquitetura do STIMMA OS

1. **Não reconstruir**: agenda, funil de vendas (Kanban), indicadores financeiros básicos,
   metas de vendas e o contador de "tratamento em aberto sem consulta" já existem. O STIMMA OS
   deve **ler e cruzar** esses dados, não recriá-los.
2. **Onde o STIMMA OS agrega valor real**: cruzar agenda + orçamento + débito + próxima etapa
   por paciente (o Simples Dental mostra os números soltos, não a jornada consolidada por
   paciente com "próximo passo" explícito); histórico de eventos e auditoria fora do Simples
   Dental; alertas proativos e priorização (o Simples Dental é passivo — mostra números, não diz
   "faça isso agora"); orquestração de tarefas por pessoa da equipe; IA conversacional sobre os
   dados cruzados.
3. **Sem API pública confirmada** → a Fase 4 (leitura) do roadmap depende de automação de
   navegador (Claude in Chrome / Cowork) sobre estas telas, ou de exportações estruturadas
   (CSV) onde disponíveis (`EXPORTAR` aparece em Pacientes, Financeiro, Indicadores, Relatórios).
   Exportação estruturada é preferível à automação de tela sempre que suficiente — é mais
   estável a mudanças de layout.
4. **Seletores não são estáveis o bastante para documentar aqui**: a SPA usa classes utilitárias
   sem semântica (confirmado ao inspecionar). Qualquer automação de leitura deve se apoiar em
   accessibility tree / texto visível (como fizemos nesta investigação com `find`/`read_page`),
   nunca em coordenadas fixas, e deve marcar `automation.requires_review` sempre que a
   estrutura esperada não for encontrada.
5. **Consentimento de comunicação já existe por paciente** (toggles em Pacientes → Sobre) — o
   `NotificationPolicyEngine` do STIMMA OS deve ler esse estado antes de qualquer envio, não
   assumir opt-in.
