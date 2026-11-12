// bun run shots: capture every picture the READMEs show, from the real system.
// Pages are screenshotted in Chromium; terminal output is rendered as a dark terminal about 800 pixels wide.
// If Chromium is not installed: bunx playwright install chromium (or set CHROMIUM_PATH to an existing binary).

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "./structure";

const TMP = join(ROOT, "data", "shots");
mkdirSync(TMP, { recursive: true });

function sh(cmd: string[]): string {
  const p = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LLM_PROVIDER: "replay" },
  });
  return new TextDecoder().decode(p.stdout);
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function terminal(blocks: { cmd: string; out: string }[]): string {
  const body = blocks
    .map(
      (b) =>
        `<div class="cmd"><span>$</span> ${esc(b.cmd)}</div><pre>${esc(b.out.trimEnd())
          .replace(/^(\s*MATCH.*)$/gm, '<b class="ok">$1</b>')
          .replace(/^(\s*MISS.*)$/gm, '<b class="miss">$1</b>')
          .replace(/^(Score:.*|Done\..*|The answer is.*)$/gm, '<b class="hi">$1</b>')}</pre>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0d1117;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#c9d1d9}
.win{width:800px;padding:0 0 14px}.bar{height:28px;background:#161b22;display:flex;align-items:center;gap:7px;padding:0 12px}
.bar i{width:11px;height:11px;border-radius:50%;background:#30363d;display:block}.in{padding:12px 16px}
.cmd{color:#e6edf3;margin-top:6px}.cmd span{color:#7ee787}pre{margin:4px 0 10px;white-space:pre-wrap;font:inherit}
b{font-weight:normal}.ok{color:#7ee787}.miss{color:#ffa198}.hi{color:#79c0ff;font-weight:600}
</style><div class="win"><div class="bar"><i></i><i></i><i></i></div><div class="in">${body}</div></div>`;
}

async function launch() {
  if (process.env.CHROMIUM_PATH)
    return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch (e) {
    // A Chromium installed for another Playwright version still works; look for one before giving up.
    const found = [
      ...new Bun.Glob("*/chrome-linux*/chrome").scanSync({
        cwd: "/opt/pw-browsers",
        absolute: true,
      }),
    ][0];
    if (found) return chromium.launch({ executablePath: found });
    throw e;
  }
}
const browser = await launch();
async function shoot(html: string, out: string[], width: number, selector?: string) {
  const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  for (const o of out) {
    mkdirSync(dirname(join(ROOT, o)), { recursive: true });
    if (selector) await page.locator(selector).screenshot({ path: join(ROOT, o) });
    else await page.screenshot({ path: join(ROOT, o), fullPage: true });
    console.log(`wrote ${o}`);
  }
  await page.close();
}

// 1. The finished system's answer page.
const DEMO = "Which Sao Paulo sellers had the most late deliveries in 2018?";
sh(["uv", "run", "--quiet", "ask-finished", DEMO, "--html", join(TMP, "answer.html")]);
await shoot(
  readFileSync(join(TMP, "answer.html"), "utf8"),
  ["images/finished-system.png", "00-orientation/images/finished-answer.png"],
  1100,
);

// 2. meet-the-desk: both agents on the Sao Paulo question.
const Q = "How many sellers are based in Sao Paulo city?";
await shoot(
  terminal([
    { cmd: `uv run ask-naive "${Q}"`, out: sh(["uv", "run", "--quiet", "ask-naive", Q]) },
    { cmd: `uv run ask-finished "${Q}"`, out: sh(["uv", "run", "--quiet", "ask-finished", Q]) },
  ]),
  ["00-orientation/01-meet-the-desk/images/expected.png"],
  800,
  ".win",
);

// 3. score-the-naive-agent: the scorer's output.
const score = sh(["bun", "scripts/score.ts", "naive", "--for", "score-the-naive-agent"]);
rmSync(join(ROOT, "parts/01-score-the-naive-agent/01-score-the-naive-agent/problem/runs"), {
  recursive: true,
  force: true,
});
await shoot(
  terminal([{ cmd: "bun run score naive --for score-the-naive-agent", out: score }]),
  ["parts/01-score-the-naive-agent/01-score-the-naive-agent/images/expected.png"],
  800,
  ".win",
);

await browser.close();
