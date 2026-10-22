import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { FechamentoView } from "@/components/fila/FechamentoView";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo, isDiaIso } from "@/lib/fila/datas";
import { carregarFechamento } from "@/lib/fila/servico";

export const dynamic = "force-dynamic";

export default async function FechamentoPage({ searchParams }: { searchParams: { dia?: string } }) {
  const s = await sessaoDaPagina("/fechamento");
  if (s.tipo === "sem_sessao") redirect("/login");
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="Fechamento" demo={false} gestao={false}>
        <Indisponivel titulo="Fechamento" motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  const hoje = hojeSaoPaulo();
  const dia = searchParams.dia && isDiaIso(searchParams.dia) && searchParams.dia <= hoje ? searchParams.dia : hoje;
  try {
    const dados = await carregarFechamento(ctx.store, dia);
    return (
      <FilaShell atual="Fechamento" demo={ctx.demo} gestao={ctx.ator.gestao}>
        <FechamentoView key={dia} dia={dia} hoje={hoje} inicial={dados} />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /fechamento: falha ao carregar", e);
    return (
      <FilaShell atual="Fechamento" demo={ctx.demo} gestao={ctx.ator.gestao}>
        <Indisponivel titulo="Fechamento" motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
