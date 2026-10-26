"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { LinhaAnalisada } from "@/lib/fila/servico";
import type { PropostaContinuidade } from "@/lib/fila/ia";
import { Campo, chamarApi, classeInput, dataBr } from "./comum";
import { linhaDeItem, linhaVazia, type LinhaEditor } from "./LevantamentoView";

/**
 * Feedback do dia anterior colado na gestão. Primeiro compara com o que já está registrado
 * (referências [T-…]/[M-…] do feedback gerado na plataforma); o que não tem referência fica para
 * revisão manual ou para sugestões da IA. Nada é aplicado sem aprovação item a item.
 */
interface Resposta {
  analise: { dia: string | null; formatoDaPlataforma: boolean; linhas: LinhaAnalisada[] };
  propostas: (PropostaContinuidade & { tarefaId?: string })[] | null;
  iaDisponivel: boolean;
  precisaDia: boolean;
}

const SITUACAO: Record<LinhaAnalisada["situacao"], { label: string; variant: "neutral" | "informative" | "important" | "critical" }> = {
  concluido: { label: "Concluído — não recria", variant: "neutral" },
  na_fila: { label: "Já na fila", variant: "informative" },
  revisar: { label: "Revisar", variant: "critical" },
  sem_referencia: { label: "Sem referência", variant: "important" },
};

export function FeedbackImportView({ adicionarAoLevantamento }: { adicionarAoLevantamento: (l: LinhaEditor[]) => void }) {
  const [texto, setTexto] = useState("");
  const [dia, setDia] = useState("");
  const [resp, setResp] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [aplicadas, setAplicadas] = useState<Record<number, string>>({});
  const [edicoes, setEdicoes] = useState<Record<number, { novaData: string; proximaAcao: string; motivo: string }>>({});

  async function analisar(usarIA: boolean) {
    setErro(null);
    setCarregando(usarIA ? "ia" : "analisar");
    const r = await chamarApi<Resposta>("/api/fila/feedback/analisar", "POST", { texto, usarIA, dia: dia || undefined });
    setCarregando(null);
    if (!r.ok) return setErro(r.erro);
    setResp(r.data);
    setAplicadas({});
    setEdicoes(Object.fromEntries((r.data.propostas ?? []).map((p, i) => [i, { novaData: p.nova_data ?? "", proximaAcao: p.proxima_acao ?? "", motivo: p.motivo ?? p.evidencia }])));
  }

  async function aplicar(i: number, p: PropostaContinuidade & { tarefaId?: string }) {
    const e = edicoes[i]!;
    const diaFeedback = resp?.analise.dia ?? dia;
    const r = await chamarApi<{ ok: true }>("/api/fila/feedback/aplicar", "POST", { tarefaId: p.tarefaId, tipo: p.tipo, novaData: e.novaData || null, proximaAcao: e.proximaAcao || null, motivo: e.motivo, diaFeedback });
    setAplicadas((a) => ({ ...a, [i]: r.ok ? "aplicada" : `erro: ${r.erro}` }));
  }

  const semRef = resp?.analise.linhas.filter((l) => l.situacao === "sem_referencia") ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Campo label="Cole o feedback do dia anterior (o gerado em Fechamento ou um antigo)">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} className={`${classeInput} font-mono text-xs`} />
      </Campo>
      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={() => analisar(false)} loading={carregando === "analisar"} loadingText="Analisando…" disabled={!texto.trim()}>Analisar contra a fila</Button>
        {resp?.precisaDia && (
          <Campo label="Data do feedback (não encontrada no texto)">
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={classeInput} />
          </Campo>
        )}
      </div>
      {erro && <p role="alert" className="text-sm text-critical">{erro}</p>}

      {resp && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {resp.analise.dia ? `Feedback de ${dataBr(resp.analise.dia)}.` : "Data do feedback não identificada — informe acima antes de pedir sugestões."}{" "}
            {resp.analise.formatoDaPlataforma ? "Formato da plataforma reconhecido: as referências foram comparadas com o banco." : "Formato livre: sem referências para comparar automaticamente."}
          </p>
          <ul className="flex flex-col gap-2">
            {resp.analise.linhas.map((l, i) => (
              <li key={i} className="rounded-card border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SITUACAO[l.situacao].variant}>{SITUACAO[l.situacao].label}</Badge>
                  {l.ref && <span className="text-xs text-text-muted">{l.ref}</span>}
                  <span className="text-xs text-text-muted">{l.secao}</span>
                </div>
                <p className="mt-1 text-text-primary">{l.texto}</p>
                <p className="text-xs text-text-secondary">{l.detalhe}</p>
                {l.situacao === "sem_referencia" && (
                  <button type="button" className="mt-1 text-xs text-text-muted underline"
                    onClick={() => adicionarAoLevantamento([linhaVazia({ contexto: l.texto, evidencia: l.texto, a_conferir: "paciente, prazo" })])}>
                    Criar tarefa a partir desta linha (vai para o Levantamento)
                  </button>
                )}
              </li>
            ))}
          </ul>

          {semRef.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => analisar(true)} loading={carregando === "ia"} loadingText="Pedindo sugestões…" disabled={!resp.iaDisponivel || (!resp.analise.dia && !dia)}>
                Sugerir continuidade com IA ({semRef.length} linha(s))
              </Button>
              {!resp.iaDisponivel && <span className="text-xs text-text-muted">IA não configurada no servidor — use “Criar tarefa a partir desta linha”.</span>}
            </div>
          )}

          {resp.propostas && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-text-primary">Sugestões da IA — revise uma a uma</h3>
              {!resp.propostas.length && <p className="text-sm text-text-muted">Nenhuma sugestão.</p>}
              {resp.propostas.map((p, i) => (
                <div key={i} className="rounded-card border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.tipo === "revisar" ? "critical" : p.tipo === "nova_tarefa" ? "opportunity" : "informative"}>
                      {{ nova_tarefa: "Nova tarefa", atualizar_tarefa: "Atualizar tarefa", encerrar_tarefa: "Encerrar tarefa", revisar: "Revisar" }[p.tipo]}
                    </Badge>
                    {p.ref && <span className="text-xs text-text-muted">{p.ref}</span>}
                  </div>
                  <p className="mt-1 text-xs text-text-muted">Trecho: “{p.evidencia}”</p>
                  {p.tipo === "revisar" && <p className="text-text-secondary">{p.motivo}</p>}
                  {p.tipo === "nova_tarefa" && p.item && (
                    <button type="button" className="mt-1 text-xs text-text-muted underline" onClick={() => adicionarAoLevantamento([linhaDeItem({ ...p.item!, evidencia: p.evidencia })])}>
                      Levar para o Levantamento (revisar e publicar lá)
                    </button>
                  )}
                  {(p.tipo === "atualizar_tarefa" || p.tipo === "encerrar_tarefa") && p.tarefaId && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {p.tipo === "atualizar_tarefa" && (
                        <>
                          <Campo label="Nova data"><input type="date" value={edicoes[i]?.novaData ?? ""} onChange={(e) => setEdicoes((x) => ({ ...x, [i]: { ...x[i]!, novaData: e.target.value } }))} className={classeInput} /></Campo>
                          <Campo label="Próxima ação"><input value={edicoes[i]?.proximaAcao ?? ""} onChange={(e) => setEdicoes((x) => ({ ...x, [i]: { ...x[i]!, proximaAcao: e.target.value } }))} className={classeInput} /></Campo>
                        </>
                      )}
                      <Campo label="Motivo" largo={p.tipo === "encerrar_tarefa"}><input value={edicoes[i]?.motivo ?? ""} onChange={(e) => setEdicoes((x) => ({ ...x, [i]: { ...x[i]!, motivo: e.target.value } }))} className={classeInput} /></Campo>
                      <div className="flex items-end gap-2 sm:col-span-3">
                        <Button onClick={() => aplicar(i, p)} disabled={!!aplicadas[i] && aplicadas[i] === "aplicada"}>Aplicar</Button>
                        {aplicadas[i] && <span className={aplicadas[i] === "aplicada" ? "text-sm text-opportunity" : "text-sm text-critical"}>{aplicadas[i]}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
