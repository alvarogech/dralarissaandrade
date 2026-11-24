// Gera ia/exemplos/*.md: as saídas dos cenários como a equipe vai ler (sem JSON).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT = join(AQUI, '..', 'exemplos');
mkdirSync(OUT, { recursive: true });
const { cenarios } = JSON.parse(readFileSync(join(AQUI, 'cenarios.json'), 'utf8'));
const s = (id) => JSON.parse(readFileSync(join(AQUI, 'saidas', `${id}.json`), 'utf8')).saida;
const lista = (xs, f) => (xs || []).length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- (nada)';
const rot = (c) => (c.patch?.dias?.[0] ? `> **Rotina contada pela Larissa (teste):** ${c.patch.dias[0].rotina.replace('(teste) ', '')}  \n> **Disponibilidade:** ${c.patch.dias[0].disponibilidade}\n\n` : '> **Rotina:** não informada.\n\n');
const acoes = (a) => lista(a, (x) => `**${x.nivel}** · ${x.tipo} em ${x.base} (${x.chave})${x.quem_decide ? ` · decide: ${x.quem_decide}` : ''}. ${x.motivo}`);
const AVISO = '> Exemplos de TESTE: rotinas e eventos fictícios, escritos para avaliar a inteligência editorial. Nada aqui foi publicado ou gravado no Notion de produção.\n\n';

function diario(c, o) {
  return `## ${c.nome} · ${o.dia}\n\n${rot(c)}### Para a social media\n**Intenção do dia:** ${o.social.intencao}\n\n**Prioridades**\n${lista(o.social.prioridades, (p) => `**${p.titulo}**: ${p.o_que_fazer}`)}\n\n**Produzir**\n${lista(o.social.produzir, (p) => p.o_que_fazer)}\n\n**Pedir à Larissa**\n${lista(o.social.pedir_larissa, (p) => `${p.pedido} (${p.duracao}). ${p.como}`)}\n\n**Acompanhar**\n${lista(o.social.acompanhar, (x) => x)}\n\n### Para a Larissa\n**Vale registrar hoje**\n${lista(o.larissa.registrar, (r) => `${r.o_que}. _${r.por_que}_`)}\n\n**Se der para gravar**\n${lista(o.larissa.gravar, (g) => `${g.pedido} · ${g.duracao} · ${g.onde}. ${g.como}`)}\n\n**Stories sugeridos**\n${lista(o.larissa.stories, (st) => `**${st.titulo}** (${st.objetivo}). Abre: ${st.abertura} Meio: ${st.meio} Fecha: ${st.fechamento}`)}\n\n**Perguntas para você**\n${lista(o.larissa.perguntas, (p) => `${p.codigo}: ${p.pergunta}`)}\n\n**Oportunidades do dia**\n${lista(o.larissa.oportunidades, (op) => `${op.acontecimento} → ${op.ideia} (nível ${op.nivel}; cuidado: ${op.cuidado})`)}\n\n<details><summary>O que o sistema gravaria no Notion</summary>\n\n${acoes(o.acoes)}\n\nAlertas: ${(o.alertas || []).join(' ') || 'nenhum'}\n</details>\n`;
}
function plano(c, o) {
  const sem = c.patch?.semanas_set?.['sim:semana:2026-W49'];
  return `## ${c.nome} · semana de 30/11 a 06/12\n\n> **Capacidade:** ${sem?.capacidade || 'Normal'}${sem?.restricoes ? `  \n> **Restrições:** ${sem.restricoes.replace('(teste) ', '')}` : ''}\n\n**Intenção:** ${o.intencao}\n\n**Narrativas**\n${lista(o.narrativas, (n) => `**${n.titulo}**. Fato real: ${n.fato_real}`)}\n\n**Feed (${o.feed.length})**\n\n| Dia | Conteúdo | Formato | Origem | Com quem | Travas |\n|---|---|---|---|---|---|\n${o.feed.map((f) => `| ${f.dia} | ${f.titulo} | ${f.formato} | ${f.origem} | ${f.com_quem} | ${f.bloqueado_por.join(', ') || '—'} |`).join('\n')}\n\n**Stories**\n${lista(o.stories, (st) => `**${st.dia}:** ${st.direcao} _(${st.intencao})_`)}\n\n**Captação**\n${lista(o.captacao, (k) => `${k.pedido} · ${k.quem_capta} · ${k.quando} · ${k.duracao}. ${k.como_gravar}`)}\n\n**Reaproveitar**\n${lista(o.reaproveitamento, (r) => r.como)}\n\n**Impedimentos**\n${lista(o.impedimentos, (i) => `${i.descricao} (${i.pendencia}, destrava: ${i.quem_destrava})`)}\n\n<details><summary>O que o sistema gravaria no Notion</summary>\n\n${acoes(o.acoes)}\n\nAlertas: ${(o.alertas || []).join(' ') || 'nenhum'}\n</details>\n`;
}
function roteiro(c, o) {
  return `## ${c.nome} · ${o.chave} (${o.formato}, nível ${o.nivel})\n\n**Ganchos**\n${lista(o.ganchos, (g) => `"${g.texto}" _(${g.tecnica})_`)}\n\n| Parte | Fala | Visual |\n|---|---|---|\n${o.roteiro.map((r) => `| ${r.parte} | ${r.fala} | ${r.visual} |`).join('\n')}\n\n**Legenda:** ${o.legenda}\n\n**CTA:** ${o.cta}\n\n**Variações**\n${lista(o.variacoes, (v) => `${v.abordagem}: ${v.resumo}`)}\n\n**Direção criativa:** ${o.direcao_criativa}\n\n**Para validar**\n${lista(o.pontos_de_validacao, (p) => `${p.trecho}${p.pendencia ? ` (${p.pendencia})` : ''}`)}\n\n<details><summary>O que o sistema gravaria no Notion</summary>\n\n${acoes(o.acoes)}\n</details>\n`;
}
function replan(c, o) {
  return `## ${c.nome}\n\n> **O que mudou:** ${o.gatilho}\n\n**Ajustes propostos**\n${lista(o.ajustes, (a) => `${a.descricao} · de "${a.de}" para "${a.para}" · nível ${a.nivel}${a.quem_decide ? `, decide ${a.quem_decide}` : ''}. _${a.motivo}_`)}\n\n**Alertas**\n${lista(o.alertas, (x) => x)}\n\n<details><summary>O que o sistema gravaria no Notion</summary>\n\n${acoes(o.acoes)}\n</details>\n`;
}
const R = { 'direcionamento-diario': diario, 'plano-semanal': plano, roteiro, replanejamento: replan };
const grupos = {
  'direcionamentos-diarios.md': ['Direcionamentos diários', ['01', '02', '04', '11', '12']],
  'planos-semanais.md': ['Planos semanais', ['03', '05', '07']],
  'roteiros.md': ['Roteiros', ['06', '08']],
  'replanejamentos.md': ['Replanejamentos', ['09', '10']],
};
for (const [arq, [titulo, ids]] of Object.entries(grupos)) {
  const md = cenarios.filter((c) => ids.some((i) => c.id.startsWith(i))).map((c) => R[c.workflow](c, s(c.id))).join('\n---\n\n');
  writeFileSync(join(OUT, arq), `# ${titulo} · exemplos para avaliação\n\n${AVISO}Ao ler, marque na rubrica de [RESULTADOS.md](../avaliacao/RESULTADOS.md) o que soa como a Larissa e o que não soa.\n\n${md}`);
}
console.log(`exemplos gravados em ia/exemplos/ (${Object.keys(grupos).length} arquivos)`);
