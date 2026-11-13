// bun parts/05-build-the-loop/shots.ts: capture the pictures of this part from the real output.
// Terminal output is rendered as a dark terminal about 800 pixels wide and captured in Chromium.
import { join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "../../scripts/structure";

const PART = "parts/05-build-the-loop";
const DEMO_QUESTION = "Which Sao Paulo sellers had the most late deliveries in 2018?";

function outputOf(command: string[]): string {
  const env = { ...process.env };
  env.LLM_PROVIDER = "replay";
  const finished = Bun.spawnSync(command, { cwd: ROOT, env });
  return finished.stdout.toString();
}

function escapeHtml(text: string): string {
  const withoutAmpersands = text.replace(/&/g, "&amp;");
  return withoutAmpersands.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TERMINAL_STYLE =
  "body{margin:0;background:#0d1117;color:#c9d1d9;" +
  "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}" +
  ".win{width:800px;padding:0 0 14px}.bar{height:28px;background:#161b22}" +
  ".in{padding:12px 16px}.cmd{color:#e6edf3}.cmd span{color:#7ee787}" +
  "pre{margin:4px 0 10px;white-space:pre-wrap;font:inherit}.hi{color:#79c0ff;font-weight:600}";

function terminal(command: string, output: string): string {
  let body = escapeHtml(output.trimEnd());
  body = body.replace(/^(Sources:)$/gm, '<b class="hi">$1</b>');
  const shownCommand = `<div class="cmd"><span>$</span> ${escapeHtml(command)}</div>`;
  const page = `<div class="win"><div class="bar"></div><div class="in">${shownCommand}`;
  const head = `<!doctype html><meta charset="utf-8"><style>${TERMINAL_STYLE}</style>`;
  return `${head}${page}<pre>${body}</pre></div></div>`;
}

const kit = `${PART}/kit.py`;
const command = ["uv", "run", "--quiet", "python", kit, "cite-the-rows", "--folder", "solution"];
const output = outputOf([...command, DEMO_QUESTION]);
const shownCommand = `uv run python ${kit} cite-the-rows "${DEMO_QUESTION}"`;

// A Chromium installed for another Playwright version still works, so look for one first.
const installed = new Bun.Glob("*/chrome-linux*/chrome").scanSync({
  cwd: "/opt/pw-browsers",
  absolute: true,
});
const executablePath = process.env.CHROMIUM_PATH ?? [...installed][0];
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(terminal(shownCommand, output));
const picture = join(ROOT, PART, "04-cite-the-rows", "images", "expected.png");
await page.locator(".win").screenshot({ path: picture });
console.log(`wrote ${picture}`);
await browser.close();
