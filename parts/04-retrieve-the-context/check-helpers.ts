// Helpers the retrieve-the-context checks share: run a learner's Python file the way a learner
// would, in replay mode, and read the JSON it prints.
import { existsSync } from "node:fs";
import { ROOT } from "../../world/build";

export type PythonRun = { output: string; exitCode: number };

type RunOptions = { input?: string; extraEnvironment?: Record<string, string> };

export function runPython(
  file: string,
  commandArguments: string[],
  options: RunOptions = {},
): PythonRun {
  if (!existsSync(file)) return { output: "", exitCode: 2 };
  const environment = { ...process.env, ...options.extraEnvironment };
  environment.LLM_PROVIDER = "replay";
  const command = ["uv", "run", "--quiet", "python", file, ...commandArguments];
  const finished = Bun.spawnSync(command, {
    cwd: ROOT,
    env: environment,
    stdin: options.input === undefined ? "ignore" : Buffer.from(options.input),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { output: new TextDecoder().decode(finished.stdout), exitCode: finished.exitCode };
}

// The last line a run printed, read as JSON, or null when it is not JSON.
export function jsonOutput(run: PythonRun): unknown {
  const lines = run.output.trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}
