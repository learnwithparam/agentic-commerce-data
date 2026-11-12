// read-the-failures: one line per failed golden question, naming the trap that caused it.
// The check works out which questions failed from the rows, and which labels fit each question from golden.toml.
import type { Rule } from "../scripts/verify";
import { goldenPathFor, loadGolden, TRAP_LABELS } from "./lib/golden";
import { notes } from "./lib/notes";
import { failedIds, readRun } from "./lib/runs";

type Line = { id: string; label: string };
const LINE = /^\s*-\s*([a-z0-9-]+)\s*:\s*([a-z-]+)/;
const lines = (d: string): Line[] =>
  (notes(d, "failures.md") ?? "").split("\n").map((l) => l.match(LINE)).filter(Boolean).map((m) => ({ id: m![1], label: m![2] }));
const failures = (d: string) => failedIds(readRun(d, "naive")!, loadGolden(goldenPathFor(d)));

export default [
  {
    says: "notes/failures.md exists",
    test: (d) => notes(d, "failures.md") !== null,
    tryNext: "create notes/failures.md inside this problem folder",
  },
  {
    says: "runs/naive.json is in this folder",
    test: (d) => readRun(d, "naive") !== null,
    tryNext: "it ships with the starter; if you deleted it, run bun run score naive --for read-the-failures",
  },
  {
    says: "every failed question has a line: - <question-id>: <label>",
    test: async (d) => {
      const named = new Set(lines(d).map((l) => l.id));
      return (await failures(d)).every((id) => named.has(id));
    },
    tryNext: "list every MISS from the run; each line starts with a dash, the question id, a colon and a label",
  },
  {
    says: `every label is one of: ${TRAP_LABELS.join(", ")}`,
    test: (d) => lines(d).length > 0 && lines(d).every((l) => TRAP_LABELS.includes(l.label)),
    tryNext: "use the labels listed at the top of world/golden.toml, spelled the same way",
  },
  {
    says: "each label is a trap that question can fall into",
    test: (d) => {
      const g = loadGolden(goldenPathFor(d));
      return lines(d).every((l) => {
        const q = g.find((x) => x.id === l.id);
        return q !== undefined && (q.traps.length === 0 || q.traps.includes(l.label));
      });
    },
    tryNext: "compare the agent's SQL with the reference SQL in world/golden.toml and name what differs",
  },
  {
    says: "no line names a question the agent got right",
    test: async (d) => {
      const failed = new Set(await failures(d));
      return lines(d).every((l) => failed.has(l.id));
    },
    tryNext: "keep only the questions marked MISS in the run",
  },
] satisfies Rule[];
