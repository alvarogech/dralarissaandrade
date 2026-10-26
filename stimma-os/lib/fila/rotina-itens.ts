import type { RotinaItemRow } from "./store";

/**
 * Catálogo e resumo da rotina diária da concierge (puro, sem acesso a dados — usado também na
 * interface). Regras de gravação e permissão ficam em rotina.ts.
 */
export const GRUPOS_ROTINA = [
  { id: "inicio", titulo: "Início do dia" },
  { id: "durante", titulo: "Durante o dia" },
  { id: "fechamento", titulo: "Fechamento" },
] as const;
export type GrupoRotina = (typeof GRUPOS_ROTINA)[number]["id"];

export interface ItemRotina {
  key: string;
  grupo: GrupoRotina;
  texto: string;
  /** Orientação curta (o que conferir), sem dados de paciente. */
  dica?: string;
}

export const ITENS_ROTINA: readonly ItemRotina[] = [
  { key: "agenda_hoje_amanha", grupo: "inicio", texto: "Conferir a agenda de hoje e de amanhã", dica: "No Simples Dental; o STIMMA OS só mostra a agenda sincronizada." },
  { key: "novos_atendimentos", grupo: "inicio", texto: "Conferir novos atendimentos, retornos e procedimentos do dia" },
  { key: "cadastro_documentos", grupo: "inicio", texto: "Verificar pendências de cadastro e documentos", dica: "Registre só a conferência ou a pendência; documentos ficam no Simples Dental." },
  { key: "recebimentos_lancamentos", grupo: "inicio", texto: "Conferir recebimentos e lançamentos a registrar no Simples Dental", dica: "Sem valores nem dados bancários aqui." },
  { key: "condicoes_pagamento", grupo: "inicio", texto: "Consultar condições de pagamento autorizadas pela gestão", dica: "Só use condições explicitamente autorizadas." },
  { key: "preparacao_equipe", grupo: "inicio", texto: "Confirmar a preparação da equipe e dos ambientes" },
  { key: "followups_dia", grupo: "inicio", texto: "Identificar follow-ups, retornos e próximas etapas do dia", dica: "Estão em “Meu trabalho” (hoje e atrasadas)." },

  { key: "acompanhar_agenda", grupo: "durante", texto: "Acompanhar pacientes, atrasos, encaixes, cancelamentos e remarcações" },
  { key: "pagamentos_registrados", grupo: "durante", texto: "Registrar pagamentos conferidos ou lançados no Simples Dental" },
  { key: "retornos_agendados", grupo: "durante", texto: "Registrar agendamentos de retorno e próximas etapas", dica: "Na tarefa da paciente: “Registrar andamento” → Agendado." },
  { key: "pos_procedimento", grupo: "durante", texto: "Acompanhar o pós-procedimento e a continuidade dos planos" },
  { key: "encaminhar_comercial", grupo: "durante", texto: "Encaminhar à comercial externa as primeiras avaliações a recuperar" },
  { key: "informar_gestao", grupo: "durante", texto: "Informar à gestão dúvidas, impedimentos e ocorrências", dica: "Na tarefa: “Pedir orientação”." },

  { key: "destino_atendimentos", grupo: "fechamento", texto: "Cada atendimento do dia teve um destino definido" },
  { key: "pagamentos_verificados", grupo: "fechamento", texto: "Pagamentos e lançamentos verificados" },
  { key: "registros_crm", grupo: "fechamento", texto: "Registros administrativos e CRM atualizados" },
  { key: "faltas_registradas", grupo: "fechamento", texto: "Faltas e cancelamentos registrados" },
  { key: "encaminhamentos_feitos", grupo: "fechamento", texto: "Encaminhamentos à comercial externa feitos" },
  { key: "agenda_amanha", grupo: "fechamento", texto: "Agenda do dia seguinte preparada" },
  { key: "pendencias_continuam", grupo: "fechamento", texto: "Pendências que continuam abertas conferidas", dica: "Seguem automaticamente para o próximo dia em “Meu trabalho”." },
];

export const ESTADOS_ROTINA = ["a_fazer", "feito", "nao_se_aplica", "impedimento"] as const;
export type EstadoRotina = (typeof ESTADOS_ROTINA)[number];
export const ROTULO_ESTADO_ROTINA: Record<EstadoRotina, string> = { a_fazer: "A fazer", feito: "Feito", nao_se_aplica: "Não se aplica", impedimento: "Com impedimento" };

export const textoDoItem = (key: string) => ITENS_ROTINA.find((i) => i.key === key)?.texto ?? key;

/** Resumo da rotina para o feedback (só quando algo foi registrado no dia). */
export interface ResumoRotina {
  registrada: boolean;
  feitos: string[];
  naoSeAplica: string[];
  pendentes: string[];
  impedimentos: { item: string; motivo: string; proxima: string; responsavel: string | null; prazo: string | null }[];
  /** Assinatura dos estados: detecta mudança depois de gerar o feedback. */
  assinatura: string;
}

export function resumirRotina(linhas: RotinaItemRow[], rotuloResponsavel: (r: string | null) => string | null = (r) => r): ResumoRotina {
  const por = new Map(linhas.map((l) => [l.itemKey, l]));
  const estado = (k: string): EstadoRotina => por.get(k)?.estado ?? "a_fazer";
  const sel = (e: EstadoRotina) => ITENS_ROTINA.filter((i) => estado(i.key) === e).map((i) => i.texto);
  return {
    registrada: linhas.some((l) => l.estado !== "a_fazer"),
    feitos: sel("feito"),
    naoSeAplica: sel("nao_se_aplica"),
    pendentes: sel("a_fazer"),
    impedimentos: ITENS_ROTINA.filter((i) => estado(i.key) === "impedimento").map((i) => {
      const l = por.get(i.key)!;
      return { item: i.texto, motivo: l.motivo ?? "", proxima: l.proximaAcao ?? "", responsavel: rotuloResponsavel(l.responsavel), prazo: l.prazo };
    }),
    assinatura: ITENS_ROTINA.map((i) => {
      const l = por.get(i.key);
      return `${i.key}:${estado(i.key)}${l?.estado === "impedimento" ? `:${l.motivo}|${l.proximaAcao}|${l.prazo ?? ""}|${l.responsavel ?? ""}` : ""}`;
    }).join(";"),
  };
}
