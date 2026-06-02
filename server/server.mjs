/* ============================================================
   server.mjs — the tiny local server behind the CLI. Serves the
   built single-file UI and exposes one endpoint that reads your
   Codex/OpenCode history off disk. Dependency-free (node: only).

   Routes:
     GET /                         → the app (built "Prompt Vault.html")
     GET /api/scan?source=codex    → { prompts: [...] }  (codex|opencode|all)
   ============================================================ */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scan } from "./ingest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "prompt-vault", "Prompt Vault.html");

// preferred port, then a small range — first free one wins (no config needed)
const PORT_RANGE = Array.from({ length: 20 }, (_, i) => 7331 + i);

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/scan") {
      const data = await scan(url.searchParams.get("source") || "all");
      return send(res, 200, "application/json", JSON.stringify(data));
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, "text/html; charset=utf-8", await readFile(HTML, "utf8"));
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
