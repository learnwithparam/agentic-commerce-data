// sign-the-card: your Agent Card carries a JWS signature (ES256) over its canonical JSON,
// and /.well-known/jwks.json serves the public key. The check verifies the signature itself,
// with the key your server publishes, then changes one byte and expects it to fail.
import { join } from "node:path";
import {
  type CardSignature,
  cardSignatureVerifies,
  fetchJson,
  headerOf,
  newTempFolder,
  once,
  type PublicKeys,
  removeFolder,
  schemaProblems,
  startServer,
} from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

// Your ops agent reads the path of its private key from this setting.
const KEY_FILE_SETTING = "OPS_KEY_FILE";

type Card = Record<string, unknown>;
type Published = { card: Card | null; keys: PublicKeys | null };

function published(folder: string): Promise<Published> {
  return once(`signed:${folder}`, async () => {
    const keyFolder = newTempFolder();
    const env = { [KEY_FILE_SETTING]: join(keyFolder, "ops-desk-key.pem") };
    const server = await startServer(join(folder, "ops_agent.py"), ["serve"], env);
    try {
      const card = await fetchJson(`${server.url}/.well-known/agent-card.json`);
      const keys = (await fetchJson(`${server.url}/.well-known/jwks.json`)) as PublicKeys | null;
      return { card, keys };
    } finally {
      server.stop();
      removeFolder(keyFolder);
    }
  });
}

function firstSignature(card: Card | null): CardSignature | undefined {
  const signatures = (card?.signatures ?? []) as CardSignature[];
  return signatures[0];
}

function withOneByteChanged(card: Card): Card {
  const changed = JSON.parse(JSON.stringify(card));
  const description = String(changed.description);
  const lastLetter = description.at(-1) === "." ? "!" : ".";
  changed.description = description.slice(0, -1) + lastLetter;
  return changed;
}

export default [
  {
    says: "the served card has a signature whose header says ES256 and names a kid",
    test: async (folder) => {
      const signature = firstSignature((await published(folder)).card);
      if (!signature) return false;
      const header = headerOf(signature);
      return header.alg === "ES256" && Boolean(header.kid);
    },
    tryNext: 'write signed_card in card_signing.py with the header {"alg": "ES256", "kid": ...}',
  },
  {
    says: "/.well-known/jwks.json serves a public key with that kid",
    test: async (folder) => {
      const { card, keys } = await published(folder);
      const signature = firstSignature(card);
      if (!signature || !keys) return false;
      const kid = headerOf(signature).kid;
      return (keys.keys ?? []).some((key) => key.kid === kid);
    },
    tryNext:
      "the starter already serves jwks.json, so first make the card carry a signature; " +
      "then check that its kid is KEY_ID, the kid public_jwk(private_key, KEY_ID) serves",
  },
  {
    says: "the signature verifies over the card's canonical JSON with that public key",
    test: async (folder) => {
      const { card, keys } = await published(folder);
      if (!card || !keys) return false;
      return cardSignatureVerifies(card, keys);
    },
    tryNext:
      "sign the canonical JSON (sorted keys, no spaces) and send r and s as 64 raw bytes, " +
      "not DER",
  },
  {
    says: "changing one byte of the card makes the signature fail",
    test: async (folder) => {
      const { card, keys } = await published(folder);
      if (!card || !keys) return false;
      // A card with no valid signature to start with proves nothing here.
      if (!(await cardSignatureVerifies(card, keys))) return false;
      const stillVerifies = await cardSignatureVerifies(withOneByteChanged(card), keys);
      return !stillVerifies;
    },
    tryNext: "sign the whole card except the signatures field, not only its name",
  },
  {
    says: "the signed card still validates against the A2A 1.0 schema",
    test: async (folder) => {
      const { card } = await published(folder);
      return card !== null && (await schemaProblems(card)).length === 0;
    },
    tryNext: "each signature holds only protected and signature; keep every other field as it was",
  },
] satisfies Rule[];
