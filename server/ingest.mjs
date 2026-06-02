/* ============================================================
   ingest.mjs — pull genuine user prompts out of local agent
   histories on disk. This is the Node-side counterpart to the
   parsers that used to run in the browser; running here is what
   lets us read the real files directly (a page sandbox can't).

   Sources — override the parent directory via env:
     • Codex    : $CODEX_HOME or ~/.codex
                  → sessions/<date>/rollout-*.jsonl  (event_msg/user_message
                    lines, which skip the AGENTS.md/environment envelopes)
     • OpenCode : $OPENCODE_DATA_DIR or ~/.local/share/opencode
                  → opencode.db  (user `text` parts, read via node:sqlite)
   ============================================================ */
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";

let _id = 0;
const uid = () => `p_${Date.now().toString(36)}_${(_id++).toString(36)}`;

function deriveTitle(text) {
  const firstLine = text.split("\n").find((l) => l.trim().length) || text;
  let t = firstLine.trim().replace(/^[#>*\-\s]+/, "");
  if (t.length > 64) t = t.slice(0, 61).trimEnd() + "…";
  return t || "Imported prompt";
}

function guessTags(text) {
  const t = text.toLowerCase();
  const map = {
    git: /\b(commit|git|pull request|\bpr\b|diff|rebase|merge)\b/,
    sql: /\b(sql|select |query|postgres|database)\b/,
    refactor: /\b(refactor|clean ?up|simplify|rewrite)\b/,
    testing: /\b(test|jest|pytest|unit test|coverage)\b/,
    debug: /\b(debug|stack ?trace|error|exception|traceback|bug)\b/,
    review: /\b(review|audit|critique)\b/,
    docker: /\b(docker|dockerfile|container)\b/,
    regex: /\b(regex|regular expression|pattern)\b/,
    python: /\b(python|fastapi|flask|django)\b/,
    typescript: /\b(typescript|\bts\b|interface|type)\b/,
    frontend: /\b(react|tailwind|css|component|ui)\b/,
    security: /\b(security|vulnerab|auth|sanitize|injection)\b/,
    bash: /\b(bash|shell|one-liner|command line)\b/,
  };
  const out = [];
  for (const k in map) if (map[k].test(t)) out.push(k);
  return out.slice(0, 4);
}

// one extracted user prompt → a vault entry. Shape must match the client's
// mk() in src/data.js so these merge cleanly with manually-created prompts.
function mkUserPrompt(text, when, project, source) {
  const txt = String(text || "").trim();
  const t = when ? (typeof when === "number" ? when : Date.parse(when)) : Date.now();
  const at = t || Date.now();
  return {
    id: uid(),
    title: deriveTitle(txt),
    content: txt,
    tags: guessTags(txt),
    source,
    project: project || null,
    createdAt: at,
    lastUsed: at,
    useCount: 0,
    pinned: false,
    archived: false,
  };
}

/* ---------- Codex ---------- */
const codexDir = () => process.env.CODEX_HOME || join(homedir(), ".codex");

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Each rollout line is {timestamp,type,payload}; the event_msg/user_message
// events hold the clean text and skip the envelopes response_item turns carry.
function parseRollout(text, out, seen) {
  let cwd = null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (o.type === "session_meta") { cwd = (o.payload && o.payload.cwd) || cwd; continue; }
    if (o.type !== "event_msg" || !o.payload || o.payload.type !== "user_message") continue;
    const txt = String(o.payload.message || "").trim();
    if (txt.length < 8) continue;
    const key = txt.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mkUserPrompt(txt, o.timestamp, cwd, "codex"));
  }
}

export function scanCodex() {
  const root = join(codexDir(), "sessions");
  if (!existsSync(root)) return [];
  const out = [], seen = new Set();
  for (const f of walk(root)) {
    if (!f.endsWith(".jsonl") || !basename(f).startsWith("rollout-")) continue;
    let text;
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    parseRollout(text, out, seen);
  }
  out.sort((a, b) => b.createdAt - a.createdAt); // newest first
  return out;
}

/* ---------- OpenCode ---------- */
const opencodeDir = () => process.env.OPENCODE_DATA_DIR || join(homedir(), ".local", "share", "opencode");

// user prompts, newest first, with their project directory + timestamp
const OPENCODE_QUERY =
  "SELECT json_extract(p.data,'$.text') AS text, m.time_created AS time, s.directory AS dir " +
  "FROM part p " +
  "JOIN message m ON p.message_id = m.id " +
  "JOIN session s ON m.session_id = s.id " +
  "WHERE json_extract(m.data,'$.role') = 'user' AND json_extract(p.data,'$.type') = 'text' " +
  "ORDER BY m.time_created DESC";

// → { prompts: [...], note? }. OpenCode is the one source that needs node:sqlite;
// a `note` (instead of a thrown error) lets the rest of ingestion keep working when
// it can't load — see the version handling below.
export async function scanOpenCode() {
  const file = join(opencodeDir(), "opencode.db");
  if (!existsSync(file)) return { prompts: [] };
  // node:sqlite is built in on Node ≥ 22.5 (bin/ re-execs with --experimental-sqlite
  // when a flag is needed). Below that it doesn't exist at all — degrade to a clear
  // note rather than throwing, so Codex + manual ingestion stay usable. Imported
  // lazily so the engine (and its experimental warning) only load on an actual scan.
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch {
    return { prompts: [], note: `OpenCode ingestion needs Node ≥ 22.5 for built-in SQLite — you're on ${process.version}. Codex and manual prompts still work.` };
  }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(OPENCODE_QUERY).all();
    const out = [], seen = new Set();
    for (const r of rows) {
      const txt = String((r && r.text) || "").trim();
      if (txt.length < 8) continue;
      const key = txt.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mkUserPrompt(txt, r.time, r.dir, "opencode"));
    }
    return { prompts: out };
  } finally {
    db.close();
  }
}

// source: "codex" | "opencode" | "all" → { prompts: [...], notes: [...] }
export async function scan(source) {
  if (source === "codex") return { prompts: scanCodex(), notes: [] };
  if (source === "opencode") {
    const oc = await scanOpenCode();
    return { prompts: oc.prompts, notes: oc.note ? [oc.note] : [] };
  }
  const [codex, oc] = await Promise.all([
    Promise.resolve(scanCodex()),
    scanOpenCode(),
  ]);
  return { prompts: [...codex, ...oc.prompts], notes: oc.note ? [oc.note] : [] };
}
