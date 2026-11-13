// Builds the pages the text audit visits, then serves them: bun e2e/serve.ts <port>
// Every page comes from the real program, with the replay recordings, so no network is needed.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../scripts/structure";

const PAGES = join(ROOT, "data", "audit");
const QUESTION = "Which Sao Paulo sellers had the most late deliveries in 2018?";
const PAUSE_QUESTION = "Pause seller ea8482cd, too many late deliveries in 2018";
const scratch = mkdtempSync(join(tmpdir(), "audit-"));
const env = {
  ...process.env,
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  LLM_PROVIDER: "replay",
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  PYTHONDONTWRITEBYTECODE: "1",
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  DESK_STATE_DIR: join(scratch, "pending"),
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  SELLER_API_LOG: join(scratch, "seller_api.jsonl"),
};

function run(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: ROOT, env });
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")}\n${result.stderr}`);
}

function kit(part: string, ...rest: string[]) {
  run(["uv", "run", "--quiet", "python", join("parts", part, "kit.py"), ...rest]);
}

mkdirSync(PAGES, { recursive: true });
const page = (name: string) => join(PAGES, `${name}.html`);

// The provided renderer: waiting for a question, and drawing a finished answer.
const python = (code: string) => run(["uv", "run", "--quiet", "python", "-c", code]);
const part6 =
  'import sys; sys.path.insert(0, "parts/06-answer-with-ui"); import kit, json, pathlib';
python(`${part6}; pathlib.Path("${page("renderer-waiting")}").write_text(kit.renderer_page())`);
kit(
  "06-answer-with-ui",
  "render-the-answer",
  "--folder",
  "solution",
  QUESTION,
  "--html",
  page("renderer-answer"),
);

// A fixture with a component the catalog does not have, and one id that never arrived.
const unknown = [
  { version: "1.0", createSurface: { surfaceId: "answer", catalogId: "x", dataModel: {} } },
  {
    version: "1.0",
    updateComponents: {
      surfaceId: "answer",
      components: [
        { id: "root", component: "Column", children: ["gauge", "absent"] },
        { id: "gauge", component: "Gauge" },
      ],
    },
  },
];
const fixture = join(scratch, "unknown.json");
writeFileSync(fixture, JSON.stringify(unknown));
python(
  `${part6}; messages = json.loads(pathlib.Path("${fixture}").read_text()); ` +
    `pathlib.Path("${page("renderer-unknown")}").write_text(kit.renderer_page(messages))`,
);

// The approval form, from the sample solution.
const askArguments = ["--folder", "solution", "ask", PAUSE_QUESTION, "--user", "cm-ana"];
kit("07-approve-the-write", "ask-before-pausing", ...askArguments, "--html", page("approval-form"));

// The finished desk: an answer, and a refusal.
run(["uv", "run", "--quiet", "ask-finished", QUESTION, "--html", page("desk-answer")]);
run([
  "uv",
  "run",
  "--quiet",
  "ask-finished",
  "Delete the test orders",
  "--html",
  page("desk-refusal"),
]);

const port = Number(process.argv[2] ?? 3000);
Bun.serve({
  port,
  fetch(request) {
    const name = new URL(request.url).pathname.replace(/^\//, "");
    if (!name) return new Response("Audit pages are ready.");
    try {
      const html = readFileSync(page(name.replace(/\.html$/, "")), "utf8");
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});
console.log(`audit pages on http://localhost:${port}`);
