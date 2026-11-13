// stream-the-events: POST /ask streams AG-UI events over Server-Sent Events.
// The check starts server.py with the database slowed to 3 seconds, asks one question,
// records when each event arrives, and reads the order of the events. Then it stops the server.
import { stepCommand, stepEnvironment } from "../parts/06-answer-with-ui/kit";
import { ROOT } from "../scripts/structure";
import type { Rule } from "../scripts/verify";

const QUESTION = "Which 5 customer states placed the most orders?";
const SLOW_SECONDS = "3";
const FIRST_EVENT_LIMIT_MS = 2000;
// The database takes 3 seconds, so a call that ends after the work ends well after the start.
const CALL_END_AFTER_MS = 2000;
const START_WAIT_MS = 15000;

type Event = Record<string, unknown> & { type: string };
type Stream = {
  contentType: string;
  events: Event[];
  firstEventMs: number;
  arrivals: number[];
};

const sleep = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

async function waitUntilListening(port: number): Promise<boolean> {
  const giveUpAt = Date.now() + START_WAIT_MS;
  while (Date.now() < giveUpAt) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return true;
    } catch {
      await sleep(200);
    }
  }
  return false;
}

function eventsIn(text: string): Event[] {
  const blocks = text.split("\n\n");
  const dataLines = blocks.map((block) =>
    block.split("\n").find((line) => line.startsWith("data:")),
  );
  const found = dataLines.filter((line): line is string => line !== undefined);
  return found.map((line) => JSON.parse(line.slice(5)));
}

async function readStream(port: number): Promise<Stream> {
  const startedAt = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/ask`, {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Accept", "text/event-stream"],
    ]),
    body: JSON.stringify({ question: QUESTION }),
  });
  let firstEventMs = Number.POSITIVE_INFINITY;
  let text = "";
  const arrivals: number[] = [];
  const decoder = new TextDecoder();
  for await (const chunk of response.body ?? []) {
    text += decoder.decode(chunk, { stream: true });
    // Note when each new event arrives.
    const seen = eventsIn(text.slice(0, text.lastIndexOf("\n\n") + 2)).length;
    while (arrivals.length < seen) arrivals.push(performance.now() - startedAt);
    if (text.includes("data:") && firstEventMs === Number.POSITIVE_INFINITY) {
      firstEventMs = performance.now() - startedAt;
    }
  }
  const contentType = response.headers.get("content-type") ?? "";
  return { contentType, events: eventsIn(text), firstEventMs, arrivals };
}

async function askTheServer(folder: string): Promise<Stream> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = stepEnvironment();
  env.DESK_SLOW_SECONDS = SLOW_SECONDS;
  const command = [...stepCommand("stream-the-events", folder), "--port", String(port)];
  const server = Bun.spawn(command, { cwd: ROOT, env, stdout: "ignore", stderr: "ignore" });
  try {
    if (!(await waitUntilListening(port))) throw new Error("server.py did not start");
    return await readStream(port);
  } finally {
    server.kill();
    await server.exited;
  }
}

const savedStreams = new Map<string, Promise<Stream>>();

function streamFor(folder: string): Promise<Stream> {
  const saved = savedStreams.get(folder);
  if (saved) return saved;
  const stream = askTheServer(folder);
  savedStreams.set(folder, stream);
  return stream;
}

const typesOf = (events: Event[]) => events.map((event) => event.type);

function toolCallsInOrder(events: Event[]): boolean {
  const order = ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"];
  const toolEvents = events.filter((event) => order.includes(event.type));
  if (toolEvents.length < order.length) return false;
  const callId = toolEvents[0].toolCallId;
  const sameCall = toolEvents.every((event) => event.toolCallId === callId);
  const positions = order.map((type) => typesOf(toolEvents).indexOf(type));
  const ascending = positions.every((position, i) => i === 0 || position > positions[i - 1]);
  return sameCall && ascending && positions[0] === 0;
}

function surfaceBeforeTheEnd(events: Event[]): boolean {
  const types = typesOf(events);
  const surfaceAt = events.findIndex(
    (event) => event.type === "ACTIVITY_SNAPSHOT" && event.activityType === "a2ui-surface",
  );
  if (surfaceAt < 0) return false;
  // AG-UI spells a2ui_operations with an underscore, so it keeps that spelling here.
  type Content = Partial<Record<"a2ui_operations", Record<string, unknown>[]>>;
  const content = events[surfaceAt].content as Content;
  const firstOperation = content?.a2ui_operations?.[0];
  return Boolean(firstOperation?.createSurface) && surfaceAt < types.indexOf("RUN_FINISHED");
}

export default [
  {
    says: "POST /ask with Accept: text/event-stream answers as an event stream",
    test: async (folder) => {
      const stream = await streamFor(folder);
      return stream.contentType.startsWith("text/event-stream") && stream.events.length > 0;
    },
    tryNext:
      "run the server with kit.py stream-the-events and look at the error it prints; " +
      'every event is written as "data: {...}" and a blank line',
  },
  {
    says: "the run starts with RUN_STARTED and ends with RUN_FINISHED for the same run",
    test: async (folder) => {
      const { events } = await streamFor(folder);
      const first = events[0];
      const last = events[events.length - 1];
      if (first?.type !== "RUN_STARTED" || last?.type !== "RUN_FINISHED") return false;
      return first.runId === last.runId && first.threadId === last.threadId && Boolean(first.runId);
    },
    tryNext: "yield RUN_STARTED first and RUN_FINISHED last, both with the same threadId and runId",
  },
  {
    says: "one tool call is sent in order: start, arguments, end, then its result",
    test: async (folder) => toolCallsInOrder((await streamFor(folder)).events),
    tryNext: "send TOOL_CALL_START, ARGS, END and RESULT in that order, all for one call",
  },
  {
    says: "the tool call ends only after the work is done",
    test: async (folder) => {
      const { events, arrivals } = await streamFor(folder);
      const startAt = events.findIndex((event) => event.type === "TOOL_CALL_START");
      const endAt = events.findIndex((event) => event.type === "TOOL_CALL_END");
      if (startAt < 0 || endAt < 0) return false;
      return arrivals[endAt] - arrivals[startAt] >= CALL_END_AFTER_MS;
    },
    tryNext:
      "send TOOL_CALL_START and TOOL_CALL_ARGS before kit.finished_answer, " +
      "and TOOL_CALL_END after it, so the call stays open while the work runs",
  },
  {
    says: "the A2UI surface arrives in an a2ui-surface activity before RUN_FINISHED",
    test: async (folder) => surfaceBeforeTheEnd((await streamFor(folder)).events),
    tryNext: 'send the ACTIVITY_SNAPSHOT with "activityType": "a2ui-surface" before RUN_FINISHED',
  },
  {
    says: "the first event arrives within 2 seconds, while the database takes 3",
    test: async (folder) => (await streamFor(folder)).firstEventMs <= FIRST_EVENT_LIMIT_MS,
    tryNext: "yield RUN_STARTED before you call kit.finished_answer, and flush after every event",
  },
] satisfies Rule[];
