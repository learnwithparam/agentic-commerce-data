// meet-the-desk: the world is built,
// and the learner wrote down both answers to the Sao Paulo question.
// The numbers in the notes are tested against the database, not trusted.
import type { Rule } from "../scripts/verify";
import { runSql, worldIsIntact } from "./lib/db";
import { loadGolden } from "./lib/golden";
import { lineAfter, notes, numberAfter } from "./lib/notes";

const QUESTION_ID = "sellers-in-sao-paulo";

async function firstNumber(sql: string): Promise<number> {
  const result = await runSql(sql);
  return Number(result.rows[0][0]);
}

// The naive agent matches the city spelled exactly one way.
const naiveCount = () =>
  firstNumber("SELECT COUNT(*) FROM sellers WHERE seller_city = 'sao paulo'");

function finishedCount(): Promise<number> {
  const question = loadGolden().find((candidate) => candidate.id === QUESTION_ID);
  if (!question) throw new Error(`world/golden.toml has no question ${QUESTION_ID}`);
  return firstNumber(question.sql);
}

const firstLook = (folder: string) => notes(folder, "first-look.md");

function wordCount(line: string | null): number {
  return line?.split(/\s+/).length ?? 0;
}

export default [
  {
    says: "the world is built: every table has the row count of the pinned download",
    test: () => worldIsIntact(),
    tryNext: "run bun run world reset, then run this check again",
  },
  {
    says: "notes/first-look.md exists",
    test: (folder) => firstLook(folder) !== null,
    tryNext: "create notes/first-look.md inside this problem folder",
  },
  {
    says: "a Naive: line holds the naive agent's count, and the database agrees with it",
    test: async (folder) => numberAfter(firstLook(folder), "Naive") === (await naiveCount()),
    tryNext:
      "run the naive agent on the Sao Paulo question " +
      "and copy its number into a line that starts with Naive:",
  },
  {
    says: "a Finished: line holds the finished agent's count, and the database agrees with it",
    test: async (folder) => numberAfter(firstLook(folder), "Finished") === (await finishedCount()),
    tryNext:
      "run the finished agent on the same question " +
      "and copy its number into a line that starts with Finished:",
  },
  {
    says: "a Gap: line says in at least five words why the two counts differ",
    test: (folder) => wordCount(lineAfter(firstLook(folder), "Gap")) >= 5,
    tryNext: "read the finished agent's assumptions and write one sentence after Gap:",
  },
] satisfies Rule[];
