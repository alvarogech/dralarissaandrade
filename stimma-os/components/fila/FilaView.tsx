"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CartaoPaciente, ItemFila, Secao } from "@/lib/fila/agrupamento";
import type { Acao, FilaCarregada } from "@/lib/fila/servico";
import { Campo, Historico, ROTULO_TIPO, brl, chamarApi, classeInput, dataBr, numeroBr } from "./comum";

const SECOES: { key: Secao; label: string; vazio: string }[] = [
  { key: "atrasadas", label: "Atrasadas", vazio: "Nada atrasado." },
  { key: "hoje", label: "Hoje", vazio: "Nada pendente para hoje." },
  { key: "aguardando", label: "Aguardando resposta", vazio: "Ninguém aguardando resposta." },
  { key: "proximas", label: "Próximos dias", vazio: "Nada nos próximos 30 dias." },
  { key: "concluidas", label: "Concluídas hoje", vazio: "Nada concluído hoje ainda." },
];

const ORIGENS_VALOR = [
  { value: "parcela", label: "Parcela" },
  { value: "divida_antiga", label: "Dívida antiga" },
  { value: "nova_contratacao", label: "Nova contratação" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "outro", label: "Outro" },
];

export function FilaView({ dados, gestao }: { dados: FilaCarregada; gestao: boolean }) {
  const inicial: Secao = dados.fila.atrasadas.length ? "atrasadas" : "hoje";
  const [secao, setSecao] = useState<Secao>(inicial);
  const [aberto, setAberto] = useState<string | null>(null);
  const cartoes = dados.fila[secao];
  const n = (s: Secao) => dados.fila[s].length;

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-serif text-2xl text-text-primary">Fila</h1>
        <p className="text-sm text-text-secondary">
          {n("hoje") + n("atrasadas")} {n("hoje") + n("atrasadas") === 1 ? "paciente" : "pacientes"} para hoje{n("atrasadas") ? `, ${n("atrasadas")} com atraso` : ""}.
          {dados.maisTarde ? ` ${dados.maisTarde} itens previstos para depois de 30 dias.` : ""}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {SECOES.map((s) => (
          <button key={s.key} onClick={() => { setSecao(s.key); setAberto(null); }}
            className={clsx("rounded-sm px-3 py-1.5 text-sm", s.key === secao ? "bg-accent-soft font-medium text-text-primary" : "text-text-secondary hover:bg-surface-raised", s.key === "atrasadas" && n("atrasadas") > 0 && s.key !== secao && "text-critical")}>
            {s.label} <span className="text-text-muted">{n(s.key)}</span>
          </button>
        ))}
      </div>

      {cartoes.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-text-muted">{SECOES.find((s) => s.key === secao)!.vazio}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cartoes.map((c) => (
            <Cartao key={c.pacienteId} cartao={c} secao={secao} gestao={gestao} aberto={aberto === c.pacienteId} onToggle={() => setAberto(aberto === c.pacienteId ? null : c.pacienteId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaItem({ item, secao }: { item: ItemFila; secao: Secao }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={item.tipo === "cobranca" ? "important" : item.tipo === "conferir_atendimento" ? "critical" : "informative"}>
          {item.subtipo === "comparecimento" ? "Comparecimento" : ROTULO_TIPO[item.tipo] ?? item.tipo}
        </Badge>
        <span className="text-text-primary">{item.titulo}</span>
        {item.valor !== undefined && <span className="font-medium text-text-primary">{brl(item.valor)}</span>}
        {secao !== "concluidas" && <span className="text-text-muted">· prazo {dataBr(item.due)}</span>}
        {item.aConferir?.length ? <Badge variant="important">a conferir: {item.aConferir.join(", ")}</Badge> : null}
      </div>
      {item.contexto && <span className="text-xs text-text-secondary">{item.contexto}</span>}
      {item.proximaAcao && <span className="text-xs text-text-secondary">Próxima ação: {item.proximaAcao}</span>}
      {item.detalhe && <span className="text-xs text-text-muted">{item.detalhe}</span>}
      {item.responsavel && <span className="text-xs text-text-muted">Responsável: {item.responsavel}</span>}
    </div>
  );
}

function Cartao({ cartao, secao, gestao, aberto, onToggle }: { cartao: CartaoPaciente; secao: Secao; gestao: boolean; aberto: boolean; onToggle: () => void }) {
  const podeAgir = secao !== "concluidas";
  return (
    <li className="rounded-md border border-border bg-surface-raised/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">
            {cartao.pacienteNome}
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
          <button onClick={onToggle} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface">
            {aberto ? "Fechar" : "Registrar"}
          </button>
        )}
      </div>
      {aberto && podeAgir && <PainelAcao cartao={cartao} gestao={gestao} />}
    </li>
  );
}

function acoesPara(itens: ItemFila[]): { key: Acao; label: string }[] {
  const comparecimento = itens.length > 0 && itens.every((i) => i.subtipo === "comparecimento");
  const cobranca = itens.length > 0 && itens.every((i) => i.tipo === "cobranca");
  if (comparecimento) return [{ key: "comparecimento", label: "Comparecimento" }, { key: "contato", label: "Fiz contato" }, { key: "adiar", label: "Adiar" }, { key: "encerrar", label: "Encerrar" }];
  return [
    { key: "contato", label: "Fiz contato" },
    { key: "resposta", label: "Respondeu" },
    { key: "agendamento", label: "Agendou consulta" },
    ...(cobranca ? [{ key: "recebimento" as const, label: "Recebimento confirmado" }] : []),
    { key: "adiar", label: "Adiar" },
    { key: "encerrar", label: "Resolver / encerrar" },
  ];
}

function PainelAcao({ cartao, gestao }: { cartao: CartaoPaciente; gestao: boolean }) {
  const router = useRouter();
  const conferir = cartao.itens.filter((i) => i.alvo?.tipo === "atendimento");
  const trabalho = cartao.itens.filter((i) => i.alvo && i.alvo.tipo !== "atendimento");
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(trabalho.map((i) => i.id)));
  const [acao, setAcao] = useState<Acao | null>(null);
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ canal: "whatsapp", notas: "", novaData: "", proximaAcao: "", agendadoPara: "", valor: "", origemValor: "", motivo: "", desfecho: "", compareceu: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const todos = [...trabalho, ...cartao.junto.map((j) => j.item)];
  const escolhidos = todos.filter((i) => selecionados.has(i.id));
  const acoes = acoesPara(escolhidos);

  function alternar(id: string) {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelecionados(s);
    setAcao(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!acao || !escolhidos.length) return;
    setErro(null);
    const valor = numeroBr(f.valor);
    if (acao === "recebimento" && (valor === null || Number.isNaN(valor))) return setErro("Informe o valor recebido.");
    setSalvando(true);
    const r = await chamarApi("/api/fila/acao", "POST", {
      eventoId, acao,
      alvos: escolhidos.map((i) => ({ tipo: i.alvo!.tipo, id: i.alvo!.id })),
      canal: f.canal || undefined, notas: f.notas || undefined, novaData: f.novaData || undefined, proximaAcao: f.proximaAcao || undefined,
      agendadoPara: f.agendadoPara || undefined, valor: valor ?? undefined, origemValor: f.origemValor || undefined,
      motivo: f.motivo || undefined, desfecho: f.desfecho || undefined, compareceu: f.compareceu ? f.compareceu === "sim" : undefined,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setEventoId(crypto.randomUUID());
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
      {conferir.map((i) => <ConferirAtendimento key={i.id} item={i} gestao={gestao} />)}

      {todos.length > 0 && (
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Itens deste registro</legend>
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

          <div className="flex flex-wrap gap-1.5">
            {acoes.map((a) => (
              <button type="button" key={a.key} onClick={() => setAcao(a.key)}
                className={clsx("rounded-sm border px-3 py-1.5 text-sm", acao === a.key ? "border-accent bg-accent-soft text-text-primary" : "border-border text-text-secondary hover:bg-surface")}>
                {a.label}
              </button>
            ))}
          </div>

          {acao && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(acao === "contato" || acao === "resposta") && (
                <Campo label="Canal">
                  <select className={classeInput} value={f.canal} onChange={set("canal")}>
                    <option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="presencial">Presencial</option><option value="outro">Outro</option>
                  </select>
                </Campo>
              )}
              {acao === "contato" && <Campo label="Sem resposta? Tentar de novo em (opcional — senão fica aguardando)"><Input type="date" value={f.novaData} onChange={set("novaData")} /></Campo>}
              {(acao === "resposta" || acao === "adiar") && <Campo label="Data do próximo passo *"><Input type="date" required value={f.novaData} onChange={set("novaData")} /></Campo>}
              {(acao === "contato" || acao === "resposta" || acao === "adiar") && <Campo label="Próxima ação" largo><Input value={f.proximaAcao} onChange={set("proximaAcao")} placeholder="ex.: ligar à tarde e oferecer horário de sábado" /></Campo>}
              {acao === "agendamento" && <Campo label="Data da consulta *"><Input type="date" required value={f.agendadoPara} onChange={set("agendadoPara")} /></Campo>}
              {acao === "recebimento" && (
                <>
                  <Campo label="Valor recebido (R$) *"><Input inputMode="decimal" required value={f.valor} onChange={set("valor")} placeholder="450,00" /></Campo>
                  <Campo label="Origem do valor *">
                    <select required className={classeInput} value={f.origemValor} onChange={set("origemValor")}>
                      <option value="">Escolha…</option>
                      {ORIGENS_VALOR.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Campo>
                </>
              )}
              {acao === "comparecimento" && (
                <Campo label="A paciente compareceu? *">
                  <select required className={classeInput} value={f.compareceu} onChange={set("compareceu")}>
                    <option value="">Escolha…</option><option value="sim">Compareceu</option><option value="nao">Faltou</option>
                  </select>
                </Campo>
              )}
              {acao === "encerrar" && (
                <Campo label="Desfecho *">
                  <select required className={classeInput} value={f.desfecho} onChange={set("desfecho")}>
                    <option value="">Escolha…</option>
                    <option value="resolvido">Objetivo resolvido</option>
                    <option value="dispensado">Encerrar sem resolver (não precisa mais)</option>
                  </select>
                </Campo>
              )}
              {acao === "adiar" && <Campo label="Justificativa *" largo><Input required value={f.motivo} onChange={set("motivo")} /></Campo>}
              {acao === "encerrar" && <Campo label={f.desfecho === "dispensado" ? "Motivo *" : "Resultado alcançado *"} largo><Input required value={f.motivo} onChange={set("motivo")} /></Campo>}
              <Campo label={acao === "contato" ? "O que aconteceu (ex.: sem resposta)" : "Observação (opcional)"} largo>
                <textarea rows={2} className={classeInput} value={f.notas} onChange={set("notas")} />
              </Campo>
              {acao === "agendamento" && <p className="text-xs text-text-muted sm:col-span-2">Ao salvar, a fila cria automaticamente “Confirmar comparecimento” na data da consulta.</p>}
              {acao === "comparecimento" && <p className="text-xs text-text-muted sm:col-span-2">Compareceu: vira “Conferir atendimento” (os marcos de 30/90 dias e 6 meses nascem quando o realizado for confirmado). Faltou: cria a recuperação da falta para amanhã.</p>}
            </div>
          )}

          {erro && <p role="alert" className="text-sm text-critical">{erro}</p>}
          {acao && (
            <div className="flex items-center gap-3">
              <Button type="submit" loading={salvando} loadingText="Salvando…" disabled={!escolhidos.length}>Salvar registro</Button>
              <span className="text-xs text-text-muted">{escolhidos.length} {escolhidos.length === 1 ? "item" : "itens"} · nenhuma mensagem é enviada</span>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function ConferirAtendimento({ item, gestao }: { item: ItemFila; gestao: boolean }) {
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
      <p className="mb-2 text-sm text-text-secondary">Confira no Simples Dental se o atendimento consta como realizado e a data exata. Ao confirmar, os marcos de 30 dias, 90 dias e 6 meses são criados automaticamente.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo label="Data exata do atendimento"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
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
