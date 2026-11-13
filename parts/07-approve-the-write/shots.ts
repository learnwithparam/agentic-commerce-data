// bun parts/07-approve-the-write/shots.ts: capture the approval form from the real program.
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "../../scripts/structure";
import { PLAN } from "./kit";

const PART = join(ROOT, "parts", "07-approve-the-write");
const WORK_FOLDER = join(ROOT, "data", "shots");
mkdirSync(WORK_FOLDER, { recursive: true });

// The sample solution asks the pause question in a scratch folder, so no real log changes.
const scratch = mkdtempSync(join(tmpdir(), "approve-shots-"));
const env = { ...process.env };
env.LLM_PROVIDER = "replay";
env.PYTHONDONTWRITEBYTECODE = "1";
env.DESK_STATE_DIR = join(scratch, "pending");
env.SELLER_API_LOG = join(scratch, "seller_api.jsonl");
const formFile = join(WORK_FOLDER, "approval-form.html");
const kitFile = join(PART, "kit.py");
const command = ["uv", "run", "--quiet", "python", kitFile, "ask-before-pausing"];
const askArguments = ["--folder", "solution", "ask", PLAN.question, "--user", "cm-ana"];
Bun.spawnSync([...command, ...askArguments, "--html", formFile], { cwd: ROOT, env });

// A Chromium installed for another Playwright version still works, so look for one first.
const installed = new Bun.Glob("*/chrome-linux*/chrome").scanSync({
  cwd: "/opt/pw-browsers",
  absolute: true,
});
const executablePath = process.env.CHROMIUM_PATH ?? [...installed][0];
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 760, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(readFileSync(formFile, "utf8"));
const picture = join(PART, "01-ask-before-pausing", "images", "expected.png");
await page.locator("main").screenshot({ path: picture });
await browser.close();
console.log(`wrote ${picture}`);
