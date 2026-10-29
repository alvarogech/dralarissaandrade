import { redirect } from "next/navigation";
import { FilaShell } from "@/components/fila/FilaShell";
import { Indisponivel } from "@/components/fila/Indisponivel";
import { TrabalhoView } from "@/components/fila/TrabalhoView";
import { RotinaView } from "@/components/fila/RotinaView";
import { AgendaView } from "@/components/fila/AgendaView";
import { CobrancasLegadasView } from "@/components/fila/CobrancasLegadasView";
import { AreaIndisponivel } from "@/components/fila/AreaIndisponivel";
import { MeuDiaView } from "@/components/fila/MeuDiaView";
import { FinalizarDiaView, type Sugestao } from "@/components/fila/FinalizarDiaView";
import { CaixaDoDia, PosProcedimentoView, PrioridadesHerdadasView } from "@/components/fila/PaineisRotina";
import { carregarAgenda, posProcedimento } from "@/lib/fila/agenda";
import { carregarCaixa } from "@/lib/fila/caixa";
import { carregarRotina, contatosDaRotina } from "@/lib/fila/rotina";
import { montarPrestacao, situacaoSolicitacao } from "@/lib/fila/prestacao";
import { prioridadesHerdadas } from "@/lib/fila/prioridades";
import { motivoIndisponivel, sessaoDaPagina } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { estadoFeedback } from "@/lib/fila/entrega";
import { expedienteConfigurado, textoSituacaoEntrega } from "@/lib/fila/expediente";
import { proximoDiaUtil, refDoItem } from "@/lib/fila/fechamento";
import { estadoExpediente, etapaDaQuery, proximaAcao, type EntradaMeuDia } from "@/lib/fila/meu-dia";
import { carregarFila } from "@/lib/fila/servico";
import { FILTROS_PADRAO, contarPorSituacao, filtrarBase, filtrosDaQuery, situacaoTrabalho } from "@/lib/fila/trabalho";

export const dynamic = "force-dynamic";

/**
 * Página inicial dos dois perfis: gestão = "Trabalho da Gabi" (acompanhamento e decisão);
 * concierge = "Meu trabalho" como percurso guiado em duas etapas (rotina → fechamento do dia).
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
    const listaPacientes = pacientes.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const configView = { conciergeId: c.conciergeId, gestorId: c.gestorId, conciergeNome: c.conciergeNome, diasSemAtualizacao: c.diasSemAtualizacao };

    if (!gestao) {
      const pessoas = { eu: ctx.ator.id, conciergeId: c.conciergeId, gestorId: c.gestorId };
      const meus = filtrarBase(dados.itens, { ...FILTROS_PADRAO, situacoes: [], responsavel: "eu" }, pessoas);
      const conta = contarPorSituacao(meus, hoje);
      const estadoHoje = await ctx.store.estadoDoDia(hoje);
      // Rotina, prestação de contas e painéis: cada um falha isolado (a página continua de pé).
      const [prestacao, herdadas, contatos, caixa, pos] = await Promise.all([
        montarPrestacao(ctx.store, ctx.ator.id, hoje, { observacao: estadoHoje.rascunho?.observacao, decisoes: estadoHoje.rascunho?.decisoes }).catch((e) => { console.error("[fila] /trabalho: prestação", e); return null; }),
        prioridadesHerdadas(ctx.store, hoje).catch((e) => { console.error("[fila] /trabalho: prioridades herdadas", e); return null; }),
        contatosDaRotina(ctx.store, ctx.ator.id, hoje).catch((e) => { console.error("[fila] /trabalho: contatos da rotina", e); return {}; }),
        carregarCaixa(ctx.store, ctx.ator, hoje).catch((e) => { console.error("[fila] /trabalho: caixa", e); return null; }),
        posProcedimento(ctx.store, hoje).catch((e) => { console.error("[fila] /trabalho: pós-procedimento", e); return null; }),
      ]);
      const r = prestacao?.fechamento.rotina ?? null;
      const rotinaTotal = r ? r.feitos.length + r.naoSeAplica.length + r.pendentes.length + r.impedimentos.length : 0;
      const entrada: EntradaMeuDia = {
        rotinaRespondidos: r ? rotinaTotal - r.pendentes.length : 0, rotinaTotal, rotinaImpedimentos: r?.impedimentos.length ?? 0,
        eventosHoje: prestacao?.eventos ?? [], rotinaAssinatura: r?.assinatura ?? "", caixaAssinatura: prestacao ? String(prestacao.contadores.caixa_assinatura ?? "") : undefined,
        versoes: fb?.versoes ?? [], atrasadas: conta.atrasada, paraHoje: conta.hoje, aguardandoGestao: conta.aguardando_gestao,
      };
      const estado = estadoExpediente(entrada);
      const entregue = [...(fb?.versoes ?? [])].filter((v) => v.status === "entregue").sort((a, b) => b.versao - a.versao)[0] ?? null;
      const nomeCompleto = perfis.find((p) => p.id === ctx.ator.id)?.nome ?? c.conciergeNome ?? "";
      const nome = nomeCompleto.trim().split(/\s+/)[0] || "Concierge";

      // Onde cada pendência aparece na rotina (uma vez só): solicitações da gestão, prioridades de
      // hoje (atrasadas e de hoje) e, recolhidos, os acompanhamentos em aberto.
      const solicitacoes = dados.itens.filter((i) => i.extraordinaria && (i.responsavelId === ctx.ator.id || i.aguardando === "gestao") && (i.status !== "concluida" || i.concluidaEm === hoje));
      const idsSolicitacoes = solicitacoes.map((i) => i.id);
      const prioridadesHoje = meus.filter((i) => !i.extraordinaria && ["atrasada", "hoje"].includes(situacaoTrabalho(i, hoje)));
      const idsPrioridades = prioridadesHoje.map((i) => i.id);
      const prioAtrasadas = prioridadesHoje.filter((i) => situacaoTrabalho(i, hoje) === "atrasada").length;
      const prioHoje = prioridadesHoje.length - prioAtrasadas;
      const porRef = new Map(dados.itens.filter((i) => i.alvo).map((i) => [refDoItem(i.alvo!), i]));
      const situacaoDaTarefa = Object.fromEntries((herdadas?.itens ?? []).filter((p) => p.ref && porRef.has(p.ref)).map((p) => [p.ref!, porRef.get(p.ref!)!.status]));
      const herdadasAbertas = (herdadas?.itens ?? []).filter((p) => !p.resolvidaEm && !(p.ref && situacaoDaTarefa[p.ref] === "concluida")).length;
      const solAbertas = solicitacoes.filter((i) => i.status !== "concluida");
      const lista = (extra: Partial<React.ComponentProps<typeof TrabalhoView>>) => (
        <TrabalhoView hoje={hoje} proximoDiaUtil={proximoDiaUtil(hoje)} itens={dados.itens} eu={ctx.ator.id} gestao={false} perfis={perfis} pacientes={listaPacientes}
          config={configView} feedbackHoje={null} guiado
          filtrosIniciais={{ ...FILTROS_PADRAO, responsavel: "eu", situacoes: [...FILTROS_PADRAO.situacoes] }}
          filtrosPadrao={{ ...FILTROS_PADRAO, responsavel: "eu", situacoes: [...FILTROS_PADRAO.situacoes] }} {...extra} />
      );
      const emAberto = meus.filter((i) => situacaoTrabalho(i, hoje) !== "concluida" && !idsPrioridades.includes(i.id) && !idsSolicitacoes.includes(i.id)).length;

      const sugestoes: Sugestao[] = [
        ...solAbertas.map((i) => ({ ref: i.alvo ? refDoItem(i.alvo) : null, texto: `${i.titulo}${i.semPaciente ? "" : ` — ${i.pacienteNome}`}`, motivo: "solicitação da gestão", paciente: i.semPaciente ? null : i.pacienteNome, data: i.due, origem: "solicitação da gestão" })),
        ...(prestacao?.fechamento.sugestoes ?? []).map((s) => ({ ref: s.ref, texto: s.texto, motivo: s.motivo, origem: "pendência" })),
        ...(r?.impedimentos ?? []).map((i) => ({ ref: null, texto: `${i.item}: ${i.proxima}`, motivo: "impedimento", data: i.prazo, origem: "impedimento" })),
      ].filter((s, k, todas) => todas.findIndex((x) => (s.ref ? x.ref === s.ref : x.texto === s.texto)) === k); // mesma origem, uma sugestão só

      return (
        <FilaShell atual={atual} demo={ctx.demo} gestao={false} largo>
          <MeuDiaView
            nome={nome} hoje={hoje} estado={estado} proxima={proximaAcao(entrada, estado)} etapaInicial={etapaDaQuery(searchParams.etapa)}
            resumo={{ rotina: r ? { respondidos: entrada.rotinaRespondidos, total: rotinaTotal, impedimentos: entrada.rotinaImpedimentos } : null, atrasadas: conta.atrasada, paraHoje: conta.hoje, aguardandoGestao: conta.aguardando_gestao }}
            conteudo={{
              rotina: rotina
                ? <RotinaView rotina={rotina} perfis={perfis} tarefas={tarefasRotina} hoje={hoje} titulo="Minha rotina de hoje" embutida motivoLeitura={rotina.dia !== hoje ? "dia anterior" : undefined}
                    contatos={contatos} pacientes={listaPacientes} usuarioId={ctx.ator.id} proximoDiaUtil={proximoDiaUtil(hoje)}
                    extras={{
                      prioridades: {
                        resumo: [herdadas ? `${herdadasAbertas} do dia anterior` : "", prioAtrasadas ? `${prioAtrasadas} atrasada${prioAtrasadas === 1 ? "" : "s"}` : "", prioHoje ? `${prioHoje} para hoje` : ""].filter(Boolean).join(" · ") || "Nada atrasado nem vencendo hoje",
                        atencao: prioAtrasadas > 0,
                        conteudo: (
                          <div className="flex flex-col gap-3">
                            {herdadas && <PrioridadesHerdadasView herdadas={herdadas} situacaoDaTarefa={situacaoDaTarefa} editavel={rotina.editavel} />}
                            {lista({ compacto: true, somenteIds: idsPrioridades, vazio: "Nenhuma pendência atrasada ou vencendo hoje." })}
                          </div>
                        ),
                      },
                      inicio: { conteudo: agenda ? <AgendaView agenda={agenda} /> : <AreaIndisponivel titulo="Agenda de hoje e amanhã" motivo="Não foi possível ler a agenda sincronizada. Confira a agenda no Simples Dental." /> },
                      relacionamento: {
                        resumo: emAberto ? `${emAberto} acompanhamento${emAberto === 1 ? "" : "s"} em aberto` : undefined,
                        conteudo: (
                          <div className="flex flex-col gap-3">
                            {pos && <PosProcedimentoView dias={pos.dias} itens={pos.itens} />}
                            <details className="rounded-control border border-border bg-surface">
                              <summary className="cursor-pointer px-3 py-2.5 text-[14px] font-medium text-text-primary">Acompanhamentos em aberto ({emAberto})</summary>
                              <div className="border-t border-border p-3">{lista({ excluirIds: [...idsPrioridades, ...idsSolicitacoes] })}</div>
                            </details>
                          </div>
                        ),
                      },
                      financeiro: {
                        resumo: caixa ? (caixa.tipo === "nao_conferido" ? "Recebimentos ainda não conferidos" : "Recebimentos conferidos") : undefined,
                        conteudo: (
                          <div className="flex flex-col gap-3">
                            {caixa ? <CaixaDoDia inicial={caixa} editavel={rotina.editavel} /> : <AreaIndisponivel titulo="Recebimentos do dia" motivo="Não foi possível carregar a conferência de recebimentos agora (se for a primeira vez, a migration 0018 pode não ter sido aplicada)." />}
                            <CobrancasLegadasView itens={dados.cobrancasRotineiras} gestao={false} nomeConcierge={nomeConcierge} />
                          </div>
                        ),
                      },
                      gestao: {
                        resumo: solAbertas.length ? `${solAbertas.length} em aberto${solAbertas.some((i) => i.due < hoje) ? ` · ${solAbertas.filter((i) => i.due < hoje).length} atrasada(s)` : ""}` : "Nenhuma em aberto",
                        atencao: solAbertas.some((i) => i.due < hoje),
                        conteudo: lista({ compacto: true, somenteIds: idsSolicitacoes, vazio: "Nenhuma solicitação da gestão em aberto." }),
                      },
                    }} />
                : <AreaIndisponivel titulo="Rotina do dia" motivo="Não foi possível carregar a rotina agora. Tente de novo em instantes; se continuar, avise a gestão." />,
              fechamento: prestacao ? (
                <FinalizarDiaView
                  hoje={hoje} proximoDia={prestacao.fechamento.proximoDia} fechamento={prestacao.fechamento} texto={prestacao.texto} estado={estado} entregue={entregue}
                  aguardandoGestao={conta.aguardando_gestao} atrasadas={conta.atrasada} contatos={prestacao.contatos} caixa={prestacao.caixa}
                  solicitacoes={prestacao.solicitacoes.map((i) => ({ id: i.id, titulo: i.titulo, paciente: i.semPaciente ? null : i.pacienteNome, solicitadoPor: i.solicitadoPor ?? null, situacao: situacaoSolicitacao(i, hoje) }))}
                  rascunho={estadoHoje.rascunho ?? {}} prioridades={estadoHoje.prioridades} sugestoes={sugestoes} indicadores={prestacao.indicadores}
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
