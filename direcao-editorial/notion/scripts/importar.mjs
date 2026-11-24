#!/usr/bin/env node
// Importa o inventário herdado do Trello (import/inventario.json) para as bases já criadas pelo setup.
//
//   node scripts/importar.mjs           → simulação: mostra o que seria criado
//   node scripts/importar.mjs --apply   → cria de verdade
//
// Deduplicação por Chave: se já existe uma página com a mesma Chave, ela é PRESERVADA (não é
// sobrescrita), porque a equipe pode já ter editado. Nenhuma data de publicação é atribuída.
import { loadAll, richText } from './lib/schema.mjs';
import { NotionClient, loadEnv, loadState } from './lib/notion.mjs';

const APPLY = process.argv.includes('--apply');
const { schema, inventario } = loadAll();
const IMPORT_DATE = '2026-11-24';

const t = (v) => ({ rich_text: richText(v || '') });
const sel = (v) => (v ? { select: { name: v } } : undefined);
const title = (v) => ({ title: richText(v) });
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const heading = (txt) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: richText(txt) } });
const para = (txt) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(txt) } });
const callout = (txt) => ({ object: 'block', type: 'callout', callout: { rich_text: richText(txt), icon: { type: 'emoji', emoji: '📦' } } });

export function buildRecords() {
  const out = [];
  for (const p of inventario.pendencias) {
    out.push({ base: 'pendencias', key: `pendencia:${p['Código']}`, properties: clean({
      'Pendência': title(`${p['Código']} · ${p['Pendência']}`), Chave: t(`pendencia:${p['Código']}`), Origem: sel(p['Código'] === 'P-00' ? 'Gestão' : 'Trello'),
      Tipo: sel(p.Tipo), Status: sel(p.Status), 'Quem responde': sel(p['Quem responde']), Prioridade: sel(p.Prioridade),
      'Bloco do questionário': sel(p.Bloco), 'Código': t(p['Código']), 'Documento da base': t(p['Documento da base']),
      Resposta: p.Resposta ? t(p.Resposta) : undefined, 'Respondida em': p['Respondida em'] ? { date: { start: p['Respondida em'] } } : undefined,
    }) });
  }
  for (const r of inventario.referencias) {
    out.push({ base: 'referencias', key: r.Chave, properties: clean({
      'Referência': title(r['Referência']), Chave: t(r.Chave), Origem: sel('Trello'), Tipo: sel(r.Tipo), Status: sel(r.Status),
      'Por que é útil': r['Por que é útil'] ? t(r['Por que é útil']) : undefined,
    }) });
  }
  for (const a of inventario.aprendizados) {
    out.push({ base: 'aprendizados', key: a.Chave, properties: clean({
      Aprendizado: title(a.Aprendizado), Chave: t(a.Chave), Origem: sel('Gestão'), Status: sel(a.Status), 'Área': sel(a['Área']), 'Evidência': t(a['Evidência']),
    }) });
  }
  for (const c of inventario.conteudos) {
    const semTexto = (c['Pendências'] || []).includes('pendencia:P-00');
    out.push({ base: 'conteudos', key: c.Chave, relations: { 'Pendências': c['Pendências'] || [] }, properties: clean({
      'Título': title(c['Título']), Chave: t(c.Chave), Origem: sel('Trello'), Status: { status: { name: c.Status } },
      Formato: sel(c.Formato), Pilar: sel(c.Pilar), Objetivo: sel(c.Objetivo),
      Bloqueio: t(c.Bloqueio), 'Informação clínica pendente': { checkbox: !!c['Clínica'] },
      'Autorização de imagem': sel(c['Autorização'] || (c.Status === 'Ideia' ? undefined : 'Não se aplica')),
      'Já publicado? (Trello)': c.Status === 'Ideia' ? undefined : sel('A confirmar'),
      'Notas de origem': t(c['Notas de origem']),
      'Com quem está': sel(c.Status === 'Aguardando informação' ? 'Larissa' : c.Status === 'Ideia' ? undefined : 'Social media'),
    }), children: [
      callout(`Importado do Trello em ${IMPORT_DATE} como inventário histórico de nov/2026. Não há confirmação de que foi publicado. ${c['Notas de origem']}`),
      heading('Roteiro'), para(semTexto ? 'O roteiro existe no Trello, mas o texto integral ainda não foi migrado (P-00).' : 'A desenvolver.'),
      heading('Direção criativa'), para('A desenvolver.'),
      heading('Legenda'), para('A desenvolver.'),
      heading('Notas da equipe'), para(''),
    ] });
  }
  return out;
}

async function main() {
  const records = buildRecords();
  if (!APPLY) {
    const by = records.reduce((a, r) => ((a[r.base] = (a[r.base] || 0) + 1), a), {});
    console.log('SIMULAÇÃO (nenhuma chamada à API). Use --apply para importar.\n', by);
    return;
  }
  loadEnv();
  const state = loadState();
  const api = new NotionClient({ token: process.env.NOTION_TOKEN, version: schema.notion_version });
  const keyToPage = {};
  const res = { criados: 0, preservados: 0, falhas: [] };
  for (const r of records) {
    const ds = state.databases[r.base]?.data_source_id;
    if (!ds) { res.falhas.push(`${r.key}: base ${r.base} não existe (rode o setup antes)`); continue; }
    try {
      const found = await api.findByKey(ds, r.key);
      if (found.length > 1) res.falhas.push(`${r.key}: ${found.length} páginas com a mesma Chave (duplicidade a resolver à mão)`);
      if (found.length) { keyToPage[r.key] = found[0].id; res.preservados++; continue; }
      const props = { ...r.properties };
      for (const [prop, keys] of Object.entries(r.relations || {})) {
        const rel = keys.map((k) => keyToPage[k]).filter(Boolean).map((id) => ({ id }));
        if (rel.length) props[prop] = { relation: rel };
        const missing = keys.filter((k) => !keyToPage[k]);
        if (missing.length) res.falhas.push(`${r.key}: relação não resolvida para ${missing.join(', ')}`);
      }
      const page = await api.post('/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props, children: r.children });
      keyToPage[r.key] = page.id;
      res.criados++;
    } catch (e) { res.falhas.push(`${r.key}: ${e.message}`); }
  }
  console.log(`Criados: ${res.criados} | Preservados (já existiam): ${res.preservados} | Falhas: ${res.falhas.length}`);
  res.falhas.forEach((f) => console.log('  - ' + f));
  process.exitCode = res.falhas.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error('Erro:', e.message); process.exitCode = 1; });
}
