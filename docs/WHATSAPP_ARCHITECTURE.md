# WhatsApp Architecture — STIMMA OS CRM

## Estado real hoje (2026-08-17)

**Não há número de WhatsApp Business API, conta Meta Business verificada ou token de produção
configurado.** `INTEGRATIONS.md` (versão anterior) documentava explicitamente que o STIMMA OS
"não reimplementa envio de WhatsApp no MVP" — isso muda agora por instrução direta do usuário,
mas a ausência de credencial é um fato, não uma decisão de arquitetura. O que existe nesta rodada
é a **interface abstrata + um provider mock** para desenvolver e testar o resto do CRM (inbox,
automações, IA) sem depender da credencial. Trocar o mock pelo provider real quando a conta
existir é uma troca de implementação, não uma reescrita — ver `DECISIONS.md`.

## Por que uma camada abstrata (não acoplar a um fornecedor)

A API oficial do WhatsApp Business exige aprovação Meta, número dedicado e (normalmente) um BSP
(Business Solution Provider — ex. Twilio, 360dialog, Gupshup, Zenvia). Qual BSP a clínica vai
usar é uma decisão de custo/negócio do usuário, não técnica. A interface abaixo garante que essa
escolha não trava o desenvolvimento do CRM.

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

## Webhook de mensagem recebida (fluxo, seção 76 do prompt original)

```text
POST /api/whatsapp/webhook
  1. validar assinatura do provider (nunca confiar em payload não assinado)
  2. identificar numero (telefone normalizado)
  3. localizar patients via telefone; se nao existir, criar patients + patient_journeys(stage='new_lead')
  4. upsert conversations (por phone), inserir em messages (direction='inbound')
  5. atualizar patients.last_interaction_at / patient_journeys
  6. (assincrono) IA analisa conteudo -> atualiza interaction_summaries (nunca sobrescreve a
     motivation_quote original, so adiciona/atualiza a interpretacao)
  7. motor de automacao avalia trigger_event correspondente (ex. lead.created)
  8. se acao recomendada existir, cria Task ou Alert -- nunca responde sozinho em nivel 2/3
```

Rota real (`app/api/whatsapp/webhook/route.ts`) ainda não implementada nesta rodada — a
prioridade foi fechar o contrato de dados (`conversations`/`messages`/`interaction_summaries`,
já na migration `0009`) antes de escrever a rota, para não ter que migrar schema duas vezes.

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
