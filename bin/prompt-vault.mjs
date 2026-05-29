#!/usr/bin/env node
/* ============================================================
   prompt-vault — open the self-contained app in the default
   browser. Dependency-free; works on macOS, Linux, Windows.

   Usage:
     prompt-vault            # if installed/linked globally
     npm start               # from the project root
     node bin/prompt-vault.mjs
   ============================================================ */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "prompt-vault", "Prompt Vault.html");

if (!existsSync(app)) {
  console.error(`Prompt Vault not found at:\n  ${app}\n\nBuild it first:  npm run build`);
  process.exit(1);
}

const { platform } = process;
let cmd, args;
if (platform === "darwin") {
  cmd = "open";
  args = [app];
} else if (platform === "win32") {
  // `start` is a cmd builtin; empty title arg avoids quoting issues with the path.
  cmd = "cmd";
  args = ["/c", "start", "", app];
} else {
  cmd = "xdg-open";
  args = [app];
}

const child = spawn(cmd, args, { stdio: "ignore", detached: true });
child.on("error", (err) => {
  console.error(`Could not open the browser automatically (${err.code}).`);
  console.error(`Open this file manually:\n  ${app}`);
  process.exit(1);
});
child.unref();
console.log(`Opening Prompt Vault →\n  ${app}`);
