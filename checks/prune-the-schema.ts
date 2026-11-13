// prune-the-schema: for each golden question, the learner's prune.py picks the table cards the
// SQL writer needs. The picks must cover every table of the reference SQL for at least 27 of the
// 30 questions. No question gets more than 4 tables, the average is 3 or fewer, and the picks must
// change with the question. Any way of choosing passes; only the picks count.
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/04-retrieve-the-context/check-helpers";
import type { Rule } from "../scripts/verify";
import { SOURCE } from "../world/build";
import { loadGolden, type Question } from "./lib/golden";

const TABLES: string[] = SOURCE.file.map((file: { table: string }) => file.table);
const MOST_TABLES = 4;
const NEEDED_MATCHES = 27;
const MOST_ON_AVERAGE = 3;
const golden = loadGolden();

// The tables a reference query reads: every name after FROM or JOIN.
function tablesOf(question: Question): string[] {
  return TABLES.filter((table) =>
    new RegExp(`\\b(FROM|JOIN)\\s+${table}\\b`, "i").test(question.sql),
  );
}

const picksByFolder = new Map<string, string[][]>();

function picks(folder: string): string[][] {
  const saved = picksByFolder.get(folder);
  if (saved) return saved;
  const run = runPython(join(folder, "prune.py"), ["--batch"], {
    input: JSON.stringify(golden.map((question) => question.question)),
  });
  const printed = jsonOutput(run);
  if (!Array.isArray(printed) || printed.length !== golden.length) {
    throw new Error("prune.py --batch did not print one list per question");
  }
  picksByFolder.set(folder, printed as string[][]);
  return printed as string[][];
}

function covered(folder: string): number {
  const allPicks = picks(folder);
  let count = 0;
  golden.forEach((question, i) => {
    if (tablesOf(question).every((table) => allPicks[i].includes(table))) count++;
  });
  return count;
}

export default [
  {
    says: "prune.py --batch prints a list of tables for every golden question",
    test: (folder) => picks(folder).length === golden.length,
    tryNext: "keep the --batch code at the bottom of prune.py as it is",
  },
  {
    says: "every pick is a real table name",
    test: (folder) =>
      picks(folder).every((tables) => tables.every((name) => TABLES.includes(name))),
    tryNext: "return the card names without .md, for example order_items",
  },
  {
    says: `no question gets more than ${MOST_TABLES} tables`,
    test: (folder) => picks(folder).every((tables) => tables.length <= MOST_TABLES),
    tryNext: "send only the best few cards; sending all nine is what you are fixing",
  },
  {
    says: `the picks hold ${MOST_ON_AVERAGE} tables or fewer per question on average`,
    test: (folder) => {
      const all = picks(folder);
      const total = all.reduce((sum, tables) => sum + tables.length, 0);
      return total / all.length <= MOST_ON_AVERAGE;
    },
    tryNext: "keep a table only if its score is close to the best score",
  },
  {
    says: "the picks change from question to question",
    test: (folder) => new Set(picks(folder).map((tables) => [...tables].sort().join(","))).size > 1,
    tryNext: "choose from the question's own words, not from a fixed list",
  },
  {
    says: `the picks cover every table of the reference SQL for ${NEEDED_MATCHES} of 30 questions`,
    test: (folder) => covered(folder) >= NEEDED_MATCHES,
    tryNext:
      "score each card by the words it shares with the question, " +
      "and add the words people ask with (late, GMV, stars) to the cards' Purpose",
  },
] satisfies Rule[];
