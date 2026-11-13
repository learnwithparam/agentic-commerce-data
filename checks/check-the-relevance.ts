// check-the-relevance: review search found 11 hits for a late-delivery question;
// 5 of them are off-topic (praise for the packaging, a broken product, an order that came on time).
// The check runs relevance.py and reads which review ids the answer cites.
import { KIT, savedRun } from "../parts/05-build-the-loop/kit";
import type { Rule } from "../scripts/verify";
import { runSql } from "./lib/db";

const FEWEST_ON_TOPIC_KEPT = 4;

// The answer spells review_id with an underscore, so it keeps that spelling here.
type Citation = Partial<Record<"review_id", string>> & { claim?: string };

function citedIds(folder: string): string[] | null {
  const run = savedRun("check-the-relevance", folder, []);
  const answer = run.printed[0];
  if (!answer || !Array.isArray(answer.citations)) return null;
  const citations = answer.citations as Citation[];
  return citations.map((citation) => String(citation.review_id ?? ""));
}

function cited(folder: string): string[] {
  const ids = citedIds(folder);
  if (ids === null) throw new Error("relevance.py printed no answer with citations");
  return ids;
}

const REVIEW_ID = /^[0-9a-f]{32}$/;

async function quoteIsTheReview(citation: Citation): Promise<boolean> {
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

export default [
  {
    says: "relevance.py prints one answer with a list of cited reviews",
    test: (folder) => citedIds(folder) !== null,
    tryNext: "keep main() as it is; is_relevant() must return True or False",
  },
  {
    says: "none of the 5 off-topic reviews is cited",
    test: (folder) => cited(folder).every((id) => !KIT.relevance.off_topic.includes(id)),
    tryNext:
      "read the quotes of the hits you keep: packaging, a broken product or an order that came " +
      '"no prazo" (on time) is not about a late delivery',
  },
  {
    says: "at least 4 of the 6 late-delivery reviews are still cited",
    test: (folder) => {
      const kept = cited(folder).filter((id) => KIT.relevance.late_delivery.includes(id));
      return kept.length >= FEWEST_ON_TOPIC_KEPT;
    },
    tryNext:
      'keep reviews that say the order came late or never came: "atraso", "não recebi", "demorou"',
  },
  {
    says: "every cited quote is the customer's own words from that review",
    test: async (folder) => {
      const run = savedRun("check-the-relevance", folder, []);
      const citations = (run.printed[0]?.citations ?? []) as Citation[];
      for (const citation of citations) {
        if (!(await quoteIsTheReview(citation))) return false;
      }
      return citations.length > 0;
    },
    tryNext:
      "cite the review's quote as kit.review_hits() gives it; do not shorten or translate it",
  },
] satisfies Rule[];
