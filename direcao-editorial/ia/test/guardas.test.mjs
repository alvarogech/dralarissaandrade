// Testes negativos: as guardas precisam REPROVAR saídas ruins. Rodar: node test/guardas.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarPacote } from '../lib/contexto.mjs';
import { SCHEMAS, validarSchema, regras, checarAcoes } from '../lib/contratos.mjs';
import { lintSaida, lint } from '../lib/revisao.mjs';
import { radar } from '../lib/radar.mjs';
import { aplicarPatch } from '../avaliacao/avaliar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AV = join(AQUI, '..', 'avaliacao');
const base = JSON.parse(readFileSync(join(AV, 'base-teste.json'), 'utf8'));
const { cenarios } = JSON.parse(readFileSync(join(AV, 'cenarios.json'), 'utf8'));
const saidaDe = (id) => JSON.parse(readFileSync(join(AV, 'saidas', `${id}.json`), 'utf8')).saida;
const cen = (id) => cenarios.find((c) => c.id === id);
const pacoteDe = (id) => { const c = cen(id); return montarPacote(c.workflow, aplicarPatch(base, c.patch), { hoje: c.hoje, ambiente: 'teste', alvo: c.alvo, gatilho: c.gatilho }); };

let falhas = 0, n = 0;
const espera = (nome, cond) => { n++; if (!cond) { falhas++; console.log(`✗ ${nome}`); } else console.log(`✓ ${nome}`); };

// 1. Plano com 5 feeds é reprovado.
{ const s = structuredClone(saidaDe('07-caso-sem-autorizacao')); s.feed.push(s.feed[0]); s.feed.push(s.feed[1]);
  espera('plano com 6 feeds reprovado', regras('plano-semanal', s, pacoteDe('07-caso-sem-autorizacao')).some((e) => /feed/i.test(e))); }
// 2. Caso clínico sem autorização sem bloqueio é reprovado.
{ const s = structuredClone(saidaDe('07-caso-sem-autorizacao')); s.feed[3].bloqueado_por = [];
  espera('caso sem autorização desbloqueado reprovado', regras('plano-semanal', s, pacoteDe('07-caso-sem-autorizacao')).length > 0); }
// 3. Dia sem rotina com oportunidade inventada é reprovado.
{ const s = structuredClone(saidaDe('02-dia-sem-rotina')); s.larissa.oportunidades = [{ acontecimento: 'Paciente emocionada', ideia: 'x', nivel: 'A', cuidado: 'x' }];
  espera('oportunidade inventada sem rotina reprovada', regras('direcionamento-diario', s, pacoteDe('02-dia-sem-rotina')).length > 0); }
// 4. "Sem tempo" com 2 gravações é reprovado.
{ const s = structuredClone(saidaDe('04-baixa-gravacao')); s.larissa.gravar.push(s.larissa.gravar[0]);
  espera('2 gravações em dia sem tempo reprovadas', regras('direcionamento-diario', s, pacoteDe('04-baixa-gravacao')).length > 0); }
// 5. Roteiro clínico sem pendência marcado como A é reprovado.
{ const s = structuredClone(saidaDe('08-info-clinica-incompleta')); s.nivel = 'A';
  espera('roteiro com lacuna clínica em nível A reprovado', regras('roteiro', s, pacoteDe('08-info-clinica-incompleta')).length > 0); }
// 6. Ação A em conteúdo travado é reprovada.
{ const erros = checarAcoes([{ nivel: 'A', tipo: 'atualizar_rascunho', base: 'conteudos', chave: 'trello:C-06', campos: [{ campo: 'corpo:Rascunho do agente', valor: 'x' }], quem_decide: null, motivo: 'x', fontes: ['trello:C-06'] }], { travadas: ['trello:C-06'], editadas: ['trello:C-06'] });
  espera('ação em conteúdo travado reprovada', erros.length > 0); }
// 7. Agente escrevendo campo humano protegido é reprovado.
{ const erros = checarAcoes([{ nivel: 'A', tipo: 'atualizar_dia', base: 'dias', chave: 'dia:2026-12-02', campos: [{ campo: 'Minha rotina', valor: 'inventado' }], quem_decide: null, motivo: 'x', fontes: ['x'] }], {});
  espera('escrita em "Minha rotina" reprovada', erros.length > 0); }
// 8. Seção Roteiro da equipe é intocável.
{ const erros = checarAcoes([{ nivel: 'A', tipo: 'atualizar_rascunho', base: 'conteudos', chave: 'trello:C-01', campos: [{ campo: 'corpo:Roteiro', valor: 'x' }], quem_decide: null, motivo: 'x', fontes: ['x'] }], {});
  espera('escrita em corpo:Roteiro reprovada', erros.length > 0); }
// 9. Ação B sem quem decide é reprovada.
{ const erros = checarAcoes([{ nivel: 'B', tipo: 'recomendar', base: 'recomendacoes', chave: 'agente:x:1', campos: [{ campo: 'Recomendação', valor: 'x' }], quem_decide: null, motivo: 'x', fontes: ['x'] }], {});
  espera('ação B sem quem_decide reprovada', erros.length > 0); }
// 10. Revisão mecânica pega os vícios proibidos.
for (const [nome, txt] of [['travessão', 'Eu olho a pele — sempre.'], ['não é sobre X, é sobre Y', 'Não é sobre preencher, é sobre planejar.'], ['Método LA', 'O Método LA™ começa pela pele.'], ['harmonização', 'Harmonização facial com naturalidade.'], ['promessa', 'Resultado garantido em 7 dias.']])
  espera(`revisão pega ${nome}`, !lint(txt, 'clinico').ok);
// 11. Schema reprova campo extra.
{ const s = structuredClone(saidaDe('06-repetitivo')); s.extra = 1;
  espera('schema reprova campo não previsto', validarSchema(s, SCHEMAS.roteiro).length > 0); }
// 12. Produção não aceita simulação.
{ let lancou = false; try { montarPacote('direcionamento-diario', aplicarPatch(base, cen('01-dia-normal').patch), { hoje: '2026-12-01', ambiente: 'producao' }); } catch { lancou = true; }
  const p = lancou ? null : montarPacote('direcionamento-diario', aplicarPatch(base, cen('01-dia-normal').patch), { hoje: '2026-12-01', ambiente: 'producao' });
  espera('produção sem nenhum registro de Simulação', lancou || !JSON.stringify(p).includes('sim:')); }
// 13. Radar: mesmo gancho recente = repetição excessiva.
{ const pub = base.conteudos.find((c) => c.chave === 'sim:pub:1');
  const r = radar({ ...pub, chave: 'novo', status: 'Planejado', publicado_em: null }, base.conteudos, '2026-11-30');
  espera('radar marca cópia recente como repetição excessiva', r.veredito === 'repeticao_excessiva'); }

console.log(`\n${n - falhas}/${n} guardas funcionando.`);
process.exitCode = falhas ? 1 : 0;
