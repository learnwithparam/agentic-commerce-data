// refuse-the-unsigned: your agent checks every remote card against its own allowlist
// before it sends a task. The check runs three team agents: the real logistics agent,
// an unsigned pricing agent, and an impostor that signs with its own key and points
// its jku header at that key. It reads each agent's task log to see who got a task.
import { join } from "node:path";
import {
  askOps,
  HANDOFF_QUESTIONS,
  newTempFolder,
  type OpsRun,
  once,
  readTaskLog,
  removeFolder,
  startTeamAgent,
} from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

const TEAMS = ["logistics", "pricing", "impostor"] as const;
type Team = (typeof TEAMS)[number];
type Visit = { run: OpsRun; tasksReceived: number };
const QUESTION = HANDOFF_QUESTIONS[0];

async function visit(folder: string, team: Team, logFolder: string): Promise<Visit> {
  const logPath = join(logFolder, `${team}-tasks.jsonl`);
  const agent = await startTeamAgent(team, logPath);
  try {
    const run = await askOps(folder, QUESTION, agent.url);
    return { run, tasksReceived: readTaskLog(logPath).length };
  } finally {
    agent.stop();
  }
}

function visits(folder: string): Promise<Record<Team, Visit>> {
  return once(`refuse:${folder}`, async () => {
    const logFolder = newTempFolder();
    try {
      const results = {} as Record<Team, Visit>;
      for (const team of TEAMS) results[team] = await visit(folder, team, logFolder);
      return results;
    } finally {
      removeFolder(logFolder);
    }
  });
}

function refusedWithReason({ run }: Visit): boolean {
  const reason = String(run.answer?.reason ?? "");
  return run.answer?.refused === true && reason.trim().length > 0;
}

export default [
  {
    says: "the unsigned pricing agent is refused, with a reason",
    test: async (folder) => refusedWithReason((await visits(folder)).pricing),
    tryNext: "in trust.verify_card, return False when the card has no signatures",
  },
  {
    says: "the impostor, signed by a key outside your allowlist, is refused, with a reason",
    test: async (folder) => refusedWithReason((await visits(folder)).impostor),
    tryNext:
      "verify the signature with the allowlist key of the same kid; " +
      "never fetch the key from the card's jku",
  },
  {
    says: "neither the pricing agent nor the impostor received a task",
    test: async (folder) => {
      const found = await visits(folder);
      return found.pricing.tasksReceived === 0 && found.impostor.tasksReceived === 0;
    },
    tryNext: "check the card before you send anything; a refused agent must get no message",
  },
  {
    says: "the logistics agent, signed by an allowed key, is accepted and its task completes",
    test: async (folder) => {
      const { run, tasksReceived } = (await visits(folder)).logistics;
      const handoff = (run.answer?.handoff ?? {}) as { state?: string };
      return tasksReceived === 1 && handoff.state === "TASK_STATE_COMPLETED";
    },
    tryNext: "sign and verify the same bytes: the canonical JSON of the card without signatures",
  },
] satisfies Rule[];
