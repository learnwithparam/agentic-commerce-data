// bun parts/08-delegate-over-a2a/shots.ts: capture the two pictures this part shows,
// from the sample solutions. The browser shows the served card; the terminal picture is the
// real output of three hand-offs, drawn as a dark terminal about 800 pixels wide.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import {
  askOps,
  newTempFolder,
  removeFolder,
  startServer,
  startTeamAgent,
} from "./a2a-check-tools";

const PART = import.meta.dir;
const QUESTION = "Why was order 9b189f6cf2ef734a7dd0419ed3c64d99 late?";

function escapeHtml(text: string): string {
  const withoutAmpersands = text.replace(/&/g, "&amp;");
  return withoutAmpersands.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TERMINAL_STYLE = [
  "body{margin:0;background:#0d1117;color:#c9d1d9;",
  "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
  ".win{width:800px;padding:12px 16px}.cmd{color:#e6edf3;margin-top:6px}.cmd span{color:#7ee787}",
  "pre{margin:4px 0 12px;white-space:pre-wrap;font:inherit}.no{color:#ffa198}.ok{color:#7ee787}",
].join("");

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }
}

async function shoot(url: string, picture: string, width: number) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height: 300 }, deviceScaleFactor: 2 });
  await page.goto(url);
  mkdirSync(dirname(picture), { recursive: true });
  await page.screenshot({ path: picture, fullPage: true });
  await browser.close();
  console.log(`wrote ${picture}`);
}

async function cardPicture() {
  const folder = join(PART, "01-publish-the-card", "solution");
  const server = await startServer(join(folder, "ops_agent.py"), ["serve"]);
  try {
    const picture = join(PART, "01-publish-the-card", "images", "expected.png");
    await shoot(`${server.url}/.well-known/agent-card.json`, picture, 800);
  } finally {
    server.stop();
  }
}

async function oneHandOff(team: "logistics" | "pricing" | "impostor", logFolder: string) {
  const folder = join(PART, "05-refuse-the-unsigned", "solution");
  const agent = await startTeamAgent(team, join(logFolder, `${team}.jsonl`));
  try {
    const { answer } = await askOps(folder, QUESTION, agent.url);
    const said = String(answer?.reason ?? answer?.answer ?? "");
    const label = answer?.refused ? "no" : "ok";
    const command = `uv run ops_agent.py ask "${QUESTION}" --remote <${team} agent>`;
    return (
      `<div class="cmd"><span>$</span> ${escapeHtml(command)}</div>` +
      `<pre class="${label}">${escapeHtml(said)}</pre>`
    );
  } finally {
    agent.stop();
  }
}

async function refusalPicture() {
  const logFolder = newTempFolder();
  const blocks: string[] = [];
  for (const team of ["pricing", "impostor", "logistics"] as const) {
    blocks.push(await oneHandOff(team, logFolder));
  }
  removeFolder(logFolder);
  const html =
    `<!doctype html><meta charset="utf-8"><style>${TERMINAL_STYLE}</style>` +
    `<div class="win">${blocks.join("")}</div>`;
  const page = join(logFolder.replace(/a2a-check-[^/]*$/, ""), "refuse-the-unsigned.html");
  await Bun.write(page, html);
  const picture = join(PART, "05-refuse-the-unsigned", "images", "expected.png");
  await shoot(`file://${page}`, picture, 832);
}

await cardPicture();
await refusalPicture();
