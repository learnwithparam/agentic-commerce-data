import { expect, test } from "bun:test";
import { runSql } from "../checks/lib/db";
import { loadGolden, TRAP_LABELS } from "../checks/lib/golden";

const golden = loadGolden();

// The first cell of the reference query's result for one golden question.
async function firstValue(id: string) {
  const question = golden.find((candidate) => candidate.id === id);
  if (!question) throw new Error(`no golden question with id "${id}"`);
  const result = await runSql(question.sql);
  return result.rows[0][0];
}

test("30 questions, unique ids, known trap labels", () => {
  expect(golden.length).toBe(30);
  const ids = golden.map((question) => question.id);
  expect(new Set(ids).size).toBe(30);
  for (const question of golden) {
    for (const trap of question.traps) expect(TRAP_LABELS).toContain(trap);
  }
});

test("every reference query runs and returns rows", async () => {
  for (const question of golden) {
    const result = await runSql(question.sql);
    expect(result.rows.length).toBeGreaterThan(0);
  }
}, 60_000);

test("the hand-checked answers the READMEs quote", async () => {
  expect(await firstValue("sellers-in-sao-paulo")).toBe(704);
  expect(await firstValue("revenue-total")).toBe(16008872.12);
  expect(await firstValue("late-share-delivered")).toBe(6.77);
  expect(await firstValue("distinct-customers")).toBe(96096);
}, 60_000);
