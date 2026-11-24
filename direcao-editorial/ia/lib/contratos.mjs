// Contratos de saída da inteligência editorial (Fase 3).
// - SCHEMAS: JSON Schema compatível com structured outputs da Claude API (tipos, enum, required,
//   additionalProperties:false). Contagens e regras de negócio ficam em `regras()`, pois o schema
//   da API não garante limites de quantidade.
// - checarAcoes(): confere cada ação contra o schema implantado no Notion (dono do campo) e contra
//   a política de autonomia (notion/schema/autonomia.json).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTION = join(IA_DIR, '..', 'notion', 'schema');
const SCHEMA_NOTION = JSON.parse(readFileSync(join(NOTION, 'schema.json'), 'utf8'));

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const nstr = { type: ['string', 'null'] };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items) => ({ type: 'array', items });
const en = (...v) => ({ type: 'string', enum: v });

export const NIVEL = en('A', 'B', 'C');
export const BASES = ['conteudos', 'semanas', 'dias', 'captacao', 'pendencias', 'referencias', 'aprendizados', 'prioridades', 'recomendacoes', 'historias'];
export const TIPOS_ACAO = ['criar_conteudo', 'atualizar_rascunho', 'priorizar', 'mover_data', 'criar_captacao', 'criar_pendencia',
  'marcar_validacao', 'atualizar_dia', 'atualizar_semana', 'criar_historia', 'criar_aprendizado', 'criar_referencia', 'recomendar'];
const PILAR = en('Autoridade', 'Desejo e prova social', 'Conexão');
const OBJETIVO = en('Descoberta', 'Engajamento', 'Educação', 'Construção de confiança', 'Quebra de objeção', 'Geração de desejo', 'Conversão', 'Fidelização');
const FORMATO = en('Reels', 'Carrossel', 'Sequência de stories', 'Foto', 'A definir');
const QUEM = en('Larissa', 'Social media', 'Gestão');

export const ACAO = obj({
  nivel: NIVEL,
  tipo: en(...TIPOS_ACAO),
  base: en(...BASES),
  chave: { ...str, description: 'Chave estável do alvo (ex.: trello:C-04) ou nova chave agente:<workflow>:<data>:<n>' },
  campos: arr(obj({ campo: str, valor: str })),
  quem_decide: { type: ['string', 'null'], enum: ['Larissa', 'Social media', 'Gestão', null] },
  motivo: str,
  fontes: strs,
});
const CAPTACAO = obj({ pedido: str, tipo: en('Vídeo falado', 'Take espontâneo', 'Imagem de apoio', 'Foto', 'Antes e depois', 'Áudio'),
  quem_capta: en('Larissa sozinha', 'Social media', 'Juntas'), quando: str, duracao: str, onde: str, como_gravar: str, conteudos: strs, requer_autorizacao: { type: 'boolean' } });

export const SCHEMAS = {
  'plano-semanal': obj({
    semana: str, intencao: str, objetivos: arr(OBJETIVO),
    narrativas: arr(obj({ titulo: str, fato_real: str, fontes: strs })),
    feed: arr(obj({ origem: en('reaproveitar', 'concluir', 'nova'), chave: nstr, titulo: str, pilar: PILAR, objetivo: OBJETIVO, formato: FORMATO,
      dia: str, com_quem: QUEM, bloqueado_por: strs, nivel: NIVEL, justificativa: str })),
    stories: arr(obj({ dia: str, direcao: str, intencao: str })),
    captacao: arr(CAPTACAO),
    reaproveitamento: arr(obj({ chave: str, como: str })),
    impedimentos: arr(obj({ descricao: str, pendencia: nstr, quem_destrava: QUEM })),
    prioridades_producao: arr(obj({ ordem: { type: 'integer' }, chave: str, o_que_fazer: str })),
    acoes: arr(ACAO), alertas: strs,
  }),
  'direcionamento-diario': obj({
    dia: str, rotina_informada: { type: 'boolean' },
    social: obj({ intencao: str,
      prioridades: arr(obj({ ordem: { type: 'integer' }, chave: str, titulo: str, o_que_fazer: str })),
      publicar: arr(obj({ chave: str, titulo: str })), produzir: arr(obj({ chave: str, o_que_fazer: str })),
      pedir_larissa: arr(obj({ pedido: str, duracao: str, como: str })), acompanhar: strs }),
    larissa: obj({ registrar: arr(obj({ o_que: str, por_que: str })),
      gravar: arr(obj({ pedido: str, duracao: str, onde: str, como: str })),
      stories: arr(obj({ titulo: str, abertura: str, meio: str, fechamento: str, objetivo: OBJETIVO })),
      perguntas: arr(obj({ codigo: str, pergunta: str })),
      oportunidades: arr(obj({ acontecimento: str, ideia: str, nivel: NIVEL, cuidado: str })) }),
    acoes: arr(ACAO), alertas: strs,
  }),
  roteiro: obj({ chave: str, formato: FORMATO, nivel: NIVEL,
    ganchos: arr(obj({ texto: str, tecnica: str })), roteiro: arr(obj({ parte: str, fala: str, visual: str })),
    legenda: str, cta: nstr, variacoes: arr(obj({ abordagem: str, resumo: str })), direcao_criativa: str,
    pontos_de_validacao: arr(obj({ trecho: str, pendencia: nstr })), acoes: arr(ACAO) }),
  revisao: obj({ aprovado: { type: 'boolean' }, requer_validacao: { type: 'boolean' },
    criterios: arr(obj({ criterio: en('posicionamento', 'naturalidade', 'originalidade', 'clareza', 'interesse', 'relevancia', 'viabilidade', 'seguranca_clinica', 'privacidade', 'validacao_humana'),
      nota: { type: 'integer' }, comentario: str })),
    problemas: arr(obj({ trecho: str, problema: str, reescrita: str })) }),
  pesquisa: obj({ referencias: arr(obj({ fonte: str, data: str, formato: str, gancho: str, estrutura: str, por_que_interessa: str,
    adaptacao: str, adequacao: en('Alta', 'Média', 'Baixa', 'Não adequada'), limitacoes: str, duracao: en('Formato duradouro', 'Tendência passageira') })),
    acoes: arr(ACAO), alertas: strs }),
  'analise-desempenho': obj({ periodo: str, achados: arr(obj({ achado: str, forca: en('hipotese', 'evidencia'), ids: strs, numeros: str })),
    nao_compensou: arr(obj({ chave: str, motivo: str })), acoes: arr(ACAO), alertas: strs }),
  aprendizado: obj({ aprendizados: arr(obj({ texto: str, classe: en('hipotese', 'preferencia', 'evidencia', 'diretriz_proposta'),
    area: str, fonte: en('Escolha humana', 'Métrica', 'Pesquisa', 'Decisão da gestão'), ocorrencias: { type: 'integer' }, exemplos: strs })),
    expressoes_preferidas: strs, abordagens_evitar: strs, acoes: arr(ACAO) }),
  replanejamento: obj({ gatilho: str, ajustes: arr(obj({ descricao: str, chave: str, de: str, para: str, nivel: NIVEL, quem_decide: { type: ['string', 'null'], enum: ['Larissa', 'Social media', 'Gestão', null] }, motivo: str })),
    sai_do_plano: strs, acoes: arr(ACAO), alertas: strs }),
  estrategia: obj({ leitura: str, desequilibrios: strs, propostas: arr(obj({ mudanca: str, motivo: str, metrica_esperada: str })), acoes: arr(ACAO) }),
};

export function gravarSchemas() {
  mkdirSync(join(IA_DIR, 'contratos'), { recursive: true });
  for (const [k, s] of Object.entries(SCHEMAS)) writeFileSync(join(IA_DIR, 'contratos', `${k}.schema.json`), JSON.stringify({ $comment: `Contrato de saída do workflow ${k}. Gerado por ia/lib/contratos.mjs.`, ...s }, null, 2));
}

// Validador mínimo do subconjunto de JSON Schema usado acima (sem dependências).
export function validarSchema(v, s, caminho = '$', erros = []) {
  const tipos = Array.isArray(s.type) ? s.type : [s.type];
  const tipoDe = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  const t = tipoDe(v);
  if (s.type && !tipos.includes(t) && !(t === 'integer' && tipos.includes('number'))) { erros.push(`${caminho}: esperado ${tipos.join('|')}, veio ${t}`); return erros; }
  if (s.enum && !s.enum.includes(v)) erros.push(`${caminho}: valor fora do enum (${JSON.stringify(v)})`);
  if (t === 'object' && s.properties) {
    for (const r of s.required || []) if (!(r in v)) erros.push(`${caminho}.${r}: obrigatório`);
    for (const k of Object.keys(v)) if (!(k in s.properties)) erros.push(`${caminho}.${k}: campo não previsto`);
    for (const [k, sub] of Object.entries(s.properties)) if (k in v) validarSchema(v[k], sub, `${caminho}.${k}`, erros);
  }
  if (t === 'array' && s.items) v.forEach((x, i) => validarSchema(x, s.items, `${caminho}[${i}]`, erros));
  return erros;
}

// Bases do Notion: chave do contrato -> chave em notion/schema/schema.json.
// "historias" é a base nova da Fase 3 (ver ia/MAPEAMENTO-NOTION.md).
const propsDe = (base) => {
  const db = SCHEMA_NOTION.databases.find((d) => d.key === base);
  if (!db) return null;
  const p = { ...db.properties, ...SCHEMA_NOTION.common_properties };
  if (db.sync) Object.assign(p, SCHEMA_NOTION.sync_properties);
  // Relações de mão dupla: o espelho ("dual") existe na base de destino com o dono da relação original.
  for (const outra of SCHEMA_NOTION.databases)
    for (const prop of Object.values(outra.properties))
      if (prop.type === 'relation' && prop.target === base && prop.dual && !(prop.dual in p)) p[prop.dual] = { type: 'relation', target: outra.key, owner: prop.owner };
  return p;
};
const CRIACAO = new Set(['criar_conteudo', 'criar_captacao', 'criar_pendencia', 'criar_historia', 'criar_aprendizado', 'criar_referencia', 'recomendar']);
// Campos humanos que o agente pode preencher **na criação** de um registro novo (Status Ideia/Nova, Origem Agente).
const PERMITIDOS_NA_CRIACAO = new Set(['Título', 'Pedido', 'Pendência', 'Aprendizado', 'Referência', 'Recomendação', 'História', 'Formato', 'Pilar', 'Objetivo',
  'Status', 'Tipo', 'Quem capta', 'Quem responde', 'Prioridade', 'Quando', 'Onde', 'Link', 'Por que é útil', 'Conteúdos', 'Conteúdos afetados',
  'Tema', 'Argumento central', 'Relato', 'Pilares', 'Envolve', 'Data do acontecimento', 'Formato observado', 'Gancho observado', 'Estrutura narrativa',
  'Possibilidade de adaptação', 'Adequação à marca', 'Limitações éticas ou clínicas', 'Data da referência', 'Duração', 'Requer autorização de paciente', 'Identificação', 'Potencial', 'Dia de origem', 'Semana', 'Dia']);
// Exceções da política A (notion/schema/autonomia.json): campos humanos que certas ações podem mexer no nível A,
// desde que a página não tenha sido editada pela equipe nem esteja travada.
const EXCECOES_A = { priorizar: ['Prioridade', 'Semana', 'Com quem está'], mover_data: ['Publicação prevista', 'Prazo de produção'],
  marcar_validacao: ['Validação da Larissa', 'Motivo da validação', 'Informação clínica pendente'], criar_pendencia: ['Bloqueio', 'Pendências'], atualizar_semana: ['Semana'] };
const NUNCA = new Set(['Autorização de imagem', 'Validado por', 'Validado em', 'Resposta', 'Respondida em', 'Minha rotina', 'Disponibilidade para gravar',
  'Publicado em', 'Link da publicação', 'Decisão', 'Decidido por', 'Decidido em', 'Travar para o agente', 'Status do plano']);

export function checarAcoes(acoes = [], { travadas = [], editadas = [] } = {}) {
  const erros = [];
  acoes.forEach((a, i) => {
    const onde = `acoes[${i}] (${a.tipo} ${a.base}:${a.chave})`;
    const props = propsDe(a.base);
    if (!props) { erros.push(`${onde}: base desconhecida no Notion implantado`); return; }
    if (travadas.includes(a.chave)) erros.push(`${onde}: página travada para o agente`);
    if (a.nivel === 'C' && !['marcar_validacao', 'criar_pendencia', 'recomendar'].includes(a.tipo)) erros.push(`${onde}: nível C só sinaliza (marcar_validacao, criar_pendencia ou recomendar)`);
    if (a.nivel !== 'A' && !a.quem_decide) erros.push(`${onde}: nível ${a.nivel} exige quem_decide`);
    if (!a.fontes?.length) erros.push(`${onde}: sem fontes`);
    if (a.nivel === 'A' && editadas.includes(a.chave) && !CRIACAO.has(a.tipo)) erros.push(`${onde}: página editada pela equipe; só recomendação (B)`);
    for (const { campo } of a.campos || []) {
      const p = props[campo];
      if (!p && !campo.startsWith('corpo:')) { erros.push(`${onde}: campo "${campo}" não existe na base`); continue; }
      if (NUNCA.has(campo)) { erros.push(`${onde}: campo protegido "${campo}"`); continue; }
      if (campo === 'corpo:Roteiro' || campo === 'corpo:Notas da equipe') { erros.push(`${onde}: seção da equipe; o agente escreve só em corpo:Rascunho do agente`); continue; }
      if (!p) continue;
      const humano = ['larissa', 'social', 'gestao', 'equipe'].includes(p.owner);
      const excecao = (EXCECOES_A[a.tipo] || []).includes(campo) && !editadas.includes(a.chave);
      if (humano && !excecao && !(CRIACAO.has(a.tipo) && PERMITIDOS_NA_CRIACAO.has(campo)) && a.nivel === 'A')
        erros.push(`${onde}: "${campo}" é campo humano; mudança deve ser nível B (recomendação)`);
    }
    if (a.tipo === 'marcar_validacao' && (a.campos || []).some((c) => c.campo === 'Validação da Larissa' && c.valor !== 'Necessária'))
      erros.push(`${onde}: o agente só escala a validação para "Necessária"`);
  });
  return erros;
}

// Regras de negócio por workflow (o que o schema da API não garante).
export function regras(workflow, s, pacote = {}) {
  const e = [];
  const max = (lista, n, nome) => { if ((lista || []).length > n) e.push(`${nome}: no máximo ${n} (veio ${lista.length})`); };
  if (workflow === 'plano-semanal') {
    max(s.feed, 4, 'feed'); max(s.narrativas, 3, 'narrativas'); max(s.objetivos, 3, 'objetivos');
    for (const f of s.feed) {
      if (f.bloqueado_por.length && f.origem === 'nova') e.push(`feed "${f.titulo}": bloqueado não pode ser "nova"`);
      if (f.origem !== 'nova' && !f.chave) e.push(`feed "${f.titulo}": ${f.origem} exige chave existente`);
      const c = (pacote.conteudos_abertos || []).find((x) => x.chave === f.chave);
      if (c && /caso clínico|imagem de paciente/i.test((c.motivo_validacao || []).join(' ')) && c.autorizacao !== 'Registrada' && !f.bloqueado_por.length)
        e.push(`feed "${f.titulo}": caso clínico sem autorização registrada precisa estar bloqueado`);
    }
    const novos = s.feed.filter((f) => f.origem === 'nova').length;
    if ((pacote.capacidade === 'Mínima' && s.feed.length > 2) || (pacote.capacidade === 'Reduzida' && s.feed.length > 3)) e.push(`feed acima da capacidade ${pacote.capacidade}`);
    if (pacote.capacidade !== 'Normal' && novos > 1) e.push('com capacidade reduzida, no máximo 1 feed novo');
  }
  if (workflow === 'direcionamento-diario') {
    max(s.social.prioridades, 3, 'prioridades'); max(s.larissa.perguntas, 3, 'perguntas');
    if (!s.rotina_informada && s.larissa.oportunidades.length) e.push('sem rotina informada não pode haver oportunidades "vistas na rotina"');
    if (s.rotina_informada !== Boolean(pacote.dia?.rotina)) e.push('rotina_informada não bate com o pacote');
    if (['Pouco tempo', 'Sem tempo'].includes(pacote.dia?.disponibilidade)) max(s.larissa.gravar, pacote.dia.disponibilidade === 'Sem tempo' ? 1 : 2, 'gravar');
  }
  if (workflow === 'roteiro') {
    const temPendClinica = (pacote.conteudo?.pendencias_abertas || []).length > 0 && (pacote.conteudo?.motivo_validacao || []).includes('Afirmação clínica inédita');
    if (temPendClinica && s.nivel !== 'C') e.push('conteúdo com pendência clínica aberta precisa de nível C');
    if (temPendClinica && !JSON.stringify(s.roteiro).includes('[PENDENTE')) e.push('roteiro com pendência deve marcar o trecho [PENDENTE P-xx]');
    max(s.ganchos, 3, 'ganchos');
  }
  if (workflow === 'revisao') {
    const baixa = s.criterios.some((c) => c.nota < 3) || s.criterios.some((c) => ['seguranca_clinica', 'privacidade'].includes(c.criterio) && c.nota < 4);
    if (s.aprovado && baixa) e.push('aprovado com critério abaixo do mínimo');
  }
  if (workflow === 'aprendizado') {
    for (const a of s.aprendizados) {
      if (a.classe === 'preferencia' && a.ocorrencias < 2 && a.fonte !== 'Decisão da gestão') e.push(`"${a.texto}": preferência exige 2 ou mais ocorrências`);
      if (a.classe === 'evidencia' && (a.fonte !== 'Métrica' || a.ocorrencias < 3)) e.push(`"${a.texto}": evidência exige métrica em 3 ou mais publicações`);
    }
  }
  if (workflow === 'replanejamento') {
    for (const a of s.ajustes) {
      const c = (pacote.conteudos_abertos || []).find((x) => x.chave === a.chave);
      if (c && (c.travado || c.editado_pela_equipe || ['Aprovado', 'Agendado', 'Publicado'].includes(c.status)) && a.nivel === 'A') e.push(`ajuste em ${a.chave}: conteúdo protegido exige nível B`);
    }
  }
  return e;
}
