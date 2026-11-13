// route-the-question: the router sends 40 questions down the right path.
// The 30 golden questions need numbers (sql); 10 more need reviews, both, a refusal or a hand-off.
// The check runs router.py on all 40 questions and compares each route with the expected one.
import { KIT, savedRun } from "../parts/05-build-the-loop/kit";
import type { Rule } from "../scripts/verify";
import { loadGolden } from "./lib/golden";

const ROUTES = ["sql", "reviews", "both", "refuse", "handoff"];
const MOST_MISSES_ALLOWED = 4;

type Expected = { question: string; expected: string };

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
  const questions = KIT.route.filter((item) => item.expected === wanted);
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
