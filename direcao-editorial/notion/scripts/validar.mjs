#!/usr/bin/env node
// Validação offline da Fase 2 (não chama a API). Roda como teste: `node scripts/validar.mjs`.
// Confere coerência entre schema, layout, inventário e a base de conhecimento.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, effectiveProperties, optionList, databasePayloads, filterProps, viewConfiguration, NOTION_DIR } from './lib/schema.mjs';
import { buildRecords } from './importar.mjs';

const { schema, layout, inventario } = loadAll();
const errors = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) errors.push(msg); };

const dbs = Object.fromEntries(schema.databases.map((d) => [d.key, d]));
const propsOf = Object.fromEntries(schema.databases.map((d) => [d.key, effectiveProperties(schema, d)]));
const OWNERS = new Set(['larissa', 'social', 'gestao', 'equipe', 'agente', 'sistema']);
const COLORS = new Set(['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']);

// 1. Schema
ok(new Set(schema.databases.map((d) => d.prefix)).size === schema.databases.length, 'Prefixos de ID repetidos');
for (const db of schema.databases) {
  const props = propsOf[db.key];
  const titles = Object.values(props).filter((p) => p.type === 'title');
  ok(titles.length === 1, `${db.title}: precisa de exatamente 1 título (tem ${titles.length})`);
  for (const [name, p] of Object.entries(props)) {
    ok(OWNERS.has(p.owner), `${db.title}.${name}: owner inválido "${p.owner}"`);
    ok(name.length <= 100, `${db.title}.${name}: nome longo demais`);
    const opts = optionList(schema, p);
    ok(new Set(opts.map((o) => o[0])).size === opts.length, `${db.title}.${name}: opções repetidas`);
    opts.forEach(([, c]) => ok(COLORS.has(c), `${db.title}.${name}: cor inválida ${c}`));
    if (p.type === 'status') p.options.forEach(([n, , g]) => ok(['To-do', 'In progress', 'Complete'].includes(g), `${db.title}.${name}.${n}: grupo inválido`));
    if (p.type === 'relation') {
      ok(!!dbs[p.target], `${db.title}.${name}: base alvo inexistente ${p.target}`);
      if (p.dual) {
        ok(!(p.dual in (propsOf[p.target] || {})), `${db.title}.${name}: espelho "${p.dual}" colide com propriedade de ${p.target}`);
        // espelho não pode repetir outro espelho no mesmo alvo
        const others = schema.databases.flatMap((d) => Object.entries(propsOf[d.key]).filter(([n, q]) => q.type === 'relation' && q.target === p.target && q.dual === p.dual && !(d.key === db.key && n === name)));
        ok(others.length === 0, `${p.target}: espelho "${p.dual}" duplicado`);
      }
    }
    if (p.type === 'formula') {
      const refs = [...p.expression.matchAll(/(?<!current\.)prop\("([^"]+)"\)/g)].map((m) => m[1]);
      const mirrors = schema.databases.flatMap((d) => Object.values(propsOf[d.key]).filter((q) => q.type === 'relation' && q.target === db.key && q.dual).map((q) => q.dual));
      refs.forEach((r) => ok(r in props || mirrors.includes(r), `${db.title}.${name}: fórmula usa propriedade inexistente "${r}"`));
      ok((p.expression.match(/\(/g) || []).length === (p.expression.match(/\)/g) || []).length, `${db.title}.${name}: parênteses desbalanceados`);
    }
  }
  const ph = databasePayloads(schema, db);
  ok(JSON.stringify(ph[1]).length < 500_000, `${db.title}: payload de criação grande demais`);
}

// Nomes disponíveis por base (inclui espelhos criados por relações de outras bases)
const namesOf = (key) => {
  const own = Object.keys(propsOf[key]);
  const mirrors = schema.databases.flatMap((d) => Object.values(propsOf[d.key]).filter((q) => q.type === 'relation' && q.target === key && q.dual).map((q) => q.dual));
  return [...own, ...mirrors];
};
const typeOf = (key, name) => propsOf[key][name]?.type ?? (namesOf(key).includes(name) ? 'relation' : undefined);

// 2. Layout
const FILTER_KIND = { select: 'select', multi_select: 'multi_select', status: 'status', formula: 'formula', checkbox: 'checkbox', relation: 'relation', date: 'date', rich_text: 'rich_text', number: 'number' };
const checkView = (where, view, baseKey) => {
  ok(!!dbs[baseKey], `${where}: base inexistente ${baseKey}`);
  if (!dbs[baseKey]) return;
  const names = namesOf(baseKey);
  (view.show || []).forEach((n) => ok(names.includes(n), `${where}: coluna inexistente "${n}"`));
  for (const f of filterProps(view.filter)) {
    const tp = typeOf(baseKey, f.property);
    ok(!!tp, `${where}: filtro em propriedade inexistente "${f.property}"`);
    const kind = Object.keys(f).find((k) => k !== 'property');
    ok(FILTER_KIND[tp] === kind, `${where}: filtro "${kind}" incompatível com ${f.property} (${tp})`);
    const val = f[kind]?.equals ?? f[kind]?.does_not_equal;
    if (['select', 'status'].includes(kind) && typeof val === 'string') {
      ok(optionList(schema, propsOf[baseKey][f.property]).some((o) => o[0] === val), `${where}: opção "${val}" não existe em ${f.property}`);
    }
  }
  (view.sorts || []).forEach((s) => ok(names.includes(s.property), `${where}: ordenação em propriedade inexistente "${s.property}"`));
  if (view.type === 'board') ok(['select', 'status'].includes(typeOf(baseKey, view.group_by)), `${where}: agrupamento inválido "${view.group_by}"`);
  if (view.type === 'calendar') ok(typeOf(baseKey, view.date_property) === 'date', `${where}: calendário sem data válida`);
  try { viewConfiguration(view, names, null, Object.fromEntries(names.map((n) => [n, typeOf(baseKey, n)]))); } catch (e) { ok(false, `${where}: ${e.message}`); }
};
for (const page of layout.pages) for (const s of page.sections) checkView(`${page.title} › ${s.view.name}`, s.view, s.view.base);
for (const [k, views] of Object.entries(layout.database_views)) if (!k.startsWith('$')) views.forEach((v) => checkView(`${k} › ${v.name}`, v, k));
const socialSections = layout.pages.find((p) => p.key === 'social').sections.map((s) => s.heading);
['Intenção da semana', 'Hoje', 'Stories de hoje', 'Próximas publicações do feed', 'Pedir à Larissa', 'Aguardando edição', 'Aguardando aprovação da Larissa', 'Pendências e impedimentos']
  .forEach((h) => ok(socialSections.includes(h), `Página da social media sem a seção "${h}"`));

// 3. Inventário
const conteudos = inventario.conteudos;
ok(conteudos.filter((c) => c.Chave.startsWith('trello:C-')).length === 16, 'Inventário deve ter 16 conteúdos');
ok(conteudos.filter((c) => c.Chave.startsWith('trello:I-')).length === 5, 'Inventário deve ter 5 ideias');
ok(new Set(conteudos.map((c) => c.Chave)).size === conteudos.length, 'Chaves de conteúdo repetidas');
const pcodes = new Set(inventario.pendencias.map((p) => p['Código']));
const kbFile = readFileSync(join(NOTION_DIR, '..', 'base-de-conhecimento', '00-Perguntas-pendentes.md'), 'utf8');
const kbCodes = new Set([...kbFile.matchAll(/^\| (P-\d{2}) /gm)].map((m) => m[1]));
ok(kbCodes.size === pcodes.size && [...kbCodes].every((c) => pcodes.has(c)), `Pendências do inventário (${pcodes.size}) diferentes da base (${kbCodes.size})`);
conteudos.forEach((c) => (c['Pendências'] || []).forEach((k) => ok(pcodes.has(k.replace('pendencia:', '')), `${c.Chave}: pendência ${k} inexistente`)));
conteudos.forEach((c) => ok(!Object.keys(c).some((k) => /publica|Prazo/i.test(k)), `${c.Chave}: não pode ter data de publicação/prazo`));
conteudos.filter((c) => c.Status === 'Aguardando informação').forEach((c) => ok(c.Bloqueio && c['Pendências'].length, `${c.Chave}: bloqueado sem motivo ou pendência`));

const records = buildRecords();
for (const r of records) {
  const props = propsOf[r.base];
  for (const [name, v] of Object.entries(r.properties)) {
    ok(name in props, `${r.key}: propriedade "${name}" não existe em ${r.base}`);
    const p = props[name];
    if (!p) continue;
    const val = v.select?.name ?? v.status?.name;
    if (val) ok(optionList(schema, p).some((o) => o[0] === val), `${r.key}: valor "${val}" inválido em ${name}`);
    for (const rt of v.rich_text || v.title || []) ok(rt.text.content.length <= 2000, `${r.key}.${name}: texto acima de 2000`);
    ok(!['Publicação prevista', 'Publicado em', 'Prazo de produção'].includes(name), `${r.key}: data fictícia em ${name}`);
  }
  Object.keys(r.relations || {}).forEach((n) => ok(props[n]?.type === 'relation', `${r.key}: relação "${n}" inválida`));
  ok(JSON.stringify(r).length < 500_000 && (r.children || []).length <= 100, `${r.key}: payload grande demais`);
}

console.log(`${checks} verificações · ${errors.length} erro(s)`);
errors.forEach((e) => console.log('  ✗ ' + e));
process.exitCode = errors.length ? 1 : 0;
