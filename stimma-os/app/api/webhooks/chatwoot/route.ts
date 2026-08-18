import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { verifyChatwootSignature } from "@/lib/whatsapp/verify-webhook";
import { extractInboundMessage, type ChatwootMessageWebhook } from "@/lib/whatsapp/webhook-payload";
import { resolvePatientByPhone } from "@/lib/whatsapp/resolve-patient-by-phone";

/**
 * Webhook do Chatwoot — ver docs/WHATSAPP_ARCHITECTURE.md (fluxo completo) e
 * a decisão de 2026-08-18 em docs/DECISIONS.md. Só processa
 * `message_created` de mensagens recebidas (incoming); qualquer outro evento
 * é reconhecido (200) mas ignorado nesta fase — ver ROADMAP.md Fase 9.
 *
 * Segurança: assinatura HMAC obrigatória (nunca confiar em payload não
 * assinado, docs/SECURITY.md). CHATWOOT_WEBHOOK_SECRET ausente = recusa a
 * requisição, nunca processa "por segurança relaxada".
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CHATWOOT_WEBHOOK_SECRET não configurado" }, { status: 500 });
  }

  const valid = verifyChatwootSignature({
    rawBody,
    timestamp: request.headers.get("x-chatwoot-timestamp") ?? "",
    signatureHeader: request.headers.get("x-chatwoot-signature"),
    secret,
  });

  if (!valid) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let payload: ChatwootMessageWebhook;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const inbound = extractInboundMessage(payload);
  if (!inbound) {
    return NextResponse.json({ ignored: true });
  }

  const supabase = createSupabaseServiceClient();

  const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "organização não encontrada" }, { status: 500 });
  }

  if (!inbound.phone) {
    await supabase.from("audit_logs").insert({
      organization_id: org.id,
      actor: "chatwoot-webhook",
      actor_type: "system",
      action: "whatsapp_inbound_requires_review",
      target: "conversations",
      source: "chatwoot_webhook",
      reason: "Telefone do remetente não encontrado no payload — ver lib/whatsapp/webhook-payload.ts.",
      after: { conversationExternalId: inbound.externalConversationId },
      status: "requires_review",
    });
    return NextResponse.json({ requiresReview: true });
  }

  const patientResult = await resolvePatientByPhone(supabase, org.id, inbound.phone);

  if (patientResult.action === "requires_review") {
    await supabase.from("audit_logs").insert({
      organization_id: org.id,
      actor: "chatwoot-webhook",
      actor_type: "system",
      action: "whatsapp_inbound_requires_review",
      target: "patients",
      source: "chatwoot_webhook",
      reason: patientResult.reason,
      after: { phone: inbound.phone },
      status: "requires_review",
    });
    return NextResponse.json({ requiresReview: true });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("chatwoot_conversation_id", inbound.externalConversationId)
    .maybeSingle();

  let conversationId = conversation?.id as string | undefined;
  if (!conversationId) {
    const { data: created } = await supabase
      .from("conversations")
      .insert({
        organization_id: org.id,
        patient_id: patientResult.patientId,
        channel: "whatsapp",
        external_thread_id: inbound.externalConversationId,
        chatwoot_conversation_id: inbound.externalConversationId,
        phone: inbound.phone,
      })
      .select("id")
      .single();
    conversationId = created?.id;
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "inbound",
    body: inbound.body,
    external_message_id: String(payload.id),
    status: "delivered",
    created_at: inbound.createdAt,
  });

  await supabase
    .from("patients")
    .update({ last_interaction_at: inbound.createdAt })
    .eq("id", patientResult.patientId);

  return NextResponse.json({ ok: true, patientId: patientResult.patientId, conversationId });
}
