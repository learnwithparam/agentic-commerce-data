// Helpers the define-the-metrics checks share: read a metric file, ask the course's validator
// about some queries, and run a learner's agent on every golden question, three fresh times.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGolden, type Question } from "../../checks/lib/golden";
import { ROOT } from "../../world/build";

export const METRIC_IDS = ["late_delivery_rate", "gmv", "active_seller", "repeat_customer"];

export type Metric = Partial<
  Record<"description" | "owner" | "grain" | "expression" | "sql" | "assumption", string>
>;

export function readMetrics(folder: string): Record<string, Metric> {
  const path = join(folder, "metrics.toml");
  if (!existsSync(path)) throw new Error("metrics.toml is missing");
  return Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, Metric>;
}

// The validator every agent in the course runs before a query: desk/finished/guard.py.
const VALIDATE = [
  "import json, sys",
  "from desk.finished import guard",
  "def verdict(sql):",
  "    try:",
  "        return {'ok': True, 'sql': guard.check(sql)}",
  "    except guard.QueryRefusedError as refusal:",
  "        return {'ok': False, 'reason': str(refusal)}",
  "print(json.dumps([verdict(sql) for sql in json.load(sys.stdin)]))",
].join("\n");

export type Verdict = { ok: boolean; sql?: string; reason?: string };

export function validatorVerdicts(queries: string[]): Verdict[] {
  const finished = Bun.spawnSync(["uv", "run", "--quiet", "python", "-c", VALIDATE], {
    cwd: ROOT,
    stdin: Buffer.from(JSON.stringify(queries)),
    stdout: "pipe",
    stderr: "pipe",
  });
  return JSON.parse(new TextDecoder().decode(finished.stdout)) as Verdict[];
}

// The answer contract spells this key with an underscore, so it keeps that spelling here.
type KeysWithUnderscores = Partial<Record<"metric_ids", string[]>>;

// What `ask.py --json` prints. Any field may be missing.
export type Answer = KeysWithUnderscores & {
  refused?: boolean;
  error?: string | null;
  rows?: unknown[][];
  assumptions?: string[];
};

// One run: the answer to every golden question, by question id.
export type GoldenRun = Map<string, Answer>;

const RUNS = 3;
// How many questions are asked at the same time.
const WORKERS = 8;

async function askOnce(folder: string, question: string): Promise<Answer> {
  const environment = { ...process.env };
  environment.LLM_PROVIDER = "replay";
  const command = ["uv", "run", "--quiet", "python", join(folder, "ask.py"), question, "--json"];
  const agent = Bun.spawn(command, { cwd: ROOT, env: environment, stdout: "pipe", stderr: "pipe" });
  const output = await new Response(agent.stdout).text();
  await agent.exited;
  const lastLine = output.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(lastLine) as Answer;
  } catch {
    return { error: "ask.py did not print JSON" };
  }
}

async function oneRun(folder: string, golden: Question[]): Promise<GoldenRun> {
  const answers: GoldenRun = new Map();
  const waiting = [...golden];
  const worker = async () => {
    for (let question = waiting.shift(); question; question = waiting.shift()) {
      answers.set(question.id, await askOnce(folder, question.question));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return answers;
}

const runsByFolder = new Map<string, GoldenRun[]>();

// Three fresh runs of the agent on the golden set. Model behaviour is judged over all three.
export async function goldenRuns(folder: string): Promise<GoldenRun[]> {
  const saved = runsByFolder.get(folder);
  if (saved) return saved;
  if (!existsSync(join(folder, "ask.py"))) throw new Error("ask.py is missing");
  const golden = loadGolden();
  const runs: GoldenRun[] = [];
  for (let run = 0; run < RUNS; run++) runs.push(await oneRun(folder, golden));
  runsByFolder.set(folder, runs);
  return runs;
}

// A rule about model behaviour passes when it holds in most of the runs (2 of 3).
export async function holdsInMostRuns(
  folder: string,
  holds: (run: GoldenRun) => boolean | Promise<boolean>,
): Promise<boolean> {
  let passing = 0;
  const runs = await goldenRuns(folder);
  for (const run of runs) if (await holds(run)) passing++;
  return passing * 2 > runs.length;
}

// The metric each metric question of the golden set must use.
export const METRIC_FOR_QUESTION: Record<string, string> = {
  "repeat-customers-2017": "repeat_customer",
  "repeat-customer-share": "repeat_customer",
  "gmv-2018": "gmv",
  "top-categories-gmv-2018": "gmv",
  "top-sellers-gmv-2018": "gmv",
  "late-share-delivered": "late_delivery_rate",
  "late-orders-2018": "late_delivery_rate",
  "late-share-bed-bath-by-month": "late_delivery_rate",
  "late-sellers-sao-paulo-2018q2": "late_delivery_rate",
  "active-sellers-2018": "active_seller",
};
