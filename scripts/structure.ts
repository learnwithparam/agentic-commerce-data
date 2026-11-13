// Reads the repo layout once. Every other script asks this file where things are.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");

export type Step = {
  name: string; // verb-the-thing, also the command argument
  dir: string;
  part: string;
  meta: { minutes: number; screen: boolean; solution: boolean };
};
export type Part = { name: string; dir: string; steps: Step[] };

// What a step.toml file may say. Every field is optional.
type StepToml = { minutes?: number; screen?: boolean; solution?: boolean };

function subfolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  const entries = readdirSync(folder);
  const folders = entries.filter((entry) => statSync(join(folder, entry)).isDirectory());
  return folders.sort();
}

// Folders keep an order prefix for sorting only. Learners never type it.
export const bareName = (folder: string) => folder.replace(/^\d+-/, "");

// The orientation is the first part: 00-orientation/ holds its step folders next to its README.
const ORIENTATION = join(ROOT, "00-orientation");

// A planned part has a README marked TODO(part session) and no step folders yet.
// A later session builds its steps; until then the standard does not count it.
// PARTS.md lists every planned part.
export const isPlanned = (dir: string) =>
  subfolders(dir).length === 0 &&
  existsSync(join(dir, "README.md")) &&
  readFileSync(join(dir, "README.md"), "utf8").includes("TODO(part session)");

export function plannedParts(): string[] {
  const partsFolder = join(ROOT, "parts");
  const planned = subfolders(partsFolder).filter((folder) => isPlanned(join(partsFolder, folder)));
  return planned.map(bareName);
}

function readStepToml(stepDir: string): StepToml {
  const metaPath = join(stepDir, "step.toml");
  if (!existsSync(metaPath)) return {};
  return Bun.TOML.parse(readFileSync(metaPath, "utf8")) as StepToml;
}

function readStep(partName: string, partDir: string, folder: string): Step {
  const stepDir = join(partDir, folder);
  const stepToml = readStepToml(stepDir);
  return {
    name: bareName(folder),
    dir: stepDir,
    part: partName,
    meta: {
      minutes: Number(stepToml.minutes ?? 0),
      screen: Boolean(stepToml.screen),
      solution: Boolean(stepToml.solution),
    },
  };
}

function isStepFolder(partDir: string, folder: string): boolean {
  // Only the orientation mixes step folders with other folders,
  // so only there must a step.toml prove that a folder is a step.
  return partDir !== ORIENTATION || existsSync(join(partDir, folder, "step.toml"));
}

function readPart(name: string, dir: string): Part {
  const stepFolders = subfolders(dir).filter((folder) => isStepFolder(dir, folder));
  const steps = stepFolders.map((folder) => readStep(name, dir, folder));
  return { name, dir, steps };
}

export function parts(): Part[] {
  const partsFolder = join(ROOT, "parts");
  const found = subfolders(partsFolder)
    .map((folder) => ({ name: bareName(folder), dir: join(partsFolder, folder) }))
    .filter((part) => !isPlanned(part.dir));
  const orientationFolders = subfolders(ORIENTATION);
  const orientationHasSteps = orientationFolders.some((folder) =>
    existsSync(join(ORIENTATION, folder, "step.toml")),
  );
  if (orientationHasSteps) found.unshift({ name: "orientation", dir: ORIENTATION });
  return found.map(({ name, dir }) => readPart(name, dir));
}

export const allSteps = () => parts().flatMap((part) => part.steps);

export function findStep(name: string): Step | undefined {
  return allSteps().find((step) => step.name === name);
}
