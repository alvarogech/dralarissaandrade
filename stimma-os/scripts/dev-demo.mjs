// Sobe o STIMMA OS em modo demonstração (porta 3101), sem tocar o Supabase de produção.
// O @next/env não sobrescreve variável que já existe no ambiente — nem vazia — então as chaves
// do Supabase entram vazias e o .env.local (que aponta para produção) não tem efeito sobre elas.
// Toda tela/rota da fila cai na store em memória com dados fictícios.
// Uso: npm run dev:demo
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };
const next = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [next, "dev", "-p", "3101"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
