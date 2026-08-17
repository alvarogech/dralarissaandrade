# Integrações — STIMMA OS

## Ordem de preferência (aplicada, não apenas declarada)

1. API oficial — **não existe** API pública/documentada do Simples Dental (confirmado por
   discovery, ver `SIMPLES_DENTAL_MAP.md`). Reavaliar periodicamente.
2. MCP/Connector — nenhum conector dedicado ao Simples Dental disponível no ambiente.
3. Banco de dados/webhook — não controlamos o lado do Simples Dental; não aplicável.
4. **Claude in Chrome** — aplicável e confirmado: sessão autenticada já disponível. Usado para
   discovery e será a base da Fase 4 (leitura).
5. **Claude Cowork** — planejado para rotinas recorrentes (ver `COWORK_RUNBOOK.md`); depende de
   disponibilidade no ambiente do usuário no momento da execução.
6. Importação estruturada — o Simples Dental expõe `Exportar` em Pacientes, Financeiro e
   Indicadores. Preferir a exportação sempre que o dado necessário estiver nela — é mais estável
   que ler a tela.
7. Automação de interface — usada apenas para o que não está em nenhum export (ex. status de
   agenda em tempo real, Kanban de Vendas).

## Sync Engine — implementação

Vive em `stimma-os/lib/sync/`. Recebe uma lista de `NormalizedAppointment` (já extraídos da
tela por automação de navegador — a extração em si não é código, é agêntica) e faz matching de
paciente + upsert idempotente de compromisso, sempre deterministicamente (ver
`lib/sync/patient-matching.ts`, `lib/sync/fingerprint.ts`, `lib/sync/run-sync.ts`). Exposto via
`POST /api/sync/agenda` (protegido por `SYNC_API_SECRET`). Testado com um fake de Supabase em
memória (`lib/sync/test-fake-supabase.ts`) — nunca com dado real de paciente em teste.

## Simples Dental — modelo de sincronização

- **Fase 4 (leitura)**: `SyncEngine` roda como automação de navegador orientada a texto/
  accessibility-tree (nunca coordenada fixa — ver princípio em `SIMPLES_DENTAL_MAP.md`),
  disparada por rotina do Cowork ou por job manual, alimentando `external_records` e emitindo
  eventos padronizados (`appointment.*`, `payment.*`, `receivable.*` etc.) no Event Store.
- **Matching de paciente**: nunca só por nome. Ordem: `external_id` do Simples Dental (mais
  confiável, já visto na ficha) → telefone normalizado → nome + data de nascimento como
  desempate. Ambíguo → `patient_external_ids.requires_review = true`, nunca cria duplicata.
- **Idempotência**: toda leitura gera `source_fingerprint` (hash do conteúdo relevante); se
  igual ao último `last_synced_at`, não gera novo evento nem nova linha.
- **Mudança de estrutura da tela**: se os elementos esperados (por texto/role) não forem
  encontrados, a automação para essa entidade específica e emite
  `automation.requires_review` — nunca assume e executa uma leitura potencialmente errada.

## Fase 5 (escrita) — quando começar

Só depois da Fase 4 estar confiável (baixa taxa de `requires_review`, eventos validados por
algumas semanas de uso real). Fluxo obrigatório:
`preparar → validação → aprovação (nível C) → Chrome/Cowork executa → Claude confere →
STIMMA OS registra sucesso` — nunca `EXECUTE → ASSUME SUCCESS`. Primeira ação candidata:
lançamento de pagamento já identificado e conciliado, sempre com aprovação humana de nível C.

## Outras integrações mencionadas no briefing

- **WhatsApp**: o Simples Dental já tem lembrete via "WhatsApp Web" por agendamento e toggles de
  consentimento por paciente. STIMMA OS não reimplementa envio de WhatsApp no MVP — prepara a
  mensagem e a ação fica com a pessoa responsável (Nível C), respeitando o consentimento nativo.
- **E-mail/relatórios**: fora do escopo do MVP; entra quando `STIMMA BRIEF`/`CLOSE`/`WEEKLY`
  estiverem estáveis internamente.
