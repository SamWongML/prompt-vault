/* ============================================================
   store.mjs — the durable vault. The browser used to keep every
   prompt in localStorage, which is capped at ~5 MB, scoped to the
   page's origin (so a port change orphaned it) and silently dropped
   writes once full. The canonical copy now lives here, in a single
   SQLite file on disk, served to the UI over /api/prompts.

   Why SQLite (node:sqlite, already a dependency — see ingest.mjs):
     • durable + portable: a real file you can back up, not browser state
     • origin/port independent: survives the 7331→7332 fallback
     • incremental writes: editing one prompt rewrites one row, not the
       whole vault (the localStorage blob was re-serialised every keypress)

   Search stays in the browser (src/search.js): node:sqlite ships without
   FTS5, and an in-memory scan over a personal vault is instant, so there's
   no reason to reach for it here.
   ============================================================ */
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { scan } from "./ingest.mjs";

/* Where the vault file lives — the OS "application data" dir, following the
   env-paths/XDG convention but inlined so the package stays dependency-free.
   Override with PROMPT_VAULT_DATA_DIR (used by tests, and handy for pinning a
   portable location). */
export function dataDir() {
  if (process.env.PROMPT_VAULT_DATA_DIR) return process.env.PROMPT_VAULT_DATA_DIR;
  const home = homedir();
  const name = "prompt-vault-nodejs";
  switch (platform()) {
    case "darwin": return join(home, "Library", "Application Support", name);
    case "win32": return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), name, "Data");
    default: return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), name);
  }
}

/* Content-stable fingerprint of a prompt. MUST stay byte-identical to
   window.pvHash in src/data.js: the browser sends the hashes of prompts it
   deleted (one-time migration of the old localStorage tombstones), and those
   only line up with hashes we compute here if the algorithm matches. cyrb53. */
export function pvHash(s) {
  s = String(s || "").trim().replace(/\s+/g, " ");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36);
}

const COLS = ["id", "hash", "title", "content", "tags", "source", "project",
  "createdAt", "lastUsed", "useCount", "pinned", "archived"];

// one vault entry → a positional row matching COLS. Timestamps stay full
// JS numbers (SQLite INTEGER is 64-bit; never bitwise-truncate them).
function toRow(p) {
  const now = Date.now();
  return [
    p.id, pvHash(p.content), p.title ?? "Untitled", p.content ?? "",
    JSON.stringify(p.tags || []), p.source || "manual", p.project ?? null,
    p.createdAt || now, p.lastUsed || now, p.useCount || 0,
    p.pinned ? 1 : 0, p.archived ? 1 : 0,
  ];
}

function fromRow(r) {
  return {
    id: r.id, title: r.title, content: r.content,
    tags: JSON.parse(r.tags || "[]"), source: r.source, project: r.project,
    createdAt: r.createdAt, lastUsed: r.lastUsed, useCount: r.useCount,
    pinned: !!r.pinned, archived: !!r.archived,
  };
}

let _db = null;
/* Open (and migrate) the database once, lazily. Throwing here is fine: the
   server turns it into a failed /api/prompts response, and the client falls
   back to its offline localStorage mode — degrade, don't crash. */
async function db() {
  if (_db) return _db;
  const { DatabaseSync } = await import("node:sqlite");
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const d = new DatabaseSync(join(dir, "vault.db"));
  d.exec("PRAGMA journal_mode = WAL"); // readers never block the single writer
  migrate(d);
  _db = d;
  return d;
}

// Schema versioning via PRAGMA user_version (SQLite's app-owned slot). Each
// future change is an `if (v < N)` block that ends by bumping the version.
function migrate(d) {
  const v = d.prepare("PRAGMA user_version").get().user_version;
  if (v < 1) {
    d.exec(`
      CREATE TABLE prompts (
        id TEXT PRIMARY KEY, hash TEXT, title TEXT, content TEXT, tags TEXT,
        source TEXT, project TEXT, createdAt INTEGER, lastUsed INTEGER,
        useCount INTEGER, pinned INTEGER, archived INTEGER
      );
      CREATE INDEX idx_prompts_hash ON prompts(hash);
      CREATE TABLE tombstones (hash TEXT PRIMARY KEY, deletedAt INTEGER);
      PRAGMA user_version = 1;
    `);
  }
}

function upsertMany(d, prompts) {
  if (!prompts || !prompts.length) return;
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO prompts (${COLS.join(",")}) VALUES (${COLS.map(() => "?").join(",")})`);
  d.exec("BEGIN");
  try { for (const p of prompts) stmt.run(...toRow(p)); d.exec("COMMIT"); }
  catch (e) { d.exec("ROLLBACK"); throw e; }
}

/* ---------- public API (all async: they await the lazy open) ---------- */

export async function getAll() {
  const d = await db();
  return d.prepare("SELECT * FROM prompts ORDER BY createdAt DESC").all().map(fromRow);
}

export async function upsert(prompts) {
  upsertMany(await db(), prompts);
}

export async function patchOne(id, p) {
  const d = await db();
  const sets = [], vals = [];
  for (const k of ["title", "content", "source", "project", "createdAt", "lastUsed", "useCount"]) {
    if (k in p) { sets.push(`${k}=?`); vals.push(p[k]); }
  }
  if ("pinned" in p) { sets.push("pinned=?"); vals.push(p.pinned ? 1 : 0); }
  if ("archived" in p) { sets.push("archived=?"); vals.push(p.archived ? 1 : 0); }
  if ("tags" in p) { sets.push("tags=?"); vals.push(JSON.stringify(p.tags || [])); }
  if ("content" in p) { sets.push("hash=?"); vals.push(pvHash(p.content)); } // keep dedup key in sync
  if (!sets.length) return;
  vals.push(id);
  d.prepare(`UPDATE prompts SET ${sets.join(",")} WHERE id=?`).run(...vals);
}

// hard-delete the row, but leave a tombstone (its content hash) behind so the
// next history scan can't re-import a prompt the user deliberately removed.
export async function removeOne(id) {
  const d = await db();
  const row = d.prepare("SELECT hash FROM prompts WHERE id=?").get(id);
  d.prepare("DELETE FROM prompts WHERE id=?").run(id);
  if (row && row.hash) {
    d.prepare("INSERT OR IGNORE INTO tombstones(hash, deletedAt) VALUES(?, ?)").run(row.hash, Date.now());
  }
}

/* Scan the CLI history and merge in only genuinely new prompts: skip anything
   already in the vault (by content hash) or tombstoned. Returns what was added
   so the client can prepend it without a full reload. */
export async function ingest(source) {
  const d = await db();
  const { prompts: scanned, notes } = await scan(source);
  const have = new Set(d.prepare("SELECT hash FROM prompts").all().map((r) => r.hash));
  const dead = new Set(d.prepare("SELECT hash FROM tombstones").all().map((r) => r.hash));
  const added = [];
  for (const p of scanned) {
    const h = pvHash(p.content);
    if (have.has(h) || dead.has(h)) continue;
    have.add(h); // also dedup within this batch
    added.push(p);
  }
  upsertMany(d, added);
  return { added, notes: notes || [] };
}

// one-time hand-off from the old browser store: only runs while the DB is still
// empty, so re-running it (or running it after the user has a real vault) is a
// no-op and can't clobber server data.
export async function importInitial(prompts, tombstoneHashes) {
  const d = await db();
  if (d.prepare("SELECT COUNT(*) AS c FROM prompts").get().c > 0) return { imported: 0, skipped: true };
  upsertMany(d, prompts || []);
  if (tombstoneHashes && tombstoneHashes.length) {
    const ins = d.prepare("INSERT OR IGNORE INTO tombstones(hash, deletedAt) VALUES(?, ?)");
    const now = Date.now();
    for (const h of tombstoneHashes) ins.run(h, now);
  }
  return { imported: (prompts || []).length };
}
