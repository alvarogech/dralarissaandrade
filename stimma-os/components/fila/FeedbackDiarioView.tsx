"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CartaoPaciente, ItemFila } from "@/lib/fila/agrupamento";
import { BLOCOS, type Fechamento } from "@/lib/fila/fechamento";
import type { FilaCarregada } from "@/lib/fila/servico";
import type { Categoria, EstadoDoDia, NumerosDoDia } from "@/lib/fila/store";
import { Campo, chamarApi, classeInput, dataBr, numeroBr } from "./comum";
import { ProvedorFila } from "./contexto";
import { Cartao } from "./FilaView";
import { FormRegistro, type TipoRegistro } from "./FormRegistro";

/**
 * Tela da concierge (padrão do feedback-concierge.html): o acompanhamento de hoje no topo, os
 * registros do dia por área em seções recolhíveis e, ao lado, o resumo e a prévia da mensagem —
 * montada dos registros persistidos e atualizada depois de cada gravação confirmada pelo servidor.
 */
interface Props {
  dados: FilaCarregada;
  fechamento: { fechamento: Fechamento; texto: string };
  estado: EstadoDoDia;
  gestao: boolean;
  usuario: string;
  usuarioId: string;
  perfis: { id: string; nome: string }[];
  pacientes: { id: string; nome: string }[];
}

function agruparPorPaciente(itens: ItemFila[]): CartaoPaciente[] {
  const mapa = new Map<string, CartaoPaciente>();
  for (const i of [...itens].sort((a, b) => a.due.localeCompare(b.due))) {
    const c = mapa.get(i.pacienteId) ?? { pacienteId: i.pacienteId, pacienteNome: i.pacienteNome, itens: [], junto: [], atrasoDias: 0 };
    c.itens.push(i);
    mapa.set(i.pacienteId, c);
  }
  return [...mapa.values()];
}

function Secao({ n, titulo, resumo, tom, abertaInicial = false, children }: { n: string; titulo: string; resumo?: string; tom?: "ok" | "pendente"; abertaInicial?: boolean; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <section className="fb-card mb-3.5 overflow-hidden">
      <button type="button" onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={aberta}>
        <span className="fb-num">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[19px] leading-tight text-text-primary">{titulo}</span>
          {resumo && <span className={clsx("mt-0.5 block text-xs", tom === "ok" ? "text-opportunity" : "text-text-muted")}>{resumo}</span>}
        </span>
        <span className="text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && <div className="border-t border-border px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

function Grupo({ titulo, nota, cartoes, gestao, grupo, secao, aberto, setAberto, vazio }: {
  titulo: string; nota?: string; cartoes: CartaoPaciente[]; gestao: boolean; grupo: string; vazio?: React.ReactNode;
  secao: "atrasadas" | "hoje" | "aguardando" | "proximas" | "concluidas"; aberto: string | null; setAberto: (k: string | null) => void;
}) {
  const total = cartoes.reduce((s, c) => s + c.itens.length, 0);
  return (
    <div className="mt-4">
      <p className="text-sm text-text-primary"><strong>{titulo}</strong> · {total} {nota && <span className="text-text-muted">{nota}</span>}</p>
      {cartoes.length === 0 ? (
        <div className="mt-1 text-sm text-text-muted">{vazio ?? "Nada aqui."}</div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {cartoes.map((c) => {
            const k = `${grupo}:${c.pacienteId}`;
            return <Cartao key={k} cartao={c} secao={secao} gestao={gestao} aberto={aberto === k} onToggle={() => setAberto(aberto === k ? null : k)} />;
          })}
        </ul>
      )}
    </div>
  );
}

/** Tipo de registro sugerido ao adicionar a partir de uma seção da área. */
const TIPO_DO_BLOCO: Record<(typeof BLOCOS)[number]["id"], TipoRegistro> = {
  agenda: "falta", oportunidade: "oportunidade", recorrencia: "recorrencia", continuidade: "continuidade", pos: "pos_atendimento", pendencia: "pendencia",
};

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function FeedbackDiarioView({ dados, fechamento, estado, gestao, usuario, usuarioId, perfis, pacientes }: Props) {
  const router = useRouter();
  const { fila, hoje, itens } = dados;
  const f = fechamento.fechamento;
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ tipo?: TipoRegistro; chave: number } | null>(null);
  const [filtroMarco, setFiltroMarco] = useState<"todos" | "d30" | "d90" | "m6">("todos");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const n0 = f.numeros;
  const [agenda, setAgenda] = useState({ prevista: txt(n0?.agendaPrevista), realizada: txt(n0?.agendaRealizada) });
  const [escolhidas, setEscolhidas] = useState<{ ref: string | null; texto: string }[]>(estado.prioridades);
  const [manual, setManual] = useState("");

  const nItens = (cs: CartaoPaciente[]) => cs.reduce((s, c) => s + c.itens.length, 0);
  const abertos = itens.filter((i) => i.status !== "concluida");
  const comparecimentosFuturos = agruparPorPaciente(abertos.filter((i) => i.subtipo === "comparecimento" && i.status === "aberta" && i.due > hoje));
  const marcos = abertos.filter((i) => i.tipo === "marco" && (filtroMarco === "todos" || i.subtipo === filtroMarco));
  const proximasComuns = fila.proximas.map((c) => ({ ...c, itens: c.itens.filter((i) => i.tipo !== "marco" && i.subtipo !== "comparecimento") })).filter((c) => c.itens.length > 0);
  const filaVazia = !nItens(fila.atrasadas) && !nItens(fila.hoje) && !nItens(fila.aguardando) && !nItens(proximasComuns);

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
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="fb-eyebrow">Dra. Larissa Andrade · Fechamento do dia</p>
          <h1 className="font-serif text-[26px] leading-tight text-text-primary">Feedback diário <span className="px-1 text-accent">|</span> {usuario}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-text-secondary">Data do relatório</p>
            <p className="text-text-primary">{dataBr(hoje)}</p>
          </div>
          <a href="/fechamento" className="text-xs text-text-muted underline">ver outro dia</a>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => abrirNovo()}>+ Adicionar registro do dia</Button>
        <span className="text-xs text-text-muted">Para o que surgiu no expediente sem tarefa prévia.</span>
        {msg && <span className={clsx("text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.texto}</span>}
      </div>

      {novo && (
        <section className="fb-card mb-4 p-4">
          <p className="mb-3 font-serif text-[19px] text-text-primary">Novo registro do dia</p>
          <FormRegistro key={novo.chave} alvos={[]} tipoInicial={novo.tipo} onSalvo={() => setNovo(null)} onCancelar={() => setNovo(null)} />
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <Secao n="✓" titulo="Acompanhamento de hoje" abertaInicial
            resumo={`${nItens(fila.atrasadas) + nItens(fila.hoje)} para hoje · ${nItens(fila.aguardando)} aguardando · ${nItens(proximasComuns)} próximas · ${nItens(fila.concluidas)} concluídas hoje`}>
            {filaVazia && (
              <div className="mt-3 rounded-[10px] border border-dashed border-border p-4 text-sm text-text-secondary">
                Nenhuma tarefa aberta na fila. Se algo aconteceu hoje (falta, retorno de paciente, alerta), registre:{" "}
                <button type="button" className="text-accent underline" onClick={() => abrirNovo()}>adicionar registro do dia</button>.
              </div>
            )}
            <Grupo titulo="Atrasadas" nota="prazo vencido" cartoes={fila.atrasadas} secao="atrasadas" grupo="atr" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Ações de hoje" nota="prazo hoje" cartoes={fila.hoje} secao="hoje" grupo="hoj" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Aguardando resposta" nota="contato feito, esperando retorno" cartoes={fila.aguardando} secao="aguardando" grupo="agu" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Agendamentos a acompanhar" nota="confirmar comparecimento na data" cartoes={comparecimentosFuturos} secao="proximas" grupo="cmp" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Próximas" nota="viram ação quando a data chegar" cartoes={proximasComuns} secao="proximas" grupo="prx" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Concluídas hoje" cartoes={fila.concluidas} secao="concluidas" grupo="con" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm text-text-primary"><strong>Marcos de acompanhamento — 30 dias · 90 dias · 6 meses</strong></p>
              <p className="text-xs text-text-muted">Criados ao confirmar um atendimento realizado, só os marcos escolhidos.{dados.maisTarde ? ` ${dados.maisTarde} item(ns) previstos para depois de 30 dias.` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([["todos", "Todos"], ["d30", "30 dias"], ["d90", "90 dias"], ["m6", "6 meses"]] as const).map(([k, l]) => (
                  <button key={k} type="button" className="fb-chip" data-ativo={filtroMarco === k} onClick={() => setFiltroMarco(k)}>{l}</button>
                ))}
              </div>
              <Grupo titulo="Marcos abertos" nota="mesma paciente pode ser tratada junto" cartoes={agruparPorPaciente(marcos)} secao="proximas" grupo="mrc" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            </div>
          </Secao>

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
                    {f.aConferir > 0 && <p className="mt-1 text-xs text-text-secondary">{f.aConferir} atendimento(s) aguardando conferência no Simples Dental (em “Ações de hoje”).</p>}
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
                <div key={k}><p className="text-[9px] uppercase tracking-wide text-text-muted">{k}</p><p className="font-serif text-[26px] leading-none text-text-primary">{v}</p></div>
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([
                ["Pacientes contatadas", String(f.contadores.pacientesContatadas)],
                ["Agendamentos", String(f.contadores.agendamentos)],
                ["Comparecimentos", String(f.contadores.comparecimentos)],
                ["Faltas", String(f.contadores.faltas)],
                ["Aguardando resposta", String(nItens(fila.aguardando))],
                ["Atrasadas", String(nItens(fila.atrasadas))],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-border/60 pb-1"><dt className="text-text-secondary">{k}</dt><dd className="font-medium text-text-primary">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] leading-snug text-text-muted">Contatos = registros com contato realizado; respostas não somam como contato; agendamento não é comparecimento.</p>
          </div>

          <div className="fb-card p-4">
            <h2 className="font-serif text-[20px] text-text-primary">Prévia da mensagem</h2>
            <p className="text-xs text-text-muted">Montada dos registros salvos hoje e atualizada depois de cada gravação confirmada.</p>
            <pre className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-raised p-3 font-sans text-[13px] leading-relaxed text-text-primary">{fechamento.texto}</pre>
            <CopiarTexto texto={fechamento.texto} />
          </div>
        </aside>
      </div>
    </ProvedorFila>
  );
}

function CopiarTexto({ texto }: { texto: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setMsg({ ok: true, t: "Copiado. Cole no WhatsApp." });
        } catch {
          setMsg({ ok: false, t: "Não consegui copiar. Selecione o texto e copie." });
        }
      }}>Copiar para o WhatsApp</Button>
      {msg && <span className={clsx("text-sm", msg.ok ? "text-opportunity" : "text-critical")}>{msg.t}</span>}
    </div>
  );
}
