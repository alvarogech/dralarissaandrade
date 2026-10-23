import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FeedbackDiarioView } from "@/components/fila/FeedbackDiarioView";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { carregarFechamento, carregarFila } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const s = await sessaoDaPagina("/fila");
  if (s.tipo === "sem_sessao") redirect("/login");
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="Feedback diário" demo={false} gestao={false}>
        <Indisponivel titulo="Feedback diário" motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  try {
    const [dados, fechamento, perfis, pacientes, estado] = await Promise.all([
      carregarFila(ctx.store), carregarFechamento(ctx.store), ctx.store.perfis(), ctx.store.pacientes(), ctx.store.estadoDoDia(hojeSaoPaulo()),
    ]);
    // A conta da recepção é a da concierge (Gabi); a gestão aparece pelo nome do perfil.
    const usuario = ctx.ator.gestao ? perfis.find((p) => p.id === ctx.ator.id)?.nome ?? "Gestão" : "Gabi";
    return (
      <FilaShell atual="Feedback diário" demo={ctx.demo} gestao={ctx.ator.gestao}>
        <FeedbackDiarioView
          dados={dados} fechamento={fechamento} estado={estado} gestao={ctx.ator.gestao} usuario={usuario} usuarioId={ctx.ator.id} perfis={perfis}
          pacientes={pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
        />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /fila: falha ao carregar a fila", e);
    return (
      <FilaShell atual="Feedback diário" demo={ctx.demo} gestao={ctx.ator.gestao}>
        <Indisponivel titulo="Feedback diário" motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
