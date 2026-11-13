// bun run audit: the text audit on every page of the course (see e2e/).
// It installs what it needs first, so a fresh checkout, such as CI, runs it as it is.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./structure";

const PLAYWRIGHT = join(ROOT, "node_modules", ".bin", "playwright");
const BROWSER_FOLDER = "/opt/pw-browsers";

function run(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
}

if (!existsSync(PLAYWRIGHT)) run(["bun", "install", "--frozen-lockfile"]);

// A machine that already has a Chromium (CHROMIUM_PATH, or the folder above) needs no download.
const hasBrowser = process.env.CHROMIUM_PATH || existsSync(BROWSER_FOLDER);
if (!hasBrowser) run([PLAYWRIGHT, "install", "--with-deps", "chromium"]);

run([PLAYWRIGHT, "test", "-c", "e2e", "--trace", "off"]);
