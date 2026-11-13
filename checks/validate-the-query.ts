// validate-the-query: the validator refuses every attack in checks/attacks.toml with a reason,
// lets all 30 golden reference queries through unchanged in meaning, and caps the rows.
// The check runs the learner's validator.py once with --batch and judges what it prints.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/02-lock-the-database/check-helpers";
import type { Rule } from "../scripts/verify";
import { rowsMatch } from "./lib/compare";
import { runSql, tryRunSql } from "./lib/db";
import { loadGolden } from "./lib/golden";

type Verdict = { ok?: boolean; sql?: string; reason?: string };

const ATTACKS_FILE = join(import.meta.dir, "attacks.toml");
const attacks = (
  Bun.TOML.parse(readFileSync(ATTACKS_FILE, "utf8")) as { attack: { sql: string }[] }
).attack;
const golden = loadGolden();

const NO_LIMIT = "SELECT * FROM geolocation";
const UNION_NO_LIMIT = "SELECT * FROM geolocation UNION ALL SELECT * FROM geolocation";
const OWN_LIMIT = "SELECT seller_id FROM sellers LIMIT 5";
const ROW_CAP = 1000;

const allQueries = [
  ...attacks.map((attack) => attack.sql),
  ...golden.map((question) => question.sql),
];
allQueries.push(NO_LIMIT, UNION_NO_LIMIT, OWN_LIMIT);

// One run per folder; every rule reads the same answers.
const verdictsByFolder = new Map<string, Verdict[] | null>();

function verdicts(folder: string): Verdict[] {
  if (!verdictsByFolder.has(folder)) {
    const run = runPython(join(folder, "validator.py"), ["--batch"], {
      workFolder: folder,
      databasePath: "",
      input: JSON.stringify(allQueries),
    });
    const printed = jsonOutput(run);
    const usable = Array.isArray(printed) && printed.length === allQueries.length;
    verdictsByFolder.set(folder, usable ? (printed as Verdict[]) : null);
  }
  const found = verdictsByFolder.get(folder);
  if (!found) throw new Error("validator.py --batch did not print one answer per query");
  return found;
}

const verdictFor = (folder: string, sql: string) => verdicts(folder)[allQueries.indexOf(sql)];

const hasReason = (verdict: Verdict) =>
  verdict.ok === false && (verdict.reason ?? "").trim().split(/\s+/).length >= 2;

async function rowsOf(verdict: Verdict) {
  if (!verdict.ok || !verdict.sql) return null;
  return tryRunSql(verdict.sql);
}

// Counting inside SQLite is fast even when a query would return a million rows.
async function rowCountOf(verdict: Verdict): Promise<number | null> {
  if (!verdict.ok || !verdict.sql) return null;
  const counted = await tryRunSql(`SELECT COUNT(*) FROM (${verdict.sql})`);
  return counted ? Number(counted.rows[0][0]) : null;
}

export default [
  {
    says: "validator.py --batch prints one answer for every query it reads",
    test: (folder) => verdicts(folder).length === allQueries.length,
    tryNext: "keep the --batch code at the bottom of validator.py as it is",
  },
  {
    says: `all ${attacks.length} attacks in checks/attacks.toml are refused, each with a reason`,
    test: (folder) => attacks.every((attack) => hasReason(verdictFor(folder, attack.sql))),
    tryNext:
      "parse with sqlglot and refuse anything that is not one SELECT on the nine tables; " +
      "run validator.py on each attack in checks/attacks.toml to see which one gets through",
  },
  {
    says: "all 30 golden reference queries pass the validator",
    test: (folder) => golden.every((question) => verdictFor(folder, question.sql).ok === true),
    tryNext: "a WITH clause and a table alias are fine; refuse only what the rules name",
  },
  {
    says: "each golden query, as the validator returns it, still gives the reference rows",
    test: async (folder) => {
      for (const question of golden) {
        const rows = await rowsOf(verdictFor(folder, question.sql));
        const reference = await runSql(question.sql);
        if (!rows || !rowsMatch(rows.rows, reference.rows, true)) return false;
      }
      return true;
    },
    tryNext: 'return tree.sql(dialect="sqlite") so the query keeps its meaning',
  },
  {
    says: `a query with no LIMIT, even a UNION, comes back with LIMIT ${ROW_CAP}`,
    test: async (folder) => {
      const plainCount = await rowCountOf(verdictFor(folder, NO_LIMIT));
      const unionCount = await rowCountOf(verdictFor(folder, UNION_NO_LIMIT));
      return plainCount === ROW_CAP && unionCount === ROW_CAP;
    },
    tryNext:
      "when a query has no limit, add one: tree = tree.limit(ROW_CAP). " +
      "Check isinstance(tree, exp.Query), so a UNION gets the limit too",
  },
  {
    says: "a query that has its own LIMIT keeps it",
    test: async (folder) => {
      return (await rowCountOf(verdictFor(folder, OWN_LIMIT))) === 5;
    },
    tryNext: 'add a limit only when tree.args.get("limit") is empty',
  },
] satisfies Rule[];
