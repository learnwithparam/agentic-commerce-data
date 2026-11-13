// state-the-assumptions: every answer lists its assumptions in plain English. An answer that uses
// a metric shows that metric's assumption from metrics.toml, and late-delivery answers say what
// "late" was measured against: the estimated date.
// The check runs ask.py on all 30 golden questions, three fresh times; wording is free.
import {
  type GoldenRun,
  holdsInMostRuns,
  METRIC_FOR_QUESTION,
  METRIC_IDS,
  readMetrics,
} from "../parts/03-define-the-metrics/check-helpers";
import type { Rule } from "../scripts/verify";
import { loadGolden } from "./lib/golden";

const golden = loadGolden();
const lateQuestions = Object.keys(METRIC_FOR_QUESTION).filter(
  (id) => METRIC_FOR_QUESTION[id] === "late_delivery_rate",
);

const assumptionsOf = (run: GoldenRun, questionId: string) =>
  run.get(questionId)?.assumptions ?? [];

export default [
  {
    says: "each metric in metrics.toml has an assumption",
    test: (folder) => {
      const metrics = readMetrics(folder);
      return METRIC_IDS.every((id) => (metrics[id]?.assumption ?? "").trim().length > 0);
    },
    tryNext: 'add assumption = "..." to each metric: one sentence a manager can read',
  },
  {
    says: "every golden answer lists at least one assumption",
    test: (folder) =>
      holdsInMostRuns(folder, (run) =>
        golden.every((question) => assumptionsOf(run, question.id).length > 0),
      ),
    tryNext:
      "add the model's plan assumptions as well as the metric ones; " +
      "a free SQL answer has no metric to borrow from",
  },
  {
    says: "every answer that uses a metric shows that metric's assumption",
    test: (folder) => {
      const metrics = readMetrics(folder);
      return holdsInMostRuns(folder, (run) =>
        Object.entries(METRIC_FOR_QUESTION).every(([questionId, metricId]) =>
          assumptionsOf(run, questionId).includes(metrics[metricId]?.assumption ?? "-"),
        ),
      );
    },
    tryNext: 'for each name in used_metrics, add metrics[name]["assumption"] to the answer',
  },
  {
    says: "late-delivery answers say late is measured against the estimated date",
    test: (folder) =>
      holdsInMostRuns(folder, (run) =>
        lateQuestions.every((questionId) =>
          assumptionsOf(run, questionId).some((assumption) => /estimat/i.test(assumption)),
        ),
      ),
    tryNext: "say in the late_delivery_rate assumption that late means after the estimated date",
  },
] satisfies Rule[];
