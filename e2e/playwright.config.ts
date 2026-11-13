// The audit needs the course app running. Set AUDIT_URL to where it listens.
// Set AUDIT_SERVER to a command that starts it, and Playwright starts and stops it for you.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// A Chromium installed for another Playwright version still works, so look for one first.
function installedChromium(): string | undefined {
  const folder = "/opt/pw-browsers";
  if (!existsSync(folder)) return undefined;
  const found = readdirSync(folder)
    .filter((name) => /^chromium-\d+$/.test(name))
    .map((name) => join(folder, name, "chrome-linux64", "chrome"));
  return found.find((path) => existsSync(path));
}
const executablePath = process.env.CHROMIUM_PATH ?? installedChromium();

const appUrl = process.env.AUDIT_URL ?? "http://localhost:3017";
const startCommand = process.env.AUDIT_SERVER ?? "bun serve.ts 3017";

export default defineConfig({
  testDir: ".",
  testMatch: "text-audit.spec.ts",
  reporter: "list",
  // biome-ignore lint/style/useNamingConvention: baseURL is the name Playwright requires
  use: { baseURL: appUrl, trace: "off", launchOptions: { executablePath } },
  webServer: startCommand
    ? { command: startCommand, url: appUrl, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
