// delegate-to-logistics: carrier questions go to the logistics team's agent as A2A tasks.
// The check starts the logistics agent, asks your ops agent three hand-off questions,
// and reads the logistics agent's own task log. A task id your agent made up is not in it.
import { join } from "node:path";
import {
  askOps,
  HANDOFF_QUESTIONS,
  newTempFolder,
  type OpsRun,
  ORDER_ID,
  once,
  readTaskLog,
  removeFolder,
  startTeamAgent,
  type TaskLogEntry,
} from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

const TASK_ID = "task_id";
const ORDER_IDS = "order_ids";

// The answer JSON spells task_id with an underscore, so it keeps that spelling here.
type Handoff = Partial<Record<"task_id" | "state" | "result", string>>;
type Delegation = { question: string; run: OpsRun; handoff: Handoff; logged?: TaskLogEntry };

function delegations(folder: string): Promise<Delegation[]> {
  return once(`delegate:${folder}`, async () => {
    const logFolder = newTempFolder();
    const logPath = join(logFolder, "logistics-tasks.jsonl");
    const logistics = await startTeamAgent("logistics", logPath);
    try {
      const runs: OpsRun[] = [];
      for (const question of HANDOFF_QUESTIONS) {
        runs.push(await askOps(folder, question, logistics.url));
      }
      const log = readTaskLog(logPath);
      return runs.map((run, i) => {
        const handoff = (run.answer?.handoff ?? {}) as Handoff;
        const taskId = handoff[TASK_ID];
        const logged = log.find((entry) => entry[TASK_ID] === taskId);
        return { question: HANDOFF_QUESTIONS[i], run, handoff, logged };
      });
    } finally {
      logistics.stop();
      removeFolder(logFolder);
    }
  });
}

async function everyDelegation(folder: string, test: (delegation: Delegation) => boolean) {
  const found = await delegations(folder);
  return found.every(test);
}

function sameIds(first: string[], second: string[]): boolean {
  const firstSorted = [...first].sort();
  const secondSorted = [...second].sort();
  return firstSorted.join() === secondSorted.join();
}

export default [
  {
    says: "each of the 3 hand-off answers has route handoff and a task id",
    test: (folder) =>
      everyDelegation(
        folder,
        ({ run, handoff }) => run.answer?.route === "handoff" && Boolean(handoff[TASK_ID]),
      ),
    tryNext: "write send_task in a2a_client.py so hand_off gets a task back from the agent",
  },
  {
    says: "every task id is in the logistics agent's own task log",
    test: (folder) => everyDelegation(folder, ({ logged }) => logged !== undefined),
    tryNext: "send a real SendMessage request; a task id you make up is not in their log",
  },
  {
    says: "the logistics agent received the order ids from each question",
    test: (folder) =>
      everyDelegation(folder, ({ question, logged }) => {
        const asked = question.match(ORDER_ID) ?? [];
        if (logged === undefined) return false;
        return sameIds(logged[ORDER_IDS], asked);
      }),
    tryNext: 'put the ids in a data part: {"data": {"order_ids": [...]}}, next to the text part',
  },
  {
    says: "every task ended TASK_STATE_COMPLETED, in the log and in your answer",
    test: (folder) =>
      everyDelegation(
        folder,
        ({ handoff, logged }) =>
          handoff.state === "TASK_STATE_COMPLETED" && logged?.state === "TASK_STATE_COMPLETED",
      ),
    tryNext: "read the task's status.state from the reply; a REJECTED task says what was missing",
  },
  {
    says: "your answer carries the logistics agent's result for every order",
    test: (folder) =>
      everyDelegation(folder, ({ question, run }) => {
        const result = String(run.answer?.answer ?? "");
        const asked = question.match(ORDER_ID) ?? [];
        return asked.every((orderId) => result.includes(orderId.slice(0, 8)));
      }),
    tryNext: "return the text parts of the task's artifacts as the result",
  },
] satisfies Rule[];
