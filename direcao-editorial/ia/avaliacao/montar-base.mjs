// Gera avaliacao/base-teste.json: snapshot de TESTE no formato que o n8n vai exportar.
// Conteúdos e pendências reais do inventário + registros sintéticos com Origem = Simulação
// (publicações passadas, histórias, materiais), para exercitar radar e histórias.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url));
const inv = JSON.parse(readFileSync(join(AQUI, '..', '..', 'notion', 'import', 'inventario.json'), 'utf8'));

// Classificação de tema e argumento para o inventário (proposta de teste, derivada dos títulos e notas do Trello).
const TEMA = {
  'trello:C-01': [['Planejamento individual'], 'pacientes com a mesma queixa podem precisar de planejamentos diferentes'],
  'trello:C-02': [['Primeira consulta', 'Planejamento individual'], 'a consulta explica o porquê de cada indicação'],
  'trello:C-03': [['Vida empresarial'], ''], 'trello:C-04': [['Acompanhamento ao longo dos anos'], ''],
  'trello:C-05': [['Emagrecimento'], ''],
  'trello:C-06': [['Procedimento isolado', 'Envelhecimento'], 'tratar o rosto depois dos 40 com procedimento isolado é o erro mais comum'],
  'trello:C-07': [['Fé'], 'a trajetória foi guiada por fé'], 'trello:C-08': [['Pele'], ''],
  'trello:C-09': [['Pele', 'Associação de procedimentos'], 'começar pela pele faz mais sentido do que um full face'],
  'trello:C-10': [['Acompanhamento ao longo dos anos'], ''], 'trello:C-11': [['Família'], ''], 'trello:C-12': [['Família', 'Envelhecimento'], ''],
  'trello:C-13': [['Método ERA'], ''], 'trello:C-14': [['Pele'], ''], 'trello:C-15': [['Acompanhamento ao longo dos anos'], ''], 'trello:C-16': [['Acompanhamento ao longo dos anos'], ''],
};
const PROC = { 'trello:C-09': ['Peeling', 'Full face'], 'trello:C-08': ['Peptídeos'], 'trello:C-14': ['Plasma IQ'] };

const conteudos = inv.conteudos.map((c) => ({
  chave: c.Chave, titulo: c['Título'], status: c.Status, formato: c.Formato, pilar: c.Pilar || null, objetivo: c.Objetivo || null,
  tema: (TEMA[c.Chave] || [[]])[0], argumento: (TEMA[c.Chave] || [, ''])[1], procedimentos: PROC[c.Chave] || [],
  gancho: '', cta: '', prazo: null, publicacao_prevista: null, publicado_em: null,
  com_quem: c.Status === 'Aguardando informação' ? 'Larissa' : c.Status === 'Ideia' ? null : 'Social media',
  validacao: c['Clínica'] || c['Autorização'] ? 'Necessária' : 'Não necessária',
  motivo_validacao: c['Autorização'] ? ['Caso clínico', 'Imagem de paciente'] : c['Clínica'] ? ['Afirmação clínica inédita'] : [],
  autorizacao: c['Autorização'] || 'Não se aplica', bloqueio: c.Bloqueio || '', pendencias: (c['Pendências'] || []).map((k) => k.replace('pendencia:', '')),
  travado: false, editado_pela_equipe: false, historia: null, origem: 'Trello',
}));
const SIM = 'Simulação';
conteudos.push(
  { chave: 'sim:pub:1', titulo: '[TESTE] Por que eu recusei fazer só o que ela pediu', status: 'Publicado', formato: 'Reels', pilar: 'Autoridade', objetivo: 'Quebra de objeção',
    tema: ['Procedimento isolado', 'Planejamento individual'], argumento: 'procedimento isolado não resolve sem planejamento', gancho: 'Eu recusei fazer só o que ela pediu.', cta: 'Agende sua avaliação pelo WhatsApp',
    procedimentos: [], publicado_em: '2026-11-17', origem: SIM },
  { chave: 'sim:pub:2', titulo: '[TESTE] Comece pela pele', status: 'Publicado', formato: 'Carrossel', pilar: 'Autoridade', objetivo: 'Educação',
    tema: ['Pele', 'Associação de procedimentos'], argumento: 'começar pela pele faz mais sentido do que fazer tudo de uma vez', gancho: 'Antes de qualquer seringa, eu olho a pele.', cta: '',
    procedimentos: ['Peeling'], publicado_em: '2026-11-05', origem: SIM },
  { chave: 'sim:pub:3', titulo: '[TESTE] Café antes da primeira paciente', status: 'Publicado', formato: 'Sequência de stories', pilar: 'Conexão', objetivo: 'Engajamento',
    tema: ['Rotina'], argumento: 'a rotina real começa antes do consultório abrir', gancho: 'Meu ritual antes de abrir a agenda.', cta: '', procedimentos: [], publicado_em: '2026-11-21', origem: SIM },
);
const pendencias = inv.pendencias.map((p) => ({ codigo: p['Código'], pendencia: p['Pendência'], status: p.Status, quem_responde: p['Quem responde'], prioridade: p.Prioridade,
  resposta: p.Resposta || '', conteudos_afetados: conteudos.filter((c) => (c.pendencias || []).includes(p['Código'])).map((c) => c.chave), origem: 'Trello' }));
const base = {
  $comment: 'SNAPSHOT DE TESTE. Conteúdos e pendências do inventário real + registros sintéticos (Origem = Simulação). Não usar em produção.',
  conteudos, pendencias,
  semanas: [{ chave: 'sim:semana:2026-W49', inicio: '2026-11-30', fim: '2026-12-06', capacidade: 'Normal', restricoes: '', intencao: '', status_plano: null, origem: SIM }],
  dias: [], prioridades: [], recomendacoes: [], metricas: [], referencias: [],
  aprendizados: inv.aprendizados.map((a) => ({ chave: a.Chave, texto: a.Aprendizado, status: a.Status, area: a['Área'], origem: 'Gestão' })),
  historias: [
    { chave: 'sim:his:1', titulo: '[TESTE] Paciente que voltou depois de 4 anos para o retorno', tipo: 'Percepção de consulta', relato: '(teste) Uma paciente que eu acompanho desde 2020 voltou para o retorno anual e comentou que ninguém percebe que ela fez algo, só que está bem.', status: 'Pronta para usar', envolve: ['Paciente'], autorizacao: 'Não necessária', identificacao: 'Sem identificação', vezes_usada: 0, origem: SIM },
    { chave: 'sim:his:2', titulo: '[TESTE] A pergunta que mais chega na caixinha', tipo: 'Pergunta recebida', relato: '(teste) Toda terça chega alguma versão de "dá para fazer só um pouquinho para ninguém perceber?".', status: 'Nova', envolve: ['Ninguém além dela'], autorizacao: 'Não necessária', identificacao: 'Sem identificação', vezes_usada: 0, origem: SIM },
  ],
  captacao: [{ chave: 'sim:cap:drive:1', pedido: '[TESTE] Takes do consultório vazio pela manhã', tipo: 'Imagem de apoio', status: 'No Drive', conteudos: [], origem: SIM }],
  datas: [{ data: '2026-12-25', nome: 'Natal' }],
};
writeFileSync(join(AQUI, 'base-teste.json'), JSON.stringify(base, null, 1));
console.log(`base-teste.json: ${conteudos.length} conteúdos, ${pendencias.length} pendências`);
