"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CartaoPaciente, ItemFila } from "@/lib/fila/agrupamento";
import type { Fechamento } from "@/lib/fila/fechamento";
import type { FilaCarregada } from "@/lib/fila/servico";
import { Campo, chamarApi, dataBr, numeroBr } from "./comum";
import { Cartao } from "./FilaView";

/**
 * Tela da concierge no mesmo padrão do feedback-concierge.html: cabeçalho, "Acompanhamento de
 * hoje" + seções numeradas à esquerda e, à direita, o resumo do dia e a prévia da mensagem —
 * que se atualiza a cada registro, a partir dos dados reais (nada é digitado duas vezes).
 */
interface Props {
  dados: FilaCarregada;
  fechamento: { fechamento: Fechamento; texto: string };
  gestao: boolean;
  usuario: string;
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

function Secao({ n, titulo, resumo, abertaInicial = false, children }: { n: string; titulo: string; resumo?: string; abertaInicial?: boolean; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <section className="fb-card mb-3.5 overflow-hidden">
      <button type="button" onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={aberta}>
        <span className="fb-num">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[19px] leading-tight text-text-primary">{titulo}</span>
          {resumo && <span className="mt-0.5 block text-xs text-text-muted">{resumo}</span>}
        </span>
        <span className="text-text-muted">{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && <div className="border-t border-border px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

function Grupo({ titulo, nota, cartoes, gestao, grupo, secao, aberto, setAberto }: {
  titulo: string; nota?: string; cartoes: CartaoPaciente[]; gestao: boolean; grupo: string;
  secao: "atrasadas" | "hoje" | "aguardando" | "proximas" | "concluidas"; aberto: string | null; setAberto: (k: string | null) => void;
}) {
  const total = cartoes.reduce((s, c) => s + c.itens.length, 0);
  return (
    <div className="mt-4">
      <p className="text-sm text-text-primary">
        <strong>{titulo}</strong> · {total} {nota && <span className="text-text-muted">{nota}</span>}
      </p>
      {cartoes.length === 0 ? (
        <p className="mt-1 text-sm text-text-muted">Nada aqui.</p>
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

const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function FeedbackDiarioView({ dados, fechamento, gestao, usuario }: Props) {
  const router = useRouter();
  const { fila, hoje, itens } = dados;
  const f = fechamento.fechamento;
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtroMarco, setFiltroMarco] = useState<"todos" | "d30" | "d90" | "m6">("todos");
  const n0 = f.numeros;
  // Caixa: módulo financeiro suspenso — não aparece, mas o valor já gravado é reenviado intacto
  // ao salvar a agenda (nunca apagado).
  const [numeros, setNumeros] = useState({
    agendaPrevista: txt(n0?.agendaPrevista), agendaRealizada: txt(n0?.agendaRealizada),
    caixaPrevisto: txt(n0?.caixaPrevisto), caixaRecebido: txt(n0?.caixaRecebido), caixaSituacao: n0?.caixaSituacao ?? "",
  });
  const [msgNumeros, setMsgNumeros] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvandoNumeros, setSalvandoNumeros] = useState(false);
  const [copia, setCopia] = useState<{ ok: boolean; texto: string } | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const nItens = (cs: CartaoPaciente[]) => cs.reduce((s, c) => s + c.itens.length, 0);
  const abertos = itens.filter((i) => i.status !== "concluida");
  const comparecimentosFuturos = agruparPorPaciente(abertos.filter((i) => i.subtipo === "comparecimento" && i.status === "aberta" && i.due > hoje));
  const marcos = abertos.filter((i) => i.tipo === "marco" && (filtroMarco === "todos" || i.subtipo === filtroMarco));
  const aConferir = abertos.filter((i) => i.tipo === "conferir_atendimento");
  // Em "Próximos dias" ficam só as tarefas comuns: marcos e comparecimentos têm grupo próprio.
  const proximasComuns = fila.proximas
    .map((c) => ({ ...c, itens: c.itens.filter((i) => i.tipo !== "marco" && i.subtipo !== "comparecimento") }))
    .filter((c) => c.itens.length > 0);
  const proximos7 = abertos.filter((i) => i.status === "aberta" && i.due > hoje && i.due <= addDias(hoje, 7)).length;

  async function salvarNumeros() {
    setMsgNumeros(null);
    const n = { agendaPrevista: numeroBr(numeros.agendaPrevista), agendaRealizada: numeroBr(numeros.agendaRealizada), caixaPrevisto: numeroBr(numeros.caixaPrevisto), caixaRecebido: numeroBr(numeros.caixaRecebido), caixaSituacao: numeros.caixaSituacao };
    if (Object.values(n).some((v) => typeof v === "number" && Number.isNaN(v))) return setMsgNumeros({ ok: false, texto: "Algum número está em formato inválido." });
    setSalvandoNumeros(true);
    const r = await chamarApi("/api/fila/fechamento", "POST", { dia: hoje, numeros: n });
    setSalvandoNumeros(false);
    if (!r.ok) return setMsgNumeros({ ok: false, texto: r.erro });
    setMsgNumeros({ ok: true, texto: "Salvo." });
    router.refresh();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(fechamento.texto);
      setCopia({ ok: true, texto: "Copiado. Cole no WhatsApp." });
    } catch {
      setCopia({ ok: false, texto: "Não consegui copiar. Selecione o texto e copie." });
    }
  }

  function atualizar() {
    setAtualizando(true);
    router.refresh();
    setTimeout(() => setAtualizando(false), 800);
  }

  const campoNumero = (k: keyof typeof numeros, label: string, modo: "numeric" | "decimal" | "text" = "numeric") => (
    <Campo label={label}>
      <Input inputMode={modo === "text" ? undefined : modo} value={numeros[k]} onChange={(e) => setNumeros({ ...numeros, [k]: e.target.value })} />
    </Campo>
  );
  const botaoSalvar = (
    <div className="mt-3 flex items-center gap-3">
      <Button type="button" onClick={salvarNumeros} loading={salvandoNumeros} loadingText="Salvando…">Salvar</Button>
      {msgNumeros && <span className={msgNumeros.ok ? "text-sm text-opportunity" : "text-sm text-critical"}>{msgNumeros.texto}</span>}
    </div>
  );

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="fb-eyebrow">Dra. Larissa Andrade · Fechamento do dia</p>
          <h1 className="font-serif text-[26px] leading-tight text-text-primary">
            Feedback diário <span className="px-1 text-accent">|</span> {usuario}
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-text-secondary">Data do relatório</p>
            <p className="text-text-primary">{dataBr(hoje)}</p>
          </div>
          <a href="/fechamento" className="text-xs text-text-muted underline">ver outro dia</a>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0">
          <Secao n="✓" titulo="Acompanhamento de hoje" abertaInicial
            resumo={`${nItens(fila.atrasadas) + nItens(fila.hoje)} para hoje · ${nItens(fila.aguardando)} aguardando · ${nItens(proximasComuns)} futuras`}>
            <p className="mt-2 text-sm text-text-secondary">Tarefas abertas da concierge, organizadas pelo que pedem hoje. Abra “Registrar” no cartão da paciente para lançar contato, resposta, agendamento, recebimento ou resultado.</p>
            <Grupo titulo="Atrasadas" nota="prazo vencido" cartoes={fila.atrasadas} secao="atrasadas" grupo="atr" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Ações de hoje" nota="tarefas com prazo hoje" cartoes={fila.hoje} secao="hoje" grupo="hoj" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Aguardando resposta" nota="contato feito, esperando retorno" cartoes={fila.aguardando} secao="aguardando" grupo="agu" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Agendamentos a acompanhar" nota="confirmar comparecimento na data" cartoes={comparecimentosFuturos} secao="proximas" grupo="cmp" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Próximos dias" nota="vira ação quando a data chegar" cartoes={proximasComuns} secao="proximas" grupo="prx" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            <Grupo titulo="Concluídas hoje" cartoes={fila.concluidas} secao="concluidas" grupo="con" gestao={gestao} aberto={aberto} setAberto={setAberto} />

            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm text-text-primary"><strong>Marcos de acompanhamento — 30 dias · 90 dias · 6 meses</strong></p>
              <p className="text-xs text-text-muted">Criados automaticamente quando um atendimento é confirmado como realizado.{dados.maisTarde ? ` ${dados.maisTarde} item(ns) previstos para depois de 30 dias.` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([["todos", "Todos"], ["d30", "30 dias"], ["d90", "90 dias"], ["m6", "6 meses"]] as const).map(([k, l]) => (
                  <button key={k} type="button" className="fb-chip" data-ativo={filtroMarco === k} onClick={() => setFiltroMarco(k)}>{l}</button>
                ))}
              </div>
              <Grupo titulo="Marcos abertos" nota="mesma paciente pode ser tratada junto" cartoes={agruparPorPaciente(marcos)} secao="proximas" grupo="mrc" gestao={gestao} aberto={aberto} setAberto={setAberto} />
            </div>
          </Secao>

          <Secao n="1" titulo="Agenda e comparecimento" resumo={`${aConferir.length} a conferir`}>
            <p className="mt-2 text-sm text-text-secondary">
              Totais da agenda da clínica, do Simples Dental (opcionais — não são calculados a partir da fila).
              {aConferir.length ? ` ${aConferir.length} atendimento(s) aguardam conferência no Simples Dental (em “Ações de hoje”).` : ""}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {campoNumero("agendaPrevista", "Agenda prevista")}
              {campoNumero("agendaRealizada", "Agenda realizada")}
            </div>
            {botaoSalvar}
          </Secao>

          <Secao n="2" titulo="Pendências e alertas" resumo={`${f.atrasados} atrasada(s)`}>
            <ul className="mt-2 list-disc pl-5 text-sm text-text-secondary">
              <li>Para hoje ainda sem ação: {f.pendentesHoje}{f.atrasados ? ` (${f.atrasados} atrasadas)` : ""}</li>
              <li>Aguardando resposta: {f.aguardando.length}</li>
              <li>Atendimentos a conferir no Simples Dental: {f.aConferir}</li>
            </ul>
          </Secao>

          <Secao n="3" titulo={`Prioridades para ${dataBr(f.proximoDia)}`} resumo={`${f.prioridades.length} item(ns)`}>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
              {f.prioridades.length === 0 && <li className="text-text-muted">Nada vencendo.</li>}
              {f.prioridades.map((p) => (
                <li key={p.ref}><span className="text-text-primary">{p.paciente}</span> — {p.item}{p.due < f.proximoDia ? ` (desde ${dataBr(p.due)})` : ""}</li>
              ))}
            </ul>
          </Secao>
        </div>

        <aside className="flex flex-col gap-3.5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-auto">
          <div className="fb-card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="fb-eyebrow font-semibold">Resumo do dia — {usuario}</h2>
              <span className="text-[11.5px] text-text-muted">{dataBr(hoje)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 border-b border-border pb-3">
              {[["Ações", f.acoes.length], ["Contatos", f.contagens.contatos], ["Agendam.", f.contagens.agendamentos], ["Respostas", f.contagens.respostas]].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-[9px] uppercase tracking-wide text-text-muted">{k}</p>
                  <p className="font-serif text-[26px] leading-none text-text-primary">{v as number}</p>
                </div>
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([
                ["Concluídas hoje", String(nItens(fila.concluidas))],
                ["Aguardando resposta", String(f.aguardando.length)],
                ["Atrasadas", String(nItens(fila.atrasadas))],
                ["Para hoje", String(nItens(fila.hoje))],
                ["A conferir no SD", String(aConferir.length)],
                ["Próximos 7 dias", String(proximos7)],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-border/60 pb-1">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="font-medium text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="fb-card p-4">
            <h2 className="font-serif text-[20px] text-text-primary">Prévia da mensagem</h2>
            <p className="text-xs text-text-muted">Atualizada a cada registro. É este texto que será copiado.</p>
            <pre className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-raised p-3 font-sans text-[13px] leading-relaxed text-text-primary">{fechamento.texto}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={copiar}>Copiar para o WhatsApp</Button>
              <button type="button" onClick={atualizar} className={clsx("h-10 rounded-[10px] border border-border bg-surface px-3 text-sm text-text-secondary", atualizando && "opacity-60")}>
                {atualizando ? "Gerando…" : "Gerar feedback"}
              </button>
            </div>
            {copia && <p className={clsx("mt-2 text-sm", copia.ok ? "text-opportunity" : "text-critical")}>{copia.texto}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
