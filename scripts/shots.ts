// bun run shots: capture every picture the READMEs show, from the real system.
// Pages are screenshotted in Chromium;
// terminal output is rendered as a dark terminal about 800 pixels wide.
// If Chromium is not installed: bunx playwright install chromium
// (or set CHROMIUM_PATH to an existing binary).

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "./structure";

// Pages made on the way to a picture go here, inside the git-ignored data folder.
const WORK_FOLDER = join(ROOT, "data", "shots");
mkdirSync(WORK_FOLDER, { recursive: true });

// Runs a command in replay mode, so no model key is needed, and returns what it printed.
function outputOf(command: string[]): string {
  const env = { ...process.env };
  env.LLM_PROVIDER = "replay";
  const finished = Bun.spawnSync(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe", env });
  return new TextDecoder().decode(finished.stdout);
}

function escapeHtml(text: string): string {
  const withoutAmpersands = text.replace(/&/g, "&amp;");
  return withoutAmpersands.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Colours the lines a reader should look at first.
function highlight(output: string): string {
  let html = escapeHtml(output.trimEnd());
  html = html.replace(/^(\s*MATCH.*)$/gm, '<b class="ok">$1</b>');
  html = html.replace(/^(\s*MISS.*)$/gm, '<b class="miss">$1</b>');
  html = html.replace(/^(Score:.*|Done\..*|The answer is.*)$/gm, '<b class="hi">$1</b>');
  return html;
}

const TERMINAL_STYLE = [
  "body{margin:0;background:#0d1117;" +
    "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#c9d1d9}",
  ".win{width:800px;padding:0 0 14px}" +
    ".bar{height:28px;background:#161b22;display:flex;align-items:center;gap:7px;padding:0 12px}",
  ".bar i{width:11px;height:11px;border-radius:50%;background:#30363d;display:block}" +
    ".in{padding:12px 16px}",
  ".cmd{color:#e6edf3;margin-top:6px}.cmd span{color:#7ee787}" +
    "pre{margin:4px 0 10px;white-space:pre-wrap;font:inherit}",
  "b{font-weight:normal}.ok{color:#7ee787}.miss{color:#ffa198}" +
    ".hi{color:#79c0ff;font-weight:600}",
].join("\n");

type TerminalBlock = { command: string; output: string };

function terminal(blocks: TerminalBlock[]): string {
  const body = blocks
    .map(
      (block) =>
        `<div class="cmd"><span>$</span> ${escapeHtml(block.command)}</div>` +
        `<pre>${highlight(block.output)}</pre>`,
    )
    .join("");
  const terminalWindow =
    '<div class="win"><div class="bar"><i></i><i></i><i></i></div>' +
    `<div class="in">${body}</div></div>`;
  const head = `<!doctype html><meta charset="utf-8"><style>\n${TERMINAL_STYLE}\n</style>`;
  return head + terminalWindow;
}

async function launch() {
  if (process.env.CHROMIUM_PATH) {
    return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  }
  try {
    return await chromium.launch();
  } catch (error) {
    // A Chromium installed for another Playwright version still works;
    // look for one before giving up.
    const installed = new Bun.Glob("*/chrome-linux*/chrome").scanSync({
      cwd: "/opt/pw-browsers",
      absolute: true,
    });
    const found = [...installed][0];
    if (found) return chromium.launch({ executablePath: found });
    throw error;
  }
}
const browser = await launch();

async function shoot(html: string, picturePaths: string[], width: number, selector?: string) {
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  for (const picturePath of picturePaths) {
    const fullPath = join(ROOT, picturePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    if (selector) await page.locator(selector).screenshot({ path: fullPath });
    else await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`wrote ${picturePath}`);
  }
  await page.close();
}

// 1. The finished system's answer page.
const DEMO_QUESTION = "Which Sao Paulo sellers had the most late deliveries in 2018?";
const answerPage = join(WORK_FOLDER, "answer.html");
outputOf(["uv", "run", "--quiet", "ask-finished", DEMO_QUESTION, "--html", answerPage]);
await shoot(
  readFileSync(answerPage, "utf8"),
  ["images/finished-system.png", "00-orientation/images/finished-answer.png"],
  1100,
);

// 2. meet-the-desk: both agents on the Sao Paulo question.
const SELLERS_QUESTION = "How many sellers are based in Sao Paulo city?";
await shoot(
  terminal([
    {
      command: `uv run ask-naive "${SELLERS_QUESTION}"`,
      output: outputOf(["uv", "run", "--quiet", "ask-naive", SELLERS_QUESTION]),
    },
    {
      command: `uv run ask-finished "${SELLERS_QUESTION}"`,
      output: outputOf(["uv", "run", "--quiet", "ask-finished", SELLERS_QUESTION]),
    },
  ]),
  ["00-orientation/01-meet-the-desk/images/expected.png"],
  800,
  ".win",
);

// 3. score-the-naive-agent: the scorer's output.
const scoreStep = "parts/01-score-the-naive-agent/01-score-the-naive-agent";
const scoreOutput = outputOf([
  "bun",
  "scripts/score.ts",
  "naive",
  "--for",
  "score-the-naive-agent",
]);
// The scorer wrote a run into the step's problem folder; the learner should start without one.
rmSync(join(ROOT, scoreStep, "problem/runs"), { recursive: true, force: true });
await shoot(
  terminal([{ command: "bun run score naive --for score-the-naive-agent", output: scoreOutput }]),
  [`${scoreStep}/images/expected.png`],
  800,
  ".win",
);

await browser.close();
