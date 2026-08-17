import { describe, expect, it } from "vitest";
import { runReceivablesSync } from "./sync-receivables";
import { createFakeSupabase } from "./test-fake-supabase";
import type { NormalizedReceivable } from "./types";

const ORG_ID = "org-1";

function makeItem(overrides: Partial<NormalizedReceivable> = {}): NormalizedReceivable {
  return {
    source: "simples_dental_browser",
    patient: { fullName: "Gilcélia Santana Mota", phone: "62998682311" },
    amount: 740.25,
    dueAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("runReceivablesSync", () => {
  it("cria paciente e recebível na primeira execução", async () => {
    const supabase = createFakeSupabase();
    const summary = await runReceivablesSync(supabase as any, ORG_ID, [makeItem()]);

    expect(summary.created).toBe(1);
    expect(supabase._tables.get("patients")).toHaveLength(1);
    expect(supabase._tables.get("receivables")).toHaveLength(1);
  });

  it("não duplica o mesmo recebível (mesmo paciente + valor + vencimento) numa segunda execução", async () => {
    const supabase = createFakeSupabase();
    await runReceivablesSync(supabase as any, ORG_ID, [makeItem()]);
    const second = await runReceivablesSync(supabase as any, ORG_ID, [makeItem()]);

    expect(second.skippedDuplicate).toBe(1);
    expect(second.created).toBe(0);
    expect(supabase._tables.get("receivables")).toHaveLength(1);
  });

  it("cria um segundo recebível para o mesmo paciente quando o valor é diferente", async () => {
    const supabase = createFakeSupabase();
    await runReceivablesSync(supabase as any, ORG_ID, [makeItem()]);
    const second = await runReceivablesSync(supabase as any, ORG_ID, [makeItem({ amount: 300 })]);

    expect(second.created).toBe(1);
    expect(supabase._tables.get("receivables")).toHaveLength(2);
    expect(supabase._tables.get("patients")).toHaveLength(1); // mesmo paciente, achou por telefone
  });

  it("pede revisão quando só o nome bate, sem telefone confirmando", async () => {
    const supabase = createFakeSupabase();
    await runReceivablesSync(supabase as any, ORG_ID, [
      makeItem({ patient: { fullName: "Carla Souza" } }),
    ]);
    const second = await runReceivablesSync(supabase as any, ORG_ID, [
      makeItem({ patient: { fullName: "Carla Souza" }, amount: 999 }),
    ]);

    expect(second.requiresReview).toBe(1);
    expect(supabase._tables.get("patients")).toHaveLength(1);
  });
});
