import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerCodigo, limparEntradaCodigo } from "../auth/otp";
import { criarStoreMemoria, PERFIS_DEMO } from "./store-memoria";
import { registrarAtividade, type EntradaRegistro } from "./registro";
import { analisarFeedback, carregarFechamento, carregarFila, confirmarEntrada, criarTarefaManual, editarTarefa, estadoEntrada, type Ator } from "./servico";
import { enviarMensagem } from "./conversa";
import { comentarFeedback, confirmarWhatsapp, entregarFeedback, estadoFeedback, gerarFeedback, listarFeedbacks, marcarCopiado } from "./entrega";
import { situacaoEntrega, textoSituacaoEntrega } from "./expediente";
import { contarPorSituacao, FILTROS_PADRAO, filtrarBase, filtrarTrabalho, situacaoTrabalho } from "./trabalho";
import { CONFIG_VAZIA } from "./store";

// Testes de aceitação da auditoria de acessos (Álvaro × Gabi). Dados fictícios, store em memória.
const GESTAO: Ator = { id: PERFIS_DEMO[0]!.id, email: "gestao@exemplo.test", gestao: true };
const GABI: Ator = { id: PERFIS_DEMO[1]!.id, email: "concierge@exemplo.test", gestao: false };
const PESSOAS_GABI = { eu: GABI.id, conciergeId: GABI.id, gestorId: GESTAO.id };
const PESSOAS_GESTAO = { eu: GESTAO.id, conciergeId: GABI.id, gestorId: GESTAO.id };
const HOJE = "2026-10-20"; // terça-feira

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z")); // 12:00 em São Paulo
});
afterEach(() => vi.useRealTimers());

const reg = (extra: Partial<EntradaRegistro>): EntradaRegistro => ({ eventoId: randomUUID(), alvos: [], categoria: "pendencia", contato: null, resposta: null, situacao: "informativo", ...extra });
const lote = (itens: unknown[], consultado = "2026-10-20") => JSON.stringify({ contrato: "stimma-entrada-v1", lote: { origem: "simples_dental", consultado_em: consultado }, itens });

async function tarefaDaGabi(m = criarStoreMemoria(), extra: Partial<Parameters<typeof criarTarefaManual>[2]> = {}) {
  const id = await criarTarefaManual(m.store, GESTAO, { novoPaciente: { nome: "TESTE Paula Exemplo" }, kind: "continuidade", acao: "Agendar fase 2", prazo: HOJE, responsavel: GABI.id, ...extra });
  return { ...m, id };
}

describe("1. código de acesso por e-mail", () => {
  it("aceita 8 dígitos como texto, inclusive com zero à esquerda e espaços acidentais", () => {
    expect(lerCodigo("01234567")).toEqual({ ok: true, codigo: "01234567" });
    expect(lerCodigo(" 0123 4567 ")).toEqual({ ok: true, codigo: "01234567" });
    expect(lerCodigo("0123-4567")).toEqual({ ok: true, codigo: "01234567" });
    expect(lerCodigo("123456")).toMatchObject({ ok: false, erro: expect.stringMatching(/8 dígitos/) });
    expect(lerCodigo("1234a678")).toMatchObject({ ok: false });
    expect(limparEntradaCodigo("Seu código é 0098 7654. Válido até 23/10/2026")).toBe("00987654");
    expect(limparEntradaCodigo("00987654")).toBe("00987654");
  });
});

describe("3–5. responsável, assunto sem paciente e visão comum", () => {
  it("publicação exige responsável e a tarefa aparece para a pessoa correta", async () => {
    const { store } = criarStoreMemoria();
    await expect(criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE X" }, kind: "outro", acao: "Ligar", prazo: HOJE })).rejects.toThrow(/responsável/);
    await criarTarefaManual(store, GESTAO, { novoPaciente: { nome: "TESTE Y" }, kind: "outro", acao: "Ligar", prazo: HOJE, responsavel: GABI.id });
    const { itens } = await carregarFila(store, HOJE);
    const minha = { ...FILTROS_PADRAO, responsavel: "eu" as const };
    expect(filtrarTrabalho(itens, minha, PESSOAS_GABI, HOJE)).toHaveLength(1);
    expect(filtrarTrabalho(itens, minha, PESSOAS_GESTAO, HOJE)).toHaveLength(0);
  });

  it("tarefa administrativa sem paciente não cria cadastro", async () => {
    const { store, _dados } = criarStoreMemoria();
    await criarTarefaManual(store, GESTAO, { assunto: "Renovar alvará da sala 2", kind: "pendencia", acao: "Levar documentos ao contador", prazo: HOJE, responsavel: GABI.id, prioridade: "alta", resultadoEsperado: "protocolo da renovação" });
    expect(_dados.pacientes).toHaveLength(0);
    expect(_dados.tarefas[0]).toMatchObject({ patientId: null, assunto: "Renovar alvará da sala 2", prioridade: "alta" });
    const { itens } = await carregarFila(store, HOJE);
    expect(itens[0]).toMatchObject({ semPaciente: true, pacienteNome: "Renovar alvará da sala 2", resultadoEsperado: "protocolo da renovação" });
  });

  it("manual, importada, conferência e marco na mesma visão, cada item em uma situação só", async () => {
    const m = criarStoreMemoria();
    await tarefaDaGabi(m);
    await confirmarEntrada(m.store, GESTAO, lote([
      { tipo: "recuperacao_falta", chave_origem: "f-1", paciente: { nome: "TESTE Bia", sd_codigo: "1" }, data_ocorrencia: "2026-10-19", ocorrencia: "cancelamento" },
      { tipo: "atendimento_realizado", chave_origem: "a-1", paciente: { nome: "TESTE Caio", sd_codigo: "2" }, data_atendimento: "2026-10-15", status_no_sd: "Finalizada" },
      { tipo: "atendimento_realizado", chave_origem: "a-2", paciente: { nome: "TESTE Duda", sd_codigo: "3" }, data_atendimento: "2026-10-16", status_no_sd: "Atendido", a_conferir: ["status_no_sd"] },
    ]));
    const { itens } = await carregarFila(m.store, HOJE);
    const tipos = new Set(itens.map((i) => i.tipo));
    expect([...tipos].sort()).toEqual(["conferir_atendimento", "continuidade", "marco", "recuperacao_falta"]);
    const todos = { ...FILTROS_PADRAO, situacoes: [] };
    const base = filtrarBase(itens, todos, PESSOAS_GESTAO);
    const contagem = contarPorSituacao(base, HOJE);
    expect(Object.values(contagem).reduce((a, b) => a + b, 0)).toBe(base.length); // concilia: soma = total
    expect(filtrarTrabalho(itens, { ...todos, situacoes: ["proxima"] }, PESSOAS_GESTAO, HOJE)).toHaveLength(contagem.proxima); // indicador abre a mesma lista
    // a tarefa importada vai para a concierge configurada
    expect(itens.find((i) => i.tipo === "recuperacao_falta")).toMatchObject({ responsavelId: GABI.id, origem: "simples_dental" });
  });
});

describe("6. falta × cancelamento", () => {
  it("abre com a ocorrência real; desconhecida não é presumida", async () => {
    const m = criarStoreMemoria();
    await confirmarEntrada(m.store, GESTAO, lote([
      { tipo: "recuperacao_falta", chave_origem: "f-1", paciente: { nome: "TESTE Bia", sd_codigo: "1" }, data_ocorrencia: "2026-10-19", ocorrencia: "cancelamento" },
      { tipo: "recuperacao_falta", chave_origem: "f-2", paciente: { nome: "TESTE Lia", sd_codigo: "4" }, data_ocorrencia: "2026-10-18", ocorrencia: "falta" },
    ]));
    await criarTarefaManual(m.store, GESTAO, { novoPaciente: { nome: "TESTE Rui" }, kind: "recuperacao_falta", acao: "Remarcar", prazo: HOJE, responsavel: GABI.id });
    const { itens } = await carregarFila(m.store, HOJE);
    expect(itens.find((i) => i.pacienteNome === "TESTE Bia")).toMatchObject({ ocorrencia: "cancelamento", dataOcorrencia: "2026-10-19" });
    expect(itens.find((i) => i.pacienteNome === "TESTE Lia")).toMatchObject({ ocorrencia: "falta" });
    expect(itens.find((i) => i.pacienteNome === "TESTE Rui")!.ocorrencia).toBeUndefined();
  });
});

describe("7–10. continuidade, orientação, encaminhamento e adiamento", () => {
  it("contato sem resposta mantém aberto, agenda revisão e volta para hoje na data", async () => {
    const { store, id } = await tarefaDaGabi();
    await expect(registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", resposta: "nao", situacao: "resolvido", feito: "mensagem" }))).rejects.toThrow(/sem resposta/);
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", canal: "whatsapp", resposta: "nao", situacao: "aguardando", proximaAcao: "Ver se respondeu", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-22" }));
    const hoje = (await carregarFila(store, HOJE)).itens[0]!;
    expect(hoje).toMatchObject({ status: "aguardando", aguardando: "paciente", due: "2026-10-22" });
    expect(situacaoTrabalho(hoje, HOJE)).toBe("aguardando_paciente");
    expect(situacaoTrabalho(hoje, "2026-10-22")).toBe("hoje");
  });

  it("Gabi pergunta, Álvaro responde na tarefa e devolve; ela vê a atualização não lida e retoma", async () => {
    const { store, id } = await tarefaDaGabi();
    await expect(enviarMensagem(store, GABI, { eventoId: randomUUID(), tarefaId: id, tipo: "orientacao", texto: "x" })).rejects.toThrow(/concierge registra perguntas/);
    await enviarMensagem(store, GABI, { eventoId: randomUUID(), tarefaId: id, tipo: "pergunta", texto: "Posso oferecer sábado?", prazo: "2026-10-21" });
    let gestao = (await carregarFila(store, HOJE, GESTAO.id)).itens[0]!;
    expect(gestao).toMatchObject({ aguardando: "gestao", responsavelId: GESTAO.id, naoLido: true });
    expect(filtrarTrabalho([gestao], { ...FILTROS_PADRAO, situacoes: [], dependeDeMim: true }, PESSOAS_GESTAO, HOJE)).toHaveLength(1);
    await store.marcarLido(id, GESTAO.id); // abriu o detalhe
    gestao = (await carregarFila(store, HOJE, GESTAO.id)).itens[0]!;
    expect(gestao.naoLido).toBeUndefined();
    await enviarMensagem(store, GESTAO, { eventoId: randomUUID(), tarefaId: id, tipo: "resposta_gestao", texto: "Pode, até 12h.", devolver: { proximaAcao: "Oferecer sábado 10h", prazo: "2026-10-21" } });
    const gabi = (await carregarFila(store, HOJE, GABI.id)).itens[0]!;
    expect(gabi).toMatchObject({ status: "aberta", responsavelId: GABI.id, proximaAcao: "Oferecer sábado 10h", due: "2026-10-21", naoLido: true });
    expect(gabi.aguardando).toBeUndefined();
  });

  it("encaminhar à gestão transfere a próxima ação ao gestor; encaminhar não encerra", async () => {
    const { store, id, _dados } = await tarefaDaGabi();
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "encaminhamento", situacao: "encaminhado", responsavel: "gestao", detalhes: { para: "Gestão", motivo_encaminhamento: "pediu desconto" }, prazo: "2026-10-21" }));
    expect(_dados.tarefas[0]).toMatchObject({ status: "waiting", aguardando: "gestao", assignedTo: GESTAO.id });
    expect(_dados.tarefas[0]!.nextAction).toBeTruthy();
  });

  it("adiamento exige motivo, preserva o prazo original e conta adiamentos", async () => {
    const { store, id, _dados } = await tarefaDaGabi();
    const base = { alvos: [{ tipo: "tarefa" as const, id }], categoria: "continuidade" as const, situacao: "pendente" as const, proximaAcao: "Ligar", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-27" };
    await expect(registrarAtividade(store, GABI, reg(base))).rejects.toThrow(/motivo/);
    await registrarAtividade(store, GABI, reg({ ...base, motivo: "paciente viajando" }));
    expect(_dados.tarefas[0]).toMatchObject({ due: "2026-10-27", prazoOriginal: HOJE, adiamentos: 1 });
    await editarTarefa(store, GESTAO, id, { prazo: "2026-10-30", motivo: "aguardar retorno" });
    expect(_dados.tarefas[0]).toMatchObject({ due: "2026-10-30", prazoOriginal: HOJE, adiamentos: 2 });
  });

  it("cobrança enviada não vira pagamento confirmado", async () => {
    const { store, id } = await tarefaDaGabi(criarStoreMemoria(), { kind: "cobranca", acao: "Cobrar parcela" });
    await expect(registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "pendencia", contato: "sim", resposta: "sim", resultado: "vai pagar sexta", situacao: "resolvido" }))).rejects.toThrow(/pagamento confirmado/);
  });
});

describe("11–12. marcos obrigatórios e registro agrupado", () => {
  it("atendimento realizado gera exatamente três marcos; reenvio e concorrência não duplicam; atendimentos distintos preservados", async () => {
    const m = criarStoreMemoria();
    const item = (chave: string, extra = {}) => ({ tipo: "atendimento_realizado", chave_origem: chave, paciente: { nome: "TESTE Ana", sd_codigo: "9" }, data_atendimento: "2026-08-31", status_no_sd: "Finalizado", ...extra });
    await confirmarEntrada(m.store, GESTAO, lote([item("a-1", { marcos: ["d30"] })])); // escolha antiga é ignorada
    expect(m._dados.marcos.map((x) => [x.kind, x.dueOriginal])).toEqual([["d30", "2026-09-30"], ["d90", "2026-11-29"], ["m6", "2027-02-28"]]);
    const at = m._dados.atendimentos[0]!;
    await Promise.all([m.store.confirmarAtendimento(at.id, "2026-08-31", GESTAO.id), m.store.confirmarAtendimento(at.id, "2026-08-31", GESTAO.id)]);
    expect(m._dados.marcos).toHaveLength(3);
    await confirmarEntrada(m.store, GESTAO, lote([item("a-2")], "2026-10-20T10:00")); // outro atendimento, mesma data
    expect(m._dados.marcos).toHaveLength(6);
  });

  it("marcos futuros não entram por padrão; antecipar exige justificativa; um contato conta uma vez", async () => {
    const m = criarStoreMemoria();
    await confirmarEntrada(m.store, GESTAO, lote([{ tipo: "atendimento_realizado", chave_origem: "a-1", paciente: { nome: "TESTE Ana", sd_codigo: "9" }, data_atendimento: "2026-09-20", status_no_sd: "Finalizado" }]));
    const [d30, d90] = m._dados.marcos; // d30 = 20/10 (hoje), d90 = 19/12
    const alvos = [{ tipo: "marco" as const, id: d30!.id }, { tipo: "marco" as const, id: d90!.id }];
    const base = { alvos, categoria: "recorrencia" as const, contato: "sim" as const, canal: "whatsapp", resposta: "sim" as const, resultado: "está bem", situacao: "resolvido" as const };
    await expect(registrarAtividade(m.store, GABI, reg(base))).rejects.toThrow(/justifique/);
    await registrarAtividade(m.store, GABI, reg({ ...base, justificativaFuturos: "paciente pediu para já conversar sobre a próxima etapa" }));
    expect(m._dados.eventos).toHaveLength(1);
    const { fechamento } = await carregarFechamento(m.store, HOJE, GABI.id);
    expect(fechamento.contadores).toMatchObject({ tentativasContato: 1, pacientesContatadas: 1, marcosTrabalhados: 2 });
  });
});

describe("13–14. lote retomável e feedback anterior", () => {
  it("falha no meio do lote: o salvo fica comprovado e a retomada aplica só o que falta", async () => {
    const m = criarStoreMemoria();
    const texto = lote([1, 2, 3].map((n) => ({ tipo: "continuidade", chave_origem: `c-${n}`, paciente: { nome: `TESTE ${n}`, sd_codigo: `10${n}` }, contexto: `fase ${n}` })));
    m.falhaSimulada.antesDoItem = 1;
    // pior caso: o item 2 foi aplicado mas a gravação do resultado caiu (resultado incerto)
    await expect(confirmarEntrada(m.store, GESTAO, texto)).rejects.toThrow(/falha simulada/);
    const estado = await estadoEntrada(m.store, GESTAO, texto);
    expect(estado.aplicados).toEqual([0]);
    const r = await confirmarEntrada(m.store, GESTAO, texto);
    expect(r).toMatchObject({ jaAplicados: [0], concluido: true });
    expect(m._dados.tarefas.map((t) => t.chaveOrigem).sort()).toEqual(["c-1", "c-2", "c-3"]); // nada duplicado
    expect((await estadoEntrada(m.store, GESTAO, texto)).status).toBe("confirmado");
  });

  it("publicação em trechos chega ao mesmo resultado", async () => {
    const m = criarStoreMemoria();
    const texto = lote([1, 2, 3, 4].map((n) => ({ tipo: "continuidade", chave_origem: `c-${n}`, paciente: { nome: `TESTE ${n}`, sd_codigo: `20${n}` }, contexto: "x" })));
    expect((await confirmarEntrada(m.store, GESTAO, texto, {}, [0, 1])).concluido).toBe(false);
    expect((await confirmarEntrada(m.store, GESTAO, texto, {}, [2, 3])).concluido).toBe(true);
    expect(m._dados.tarefas).toHaveLength(4);
  });

  it("feedback anterior não reabre concluídas", async () => {
    const { store, id } = await tarefaDaGabi();
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", resposta: "sim", resultado: "agendou", situacao: "resolvido" }));
    const r = await analisarFeedback(store, GESTAO, `*Fechamento — 20/10/2026*\n• Paula E. — Agendar fase 2 [T-${id.replace(/-/g, "").slice(0, 6)}]`);
    expect(r.linhas[0]).toMatchObject({ situacao: "concluido" });
  });
});

describe("15–18. feedback, entrega e expediente", () => {
  it("feedback da Gabi traz só os registros dela; registro da gestão não entra", async () => {
    const { store, id } = await tarefaDaGabi();
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", canal: "whatsapp", resposta: "nao", situacao: "aguardando", proximaAcao: "Rever", responsavel: `perfil:${GABI.id}`, prazo: "2026-10-21", feito: "mensagem da Gabi" }));
    await registrarAtividade(store, GESTAO, reg({ categoria: "pendencia", assunto: "Ar-condicionado", situacao: "informativo", feito: "registro do Álvaro" }));
    const { texto } = await carregarFechamento(store, HOJE, GABI.id);
    expect(texto).toContain("mensagem da Gabi");
    expect(texto).not.toContain("registro do Álvaro");
  });

  it("gerar → entregar, versões preservadas, aparece para a gestão; copiar não é entrega", async () => {
    const { store, id } = await tarefaDaGabi();
    await registrarAtividade(store, GABI, reg({ alvos: [{ tipo: "tarefa", id }], categoria: "continuidade", contato: "sim", resposta: "sim", resultado: "agendou", situacao: "resolvido" }));
    await expect(gerarFeedback(store, GESTAO, { id: randomUUID() })).rejects.toThrow(/concierge/);
    const idV1 = randomUUID();
    const v1 = await gerarFeedback(store, GABI, { id: idV1 });
    expect(await gerarFeedback(store, GABI, { id: idV1 })).toMatchObject({ id: idV1, versao: 1 }); // clique repetido
    await marcarCopiado(store, GABI, v1.id);
    expect((await store.feedback(v1.id))).toMatchObject({ status: "gerado", whatsappConfirmadoEm: null });
    await expect(confirmarWhatsapp(store, GABI, v1.id)).rejects.toThrow(/Entregue no sistema/);
    // registro novo depois de gerar: precisa gerar de novo
    await registrarAtividade(store, GABI, reg({ categoria: "pendencia", assunto: "Impressora", situacao: "informativo", feito: "chamado aberto" }));
    await expect(entregarFeedback(store, GABI, v1.id)).rejects.toThrow(/Gere de novo/);
    await gerarFeedback(store, GABI, { id: randomUUID() });
    const entregue = await entregarFeedback(store, GABI, v1.id);
    expect(entregue).toMatchObject({ status: "entregue", versao: 1 });
    expect((await entregarFeedback(store, GABI, v1.id)).entregueEm).toBe(entregue.entregueEm); // idempotente
    await comentarFeedback(store, GESTAO, { id: v1.id, observacao: "Faltou citar a impressora", solicitarAjuste: true });
    await expect(comentarFeedback(store, GABI, { id: v1.id, observacao: "x" })).rejects.toThrow(/gestão/);
    const v2 = await gerarFeedback(store, GABI, { id: randomUUID() });
    expect(v2).toMatchObject({ versao: 2, substitui: v1.id });
    await entregarFeedback(store, GABI, v2.id);
    const lista = await listarFeedbacks(store, GESTAO, { dia: HOJE });
    expect(lista.map((f) => [f.versao, f.status])).toEqual([[2, "entregue"], [1, "entregue"]]);
    expect(lista[1]!.observacaoGestao).toBe("Faltou citar a impressora");
    expect(lista[0]!.registros.length).toBeGreaterThan(0);
    expect((await estadoFeedback(store, GABI.id, HOJE)).situacao).toMatchObject({ tipo: "entregue", versao: 2, ajusteSolicitado: false });
  });

  it("lembrete respeita expediente e horário; sem configuração não declara atraso", () => {
    const cfg = { ...CONFIG_VAZIA, diasExpediente: [1, 2, 3, 4, 5], horarioFechamento: "18:00", excecoes: ["2026-11-02"] };
    expect(situacaoEntrega(CONFIG_VAZIA, [], new Date("2026-10-20T22:00:00Z"))).toEqual({ tipo: "nao_configurado" });
    expect(situacaoEntrega(cfg, [], new Date("2026-10-20T15:00:00Z"))).toEqual({ tipo: "prevista", ate: "18:00" }); // 12h
    expect(situacaoEntrega(cfg, [], new Date("2026-10-20T22:00:00Z"))).toEqual({ tipo: "pendente", desde: "18:00" }); // 19h
    expect(situacaoEntrega(cfg, [], new Date("2026-10-24T22:00:00Z"))).toEqual({ tipo: "sem_expediente" }); // sábado
    expect(situacaoEntrega(cfg, [], new Date("2026-11-02T22:00:00Z"))).toEqual({ tipo: "sem_expediente" }); // exceção
    expect(textoSituacaoEntrega({ tipo: "nao_configurado" })).toBe("Expediente não configurado");
  });
});
