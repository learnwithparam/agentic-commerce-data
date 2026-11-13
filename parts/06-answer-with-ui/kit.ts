// Shared by the checks of answer-with-ui: run a step's program the way a learner does,
// and read what it prints. Every line it prints is one JSON object.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../scripts/structure";

export const PART_FOLDER = join(ROOT, "parts", "06-answer-with-ui");
export const KIT_FILE = join(PART_FOLDER, "kit.py");
export const JSONSCHEMA = "jsonschema==4.26.0";

const catalog = JSON.parse(readFileSync(join(PART_FOLDER, "catalog.json"), "utf8"));
export const CATALOG_ID: string = catalog.catalogId;
export const COMPONENT_NAMES: string[] = Object.keys(catalog.components);

export type Printed = Record<string, unknown>;

export function jsonLines(text: string): Printed[] {
  const allLines = text.split("\n");
  const lines = allLines.filter((line) => line.trim().startsWith("{"));
  return lines.map((line) => JSON.parse(line));
}

// The command that runs a step's program, with jsonschema available, in replay mode.
export function stepCommand(stepName: string, folder: string): string[] {
  return [
    "uv",
    "run",
    "--quiet",
    "--with",
    JSONSCHEMA,
    "python",
    KIT_FILE,
    stepName,
    "--folder",
    folder,
  ];
}

export function stepEnvironment(): Record<string, string | undefined> {
  const env = { ...process.env };
  env.LLM_PROVIDER = "replay";
  env.PYTHONDONTWRITEBYTECODE = "1";
  return env;
}

// Each check runs the same program for several rules, so the first run is kept.
const savedRuns = new Map<string, Printed[]>();

export function savedRun(stepName: string, folder: string, stepArguments: string[]): Printed[] {
  const key = [stepName, folder, ...stepArguments].join("\u0001");
  const saved = savedRuns.get(key);
  if (saved) return saved;
  const command = [...stepCommand(stepName, folder), ...stepArguments];
  const finished = Bun.spawnSync(command, { cwd: ROOT, env: stepEnvironment() });
  const printed = jsonLines(finished.stdout.toString());
  savedRuns.set(key, printed);
  return printed;
}

// A2UI messages: the surface's components and its data model, after every message is applied.
export type Component = Record<string, unknown> & { id: string; component: string };
export type Surface = { components: Component[]; dataModel: Record<string, unknown> };

export function surfaceFrom(messages: Record<string, Record<string, unknown>>[]): Surface {
  const surface: Surface = { components: [], dataModel: {} };
  for (const message of messages) {
    const created = message.createSurface;
    const updated = message.updateComponents;
    const newData = message.updateDataModel;
    if (created?.dataModel) surface.dataModel = created.dataModel as Record<string, unknown>;
    if (created?.components) surface.components.push(...(created.components as Component[]));
    if (updated?.components) surface.components.push(...(updated.components as Component[]));
    if (newData) surface.dataModel = newData.value as Record<string, unknown>;
  }
  return surface;
}

// A value as the renderer sees it: a literal, or what {"@path": "/a/b"} points to in the data.
export function resolve(surface: Surface, value: unknown): unknown {
  const binding = value as Record<string, unknown> | null;
  if (!binding || typeof binding !== "object" || !("@path" in binding)) return value;
  const steps = String(binding["@path"]).split("/").filter(Boolean);
  let found: unknown = surface.dataModel;
  for (const step of steps) {
    if (found === null || typeof found !== "object") return undefined;
    found = (found as Record<string, unknown>)[step];
  }
  return found;
}
