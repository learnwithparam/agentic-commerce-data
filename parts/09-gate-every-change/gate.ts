// bun parts/09-gate-every-change/gate.ts --rules <your gate-rules.ts> [options]
//
// The gate. It asks an agent every golden question several times and every attack once,
// judges the answers by their rows, and hands the results to YOUR rules (gate-rules.ts).
// If your rules give no reason to block, the gate passes and writes SCORECARD.md.
//
// Options:
//   --agent finished        the desk agent (the default); fake:<kind> for a pretend agent
//   --golden <file>         the golden set (default world/golden.toml)
//   --metrics <file>        run the agent with this metrics.toml instead of its own
//   --scorecard <file>      where to write the scorecard (default SCORECARD.md)
// Exit codes: 0 the gate passes, 1 it blocks the change, 2 it could not run.
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { worldIsIntact } from "../../checks/lib/db";
import { judge, loadGolden, type Question, WORLD_GOLDEN } from "../../checks/lib/golden";
import { ROOT } from "../../scripts/structure";
import { type AgentCopy, applyMutant, type Mutant, makeAgentCopy, useMetrics } from "./agent-copy";
import { fakeAgent } from "./fake_agent";

const PART = import.meta.dir;
const ATTACKS_FILE = join(PART, "attacks.toml");
const DEFAULT_METRICS = join(ROOT, "desk", "finished", "metrics.toml");
const WORKERS = 6;
const PYTHON_PATH = "PYTHONPATH";
const NO_CACHE = "PYTHONDONTWRITEBYTECODE";

export type GoldenRun = { matched: number; total: number; missed: string[] };
export type AttackResult = { id: string; refused: boolean; reason: string };
// gate-rules.ts names its run count in capitals, as a constant.
type Rules = Record<"RUNS", number> & {
  decide: (runs: GoldenRun[], attacks: AttackResult[], traps: Record<string, string[]>) => string[];
};
export type GateOptions = {
  rulesFile: string;
  agent?: string;
  goldenPath?: string;
  metricsPath?: string;
  mutant?: Mutant;
  scorecardPath?: string;
  print?: boolean;
};
export type GateResult = {
  pass: boolean;
  reasons: string[];
  runs: GoldenRun[];
  attacks: AttackResult[];
  output: string[];
};

type AgentAnswer = { rows?: unknown; refused?: boolean; reason?: string | null; error?: string };
type Agent = { ask: (question: string) => Promise<AgentAnswer>; cleanUp: () => void };

// How to ask the agent: the desk agent in a copy you may change, or a pretend agent.
function prepareAgent(options: GateOptions): Agent {
  const agent = options.agent ?? "finished";
  if (agent.startsWith("fake:")) {
    return { ask: fakeAgent(agent.slice("fake:".length)), cleanUp: () => {} };
  }
  const copy: AgentCopy = makeAgentCopy();
  if (options.metricsPath) useMetrics(copy, options.metricsPath);
  if (options.mutant) applyMutant(copy, options.mutant);
  // Python finds the copy first, and writes no cache files into it.
  const settings = { [PYTHON_PATH]: copy.root, [NO_CACHE]: "1" };
  return { ask: (question) => askDeskAgent(settings, question), cleanUp: copy.remove };
}

// The answer contract: uv run ... desk_agent.py "<question>" --json prints one JSON object.
async function askDeskAgent(settings: Record<string, string>, question: string) {
  const command = ["uv", "run", "--quiet", "python", join(PART, "desk_agent.py")];
  const agentProcess = Bun.spawn([...command, question, "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...settings },
  });
  const output = await new Response(agentProcess.stdout).text();
  await agentProcess.exited;
  const lastLine = output.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(lastLine);
  } catch {
    return { error: "the agent did not print one JSON object" } as AgentAnswer;
  }
}

// Run one job per item, a few at a time, and keep the results in order.
async function eachAtOnce<Item, Result>(items: Item[], job: (item: Item) => Promise<Result>) {
  const results: Result[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const position = next++;
      results[position] = await job(items[position]);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return results;
}

async function answeredRight(agent: Agent, question: Question): Promise<boolean> {
  const answer = await agent.ask(question.question);
  if (answer.error || answer.refused || !Array.isArray(answer.rows)) return false;
  return (await judge(question, answer.rows)).match;
}

async function goldenRun(agent: Agent, golden: Question[]): Promise<GoldenRun> {
  const matches = await eachAtOnce(golden, (question) => answeredRight(agent, question));
  const missed = golden.filter((_, i) => !matches[i]).map((question) => question.id);
  return { matched: golden.length - missed.length, total: golden.length, missed };
}

type Attack = { id: string; question: string };

async function attackResults(agent: Agent): Promise<AttackResult[]> {
  const attacks = (Bun.TOML.parse(readFileSync(ATTACKS_FILE, "utf8")) as { attack: Attack[] })
    .attack;
  const results = await eachAtOnce(attacks, async (attack) => {
    const answer = await agent.ask(attack.question);
    return { id: attack.id, refused: answer.refused === true, reason: answer.reason ?? "" };
  });
  // A request that changed a table was not refused, whatever the agent said.
  if (!(await worldIsIntact())) return results.map((result) => ({ ...result, refused: false }));
  return results;
}

export function trapSlices(golden: Question[]): Record<string, string[]> {
  const slices: Record<string, string[]> = {};
  for (const question of golden) {
    for (const trap of question.traps) {
      slices[trap] ??= [];
      slices[trap].push(question.id);
    }
  }
  return slices;
}

function normalized(sql: string): string {
  const lowered = sql.toLowerCase();
  return lowered.replace(/\s+/g, " ").trim();
}

// A golden question tagged with a metric must use that metric's expression from metrics.toml.
export function driftProblems(goldenPath: string, metricsPath: string): string[] {
  const metrics = Bun.TOML.parse(readFileSync(metricsPath, "utf8")) as Record<
    string,
    { expression: string }
  >;
  const disagreeing: Record<string, string[]> = {};
  for (const question of loadGolden(goldenPath) as (Question & { metric?: string })[]) {
    if (!question.metric) continue;
    const expression = metrics[question.metric]?.expression ?? "(missing)";
    if (normalized(question.sql).includes(normalized(expression))) continue;
    disagreeing[question.metric] ??= [];
    disagreeing[question.metric].push(question.id);
  }
  return Object.entries(disagreeing).map(
    ([metric, ids]) =>
      `metric ${metric}: metrics.toml and golden.toml disagree on ${ids.join(", ")}. ` +
      "Change the definition and the golden references together.",
  );
}

function scorecard(result: GateResult, options: GateOptions): string {
  const scores = result.runs.map((run) => run.matched);
  const sorted = [...scores].sort((first, second) => first - second);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const total = result.runs[0]?.total ?? 0;
  const refused = result.attacks.filter((attack) => attack.refused).length;
  const rows = [
    `| Golden set, median of ${scores.length} runs | ${median} of ${total} |`,
    `| Each run | ${scores.join(", ")} |`,
    `| Attacks refused | ${refused} of ${result.attacks.length} |`,
    `| Gate | ${result.pass ? "pass" : "block"} |`,
  ];
  const provider = process.env.LLM_PROVIDER || "replay";
  const agent = options.agent ?? "finished";
  return [
    "# Scorecard",
    "",
    "| Measure | Result |",
    "| --- | --- |",
    ...rows,
    "",
    `Agent: ${agent}. Provider: ${provider}.`,
    "",
  ].join("\n");
}

async function loadRules(rulesFile: string): Promise<Rules> {
  return (await import(resolve(rulesFile))) as Rules;
}

function goldenSet(options: GateOptions): { path: string; questions: Question[] } {
  const path = options.goldenPath ?? WORLD_GOLDEN;
  return { path, questions: loadGolden(path) };
}

type Say = (line: string) => void;

// Ask the agent the attacks once and the golden set RUNS times, saying each score as it comes.
async function askEverything(agent: Agent, questions: Question[], runCount: number, say: Say) {
  const attacks = await attackResults(agent);
  const refused = attacks.filter((attack) => attack.refused).length;
  say(`  attacks: ${refused} of ${attacks.length} refused`);
  const runs: GoldenRun[] = [];
  for (let run = 1; run <= runCount; run++) {
    const result = await goldenRun(agent, questions);
    runs.push(result);
    // Name the misses, so a learner can see which questions drifted, not only how many.
    let missedNote = "";
    if (result.missed.length > 0) missedNote = `, missed: ${result.missed.join(", ")}`;
    say(`  run ${run}: ${result.matched} of ${result.total}${missedNote}`);
  }
  return { attacks, runs };
}

function sayVerdict(result: GateResult, scorecardPath: string | undefined, say: Say) {
  for (const reason of result.reasons) say(`  BLOCK  ${reason}`);
  if (!result.pass) {
    say(`The gate blocks this change: ${result.reasons.length} reason(s).`);
  } else if (scorecardPath) {
    say(`The gate passes. Wrote ${relative(process.cwd(), scorecardPath)}.`);
  } else {
    say("The gate passes.");
  }
}

export async function runGate(options: GateOptions): Promise<GateResult> {
  const rules = await loadRules(options.rulesFile);
  const golden = goldenSet(options);
  const output: string[] = [];
  const say: Say = (line) => {
    output.push(line);
    if (options.print) console.log(line);
  };
  const drift = driftProblems(golden.path, options.metricsPath ?? DEFAULT_METRICS);
  const agent = prepareAgent(options);
  say(`Gate on the ${options.agent ?? "finished"} agent: ${relative(ROOT, golden.path)}.`);
  let answers: { attacks: AttackResult[]; runs: GoldenRun[] };
  try {
    answers = await askEverything(agent, golden.questions, rules.RUNS, say);
  } finally {
    agent.cleanUp();
  }
  const { attacks, runs } = answers;
  const reasons = [...drift, ...rules.decide(runs, attacks, trapSlices(golden.questions))];
  const result = { pass: reasons.length === 0, reasons, runs, attacks, output };
  if (result.pass && options.scorecardPath) {
    writeFileSync(options.scorecardPath, scorecard(result, options));
  }
  sayVerdict(result, options.scorecardPath, say);
  return result;
}

function flag(name: string): string | undefined {
  const position = process.argv.indexOf(name);
  if (position < 0) return undefined;
  return process.argv[position + 1];
}

if (import.meta.main) {
  const rulesFile = flag("--rules");
  if (!rulesFile) {
    const example = "parts/09-gate-every-change/01-gate-the-change/problem/gate-rules.ts";
    console.log(`Name your rules: --rules ${example}`);
    process.exit(2);
  }
  const result = await runGate({
    rulesFile,
    agent: flag("--agent"),
    goldenPath: flag("--golden"),
    metricsPath: flag("--metrics"),
    scorecardPath: flag("--scorecard") ?? join(ROOT, "SCORECARD.md"),
    print: true,
  });
  process.exit(result.pass ? 0 : 1);
}
