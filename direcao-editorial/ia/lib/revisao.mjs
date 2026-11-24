// Revisão determinística (camada 1). Roda antes da revisão do modelo e bloqueia a entrega se falhar.
// contexto: 'clinico' (roteiros, carrosséis, legendas de tratamento) ou 'informal' (caixinhas, stories leves).
const R = (id, re, msg, gravidade = 'erro', so) => ({ id, re, msg, gravidade, so });
export const REGRAS = [
  R('travessao', /[—–]|\s-\s/, 'Travessão ou hífen solto como pausa: reescrever com ponto ou vírgula.'),
  R('nao-e-sobre', /n[aã]o (é|e|se trata) (sobre|de)\b[^.]{0,60}[,;]\s*(é|e|mas)\s*(sobre|de)?/i, 'Estrutura "não é sobre X, é sobre Y".'),
  R('metodo-la', /m[ée]todo\s+la\b|LA™/i, 'Nome de método errado: usar só Método ERA.'),
  R('era-letras', /\bE\s*(=|de|é)\s*\w+[,;]\s*R\s*(=|de|é)/i, 'Explicação das letras do ERA: proibido enquanto P-01 estiver aberta.'),
  R('harmonizacao', /harmoniza[cç][aã]o/i, '"Harmonização": usar "procedimento" ou o nome do tratamento.'),
  R('hof-clinico', /\bHOF\b/, '"HOF" em contexto clínico: usar o nome do procedimento.', 'erro', 'clinico'),
  R('promessa', /\b(garant(o|ido|imos)|resultado (certo|garantido)|100%|sem riscos?|definitivo)\b/i, 'Promessa de resultado.'),
  R('inseguranca', /\b(feia|horr[ií]vel|envelhecida demais|vergonha do seu rosto|defeito)\b/i, 'Linguagem que estimula insegurança estética.'),
  R('coach', /\b(sua melhor vers[aã]o|jornada de transforma[cç][aã]o|empoderad[ao]|virar a chave|gratid[aã]o sempre|sa(ia|ir) da zona de conforto)\b/i, 'Linguagem de coach ou frase de efeito.'),
  R('imagine', /^\s*imagin(e|a)\b/im, 'Abertura "imagine...".', 'aviso'),
  R('fim-das-contas', /no fim das contas|no final do dia|e o melhor:/i, 'Fecho clichê.', 'aviso'),
  R('tres-adjetivos', /\b(\w+[ao]s?), (\w+[ao]s?) e (\w+[ao]s?)\b(?=[.!])/i, 'Lista de três adjetivos (padrão de texto de máquina).', 'aviso'),
  R('pendente-vazado', /\[PENDENTE(?! P-\d{2})/, 'Marcação de pendência sem código P-xx.'),
];

export function lint(texto = '', contexto = 'clinico') {
  const problemas = [];
  for (const r of REGRAS) {
    if (r.so && r.so !== contexto) continue;
    const m = texto.match(r.re);
    if (m) problemas.push({ regra: r.id, gravidade: r.gravidade, trecho: m[0].trim().slice(0, 80), mensagem: r.msg });
  }
  return { ok: !problemas.some((p) => p.gravidade === 'erro'), problemas };
}

// Extrai todo o texto que vai para a equipe ou para o público de uma saída de workflow.
export function textosDe(saida) {
  const out = [];
  const visit = (v, path) => {
    if (typeof v === 'string') { if (!/^(chave|fontes|base|tipo|nivel|campo|codigo|origem|formato|pilar|objetivo|dia|data|quando|duracao|classe|criterio|fonte|quem|adequacao)/.test(path.split('.').pop())) out.push({ path, texto: v }); }
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, path ? `${path}.${k}` : k);
  };
  visit(saida, '');
  return out;
}

export function lintSaida(saida, contextoPorCaminho = () => 'clinico') {
  const achados = [];
  for (const { path, texto } of textosDe(saida)) {
    const r = lint(texto, contextoPorCaminho(path));
    for (const p of r.problemas) achados.push({ path, ...p });
  }
  return { ok: !achados.some((a) => a.gravidade === 'erro'), achados };
}
