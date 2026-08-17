/**
 * Fake mínimo do cliente Supabase, só com o que run-sync.ts usa
 * (from/select/insert/update/eq/maybeSingle/single). Existe para testar o
 * Sync Engine de ponta a ponta SEM tocar o banco real — nunca criar dado de
 * teste no projeto de produção (ver docs/SECURITY.md).
 */
export function createFakeSupabase() {
  const tables = new Map<string, Record<string, any>[]>();
  let nextId = 1;

  function table(name: string) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  function from(name: string) {
    const rows = table(name);
    let filters: Array<[string, any]> = [];
    let pendingInsert: Record<string, any> | null = null;
    let pendingUpdate: Record<string, any> | null = null;
    let selectCalled = false;

    function applyFilters(candidates: Record<string, any>[]) {
      return candidates.filter((row) => filters.every(([col, val]) => row[col] === val));
    }

    const builder: any = {
      select(_cols?: string) {
        selectCalled = true;
        return builder;
      },
      eq(col: string, val: any) {
        filters.push([col, val]);
        return builder;
      },
      insert(obj: Record<string, any>) {
        pendingInsert = { id: `id-${nextId++}`, ...obj };
        rows.push(pendingInsert);
        return builder;
      },
      update(obj: Record<string, any>) {
        pendingUpdate = obj;
        return builder;
      },
      async maybeSingle() {
        if (pendingUpdate) {
          const match = applyFilters(rows);
          match.forEach((row) => Object.assign(row, pendingUpdate));
          return { data: match[0] ?? null, error: null };
        }
        const match = applyFilters(rows);
        return { data: match[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return { data: pendingInsert, error: null };
        const match = applyFilters(rows);
        return { data: match[0] ?? null, error: null };
      },
      then(resolve: any) {
        if (pendingUpdate) {
          const match = applyFilters(rows);
          match.forEach((row) => Object.assign(row, pendingUpdate));
          return resolve({ data: match, error: null });
        }
        if (pendingInsert) {
          return resolve({ data: [pendingInsert], error: null });
        }
        const match = filters.length ? applyFilters(rows) : rows;
        return resolve({ data: selectCalled ? match : match, error: null });
      },
    };

    return builder;
  }

  return { from, _tables: tables };
}
