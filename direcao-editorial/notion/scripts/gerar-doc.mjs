#!/usr/bin/env node
// Gera notion/02b-Propriedades.md a partir de schema/schema.json (não editar o .md à mão).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, effectiveProperties, optionList, NOTION_DIR } from './lib/schema.mjs';

const { schema } = loadAll();
const OWNER = { larissa: 'Larissa', social: 'Social media', gestao: 'Gestão', equipe: 'Equipe (humano)', agente: 'Agente (IA)', sistema: 'Sistema' };
const TYPE = { title: 'Título', rich_text: 'Texto', select: 'Seleção', multi_select: 'Seleção múltipla', status: 'Status', date: 'Data', number: 'Número', checkbox: 'Caixa', url: 'URL', people: 'Pessoa', files: 'Arquivos', relation: 'Relação', formula: 'Fórmula', unique_id: 'ID único', created_by: 'Criado por', created_time: 'Data de criação', last_edited_by: 'Editado por', last_edited_time: 'Data de edição' };
const esc = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const common = new Set([...Object.keys(schema.common_properties), ...Object.keys(schema.sync_properties)]);

let md = '# 02b — Propriedades de cada base\n\n> **Gerado** por `node scripts/gerar-doc.mjs` a partir de `schema/schema.json`. Não edite à mão.\n>\n> Dono = quem pode escrever no campo. O agente (IA) só escreve em campos "Agente (IA)" ou "Sistema"; mudanças em campos humanos viram uma Recomendação.\n\n';
md += '## Propriedades comuns\n\nPresentes em todas as bases (Execuções usa só ID e datas).\n\n| Propriedade | Tipo | Dono | Descrição |\n|---|---|---|---|\n';
for (const [n, p] of Object.entries(schema.common_properties)) md += `| ${n} | ${TYPE[p.type]} | ${OWNER[p.owner]} | ${esc(p.desc)} |\n`;
md += '\n## Propriedades de sincronização (técnicas, ocultas)\n\nPresentes nas bases que o agente escreve: ' + schema.databases.filter((d) => d.sync).map((d) => d.title).join(', ') + '.\n\n| Propriedade | Tipo | Descrição |\n|---|---|---|\n';
for (const [n, p] of Object.entries(schema.sync_properties)) if (!n.startsWith('$')) md += `| ${n} | ${TYPE[p.type]} | ${esc(p.desc)} |\n`;

for (const db of schema.databases) {
  md += `\n## ${db.icon} ${db.title} (prefixo ${db.prefix})\n\n${db.desc}\n\n| Propriedade | Tipo | Dono | Opções / detalhe |\n|---|---|---|---|\n`;
  for (const [n, p] of Object.entries(effectiveProperties(schema, db))) {
    if (common.has(n)) continue;
    let det = '';
    if (p.type === 'relation') det = `→ ${schema.databases.find((d) => d.key === p.target).title}${p.dual ? ` (espelho: "${p.dual}")` : ' (só ida)'}`;
    else if (p.type === 'formula') det = '`' + esc(p.expression) + '`';
    else if (optionList(schema, p).length) det = optionList(schema, p).map((o) => o[0] + (o[2] ? ` [${o[2]}]` : '')).join(' · ');
    if (p.desc) det = det ? `${det}. ${esc(p.desc)}` : esc(p.desc);
    md += `| ${n} | ${TYPE[p.type]} | ${OWNER[p.owner]} | ${det} |\n`;
  }
  if (db.body_template) md += `\nCorpo da página (modelo): ${db.body_template.map((h) => `**${h}**`).join(', ')}.\n`;
}
writeFileSync(join(NOTION_DIR, '02b-Propriedades.md'), md);
console.log('02b-Propriedades.md gerado.');

// 08 — Mapeamento da importação
const { inventario } = loadAll();
let m = '# 08 — Mapeamento da importação do inventário (Trello, nov/2026)\n\n> **Gerado** por `node scripts/gerar-doc.mjs` a partir de `import/inventario.json`. Não edite à mão.\n\n';
m += '## Regras de mapeamento\n\n| Trello / Fase 1 | Notion |\n|---|---|\n';
m += '| Situação "Bloqueado" (Fase 1) | Status **Aguardando informação** + Bloqueio + Pendências ligadas; Com quem está = Larissa |\n';
m += '| "Planejado" / "Aguardando captação" | Mesmo Status; Com quem está = Social media |\n';
m += '| Brainstorm | Status **Ideia** |\n';
m += '| Semana do Trello | Só em *Notas de origem* (histórico). **Sem** data de publicação, prazo ou relação com Semana |\n';
m += '| Já publicado? | **A confirmar** em todos os 16 (a social media confirma, item a item) |\n';
m += '| Prioridade | Vazia (não existia no Trello; o agente propõe depois) |\n';
m += '| Pilar / Objetivo | Classificação da Fase 1 (aprovada) |\n';
m += '| Referência anexada (post/reel) | Citada em *Notas de origem*; link não migrado (P-00) |\n';
m += '| Roteiro completo no Trello | Corpo da página: "texto integral não migrado (P-00)" |\n';
m += '| Caso clínico | Autorização de imagem = **Pendente**; Informação clínica pendente marcada quando aplicável |\n\n';
m += '## Conteúdos e ideias\n\n| Chave | Título | Formato | Pilar | Objetivo | Status | Pendências | Clínica | Autorização |\n|---|---|---|---|---|---|---|---|---|\n';
for (const c of inventario.conteudos) {
  m += `| ${c.Chave} | ${esc(c['Título'])} | ${c.Formato || ''} | ${c.Pilar || ''} | ${c.Objetivo || ''} | ${c.Status} | ${(c['Pendências'] || []).map((p) => p.replace('pendencia:', '')).join(', ')} | ${c['Clínica'] ? 'sim' : ''} | ${c['Autorização'] || ''} |\n`;
}
const count = (s) => inventario.conteudos.filter((c) => c.Status === s).length;
m += `\nResumo: ${count('Planejado')} planejados · ${count('Aguardando captação')} aguardando captação · ${count('Aguardando informação')} aguardando informação · ${count('Ideia')} ideias.\n`;
m += '\n## Pendências\n\n| Código | Pendência | Quem responde | Prioridade | Status | Bloco |\n|---|---|---|---|---|---|\n';
for (const p of inventario.pendencias) m += `| ${p['Código']} | ${esc(p['Pendência'])} | ${p['Quem responde']} | ${p.Prioridade} | ${p.Status} | ${p.Bloco || ''} |\n`;
m += '\n## Referências e aprendizados\n\n';
m += inventario.referencias.map((r) => `- ${r['Referência']} (${r.Tipo}, ${r.Status})`).join('\n') + '\n';
m += inventario.aprendizados.map((a) => `- ${a.Chave}: ${a.Aprendizado} (${a.Status})`).join('\n') + '\n';
writeFileSync(join(NOTION_DIR, '08-Mapeamento-importacao.md'), m);
console.log('08-Mapeamento-importacao.md gerado.');
