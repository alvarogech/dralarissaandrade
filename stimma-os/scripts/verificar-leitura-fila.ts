// Diagnóstico SOMENTE LEITURA da fila contra o banco configurado (npm run fila:verificar-leitura).
// Não chama nenhuma função de escrita.
import { createClient } from "@supabase/supabase-js";
import { criarStoreSupabase } from "../lib/fila/store-supabase";
import { carregarFila, carregarFechamento, listarTarefasGestao, tarefasAbertasResumo } from "../lib/fila/servico";
import { carregarAgenda } from "../lib/fila/agenda";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: org } = await db.from("organizations").select("id, name").limit(1).single();
console.log("organizacao:", org?.name);
const store = criarStoreSupabase(db, org!.id);
const etapas: [string, () => Promise<unknown>][] = [
  ["pacientes", () => store.pacientes().then((r) => r.length)],
  ["perfis", () => store.perfis().then((r) => r.length)],
  ["carregarFila", () => carregarFila(store).then((r) => ({ atrasadas: r.fila.atrasadas.length, hoje: r.fila.hoje.length, itens: r.itens.length }))],
  ["carregarFechamento", () => carregarFechamento(store).then((r) => ({ blocos: r.fechamento.blocos.length, registros: r.fechamento.contadores.registros, linhasTexto: r.texto.split("\n").length }))],
  ["listarTarefasGestao", () => listarTarefasGestao(store).then((r) => ({ tarefas: r.tarefas.length, pacientes: r.pacientes.length }))],
  ["tarefasAbertasResumo", () => tarefasAbertasResumo(store).then((r) => r.length)],
  ["registrosPorChave", () => store.registrosPorChave(["chave-inexistente"]).then((r) => r.length)],
  ["loteExiste", () => store.loteExiste("hash-inexistente")],
  ["resolverRef", () => store.resolverRef("tarefa", "abcdef")],
  ["eventosDoAlvo", () => store.eventosDoAlvo({ tarefaId: "00000000-0000-4000-8000-000000000000" }).then((r) => r.length)],
  ["numerosDoDia", () => store.numerosDoDia("2026-10-22")],
  // 0014: configuração, nomes de exibição, leituras, feedbacks e lote retomável
  ["config", () => store.config().then((c) => ({ concierge: !!c.conciergeId, nome: c.conciergeNome, gestor: !!c.gestorId, expediente: c.diasExpediente, fechamento: c.horarioFechamento, semAtualizacao: c.diasSemAtualizacao }))],
  ["perfisExibicao", () => store.perfis().then((r) => r.map((p) => p.nome))],
  ["carregarFilaComUsuario", async () => {
    const c = await store.config();
    const r = await carregarFila(store, undefined, c.gestorId ?? undefined);
    const tarefas = r.itens.filter((i) => i.alvo?.tipo === "tarefa");
    return { itens: r.itens.length, tarefas: tarefas.length, semResponsavel: tarefas.filter((i) => !i.responsavelId).length, naoLidos: r.itens.filter((i) => i.naoLido).length, ocorrencias: tarefas.map((i) => i.ocorrencia ?? "não informada") };
  }],
  ["fechamentoDaConcierge", async () => {
    const c = await store.config();
    const r = await carregarFechamento(store, undefined, c.conciergeId ?? undefined);
    return { registros: r.fechamento.contadores.registros, pendentes: r.fechamento.pendentesAbertas.length };
  }],
  ["ultimosEventos", () => store.ultimosEventos(["00000000-0000-4000-8000-000000000000"])],
  ["leituras", () => store.leituras("00000000-0000-4000-8000-000000000000", ["00000000-0000-4000-8000-000000000000"])],
  ["feedbacks", () => store.feedbacks({ desde: "2026-10-01" }).then((r) => r.length)],
  ["loteDoHash", () => store.loteDoHash("2fclbfjyabj").then((l) => l && { status: l.status, itens: l.itens.length, aplicados: l.itens.filter((i) => i.aplicado).length })],
  // 0015: rotina diária e agenda sincronizada (leitura)
  ["rotinaDaConcierge", async () => {
    const c = await store.config();
    if (!c.conciergeId) return "sem concierge";
    const [hoje, anterior] = await Promise.all([store.rotina(c.conciergeId, new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })), store.rotinaAnterior(c.conciergeId, "2099-01-01")]);
    return { linhasHoje: hoje.length, ultimoDia: anterior?.dia ?? null };
  }],
  ["agendaHojeAmanha", async () => {
    const r = await carregarAgenda(store);
    return { hoje: r.itensHoje.length, amanha: r.itensAmanha.length, ultimaSync: r.ultimaSync, atualizada: r.atualizada };
  }],
  ["fechamentoComRotina", async () => {
    const c = await store.config();
    const r = await carregarFechamento(store, undefined, c.conciergeId ?? undefined);
    return { rotinaNoTexto: r.texto.includes("*Rotina do dia*"), registrada: r.fechamento.rotina?.registrada ?? null };
  }],
];
for (const [nome, f] of etapas) {
  try { console.log("OK  ", nome, JSON.stringify(await f())); } catch (e) { console.log("FALHA", nome, (e as Error).message); }
}
