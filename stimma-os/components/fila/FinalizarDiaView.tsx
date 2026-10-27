"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { Fechamento } from "@/lib/fila/fechamento";
import type { EstadoExpediente } from "@/lib/fila/meu-dia";
import type { FeedbackRow } from "@/lib/fila/store";
import { ErroAcao, chamarApi, classeInput, dataBr, soHora } from "./comum";

/**
 * Etapa 3 — "Finalizar meu dia". Reúne o que já foi registrado (rotina, registros, pendências) sem
 * pedir nada de novo, aceita uma observação opcional e envia o feedback à gestão com um botão só.
 * "Feedback enviado com sucesso!" só aparece depois da confirmação do servidor; repetir o clique
 * não duplica (o servidor devolve o envio existente). Enviar não conclui pendências, não altera o
 * Simples Dental e não manda mensagem a ninguém.
 */
interface Props {
  hoje: string;
  fechamento: Fechamento;
  /** Texto ao vivo, montado dos registros salvos. */
  texto: string;
  estado: EstadoExpediente;
  /** Versão mais recente entregue (para "Ver feedback enviado"). */
  entregue: FeedbackRow | null;
  aguardandoGestao: number;
  encaminhamentosComercial: number;
  atrasadas: number;
}

function Linha({ k, v, tom }: { k: string; v: React.ReactNode; tom?: "critico" | "atencao" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 last:border-b-0">
      <dt className="text-[14px] text-text-secondary">{k}</dt>
      <dd className={clsx("text-[15px] font-semibold tabular-nums", tom === "critico" ? "text-critical" : tom === "atencao" ? "text-important" : "text-text-primary")}>{v}</dd>
    </div>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio?: string }) {
  if (!itens.length && !vazio) return null;
  return (
    <details className="group rounded-control border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-[14px] text-text-primary">{titulo} ({itens.length})</summary>
      <ul className="list-disc space-y-0.5 border-t border-border px-3 py-2 pl-7 text-[13.5px] text-text-secondary">
        {itens.length ? itens.map((t, k) => <li key={k}>{t}</li>) : <li className="list-none text-text-muted">{vazio}</li>}
      </ul>
    </details>
  );
}

export function FinalizarDiaView({ hoje, fechamento: f, texto, estado, entregue, aguardandoGestao, encaminhamentosComercial, atrasadas }: Props) {
  const router = useRouter();
  const chaveObs = `stimma-observacao:${hoje}`;
  const [obs, setObs] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; status?: number; conflito?: boolean } | null>(null);
  const [sucesso, setSucesso] = useState<FeedbackRow | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [idEnvio, setIdEnvio] = useState(() => crypto.randomUUID());
  const refSucesso = useRef<HTMLHeadingElement>(null);
  const refFalha = useRef<HTMLDivElement>(null);

  // Rascunho da observação: só neste navegador, até o envio (o feedback em si vem do servidor).
  useEffect(() => {
    try { setObs(localStorage.getItem(chaveObs) ?? (String(entregue?.contadores.observacao_concierge ?? ""))); } catch { /* ignora */ }
  }, [chaveObs, entregue]);
  function mudarObs(v: string) {
    setObs(v);
    try { localStorage.setItem(chaveObs, v); } catch { /* ignora */ }
  }

  const r = f.rotina;
  const semRegistro = r?.pendentes ?? [];
  const avisos = [
    semRegistro.length ? `${semRegistro.length} atividade${semRegistro.length === 1 ? "" : "s"} da rotina ainda sem registro.` : null,
    r?.impedimentos.length ? `${r.impedimentos.length} atividade${r.impedimentos.length === 1 ? "" : "s"} com impedimento: a gestão vai ver o motivo.` : null,
    atrasadas ? `${atrasadas} pendência${atrasadas === 1 ? "" : "s"} atrasada${atrasadas === 1 ? "" : "s"} continua${atrasadas === 1 ? "" : "m"} aberta${atrasadas === 1 ? "" : "s"} e volta${atrasadas === 1 ? "" : "m"} amanhã.` : null,
  ].filter((x): x is string => !!x);

  const jaEnviado = estado.tipo === "enviado" && !estado.mudouDepois && !sucesso;
  const corrigir = estado.tipo === "ajuste_solicitado" || (estado.tipo === "enviado" && estado.mudouDepois);
  const rotuloBotao = estado.tipo === "ajuste_solicitado" ? "Enviar versão corrigida" : estado.tipo === "enviado" && estado.mudouDepois ? "Enviar versão atualizada" : "Finalizar e enviar feedback";

  async function enviar() {
    setFalha(null);
    setEnviando(true);
    const res = await chamarApi<{ feedback: FeedbackRow; jaEnviado: boolean }>("/api/fila/feedback-diario", "POST", { operacao: "finalizar", id: idEnvio, dia: hoje, observacao: obs, corrigir });
    setEnviando(false);
    if (!res.ok) {
      setFalha({
        erro: res.incerto ? "Não recebemos a confirmação do envio. Seu feedback pode não ter sido enviado: toque em “Tentar novamente” (não duplica)." : `Seu feedback ainda não foi enviado. ${res.erro}`,
        status: res.status, conflito: res.status === 409,
      });
      setTimeout(() => refFalha.current?.focus(), 0);
      return;
    }
    setSucesso(res.data.feedback);
    setRevisando(false);
    setIdEnvio(crypto.randomUUID());
    try { localStorage.removeItem(chaveObs); } catch { /* ignora */ }
    router.refresh();
    setTimeout(() => refSucesso.current?.focus(), 50);
  }

  function aoClicarFinalizar() {
    if (avisos.length) { setRevisando(true); return; }
    void enviar();
  }

  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); setCopiado("Copiado. Copiar não é o mesmo que enviar: o envio à gestão é pelo botão."); }
    catch { setCopiado("Não consegui copiar. Selecione o texto e copie."); }
  }

  const enviadoAgora = sucesso ?? (jaEnviado ? entregue : null);
  const textoEnviado = enviadoAgora?.texto ?? entregue?.texto ?? "";

  return (
    <div className="flex flex-col gap-5">
      {enviadoAgora && (
        <section aria-labelledby="fb-enviado" className="rounded-card border border-opportunity bg-opportunity-bg p-5">
          <h3 id="fb-enviado" ref={refSucesso} tabIndex={-1} className="font-serif text-[26px] font-medium leading-tight text-opportunity outline-none">
            <span aria-hidden>✓ </span>{sucesso ? "Feedback enviado com sucesso!" : "Seu feedback de hoje já foi enviado"}
          </h3>
          <p className="mt-1 text-[15px] text-text-primary">Seu resumo do dia foi registrado e está disponível para a gestão.</p>
          <p className="mt-1 text-[13.5px] text-text-secondary">
            Enviado em {dataBr(enviadoAgora.dia)} às {enviadoAgora.entregueEm ? soHora(enviadoAgora.entregueEm) : "—"} · versão {enviadoAgora.versao}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variante="secundario" aria-expanded={verTexto} onClick={() => setVerTexto(!verTexto)}>{verTexto ? "Esconder feedback enviado" : "Ver feedback enviado"}</Button>
          </div>
          {verTexto && <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface p-3 font-sans text-[13px] leading-relaxed text-text-primary">{textoEnviado}</pre>}
          <p className="mt-3 text-[13px] text-text-secondary">As pendências que continuam abertas seguem na etapa Pendências e voltam nas datas combinadas.</p>
        </section>
      )}

      {estado.tipo === "ajuste_solicitado" && !sucesso && (
        <section role="status" className="rounded-card border border-important bg-important-bg p-4 text-[14.5px] text-important">
          <p className="font-semibold">A gestão pediu um ajuste no feedback enviado (versão {estado.versao}).</p>
          {estado.observacao && <p className="mt-1">“{estado.observacao}”</p>}
          <p className="mt-1 text-[13.5px]">Faça os registros que faltam e envie a versão corrigida. A versão anterior continua guardada.</p>
        </section>
      )}
      {estado.tipo === "enviado" && estado.mudouDepois && !sucesso && (
        <section role="status" className="rounded-card border border-informative bg-informative-bg p-4 text-[14.5px] text-informative">
          <p className="font-semibold">Seu feedback foi enviado às {entregue?.entregueEm ? soHora(entregue.entregueEm) : "—"}, e você registrou algo depois disso.</p>
          <p className="mt-1 text-[13.5px]">Se quiser que a gestão veja, envie a versão atualizada. A anterior continua guardada.</p>
        </section>
      )}

      <section aria-labelledby="resumo-dia" className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <h3 id="resumo-dia" className="font-serif text-[22px] font-medium text-text-primary">Resumo do seu dia</h3>
        <p className="mt-0.5 text-[13px] text-text-muted">Seu feedback foi preparado com base no que você registrou ao longo do dia. Nada aqui precisa ser digitado de novo.</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="fb-eyebrow mb-1">Rotina</h4>
            {r ? (
              <>
                <dl>
                  <Linha k="Executadas" v={r.feitos.length} />
                  <Linha k="Não se aplica" v={r.naoSeAplica.length} />
                  <Linha k="Com impedimento" v={r.impedimentos.length} tom={r.impedimentos.length ? "critico" : undefined} />
                  <Linha k="Ainda sem registro" v={semRegistro.length} tom={semRegistro.length ? "atencao" : undefined} />
                </dl>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Lista titulo="Com impedimento" itens={r.impedimentos.map((i) => `${i.item}: ${i.motivo} — próxima ação: ${i.proxima}`)} />
                  <Lista titulo="Ainda sem registro" itens={semRegistro} />
                  {r.quantidades.length > 0 && <Lista titulo="Quantidades registradas" itens={r.quantidades.map((q) => `${q.item} — ${q.texto}`)} />}
                </div>
              </>
            ) : <p className="text-[14px] text-text-muted">A rotina não está disponível agora; o resto do resumo continua valendo.</p>}
          </div>
          <div>
            <h4 className="fb-eyebrow mb-1">Pacientes e pendências</h4>
            <dl>
              <Linha k="Contatos realizados" v={`${f.contadores.tentativasContato}${f.contadores.pacientesContatadas ? ` (${f.contadores.pacientesContatadas} paciente${f.contadores.pacientesContatadas === 1 ? "" : "s"})` : ""}`} />
              <Linha k="Acompanhamentos registrados" v={f.contadores.registros} />
              <Linha k="Respostas recebidas" v={f.contadores.respostas} />
              <Linha k="Agendamentos" v={f.contadores.agendamentos} />
              <Linha k="Resolvidos hoje" v={f.contadores.resolvidos} />
              <Linha k="Pendências que continuam abertas" v={f.pendentesAbertas.length} />
              <Linha k="Aguardando a gestão" v={aguardandoGestao} tom={aguardandoGestao ? "atencao" : undefined} />
              <Linha k="Encaminhadas à comercial externa" v={encaminhamentosComercial} />
            </dl>
            <div className="mt-2 flex flex-col gap-1.5">
              <Lista titulo="Pendências que continuam abertas" itens={f.pendentesAbertas.map((p) => `${p.paciente} — ${p.item} (${p.quando})`)} />
              <Lista titulo="Atenção para o próximo dia útil" itens={f.prioridades.map((p) => p.texto)} vazio="Nenhuma prioridade sugerida." />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <label htmlFor="obs-final" className="block text-[15px] font-semibold text-text-primary">Algo importante que a gestão precisa saber?</label>
        <p className="mt-0.5 text-[13px] text-text-muted">Opcional. Não precisa repetir o que já está nas pendências.</p>
        <textarea id="obs-final" rows={3} value={obs} onChange={(e) => mudarObs(e.target.value)} maxLength={2000} className={clsx(classeInput, "mt-2")}
          placeholder="Registre alguma ocorrência, dúvida ou informação importante do dia." />
      </section>

      {revisando && !enviando && (
        <section role="alertdialog" aria-labelledby="rev-titulo" aria-describedby="rev-texto" className="rounded-card border border-important bg-important-bg p-4">
          <h3 id="rev-titulo" className="text-[16px] font-semibold text-important">Antes de enviar, confira:</h3>
          <ul id="rev-texto" className="mt-1.5 list-disc space-y-0.5 pl-5 text-[14px] text-text-primary">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="mt-2 text-[13px] text-text-secondary">Você pode enviar assim mesmo. Enviar não conclui nenhuma pendência e não manda mensagem para pacientes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void enviar()}>Confirmar e enviar</Button>
            <Button type="button" variante="secundario" onClick={() => setRevisando(false)}>Voltar e revisar</Button>
          </div>
        </section>
      )}

      {falha && (
        <div ref={refFalha} tabIndex={-1} className="outline-none">
          <ErroAcao erro={falha.erro} status={falha.status} onTentar={falha.conflito ? undefined : () => void enviar()} />
          {falha.conflito && <p className="mt-2 text-[13px] text-text-secondary">Use o botão abaixo para enviar a versão nova.</p>}
        </div>
      )}

      {(!enviadoAgora || corrigir) && (
        <div className="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-4 sm:p-5">
          <Button type="button" className="min-h-12 px-7 text-[16px]" loading={enviando} loadingText="Enviando…" disabled={revisando} onClick={aoClicarFinalizar}>
            {rotuloBotao}
          </Button>
          <p className="text-[12.5px] text-text-muted">O feedback vai para a gestão no sistema. Nada é enviado por WhatsApp automaticamente.</p>
        </div>
      )}

      <details className="rounded-card border border-border bg-surface" onToggle={() => setCopiado(null)}>
        <summary className="cursor-pointer px-4 py-3 text-[14px] text-text-secondary">Ver o texto completo {enviadoAgora && !corrigir ? "enviado" : "que será enviado"}</summary>
        <div className="border-t border-border p-4">
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface-raised p-3 font-sans text-[13px] leading-relaxed text-text-primary">
            {enviadoAgora && !corrigir ? textoEnviado : `${texto}${obs.trim() ? `\n\n*Observações do dia*\n${obs.trim()}` : ""}`}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className="fb-chip" onClick={() => void copiar(enviadoAgora && !corrigir ? textoEnviado : texto)}>Copiar para o WhatsApp (opcional)</button>
            {copiado && <span role="status" className="text-[13px] text-text-secondary">{copiado}</span>}
          </div>
        </div>
      </details>

      <p className="text-[13px] text-text-muted">
        Quer ver os registros por área ou os feedbacks anteriores? <a href="/fila" className="text-accent underline underline-offset-4">Registros e histórico</a>.
      </p>
    </div>
  );
}
