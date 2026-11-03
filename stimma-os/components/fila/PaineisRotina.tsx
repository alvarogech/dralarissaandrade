"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { diferencaCaixa, type EstadoCaixa } from "@/lib/fila/caixa";
import type { PrioridadesHerdadas } from "@/lib/fila/prioridades";
import { Campo, ErroAcao, brl, chamarApi, classeInput, dataBr, numeroBr, soHora } from "./comum";

/**
 * Painéis da rotina que não são itens do checklist: conferência de recebimentos (Financeiro),
 * prioridades herdadas do dia anterior (Prioridades de hoje) e o lembrete do pós-procedimento
 * (Relacionamento). Tudo salvo no servidor; "Salvo" só depois da confirmação.
 */

// ---------------------------------------------------------------- recebimentos

export function CaixaDoDia({ inicial, editavel }: { inicial: EstadoCaixa; editavel: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const conferido = estado.tipo === "conferido" ? estado : null;
  const txt = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));
  const [previsto, setPrevisto] = useState(txt(conferido?.previsto));
  const [recebido, setRecebido] = useState(txt(conferido?.recebido));
  const [justificativa, setJustificativa] = useState(conferido?.justificativa ?? (estado.tipo === "sem_recebimentos" ? "" : ""));
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const p = numeroBr(previsto);
  const r = numeroBr(recebido);
  const dif = typeof p === "number" && typeof r === "number" && !Number.isNaN(p) && !Number.isNaN(r) ? diferencaCaixa(p, r) : null;

  async function salvar(semRecebimentos: boolean) {
    setFalha(null);
    setErroCampo(null);
    if (!semRecebimentos) {
      if (p === null || Number.isNaN(p) || p < 0) return setErroCampo("Informe o valor previsto (use 0 se não havia nada previsto).");
      if (r === null || Number.isNaN(r) || r < 0) return setErroCampo("Informe o valor recebido (use 0 se não houve recebimento).");
    }
    setSalvando(true);
    const res = await chamarApi<{ caixa: EstadoCaixa }>("/api/fila/caixa", "POST", semRecebimentos ? { semRecebimentos: true, justificativa } : { previsto: p, recebido: r, justificativa });
    setSalvando(false);
    if (!res.ok) return setFalha({ erro: res.incerto ? res.erro : `Não conseguimos salvar a conferência. ${res.erro}`, status: res.status });
    setEstado(res.data.caixa);
    router.refresh();
  }

  return (
    <section aria-label="Conferência de recebimentos" className="rounded-control border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[14.5px] font-semibold text-text-primary">Recebimentos do dia</h4>
        <span className={clsx("text-[12.5px]", estado.tipo === "nao_conferido" ? "text-important" : "text-opportunity")}>
          {estado.tipo === "nao_conferido" ? "Conferência ainda não feita" : estado.tipo === "sem_recebimentos" ? `Conferido às ${soHora(estado.conferidoEm)}: sem recebimentos` : `✓ Conferido às ${soHora(estado.conferidoEm)}`}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-text-muted">Totais conferidos no Simples Dental (a fonte oficial). Sem valores por paciente nem dados bancários. Diferença não é, por si só, inadimplência.</p>
      {editavel ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Campo label="Previsto para receber (R$)"><input inputMode="decimal" value={previsto} onChange={(e) => setPrevisto(e.target.value)} className={classeInput} placeholder="0,00" /></Campo>
          <Campo label="Efetivamente recebido (R$)"><input inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} className={classeInput} placeholder="0,00" /></Campo>
          <div className="flex flex-col justify-end text-[13px]">
            <span className="text-text-muted">Diferença (previsto − recebido)</span>
            <span className={clsx("text-[18px] font-semibold tabular-nums", dif && dif !== 0 ? "text-important" : "text-text-primary")}>{dif === null ? "—" : brl(dif)}</span>
          </div>
          {dif !== null && dif !== 0 && (
            <Campo label="O que explica a diferença? (remarcação, cancelamento, antecipação…)" largo>
              <input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className={classeInput} />
            </Campo>
          )}
          {erroCampo && <p role="alert" className="text-[13px] text-critical sm:col-span-3">{erroCampo}</p>}
          {falha && <div className="sm:col-span-3"><ErroAcao erro={falha.erro} status={falha.status} onTentar={() => void salvar(false)} /></div>}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="button" loading={salvando} loadingText="Salvando…" onClick={() => void salvar(false)}>Salvar conferência</Button>
            <Button type="button" variante="secundario" disabled={salvando} onClick={() => void salvar(true)}>Não houve recebimentos hoje</Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[14px] text-text-primary">
          {conferido ? `Previsto ${brl(conferido.previsto)} · recebido ${brl(conferido.recebido)} · diferença ${brl(conferido.diferenca)}${conferido.justificativa ? ` — ${conferido.justificativa}` : ""}` : estado.tipo === "sem_recebimentos" ? "Sem recebimentos no dia." : "Ainda não conferido."}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- prioridades herdadas

export function PrioridadesHerdadasView({ herdadas, situacaoDaTarefa, editavel }: {
  herdadas: PrioridadesHerdadas;
  /** Estado atual da tarefa de origem, por referência ([T-…]): a prioridade segue a origem. */
  situacaoDaTarefa: Record<string, string>;
  editavel: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [falha, setFalha] = useState<{ erro: string; status?: number } | null>(null);

  async function resolver(indice: number, desfazer: boolean) {
    setFalha(null);
    setOcupado(indice);
    const r = await chamarApi("/api/fila/dia", "POST", { resolver: { dia: herdadas.dia, indice, desfazer } });
    setOcupado(null);
    if (!r.ok) return setFalha({ erro: `Não conseguimos salvar. ${r.erro}`, status: r.status });
    router.refresh();
  }

  return (
    <div>
      <p className="mb-1.5 text-[12.5px] text-text-muted">Definidas no fechamento de {dataBr(herdadas.dia)}.</p>
      <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface">
        {herdadas.itens.map((p) => {
          const daTarefa = p.ref ? situacaoDaTarefa[p.ref] : null;
          const resolvida = !!p.resolvidaEm || daTarefa === "concluida";
          return (
            <li key={p.indice} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className={clsx("text-[14.5px]", resolvida ? "text-text-muted line-through decoration-border-strong" : "text-text-primary")}>
                  {p.prioridade === "alta" && <span className="mr-1.5 rounded-sm bg-critical-bg px-1.5 text-[11.5px] font-medium text-critical no-underline">alta</span>}
                  {p.texto}
                </p>
                <p className="text-[12.5px] text-text-muted">
                  {[p.paciente, p.data ? `até ${dataBr(p.data)}` : null, p.proxima ? `próxima ação: ${p.proxima}` : null, p.origem].filter(Boolean).join(" · ")}
                  {p.ref && <> · segue a pendência de origem{daTarefa ? ` (${daTarefa === "concluida" ? "concluída" : daTarefa === "aguardando" ? "aguardando" : "aberta"})` : ""}</>}
                </p>
              </div>
              {editavel && !p.ref && (
                <Button type="button" variante={resolvida ? "discreto" : "secundario"} loading={ocupado === p.indice} loadingText="Salvando…" onClick={() => void resolver(p.indice, resolvida)}>
                  {resolvida ? "Reabrir" : "Marcar como resolvida"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {falha && <ErroAcao className="mt-2" erro={falha.erro} status={falha.status} />}
    </div>
  );
}

// ---------------------------------------------------------------- pós-procedimento

export function PosProcedimentoView({ dias, itens }: { dias: string[]; itens: { paciente: string; inicio: string; status: string }[] }) {
  const [ver, setVer] = useState(false);
  const periodo = dias.length > 1 ? `de ${dataBr(dias[0]!)} a ${dataBr(dias[dias.length - 1]!)}` : dias[0] ? `de ${dataBr(dias[0])}` : "";
  return (
    <div className="rounded-control border border-border bg-surface-raised px-3 py-2.5 text-[13.5px] text-text-secondary">
      <p><span className="font-medium text-text-primary">Pós-procedimento {periodo}:</span>{" "}
        {itens.length
          ? <>{itens.length} consulta{itens.length === 1 ? "" : "s"} na agenda sincronizada (status na última leitura). </>
          : <>sem dados sincronizados desse período. </>}
        Confira no Simples Dental quem realizou procedimento e registre os contatos na atividade “Pós-procedimento — pacientes de ontem”.
      </p>
      {itens.length > 0 && (
        <>
          <button type="button" className="mt-1 text-[12.5px] underline underline-offset-4" aria-expanded={ver} onClick={() => setVer(!ver)}>{ver ? "Esconder nomes" : "Ver nomes"}</button>
          {ver && <ul className="mt-1 list-disc pl-5">{itens.map((i, k) => <li key={k}>{i.paciente} · {new Date(i.inicio).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} {soHora(i.inicio)} · {i.status}</li>)}</ul>}
        </>
      )}
    </div>
  );
}
