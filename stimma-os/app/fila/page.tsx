import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FeedbackDiarioView } from "@/components/fila/FeedbackDiarioView";
import { contextoDaSessao } from "@/lib/fila/acesso";
import { carregarFechamento, carregarFila } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const ctx = await contextoDaSessao();
  if (!ctx) redirect("/login");
  const [dados, fechamento, perfis] = await Promise.all([carregarFila(ctx.store), carregarFechamento(ctx.store), ctx.store.perfis()]);
  // A conta da recepção é a da concierge (Gabi); a gestão aparece pelo nome do perfil.
  const usuario = ctx.ator.gestao ? perfis.find((p) => p.id === ctx.ator.id)?.nome ?? "Gestão" : "Gabi";
  return (
    <FilaShell atual="Feedback diário" demo={ctx.demo} gestao={ctx.ator.gestao}>
      <FeedbackDiarioView dados={dados} fechamento={fechamento} gestao={ctx.ator.gestao} usuario={usuario} />
    </FilaShell>
  );
}
