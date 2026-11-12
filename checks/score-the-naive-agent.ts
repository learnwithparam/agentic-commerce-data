// score-the-naive-agent: a scored run of the naive agent on every golden question.
// The check re-runs every query the agent ran and judges every answer itself; it trusts no flag in the file.
import type { Rule } from "../scripts/verify";
import { goldenPathFor, judge, loadGolden } from "./lib/golden";
import { readRun, reportedQuery, rowsComeFromTheirQuery } from "./lib/runs";

const golden = (d: string) => loadGolden(goldenPathFor(d));

export default [
  {
    says: "runs/naive.json exists and is valid JSON",
    test: (d) => readRun(d, "naive") !== null,
    tryNext: "run bun run score naive --for score-the-naive-agent",
  },
  {
    says: "it has one result for every golden question",
    test: (d) => {
      const run = readRun(d, "naive")!;
      const ids = run.results.map((r) => r.id).sort().join();
      return ids === golden(d).map((q) => q.id).sort().join();
    },
    tryNext: "let the scorer finish all the questions; do not stop it or edit the file",
  },
  {
    says: "every answer names the SQL query its rows came from",
    test: (d) => readRun(d, "naive")!.results.every((r) => r.error || r.refused || reportedQuery(r) !== null),
    tryNext: "score the agent through its contract (uv run ask-naive --json prints sql and rows_from), not by hand",
  },
  {
    says: "re-running each recorded query on the database gives the recorded rows",
    test: async (d) => {
      for (const r of readRun(d, "naive")!.results) if (!(await rowsComeFromTheirQuery(r))) return false;
      return true;
    },
    tryNext: "rows must come from the query the agent ran; run the scorer again instead of editing rows",
  },
  {
    says: "every match flag agrees with a row comparison against the reference query",
    test: async (d) => {
      const g = golden(d);
      for (const r of readRun(d, "naive")!.results) {
        const q = g.find((x) => x.id === r.id);
        if (!q) return false;
        const truth = r.error || r.refused ? false : (await judge(q, r.rows)).match;
        if (truth !== r.match) return false;
      }
      return true;
    },
    tryNext: "judge by result rows, never by comparing SQL text; the scorer in scripts/score.ts does this",
  },
  {
    says: "the score line counts the matches",
    test: (d) => {
      const run = readRun(d, "naive")!;
      return run.score.matched === run.results.filter((r) => r.match).length && run.score.total === run.results.length;
    },
    tryNext: "do not edit the score by hand; run the scorer again",
  },
] satisfies Rule[];
