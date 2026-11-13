// publish-the-card: your ops agent serves an A2A 1.0 Agent Card at the well-known address.
// The check starts your server, reads the card it serves and validates it against the
// schema pinned from the A2A 1.0 spec.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchJson,
  once,
  schemaProblems,
  startServer,
} from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

type Card = Record<string, unknown>;
type Skill = { id?: string; description?: string; examples?: string[] };
type AgentInterface = { protocolBinding?: string; protocolVersion?: string };

function cardFile(folder: string): Card {
  const path = join(folder, "agent-card.json");
  if (!existsSync(path)) throw new Error("agent-card.json is missing");
  return JSON.parse(readFileSync(path, "utf8"));
}

// Start the server once per folder, read the card, and stop the server.
function servedCard(folder: string): Promise<Card | null> {
  return once(`card:${folder}`, async () => {
    const server = await startServer(join(folder, "ops_agent.py"), ["serve"], {});
    try {
      return await fetchJson(`${server.url}/.well-known/agent-card.json`);
    } finally {
      server.stop();
    }
  });
}

async function servedSkills(folder: string): Promise<Skill[]> {
  const card = await servedCard(folder);
  return (card?.skills ?? []) as Skill[];
}

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export default [
  {
    says: "agent-card.json is valid JSON",
    test: (folder) => cardFile(folder) !== null,
    tryNext: "open agent-card.json and fix the JSON; a missing comma is the usual cause",
  },
  {
    says: "uv run ops_agent.py serve answers GET /.well-known/agent-card.json with the card",
    test: async (folder) => (await servedCard(folder)) !== null,
    tryNext: "run uv run ops_agent.py serve in this folder and open the card address in a browser",
  },
  {
    says: "the served card validates against the pinned A2A 1.0 schema",
    test: async (folder) => {
      const problems = await schemaProblems(await servedCard(folder));
      return problems.length === 0;
    },
    tryNext:
      "pipe the card into uv run parts/08-delegate-over-a2a/validate_card.py " +
      "and fix each path it prints",
  },
  {
    says: "one supported interface speaks JSONRPC at protocol version 1.0",
    test: async (folder) => {
      const card = await servedCard(folder);
      const interfaces = (card?.supportedInterfaces ?? []) as AgentInterface[];
      return interfaces.some(
        (candidate) =>
          candidate.protocolBinding === "JSONRPC" && candidate.protocolVersion === "1.0",
      );
    },
    tryNext:
      'add supportedInterfaces with protocolBinding "JSONRPC" and protocolVersion "1.0"; ' +
      "A2A 1.0 moved the url and the version there",
  },
  {
    says: "the card lists a skill, and every skill has an id, a description and examples",
    test: async (folder) => {
      const skills = await servedSkills(folder);
      const complete = (skill: Skill) =>
        hasText(skill.id) &&
        hasText(skill.description) &&
        Array.isArray(skill.examples) &&
        skill.examples.some(hasText);
      return skills.length > 0 && skills.every(complete);
    },
    tryNext: "give each skill an examples list with one real desk question in it",
  },
] satisfies Rule[];
