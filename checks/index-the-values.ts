// index-the-values: a lookup of Sao Paulo returns all 9 stored spellings and no other city, the
// index covers states and categories too, and the agent's Sao Paulo golden questions now match.
// The check runs the learner's value_index.py and ask.py and compares with the database.
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/04-retrieve-the-context/check-helpers";
import type { Rule } from "../scripts/verify";
import { runSql } from "./lib/db";
import { judge, loadGolden } from "./lib/golden";

// The nine spellings, exactly as the golden question about Sao Paulo sellers lists them.
const SPELLINGS_SQL =
  "SELECT DISTINCT seller_city FROM sellers WHERE seller_city IN ('sao paulo', " +
  "'sa' || char(771) || 'o paulo', 'sao  paulo', 'sao paluo', 'sao pauo', 'sao paulop', " +
  "'sao paulo sp', 'sao paulo - sp', 'sao paulo / sao paulo')";
const SAO_PAULO_QUESTIONS = ["sellers-in-sao-paulo", "late-sellers-sao-paulo-2018q2"];

function lookup(folder: string, column: string, text: string): string[] {
  const run = runPython(join(folder, "value_index.py"), [column, text]);
  const printed = jsonOutput(run);
  return Array.isArray(printed) ? (printed as string[]) : [];
}

async function nineSpellings(): Promise<string[]> {
  const result = await runSql(SPELLINGS_SQL);
  return result.rows.map((row) => String(row[0]));
}

const sameSet = (first: string[], second: string[]) =>
  first.length === second.length && first.every((value) => second.includes(value));

function askAgent(folder: string, question: string): unknown[][] {
  const run = runPython(join(folder, "ask.py"), [question, "--json"]);
  const answer = jsonOutput(run) as { rows?: unknown[][] } | null;
  return answer?.rows ?? [];
}

export default [
  {
    says: "a lookup of seller_city 'Sao Paulo' returns all 9 stored spellings",
    test: async (folder) => {
      const found = lookup(folder, "seller_city", "Sao Paulo");
      return (await nineSpellings()).every((spelling) => found.includes(spelling));
    },
    tryNext:
      "group stored values by a clean name: fold accents and case, cut before ' / ' or ' - ', " +
      "drop a trailing ' sp', and join very close spellings such as 'sao paluo'",
  },
  {
    says: "it returns no other city, such as 'maua/sao paulo'",
    test: async (folder) =>
      sameSet(lookup(folder, "seller_city", "Sao Paulo"), await nineSpellings()),
    tryNext: "do not match on 'contains'; 'maua/sao paulo' is the city of Maua",
  },
  {
    says: "the same 9 come back however the name is typed: 'são paulo', 'SAO PAULO'",
    test: async (folder) => {
      const nine = await nineSpellings();
      const typings = ["são paulo", "SAO PAULO", "sao paulo"];
      return typings.every((typed) => sameSet(lookup(folder, "seller_city", typed), nine));
    },
    tryNext: "fold the text you look up the same way you fold the stored values",
  },
  {
    says: "it covers states and categories: 'sp' finds SP, 'BELEZA_SAUDE' finds beleza_saude",
    test: (folder) =>
      sameSet(lookup(folder, "seller_state", "sp"), ["SP"]) &&
      sameSet(lookup(folder, "product_category_name", "BELEZA_SAUDE"), ["beleza_saude"]),
    tryNext: "index every column in COLUMNS; states and categories need only folding",
  },
  {
    says: "the agent's Sao Paulo golden questions now match their reference rows",
    test: async (folder) => {
      for (const question of loadGolden()) {
        if (!SAO_PAULO_QUESTIONS.includes(question.id)) continue;
        const rows = askAgent(folder, question.question);
        if (!(await judge(question, rows)).match) return false;
      }
      return true;
    },
    tryNext: "ask.py fills {{seller_city:Sao Paulo}} from value_index.lookup; fix lookup first",
  },
] satisfies Rule[];
