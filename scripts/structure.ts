// Reads the repo layout once. Every other script asks this file where things are.
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");

export type Step = {
  name: string; // verb-the-thing, also the command argument
  dir: string;
  part: string;
  meta: { minutes: number; screen: boolean; solution: boolean };
};
export type Part = { name: string; dir: string; steps: Step[] };

const dirs = (p: string) =>
  existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()).sort() : [];

// Folders keep an order prefix for sorting only. Learners never type it.
export const bareName = (folder: string) => folder.replace(/^\d+-/, "");

// The orientation is the first part: 00-orientation/ holds its step folders next to its README.
const ORIENTATION = join(ROOT, "00-orientation");

// A planned part has a README marked TODO(part session) and no step folders yet. A later session builds its steps;
// until then the standard does not count it. PARTS.md lists every planned part.
export const isPlanned = (dir: string) =>
  dirs(dir).length === 0 && existsSync(join(dir, "README.md")) && readFileSync(join(dir, "README.md"), "utf8").includes("TODO(part session)");

export function plannedParts(): string[] {
  const root = join(ROOT, "parts");
  return dirs(root).filter((p) => isPlanned(join(root, p))).map(bareName);
}

export function parts(): Part[] {
  const root = join(ROOT, "parts");
  const found = dirs(root).map((p) => ({ name: bareName(p), dir: join(root, p) })).filter((p) => !isPlanned(p.dir));
  if (dirs(ORIENTATION).some((s) => existsSync(join(ORIENTATION, s, "step.toml")))) found.unshift({ name: "orientation", dir: ORIENTATION });
  return found.map(({ name, dir }) => {
    const steps = dirs(dir).filter((s) => dir !== ORIENTATION || existsSync(join(dir, s, "step.toml"))).map((s) => {
      const sdir = join(dir, s);
      const metaPath = join(sdir, "step.toml");
      const raw = existsSync(metaPath) ? (Bun.TOML.parse(readFileSync(metaPath, "utf8")) as any) : {};
      return {
        name: bareName(s),
        dir: sdir,
        part: name,
        meta: { minutes: Number(raw.minutes ?? 0), screen: Boolean(raw.screen), solution: Boolean(raw.solution) },
      };
    });
    return { name, dir, steps };
  });
}

export const allSteps = () => parts().flatMap((p) => p.steps);

export function findStep(name: string): Step | undefined {
  return allSteps().find((s) => s.name === name);
}
