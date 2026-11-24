// Carrega schema.json / layout.json / inventario.json e monta os payloads da API do Notion.
// Sem dependências. Usado por setup.mjs, importar.mjs e validar.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const NOTION_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(join(NOTION_DIR, rel), 'utf8'));

export function loadAll() {
  return {
    schema: readJson('schema/schema.json'),
    layout: readJson('schema/layout.json'),
    inventario: readJson('import/inventario.json'),
  };
}

const NO_CONFIG = new Set(['title', 'rich_text', 'url', 'checkbox', 'people', 'files', 'email', 'phone_number',
  'date', 'created_by', 'created_time', 'last_edited_by', 'last_edited_time']);

/** Todas as propriedades efetivas de uma base (específicas + comuns + sync), em ordem. */
export function effectiveProperties(schema, db) {
  const props = { ...db.properties };
  if (db.common !== false) {
    for (const [name, p] of Object.entries(schema.common_properties)) {
      if (db.common === 'minimal' && (name === 'Chave' || name === 'Origem')) continue;
      props[name] = p.type === 'unique_id' ? { ...p, prefix: db.prefix } : p;
    }
  }
  if (db.sync) Object.assign(props, schema.sync_properties);
  for (const k of Object.keys(props)) if (k.startsWith('$')) delete props[k];
  return props;
}

export function optionList(schema, p) {
  if (p.options_from) return schema[p.options_from].map((n) => [n, 'default']);
  return p.options || [];
}

/**
 * Fase de criação de cada propriedade:
 *  1 = na criação da base (tipos simples, select, unique_id)
 *  2 = depois que todas as bases existem (relation, status)
 *  3 = depois das relações (formula, rollup)
 */
export function phaseOf(p) {
  if (p.type === 'relation' || p.type === 'status') return 2;
  if (p.type === 'formula' || p.type === 'rollup') return 3;
  return 1;
}

/** Config da propriedade no formato do Notion. `ids` mapeia key da base -> data_source_id. */
export function propertyConfig(schema, p, ids = {}) {
  const t = p.type;
  const base = p.desc ? { description: p.desc.slice(0, 280) } : {};
  if (t === 'title' && p.desc) return { title: {} }; // descrição em título não é necessária
  if (NO_CONFIG.has(t)) return { ...base, [t]: {} };
  if (t === 'number') return { ...base, number: { format: 'number' } };
  if (t === 'unique_id') return { ...base, unique_id: { prefix: p.prefix ?? null } };
  if (t === 'select' || t === 'multi_select') {
    return { ...base, [t]: { options: optionList(schema, p).map(([name, color]) => ({ name, color })) } };
  }
  if (t === 'status') {
    return { ...base, status: { options: p.options.map(([name, color, group]) => ({ name, color, group })) } };
  }
  if (t === 'relation') {
    const target = ids[p.target] ?? `<data_source_id:${p.target}>`;
    return { ...base, relation: p.single ? { data_source_id: target, single_property: {} } : { data_source_id: target, dual_property: {} } };
  }
  if (t === 'formula') return { ...base, formula: { expression: p.expression } };
  throw new Error(`Tipo de propriedade não suportado: ${t}`);
}

/** Payloads por fase para uma base. */
export function databasePayloads(schema, db, ids = {}) {
  const props = effectiveProperties(schema, db);
  const byPhase = { 1: {}, 2: {}, 3: {} };
  for (const [name, p] of Object.entries(props)) byPhase[phaseOf(p)][name] = propertyConfig(schema, p, ids);
  return byPhase;
}

/** Converte filtro com nomes de propriedade para IDs (o Notion aceita ambos; usamos IDs quando houver). */
export function mapFilterProps(filter, nameToId) {
  if (!filter) return undefined;
  if (filter.and) return { and: filter.and.map((f) => mapFilterProps(f, nameToId)) };
  if (filter.or) return { or: filter.or.map((f) => mapFilterProps(f, nameToId)) };
  return { ...filter, property: nameToId?.[filter.property] ?? filter.property };
}

/** Lista propriedades usadas por um filtro. */
export function filterProps(filter, out = []) {
  if (!filter) return out;
  if (filter.and || filter.or) (filter.and || filter.or).forEach((f) => filterProps(f, out));
  else out.push(filter);
  return out;
}

/** Texto rico simples respeitando o limite de 2000 caracteres por item. */
export function richText(text = '') {
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return chunks.slice(0, 100);
}

/** Payload de configuração de uma view. `nameToId`/`propTypes` vêm do data source criado. */
export function viewConfiguration(view, allPropNames, nameToId, propTypes) {
  const id = (n) => nameToId?.[n] ?? n;
  const shown = view.show || [];
  const hidden = allPropNames.filter((n) => !shown.includes(n));
  const properties = [
    ...shown.map((n) => ({ property_id: id(n), visible: true })),
    ...hidden.map((n) => ({ property_id: id(n), visible: false })),
  ];
  switch (view.type) {
    case 'table': return { type: 'table', properties, wrap_cells: true };
    case 'list': return { type: 'list', properties };
    case 'gallery': return { type: 'gallery', properties };
    case 'board': {
      const gtype = propTypes?.[view.group_by] ?? 'select';
      const group_by = { type: gtype, property_id: id(view.group_by), sort: { type: 'manual' } };
      if (gtype === 'status') group_by.group_by = 'option';
      return { type: 'board', properties, group_by };
    }
    case 'calendar': return { type: 'calendar', properties, date_property_id: id(view.date_property) };
    case 'form': return undefined; // perguntas do formulário são configuradas à mão
    default: throw new Error(`Tipo de view não suportado: ${view.type}`);
  }
}
