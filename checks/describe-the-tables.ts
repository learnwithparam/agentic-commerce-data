// describe-the-tables: one card per table in tables/<table>.md, with its purpose, its grain,
// its keys and at least one trap. The check reads each card and the database's real columns.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "../scripts/verify";
import { SOURCE } from "../world/build";
import { openDb } from "./lib/db";

const TABLES: string[] = SOURCE.file.map((file: { table: string }) => file.table);
const SECTIONS = ["Purpose", "Grain", "Keys", "Traps"];

function card(folder: string, table: string): string {
  const path = join(folder, "tables", `${table}.md`);
  if (!existsSync(path)) throw new Error(`tables/${table}.md is missing`);
  return readFileSync(path, "utf8");
}

// The text under "## <name>", up to the next heading.
function section(text: string, name: string): string {
  const after = text.split(`## ${name}`)[1];
  if (after === undefined) return "";
  return after.split("\n#")[0].trim();
}

async function columnsOf(table: string): Promise<string[]> {
  const database = await openDb();
  const columns = database.query(`SELECT name FROM pragma_table_info('${table}')`).values();
  return columns.map((column) => String(column[0]));
}

const everyCard = (folder: string, holds: (text: string, table: string) => boolean) =>
  TABLES.every((table) => holds(card(folder, table), table));

export default [
  {
    says: `tables/ holds a card for each of the ${TABLES.length} tables`,
    test: (folder) => TABLES.every((table) => existsSync(join(folder, "tables", `${table}.md`))),
    tryNext: "name each card after its table, for example tables/geolocation.md",
  },
  {
    says: "each card has the sections Purpose, Grain, Keys and Traps",
    test: (folder) =>
      everyCard(folder, (text) => SECTIONS.every((name) => text.includes(`## ${name}`))),
    tryNext: "copy the headings of tables/orders.md into every card",
  },
  {
    says: "each card says what one row is under Grain",
    test: (folder) => everyCard(folder, (text) => section(text, "Grain").length > 0),
    tryNext: "write one line under ## Grain, for example: One row per seller (`seller_id`).",
  },
  {
    says: "each card's Keys name a real column of its table",
    test: async (folder) => {
      for (const table of TABLES) {
        const named = section(card(folder, table), "Keys").match(/`([a-z_]+)`/g) ?? [];
        const columns = await columnsOf(table);
        const real = named.some((name) => columns.includes(name.replaceAll("`", "")));
        if (!real) return false;
      }
      return true;
    },
    tryNext: "under ## Keys, put a column name in backticks, spelled as the table spells it",
  },
  {
    says: "each card lists at least one trap",
    test: (folder) => everyCard(folder, (text) => /^- \S/m.test(section(text, "Traps"))),
    tryNext:
      "every table here has a trap: look at world/README.md and write each one as a bullet (- ...)",
  },
] satisfies Rule[];
