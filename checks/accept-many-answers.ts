// accept-many-answers: revenue-total and gmv-2018 accept every fair definition, and nothing wrong.
// The check runs every accepted query and compares its rows with the fair definitions in checks/lib/definitions.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "../scripts/verify";
import { rowsMatch } from "./lib/compare";
import { runSql, tryRunSql } from "./lib/db";
import { FAIR, FAN_OUT } from "./lib/definitions";
import { judge, loadGolden, type Question, WORLD_GOLDEN } from "./lib/golden";
import { readRun } from "./lib/runs";

const IDS = Object.keys(FAIR);
const mine = (d: string) => loadGolden(join(d, "golden.toml"));
const pick = (g: Question[], id: string) => g.find((q) => q.id === id)!;
const sameRows = async (a: string, b: string) => {
  const [x, y] = [await tryRunSql(a), await tryRunSql(b)];
  return x !== null && y !== null && rowsMatch(x.rows, y.rows);
};

export default [
  {
    says: "golden.toml in this folder has the same questions as world/golden.toml",
    test: (d) =>
      existsSync(join(d, "golden.toml")) &&
      mine(d)
        .map((q) => q.id)
        .join() ===
        loadGolden(WORLD_GOLDEN)
          .map((q) => q.id)
          .join(),
    tryNext: "edit the golden.toml that ships in this folder; keep every question and its id",
  },
  {
    says: "revenue-total and gmv-2018 keep their reference query",
    test: async (d) => {
      for (const id of IDS)
        if (!(await sameRows(pick(mine(d), id).sql, pick(loadGolden(WORLD_GOLDEN), id).sql)))
          return false;
      return true;
    },
    tryNext: "leave sql as it is and add the other definition under accept = [ ... ]",
  },
  {
    says: "both questions list at least one accepted query, and each one runs",
    test: async (d) => {
      for (const id of IDS) {
        const acc = pick(mine(d), id).accept ?? [];
        if (acc.length === 0) return false;
        for (const a of acc) if ((await tryRunSql(a)) === null) return false;
      }
      return true;
    },
    tryNext:
      'add accept = ["""SELECT ..."""] to both questions and run each query once to see it work',
  },
  {
    says: "every accepted query returns a fair definition that differs from the reference",
    test: async (d) => {
      for (const id of IDS) {
        const q = pick(mine(d), id);
        for (const a of q.accept ?? []) {
          if (await sameRows(a, q.sql)) return false;
          let fair = false;
          for (const f of FAIR[id]) if (await sameRows(a, f.sql)) fair = true;
          if (!fair) return false;
        }
      }
      return true;
    },
    tryNext:
      "accept only the other fair definition: payments or items plus freight for revenue, with or without freight for GMV",
  },
  {
    says: "no other question changed",
    test: (d) => {
      const world = loadGolden(WORLD_GOLDEN);
      return mine(d).every(
        (q) =>
          IDS.includes(q.id) || (q.sql === pick(world, q.id).sql && (q.accept ?? []).length === 0),
      );
    },
    tryNext: "undo edits to the other questions; only revenue-total and gmv-2018 change here",
  },
  {
    says: "with this golden.toml, the naive agent's run now matches revenue-total and gmv-2018",
    test: async (d) => {
      const run = readRun(d, "naive");
      if (!run) return false;
      for (const id of IDS) {
        const r = run.results.find((x) => x.id === id);
        if (!r || !(await judge(pick(mine(d), id), r.rows)).match) return false;
      }
      return true;
    },
    tryNext:
      "the naive agent used the other definition; accept that one. Run bun run score naive --for accept-many-answers",
  },
  {
    says: "a wrong total still fails: the fan-out totals match neither question",
    test: async (d) => {
      for (const id of IDS)
        if ((await judge(pick(mine(d), id), (await runSql(FAN_OUT[id])).rows)).match) return false;
      return true;
    },
    tryNext:
      "remove any accepted query that joins payments to items; that join counts a payment once per item",
  },
] satisfies Rule[];
