// Scored runs: what `bun run score` writes and what the checks read back.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rowsMatch } from "./compare";
import { tryRunSql } from "./db";
import type { Question } from "./golden";
import { judge } from "./golden";

export type SqlRun = { id: string; text: string };

// The run's JSON file spells these two keys with underscores, so they keep that spelling here.
type KeysWithUnderscores = Record<"rows_from" | "matched_by", string | null>;

export type RunResult = KeysWithUnderscores & {
  id: string;
  question: string;
  sql: SqlRun[];
  columns: string[];
  rows: unknown[][];
  refused: boolean;
  error: string | null;
  match: boolean;
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

export function readRun(folder: string, name: string): Run | null {
  const path = join(folder, "runs", `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Run;
  } catch {
    return null;
  }
}

// The query whose rows the agent reported.
// A check re-runs this, so a number cannot be typed in by hand.
export function reportedQuery(result: RunResult): string | null {
  const reported = result.sql.find((sqlRun) => sqlRun.id === result.rows_from);
  return reported?.text ?? null;
}

export async function rowsComeFromTheirQuery(result: RunResult): Promise<boolean> {
  if (result.refused || result.error) return result.rows.length === 0;
  const sql = reportedQuery(result);
  if (!sql) return false;
  const again = await tryRunSql(sql);
  if (again === null) return false;
  return again.rows.length === result.rows.length && rowsMatch(result.rows, again.rows, true);
}

// The ids that fail when the check judges the run itself,
// ignoring the match flags written in the file.
export async function failedIds(run: Run, golden: Question[]): Promise<string[]> {
  const failed: string[] = [];
  for (const question of golden) {
    const result = run.results.find((candidate) => candidate.id === question.id);
    if (!(await answeredRight(question, result))) failed.push(question.id);
  }
  return failed;
}

async function answeredRight(question: Question, result: RunResult | undefined) {
  if (!result || result.refused || result.error) return false;
  const judgement = await judge(question, result.rows);
  return judgement.match;
}
