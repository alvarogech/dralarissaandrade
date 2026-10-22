import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { GestaoView } from "@/components/fila/GestaoView";
import { contextoDaSessao } from "@/lib/fila/acesso";
import { iaConfigurada } from "@/lib/fila/ia";

export const dynamic = "force-dynamic";

export default async function EntradaPage() {
  const ctx = await contextoDaSessao();
  if (!ctx) redirect("/login");
  return (
    <FilaShell atual="Gestão" demo={ctx.demo} gestao={ctx.ator.gestao}>
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-text-primary">Gestão da fila</h1>
        <p className="text-sm text-text-secondary">Alimente a fila da concierge e administre as tarefas. Nada é publicado sem sua confirmação.</p>
      </header>
      {ctx.ator.gestao ? (
        <GestaoView iaDisponivel={iaConfigurada()} />
      ) : (
        <p className="rounded-md border border-border p-4 text-sm text-text-secondary">Esta área é só da gestão.</p>
      )}
    </FilaShell>
  );
}
