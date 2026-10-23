import { isDiaIso } from "./datas";

/**
 * Contrato `stimma-entrada-v1`: o formato que a gestão cola em /entrada (gerado, por exemplo,
 * pela extensão do Chrome a partir do Simples Dental). Ver docs/PLANO_FILA_CONCIERGE.md §6.
 *
 * Princípios: origem e data da consulta obrigatórias; o que está em `a_conferir` não vira fato
 * sem confirmação; `nota_ia` é só contexto (nunca fato clínico, dívida confirmada ou ação feita).
 */
export const CONTRATO = "stimma-entrada-v1";
export const TIPOS_ENTRADA = ["atendimento_realizado", "cobranca", "recuperacao_falta", "continuidade", "relacionamento", "encaminhamento", "outro"] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];
export const MAX_ITENS = 500;

export interface PacienteRef {
  nome?: string;
  sd_codigo?: string;
  sd_numero?: string;
  sd_ficha_id?: string;
  telefone?: string;
}

export interface ItemEntrada {
  tipo: TipoEntrada;
  chave_origem?: string;
  paciente: PacienteRef;
  origem: string;
  consultado_em: string;
  a_conferir: string[];
  nota_ia?: string;
  dados: Record<string, unknown>;
}

export interface CabecalhoLote {
  origem: string;
  consultado_em: string;
  consultado_por?: string;
  ferramenta?: string;
  periodo?: { de: string; ate: string };
}

export interface ItemValidado {
  index: number;
  item: ItemEntrada | null;
  erros: string[];
  avisos: string[];
}

export type ResultadoLeitura =
  | { ok: true; cabecalho: CabecalhoLote; itens: ItemValidado[] }
  | { ok: false; erro: string };

const STATUS_REALIZADO = ["finalizada", "finalizado", "atendido", "atendida", "realizado", "realizada", "concluido", "concluído", "concluida", "concluída"];
const CAMPOS_COMUNS = ["tipo", "chave_origem", "paciente", "origem", "consultado_em", "a_conferir", "nota_ia"];

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function dataConsulta(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const dia = t.slice(0, 10);
  if (!isDiaIso(dia)) return null;
  if (t.length > 10 && Number.isNaN(Date.parse(t))) return null;
  return t;
}

function lerPaciente(v: unknown, erros: string[], avisos: string[]): PacienteRef {
  const p = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ref: PacienteRef = {};
  for (const k of ["nome", "sd_codigo", "sd_numero", "sd_ficha_id", "telefone"] as const) {
    const t = texto(p[k]);
    if (t) ref[k] = t;
  }
  const temIdSd = !!(ref.sd_codigo || ref.sd_numero || ref.sd_ficha_id);
  if (!temIdSd && !(ref.nome && ref.telefone)) {
    erros.push("identificação insuficiente: informe código, número ou ID da ficha do Simples Dental, ou nome + telefone");
  } else if (!temIdSd) {
    avisos.push("sem identificador do Simples Dental: a paciente vai para vinculação manual");
  }
  return ref;
}

/** Valida um item já com origem/consulta herdadas do lote. Pura. */
export function validarItem(bruto: unknown, index: number, cab: CabecalhoLote): ItemValidado {
  const erros: string[] = [];
  const avisos: string[] = [];
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { index, item: null, erros: ["item não é um objeto"], avisos };
  }
  const o = bruto as Record<string, unknown>;
  const tipo = texto(o.tipo) as TipoEntrada;
  if (!TIPOS_ENTRADA.includes(tipo)) erros.push(`tipo inválido: "${texto(o.tipo) || "(vazio)"}"`);

  const paciente = lerPaciente(o.paciente, erros, avisos);
  const origem = texto(o.origem) || cab.origem;
  const consultado_em = dataConsulta(o.consultado_em) ?? cab.consultado_em;
  const diaConsulta = consultado_em.slice(0, 10);

  const aConferir = Array.isArray(o.a_conferir) ? o.a_conferir.map(texto).filter(Boolean) : [];
  if (o.a_conferir !== undefined && !Array.isArray(o.a_conferir)) erros.push("a_conferir precisa ser uma lista de campos");

  const dados: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!CAMPOS_COMUNS.includes(k)) dados[k] = v;

  // Campos genéricos de qualquer tarefa: ação pedida, contexto e prazo explícito.
  if (o.prazo !== undefined && o.prazo !== null && !isDiaIso(texto(o.prazo))) erros.push("prazo precisa ser uma data exata (AAAA-MM-DD)");
  if (o.acao !== undefined && typeof o.acao !== "string") erros.push("acao precisa ser texto");
  if (o.contexto !== undefined && typeof o.contexto !== "string") erros.push("contexto precisa ser texto");

  switch (tipo) {
    case "outro": {
      if (!texto(o.acao)) erros.push("acao é obrigatória para tarefas do tipo outro");
      break;
    }
    case "atendimento_realizado": {
      const d = texto(o.data_atendimento);
      if (!isDiaIso(d)) erros.push("data_atendimento exata (AAAA-MM-DD) é obrigatória — datas aproximadas não geram marcos");
      else if (d > diaConsulta) erros.push("data_atendimento é posterior à data da consulta ao Simples Dental");
      const st = texto(o.status_no_sd).toLowerCase();
      if (!st) erros.push("status_no_sd é obrigatório (o atendimento precisa constar como realizado)");
      else if (!STATUS_REALIZADO.includes(st)) erros.push(`status_no_sd "${texto(o.status_no_sd)}" não indica atendimento realizado — agendado/confirmado não gera marcos`);
      if (o.marcos !== undefined && !(Array.isArray(o.marcos) && o.marcos.every((k) => ["d30", "d90", "m6"].includes(String(k))) && new Set(o.marcos).size === o.marcos.length)) {
        erros.push('marcos precisa ser uma lista com "d30", "d90" e/ou "m6" (os pertinentes ao atendimento)');
      }
      if (aConferir.includes("data_atendimento") || aConferir.includes("status_no_sd")) {
        avisos.push("data ou status a conferir: o atendimento fica pendente de validação e não gera marcos até ser confirmado");
      }
      break;
    }
    case "cobranca": {
      if (o.valor !== undefined && (typeof o.valor !== "number" || !(o.valor >= 0))) erros.push("valor precisa ser um número (ex.: 450.00)");
      if (o.vencimento !== undefined && !isDiaIso(texto(o.vencimento))) erros.push("vencimento precisa ser uma data exata (AAAA-MM-DD)");
      if (!aConferir.includes("valor") && o.valor !== undefined) avisos.push("valor marcado como verificado — confira se veio do Simples Dental");
      break;
    }
    case "recuperacao_falta": {
      if (!isDiaIso(texto(o.data_ocorrencia))) erros.push("data_ocorrencia exata (AAAA-MM-DD) é obrigatória");
      if (!["falta", "cancelamento"].includes(texto(o.ocorrencia))) erros.push('ocorrencia precisa ser "falta" ou "cancelamento"');
      break;
    }
    case "continuidade": {
      if (!texto(o.contexto)) erros.push("contexto é obrigatório (qual etapa ou tratamento precisa de continuidade)");
      break;
    }
    case "relacionamento": {
      const ua = texto(o.ultimo_atendimento);
      if (ua && !isDiaIso(ua) && !/^\d{4}-\d{2}$/.test(ua)) erros.push("ultimo_atendimento precisa ser AAAA-MM-DD ou AAAA-MM (aproximado)");
      break;
    }
    case "encaminhamento": {
      if (!["comercial_externa", "gabi", "dra_larissa", "gestao"].includes(texto(o.para))) erros.push('para precisa ser "comercial_externa", "gabi", "dra_larissa" ou "gestao"');
      if (!texto(o.motivo)) erros.push("motivo é obrigatório");
      break;
    }
  }

  const chave = texto(o.chave_origem);
  if (!chave && tipo === "atendimento_realizado") avisos.push("sem chave_origem: mesma paciente e mesma data serão tratadas como possível duplicidade");

  const item: ItemEntrada = { tipo, paciente, origem, consultado_em, a_conferir: aConferir, dados };
  if (chave) item.chave_origem = chave;
  const nota = texto(o.nota_ia);
  if (nota) item.nota_ia = nota;
  return { index, item: erros.length ? null : item, erros, avisos };
}

/** Lê o texto colado. Erros de estrutura do lote param tudo; erros de item ficam no item. */
export function lerLote(textoColado: string): ResultadoLeitura {
  let bruto: unknown;
  try {
    bruto = JSON.parse(textoColado);
  } catch {
    return { ok: false, erro: "O texto colado não é um JSON válido." };
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erro: "O lote precisa ser um objeto JSON." };
  const o = bruto as Record<string, unknown>;
  if (o.contrato !== CONTRATO) return { ok: false, erro: `Contrato não reconhecido. Esperado "${CONTRATO}".` };
  const l = (o.lote && typeof o.lote === "object" ? o.lote : {}) as Record<string, unknown>;
  const origem = texto(l.origem);
  const consultado_em = dataConsulta(l.consultado_em);
  if (!origem) return { ok: false, erro: "lote.origem é obrigatório (de onde veio a informação)." };
  if (!consultado_em) return { ok: false, erro: "lote.consultado_em é obrigatório (quando a informação foi consultada)." };
  if (!Array.isArray(o.itens) || !o.itens.length) return { ok: false, erro: "O lote não tem itens." };
  if (o.itens.length > MAX_ITENS) return { ok: false, erro: `No máximo ${MAX_ITENS} itens por lote.` };

  const cabecalho: CabecalhoLote = { origem, consultado_em };
  if (texto(l.consultado_por)) cabecalho.consultado_por = texto(l.consultado_por);
  if (texto(l.ferramenta)) cabecalho.ferramenta = texto(l.ferramenta);
  const per = l.periodo as Record<string, unknown> | undefined;
  if (per && isDiaIso(texto(per.de)) && isDiaIso(texto(per.ate))) cabecalho.periodo = { de: texto(per.de), ate: texto(per.ate) };

  return { ok: true, cabecalho, itens: o.itens.map((it, i) => validarItem(it, i, cabecalho)) };
}

/** JSON canônico (chaves ordenadas) — base do hash do lote e da comparação de conteúdo. */
export function jsonCanonico(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (val as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return val;
  });
}

/** Hash estável (cyrb53) do lote: reenviar o mesmo conteúdo dá o mesmo hash (unique no banco). */
export function hashLote(textoColado: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textoColado);
  } catch {
    parsed = textoColado;
  }
  return hashTexto(jsonCanonico(parsed));
}

export function hashTexto(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
