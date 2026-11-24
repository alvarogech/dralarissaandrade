// Converte linhas do conector MCP do Notion (modo "rows") no snapshot normalizado que lib/contexto.mjs espera.
// Nenhuma regra editorial aqui: só tradução de nomes, tipos e relações.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA = JSON.parse(readFileSync(join(RAIZ, 'notion', 'schema', 'schema.json'), 'utf8'));
export const IMPLANTACAO = JSON.parse(readFileSync(join(RAIZ, 'notion', 'deploy', 'implantacao.json'), 'utf8'));
export const BASES_LIDAS = ['conteudos', 'semanas', 'dias', 'captacao', 'pendencias', 'historias', 'aprendizados', 'prioridades', 'recomendacoes', 'execucoes'];
export const dsDe = (base) => IMPLANTACAO.databases[base]?.data_source;
export const viewUrlDe = (base) => `https://www.notion.so/${IMPLANTACAO.databases[base].database}?v=${IMPLANTACAO.views.agente[base].replace(/-/g, '')}`;
// Lê o resultado de notion-fetch de uma página (texto ou JSON salvo) e devolve as propriedades no formato das linhas.
export function lerPagina(arquivo) {
  let t = readFileSync(arquivo, 'utf8');
  try { const j = JSON.parse(t); t = j.text || t; } catch {}
  const m = t.match(/<properties>\s*([\s\S]*?)\s*<\/properties>/);
  if (!m) throw new Error(`sem <properties> em ${arquivo}`);
  const props = JSON.parse(m[1]);
  const corpo = (t.match(/<content>\n?([\s\S]*?)\n?<\/content>/) || [, ''])[1];
  return { ...props, url: props.url || (t.match(/<page url="([^"]+)"/) || [])[1], __corpo: corpo };
}
export const dbSchema = (base) => SCHEMA.databases.find((d) => d.key === base);

// Texto do conector vem com escapes de Markdown ("sim\:dia\:..." e "\[SIMULAÇÃO\]").
export const limpar = (v) => (typeof v === 'string' ? v.replace(/\\([\\`*_{}\[\]()#+\-.!:|>~])/g, '$1') : v);
// Relações e multisseleção chegam como string JSON no modo rows e como array no fetch.
export function lista(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(limpar);
  try { const x = JSON.parse(v); return Array.isArray(x) ? x.map(limpar) : [limpar(String(x))]; } catch { return [limpar(v)]; }
}
export const idDeUrl = (u = '') => (String(u).match(/[0-9a-f]{32}/i)?.[0] || String(u).replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0] || '').toLowerCase();
const data = (r, p) => r[`date:${p}:start`] ? String(r[`date:${p}:start`]).slice(0, 10) : null;
const dataFim = (r, p) => r[`date:${p}:end`] ? String(r[`date:${p}:end`]).slice(0, 10) : null;
const txt = (r, p) => limpar(r[p] ?? '') || '';
const sel = (r, p) => limpar(r[p] ?? '') || null;
const chk = (r, p) => r[p] === '__YES__' || r[p] === true;

// Margem entre a última escrita do agente e a última edição da página: acima disso, alguém da equipe mexeu.
export const MARGEM_EDICAO_MIN = 15;
export function meta(base, r) {
  const ultima = r['date:Última escrita do agente:start'] || null;
  const atualizado = r['Atualizado em'] || null;
  const editado = Boolean(ultima && atualizado && (new Date(atualizado) - new Date(ultima)) / 60000 > MARGEM_EDICAO_MIN);
  return { base, url: r.url, id: idDeUrl(r.url), chave: txt(r, 'Chave'), origem: sel(r, 'Origem'), atualizado_em: atualizado,
    ultima_escrita: ultima, editado_pela_equipe: editado, travado: chk(r, 'Travar para o agente'), status: sel(r, 'Status') };
}

// Lê run/bruto/<base>.json (uma resposta do conector, ou um array de respostas se houve mais de uma consulta).
export function linhasDe(arquivo) {
  const j = JSON.parse(readFileSync(arquivo, 'utf8'));
  const partes = Array.isArray(j) ? j : [j];
  return partes.flatMap((p) => p.results || p.rows || (Array.isArray(p) ? p : []));
}

export function montarSnapshot(brutoPorBase, { modo = 'producao' } = {}) {
  const indice = {}; // url-id -> meta
  for (const [base, linhas] of Object.entries(brutoPorBase)) for (const r of linhas) { const m = meta(base, r); indice[m.id] = m; }
  const ch = (u) => indice[idDeUrl(u)]?.chave || null;
  const chs = (v) => lista(v).map(ch).filter(Boolean);
  // Piloto de teste: só os registros "teste4a:" entram junto com os reais. Toda outra simulação fica de fora.
  const origem = (r) => { const c = txt(r, 'Chave'); const o = sel(r, 'Origem'); return modo === 'piloto-teste' && c.startsWith('teste4a:') ? 'Teste 4A' : o; };
  const B = (k) => brutoPorBase[k] || [];
  const pendCod = (u) => { const m = indice[idDeUrl(u)]; return m ? (B('pendencias').find((r) => idDeUrl(r.url) === m.id)?.['Código'] || m.chave) : null; };

  const conteudos = B('conteudos').map((r) => { const m = meta('conteudos', r); return {
    chave: m.chave, titulo: txt(r, 'Título'), status: m.status, formato: sel(r, 'Formato'), pilar: sel(r, 'Pilar'), objetivo: sel(r, 'Objetivo'),
    tema: lista(r['Tema']), argumento: txt(r, 'Argumento central'), procedimentos: lista(r['Procedimentos citados']), gancho: txt(r, 'Gancho'), cta: txt(r, 'CTA'),
    prazo: data(r, 'Prazo de produção'), publicacao_prevista: data(r, 'Publicação prevista'), publicado_em: data(r, 'Publicado em'),
    com_quem: sel(r, 'Com quem está'), prioridade: sel(r, 'Prioridade'), validacao: sel(r, 'Validação da Larissa'), motivo_validacao: lista(r['Motivo da validação']),
    autorizacao: sel(r, 'Autorização de imagem') || 'Não se aplica', bloqueio: txt(r, 'Bloqueio'), pendencias: lista(r['Pendências']).map(pendCod).filter(Boolean),
    travado: m.travado, editado_pela_equipe: m.editado_pela_equipe, historia: chs(r['História'])[0] || null, semana: chs(r['Semana'])[0] || null, origem: origem(r) }; });
  const pendencias = B('pendencias').map((r) => { const cod = limpar(r['Código'] || '') || txt(r, 'Chave'); return {
    chave: txt(r, 'Chave'), codigo: cod, pendencia: txt(r, 'Pendência'), status: sel(r, 'Status'), quem_responde: sel(r, 'Quem responde'), prioridade: sel(r, 'Prioridade'),
    resposta: txt(r, 'Resposta'), conteudos_afetados: conteudos.filter((c) => c.pendencias.includes(cod)).map((c) => c.chave), origem: origem(r) }; });
  const historias = B('historias').map((r) => { const c = txt(r, 'Chave'); return {
    chave: c, titulo: txt(r, 'História'), tipo: sel(r, 'Tipo'), relato: txt(r, 'Relato'), status: sel(r, 'Status'), envolve: lista(r['Envolve']),
    autorizacao: sel(r, 'Autorização'), identificacao: sel(r, 'Identificação'), vezes_usada: conteudos.filter((x) => x.historia === c).length, origem: origem(r) }; });
  return {
    indice,
    snapshot: {
      conteudos, pendencias, historias,
      semanas: B('semanas').map((r) => ({ chave: txt(r, 'Chave'), titulo: txt(r, 'Semana'), inicio: data(r, 'Período'), fim: dataFim(r, 'Período') || data(r, 'Período'),
        capacidade: sel(r, 'Capacidade de produção') || 'Normal', restricoes: txt(r, 'Restrições da semana'), intencao: txt(r, 'Intenção editorial'), status_plano: sel(r, 'Status do plano'), origem: origem(r) })),
      dias: B('dias').map((r) => ({ chave: txt(r, 'Chave'), data: data(r, 'Data'), rotina: txt(r, 'Minha rotina'), disponibilidade: sel(r, 'Disponibilidade para gravar'), direcionamento: sel(r, 'Direcionamento'), origem: origem(r) })),
      captacao: B('captacao').map((r) => ({ chave: txt(r, 'Chave'), pedido: txt(r, 'Pedido'), tipo: sel(r, 'Tipo'), status: sel(r, 'Status'), quando: data(r, 'Quando'), quem_capta: sel(r, 'Quem capta'), conteudos: chs(r['Conteúdos']), origem: origem(r) })),
      aprendizados: B('aprendizados').map((r) => ({ chave: txt(r, 'Chave'), texto: txt(r, 'Aprendizado'), status: sel(r, 'Status'), area: sel(r, 'Área'), origem: origem(r) })),
      prioridades: B('prioridades').map((r) => ({ chave: txt(r, 'Chave'), titulo: txt(r, 'Prioridade'), status: sel(r, 'Status'), periodo: [data(r, 'Período'), dataFim(r, 'Período')],
        procedimento: txt(r, 'Procedimento ou serviço'), meta: txt(r, 'Meta'), peso: sel(r, 'Peso'), origem: origem(r) })),
      recomendacoes: B('recomendacoes').map((r) => ({ chave: txt(r, 'Chave'), titulo: txt(r, 'Recomendação'), tipo: sel(r, 'Tipo'), decisao: sel(r, 'Decisão'), decidido_em: data(r, 'Decidido em'), origem: origem(r) })),
      execucoes: B('execucoes').map((r) => ({ chave: txt(r, 'Chave'), idempotencia: txt(r, 'Chave de idempotência'), status: sel(r, 'Status'), workflow: sel(r, 'Workflow'), origem: origem(r) })),
      referencias: [], metricas: [],
      // Datas comemorativas fixas que importam para a agenda editorial (sem inventar eventos da clínica).
      datas: [{ data: '2026-12-25', nome: 'Natal' }, { data: '2027-01-01', nome: 'Ano-novo' }, { data: '2027-05-09', nome: 'Dia das Mães' }],
    },
  };
}
