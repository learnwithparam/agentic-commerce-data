// score-the-naive-agent: a scored run of the naive agent on every golden question.
// The check re-runs every query the agent ran and judges every answer itself;
// it trusts no flag in the file.
import type { Rule } from "../scripts/verify";
import { goldenPathFor, judge, loadGolden, type Question } from "./lib/golden";
import {
  type Run,
  type RunResult,
  readRun,
  reportedQuery,
  rowsComeFromTheirQuery,
} from "./lib/runs";

const golden = (folder: string) => loadGolden(goldenPathFor(folder));

// Every rule after the first needs the run; a missing run fails the rule.
function naiveRun(folder: string): Run {
  const run = readRun(folder, "naive");
  if (!run) throw new Error("runs/naive.json is missing or is not valid JSON");
  return run;
}

function sortedIds(items: { id: string }[]): string {
  const ids = items.map((item) => item.id);
  ids.sort();
  return ids.join();
}

// What the match flag should say, worked out from the rows instead of read from the file.
async function trueMatch(question: Question, result: RunResult): Promise<boolean> {
  if (result.error || result.refused) return false;
  const judgement = await judge(question, result.rows);
  return judgement.match;
}

export default [
  {
    says: "runs/naive.json exists and is valid JSON",
    test: (folder) => readRun(folder, "naive") !== null,
    tryNext: "run bun run score naive --for score-the-naive-agent",
  },
  {
    says: "it has one result for every golden question",
    test: (folder) => {
      const run = naiveRun(folder);
      return sortedIds(run.results) === sortedIds(golden(folder));
    },
    tryNext: "let the scorer finish all the questions; do not stop it or edit the file",
  },
  {
    says: "every answer names the SQL query its rows came from",
    test: (folder) =>
      naiveRun(folder).results.every(
        (result) => result.error || result.refused || reportedQuery(result) !== null,
      ),
    tryNext:
      "score the agent through its contract " +
      "(uv run ask-naive --json prints sql and rows_from), not by hand",
  },
  {
    says: "re-running each recorded query on the database gives the recorded rows",
    test: async (folder) => {
      for (const result of naiveRun(folder).results) {
        if (!(await rowsComeFromTheirQuery(result))) return false;
      }
      return true;
    },
    tryNext:
      "rows must come from the query the agent ran; run the scorer again instead of editing rows",
  },
  {
    says: "every match flag agrees with a row comparison against the reference query",
    test: async (folder) => {
      const questions = golden(folder);
      for (const result of naiveRun(folder).results) {
        const question = questions.find((candidate) => candidate.id === result.id);
        if (!question) return false;
        if ((await trueMatch(question, result)) !== result.match) return false;
      }
      return true;
    },
    tryNext:
      "judge by result rows, never by comparing SQL text; the scorer in scripts/score.ts does this",
  },
  {
    says: "the score line counts the matches",
    test: (folder) => {
      const run = naiveRun(folder);
      const matched = run.results.filter((result) => result.match).length;
      return run.score.matched === matched && run.score.total === run.results.length;
    },
    tryNext: "do not edit the score by hand; run the scorer again",
  },
] satisfies Rule[];
