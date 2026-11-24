#!/usr/bin/env node
// Lê a exportação JSON integral do Trello (Menu do quadro › Imprimir, exportar e compartilhar › Exportar como JSON)
// e gera um PLANO de migração para revisão humana. Não escreve nada no Notion.
//
//   node scripts/trello-plano.mjs caminho/para/quadro.json
//
// Saída: deploy/trello-plano.json e deploy/trello-plano.md
// Para cada cartão: casa com um Conteúdo já importado (pelo título normalizado ou pela Chave trello:C-xx),
// e lista o que será preservado: descrição (roteiro), checklists, comentários, anexos e link do cartão.
// Regras: nunca cria duplicata; cartão sem par vai para "novos" (revisão); ambíguo vai para "revisar".
// O Trello continua sendo a fonte histórica até a gestão confirmar a migração.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, NOTION_DIR } from './lib/schema.mjs';

export const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(reels|carrossel|carousel|post)\s*[:\-–]\s*/i, '').replace(/["“”'’]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
export function similaridade(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function planejar(board, conteudos) {
  const listas = Object.fromEntries((board.lists || []).map((l) => [l.id, l.name]));
  const checklists = {}; for (const c of board.checklists || []) (checklists[c.idCard] ||= []).push(c);
  const comentarios = {};
  for (const a of board.actions || []) if (a.type === 'commentCard' && a.data?.card?.id) (comentarios[a.data.card.id] ||= []).push({ data: a.date, texto: a.data.text });
  const plano = { casados: [], revisar: [], novos: [], ignorados: [] };
  for (const card of board.cards || []) {
    if (card.closed) { plano.ignorados.push({ id: card.id, nome: card.name, motivo: 'arquivado no Trello' }); continue; }
    const item = {
      id_cartao: card.id, nome: card.name, lista: listas[card.idList] || '', link: card.shortUrl || card.url || '',
      descricao: card.desc || '', checklists: (checklists[card.id] || []).map((c) => ({ nome: c.name, itens: (c.checkItems || []).map((i) => ({ texto: i.name, feito: i.state === 'complete' })) })),
      comentarios: comentarios[card.id] || [], anexos: (card.attachments || []).map((a) => ({ nome: a.name, url: a.url, tipo: a.mimeType || '' })),
    };
    const ranked = conteudos.map((c) => ({ chave: c.Chave, titulo: c['Título'], s: similaridade(card.name, c['Título']) })).sort((x, y) => y.s - x.s);
    const [top, second] = ranked;
    if (top && top.s >= 0.8 && (!second || second.s < 0.8)) plano.casados.push({ ...item, chave: top.chave, titulo_notion: top.titulo, confianca: Number(top.s.toFixed(2)) });
    else if (top && top.s >= 0.5) plano.revisar.push({ ...item, candidatos: ranked.slice(0, 3).filter((r) => r.s >= 0.5) });
    else plano.novos.push(item);
  }
  return plano;
}

function main() {
  const arquivo = process.argv[2];
  if (!arquivo) { console.error('Uso: node scripts/trello-plano.mjs caminho/para/quadro.json'); process.exitCode = 1; return; }
  const board = JSON.parse(readFileSync(arquivo, 'utf8'));
  const { inventario } = loadAll();
  const plano = planejar(board, inventario.conteudos);
  mkdirSync(join(NOTION_DIR, 'deploy'), { recursive: true });
  writeFileSync(join(NOTION_DIR, 'deploy', 'trello-plano.json'), JSON.stringify(plano, null, 2));
  const linha = (i) => `| ${i.nome.replace(/\|/g, '/')} | ${i.lista} | ${i.chave || (i.candidatos || []).map((c) => c.chave).join(', ') || '—'} | ${i.descricao ? 'sim' : ''} | ${i.checklists.length} | ${i.comentarios.length} | ${i.anexos.length} |`;
  let md = `# Plano de migração do Trello (gerado, revisar antes de aplicar)\n\nCasados: ${plano.casados.length} · Revisar: ${plano.revisar.length} · Novos: ${plano.novos.length} · Ignorados: ${plano.ignorados.length}\n\n`;
  for (const [t, arr] of [['Casados com conteúdo existente', plano.casados], ['Revisar (correspondência incerta)', plano.revisar], ['Novos (sem correspondência)', plano.novos]]) {
    md += `## ${t}\n\n| Cartão | Lista | Chave | Descrição | Checklists | Comentários | Anexos |\n|---|---|---|---|---|---|---|\n${arr.map(linha).join('\n')}\n\n`;
  }
  writeFileSync(join(NOTION_DIR, 'deploy', 'trello-plano.md'), md);
  console.log(`Casados ${plano.casados.length} · Revisar ${plano.revisar.length} · Novos ${plano.novos.length} · Ignorados ${plano.ignorados.length}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('trello-plano.mjs')) main();
