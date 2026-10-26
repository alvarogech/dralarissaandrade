"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BLOCOS, type Fechamento } from "@/lib/fila/fechamento";
import type { FilaCarregada } from "@/lib/fila/servico";
import type { EstadoDoFeedback, FeedbackComRegistros } from "@/lib/fila/entrega";
import { textoSituacaoEntrega } from "@/lib/fila/expediente";
import { contarPorSituacao, filtrarBase, FILTROS_PADRAO } from "@/lib/fila/trabalho";
import type { Categoria, EstadoDoDia, FeedbackRow, NumerosDoDia } from "@/lib/fila/store";
import { Campo, chamarApi, classeInput, dataBr, horaBr, numeroBr } from "./comum";
import { ProvedorFila } from "./contexto";
import { FormRegistro, type TipoRegistro } from "./FormRegistro";

/**
 * Feedback diário da concierge (padrão do feedback-concierge.html) — a área única de prestação de
 * contas. Os registros do dia por área em seções recolhíveis; ao lado, o resumo e a entrega:
 * rascunho (prévia ao vivo, montada dos registros persistidos) → gerado (versão para revisão) →
 * entregue à gestão (ação explícita). Copiar ≠ entregar ≠ enviado pelo WhatsApp. A lista de
 * tarefas fica em "Meu trabalho" (sem caminho concorrente).
 */
interface Props {
  dados: FilaCarregada;
  fechamento: { fechamento: Fechamento; texto: string };
  estado: EstadoDoDia;
  usuario: string;
  usuarioId: string;
  perfis: { id: string; nome: string }[];
  pacientes: { id: string; nome: string }[];
  entrega: EstadoDoFeedback;
  historico: FeedbackComRegistros[];
  /** Ids dos registros de hoje da concierge (para saber se a versão gerada ficou desatualizada). */
  eventosDoDia: string[];
}

function Secao({ n, titulo, resumo, tom, abertaInicial = false, children }: { n: string; titulo: string; resumo?: string; tom?: "ok" | "pendente"; abertaInicial?: boolean; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <section className="fb-card mb-3.5 overflow-hidden">
      <button type="button" onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={aberta}>
        <span className="fb-num">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[22px] font-medium leading-tight text-text-primary">{titulo}</span>
          {resumo && <span className={clsx("mt-0.5 block text-xs", tom === "ok" ? "text-opportunity" : "text-text-muted")}>{resumo}</span>}
        </span>
        <span className="text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && <div className="border-t border-border px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

/** Tipo de registro sugerido ao adicionar a partir de uma seção da área. */
const TIPO_DO_BLOCO: Record<(typeof BLOCOS)[number]["id"], TipoRegistro> = {
  agenda: "falta", oportunidade: "oportunidade", recorrencia: "recorrencia", continuidade: "continuidade", pos: "pos_atendimento", pendencia: "pendencia",
};

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function FeedbackDiarioView({ dados, fechamento, estado, usuario, usuarioId, perfis, pacientes, entrega, historico, eventosDoDia }: Props) {
  const router = useRouter();
  const { hoje, itens } = dados;
  const f = fechamento.fechamento;
  const [novo, setNovo] = useState<{ tipo?: TipoRegistro; chave: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const n0 = f.numeros;
  const [agenda, setAgenda] = useState({ prevista: txt(n0?.agendaPrevista), realizada: txt(n0?.agendaRealizada) });
  const [escolhidas, setEscolhidas] = useState<{ ref: string | null; texto: string }[]>(estado.prioridades);
  const [manual, setManual] = useState("");

  const pessoas = { eu: usuarioId, conciergeId: dados.config.conciergeId, gestorId: dados.config.gestorId };
  const meus = contarPorSituacao(filtrarBase(itens, { ...FILTROS_PADRAO, situacoes: [], responsavel: "eu" }, pessoas), hoje);

  function abrirNovo(tipo?: TipoRegistro) {
    setNovo({ tipo, chave: Date.now() });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarDia(corpo: Partial<EstadoDoDia>, rotulo: string) {
    setMsg(null);
    setSalvando(rotulo);
    const r = await chamarApi("/api/fila/dia", "POST", { dia: hoje, ...corpo });
    setSalvando(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.erro });
    setMsg({ ok: true, texto: `${rotulo}: salvo.` });
    router.refresh();
  }

  async function salvarAgenda() {
    const prevista = numeroBr(agenda.prevista);
    const realizada = numeroBr(agenda.realizada);
    if ([prevista, realizada].some((v) => typeof v === "number" && Number.isNaN(v))) return setMsg({ ok: false, texto: "Número da agenda inválido." });
    setSalvando("Agenda");
    // Caixa: módulo financeiro suspenso — valor já gravado é reenviado intacto, nunca apagado.
    const numeros: NumerosDoDia = { agendaPrevista: prevista, agendaRealizada: realizada, caixaPrevisto: n0?.caixaPrevisto ?? null, caixaRecebido: n0?.caixaRecebido ?? null, caixaSituacao: n0?.caixaSituacao ?? null };
    const r = await chamarApi("/api/fila/fechamento", "POST", { dia: hoje, numeros });
    setSalvando(null);
    if (!r.ok) return setMsg({ ok: false, texto: r.erro });
    setMsg({ ok: true, texto: "Agenda: salvo." });
    router.refresh();
  }

  function marcarSemOcorrencias(cats: readonly Categoria[], marcar: boolean) {
    const secoes = { ...estado.secoes };
    for (const c of cats) {
      if (marcar) secoes[c] = "sem_ocorrencias";
      else delete secoes[c];
    }
    void salvarDia({ secoes }, "Seção");
  }

  function alternarPrioridade(p: { ref: string | null; texto: string }) {
    const existe = escolhidas.some((x) => x.texto === p.texto);
    if (existe) setEscolhidas(escolhidas.filter((x) => x.texto !== p.texto));
    else if (escolhidas.length < 5) setEscolhidas([...escolhidas, p]);
  }

  const dif = numeroBr(agenda.prevista) !== null && numeroBr(agenda.realizada) !== null ? (numeroBr(agenda.prevista)! - numeroBr(agenda.realizada)!) : null;
  const diaUtil = `${dataBr(f.proximoDia)}`;

  return (
    <ProvedorFila valor={{ hoje, proximoDiaUtil: f.proximoDia, usuarioId, perfis, pacientes, itens }}>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fb-eyebrow">Fechamento do dia</p>
          <h1 className="fb-titulo mt-2">Feedback diário <span className="px-1 text-accent">|</span> {usuario}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-text-secondary">Data do relatório</p>
            <p className="text-text-primary">{dataBr(hoje)}</p>
          </div>
          <a href="#feedbacks-anteriores" className="text-xs text-text-muted underline">feedbacks anteriores</a>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => abrirNovo()}>+ Adicionar registro do dia</Button>
        <span className="text-xs text-text-muted">Para o que surgiu no expediente sem tarefa prévia.</span>
        {msg && <span className={clsx("text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.texto}</span>}
      </div>

      {novo && (
        <section className="fb-card mb-4 p-4">
          <p className="mb-3 font-serif text-[22px] font-medium text-text-primary">Novo registro do dia</p>
          <FormRegistro key={novo.chave} alvos={[]} tipoInicial={novo.tipo} onSalvo={() => setNovo(null)} onCancelar={() => setNovo(null)} />
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <a href="/trabalho" className="fb-card mb-3.5 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-raised">
            <span className="text-sm text-text-secondary">
              Seu trabalho: <strong className="text-text-primary">{meus.atrasada}</strong> atrasada(s) · <strong className="text-text-primary">{meus.hoje}</strong> para hoje ·{" "}
              <strong className="text-text-primary">{meus.aguardando_paciente}</strong> aguardando paciente · <strong className="text-text-primary">{meus.aguardando_gestao}</strong> aguardando gestão
            </span>
            <span className="text-sm text-accent">Abrir Meu trabalho →</span>
          </a>

          {BLOCOS.map((b, i) => {
            const bloco = f.blocos.find((x) => x.id === b.id)!;
            const marcada = b.categorias.some((c) => estado.secoes[c] === "sem_ocorrencias");
            const n = bloco.linhas.length;
            const resumo = n ? `${n} registro(s) hoje` : marcada ? "Sem ocorrências" : "Ainda não revisada";
            return (
              <Secao key={b.id} n={String(i + 1)} titulo={b.titulo} resumo={resumo} tom={n || marcada ? "ok" : "pendente"}>
                {b.id === "agenda" && (
                  <div className="mt-2 rounded-[10px] border border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Campo label="Agenda prevista"><Input inputMode="numeric" value={agenda.prevista} onChange={(e) => setAgenda({ ...agenda, prevista: e.target.value })} /></Campo>
                      <Campo label="Agenda realizada"><Input inputMode="numeric" value={agenda.realizada} onChange={(e) => setAgenda({ ...agenda, realizada: e.target.value })} /></Campo>
                      <div className="flex items-end"><Button type="button" onClick={salvarAgenda} loading={salvando === "Agenda"} loadingText="Salvando…">Salvar agenda</Button></div>
                    </div>
                    {dif !== null && dif !== 0 && <p className="mt-2 text-xs text-text-muted">Diferença de {dif} para conferir — não é necessariamente falta.</p>}
                    {f.aConferir > 0 && <p className="mt-1 text-xs text-text-secondary">{f.aConferir} atendimento(s) aguardando conferência no Simples Dental (em “Meu trabalho”).</p>}
                  </div>
                )}
                {n > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                    {bloco.linhas.map((l, j) => (
                      <li key={j} className="text-text-secondary">
                        {l.atencao && <span className="mr-1 text-critical">⚠</span>}
                        {l.resultado && <span className="mr-1 rounded bg-accent-soft px-1.5 text-[11px] text-accent">resultado</span>}
                        <span className="text-text-primary">{l.paciente}</span> · {l.item}: {l.texto}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">{marcada ? "Marcada como sem ocorrências." : "Nenhum registro nesta área hoje."}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className="fb-chip" onClick={() => abrirNovo(TIPO_DO_BLOCO[b.id])}>+ Adicionar registro</button>
                  {n === 0 && (
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input type="checkbox" checked={marcada} disabled={salvando === "Seção"} onChange={(e) => marcarSemOcorrencias(b.categorias, e.target.checked)} /> Sem ocorrências
                    </label>
                  )}
                </div>
              </Secao>
            );
          })}

          <Secao n={String(BLOCOS.length + 1)} titulo={`Prioridades para o próximo dia útil (${diaUtil})`}
            resumo={estado.prioridades.length ? `${estado.prioridades.length} escolhida(s)` : "Nenhuma escolhida — o feedback usa as sugeridas"} tom={estado.prioridades.length ? "ok" : "pendente"}>
            <p className="mt-2 text-xs text-text-muted">Escolha até 5. Sugestões: vencidas, prazos até o próximo dia útil, pontos de atenção e respostas esperadas.</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {f.sugestoes.map((s) => {
                const marcada = escolhidas.some((x) => x.texto === s.texto);
                return (
                  <li key={s.ref}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={marcada} disabled={!marcada && escolhidas.length >= 5} onChange={() => alternarPrioridade({ ref: s.ref, texto: s.texto })} />
                      <span>{s.texto} <span className="text-text-muted">· {s.motivo}</span></span>
                    </label>
                  </li>
                );
              })}
              {!f.sugestoes.length && <li className="text-text-muted">Nenhuma sugestão automática.</li>}
              {escolhidas.filter((x) => !x.ref).map((x) => (
                <li key={x.texto} className="flex items-center gap-2">
                  <input type="checkbox" checked onChange={() => alternarPrioridade(x)} /> <span>{x.texto} <span className="text-text-muted">· manual</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Campo label="Prioridade manual"><input value={manual} onChange={(e) => setManual(e.target.value)} className={classeInput} placeholder="ex.: confirmar agenda de segunda" /></Campo>
              <button type="button" className="fb-chip" disabled={!manual.trim() || escolhidas.length >= 5} onClick={() => { alternarPrioridade({ ref: null, texto: manual.trim() }); setManual(""); }}>Incluir</button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button type="button" loading={salvando === "Prioridades"} loadingText="Salvando…" onClick={() => salvarDia({ prioridades: escolhidas }, "Prioridades")}>Salvar prioridades</Button>
              <span className="text-xs text-text-muted">{escolhidas.length}/5</span>
            </div>
          </Secao>
        </div>

        <aside className="flex flex-col gap-3.5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-auto">
          <div className="fb-card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="fb-eyebrow font-semibold">Resumo do dia — {usuario}</h2>
              <span className="text-[11.5px] text-text-muted">{dataBr(hoje)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 border-b border-border pb-3">
              {([["Registros", f.contadores.registros], ["Contatos", f.contadores.tentativasContato], ["Respostas", f.contadores.respostas], ["Resolvidos", f.contadores.resolvidos]] as const).map(([k, v]) => (
                <div key={k}><p className="text-[11.5px] text-text-muted">{k}</p><p className="font-serif text-[30px] font-medium leading-none tabular-nums text-text-primary">{v}</p></div>
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([
                ["Pacientes contatadas", String(f.contadores.pacientesContatadas)],
                ["Agendamentos", String(f.contadores.agendamentos)],
                ["Comparecimentos", String(f.contadores.comparecimentos)],
                ["Faltas", String(f.contadores.faltas)],
                ["Marcos trabalhados", String(f.contadores.marcosTrabalhados)],
                ["Atrasadas", String(meus.atrasada)],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-border/60 pb-1"><dt className="text-text-secondary">{k}</dt><dd className="font-medium text-text-primary">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] leading-snug text-text-muted">Só os seus registros de hoje. Contatos = registros com contato realizado (um contato com vários marcos conta uma vez); respostas não somam como contato; agendamento não é comparecimento.</p>
          </div>

          <Entrega entrega={entrega} textoAoVivo={fechamento.texto} eventosAoVivo={eventosDoDia} hoje={hoje} />
        </aside>
      </div>
      <HistoricoFeedbacks historico={historico.filter((h) => h.dia !== hoje)} />
    </ProvedorFila>
  );
}

const ROTULO_ESTADO = { rascunho: "Rascunho", gerado: "Gerado — pronto para revisão", entregue: "Entregue à gestão" } as const;

function Entrega({ entrega, textoAoVivo, eventosAoVivo, hoje }: { entrega: EstadoDoFeedback; textoAoVivo: string; eventosAoVivo: string[]; hoje: string }) {
  const router = useRouter();
  const ultima: FeedbackRow | undefined = [...entrega.versoes].sort((a, b) => b.versao - a.versao)[0];
  const entregue = entrega.versoes.filter((v) => v.status === "entregue").sort((a, b) => b.versao - a.versao)[0];
  const desatualizado = ultima?.status === "gerado" && [...ultima.eventos].sort().join(",") !== [...eventosAoVivo].sort().join(",");
  const estado = !ultima ? "rascunho" : ultima.status;
  const [idGerar, setIdGerar] = useState(() => crypto.randomUUID());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const textoMostrado = estado === "rascunho" || desatualizado ? textoAoVivo : ultima!.texto;

  async function operar(operacao: string, id: string, rotulo: string) {
    setMsg(null);
    setOcupado(operacao);
    const r = await chamarApi("/api/fila/feedback-diario", "POST", { operacao, id, dia: hoje });
    setOcupado(null);
    if (!r.ok) return setMsg({ ok: false, t: r.incerto ? `${r.erro} Repetir é seguro: a mesma ação não é duplicada.` : r.erro });
    if (operacao === "gerar") setIdGerar(crypto.randomUUID());
    setMsg({ ok: true, t: rotulo });
    router.refresh();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoMostrado);
      setMsg({ ok: true, t: "Copiado. Copiar não conta como entrega nem como envio." });
      if (ultima && !desatualizado) void chamarApi("/api/fila/feedback-diario", "POST", { operacao: "copiado", id: ultima.id }).then(() => router.refresh());
    } catch {
      setMsg({ ok: false, t: "Não consegui copiar. Selecione o texto e copie." });
    }
  }

  return (
    <div className="fb-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[22px] font-medium text-text-primary">Entrega do feedback</h2>
        <span className="text-xs text-text-muted">{textoSituacaoEntrega(entrega.situacao)}</span>
      </div>
      <p className="mt-1 text-sm">
        <span className={clsx("rounded-full px-2 py-0.5 text-xs", estado === "entregue" ? "bg-opportunity-bg text-opportunity" : estado === "gerado" ? "bg-accent-soft text-accent" : "bg-surface-raised text-text-secondary")}>
          {ROTULO_ESTADO[estado]}{ultima ? ` · versão ${ultima.versao}` : ""}
        </span>
        {entregue?.entregueEm && <span className="ml-2 text-xs text-text-muted">{entregue.versao !== ultima?.versao ? `versão ${entregue.versao} ` : ""}entregue {horaBr(entregue.entregueEm)}</span>}
      </p>
      {entregue?.ajusteSolicitadoEm && !entrega.versoes.some((v) => v.versao > entregue.versao) && (
        <div className="mt-2 rounded-[8px] border border-important bg-important-bg p-2 text-sm text-important">
          A gestão pediu ajuste: “{entregue.observacaoGestao}”. Corrija os registros, gere e entregue uma nova versão (a anterior fica preservada).
        </div>
      )}
      {entregue?.observacaoGestao && !entregue.ajusteSolicitadoEm && <p className="mt-2 text-sm text-text-secondary">Observação da gestão: “{entregue.observacaoGestao}”</p>}
      {desatualizado && <p className="mt-2 text-xs text-important">Há registros novos desde que a versão foi gerada: gere de novo antes de entregar.</p>}
      <p className="mt-2 text-xs text-text-muted">{estado === "rascunho" || desatualizado ? "Prévia ao vivo, montada dos registros salvos hoje." : "Versão congelada para revisão e entrega."}</p>
      <pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-raised p-3 font-sans text-[13px] leading-relaxed text-text-primary">{textoMostrado}</pre>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(estado !== "gerado" || desatualizado) && (
          <Button type="button" loading={ocupado === "gerar"} loadingText="Gerando…" onClick={() => operar("gerar", idGerar, "Versão gerada para revisão. Confira e entregue.")}>
            {estado === "entregue" ? "Gerar versão corrigida" : "Gerar para revisão"}
          </Button>
        )}
        {estado === "gerado" && !desatualizado && (
          <Button type="button" loading={ocupado === "entregar"} loadingText="Entregando…" onClick={() => operar("entregar", ultima!.id, "Entregue à gestão.")}>Entregar à gestão</Button>
        )}
        <button type="button" className="fb-chip" onClick={copiar}>Copiar para o WhatsApp</button>
        {entregue && !entregue.whatsappConfirmadoEm && (
          <button type="button" className="fb-chip" disabled={ocupado === "whatsapp"} onClick={() => operar("whatsapp", entregue.id, "Envio pelo WhatsApp confirmado por você.")}>Confirmo que enviei no WhatsApp</button>
        )}
      </div>
      <ul className="mt-2 text-[11px] text-text-muted">
        {ultima?.copiadoEm && <li>Copiado {horaBr(ultima.copiadoEm)} (não comprova envio)</li>}
        {entregue?.whatsappConfirmadoEm && <li>Envio pelo WhatsApp confirmado manualmente {horaBr(entregue.whatsappConfirmadoEm)}</li>}
        <li>Nada é enviado automaticamente.</li>
      </ul>
      {msg && <p className={clsx("mt-2 text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</p>}
    </div>
  );
}

function HistoricoFeedbacks({ historico }: { historico: FeedbackComRegistros[] }) {
  return (
    <section id="feedbacks-anteriores" className="mt-6">
      <h2 className="mb-2 font-serif text-[22px] font-medium text-text-primary">Feedbacks anteriores</h2>
      {!historico.length && <p className="text-sm text-text-muted">Nenhum feedback dos últimos 30 dias.</p>}
      <ul className="flex flex-col gap-2">
        {historico.map((h) => (
          <li key={h.id} className="fb-card p-3">
            <details>
              <summary className="cursor-pointer text-sm text-text-primary">
                {dataBr(h.dia)} · versão {h.versao} · {h.status === "entregue" ? `entregue ${h.entregueEm ? horaBr(h.entregueEm) : ""}` : "gerado, não entregue"}
                {h.ajusteSolicitadoEm && <span className="ml-2 text-important">ajuste solicitado</span>}
              </summary>
              {h.observacaoGestao && <p className="mt-2 text-sm text-text-secondary">Gestão: “{h.observacaoGestao}”</p>}
              <pre className="mt-2 whitespace-pre-wrap rounded-[8px] bg-surface-raised p-2 font-sans text-[12.5px] text-text-primary">{h.texto}</pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
