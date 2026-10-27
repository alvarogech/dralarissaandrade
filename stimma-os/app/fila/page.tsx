import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FeedbackDiarioView } from "@/components/fila/FeedbackDiarioView";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { estadoFeedback, listarFeedbacks } from "@/lib/fila/entrega";
import { carregarFechamento, carregarFila } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

/** Feedback diário — só da concierge. A gestão não presta contas aqui: acompanha em /feedbacks. */
export default async function FilaPage() {
  const s = await sessaoDaPagina("/fila");
  if (s.tipo === "sem_sessao") redirect("/login");
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="Registros e histórico" demo={false} gestao={false}>
        <Indisponivel titulo="Feedback diário" motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  if (ctx.ator.gestao) redirect("/feedbacks");
  try {
    const hoje = hojeSaoPaulo();
    const [dados, fechamento, perfis, pacientes, estado, entrega, historico] = await Promise.all([
      carregarFila(ctx.store, hoje, ctx.ator.id), carregarFechamento(ctx.store, hoje, ctx.ator.id), ctx.store.perfis(), ctx.store.pacientes(),
      ctx.store.estadoDoDia(hoje), estadoFeedback(ctx.store, ctx.ator.id, hoje), listarFeedbacks(ctx.store, ctx.ator),
    ]);
    const usuario = perfis.find((p) => p.id === ctx.ator.id)?.nome ?? dados.config.conciergeNome ?? "Concierge";
    return (
      <FilaShell atual="Registros e histórico" demo={ctx.demo} gestao={false} largo>
        <FeedbackDiarioView
          dados={dados} fechamento={fechamento} estado={estado} usuario={usuario} usuarioId={ctx.ator.id} perfis={perfis}
          pacientes={pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
          entrega={entrega} historico={historico} eventosDoDia={fechamento.eventos.map((e) => e.id)}
        />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /fila: falha ao carregar", e);
    return (
      <FilaShell atual="Registros e histórico" demo={ctx.demo} gestao={false}>
        <Indisponivel titulo="Feedback diário" motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
