// Diagnóstico SOMENTE LEITURA (apagar depois). Nenhum insert/update/delete.
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

function contar<T>(rows: T[], f: (r: T) => string) {
  const m: Record<string, number> = {};
  for (const r of rows) m[f(r)] = (m[f(r)] ?? 0) + 1;
  return m;
}

async function main() {
  const { data: perfis } = await s.from("profiles").select("id, full_name, active, organization_id");
  const { data: papeis } = await s.from("user_roles").select("user_id, roles(key)");
  const { data: users } = await s.auth.admin.listUsers({ perPage: 100 });
  console.log("PERFIS");
  for (const p of perfis ?? []) {
    const u = users?.users.find((x) => x.id === p.id);
    const r = (papeis ?? []).filter((x) => x.user_id === p.id).map((x) => JSON.stringify(x.roles));
    console.log(" ", p.id.slice(0, 8), "|", p.full_name, "|", u?.email, "| ativo:", p.active, "| papéis:", r.join(","), "| último login:", u?.last_sign_in_at);
  }
  const { data: tarefas } = await s.from("tasks").select("id, kind, status, origem, assigned_to, patient_id, assunto, due_at, next_action_due, chave_origem, title, payload, created_at, next_action, a_conferir");
  console.log("\nTAREFAS", tarefas?.length);
  console.log(" status:", contar(tarefas ?? [], (t) => t.status));
  console.log(" kind:", contar(tarefas ?? [], (t) => t.kind ?? "null"));
  console.log(" origem:", contar(tarefas ?? [], (t) => t.origem ?? "null"));
  console.log(" assigned:", contar(tarefas ?? [], (t) => (t.assigned_to ?? "ninguém").slice(0, 8)));
  for (const t of tarefas ?? []) console.log("  -", t.status, t.kind, (t.next_action_due ?? t.due_at), (t.assigned_to ?? "—").slice(0, 8), t.origem, "|", t.title, "|", JSON.stringify(t.payload).slice(0, 160));
  const { data: marcos } = await s.from("follow_up_milestones").select("id, kind, status, due_current, due_original, appointment_id, patient_id");
  console.log("\nMARCOS", marcos?.length, contar(marcos ?? [], (m) => m.status), contar(marcos ?? [], (m) => m.kind));
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  console.log(" abertos vencidos/hoje:", (marcos ?? []).filter((m) => ["previsto", "contatado"].includes(m.status) && m.due_current <= hoje).length, "futuros:", (marcos ?? []).filter((m) => ["previsto", "contatado"].includes(m.status) && m.due_current > hoje).length);
  const { data: atend } = await s.from("appointments").select("id, patient_id, data_realizada, data_status, realizado_confirmado_em, anulado_em, chave_origem, status");
  const porAt = contar(marcos ?? [], (m) => m.appointment_id);
  const confirmados = (atend ?? []).filter((a) => a.realizado_confirmado_em && !a.anulado_em);
  console.log("\nATENDIMENTOS", atend?.length, "confirmados:", confirmados.length, "pendentes validação:", (atend ?? []).filter((a) => a.data_status === "pendente_validacao" && !a.anulado_em).length);
  console.log(" confirmados com marcos faltando:", confirmados.filter((a) => (porAt[a.id] ?? 0) < 3).map((a) => `${a.id.slice(0, 8)}:${porAt[a.id] ?? 0}`));
  const mesmaData = contar(confirmados, (a) => `${a.patient_id}|${a.data_realizada}`);
  console.log(" mesma paciente+data com >1 atendimento:", Object.entries(mesmaData).filter(([, n]) => n > 1).length);
  const { data: lotes } = await s.from("import_batches").select("id, status, origem, created_at, payload_hash");
  console.log("\nLOTES", lotes);
  for (const l of lotes ?? []) {
    const { data: itens } = await s.from("import_items").select("row_index, resultado, resolution").eq("batch_id", l.id);
    console.log(" ", l.id.slice(0, 8), "itens:", itens?.length, contar(itens ?? [], (i) => i.resultado));
  }
  const { data: ev } = await s.from("interaction_events").select("id, kind, occurred_on, created_by, recorded_at");
  console.log("\nEVENTOS", ev?.length, contar(ev ?? [], (e) => `${e.kind}|${e.created_by.slice(0, 8)}`));
  const { data: dia } = await s.from("daily_manual_figures").select("day, updated_by, prioridades, secoes");
  console.log("\nDIA", JSON.stringify(dia));
  const { count: np } = await s.from("patients").select("id", { count: "exact", head: true });
  console.log("\nPACIENTES", np);
  const pac: { created_at: string; created_by?: string }[] = [];
  console.log(" criados por dia:", contar(pac ?? [], (p) => `${String(p.created_at).slice(0, 10)}|${String(p.created_by ?? "—").slice(0, 8)}`));
  const { data: aud, error: ea } = await s.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(60); if (ea) console.log(ea.message); console.log(aud?.[0]);
  console.log("\nAUDIT (últimos 40)", contar(aud ?? [], (a) => `${a.action}|${a.actor ?? a.actor_email ?? ""}`));
  console.log(" primeiros/últimos:", aud?.[aud.length - 1]?.created_at, aud?.[0]?.created_at);
}
main().catch((e) => { console.error(e); process.exit(1); });
