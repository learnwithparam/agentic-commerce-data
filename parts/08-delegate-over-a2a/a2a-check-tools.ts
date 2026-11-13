// Tools the delegate-over-a2a checks share: start the team agents, ask your ops agent,
// read the task logs, and verify an Agent Card signature with the public key.
// A check reads the logs the team agents write and the signatures on the wire,
// never your agent's prose.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PART_DIR = import.meta.dir;

// Real order ids from the data, each delivered more than ten days after its estimate.
export const HANDOFF_QUESTIONS = [
  "Why was order 9b189f6cf2ef734a7dd0419ed3c64d99 delivered late? Ask the carrier.",
  "Why were orders 61fcbde43b57103de5c19b26489b46f6 and efac22dd2be7399535968466224f162d late?",
  "Which carrier was late with order cf8ed2e1892b687d2ab983835459a604?",
];
export const ORDER_ID = /\b[0-9a-f]{32}\b/g;

// The first run of a uv script downloads its packages, so a server may take a while to start.
const START_LIMIT_MS = 120_000;
const ASK_LIMIT_MS = 120_000;

// Python writes no __pycache__ folders, so the part folder keeps only step folders.
const NO_CACHE_SETTING = "PYTHONDONTWRITEBYTECODE";
const PYTHON_SETTINGS = { [NO_CACHE_SETTING]: "1" };

export type RunningServer = { url: string; stop: () => void };

export function newTempFolder(): string {
  return mkdtempSync(join(tmpdir(), "a2a-check-"));
}

export function removeFolder(folder: string) {
  rmSync(folder, { recursive: true, force: true });
}

async function firstAddress(output: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let printed = "";
  for await (const chunk of output) {
    printed += decoder.decode(chunk);
    const address = printed.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (address) return address[0];
  }
  throw new Error(`the server stopped before it printed its address: ${printed.trim()}`);
}

function timeLimit(milliseconds: number, what: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${what} took too long`)), milliseconds).unref();
  });
}

// Start a Python script that serves HTTP and prints its address first. Port 0 picks a free port.
export async function startServer(
  script: string,
  options: string[],
  env: Record<string, string> = {},
): Promise<RunningServer> {
  const command = ["uv", "run", "--quiet", script, ...options, "--port", "0"];
  const server = Bun.spawn(command, {
    stdout: "pipe",
    // A server's own errors would bury the check's PASS and FAIL lines.
    stderr: "ignore",
    env: { ...process.env, ...PYTHON_SETTINGS, ...env },
  });
  const stop = () => server.kill();
  try {
    const url = await Promise.race([
      firstAddress(server.stdout),
      timeLimit(START_LIMIT_MS, script),
    ]);
    return { url, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

export function startTeamAgent(
  team: "logistics" | "pricing" | "impostor",
  logPath: string,
  options: string[] = [],
  env: Record<string, string> = {},
): Promise<RunningServer> {
  const script = join(PART_DIR, `${team}_agent.py`);
  return startServer(script, ["--log", logPath, ...options], env);
}

export type OpsRun = { answer: Record<string, unknown> | null; events: EventLine[] };
export type EventLine = { type: string; name?: string; value?: Record<string, unknown> };

function parseLines(output: string): Record<string, unknown>[] {
  const parsed: Record<string, unknown>[] = [];
  for (const line of output.trim().split("\n")) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // A line that is not JSON is ordinary print output; the check does not read it.
    }
  }
  return parsed;
}

// Ask the ops agent in a step folder one question, with every event printed first.
export async function askOps(
  folder: string,
  question: string,
  remote: string,
  env: Record<string, string> = {},
): Promise<OpsRun> {
  const script = join(folder, "ops_agent.py");
  const command = ["uv", "run", "--quiet", script, "ask", question, "--remote", remote];
  const opsProcess = Bun.spawn([...command, "--json", "--events"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...PYTHON_SETTINGS, ...env },
  });
  const output = await Promise.race([
    new Response(opsProcess.stdout).text(),
    timeLimit(ASK_LIMIT_MS, "your ops agent"),
  ]);
  await opsProcess.exited;
  const lines = parseLines(output);
  const answer = lines.pop() ?? null;
  return { answer, events: lines as EventLine[] };
}

// The team agents' log spells these two keys with underscores, so they keep that spelling here.
type KeysWithUnderscores = Record<"task_id", string> & Record<"order_ids", string[]>;
export type TaskLogEntry = KeysWithUnderscores & { state: string; method: string };

export function readTaskLog(logPath: string): TaskLogEntry[] {
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf8").trim().split("\n");
  return lines.filter(Boolean).map((line) => JSON.parse(line));
}

export async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

// Each check runs every rule on the same folder. The slow work runs once per folder.
const savedWork = new Map<string, Promise<unknown>>();

export function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  if (!savedWork.has(key)) savedWork.set(key, work());
  return savedWork.get(key) as Promise<T>;
}

// Canonical JSON for cards, close to RFC 8785: keys sorted at every level, no spaces.
// It matches card_signing.py for text, lists, objects, booleans and whole numbers.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export type CardSignature = { protected: string; signature: string };
export type SignatureHeader = { alg?: string; kid?: string; jku?: string };
export type PublicKeys = { keys?: (JsonWebKey & { kid?: string })[] };

export function headerOf(signature: CardSignature): SignatureHeader {
  const text = new TextDecoder().decode(fromBase64url(signature.protected));
  return JSON.parse(text);
}

function withoutSignatures(card: Record<string, unknown>): Record<string, unknown> {
  const { signatures: _signatures, ...unsigned } = card;
  return unsigned;
}

async function signatureVerifies(
  card: Record<string, unknown>,
  signature: CardSignature,
  publicKey: JsonWebKey,
): Promise<boolean> {
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const key = await crypto.subtle.importKey("jwk", publicKey, algorithm, false, ["verify"]);
  const payload = base64url(new TextEncoder().encode(canonicalJson(withoutSignatures(card))));
  const signingInput = new TextEncoder().encode(`${signature.protected}.${payload}`);
  const rawSignature = fromBase64url(signature.signature);
  const check = { name: "ECDSA", hash: "SHA-256" };
  return crypto.subtle.verify(check, key, rawSignature, signingInput);
}

// True when one ES256 signature on the card verifies with the key of the same kid in `keys`.
export async function cardSignatureVerifies(
  card: Record<string, unknown>,
  keys: PublicKeys,
): Promise<boolean> {
  const signatures = (card.signatures ?? []) as CardSignature[];
  for (const signature of signatures) {
    const header = headerOf(signature);
    const publicKey = keys.keys?.find((candidate) => candidate.kid === header.kid);
    if (!publicKey || header.alg !== "ES256") continue;
    const {
      kid: _kid,
      use: _use,
      alg: _alg,
      ...keyMaterial
    } = publicKey as JsonWebKey & {
      kid?: string;
      use?: string;
    };
    try {
      if (await signatureVerifies(card, signature, keyMaterial)) return true;
    } catch {
      // A key or signature that cannot even be read does not verify.
    }
  }
  return false;
}

// Validate a card with the pinned schema, through validate_card.py. Returns the problems found.
export async function schemaProblems(card: unknown): Promise<string[]> {
  const script = join(PART_DIR, "validate_card.py");
  const validator = Bun.spawn(["uv", "run", "--quiet", script], {
    stdin: new TextEncoder().encode(JSON.stringify(card)),
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(validator.stdout).text();
  const exitCode = await validator.exited;
  if (exitCode === 0) return [];
  return output.trim().split("\n");
}
