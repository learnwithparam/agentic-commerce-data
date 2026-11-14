// do-it-on-yours: runs the capstone rules on the learner's folder.
// It adds one rule only the course can state: the database is not the course database.
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { rules } from "../capstone/rules";
import type { Rule } from "../scripts/verify";
import { DB_PATH } from "../world/build";

function ownFile(folder: string): boolean {
  try {
    const given = Bun.TOML.parse(readFileSync(`${folder}/capstone.toml`, "utf8")) as {
      path?: string;
    };
    return realpathSync(resolve(folder, given.path ?? "")) !== realpathSync(DB_PATH);
  } catch {
    return false;
  }
}

export default [
  ...rules.map((rule) => ({ says: rule.says, test: rule.test, tryNext: rule.tryNext })),
  {
    says: "the database is your own file, not the course database",
    test: ownFile,
    tryNext: "point path in capstone.toml at your own .db file",
  },
] satisfies Rule[];
