// search-the-reviews: for 5 review questions, every review_id returned belongs to an order of the
// seller asked, placed in the window asked; each quote is the stored comment; and an English
// question finds Portuguese comments about late or missing deliveries.
// The check runs the learner's reviews.py and looks every result up in the database.
import { join } from "node:path";
import { jsonOutput, runPython } from "../parts/04-retrieve-the-context/check-helpers";
import type { Rule } from "../scripts/verify";
import { tryRunSql } from "./lib/db";

type Case = { seller: string; start: string; end: string; query: string };
// reviews.py prints these keys with underscores, so they keep that spelling here.
type Hit = Partial<Record<"review_id" | "order_id" | "quote", string>>;

const CASES: Case[] = [
  {
    seller: "1f50f920176fa81dab994f9023523100",
    start: "2017-11-01",
    end: "2017-12-01",
    query: "late delivery",
  },
  {
    seller: "955fee9216a65b617aa5c0531780ce60",
    start: "2018-05-01",
    end: "2018-06-01",
    query: "late delivery",
  },
  {
    seller: "3d871de0142ce09b7081e2b9d1733cb1",
    start: "2018-01-01",
    end: "2018-02-01",
    query: "my order never arrived",
  },
  {
    seller: "6560211a19b47992c3666cc44a7e94c0",
    start: "2018-08-01",
    end: "2018-09-01",
    query: "late delivery",
  },
  {
    seller: "ea8482cd71df3c1969d7b9473ff13abc",
    start: "2018-02-01",
    end: "2018-03-01",
    query: "the delivery was slow",
  },
];

// Portuguese for "late", "still not", "did not arrive", "did not receive" and "slow".
const LATE_IN_PORTUGUESE = /atras|ainda nao|nao chegou|nao recebi|demor/;

// Lower case, no accents, single spaces: "Não  chegou" -> "nao chegou".
function fold(text: string): string {
  const withoutAccents = text.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  return withoutAccents.toLowerCase().replace(/\s+/g, " ");
}

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

const hitsByFolder = new Map<string, Hit[][]>();

function hits(folder: string): Hit[][] {
  const saved = hitsByFolder.get(folder);
  if (saved) return saved;
  const found = CASES.map((searchCase) => {
    const commandArguments = [searchCase.query, "--seller", searchCase.seller];
    commandArguments.push("--start", searchCase.start, "--end", searchCase.end);
    const printed = jsonOutput(runPython(join(folder, "reviews.py"), commandArguments));
    return Array.isArray(printed) ? (printed as Hit[]) : [];
  });
  hitsByFolder.set(folder, found);
  return found;
}

async function belongsToCase(hit: Hit, searchCase: Case, checkWindow: boolean) {
  let sql =
    "SELECT 1 FROM order_reviews r JOIN orders o ON o.order_id = r.order_id " +
    `WHERE r.review_id = ${quote(hit.review_id ?? "")} ` +
    "AND r.order_id IN (SELECT order_id FROM order_items " +
    `WHERE seller_id = ${quote(searchCase.seller)})`;
  if (checkWindow) {
    sql += ` AND o.order_purchase_timestamp >= ${quote(searchCase.start)}`;
    sql += ` AND o.order_purchase_timestamp < ${quote(searchCase.end)}`;
  }
  const result = await tryRunSql(sql);
  return result !== null && result.rows.length > 0;
}

async function everyHit(folder: string, holds: (hit: Hit, searchCase: Case) => Promise<boolean>) {
  const allHits = hits(folder);
  for (const [i, searchCase] of CASES.entries()) {
    for (const hit of allHits[i]) if (!(await holds(hit, searchCase))) return false;
  }
  return true;
}

export default [
  {
    says: `each of the ${CASES.length} review questions finds at least one review`,
    test: (folder) => hits(folder).every((found) => found.length > 0),
    tryNext:
      "the comments are in Portuguese: turn the English words into Portuguese roots " +
      "with PORTUGUESE_ROOTS before you search",
  },
  {
    says: "every returned review_id belongs to an order of the seller asked",
    test: (folder) => everyHit(folder, (hit, searchCase) => belongsToCase(hit, searchCase, false)),
    tryNext: "filter in SQL first: keep orders that hold an item with order_items.seller_id = ?",
  },
  {
    says: "every returned order was placed in the window asked",
    test: (folder) => everyHit(folder, (hit, searchCase) => belongsToCase(hit, searchCase, true)),
    tryNext: "add order_purchase_timestamp >= start AND < end to the SQL filter",
  },
  {
    says: "every quote is the comment stored for its review_id",
    test: (folder) =>
      everyHit(folder, async (hit) => {
        const sql =
          "SELECT review_comment_message FROM order_reviews " +
          `WHERE review_id = ${quote(hit.review_id ?? "")}`;
        const stored = await tryRunSql(sql);
        const comments = (stored?.rows ?? []).map((row) => fold(String(row[0])).trim());
        return comments.includes(fold(hit.quote ?? "").trim());
      }),
    tryNext: "quote the comment as it is stored; only spaces may change",
  },
  {
    says: "an English question finds Portuguese comments about a late or missing delivery",
    test: (folder) =>
      hits(folder).every((found) =>
        found.some((hit) => LATE_IN_PORTUGUESE.test(fold(hit.quote ?? ""))),
      ),
    tryNext: 'map "late" to "atras" and "never" to "nao chegou"; fold accents before you match',
  },
] satisfies Rule[];
