// stream-the-task: the hand-off streams, so a slow task finishes and an error reaches the user.
// The check slows the logistics agent to 70 seconds behind a gateway that closes a quiet request
// after 60 seconds, then makes the carrier system fail. The clock runs 20 times faster here.
import { join } from "node:path";
import {
  askOps,
  type EventLine,
  HANDOFF_QUESTIONS,
  newTempFolder,
  type OpsRun,
  once,
  readTaskLog,
  removeFolder,
  startTeamAgent,
  type TaskLogEntry,
} from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

// The team agents read their clock speed from this setting.
const CLOCK_SPEED_SETTING = "A2A_CLOCK_SPEED";
const FAST_CLOCK = { [CLOCK_SPEED_SETTING]: "20" };
const QUESTION = HANDOFF_QUESTIONS[0];

type Trial = { run: OpsRun; log: TaskLogEntry[] };

async function trial(folder: string, options: string[]): Promise<Trial> {
  const logFolder = newTempFolder();
  const logPath = join(logFolder, "logistics-tasks.jsonl");
  const logistics = await startTeamAgent("logistics", logPath, options, FAST_CLOCK);
  try {
    const run = await askOps(folder, QUESTION, logistics.url);
    return { run, log: readTaskLog(logPath) };
  } finally {
    logistics.stop();
    removeFolder(logFolder);
  }
}

const slowTrial = (folder: string) => once(`slow:${folder}`, () => trial(folder, ["--slow", "70"]));
const failingTrial = (folder: string) => once(`fail:${folder}`, () => trial(folder, ["--fail"]));

function handoffState(run: OpsRun): unknown {
  const handoff = (run.answer?.handoff ?? {}) as { state?: string };
  return handoff.state;
}

function taskUpdates(events: EventLine[]): EventLine[] {
  return events.filter((event) => event.type === "CUSTOM" && event.name === "a2a.task_update");
}

export default [
  {
    says: "with the logistics agent slowed to 70 seconds, the answer still completes",
    test: async (folder) => {
      const { run } = await slowTrial(folder);
      return handoffState(run) === "TASK_STATE_COMPLETED" && !run.answer?.error;
    },
    tryNext: "a send that waits for the whole answer hits the 60-second gateway; stream instead",
  },
  {
    says: "the logistics agent's log shows the task came in through SendStreamingMessage",
    test: async (folder) => {
      const { log } = await slowTrial(folder);
      return log.length > 0 && log.every((entry) => entry.method === "SendStreamingMessage");
    },
    tryNext: 'call the method "SendStreamingMessage" and read the reply as server-sent events',
  },
  {
    says: "task updates reach the user while the task runs",
    test: async (folder) => {
      const { run } = await slowTrial(folder);
      const working = taskUpdates(run.events).filter(
        (event) => event.value?.state === "TASK_STATE_WORKING",
      );
      return working.length >= 2;
    },
    tryNext: "pass each status update to on_update, which prints an a2a.task_update event",
  },
  {
    says: "when the carrier system fails, the user sees an error, not silence",
    test: async (folder) => {
      const { run } = await failingTrial(folder);
      const errorEvent = run.events.some((event) => event.type === "RUN_ERROR");
      return Boolean(run.answer?.error) && errorEvent;
    },
    tryNext: "a task that ends TASK_STATE_FAILED must set the answer's error, never an answer",
  },
] satisfies Rule[];
