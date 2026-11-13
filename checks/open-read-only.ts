// open-read-only: the SQL tool opens the database so that SQLite itself refuses every write.
// The check sends write statements straight to the learner's sql_tool.py, pointed at a small
// copy of the database, and counts the rows before and after.
import { join } from "node:path";
import {
  jsonOutput,
  rowCounts,
  runPython,
  sameCounts,
  sampleDatabase,
} from "../parts/02-lock-the-database/check-helpers";
import type { Rule } from "../scripts/verify";
import { worldIsIntact } from "./lib/db";

type ToolAnswer = { columns?: string[]; rows?: unknown[][]; error?: string };

// Writes of every kind. A filter on one word stops one of them; read-only mode stops them all.
const WRITES = [
  "DELETE FROM orders",
  "UPDATE sellers SET seller_city = 'nowhere'",
  "insert into order_reviews (review_id) values ('fake')",
  "DROP TABLE products",
  "CREATE TABLE notes (text TEXT)",
];

const READ_ONLY_ERROR = /read-?only/i;

async function askTool(folder: string, sql: string) {
  const sample = await sampleDatabase();
  const before = rowCounts(sample.path);
  const run = runPython(join(folder, "sql_tool.py"), [sql], {
    workFolder: sample.folder,
    databasePath: sample.path,
  });
  const answer = (jsonOutput(run) ?? {}) as ToolAnswer;
  const after = rowCounts(sample.path);
  return { answer, unchanged: sameCounts(before, after), before };
}

export default [
  {
    says: "sql_tool.py answers a SELECT with its rows",
    test: async (folder) => {
      const { answer, before } = await askTool(folder, "SELECT COUNT(*) FROM orders");
      return answer.rows?.[0]?.[0] === before.orders;
    },
    tryNext: "keep the file name sql_tool.py and open the database path from database_path()",
  },
  {
    says: "DELETE FROM orders comes back with a read-only error from SQLite",
    test: async (folder) => {
      const { answer } = await askTool(folder, "DELETE FROM orders");
      return READ_ONLY_ERROR.test(answer.error ?? "");
    },
    tryNext:
      'open the database with sqlite3.connect(f"file:{database_path()}?mode=ro", uri=True); ' +
      "undoing a write afterwards is not the same as refusing it",
  },
  {
    says: "every kind of write gets a read-only error, not only DELETE",
    test: async (folder) => {
      for (const sql of WRITES) {
        const { answer } = await askTool(folder, sql);
        if (!READ_ONLY_ERROR.test(answer.error ?? "")) return false;
      }
      return true;
    },
    tryNext: "do not filter words in the SQL; let read-only mode refuse UPDATE, INSERT and DROP",
  },
  {
    says: "after all the writes, every table keeps its row count",
    test: async (folder) => {
      for (const sql of WRITES) {
        const { unchanged } = await askTool(folder, sql);
        if (!unchanged) return false;
      }
      return true;
    },
    tryNext: "a write reached the data; open the connection read-only so none can",
  },
  {
    says: "your real data/olist.db still has every row",
    test: () => worldIsIntact(),
    tryNext:
      "run bun run world reset to rebuild it, and keep database_path() reading OLIST_DB " +
      "so the check uses its own copy",
  },
] satisfies Rule[];
