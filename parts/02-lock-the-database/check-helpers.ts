// Helpers the lock-the-database checks share.
// They make a small copy of the database, so a check can send a DELETE without hurting
// data/olist.db, and they run the learner's Python files the way a learner would.
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../checks/lib/db";
import { ROOT, SOURCE } from "../../world/build";

// Each table in the copy keeps this many rows. Enough to count, small enough to copy fast.
const ROWS_PER_TABLE = 200;

export const TABLES: string[] = SOURCE.file.map((file: { table: string }) => file.table);

function copyTable(source: Database, copy: Database, table: string) {
  const definition = source
    .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string };
  copy.run(definition.sql);
  const rows = source.query(`SELECT * FROM "${table}" LIMIT ${ROWS_PER_TABLE}`).values();
  if (rows.length === 0) return;
  const placeholders = rows[0].map(() => "?").join(", ");
  const insert = copy.prepare(`INSERT INTO "${table}" VALUES (${placeholders})`);
  for (const row of rows) insert.run(...(row as never[]));
}

// A fresh folder with sample.db inside: every table, with its first rows.
export async function sampleDatabase(): Promise<{ folder: string; path: string }> {
  const source = await openDb();
  const folder = mkdtempSync(join(tmpdir(), "lock-the-database-"));
  const path = join(folder, "sample.db");
  const copy = new Database(path, { create: true });
  // One transaction for the whole copy: SQLite then writes the file once, not once per row.
  copy.run("BEGIN");
  for (const table of TABLES) copyTable(source, copy, table);
  copy.run("COMMIT");
  copy.close();
  return { folder, path };
}

// The row count of every table, or null for a table that is gone.
export function rowCounts(path: string): Record<string, number | null> {
  const database = new Database(path, { readonly: true });
  const counts: Record<string, number | null> = {};
  for (const table of TABLES) {
    try {
      const counted = database.query(`SELECT COUNT(*) AS n FROM "${table}"`).get() as {
        n: number;
      };
      counts[table] = counted.n;
    } catch {
      counts[table] = null;
    }
  }
  database.close();
  return counts;
}

export const sameCounts = (before: object, after: object) =>
  JSON.stringify(before) === JSON.stringify(after);

export type PythonRun = { output: string; exitCode: number };

// Runs `uv run python <file> <arguments>` from the step folder the check was given.
// `workFolder` is the current folder for the run, so stray files land there, not in the repo.
export function runPython(
  file: string,
  commandArguments: string[],
  options: { workFolder: string; databasePath: string; input?: string },
): PythonRun {
  if (!existsSync(file)) return { output: "", exitCode: 2 };
  // Replay mode, so no key is needed, and the database path the check chose.
  const environment = { ...process.env };
  environment.LLM_PROVIDER = "replay";
  environment.OLIST_DB = options.databasePath;
  const command = ["uv", "run", "--quiet", "--project", ROOT, "python", file];
  const finished = Bun.spawnSync([...command, ...commandArguments], {
    cwd: options.workFolder,
    env: environment,
    stdin: options.input === undefined ? "ignore" : Buffer.from(options.input),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { output: new TextDecoder().decode(finished.stdout), exitCode: finished.exitCode };
}

// The last line a run printed, read as JSON, or null when it is not JSON.
export function jsonOutput(run: PythonRun): unknown {
  const lines = run.output.trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}
