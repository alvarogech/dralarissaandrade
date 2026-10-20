import { describe, expect, it } from "vitest";
import { montarFila } from "./agrupamento";
import { montarFechamento, nomeCurto, textoWhatsapp } from "./fechamento";
import type { EventoRow } from "./store";

const ev = (kind: EventoRow["kind"], extra: Partial<EventoRow> = {}): EventoRow => ({
  id: Math.random().toString(), patientId: "p1", kind, occurredOn: "2026-10-20", channel: null, notes: null, amount: null,
  amountOrigin: null, scheduledFor: null, createdBy: "u", alvos: [{ tarefaId: "t" }], ...extra,
});

describe("fechamento", () => {
  it("nome abreviado", () => {
    expect(nomeCurto("Mariana Souza Exemplo")).toBe("Mariana E.");
    expect(nomeCurto("Joana")).toBe("Joana");
  });

  it("conta eventos do dia e pendências da fila", () => {
    const fila = montarFila([
      { id: "a", pacienteId: "p2", pacienteNome: "B", tipo: "marco", titulo: "x", status: "aberta", due: "2026-10-18" },
      { id: "b", pacienteId: "p3", pacienteNome: "C", tipo: "cobranca", titulo: "y", status: "aguardando", due: "2026-10-19" },
      { id: "c", pacienteId: "p4", pacienteNome: "D", tipo: "conferir_atendimento", titulo: "z", status: "aberta", due: "2026-10-20" },
    ], "2026-10-20");
    const f = montarFechamento("2026-10-20", [
      ev("contato", { alvos: [{ marcoId: "m" }] }), ev("contato"),
      ev("agendamento_obtido", { scheduledFor: "2026-10-27" }),
      ev("recebimento_confirmado", { amount: 450, amountOrigin: "parcela" }),
    ], fila, { p1: "Mariana Exemplo" }, { agendaPrevista: 8, agendaRealizada: 7, caixaPrevisto: null, caixaRecebido: 950, caixaSituacao: null });
    expect(f).toMatchObject({ contatos: 2, contatosMarcos: 1, pendentesHoje: 1, atrasados: 1, aguardando: 1, aConferir: 1 });
    const t = textoWhatsapp(f);
    expect(t).toContain("*Fechamento — 20/10/2026 (terça)*");
    expect(t).toContain("8 previstos · 7 realizados");
    expect(t).toContain("Mariana E.: consulta em 27/10/2026");
    expect(t).toMatch(/Recebimentos confirmados: 1 — R\$\s?450,00/);
    expect(t).toContain("(1 atrasadas)");
    expect(t).not.toContain("Mariana Exemplo");
  });
});
