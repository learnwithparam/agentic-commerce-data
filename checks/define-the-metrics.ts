// define-the-metrics: metrics.toml defines the four desk metrics, each with a description,
// an owner, a grain, an expression and a full query. The check runs each query through the
// course's validator and on the database, and tests the two definitions people get wrong.
import {
  METRIC_IDS,
  type Metric,
  readMetrics,
  validatorVerdicts,
} from "../parts/03-define-the-metrics/check-helpers";
import type { Rule } from "../scripts/verify";
import { tryRunSql } from "./lib/db";

const FIELDS = ["description", "owner", "grain", "expression", "sql"] as const;

// Measured on the data: people with more than one order, and the late share of delivered orders.
const REPEAT_CUSTOMERS = 2997;
const LATE_PERCENT = 6.77;

function metric(folder: string, id: string): Metric {
  const found = readMetrics(folder)[id];
  if (!found) throw new Error(`metrics.toml has no [${id}]`);
  return found;
}

const allMetrics = (folder: string) => METRIC_IDS.map((id) => metric(folder, id));

async function firstNumber(sql: string | undefined): Promise<number | null> {
  if (!sql) return null;
  const result = await tryRunSql(sql);
  const value = result?.rows[0]?.[0];
  return value === undefined || value === null ? null : Number(value);
}

// A share may be written as a percent (6.77) or as a fraction (0.0677).
const isLatePercent = (value: number | null) =>
  value !== null &&
  (Math.abs(value - LATE_PERCENT) < 0.01 || Math.abs(value * 100 - LATE_PERCENT) < 0.01);

export default [
  {
    says: "metrics.toml defines late_delivery_rate, gmv, active_seller and repeat_customer",
    test: (folder) => allMetrics(folder).length === METRIC_IDS.length,
    tryNext: "add a [table] for each of the four ids, spelled exactly as listed",
  },
  {
    says: "each metric has a description, an owner, a grain, an expression and sql",
    test: (folder) =>
      allMetrics(folder).every((found) =>
        FIELDS.every((field) => (found[field] ?? "").trim().length > 0),
      ),
    tryNext: "copy the fields of gmv; an owner is the role who decides what the number means",
  },
  {
    says: "each metric's sql uses its own expression, so the definition lives in one place",
    test: (folder) =>
      allMetrics(folder).every((found) => (found.sql ?? "").includes(found.expression ?? "-")),
    tryNext: "paste the expression into the sql exactly as it is written above it",
  },
  {
    says: "each metric's sql passes the validator",
    test: (folder) => {
      const verdicts = validatorVerdicts(allMetrics(folder).map((found) => found.sql ?? ""));
      return verdicts.every((verdict) => verdict.ok);
    },
    tryNext: "write one SELECT on the nine tables; run it with uv run python to see the error",
  },
  {
    says: "each metric's sql returns rows",
    test: async (folder) => {
      for (const found of allMetrics(folder)) {
        const result = await tryRunSql(found.sql ?? "");
        if (!result || result.rows.length === 0) return false;
      }
      return true;
    },
    tryNext: "run the sql on its own; a query that fails or finds nothing is not a definition",
  },
  {
    says: `repeat_customer counts people by customer_unique_id (${REPEAT_CUSTOMERS} of them)`,
    test: async (folder) => {
      const repeat = metric(folder, "repeat_customer");
      const usesPeople = `${repeat.grain} ${repeat.sql}`.includes("customer_unique_id");
      return usesPeople && (await firstNumber(repeat.sql)) === REPEAT_CUSTOMERS;
    },
    tryNext:
      "customer_id is new on every order, so it never repeats; " +
      "group by customers.customer_unique_id and set the grain to it",
  },
  {
    says: `late_delivery_rate compares dates, not text (${LATE_PERCENT}% of delivered orders)`,
    test: async (folder) =>
      isLatePercent(await firstNumber(metric(folder, "late_delivery_rate").sql)),
    tryNext:
      "the estimate has no time of day, so wrap both columns in date(...) before comparing; " +
      "count only delivered orders that have a delivery date",
  },
] satisfies Rule[];
