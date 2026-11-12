// bun run score [ask|naive|finished] [--for <step-name>] [--golden <file>]
// Runs an agent on every golden question through its CLI contract (`uv run <agent> "<question>" --json`),
// judges each answer by its rows against the reference query, and writes runs/<agent>.json.
// --for <step-name> writes into that step's problem/ folder, where `bun run verify <step-name>` reads it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { goldenPathFor, judge, loadGolden } from "../checks/lib/golden";
import type { Run, RunResult } from "../checks/lib/runs";
import { findStep, ROOT } from "./structure";

const AGENTS: Record<string, string[]> = {
  ask: ["uv", "run", "--quiet", "ask"],
  naive: ["uv", "run", "--quiet", "ask-naive"],
  finished: ["uv", "run", "--quiet", "ask-finished"],
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const forStep = flag("--for");
const goldenArg = flag("--golden");
const agent = args[0] ?? "ask";
if (!AGENTS[agent]) {
  console.log(
    `There is no agent called "${agent}". Use: bun run score ask, bun run score naive, bun run score finished.`,
  );
  process.exit(1);
}
let outDir = ROOT;
if (forStep) {
  const s = findStep(forStep);
  if (!s) {
    console.log(`There is no step called "${forStep}". Run bun run verify to list the steps.`);
    process.exit(1);
  }
  outDir = join(s.dir, "problem");
}
const goldenPath = goldenArg ? join(ROOT, goldenArg) : goldenPathFor(outDir);
const golden = loadGolden(goldenPath);

async function ask(question: string): Promise<Record<string, any>> {
  const proc = Bun.spawn([...AGENTS[agent], question, "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const line = out.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line);
  } catch {
    return {
      error: `the agent did not print one JSON object: ${(err || out).trim().split("\n").pop() ?? "no output"}`,
    };
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

console.log(
  `Scoring the ${agent} agent on ${golden.length} golden questions (${relative(ROOT, goldenPath)}).`,
);
const results: RunResult[] = new Array(golden.length);
let next = 0;
async function worker() {
  while (next < golden.length) {
    const i = next++;
    const q = golden[i];
    const a = await ask(q.question);
    const rows = Array.isArray(a.rows) ? a.rows : [];
    const verdict = a.error || a.refused ? { match: false, matchedBy: null } : await judge(q, rows);
    results[i] = {
      id: q.id,
      question: q.question,
      sql: a.sql ?? [],
      rows_from: a.rows_from ?? null,
      columns: a.columns ?? [],
      rows,
      refused: Boolean(a.refused),
      error: a.error ?? null,
      match: verdict.match,
      matched_by: verdict.matchedBy,
    };
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

for (const r of results) {
  const why = r.error
    ? `error: ${r.error}`
    : r.refused
      ? "refused"
      : r.match
        ? r.matched_by === "reference"
          ? ""
          : `(${r.matched_by})`
        : "rows differ from the reference";
  console.log(`  ${r.match ? "MATCH" : "MISS "}  ${r.id}  ${why}`.trimEnd());
}
const matched = results.filter((r) => r.match).length;
const run: Run = {
  version: 1,
  agent,
  command: AGENTS[agent].filter((x) => x !== "--quiet").join(" "),
  provider: process.env.LLM_PROVIDER || "replay",
  golden: relative(ROOT, goldenPath),
  results,
  score: { matched, total: results.length },
};
mkdirSync(join(outDir, "runs"), { recursive: true });
const out = join(outDir, "runs", `${agent}.json`);
writeFileSync(out, JSON.stringify(run, null, 2) + "\n");
console.log(`Score: ${matched} of ${results.length} match.`);
console.log(`Wrote ${relative(ROOT, out)}`);
if (results.some((r) => r.error))
  console.log(
    "Some questions ended in an error. Look them up in 00-orientation/troubleshooting.md.",
  );
