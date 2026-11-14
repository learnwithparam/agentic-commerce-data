// The capstone rules. The learner hands in their own folder: a database,
// questions, a scorecard, traces, a refusal and two honest notes. The check reads only that folder.
// It proves the shape and that the evidence is real: it re-runs every query on the learner's
// database and compares the row counts on the scorecard. It never reads the course world.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CapstoneRule } from "../checks/capstone";

type Question = { id?: string; question?: string; sql?: string };
type Card = { id?: string; rows?: number; passed?: boolean };

function text(folder: string, name: string): string {
  const file = join(folder, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function toml<T>(folder: string, name: string): T | null {
  try {
    return Bun.TOML.parse(text(folder, name)) as T;
  } catch {
    return null;
  }
}

function json<T>(folder: string, name: string): T | null {
  try {
    return JSON.parse(text(folder, name)) as T;
  } catch {
    return null;
  }
}

function databaseFile(folder: string): string | null {
  const given = toml<{ path?: string }>(folder, "capstone.toml")?.path;
  if (!given) return null;
  const file = resolve(folder, given);
  return existsSync(file) ? realpathSync(file) : null;
}

const questions = (folder: string): Question[] =>
  toml<{ question?: Question[] }>(folder, "golden.toml")?.question ?? [];

// Run every question on the learner's file, read-only. Returns the row count of each, or null.
function rowCounts(folder: string): Record<string, number> | null {
  const file = databaseFile(folder);
  if (!file) return null;
  const counts: Record<string, number> = {};
  let database: Database | undefined;
  try {
    database = new Database(file, { readonly: true });
    for (const entry of questions(folder)) {
      const sql = (entry.sql ?? "").trim().replace(/;$/, "");
      if (!entry.id || !/^(select|with)\b/i.test(sql) || sql.includes(";")) return null;
      counts[entry.id] = database.query(sql).all().length;
    }
    return counts;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

function tableCount(file: string): number {
  try {
    const database = new Database(file, { readonly: true });
    const rows = database.query("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    database.close();
    return rows.length;
  } catch {
    return 0;
  }
}

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

function section(notes: string, heading: string): string {
  const after = notes.split(heading)[1] ?? "";
  return after.split(/\n## /)[0];
}

export const rules: CapstoneRule[] = [
  {
    says: "capstone.toml names your own SQLite file (two tables or more) and who reads the answers",
    test: (folder) => {
      const file = databaseFile(folder);
      const owner = toml<{ owner?: string }>(folder, "capstone.toml")?.owner ?? "";
      return file !== null && tableCount(file) >= 2 && words(owner) >= 1;
    },
    tryNext: "set path to your own .db file and owner to who reads the answers",
  },
  {
    says: "five questions with different ids, each one SELECT that returns rows on your file",
    test: (folder) => {
      const counts = rowCounts(folder);
      const found = questions(folder);
      const ids = new Set(found.map((entry) => entry.id));
      return (
        counts !== null &&
        found.length >= 5 &&
        ids.size === found.length &&
        Object.values(counts).every((count) => count > 0)
      );
    },
    tryNext: "add five [[question]] blocks about your data and run each sql by hand",
  },
  {
    says: "the scorecard has a line for every question, and its row counts match a fresh run",
    test: (folder) => {
      const counts = rowCounts(folder);
      const card = json<Card[]>(folder, "scorecard.json");
      if (!counts || !Array.isArray(card)) return false;
      return Object.entries(counts).every(([id, rows]) => {
        const line = card.find((entry) => entry.id === id);
        return line !== undefined && line.rows === rows && typeof line.passed === "boolean";
      });
    },
    tryNext: "run each query and write its real row count and passed into scorecard.json",
  },
  {
    says: "at least three traces, each for one of your questions, with seconds and cost",
    test: (folder) => {
      const asked = new Set(questions(folder).map((entry) => entry.question));
      const lines = text(folder, "traces.jsonl").split("\n").filter(Boolean);
      try {
        const traces = lines.map((line) => JSON.parse(line));
        return (
          traces.length >= 3 &&
          traces.every(
            (trace) =>
              asked.has(trace.question) &&
              typeof trace.seconds === "number" &&
              trace.seconds > 0 &&
              typeof trace.cost_usd === "number" &&
              trace.cost_usd >= 0,
          )
        );
      } catch {
        return false;
      }
    },
    tryNext: "write the traces from the trace-the-cost step, one line for each of three questions",
  },
  {
    says: "refusal.json shows a request to change data that was refused with a reason",
    test: (folder) => {
      const refusal = json<{ request?: string; refused?: boolean; reason?: string }>(
        folder,
        "refusal.json",
      );
      return (
        refusal !== null &&
        /\b(delete|update|insert|drop|remove|set|change)\b/i.test(refusal.request ?? "") &&
        refusal.refused === true &&
        words(refusal.reason ?? "") >= 3
      );
    },
    tryNext: "save a real refusal: the write request, refused true, and the reason it gave",
  },
  {
    says: "notes.md says what broke and what you would change, each in at least twenty words",
    test: (folder) => {
      const notes = text(folder, "notes.md");
      const broke = section(notes, "## What broke");
      const next = section(notes, "## What I would change next");
      return words(broke) >= 20 && words(next) >= 20 && !/todo/i.test(notes);
    },
    tryNext: "write two honest paragraphs under the two headings, from what happened on your data",
  },
];
