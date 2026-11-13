// refuse-the-mutation: through the full `ask --json` contract, the agent refuses every request to
// change data, says why, and logs the query as refused before it reaches the database.
// The check runs the learner's ask.py on a small copy of the database and reads
// data/logs/queries.jsonl, never the wording of the answer.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  jsonOutput,
  rowCounts,
  runPython,
  sameCounts,
  sampleDatabase,
} from "../parts/02-lock-the-database/check-helpers";
import type { Rule } from "../scripts/verify";
import { LOG_DIR } from "../world/build";

const WRITE_REQUESTS = [
  "Delete the test orders",
  "Set seller 3442f8959a84dea7ee197c632cb2df15 to inactive",
  "Clean out the canceled orders",
];
const READ_QUESTION = "How many orders are in the data?";

const QUERY_LOG = join(LOG_DIR, "queries.jsonl");
const WRITE_VERB = /\b(insert|update|delete|drop|create|alter|replace|attach|pragma|vacuum)\b/i;

type Answer = { refused?: boolean; reason?: string | null; rows?: unknown[][] };
type LogLine = { question: string; sql: string; ok: boolean; error: string | null };
type FolderRun = {
  answers: Record<string, Answer>;
  logLines: LogLine[];
  unchanged: boolean;
  ordersInCopy: number | null;
};

function logLines(): string[] {
  if (!existsSync(QUERY_LOG)) return [];
  return readFileSync(QUERY_LOG, "utf8").split("\n").filter(Boolean);
}

// Every question runs once per folder; all rules read the same run.
const runsByFolder = new Map<string, FolderRun>();

async function runAgent(folder: string): Promise<FolderRun> {
  const saved = runsByFolder.get(folder);
  if (saved) return saved;
  const sample = await sampleDatabase();
  const before = rowCounts(sample.path);
  const linesBefore = logLines().length;
  const answers: Record<string, Answer> = {};
  for (const question of [...WRITE_REQUESTS, READ_QUESTION]) {
    const run = runPython(join(folder, "ask.py"), [question, "--json"], {
      workFolder: sample.folder,
      databasePath: sample.path,
    });
    answers[question] = (jsonOutput(run) ?? {}) as Answer;
  }
  const newLines = logLines().slice(linesBefore);
  const folderRun = {
    answers,
    logLines: newLines.map((line) => JSON.parse(line) as LogLine),
    unchanged: sameCounts(before, rowCounts(sample.path)),
    ordersInCopy: before.orders,
  };
  runsByFolder.set(folder, folderRun);
  return folderRun;
}

const refusedWithReason = (answer: Answer) =>
  answer.refused === true && (answer.reason ?? "").trim().split(/\s+/).length >= 3;

function refusalRule(question: string): Rule {
  return {
    says: `"${question}" comes back with refused: true and a reason`,
    test: async (folder) => refusedWithReason((await runAgent(folder)).answers[question]),
    tryNext:
      "run validator.check(sql) before sql_tool.run, and when it raises Refused, " +
      "set refused, route and reason in the answer",
  };
}

export default [
  refusalRule(WRITE_REQUESTS[0]),
  refusalRule(WRITE_REQUESTS[1]),
  refusalRule(WRITE_REQUESTS[2]),
  {
    says: "each write request is logged as refused, and no write ran on the database",
    test: async (folder) => {
      const { logLines } = await runAgent(folder);
      const writes = logLines.filter((line) => WRITE_VERB.test(line.sql));
      const refusedQuestions = new Set(writes.map((line) => line.question));
      const allRefused = writes.every(
        (line) => !line.ok && (line.error ?? "").toLowerCase().startsWith("refused"),
      );
      return allRefused && WRITE_REQUESTS.every((question) => refusedQuestions.has(question));
    },
    tryNext:
      'log a refused query with log_query_failure(..., f"refused: {why}") ' +
      "and return before sql_tool.run is called",
  },
  {
    says: "every table in the database copy keeps its row count",
    test: async (folder) => (await runAgent(folder)).unchanged,
    tryNext: "keep sql_tool.py read-only, as you made it in open-read-only",
  },
  {
    says: `"${READ_QUESTION}" still gets its rows`,
    test: async (folder) => {
      const { answers, ordersInCopy } = await runAgent(folder);
      const answer = answers[READ_QUESTION];
      return answer.refused === false && answer.rows?.[0]?.[0] === ordersInCopy;
    },
    tryNext: "refuse because the validator refused the SQL, not because of words in the question",
  },
] satisfies Rule[];
