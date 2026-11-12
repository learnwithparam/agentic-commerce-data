// bun run score [ask|naive|finished] [--for <step-name>] [--golden <file>]
// Runs an agent on every golden question through its CLI contract
// (`uv run <agent> "<question>" --json`), judges each answer by its rows against the
// reference query, and writes runs/<agent>.json.
// --for <step-name> writes into that step's problem/ folder,
// where `bun run verify <step-name>` reads it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { goldenPathFor, judge, loadGolden, type Question } from "../checks/lib/golden";
import type { Run, RunResult, SqlRun } from "../checks/lib/runs";
import { findStep, ROOT } from "./structure";

const AGENTS: Record<string, string[]> = {
  ask: ["uv", "run", "--quiet", "ask"],
  naive: ["uv", "run", "--quiet", "ask-naive"],
  finished: ["uv", "run", "--quiet", "ask-finished"],
};

// How many questions are asked at the same time.
const WORKERS = 6;

// The agents print, and the run file keeps, these two keys with underscores.
const ROWS_FROM = "rows_from";
const MATCHED_BY = "matched_by";

// What an agent prints with --json. Any field may be missing.
type AgentAnswer = Partial<Record<typeof ROWS_FROM, string | null>> & {
  sql?: SqlRun[];
  columns?: string[];
  rows?: unknown;
  refused?: boolean;
  error?: string;
};

const args = process.argv.slice(2);

// Takes a flag and its value out of the arguments, so what is left is the agent name.
function takeFlag(name: string): string | undefined {
  const position = args.indexOf(name);
  if (position < 0) return undefined;
  return args.splice(position, 2)[1];
}

const forStep = takeFlag("--for");
const goldenArg = takeFlag("--golden");
const agent = args[0] ?? "ask";
if (!AGENTS[agent]) {
  console.log(
    `There is no agent called "${agent}". ` +
      "Use: bun run score ask, bun run score naive, bun run score finished.",
  );
  process.exit(1);
}

function outputFolder(): string {
  if (!forStep) return ROOT;
  const step = findStep(forStep);
  if (!step) {
    console.log(`There is no step called "${forStep}". Run bun run verify to list the steps.`);
    process.exit(1);
  }
  return join(step.dir, "problem");
}

const outDir = outputFolder();
const goldenPath = goldenArg ? join(ROOT, goldenArg) : goldenPathFor(outDir);
const golden = loadGolden(goldenPath);

function lastLine(text: string): string | undefined {
  return text.trim().split("\n").pop();
}

async function ask(question: string): Promise<AgentAnswer> {
  const agentProcess = Bun.spawn([...AGENTS[agent], question, "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errorOutput] = await Promise.all([
    new Response(agentProcess.stdout).text(),
    new Response(agentProcess.stderr).text(),
  ]);
  await agentProcess.exited;
  const line = lastLine(output) ?? "";
  try {
    return JSON.parse(line);
  } catch {
    const lastWords = lastLine(errorOutput || output) ?? "no output";
    return { error: `the agent did not print one JSON object: ${lastWords}` };
  }
}

try {
  Bun.spawnSync(["uv", "--version"]);
} catch {
  console.log(
    "uv: command not found. Install uv from https://docs.astral.sh/uv/ and open a new terminal.",
  );
  process.exit(2);
}

async function scoreQuestion(question: Question): Promise<RunResult> {
  const answer = await ask(question.question);
  const rows = Array.isArray(answer.rows) ? answer.rows : [];
  // An error or a refusal is never a match, so there is nothing to judge.
  let verdict = { match: false, matchedBy: null as string | null };
  if (!(answer.error || answer.refused)) verdict = await judge(question, rows);
  return {
    id: question.id,
    question: question.question,
    sql: answer.sql ?? [],
    [ROWS_FROM]: answer[ROWS_FROM] ?? null,
    columns: answer.columns ?? [],
    rows,
    refused: Boolean(answer.refused),
    error: answer.error ?? null,
    match: verdict.match,
    [MATCHED_BY]: verdict.matchedBy,
  };
}

console.log(
  `Scoring the ${agent} agent on ${golden.length} golden questions ` +
    `(${relative(ROOT, goldenPath)}).`,
);
const results: RunResult[] = new Array(golden.length);
let nextQuestion = 0;

// Each worker takes the next unasked question until none are left.
async function worker() {
  while (nextQuestion < golden.length) {
    const i = nextQuestion++;
    results[i] = await scoreQuestion(golden[i]);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

function explain(result: RunResult): string {
  if (result.error) return `error: ${result.error}`;
  if (result.refused) return "refused";
  if (!result.match) return "rows differ from the reference";
  if (result[MATCHED_BY] === "reference") return "";
  return `(${result[MATCHED_BY]})`;
}

for (const result of results) {
  const label = result.match ? "MATCH" : "MISS ";
  console.log(`  ${label}  ${result.id}  ${explain(result)}`.trimEnd());
}
const matched = results.filter((result) => result.match).length;
const run: Run = {
  version: 1,
  agent,
  command: AGENTS[agent].filter((word) => word !== "--quiet").join(" "),
  provider: process.env.LLM_PROVIDER || "replay",
  golden: relative(ROOT, goldenPath),
  results,
  score: { matched, total: results.length },
};
mkdirSync(join(outDir, "runs"), { recursive: true });
const runPath = join(outDir, "runs", `${agent}.json`);
writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);
console.log(`Score: ${matched} of ${results.length} match.`);
console.log(`Wrote ${relative(ROOT, runPath)}`);
if (results.some((result) => result.error)) {
  console.log(
    "Some questions ended in an error. Look them up in 00-orientation/troubleshooting.md.",
  );
}
