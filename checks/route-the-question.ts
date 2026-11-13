// route-the-question: the router sends 40 questions down the right path.
// The 30 golden questions need numbers (sql); 10 more need reviews, both, a refusal or a hand-off.
// The check runs router.py on all 40 questions and compares each route with the expected one.
// It also scores 8 held-out questions the learner never sees, in route-the-question-heldout.toml.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT, savedRun } from "../parts/05-build-the-loop/kit";
import { ROOT } from "../scripts/structure";
import type { Rule } from "../scripts/verify";
import { loadGolden } from "./lib/golden";

const ROUTES = ["sql", "reviews", "both", "refuse", "handoff"];
const MOST_MISSES_ALLOWED = 4;
const MOST_HELDOUT_MISSES = 1;
const HELDOUT_FILE = "route-the-question-heldout.toml";

type Expected = { question: string; expected: string };

const HELDOUT = (
  Bun.TOML.parse(readFileSync(join(ROOT, "checks", HELDOUT_FILE), "utf8")) as {
    heldout: Expected[];
  }
).heldout;

function expectedRoutes(): Expected[] {
  const golden = loadGolden().map((question) => ({ question: question.question, expected: "sql" }));
  return [...golden, ...KIT.route];
}

// The route router.py printed for each question, in the same order as the questions.
function routesFor(folder: string, questions: Expected[]): (string | undefined)[] {
  const run = savedRun(
    "route-the-question",
    folder,
    questions.map((item) => item.question),
  );
  return questions.map((item) => {
    const printed = run.printed.find((line) => line.question === item.question);
    return printed?.route as string | undefined;
  });
}

function countMatches(folder: string): number {
  const questions = expectedRoutes();
  const routes = routesFor(folder, questions);
  return questions.filter((item, i) => routes[i] === item.expected).length;
}

function allRoutedTo(folder: string, wanted: string): boolean {
  const questions = [...KIT.route, ...HELDOUT].filter((item) => item.expected === wanted);
  const routes = routesFor(folder, questions);
  return routes.every((route) => route === wanted);
}

export default [
  {
    says: "router.py prints one known route for each of the 40 questions",
    test: (folder) => {
      const routes = routesFor(folder, expectedRoutes());
      return routes.every((route) => route !== undefined && ROUTES.includes(route));
    },
    tryNext:
      "keep main() as it is and make route() return one of: sql, reviews, both, refuse, handoff",
  },
  {
    says: "at least 36 of the 40 routes match the expected route",
    test: (folder) => countMatches(folder) >= expectedRoutes().length - MOST_MISSES_ALLOWED,
    tryNext:
      "run the 10 questions in parts/05-build-the-loop/kit.toml through your router " +
      "and add a rule for each kind it gets wrong",
  },
  {
    says: `${HELDOUT.length - MOST_HELDOUT_MISSES} of ${HELDOUT.length} new questions are right`,
    test: (folder) => {
      const routes = routesFor(folder, HELDOUT);
      const right = HELDOUT.filter((item, i) => routes[i] === item.expected).length;
      return right >= HELDOUT.length - MOST_HELDOUT_MISSES;
    },
    tryNext:
      "your rules fit the 40 questions but not new ones; " +
      "look for the idea behind each route, not for the exact words in kit.toml",
  },
  {
    says: "a polite request to change data is refused and never goes to sql",
    test: (folder) => {
      const polite = HELDOUT.filter((item) => item.expected === "refuse");
      const routes = routesFor(folder, polite);
      return polite.length > 0 && routes.every((route) => route === "refuse");
    },
    tryNext: 'skip "please" and "could you", then check the verb; "Please delete" must be refuse',
  },
  {
    says: "every request to change data is refused",
    test: (folder) => allRoutedTo(folder, "refuse"),
    tryNext:
      'a question that starts with a verb like "delete" or "set" must return refuse, never sql',
  },
  {
    says: "every question about carriers and parcels is handed off",
    test: (folder) => allRoutedTo(folder, "handoff"),
    tryNext: 'look for words like "carrier", "parcel" and "logistics" and return handoff',
  },
] satisfies Rule[];
