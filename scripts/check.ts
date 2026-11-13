// bun run check: the repo standard. CI runs this; any failure stops the build.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { allSteps, type Part, parts, ROOT, type Step } from "./structure";

const errors: string[] = [];

function fail(where: string, what: string) {
  const place = relative(ROOT, where) || ".";
  errors.push(`${place}: ${what}`);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const STEP_SECTIONS = [
  "## The problem",
  "## Your challenge",
  "## Done when",
  "## If you get stuck",
  "## Words you will use",
];
const HYPE_WORDS = new RegExp(
  "\\b(supercharge|unleash|unlock|seamless(ly)?|leverage|dive into|game[- ]changer|" +
    "revolutioni[sz]e|magic(al)?|cutting[- ]edge|AI-powered)\\b",
  "i",
);
const TIME_WORDS = /\b(week|day|hour)\s+\d+\b/i;
const VERB_THING = /^[a-z]+(-[a-z0-9]+)+$/;
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const MERMAID = /```mermaid\n/;
const MODEL_ID = /\b(claude-[a-z0-9-]+-\d|gpt-\d[\w.-]*|gemini-\d[\w.-]*|o\d-(mini|pro)\b)/i;

// Tool and data folders are all git-ignored, so the standard does not look inside them.
const SKIPPED_FOLDERS = ["node_modules", ".git", ".venv", "__pycache__", ".cache", "data"];

function allFilesIn(folder: string, found: string[] = []): string[] {
  for (const entry of readdirSync(folder)) {
    if (SKIPPED_FOLDERS.includes(entry)) continue;
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) allFilesIn(path, found);
    else found.push(path);
  }
  return found;
}

function hasImage(text: string): boolean {
  return [...text.matchAll(IMAGE)].length > 0;
}

// 1. No Makefile anywhere.
function checkNoMakefile(files: string[]) {
  for (const file of files) {
    if (/(^|\/)(GNU)?[Mm]akefile$/.test(file)) {
      fail(file, "a Makefile is not allowed; use a Bun or uv script");
    }
  }
}

// 2. Prose rules on every Markdown file.
function checkProseLine(file: string, line: string, lineNumber: number) {
  if (line.includes("—")) fail(file, `line ${lineNumber}: em dash`);
  const hypeWord = line.match(HYPE_WORDS);
  if (hypeWord) fail(file, `line ${lineNumber}: hype word "${hypeWord[0]}"`);
  const timeWord = line.match(TIME_WORDS);
  if (timeWord && !file.includes("schedules")) {
    fail(file, `line ${lineNumber}: "${timeWord[0]}"; content is in parts, schedules map time`);
  }
  if (/\bM=\d+|verify \d+/.test(line)) {
    fail(file, `line ${lineNumber}: numeric step command; name the step`);
  }
}

function checkProse(markdownFiles: string[]) {
  for (const file of markdownFiles) {
    const lines = read(file).split("\n");
    for (let i = 0; i < lines.length; i++) checkProseLine(file, lines[i], i + 1);
  }
}

// 2b. Every page shows, not only tells: images it names exist, and the key pages carry a picture.
function checkImagesExist(markdownFiles: string[]) {
  for (const file of markdownFiles) {
    for (const imageMatch of read(file).matchAll(IMAGE)) {
      const imagePath = imageMatch[1];
      if (/^https?:/.test(imagePath)) continue;
      if (!existsSync(join(dirname(file), imagePath))) {
        fail(file, `image "${imagePath}" does not exist`);
      }
    }
  }
}

type PictureNeeds = { mermaid: boolean; image: boolean };

function needPicture(file: string, what: string, needs: PictureNeeds) {
  if (!existsSync(file)) return fail(file, "missing");
  const text = read(file);
  if (needs.mermaid && !MERMAID.test(text)) fail(file, `${what} needs a Mermaid diagram`);
  if (needs.image && !hasImage(text)) fail(file, `${what} needs a screenshot`);
}

// 3. Parts and steps.
function checkPartReadme(part: Part) {
  const readme = join(part.dir, "README.md");
  if (!existsSync(readme)) {
    fail(part.dir, "part has no README.md");
    return;
  }
  const text = read(readme);
  if (!MERMAID.test(text)) fail(readme, "part README needs a Mermaid diagram");
  const walkthrough = text.split("## Walkthrough")[1]?.split("\n## ")[0];
  if (walkthrough === undefined) {
    fail(readme, `part README needs a "## Walkthrough" section`);
  } else if (!walkthrough.includes("```bash")) {
    fail(readme, "the walkthrough needs the commands, each with an Expect: line");
  }
}

function checkStepFolder(step: Step, seenNames: Set<string>) {
  if (!VERB_THING.test(step.name)) {
    fail(step.dir, `step name "${step.name}" must be verb-thing in lower case`);
  }
  if (seenNames.has(step.name)) fail(step.dir, `step name "${step.name}" is used twice`);
  seenNames.add(step.name);
  if (!existsSync(join(step.dir, "step.toml"))) fail(step.dir, "missing step.toml");
  const minutes = step.meta.minutes;
  if (minutes < 5 || minutes > 30) {
    fail(step.dir, `step is ${minutes} min; keep a step between 5 and 30, split it if longer`);
  }
}

function checkStepReadme(step: Step, stepReadme: string) {
  const text = read(stepReadme);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 600) {
    fail(stepReadme, `${words} words; a step README stays under 600, split the step`);
  }
  for (const section of STEP_SECTIONS) {
    if (!text.includes(section)) fail(stepReadme, `missing section "${section}"`);
  }
  if (!MERMAID.test(text) && !hasImage(text)) {
    fail(stepReadme, "a step shows a picture: a screenshot or a Mermaid diagram");
  }
  const doneWhen = text.split("## Done when")[1]?.split("\n## ")[0] ?? "";
  if (!/^- /m.test(doneWhen)) fail(stepReadme, "Done when needs at least one bullet");
  if (step.meta.screen) checkScreenshot(step, stepReadme, text);
}

function checkScreenshot(step: Step, stepReadme: string, text: string) {
  const expectedImage = join(step.dir, "images", "expected.png");
  if (!existsSync(expectedImage)) fail(step.dir, "screen step needs images/expected.png");
  if (!text.includes("images/expected.png")) {
    fail(stepReadme, "screen step must show ../images/expected.png");
  }
}

function checkStepFiles(step: Step) {
  if (step.meta.solution && !existsSync(join(step.dir, "solution"))) {
    fail(step.dir, "step.toml says solution but there is no solution/");
  }
  const hasTypeScriptCheck = existsSync(join(ROOT, "checks", `${step.name}.ts`));
  const hasPythonCheck = existsSync(join(ROOT, "checks", `${step.name}.py`));
  if (!hasTypeScriptCheck && !hasPythonCheck) {
    fail(step.dir, `no check at checks/${step.name}.ts`);
  }
}

function checkStep(step: Step, seenNames: Set<string>) {
  checkStepFolder(step, seenNames);
  const stepReadme = join(step.dir, "problem", "README.md");
  if (!existsSync(stepReadme)) {
    fail(step.dir, "missing problem/README.md");
    return;
  }
  checkStepReadme(step, stepReadme);
  checkStepFiles(step);
}

function checkParts(allParts: Part[]) {
  const seenNames = new Set<string>();
  if (allParts.length === 0) fail(join(ROOT, "parts"), "no parts");
  for (const part of allParts) {
    checkPartReadme(part);
    if (part.steps.length === 0) fail(part.dir, "part has no steps");
    for (const step of part.steps) checkStep(step, seenNames);
  }
}

// 4. Commands: the README runs the finished system first,
// and every command block says what to expect.
function checkRootReadmeOrder() {
  const rootReadme = join(ROOT, "README.md");
  if (!existsSync(rootReadme)) {
    fail(ROOT, "missing README.md");
    return;
  }
  const text = read(rootReadme);
  const firstCode = text.indexOf("```bash");
  const firstConcept = text.search(/^## (How it works|Concepts|Background|Why)/m);
  if (firstCode < 0) {
    fail(rootReadme, "the README needs a bash block that runs the finished system");
  } else if (firstConcept >= 0 && firstConcept < firstCode) {
    fail(rootReadme, "run the finished system before any concept section");
  }
}

function checkExpectLines(file: string) {
  const lines = read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```bash") continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "```") j++;
    const lineAfterBlock = lines.slice(j + 1).find((line) => line.trim() !== "");
    if (!lineAfterBlock?.startsWith("Expect:")) {
      fail(file, `line ${i + 1}: a bash block must be followed by an Expect: line`);
    }
    i = j;
  }
}

// 5. One model config, exact pins, a troubleshooting table.
function mayNameModels(file: string): boolean {
  // Models are named in config/models; this file holds the pattern, so it would always match.
  return file.includes("/config/models.") || file.includes("/scripts/check.ts");
}

function checkModelIds(files: string[]) {
  for (const file of files) {
    if (!/\.(ts|py|md|json|toml|ya?ml)$/.test(file) || mayNameModels(file)) continue;
    const modelId = read(file).match(MODEL_ID);
    if (modelId) {
      fail(file, `model id "${modelId[0]}" outside config/models; name models in one place`);
    }
  }
}

function checkPackagePins() {
  const packageFile = join(ROOT, "package.json");
  if (!existsSync(packageFile)) return;
  const packageJson = JSON.parse(read(packageFile));
  const versions: Record<string, string> = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  for (const [name, version] of Object.entries(versions)) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      fail(packageFile, `${name}@${version}: pin an exact version`);
    }
  }
}

function checkPythonPins() {
  const pyproject = join(ROOT, "pyproject.toml");
  if (!existsSync(pyproject)) return;
  const loosePin = /"([A-Za-z0-9_.\-[\]]+)\s*(>=|~=|\^|>|<)[^"]*"/g;
  for (const pinMatch of read(pyproject).matchAll(loosePin)) {
    fail(pyproject, `${pinMatch[1]}: pin with == not ${pinMatch[2]}`);
  }
}

function checkTroubleshootingTable() {
  const trouble = join(ROOT, "00-orientation", "troubleshooting.md");
  const tableHeader = /\| *What you see *\| *What it means *\| *Fix *\|/;
  if (!existsSync(trouble) || !tableHeader.test(read(trouble))) {
    fail(
      ROOT,
      "00-orientation/troubleshooting.md needs a table: What you see | What it means | Fix",
    );
  }
}

// 6. Every schedule covers every part, and the minutes add up.
type Session = { parts: string[]; minutes: number };
type Schedules = Record<string, { sessions: Session[] }>;

function minutesPerPart(allParts: Part[]): Record<string, number> {
  const minutes: Record<string, number> = {};
  for (const part of allParts) {
    let total = 0;
    for (const step of part.steps) total += step.meta.minutes;
    minutes[part.name] = total;
  }
  return minutes;
}

function checkOneSchedule(scheduleName: string, sessions: Session[], allParts: Part[]) {
  const schedulePath = join(ROOT, "schedules.toml");
  const partMinutes = minutesPerPart(allParts);
  const listed = sessions.flatMap((session) => session.parts);
  for (const part of allParts) {
    if (!listed.includes(part.name)) {
      fail(schedulePath, `${scheduleName} leaves out part "${part.name}"`);
    }
  }
  for (const session of sessions) {
    let need = 0;
    for (const partName of session.parts) need += partMinutes[partName] ?? 0;
    if (need > session.minutes) {
      fail(schedulePath, `${scheduleName}: a session needs ${need} min but has ${session.minutes}`);
    }
  }
}

function checkSchedules(allParts: Part[]) {
  const schedulePath = join(ROOT, "schedules.toml");
  if (!existsSync(schedulePath)) {
    fail(ROOT, "missing schedules.toml");
    return;
  }
  const schedules = Bun.TOML.parse(read(schedulePath)) as Schedules;
  for (const [scheduleName, schedule] of Object.entries(schedules)) {
    checkOneSchedule(scheduleName, schedule.sessions, allParts);
  }
}

const files = allFilesIn(ROOT);
const markdownFiles = files.filter((file) => file.endsWith(".md"));
const allParts = parts();

checkNoMakefile(files);
checkProse(markdownFiles);
checkImagesExist(markdownFiles);
needPicture(join(ROOT, "README.md"), "the root README", { mermaid: true, image: true });
needPicture(join(ROOT, "00-orientation", "README.md"), "the orientation", {
  mermaid: false,
  image: true,
});
checkParts(allParts);
checkRootReadmeOrder();
for (const file of markdownFiles) checkExpectLines(file);
checkModelIds(files);
checkPackagePins();
checkPythonPins();
checkTroubleshootingTable();
checkSchedules(allParts);

if (errors.length) {
  console.log(`The repo does not meet the standard. ${errors.length} problem(s):`);
  for (const error of errors) console.log(`  - ${error}`);
  process.exit(1);
}
console.log(
  `The repo meets the standard: ${allParts.length} part(s), ${allSteps().length} step(s).`,
);
