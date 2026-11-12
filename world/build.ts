// bun run world          build data/olist.db from the pinned Olist download (skips work already done)
// bun run world reset    throw away the database and the logs, then build them again from the cache
// bun run world status   print the row count of every table
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inferTypes, parseCsv } from "./csv";

export const ROOT = join(import.meta.dir, "..");
export const DB_PATH = join(ROOT, "data", "olist.db");
export const LOG_DIR = join(ROOT, "data", "logs");
const CACHE = join(import.meta.dir, ".cache");

type FileSpec = { name: string; table: string; bytes: number; sha256: string };
type Source = {
  source: { base: string; commit: string; kaggle: string; licence: string };
  file: FileSpec[];
};
export const SOURCE = Bun.TOML.parse(
  readFileSync(join(import.meta.dir, "source.toml"), "utf8"),
) as Source;

const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

async function fetchFile(f: FileSpec, quiet: boolean): Promise<Uint8Array> {
  const local = join(CACHE, f.name);
  if (existsSync(local)) {
    const buf = new Uint8Array(readFileSync(local));
    if (sha256(buf) === f.sha256) return buf;
    if (!quiet)
      console.log(`  ${f.name}: the cached copy does not match its checksum, downloading again`);
  }
  const url = `${SOURCE.source.base}/${f.name}`;
  if (!quiet) console.log(`  downloading ${f.name} (${(f.bytes / 1e6).toFixed(1)} MB)`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed for ${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== f.sha256)
    throw new Error(`checksum mismatch for ${f.name}: expected ${f.sha256}, got ${got}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(local, buf);
  return buf;
}

function load(db: Database, f: FileSpec, buf: Uint8Array) {
  const rows = [...parseCsv(new TextDecoder().decode(buf))];
  const header = rows.shift()!;
  const types = inferTypes(header, rows);
  const cols = header.map((h, j) => `"${h}" ${types[j]}`).join(", ");
  db.run(`CREATE TABLE "${f.table}" (${cols})`);
  const ins = db.prepare(`INSERT INTO "${f.table}" VALUES (${header.map(() => "?").join(",")})`);
  const conv = (v: string | undefined, t: string) =>
    v === undefined || v === "" ? null : t === "TEXT" ? v : Number(v);
  db.transaction(() => {
    for (const r of rows) ins.run(...header.map((_, j) => conv(r[j], types[j])));
  })();
  return rows.length;
}

export function counts(path = DB_PATH): Record<string, number> {
  const db = new Database(path, { readonly: true });
  const out: Record<string, number> = {};
  for (const f of SOURCE.file)
    out[f.table] = (db.query(`SELECT COUNT(*) AS n FROM "${f.table}"`).get() as { n: number }).n;
  db.close();
  return out;
}

// Build the database if it is missing. Checks call this so a fresh clone or CI needs no extra step.
export async function ensureWorld(quiet = true): Promise<string> {
  if (existsSync(DB_PATH)) return DB_PATH;
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const tmp = `${DB_PATH}.building-${process.pid}`;
  rmSync(tmp, { force: true });
  const db = new Database(tmp, { create: true });
  db.run("PRAGMA journal_mode = OFF");
  db.run("PRAGMA synchronous = OFF");
  for (const f of SOURCE.file) {
    const n = load(db, f, await fetchFile(f, quiet));
    if (!quiet) console.log(`  loaded ${f.table}: ${n} rows`);
  }
  db.close();
  if (!existsSync(DB_PATH)) renameSync(tmp, DB_PATH);
  else rmSync(tmp, { force: true });
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(
    join(ROOT, "data", "world.json"),
    JSON.stringify({ built: true, source: SOURCE.source.commit, counts: counts() }, null, 2) + "\n",
  );
  return DB_PATH;
}

function readOnlyProbe(): boolean {
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

function printStatus() {
  const c = counts();
  for (const [t, n] of Object.entries(c)) console.log(`${t} ${n}`);
  console.log(
    readOnlyProbe()
      ? "Read-only open: ok, a DELETE was refused."
      : "Read-only open: FAILED, a DELETE went through.",
  );
}

if (import.meta.main) {
  const cmd = process.argv[2] ?? "build";
  if (cmd === "reset") {
    rmSync(DB_PATH, { force: true });
    rmSync(LOG_DIR, { recursive: true, force: true });
    rmSync(join(ROOT, "data", "world.json"), { force: true });
    console.log("Removed the database and the logs.");
  }
  if (cmd === "build" || cmd === "reset") {
    const had = existsSync(DB_PATH);
    if (!had)
      console.log(
        `Building data/olist.db from the pinned Olist download (${SOURCE.source.licence}).`,
      );
    try {
      await ensureWorld(false);
    } catch (e) {
      console.log(`The world could not be built: ${(e as Error).message}`);
      console.log("Try next: check your network, then run bun run world reset.");
      process.exit(2);
    }
    if (had) console.log("data/olist.db already exists. Run bun run world reset to rebuild it.");
  } else if (cmd !== "status") {
    console.log(
      `Unknown command "${cmd}". Use: bun run world, bun run world reset, bun run world status.`,
    );
    process.exit(1);
  }
  printStatus();
}
