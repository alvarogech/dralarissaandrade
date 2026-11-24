#!/usr/bin/env node
// Gera o DDL (formato do conector MCP do Notion) a partir de schema/schema.json.
// Saída: deploy/ddl.json com, por base, { create, relations, formulas }.
// Os IDs de data source reais entram no lugar de <ds:chave> na hora da implantação.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, effectiveProperties, optionList, phaseOf, NOTION_DIR } from './lib/schema.mjs';

const { schema } = loadAll();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const opts = (p) => optionList(schema, p).map(([n, c]) => `${q(n)}:${c}`).join(', ');
const GROUP = { 'To-do': 'to_do', 'In progress': 'in_progress', Complete: 'complete' };
const DDL = {
  title: () => 'TITLE', rich_text: () => 'RICH_TEXT', date: () => 'DATE', people: () => 'PEOPLE', checkbox: () => 'CHECKBOX',
  url: () => 'URL', files: () => 'FILES', number: () => 'NUMBER', created_time: () => 'CREATED_TIME', last_edited_time: () => 'LAST_EDITED_TIME',
  created_by: () => 'CREATED_BY', last_edited_by: () => 'LAST_EDITED_BY',
  select: (p) => `SELECT(${opts(p)})`, multi_select: (p) => `MULTI_SELECT(${opts(p)})`,
  status: (p) => `STATUS(${p.options.map(([n, c, g]) => `${q(n)}:${c}:${GROUP[g]}`).join(', ')})`,
  unique_id: (p) => `UNIQUE_ID PREFIX ${q(p.prefix)}`,
  relation: (p) => (p.single ? `RELATION(${q(`<ds:${p.target}>`)})` : `RELATION(${q(`<ds:${p.target}>`)}, DUAL ${q(p.dual)})`),
  formula: (p) => `FORMULA(${q(p.expression)})`,
  rollup: (p) => `ROLLUP(${q(p.relation)}, ${q(p.target_property)}, ${q(p.function)})`,
};
const col = (name, p) => `"${name}" ${DDL[p.type](p)}${p.desc && p.type !== 'title' ? ` COMMENT ${q(p.desc.slice(0, 200))}` : ''}`;
const out = {};
for (const db of schema.databases) {
  const props = Object.entries(effectiveProperties(schema, db));
  const ph = (n) => props.filter(([, p]) => (p.type === 'status' ? 1 : phaseOf(p)) === n);
  out[db.key] = {
    title: db.title, icon: db.icon, desc: db.desc, parent: db.key === 'execucoes' ? 'motor' : 'bases',
    create: `CREATE TABLE (${ph(1).map(([n, p]) => col(n, p)).join(', ')})`,
    relations: ph(2).map(([n, p]) => `ADD COLUMN ${col(n, p)}`).join('; '),
    formulas: ph(3).map(([n, p]) => `ADD COLUMN ${col(n, p)}`).join('; '),
  };
}
mkdirSync(join(NOTION_DIR, 'deploy'), { recursive: true });
writeFileSync(join(NOTION_DIR, 'deploy', 'ddl.json'), JSON.stringify(out, null, 2));
console.log(Object.entries(out).map(([k, v]) => `${k}: create ${v.create.length}c, rel ${v.relations ? v.relations.split('; ').length : 0}, fx ${v.formulas ? v.formulas.split('; ').length : 0}`).join('\n'));
