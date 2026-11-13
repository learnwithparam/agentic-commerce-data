// cite-the-rows: every number in an answer cites the query and the rows it came from,
// and every quote cites the review that holds it.
// The check runs cite.py on 5 questions, re-runs every cited query on the database, and looks up
// every cited review. It reads the model's recorded plan only to know which cells the text shows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT, savedRun } from "../parts/05-build-the-loop/kit";
import { ROOT } from "../scripts/structure";
import type { Rule } from "../scripts/verify";
import { cell } from "./lib/compare";
import { runSql, tryRunSql } from "./lib/db";

const QUESTIONS = KIT.citations.questions;
const CELL_REFERENCE = /\{(q\d+):(\d+):(\d+)\}/g;
const REVIEW_ID = /^[0-9a-f]{32}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

// The answer spells these keys with underscores, so they keep that spelling here.
type Citation = Partial<Record<"review_id", string> & Record<"row_ids", number[]>> & {
  claim?: unknown;
  query?: string;
};
type Answer = {
  question: string;
  answer: string;
  sql: { id: string; text: string }[];
  rows: unknown[][];
  reviews: Record<"review_id", string>[];
  citations: Citation[];
} & Record<"rows_from", string>;

function answers(folder: string): Answer[] {
  const run = savedRun("cite-the-rows", folder, [...QUESTIONS, "--json"]);
  const printed = run.printed as unknown as Answer[];
  const found = QUESTIONS.map((question) => printed.find((answer) => answer.question === question));
  if (found.some((answer) => !answer || !Array.isArray(answer.citations))) {
    throw new Error("cite.py did not print an answer with citations for every question");
  }
  return found as Answer[];
}

// The answer sentence the model planned, with its {q1:0:2} cell references still in it.
function plannedTemplate(question: string): string {
  const replay = readFileSync(join(ROOT, "world", "replay", "finished.jsonl"), "utf8");
  for (const line of replay.split("\n").filter(Boolean)) {
    const recording = JSON.parse(line);
    if (recording.role === "smart" && recording.question === question) {
      return JSON.parse(recording.reply).answer ?? "";
    }
  }
  return "";
}

async function queryRows(answer: Answer, queryId: string): Promise<unknown[][] | null> {
  const query = answer.sql.find((item) => item.id === queryId);
  if (!query) return null;
  const result = await tryRunSql(query.text);
  return result?.rows ?? null;
}

// The numbers in a claim, as the labels compare.ts uses, so 8.9 and "8.90" are the same.
function numbersIn(claim: unknown): string[] {
  const words = String(claim ?? "").split(/[\s,;:()]+/);
  return words.filter((word) => NUMBER.test(word)).map(cell);
}

async function cellIsCited(answer: Answer, reference: RegExpMatchArray): Promise<boolean> {
  const [queryId, rowNumber, columnNumber] = [reference[1], Number(reference[2]), reference[3]];
  const rows = await queryRows(answer, queryId);
  const value = rows?.[rowNumber]?.[Number(columnNumber)];
  if (value === undefined) return false;
  return answer.citations.some(
    (citation) =>
      citation.query === queryId &&
      (citation.row_ids ?? []).includes(rowNumber) &&
      String(citation.claim ?? "").includes(String(value)),
  );
}

async function citationReproduces(answer: Answer, citation: Citation): Promise<boolean> {
  if (citation.review_id !== undefined) return true;
  const rows = await queryRows(answer, String(citation.query));
  const rowIds = citation.row_ids ?? [];
  if (!rows || rowIds.length === 0) return false;
  const citedRows = rowIds.map((rowId) => rows[rowId]);
  if (citedRows.some((row) => row === undefined)) return false;
  const cellsInRows = new Set(citedRows.flat().map(cell));
  return numbersIn(citation.claim).every((number) => cellsInRows.has(number));
}

function everyRowCited(answer: Answer): boolean {
  const cited = new Set<number>();
  for (const citation of answer.citations) {
    if (citation.query !== answer.rows_from) continue;
    for (const rowId of citation.row_ids ?? []) cited.add(rowId);
  }
  return answer.rows.every((_row, rowId) => cited.has(rowId));
}

async function quoteIsInItsReview(citation: Citation): Promise<boolean> {
  if (!REVIEW_ID.test(String(citation.review_id))) return false;
  const found = await runSql(
    `SELECT review_comment_message FROM order_reviews WHERE review_id = '${citation.review_id}'`,
  );
  const tidy = (text: unknown) =>
    String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const quote = tidy(citation.claim);
  return quote !== "" && found.rows.some((row) => tidy(row[0]).includes(quote));
}

async function reviewsAreCited(answer: Answer): Promise<boolean> {
  for (const review of answer.reviews) {
    const citation = answer.citations.find((item) => item.review_id === review.review_id);
    if (!citation || !(await quoteIsInItsReview(citation))) return false;
  }
  return true;
}

async function everyAnswer(folder: string, test: (answer: Answer) => Promise<boolean> | boolean) {
  for (const answer of answers(folder)) {
    if (!(await test(answer))) return false;
  }
  return true;
}

export default [
  {
    says: "cite.py prints an answer with citations for each of the 5 questions",
    test: (folder) => answers(folder).every((answer) => answer.citations.length > 0),
    tryNext: "fill in cite_cells, cite_rows and cite_reviews; each returns a list of citations",
  },
  {
    says: "every number the answer text takes from a query is cited with its query and row",
    test: (folder) =>
      everyAnswer(folder, async (answer) => {
        const references = [...plannedTemplate(answer.question).matchAll(CELL_REFERENCE)];
        for (const reference of references) {
          if (!(await cellIsCited(answer, reference))) return false;
        }
        return true;
      }),
    tryNext:
      'for each {q1:0:2} in plan["answer"], add {"claim": value, "query": "q1", "row_ids": [0]}',
  },
  {
    says: "re-running each cited query finds every number of the claim in the cited rows",
    test: (folder) =>
      everyAnswer(folder, async (answer) => {
        for (const citation of answer.citations) {
          if (!(await citationReproduces(answer, citation))) return false;
        }
        return true;
      }),
    tryNext: "cite the row a number really sits in; row_ids count from 0 in the query's rows",
  },
  {
    says: "every row the answer shows is cited",
    test: (folder) => everyAnswer(folder, everyRowCited),
    tryNext: 'cite_rows gives each row its own citation with "row_ids": [row_number]',
  },
  {
    says: "every review quote cites its review_id, and that review holds the quoted words",
    test: (folder) => everyAnswer(folder, reviewsAreCited),
    tryNext:
      'quote review["quote"], the customer\'s Portuguese words; the English gloss is not a quote',
  },
] satisfies Rule[];
