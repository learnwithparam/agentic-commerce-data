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
// Shape rules (standard sections 1 to 3). Pure functions, so the fixtures can test them.
export const STEP_SECTIONS = [
  "The problem",
  "Watch it done",
  "Your turn",
  "Do it on your work",
  "Done when",
  "Solution",
];
export const PART_SECTIONS = [
  "After this part you can",
  "You leave with",
  "The problem",
  "Watch and read",
  "Project",
];
export const MAX_PROBLEM_WORDS = 60;
export const MAX_EXAMPLE_FILES = 2;
export const EXAMPLE_TOO_BIG =
  "the example needs more than two world files: shrink it or move the rest to Go further";

const headingLine = (name: string) => new RegExp(`^## ${name}[ \\t]*$`, "m");

function sectionBody(text: string, name: string): string | undefined {
  const start = text.search(headingLine(name));
  if (start < 0) return undefined;
  const fromHeading = text.slice(start);
  const body = fromHeading.slice(fromHeading.indexOf("\n") + 1);
  return body.split(/^## /m)[0];
}

// Code does not count: a learner reads the sentences, and the how can have long commands.
export function wordsOutsideCode(text: string): number {
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  return prose.split(/\s+/).filter(Boolean).length;
}

function sectionsInOrder(text: string, names: string[]): string[] {
  const problems: string[] = [];
  let lastPosition = -1;
  for (const name of names) {
    const position = text.search(headingLine(name));
    if (position < 0) problems.push(`missing section "## ${name}"`);
    else if (position < lastPosition) problems.push(`section "## ${name}" is out of order`);
    else lastPosition = position;
  }
  return problems;
}

export function stepShapeProblems(text: string): string[] {
  const problems = sectionsInOrder(text, STEP_SECTIONS);
  const problem = sectionBody(text, "The problem");
  if (problem !== undefined && wordsOutsideCode(problem) > MAX_PROBLEM_WORDS) {
    const count = wordsOutsideCode(problem);
    problems.push(
      `the problem section has ${count} words; keep it to ${MAX_PROBLEM_WORDS} or fewer`,
    );
  }
  return problems;
}

export function partShapeProblems(text: string): string[] {
  const problems = sectionsInOrder(text, PART_SECTIONS);
  if (!/^\|\s*Step\s*\|.*\n\|[\s:|-]+\|/im.test(text)) {
    problems.push(`missing the steps table: a table whose first column is "Step"`);
  }
  return problems;
}

export function exampleFilesProblems(files: string[]): string[] {
  return files.length > MAX_EXAMPLE_FILES ? [EXAMPLE_TOO_BIG] : [];
}
