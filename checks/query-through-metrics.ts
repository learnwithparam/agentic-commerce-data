// query-through-metrics: the agent uses a metric from metrics.toml whenever one fits, says so in
// metric_ids, and writes free SQL with metric_ids: [] only when none fits.
// The check runs ask.py on all 30 golden questions, three fresh times, and judges rows and ids.
import {
  type GoldenRun,
  holdsInMostRuns,
  METRIC_FOR_QUESTION,
} from "../parts/03-define-the-metrics/check-helpers";
import type { Rule } from "../scripts/verify";
import { judge, loadGolden } from "./lib/golden";

const golden = loadGolden();
const metricQuestions = golden.filter((question) => question.id in METRIC_FOR_QUESTION);
const freeQuestions = golden.filter((question) => !(question.id in METRIC_FOR_QUESTION));

const idsOf = (run: GoldenRun, questionId: string) => run.get(questionId)?.metric_ids ?? [];

export default [
  {
    says: `on the ${metricQuestions.length} metric questions, metric_ids names the right metric`,
    test: (folder) =>
      holdsInMostRuns(folder, (run) =>
        metricQuestions.every((question) =>
          idsOf(run, question.id).includes(METRIC_FOR_QUESTION[question.id]),
        ),
      ),
    tryNext:
      "in expand(), add each metric name you fill in to used_metrics, " +
      'then set answer["metric_ids"] = used_metrics',
  },
  {
    says: "on the metric questions, the rows match the reference",
    test: (folder) =>
      holdsInMostRuns(folder, async (run) => {
        for (const question of metricQuestions) {
          const rows = run.get(question.id)?.rows ?? [];
          if (!(await judge(question, rows)).match) return false;
        }
        return true;
      }),
    tryNext:
      'fill {{metric_id}} with metrics[name]["expression"]; ' +
      "if late questions miss, check that the expression compares date(...) values",
  },
  {
    says: `the ${freeQuestions.length} free SQL answers carry metric_ids: []`,
    test: (folder) =>
      holdsInMostRuns(folder, (run) =>
        freeQuestions.every((question) => idsOf(run, question.id).length === 0),
      ),
    tryNext:
      "name only the metrics whose expression is really in the query; " +
      "the model's own metric_ids can be wrong",
  },
  {
    says: "every golden question gets an answer with no error",
    test: (folder) =>
      holdsInMostRuns(folder, (run) =>
        golden.every((question) => {
          const answer = run.get(question.id);
          return answer !== undefined && !answer.error && !answer.refused;
        }),
      ),
    tryNext:
      "from the repo root, run uv run python " +
      "parts/03-define-the-metrics/02-query-through-metrics/problem/ask.py " +
      '"What was GMV in 2018?" and read the error it prints',
  },
] satisfies Rule[];
