"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ItemFila } from "@/lib/fila/agrupamento";
import { Campo, ROTULO_TIPO, brl, chamarApi, dataBr } from "./comum";

const ROTULO_ETAPA: Record<string, string> = {
  a_definir: "a definir", prevista: "prevista", agendada: "agendada", realizada: "realizada", adiada: "adiada", encerrada: "encerrada",
};

/** Linha compacta de um item (usada na seleção do registro agrupado). */
export function LinhaItem({ item, mostrarPrazo = true }: { item: ItemFila; mostrarPrazo?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={item.atencao || item.tipo === "conferir_atendimento" ? "critical" : item.tipo === "cobranca" ? "important" : "informative"}>
          {item.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[item.tipo] ?? item.tipo}
        </Badge>
        {item.atencao && <Badge variant="critical">Atenção</Badge>}
        <span className="text-text-primary">{item.titulo}</span>
        {item.valor !== undefined && <span className="font-medium text-text-primary">{brl(item.valor)}</span>}
        {mostrarPrazo && item.status !== "concluida" && <span className="text-text-muted">· prazo {dataBr(item.due)}</span>}
      </div>
      {item.etapa && (
        <span className="text-xs text-text-muted">
          Etapa do cuidado: {item.etapa.definicao ?? "—"}{item.etapa.situacao ? ` · ${ROTULO_ETAPA[item.etapa.situacao] ?? item.etapa.situacao}` : ""}{item.etapa.data ? ` · ${dataBr(item.etapa.data)}` : ""}
        </span>
      )}
    </div>
  );
}

/** Conferência de atendimento: confirmar realizado cria SEMPRE os três marcos (sem escolha). */
export function ConferirAtendimento({ item, gestao }: { item: ItemFila; gestao: boolean }) {
  const router = useRouter();
  const sugestao = item.detalhe?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const [data, setData] = useState(sugestao ? `${sugestao[3]}-${sugestao[2]}-${sugestao[1]}` : "");
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function executar(operacao: "confirmar" | "anular") {
    setErro(null);
    setSalvando(true);
    const r = await chamarApi("/api/fila/atendimento", "POST", { id: item.alvo!.id, operacao, data, motivo });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-sm text-text-secondary">Confira no Simples Dental se o atendimento consta como realizado e a data exata.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo label="Data exata do atendimento"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      </div>
      <p className="mt-2 text-xs text-text-muted">Ao confirmar, o sistema cria automaticamente os marcos de 30 dias, 90 dias e 6 meses a partir desta data. Agendamento, orçamento ou pagamento não geram marcos.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" loading={salvando} loadingText="Salvando…" disabled={!data} onClick={() => executar("confirmar")}>Confirmar realizado</Button>
        {gestao && <button type="button" className="px-2 py-2 text-sm text-text-muted underline" onClick={() => setAnulando(!anulando)}>Anular</button>}
      </div>
      {anulando && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Campo label="Motivo da anulação *"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <button type="button" disabled={!motivo.trim() || salvando} className="rounded-sm border border-critical px-3 py-2 text-sm text-critical disabled:opacity-50" onClick={() => executar("anular")}>Anular lançamento</button>
        </div>
      )}
      {erro && <p role="alert" className="mt-2 text-sm text-critical">{erro}</p>}
    </div>
  );
}
