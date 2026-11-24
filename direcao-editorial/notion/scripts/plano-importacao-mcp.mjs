#!/usr/bin/env node
// Converte import/inventario.json no formato de páginas do conector MCP do Notion (propriedades SQLite + corpo em Markdown).
// Saída: deploy/import-mcp.json. Relações de Conteúdos -> Pendências ficam como códigos P-xx, resolvidos na implantação.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, NOTION_DIR } from './lib/schema.mjs';
const { inventario } = loadAll();
const IMPORT_DATE = '2026-11-24';
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
const out = { pendencias: [], referencias: [], aprendizados: [], conteudos: [] };
for (const p of inventario.pendencias) out.pendencias.push({ properties: clean({
  'Pendência': `${p['Código']} · ${p['Pendência']}`, Chave: `pendencia:${p['Código']}`, Origem: p['Código'] === 'P-00' ? 'Gestão' : 'Trello',
  Tipo: p.Tipo, Status: p.Status, 'Quem responde': p['Quem responde'], Prioridade: p.Prioridade, 'Bloco do questionário': p.Bloco,
  'Código': p['Código'], 'Documento da base': p['Documento da base'], Resposta: p.Resposta,
  'date:Respondida em:start': p['Respondida em'], 'date:Respondida em:is_datetime': p['Respondida em'] ? 0 : undefined }) });
for (const r of inventario.referencias) out.referencias.push({ properties: clean({ 'Referência': r['Referência'], Chave: r.Chave, Origem: 'Trello', Tipo: r.Tipo, Status: r.Status, 'Por que é útil': r['Por que é útil'] }) });
for (const a of inventario.aprendizados) out.aprendizados.push({ properties: clean({ Aprendizado: a.Aprendizado, Chave: a.Chave, Origem: 'Gestão', Status: a.Status, 'Área': a['Área'], 'Evidência': a['Evidência'] }) });
for (const c of inventario.conteudos) {
  const semTexto = (c['Pendências'] || []).includes('pendencia:P-00');
  const ideia = c.Status === 'Ideia';
  out.conteudos.push({ pendencias: (c['Pendências'] || []).map((k) => k.replace('pendencia:', '')), properties: clean({
    'Título': c['Título'], Chave: c.Chave, Origem: 'Trello', Status: c.Status, Formato: c.Formato, Pilar: c.Pilar, Objetivo: c.Objetivo,
    Bloqueio: c.Bloqueio, 'Informação clínica pendente': c['Clínica'] ? '__YES__' : '__NO__',
    'Autorização de imagem': c['Autorização'] || (ideia ? undefined : 'Não se aplica'),
    'Já publicado? (Trello)': ideia ? undefined : 'A confirmar',
    'Validação da Larissa': c['Clínica'] || c['Autorização'] ? 'Necessária' : (ideia ? undefined : 'Não necessária'),
    'Motivo da validação': c['Autorização'] ? JSON.stringify(['Caso clínico', 'Imagem de paciente']) : c['Clínica'] ? JSON.stringify(['Afirmação clínica inédita']) : undefined,
    'Notas de origem': c['Notas de origem'],
    'Com quem está': c.Status === 'Aguardando informação' ? 'Larissa' : ideia ? undefined : 'Social media' }),
    content: `<callout icon="📦">\n\tImportado do Trello em ${IMPORT_DATE} como inventário histórico de nov/2026. Não há confirmação de que foi publicado.\n</callout>\n## Rascunho do agente\n\n## Roteiro\n${semTexto ? 'O roteiro existe no Trello, mas o texto integral ainda não foi migrado (P-00).' : 'A desenvolver.'}\n## Direção criativa\nA desenvolver.\n## Legenda\nA desenvolver.\n## Notas da equipe\n` });
}
writeFileSync(join(NOTION_DIR, 'deploy', 'import-mcp.json'), JSON.stringify(out, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
