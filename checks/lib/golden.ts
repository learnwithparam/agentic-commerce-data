// The golden set: questions, reference queries, accepted alternatives, and the trap labels.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../world/build";
import { rowsMatch } from "./compare";
import { runSql, tryRunSql } from "./db";

// golden.toml spells this key with an underscore, so it keeps that spelling here.
type KeysWithUnderscores = Partial<Record<"order_matters", boolean>>;

export type Question = KeysWithUnderscores & {
  id: string;
  question: string;
  sql: string;
  accept?: string[];
  traps: string[];
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

// A step folder may hold its own golden.toml (accept-many-answers edits one).
// Otherwise the world's is used.
export function goldenPathFor(folder?: string): string {
  if (folder && existsSync(join(folder, "golden.toml"))) return join(folder, "golden.toml");
  return WORLD_GOLDEN;
}

export function loadGolden(path = WORLD_GOLDEN): Question[] {
  const text = readFileSync(path, "utf8");
  const parsed = Bun.TOML.parse(text) as { question?: Question[] };
  const questions = parsed.question ?? [];
  return questions.map((question) => ({
    ...question,
    traps: question.traps ?? [],
    accept: question.accept ?? [],
  }));
}

export type Judgement = { match: boolean; matchedBy: string | null };

// Judge an agent's rows against the reference query and every accepted alternative.
export async function judge(question: Question, rows: unknown[][]): Promise<Judgement> {
  const orderMatters = question.order_matters;
  const reference = await runSql(question.sql);
  if (rowsMatch(rows, reference.rows, orderMatters)) {
    return { match: true, matchedBy: "reference" };
  }
  const alternatives = question.accept ?? [];
  for (const [i, alternativeSql] of alternatives.entries()) {
    const alternative = await tryRunSql(alternativeSql);
    if (alternative && rowsMatch(rows, alternative.rows, orderMatters)) {
      return { match: true, matchedBy: `accept ${i + 1}` };
    }
  }
  return { match: false, matchedBy: null };
}
