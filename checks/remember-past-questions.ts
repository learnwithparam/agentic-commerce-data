// remember-past-questions: the store keeps only question and SQL pairs whose rows match the
// reference for that question. A wrong pair, a broken query and a question with no reference are
// refused on insert, and examples come back closest first.
// The check runs the learner's memory.py against a store file of its own.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/04-retrieve-the-context/check-helpers";
import type { Rule } from "../scripts/verify";

const RIGHT_PAIR = [
  "How many sellers are in the state of Sao Paulo?",
  "SELECT COUNT(seller_id) AS sp_sellers FROM sellers WHERE seller_state = 'SP'",
];
// Right shape, wrong number: it finds 694 of the 704 Sao Paulo sellers.
const WRONG_PAIR = [
  "How many sellers are based in Sao Paulo city?",
  "SELECT COUNT(*) FROM sellers WHERE seller_city = 'sao paulo'",
];
const BROKEN_PAIR = ["How many orders are in the data?", "SELECT COUNT(*) FROM order"];
const UNKNOWN_PAIR = ["How many cats work at the marketplace?", "SELECT 3"];
const SIMILAR_QUESTION = "How many sellers are in SP state?";

type Outcome = { stored?: boolean; reason?: string };
type Scenario = {
  outcomes: Outcome[];
  storedQuestions: string[];
  examples: { question?: string }[];
};

const scenarios = new Map<string, Scenario>();

// One run per folder: add the four pairs to an empty store, then ask for examples.
function scenario(folder: string): Scenario {
  const saved = scenarios.get(folder);
  if (saved) return saved;
  const file = join(folder, "memory.py");
  const storePath = join(mkdtempSync(join(tmpdir(), "memory-")), "memory.jsonl");
  // The store goes to the check's own file, so the learner's data/memory.jsonl stays as it is.
  const extraEnvironment: Record<string, string> = {};
  extraEnvironment.MEMORY_FILE = storePath;
  const options = { extraEnvironment };
  const pairs = [RIGHT_PAIR, WRONG_PAIR, BROKEN_PAIR, UNKNOWN_PAIR];
  const outcomes = pairs.map(
    (pair) => (jsonOutput(runPython(file, ["add", ...pair], options)) ?? {}) as Outcome,
  );
  const storeText = existsSync(storePath) ? readFileSync(storePath, "utf8") : "";
  const storedLines = storeText.split("\n").filter(Boolean);
  const storedQuestions = storedLines.map((line) => JSON.parse(line).question as string);
  const printed = jsonOutput(runPython(file, ["examples", SIMILAR_QUESTION], options));
  const examples = Array.isArray(printed) ? printed : [];
  const result = { outcomes, storedQuestions, examples };
  scenarios.set(folder, result);
  return result;
}

const refusedWithReason = (outcome: Outcome) =>
  outcome.stored === false && (outcome.reason ?? "").trim().length > 0;

export default [
  {
    says: "a pair whose rows match the reference is stored, even with different SQL text",
    test: (folder) => {
      const { outcomes, storedQuestions } = scenario(folder);
      return outcomes[0].stored === true && storedQuestions.includes(RIGHT_PAIR[0]);
    },
    tryNext: "compare the rows of the two queries, not their text",
  },
  {
    says: "a pair whose rows do not match its reference is refused on insert, with a reason",
    test: (folder) => {
      const { outcomes, storedQuestions } = scenario(folder);
      return refusedWithReason(outcomes[1]) && !storedQuestions.includes(WRONG_PAIR[0]);
    },
    tryNext:
      "run both queries and compare comparable(rows); the same number of rows is not the same rows",
  },
  {
    says: "a pair whose SQL does not run is refused",
    test: (folder) => refusedWithReason(scenario(folder).outcomes[2]),
    tryNext: "catch the error from guard.run and return it as the reason",
  },
  {
    says: "a question with no reference in world/golden.toml is refused",
    test: (folder) => refusedWithReason(scenario(folder).outcomes[3]),
    tryNext: "when reference_sql() finds nothing, there is nothing to check against: refuse",
  },
  {
    says: "examples for a similar question return the stored pair first",
    test: (folder) => scenario(folder).examples[0]?.question === RIGHT_PAIR[0],
    tryNext: "examples() reads the store and sorts pairs by the words they share with the question",
  },
] satisfies Rule[];
