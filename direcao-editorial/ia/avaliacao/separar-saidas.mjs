// Separa avaliacao/saidas-fonte.json em avaliacao/saidas/<id>.json (formato lido por avaliar.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = JSON.parse(readFileSync(join(AQUI, 'saidas-fonte.json'), 'utf8'));
const dir = join(AQUI, 'saidas');
mkdirSync(dir, { recursive: true });
let n = 0;
for (const [id, saida] of Object.entries(fonte)) {
  if (id.startsWith('$')) continue;
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ gerado_por: 'Claude Opus 5.5 nesta sessão de desenvolvimento, seguindo ia/prompts (não via API de produção)', cenario: id, saida }, null, 2));
  n++;
}
console.log(`${n} saídas gravadas em avaliacao/saidas/`);
