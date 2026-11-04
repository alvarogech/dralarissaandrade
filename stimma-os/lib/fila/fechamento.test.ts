import { describe, expect, it } from "vitest";
import { montarFila, type ItemFila } from "./agrupamento";
import { montarFechamento, nomeCurto, proximoDiaUtil, refDoItem, textoWhatsapp } from "./fechamento";
import type { EventoRow } from "./store";

const ev = (extra: Partial<EventoRow>): EventoRow => ({
  id: Math.random().toString(), patientId: "p1", kind: "registro", occurredOn: "2026-10-20", channel: null, notes: null, amount: null,
  amountOrigin: null, scheduledFor: null, createdBy: "u", alvos: [], ...extra,
});
const item = (id: string, extra: Partial<ItemFila>): ItemFila => ({
  id: `tarefa:${id}`, alvo: { tipo: "tarefa", id }, pacienteId: "p2", pacienteNome: "Beatriz Fictícia", tipo: "continuidade", titulo: "x", status: "aberta", due: "2026-10-20", ...extra,
});

describe("fechamento", () => {
  it("nome abreviado, referência curta e próximo dia útil", () => {
    expect(nomeCurto("Mariana Souza Exemplo")).toBe("Mariana E.");
    expect(refDoItem({ tipo: "tarefa", id: "1a2b3c4d-0000-4000-8000-000000000000" })).toBe("T-1a2b3c");
    expect(proximoDiaUtil("2026-10-23")).toBe("2026-10-26");
  });

  it("um evento entra num bloco só; resultados separados de ações; contadores com critério", () => {
    const tarefa = item("aaaaaaaa-0000-4000-8000-000000000001", { pacienteId: "p1", pacienteNome: "Mariana Exemplo", tipo: "recuperacao_falta", categoria: "agenda", titulo: "Remarcar falta", status: "aguardando" });
    const itens = [tarefa, item("bbbbbbbb-0000-4000-8000-000000000002", { titulo: "Agendar fase 2", due: "2026-10-18", categoria: "continuidade" })];
    const fila = montarFila(itens, "2026-10-20");
    const f = montarFechamento({
      dia: "2026-10-20", hoje: "2026-10-20", fila, itens, nomes: { p1: "Mariana Exemplo", p3: "Ana Teste" },
      numeros: { agendaPrevista: 8, agendaRealizada: 7, caixaPrevisto: null, caixaRecebido: 950, caixaSituacao: null },
      estado: { prioridades: [], secoes: { oportunidade: "sem_ocorrencias" } },
      eventos: [
        // mesma paciente, duas tentativas no dia → 2 tentativas, 1 paciente
        ev({ kind: "contato", contato: "sim", resposta: "nao", situacao: "aguardando", categoria: "agenda", channel: "whatsapp", payload: { feito: "mensagem enviada", proxima: "Verificar se respondeu", prazo: "2026-10-21", responsavel: "Gabi" }, alvos: [{ tarefaId: tarefa.alvo!.id }] }),
        ev({ kind: "contato", contato: "sim", resposta: "nao", situacao: "aguardando", categoria: "agenda", channel: "ligacao", payload: { feito: "ligação", proxima: "Verificar se respondeu", prazo: "2026-10-21", responsavel: "Gabi" }, alvos: [{ tarefaId: tarefa.alvo!.id }] }),
        // caso antigo responde hoje: resultado, sem novo contato
        ev({ patientId: "p3", kind: "resposta", contato: "na", resposta: "sim", resultado: "vai pensar até sexta", situacao: "pendente", categoria: "continuidade", payload: { proxima: "Retornar", prazo: "2026-10-24", responsavel: "Gabi" } }),
        ev({ patientId: null, assunto: "Impressora da recepção", kind: "registro", situacao: "informativo", categoria: "pendencia", payload: { feito: "chamado aberto" } }),
        ev({ kind: "correcao", notes: "ajuste da gestão" }), // não conta
      ],
    });
    expect(f.contadores).toMatchObject({ registros: 4, tentativasContato: 2, pacientesContatadas: 1, respostas: 1, agendamentos: 0, resolvidos: 0 });
    expect(f.contadores).toMatchObject({ pacientesResponderam: 1, semResposta: 2, respostasIncompletas: 0, registrosIncompletos: 0, consistente: true });
    const t = textoWhatsapp(f);
    expect(t).toContain("*Agenda e comparecimento*");
    expect(t).toContain("8 previstos · 7 realizados (diferença de 1 para conferir — não é necessariamente falta)");
    // mesma paciente, duas tentativas: uma linha, na ordem, sem repetir o nome
    expect(t).toContain("• Mariana E. — Mensagem enviada, aguardando resposta. Próximo passo: verificar se respondeu até 21/10 (Gabi). Depois: Ligação, aguardando resposta.");
    // resposta de caso antigo hoje: resultado, sem inventar novo contato
    expect(t).toContain("• Ana T. — Retornou: vai pensar até sexta. Próximo passo: retornar até 24/10 (Gabi).");
    expect(t).toContain("• Impressora da recepção — Chamado aberto.\n"); // sem referência vazia
    expect(t).toContain("*Oportunidades internas*\n• Sem ocorrências.");
    expect(t).not.toContain("*Acompanhamentos"); // não revisada e sem registros: omitida
    expect(t).not.toMatch(/ajuste da gestão|R\$|Caixa|\[[TM]-/); // sem dinheiro e sem códigos internos
    expect(t).toContain("*Prioridades — quarta, 21/10/2026* (sugeridas)");
    expect(t).toContain("Beatriz F. — Agendar fase 2");
    expect(t).toContain("• Pacientes contatadas: 1 (2 tentativas)\n• Responderam: 1 · sem resposta: 2");
    expect((t.match(/mensagem enviada/gi) ?? []).length).toBe(1); // sem repetir o evento em vários blocos
  });

  it("prioridades escolhidas substituem as sugeridas; dia anterior não usa a situação atual", () => {
    const fila = montarFila([], "2026-10-21");
    const passado = montarFechamento({ dia: "2026-10-20", hoje: "2026-10-21", fila, itens: [], nomes: {}, numeros: null, eventos: [], estado: { prioridades: [{ ref: null, texto: "Confirmar agenda de segunda" }], secoes: {} } });
    const t = textoWhatsapp(passado);
    expect(passado.historico).toBe(true);
    expect(t).not.toContain("Pendências em aberto");
    expect(t).toContain("• Confirmar agenda de segunda");
    expect(t).not.toContain("sugeridas");
  });
});
