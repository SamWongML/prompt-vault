/* ============================================================
   build.mjs — assemble a single, self-contained, offline,
   portable "Prompt Vault.html".

   Pipeline:
     1. Vendor React + ReactDOM (production UMD) — fetched once,
        then cached in prompt-vault/src/vendor so later builds
        work fully offline.
     2. Concatenate the design's source files in load order and
        transform JSX -> React.createElement with esbuild (no
        in-browser Babel, no runtime warnings).
     3. Inline the CSS, React, and the compiled app into one HTML
        file that needs no build step, no server, and no network
        to run. Double-click it, or launch via `npm start`.
   ============================================================ */
import { build as esbuild } from "esbuild";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "prompt-vault", "src");
const VENDOR = join(SRC, "vendor");
const OUT = join(ROOT, "prompt-vault", "Prompt Vault.html");

const REACT_VERSION = "18.3.1";
const VENDOR_FILES = [
  {
    file: "react.production.min.js",
    url: `https://unpkg.com/react@${REACT_VERSION}/umd/react.production.min.js`,
  },
  {
    file: "react-dom.production.min.js",
    url: `https://unpkg.com/react-dom@${REACT_VERSION}/umd/react-dom.production.min.js`,
  },
];

const exists = async (p) => access(p, constants.F_OK).then(() => true).catch(() => false);

async function ensureVendor() {
  await mkdir(VENDOR, { recursive: true });
  const out = [];
  for (const { file, url } of VENDOR_FILES) {
    const dest = join(VENDOR, file);
    if (!(await exists(dest))) {
      process.stdout.write(`  fetching ${file} … `);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
      const text = await res.text();
      await writeFile(dest, text);
      console.log(`${(text.length / 1024).toFixed(0)} KB`);
    }
    out.push(await readFile(dest, "utf8"));
  }
  return out.join("\n");
}

async function compileApp() {
  // Design source files, in their original <script> load order.
  const order = ["data.js", "search.js", "components.jsx", "app.jsx"];
  const parts = [];
  for (const f of order) parts.push(`/* ===== ${f} ===== */\n` + (await readFile(join(SRC, f), "utf8")));
  const combined = parts.join("\n\n");

  const res = await esbuild({
    stdin: { contents: combined, loader: "jsx", resolveDir: SRC },
    write: false,
    bundle: false,
    minify: true,
    target: "es2019",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    legalComments: "none",
  });
  return res.outputFiles[0].text;
}

async function main() {
  console.log("Prompt Vault — building self-contained HTML");

  const [react, css, app] = await Promise.all([ensureVendor(), readFile(join(SRC, "styles.css"), "utf8"), compileApp()]);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!-- Apply the saved theme before first paint so dark mode never flashes light on
     load, and rapid reloads can't flicker mid-fade. Must be a blocking inline
     script in <head> (runs before the body paints). The key matches LS_THEME in
     app.jsx; React reads the same value and re-applies it, so the two never
     disagree and the re-apply is a no-op that fires no transition. -->
<script>try{document.documentElement.setAttribute("data-theme",localStorage.getItem("promptVault.theme")||"light")}catch(e){}</script>
<title>Prompt Vault</title>
<meta name="description" content="A calm, developer-oriented prompt vault — hybrid search, CLI-history ingestion, multi-format copy. Fully local, single file, offline." />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23bb5c3c'/%3E%3Cpath d='M9 11l5 5-5 5M17 22h7' fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>

<!-- React + ReactDOM (production UMD), inlined for offline portability -->
<script>${react}</script>

<!-- Prompt Vault app: data + hybrid search + components + app, JSX precompiled -->
<script>${app}</script>
</body>
</html>
`;

  await writeFile(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`  wrote ${OUT.replace(ROOT + "/", "")} (${kb} KB, self-contained)`);
  console.log("Done. Open it directly, or run `npm start`.");
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message);
  process.exit(1);
});
