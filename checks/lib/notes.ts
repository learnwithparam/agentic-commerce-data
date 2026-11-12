// Read a learner's notes file. Checks take numbers and ids from it and test them against the database.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const notes = (dir: string, name: string) => {
  const p = join(dir, "notes", name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

// The number on a line that starts with `label:`, for example "Naive: 694 sellers". Commas are ignored.
export function numberAfter(text: string | null, label: string): number | null {
  const m = text?.match(new RegExp(`^\\s*${label}:\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, "mi"));
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function lineAfter(text: string | null, label: string): string | null {
  const m = text?.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "mi"));
  return m ? m[1].trim() : null;
}
