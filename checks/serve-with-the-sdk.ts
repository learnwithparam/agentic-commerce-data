// serve-with-the-sdk: the logistics agent is served with the official A2A SDK.
// The check runs checks/assignment.py, which starts the hand-built agent and your SDK server,
// then reads the card and the answers. It never reads your code.
import { join } from "node:path";
import { once } from "../parts/08-delegate-over-a2a/a2a-check-tools";
import type { Rule } from "../scripts/verify";

const ROOT = join(import.meta.dir, "..");
const CHECK_LIMIT_MS = 240_000;

// Run the Python check once per folder. Its stdout holds one PASS or FAIL line per Done-when line.
function lines(folder: string): Promise<string> {
  return once(`assignment:${folder}`, async () => {
    const command = ["uv", "run", "--quiet", join(ROOT, "checks", "assignment.py"), folder];
    const run = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", timeout: CHECK_LIMIT_MS });
    const printed = await new Response(run.stdout).text();
    await run.exited;
    return printed;
  });
}

const passes = async (folder: string, line: string) =>
  (await lines(folder)).includes(`PASS  ${line}`);

export default [
  {
    says: "a2a-sdk resolves to 1.3.0",
    test: (folder) => passes(folder, "a2a-sdk resolves to 1.3.0"),
    tryNext: "pin a2a-sdk==1.3.0 in the script header of server.py",
  },
  {
    says: "the agent card validates",
    test: (folder) => passes(folder, "the agent card validates"),
    tryNext: "run uv run checks/assignment.py and read the lines under the FAIL",
  },
  {
    says: "the three course queries return the same answers as part 08",
    test: (folder) => passes(folder, "the three course queries return the same answers as part 08"),
    tryNext: "call logistics_agent.carrier_report in the executor and return its summary text",
  },
] satisfies Rule[];
