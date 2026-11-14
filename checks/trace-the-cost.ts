// trace-the-cost: every question leaves a trace with its time, tokens and cost, and a report reads them.
// The check runs the learner's trace.py with questions it makes up, and reads the JSON and the log file.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/02-lock-the-database/check-helpers";
import type { Rule } from "../scripts/verify";

const WORK = mkdtempSync(join(tmpdir(), "trace-the-cost-"));
const PRICE_IN = 3.0;
const PRICE_OUT = 15.0;

type Step = { name: string; seconds: number; tokens_in: number; tokens_out: number };
type Trace = {
  question?: string;
  seconds?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  slowest_step?: string | null;
};

const STEPS: Step[] = [
  { name: "route", seconds: 0.4, tokens_in: 300, tokens_out: 20 },
  { name: "write-sql", seconds: 2.1, tokens_in: 4000, tokens_out: 150 },
  { name: "answer", seconds: 1.2, tokens_in: 900, tokens_out: 300 },
];

function trace(folder: string, question: string, steps: Step[], log: string): Trace {
  const run = runPython(join(folder, "trace.py"), ["trace", "--log", log], {
    workFolder: WORK,
    databasePath: join(WORK, "not-used.db"),
    input: JSON.stringify({ question, steps }),
  });
  return (jsonOutput(run) ?? {}) as Trace;
}

const near = (a: number | undefined, b: number) => typeof a === "number" && Math.abs(a - b) < 1e-5;

// Eight questions with 1 to 8 seconds, so the 95th percentile by nearest rank is 8.
function eightQuestions(folder: string, log: string) {
  for (let i = 1; i <= 8; i++) {
    const step = { name: `step-${i}`, seconds: i, tokens_in: 1000 * i, tokens_out: 100 };
    trace(folder, `question ${i}`, [step], log);
  }
  const run = runPython(join(folder, "trace.py"), ["report", "--log", log], {
    workFolder: WORK,
    databasePath: join(WORK, "not-used.db"),
  });
  return (jsonOutput(run) ?? {}) as Record<string, unknown>;
}

export default [
  {
    says: "a trace adds up the seconds and the tokens over every step",
    test: (folder) => {
      const made = trace(folder, "Which sellers are late?", STEPS, join(WORK, "a.jsonl"));
      return near(made.seconds, 3.7) && made.tokens_in === 5200 && made.tokens_out === 470;
    },
    tryNext: "sum seconds, tokens_in and tokens_out over the steps",
  },
  {
    says: "the cost prices input and output tokens apart",
    test: (folder) => {
      const made = trace(folder, "Which sellers are late?", STEPS, join(WORK, "b.jsonl"));
      return near(made.cost_usd, (5200 / 1e6) * PRICE_IN + (470 / 1e6) * PRICE_OUT);
    },
    tryNext: "use PRICE_IN_PER_MILLION for tokens_in and PRICE_OUT_PER_MILLION for tokens_out",
  },
  {
    says: "the trace names the slowest step, and a question with no steps does not crash",
    test: (folder) => {
      const made = trace(folder, "Which sellers are late?", STEPS, join(WORK, "c.jsonl"));
      const empty = trace(folder, "A question with no steps", [], join(WORK, "c.jsonl"));
      return (
        made.slowest_step === "write-sql" && empty.slowest_step === null && empty.cost_usd === 0
      );
    },
    tryNext: "pick the step with the most seconds, and give None when the list is empty",
  },
  {
    says: "every question adds one line to the log",
    test: (folder) => {
      const log = join(WORK, "d.jsonl");
      trace(folder, "first", STEPS, log);
      trace(folder, "second", STEPS, log);
      if (!existsSync(log)) return false;
      const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
      return lines.length === 2 && JSON.parse(lines[1]).question === "second";
    },
    tryNext: "open the log in append mode so a new question never erases an old one",
  },
  {
    says: "the report gives the total cost and the slowest question",
    test: (folder) => {
      const report = eightQuestions(folder, join(WORK, "e.jsonl"));
      let total = 0;
      for (let i = 1; i <= 8; i++) total += ((1000 * i) / 1e6) * PRICE_IN + (100 / 1e6) * PRICE_OUT;
      return (
        report.questions === 8 &&
        report.slowest_question === "question 8" &&
        near(report.total_cost_usd as number, total)
      );
    },
    tryNext: "add cost_usd over the log lines and take the question with the most seconds",
  },
  {
    says: "the report gives the 95th percentile of seconds, not the average",
    test: (folder) => {
      const report = eightQuestions(folder, join(WORK, "f.jsonl"));
      return report.p95_seconds === 8;
    },
    tryNext: "sort the seconds and take index ceil(0.95 * count) - 1",
  },
] satisfies Rule[];
