import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FechamentoView } from "@/components/fila/FechamentoView";
import { contextoDaSessao } from "@/lib/fila/acesso";
import { hojeSaoPaulo, isDiaIso } from "@/lib/fila/datas";
import { carregarFechamento } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

export default async function FechamentoPage({ searchParams }: { searchParams: { dia?: string } }) {
  const ctx = await contextoDaSessao();
  if (!ctx) redirect("/login");
  const hoje = hojeSaoPaulo();
  const dia = searchParams.dia && isDiaIso(searchParams.dia) && searchParams.dia <= hoje ? searchParams.dia : hoje;
  const dados = await carregarFechamento(ctx.store, dia);
  return (
    <FilaShell atual="Fechamento" demo={ctx.demo} gestao={ctx.ator.gestao}>
      <FechamentoView key={dia} dia={dia} hoje={hoje} inicial={dados} />
    </FilaShell>
  );
}
