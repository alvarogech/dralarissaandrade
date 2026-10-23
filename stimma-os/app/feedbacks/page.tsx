import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FeedbacksView } from "@/components/fila/FeedbacksView";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo, isDiaIso } from "@/lib/fila/datas";
import { estadoFeedback, listarFeedbacks } from "@/lib/fila/entrega";
import { textoSituacaoEntrega } from "@/lib/fila/expediente";

export const dynamic = "force-dynamic";

/** Feedbacks da Gabi — gestão acompanha entregas, conteúdo, registros de origem e pede ajustes. */
export default async function FeedbacksPage({ searchParams }: { searchParams: { dia?: string } }) {
  const s = await sessaoDaPagina("/feedbacks");
  if (s.tipo === "sem_sessao") redirect("/login");
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="Feedbacks da Gabi" demo={false} gestao>
        <Indisponivel titulo="Feedbacks da Gabi" motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  if (!ctx.ator.gestao) redirect("/fila");
  try {
    const hoje = hojeSaoPaulo();
    const dia = searchParams.dia && isDiaIso(searchParams.dia) && searchParams.dia <= hoje ? searchParams.dia : undefined;
    const config = await ctx.store.config();
    const [feedbacks, hojeEstado] = await Promise.all([
      listarFeedbacks(ctx.store, ctx.ator, { dia }),
      config.conciergeId ? estadoFeedback(ctx.store, config.conciergeId, hoje) : Promise.resolve(null),
    ]);
    return (
      <FilaShell atual="Feedbacks da Gabi" demo={ctx.demo} gestao>
        <FeedbacksView
          hoje={hoje} dia={dia ?? null} feedbacks={feedbacks} conciergeNome={config.conciergeNome ?? "concierge"}
          situacaoHoje={hojeEstado ? textoSituacaoEntrega(hojeEstado.situacao) : "Concierge não configurada"}
          expediente={{ diasExpediente: config.diasExpediente, horarioFechamento: config.horarioFechamento, excecoes: config.excecoes, diasSemAtualizacao: config.diasSemAtualizacao }}
        />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /feedbacks: falha ao carregar", e);
    return (
      <FilaShell atual="Feedbacks da Gabi" demo={ctx.demo} gestao>
        <Indisponivel titulo="Feedbacks da Gabi" motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
