import { redirect } from "next/navigation";
import { sessaoDaPagina } from "@/lib/fila/acesso";

export const dynamic = "force-dynamic";

// Fechamento unificado: a concierge presta contas no Feedback diário; a gestão consulta em Feedbacks.
export default async function FechamentoPage({ searchParams }: { searchParams: { dia?: string } }) {
  const s = await sessaoDaPagina("/fechamento");
  if (s.tipo === "sem_sessao") redirect("/login");
  const gestao = s.tipo === "ok" && s.ctx.ator.gestao;
  redirect(gestao ? `/feedbacks${searchParams.dia ? `?dia=${encodeURIComponent(searchParams.dia)}` : ""}` : "/fila");
}
