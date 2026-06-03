/* ============================================================
   server.mjs — the tiny local server behind the CLI. Serves the
   built single-file UI and exposes one endpoint that reads your
   Codex/OpenCode history off disk. Dependency-free (node: only).

   Routes:
     GET    /                       → the app (built "Prompt Vault.html")
     GET    /api/prompts            → { prompts: [...] }  (the durable vault)
     POST   /api/prompts            → upsert { prompts: [...] }  (create/duplicate)
     PATCH  /api/prompts/:id        → patch one prompt   (edit/pin/archive/use)
     DELETE /api/prompts/:id        → delete + tombstone one prompt
     POST   /api/ingest?source=all  → scan history, merge new → { added, notes }
     POST   /api/import             → one-time { prompts, tombstones } migration
     GET    /api/scan?source=codex  → { prompts: [...] }  (raw history, read-only)
   ============================================================ */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scan } from "./ingest.mjs";
import * as store from "./store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "prompt-vault", "Prompt Vault.html");

// The placeholder the build leaves in the HTML; we swap it for the live vault so
// the page renders real data on first paint instead of fetching it after mount.
const BOOTSTRAP_SENTINEL = "/*PV_BOOTSTRAP*/";

// Serialize the bootstrap payload for embedding in a <script> tag. Escaping `<`
// is what stops a prompt containing "</script>" from breaking out of the tag (the
// well-known XSS/injection guard React, Next.js et al. apply to inlined state).
function embedJson(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

// preferred port, then a small range — first free one wins (no config needed)
const PORT_RANGE = Array.from({ length: 20 }, (_, i) => 7331 + i);

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, "application/json", JSON.stringify(obj));

// read + parse a JSON request body, with a sane cap so a runaway upload can't
// balloon memory (the migration POST can legitimately carry the whole vault).
function readJson(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 64 * 1024 * 1024) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;
  const method = req.method;
  try {
    // the durable vault — single prompt addressed as /api/prompts/:id
    const one = pathname.match(/^\/api\/prompts\/(.+)$/);
    if (one) {
      const id = decodeURIComponent(one[1]);
      if (method === "PATCH") { await store.patchOne(id, await readJson(req)); return json(res, 200, { ok: true }); }
      if (method === "DELETE") { await store.removeOne(id); return json(res, 200, { ok: true }); }
      return send(res, 405, "text/plain", "Method not allowed");
    }
    if (pathname === "/api/prompts") {
      if (method === "GET") return json(res, 200, { prompts: await store.getAll(), dataDir: store.dataDir() });
      if (method === "POST") { await store.upsert((await readJson(req)).prompts || []); return json(res, 200, { ok: true }); }
      return send(res, 405, "text/plain", "Method not allowed");
    }
    if (pathname === "/api/ingest" && method === "POST") {
      return json(res, 200, await store.ingest(url.searchParams.get("source") || "all"));
    }
    if (pathname === "/api/import" && method === "POST") {
      const { prompts, tombstones } = await readJson(req);
      return json(res, 200, await store.importInitial(prompts || [], tombstones || []));
    }
    if (pathname === "/api/scan") {
      return json(res, 200, await scan(url.searchParams.get("source") || "all"));
    }
    if (pathname === "/" || pathname === "/index.html") {
      // Inline the live vault into the page so it paints with real data and skips
      // the /api/prompts round-trip. Mirrors the GET /api/prompts shape so the
      // client's boot path is identical whether it reads the bootstrap or fetches.
      // Function replacement (not a string) keeps `$` in prompt text literal.
      const html = await readFile(HTML, "utf8");
      const payload = embedJson({ prompts: await store.getAll(), dataDir: store.dataDir() });
      return send(res, 200, "text/html; charset=utf-8", html.replace(BOOTSTRAP_SENTINEL, () => payload));
    }
    send(res, 404, "text/plain", "Not found");
  } catch (err) {
    send(res, 500, "text/plain", String((err && err.message) || err));
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.removeListener("listening", onListening); reject(err); };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(`http://localhost:${server.address().port}`);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

export async function startServer({ port } = {}) {
  const server = createServer(handle);
  const candidates = port ? [Number(port)] : PORT_RANGE;
  for (const p of candidates) {
    try {
      const url = await listen(server, p);
      return { server, url };
    } catch (err) {
      if (err.code === "EADDRINUSE" && !port) continue; // try the next port
      throw err;
    }
  }
  throw new Error(`No free port in ${PORT_RANGE[0]}–${PORT_RANGE[PORT_RANGE.length - 1]}. Pass --port.`);
}
