// Shared by the checks of approve-the-write: play one scenario (ask, then maybe resume) in a fresh
// folder, and read what the program printed, what the mock API received and what was logged.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../../scripts/structure";

export const PART_FOLDER = join(ROOT, "parts", "07-approve-the-write");
const KIT_FILE = join(PART_FOLDER, "kit.py");

// kit.toml spells seller_id with an underscore, so it keeps that spelling here.
type Plan = Record<"seller_id", string> & {
  question: string;
  approver: string;
  evidence: { id: string }[];
};
const kitData = Bun.TOML.parse(readFileSync(join(PART_FOLDER, "kit.toml"), "utf8"));
export const PLAN = (kitData as unknown as { pause: Plan[] }).pause[0];

export type Printed = Record<string, unknown>;
export type Scenario = {
  printed: Printed[];
  apiCalls: Printed[];
  decisions: Printed[];
  startedAt: number;
};

function jsonLines(text: string): Printed[] {
  const allLines = text.split("\n");
  const lines = allLines.filter((line) => line.trim().startsWith("{"));
  return lines.map((line) => JSON.parse(line));
}

function readLines(path: string): Printed[] {
  try {
    return jsonLines(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

// What the ask command printed: the id of the interrupt a person must answer.
export function interruptId(printed: Printed | undefined): string | undefined {
  const outcome = printed?.outcome as { interrupts?: { id?: string }[] } | undefined;
  return outcome?.interrupts?.[0]?.id;
}

// A decision is "approve" or "reject"; each one resumes the interrupt once, as the user named.
export type Decision = { choice: "approve" | "reject"; user: string };

// Asks the pause question as cm-ana, then plays each decision in order, in a fresh folder.
export function playScenario(stepName: string, folder: string, decisions: Decision[]): Scenario {
  const scratch = mkdtempSync(join(tmpdir(), "approve-the-write-"));
  const env = { ...process.env };
  env.LLM_PROVIDER = "replay";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.DESK_STATE_DIR = join(scratch, "pending");
  env.SELLER_API_LOG = join(scratch, "seller_api.jsonl");
  env.DECISIONS_LOG = join(scratch, "decisions.jsonl");
  const command = ["uv", "run", "--quiet", "python", KIT_FILE, stepName, "--folder", folder];
  const run = (stepArguments: string[]) => {
    const finished = Bun.spawnSync([...command, ...stepArguments], { cwd: ROOT, env });
    return jsonLines(finished.stdout.toString())[0];
  };
  const startedAt = Date.now();
  const printed = [run(["ask", PLAN.question, "--user", "cm-ana"])];
  const id = interruptId(printed[0]) ?? "no-interrupt";
  for (const decision of decisions) {
    printed.push(run(["resume", id, `--${decision.choice}`, "--user", decision.user]));
  }
  const apiCalls = readLines(env.SELLER_API_LOG);
  const decisionLines = readLines(env.DECISIONS_LOG);
  rmSync(scratch, { recursive: true, force: true });
  return { printed, apiCalls, decisions: decisionLines, startedAt };
}

// Model behaviour is judged over 3 fresh runs, so every scenario is played 3 times.
const RUNS = 3;
const savedScenarios = new Map<string, Scenario[]>();

export function threeScenarios(stepName: string, folder: string, decisions: Decision[]) {
  const key = [stepName, folder, JSON.stringify(decisions)].join("\u0001");
  const saved = savedScenarios.get(key);
  if (saved) return saved;
  const scenarios: Scenario[] = [];
  for (let i = 0; i < RUNS; i++) scenarios.push(playScenario(stepName, folder, decisions));
  savedScenarios.set(key, scenarios);
  return scenarios;
}
