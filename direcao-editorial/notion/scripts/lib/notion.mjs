// Cliente mínimo da API do Notion. Sem dependências (Node 18+).
// - Lê NOTION_TOKEN do ambiente ou de notion/.env (nunca do código, nunca impresso).
// - Respeita ~3 req/s (limite por conexão nos planos não Business) e Retry-After em 429/529.
// - Erros são sanitizados: o token nunca aparece em mensagens.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOTION_DIR } from './schema.mjs';

const API = 'https://api.notion.com/v1';
const STATE_FILE = join(NOTION_DIR, '.state', 'notion-ids.json');

export function loadEnv() {
  const envPath = join(NOTION_DIR, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

export function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { databases: {}, pages: {}, views: {} };
}
export function saveState(state) {
  mkdirSync(join(NOTION_DIR, '.state'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class NotionClient {
  constructor({ token, version, minIntervalMs = 350 }) {
    if (!token) throw new Error('NOTION_TOKEN ausente. Defina no ambiente ou em notion/.env (ver notion/06-Configuracao.md).');
    this.token = token;
    this.version = version;
    this.minIntervalMs = minIntervalMs;
    this.last = 0;
    this.calls = 0;
  }

  async request(method, path, body, attempt = 1) {
    const wait = this.last + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    this.calls++;
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': this.version,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt <= 5) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      return this.request(method, path, body, attempt + 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(json.message || res.statusText).split(this.token).join('[token]');
      const err = new Error(`${method} ${path} → ${res.status} ${json.code || ''}: ${msg}`);
      err.status = res.status;
      err.code = json.code;
      throw err;
    }
    return json;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }

  /** Busca páginas de um data source pela propriedade Chave (deduplicação). */
  async findByKey(dataSourceId, key) {
    const r = await this.post(`/data_sources/${dataSourceId}/query`, {
      filter: { property: 'Chave', rich_text: { equals: key } },
      page_size: 2,
    });
    return r.results || [];
  }
}
