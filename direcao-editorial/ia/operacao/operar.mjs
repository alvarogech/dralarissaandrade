#!/usr/bin/env node
// Operação editorial nas tarefas agendadas do Claude Code (Fase 4A).
// O modelo lê e escreve no Notion pelo conector; ESTE script faz tudo o que é determinístico:
// filtra simulação, monta o contexto, valida a saída com as guardas da Fase 3, traduz as ações em
// operações exatas para o conector, confere antes e depois de escrever e monta o registro da execução.
//
//   node ia/operacao/operar.mjs inicio <direcionamento-diario|plano-semanal> [--modo producao|piloto-teste]
//   node ia/operacao/operar.mjs snapshot      → run/snapshot.json, run/indice.json
//   node ia/operacao/operar.mjs pacote        → run/pacote.json
//   node ia/operacao/operar.mjs validar       → run/validacao.json e run/plano.json (lê run/saida.json)
//   node ia/operacao/operar.mjs resolver      → completa relações com as páginas criadas (run/criados.json)
//   node ia/operacao/operar.mjs conferir-antes→ cancela operações em páginas alteradas desde a leitura
//   node ia/operacao/operar.mjs secoes        → run/secoes.json (edições exatas do corpo das páginas)
//   node ia/operacao/operar.mjs reler antes|depois → páginas a buscar com notion-fetch
//   node ia/operacao/operar.mjs conferir-depois → run/resultado.json, run/execucao.json, run/resumo.md
//
// Ver ia/operacao/RUNBOOK.md. Pasta de trabalho: ia/operacao/run/ (não versionada).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { montarPacote } from '../lib/contexto.mjs';
import { SCHEMAS, validarSchema, regras, checarAcoes } from '../lib/contratos.mjs';
import { lintSaida } from '../lib/revisao.mjs';
import { radar, semelhanca } from '../lib/radar.mjs';
import { BASES_LIDAS, dsDe, viewUrlDe, dbSchema, SCHEMA, montarSnapshot, linhasDe, lerPagina, lista, limpar, idDeUrl, meta, hashAgente } from './mapa.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUN = join(AQUI, 'run');
const P = (...x) => join(RUN, ...x);
const ler = (f, padrao) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : padrao);
const gravar = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const arg = (n, padrao) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : padrao);
const sair = (msg, cod = 1) => { console.error(msg); process.exit(cod); };
const VERSAO = 'operacao@4a.3';
const PROTEGIDOS = ['Aprovado', 'Agendado', 'Publicado', 'Analisado', 'Arquivado'];
const ABERTOS = ['Ideia', 'Planejado', 'Aguardando informação', 'Aguardando captação', 'Em produção', 'Aguardando aprovação'];
const TESTE = 'teste4a:';

// ---------- datas no fuso da clínica ----------
const hojeSP = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function semanaISO(iso) {
  // ISO 8601: semana da quinta-feira; segunda é o primeiro dia.
  const d = new Date(`${iso}T12:00:00Z`); const dia = (d.getUTCDay() + 6) % 7; const seg = somaDias(iso, -dia);
  const qui = new Date(`${somaDias(seg, 3)}T12:00:00Z`); const ano = qui.getUTCFullYear();
  const n = 1 + Math.floor((qui - new Date(Date.UTC(ano, 0, 1, 12))) / 604800000);
  return { codigo: `${ano}-W${String(n).padStart(2, '0')}`, inicio: seg, fim: somaDias(seg, 6) };
}
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const tituloDia = (iso) => `${DIAS_SEM[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${dm(iso)}`;

// ---------- consultas que o agente deve fazer no conector ----------
// Modo view (views "Agente · leitura"): não consome a cota de consultas SQL/rows do plano do Notion.
// Os filtros de data e status são aplicados no código, depois da leitura.
function consultas() {
  return Object.fromEntries(BASES_LIDAS.map((b) => [b, [{ data: { mode: 'view', view_url: viewUrlDe(b), page_size: 100 } }]]));
}

// ---------- tradução de valores para o formato do conector ----------
function propsDe(base) {
  const db = dbSchema(base);
  const p = { ...db.properties, ...SCHEMA.common_properties };
  if (db.sync) Object.assign(p, SCHEMA.sync_properties);
  for (const outra of SCHEMA.databases) for (const pr of Object.values(outra.properties))
    if (pr.type === 'relation' && pr.target === base && pr.dual && !(pr.dual in p)) p[pr.dual] = { type: 'relation', target: outra.key, dual: true, owner: pr.owner };
  return p;
}
const tituloProp = (base) => Object.entries(dbSchema(base).properties).find(([, v]) => v.type === 'title')[0];
const comoLista = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\s*[;,]\s*/)).map((x) => String(x).trim()).filter(Boolean);

function valorNotion(base, campo, valor, ctx) {
  const p = propsDe(base)[campo];
  if (!p) return { erro: `campo "${campo}" não existe em ${base}` };
  switch (p.type) {
    case 'title': case 'rich_text': case 'url': return { props: { [campo]: String(valor ?? '').slice(0, 1990) } };
    case 'select': case 'status': return { props: { [campo]: valor == null || valor === '' ? null : String(valor) } };
    case 'multi_select': return { props: { [campo]: JSON.stringify(comoLista(valor)) } };
    case 'checkbox': return { props: { [campo]: valor === true || valor === '__YES__' || /^(sim|true)$/i.test(String(valor)) ? '__YES__' : '__NO__' } };
    case 'number': return { props: { [campo]: Number(valor) } };
    case 'date': { const v = String(valor ?? '').trim(); return { props: { [`date:${campo}:start`]: v || null, [`date:${campo}:is_datetime`]: v.includes('T') ? 1 : 0 } }; }
    case 'relation': {
      const urls = []; const refs = []; const avisos = [];
      for (const k of comoLista(valor)) {
        const m = ctx.porChave[k] || ctx.porChave[k.replace(/^trello:/, 'trello:')];
        const ehDual = Boolean(p.dual) || Boolean(SCHEMA.databases.find((d) => d.key === base)?.properties?.[campo]?.dual);
        if (ctx.modo === 'piloto-teste' && ehDual && !(k.startsWith(TESTE))) { avisos.push(`relação ${campo} → ${k} omitida no teste (mão dupla alteraria a página real)`); continue; }
        const kc = ctx.criando.has(k) ? k : ctx.criando.has(TESTE + k) ? TESTE + k : null;
        if (m) urls.push(m.url); else if (kc) refs.push(kc); else avisos.push(`relação ${campo} → ${k} não encontrada`);
      }
      // Sem destino válido, não grava nada: lista vazia apagaria a relação existente.
      return { props: urls.length ? { [campo]: urls } : {}, refs: refs.length ? { [campo]: refs } : undefined, avisos };
    }
    default: return { erro: `campo "${campo}" (${p.type}) não é gravável pelo agente` };
  }
}

// ---------- corpo das páginas (Markdown do Notion) ----------
const li = (xs, f) => ((xs || []).length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- Nada para hoje.');
const tit = (ctx, k) => ctx.tituloDe[k] || k;
function secoesDia(s, ctx) {
  const so = s.social, la = s.larissa;
  return {
    'Direcionamento do agente': [
      `**Intenção do dia:** ${so.intencao}`, '',
      '**Prioridades de produção**', so.prioridades.map((p) => `${p.ordem}. **${p.titulo}**: ${p.o_que_fazer}`).join('\n') || '- Nenhuma.', '',
      '**Publicar hoje**', li(so.publicar, (p) => `${tit(ctx, p.chave)}${p.quando ? ` (${p.quando})` : ''}${p.observacao ? `: ${p.observacao}` : ''}`), '',
      '**Produzir**', li(so.produzir, (p) => `${tit(ctx, p.chave)}: ${p.o_que_fazer}`), '',
      '**Para a Larissa**', li(la.registrar, (r) => `Registrar: ${r.o_que}. ${r.por_que}`),
      li(la.perguntas, (p) => `${p.codigo}: ${p.pergunta}`),
      ...(s.rotina_informada ? [] : ['', '_Rotina de hoje ainda não informada. Nada foi presumido sobre o dia da Larissa._']),
    ].join('\n'),
    'Stories sugeridos': li(la.stories, (st) => `**${st.titulo}** (${st.objetivo}). Abre: ${st.abertura} Meio: ${st.meio} Fecha: ${st.fechamento}`),
    'Captação do dia': [
      '**Pedir à Larissa**', li(so.pedir_larissa, (p) => `${p.pedido} (${p.duracao}). ${p.como}`), '',
      '**Se der para gravar**', li(la.gravar, (g) => `${g.pedido} · ${g.duracao} · ${g.onde}. ${g.como}`), '',
      '**Oportunidades do dia**', li(la.oportunidades, (o) => `${o.acontecimento}: ${o.ideia} (nível ${o.nivel}; cuidado: ${o.cuidado})`),
    ].join('\n'),
    Avisos: [li(so.acompanhar, (x) => x), li(s.alertas, (x) => x)].join('\n'),
  };
}
function secaoSemana(s, ctx) {
  return { 'Plano preliminar do agente': [
    `**Intenção:** ${s.intencao}`, `**Objetivos:** ${s.objetivos.join(', ')}`, '',
    '**Narrativas**', li(s.narrativas, (n) => `**${n.titulo}**. Fato real: ${n.fato_real}`), '',
    '**Feed**', li(s.feed, (f) => `${f.dia}: **${tit(ctx, f.chave) || f.titulo}** · ${f.formato} · ${f.origem} · com ${f.com_quem}${f.bloqueado_por.length ? ` · travado por ${f.bloqueado_por.join(', ')}` : ''}. ${f.justificativa}`), '',
    '**Stories**', li(s.stories, (x) => `**${x.dia}:** ${x.direcao} (${x.intencao})`), '',
    '**Captação**', li(s.captacao, (k) => `${k.pedido} · ${k.quem_capta} · ${k.quando} · ${k.duracao}. ${k.como_gravar}`), '',
    '**Reaproveitar**', li(s.reaproveitamento, (r) => `${tit(ctx, r.chave)}: ${r.como}`), '',
    '**Impedimentos**', li(s.impedimentos, (i) => `${i.descricao} (${i.pendencia || 'sem código'}; destrava: ${i.quem_destrava})`), '',
    '**Ordem de produção**', li(s.prioridades_producao, (p) => `${p.ordem}. ${tit(ctx, p.chave)}: ${p.o_que_fazer}`), '',
    li(s.alertas, (x) => x), '', '_Plano preliminar gerado pelo agente. A equipe aprova ou ajusta em "Status do plano"._',
  ].join('\n') };
}
const corpoDe = (secoes) => Object.entries(secoes).map(([h, md]) => `## ${h}\n\n${md}`).join('\n\n');

// ---------- comandos ----------
const cmd = process.argv[2];
const estado = () => ler(P('estado.json')) || sair('Rode "inicio" primeiro.');

if (cmd === 'inicio') {
  const workflow = process.argv[3];
  if (!['direcionamento-diario', 'plano-semanal'].includes(workflow)) sair('Workflow: direcionamento-diario ou plano-semanal');
  const modo = arg('modo', 'producao');
  if (!['producao', 'piloto-teste'].includes(modo)) sair('Modo: producao ou piloto-teste');
  const hoje = arg('hoje', hojeSP());
  const sem = semanaISO(workflow === 'plano-semanal' && new Date(`${hoje}T12:00:00Z`).getUTCDay() === 0 ? somaDias(hoje, 1) : hoje);
  const rodada = arg('rodada', null);
  const idem = `${workflow}:${workflow === 'plano-semanal' ? sem.codigo : hoje}:${modo}${rodada ? `:${rodada}` : ''}`;
  // Cada execução começa do zero: nada de uma execução anterior na mesma sessão pode contaminar esta.
  rmSync(RUN, { recursive: true, force: true });
  mkdirSync(P('bruto'), { recursive: true });
  const e = { workflow, modo, hoje, semana: sem, idempotencia: idem, inicio: new Date().toISOString(), versao: VERSAO };
  gravar(P('estado.json'), e);
  gravar(P('consultas.json'), consultas());
  console.log(JSON.stringify({ ...e, proximo: 'Para cada base de run/consultas.json, rode notion-query-data-sources com o "data" indicado e salve a resposta COMPLETA em run/bruto/<base>.json. Se vier has_more, repita com start_cursor = next_cursor e salve um array com todas as respostas.' }, null, 2));
}

else if (cmd === 'snapshot') {
  const e = estado();
  const bruto = {};
  const faltam = [];
  for (const b of BASES_LIDAS) { const f = P('bruto', `${b}.json`); if (!existsSync(f)) { faltam.push(b); continue; } bruto[b] = linhasDe(f); }
  if (faltam.length) sair(`Faltam respostas do Notion: ${faltam.join(', ')}`);
  // Remove linhas repetidas (consultas que se sobrepõem) e confere o formato.
  for (const b of Object.keys(bruto)) {
    const vistos = new Set(); bruto[b] = bruto[b].filter((r) => { const id = idDeUrl(r.url); if (!id || vistos.has(id)) return false; vistos.add(id); return true; });
    const semChave = bruto[b].filter((r) => !limpar(r.Chave || '')).length;
    if (semChave) console.warn(`aviso: ${semChave} registro(s) sem Chave em ${b}; ficam fora das escritas do agente.`);
  }
  const { snapshot, indice } = montarSnapshot(bruto, { modo: e.modo });
  // Produção: nenhum registro de simulação fica no snapshot (contexto, deduplicação e alvos de escrita).
  if (e.modo === 'producao') for (const [k, v] of Object.entries(snapshot)) if (Array.isArray(v)) snapshot[k] = v.filter((x) => x.origem !== 'Simulação');
  if (e.modo === 'producao') for (const [id, m] of Object.entries(indice)) if (m.origem === 'Simulação') delete indice[id];
  // Filtros que antes iam na consulta: só o que importa para a janela editorial.
  const corte = (n) => somaDias(e.hoje, -n);
  snapshot.conteudos = snapshot.conteudos.filter((c) => c.status !== 'Arquivado' && (!['Publicado', 'Analisado'].includes(c.status) || (c.publicado_em && c.publicado_em >= corte(90))));
  snapshot.dias = snapshot.dias.filter((d) => d.data && d.data >= corte(7));
  snapshot.semanas = snapshot.semanas.filter((w) => !w.fim || w.fim >= corte(21));
  // Uma execução por dia (ou semana). No teste, a chave inclui a rodada (--rodada), para poder repetir de propósito.
  const ja = snapshot.execucoes.find((x) => x.idempotencia === e.idempotencia && ['Sucesso', 'Sucesso parcial'].includes(x.status));
  gravar(P('snapshot.json'), snapshot); gravar(P('indice.json'), indice);
  const sim = Object.values(indice).filter((m) => m.origem === 'Simulação').length;
  console.log(JSON.stringify({ registros: Object.keys(indice).length, simulacao_lida: sim, ja_executado: Boolean(ja) }, null, 2));
  if (ja) { console.log('JA_EXECUTADO: esta execução já foi concluída antes. Registre "Ignorada (duplicada)" e pare.'); process.exit(3); }
}

else if (cmd === 'pacote') {
  const e = estado();
  const snap = ler(P('snapshot.json'));
  const semanaChave = `semana:${e.semana.codigo}`;
  const semanaReal = snap.semanas.find((w) => w.chave === semanaChave || (e.modo === 'piloto-teste' && w.chave === `${TESTE}${semanaChave}`));
  const s2 = structuredClone(snap);
  if (!semanaReal) s2.semanas.push({ chave: semanaChave, inicio: e.semana.inicio, fim: e.semana.fim, capacidade: 'Normal', restricoes: '', intencao: '', origem: 'Agente' });
  // Produção: o filtro de lib/contexto.mjs derruba a execução se sobrar qualquer registro de simulação.
  const pacote = montarPacote(e.workflow, s2, { hoje: e.hoje, ambiente: 'producao', semana: semanaReal?.chave || semanaChave });
  const diaChave = (e.modo === 'piloto-teste' ? TESTE : '') + `dia:${e.hoje}`;
  const diaReal = snap.dias.find((d) => d.chave === diaChave);
  const semanaAlvo = semanaReal?.chave || (e.modo === 'piloto-teste' ? TESTE : '') + semanaChave;
  pacote.alvos = { semana: semanaAlvo, semana_existe: Boolean(semanaReal), dia: diaChave, dia_existe: Boolean(diaReal), amanha: `dia:${somaDias(e.hoje, 1)}` };
  // Coerência com o plano semanal: o diário recebe o que a semana já planejou.
  pacote.plano_da_semana = snap.conteudos.filter((c) => c.semana && c.semana === semanaAlvo).map((c) => ({ chave: c.chave, titulo: c.titulo, status: c.status, prioridade: c.prioridade, publicacao_prevista: c.publicacao_prevista }));
  gravar(P('pacote.json'), pacote);
  const vazou = JSON.stringify(pacote).match(/"sim:[^"]+"/g);
  if (vazou) sair(`Simulação no pacote: ${vazou.join(', ')}`);
  console.log(JSON.stringify({ workflow: e.workflow, hoje: e.hoje, tokens_aprox: Math.round(JSON.stringify(pacote).length / 4), dia: pacote.dia, alvos: pacote.alvos, conteudos_abertos: pacote.conteudos_abertos.length }, null, 2));
}

else if (cmd === 'validar') {
  const e = estado();
  const saida = ler(P('saida.json')) || sair('Falta run/saida.json');
  const pacote = ler(P('pacote.json')); const snap = ler(P('snapshot.json')); const indice = ler(P('indice.json'));
  const porChave = Object.fromEntries(Object.values(indice).filter((m) => m.chave).map((m) => [m.chave, m]));
  const tituloDe = Object.fromEntries([...snap.conteudos.map((c) => [c.chave, c.titulo])]);
  const travadas = Object.values(indice).filter((m) => m.travado).map((m) => m.chave);
  const editadas = Object.values(indice).filter((m) => m.editado_pela_equipe).map((m) => m.chave);
  const preservadosAntes = [];
  // Plano semanal: o que o plano diz vira ação, de forma determinística, se o modelo não incluiu.
  const brutas = [...(saida.acoes || [])];
  if (e.workflow === 'plano-semanal') {
    saida.feed.forEach((f, i) => {
      if (!f.chave || !porChave[f.chave] || f.origem === 'nova' || brutas.some((a) => a.chave === f.chave && a.tipo === 'priorizar')) return;
      brutas.push({ nivel: 'A', tipo: 'priorizar', base: 'conteudos', chave: f.chave, campos: [{ campo: 'Semana', valor: pacote.alvos.semana }, { campo: 'Prioridade', valor: i < 2 ? 'Alta' : 'Média' }], quem_decide: null, motivo: `Feed da semana (${f.dia}).`, fontes: [f.chave, pacote.alvos.semana] });
    });
    saida.captacao.forEach((k, i) => {
      if (brutas.some((a) => a.tipo === 'criar_captacao' && semelhanca((a.campos.find((c) => c.campo === 'Pedido') || {}).valor || '', k.pedido) > 0.5)) return;
      const cs = (k.conteudos || []).filter((c) => porChave[c]);
      brutas.push({ nivel: 'A', tipo: 'criar_captacao', base: 'captacao', chave: `agente:plano-semanal:${e.semana.codigo}:cap${i + 1}`, campos: [
        { campo: 'Pedido', valor: k.pedido }, { campo: 'Tipo', valor: k.tipo }, { campo: 'Quem capta', valor: k.quem_capta }, { campo: 'Como gravar', valor: `${k.como_gravar} (${k.duracao})` },
        { campo: 'Onde', valor: k.onde }, ...(k.quando ? [{ campo: 'Quando', valor: k.quando }] : []), { campo: 'Requer autorização de paciente', valor: k.requer_autorizacao ? 'sim' : 'não' },
        ...(cs.length ? [{ campo: 'Conteúdos', valor: cs.join(', ') }] : [])], quem_decide: null, motivo: 'Captação do plano semanal.', fontes: [pacote.alvos.semana] });
    });
  }
  // Página travada: a ação é descartada (nem sugestão). Página com alteração humana em campo do agente: vira recomendação.
  let acoes = brutas.filter((a) => {
    if (a.tipo.startsWith('criar_') || a.tipo === 'recomendar' || !travadas.includes(a.chave)) return true;
    preservadosAntes.push({ chave: a.chave, motivo: 'página travada pela equipe: ação descartada' }); return false;
  }).map((a) => {
    if (a.nivel === 'A' && editadas.includes(a.chave) && !a.tipo.startsWith('criar_') && a.tipo !== 'recomendar') {
      preservadosAntes.push({ chave: a.chave, motivo: 'alterado pela equipe: mudança virou recomendação' });
      return { ...a, nivel: 'B', quem_decide: a.quem_decide || 'Social media', motivo: `${a.motivo} (a equipe alterou este registro depois da última escrita do agente)` };
    }
    return a;
  });
  saida.acoes = acoes;
  const erros = [
    ...validarSchema(saida, SCHEMAS[e.workflow]).map((x) => `schema: ${x}`),
    ...regras(e.workflow, saida, pacote).map((x) => `regra: ${x}`),
    ...checarAcoes(acoes, { travadas, editadas }).map((x) => `notion: ${x}`),
    ...lintSaida(saida, (p) => (/stories|caixinha|registrar|pedir|acompanhar/.test(p) ? 'informal' : 'clinico')).achados.filter((a) => a.gravidade === 'erro').map((a) => `revisão: ${a.regra} em ${a.path}: "${a.trecho}"`),
  ];
  // Regras da Fase 4A (o que o agente não pode fazer sozinho no Notion real).
  const criacoes = acoes.filter((a) => a.tipo.startsWith('criar_') || a.tipo === 'recomendar');
  acoes.forEach((a, i) => {
    const onde = `acoes[${i}] ${a.tipo} ${a.chave}`;
    const alvo = porChave[a.chave];
    if (a.base === 'prioridades' && a.tipo !== 'recomendar') erros.push(`${onde}: prioridades comerciais só por recomendação`);
    if (a.base === 'conteudos' && alvo && PROTEGIDOS.includes(alvo.status) && a.nivel === 'A' && !a.tipo.startsWith('criar_'))
      erros.push(`${onde}: conteúdo "${alvo.status}" é protegido; proponha como recomendação (B)`);
    if (['priorizar', 'mover_data', 'marcar_validacao', 'atualizar_rascunho'].includes(a.tipo) && !alvo) erros.push(`${onde}: registro não existe no Notion`);
    if (a.tipo === 'criar_conteudo') {
      const st = (a.campos.find((c) => c.campo === 'Status') || {}).valor;
      if (st && st !== 'Ideia') erros.push(`${onde}: conteúdo novo entra como Ideia`);
      const cand = { chave: a.chave, titulo: (a.campos.find((c) => c.campo === 'Título') || {}).valor || '', argumento: (a.campos.find((c) => c.campo === 'Argumento central') || {}).valor || '',
        tema: comoLista((a.campos.find((c) => c.campo === 'Tema') || {}).valor), formato: (a.campos.find((c) => c.campo === 'Formato') || {}).valor, status: 'Ideia' };
      const r = radar(cand, snap.conteudos.filter((c) => [...ABERTOS, ...PROTEGIDOS].includes(c.status)), e.hoje);
      if (r.veredito === 'repeticao_excessiva') erros.push(`${onde}: repete conteúdo existente (${r.excessivos.slice(0, 2).map((x) => x.chave).join(', ')}); reaproveite o existente`);
      const igual = snap.conteudos.find((c) => ABERTOS.includes(c.status) && semelhanca(c.titulo, cand.titulo) > 0.6);
      if (igual) erros.push(`${onde}: já existe "${igual.titulo}" (${igual.chave}) aberto; use-o em vez de criar`);
    }
    if (a.tipo === 'criar_aprendizado' && (a.campos.find((c) => c.campo === 'Status') || {}).valor && (a.campos.find((c) => c.campo === 'Status') || {}).valor !== 'Hipótese')
      erros.push(`${onde}: aprendizado novo entra só como Hipótese`);
  });
  const novosConteudos = acoes.filter((a) => a.tipo === 'criar_conteudo').length;
  if (novosConteudos > (e.workflow === 'plano-semanal' ? 2 : 1)) erros.push(`criar_conteudo: no máximo ${e.workflow === 'plano-semanal' ? 2 : 1} por execução (veio ${novosConteudos})`);

  // Sondas do piloto: tentativas propositais de mexer em conteúdo travado e agendado precisam ser barradas.
  const sondas = [];
  if (e.modo === 'piloto-teste') {
    for (const k of [`${TESTE}conteudo:travado`, `${TESTE}conteudo:agendado`, `${TESTE}conteudo:editado`]) {
      const m = porChave[k];
      if (!m) { sondas.push({ chave: k, ok: false, motivo: 'registro de teste não encontrado no Notion' }); continue; }
      const tentativa = k.endsWith(':editado')
        ? { nivel: 'A', tipo: 'priorizar', base: 'conteudos', chave: k, campos: [{ campo: 'Prioridade', valor: 'Baixa' }], quem_decide: null, motivo: 'sonda', fontes: ['sonda'] }
        : { nivel: 'A', tipo: 'atualizar_rascunho', base: 'conteudos', chave: k, campos: [{ campo: 'corpo:Roteiro', valor: 'x' }, { campo: 'Gancho', valor: 'x' }], quem_decide: null, motivo: 'sonda', fontes: ['sonda'] };
      const bloq = [...checarAcoes([tentativa], { travadas, editadas }), ...(PROTEGIDOS.includes(m.status) ? ['status protegido'] : [])];
      sondas.push({ chave: k, ok: bloq.length > 0, barrado_por: bloq });
    }
    if (sondas.some((x) => !x.ok)) erros.push(`sondas de preservação falharam: ${JSON.stringify(sondas)}`);
  }
  gravar(P('validacao.json'), { ok: !erros.length, erros, sondas });
  if (erros.length) { console.log(JSON.stringify({ ok: false, erros }, null, 2)); process.exit(1); }

  // ---------- plano de escrita ----------
  const agora = new Date().toISOString();
  const origem = e.modo === 'piloto-teste' ? 'Simulação' : 'Agente';
  const prefixo = e.modo === 'piloto-teste' ? '[TESTE 4A] ' : '';
  const chaveTeste = (k) => (e.modo === 'piloto-teste' && !k.startsWith(TESTE) ? TESTE + k : k);
  const criando = new Set();
  const ops = []; const avisos = []; const simulados = []; const preservados = [...preservadosAntes]; const duplicados = [];
  const titulosPorBase = { conteudos: snap.conteudos.map((c) => c.titulo), historias: snap.historias.map((h) => h.titulo), captacao: snap.captacao.filter((c) => c.status !== 'Cancelado').map((c) => c.pedido),
    pendencias: snap.pendencias.filter((x) => ['Aberta', 'Parcial'].includes(x.status)).map((x) => x.pendencia), recomendacoes: snap.recomendacoes.filter((r) => !r.decisao || r.decisao === 'Aguardando decisão').map((r) => r.titulo) };
  const ctx = () => ({ porChave, criando, modo: e.modo, tituloDe });
  const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
  const sync = (base) => (dbSchema(base).sync ? { 'date:Última escrita do agente:start': agora, 'date:Última escrita do agente:is_datetime': 1, 'Sincronização': 'OK' } : {});
  function montarProps(base, campos) {
    const props = {}; const refs = {};
    for (const { campo, valor } of campos) {
      if (campo.startsWith('corpo:')) continue;
      const r = valorNotion(base, campo, valor, ctx());
      if (r.erro) { avisos.push(r.erro); continue; }
      Object.assign(props, r.props); if (r.refs) Object.assign(refs, r.refs); avisos.push(...(r.avisos || []));
    }
    return { props, refs };
  }
  function criar(base, chave, campos, conteudo, extra = {}) {
    const k = chaveTeste(chave);
    if (porChave[k]) { avisos.push(`${k} já existe; criação ignorada (idempotência)`); return null; }
    criando.add(k);
    const { props, refs } = montarProps(base, campos);
    const tp = tituloProp(base);
    if (props[tp] && prefixo && !props[tp].startsWith(prefixo)) props[tp] = prefixo + props[tp];
    Object.assign(props, { Chave: k, Origem: origem, ...sync(base), ...extra });
    if (dbSchema(base).sync) props['Hash do agente'] = hashAgente(props);
    // Duplicidade: já existe registro aberto com título quase igual nesta base.
    const tp2 = tituloProp(base); const novo = String(props[tp2] || '').replace(prefixo, '');
    const parecido = (titulosPorBase[base] || []).find((t) => semelhanca(t, novo) > 0.6);
    if (parecido && base !== 'dias' && base !== 'semanas') { criando.delete(k); avisos.push(`duplicidade evitada em ${base}: "${novo}" parece "${parecido}"`); duplicados.push({ base, titulo: novo, parecido }); return null; }
    const op = { op: 'criar', base, data_source_id: dsDe(base), chave: k, properties: props, refs, content: conteudo || undefined };
    ops.push(op); return op;
  }
  function atualizar(base, chave, campos, secoes) {
    const m = porChave[chave];
    if (!m) { avisos.push(`${chave} não encontrado; atualização ignorada`); return; }
    if (e.modo === 'piloto-teste' && !chave.startsWith(TESTE)) { simulados.push({ base, chave, campos: campos.map((c) => c.campo), secoes: Object.keys(secoes || {}) }); return; }
    const { props, refs } = montarProps(base, campos);
    Object.assign(props, sync(base));
    // Mais de uma ação na mesma página vira uma única atualização (o hash cobre todos os campos escritos).
    const ja = ops.find((o) => o.op === 'atualizar' && o.chave === chave);
    if (ja) { delete ja.properties['Hash do agente']; Object.assign(ja.properties, props); for (const [c, ks] of Object.entries(refs)) (ja.refs ||= {})[c] = [...((ja.refs || {})[c] || []), ...ks]; if (dbSchema(base).sync) ja.properties['Hash do agente'] = hashAgente(ja.properties); }
    else { if (dbSchema(base).sync) props['Hash do agente'] = hashAgente(props); ops.push({ op: 'atualizar', base, chave, page_id: m.id, url: m.url, atualizado_em_lido: m.atualizado_em, properties: props, refs }); }
    for (const [secao, md] of Object.entries(secoes || {})) ops.push({ op: 'secao', base, chave, page_id: m.id, url: m.url, atualizado_em_lido: m.atualizado_em, secao, markdown: md });
  }

  // Semana e Dia de referência (criados pelo agente quando ainda não existem).
  const al = pacote.alvos;
  if (e.workflow === 'plano-semanal' && !al.semana_existe)
    criar('semanas', al.semana, [{ campo: 'Semana', valor: `${e.semana.codigo} · ${dm(e.semana.inicio)} a ${dm(e.semana.fim)}` }, { campo: 'Período', valor: e.semana.inicio }], null,
      { 'date:Período:end': e.semana.fim });
  if (e.workflow === 'direcionamento-diario' && !al.dia_existe)
    criar('dias', al.dia, [{ campo: 'Dia', valor: tituloDia(e.hoje) }, { campo: 'Data', valor: e.hoje }, ...(porChave[al.semana] ? [{ campo: 'Semana', valor: al.semana }] : [])], null);
  if (e.workflow === 'direcionamento-diario' && e.modo === 'producao' && !porChave[al.amanha])
    criar('dias', al.amanha, [{ campo: 'Dia', valor: tituloDia(somaDias(e.hoje, 1)) }, { campo: 'Data', valor: somaDias(e.hoje, 1) }, { campo: 'Direcionamento', valor: 'Aguardando rotina' }, ...(porChave[al.semana] ? [{ campo: 'Semana', valor: al.semana }] : [])],
      '## Direcionamento do agente\n\n_Aguardando a rotina da Larissa. Preencha "Minha rotina" e "Disponibilidade para gravar" até as 6h._\n\n## Stories sugeridos\n\n## Captação do dia\n\n## Avisos');

  // Criações primeiro, para que relações dentro da mesma execução se resolvam.
  for (const a of acoes) if (a.tipo.startsWith('criar_') && !(a.nivel === 'B' || (a.nivel === 'C' && a.tipo !== 'criar_pendencia'))) criando.add(chaveTeste(a.chave));
  const ordem = (a) => (a.tipo.startsWith('criar_') || a.tipo === 'recomendar' ? 0 : 1);
  for (const a of [...acoes].sort((x, y) => ordem(x) - ordem(y))) {
    // Nível B ou C que não seja sinalização vira Recomendação: o agente propõe, a equipe decide.
    const vira_rec = a.tipo !== 'recomendar' && (a.nivel === 'B' || (a.nivel === 'C' && !['marcar_validacao', 'criar_pendencia'].includes(a.tipo)));
    if (vira_rec) {
      preservados.push({ chave: a.chave, motivo: `nível ${a.nivel}: virou recomendação` });
      criar('recomendacoes', `agente:${e.workflow}:${e.hoje}:rec:${hash(a)}`, [
        { campo: 'Recomendação', valor: `${a.tipo.replace('_', ' ')}: ${tit(ctx(), a.chave)}` }, { campo: 'Tipo', valor: a.tipo === 'mover_data' ? 'Mudança de data' : a.tipo === 'criar_conteudo' ? 'Novo conteúdo' : 'Revisão de roteiro' },
        { campo: 'Nível', valor: a.nivel === 'C' ? 'C · Validação humana' : 'B · Precisa de aprovação' }, { campo: 'Quem decide', valor: a.quem_decide || 'Social media' },
        { campo: 'Proposta', valor: a.campos.map((c) => `${c.campo}: ${typeof c.valor === 'string' ? c.valor : JSON.stringify(c.valor)}`).join(' | ') }, { campo: 'Por quê', valor: a.motivo },
        { campo: 'Fontes consultadas', valor: a.fontes.join(', ') },
        ...(e.workflow === 'direcionamento-diario' && (porChave[al.dia] || criando.has(al.dia)) ? [{ campo: 'Dia', valor: al.dia }] : []),
        ...(e.workflow === 'plano-semanal' && (porChave[al.semana] || criando.has(al.semana)) ? [{ campo: 'Semana', valor: al.semana }] : [])]);
      continue;
    }
    if (a.tipo === 'recomendar') {
      const temNivel = a.campos.some((c) => c.campo === 'Nível');
      criar('recomendacoes', a.chave, [...a.campos.filter((c) => c.campo !== 'Decisão'), ...(temNivel ? [] : [{ campo: 'Nível', valor: a.nivel === 'C' ? 'C · Validação humana' : 'B · Precisa de aprovação' }]),
        { campo: 'Fontes consultadas', valor: a.fontes.join(', ') }, ...(e.workflow === 'direcionamento-diario' && (porChave[al.dia] || criando.has(al.dia)) ? [{ campo: 'Dia', valor: al.dia }] : []),
        ...(e.workflow === 'plano-semanal' && (porChave[al.semana] || criando.has(al.semana)) ? [{ campo: 'Semana', valor: al.semana }] : [])]);
      continue;
    }
    if (a.tipo.startsWith('criar_')) {
      const base = a.base;
      const padrao = { criar_conteudo: [['Status', 'Ideia'], ['Com quem está', 'Social media']], criar_captacao: [['Status', 'A solicitar']], criar_historia: [['Status', 'Nova']], criar_aprendizado: [['Status', 'Hipótese'], ['Fonte do aprendizado', 'Escolha humana']], criar_pendencia: [['Status', 'Aberta']] }[a.tipo] || [];
      const campos = [...a.campos.filter((c) => !(a.tipo === 'criar_conteudo' && c.campo === 'Status')), ...padrao.filter(([c]) => !a.campos.some((x) => x.campo === c)).map(([campo, valor]) => ({ campo, valor }))];
      const rasc = a.campos.find((c) => c.campo === 'corpo:Rascunho do agente');
      const conteudo = base === 'conteudos' ? `## Rascunho do agente\n\n${rasc?.valor || ''}\n\n## Roteiro\n\n## Direção criativa\n\n## Legenda\n\n## Notas da equipe` : `${a.motivo}\n\nFontes: ${a.fontes.join(', ')}`;
      criar(base, a.chave, campos, conteudo);
      continue;
    }
    if (a.tipo === 'atualizar_dia') {
      const campos = a.campos.filter((c) => !['Minha rotina', 'Disponibilidade para gravar'].includes(c.campo));
      if (!campos.some((c) => c.campo === 'Direcionamento')) campos.push({ campo: 'Direcionamento', valor: 'Gerado pelo agente' });
      const sec = secoesDia(saida, ctx());
      if (porChave[al.dia]) atualizar('dias', al.dia, campos, sec);
      else { const op = ops.find((o) => o.op === 'criar' && o.chave === chaveTeste(al.dia)); if (op) { const mp = montarProps('dias', campos); Object.assign(op.properties, mp.props); op.refs = { ...(op.refs || {}), ...mp.refs }; op.properties['Hash do agente'] = hashAgente(op.properties); op.content = corpoDe(sec); } }
      continue;
    }
    if (a.tipo === 'atualizar_semana') {
      const campos = a.campos.filter((c) => ['Intenção editorial', 'Narrativas', 'Revisão de sexta'].includes(c.campo));
      // Intenção e narrativas sempre vêm do próprio plano (determinístico), mesmo que a ação não as traga.
      if (!campos.some((c) => c.campo === 'Intenção editorial')) campos.push({ campo: 'Intenção editorial', valor: saida.intencao });
      if (!campos.some((c) => c.campo === 'Narrativas' && c.valor)) campos.push({ campo: 'Narrativas', valor: saida.narrativas.map((n, i) => `${i + 1}) ${n.titulo}`).join(' ') });
      const sec = secaoSemana(saida, ctx());
      if (porChave[al.semana]) atualizar('semanas', al.semana, campos, sec);
      else { const op = ops.find((o) => o.op === 'criar' && o.chave === chaveTeste(al.semana)); if (op) { Object.assign(op.properties, montarProps('semanas', campos).props); op.properties['Hash do agente'] = hashAgente(op.properties); op.content = corpoDe(sec); } }
      continue;
    }
    // priorizar, mover_data, marcar_validacao, atualizar_rascunho
    const rasc = a.campos.find((c) => c.campo === 'corpo:Rascunho do agente');
    atualizar(a.base, a.chave, a.campos.filter((c) => !c.campo.startsWith('corpo:')), rasc ? { 'Rascunho do agente': String(rasc.valor) } : {});
  }
  // O plano semanal sem ação explícita na Semana ainda grava o plano no corpo da Semana.
  if (e.workflow === 'plano-semanal' && !acoes.some((a) => a.tipo === 'atualizar_semana')) {
    const narr = saida.narrativas.map((n, i) => `${i + 1}) ${n.titulo}`).join(' ');
    if (porChave[al.semana]) atualizar('semanas', al.semana, [{ campo: 'Intenção editorial', valor: saida.intencao }, { campo: 'Narrativas', valor: narr }], secaoSemana(saida, ctx()));
    else { const op = ops.find((o) => o.op === 'criar' && o.chave === chaveTeste(al.semana)); if (op) { op.properties['Intenção editorial'] = saida.intencao; op.properties.Narrativas = narr; op.properties['Hash do agente'] = hashAgente(op.properties); op.content = corpoDe(secaoSemana(saida, ctx())); } }
  }
  if (e.workflow === 'direcionamento-diario' && !acoes.some((a) => a.tipo === 'atualizar_dia')) avisos.push('saída sem atualizar_dia: o Dia não recebeu direcionamento');
  ops.forEach((o, i) => { o.id = `op${String(i + 1).padStart(2, '0')}`; if (o.refs && !Object.keys(o.refs).length) delete o.refs; });
  gravar(P('plano.json'), { gerado_em: agora, modo: e.modo, ops, simulados, preservados, avisos, duplicados });
  console.log(JSON.stringify({ ok: true, criar: ops.filter((o) => o.op === 'criar').length, atualizar: ops.filter((o) => o.op === 'atualizar').length, secoes: ops.filter((o) => o.op === 'secao').length,
    simulados: simulados.length, viraram_recomendacao: preservados.length, avisos }, null, 2));
}

else if (cmd === 'resolver') {
  const plano = ler(P('plano.json')); const criados = ler(P('criados.json'), {});
  const faltam = []; const extras = [];
  for (const o of plano.ops.filter((x) => x.op === 'criar')) if (criados[o.chave]) { o.url = criados[o.chave]; o.page_id = idDeUrl(o.url); }
  for (const o of plano.ops) {
    if (!o.refs) continue;
    const rel = {};
    for (const [campo, ks] of Object.entries(o.refs)) {
      const urls = ks.map((k) => criados[k] || (faltam.push(`${o.id}.${campo} → ${k}`), null)).filter(Boolean);
      if (urls.length) rel[campo] = [...(o.properties[campo] || []), ...urls];
    }
    delete o.refs;
    if (!Object.keys(rel).length) continue;
    // Página já criada sem a relação: completa com uma atualização. Atualização ainda não feita: entra na mesma chamada.
    if (o.op === 'criar') extras.push({ op: 'atualizar', base: o.base, chave: o.chave, page_id: o.page_id, url: o.url, properties: rel, id: `${o.id}r` });
    else Object.assign(o.properties, rel);
  }
  plano.ops.push(...extras);
  gravar(P('plano.json'), plano);
  console.log(JSON.stringify({ criados: Object.keys(criados).length, sem_url: plano.ops.filter((o) => o.op === 'criar' && !o.url).map((o) => o.chave), relacoes_completadas: extras.map((x) => x.id), relacoes_pendentes: faltam }, null, 2));
}

else if (cmd === 'conferir-antes') {
  // Releitura: notion-fetch de cada página que será alterada, salvo em run/paginas/<page_id>-antes.txt.
  const plano = ler(P('plano.json'));
  const canceladas = []; const faltam = [];
  for (const o of plano.ops.filter((x) => ['atualizar', 'secao'].includes(x.op) && x.atualizado_em_lido)) {
    const f = P('paginas', `${o.page_id}-antes.txt`);
    if (!existsSync(f)) { faltam.push(o.page_id); continue; }
    const agora = meta(o.base, lerPagina(f));
    if (agora.travado) { o.cancelada = 'página foi travada para o agente'; canceladas.push(o.id); continue; }
    if (agora.atualizado_em !== o.atualizado_em_lido) { o.cancelada = `página alterada desde a leitura (${o.atualizado_em_lido} → ${agora.atualizado_em})`; canceladas.push(o.id); }
  }
  // Releitura faltando é falha de processo, não alteração humana: para aqui sem cancelar nada.
  if (faltam.length) sair(`FALTA_RELEITURA: busque com notion-fetch e salve antes de continuar: ${[...new Set(faltam)].map((id) => `run/paginas/${id}-antes.txt`).join(', ')}`);
  gravar(P('plano.json'), plano);
  const executar = plano.ops.filter((o) => ['atualizar', 'secao'].includes(o.op) && !o.cancelada).map((o) => o.id);
  console.log(JSON.stringify({ executar, canceladas }, null, 2));
}

else if (cmd === 'secoes') {
  const plano = ler(P('plano.json'));
  const edicoes = []; const problemas = [];
  const porPagina = {};
  for (const o of plano.ops.filter((x) => x.op === 'secao' && !x.cancelada)) (porPagina[o.page_id] ||= []).push(o);
  for (const [pid, lista_] of Object.entries(porPagina)) {
    const f = P('paginas', `${pid}-antes.txt`);
    if (!existsSync(f)) { problemas.push(`falta a releitura da página ${pid} (run/paginas/${pid}-antes.txt)`); continue; }
    const corpo = lerPagina(f).__corpo;
    const updates = []; const inserts = [];
    for (const o of lista_) {
      const linhas = corpo.split('\n');
      const ini = linhas.findIndex((l) => l.trim() === `## ${o.secao}`);
      if (ini < 0) { inserts.push(`## ${o.secao}\n\n${o.markdown}`); continue; }
      let fim = linhas.findIndex((l, i) => i > ini && /^## /.test(l));
      const proximo = fim > 0 ? linhas[fim] : null;
      const old_str = linhas.slice(ini, fim > 0 ? fim + 1 : linhas.length).join('\n');
      const new_str = `## ${o.secao}\n\n${o.markdown}${proximo ? `\n\n${proximo}` : ''}`;
      if (old_str.trim() === new_str.trim()) continue;
      updates.push({ old_str, new_str }); o.markdown_antes = linhas.slice(ini + 1, fim > 0 ? fim : linhas.length).join('\n').trim();
    }
    if (updates.length) edicoes.push({ page_id: pid, command: 'update_content', content_updates: updates });
    if (inserts.length) edicoes.push({ page_id: pid, command: 'insert_content', content: inserts.join('\n\n') });
  }
  gravar(P('secoes.json'), edicoes); gravar(P('plano.json'), plano);
  console.log(JSON.stringify({ chamadas: edicoes.length, problemas }, null, 2));
  if (problemas.length) process.exit(1);
}

else if (cmd === 'conferir-depois') {
  const e = estado(); const plano = ler(P('plano.json')); const indice = ler(P('indice.json'));
  // Releitura depois da escrita: notion-fetch de cada página criada ou alterada em run/paginas/<page_id>-depois.txt.
  const pos = {}; const posPorChave = {};
  for (const f of existsSync(P('paginas')) ? readdirSync(P('paginas')).filter((x) => x.endsWith('-depois.txt')) : []) {
    const r = lerPagina(P('paginas', f)); const id = f.replace('-depois.txt', ''); pos[id] = r; const c = limpar(r.Chave || ''); if (c) posPorChave[c] = r;
  }
  // O Notion devolve **negrito** como <b>negrito</b> e escapa : [ ] \; compara só letras e números.
  const norm = (v) => String(limpar(String(v ?? '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/\*\*/g, ''))).normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const falhas = []; const ok = [];
  for (const o of plano.ops) {
    if (o.cancelada) continue;
    const r = o.op === 'criar' ? posPorChave[o.chave] : pos[o.page_id];
    if (o.op === 'secao') {
      if (!pos[o.page_id]) { falhas.push(`${o.id}: página não relida depois da escrita`); continue; }
      const corpo = pos[o.page_id].__corpo;
      const trechos = o.markdown.split('\n').map((l) => norm(l.replace(/^[-*\d.\s]+/, ''))).filter((l) => l.length > 12).slice(0, 3);
      if (trechos.every((t) => norm(corpo).includes(t))) ok.push(o.id); else falhas.push(`${o.id}: seção "${o.secao}" não ficou como planejado`);
      // As seções da equipe precisam continuar iguais.
      const antes = existsSync(P('paginas', `${o.page_id}-antes.txt`)) ? lerPagina(P('paginas', `${o.page_id}-antes.txt`)).__corpo : '';
      for (const sec of ['Roteiro', 'Direção criativa', 'Legenda', 'Notas da equipe']) {
        const pega = (t) => (t.split(/\n(?=## )/).find((b) => b.startsWith(`## ${sec}`)) || '');
        if (pega(antes) && norm(pega(antes)) !== norm(pega(corpo))) falhas.push(`${o.id}: seção da equipe "${sec}" mudou`);
      }
      continue;
    }
    if (!r) { falhas.push(`${o.id}: ${o.chave} não encontrado depois da escrita`); continue; }
    const dif = [];
    for (const [campo, v] of Object.entries(o.properties)) {
      if (/^date:.*:is_datetime$|Hash do agente|Última escrita|Sincronização/.test(campo)) continue;
      const atual = r[campo];
      if (Array.isArray(v)) { const a = lista(atual).map(idDeUrl).sort().join(); const b = v.map(idDeUrl).sort().join(); if (a !== b && v.length) dif.push(campo); continue; }
      if (campo.startsWith('date:')) { if (String(atual || '').slice(0, 10) !== String(v || '').slice(0, 10)) dif.push(campo); continue; }
      if (typeof v === 'string' && v.startsWith('[')) { if (JSON.stringify(lista(atual).sort()) !== JSON.stringify(lista(v).sort())) dif.push(campo); continue; }
      if (norm(atual) !== norm(v)) dif.push(campo);
    }
    if (dif.length) falhas.push(`${o.id}: ${o.chave} com campos diferentes do planejado: ${dif.join(', ')}`); else ok.push(o.id);
  }
  // Piloto: os conteúdos de teste protegidos não podem ter mudado.
  const preservacao = [];
  for (const k of e.modo === 'piloto-teste' ? [`${TESTE}conteudo:travado`, `${TESTE}conteudo:agendado`, `${TESTE}conteudo:editado`] : []) {
    const antes = Object.values(indice).find((m) => m.chave === k); const depois = posPorChave[k];
    preservacao.push({ chave: k, intacto: Boolean(antes && depois && depois['Atualizado em'] === antes.atualizado_em), antes: antes?.atualizado_em, depois: depois?.['Atualizado em'] || 'não relido' });
  }
  if (preservacao.some((p) => !p.intacto)) falhas.push(`preservação: ${JSON.stringify(preservacao)}`);
  const canceladas = plano.ops.filter((o) => o.cancelada);
  // Cancelada por alteração humana ou trava = preservação (esperado). Qualquer outro motivo = falha de processo.
  for (const o of canceladas) if (!/alterada desde a leitura|travada/.test(o.cancelada)) falhas.push(`${o.id}: cancelada por falha de processo (${o.cancelada})`);
  const naoFeitas = plano.ops.filter((o) => ['atualizar', 'secao'].includes(o.op) && !o.cancelada && !ok.includes(o.id));
  const status = falhas.length ? (ok.length ? 'Sucesso parcial' : 'Erro') : naoFeitas.length ? 'Sucesso parcial' : 'Sucesso';
  const fim = new Date().toISOString();
  const resultado = { status, ok, falhas, canceladas: canceladas.map((o) => ({ id: o.id, chave: o.chave, motivo: o.cancelada })), simulados: plano.simulados, preservados: plano.preservados, preservacao, avisos: plano.avisos };
  gravar(P('resultado.json'), resultado);
  const criadas = plano.ops.filter((o) => o.op === 'criar' && !o.cancelada);
  const resumo = [
    `**Status:** ${status}`, `**Modo:** ${e.modo} · **Data:** ${e.hoje} · **Versão:** ${VERSAO}`, '',
    `**Criados (${criadas.length}):**`, ...criadas.map((o) => `- ${o.base}: ${o.properties[tituloProp(o.base)] || o.chave}`), '',
    `**Atualizados:** ${plano.ops.filter((o) => o.op !== 'criar' && !o.cancelada).length} operações`,
    `**Preservados (viraram recomendação ou foram cancelados):** ${plano.preservados.length + canceladas.length}`,
    ...canceladas.map((o) => `- ${o.chave}: ${o.cancelada}`), ...plano.preservados.map((p) => `- ${p.chave}: ${p.motivo}`),
    ...(plano.simulados.length ? ['', `**Só simulados (teste não escreve em registro real):** ${plano.simulados.length}`, ...plano.simulados.map((s) => `- ${s.chave}: ${[...s.campos, ...s.secoes].join(', ')}`)] : []),
    ...(preservacao.length ? ['', '**Preservação de alterações humanas (teste):**', ...preservacao.map((p) => `- ${p.chave}: ${p.intacto ? 'intacto' : 'ALTERADO'}`)] : []),
    ...(falhas.length ? ['', '**Falhas:**', ...falhas.map((f) => `- ${f}`)] : []),
    ...((plano.duplicados || []).length ? ['', `**Duplicidades evitadas:** ${plano.duplicados.length}`, ...plano.duplicados.map((d) => `- ${d.base}: "${d.titulo}" ≈ "${d.parecido}"`)] : []),
    ...(plano.avisos.length ? ['', '**Avisos:**', ...plano.avisos.map((a) => `- ${a}`)] : []),
  ].join('\n');
  gravar(P('resumo.md'), resumo);
  const prefixo = e.modo === 'piloto-teste' ? '[TESTE 4A] ' : '';
  gravar(P('execucao.json'), { parent: { data_source_id: dsDe('execucoes') }, pages: [{ properties: {
    'Execução': `${prefixo}${e.workflow} ${e.workflow === 'plano-semanal' ? e.semana.codigo : e.hoje}`, Workflow: e.workflow === 'plano-semanal' ? 'planejamento-semanal' : 'direcionamento-diario',
    Status: status, 'Chave de idempotência': e.idempotencia, Tentativa: 1, 'date:Início:start': e.inicio, 'date:Início:is_datetime': 1, 'date:Fim:start': fim, 'date:Fim:is_datetime': 1,
    Modelo: arg('modelo', 'claude-opus-5-5'), 'Versão do prompt': `mestra@1.0.0 + ${VERSAO}`, 'Itens criados': criadas.length, 'Itens preservados': plano.preservados.length + canceladas.length + plano.simulados.length,
    Erro: falhas.join(' | ').slice(0, 1900) }, content: resumo }] });
  console.log(resumo);
  process.exitCode = status === 'Erro' ? 1 : 0;
}

else if (cmd === 'reler') {
  // Lista as páginas que o agente precisa buscar com notion-fetch: "antes" (alvos de atualização) ou "depois" (tudo o que foi escrito).
  const quando = process.argv[3]; const e = estado(); const plano = ler(P('plano.json')); const indice = ler(P('indice.json')); const criados = ler(P('criados.json'), {});
  const ids = new Set();
  if (quando === 'antes') for (const o of plano.ops) { if (['atualizar', 'secao'].includes(o.op) && o.atualizado_em_lido) ids.add(o.page_id); }
  else if (quando === 'depois') {
    for (const o of plano.ops) { if (o.cancelada) continue; const id = o.page_id || (criados[o.chave] && idDeUrl(criados[o.chave])); if (id) ids.add(id); }
    if (e.modo === 'piloto-teste') for (const m of Object.values(indice)) if ([`${TESTE}conteudo:travado`, `${TESTE}conteudo:agendado`, `${TESTE}conteudo:editado`].includes(m.chave)) ids.add(m.id);
  } else sair('Use: reler antes | reler depois');
  console.log(JSON.stringify([...ids].map((id) => ({ page_id: id, salvar_em: `ia/operacao/run/paginas/${id}-${quando}.txt` })), null, 2));
}

else sair('Comando desconhecido. Veja o cabeçalho de ia/operacao/operar.mjs.');
