// track-the-change: the learner's changes.py keeps each fact's history. It closes the old edge when
// a new value arrives, and it answers "what was believed on this date?". The check runs the file on
// the desk's dated facts, and again on the same facts in reverse order, then reads what it printed.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "../scripts/verify";

const ROOT = join(import.meta.dir, "..");
const FACTS = join(ROOT, "world", "graphiti", "facts.json");
const TELEMETRY_OFF = "GRAPHITI_TELEMETRY_ENABLED";

// The JSON keys the learner's file prints. They follow Python's snake_case names.
const KEY = {
  factKey: "fact_key",
  validAt: "valid_at",
  invalidAt: "invalid_at",
  value: "value",
  attributes: "attributes",
  name: "name",
};

const CITY = "sao_paulo_city_sellers";
const STATE = "sao_paulo_state_sellers";
const CUSTOMER = "repeat_customer";
const MARCH = "2026-03-15T00:00:00Z";
const JULY = "2026-07-01T00:00:00Z";
const BEFORE_ANY_EDGE = "2026-01-01T00:00:00Z";
const EDGE_FIELDS = [
  "uuid",
  "group_id",
  "source_node_uuid",
  "target_node_uuid",
  "created_at",
  "name",
  "fact",
  "valid_at",
  "invalid_at",
  "expired_at",
  "attributes",
];

type Edge = Record<string, unknown>;
type Answer = Record<string, unknown>;
type Output = { answers: Answer[]; edges: Edge[] };
type Scenario = { forward: Output | null; reverse: Output | null };

// Run the learner's file with uv, as a learner would. Read the last line it prints as JSON.
function runChanges(file: string, factsPath: string): Output | null {
  const finished = Bun.spawnSync(["uv", "run", "--quiet", file, factsPath], {
    cwd: ROOT,
    env: { ...process.env, [TELEMETRY_OFF]: "false" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (finished.exitCode !== 0) return null;
  const lines = new TextDecoder().decode(finished.stdout).trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]) as Output;
  } catch {
    return null;
  }
}

// The desk's facts in reverse order, written to a folder of the check's own.
function reversedFacts(): string {
  const data = JSON.parse(readFileSync(FACTS, "utf8"));
  data.edges.reverse();
  const folder = mkdtempSync(join(tmpdir(), "graphiti-"));
  const path = join(folder, "facts.json");
  writeFileSync(path, JSON.stringify(data));
  return path;
}

// One pair of runs per folder: the forward order and the reverse order.
const scenarios = new Map<string, Scenario>();
function scenario(folder: string): Scenario {
  const saved = scenarios.get(folder);
  if (saved) return saved;
  const file = join(folder, "changes.py");
  const result = { forward: runChanges(file, FACTS), reverse: runChanges(file, reversedFacts()) };
  scenarios.set(folder, result);
  return result;
}

const sameInstant = (left: unknown, right: unknown) =>
  typeof left === "string" && typeof right === "string" && Date.parse(left) === Date.parse(right);

// The printed answer for one question, or undefined when the question was not answered.
function answerTo(output: Output | null, factKey: string, date: string): Answer | undefined {
  return output?.answers.find((answer) => answer[KEY.factKey] === factKey && answer.date === date);
}

const valueTo = (output: Output | null, factKey: string, date: string) =>
  answerTo(output, factKey, date)?.[KEY.value];

const edgesNamed = (output: Output | null, name: string) =>
  (output?.edges ?? []).filter((edge) => edge[KEY.name] === name);

const isOpen = (edge: Edge) => edge[KEY.invalidAt] === null;

export default [
  {
    says: "as_of gives 694 on 2026-03-15 and 704 on 2026-07-01 for Sao Paulo city sellers",
    test: (folder) => {
      const { forward } = scenario(folder);
      return valueTo(forward, CITY, MARCH) === "694" && valueTo(forward, CITY, JULY) === "704";
    },
    tryNext: "as_of must return the edge that is true on that date, not always the newest edge",
  },
  {
    says: "every fact has exactly one current edge, with no invalid_at",
    test: (folder) => {
      const { forward } = scenario(folder);
      return [CITY, STATE, CUSTOMER].every(
        (name) => edgesNamed(forward, name).filter(isOpen).length === 1,
      );
    },
    tryNext: "in add, close the current edge of the same fact, so only the newest stays open",
  },
  {
    says: "each closed edge ends exactly when a same-fact edge starts, and it is kept",
    test: (folder) => {
      const { forward } = scenario(folder);
      const closed = (forward?.edges ?? []).filter((edge) => !isOpen(edge));
      const ends = closed.every((edge) =>
        edgesNamed(forward, String(edge[KEY.name])).some((other) =>
          sameInstant(other[KEY.validAt], edge[KEY.invalidAt]),
        ),
      );
      return closed.length >= 2 && ends;
    },
    tryNext: "set the old edge's invalid_at to the new edge's valid_at, and keep the old edge",
  },
  {
    says: "the Sao Paulo state edge stays open, with no invalid_at",
    test: (folder) => {
      const state = edgesNamed(scenario(folder).forward, STATE);
      return state.length === 1 && isOpen(state[0]);
    },
    tryNext: "close an edge only when a newer edge of the same fact arrives, never otherwise",
  },
  {
    says: "as_of returns nothing for a date before the first edge of the fact",
    test: (folder) => {
      const answer = answerTo(scenario(folder).forward, CITY, BEFORE_ANY_EDGE);
      return answer !== undefined && answer[KEY.value] === null;
    },
    tryNext: "return None when no edge of the fact is true on the date asked",
  },
  {
    says: "repeat_customer is customer_id on 2026-03-15 and customer_unique_id on 2026-07-01",
    test: (folder) => {
      const { forward } = scenario(folder);
      return (
        valueTo(forward, CUSTOMER, MARCH) === "customer_id" &&
        valueTo(forward, CUSTOMER, JULY) === "customer_unique_id"
      );
    },
    tryNext: "compare both dates; the answer must change when the edge's valid_at passes",
  },
  {
    says: "every printed edge has the full EntityEdge fields",
    test: (folder) => {
      const edges = scenario(folder).forward?.edges ?? [];
      return (
        edges.length === 5 && edges.every((edge) => EDGE_FIELDS.every((field) => field in edge))
      );
    },
    tryNext:
      "build each edge with EntityEdge(**item) and print it with model_dump, not a plain dict",
  },
  {
    says: "reversed input gives the same answers as the original order",
    test: (folder) => {
      const { forward, reverse } = scenario(folder);
      const values = (output: Output | null) => output?.answers.map((answer) => answer[KEY.value]);
      const same = JSON.stringify(values(forward)) === JSON.stringify(values(reverse));
      const answered = (forward?.answers ?? []).filter((answer) => answer[KEY.value] !== null);
      return forward !== null && reverse !== null && same && answered.length >= 4;
    },
    tryNext:
      "sort the edges of a fact by valid_at before closing them, so arrival order does not matter",
  },
] satisfies Rule[];
