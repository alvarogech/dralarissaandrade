import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade } from "./registro";
import { carregarFechamento, type Ator } from "./servico";
import { finalizarFeedback, listarFeedbacks } from "./entrega";
import { salvarItemRotina } from "./rotina";
import { itemDaRotina, type ResultadoContato } from "./rotina-itens";
import { registroDoContato, validarContato, type EntradaContato } from "./contato-rotina";
import { diferencaCaixa, linhasCaixa, salvarCaixa, textoDiferenca, estadoCaixa } from "./caixa";
import { salvarRascunho } from "./prioridades";
import { montarPrestacao } from "./prestacao";
import { contagemConsistente, contarRegistros, fraseDoRegistro, lerRegistro, textoSignificativo } from "./leitura-registro";
import type { EventoRow, FeedbackRow, FilaStore } from "./store";

/*
 * Regressão do feedback diário (03/11/2026): registro paciente → ação → resposta → desfecho →
 * próximo passo, indicadores com fórmula única, WhatsApp executivo e financeiro com sinal correto.
 * Casos A–E vêm do fechamento real de 03/11, com nomes FICTÍCIOS. Store em memória — nunca o banco.
 */
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const DIA = "2026-11-03"; // terça

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T20:00:00Z")); // 17:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

type Extra = Partial<Omit<EntradaContato, "eventoId" | "item" | "resultado" | "desfecho">>;
const entrada = (k: string, resultado: ResultadoContato, extra: Extra = {}, desfecho?: ResultadoContato) => ({
  item: itemDaRotina(k)!, resultado, desfecho, responsavel: `perfil:${GABI.id}`, proximaAcao: "Verificar se respondeu", prazo: "2026-11-05", ...extra,
});
const erros = (k: string, resultado: ResultadoContato, extra: Extra = {}, desfecho?: ResultadoContato) =>
  validarContato({ nomeNovo: "TESTE Paciente", ...entrada(k, resultado, extra, desfecho) }, DIA).map(([c]) => c);
async function contato(store: FilaStore, k: string, resultado: ResultadoContato, nome: string, extra: Extra = {}, desfecho?: ResultadoContato) {
  const e = { nomeNovo: nome, ...entrada(k, resultado, extra, desfecho) };
  expect(validarContato(e, DIA)).toEqual([]);
  return registrarAtividade(store, GABI, registroDoContato({ ...e, eventoId: randomUUID() }));
}

/** Evento como o formato anterior a 03/11 gravava — inserido direto, como já está no banco. */
async function eventoAntigo(store: FilaStore, nome: string, e: Partial<EventoRow>) {
  const patientId = await store.criarPaciente({ nome }, GABI.id);
  await store.registrarEvento({ id: randomUUID(), patientId, kind: "resposta", occurredOn: DIA, channel: null, notes: null, amount: null, amountOrigin: null, scheduledFor: null, createdBy: GABI.id, alvos: [], ...e } as EventoRow);
  return patientId;
}
const det = (k: string, rr: string, acao: string, extra: Record<string, string> = {}) => ({ rotina_item: k, resultado_rotina: rr, situacao_contato: "respondeu", acao, ...extra });
const CASO_A = { categoria: "continuidade" as const, contato: "sim" as const, resposta: "sim" as const, resultado: ".", situacao: "informativo", payload: { categoria: "continuidade", contexto: "Continuidade de tratamentos", feito: "Continuidade de tratamento — orientação: .", detalhes: det("pos_procedimento", "orientacao", "Continuidade de tratamento") } };
const CASO_B = { categoria: "recorrencia" as const, contato: "sim" as const, resposta: "sim" as const, resultado: "Contato realizado", situacao: "informativo", payload: { categoria: "recorrencia", contexto: "Acompanhamento de 30 dias", feito: "Acompanhamento de 30 dias", detalhes: det("contatos_30_dias", "contato_realizado", "Acompanhamento de 30 dias") } };
const CASO_C = { categoria: "pos_atendimento" as const, contato: "sim" as const, resposta: "sim" as const, resultado: "Acompanhamento", situacao: "informativo", payload: { categoria: "pos_atendimento", contexto: "Pós-procedimento", feito: "Contato de pós-procedimento", detalhes: det("pos_procedimento_ontem", "respondeu", "Contato de pós-procedimento", { relato_paciente: "sim" }) } };

const ev = (extra: Partial<EventoRow>): EventoRow => ({
  id: randomUUID(), patientId: "p1", kind: "registro", occurredOn: DIA, channel: null, notes: null, amount: null, amountOrigin: null, scheduledFor: null, createdBy: GABI.id, alvos: [], ...extra,
});

describe("A. qualidade dos registros", () => {
  it("texto significativo: rejeita vazio, pontuação e genéricos; aceita respostas curtas legítimas", () => {
    for (const v of ["", "   ", ".", " . ; ", "Contato realizado", "Acompanhamento", "Orientação prestada", "Resolvido", "orientação: ."]) expect(textoSignificativo(v), v).toBe(false);
    for (const v of ["Tudo bem", "Sem dor", "Não tenho interesse", "Ok", "prefere dezembro"]) expect(textoSignificativo(v), v).toBe(true);
    expect(textoSignificativo("Continuidade de tratamento", ["Continuidade de tratamento"])).toBe(false); // repete a ação
  });

  it("contato sem resposta não exige resposta inexistente; exige próximo passo com data", () => {
    expect(erros("pos_procedimento", "aguardando_resposta")).toEqual([]);
    expect(erros("pos_procedimento", "nao_respondeu", { proximaAcao: "", prazo: "" })).toEqual(["proxima", "prazo"]);
  });

  it("paciente respondeu: a resposta é obrigatória e não pode ser a ação (“contato realizado”)", () => {
    expect(erros("contatos_30_dias", "respondeu", {})).toEqual(["resposta"]);
    expect(erros("contatos_30_dias", "respondeu", { resposta: "Contato realizado" })).toEqual(["resposta"]);
    expect(erros("contatos_30_dias", "respondeu", { resposta: "Tudo bem" })).toEqual([]);
    // resultado objetivo dispensa o texto: a data é o resultado
    expect(erros("pos_procedimento", "respondeu", { agendadoPara: "2026-11-12" }, "agendou")).toEqual([]);
  });

  it("caso A: orientação vazia, só pontuação ou genérica impede salvar — no formulário e no servidor", async () => {
    expect(erros("pos_procedimento", "respondeu", { resposta: "vai pensar", orientacao: "" }, "orientacao")).toEqual(["orientacao"]);
    expect(erros("pos_procedimento", "respondeu", { resposta: "vai pensar", orientacao: "." }, "orientacao")).toEqual(["orientacao"]);
    expect(erros("pos_procedimento", "respondeu", { resposta: ".", orientacao: "Orientação prestada" }, "orientacao")).toEqual(["resposta", "orientacao"]);
    const { store } = criarStoreMemoria();
    // o mesmo payload do formulário antigo (observação "." virando orientação e resposta) é recusado
    await expect(registrarAtividade(store, GABI, { eventoId: randomUUID(), alvos: [], categoria: "continuidade", nomeNovo: undefined, novoPaciente: { nome: "TESTE Isa" }, contato: "sim", resposta: "sim", resultado: ".", situacao: "informativo", feito: "Continuidade de tratamento — orientação: .", detalhes: det("pos_procedimento", "orientacao", "Continuidade de tratamento") } as never))
      .rejects.toThrow(/Houve resposta/);
    await expect(registrarAtividade(store, GABI, { eventoId: randomUUID(), alvos: [], categoria: "continuidade", novoPaciente: { nome: "TESTE Isa" }, contato: "sim", resposta: "sim", resultado: "vai pensar", situacao: "informativo", detalhes: { ...det("pos_procedimento", "orientacao", "Continuidade de tratamento"), orientacao: "." } }))
      .rejects.toThrow(/qual orientação/);
  });

  it("caso B/C: resposta genérica recusada no servidor; relato genérico no pós-procedimento também", async () => {
    const { store } = criarStoreMemoria();
    await expect(registrarAtividade(store, GABI, { eventoId: randomUUID(), alvos: [], categoria: "recorrencia", novoPaciente: { nome: "TESTE Ana" }, contato: "sim", resposta: "sim", resultado: "Contato realizado", situacao: "informativo" }))
      .rejects.toThrow(/o que a paciente disse/);
    expect(erros("pos_procedimento_ontem", "respondeu", { relato: "Acompanhamento" })).toEqual(["relato"]);
    expect(erros("pos_procedimento_ontem", "respondeu", { relato: "Está bem, sem queixas" })).toEqual([]);
  });

  it("adiou, recusou, agendou, encaminhou e resolveu têm cada um o seu significado", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Adia", { resposta: "prefere dezembro", proximaAcao: "Retomar o contato", prazo: "2026-11-25" }, "adiou");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Recusa", { resposta: "não tem interesse agora" }, "sem_interesse");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Agenda", { resposta: "confirmou", agendadoPara: "2026-11-12" }, "agendou");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Prof", { resposta: "quer avaliar dor", profissional: "Dra. Larissa", proximaAcao: "Acompanhar o retorno", prazo: "2026-11-05" }, "encaminhado_profissional");
    expect(erros("pos_procedimento", "respondeu", { resposta: "tudo certo" }, "resolvido")).toEqual(["observacao"]); // resolvido pede o resultado
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Fim", { resposta: "fez a última etapa", observacao: "tratamento concluído" }, "resolvido");
    const sit = m._dados.eventos.map((e) => e.situacao);
    expect(sit).toEqual(["pendente", "dispensado", "agendado", "encaminhado", "resolvido"]);
    const c = contarRegistros(m._dados.eventos);
    expect(c).toMatchObject({ agendamentos: 1, resolvidos: 1, encerradosSemResolver: 1, encaminhadosProfissional: 1, respostas: 5, registrosIncompletos: 0 });
    // encaminhado não é resolvido: o caso segue aberto com a Dra.
    expect(m._dados.tarefas.find((t) => t.patientId === m._dados.eventos[3]!.patientId)).toMatchObject({ status: "waiting" });
  });

  it("registro histórico incompleto: preservado, lido como incompleto, nunca vira resposta nem resolução", async () => {
    const { store, _dados } = criarStoreMemoria();
    await eventoAntigo(store, "TESTE Isamara Exemplo", CASO_A);
    const antes = JSON.stringify(_dados.eventos);
    const r = lerRegistro(_dados.eventos[0]!);
    expect(r).toMatchObject({ estado: "resposta_incompleta", orientacao: null, resposta: null, desfecho: null });
    expect(r.incompleto).toEqual(["orientação não descrita", "resposta da paciente não descrita"]);
    expect(contarRegistros(_dados.eventos)).toMatchObject({ tentativas: 1, respostas: 0, respostasIncompletas: 1, resolvidos: 0 });
    await carregarFechamento(store, DIA, GABI.id);
    expect(JSON.stringify(_dados.eventos)).toBe(antes); // leitura não altera o banco
  });

  it("registro antigo de orientação com texto: a orientação aparece, a “resposta” (o mesmo texto) não é inventada", () => {
    const r = lerRegistro(ev({ contato: "sim", resposta: "sim", resultado: "expliquei a fase 2", situacao: "informativo", payload: { contexto: "Continuidade de tratamentos", feito: "Continuidade de tratamento — orientação: expliquei a fase 2", detalhes: det("pos_procedimento", "orientacao", "Continuidade de tratamento") } }));
    expect(r).toMatchObject({ orientacao: "expliquei a fase 2", resposta: null, estado: "resposta_incompleta" });
    expect(fraseDoRegistro(r)).toBe("Orientação dada: expliquei a fase 2. ⚠️ Registro incompleto: resposta da paciente não descrita.");
  });
});

describe("B. continuidade de tratamentos", () => {
  it("cada desfecho grava a situação certa e só “concluída” resolve; nenhum vira agendamento indevido", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento", "nao_respondeu", "TESTE C1", { orientacao: "" });
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C2", { resposta: "vai seguir", orientacao: "expliquei a próxima etapa" }, "orientacao");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C3", { resposta: "quer ver com o marido", proximaAcao: "Retomar o contato para definir", prazo: "2026-11-10" }, "interessada");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C4", { resposta: "prefere dezembro", proximaAcao: "Retomar o contato", prazo: "2026-11-25" }, "adiou");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C5", { resposta: "agendou a fase 2", agendadoPara: "2026-11-12" }, "agendou");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C6", { resposta: "pediu desconto", pergunta: "Pode dar 10%?", prazo: "2026-11-04" }, "encaminhado_gestao");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE C7", { resposta: "fez a última sessão", observacao: "plano concluído" }, "resolvido");
    expect(m._dados.eventos.map((e) => e.situacao)).toEqual(["pendente", "informativo", "aguardando", "pendente", "agendado", "aguardando_gestao", "resolvido"]);
    const c = contarRegistros(m._dados.eventos);
    expect(c).toMatchObject({ tentativas: 7, pacientesContatadas: 7, respostas: 6, semResposta: 1, agendamentos: 1, resolvidos: 1, registrosIncompletos: 0 });
    expect(contagemConsistente(c)).toBe(true);
    const { texto } = await carregarFechamento(m.store, DIA, GABI.id);
    expect(texto).toMatch(/Orientação dada: expliquei a próxima etapa\. Respondeu: vai seguir\./);
    expect(texto).toMatch(/Respondeu: quer ver com o marido\. Tem interesse, aguardando definição\. Próximo passo: retomar o contato para definir até 10\/11/);
    expect(texto).toMatch(/Respondeu: prefere dezembro\. Preferiu adiar\. Próximo passo: retomar o contato até 25\/11/);
    expect(texto).toMatch(/Respondeu: pediu desconto\. Aguarda decisão da gestão: Pode dar 10%\?/);
  });

  it("orientação + adiamento: o que foi explicado aparece junto com a decisão da paciente", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Maria Exemplo", { resposta: "prefere fazer em dezembro", orientacao: "expliquei a próxima etapa do tratamento", proximaAcao: "Retomar o contato", prazo: "2026-11-25" }, "adiou");
    const { texto } = await carregarFechamento(m.store, DIA, GABI.id);
    expect(texto).toContain("• TESTE E. — Orientação dada: expliquei a próxima etapa do tratamento. Respondeu: prefere fazer em dezembro. Preferiu adiar. Próximo passo: retomar o contato até 25/11 (Gabi (demonstração)).");
  });
});

describe("C. indicadores", () => {
  const contato_ = (extra: Partial<EventoRow>) => ev({ contato: "sim", resposta: "nao", situacao: "aguardando", payload: { proxima: "Verificar", prazo: "2026-11-05" }, ...extra });

  it("caso D: aniversário não é tentativa; resposta vazia não é resposta; a conta fecha", () => {
    const c = contarRegistros([
      ...[1, 2].map((i) => ev({ patientId: `aniv${i}`, contato: "sim", resposta: "na", situacao: "informativo" })),
      ev({ patientId: "a", ...CASO_A }), ev({ patientId: "b", ...CASO_A }), ev({ patientId: "c", ...CASO_C }),
      ev({ patientId: "d", contato: "sim", resposta: "sim", resultado: "Sem dor", situacao: "informativo" }),
      contato_({ patientId: "e" }),
    ]);
    expect(c).toMatchObject({ registros: 7, tentativas: 5, pacientesContatadas: 5, respostas: 1, respostasIncompletas: 3, semResposta: 1, mensagens: 2, agendamentos: 0, resolvidos: 0 });
    expect(contagemConsistente(c)).toBe(true);
  });

  it("uma paciente com várias tentativas: eventos ≠ pacientes; resposta depois de tentativa anterior conta como resposta, não como tentativa", () => {
    const c = contarRegistros([contato_({}), contato_({}), ev({ contato: "na", resposta: "sim", resultado: "vai ligar amanhã", situacao: "informativo" })]);
    expect(c).toMatchObject({ tentativas: 2, pacientesContatadas: 1, respostas: 1, pacientesResponderam: 1, semResposta: 2 });
  });

  it("mesma paciente em categorias diferentes conta uma paciente; registro ligado a vários itens conta uma vez", () => {
    const c = contarRegistros([
      ev({ categoria: "continuidade", contato: "sim", resposta: "sim", resultado: "ok, vai pensar", situacao: "informativo", alvos: [{ tarefaId: "t1" }, { marcoId: "m1" }] }),
      ev({ categoria: "pos_atendimento", contato: "sim", resposta: "sim", resultado: "sem dor", situacao: "informativo" }),
    ]);
    expect(c).toMatchObject({ tentativas: 2, pacientesContatadas: 1, respostas: 2, pacientesResponderam: 1 });
  });

  it("agendamento sem comparecimento não é comparecimento; resposta não é resolução", () => {
    const c = contarRegistros([
      ev({ contato: "sim", resposta: "sim", resultado: "Agendou para 12/11", situacao: "agendado", scheduledFor: "2026-11-12" }),
      ev({ patientId: "p2", contato: "sim", resposta: "sim", resultado: "vai pensar", situacao: "informativo" }),
    ]);
    expect(c).toMatchObject({ agendamentos: 1, resolvidos: 0, respostas: 2 });
  });

  it("pendência resolvida e vencida; prestação, fechamento e texto usam os mesmos números", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento_ontem", "aguardando_resposta", "TESTE Leia Exemplo");
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Rosa Exemplo", { resposta: "terminou", observacao: "plano concluído" }, "resolvido");
    await contato(m.store, "aniversariantes", "mensagem_enviada", "TESTE Bia Aniversario");
    vi.setSystemTime(new Date("2026-11-06T20:00:00Z")); // sexta: o retorno de 05/11 venceu
    const p = await montarPrestacao(m.store, GABI.id, "2026-11-06");
    expect(p.fechamento.situacaoPendencias).toMatchObject({ vencidas: 1 });
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    const hoje = await montarPrestacao(m.store, GABI.id, DIA);
    expect(hoje.indicadores).toMatchObject({ tentativas: 2, pacientesContatadas: 2, comResposta: 1, semResposta: 1, mensagens: 1, resolvidos: 1 });
    expect(hoje.fechamento.contadores).toMatchObject({ tentativasContato: 2, pacientesContatadas: 2, respostas: 1, semResposta: 1, mensagens: 1, resolvidos: 1 });
    expect(hoje.texto).toContain("• Pacientes contatadas: 2\n• Responderam: 1 · sem resposta: 1\n• Agendamentos: 0 · Pendências resolvidas: 1");
  });

  it("resposta registrada depois fecha o “verificar se respondeu” do mesmo assunto (sem pendência fantasma)", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento_ontem", "aguardando_resposta", "TESTE Sandra Exemplo");
    const pid = m._dados.eventos[0]!.patientId!;
    const retorno = m._dados.tarefas.find((t) => t.patientId === pid)!;
    expect(retorno.status).toBe("waiting");
    const e = { pacienteId: pid, ...entrada("pos_procedimento_ontem", "respondeu", { relato: "Está bem, sem queixas" }) };
    await registrarAtividade(m.store, GABI, registroDoContato({ ...e, eventoId: randomUUID() }));
    expect(m._dados.tarefas.find((t) => t.id === retorno.id)).toMatchObject({ status: "completed" });
    expect(m._dados.eventos.at(-1)!.alvos).toEqual([{ tarefaId: retorno.id }]); // vínculo preservado no histórico
    // outro acompanhamento da mesma paciente continua sendo outra obrigação, identificada pela origem
    await contato(m.store, "contatos_30_dias", "aguardando_resposta", "TESTE outra", { });
    const f = await carregarFechamento(m.store, DIA, GABI.id);
    expect(f.fechamento.pendentesAbertas.map((x) => x.item)).toEqual(["Verificar se respondeu (acompanhamento de 30 dias)"]);
  });
});

describe("D. gerador do WhatsApp", () => {
  const limpo = (t: string) => {
    expect(t).not.toMatch(/\[[TMA]-[0-9a-f]{6}\]/); // códigos internos
    expect(t).not.toMatch(/undefined|null|NaN/);
    expect(t).not.toMatch(/: \.|:\s*;|\s\.\s|\.\./); // pontuação solta
    expect(t).not.toMatch(/contato: Contato|resposta: Contato realizado|orientação: \.|próxima: |sem resposta; aguardando resposta/);
    expect(t.split("\n").slice(1).join("\n")).not.toMatch(/\*[^*\n]+\*\n\n/); // título de seção sem conteúdo
  };

  it("dia sem registros: diz isso, sem zeros inventados nem seções vazias", async () => {
    const { store } = criarStoreMemoria();
    const p = await montarPrestacao(store, GABI.id, DIA);
    limpo(p.texto);
    expect(p.texto).toContain("• Nenhum registro de paciente hoje.");
    expect(p.texto).not.toMatch(/Continuidade de tratamentos|Pós-atendimento|Pacientes contatadas/);
    expect(p.texto).toContain("*Financeiro*\n• Recebimentos não conferidos hoje (sem valores informados).");
  });

  it("caso 03/11 completo: históricos incompletos sinalizados, novos legíveis, aniversário agregado, financeiro certo", async () => {
    const m = criarStoreMemoria();
    await eventoAntigo(m.store, "TESTE Isamara Ferreira", CASO_A);
    await eventoAntigo(m.store, "TESTE Whennia Oliveira", CASO_A);
    await eventoAntigo(m.store, "TESTE Graziele Costa", CASO_C);
    await eventoAntigo(m.store, "TESTE Necia Lima", CASO_B);
    await contato(m.store, "pos_procedimento_ontem", "respondeu", "TESTE Kleber Souza", { relato: "relatou alteração após o atendimento", atencao: { profissional: "Dra. Larissa", motivo: "alteração relatada", em: "2026-11-03T10:00", estado: "aguardando_profissional" }, proximaAcao: "Acompanhar o retorno da profissional", prazo: "2026-11-04" });
    await contato(m.store, "pos_procedimento_ontem", "aguardando_resposta", "TESTE Leidyana Souza");
    await contato(m.store, "aniversariantes", "mensagem_enviada", "TESTE Ana Aniversario");
    await contato(m.store, "aniversariantes", "mensagem_enviada", "TESTE Bia Aniversario");
    await salvarCaixa(m.store, GABI, { previsto: 0, recebido: 2596 });
    const p = await montarPrestacao(m.store, GABI.id, DIA);
    limpo(p.texto);
    expect(p.texto.startsWith("*STIMMA | Fechamento — 03/11/2026 (terça)*")).toBe(true);
    expect(p.texto).toContain("• TESTE F. — ⚠️ Registro incompleto: orientação não descrita; resposta da paciente não descrita.");
    expect(p.texto).toContain("• TESTE C. — ⚠️ Registro incompleto: relato da paciente não descrito.");
    expect(p.texto).toContain("• TESTE L. — ⚠️ Registro incompleto: resposta da paciente não descrita.");
    expect(p.texto).toContain("• ⚠️ TESTE S. — Relatou: relatou alteração após o atendimento. Caso encaminhado a Dra. Larissa; retorno ainda pendente.");
    expect(p.texto).toContain("Mensagem enviada, aguardando resposta. Próximo passo: verificar se respondeu até 05/11");
    expect(p.texto).toContain("• Aniversariantes: 2 mensagens enviadas.");
    expect(p.texto).not.toMatch(/Aniversario/); // nomes do aniversário não são listados
    expect(p.texto).toContain("*Financeiro*\n• Previsto: R$ 0,00 · Recebido: R$ 2.596,00\n• Diferença: R$ 2.596,00 acima do previsto. Justificativa não registrada.");
    expect(p.texto).not.toContain("-R$");
    expect(p.texto).toMatch(/\*Atenção da gestão\*\n• Registros sem a informação essencial \(orientação, resposta ou resultado\): /);
    expect(p.texto).toMatch(/• Pacientes contatadas: 6\n• Responderam: 1 · sem resposta: 1 · resposta não descrita: 4/);
    expect(p.texto).not.toMatch(/Contatos da rotina|Indicadores do dia|Concluídos \(\d+\):/); // sem repetição nem checklist extenso
  });

  it("dia com muitas ações: uma linha por paciente; a mesma paciente não se repete na área", async () => {
    const m = criarStoreMemoria();
    for (let i = 0; i < 12; i++) await contato(m.store, "pos_procedimento_ontem", "respondeu", `TESTE Pos${i} Exemplo`, { relato: "Está bem, sem queixas" });
    const pid = m._dados.eventos[0]!.patientId!;
    await registrarAtividade(m.store, GABI, registroDoContato({ ...entrada("pos_procedimento_ontem", "aguardando_resposta"), pacienteId: pid, eventoId: randomUUID() }));
    const { texto } = await carregarFechamento(m.store, DIA, GABI.id);
    limpo(texto);
    expect((texto.match(/^• TESTE E\. — /gm) ?? []).length).toBe(12);
    expect(texto).toMatch(/Relatou: Está bem, sem queixas\. Depois: Mensagem enviada, aguardando resposta/);
  });

  it("decisão da gestão aparece em “Atenção da gestão”, separada da pendência comum", async () => {
    const m = criarStoreMemoria();
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Neg Exemplo", { resposta: "pediu desconto", pergunta: "Pode dar 10%?", prazo: "2026-11-04" }, "encaminhado_gestao");
    await contato(m.store, "pos_procedimento", "nao_respondeu", "TESTE Comum Exemplo", { proximaAcao: "Tentar contato de novo", prazo: "2026-11-04" });
    const { texto } = await carregarFechamento(m.store, DIA, GABI.id);
    const atencao = texto.split("*Atenção da gestão*")[1]!.split("\n\n")[0]!;
    expect(atencao).toContain("TESTE E. — Responder: Pode dar 10%?");
    expect(atencao).not.toContain("Tentar contato de novo");
  });
});

describe("E. histórico e versões", () => {
  it("feedback entregue no formato antigo continua igual; correção cria nova versão no formato novo", async () => {
    const m = criarStoreMemoria();
    const antigo: FeedbackRow = {
      id: randomUUID(), dia: DIA, responsavel: GABI.id, versao: 1, status: "entregue",
      texto: "*Fechamento — 03/11/2026 (terça)*\n• Resultado — TESTE F. · Continuidade de tratamentos: contato: Continuidade de tratamento — orientação: .; resposta: .",
      contadores: { registros: 1 }, eventos: [], substitui: null, geradoEm: "2026-11-03T20:00:00Z", entregueEm: "2026-11-03T20:00:00Z", copiadoEm: null, whatsappConfirmadoEm: null, observacaoGestao: null, ajusteSolicitadoEm: null, ajusteSolicitadoPor: null,
    };
    await m.store.inserirFeedback(antigo);
    await contato(m.store, "pos_procedimento_ontem", "respondeu", "TESTE Nova Exemplo", { relato: "Sem dor" });
    await salvarRascunho(m.store, GABI, { prioridadesConfirmadas: true });
    await expect(finalizarFeedback(m.store, GABI, { id: randomUUID() })).rejects.toMatchObject({ status: 409 }); // nada muda em silêncio
    const nova = (await finalizarFeedback(m.store, GABI, { id: randomUUID(), corrigir: true })).feedback;
    expect(nova).toMatchObject({ versao: 2, substitui: antigo.id });
    expect(nova.texto).toContain("*STIMMA | Fechamento");
    const lista = await listarFeedbacks(m.store, GESTAO, { dia: DIA });
    expect(lista.find((f) => f.id === antigo.id)!.texto).toBe(antigo.texto); // texto entregue preservado, byte a byte
  });
});

describe("F. financeiro", () => {
  const conferido = (previsto: number, recebido: number, justificativa: string | null = null) =>
    linhasCaixa(estadoCaixa({ dia: DIA, situacao: "conferido", previsto, recebido, justificativa, conferidoPor: GABI.id, conferidoEm: "x" }));

  it("diferença = recebido − previsto, em palavras, sem sinal confuso", () => {
    expect(diferencaCaixa(1000, 1500)).toBe(500);
    expect(diferencaCaixa(1000, 800)).toBe(-200);
    expect(textoDiferenca(500)).toMatch(/^R\$\s?500,00 acima do previsto$/);
    expect(textoDiferenca(-200)).toMatch(/^R\$\s?200,00 abaixo do previsto$/);
    expect(conferido(1000, 1000)).toEqual([expect.stringMatching(/Previsto: R\$\s?1\.000,00 · Recebido: R\$\s?1\.000,00/), "Diferença: nenhuma."]);
    expect(conferido(0, 2596)[1]).toMatch(/^Diferença: R\$\s?2\.596,00 acima do previsto\. Justificativa não registrada\.$/);
    expect(conferido(1000, 0)[1]).toMatch(/^Diferença: R\$\s?1\.000,00 abaixo do previsto\. Justificativa não registrada\.$/);
    expect(conferido(1000, 800, "uma paciente remarcou.")[1]).toMatch(/abaixo do previsto\. Justificativa: uma paciente remarcou\.$/);
    for (const l of [...conferido(0, 2596), ...conferido(1000, 0)]) expect(l).not.toMatch(/-R\$|inadimpl|prejuízo/i);
  });

  it("não conferido ≠ zero; sem recebimentos é dito como tal", () => {
    expect(linhasCaixa(estadoCaixa(null))).toEqual(["Recebimentos não conferidos hoje (sem valores informados)."]);
    expect(linhasCaixa(estadoCaixa({ dia: DIA, situacao: "sem_recebimentos", previsto: null, recebido: null, justificativa: null, conferidoPor: GABI.id, conferidoEm: "x" }))).toEqual(["Conferido: sem recebimentos hoje."]);
  });
});

describe("G. fluxo completo da Gabi", () => {
  it("rotina → continuidade com resposta → próximo passo → pós sem resposta → conferência → recebimentos → envio → histórico", async () => {
    const m = criarStoreMemoria();
    // 2–4. contato de continuidade com resposta e próximo passo (cria o retorno)
    await contato(m.store, "pos_procedimento", "respondeu", "TESTE Maria Exemplo", { orientacao: "expliquei a fase 2", resposta: "prefere dezembro", proximaAcao: "Retomar o contato", prazo: "2026-11-25" }, "adiou");
    const retorno = m._dados.tarefas.find((t) => t.due === "2026-11-25")!;
    expect(retorno).toMatchObject({ status: "open", nextAction: "Retomar o contato" });
    // 5. pós-procedimento sem resposta
    await contato(m.store, "pos_procedimento_ontem", "aguardando_resposta", "TESTE Leia Exemplo");
    // 6. conferência administrativa simples: sem paciente e sem texto
    await salvarItemRotina(m.store, GABI, { itemKey: "agenda_hoje_amanha", estado: "feito" });
    await salvarItemRotina(m.store, GABI, { itemKey: "pos_procedimento", estado: "feito" });
    // checklist feito não resolve pendência
    expect(m._dados.tarefas.find((t) => t.id === retorno.id)!.status).toBe("open");
    // 7. recebimentos
    await salvarCaixa(m.store, GABI, { previsto: 1000, recebido: 800, justificativa: "uma paciente remarcou" });
    // 8–10. prévia = versão entregue
    await salvarRascunho(m.store, GABI, { prioridadesConfirmadas: true });
    const previa = await montarPrestacao(m.store, GABI.id, DIA);
    const { feedback } = await finalizarFeedback(m.store, GABI, { id: randomUUID() });
    expect(feedback.texto).toBe(previa.texto);
    expect(feedback.texto).toContain("• TESTE E. — Orientação dada: expliquei a fase 2. Respondeu: prefere dezembro. Preferiu adiar. Próximo passo: retomar o contato até 25/11");
    expect(feedback.texto).toMatch(/Diferença: R\$\s?200,00 abaixo do previsto\. Justificativa: uma paciente remarcou\./);
    expect(feedback.eventos).toHaveLength(2); // registros de origem ligados à versão entregue
    // 11. histórico: a gestão consulta a versão e os registros de origem
    const h = (await listarFeedbacks(m.store, GESTAO, { dia: DIA })).find((x) => x.id === feedback.id)!;
    expect(h.texto).toBe(feedback.texto);
    expect(h.registros).toHaveLength(2);
  });
});
