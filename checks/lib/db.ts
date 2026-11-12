// Read the world. Checks open the database read-only and build it first if a fresh clone or CI has none.
import { Database } from "bun:sqlite";
import { ensureWorld, SOURCE } from "../../world/build";

let db: Database | undefined;

export async function openDb(): Promise<Database> {
  if (db) return db;
  const path = await ensureWorld(true);
  db = new Database(path, { readonly: true });
  return db;
}

export type Result = { columns: string[]; rows: unknown[][] };
const cache = new Map<string, Result>();

// Run one query read-only. The connection cannot write, so a learner's DELETE fails here instead of hurting the world.
export async function runSql(sql: string): Promise<Result> {
  const hit = cache.get(sql);
  if (hit) return hit;
  const stmt = (await openDb()).prepare(sql);
  const rows = stmt.values() as unknown[][];
  const out = { columns: stmt.columnNames, rows };
  cache.set(sql, out);
  return out;
}

export async function tryRunSql(sql: string): Promise<Result | null> {
  try {
    return await runSql(sql);
  } catch {
    return null;
  }
}

// The row count of every table, against the counts the pinned download must produce.
export async function worldIsIntact(): Promise<boolean> {
  const d = await openDb();
  return SOURCE.file.every(
    (f) =>
      (d.query(`SELECT COUNT(*) AS n FROM "${f.table}"`).get() as { n: number }).n ===
      (f as any).rows,
  );
}
