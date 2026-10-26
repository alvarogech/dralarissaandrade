import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { TrabalhoView } from "@/components/fila/TrabalhoView";
import { RotinaView } from "@/components/fila/RotinaView";
import { AgendaView } from "@/components/fila/AgendaView";
import { CobrancasLegadasView } from "@/components/fila/CobrancasLegadasView";
import { AreaIndisponivel } from "@/components/fila/AreaIndisponivel";
import { carregarAgenda } from "@/lib/fila/agenda";
import { carregarRotina } from "@/lib/fila/rotina";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { estadoFeedback } from "@/lib/fila/entrega";
import { expedienteConfigurado, textoSituacaoEntrega } from "@/lib/fila/expediente";
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
    const config = await ctx.store.config(); // lida uma vez por requisição (cache do store)
    const responsavel = gestao ? config.conciergeId : ctx.ator.id;
    // Tudo em paralelo; rotina e agenda são áreas próprias: se falharem, só elas mostram erro.
    const [dados, perfis, pacientes, fb, agenda, rotina] = await Promise.all([
      carregarFila(ctx.store, hoje, ctx.ator.id), ctx.store.perfis(), ctx.store.pacientes(),
      responsavel ? estadoFeedback(ctx.store, responsavel, hoje) : Promise.resolve(null),
      carregarAgenda(ctx.store, hoje).catch((e) => { console.error("[fila] /trabalho: agenda", e); return null; }),
      responsavel ? carregarRotina(ctx.store, ctx.ator, { usuarioId: responsavel }).catch((e) => { console.error("[fila] /trabalho: rotina", e); return null; }) : Promise.resolve(null),
    ]);
    const c = dados.config;
    const nomeConcierge = c.conciergeNome ?? "concierge";
    // Tarefas abertas da responsável: um item da rotina pode apontar para elas em vez de duplicar.
    const tarefasRotina = dados.itens
      .filter((i) => i.alvo?.tipo === "tarefa" && i.status !== "concluida" && (!responsavel || i.responsavelId === responsavel))
      .map((i) => ({ id: i.alvo!.id, rotulo: `${i.pacienteNome} — ${i.titulo}` }));
    const antes = (
      <>
        {responsavel && (rotina
          ? <RotinaView rotina={rotina} perfis={perfis} tarefas={tarefasRotina} hoje={hoje} titulo={gestao ? `Rotina da ${nomeConcierge}` : "Minha rotina de hoje"} abertaInicial={!gestao}
              gestao={gestao} motivoLeitura={gestao ? `quem marca é a ${nomeConcierge}, pela conta dela` : rotina.dia !== hoje ? "dia anterior" : undefined} />
          : <AreaIndisponivel titulo="Rotina do dia" motivo="Não foi possível carregar a rotina agora (se for a primeira vez, a migration 0015 pode não ter sido aplicada)." />)}
        <CobrancasLegadasView itens={dados.cobrancasRotineiras} gestao={gestao} nomeConcierge={nomeConcierge} />
        {agenda ? <AgendaView agenda={agenda} /> : <AreaIndisponivel titulo="Agenda de hoje e amanhã" motivo="Não foi possível ler a agenda sincronizada. Confira a agenda no Simples Dental." />}
      </>
    );
    const base = gestao
      ? { ...FILTROS_PADRAO, situacoes: ["atrasada", "hoje", "aguardando_gestao"] as const, responsavel: "todos" as const }
      : { ...FILTROS_PADRAO, responsavel: "eu" as const };
    return (
      <FilaShell atual={atual} demo={ctx.demo} gestao={gestao} largo>
        <TrabalhoView
          hoje={hoje} proximoDiaUtil={proximoDiaUtil(hoje)} itens={dados.itens} eu={ctx.ator.id} gestao={gestao} perfis={perfis}
          pacientes={pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
          config={{ conciergeId: c.conciergeId, gestorId: c.gestorId, conciergeNome: c.conciergeNome, diasSemAtualizacao: c.diasSemAtualizacao }}
          feedbackHoje={fb ? { texto: textoSituacaoEntrega(fb.situacao), tipo: fb.situacao.tipo } : null}
          filtrosIniciais={filtrosDaQuery(searchParams, { ...base, situacoes: [...base.situacoes] })}
          filtrosPadrao={{ ...base, situacoes: [...base.situacoes] }}
          expedienteConfigurado={expedienteConfigurado(c)}
          antes={antes}
        />
      </FilaShell>
    );
  } catch (e) {
    console.error("[fila] /trabalho: falha ao carregar", e);
    return (
      <FilaShell atual={atual} demo={ctx.demo} gestao={gestao} largo>
        <Indisponivel titulo={titulo} motivo={motivoIndisponivel(e)} />
      </FilaShell>
    );
  }
}
