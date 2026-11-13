// Read the world. Checks open the database read-only,
// and build it first if a fresh clone or CI has none.
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

// Checks ask the same queries many times, so each answer is kept after the first run.
const resultsBySql = new Map<string, Result>();

// Run one query read-only.
// The connection cannot write, so a learner's DELETE fails here instead of hurting the world.
export async function runSql(sql: string): Promise<Result> {
  const savedResult = resultsBySql.get(sql);
  if (savedResult) return savedResult;
  const database = await openDb();
  const statement = database.prepare(sql);
  const rows = statement.values() as unknown[][];
  const result = { columns: statement.columnNames, rows };
  resultsBySql.set(sql, result);
  return result;
}

export async function tryRunSql(sql: string): Promise<Result | null> {
  try {
    return await runSql(sql);
  } catch {
    return null;
  }
}

async function rowCount(table: string): Promise<number> {
  const database = await openDb();
  const counted = database.query(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
  return counted.n;
}

// The row count of every table, against the counts the pinned download must produce.
export async function worldIsIntact(): Promise<boolean> {
  for (const file of SOURCE.file) {
    if ((await rowCount(file.table)) !== file.rows) return false;
  }
  return true;
}
