// Seleção de contexto: transforma um snapshot do Notion (exportado pelo n8n, campos normalizados)
// no pacote mínimo de cada workflow. Nunca envia o histórico inteiro.
//
// Snapshot esperado: { conteudos, semanas, dias, captacao, pendencias, referencias, metricas,
//   aprendizados, prioridades, historias, recomendacoes, datas } — arrays de objetos com `chave`,
//   `origem` e os campos usados abaixo (ver ia/CONTEXTO.md).
import { radar, resumoRecente } from './radar.mjs';

export const ABERTOS = ['Ideia', 'Planejado', 'Aguardando informação', 'Aguardando captação', 'Em produção', 'Aguardando aprovação', 'Aprovado', 'Agendado'];
const PUBLICADOS = ['Publicado', 'Analisado'];
const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const porData = (campo) => (x, y) => String(x[campo] || '9999').localeCompare(String(y[campo] || '9999'));

// Orçamentos por workflow: quantos itens de cada tipo entram no pacote.
export const ORCAMENTOS = {
  'plano-semanal': { abertos: 30, publicados_dias: 60, historias: 10, aprendizados: 15, pendencias: 12, metricas: 0, referencias: 5 },
  'direcionamento-diario': { abertos: 15, publicados_dias: 14, historias: 5, aprendizados: 8, pendencias: 6, metricas: 0, referencias: 0 },
  roteiro: { abertos: 0, publicados_dias: 60, historias: 5, aprendizados: 10, pendencias: 6, metricas: 0, referencias: 3 },
  replanejamento: { abertos: 20, publicados_dias: 14, historias: 5, aprendizados: 5, pendencias: 6, metricas: 0, referencias: 0 },
  'analise-desempenho': { abertos: 0, publicados_dias: 60, historias: 0, aprendizados: 20, pendencias: 0, metricas: 60, referencias: 0 },
  aprendizado: { abertos: 0, publicados_dias: 30, historias: 0, aprendizados: 30, pendencias: 10, metricas: 0, referencias: 0 },
  pesquisa: { abertos: 0, publicados_dias: 30, historias: 0, aprendizados: 5, pendencias: 0, metricas: 0, referencias: 10 },
  estrategia: { abertos: 40, publicados_dias: 90, historias: 20, aprendizados: 30, pendencias: 12, metricas: 90, referencias: 5 },
};

export function filtrarAmbiente(snapshot, ambiente) {
  const s = {};
  for (const [k, v] of Object.entries(snapshot)) s[k] = Array.isArray(v) ? v.filter((x) => ambiente === 'teste' || x.origem !== 'Simulação') : v;
  if (ambiente === 'producao') {
    const vazou = Object.values(s).flat().filter((x) => x && x.origem === 'Simulação');
    if (vazou.length) throw new Error(`Registros de simulação no contexto de produção: ${vazou.map((x) => x.chave).join(', ')}`);
  }
  return s;
}

const resumoConteudo = (c) => ({ chave: c.chave, titulo: c.titulo, status: c.status, formato: c.formato, pilar: c.pilar, objetivo: c.objetivo,
  tema: c.tema, argumento: c.argumento, prazo: c.prazo, publicacao_prevista: c.publicacao_prevista, com_quem: c.com_quem,
  bloqueio: c.bloqueio || undefined, pendencias: c.pendencias?.length ? c.pendencias : undefined, validacao: c.validacao,
  motivo_validacao: c.motivo_validacao, autorizacao: c.autorizacao, travado: c.travado || undefined, editado_pela_equipe: c.editado_pela_equipe || undefined,
  historia: c.historia || undefined });

export function montarPacote(workflow, snapshotBruto, { hoje, ambiente = 'teste', alvo, gatilho, semana } = {}) {
  if (!ORCAMENTOS[workflow]) throw new Error(`Workflow desconhecido: ${workflow}`);
  if (!hoje) throw new Error('Informe "hoje" (AAAA-MM-DD, fuso America/Sao_Paulo).');
  const o = ORCAMENTOS[workflow];
  const s = filtrarAmbiente(snapshotBruto, ambiente);
  const conteudos = s.conteudos || [];
  const abertos = conteudos.filter((c) => ABERTOS.includes(c.status));
  const atrasados = abertos.filter((c) => (c.prazo && c.prazo < hoje) || (c.publicacao_prevista && c.publicacao_prevista < hoje && !['Ideia'].includes(c.status)));
  const bloqueados = abertos.filter((c) => c.status === 'Aguardando informação' || (c.pendencias || []).length);
  const publicados = conteudos.filter((c) => PUBLICADOS.includes(c.status) && c.publicado_em && dias(hoje, c.publicado_em) <= o.publicados_dias);
  // Prioriza: atrasados > com data próxima > em produção > resto; corta no orçamento.
  const peso = (c) => (atrasados.includes(c) ? 0 : c.publicacao_prevista && dias(c.publicacao_prevista, hoje) <= 7 ? 1 : c.status === 'Em produção' ? 2 : c.status === 'Ideia' ? 4 : 3);
  const abertosOrd = [...abertos].sort((a, b) => peso(a) - peso(b) || porData('publicacao_prevista')(a, b)).slice(0, o.abertos);

  const pendenciasAbertas = (s.pendencias || []).filter((p) => ['Aberta', 'Parcial'].includes(p.status))
    .sort((a, b) => (b.conteudos_afetados?.length || 0) - (a.conteudos_afetados?.length || 0) || ['Alta', 'Média', 'Baixa'].indexOf(a.prioridade) - ['Alta', 'Média', 'Baixa'].indexOf(b.prioridade))
    .slice(0, o.pendencias);
  const respostas = (s.pendencias || []).filter((p) => p.status === 'Respondida' && p.resposta).map(({ codigo, pendencia, resposta }) => ({ codigo, pendencia, resposta }));
  const aprendizados = (s.aprendizados || []).filter((a) => a.status !== 'Refutado')
    .sort((a, b) => ['Diretriz aprovada', 'Evidência', 'Preferência', 'Em teste', 'Hipótese'].indexOf(a.status) - ['Diretriz aprovada', 'Evidência', 'Preferência', 'Em teste', 'Hipótese'].indexOf(b.status))
    .slice(0, o.aprendizados).map((a) => ({ texto: a.texto, status: a.status, area: a.area }));
  const historias = (s.historias || []).filter((h) => h.status === 'Pronta para usar' || (h.status === 'Nova' && workflow !== 'roteiro'))
    .sort((a, b) => (a.vezes_usada || 0) - (b.vezes_usada || 0)).slice(0, o.historias)
    .map((h) => ({ chave: h.chave, titulo: h.titulo, tipo: h.tipo, relato: h.relato, status: h.status, envolve: h.envolve, autorizacao: h.autorizacao, vezes_usada: h.vezes_usada || 0 }));
  const prioridades = (s.prioridades || []).filter((p) => ['Ativa', 'Planejada'].includes(p.status));
  const semanaAtual = (s.semanas || []).find((w) => (semana ? w.chave === semana : w.inicio <= hoje && (w.fim || w.inicio) >= hoje));
  const diaAtual = (s.dias || []).find((d) => d.data === hoje);
  const materiais = (s.captacao || []).filter((c) => ['Captado', 'No Drive'].includes(c.status)).map(({ chave, pedido, tipo, conteudos: cs }) => ({ chave, pedido, tipo, conteudos: cs }));
  const captacaoAberta = (s.captacao || []).filter((c) => ['A solicitar', 'Solicitado à Larissa', 'Agendado'].includes(c.status)).map(({ chave, pedido, status, quando, quem_capta }) => ({ chave, pedido, status, quando, quem_capta }));

  const historicoRadar = [...publicados, ...abertos];
  const pacote = {
    workflow, hoje, ambiente,
    semana: semanaAtual ? { chave: semanaAtual.chave, periodo: [semanaAtual.inicio, semanaAtual.fim], intencao: semanaAtual.intencao, status_plano: semanaAtual.status_plano } : null,
    capacidade: semanaAtual?.capacidade || 'Normal', restricoes: semanaAtual?.restricoes || '',
    dia: diaAtual ? { data: diaAtual.data, rotina: diaAtual.rotina || '', disponibilidade: diaAtual.disponibilidade || null } : { data: hoje, rotina: '', disponibilidade: null },
    prioridades_comerciais: prioridades.map(({ titulo, periodo, procedimento, meta, peso }) => ({ titulo, periodo, procedimento, meta, peso })),
    conteudos_abertos: o.abertos ? abertosOrd.map(resumoConteudo) : [],
    atrasados: atrasados.map((c) => c.chave), bloqueados: bloqueados.map((c) => c.chave),
    publicados_recentes: publicados.map((c) => ({ chave: c.chave, titulo: c.titulo, publicado_em: c.publicado_em, formato: c.formato, tema: c.tema, argumento: c.argumento, gancho: c.gancho })),
    materiais_disponiveis: materiais, captacao_aberta: captacaoAberta,
    pendencias_abertas: pendenciasAbertas.map(({ codigo, pendencia, quem_responde, conteudos_afetados }) => ({ codigo, pendencia, quem_responde, afeta: conteudos_afetados?.length || 0 })),
    respostas_validadas: respostas, historias_disponiveis: historias, aprendizados,
    datas: (s.datas || []).filter((d) => dias(d.data, hoje) >= -1 && dias(d.data, hoje) <= 14),
    radar: resumoRecente(historicoRadar, hoje, 60),
  };
  if (workflow === 'roteiro' && alvo) {
    const c = conteudos.find((x) => x.chave === alvo);
    if (!c) throw new Error(`Conteúdo alvo ${alvo} não encontrado`);
    pacote.conteudo = { ...resumoConteudo(c), gancho: c.gancho, cta: c.cta, procedimentos: c.procedimentos,
      pendencias_abertas: (c.pendencias || []).filter((k) => (s.pendencias || []).some((p) => p.codigo === k && ['Aberta', 'Parcial'].includes(p.status))) };
    pacote.radar_alvo = radar(c, historicoRadar, hoje);
  }
  if (workflow === 'analise-desempenho') pacote.metricas = (s.metricas || []).filter((m) => dias(hoje, m.data) <= o.metricas);
  if (workflow === 'pesquisa') pacote.referencias = (s.referencias || []).filter((r) => r.status === 'Nova').slice(0, o.referencias);
  if (workflow === 'aprendizado') pacote.sinais = (s.recomendacoes || []).filter((r) => r.decidido_em && dias(hoje, r.decidido_em) <= 7);
  if (workflow === 'replanejamento') pacote.gatilho = gatilho || null;
  // Remove chaves vazias para economizar tokens.
  return JSON.parse(JSON.stringify(pacote, (k, v) => (v === undefined || (Array.isArray(v) && !v.length && !['conteudos_abertos', 'atrasados', 'bloqueados'].includes(k)) ? undefined : v)));
}
