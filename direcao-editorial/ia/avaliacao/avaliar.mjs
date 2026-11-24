#!/usr/bin/env node
// Suíte de avaliação da inteligência editorial.
//
//   node avaliacao/avaliar.mjs            → offline: valida as saídas gravadas em avaliacao/saidas/
//   node avaliacao/avaliar.mjs --api      → gera as saídas pela Claude API (custa dinheiro; exige
//                                           credencial Anthropic e `npm i @anthropic-ai/sdk`) e valida
//   node avaliacao/avaliar.mjs --so 01    → só os cenários cujo id começa com "01"
//
// Cada saída passa por: schema → regras de negócio → ações x Notion/autonomia → revisão mecânica →
// expectativas do cenário. A rubrica editorial vai para o relatório, para avaliação humana.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarPacote } from '../lib/contexto.mjs';
import { SCHEMAS, validarSchema, regras, checarAcoes } from '../lib/contratos.mjs';
import { lintSaida } from '../lib/revisao.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const IA = join(AQUI, '..');
const API = process.argv.includes('--api');
const SO = process.argv.includes('--so') ? process.argv[process.argv.indexOf('--so') + 1] : null;
const base = JSON.parse(readFileSync(join(AQUI, 'base-teste.json'), 'utf8'));
const { cenarios } = JSON.parse(readFileSync(join(AQUI, 'cenarios.json'), 'utf8'));
const EFFORT = { 'plano-semanal': 'high', 'direcionamento-diario': 'medium', roteiro: 'medium', replanejamento: 'medium', revisao: 'low', pesquisa: 'low', 'analise-desempenho': 'high', aprendizado: 'medium', estrategia: 'high' };
const MODULO = { 'plano-semanal': 'planejamento-semanal', 'direcionamento-diario': 'direcionamento-diario', roteiro: 'roteiro', replanejamento: 'replanejamento', revisao: 'revisao', pesquisa: 'pesquisa', 'analise-desempenho': 'analise-desempenho', aprendizado: 'aprendizado', estrategia: 'estrategia' };

export function aplicarPatch(snap, patch = {}) {
  const s = structuredClone(snap);
  for (const [k, v] of Object.entries(patch)) {
    if (k.endsWith('_set')) {
      const col = k.replace('_set', '');
      for (const [chave, campos] of Object.entries(v)) Object.assign(s[col].find((x) => x.chave === chave), campos);
    } else s[k] = [...(s[k] || []), ...v];
  }
  return s;
}

const pegar = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function checarExpectativa(e, saida, pacote) {
  const txt = JSON.stringify(saida);
  switch (e.tipo) {
    case 'igual': return pegar(saida, e.caminho) === e.valor || `${e.caminho} = ${JSON.stringify(pegar(saida, e.caminho))}, esperado ${JSON.stringify(e.valor)}`;
    case 'max': return (pegar(saida, e.caminho) || []).length <= e.n || `${e.caminho} tem ${(pegar(saida, e.caminho) || []).length}, máximo ${e.n}`;
    case 'vazio': return !(pegar(saida, e.caminho) || []).length || `${e.caminho} deveria estar vazio`;
    case 'nao_vazio': return (pegar(saida, e.caminho) || []).length > 0 || `${e.caminho} deveria ter itens`;
    case 'texto_contem': return new RegExp(e.padrao, 'i').test(txt) || `não menciona /${e.padrao}/`;
    case 'texto_nao_contem': return !new RegExp(e.padrao, 'i').test(txt) || `menciona /${e.padrao}/`;
    case 'max_feed_novo': return saida.feed.filter((f) => f.origem === 'nova').length <= e.n || 'feeds novos acima do limite';
    case 'nenhum_feed_novo_bloqueado': return !saida.feed.some((f) => f.origem === 'nova' && f.bloqueado_por.length) || 'feed novo bloqueado';
    case 'feed_bloqueado_se_presente': { const ruins = saida.feed.filter((f) => e.chaves.includes(f.chave) && !f.bloqueado_por.length); return !ruins.length || `caso sem autorização no feed sem bloqueio: ${ruins.map((f) => f.chave)}`; }
    case 'radar_alvo': return pacote.radar_alvo?.veredito === e.valor || `radar = ${pacote.radar_alvo?.veredito}, esperado ${e.valor}`;
    case 'ajuste_nivel': { const a = (saida.ajustes || []).find((x) => x.chave === e.chave); return !a || a.nivel === e.nivel || `ajuste em ${e.chave} com nível ${a.nivel}, esperado ${e.nivel}`; }
    case 'sem_acao_em': return ![...(saida.acoes || []), ...(saida.ajustes || [])].some((a) => a.chave === e.chave && a.nivel === 'A') || `há ação nível A em ${e.chave}`;
    case 'acao': return (saida.acoes || []).some((a) => a.tipo === e.tipo_acao && a.nivel === e.nivel) || `nenhuma ação ${e.tipo_acao} nível ${e.nivel}`;
    case 'acao_nivel_quem': return (saida.acoes || []).some((a) => a.nivel === e.nivel && a.quem_decide === e.quem) || `nenhuma ação ${e.nivel} para ${e.quem}`;
    default: return `expectativa desconhecida ${e.tipo}`;
  }
}

async function gerarPelaApi(cen, pacote) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const mestra = readFileSync(join(IA, 'prompts', '00-instrucao-mestra.md'), 'utf8');
  const kbDir = join(IA, '..', 'base-de-conhecimento');
  const kb = readdirSync(kbDir).filter((f) => f.endsWith('.md')).sort().map((f) => `### ${f}\n${readFileSync(join(kbDir, f), 'utf8')}`).join('\n\n');
  const modulo = readFileSync(join(IA, 'prompts', 'workflows', `${MODULO[cen.workflow]}.md`), 'utf8');
  const resp = await client.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system: [{ type: 'text', text: `${mestra}\n\n# Base de conhecimento\n\n${kb}`, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `${modulo}\n\n# Pacote de contexto\n\`\`\`json\n${JSON.stringify(pacote)}\n\`\`\`` }],
    output_config: { effort: EFFORT[cen.workflow], format: { type: 'json_schema', schema: SCHEMAS[cen.workflow] } },
  });
  if (resp.stop_reason === 'refusal') throw new Error(`recusa: ${resp.stop_details?.category}`);
  const texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { saida: JSON.parse(texto), uso: resp.usage };
}

async function main() {
  const linhas = [];
  let ok = 0, total = 0;
  const dirSaidas = join(AQUI, API ? 'saidas-api' : 'saidas');
  if (API) mkdirSync(dirSaidas, { recursive: true });
  for (const cen of cenarios) {
    if (SO && !cen.id.startsWith(SO)) continue;
    total++;
    const snap = aplicarPatch(base, cen.patch);
    const pacote = montarPacote(cen.workflow === 'plano-semanal' ? 'plano-semanal' : cen.workflow, snap, { hoje: cen.hoje, ambiente: 'teste', alvo: cen.alvo, gatilho: cen.gatilho });
    const tokensPacote = Math.round(JSON.stringify(pacote).length / 4);
    const arq = join(dirSaidas, `${cen.id}.json`);
    let saida, uso;
    if (API) { ({ saida, uso } = await gerarPelaApi(cen, pacote)); writeFileSync(arq, JSON.stringify({ gerado_por: 'claude-opus-5-5 via API', saida, uso }, null, 2)); }
    else if (existsSync(arq)) saida = JSON.parse(readFileSync(arq, 'utf8')).saida;
    if (!saida) { linhas.push({ id: cen.id, nome: cen.nome, status: 'SEM SAÍDA', erros: ['arquivo ausente'], tokensPacote }); continue; }
    const erros = [
      ...validarSchema(saida, SCHEMAS[cen.workflow]).map((x) => `schema: ${x}`),
      ...regras(cen.workflow, saida, pacote).map((x) => `regra: ${x}`),
      ...checarAcoes(saida.acoes, { travadas: (snap.conteudos || []).filter((c) => c.travado).map((c) => c.chave), editadas: (snap.conteudos || []).filter((c) => c.editado_pela_equipe).map((c) => c.chave) }).map((x) => `notion: ${x}`),
      ...lintSaida(saida, (p) => (/stories|caixinha|registrar|pedir|acompanhar/.test(p) ? 'informal' : 'clinico')).achados.filter((a) => a.gravidade === 'erro').map((a) => `revisão: ${a.regra} em ${a.path}: "${a.trecho}"`),
      ...cen.expectativas.map((e) => checarExpectativa(e, saida, pacote)).filter((r) => r !== true).map((x) => `expectativa: ${x}`),
    ];
    const avisos = lintSaida(saida).achados.filter((a) => a.gravidade === 'aviso').map((a) => `${a.regra}: "${a.trecho}"`);
    if (!erros.length) ok++;
    linhas.push({ id: cen.id, nome: cen.nome, status: erros.length ? 'FALHOU' : 'OK', erros, avisos, tokensPacote, rubrica: cen.rubrica, uso });
  }
  for (const l of linhas) {
    console.log(`${l.status === 'OK' ? '✓' : '✗'} ${l.id} ${l.nome} · pacote ~${l.tokensPacote} tokens`);
    for (const e of l.erros) console.log(`    ${e}`);
  }
  console.log(`\n${ok}/${total} cenários aprovados nas checagens automáticas.`);
  let md = `# Resultados da avaliação (${API ? 'API' : 'offline, saídas gravadas'})\n\nGerado por \`node avaliacao/avaliar.mjs\`. ${ok}/${total} aprovados nas checagens automáticas.\nA **rubrica editorial** abaixo é para a Larissa e a social media marcarem.\n\n`;
  for (const l of linhas) {
    md += `## ${l.status === 'OK' ? '✅' : '❌'} ${l.id} · ${l.nome}\nPacote: ~${l.tokensPacote} tokens.\n\n`;
    if (l.erros.length) md += l.erros.map((e) => `- ${e}`).join('\n') + '\n\n';
    if (l.avisos?.length) md += `Avisos de estilo: ${l.avisos.join('; ')}\n\n`;
    md += (l.rubrica || []).map((r) => `- [ ] ${r}`).join('\n') + '\n\n';
  }
  writeFileSync(join(AQUI, API ? 'RESULTADOS-API.md' : 'RESULTADOS.md'), md);
  process.exitCode = ok === total ? 0 : 1;
}
if ((process.argv[1] || '').split(/[\\/]/).pop() === 'avaliar.mjs') main().catch((e) => { console.error(e.message); process.exitCode = 1; });
