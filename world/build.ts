// bun run world          build data/olist.db from the pinned Olist download
//                        (skips work already done)
// bun run world reset    throw away the database and the logs, then build them again from the cache
// bun run world status   print the row count of every table
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ColumnType, inferTypes, parseCsv } from "./csv";

export const ROOT = join(import.meta.dir, "..");
export const DB_PATH = join(ROOT, "data", "olist.db");
export const LOG_DIR = join(ROOT, "data", "logs");
const WORLD_JSON = join(ROOT, "data", "world.json");
const DOWNLOAD_CACHE = join(import.meta.dir, ".cache");

// One CSV file in source.toml. `rows` is the row count the table must have once it is loaded.
type FileSpec = { name: string; table: string; bytes: number; sha256: string; rows?: number };
type Source = {
  source: { base: string; commit: string; kaggle: string; licence: string };
  file: FileSpec[];
};
export const SOURCE = Bun.TOML.parse(
  readFileSync(join(import.meta.dir, "source.toml"), "utf8"),
) as Source;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// A cached copy is used only if its checksum matches; a damaged one is downloaded again.
function readFromCache(file: FileSpec, quiet: boolean): Uint8Array | null {
  const cachedPath = join(DOWNLOAD_CACHE, file.name);
  if (!existsSync(cachedPath)) return null;
  const bytes = new Uint8Array(readFileSync(cachedPath));
  if (sha256(bytes) === file.sha256) return bytes;
  if (!quiet) {
    console.log(`  ${file.name}: the cached copy does not match its checksum, downloading again`);
  }
  return null;
}

async function download(file: FileSpec, quiet: boolean): Promise<Uint8Array> {
  const url = `${SOURCE.source.base}/${file.name}`;
  const megabytes = (file.bytes / 1e6).toFixed(1);
  if (!quiet) console.log(`  downloading ${file.name} (${megabytes} MB)`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed for ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = sha256(bytes);
  if (checksum !== file.sha256) {
    throw new Error(`checksum mismatch for ${file.name}: expected ${file.sha256}, got ${checksum}`);
  }
  mkdirSync(DOWNLOAD_CACHE, { recursive: true });
  writeFileSync(join(DOWNLOAD_CACHE, file.name), bytes);
  return bytes;
}

async function fetchFile(file: FileSpec, quiet: boolean): Promise<Uint8Array> {
  return readFromCache(file, quiet) ?? (await download(file, quiet));
}

// An empty cell is stored as NULL; a number column stores the number, not the text.
function cellValue(text: string | undefined, type: ColumnType): string | number | null {
  if (text === undefined || text === "") return null;
  if (type === "TEXT") return text;
  return Number(text);
}

// Create the table for one CSV file and insert every row. Returns how many rows went in.
function loadTable(db: Database, file: FileSpec, bytes: Uint8Array): number {
  const rows = [...parseCsv(new TextDecoder().decode(bytes))];
  const header = rows.shift();
  if (!header) throw new Error(`${file.name} is empty`);
  const types = inferTypes(header, rows);
  const columns = header.map((name, j) => `"${name}" ${types[j]}`).join(", ");
  db.run(`CREATE TABLE "${file.table}" (${columns})`);
  const placeholders = header.map(() => "?").join(",");
  const insert = db.prepare(`INSERT INTO "${file.table}" VALUES (${placeholders})`);
  const insertAll = db.transaction(() => {
    for (const row of rows) {
      insert.run(...header.map((_, j) => cellValue(row[j], types[j])));
    }
  });
  insertAll();
  return rows.length;
}

export function counts(path = DB_PATH): Record<string, number> {
  const db = new Database(path, { readonly: true });
  const countsByTable: Record<string, number> = {};
  for (const file of SOURCE.file) {
    const counted = db.query(`SELECT COUNT(*) AS n FROM "${file.table}"`).get() as { n: number };
    countsByTable[file.table] = counted.n;
  }
  db.close();
  return countsByTable;
}

// Build into a file of its own first, so a half-built database is never at DB_PATH.
async function buildInto(path: string, quiet: boolean): Promise<void> {
  rmSync(path, { force: true });
  const db = new Database(path, { create: true });
  // Nothing else reads the file while it is built, so safety on a crash is not needed.
  db.run("PRAGMA journal_mode = OFF");
  db.run("PRAGMA synchronous = OFF");
  for (const file of SOURCE.file) {
    const rowCount = loadTable(db, file, await fetchFile(file, quiet));
    if (!quiet) console.log(`  loaded ${file.table}: ${rowCount} rows`);
  }
  db.close();
}

function writeWorldJson(): void {
  const world = { built: true, source: SOURCE.source.commit, counts: counts() };
  const worldJson = JSON.stringify(world, null, 2);
  writeFileSync(WORLD_JSON, `${worldJson}\n`);
}

// Build the database if it is missing. Checks call this so a fresh clone or CI needs no extra step.
export async function ensureWorld(quiet = true): Promise<string> {
  if (existsSync(DB_PATH)) return DB_PATH;
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const buildingPath = `${DB_PATH}.building-${process.pid}`;
  await buildInto(buildingPath, quiet);
  // Another process may have finished first; keep its database and drop this one.
  if (existsSync(DB_PATH)) rmSync(buildingPath, { force: true });
  else renameSync(buildingPath, DB_PATH);
  mkdirSync(LOG_DIR, { recursive: true });
  writeWorldJson();
  return DB_PATH;
}

// Prove the read-only open works: a DELETE must be refused.
function deleteIsRefused(): boolean {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    db.run("DELETE FROM sellers");
    return false;
  } catch {
    return true;
  } finally {
    db.close();
  }
}

function printStatus(): void {
  for (const [table, rowCount] of Object.entries(counts())) console.log(`${table} ${rowCount}`);
  if (deleteIsRefused()) console.log("Read-only open: ok, a DELETE was refused.");
  else console.log("Read-only open: FAILED, a DELETE went through.");
}

function reset(): void {
  rmSync(DB_PATH, { force: true });
  rmSync(LOG_DIR, { recursive: true, force: true });
  rmSync(WORLD_JSON, { force: true });
  console.log("Removed the database and the logs.");
}

async function build(): Promise<void> {
  const alreadyBuilt = existsSync(DB_PATH);
  if (!alreadyBuilt) {
    console.log(
      `Building data/olist.db from the pinned Olist download (${SOURCE.source.licence}).`,
    );
  }
  try {
    await ensureWorld(false);
  } catch (error) {
    console.log(`The world could not be built: ${(error as Error).message}`);
    console.log("Try next: check your network, then run bun run world reset.");
    process.exit(2);
  }
  if (alreadyBuilt) {
    console.log("data/olist.db already exists. Run bun run world reset to rebuild it.");
  }
}

if (import.meta.main) {
  const command = process.argv[2] ?? "build";
  if (command === "reset") reset();
  if (command === "build" || command === "reset") {
    await build();
  } else if (command !== "status") {
    const usage = "bun run world, bun run world reset, bun run world status";
    console.log(`Unknown command "${command}". Use: ${usage}.`);
    process.exit(1);
  }
  printStatus();
}
