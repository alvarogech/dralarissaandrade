import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { GestaoView } from "@/components/fila/GestaoView";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { sessaoDaPagina } from "@/lib/fila/acesso";
import { iaConfigurada } from "@/lib/fila/ia";

export const dynamic = "force-dynamic";

export default async function EntradaPage() {
  const s = await sessaoDaPagina("/entrada");
  if (s.tipo === "sem_sessao") redirect("/login");
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="Entrada e tarefas" demo={false} gestao>
        <Indisponivel titulo="Gestão da fila" motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  if (!ctx.ator.gestao) redirect("/trabalho"); // área só da gestão (as rotas também checam o papel)
  return (
    <FilaShell atual="Entrada e tarefas" demo={ctx.demo} gestao>
      <header className="mb-8">
        <p className="fb-eyebrow">Gestão</p>
        <h1 className="fb-titulo mt-2">Entrada e tarefas</h1>
        <p className="mt-1.5 text-sm text-text-secondary">Cole levantamentos, revise e publique propostas, crie e edite tarefas. Nada é publicado sem sua confirmação.</p>
      </header>
      <GestaoView iaDisponivel={iaConfigurada()} />
    </FilaShell>
  );
}
