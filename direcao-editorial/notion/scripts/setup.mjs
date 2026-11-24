#!/usr/bin/env node
// Cria a estrutura da Central Editorial no Notion a partir de schema/schema.json e schema/layout.json.
//
//   node scripts/setup.mjs            → simulação (padrão): mostra o que seria criado, não chama a API
//   node scripts/setup.mjs --apply    → cria de verdade (exige NOTION_TOKEN e NOTION_PARENT_PAGE_ID)
//
// Idempotente: IDs criados ficam em notion/.state/notion-ids.json; rodar de novo só cria o que falta.
// Nada é dado como sucesso sem resposta da API: cada falha é listada no fim para configuração manual.
import { loadAll, databasePayloads, effectiveProperties, viewConfiguration, mapFilterProps, richText } from './lib/schema.mjs';
import { NotionClient, loadEnv, loadState, saveState } from './lib/notion.mjs';

const APPLY = process.argv.includes('--apply');
const { schema, layout } = loadAll();
const report = { criados: [], existentes: [], falhas: [], manuais: [] };
const log = (...a) => console.log(...a);

const pageTitle = (t) => ({ title: [{ type: 'text', text: { content: t } }] });

async function main() {
  if (!APPLY) return dryRun();
  loadEnv();
  const parent = process.env.NOTION_PARENT_PAGE_ID;
  if (!parent) throw new Error('NOTION_PARENT_PAGE_ID ausente (página compartilhada com a integração).');
  const api = new NotionClient({ token: process.env.NOTION_TOKEN, version: schema.notion_version });
  const state = loadState();
  const step = async (label, fn) => {
    try { const r = await fn(); return r; } catch (e) { report.falhas.push(`${label}: ${e.message}`); log(`  ✗ ${label}: ${e.message}`); return null; }
  };

  // 0. Página raiz e páginas de apoio
  const ensurePage = async (key, title, icon, parentId, intro) => {
    if (state.pages[key]) { report.existentes.push(`página ${title}`); return state.pages[key]; }
    const page = await step(`página ${title}`, () => api.post('/pages', {
      parent: { type: 'page_id', page_id: parentId },
      icon: { type: 'emoji', emoji: icon },
      properties: pageTitle(title),
      children: intro ? [{ object: 'block', type: 'callout', callout: { rich_text: richText(intro), icon: { type: 'emoji', emoji: '👉' } } }] : [],
    }));
    if (page) { state.pages[key] = page.id; saveState(state); report.criados.push(`página ${title}`); }
    return page?.id;
  };
  const root = await ensurePage('root', layout.root.title, layout.root.icon, parent);
  if (!root) return finish(api);
  const basesPage = await ensurePage('bases', 'Bases', '🗄️', root, 'Bases de dados da central. A equipe trabalha pelas páginas Hoje, Larissa e Gestão; aqui ficam as tabelas completas.');
  const motorPage = await ensurePage('motor', 'Motor (técnico)', '⚙️', root, 'Log das automações. Só gestão.');

  // 1. Bases (fase 1: propriedades simples)
  for (const db of schema.databases) {
    if (state.databases[db.key]) { report.existentes.push(`base ${db.title}`); continue; }
    const phases = databasePayloads(schema, db);
    const created = await step(`base ${db.title}`, () => api.post('/databases', {
      parent: { type: 'page_id', page_id: db.key === 'execucoes' ? motorPage : basesPage },
      title: richText(db.title),
      description: richText(db.desc),
      icon: { type: 'emoji', emoji: db.icon },
      initial_data_source: { properties: phases[1] },
    }));
    if (created) {
      state.databases[db.key] = { database_id: created.id, data_source_id: created.data_sources?.[0]?.id };
      saveState(state);
      report.criados.push(`base ${db.title}`);
    }
  }
  const ids = Object.fromEntries(Object.entries(state.databases).map(([k, v]) => [k, v.data_source_id]));

  // 2. Relações e status; 3. Fórmulas — só adiciona o que ainda não existe no data source
  for (const phase of [2, 3]) {
    for (const db of schema.databases) {
      const dsId = ids[db.key];
      if (!dsId) continue;
      const ds = await step(`ler ${db.title}`, () => api.get(`/data_sources/${dsId}`));
      if (!ds) continue;
      const existing = new Set(Object.keys(ds.properties || {}));
      const wanted = databasePayloads(schema, db, ids)[phase];
      const props = effectiveProperties(schema, db);
      for (const [name, cfg] of Object.entries(wanted)) {
        if (existing.has(name)) { report.existentes.push(`${db.title}.${name}`); continue; }
        const r = await step(`${db.title}.${name}`, () => api.patch(`/data_sources/${dsId}`, { properties: { [name]: cfg } }));
        if (!r) continue;
        report.criados.push(`${db.title}.${name}`);
        const p = props[name];
        if (p.type === 'relation' && p.dual) {
          const synced = r.properties?.[name]?.relation?.dual_property?.synced_property_id;
          if (synced) {
            await step(`renomear ${p.target}.${p.dual}`, () => api.patch(`/data_sources/${ids[p.target]}`, { properties: { [synced]: { name: p.dual } } }));
          } else report.manuais.push(`Renomear a propriedade espelho de ${db.title}.${name} em ${p.target} para "${p.dual}".`);
        }
        if (p.type === 'status') report.manuais.push(`${db.title}.${name}: conferir se as opções padrão (Not started, In progress, Done) apareceram e removê-las à mão.`);
      }
    }
  }

  // 4. Views: dentro das bases e nas páginas da equipe
  const dsCache = {};
  const dsInfo = async (key) => {
    if (dsCache[key]) return dsCache[key];
    const ds = await api.get(`/data_sources/${ids[key]}`);
    const nameToId = {}; const propTypes = {};
    for (const [n, p] of Object.entries(ds.properties)) { nameToId[n] = p.id; propTypes[n] = p.type; }
    return (dsCache[key] = { nameToId, propTypes, names: Object.keys(ds.properties) });
  };
  const viewBody = async (view, baseKey) => {
    const info = await dsInfo(baseKey);
    const body = { data_source_id: ids[baseKey], name: view.name, type: view.type };
    const configuration = viewConfiguration(view, info.names, info.nameToId, info.propTypes);
    if (configuration) body.configuration = configuration;
    if (view.filter) body.filter = mapFilterProps(view.filter, info.nameToId);
    if (view.sorts) body.sorts = view.sorts;
    return body;
  };
  // Views: desde a Fase 2.1 são descritas na DSL do Notion (layout.json "configure") e aplicadas pelo
  // conector MCP, que valida a DSL. A API REST pede outro formato; este script cria só as páginas.
  for (const page of layout.pages) {
    const pageId = await ensurePage(page.key, page.title, page.icon, root, page.intro);
    if (pageId) report.manuais.push(`[${page.title}] criar as ${page.sections.length} views de schema/layout.json via conector MCP (ver notion/11-Implantacao.md).`);
    report.manuais.push(...(page.manual || []).map((m) => `[${page.title}] ${m}`));
  }

  // 5. Registro da execução de setup na base Execuções (rastreabilidade)
  if (ids.execucoes) {
    await step('registro da execução', () => api.post('/pages', {
      parent: { type: 'data_source_id', data_source_id: ids.execucoes },
      properties: {
        'Execução': { title: richText(`setup ${new Date().toISOString().slice(0, 16)}`) },
        Workflow: { select: { name: 'setup' } },
        Status: { select: { name: report.falhas.length ? 'Sucesso parcial' : 'Sucesso' } },
        'Itens criados': { number: report.criados.length },
        Modelo: { select: { name: 'sem IA' } },
        Erro: { rich_text: richText(report.falhas.join('\n').slice(0, 1900)) },
      },
    }));
  }
  return finish(api);
}

function finish(api) {
  log('\n=== Relatório do setup ===');
  log(`Criados: ${report.criados.length} | Já existiam: ${report.existentes.length} | Falhas: ${report.falhas.length} | Chamadas à API: ${api?.calls ?? 0}`);
  if (report.falhas.length) { log('\nFalhas (configurar à mão ou corrigir e rodar de novo):'); report.falhas.forEach((f) => log('  - ' + f)); }
  log('\nConfiguração manual obrigatória (a API não cobre):');
  [...new Set(report.manuais)].forEach((m) => log('  - ' + m));
  log('  - Permissões de cada página (ver notion/04-Responsabilidades-e-permissoes.md).');
  log('  - Perguntas dos formulários e opções padrão de cada formulário.');
  process.exitCode = report.falhas.length ? 1 : 0;
}

function dryRun() {
  log('SIMULAÇÃO (nenhuma chamada à API). Use --apply para criar de verdade.\n');
  let nProps = 0;
  for (const db of schema.databases) {
    const ph = databasePayloads(schema, db);
    const n = Object.values(ph).reduce((a, p) => a + Object.keys(p).length, 0);
    nProps += n;
    log(`${db.icon} ${db.title.padEnd(26)} ${String(n).padStart(2)} propriedades (fase1 ${Object.keys(ph[1]).length}, relações/status ${Object.keys(ph[2]).length}, fórmulas ${Object.keys(ph[3]).length})`);
  }
  const nViews = layout.pages.reduce((a, p) => a + p.sections.length, 0) + Object.entries(layout.database_views).filter(([k]) => !k.startsWith('$')).reduce((a, [, v]) => a + v.length, 0);
  log(`\nTotal: ${schema.databases.length} bases, ${nProps} propriedades, ${layout.pages.length + 3} páginas, ${nViews} views.`);
  log('Manuais previstos:'); layout.pages.forEach((p) => (p.manual || []).forEach((m) => log(`  - [${p.title}] ${m}`)));
}

main().catch((e) => { console.error('Erro:', e.message); process.exitCode = 1; });
