// Shared by the checks of build-the-loop: run a step's program the way a learner does,
// and read what it prints. Every line it prints is one JSON object.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../../scripts/structure";

export const PART_FOLDER = join(ROOT, "parts", "05-build-the-loop");

// kit.toml spells these keys with underscores, so they keep that spelling here.
type Relevance = Record<"late_delivery" | "off_topic", string[]> & { question: string };

export type KitData = {
  route: { question: string; expected: string }[];
  broken: { question: string }[];
  relevance: Relevance;
  citations: { questions: string[] };
};

export const KIT = Bun.TOML.parse(
  readFileSync(join(PART_FOLDER, "kit.toml"), "utf8"),
) as unknown as KitData;

export type StepRun = { printed: Record<string, unknown>[]; ledger: Record<string, unknown>[] };

function jsonLines(text: string): Record<string, unknown>[] {
  const allLines = text.split("\n");
  const lines = allLines.filter((line) => line.trim().startsWith("{"));
  return lines.map((line) => JSON.parse(line));
}

function readLedger(path: string): Record<string, unknown>[] {
  try {
    return jsonLines(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

// Runs `uv run python parts/05-build-the-loop/kit.py <step> --folder <folder> <arguments>`
// in replay mode, with a fresh ledger, and returns what it printed and what it logged.
export function runStep(stepName: string, folder: string, stepArguments: string[]): StepRun {
  const scratch = mkdtempSync(join(tmpdir(), "build-the-loop-"));
  const ledgerPath = join(scratch, "loop.jsonl");
  const kitFile = join(PART_FOLDER, "kit.py");
  const command = ["uv", "run", "--quiet", "python", kitFile, stepName, "--folder", folder];
  const env = { ...process.env };
  env.LLM_PROVIDER = "replay";
  env.LOOP_LEDGER = ledgerPath;
  env.PYTHONDONTWRITEBYTECODE = "1";
  const finished = Bun.spawnSync([...command, ...stepArguments], { cwd: ROOT, env });
  const printed = jsonLines(finished.stdout.toString());
  const ledger = readLedger(ledgerPath);
  rmSync(scratch, { recursive: true, force: true });
  return { printed, ledger };
}

// Each check runs the same program for several rules, so the first run is kept.
const savedRuns = new Map<string, StepRun>();

export function savedRun(stepName: string, folder: string, stepArguments: string[]): StepRun {
  const key = [stepName, folder, ...stepArguments].join("\u0001");
  const saved = savedRuns.get(key);
  if (saved) return saved;
  const run = runStep(stepName, folder, stepArguments);
  savedRuns.set(key, run);
  return run;
}
