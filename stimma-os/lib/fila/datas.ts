/**
 * Datas como texto ISO (AAAA-MM-DD), sem fuso: evita o erro clássico de `new Date("2026-10-15")`
 * virar o dia anterior em UTC-3. Toda aritmética usa componentes locais.
 */
const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDiaIso(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_DIA.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function paraIso(dt: Date): string {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return paraIso(new Date(y, m - 1, d + dias));
}

/** Meses de calendário, ajustando para o último dia válido do mês (31/08 + 6 = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const alvo = new Date(y, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return paraIso(alvo);
}

/** Dia de hoje no fuso da clínica. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return partes; // en-CA já sai como AAAA-MM-DD
}
