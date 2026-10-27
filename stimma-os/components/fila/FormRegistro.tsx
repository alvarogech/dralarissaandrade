"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { ItemFila } from "@/lib/fila/agrupamento";
import type { SituacaoRegistro } from "@/lib/fila/registro";
import type { Categoria, SimNao } from "@/lib/fila/store";
import { Campo, ErroAcao, ROTULO_TIPO, chamarApi, classeInput, dataBr } from "./comum";
import { useDadosFila } from "./contexto";

/**
 * Formulário único do registro do dia — o mesmo para registrar numa tarefa existente e para um
 * registro espontâneo. Preenche o que já se sabe (paciente, contexto, responsável), mostra só os
 * campos do tipo e da situação escolhidos e nunca marca contato/resposta sozinho: "não preenchido"
 * (nada escolhido), "não" e "não se aplica" são coisas diferentes.
 */
export const TIPOS_REGISTRO = [
  { id: "falta", rotulo: "Falta ou cancelamento", categoria: "agenda" },
  { id: "agenda_amanha", rotulo: "Atenção para a agenda de amanhã", categoria: "agenda" },
  { id: "oportunidade", rotulo: "Oportunidade em paciente da clínica", categoria: "oportunidade" },
  { id: "recorrencia", rotulo: "Recorrência ou reativação", categoria: "recorrencia" },
  { id: "continuidade", rotulo: "Continuidade do tratamento", categoria: "continuidade" },
  { id: "pos_atendimento", rotulo: "Pós-atendimento", categoria: "pos_atendimento" },
  { id: "relacionamento", rotulo: "Aniversário ou relacionamento", categoria: "relacionamento" },
  { id: "pendencia", rotulo: "Pendência ou alerta administrativo", categoria: "pendencia" },
  { id: "encaminhamento", rotulo: "Encaminhamento (Gabi ↔ Comercial Externa)", categoria: "encaminhamento" },
] as const satisfies readonly { id: string; rotulo: string; categoria: Categoria }[];
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number]["id"];

const ROTULO_SITUACAO: Record<SituacaoRegistro, string> = {
  aguardando: "Aguardando paciente (resposta)",
  pendente: "Próxima ação programada",
  aguardando_gestao: "Aguardando gestão — preciso de orientação",
  agendado: "Agendado (acompanhar até o comparecimento)",
  compareceu: "Compareceu",
  faltou: "Faltou",
  encaminhado: "Encaminhado",
  resolvido: "Resolvido",
  dispensado: "Cancelar com justificativa",
  informativo: "Só registro, sem pendência",
};

/**
 * "O que aconteceu com esta paciente?" — atalhos em linguagem simples para os casos comuns. Cada um
 * só preenche os estados que já existem (contato, resposta, situação) e mostra apenas os campos
 * necessários; "Outra situação" abre o formulário completo. Nenhuma enumeração nova vai ao banco.
 */
type Desfecho = "resolvido" | "aguardando_decisao" | "sem_resposta" | "sem_contato" | "agendou" | "orientacao" | "comercial" | "andamento" | "outro";
const DESFECHOS_PACIENTE: { id: Desfecho; rotulo: string; ajuda: string }[] = [
  { id: "sem_resposta", rotulo: "Mandei mensagem, ainda sem resposta", ajuda: "Fica aguardando a paciente, com data para verificar." },
  { id: "sem_contato", rotulo: "Não consegui falar com ela", ajuda: "Programa uma nova tentativa." },
  { id: "aguardando_decisao", rotulo: "Falei com ela, vai me responder", ajuda: "Contato feito; o caso continua acompanhado." },
  { id: "agendou", rotulo: "Agendou consulta ou retorno", ajuda: "Acompanha até o comparecimento." },
  { id: "resolvido", rotulo: "Resolvido", ajuda: "Não há mais nada a fazer neste caso." },
  { id: "orientacao", rotulo: "Preciso de orientação da gestão", ajuda: "A pendência vai para a gestão responder." },
  { id: "comercial", rotulo: "Encaminhar à comercial externa", ajuda: "A próxima ação passa para a comercial externa." },
  { id: "outro", rotulo: "Outra situação", ajuda: "Abre todos os campos." },
];
const DESFECHOS_ASSUNTO: { id: Desfecho; rotulo: string; ajuda: string }[] = [
  { id: "andamento", rotulo: "Ainda em andamento", ajuda: "Registra o que foi feito e o próximo passo." },
  { id: "resolvido", rotulo: "Resolvido", ajuda: "Não há mais nada a fazer neste assunto." },
  { id: "orientacao", rotulo: "Preciso de orientação da gestão", ajuda: "A pendência vai para a gestão responder." },
  { id: "outro", rotulo: "Outra situação", ajuda: "Abre todos os campos." },
];

/** Tipo do formulário sugerido pelo item da fila (paciente e assunto já conhecidos). */
export function tipoDoItem(i: ItemFila | undefined): TipoRegistro {
  if (!i) return "pendencia";
  if (i.tipo === "recuperacao_falta" || i.subtipo === "comparecimento") return "falta";
  if (i.tipo === "marco") return "recorrencia";
  const porCat: Record<string, TipoRegistro> = {
    agenda: "falta", oportunidade: "oportunidade", recorrencia: "recorrencia", continuidade: "continuidade",
    pos_atendimento: "pos_atendimento", relacionamento: "relacionamento", pendencia: "pendencia", encaminhamento: "encaminhamento",
  };
  return porCat[i.categoria ?? ""] ?? "pendencia";
}

function TriEstado({ valor, onChange, rotulo }: { valor: SimNao | null; onChange: (v: SimNao | null) => void; rotulo: string }) {
  const op: [SimNao, string][] = [["sim", "Sim"], ["nao", "Não"], ["na", "Não se aplica"]];
  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      <span>{rotulo} {valor === null && <em className="text-text-muted">(não preenchido)</em>}</span>
      <div className="flex flex-wrap gap-1.5">
        {op.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(valor === v ? null : v)} aria-pressed={valor === v}
            className={clsx("h-9 rounded-full border px-3 text-sm", valor === v ? "border-accent bg-accent text-white" : "border-border bg-surface text-text-secondary")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  /** Itens da fila que este registro atualiza (vazio = registro espontâneo). */
  alvos: ItemFila[];
  tipoInicial?: TipoRegistro;
  /** Há marco previsto para além da janela de trabalho entre os escolhidos. */
  exigeJustificativa?: boolean;
  onSalvo?: () => void;
  onCancelar?: () => void;
}

/** Responsável sugerido pelo destino do encaminhamento (a próxima ação vai para quem recebeu). */
function responsavelDoDestino(para: string, conciergeId?: string | null): string | null {
  if (/comercial/i.test(para)) return "comercial_externa";
  if (/dra/i.test(para)) return "dra_larissa";
  if (/gest/i.test(para)) return "gestao";
  if (/gabi|concierge/i.test(para) && conciergeId) return `perfil:${conciergeId}`;
  return null;
}

export function FormRegistro({ alvos, tipoInicial, exigeJustificativa, onSalvo, onCancelar }: Props) {
  const router = useRouter();
  const { usuarioId, perfis, pacientes, itens, proximoDiaUtil, hoje, conciergeId } = useDadosFila();
  const espontaneo = alvos.length === 0;
  const comparecimento = alvos.length > 0 && alvos.every((a) => a.subtipo === "comparecimento");
  const ehCobranca = alvos.some((a) => a.tipo === "cobranca");
  const prazoAtual = alvos.length ? alvos.map((a) => a.due).sort()[0]! : null;

  const [tipo, setTipo] = useState<TipoRegistro>(tipoInicial ?? tipoDoItem(alvos[0]));
  const categoria = TIPOS_REGISTRO.find((t) => t.id === tipo)!.categoria as Categoria;
  const [pacienteModo, setPacienteModo] = useState<"existente" | "nova" | "assunto">("existente");
  const [busca, setBusca] = useState("");
  const [pacienteId, setPacienteId] = useState("");
  const [novaNome, setNovaNome] = useState("");
  const [novaSd, setNovaSd] = useState("");
  const [assunto, setAssunto] = useState("");
  const [vinculos, setVinculos] = useState<Set<string>>(new Set());

  const [contexto, setContexto] = useState(alvos.map((a) => a.contexto).filter(Boolean).join(" · "));
  const [feito, setFeito] = useState("");
  const [contato, setContato] = useState<SimNao | null>(null);
  const [canal, setCanal] = useState("whatsapp");
  const [resposta, setResposta] = useState<SimNao | null>(null);
  const [resultado, setResultado] = useState("");
  const [situacao, setSituacao] = useState<SituacaoRegistro | "">("");
  const [proxima, setProxima] = useState(alvos.find((a) => a.proximaAcao)?.proximaAcao ?? "");
  const [responsavel, setResponsavel] = useState(`perfil:${usuarioId}`);
  const [prazo, setPrazo] = useState(proximoDiaUtil);
  const [agendadoPara, setAgendadoPara] = useState("");
  const [motivo, setMotivo] = useState("");
  // Ocorrência conhecida vem do caso (cancelamento abre como cancelamento); desconhecida fica em branco.
  const [detalhes, setDetalhes] = useState<Record<string, string>>(() => (alvos[0]?.ocorrencia ? { ocorrencia: alvos[0].ocorrencia } : ({} as Record<string, string>)));
  const [pergunta, setPergunta] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(false);
  const [atencao, setAtencao] = useState(false);
  const [mostrarEtapa, setMostrarEtapa] = useState(Boolean(alvos[0]?.etapa));
  const [etapa, setEtapa] = useState<{ definicao: string; situacao: string; data: string; motivo: string }>({
    definicao: alvos[0]?.etapa?.definicao ?? "", situacao: alvos[0]?.etapa?.situacao ?? "", data: alvos[0]?.etapa?.data ?? "", motivo: alvos[0]?.etapa?.motivo ?? "",
  });
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const [erro, setErro] = useState<{ texto: string; status?: number } | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [completo, setCompleto] = useState(false);
  const uid = useId();
  const idc = (campo: string) => `${uid}-${campo}`;
  const [estado, setEstado] = useState<"ocioso" | "salvando" | "salvo">("ocioso");
  const det = (k: string) => detalhes[k] ?? "";
  const setDet = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDetalhes({ ...detalhes, [k]: e.target.value });

  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t.length < 2 ? [] : pacientes.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 8);
  }, [busca, pacientes]);
  // Casos abertos da paciente escolhida: oferecidos para vincular, nunca unidos automaticamente.
  const casosAbertos = espontaneo && pacienteId ? itens.filter((i) => i.pacienteId === pacienteId && i.status !== "concluida" && i.alvo && i.alvo.tipo !== "atendimento") : [];

  // Assunto administrativo (sem paciente): sem perguntas de contato com paciente.
  const administrativo = espontaneo ? pacienteModo === "assunto" : alvos.every((a) => a.semPaciente);
  const situacoes: SituacaoRegistro[] = comparecimento
    ? ["compareceu", "faltou", "aguardando", "pendente", "aguardando_gestao", "dispensado"]
    : [...(administrativo ? [] : (["aguardando"] as const)), "pendente", "aguardando_gestao", ...(administrativo ? [] : (["agendado"] as const)), ...(categoria === "encaminhamento" ? (["encaminhado"] as const) : []), "resolvido", "dispensado", ...(espontaneo && !vinculos.size ? (["informativo"] as const) : [])];
  const pendente = situacao === "aguardando" || situacao === "pendente" || situacao === "encaminhado" || situacao === "faltou";
  const paraGestao = situacao === "aguardando_gestao";
  // Empurrar o prazo sem contato nem resposta é adiamento: pede motivo (o prazo original fica no histórico).
  const adiando = pendente && !!prazoAtual && prazo > prazoAtual && contato !== "sim" && resposta !== "sim" && situacao !== "encaminhado";
  const sugereEtapa = ["continuidade", "pos_atendimento", "oportunidade", "agenda"].includes(categoria);
  const nomeAlvo = alvos[0]?.pacienteNome;
  const atalhos = !espontaneo && !comparecimento;
  const desfechos = administrativo ? DESFECHOS_ASSUNTO : DESFECHOS_PACIENTE;
  const formCompleto = !atalhos || completo || desfecho === "outro";
  const PADROES = ["Verificar se respondeu", "Tentar contato de novo", "Verificar a resposta", "Contato da comercial externa"];

  function escolherDesfecho(d: Desfecho) {
    setDesfecho(d);
    setErrosCampo({});
    setErro(null);
    const sugerir = (v: string) => setProxima((p) => (p && !PADROES.includes(p) ? p : v));
    switch (d) {
      case "resolvido": setContato(administrativo ? "na" : "sim"); setResposta(administrativo ? "na" : "sim"); setSituacao("resolvido"); break;
      case "aguardando_decisao": setContato("sim"); setResposta("sim"); setSituacao("aguardando"); sugerir("Verificar a resposta"); break;
      case "sem_resposta": setContato("sim"); setResposta("nao"); setSituacao("aguardando"); sugerir("Verificar se respondeu"); break;
      case "sem_contato": setContato("nao"); setResposta("na"); setSituacao("pendente"); sugerir("Tentar contato de novo"); break;
      case "agendou": setContato("sim"); setResposta("sim"); setSituacao("agendado"); break;
      case "orientacao": setSituacao("aguardando_gestao"); break;
      case "comercial":
        setTipo("encaminhamento"); setDetalhes((x) => ({ ...x, para: "Comercial Externa" })); setResponsavel("comercial_externa"); setSituacao("encaminhado"); sugerir("Contato da comercial externa");
        break;
      case "andamento": setSituacao("pendente"); break;
      case "outro": setCompleto(true); break;
    }
  }

  /** Mesmas regras do servidor, ditas junto do campo (o servidor continua sendo a palavra final). */
  function validar(): [string, string][] {
    const e: [string, string][] = [];
    if (espontaneo && !vinculos.size) {
      if (pacienteModo === "existente" && !pacienteId) e.push(["paciente", "Escolha a paciente na busca (ou use “Não cadastrada”)."]);
      if (pacienteModo === "nova" && !novaNome.trim()) e.push(["novaNome", "Escreva o nome da paciente."]);
      if (pacienteModo === "assunto" && !assunto.trim()) e.push(["assunto", "Descreva o assunto em poucas palavras."]);
    }
    if (!situacao) e.push([atalhos && !formCompleto ? "desfecho" : "situacao", atalhos && !formCompleto ? "Escolha o que aconteceu." : "Escolha a situação atual do caso."]);
    const precisaResultado = (resposta === "sim" && desfecho !== "agendou") || (situacao === "resolvido" && resposta !== "sim");
    if (precisaResultado && !resultado.trim()) e.push(["resultado", situacao === "resolvido" ? "Conte em poucas palavras o que ficou resolvido." : "Conte em poucas palavras o que a paciente respondeu."]);
    if (situacao === "resolvido" && contato === "sim" && resposta === "nao") e.push(["situacao", "Mensagem sem resposta não resolve o caso: use “Aguardando paciente” com data para verificar."]);
    if (pendente) {
      if (!proxima.trim()) e.push(["proxima", "Escreva qual é o próximo passo (ex.: verificar se respondeu)."]);
      if (!prazo || prazo < hoje) e.push(["prazo", "Escolha a data do próximo passo (hoje ou depois)."]);
    }
    if (paraGestao) {
      if (!pergunta.trim()) e.push(["pergunta", "Escreva a dúvida ou o impedimento para a gestão."]);
      if (!prazo || prazo < hoje) e.push(["prazo", "Escolha até quando precisa da resposta (hoje ou depois)."]);
    }
    if (situacao === "agendado" && !agendadoPara) e.push(["agendadoPara", "Informe a data da consulta agendada."]);
    if (situacao === "dispensado" && !motivo.trim()) e.push(["motivo", "Explique por que o caso vai ser encerrado sem resolver."]);
    if (adiando && desfecho !== "sem_contato" && !motivo.trim()) e.push(["motivo", "Explique por que o prazo vai mudar sem contato."]);
    if (exigeJustificativa && !justificativa.trim()) e.push(["justificativa", "Explique por que este marco futuro entra agora."]);
    if (espontaneo && !vinculos.size && situacao === "informativo" && !feito.trim() && !resultado.trim() && !contexto.trim()) e.push(["feito", "Descreva o que aconteceu."]);
    return e;
  }
  const erroDe = (campo: string) => (errosCampo[campo] ? <span id={`${idc(campo)}-erro`} className="font-normal text-critical">{errosCampo[campo]}</span> : null);
  const invalido = (campo: string) => (errosCampo[campo] ? { "aria-invalid": true as const, "aria-describedby": `${idc(campo)}-erro`, className: clsx(classeInput, "border-critical") } : { className: classeInput });

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    const erros = validar();
    setErrosCampo(Object.fromEntries([...erros].reverse()));
    if (erros.length) {
      // Leva o foco ao primeiro campo com problema (com a explicação logo abaixo dele).
      const el = document.getElementById(idc(erros[0]![0]));
      if (el) { el.focus(); el.scrollIntoView?.({ block: "center" }); }
      return;
    }
    // Atalhos: o que a escolha já diz não precisa ser digitado de novo.
    const resultadoEnvio = resultado.trim() || (desfecho === "agendou" && agendadoPara ? `Agendou para ${dataBr(agendadoPara)}` : resultado);
    const motivoEnvio = motivo.trim() || (desfecho === "sem_contato" && adiando ? "Tentei contato e não consegui falar com a paciente" : motivo);
    setEstado("salvando");
    const alvosEnvio = espontaneo
      ? itens.filter((i) => vinculos.has(i.id) && i.alvo && i.alvo.tipo !== "atendimento").map((i) => ({ tipo: i.alvo!.tipo as "marco" | "tarefa", id: i.alvo!.id }))
      : alvos.map((a) => ({ tipo: a.alvo!.tipo as "marco" | "tarefa", id: a.alvo!.id }));
    const detalhesEnvio = Object.fromEntries(Object.entries(detalhes).filter(([, v]) => v.trim()));
    if (ehCobranca && situacao === "resolvido" && pagamentoConfirmado) detalhesEnvio.pagamento_confirmado = "sim";
    const r = await chamarApi<{ duplicado: boolean }>("/api/fila/registro", "POST", {
      eventoId, alvos: alvosEnvio, categoria,
      pacienteId: espontaneo && !alvosEnvio.length && pacienteModo === "existente" ? pacienteId || null : undefined,
      novoPaciente: espontaneo && !alvosEnvio.length && pacienteModo === "nova" ? { nome: novaNome, sd_codigo: novaSd || undefined } : undefined,
      assunto: espontaneo && !alvosEnvio.length && pacienteModo === "assunto" ? assunto : undefined,
      contexto, feito, contato: administrativo ? "na" : contato, canal: contato === "sim" ? canal : undefined, resposta: administrativo ? "na" : resposta, resultado: resultadoEnvio,
      situacao,
      proximaAcao: pendente ? proxima : paraGestao ? proxima || undefined : undefined, responsavel: pendente ? responsavel : undefined,
      prazo: pendente || paraGestao ? prazo : undefined, pergunta: paraGestao ? pergunta : undefined,
      agendadoPara: situacao === "agendado" ? agendadoPara : undefined, motivo: situacao === "dispensado" || adiando ? motivoEnvio : undefined,
      justificativaFuturos: exigeJustificativa ? justificativa : undefined,
      detalhes: detalhesEnvio, atencao, etapa: mostrarEtapa ? etapa : undefined,
    });
    if (!r.ok) {
      setEstado("ocioso");
      // Nada é apagado do preenchimento. Resultado incerto: reenviar usa o mesmo id e não duplica.
      return setErro({ texto: r.incerto ? `${r.erro} Pode tocar em salvar de novo: este registro não será duplicado.` : `Não conseguimos salvar: ${r.erro}`, status: r.status });
    }
    setEstado("salvo");
    setEventoId(crypto.randomUUID());
    router.refresh();
    onSalvo?.();
  }

  const opcoesResp = [...perfis.map((p) => ({ v: `perfil:${p.id}`, l: p.nome })), { v: "comercial_externa", l: "Comercial Externa" }, { v: "dra_larissa", l: "Dra. Larissa" }, { v: "gestao", l: "Gestão" }];

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-3">
      {atalhos && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[15px] font-semibold text-text-primary">{administrativo ? "O que aconteceu com este assunto?" : "O que aconteceu com esta paciente?"}</legend>
          <p className="text-[13px] text-text-secondary">Registre o resultado do contato e o próximo passo, se ainda houver pendência.</p>
          <div id={idc("desfecho")} tabIndex={-1} role="radiogroup" aria-label="O que aconteceu" className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {desfechos.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={desfecho === d.id} onClick={() => escolherDesfecho(d.id)}
                className={clsx("flex min-h-11 flex-col items-start rounded-control border px-3 py-2 text-left transition-colors",
                  desfecho === d.id ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-surface-hover")}>
                <span className={clsx("text-[14px]", desfecho === d.id ? "font-semibold text-accent" : "font-medium text-text-primary")}>{desfecho === d.id && <span aria-hidden>✓ </span>}{d.rotulo}</span>
                <span className="text-[12px] text-text-muted">{d.ajuda}</span>
              </button>
            ))}
          </div>
          {erroDe("desfecho")}
        </fieldset>
      )}

      {!formCompleto && desfecho && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface-raised p-3">
          {(desfecho === "sem_resposta" || desfecho === "sem_contato" || desfecho === "andamento") && (
            <Campo label={desfecho === "sem_contato" ? "Como tentou? (opcional)" : desfecho === "andamento" ? "O que foi feito hoje (opcional)" : "O que você enviou? (opcional)"}>
              <input id={idc("feito")} value={feito} onChange={(e) => setFeito(e.target.value)} className={classeInput}
                placeholder={desfecho === "sem_contato" ? "ex.: liguei duas vezes, não atendeu" : "ex.: mensagem oferecendo horário de sábado"} />
            </Campo>
          )}
          {(desfecho === "aguardando_decisao" || desfecho === "resolvido") && (
            <Campo label={desfecho === "resolvido" ? "O que ficou resolvido? *" : "O que ela respondeu? *"}>
              <input id={idc("resultado")} value={resultado} onChange={(e) => setResultado(e.target.value)} {...invalido("resultado")}
                placeholder={desfecho === "resolvido" ? "ex.: confirmou o retorno e pagou a parcela" : "ex.: vai ver a agenda e responde até quinta"} />
              {erroDe("resultado")}
            </Campo>
          )}
          {desfecho === "agendou" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Data da consulta *">
                <input id={idc("agendadoPara")} type="date" value={agendadoPara} onChange={(e) => setAgendadoPara(e.target.value)} {...invalido("agendadoPara")} />
                {erroDe("agendadoPara")}
              </Campo>
              <Campo label="Observação (opcional)"><input value={resultado} onChange={(e) => setResultado(e.target.value)} className={classeInput} placeholder="ex.: retorno com a Dra. às 15h" /></Campo>
            </div>
          )}
          {desfecho === "comercial" && (
            <Campo label="Motivo do encaminhamento (opcional)"><input value={det("motivo_encaminhamento")} onChange={setDet("motivo_encaminhamento")} className={classeInput} placeholder="ex.: quer avaliação de lentes" /></Campo>
          )}
          {desfecho === "orientacao" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Qual é a dúvida ou o impedimento? *" largo>
                <input id={idc("pergunta")} value={pergunta} onChange={(e) => setPergunta(e.target.value)} {...invalido("pergunta")} placeholder="ex.: posso oferecer parcelamento em 6x?" />
                {erroDe("pergunta")}
              </Campo>
              <Campo label="Preciso da resposta até *">
                <input id={idc("prazo")} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...invalido("prazo")} />
                {erroDe("prazo")}
              </Campo>
            </div>
          )}
          {pendente && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Próximo passo *">
                <input id={idc("proxima")} value={proxima} onChange={(e) => setProxima(e.target.value)} {...invalido("proxima")} />
                {erroDe("proxima")}
              </Campo>
              <Campo label="Quando *">
                <input id={idc("prazo")} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...invalido("prazo")} />
                {erroDe("prazo")}
              </Campo>
              <Campo label="Quem faz">
                <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={classeInput}>{opcoesResp.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
              </Campo>
            </div>
          )}
          {adiando && desfecho !== "sem_contato" && (
            <Campo label={`Por que o prazo muda (era ${dataBr(prazoAtual!)})? *`}>
              <input id={idc("motivo")} value={motivo} onChange={(e) => setMotivo(e.target.value)} {...invalido("motivo")} />
              {erroDe("motivo")}
            </Campo>
          )}
          {exigeJustificativa && (
            <Campo label="Por que este marco futuro entra agora? *">
              <input id={idc("justificativa")} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} {...invalido("justificativa")} />
              {erroDe("justificativa")}
            </Campo>
          )}
          {(situacao === "aguardando" || situacao === "pendente") && <p className="text-[12.5px] text-text-muted">A pendência continua na sua lista e volta na data escolhida.</p>}
          {erroDe("situacao")}
          <button type="button" className="self-start text-[13px] text-text-secondary underline underline-offset-4" onClick={() => setCompleto(true)}>Mostrar todos os campos</button>
        </div>
      )}

      {formCompleto && (<>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Tipo de acompanhamento">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRegistro)} className={classeInput} disabled={comparecimento}>
            {TIPOS_REGISTRO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </select>
        </Campo>
        {!espontaneo ? (
          <Campo label="Paciente ou assunto"><div className={clsx(classeInput, "bg-surface-raised")}>{nomeAlvo}{alvos.length > 1 ? ` · ${alvos.length} itens` : ""}</div></Campo>
        ) : (
          <div className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Paciente ou assunto</span>
            <div className="flex flex-wrap gap-1.5">
              {([["existente", "Paciente cadastrada"], ["nova", "Não cadastrada"], ...(categoria === "pendencia" || categoria === "agenda" ? [["assunto", "Assunto sem paciente"]] : [])] as [typeof pacienteModo, string][]).map(([m, l]) => (
                <button key={m} type="button" onClick={() => { setPacienteModo(m); setVinculos(new Set()); }} className="fb-chip" data-ativo={pacienteModo === m}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {espontaneo && pacienteModo === "existente" && (
        <div className="flex flex-col gap-2">
          {pacienteId ? (
            <p className="text-sm text-text-primary">
              {pacientes.find((p) => p.id === pacienteId)?.nome}{" "}
              <button type="button" className="text-xs text-text-muted underline" onClick={() => { setPacienteId(""); setVinculos(new Set()); }}>trocar</button>
            </p>
          ) : (
            <Campo label="Buscar paciente (mín. 2 letras)">
              <input id={idc("paciente")} value={busca} onChange={(e) => setBusca(e.target.value)} {...invalido("paciente")} placeholder="Nome da paciente" />
              {erroDe("paciente")}
              {candidatos.length > 0 && (
                <ul className="mt-1 rounded-[10px] border border-border bg-surface">
                  {candidatos.map((p) => (
                    <li key={p.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-surface-raised" onClick={() => { setPacienteId(p.id); setBusca(""); }}>{p.nome}</button></li>
                  ))}
                </ul>
              )}
              {busca.trim().length >= 2 && !candidatos.length && <span className="text-text-muted">Nenhuma encontrada — use “Não cadastrada”.</span>}
            </Campo>
          )}
          {casosAbertos.length > 0 && (
            <fieldset className="rounded-[10px] border border-border p-3">
              <legend className="px-1 text-xs text-text-muted">Casos abertos desta paciente — marque se este registro faz parte de algum (não é automático)</legend>
              {casosAbertos.map((c) => (
                <label key={c.id} className="flex items-start gap-2 py-0.5 text-sm">
                  <input type="checkbox" className="mt-1" checked={vinculos.has(c.id)} onChange={() => { const s = new Set(vinculos); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setVinculos(s); }} />
                  <span>{ROTULO_TIPO[c.tipo] ?? c.tipo}: {c.titulo} <span className="text-text-muted">· prazo {dataBr(c.due)}</span></span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {espontaneo && pacienteModo === "nova" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome da paciente"><input id={idc("novaNome")} value={novaNome} onChange={(e) => setNovaNome(e.target.value)} {...invalido("novaNome")} />{erroDe("novaNome")}</Campo>
          <Campo label="Código no Simples Dental (se souber)"><input value={novaSd} onChange={(e) => setNovaSd(e.target.value)} className={classeInput} /></Campo>
        </div>
      )}
      {espontaneo && pacienteModo === "assunto" && (
        <Campo label="Assunto"><input id={idc("assunto")} value={assunto} onChange={(e) => setAssunto(e.target.value)} {...invalido("assunto")} placeholder="ex.: impressora da recepção, confirmação de fornecedor" />{erroDe("assunto")}</Campo>
      )}

      <Campo label="Contexto"><input value={contexto} onChange={(e) => setContexto(e.target.value)} className={classeInput} /></Campo>

      {/* Campos específicos do tipo */}
      {tipo === "falta" && !comparecimento && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Ocorrência"><select value={det("ocorrencia")} onChange={setDet("ocorrencia")} className={classeInput}><option value="">Não informada</option><option value="falta">Falta</option><option value="cancelamento">Cancelamento</option></select></Campo>
          <Campo label="Horário"><input type="time" value={det("horario")} onChange={setDet("horario")} className={classeInput} /></Campo>
          <Campo label="Motivo (se conhecido)"><input value={det("motivo_falta")} onChange={setDet("motivo_falta")} className={classeInput} /></Campo>
        </div>
      )}
      {tipo === "agenda_amanha" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Ponto de atenção"><select value={det("ponto_amanha")} onChange={setDet("ponto_amanha")} className={classeInput}><option value="">Escolha…</option><option>Confirmação pendente</option><option>Preparação necessária</option><option>Encaixe ou mudança de horário</option><option>Outro</option></select></Campo>
          <Campo label="Descrição"><input value={det("descricao")} onChange={setDet("descricao")} className={classeInput} /></Campo>
        </div>
      )}
      {tipo === "oportunidade" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Necessidade ou interesse"><input value={det("interesse")} onChange={setDet("interesse")} className={classeInput} /></Campo>
          <Campo label="Tratamento/especialidade (se pertinente)"><input value={det("especialidade")} onChange={setDet("especialidade")} className={classeInput} /></Campo>
          <Campo label="Resposta ou objeção"><input value={det("objecao")} onChange={setDet("objecao")} className={classeInput} /></Campo>
        </div>
      )}
      {tipo === "recorrencia" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Motivo do contato"><input value={det("motivo_contato")} onChange={setDet("motivo_contato")} className={classeInput} /></Campo>
          <Campo label="Último atendimento ou contexto (aproximado)"><input value={det("ultimo_atendimento")} onChange={setDet("ultimo_atendimento")} className={classeInput} placeholder="ex.: por volta de março/2025" /></Campo>
        </div>
      )}
      {tipo === "pos_atendimento" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Procedimento ou contexto"><input value={det("procedimento")} onChange={setDet("procedimento")} className={classeInput} /></Campo>
          <Campo label="Necessidade identificada"><input value={det("necessidade")} onChange={setDet("necessidade")} className={classeInput} /></Campo>
          <label className="flex items-center gap-2 text-sm text-text-secondary sm:col-span-2">
            <input type="checkbox" checked={atencao} onChange={(e) => setAtencao(e.target.checked)} /> Reclamação ou pedido de avaliação (vira ponto de atenção — sem interpretação clínica)
          </label>
        </div>
      )}
      {tipo === "relacionamento" && <Campo label="Observação (opcional)"><input value={det("observacao")} onChange={setDet("observacao")} className={classeInput} /></Campo>}
      {tipo === "pendencia" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Tipo"><select value={det("tipo_pendencia")} onChange={setDet("tipo_pendencia")} className={classeInput}><option value="">Escolha…</option><option>Administrativa</option><option>Documento ou cadastro</option><option>Agenda</option><option>Equipamento ou estrutura</option><option>Outro</option></select></Campo>
          <Campo label="Descrição objetiva"><input value={det("descricao")} onChange={setDet("descricao")} className={classeInput} /></Campo>
        </div>
      )}
      {tipo === "encaminhamento" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Encaminhado para">
            <select value={det("para")} onChange={(e) => { setDetalhes({ ...detalhes, para: e.target.value }); const r = responsavelDoDestino(e.target.value, conciergeId); if (r) setResponsavel(r); }} className={classeInput}>
              <option value="">Escolha…</option><option>Comercial Externa</option><option>Gabi</option><option>Gestão</option><option>Dra. Larissa</option>
            </select>
          </Campo>
          <Campo label="Motivo"><input value={det("motivo_encaminhamento")} onChange={setDet("motivo_encaminhamento")} className={classeInput} /></Campo>
        </div>
      )}

      <Campo label="O que foi feito hoje"><input id={idc("feito")} value={feito} onChange={(e) => setFeito(e.target.value)} {...invalido("feito")} placeholder="ex.: mensagem enviada oferecendo horário de sábado" />{erroDe("feito")}</Campo>

      {!administrativo && <div className="grid gap-3 sm:grid-cols-2">
        <TriEstado rotulo="Contato realizado?" valor={contato} onChange={setContato} />
        <TriEstado rotulo="Houve resposta?" valor={resposta} onChange={setResposta} />
        {contato === "sim" && (
          <Campo label="Canal"><select value={canal} onChange={(e) => setCanal(e.target.value)} className={classeInput}><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="presencial">Presencial</option><option value="outro">Outro</option></select></Campo>
        )}
        {resposta === "sim" && <Campo label="Resultado ou resposta (curto) *"><input id={idc("resultado")} value={resultado} onChange={(e) => setResultado(e.target.value)} {...invalido("resultado")} />{erroDe("resultado")}</Campo>}
      </div>}

      <Campo label="Situação atual do caso *">
        <select id={idc("situacao")} value={situacao} onChange={(e) => { const v = e.target.value as SituacaoRegistro; setSituacao(v); if (v === "aguardando" && !proxima) setProxima("Verificar se respondeu"); }} {...invalido("situacao")}>
          <option value="">Escolha…</option>
          {situacoes.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
        </select>
        {erroDe("situacao")}
      </Campo>
      {contato === "sim" && resposta === "nao" && situacao !== "aguardando" && situacao !== "" && situacao !== "pendente" && (
        <p className="text-xs text-important">Mensagem sem retorno fica “Aguardando paciente”, com data de revisão — não resolve o caso.</p>
      )}
      {situacao === "resolvido" && resposta !== "sim" && (
        <Campo label="Resultado alcançado *"><input id={idc("resultado")} value={resultado} onChange={(e) => setResultado(e.target.value)} {...invalido("resultado")} placeholder="o que ficou resolvido" />{erroDe("resultado")}</Campo>
      )}
      {situacao === "resolvido" && ehCobranca && (
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={pagamentoConfirmado} onChange={(e) => setPagamentoConfirmado(e.target.checked)} /> Pagamento confirmado no Simples Dental (enviar a cobrança não basta)
        </label>
      )}
      {paraGestao && (
        <div className="grid gap-3 rounded-[10px] border border-border p-3 sm:grid-cols-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted sm:col-span-3">Para a gestão — a próxima ação passa a ser dela</p>
          <Campo label="Dúvida ou impedimento *" largo><input id={idc("pergunta")} value={pergunta} onChange={(e) => setPergunta(e.target.value)} {...invalido("pergunta")} />{erroDe("pergunta")}</Campo>
          <Campo label="Preciso da resposta até *"><input id={idc("prazo")} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...invalido("prazo")} />{erroDe("prazo")}</Campo>
        </div>
      )}

      {pendente && (
        <div className="grid gap-3 rounded-[10px] border border-border p-3 sm:grid-cols-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted sm:col-span-3">Próxima ação {situacao === "faltou" ? "(recuperar a falta)" : ""}</p>
          <Campo label="Ação concreta *"><input id={idc("proxima")} value={proxima} onChange={(e) => setProxima(e.target.value)} {...invalido("proxima")} />{erroDe("proxima")}</Campo>
          <Campo label="Responsável *"><select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={classeInput}>{opcoesResp.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Campo>
          <Campo label="Prazo *"><input id={idc("prazo")} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} {...invalido("prazo")} />{erroDe("prazo")}</Campo>
        </div>
      )}
      {situacao === "agendado" && <Campo label="Data da consulta *"><input id={idc("agendadoPara")} type="date" value={agendadoPara} onChange={(e) => setAgendadoPara(e.target.value)} {...invalido("agendadoPara")} />{erroDe("agendadoPara")}</Campo>}
      {situacao === "dispensado" && <Campo label="Justificativa do cancelamento *"><input id={idc("motivo")} value={motivo} onChange={(e) => setMotivo(e.target.value)} {...invalido("motivo")} />{erroDe("motivo")}</Campo>}
      {adiando && <Campo label={`Motivo do adiamento (prazo atual ${dataBr(prazoAtual!)}) *`}><input id={idc("motivo")} value={motivo} onChange={(e) => setMotivo(e.target.value)} {...invalido("motivo")} />{erroDe("motivo")}</Campo>}
      {exigeJustificativa && (
        <Campo label="Justificativa para incluir marco ainda futuro *"><input id={idc("justificativa")} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} {...invalido("justificativa")} placeholder="ex.: paciente pediu para já tratar da próxima etapa" />{erroDe("justificativa")}</Campo>
      )}

      {sugereEtapa && (
        <div className="rounded-[10px] border border-border p-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={mostrarEtapa} onChange={(e) => setMostrarEtapa(e.target.checked)} /> Registrar a próxima etapa do cuidado (definida pela Dra. Larissa)
          </label>
          {mostrarEtapa && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Campo label="Definição informada pela Dra."><input value={etapa.definicao} onChange={(e) => setEtapa({ ...etapa, definicao: e.target.value })} className={classeInput} /></Campo>
              <Campo label="Situação da etapa">
                <select value={etapa.situacao} onChange={(e) => setEtapa({ ...etapa, situacao: e.target.value })} className={classeInput}>
                  <option value="">—</option><option value="a_definir">A definir</option><option value="prevista">Prevista</option><option value="agendada">Agendada</option>
                  <option value="realizada">Realizada</option><option value="adiada">Adiada</option><option value="encerrada">Encerrada</option>
                </select>
              </Campo>
              <Campo label="Data pertinente"><input type="date" value={etapa.data} onChange={(e) => setEtapa({ ...etapa, data: e.target.value })} className={classeInput} /></Campo>
              {(etapa.situacao === "adiada" || etapa.situacao === "encerrada") && <Campo label="Motivo *" largo><input value={etapa.motivo} onChange={(e) => setEtapa({ ...etapa, motivo: e.target.value })} className={classeInput} /></Campo>}
              <p className="text-xs text-text-muted sm:col-span-3">A etapa do cuidado não vira atraso administrativo; o que entra na fila é a próxima ação da Gabi.</p>
            </div>
          )}
        </div>
      )}

      </>)}

      {erro && <ErroAcao erro={erro.texto} status={erro.status} />}
      {Object.keys(errosCampo).length > 0 && <p role="alert" className="text-[13px] text-critical">Falta completar {Object.keys(errosCampo).length === 1 ? "um campo" : `${Object.keys(errosCampo).length} campos`}: veja a indicação em vermelho acima.</p>}
      <div className="flex flex-wrap items-center gap-3">
        {(!atalhos || desfecho) && <Button type="submit" loading={estado === "salvando"} loadingText="Salvando…">{espontaneo ? "Salvar registro" : "Salvar andamento"}</Button>}
        {onCancelar && <button type="button" onClick={onCancelar} className="text-sm text-text-muted underline">Cancelar</button>}
        {estado === "salvo" && <span className="text-sm text-opportunity">Salvo.</span>}
        <span className="text-xs text-text-muted">Nenhuma mensagem é enviada.</span>
      </div>
    </form>
  );
}
