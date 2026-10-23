"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CartaoPaciente, ItemFila, Secao } from "@/lib/fila/agrupamento";
import { Campo, Historico, ROTULO_TIPO, brl, chamarApi, dataBr } from "./comum";
import { FormRegistro } from "./FormRegistro";

const ROTULO_ETAPA: Record<string, string> = {
  a_definir: "a definir", prevista: "prevista", agendada: "agendada", realizada: "realizada", adiada: "adiada", encerrada: "encerrada",
};

export function LinhaItem({ item, secao }: { item: ItemFila; secao: Secao }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={item.atencao ? "critical" : item.tipo === "conferir_atendimento" ? "critical" : item.tipo === "cobranca" ? "important" : "informative"}>
          {item.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[item.tipo] ?? item.tipo}
        </Badge>
        {item.atencao && <Badge variant="critical">Atenção</Badge>}
        <span className="text-text-primary">{item.titulo}</span>
        {item.valor !== undefined && <span className="font-medium text-text-primary">{brl(item.valor)}</span>}
        {secao !== "concluidas" && <span className="text-text-muted">· prazo {dataBr(item.due)}</span>}
        {item.aConferir?.length ? <Badge variant="important">a conferir: {item.aConferir.join(", ")}</Badge> : null}
      </div>
      {item.contexto && <span className="text-xs text-text-secondary">{item.contexto}</span>}
      {item.proximaAcao && <span className="text-xs text-text-secondary">Próxima ação da Gabi: {item.proximaAcao}{item.responsavel ? ` · ${item.responsavel}` : ""}</span>}
      {!item.proximaAcao && item.responsavel && <span className="text-xs text-text-muted">Responsável: {item.responsavel}</span>}
      {item.etapa && (
        <span className="text-xs text-text-muted">
          Etapa do cuidado: {item.etapa.definicao ?? "—"}{item.etapa.situacao ? ` · ${ROTULO_ETAPA[item.etapa.situacao] ?? item.etapa.situacao}` : ""}{item.etapa.data ? ` · ${dataBr(item.etapa.data)}` : ""}
        </span>
      )}
      {item.detalhe && <span className="text-xs text-text-muted">{item.detalhe}</span>}
    </div>
  );
}

export function Cartao({ cartao, secao, gestao, aberto, onToggle }: { cartao: CartaoPaciente; secao: Secao; gestao: boolean; aberto: boolean; onToggle: () => void }) {
  const podeAgir = secao !== "concluidas";
  return (
    <li className="rounded-[12px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">
            {cartao.pacienteNome}
            {cartao.itens[0]?.semPaciente && <span className="ml-2 text-xs font-normal text-text-muted">(assunto)</span>}
            {cartao.atrasoDias > 0 && <span className="ml-2 align-middle"><Badge variant="critical">{cartao.atrasoDias} {cartao.atrasoDias === 1 ? "dia" : "dias"} de atraso</Badge></span>}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {cartao.itens.map((i) => (
              <div key={i.id}>
                <LinhaItem item={i} secao={secao} />
                {i.alvo && i.alvo.tipo !== "atendimento" && <Historico tipo={i.alvo.tipo} id={i.alvo.id} />}
              </div>
            ))}
          </div>
          {cartao.junto.length > 0 && !aberto && (
            <p className="mt-2 text-xs text-text-muted">+ {cartao.junto.length} {cartao.junto.length === 1 ? "item que vence" : "itens que vencem"} em até 14 dias, se quiser tratar junto</p>
          )}
        </div>
        {podeAgir && (
          <button onClick={onToggle} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised">
            {aberto ? "Fechar" : "Registrar"}
          </button>
        )}
      </div>
      {aberto && podeAgir && <PainelRegistro cartao={cartao} gestao={gestao} onSalvo={onToggle} />}
    </li>
  );
}

function PainelRegistro({ cartao, gestao, onSalvo }: { cartao: CartaoPaciente; gestao: boolean; onSalvo: () => void }) {
  const conferir = cartao.itens.filter((i) => i.alvo?.tipo === "atendimento");
  const trabalho = cartao.itens.filter((i) => i.alvo && i.alvo.tipo !== "atendimento");
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(trabalho.map((i) => i.id)));
  const todos = [...trabalho, ...cartao.junto.map((j) => j.item)];
  const escolhidos = todos.filter((i) => selecionados.has(i.id));
  // O formulário recomeça quando a seleção muda (tipo e contexto vêm dos itens escolhidos).
  const chave = escolhidos.map((i) => i.id).join(",");

  function alternar(id: string) {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelecionados(s);
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
      {conferir.map((i) => <ConferirAtendimento key={i.id} item={i} gestao={gestao} />)}
      {todos.length > 0 && (
        <>
          {todos.length > 1 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Itens deste registro (histórico individual em cada um)</legend>
              {trabalho.map((i) => (
                <label key={i.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={selecionados.has(i.id)} onChange={() => alternar(i.id)} />
                  <LinhaItem item={i} secao="hoje" />
                </label>
              ))}
              {cartao.junto.length > 0 && <p className="mt-1 text-xs text-text-muted">Pode ser tratado junto (vence em até 14 dias):</p>}
              {cartao.junto.map(({ item }) => (
                <label key={item.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={selecionados.has(item.id)} onChange={() => alternar(item.id)} />
                  <LinhaItem item={item} secao="proximas" />
                </label>
              ))}
            </fieldset>
          )}
          {escolhidos.length > 0 ? <FormRegistro key={chave} alvos={escolhidos} onSalvo={onSalvo} /> : <p className="text-sm text-text-muted">Marque ao menos um item.</p>}
        </>
      )}
    </div>
  );
}

const MARCOS = [["d30", "30 dias"], ["d90", "90 dias"], ["m6", "6 meses"]] as const;

function ConferirAtendimento({ item, gestao }: { item: ItemFila; gestao: boolean }) {
  const router = useRouter();
  const sugestao = item.detalhe?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const [data, setData] = useState(sugestao ? `${sugestao[3]}-${sugestao[2]}-${sugestao[1]}` : "");
  const [marcos, setMarcos] = useState<Set<string>>(new Set(["d30", "d90", "m6"]));
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function executar(operacao: "confirmar" | "anular") {
    setErro(null);
    setSalvando(true);
    const r = await chamarApi("/api/fila/atendimento", "POST", { id: item.alvo!.id, operacao, data, motivo, marcos: [...marcos] });
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
      <fieldset className="mt-2 text-sm">
        <legend className="text-xs text-text-secondary">Marcos de acompanhamento pertinentes (conforme orientação da Dra. Larissa)</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {MARCOS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={marcos.has(k)} onChange={() => { const s = new Set(marcos); if (s.has(k)) s.delete(k); else s.add(k); setMarcos(s); }} /> {l}
            </label>
          ))}
        </div>
        {marcos.size === 0 && <p className="mt-1 text-xs text-text-muted">Nenhum marco será criado para este atendimento.</p>}
      </fieldset>
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
