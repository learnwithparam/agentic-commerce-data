// Scored runs: what `bun run score` writes and what the checks read back.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rowsMatch } from "./compare";
import { tryRunSql } from "./db";
import type { Question } from "./golden";
import { judge } from "./golden";

export type SqlRun = { id: string; text: string };
export type RunResult = {
  id: string;
  question: string;
  sql: SqlRun[];
  rows_from: string | null;
  columns: string[];
  rows: unknown[][];
  refused: boolean;
  error: string | null;
  match: boolean;
  matched_by: string | null;
};
export type Run = {
  version: number;
  agent: string;
  command: string;
  provider: string;
  golden: string;
  results: RunResult[];
  score: { matched: number; total: number };
};

export function readRun(dir: string, name: string): Run | null {
  const p = join(dir, "runs", `${name}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as Run; } catch { return null; }
}

// The query whose rows the agent reported. A check re-runs this, so a number cannot be typed in by hand.
export const reportedQuery = (r: RunResult) => r.sql.find((s) => s.id === r.rows_from)?.text ?? null;

export async function rowsComeFromTheirQuery(r: RunResult): Promise<boolean> {
  if (r.refused || r.error) return r.rows.length === 0;
  const sql = reportedQuery(r);
  if (!sql) return false;
  const again = await tryRunSql(sql);
  return again !== null && again.rows.length === r.rows.length && rowsMatch(r.rows, again.rows, true);
}

// The ids that fail when the check judges the run itself, ignoring the match flags written in the file.
export async function failedIds(run: Run, golden: Question[]): Promise<string[]> {
  const out: string[] = [];
  for (const q of golden) {
    const r = run.results.find((x) => x.id === q.id);
    if (!r || r.refused || r.error || !(await judge(q, r.rows)).match) out.push(q.id);
  }
  return out;
}
