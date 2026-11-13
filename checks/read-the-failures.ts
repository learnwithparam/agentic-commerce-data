// read-the-failures: one line per failed golden question, naming the trap that caused it.
// The check works out which questions failed from the rows,
// and which labels fit each question from golden.toml.
import type { Rule } from "../scripts/verify";
import { goldenPathFor, loadGolden, TRAP_LABELS } from "./lib/golden";
import { notes } from "./lib/notes";
import { failedIds, readRun } from "./lib/runs";

type FailureLine = { id: string; label: string };

// A line such as "- revenue-total: fan-out".
const FAILURE_LINE = /^\s*-\s*([a-z0-9-]+)\s*:\s*([a-z-]+)/;

function failureLines(folder: string): FailureLine[] {
  const text = notes(folder, "failures.md") ?? "";
  const lines: FailureLine[] = [];
  for (const line of text.split("\n")) {
    const found = line.match(FAILURE_LINE);
    if (found) lines.push({ id: found[1], label: found[2] });
  }
  return lines;
}

// The questions the naive agent really got wrong, judged from its rows.
function failures(folder: string): Promise<string[]> {
  const run = readRun(folder, "naive");
  if (!run) throw new Error("runs/naive.json is missing or is not valid JSON");
  return failedIds(run, loadGolden(goldenPathFor(folder)));
}

export default [
  {
    says: "notes/failures.md exists",
    test: (folder) => notes(folder, "failures.md") !== null,
    tryNext: "create notes/failures.md inside this problem folder",
  },
  {
    says: "runs/naive.json is in this folder",
    test: (folder) => readRun(folder, "naive") !== null,
    tryNext:
      "it ships with the starter; " +
      "if you deleted it, run bun run score naive --for read-the-failures",
  },
  {
    says: "every failed question has a line: - <question-id>: <label>",
    test: async (folder) => {
      const named = new Set(failureLines(folder).map((line) => line.id));
      const failed = await failures(folder);
      return failed.every((id) => named.has(id));
    },
    tryNext:
      "list every MISS from the run; " +
      "each line starts with a dash, the question id, a colon and a label",
  },
  {
    says: `every label is one of: ${TRAP_LABELS.join(", ")}`,
    test: (folder) => {
      const lines = failureLines(folder);
      return lines.length > 0 && lines.every((line) => TRAP_LABELS.includes(line.label));
    },
    tryNext: "use the labels listed at the top of world/golden.toml, spelled the same way",
  },
  {
    says: "each label is a trap that question can fall into",
    test: (folder) => {
      const golden = loadGolden(goldenPathFor(folder));
      return failureLines(folder).every((line) => {
        const question = golden.find((candidate) => candidate.id === line.id);
        if (question === undefined) return false;
        return question.traps.length === 0 || question.traps.includes(line.label);
      });
    },
    tryNext:
      "compare the agent's SQL with the reference SQL in world/golden.toml and name what differs",
  },
  {
    says: "no line names a question the agent got right",
    test: async (folder) => {
      const failed = new Set(await failures(folder));
      return failureLines(folder).every((line) => failed.has(line.id));
    },
    tryNext: "keep only the questions marked MISS in the run",
  },
] satisfies Rule[];
