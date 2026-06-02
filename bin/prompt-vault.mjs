#!/usr/bin/env node
/* ============================================================
   prompt-vault — start the local server and open the app.

   Usage:
     prompt-vault                 # start + open the browser
     prompt-vault --port 8080     # pin a port
     prompt-vault --no-open       # start only (don't open a browser)
   ============================================================ */

// node:sqlite is still flagged experimental, so it prints a warning the first
// time it loads. We depend on it deliberately — filter just that one line so a
// launch stays quiet. (Set before the server imports anything SQLite-related.)
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (name === "warning" && data && data.name === "ExperimentalWarning" && /SQLite/.test(data.message)) return false;
  return _emit.call(this, name, data, ...rest);
};

import { spawn, spawnSync } from "node:child_process";
import { startServer } from "../server/server.mjs";

// node:sqlite powers OpenCode ingestion. On some Node versions it's gated behind
// --experimental-sqlite, and whether the flag is required (or even still accepted)
// varies by version — so we probe instead of guessing: if SQLite won't load as-is
// but loads with the flag, re-exec once with it. PV_SQLITE_REEXEC guards the loop.
// (On Node < 22.5 it loads with neither; ingest.mjs then degrades with a note.)
if (!process.env.PV_SQLITE_REEXEC) {
  const loads = (flags) =>
    spawnSync(process.execPath, [...flags, "-e", "require('node:sqlite')"], { stdio: "ignore" }).status === 0;
  if (!loads([]) && loads(["--experimental-sqlite"])) {
    const r = spawnSync(process.execPath, ["--experimental-sqlite", ...process.argv.slice(1)],
      { stdio: "inherit", env: { ...process.env, PV_SQLITE_REEXEC: "1" } });
    process.exit(r.status ?? 0);
  }
}

const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? args[portIdx + 1] : undefined;

const { url } = await startServer({ port });
console.log(`\n  Prompt Vault → ${url}\n  Ctrl-C to stop.\n`);
if (!noOpen) openBrowser(url);

function openBrowser(target) {
  const { platform } = process;
  // `start`'s first quoted arg is the window title; an empty one keeps the URL
  // from being swallowed as the title.
  const [cmd, cmdArgs] =
    platform === "darwin" ? ["open", [target]]
    : platform === "win32" ? ["cmd", ["/c", "start", "", target]]
    : ["xdg-open", [target]];
  const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`  Couldn't open a browser — visit ${target} manually.`));
  child.unref();
}
