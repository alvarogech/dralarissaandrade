"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ETAPAS_MEU_DIA, textoEstadoExpediente, type EstadoExpediente, type EtapaMeuDia, type ProximaAcao } from "@/lib/fila/meu-dia";

/**
 * "Meu trabalho" da concierge como percurso guiado: tela inicial que responde "o que faço agora?",
 * três etapas (Minha rotina → Pendências → Finalizar meu dia) com indicação de onde ela está e
 * botões explícitos de avançar/voltar. Navegar nunca é bloqueado nem apaga nada: os registros já
 * estão no servidor; a etapa fica na URL (?etapa=) e é lembrada no dia, para retomar de onde parou.
 */
interface Props {
  nome: string;
  hoje: string;
  estado: EstadoExpediente;
  proxima: ProximaAcao;
  etapaInicial: EtapaMeuDia | null;
  resumo: {
    rotina: { respondidos: number; total: number; impedimentos: number } | null;
    atrasadas: number;
    paraHoje: number;
    aguardandoGestao: number;
  };
  conteudo: Record<EtapaMeuDia, React.ReactNode>;
}

const AJUDA: Record<EtapaMeuDia | "inicio", string[]> = {
  inicio: [
    "O botão principal leva você para o próximo passo do dia.",
    "Você pode abrir qualquer etapa a qualquer momento pelos números 1, 2 e 3.",
    "Tudo o que você marca é salvo na hora. Se sair e voltar, continua de onde parou.",
  ],
  rotina: [
    "Abra um grupo (Início do dia, Durante o dia, Fechamento) e marque o que aconteceu em cada atividade.",
    "“Não se aplica” conta como respondida, mas não como feita.",
    "Se algo impediu uma atividade, escolha “Com impedimento” e explique em poucas palavras.",
    "Você não precisa terminar a rotina para seguir: pode ir às pendências e voltar depois.",
  ],
  pendencias: [
    "Comece pelas atrasadas e pelas de hoje.",
    "Toque na pendência e depois em “Registrar andamento”. Escolha o que aconteceu e o próximo passo.",
    "Mensagem sem resposta não resolve o caso: a pendência volta na data que você escolher.",
    "Ficou com dúvida em um caso? Use “Pedir orientação” dentro da pendência.",
  ],
  finalizar: [
    "O resumo foi preparado com base no que você registrou ao longo do dia.",
    "Se quiser, escreva uma observação para a gestão.",
    "Toque em “Finalizar e enviar feedback”. Só aparece “Feedback enviado” depois que o sistema confirmar.",
    "Enviar o feedback não conclui pendências nem manda mensagem para pacientes.",
  ],
};

function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function dataPorExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
}

export function MeuDiaView({ nome, hoje, estado, proxima, etapaInicial, resumo, conteudo }: Props) {
  const [etapa, setEtapa] = useState<EtapaMeuDia | null>(etapaInicial);
  const [ajuda, setAjuda] = useState(false);
  const [ola, setOla] = useState("Olá");
  const titulo = useRef<HTMLHeadingElement>(null);
  const chave = `stimma-meu-dia:${hoje}`;

  useEffect(() => setOla(saudacao()), []);
  // Sem etapa na URL: retoma a última etapa aberta hoje (conveniência; os dados estão no servidor).
  useEffect(() => {
    if (etapaInicial) return;
    try {
      const salva = localStorage.getItem(chave);
      if (salva && ETAPAS_MEU_DIA.some((e) => e.id === salva)) {
        setEtapa(salva as EtapaMeuDia);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?etapa=${salva}`);
      }
    } catch { /* sem armazenamento: começa na tela inicial */ }
  }, [chave, etapaInicial]);

  function ir(e: EtapaMeuDia | null) {
    setEtapa(e);
    setAjuda(false);
    try { if (e) localStorage.setItem(chave, e); else localStorage.removeItem(chave); } catch { /* ignora */ }
    const url = e ? `${window.location.pathname}?etapa=${e}` : window.location.pathname;
    window.history.pushState(window.history.state, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => titulo.current?.focus(), 50);
  }
  // Voltar/avançar do navegador acompanham a etapa.
  useEffect(() => {
    const aoVoltar = () => {
      const e = new URLSearchParams(window.location.search).get("etapa");
      setEtapa(ETAPAS_MEU_DIA.some((x) => x.id === e) ? (e as EtapaMeuDia) : null);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  const indice = etapa ? ETAPAS_MEU_DIA.findIndex((e) => e.id === etapa) : -1;
  const enviado = estado.tipo === "enviado";
  const tomEstado = estado.tipo === "enviado" ? "border-opportunity bg-opportunity-bg text-opportunity" : estado.tipo === "ajuste_solicitado" ? "border-important bg-important-bg text-important" : estado.tipo === "em_andamento" ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-text-secondary";
  const feitoNaEtapa: Record<EtapaMeuDia, string> = {
    rotina: resumo.rotina ? `${resumo.rotina.respondidos} de ${resumo.rotina.total} registradas${resumo.rotina.impedimentos ? ` · ${resumo.rotina.impedimentos} com impedimento` : ""}` : "Rotina indisponível agora",
    pendencias: resumo.atrasadas || resumo.paraHoje ? `${resumo.atrasadas} atrasada${resumo.atrasadas === 1 ? "" : "s"} · ${resumo.paraHoje} para hoje` : "Nada atrasado nem vencendo hoje",
    finalizar: enviado ? textoEstadoExpediente(estado) : estado.tipo === "ajuste_solicitado" ? "Ajuste pedido pela gestão" : "Ainda não enviado",
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fb-eyebrow">{dataPorExtenso(hoje)}</p>
          <h1 className="fb-titulo mt-2">{ola}, {nome}!</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("inline-flex min-h-9 items-center gap-2 rounded-control border px-3 text-[13.5px] font-medium", tomEstado)}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="sr-only">Situação do dia: </span>{textoEstadoExpediente(estado)}
          </span>
          <button type="button" onClick={() => setAjuda(!ajuda)} aria-expanded={ajuda} className="inline-flex min-h-9 items-center rounded-control border border-border-strong bg-surface px-3 text-[13.5px] text-text-secondary hover:bg-surface-hover">
            Preciso de ajuda
          </button>
        </div>
      </header>

      {ajuda && (
        <section role="region" aria-label="Ajuda" className="rounded-card border border-informative bg-informative-bg p-4 text-[14px] text-informative">
          <p className="font-semibold">{etapa ? `Como usar: ${ETAPAS_MEU_DIA[indice]!.titulo}` : "Como usar o Meu trabalho"}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">{AJUDA[etapa ?? "inicio"].map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2 text-[13px]">Ainda com dúvida em um caso? Abra a pendência e use “Pedir orientação”: a gestão responde ali mesmo.</p>
        </section>
      )}

      {/* Progresso: onde estou e o que vem depois. Cada etapa pode ser aberta a qualquer momento. */}
      <nav aria-label="Etapas do dia">
        <ol className="grid grid-cols-3 gap-2">
          {ETAPAS_MEU_DIA.map((e, k) => {
            const atual = etapa === e.id;
            const concluida = (e.id === "rotina" && resumo.rotina && resumo.rotina.total > 0 && resumo.rotina.respondidos === resumo.rotina.total) || (e.id === "finalizar" && enviado);
            return (
              <li key={e.id}>
                <button type="button" onClick={() => ir(e.id)} aria-current={atual ? "step" : undefined}
                  className={clsx("flex h-full w-full flex-col items-center gap-1.5 rounded-card border px-2 py-2.5 text-center transition-colors sm:flex-row sm:items-start sm:gap-2.5 sm:px-3 sm:text-left",
                    atual ? "border-graphite bg-surface ring-1 ring-graphite" : "border-border bg-surface hover:border-border-strong")}>
                  <span aria-hidden className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular-nums",
                    atual ? "border-graphite bg-graphite text-white" : concluida ? "border-opportunity bg-opportunity-bg text-opportunity" : "border-border-strong text-text-secondary")}>
                    {concluida && !atual ? "✓" : k + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={clsx("block text-[14px] leading-tight", atual ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
                      <span className="sm:hidden">{e.curto}</span><span className="hidden sm:inline">{e.titulo}</span>
                    </span>
                    <span className="mt-0.5 hidden text-[12.5px] text-text-muted md:block">{feitoNaEtapa[e.id]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Retomou numa etapa? A recomendação do momento continua à vista, em uma linha. */}
      {etapa !== null && proxima.etapa !== etapa && (
        <aside aria-label="O que fazer agora" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent bg-accent-soft px-4 py-3">
          <p className="text-[14px] text-text-primary"><span className="font-semibold text-accent">O que fazer agora:</span> {proxima.titulo}</p>
          <Button type="button" variante="secundario" onClick={() => ir(proxima.etapa)}>Ir para {ETAPAS_MEU_DIA.find((e) => e.id === proxima.etapa)!.curto.toLowerCase()} →</Button>
        </aside>
      )}

      {etapa === null ? (
        <section aria-labelledby="o-que-fazer" className="rounded-card border border-border bg-surface p-5 sm:p-6">
          <p className="fb-eyebrow">O que fazer agora</p>
          <h2 id="o-que-fazer" ref={titulo} tabIndex={-1} className="mt-2 font-serif text-[28px] font-medium leading-tight text-text-primary outline-none">{proxima.titulo}</h2>
          <p className="mt-1.5 max-w-[60ch] text-[15px] text-text-secondary">{proxima.texto}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" className="min-h-12 px-6 text-[15px]" onClick={() => ir(proxima.etapa)}>{proxima.botao} →</Button>
            <span className="text-[13px] text-text-muted">Leva para: {ETAPAS_MEU_DIA.find((e) => e.id === proxima.etapa)!.titulo}</span>
          </div>
          <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div><dt className="text-[12.5px] text-text-muted">Atrasadas</dt><dd className={clsx("font-serif text-[30px] font-medium leading-none tabular-nums", resumo.atrasadas ? "text-critical" : "text-text-primary")}>{resumo.atrasadas}</dd></div>
            <div><dt className="text-[12.5px] text-text-muted">Para hoje</dt><dd className="font-serif text-[30px] font-medium leading-none tabular-nums text-text-primary">{resumo.paraHoje}</dd></div>
            <div><dt className="text-[12.5px] text-text-muted">Rotina registrada</dt><dd className="font-serif text-[30px] font-medium leading-none tabular-nums text-text-primary">{resumo.rotina ? `${resumo.rotina.respondidos}/${resumo.rotina.total}` : "—"}</dd></div>
          </dl>
        </section>
      ) : (
        <section aria-labelledby="titulo-etapa">
          <p className="text-[13px] font-medium text-text-muted">Etapa {indice + 1} de 3</p>
          <h2 id="titulo-etapa" ref={titulo} tabIndex={-1} className="mt-0.5 font-serif text-[30px] font-medium leading-tight text-text-primary outline-none">{ETAPAS_MEU_DIA[indice]!.titulo}</h2>
          {etapa === "finalizar" && <p className="mt-1 text-[15px] text-text-secondary">{nome}, confira as informações antes de enviar seu feedback para a gestão.</p>}
          <div className="mt-4">{conteudo[etapa]}</div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            {indice > 0 ? (
              <Button type="button" variante="secundario" onClick={() => ir(ETAPAS_MEU_DIA[indice - 1]!.id)}>← Voltar</Button>
            ) : (
              <Button type="button" variante="secundario" onClick={() => ir(null)}>← Início</Button>
            )}
            {etapa === "rotina" && <Button type="button" className="min-h-11 px-5" onClick={() => ir("pendencias")}>Continuar para pendências →</Button>}
            {etapa === "pendencias" && <Button type="button" className="min-h-11 px-5" onClick={() => ir("finalizar")}>Revisar meu feedback →</Button>}
          </div>
        </section>
      )}
    </div>
  );
}
