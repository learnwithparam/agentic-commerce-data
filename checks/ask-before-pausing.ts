// ask-before-pausing: a pause request ends as an interrupt with an approval form,
// and the mock seller-success API is called only after a person approves.
// The check plays four scenarios, each 3 times in a fresh folder, and counts the API calls.
import { interruptId, PLAN, type Printed, threeScenarios } from "../parts/07-approve-the-write/kit";
import type { Rule } from "../scripts/verify";

const STEP = "ask-before-pausing";
const APPROVE = { choice: "approve" as const, user: "cm-ana" };
const REJECT = { choice: "reject" as const, user: "cm-ana" };
const PAUSE_PATH = `/sellers/${PLAN.seller_id}/pause`;

type Form = { createSurface?: { dataModel?: Record<string, unknown> } };

function showsTheForm(printed: Printed | undefined): boolean {
  const outcome = printed?.outcome as { type?: string } | undefined;
  if (outcome?.type !== "interrupt" || !interruptId(printed)) return false;
  const surface = (printed?.ui ?? []) as Form[];
  const model = surface[0]?.createSurface?.dataModel;
  const evidence = (model?.evidence ?? []) as { id?: string }[];
  const evidenceIds = evidence.map((item) => item.id).join();
  const planIds = PLAN.evidence.map((item) => item.id).join();
  return model?.seller_id === PLAN.seller_id && evidenceIds === planIds;
}

export default [
  {
    says: "asking to pause a seller ends with an interrupt and an approval form with the evidence",
    test: (folder) =>
      threeScenarios(STEP, folder, []).every((scenario) => showsTheForm(scenario.printed[0])),
    tryNext:
      'return kit.approval_form_surface(plan, evidence) as "ui" and ' +
      '{"type": "interrupt", "interrupts": [{"id": ..., "reason": "approval"}]} as "outcome"',
  },
  {
    says: "without a decision, the seller-success API is never called",
    test: (folder) =>
      threeScenarios(STEP, folder, []).every((scenario) => scenario.apiCalls.length === 0),
    tryNext:
      "remove kit.pause_seller from ask(); the plan's \"approved\": true is the model's word, " +
      "not a person's",
  },
  {
    says: "after an approval, the API holds exactly one pause call for that seller",
    test: (folder) =>
      threeScenarios(STEP, folder, [APPROVE]).every(
        (scenario) => scenario.apiCalls.length === 1 && scenario.apiCalls[0].path === PAUSE_PATH,
      ),
    tryNext: "in resume(), load the run with kit.load_pending(id) and call kit.pause_seller once",
  },
  {
    says: "after a rejection, the API is never called",
    test: (folder) =>
      threeScenarios(STEP, folder, [REJECT]).every((scenario) => scenario.apiCalls.length === 0),
    tryNext: "call kit.pause_seller only when approved is True",
  },
  {
    says: "the same approval sent twice still makes only one call",
    test: (folder) =>
      threeScenarios(STEP, folder, [APPROVE, APPROVE]).every(
        (scenario) => scenario.apiCalls.length === 1,
      ),
    tryNext: "call kit.forget_pending(id) before you pause, so a second resume finds nothing",
  },
] satisfies Rule[];
