// A throwaway copy of the desk agent that the gate can change without touching your repo.
// The copy holds desk/ and world/replay/. Its data/ folder points at the real database.
// Python finds the copy first because PYTHONPATH names it.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROOT } from "../../scripts/structure";

// The folders a mutant may change. Everything else in the repo stays as it is.
export const MUTABLE_FOLDERS = ["desk/", "world/replay/"];

export type Mutant = { name: string; file: string; find: string; replace: string };

export type AgentCopy = { root: string; remove: () => void };

function withoutCaches(source: string): boolean {
  return !source.includes("__pycache__");
}

export function makeAgentCopy(): AgentCopy {
  const root = mkdtempSync(join(tmpdir(), "desk-agent-"));
  cpSync(join(ROOT, "desk"), join(root, "desk"), { recursive: true, filter: withoutCaches });
  mkdirSync(join(root, "world"));
  cpSync(join(ROOT, "world", "replay"), join(root, "world", "replay"), { recursive: true });
  symlinkSync(join(ROOT, "data"), join(root, "data"));
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}

// Put your metrics.toml where the finished agent reads its metrics.
export function useMetrics(copy: AgentCopy, metricsPath: string) {
  const target = join(copy.root, "desk", "finished", "metrics.toml");
  writeFileSync(target, readFileSync(metricsPath, "utf8"));
}

// Why a mutant cannot be applied, or null when it can.
export function mutantProblem(mutant: Mutant): string | null {
  const allowed = MUTABLE_FOLDERS.some((folder) => mutant.file?.startsWith(folder));
  if (!allowed) return `its file must be inside ${MUTABLE_FOLDERS.join(" or ")}`;
  const path = join(ROOT, mutant.file);
  if (!existsSync(path)) return `${mutant.file} does not exist`;
  if (!mutant.find || !readFileSync(path, "utf8").includes(mutant.find)) {
    return `its find text is not in ${mutant.file}, so it changes nothing`;
  }
  return null;
}

// Replace every copy of the find text in the mutant's file, inside the copy only.
export function applyMutant(copy: AgentCopy, mutant: Mutant) {
  const problem = mutantProblem(mutant);
  if (problem) throw new Error(`mutant ${mutant.name}: ${problem}`);
  const target = join(copy.root, mutant.file);
  mkdirSync(dirname(target), { recursive: true });
  const original = readFileSync(target, "utf8");
  writeFileSync(target, original.replaceAll(mutant.find, mutant.replace));
}
