"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Indisponivel } from "./Indisponivel";
import { Campo, Historico, ROTULO_TIPO, brl, chamarApi, classeInput, dataBr, numeroBr } from "./comum";

/** Gestão manual: criar, editar, atribuir, reagendar e cancelar tarefas — tudo com histórico. */
interface TarefaG {
  id: string;
  ref: string;
  paciente: string;
  kind: string;
  acao: string;
  contexto: string;
  prazo: string;
  valor: number | null;
  responsavel: string | null;
  status: string;
  proximaAcao: string | null;
  resultado: string | null;
  origem: string | null;
}
interface Dados {
  perfis: { id: string; nome: string }[];
  pacientes: { id: string; nome: string; sd_codigo: string | null }[];
  tarefas: TarefaG[];
}

const KINDS = ["cobranca", "recuperacao_falta", "continuidade", "relacionamento", "encaminhamento", "outro"];
const STATUS: Record<string, string> = { open: "Aberta", in_progress: "Aberta", waiting: "Aguardando", completed: "Concluída", cancelled: "Cancelada" };

export function TarefasGestaoView() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verEncerradas, setVerEncerradas] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Dados>("/api/fila/tarefas", "GET");
    if (r.ok) setDados(r.data);
    else setErro(r.erro);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) return <Indisponivel titulo="Lista de tarefas" motivo={erro} onTentar={() => { setErro(null); void carregar(); }} />;
  if (!dados) return <p className="text-sm text-text-muted">Carregando tarefas…</p>;
  const lista = dados.tarefas.filter((t) => verEncerradas || !["completed", "cancelled"].includes(t.status));
  const nomePerfil = (id: string | null) => dados.perfis.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setCriando(!criando)}>{criando ? "Fechar" : "+ Nova tarefa"}</Button>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={verEncerradas} onChange={(e) => setVerEncerradas(e.target.checked)} /> Mostrar encerradas (últimos 7 dias)
        </label>
      </div>
      {criando && <NovaTarefaForm dados={dados} onCriada={() => { setCriando(false); void carregar(); }} />}
      {!lista.length && <p className="rounded-md border border-border p-4 text-sm text-text-muted">Nenhuma tarefa.</p>}
      <ul className="flex flex-col gap-2">
        {lista.map((t) => (
          <li key={t.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-text-primary">{t.paciente}</span>
              <Badge variant={t.kind === "cobranca" ? "important" : "informative"}>{ROTULO_TIPO[t.kind] ?? t.kind}</Badge>
              <Badge variant={["completed", "cancelled"].includes(t.status) ? "neutral" : t.status === "waiting" ? "important" : "opportunity"}>{STATUS[t.status] ?? t.status}</Badge>
              <span className="text-xs text-text-muted">{t.ref}</span>
            </div>
            <p className="mt-1 text-text-primary">{t.acao}{t.valor !== null ? ` · ${brl(t.valor)}` : ""}</p>
            <p className="text-xs text-text-secondary">
              Prazo {dataBr(t.prazo)} · Responsável: {nomePerfil(t.responsavel)}{t.contexto ? ` · ${t.contexto}` : ""}{t.proximaAcao ? ` · Próxima ação: ${t.proximaAcao}` : ""}
            </p>
            {t.resultado && <p className="text-xs text-text-secondary">Resultado: {t.resultado}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {!["completed", "cancelled"].includes(t.status) && (
                <button type="button" className="text-xs text-text-secondary underline" onClick={() => setEditando(editando === t.id ? null : t.id)}>
                  {editando === t.id ? "Fechar edição" : "Editar / reagendar / cancelar"}
                </button>
              )}
              <Historico tipo="tarefa" id={t.id} />
            </div>
            {editando === t.id && <EditarForm t={t} perfis={dados.perfis} onSalvo={() => { setEditando(null); void carregar(); }} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditarForm({ t, perfis, onSalvo }: { t: TarefaG; perfis: Dados["perfis"]; onSalvo: () => void }) {
  const [f, setF] = useState({ acao: t.acao, contexto: t.contexto, prazo: t.prazo, valor: t.valor === null ? "" : String(t.valor).replace(".", ","), responsavel: t.responsavel ?? "", motivo: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(cancelar: boolean) {
    setErro(null);
    const valor = numeroBr(f.valor);
    if (Number.isNaN(valor)) return setErro("Valor inválido.");
    setSalvando(true);
    const r = await chamarApi(`/api/fila/tarefas/${t.id}`, "PATCH", cancelar
      ? { cancelar: true, motivo: f.motivo }
      : { acao: f.acao, contexto: f.contexto, prazo: f.prazo, valor, responsavel: f.responsavel || null, motivo: f.motivo || undefined });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    onSalvo();
  }

  return (
    <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
      <Campo label="Ação solicitada" largo><input value={f.acao} onChange={(e) => setF({ ...f, acao: e.target.value })} className={classeInput} /></Campo>
      <Campo label="Prazo"><input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} className={classeInput} /></Campo>
      <Campo label="Contexto" largo><input value={f.contexto} onChange={(e) => setF({ ...f, contexto: e.target.value })} className={classeInput} /></Campo>
      <Campo label="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} className={classeInput} /></Campo>
      <Campo label="Responsável">
        <select value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} className={classeInput}>
          <option value="">Ninguém</option>
          {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <Campo label="Motivo (obrigatório para reagendar ou cancelar)" largo><input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} className={classeInput} /></Campo>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button onClick={() => salvar(false)} loading={salvando} loadingText="Salvando…">Salvar alterações</Button>
        <button type="button" disabled={salvando} onClick={() => salvar(true)} className="rounded-sm border border-critical px-3 py-2 text-sm text-critical">Cancelar tarefa</button>
        {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
      </div>
    </div>
  );
}

function NovaTarefaForm({ dados, onCriada }: { dados: Dados; onCriada: () => void }) {
  const [f, setF] = useState({ pacienteId: "", nome: "", sd_codigo: "", telefone: "", kind: "outro", acao: "", contexto: "", prazo: "", valor: "", vencimento: "", responsavel: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const valor = numeroBr(f.valor);
    if (Number.isNaN(valor)) return setErro("Valor inválido.");
    setSalvando(true);
    const r = await chamarApi<{ id: string }>("/api/fila/tarefas", "POST", {
      pacienteId: f.pacienteId || undefined,
      novoPaciente: f.pacienteId ? undefined : { nome: f.nome, sd_codigo: f.sd_codigo || undefined, telefone: f.telefone || undefined },
      kind: f.kind, acao: f.acao, contexto: f.contexto, prazo: f.prazo, valor, vencimento: f.vencimento || null, responsavel: f.responsavel || null, origem: "manual (gestão)",
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    onCriada();
  }

  return (
    <form onSubmit={criar} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
      <Campo label="Paciente existente" largo>
        <select value={f.pacienteId} onChange={set("pacienteId")} className={classeInput}>
          <option value="">— nova paciente —</option>
          {dados.pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.sd_codigo ? ` (cód. ${p.sd_codigo})` : ""}</option>)}
        </select>
      </Campo>
      <Campo label="Tipo">
        <select value={f.kind} onChange={set("kind")} className={classeInput}>{KINDS.map((k) => <option key={k} value={k}>{ROTULO_TIPO[k]}</option>)}</select>
      </Campo>
      {!f.pacienteId && (
        <>
          <Campo label="Nome da nova paciente"><input value={f.nome} onChange={set("nome")} className={classeInput} /></Campo>
          <Campo label="Código no Simples Dental"><input value={f.sd_codigo} onChange={set("sd_codigo")} className={classeInput} /></Campo>
          <Campo label="Telefone"><input value={f.telefone} onChange={set("telefone")} className={classeInput} /></Campo>
        </>
      )}
      <Campo label="Ação solicitada *" largo><input required value={f.acao} onChange={set("acao")} className={classeInput} /></Campo>
      <Campo label="Prazo *"><input required type="date" value={f.prazo} onChange={set("prazo")} className={classeInput} /></Campo>
      <Campo label="Contexto" largo><input value={f.contexto} onChange={set("contexto")} className={classeInput} /></Campo>
      <Campo label="Responsável">
        <select value={f.responsavel} onChange={set("responsavel")} className={classeInput}>
          <option value="">Ninguém</option>
          {dados.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      {f.kind === "cobranca" && (
        <>
          <Campo label="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={set("valor")} className={classeInput} /></Campo>
          <Campo label="Vencimento"><input type="date" value={f.vencimento} onChange={set("vencimento")} className={classeInput} /></Campo>
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" loading={salvando} loadingText="Criando…">Criar tarefa</Button>
        {erro && <span role="alert" className="text-sm text-critical">{erro}</span>}
      </div>
    </form>
  );
}
