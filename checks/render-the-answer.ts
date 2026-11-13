// render-the-answer: the agent returns A2UI v1.0 messages built from the course catalog.
// The check runs render.py on 5 golden questions and the Sao Paulo question, applies the messages
// the way a renderer does, and compares what the table, chart and quotes point to with the answer.
import {
  CATALOG_ID,
  COMPONENT_NAMES,
  type Component,
  resolve,
  type Surface,
  savedRun,
  surfaceFrom,
} from "../parts/06-answer-with-ui/kit";
import type { Rule } from "../scripts/verify";
import { rowsMatch } from "./lib/compare";

const SAO_PAULO = "Which Sao Paulo sellers had the most late deliveries in 2018?";
const QUESTIONS = [
  "Which 5 customer states placed the most orders?",
  "What share of payment value came from each payment type?",
  "What were the top 10 product categories by GMV in 2018, with English names?",
  "What share of delivered orders in cama_mesa_banho arrived late, by month of purchase in 2018?",
  "Which 5 sellers had the highest GMV in 2018?",
  SAO_PAULO,
];

type Message = Record<string, Record<string, unknown>>;
type Answer = {
  question: string;
  columns: string[];
  rows: unknown[][];
  chart?: { columns: string[]; rows: unknown[][] };
  reviews: Record<"review_id" | "quote", string>[];
  ui?: Message[];
};

function answers(folder: string): Answer[] {
  const printed = savedRun("render-the-answer", folder, QUESTIONS) as unknown as Answer[];
  return QUESTIONS.map((question) => {
    const found = printed.find((answer) => answer.question === question);
    if (!found || !Array.isArray(found.ui)) throw new Error(`no ui for: ${question}`);
    return found;
  });
}

const surfaceOf = (answer: Answer) => surfaceFrom(answer.ui ?? []);

function componentsNamed(surface: Surface, name: string): Component[] {
  return surface.components.filter((component) => component.component === name);
}

function startsRight(answer: Answer): boolean {
  const [first, second] = answer.ui ?? [];
  const created = first?.createSurface;
  const updated = second?.updateComponents;
  if (!created || first.version !== "1.0" || created.catalogId !== CATALOG_ID) return false;
  return Boolean(updated) && updated.surfaceId === created.surfaceId;
}

function tableHoldsTheRows(answer: Answer): boolean {
  const surface = surfaceOf(answer);
  return componentsNamed(surface, "Table").some((table) => {
    const rows = resolve(surface, table.rows);
    const columns = resolve(surface, table.columns);
    if (!Array.isArray(rows) || !Array.isArray(columns)) return false;
    const sameColumns = columns.join() === answer.columns.join();
    return sameColumns && rowsMatch(rows as unknown[][], answer.rows, true);
  });
}

function chartHoldsItsPoints(answer: Answer): boolean {
  const surface = surfaceOf(answer);
  const chartRows = answer.chart?.rows ?? [];
  return componentsNamed(surface, "LineChart").some((chart) => {
    const points = resolve(surface, chart.points);
    return Array.isArray(points) && points.length === chartRows.length && chartRows.length > 0;
  });
}

function quotesHoldTheReviews(answer: Answer): boolean {
  const surface = surfaceOf(answer);
  const quotes = componentsNamed(surface, "ReviewQuote");
  return answer.reviews.every((review) =>
    quotes.some(
      (quote) =>
        resolve(surface, quote.reviewId) === review.review_id &&
        resolve(surface, quote.quote) === review.quote,
    ),
  );
}

export default [
  {
    says: "render.py prints an answer with a ui list for each of the 6 questions",
    test: (folder) => answers(folder).length === QUESTIONS.length,
    tryNext: "keep main() as it is; surface_for() must return a list of A2UI messages",
  },
  {
    says: "each ui starts with createSurface (version 1.0, course catalog), then updateComponents",
    test: (folder) => answers(folder).every(startsRight),
    tryNext: `use "version": "1.0" and "catalogId": kit.CATALOG_ID ("${CATALOG_ID}")`,
  },
  {
    says: "every component is one the course catalog has",
    test: (folder) =>
      answers(folder).every((answer) =>
        surfaceOf(answer).components.every((component) =>
          COMPONENT_NAMES.includes(component.component),
        ),
      ),
    tryNext: `pick components from this list only: ${COMPONENT_NAMES.join(", ")}`,
  },
  {
    says: "a Table points into the data model, and there it finds every row of the answer",
    test: (folder) => answers(folder).every(tableHoldsTheRows),
    tryNext:
      'put columns and rows under "table" in the data model, and give the Table ' +
      '{"@path": "/table/columns"} and {"@path": "/table/rows"}; send every row, not a few',
  },
  {
    says: "the Sao Paulo answer shows its chart and a ReviewQuote for each cited review",
    test: (folder) => {
      const saoPaulo = answers(folder).find((answer) => answer.question === SAO_PAULO);
      if (!saoPaulo) return false;
      return chartHoldsItsPoints(saoPaulo) && quotesHoldTheReviews(saoPaulo);
    },
    tryNext:
      'when answer["chart"] is set, add a LineChart bound to its points; ' +
      "add one ReviewQuote per review, bound to its review_id and quote",
  },
] satisfies Rule[];
