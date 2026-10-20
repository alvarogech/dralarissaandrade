import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { EntradaView } from "@/components/fila/EntradaView";
import { contextoDaSessao } from "@/lib/fila/acesso";

export const dynamic = "force-dynamic";

export default async function EntradaPage() {
  const ctx = await contextoDaSessao();
  if (!ctx) redirect("/login");
  return (
    <FilaShell atual="Entrada" demo={ctx.demo} gestao={ctx.ator.gestao}>
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-text-primary">Entrada da gestão</h1>
        <p className="text-sm text-text-secondary">
          Cole o lote <code>stimma-entrada-v1</code>. Nada é gravado antes de você conferir a prévia e confirmar.
        </p>
      </header>
      {ctx.ator.gestao ? (
        <EntradaView />
      ) : (
        <p className="rounded-md border border-border p-4 text-sm text-text-secondary">Esta tela é só da gestão.</p>
      )}
    </FilaShell>
  );
}
