// bun parts/02-lock-the-database/shots.ts: capture the picture refuse-the-mutation shows.
// It runs the sample solution in replay mode and renders the output as a dark terminal,
// the same way scripts/shots.ts does for the other parts.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "../../scripts/structure";

const STEP = "parts/02-lock-the-database/03-refuse-the-mutation";
const AGENT = `${STEP}/solution/ask.py`;
const QUESTIONS = ["Delete the test orders", "How many orders are in the data?"];

function outputOf(question: string): string {
  const environment = { ...process.env };
  environment.LLM_PROVIDER = "replay";
  const command = ["uv", "run", "--quiet", "python", AGENT, question];
  const finished = Bun.spawnSync(command, { cwd: ROOT, stdout: "pipe", env: environment });
  return new TextDecoder().decode(finished.stdout).trimEnd();
}

function escapeHtml(text: string): string {
  const withoutAmpersands = text.replace(/&/g, "&amp;");
  return withoutAmpersands.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STYLE = [
  "body{margin:0;background:#0d1117;color:#c9d1d9;",
  "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
  ".win{width:800px;padding:0 0 14px}",
  ".bar{height:28px;background:#161b22;display:flex;align-items:center;gap:7px;padding:0 12px}",
  ".bar i{width:11px;height:11px;border-radius:50%;background:#30363d;display:block}",
  ".in{padding:12px 16px}.cmd{color:#e6edf3;margin-top:6px}.cmd span{color:#7ee787}",
  "pre{margin:4px 0 10px;white-space:pre-wrap;font:inherit;color:#79c0ff}",
].join("");

function terminalPage(): string {
  const blocks = QUESTIONS.map((question) => {
    const command = `uv run python ask.py "${question}"`;
    const output = escapeHtml(outputOf(question));
    return `<div class="cmd"><span>$</span> ${escapeHtml(command)}</div><pre>${output}</pre>`;
  });
  const bar = '<div class="bar"><i></i><i></i><i></i></div>';
  const body = `<div class="win">${bar}<div class="in">${blocks.join("")}</div></div>`;
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${body}`;
}

const picturePath = join(ROOT, STEP, "images", "expected.png");
mkdirSync(dirname(picturePath), { recursive: true });
// Use CHROMIUM_PATH, or a Chromium that another Playwright version installed, when there is one.
function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const installed = new Bun.Glob("*/chrome-linux*/chrome").scanSync({
    cwd: "/opt/pw-browsers",
    absolute: true,
  });
  return [...installed][0];
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 2 });
await page.setContent(terminalPage(), { waitUntil: "load" });
await page.locator(".win").screenshot({ path: picturePath });
await browser.close();
console.log(`wrote ${STEP}/images/expected.png`);
