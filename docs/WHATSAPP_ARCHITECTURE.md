# WhatsApp Architecture — STIMMA OS CRM

## Decisão: Chatwoot como backend concreto do WhatsApp (2026-08-18)

Avaliado a pedido do usuário. **Recomendação: sim, usar Chatwoot** — self-hosted, atrás da
mesma interface `WhatsAppProvider` já desenhada (continua não sendo um acoplamento cego). Ver o
racional completo e os trade-offs em `DECISIONS.md` (2026-08-18). Resumo:

- Chatwoot é open source, licença MIT, self-hostable (Docker — Rails + Postgres + Redis +
  Sidekiq), e integra nativamente com WhatsApp Cloud API / 360dialog / Twilio — resolve a parte
  mais cara de construir do zero (aprovação Meta continua sendo necessária de qualquer forma,
  mas o tratamento de mensagem, status de entrega, mídia e templates fica por conta dele).
- Webhooks assinados via HMAC-SHA256 (`X-Chatwoot-Signature` = `sha256=` + HMAC do
  `{timestamp}.{corpo bruto}`, mais `X-Chatwoot-Timestamp`) — mesmo princípio de "nunca confiar
  em payload não assinado" já exigido em `SECURITY.md`.
- **Gabi continua nunca saindo do STIMMA OS.** Chatwoot roda "headless": o STIMMA OS chama a
  Application API do Chatwoot para enviar mensagens e recebe os webhooks dele para popular
  `conversations`/`messages` — a interface de Chatwoot em si nunca é exposta à equipe (isso
  preserva a exigência do prompt mestre §10 de nunca alternar entre telas).
- **Em aberto, não decidido aqui**: onde hospedar a instância Chatwoot (VPS própria, região
  Brasil por preferência de LGPD, custo mensal) — isso é uma decisão de infraestrutura/custo do
  usuário, não uma decisão técnica reversível de código. Enquanto isso não existir, o
  `MockWhatsAppProvider` continua sendo o padrão (`WHATSAPP_PROVIDER=mock`).

## Por que uma camada abstrata (não acoplar a um fornecedor, nem ao próprio Chatwoot)

A API oficial do WhatsApp Business exige aprovação Meta, número dedicado e (normalmente) um BSP.
Chatwoot resolve boa parte disso, mas mesmo assim o `WhatsAppProvider` continua sendo a única
porta de entrada usada pelo resto do código — se um dia fizer sentido trocar Chatwoot por outra
coisa (ou usar a API oficial diretamente), é uma nova implementação da mesma interface, não uma
reescrita do CRM.

## Interface `WhatsAppProvider`

```typescript
// stimma-os/lib/whatsapp/provider.ts
export interface WhatsAppProvider {
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<SendResult>;
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<SendResult>;
  fetchMessages(conversationExternalId: string, since?: Date): Promise<InboundMessage[]>;
  getConversation(phone: string): Promise<ConversationRef | null>;
  getStatus(externalMessageId: string): Promise<MessageStatus>;
  markAsRead(externalMessageId: string): Promise<void>;
}

export interface SendResult {
  externalMessageId: string;
  status: "sent" | "failed";
  error?: string;
}
```

Toda implementação (`MockWhatsAppProvider`, futuro `TwilioWhatsAppProvider` etc.) grava
`external_message_id`, `status`, `entregue/lido/erro`, `timestamp` em `messages` (ver
`DATABASE_SCHEMA.md`) — nunca inventa um `sent` sem confirmação do provider (mesmo princípio
EXECUTE → VERIFY → COMMIT de `SECURITY.md`).

## `MockWhatsAppProvider` (o que roda hoje)

Implementação em memória/log — `sendText`/`sendTemplate`/`sendMedia` gravam a mensagem em
`messages` com `status = 'sent'` mas **nunca fazem uma chamada HTTP real**, e emitem um aviso
claro nos logs (`[MOCK] mensagem não enviada de verdade — sem provider configurado`). Isso
permite testar Inbox, automações e Modo FUP de ponta a ponta sem risco de mandar mensagem real
para uma paciente de verdade. Seleção de provider por variável de ambiente
(`WHATSAPP_PROVIDER=mock|<nome-do-bsp-real>`), mesmo padrão de `NEXT_PUBLIC_SUPABASE_URL` ausente
→ modo demonstração já usado no cockpit.

## `ChatwootProvider` (implementação concreta, atrás do `WhatsAppProvider`)

`stimma-os/lib/whatsapp/chatwoot-provider.ts`. Endpoints da Application API do Chatwoot usados
(confirmados na documentação oficial, `developers.chatwoot.com`, não inventados):

```text
GET  /api/v1/accounts/{account_id}/contacts/search?q={telefone}   — localizar contato por telefone
POST /api/v1/accounts/{account_id}/contacts                       — criar contato (inbox_id, phone_number)
GET  /api/v1/accounts/{account_id}/contacts/{id}/conversations    — conversas do contato
POST /api/v1/accounts/{account_id}/conversations                  — criar conversa (source_id, inbox_id, contact_id)
POST /api/v1/accounts/{account_id}/conversations/{id}/messages    — enviar mensagem (content, message_type)
GET  /api/v1/accounts/{account_id}/conversations/{id}/messages    — listar mensagens (fetchMessages)
```

Autenticação: header `api_access_token`. `sendText`/`sendTemplate` resolvem contato → conversa
(criando o que faltar) → postam a mensagem; `template_params` é usado para envio de template
aprovado pelo WhatsApp. `sendMedia` e `markAsRead` **não têm endpoint de Application API
confirmado na documentação nesta rodada** — implementados lançando um erro explícito
("não implementado — ver docs/WHATSAPP_ARCHITECTURE.md") em vez de fingir que funcionam; entram
quando confirmados. `getStatus` lê o campo `status` da mensagem via `fetchMessages` (Chatwoot não
expõe um endpoint dedicado de status por mensagem na Application API).

## Webhook de mensagem recebida (fluxo, seção 76 do prompt original)

```text
POST /api/webhooks/chatwoot
  1. validar assinatura HMAC-SHA256 (X-Chatwoot-Signature / X-Chatwoot-Timestamp) — nunca confiar
     em payload nao assinado
  2. tratar apenas event=message_created com message_type=incoming (mensagens da paciente)
  3. identificar numero (telefone normalizado a partir de conversation.contact_inbox / sender)
  4. localizar patients via telefone; se nao existir, criar patients + patient_journeys(stage='new_lead')
     via lib/pipeline/change-stage.ts (nunca um update solto)
  5. upsert conversations (por chatwoot_conversation_id), inserir em messages (direction='inbound')
  6. atualizar patients.last_interaction_at
  7. (assincrono, fase futura) IA analisa conteudo -> atualiza interaction_summaries
  8. (fase futura) motor de automacao avalia trigger_event correspondente (ex. lead.created)
```

Implementado nesta rodada: verificação de assinatura, passos 2–6 (`app/api/webhooks/chatwoot/route.ts`).
Passos 7–8 (IA e motor de automação) ainda não existem — ver `ROADMAP.md` Fases 10 e 12.

## Inbox (layout, seção 10 do prompt original)

3 colunas: lista de `conversations` (ordenada por última mensagem) · thread de `messages` da
conversa selecionada · resumo (`interaction_summaries` + dados de `patient_journeys` +
`treatment_plans` mais recente + `alerts` abertos daquela paciente). Implementação de UI entra na
Fase 2 do roadmap, depois do webhook real existir — uma Inbox sem mensagens reais chegando não
teria como ser testada de verdade (ver Definition of Done em `PROJECT_SPEC.md`: interface
testada no navegador com dado real, não só "compilou").

## Consentimento

Antes de qualquer envio (mesmo nível 1), checar consentimento — hoje a única fonte de
consentimento real é o toggle nativo do Simples Dental (`SIMPLES_DENTAL_MAP.md`); quando o
paciente nasce direto no CRM via WhatsApp inbound (nunca existiu no Simples Dental), o
consentimento é implícito pelo opt-in de ter iniciado a conversa — nunca assumido para outbound
frio.
