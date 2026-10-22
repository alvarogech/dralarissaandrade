import { describe, expect, it } from "vitest";
import { montarFila, type ItemFila } from "./agrupamento";
import { montarFechamento, nomeCurto, proximoDiaUtil, refDoItem, textoWhatsapp } from "./fechamento";
import type { EventoRow } from "./store";

const ev = (kind: EventoRow["kind"], extra: Partial<EventoRow> = {}): EventoRow => ({
  id: Math.random().toString(), patientId: "p1", kind, occurredOn: "2026-10-20", channel: null, notes: null, amount: null,
  amountOrigin: null, scheduledFor: null, createdBy: "u", alvos: [{ tarefaId: "aaaaaaaa-0000-4000-8000-000000000001" }], ...extra,
});
const item = (id: string, extra: Partial<ItemFila>): ItemFila => ({
  id: `tarefa:${id}`, alvo: { tipo: "tarefa", id }, pacienteId: "p2", pacienteNome: "Beatriz Fictícia", tipo: "marco", titulo: "x", status: "aberta", due: "2026-10-20", ...extra,
});

describe("fechamento", () => {
  it("nome abreviado, referência curta e próximo dia útil", () => {
    expect(nomeCurto("Mariana Souza Exemplo")).toBe("Mariana E.");
    expect(nomeCurto("Joana")).toBe("Joana");
    expect(refDoItem({ tipo: "tarefa", id: "1a2b3c4d-0000-4000-8000-000000000000" })).toBe("T-1a2b3c");
    expect(proximoDiaUtil("2026-10-23")).toBe("2026-10-26"); // sexta → segunda
  });

  it("lista ações, aguardando, recebimentos e prioridades com referências", () => {
    const itens = [
      item("aaaaaaaa-0000-4000-8000-000000000001", { pacienteId: "p1", pacienteNome: "Mariana Exemplo", tipo: "cobranca", titulo: "Cobrar parcela 3/6", status: "concluida", concluidaEm: "2026-10-20", valor: 450 }),
      item("bbbbbbbb-0000-4000-8000-000000000002", { titulo: "Recuperar falta", status: "aguardando", due: "2026-10-19" }),
      item("cccccccc-0000-4000-8000-000000000003", { pacienteId: "p3", pacienteNome: "Carla Demo", tipo: "continuidade", titulo: "Continuar clareamento", due: "2026-10-18" }),
      item("dddddddd-0000-4000-8000-000000000004", { pacienteId: "p4", pacienteNome: "Dora Teste", tipo: "conferir_atendimento", titulo: "Conferir", alvo: { tipo: "atendimento", id: "dddddddd-0000-4000-8000-000000000004" } }),
    ];
    const fila = montarFila(itens, "2026-10-20");
    const f = montarFechamento("2026-10-20", [
      ev("contato", { channel: "whatsapp", notes: "sem resposta" }),
      ev("recebimento_confirmado", { amount: 450, amountOrigin: "parcela" }),
    ], fila, itens, { p1: "Mariana Exemplo" }, { agendaPrevista: 8, agendaRealizada: 7, caixaPrevisto: null, caixaRecebido: 950, caixaSituacao: null });
    expect(f).toMatchObject({ pendentesHoje: 1, atrasados: 1, aConferir: 1 });
    const t = textoWhatsapp(f);
    expect(t).toContain("*Fechamento — 20/10/2026 (terça)*");
    expect(t).toContain("8 previstos · 7 realizados");
    expect(t).toContain("Mariana E. — Cobrar parcela 3/6: contato por whatsapp: sem resposta [T-aaaaaa]");
    expect(t).toMatch(/Recebimentos confirmados: 1 — R\$\s?450,00/);
    expect(t).toContain("Beatriz F. — Recuperar falta [T-bbbbbb]");
    expect(t).toContain("*Prioridades para 21/10/2026 (quarta)*");
    expect(t).toContain("Carla D. — Continuar clareamento (desde 18/10/2026) [T-cccccc]");
    expect(t).not.toContain("Mariana Exemplo");
  });
});
