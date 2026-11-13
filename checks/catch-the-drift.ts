// catch-the-drift: the desk changes what "late" means, and you change the metric and the golden
// references together. The check works out the new count itself, reads both of your files,
// and runs the real gate on the desk agent with your metrics.toml and golden.toml.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { driftProblems, type GateResult, runGate } from "../parts/09-gate-every-change/gate";
import type { Rule } from "../scripts/verify";
import { tryRunSql } from "./lib/db";

const METRIC = "late_delivery_rate";
// The new rule, written the check's own way: more than 2 days after the estimated date.
const NEW_LATE =
  "julianday(date(o.order_delivered_customer_date)) - " +
  "julianday(date(o.order_estimated_delivery_date)) > 2";

const metricsPath = (folder: string) => join(folder, "metrics.toml");
const goldenPath = (folder: string) => join(folder, "golden.toml");

function lateOrders2018(lateExpression: string): string {
  return (
    "SELECT COUNT(*) FROM orders o WHERE substr(o.order_purchase_timestamp, 1, 4) = '2018' " +
    `AND o.order_delivered_customer_date IS NOT NULL AND (${lateExpression})`
  );
}

function lateExpression(folder: string): string {
  const metrics = Bun.TOML.parse(readFileSync(metricsPath(folder), "utf8")) as Record<
    string,
    { expression?: string }
  >;
  return metrics[METRIC]?.expression ?? "";
}

async function count(sql: string): Promise<number | null> {
  const result = await tryRunSql(sql);
  if (!result) return null;
  return Number(result.rows[0][0]);
}

const savedGates = new Map<string, Promise<GateResult>>();

function gateOn(folder: string): Promise<GateResult> {
  if (!savedGates.has(folder)) {
    const options = {
      rulesFile: join(folder, "gate-rules.ts"),
      goldenPath: goldenPath(folder),
      metricsPath: metricsPath(folder),
    };
    savedGates.set(folder, runGate(options));
  }
  return savedGates.get(folder) as Promise<GateResult>;
}

export default [
  {
    says: "metrics.toml and golden.toml are both in this folder",
    test: (folder) => existsSync(metricsPath(folder)) && existsSync(goldenPath(folder)),
    tryNext: "keep both files in this folder; the starter has them",
  },
  {
    says: "late_delivery_rate now means more than 2 days after the estimated date",
    test: async (folder) => {
      const yours = await count(lateOrders2018(lateExpression(folder)));
      const expected = await count(lateOrders2018(NEW_LATE));
      return yours !== null && yours === expected;
    },
    tryNext:
      "change the expression of late_delivery_rate in metrics.toml; " +
      "julianday() turns a date into a number of days",
  },
  {
    says: "every golden question tagged late_delivery_rate uses the same definition",
    test: (folder) => driftProblems(goldenPath(folder), metricsPath(folder)).length === 0,
    tryNext:
      'put the new expression into the sql of every question with metric = "late_delivery_rate"',
  },
  {
    says: "the gate passes on the desk agent with your two files",
    test: async (folder) => (await gateOn(folder)).pass,
    tryNext: "run the gate command from the step README and read its BLOCK lines",
  },
] satisfies Rule[];
