// log-the-decision: every approval and every rejection writes one line to decisions.jsonl,
// and the approver is the person signed in to the session, never a name the model wrote.
// The check approves as cm-ana and rejects as sl-rui, each 3 times in a fresh folder.
import { PLAN, type Scenario, threeScenarios } from "../parts/07-approve-the-write/kit";
import type { Rule } from "../scripts/verify";

const STEP = "log-the-decision";
const APPROVE = { choice: "approve" as const, user: "cm-ana" };
const REJECT = { choice: "reject" as const, user: "sl-rui" };
const SLACK_MS = 60_000;

const waiting = (folder: string) => threeScenarios(STEP, folder, []);
const approved = (folder: string) => threeScenarios(STEP, folder, [APPROVE]);
const rejected = (folder: string) => threeScenarios(STEP, folder, [REJECT]);

function decidedRuns(folder: string): { scenario: Scenario; user: string; word: string }[] {
  const approvals = approved(folder).map((scenario) => ({
    scenario,
    user: "cm-ana",
    word: "approved",
  }));
  const rejections = rejected(folder).map((scenario) => ({
    scenario,
    user: "sl-rui",
    word: "rejected",
  }));
  return [...approvals, ...rejections];
}

function timeIsNow(writtenAt: unknown, startedAt: number): boolean {
  const when = Date.parse(String(writtenAt));
  return !Number.isNaN(when) && Math.abs(when - startedAt) < SLACK_MS;
}

export default [
  {
    says: "each approval and each rejection writes exactly one line",
    test: (folder) => decidedRuns(folder).every((run) => run.scenario.decisions.length === 1),
    tryNext: "write the line in resume() for both answers, not only for an approval",
  },
  {
    says: "the approver is the signed-in user, never the name the model wrote",
    test: (folder) =>
      decidedRuns(folder).every((run) => {
        const line = run.scenario.decisions[0];
        return line?.approver === run.user && line?.approver !== PLAN.approver;
      }),
    tryNext: `use the --user of resume; "approver": "${PLAN.approver}" is the model's word`,
  },
  {
    says: "each line has the decision, the question, the time and the evidence query ids",
    test: (folder) =>
      decidedRuns(folder).every((run) => {
        const line = run.scenario.decisions[0] ?? {};
        const evidence = (line.evidence ?? []) as string[];
        const planIds = PLAN.evidence.map((item) => item.id);
        return (
          line.decision === run.word &&
          line.question === PLAN.question &&
          timeIsNow(line.at, run.scenario.startedAt) &&
          evidence.join() === planIds.join()
        );
      }),
    tryNext:
      'write "decision" (approved or rejected), "question", "at" as an ISO time ' +
      'and "evidence" as the list of query ids',
  },
  {
    says: "a run that still waits for a person writes no line",
    test: (folder) => waiting(folder).every((scenario) => scenario.decisions.length === 0),
    tryNext: "write the line when a person decides, in resume(), not when the form is shown",
  },
] satisfies Rule[];
