// Radar de repetição: compara um conteúdo candidato com o histórico em 8 dimensões e diferencia
// repetição estratégica de mensagem (bom: mesmo tema por outro ângulo) de repetição excessiva
// (ruim: mesmo argumento, gancho ou história em pouco tempo).
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
const PARADAS = new Set('a o as os de da do das dos e em um uma para por que com no na nos nas se ao eu voce mais nao sim seu sua meu minha isso esse essa ja so como'.split(' '));
const toks = (s) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w)));
export function semelhanca(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / Math.min(A.size, B.size);
}
const jaccard = (a = [], b = []) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};
const dias = (d1, d2) => Math.round((new Date(d1) - new Date(d2)) / 86400000);

// Janelas (dias) a partir das quais repetir uma dimensão deixa de ser problema.
export const JANELAS = { argumento: 60, gancho: 60, historia: 45, procedimento_formato: 21, cta: 7 };

export function compararUm(c, h, hoje) {
  const quando = h.publicado_em || h.publicacao_prevista;
  const idade = quando ? dias(hoje, quando) : null;
  const d = {
    tema: jaccard(c.tema, h.tema),
    argumento: semelhanca(c.argumento, h.argumento),
    gancho: semelhanca(c.gancho, h.gancho),
    formato: c.formato && c.formato === h.formato ? 1 : 0,
    historia: c.historia && c.historia === h.historia ? 1 : 0,
    procedimento: jaccard(c.procedimentos, h.procedimentos),
    cta: c.cta && h.cta && semelhanca(c.cta, h.cta) >= 0.7 ? 1 : 0,
  };
  const dentro = (j) => idade === null || idade < j;
  const motivos = [];
  if (d.argumento >= 0.6 && dentro(JANELAS.argumento)) motivos.push('mesmo argumento central');
  if (d.gancho >= 0.6 && dentro(JANELAS.gancho)) motivos.push('gancho muito parecido');
  if (d.historia && dentro(JANELAS.historia)) motivos.push('mesma história');
  if (d.procedimento >= 0.5 && d.formato && dentro(JANELAS.procedimento_formato)) motivos.push('mesmo procedimento no mesmo formato');
  if (d.cta && dentro(JANELAS.cta)) motivos.push('mesmo CTA na mesma semana');
  let classe = 'ok';
  if (motivos.length) classe = 'repeticao_excessiva';
  else if (d.tema >= 0.5 || (c.pilar && c.pilar === h.pilar && d.tema > 0)) classe = 'reforco_estrategico';
  return { chave: h.chave, titulo: h.titulo, idade_dias: idade, dimensoes: d, classe, motivos };
}

export function radar(candidato, historico, hoje) {
  const r = historico.filter((h) => h.chave !== candidato.chave).map((h) => compararUm(candidato, h, hoje));
  const excessivos = r.filter((x) => x.classe === 'repeticao_excessiva').sort((a, b) => b.motivos.length - a.motivos.length);
  const reforcos = r.filter((x) => x.classe === 'reforco_estrategico');
  return {
    veredito: excessivos.length ? 'repeticao_excessiva' : reforcos.length ? 'reforco_estrategico' : 'ok',
    excessivos: excessivos.slice(0, 5), reforcos: reforcos.slice(0, 5).map(({ chave, titulo, idade_dias }) => ({ chave, titulo, idade_dias })),
  };
}

// Resumo para o pacote de contexto: o que foi dito nos últimos N dias, por tema e por ângulo.
export function resumoRecente(historico, hoje, janela = 60) {
  const recentes = historico.filter((h) => { const q = h.publicado_em || h.publicacao_prevista; return q && dias(hoje, q) >= 0 && dias(hoje, q) <= janela; });
  const porTema = {};
  for (const h of recentes) for (const t of h.tema || []) (porTema[t] ||= []).push({ chave: h.chave, argumento: h.argumento, gancho: h.gancho, historia: h.historia, quando: h.publicado_em || h.publicacao_prevista });
  return { janela_dias: janela, total: recentes.length, por_tema: porTema };
}
