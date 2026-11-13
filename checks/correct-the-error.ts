// correct-the-error: on a SQL error or an empty result, the agent shows the model the error,
// rewrites the query and tries again, at most twice.
// The check runs retry.py on 5 questions whose first query is broken on purpose, 3 times,
// judges each answer's rows against the golden reference, and counts the queries in the ledger.
import { KIT, runStep, type StepRun } from "../parts/05-build-the-loop/kit";
import type { Rule } from "../scripts/verify";
import { judge, loadGolden } from "./lib/golden";

const QUESTIONS = KIT.broken.map((item) => item.question);
const RUNS = 3;
const FEWEST_MATCHES = 4;
const MOST_QUERIES_PER_QUESTION = 3;

// Model behaviour is judged over 3 fresh runs; every rule must hold in each of them.
const savedRuns = new Map<string, StepRun[]>();

function threeRuns(folder: string): StepRun[] {
  const saved = savedRuns.get(folder);
  if (saved) return saved;
  const runs: StepRun[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(runStep("correct-the-error", folder, QUESTIONS));
  savedRuns.set(folder, runs);
  return runs;
}

function ledgerFor(run: StepRun, question: string, kind: string) {
  return run.ledger.filter((entry) => entry.question === question && entry.kind === kind);
}

async function matchesIn(run: StepRun): Promise<number> {
  const golden = loadGolden();
  let matches = 0;
  for (const question of QUESTIONS) {
    const reference = golden.find((item) => item.question === question);
    const printed = run.printed.find((line) => line.question === question);
    if (!reference || !printed || printed.error) continue;
    const judgement = await judge(reference, printed.rows as unknown[][]);
    if (judgement.match) matches += 1;
  }
  return matches;
}

export default [
  {
    says: "retry.py prints one answer for each of the 5 questions",
    test: (folder) =>
      threeRuns(folder).every((run) =>
        QUESTIONS.every((question) => run.printed.some((line) => line.question === question)),
      ),
    tryNext: "keep main() as it is; answer() must return a dictionary for every question",
  },
  {
    says: "every query goes through kit.run_query, so the ledger shows it",
    test: (folder) =>
      threeRuns(folder).every((run) =>
        QUESTIONS.every((question) => ledgerFor(run, question, "query").length > 0),
      ),
    tryNext: "run each query with kit.run_query(question, sql), not with your own connection",
  },
  {
    says: "at least 4 of the 5 answers match the reference rows, in each of 3 runs",
    test: async (folder) => {
      for (const run of threeRuns(folder)) {
        if ((await matchesIn(run)) < FEWEST_MATCHES) return false;
      }
      return true;
    },
    tryNext:
      "when kit.run_query raises kit.SqlError or returns no rows, " +
      "call kit.rewrite(question, sql, error) and run the new query",
  },
  {
    says: "no question runs more than 3 queries: the first try and at most 2 retries",
    test: (folder) =>
      threeRuns(folder).every((run) =>
        QUESTIONS.every(
          (question) => ledgerFor(run, question, "query").length <= MOST_QUERIES_PER_QUESTION,
        ),
      ),
    tryNext: "stop after MAX_RETRIES = 2 rewrites and return the error instead",
  },
  {
    says: "every rewrite request carries the error it should fix",
    test: (folder) =>
      threeRuns(folder).every((run) =>
        run.ledger
          .filter((entry) => entry.kind === "rewrite")
          .every((entry) => String(entry.error ?? "").trim() !== ""),
      ),
    tryNext: "pass the database's message (or kit.NO_ROWS) as the third argument of kit.rewrite",
  },
] satisfies Rule[];
