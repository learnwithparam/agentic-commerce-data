import { expect, test } from "bun:test";
import { runSql } from "../checks/lib/db";
import { loadGolden, TRAP_LABELS } from "../checks/lib/golden";

const golden = loadGolden();
const value = async (id: string) => (await runSql(golden.find((q) => q.id === id)!.sql)).rows[0][0];

test("30 questions, unique ids, known trap labels", () => {
  expect(golden.length).toBe(30);
  expect(new Set(golden.map((q) => q.id)).size).toBe(30);
  for (const q of golden) for (const t of q.traps) expect(TRAP_LABELS).toContain(t);
});

test("every reference query runs and returns rows", async () => {
  for (const q of golden) expect((await runSql(q.sql)).rows.length).toBeGreaterThan(0);
}, 60_000);

test("the hand-checked answers the READMEs quote", async () => {
  expect(await value("sellers-in-sao-paulo")).toBe(704);
  expect(await value("revenue-total")).toBe(16008872.12);
  expect(await value("late-share-delivered")).toBe(6.77);
  expect(await value("distinct-customers")).toBe(96096);
}, 60_000);
