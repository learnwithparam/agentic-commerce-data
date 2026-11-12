// Read a learner's notes file.
// Checks take numbers and ids from it and test them against the database.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const notes = (folder: string, name: string) => {
  const path = join(folder, "notes", name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

// The number on a line that starts with `label:`, for example "Naive: 694 sellers".
// Commas are ignored.
export function numberAfter(text: string | null, label: string): number | null {
  const pattern = new RegExp(`^\\s*${label}:\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, "mi");
  const found = text?.match(pattern);
  if (!found) return null;
  return Number(found[1].replace(/,/g, ""));
}

// The rest of the line that starts with `label:`, without surrounding spaces.
export function lineAfter(text: string | null, label: string): string | null {
  const found = text?.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "mi"));
  if (!found) return null;
  return found[1].trim();
}
