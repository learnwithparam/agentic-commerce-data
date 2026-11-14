// mask-the-private-columns: a role may read only its tables, and private columns come back hidden.
// The check runs the learner's access.py the way a learner would. It reads the JSON it prints.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/02-lock-the-database/check-helpers";
import type { Rule } from "../scripts/verify";

const WORK = mkdtempSync(join(tmpdir(), "mask-the-private-columns-"));
const NO_DATABASE = join(WORK, "not-used.db");

type Verdict = { ok?: boolean; reason?: string };

function ask(folder: string, role: string, sql: string): Verdict {
  const run = runPython(join(folder, "access.py"), ["check", role, sql], {
    workFolder: WORK,
    databasePath: NO_DATABASE,
  });
  return (jsonOutput(run) ?? {}) as Verdict;
}

function mask(folder: string, role: string, columns: string[], rows: unknown[][]): unknown[][] {
  const run = runPython(join(folder, "access.py"), ["mask", role], {
    workFolder: WORK,
    databasePath: NO_DATABASE,
    input: JSON.stringify({ columns, rows }),
  });
  return ((jsonOutput(run) ?? {}) as { rows?: unknown[][] }).rows ?? [];
}

const refusedWithReason = (verdict: Verdict) =>
  verdict.ok === false && (verdict.reason ?? "").trim().split(/\s+/).length >= 3;

const PEOPLE = ["unique-id-aaa", "unique-id-bbb", "unique-id-aaa"];
const columns = ["customer_unique_id", "customer_zip_code_prefix", "customer_state"];
const rowsOf = (): unknown[][] => PEOPLE.map((id) => [id, "01310", "SP"]);

export default [
  {
    says: "admin may read the customers table",
    test: (folder) => ask(folder, "admin", "SELECT * FROM customers LIMIT 5").ok === true,
    tryNext: "let every role marked all in TABLES_BY_ROLE read every table",
  },
  {
    says: "partner may read sellers but is refused customers, with a reason",
    test: (folder) =>
      ask(folder, "partner", "SELECT COUNT(*) FROM sellers").ok === true &&
      refusedWithReason(ask(folder, "partner", "SELECT * FROM customers")),
    tryNext:
      "find the tables with sqlglot and raise AccessDeniedError for one the role may not read",
  },
  {
    says: "partner is refused customers when it hides in a join or a WITH clause",
    test: (folder) =>
      refusedWithReason(
        ask(
          folder,
          "partner",
          "SELECT s.seller_id FROM sellers s JOIN customers c ON c.customer_state = s.seller_state",
        ),
      ) &&
      refusedWithReason(
        ask(folder, "partner", "WITH x AS (SELECT * FROM customers) SELECT COUNT(*) FROM x"),
      ),
    tryNext: "loop over every table with find_all, not only the first one",
  },
  {
    says: "a role that is not in the list may read nothing",
    test: (folder) => refusedWithReason(ask(folder, "intern", "SELECT * FROM sellers")),
    tryNext: "when TABLES_BY_ROLE has no entry for the role, raise instead of allowing",
  },
  {
    says: "analyst sees the same token for the same person and a different one for another",
    test: (folder) => {
      const rows = mask(folder, "analyst", columns, rowsOf());
      const tokens = rows.map((row) => String(row[0]));
      return (
        tokens.length === 3 &&
        !tokens.some((token) => PEOPLE.includes(token)) &&
        tokens[0] === tokens[2] &&
        tokens[0] !== tokens[1]
      );
    },
    tryNext: "hash the value, so a person keeps one token and two people do not share one",
  },
  {
    says: "analyst gets the zip prefix hidden and other columns untouched",
    test: (folder) => {
      const rows = mask(folder, "analyst", columns, rowsOf());
      return rows.length === 3 && rows.every((row) => row[1] !== "01310" && row[2] === "SP");
    },
    tryNext: "replace only the columns named in PRIVATE_COLUMNS",
  },
  {
    says: "admin sees the rows as they are",
    test: (folder) =>
      JSON.stringify(mask(folder, "admin", columns, rowsOf())) === JSON.stringify(rowsOf()),
    tryNext: "return the rows unchanged when the role is admin",
  },
] satisfies Rule[];
