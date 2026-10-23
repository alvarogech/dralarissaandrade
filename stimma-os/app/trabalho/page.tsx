import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { TrabalhoView } from "@/components/fila/TrabalhoView";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { estadoFeedback } from "@/lib/fila/entrega";
import { textoSituacaoEntrega } from "@/lib/fila/expediente";
import { proximoDiaUtil } from "@/lib/fila/fechamento";
import { carregarFila } from "@/lib/fila/servico";
import { FILTROS_PADRAO, filtrosDaQuery } from "@/lib/fila/trabalho";

export const dynamic = "force-dynamic";

/** Página inicial dos dois perfis: gestão = "Trabalho da Gabi"; concierge = "Meu trabalho". */
export default async function TrabalhoPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const s = await sessaoDaPagina("/trabalho");
  if (s.tipo === "sem_sessao") redirect("/login");
  const titulo = "Trabalho";
  if (s.tipo === "indisponivel") {
    return (
      <FilaShell atual="" demo={false} gestao={false}>
        <Indisponivel titulo={titulo} motivo={s.motivo} />
      </FilaShell>
    );
  }
  const { ctx } = s;
  const gestao = ctx.ator.gestao;
  const atual = gestao ? "Trabalho da Gabi" : "Meu trabalho";
  try {
    const hoje = hojeSaoPaulo();
    const [dados, perfis, pacientes] = await Promise.all([carregarFila(ctx.store, hoje, ctx.ator.id), ctx.store.perfis(), ctx.store.pacientes()]);
    const c = dados.config;
    const responsavelFeedback = gestao ? c.conciergeId : ctx.ator.id;
    const fb = responsavelFeedback ? await estadoFeedback(ctx.store, responsavelFeedback, hoje) : null;
    const base = gestao
      ? { ...FILTROS_PADRAO, situacoes: ["atrasada", "hoje", "aguardando_gestao"] as const, responsavel: "todos" as const }
      : { ...FILTROS_PADRAO, responsavel: "eu" as const };
    return (
      <FilaShell atual={atual} demo={ctx.demo} gestao={gestao}>
        <TrabalhoView
          hoje={hoje} proximoDiaUtil={proximoDiaUtil(hoje)} itens={dados.itens} eu={ctx.ator.id} gestao={gestao} perfis={perfis}
          pacientes={pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
          config={{ conciergeId: c.conciergeId, gestorId: c.gestorId, conciergeNome: c.conciergeNome, diasSemAtualizacao: c.diasSemAtualizacao }}
          feedbackHoje={fb ? { texto: textoSituacaoEntrega(fb.situacao), tipo: fb.situacao.tipo } : null}
          filtrosIniciais={filtrosDaQuery(searchParams, { ...base, situacoes: [...base.situacoes] })}
        />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /trabalho: falha ao carregar", e);
    return (
      <FilaShell atual={atual} demo={ctx.demo} gestao={gestao}>
        <Indisponivel titulo={titulo} motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
