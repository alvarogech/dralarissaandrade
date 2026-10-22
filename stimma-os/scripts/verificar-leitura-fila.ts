// Diagnóstico SOMENTE LEITURA da fila contra o banco configurado (npm run fila:verificar-leitura).
// Não chama nenhuma função de escrita.
import { createClient } from "@supabase/supabase-js";
import { criarStoreSupabase } from "../lib/fila/store-supabase";
import { carregarFila, carregarFechamento, listarTarefasGestao, tarefasAbertasResumo } from "../lib/fila/servico";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: org } = await db.from("organizations").select("id, name").limit(1).single();
console.log("organizacao:", org?.name);
const store = criarStoreSupabase(db, org!.id);
const etapas: [string, () => Promise<unknown>][] = [
  ["pacientes", () => store.pacientes().then((r) => r.length)],
  ["perfis", () => store.perfis().then((r) => r.length)],
  ["carregarFila", () => carregarFila(store).then((r) => ({ atrasadas: r.fila.atrasadas.length, hoje: r.fila.hoje.length, itens: r.itens.length }))],
  ["carregarFechamento", () => carregarFechamento(store).then((r) => ({ acoes: r.fechamento.acoes.length, linhasTexto: r.texto.split("\n").length }))],
  ["listarTarefasGestao", () => listarTarefasGestao(store).then((r) => ({ tarefas: r.tarefas.length, pacientes: r.pacientes.length }))],
  ["tarefasAbertasResumo", () => tarefasAbertasResumo(store).then((r) => r.length)],
  ["registrosPorChave", () => store.registrosPorChave(["chave-inexistente"]).then((r) => r.length)],
  ["loteExiste", () => store.loteExiste("hash-inexistente")],
  ["resolverRef", () => store.resolverRef("tarefa", "abcdef")],
  ["eventosDoAlvo", () => store.eventosDoAlvo({ tarefaId: "00000000-0000-4000-8000-000000000000" }).then((r) => r.length)],
  ["numerosDoDia", () => store.numerosDoDia("2026-10-22")],
];
for (const [nome, f] of etapas) {
  try { console.log("OK  ", nome, JSON.stringify(await f())); } catch (e) { console.log("FALHA", nome, (e as Error).message); }
}
