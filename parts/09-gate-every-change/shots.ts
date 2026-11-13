// bun parts/09-gate-every-change/shots.ts: capture the picture gate-the-change shows.
// It runs the gate with the sample rules on the desk agent and draws the real output as a dark
// terminal about 800 pixels wide.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { runGate } from "./gate";

const PART = import.meta.dir;
const RULES = join(PART, "01-gate-the-change", "solution", "gate-rules.ts");
const PICTURE = join(PART, "01-gate-the-change", "images", "expected.png");
const COMMAND =
  "bun parts/09-gate-every-change/gate.ts --rules parts/09-gate-every-change/" +
  "01-gate-the-change/problem/gate-rules.ts";

function escapeHtml(text: string): string {
  const withoutAmpersands = text.replace(/&/g, "&amp;");
  return withoutAmpersands.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STYLE = [
  "body{margin:0;background:#0d1117;color:#c9d1d9;",
  "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
  ".win{width:800px;padding:12px 16px}.cmd{color:#e6edf3}.cmd span{color:#7ee787}",
  "pre{margin:4px 0;white-space:pre-wrap;font:inherit}.ok{color:#79c0ff;font-weight:600}",
].join("");

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }
}

const scorecardFolder = mkdtempSync(join(tmpdir(), "scorecard-"));
const result = await runGate({
  rulesFile: RULES,
  scorecardPath: join(scorecardFolder, "SCORECARD.md"),
});
rmSync(scorecardFolder, { recursive: true, force: true });
const lines = result.output.map((line) => line.replace(/Wrote .*\.$/, "Wrote SCORECARD.md."));
const body = escapeHtml(lines.join("\n")).replace(/^(The gate passes.*)$/m, '<b class="ok">$1</b>');
const html =
  `<!doctype html><meta charset="utf-8"><style>${STYLE}</style><div class="win">` +
  `<div class="cmd"><span>$</span> ${escapeHtml(COMMAND)}</div><pre>${body}</pre></div>`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 832, height: 200 }, deviceScaleFactor: 2 });
await page.setContent(html);
mkdirSync(dirname(PICTURE), { recursive: true });
await page.screenshot({ path: PICTURE, fullPage: true });
await browser.close();
console.log(`wrote ${PICTURE}`);
