// meet-the-desk: the world is built, and the learner wrote down both answers to the Sao Paulo question.
// The numbers in the notes are tested against the database, not trusted.
import type { Rule } from "../scripts/verify";
import { runSql, worldIsIntact } from "./lib/db";
import { loadGolden } from "./lib/golden";
import { lineAfter, notes, numberAfter } from "./lib/notes";

const first = async (sql: string) => Number((await runSql(sql)).rows[0][0]);
const naiveCount = () => first("SELECT COUNT(*) FROM sellers WHERE seller_city = 'sao paulo'");
const finishedCount = () => first(loadGolden().find((q) => q.id === "sellers-in-sao-paulo")!.sql);

export default [
  {
    says: "the world is built: every table has the row count of the pinned download",
    test: () => worldIsIntact(),
    tryNext: "run bun run world reset, then run this check again",
  },
  {
    says: "notes/first-look.md exists",
    test: (d) => notes(d, "first-look.md") !== null,
    tryNext: "create notes/first-look.md inside this problem folder",
  },
  {
    says: "a Naive: line holds the naive agent's count, and the database agrees with it",
    test: async (d) => numberAfter(notes(d, "first-look.md"), "Naive") === (await naiveCount()),
    tryNext: "run the naive agent on the Sao Paulo question and copy its number into a line that starts with Naive:",
  },
  {
    says: "a Finished: line holds the finished agent's count, and the database agrees with it",
    test: async (d) => numberAfter(notes(d, "first-look.md"), "Finished") === (await finishedCount()),
    tryNext: "run the finished agent on the same question and copy its number into a line that starts with Finished:",
  },
  {
    says: "a Gap: line says in at least five words why the two counts differ",
    test: (d) => (lineAfter(notes(d, "first-look.md"), "Gap")?.split(/\s+/).length ?? 0) >= 5,
    tryNext: "read the finished agent's assumptions and write one sentence after Gap:",
  },
] satisfies Rule[];
