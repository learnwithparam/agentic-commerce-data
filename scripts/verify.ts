// bun run verify <step-name>            check your work on one step,
//                                       then show progress on every step
// bun run verify <step-name> solution   check the sample solution instead
// bun run verify part <part-name>      check every step in one part (a deliverable)
// bun run verify --report               write verify-report.json for cohort grading
// bun run verify --all                  CI: each check fails on its starter and wrong answers,
//                                       and passes on its solution
// Exit codes: 0 pass, 1 fail, 2 the check could not run.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allSteps, findStep, parts, ROOT, type Step } from "./structure";

export type Rule = {
  says: string;
  test: (dir: string) => boolean | Promise<boolean>;
  tryNext: string;
};
type Result = {
  step: string;
  status: "pass" | "fail" | "error";
  passed: number;
  total: number;
  failed: string[];
};

async function rulesFor(step: Step): Promise<Rule[]> {
  const checkModule = await import(join(ROOT, "checks", `${step.name}.ts`));
  return checkModule.default;
}

async function rulePasses(rule: Rule, dir: string): Promise<boolean> {
  // A rule that throws has not shown the work is right, so it counts as a fail.
  try {
    return await rule.test(dir);
  } catch {
    return false;
  }
}

function printRule(rule: Rule, ok: boolean) {
  if (ok) console.log(`  PASS  ${rule.says}`);
  else console.log(`  FAIL  ${rule.says}\n        Try next: ${rule.tryNext}`);
}

async function runCheck(step: Step, dir: string, print = false): Promise<Result> {
  let rules: Rule[];
  try {
    rules = await rulesFor(step);
  } catch (error) {
    if (print) {
      const reason = (error as Error).message;
      console.log(`  ERROR  the check for ${step.name} could not load: ${reason}`);
    }
    return { step: step.name, status: "error", passed: 0, total: 0, failed: [] };
  }
  const failed: string[] = [];
  for (const rule of rules) {
    const ok = await rulePasses(rule, dir);
    if (!ok) failed.push(rule.says);
    if (print) printRule(rule, ok);
  }
  return {
    step: step.name,
    status: failed.length ? "fail" : "pass",
    passed: rules.length - failed.length,
    total: rules.length,
    failed,
  };
}

const learnerWork = (step: Step) => join(step.dir, "problem");

function wrongAnswers(step: Step): { name: string; dir: string }[] {
  const wrongFolder = join(step.dir, "wrong");
  if (!existsSync(wrongFolder)) return [];
  const mistakes = readdirSync(wrongFolder);
  return mistakes.map((mistake) => ({ name: mistake, dir: join(wrongFolder, mistake) }));
}

// --all: prove each check can tell right from wrong.
async function problemsWithRules(step: Step, rules: Rule[]): Promise<string[]> {
  const problems: string[] = [];
  for (const rule of rules) {
    if (rule.tryNext.trim().split(/\s+/).length < 3) {
      problems.push(`${step.name}: rule "${rule.says}" needs a try-next sentence`);
    }
  }
  const starter = await runCheck(step, learnerWork(step));
  if (starter.status === "pass") {
    problems.push(`${step.name}: the check passes on the starter, so it checks nothing`);
  }
  return problems;
}

async function problemsWithSolution(step: Step): Promise<string[]> {
  const solutionDir = join(step.dir, "solution");
  if (!existsSync(solutionDir)) {
    return [`${step.name}: needs solution/ so CI can prove the check can pass`];
  }
  const solution = await runCheck(step, solutionDir);
  if (solution.status === "pass") return [];
  return [`${step.name}: the sample solution fails: ${solution.failed.join("; ")}`];
}

async function problemsWithWrongAnswers(step: Step): Promise<string[]> {
  const problems: string[] = [];
  const wrong = wrongAnswers(step);
  if (wrong.length === 0) {
    problems.push(
      `${step.name}: needs at least one wrong/<mistake>/ answer that the check must reject`,
    );
  }
  for (const answer of wrong) {
    const result = await runCheck(step, answer.dir);
    if (result.status === "pass") {
      problems.push(`${step.name}: wrong answer "${answer.name}" passes the check`);
    }
  }
  return problems;
}

async function problemsWithStep(step: Step): Promise<string[]> {
  let rules: Rule[] = [];
  try {
    rules = await rulesFor(step);
  } catch (error) {
    return [`${step.name}: the check could not load: ${(error as Error).message}`];
  }
  return [
    ...(await problemsWithRules(step, rules)),
    ...(await problemsWithSolution(step)),
    ...(await problemsWithWrongAnswers(step)),
  ];
}

async function verifyAllChecks(): Promise<number> {
  const problems: string[] = [];
  for (const step of allSteps()) problems.push(...(await problemsWithStep(step)));
  for (const problem of problems) console.log(`  ${problem}`);
  if (problems.length) {
    console.log(`${problems.length} check problem(s).`);
    return 1;
  }
  console.log("Every check rejects its starter and wrong answers, and passes its solution.");
  return 0;
}

// --report: one JSON file with every step's result.
async function writeReport(): Promise<number> {
  const results = [];
  for (const step of allSteps()) results.push(await runCheck(step, learnerWork(step)));
  const reportPath = join(ROOT, "verify-report.json");
  const report = { version: 1, at: new Date().toISOString(), results };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const passing = results.filter((result) => result.status === "pass").length;
  console.log(`Wrote verify-report.json: ${passing} of ${results.length} steps pass.`);
  return 0;
}

// part <part-name>: every step in one part.
function listParts(partName: string | undefined): number {
  if (partName) console.log(`There is no part called "${partName}". Parts:`);
  else console.log("Name a part. Parts:");
  for (const part of parts()) console.log(`  bun run verify part ${part.name}`);
  return 1;
}

async function verifyPart(partName: string | undefined): Promise<number> {
  const part = parts().find((candidate) => candidate.name === partName);
  if (!part) return listParts(partName);
  console.log(`Part ${part.name}:`);
  const results: Result[] = [];
  for (const step of part.steps) {
    const result = await runCheck(step, learnerWork(step));
    results.push(result);
    const status = result.status.toUpperCase().padEnd(5);
    console.log(`  ${status}  ${step.name}  (${result.passed}/${result.total} rules)`);
  }
  const done = results.filter((result) => result.status === "pass").length;
  const total = results.length;
  if (done === total) console.log(`Part ${part.name} is done: ${done}/${total} steps pass.`);
  else {
    console.log(
      `${done}/${total} steps pass. Run bun run verify <step-name> on a FAIL line to see why.`,
    );
  }
  if (results.some((result) => result.status === "error")) return 2;
  if (done === total) return 0;
  return 1;
}

// <step-name> [solution]: one step, in detail.
function listSteps(stepName: string | undefined): number {
  if (stepName) console.log(`There is no step called "${stepName}". Steps:`);
  else console.log("Name a step. Steps:");
  for (const step of allSteps()) console.log(`  bun run verify ${step.name}`);
  return 1;
}

async function printProgress() {
  // Done is recomputed from the checks every time, never read from a saved flag.
  const results = [];
  for (const step of allSteps()) results.push(await runCheck(step, learnerWork(step)));
  const passing = results.filter((result) => result.status === "pass").length;
  console.log(`Progress: ${passing}/${results.length} steps pass.`);
}

async function verifyStep(stepName: string | undefined, which: string | undefined) {
  const step = stepName && findStep(stepName);
  if (!step) return listSteps(stepName);
  const asSolution = which === "solution";
  const whose = asSolution ? "sample solution" : "your work";
  console.log(`Checking ${step.name} (${whose}):`);
  const dir = asSolution ? join(step.dir, "solution") : learnerWork(step);
  const result = await runCheck(step, dir, true);
  if (result.status === "error") return 2;
  if (result.status === "pass") console.log(`Done. All ${result.total} rules pass.`);
  else {
    console.log(
      `${result.passed} of ${result.total} rules pass. Fix the FAIL lines and run it again.`,
    );
  }
  if (!asSolution) await printProgress();
  if (result.status === "pass") return 0;
  return 1;
}

async function main(): Promise<number> {
  const [command, which] = process.argv.slice(2);
  if (command === "--all") return verifyAllChecks();
  if (command === "--report") return writeReport();
  if (command === "part") return verifyPart(which);
  return verifyStep(command, which);
}

process.exit(await main());
