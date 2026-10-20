import { describe, expect, it } from "vitest";
import { montarFila, type ItemFila } from "./agrupamento";

const HOJE = "2026-10-20";
const item = (id: string, pacienteId: string, due: string, extra: Partial<ItemFila> = {}): ItemFila => ({
  id, pacienteId, pacienteNome: `Paciente ${pacienteId}`, tipo: "marco", titulo: id, status: "aberta", due, ...extra,
});

describe("montarFila", () => {
  it("separa hoje, aguardando, próximas e concluídas do dia", () => {
    const f = montarFila([
      item("a", "p1", "2026-10-20"),
      item("b", "p2", "2026-11-30"),
      item("c", "p3", "2026-10-01", { status: "aguardando" }),
      item("d", "p4", "2026-10-10", { status: "concluida", concluidaEm: HOJE }),
      item("e", "p5", "2026-10-10", { status: "concluida", concluidaEm: "2026-10-19" }),
    ], HOJE);
    expect(f.hoje.map((c) => c.pacienteId)).toEqual(["p1"]);
    expect(f.proximas.map((c) => c.pacienteId)).toEqual(["p2"]);
    expect(f.aguardando.map((c) => c.pacienteId)).toEqual(["p3"]);
    expect(f.concluidas.map((c) => c.pacienteId)).toEqual(["p4"]);
  });

  it("um cartão por paciente, atrasados primeiro, com dias de atraso", () => {
    const f = montarFila([item("a", "p1", "2026-10-20"), item("b", "p2", "2026-10-15"), item("c", "p2", "2026-10-18")], HOJE);
    expect(f.hoje.map((c) => c.pacienteId)).toEqual(["p2", "p1"]);
    expect(f.hoje[0]!.itens.map((i) => i.id)).toEqual(["b", "c"]);
    expect(f.hoje[0]!.atrasoDias).toBe(5);
  });

  it("janela de 14 dias: sugere tratar junto, desmarcado, e tira das próximas", () => {
    const f = montarFila([item("a", "p1", "2026-10-20"), item("b", "p1", "2026-11-03"), item("c", "p1", "2026-11-04")], HOJE);
    expect(f.hoje[0]!.junto).toEqual([{ item: expect.objectContaining({ id: "b" }), marcado: false }]);
    expect(f.proximas[0]!.itens.map((i) => i.id)).toEqual(["c"]);
  });

  it("sem item para hoje, nada é puxado para junto", () => {
    const f = montarFila([item("b", "p1", "2026-10-25")], HOJE);
    expect(f.hoje).toEqual([]);
    expect(f.proximas[0]!.itens).toHaveLength(1);
  });
});
