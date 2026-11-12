// The golden set: questions, reference queries, accepted alternatives, and the trap labels.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../world/build";
import { rowsMatch } from "./compare";
import { runSql, tryRunSql } from "./db";

export type Question = {
  id: string;
  question: string;
  sql: string;
  accept?: string[];
  traps: string[];
  order_matters?: boolean;
  note?: string;
};

export const TRAP_LABELS = [
  "spelling",
  "customer-id",
  "fan-out",
  "undefined-metric",
  "date-text",
  "status-filter",
  "translation",
];
export const WORLD_GOLDEN = join(ROOT, "world", "golden.toml");

// A step folder may hold its own golden.toml (accept-many-answers edits one). Otherwise the world's is used.
export const goldenPathFor = (dir?: string) =>
  dir && existsSync(join(dir, "golden.toml")) ? join(dir, "golden.toml") : WORLD_GOLDEN;

export function loadGolden(path = WORLD_GOLDEN): Question[] {
  const parsed = Bun.TOML.parse(readFileSync(path, "utf8")) as { question?: Question[] };
  return (parsed.question ?? []).map((q) => ({
    ...q,
    traps: q.traps ?? [],
    accept: q.accept ?? [],
  }));
}

export type Judgement = { match: boolean; matchedBy: string | null };

// Judge an agent's rows against the reference query and every accepted alternative.
export async function judge(q: Question, rows: unknown[][]): Promise<Judgement> {
  const ref = await runSql(q.sql);
  if (rowsMatch(rows, ref.rows, q.order_matters)) return { match: true, matchedBy: "reference" };
  for (const [i, alt] of (q.accept ?? []).entries()) {
    const r = await tryRunSql(alt);
    if (r && rowsMatch(rows, r.rows, q.order_matters))
      return { match: true, matchedBy: `accept ${i + 1}` };
  }
  return { match: false, matchedBy: null };
}
