// validate-the-surface: before a surface is sent, every message is checked against the pinned
// A2UI v1.0 schemas and the course catalog, plus two rules the schema cannot see.
// The check runs validate.py on 6 surfaces from golden answers and 5 broken ones, and reads the
// verdict and the JSON paths it prints.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PART_FOLDER, savedRun } from "../parts/06-answer-with-ui/kit";
import type { Rule } from "../scripts/verify";

const SURFACES = join(PART_FOLDER, "02-validate-the-surface", "surfaces");
const FILES = readdirSync(SURFACES)
  .filter((name) => name.endsWith(".json"))
  .sort();
const GOOD = FILES.filter((name) => name.startsWith("good-"));
const BROKEN = FILES.filter((name) => name.startsWith("bad-"));

type Verdict = { file: string; valid: boolean; problems: { path?: string }[] };

function verdicts(folder: string): Verdict[] {
  const paths = FILES.map((name) => join(SURFACES, name));
  const printed = savedRun("validate-the-surface", folder, paths) as unknown as Verdict[];
  return FILES.map((name) => {
    const found = printed.find((verdict) => verdict.file === name);
    if (!found || !Array.isArray(found.problems)) throw new Error(`no verdict for ${name}`);
    return found;
  });
}

function verdictFor(folder: string, name: string): Verdict | undefined {
  return verdicts(folder).find((verdict) => verdict.file === name);
}

// The path a broken surface must be rejected at, written in the surface file.
function expectedPath(name: string): string {
  const surface = JSON.parse(readFileSync(join(SURFACES, name), "utf8"));
  return surface.expected_path;
}

export default [
  {
    says: "validate.py prints a verdict for each of the 11 surfaces",
    test: (folder) => verdicts(folder).length === FILES.length,
    tryNext: "keep main() as it is; problems_in() must return a list",
  },
  {
    says: "every surface from a golden answer is valid",
    test: (folder) => GOOD.every((name) => verdictFor(folder, name)?.valid === true),
    tryNext:
      "a good surface was rejected; print its problems and check your rules on root and children",
  },
  {
    says: "each of the 5 broken surfaces is rejected",
    test: (folder) => BROKEN.every((name) => verdictFor(folder, name)?.valid === false),
    tryNext:
      "run kit.schema_problems on every message, not only the first, " +
      'then check that "root" exists and that every child id exists',
  },
  {
    says: "each rejection names the failing JSON path",
    test: (folder) =>
      BROKEN.every((name) => {
        const problems = verdictFor(folder, name)?.problems ?? [];
        return problems.some((problem) => problem.path === expectedPath(name));
      }),
    tryNext:
      'start each path with the message number, like "/1/updateComponents/components/0/children/7"',
  },
] satisfies Rule[];
