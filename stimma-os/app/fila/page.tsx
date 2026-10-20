import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FilaView } from "@/components/fila/FilaView";
import { contextoDaSessao } from "@/lib/fila/acesso";
import { carregarFila } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const ctx = await contextoDaSessao();
  if (!ctx) redirect("/login");
  const dados = await carregarFila(ctx.store);
  return (
    <FilaShell atual="Fila" demo={ctx.demo} gestao={ctx.ator.gestao}>
      <FilaView dados={dados} gestao={ctx.ator.gestao} />
    </FilaShell>
  );
}
