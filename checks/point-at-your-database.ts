// point-at-your-database: the learner's own SQLite file, described in my-database.toml.
// The check opens the learner's file read-only, never the course world, and runs their queries on it.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Rule } from "../scripts/verify";
import { DB_PATH } from "../world/build";

type Description = {
  path?: string;
  table?: { name?: string; grain?: string }[];
  question?: { question?: string; sql?: string }[];
};

function describe(folder: string): Description | null {
  const file = join(folder, "my-database.toml");
  if (!existsSync(file)) return null;
  try {
    return Bun.TOML.parse(readFileSync(file, "utf8")) as Description;
  } catch {
    return null;
  }
}

function databaseFile(folder: string): string | null {
  const given = describe(folder)?.path;
  if (!given) return null;
  const file = resolve(folder, given);
  return existsSync(file) ? realpathSync(file) : null;
}

function withDatabase<T>(folder: string, work: (database: Database) => T, otherwise: T): T {
  const file = databaseFile(folder);
  if (!file) return otherwise;
  let database: Database | undefined;
  try {
    database = new Database(file, { readonly: true });
    return work(database);
  } catch {
    return otherwise;
  } finally {
    database?.close();
  }
}

const tablesOf = (database: Database): string[] =>
  (
    database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((row) => row.name);

const isOneSelect = (sql: string) =>
  /^\s*(select|with)\b/i.test(sql) && !sql.trim().replace(/;$/, "").includes(";");

export default [
  {
    says: "path names a SQLite file that exists and is not the course database",
    test: (folder) => {
      const file = databaseFile(folder);
      return file !== null && file !== realpathSync(DB_PATH);
    },
    tryNext: "set path in my-database.toml to your own .db file, which is not data/olist.db",
  },
  {
    says: "the file opens read-only and holds at least one table with rows",
    test: (folder) =>
      withDatabase(
        folder,
        (database) =>
          tablesOf(database).some(
            (name) =>
              (database.query(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number }).n > 0,
          ),
        false,
      ),
    tryNext: "point path at a SQLite file whose tables are not empty",
  },
  {
    says: "every table in the file has a block with a grain of at least three words",
    test: (folder) =>
      withDatabase(
        folder,
        (database) => {
          const blocks = describe(folder)?.table ?? [];
          return tablesOf(database).every((name) =>
            blocks.some(
              (block) => block.name === name && (block.grain ?? "").trim().split(/\s+/).length >= 3,
            ),
          );
        },
        false,
      ),
    tryNext: "add a [[table]] block for every table, with what one row stands for",
  },
  {
    says: "at least three questions each run as one SELECT on your file and return rows",
    test: (folder) =>
      withDatabase(
        folder,
        (database) => {
          const questions = describe(folder)?.question ?? [];
          const working = questions.filter((entry) => {
            const sql = entry.sql ?? "";
            if (!isOneSelect(sql) || (entry.question ?? "").trim().split(/\s+/).length < 3)
              return false;
            return database.query(sql).all().length > 0;
          });
          return working.length >= 3;
        },
        false,
      ),
    tryNext:
      "write three [[question]] blocks whose sql is one SELECT that returns at least one row",
  },
] satisfies Rule[];
