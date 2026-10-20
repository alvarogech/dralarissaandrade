import { hashTexto, jsonCanonico, type ItemEntrada, type ItemValidado, type PacienteRef } from "./contrato";

/**
 * Prévia da entrada: classifica cada item colado ANTES de gravar qualquer coisa.
 * Pura — recebe o estado atual já lido do banco e devolve o que aconteceria.
 *
 * Regras de vínculo (ver docs/CRM_RULES.md §9): só identificador do Simples Dental vincula
 * automaticamente. Nome e telefone nunca vinculam — no máximo viram sugestão para a gestão decidir.
 */
export type Classificacao = "novo" | "atualizacao" | "duplicado" | "possivel_duplicidade" | "vinculo_pendente" | "conflito" | "erro";

export interface PacienteConhecido {
  id: string;
  nome: string;
  sd_codigo?: string;
  sd_numero?: string;
  sd_ficha_id?: string;
  telefone?: string;
}

export interface RegistroExistente {
  chave_origem: string;
  conteudoHash: string;
  /** Já recebeu ação da concierge (contato, evento, conclusão): nunca é sobrescrito pela entrada. */
  trabalhado: boolean;
}

export interface AtendimentoExistente {
  pacienteId: string;
  data: string;
  chave_origem?: string;
}

export interface EstadoAtual {
  pacientes: PacienteConhecido[];
  registros: RegistroExistente[];
  atendimentos: AtendimentoExistente[];
}

export interface ItemPrevia {
  index: number;
  classificacao: Classificacao;
  motivo: string;
  item: ItemEntrada | null;
  pacienteId: string | null;
  /** Só sugestão (telefone igual): a gestão confirma o vínculo manualmente. */
  sugestoes: string[];
  erros: string[];
  avisos: string[];
}

const IDS_SD = ["sd_codigo", "sd_numero", "sd_ficha_id"] as const;

export function normalizarTelefone(t: string | undefined): string {
  let d = (t ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d;
}

/** Hash do conteúdo de um item, sem a hora da consulta (reconsultar o mesmo dado não é mudança). */
export function hashConteudo(item: ItemEntrada): string {
  const { consultado_em: _ignorado, ...resto } = item;
  return hashTexto(jsonCanonico(resto));
}

type ResultadoVinculo =
  | { tipo: "vinculado"; pacienteId: string }
  | { tipo: "nova" }
  | { tipo: "pendente"; motivo: string; sugestoes: string[] };

function resolverPaciente(ref: PacienteRef, pacientes: PacienteConhecido[]): ResultadoVinculo {
  const achados = new Map<string, PacienteConhecido>();
  for (const k of IDS_SD) {
    const v = ref[k];
    if (!v) continue;
    for (const p of pacientes) if (p[k] === v) achados.set(p.id, p);
  }
  if (achados.size > 1) return { tipo: "pendente", motivo: "os identificadores do Simples Dental apontam para pacientes diferentes", sugestoes: [...achados.keys()] };
  if (achados.size === 1) {
    const p = [...achados.values()][0]!;
    const divergente = IDS_SD.find((k) => ref[k] && p[k] && ref[k] !== p[k]);
    if (divergente) return { tipo: "pendente", motivo: `${divergente} diverge do cadastro existente`, sugestoes: [p.id] };
    return { tipo: "vinculado", pacienteId: p.id };
  }
  const tel = normalizarTelefone(ref.telefone);
  const sugestoes = tel.length >= 10 ? pacientes.filter((p) => normalizarTelefone(p.telefone) === tel).map((p) => p.id) : [];
  if (IDS_SD.some((k) => ref[k])) {
    if (sugestoes.length) return { tipo: "pendente", motivo: "identificador novo, mas o telefone já existe em outro cadastro — confirme se é a mesma paciente", sugestoes };
    return { tipo: "nova" };
  }
  return { tipo: "pendente", motivo: "sem identificador do Simples Dental — vínculo manual obrigatório", sugestoes };
}

export function montarPrevia(itens: ItemValidado[], estado: EstadoAtual): ItemPrevia[] {
  const registrosPorChave = new Map(estado.registros.map((r) => [r.chave_origem, r]));
  const vistosChave = new Map<string, number>();
  const vistosConteudo = new Map<string, number>();
  const vistosAtendimento = new Map<string, number>();

  return itens.map((v): ItemPrevia => {
    const base = { index: v.index, item: v.item, erros: v.erros, avisos: v.avisos, sugestoes: [] as string[], pacienteId: null as string | null };
    if (!v.item) return { ...base, classificacao: "erro", motivo: v.erros[0] ?? "item inválido" };
    const it = v.item;
    const conteudo = hashConteudo(it);

    // Duplicado dentro do próprio lote.
    if (it.chave_origem && vistosChave.has(it.chave_origem)) {
      return { ...base, classificacao: "duplicado", motivo: `mesma chave_origem do item ${vistosChave.get(it.chave_origem)! + 1} deste lote` };
    }
    if (vistosConteudo.has(conteudo)) {
      return { ...base, classificacao: "duplicado", motivo: `conteúdo idêntico ao item ${vistosConteudo.get(conteudo)! + 1} deste lote` };
    }
    if (it.chave_origem) vistosChave.set(it.chave_origem, v.index);
    vistosConteudo.set(conteudo, v.index);

    const vinculo = resolverPaciente(it.paciente, estado.pacientes);
    if (vinculo.tipo === "pendente") return { ...base, classificacao: "vinculo_pendente", motivo: vinculo.motivo, sugestoes: vinculo.sugestoes };
    const pacienteId = vinculo.tipo === "vinculado" ? vinculo.pacienteId : null;
    const comPaciente = { ...base, pacienteId };

    // Já recebido em lote anterior.
    const existente = it.chave_origem ? registrosPorChave.get(it.chave_origem) : undefined;
    if (existente) {
      if (existente.conteudoHash === conteudo) return { ...comPaciente, classificacao: "duplicado", motivo: "já recebido antes, sem mudança" };
      if (existente.trabalhado) return { ...comPaciente, classificacao: "conflito", motivo: "o item já foi trabalhado pela concierge — a mudança vai para revisão, nada é sobrescrito" };
      return { ...comPaciente, classificacao: "atualizacao", motivo: "já recebido antes; dados mudaram e o item ainda não foi trabalhado" };
    }

    // Atendimento sem chave: mesma paciente + mesma data = possível duplicidade.
    if (it.tipo === "atendimento_realizado" && !it.chave_origem) {
      const data = String(it.dados.data_atendimento);
      const chavePaciente = pacienteId ?? IDS_SD.map((k) => it.paciente[k] ?? "").join("|");
      const k = `${chavePaciente}@${data}`;
      const noBanco = pacienteId ? estado.atendimentos.some((a) => a.pacienteId === pacienteId && a.data === data) : false;
      if (noBanco || vistosAtendimento.has(k)) {
        return { ...comPaciente, classificacao: "possivel_duplicidade", motivo: "já existe atendimento desta paciente nesta data — confirme se é outro atendimento" };
      }
      vistosAtendimento.set(k, v.index);
    }

    return { ...comPaciente, classificacao: "novo", motivo: pacienteId ? "item novo para paciente existente" : "item novo; a paciente será cadastrada" };
  });
}

export function resumoPrevia(previa: ItemPrevia[]): Record<Classificacao, number> {
  const r: Record<Classificacao, number> = { novo: 0, atualizacao: 0, duplicado: 0, possivel_duplicidade: 0, vinculo_pendente: 0, conflito: 0, erro: 0 };
  for (const p of previa) r[p.classificacao]++;
  return r;
}
