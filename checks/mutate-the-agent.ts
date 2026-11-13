// mutate-the-agent: you break the agent on purpose, and the gate must block every break.
// The check reads your mutants.toml, runs the gate once on the unbroken agent (it must pass),
// then once per mutant on a throwaway copy (it must block).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Mutant, mutantProblem } from "../parts/09-gate-every-change/agent-copy";
import { runGate } from "../parts/09-gate-every-change/gate";
import { type MutantResult, readMutants, runMutants } from "../parts/09-gate-every-change/mutate";
import type { Rule } from "../scripts/verify";

const mutantsPath = (folder: string) => join(folder, "mutants.toml");
const rulesFile = (folder: string) => join(folder, "gate-rules.ts");

function mutants(folder: string): Mutant[] {
  if (!existsSync(mutantsPath(folder))) return [];
  return readMutants(mutantsPath(folder));
}

const savedRuns = new Map<string, Promise<unknown>>();

function once<Result>(key: string, work: () => Promise<Result>): Promise<Result> {
  if (!savedRuns.has(key)) savedRuns.set(key, work());
  return savedRuns.get(key) as Promise<Result>;
}

// Folders with the same gate rules share one run on the unbroken agent.
function baselinePasses(folder: string): Promise<boolean> {
  const rulesText = readFileSync(rulesFile(folder), "utf8");
  const key = `baseline:${createHash("sha256").update(rulesText).digest("hex")}`;
  return once(key, async () => (await runGate({ rulesFile: rulesFile(folder) })).pass);
}

function mutationRun(folder: string): Promise<MutantResult[]> {
  return once(`mutants:${folder}`, () => runMutants(mutantsPath(folder), rulesFile(folder)));
}

const touches = (mutant: Mutant, file: string) => mutant.file === file;

function swapsCustomerId(mutant: Mutant): boolean {
  const findsPerson = mutant.find?.includes("customer_unique_id");
  const replacesWithOrderId = mutant.replace?.includes("customer_id");
  return Boolean(findsPerson && replacesWithOrderId && !mutant.replace.includes("unique"));
}

export default [
  {
    says: "mutants.toml lists at least 3 mutants, each with a name, a file, find and replace",
    test: (folder) => {
      const listed = mutants(folder);
      const complete = (mutant: Mutant) =>
        Boolean(mutant.name && mutant.file && mutant.find) && typeof mutant.replace === "string";
      return listed.length >= 3 && listed.every(complete);
    },
    tryNext: "add [[mutant]] blocks until there are three, each with name, file, find and replace",
  },
  {
    says: "every mutant's find text is in its file, so each one really changes the agent",
    test: (folder) => mutants(folder).every((mutant) => mutantProblem(mutant) === null),
    tryNext: "copy the find text from the file itself, spaces included",
  },
  {
    says: "the mutants break the value index, the customer id and the SQL validator",
    test: (folder) => {
      const listed = mutants(folder);
      const valueIndex = listed.some((mutant) => touches(mutant, "desk/finished/values.py"));
      const customerId = listed.some(swapsCustomerId);
      const validator = listed.some((mutant) => touches(mutant, "desk/finished/guard.py"));
      return valueIndex && customerId && validator;
    },
    tryNext:
      "one mutant each for desk/finished/values.py, customer_unique_id to customer_id, " +
      "and desk/finished/guard.py",
  },
  {
    says: "the gate passes on the agent with no mutant",
    test: (folder) => baselinePasses(folder),
    tryNext: "your gate rules must pass the unbroken agent, or every mutant looks caught",
  },
  {
    says: "the gate blocks every mutant",
    test: async (folder) => {
      const results = await mutationRun(folder);
      return results.length > 0 && results.every((result) => result.caught);
    },
    tryNext: "run the mutation command from the step README; a HOLE line names the mutant to fix",
  },
] satisfies Rule[];
