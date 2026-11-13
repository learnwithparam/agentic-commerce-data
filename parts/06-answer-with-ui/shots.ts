// bun parts/06-answer-with-ui/shots.ts: capture the pictures of this part from the real renderer.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "../../scripts/structure";
import { stepCommand, stepEnvironment } from "./kit";

const PART = join(ROOT, "parts", "06-answer-with-ui");
const WORK_FOLDER = join(ROOT, "data", "shots");
const DEMO_QUESTION = "Which Sao Paulo sellers had the most late deliveries in 2018?";
const PORT = 8016;

// A Chromium installed for another Playwright version still works, so look for one first.
const installed = new Bun.Glob("*/chrome-linux*/chrome").scanSync({
  cwd: "/opt/pw-browsers",
  absolute: true,
});
const executablePath = process.env.CHROMIUM_PATH ?? [...installed][0];
const browser = await chromium.launch({ executablePath });
const viewport = { width: 1100, height: 700 };

// 1. render-the-answer: the sample solution's surface, drawn by the provided renderer.
mkdirSync(WORK_FOLDER, { recursive: true });
const answerPage = join(WORK_FOLDER, "render-the-answer.html");
const renderCommand = [...stepCommand("render-the-answer", "solution"), DEMO_QUESTION];
Bun.spawnSync([...renderCommand, "--html", answerPage], { cwd: ROOT, env: stepEnvironment() });
const renderPage = await browser.newPage({ viewport, deviceScaleFactor: 2 });
await renderPage.setContent(readFileSync(answerPage, "utf8"));
await renderPage.screenshot({
  path: join(PART, "01-render-the-answer", "images", "expected.png"),
  fullPage: true,
});

// 2. stream-the-events: the sample server, with a slow database, after one question.
const env = stepEnvironment();
env.RENDER_FOLDER = "solution";
env.DESK_SLOW_SECONDS = "2";
const serverCommand = [...stepCommand("stream-the-events", "solution"), "--port", String(PORT)];
const server = Bun.spawn(serverCommand, { cwd: ROOT, env, stdout: "ignore" });
await Bun.sleep(3000);
const streamPage = await browser.newPage({ viewport, deviceScaleFactor: 2 });
await streamPage.goto(`http://127.0.0.1:${PORT}/`);
await streamPage.click("button");
await streamPage.waitForSelector("table", { timeout: 20000 });
await streamPage.screenshot({
  path: join(PART, "03-stream-the-events", "images", "expected.png"),
  fullPage: true,
});
server.kill();
await browser.close();
console.log("wrote the pictures of answer-with-ui");
