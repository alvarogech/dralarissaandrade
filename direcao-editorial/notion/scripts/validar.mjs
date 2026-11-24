#!/usr/bin/env node
// Validação offline da Fase 2 (não chama a API). Roda como teste: `node scripts/validar.mjs`.
// Confere coerência entre schema, layout, inventário e a base de conhecimento.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, effectiveProperties, optionList, databasePayloads, NOTION_DIR } from './lib/schema.mjs';
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
    if (p.type === 'formula') ok(!/current\.prop\(/.test(p.expression), `${db.title}.${name}: a API do Notion recusa current.prop() em fórmula; use rollup`);
    if (p.type === 'rollup') {
      const rel = props[p.relation];
      ok(rel?.type === 'relation' || namesOf(db.key).includes(p.relation), `${db.title}.${name}: rollup sem relação ${p.relation}`);
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
function namesOf(key) {
  const own = Object.keys(propsOf[key]);
  const mirrors = schema.databases.flatMap((d) => Object.values(propsOf[d.key]).filter((q) => q.type === 'relation' && q.target === key && q.dual).map((q) => q.dual));
  return [...own, ...mirrors];
}
const typeOf = (key, name) => propsOf[key][name]?.type ?? (namesOf(key).includes(name) ? 'relation' : undefined);

// 2. Layout (DSL de views do Notion)
const RELATIVE_DATES = ['today', 'tomorrow', 'yesterday', 'one_week_ago', 'one_week_from_now', 'one_month_ago', 'one_month_from_now'];
const VIEW_TYPES = ['table', 'board', 'list', 'calendar', 'timeline', 'gallery', 'form', 'chart'];
export function parseDsl(configure = '') {
  const out = { props: [], conditions: [], groupBy: null, groupMode: null, calendarBy: null };
  for (const raw of configure.split(';')) {
    const d = raw.trim();
    if (!d) continue;
    const kw = d.match(/^(QUICK FILTER|FILTER|SORT BY|GROUP BY|SUB GROUP BY|SHOW|HIDE|CALENDAR BY|CHART|CARD LAYOUT|CARD SIZE|FORM|WRAP CELLS|ICON|WIDTH)\b/i)?.[1]?.toUpperCase();
    if (!kw) { out.unknown = (out.unknown || []).concat(d); continue; }
    if (kw === 'FILTER' || kw === 'QUICK FILTER') {
      for (const m of d.matchAll(/"([^"]+)"\s*(!=|>=|<=|=|>|<|IN\b|IS\b|CONTAINS\b)\s*(\([^)]*\)|"[^"]*"|TRUE|FALSE|EMPTY|NOT EMPTY)?/gi)) {
        const vals = m[3] ? [...m[3].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
        const bool = m[3] && /^(TRUE|FALSE)$/i.test(m[3]);
        out.props.push(m[1]);
        out.conditions.push({ prop: m[1], op: m[2].toUpperCase(), values: vals, bool });
      }
    } else if (kw === 'GROUP BY' || kw === 'SUB GROUP BY') {
      const m = d.match(/"([^"]+)"(.*)$/); out.props.push(m[1]);
      if (kw === 'GROUP BY') { out.groupBy = m[1]; out.groupMode = /BY (OPTION|GROUP)/i.test(m[2]) ? 'status-mode' : null; }
    } else if (kw === 'CALENDAR BY') { out.calendarBy = d.match(/"([^"]+)"/)[1]; out.props.push(out.calendarBy); }
    else if (['SORT BY', 'SHOW', 'HIDE', 'WIDTH', 'CHART'].includes(kw)) for (const m of d.matchAll(/"([^"]+)"/g)) out.props.push(m[1]);
  }
  return out;
}
const formulaKind = (key, name) => {
  const p = propsOf[key][name];
  if (p?.type !== 'formula') return null;
  return /^(and|or)\(|\.length\(\) >|==|>=|<=/.test(p.expression) && !/^dateBetween|^ifs/.test(p.expression) ? 'checkbox' : 'other';
};
const checkView = (where, view, baseKey) => {
  ok(!!dbs[baseKey], `${where}: base inexistente ${baseKey}`);
  if (!dbs[baseKey]) return;
  ok(VIEW_TYPES.includes(view.type), `${where}: tipo de view inválido ${view.type}`);
  const names = namesOf(baseKey);
  const dsl = parseDsl(view.configure);
  ok(!dsl.unknown, `${where}: diretiva desconhecida ${dsl.unknown}`);
  ok(!/NOT IN/i.test(view.configure || ''), `${where}: NOT IN não existe na DSL`);
  dsl.props.forEach((n) => ok(names.includes(n), `${where}: propriedade inexistente "${n}"`));
  for (const c of dsl.conditions) {
    const tp = typeOf(baseKey, c.prop);
    if (['select', 'status', 'multi_select'].includes(tp)) {
      const opts = optionList(schema, propsOf[baseKey][c.prop]).map((o) => o[0]);
      const groups = tp === 'status' ? ['To-do', 'In progress', 'Complete'] : [];
      c.values.forEach((v) => ok(opts.includes(v) || groups.includes(v), `${where}: opção "${v}" não existe em ${c.prop}`));
    }
    ok(!['formula', 'rollup'].includes(tp), `${where}: filtro em ${tp} "${c.prop}" é descartado em silêncio pelo Notion (validado na Fase 2.1)`);
    if (c.bool) ok(tp === 'checkbox' || formulaKind(baseKey, c.prop) === 'checkbox', `${where}: TRUE/FALSE em ${c.prop} que não é caixa`);
    if (tp === 'date' || tp === 'rollup') c.values.forEach((v) => ok(RELATIVE_DATES.includes(v) || /^\d{4}-\d{2}-\d{2}$/.test(v), `${where}: data inválida "${v}"`));
  }
  if (view.type === 'board') ok(!!dsl.groupBy && ['select', 'status'].includes(typeOf(baseKey, dsl.groupBy)), `${where}: quadro precisa de GROUP BY em seleção/status`);
  if (dsl.groupMode) ok(typeOf(baseKey, dsl.groupBy) === 'status', `${where}: BY OPTION/GROUP só vale para status`);
  if (view.type === 'calendar') ok(['date'].includes(typeOf(baseKey, dsl.calendarBy)), `${where}: calendário sem data válida`);
  if (view.type === 'chart') ok(/CHART /i.test(view.configure) && !!dsl.groupBy, `${where}: gráfico precisa de CHART e GROUP BY`);
  const shown = (view.configure || '').match(/SHOW ([^;]+)/)?.[1]?.match(/"/g)?.length / 2 || 0;
  ok(shown <= 11, `${where}: colunas demais (${shown})`);
};
for (const page of layout.pages) for (const s of page.sections) checkView(`${page.title} › ${s.view.name}`, s.view, s.view.base);
for (const [k, views] of Object.entries(layout.database_views)) if (!k.startsWith('$')) views.forEach((v) => checkView(`${k} › ${v.name}`, v, k));
const socialHeads = layout.pages.find((p) => p.key === 'social').sections.filter((s) => s.group === 'Em 1 minuto').map((s) => s.view.name);
['Produzir hoje', 'Publicar hoje', 'Pedir à Larissa', 'Atrasados', 'Dependem da Larissa'].forEach((h) => ok(socialHeads.includes(h), `Social media sem a resposta de 1 minuto "${h}"`));
const larissaHeads = layout.pages.find((p) => p.key === 'larissa').sections.map((s) => s.view.name);
['Para eu gravar', 'Minhas perguntas', 'Para eu validar', 'Registrar ideia', 'Meu dia'].forEach((h) => ok(larissaHeads.includes(h), `Larissa sem a seção "${h}"`));

// 2b. Política de autonomia
const autonomia = JSON.parse(readFileSync(join(NOTION_DIR, 'schema', 'autonomia.json'), 'utf8'));
const recProps = propsOf.recomendacoes;
const quem = optionList(schema, recProps['Quem decide']).map((o) => o[0]);
ok(new Set(autonomia.acoes.map((a) => a.id)).size === autonomia.acoes.length, 'Autonomia: ids repetidos');
for (const a of autonomia.acoes) {
  ok(['A', 'B', 'C'].includes(a.nivel), `Autonomia ${a.id}: nível inválido`);
  ok(a.nivel === 'A' ? a.aprovador === null : quem.includes(a.aprovador), `Autonomia ${a.id}: aprovador inválido`);
}
['publicacao', 'caso-clinico', 'autorizacao-imagem', 'afirmacao-clinica'].forEach((id) => ok(autonomia.acoes.find((a) => a.id === id)?.nivel === 'C', `Autonomia: ${id} precisa ser nível C`));
ok(optionList(schema, recProps['Nível']).length === 3, 'Recomendações precisa do campo Nível com A, B e C');

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
