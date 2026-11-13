// accept-many-answers: revenue-total and gmv-2018 accept every fair definition, and nothing wrong.
// The check runs every accepted query and compares its rows with the fair definitions
// in checks/lib/definitions.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "../scripts/verify";
import { rowsMatch } from "./lib/compare";
import { runSql, tryRunSql } from "./lib/db";
import { FAIR, FAN_OUT } from "./lib/definitions";
import { judge, loadGolden, type Question, WORLD_GOLDEN } from "./lib/golden";
import { readRun } from "./lib/runs";

// The two questions this step is about.
const QUESTION_IDS = Object.keys(FAIR);

// The golden.toml the learner edits in this step's folder.
const learnerGolden = (folder: string) => loadGolden(join(folder, "golden.toml"));

const idsInOrder = (golden: Question[]) => golden.map((question) => question.id).join();

// Every id this check looks up is in the golden set, so a missing one is a broken file.
function questionWithId(golden: Question[], id: string): Question {
  const found = golden.find((question) => question.id === id);
  if (!found) throw new Error(`golden.toml has no question with id ${id}`);
  return found;
}

// A query that does not run never counts as giving the same rows.
async function sameRows(firstSql: string, secondSql: string): Promise<boolean> {
  const first = await tryRunSql(firstSql);
  const second = await tryRunSql(secondSql);
  return first !== null && second !== null && rowsMatch(first.rows, second.rows);
}

async function isFairDefinition(id: string, sql: string): Promise<boolean> {
  let fair = false;
  for (const definition of FAIR[id]) {
    if (await sameRows(sql, definition.sql)) fair = true;
  }
  return fair;
}

// An accepted query must be a different fair definition, not the reference again.
async function acceptsOnlyOtherFairDefinitions(question: Question): Promise<boolean> {
  for (const acceptedSql of question.accept ?? []) {
    if (await sameRows(acceptedSql, question.sql)) return false;
    if (!(await isFairDefinition(question.id, acceptedSql))) return false;
  }
  return true;
}

export default [
  {
    says: "golden.toml in this folder has the same questions as world/golden.toml",
    test: (folder) =>
      existsSync(join(folder, "golden.toml")) &&
      idsInOrder(learnerGolden(folder)) === idsInOrder(loadGolden(WORLD_GOLDEN)),
    tryNext: "edit the golden.toml that ships in this folder; keep every question and its id",
  },
  {
    says: "revenue-total and gmv-2018 keep their reference query",
    test: async (folder) => {
      for (const id of QUESTION_IDS) {
        const learnerSql = questionWithId(learnerGolden(folder), id).sql;
        const worldSql = questionWithId(loadGolden(WORLD_GOLDEN), id).sql;
        if (!(await sameRows(learnerSql, worldSql))) return false;
      }
      return true;
    },
    tryNext: "leave sql as it is and add the other definition under accept = [ ... ]",
  },
  {
    says: "both questions list at least one accepted query, and each one runs",
    test: async (folder) => {
      for (const id of QUESTION_IDS) {
        const accepted = questionWithId(learnerGolden(folder), id).accept ?? [];
        if (accepted.length === 0) return false;
        for (const acceptedSql of accepted) {
          if ((await tryRunSql(acceptedSql)) === null) return false;
        }
      }
      return true;
    },
    tryNext:
      'add accept = ["""SELECT ..."""] to both questions and run each query once to see it work',
  },
  {
    says: "every accepted query returns a fair definition that differs from the reference",
    test: async (folder) => {
      for (const id of QUESTION_IDS) {
        const question = questionWithId(learnerGolden(folder), id);
        if (!(await acceptsOnlyOtherFairDefinitions(question))) return false;
      }
      return true;
    },
    tryNext:
      "accept only the other fair definition: " +
      "payments or items plus freight for revenue, with or without freight for GMV",
  },
  {
    says: "no other question changed",
    test: (folder) => {
      const world = loadGolden(WORLD_GOLDEN);
      return learnerGolden(folder).every((question) => {
        if (QUESTION_IDS.includes(question.id)) return true;
        const unchangedSql = question.sql === questionWithId(world, question.id).sql;
        return unchangedSql && (question.accept ?? []).length === 0;
      });
    },
    tryNext: "undo edits to the other questions; only revenue-total and gmv-2018 change here",
  },
  {
    says: "with this golden.toml, the naive agent's run now matches revenue-total and gmv-2018",
    test: async (folder) => {
      const run = readRun(folder, "naive");
      if (!run) return false;
      for (const id of QUESTION_IDS) {
        const result = run.results.find((candidate) => candidate.id === id);
        if (!result) return false;
        const question = questionWithId(learnerGolden(folder), id);
        if (!(await judge(question, result.rows)).match) return false;
      }
      return true;
    },
    tryNext:
      "the naive agent used the other definition; accept that one. " +
      "Run bun run score naive --for accept-many-answers",
  },
  {
    says: "a wrong total still fails: the fan-out totals match neither question",
    test: async (folder) => {
      for (const id of QUESTION_IDS) {
        const question = questionWithId(learnerGolden(folder), id);
        const fanOut = await runSql(FAN_OUT[id]);
        if ((await judge(question, fanOut.rows)).match) return false;
      }
      return true;
    },
    tryNext:
      "remove any accepted query that joins payments to items; " +
      "that join counts a payment once per item",
  },
] satisfies Rule[];
