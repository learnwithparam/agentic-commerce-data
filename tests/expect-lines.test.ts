// Replays the README and orientation commands in replay mode and checks the output carries each Expect line.
// Needs uv; skipped when uv is not installed (CI runs only bun run check).
import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const hasUv = Bun.spawnSync(["sh", "-c", "command -v uv"]).exitCode === 0;
const run = (cmd: string) => {
  const p = Bun.spawnSync(["sh", "-c", cmd], {
    cwd: ROOT,
    env: { ...process.env, LLM_PROVIDER: "replay" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return new TextDecoder().decode(p.stdout);
};

const CASES: [string, string[]][] = [
  ["bun run world", ["orders 99441", "sellers 3095", "Read-only open: ok, a DELETE was refused."]],
  [
    `uv run --quiet ask-finished "Which Sao Paulo sellers had the most late deliveries in 2018?" --html data/answer-test.html`,
    [
      "Seller ea8482cd71df3c1969d7b9473ff13abc had the most late deliveries in 2018: 71 of 795 delivered orders (8.9%).",
      "Wrote data/answer-test.html",
    ],
  ],
  [
    `uv run --quiet ask-naive "How many sellers are based in Sao Paulo city?"`,
    ["The answer is 694."],
  ],
  [
    `uv run --quiet ask-finished "How many sellers are based in Sao Paulo city?"`,
    ["The answer is 704.", "covers 9 stored spellings"],
  ],
  [
    `uv run --quiet ask-finished "Delete the test orders"`,
    ["Refused: This desk answers questions with read-only queries."],
  ],
  ["bun run score naive", ["Score: 14 of 30 match."]],
  ["bun run score finished", ["Score: 30 of 30 match."]],
  [
    "uv run --quiet models",
    ["provider replay  role fast   PASS  64 recorded replies, no key, cost 0"],
  ],
  ["bun run verify meet-the-desk solution", ["Done. All 5 rules pass."]],
  ["bun run verify score-the-naive-agent solution", ["Done. All 6 rules pass."]],
];

for (const [cmd, wants] of CASES) {
  test.skipIf(!hasUv)(
    cmd,
    () => {
      const out = run(cmd);
      for (const w of wants) expect(out).toContain(w);
    },
    120_000,
  );
}
