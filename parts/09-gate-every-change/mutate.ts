// bun parts/09-gate-every-change/mutate.ts --mutants <mutants.toml> --rules <gate-rules.ts>
//
// Mutation run: break the agent on purpose, once per mutant, and run the gate on each broken
// copy. A gate that passes a broken agent has a hole. Your repo is never changed: each mutant
// is applied to a throwaway copy of desk/ and world/replay/.
// Exit codes: 0 every mutant is caught, 1 at least one is not.
import { readFileSync } from "node:fs";
import { type Mutant, mutantProblem } from "./agent-copy";
import { runGate } from "./gate";

export type MutantResult = { name: string; caught: boolean; why: string };

export function readMutants(mutantsPath: string): Mutant[] {
  const parsed = Bun.TOML.parse(readFileSync(mutantsPath, "utf8")) as { mutant?: Mutant[] };
  return parsed.mutant ?? [];
}

async function tryMutant(mutant: Mutant, rulesFile: string): Promise<MutantResult> {
  const problem = mutantProblem(mutant);
  if (problem) return { name: mutant.name, caught: false, why: `it cannot run: ${problem}` };
  const gate = await runGate({ rulesFile, mutant });
  if (gate.pass) {
    return { name: mutant.name, caught: false, why: "your gate has a hole: it passed this mutant" };
  }
  return { name: mutant.name, caught: true, why: gate.reasons[0] };
}

export async function runMutants(mutantsPath: string, rulesFile: string, print = false) {
  const results: MutantResult[] = [];
  for (const mutant of readMutants(mutantsPath)) {
    const result = await tryMutant(mutant, rulesFile);
    results.push(result);
    if (print) {
      const label = result.caught ? "CAUGHT" : "HOLE  ";
      console.log(`  ${label}  ${result.name}: ${result.why}`);
    }
  }
  return results;
}

function flag(name: string): string | undefined {
  const position = process.argv.indexOf(name);
  if (position < 0) return undefined;
  return process.argv[position + 1];
}

if (import.meta.main) {
  const mutantsPath = flag("--mutants");
  const rulesFile = flag("--rules");
  if (!mutantsPath || !rulesFile) {
    console.log("Use: bun parts/09-gate-every-change/mutate.ts --mutants <file> --rules <file>");
    process.exit(2);
  }
  console.log(`Mutation run: ${readMutants(mutantsPath).length} mutants.`);
  const results = await runMutants(mutantsPath, rulesFile, true);
  const caught = results.filter((result) => result.caught).length;
  console.log(`${caught} of ${results.length} mutants caught.`);
  process.exit(caught === results.length && results.length > 0 ? 0 : 1);
}
