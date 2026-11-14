// add-real-questions: the learner adds questions that real people asked, each with a query that runs
// on the course database and a note that says how the answer was checked by hand.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "../scripts/verify";
import { tryRunSql } from "./lib/db";
import { loadGolden, TRAP_LABELS } from "./lib/golden";

type Entry = {
  id?: string;
  question?: string;
  source?: string;
  asked_by?: string;
  traps?: string[];
  note?: string;
  sql?: string;
};

function entries(folder: string): Entry[] {
  const file = join(folder, "real-questions.toml");
  if (!existsSync(file)) return [];
  try {
    return (Bun.TOML.parse(readFileSync(file, "utf8")) as { question?: Entry[] }).question ?? [];
  } catch {
    return [];
  }
}

const words = (text: string | undefined) => (text ?? "").trim().split(/\s+/).filter(Boolean).length;
const squash = (text: string | undefined) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default [
  {
    says: "at least five questions, each marked source real and with a person who asked it",
    test: (folder) => {
      const found = entries(folder);
      return (
        found.length >= 5 &&
        found.every((e) => e.source === "real" && words(e.asked_by) >= 1 && words(e.question) >= 4)
      );
    },
    tryNext: 'add [[question]] blocks with source = "real", asked_by and a full question',
  },
  {
    says: "no id and no question text repeats the course golden set or another of yours",
    test: (folder) => {
      const found = entries(folder);
      const golden = loadGolden();
      const ids = new Set(golden.map((q) => q.id));
      const texts = new Set(golden.map((q) => squash(q.question)));
      for (const e of found) {
        if (!e.id || ids.has(e.id) || texts.has(squash(e.question))) return false;
        ids.add(e.id);
        texts.add(squash(e.question));
      }
      return found.length > 0;
    },
    tryNext: "give every question its own id, and ask something the golden set does not",
  },
  {
    says: "every query is one SELECT that runs on the database and returns rows",
    test: async (folder) => {
      const found = entries(folder);
      if (found.length === 0) return false;
      for (const e of found) {
        const sql = (e.sql ?? "").trim().replace(/;$/, "");
        if (!/^(select|with)\b/i.test(sql) || sql.includes(";")) return false;
        const result = await tryRunSql(sql);
        if (!result || result.rows.length === 0) return false;
      }
      return true;
    },
    tryNext: "run each sql by hand first, and keep one SELECT per question",
  },
  {
    says: "trap labels come from the golden set, and at least two questions name a trap",
    test: (folder) => {
      const found = entries(folder);
      const labelled = found.filter((e) => (e.traps ?? []).length > 0);
      return (
        found.length > 0 &&
        found.every(
          (e) => Array.isArray(e.traps) && e.traps.every((t) => TRAP_LABELS.includes(t)),
        ) &&
        labelled.length >= 2
      );
    },
    tryNext: "use only the labels in the golden set, such as spelling, fan-out or status-filter",
  },
  {
    says: "every question has a note of at least ten words on how you checked it by hand",
    test: (folder) => {
      const found = entries(folder);
      return found.length > 0 && found.every((e) => words(e.note) >= 10);
    },
    tryNext: "write in the note what you counted by hand and what you compared it with",
  },
] satisfies Rule[];
