import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { TrabalhoView } from "@/components/fila/TrabalhoView";
import { RotinaView } from "@/components/fila/RotinaView";
import { AgendaView } from "@/components/fila/AgendaView";
import { CobrancasLegadasView } from "@/components/fila/CobrancasLegadasView";
import { AreaIndisponivel } from "@/components/fila/AreaIndisponivel";
import { MeuDiaView } from "@/components/fila/MeuDiaView";
import { FinalizarDiaView } from "@/components/fila/FinalizarDiaView";
import { carregarAgenda } from "@/lib/fila/agenda";
import { carregarRotina } from "@/lib/fila/rotina";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { estadoFeedback } from "@/lib/fila/entrega";
import { expedienteConfigurado, textoSituacaoEntrega } from "@/lib/fila/expediente";
import { proximoDiaUtil } from "@/lib/fila/fechamento";
import { estadoExpediente, etapaDaQuery, proximaAcao, type EntradaMeuDia } from "@/lib/fila/meu-dia";
import { carregarFechamento, carregarFila } from "@/lib/fila/servico";
import { FILTROS_PADRAO, contarPorSituacao, filtrarBase, filtrosDaQuery } from "@/lib/fila/trabalho";

export const dynamic = "force-dynamic";

/**
 * Página inicial dos dois perfis: gestão = "Trabalho da Gabi" (acompanhamento e decisão);
 * concierge = "Meu trabalho" como percurso guiado (rotina → pendências → finalizar o dia).
 */
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
    // Tudo em paralelo; rotina, agenda e resumo do dia são áreas próprias: se falharem, só elas mostram erro.
    const [dados, perfis, pacientes, fb, agenda, rotina, fechamento] = await Promise.all([
      carregarFila(ctx.store, hoje, ctx.ator.id), ctx.store.perfis(), ctx.store.pacientes(),
      responsavel ? estadoFeedback(ctx.store, responsavel, hoje) : Promise.resolve(null),
      carregarAgenda(ctx.store, hoje).catch((e) => { console.error("[fila] /trabalho: agenda", e); return null; }),
      responsavel ? carregarRotina(ctx.store, ctx.ator, { usuarioId: responsavel }).catch((e) => { console.error("[fila] /trabalho: rotina", e); return null; }) : Promise.resolve(null),
      gestao ? Promise.resolve(null) : carregarFechamento(ctx.store, hoje, ctx.ator.id).catch((e) => { console.error("[fila] /trabalho: fechamento", e); return null; }),
    ]);
    const c = dados.config;
    const nomeConcierge = c.conciergeNome ?? "concierge";
    // Tarefas abertas da responsável: um item da rotina pode apontar para elas em vez de duplicar.
    const tarefasRotina = dados.itens
      .filter((i) => i.alvo?.tipo === "tarefa" && i.status !== "concluida" && (!responsavel || i.responsavelId === responsavel))
      .map((i) => ({ id: i.alvo!.id, rotulo: `${i.pacienteNome} — ${i.titulo}` }));
    const listaPacientes = pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const configView = { conciergeId: c.conciergeId, gestorId: c.gestorId, conciergeNome: c.conciergeNome, diasSemAtualizacao: c.diasSemAtualizacao };

    if (!gestao) {
      const pessoas = { eu: ctx.ator.id, conciergeId: c.conciergeId, gestorId: c.gestorId };
      const conta = contarPorSituacao(filtrarBase(dados.itens, { ...FILTROS_PADRAO, situacoes: [], responsavel: "eu" }, pessoas), hoje);
      const r = fechamento?.fechamento.rotina ?? null;
      const rotinaTotal = r ? r.feitos.length + r.naoSeAplica.length + r.pendentes.length + r.impedimentos.length : 0;
      const entrada: EntradaMeuDia = {
        rotinaRespondidos: r ? rotinaTotal - r.pendentes.length : 0, rotinaTotal, rotinaImpedimentos: r?.impedimentos.length ?? 0,
        eventosHoje: fechamento?.eventos.map((e) => e.id) ?? [], rotinaAssinatura: r?.assinatura ?? "",
        versoes: fb?.versoes ?? [], atrasadas: conta.atrasada, paraHoje: conta.hoje, aguardandoGestao: conta.aguardando_gestao,
      };
      const estado = estadoExpediente(entrada);
      const entregue = [...(fb?.versoes ?? [])].filter((v) => v.status === "entregue").sort((a, b) => b.versao - a.versao)[0] ?? null;
      const nomeCompleto = perfis.find((p) => p.id === ctx.ator.id)?.nome ?? c.conciergeNome ?? "";
      const nome = nomeCompleto.trim().split(/\s+/)[0] || "Concierge";
      return (
        <FilaShell atual={atual} demo={ctx.demo} gestao={false} largo>
          <MeuDiaView
            nome={nome} hoje={hoje} estado={estado} proxima={proximaAcao(entrada, estado)} etapaInicial={etapaDaQuery(searchParams.etapa)}
            resumo={{ rotina: r ? { respondidos: entrada.rotinaRespondidos, total: rotinaTotal, impedimentos: entrada.rotinaImpedimentos } : null, atrasadas: conta.atrasada, paraHoje: conta.hoje, aguardandoGestao: conta.aguardando_gestao }}
            conteudo={{
              rotina: (
                <div className="flex flex-col gap-4">
                  {rotina
                    ? <RotinaView rotina={rotina} perfis={perfis} tarefas={tarefasRotina} hoje={hoje} titulo="Minha rotina de hoje" embutida motivoLeitura={rotina.dia !== hoje ? "dia anterior" : undefined} />
                    : <AreaIndisponivel titulo="Rotina do dia" motivo="Não foi possível carregar a rotina agora. Tente de novo em instantes; se continuar, avise a gestão." />}
                  {agenda ? <AgendaView agenda={agenda} /> : <AreaIndisponivel titulo="Agenda de hoje e amanhã" motivo="Não foi possível ler a agenda sincronizada. Confira a agenda no Simples Dental." />}
                </div>
              ),
              pendencias: (
                <div className="flex flex-col gap-4">
                  <CobrancasLegadasView itens={dados.cobrancasRotineiras} gestao={false} nomeConcierge={nomeConcierge} />
                  <TrabalhoView
                    hoje={hoje} proximoDiaUtil={proximoDiaUtil(hoje)} itens={dados.itens} eu={ctx.ator.id} gestao={false} perfis={perfis} pacientes={listaPacientes}
                    config={configView} feedbackHoje={null} guiado
                    filtrosIniciais={{ ...FILTROS_PADRAO, responsavel: "eu", situacoes: [...FILTROS_PADRAO.situacoes] }}
                    filtrosPadrao={{ ...FILTROS_PADRAO, responsavel: "eu", situacoes: [...FILTROS_PADRAO.situacoes] }}
                  />
                </div>
              ),
              finalizar: fechamento ? (
                <FinalizarDiaView
                  hoje={hoje} fechamento={fechamento.fechamento} texto={fechamento.texto} estado={estado} entregue={entregue}
                  aguardandoGestao={conta.aguardando_gestao} atrasadas={conta.atrasada}
                  encaminhamentosComercial={fechamento.eventos.filter((e) => e.categoria === "encaminhamento").length}
                />
              ) : <AreaIndisponivel titulo="Resumo do dia" motivo="Não foi possível montar o resumo agora. Seus registros estão salvos; tente de novo em instantes." />,
            }}
          />
        </FilaShell>
      );
    }

    const antes = (
      <>
        {responsavel && (rotina
          ? <RotinaView rotina={rotina} perfis={perfis} tarefas={tarefasRotina} hoje={hoje} titulo={`Rotina da ${nomeConcierge}`} abertaInicial={false}
              gestao motivoLeitura={`quem marca é a ${nomeConcierge}, pela conta dela`} />
          : <AreaIndisponivel titulo="Rotina do dia" motivo="Não foi possível carregar a rotina agora (se for a primeira vez, a migration 0015 pode não ter sido aplicada)." />)}
        <CobrancasLegadasView itens={dados.cobrancasRotineiras} gestao nomeConcierge={nomeConcierge} />
        {agenda ? <AgendaView agenda={agenda} /> : <AreaIndisponivel titulo="Agenda de hoje e amanhã" motivo="Não foi possível ler a agenda sincronizada. Confira a agenda no Simples Dental." />}
      </>
    );
    const base = { ...FILTROS_PADRAO, situacoes: ["atrasada", "hoje", "aguardando_gestao"] as const, responsavel: "todos" as const };
    return (
      <FilaShell atual={atual} demo={ctx.demo} gestao={gestao} largo>
        <TrabalhoView
          hoje={hoje} proximoDiaUtil={proximoDiaUtil(hoje)} itens={dados.itens} eu={ctx.ator.id} gestao={gestao} perfis={perfis}
          pacientes={listaPacientes}
          config={configView}
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
