// node test/trello-plano.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planejar, norm } from '../scripts/trello-plano.mjs';
import { loadAll } from '../scripts/lib/schema.mjs';
const board = JSON.parse(readFileSync(new URL('./trello-fixture.json', import.meta.url)));
const p = planejar(board, loadAll().inventario.conteudos);
assert.equal(norm('Carrossel: "Não indico"'), 'nao indico');
assert.deepEqual(p.casados.map((c) => c.chave).sort(), ['trello:C-01', 'trello:C-02']);
assert.equal(p.casados.find((c) => c.chave === 'trello:C-01').checklists[0].itens.length, 1);
assert.equal(p.casados.find((c) => c.chave === 'trello:C-01').anexos.length, 1);
assert.equal(p.casados.find((c) => c.chave === 'trello:C-02').comentarios.length, 1);
assert.ok(p.novos.some((n) => n.id_cartao === 'c3'), 'cartão sem par vira novo');
assert.ok(p.revisar.some((r) => r.id_cartao === 'c4'), 'título genérico vai para revisão, não é casado');
assert.equal(p.ignorados.length, 1);
console.log('trello-plano: 8 asserções ok');
