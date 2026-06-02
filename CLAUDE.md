# CLAUDE.md — Prompt Vault

Calm, developer-oriented prompt manager: hybrid search, CLI-history ingestion,
multi-format copy. Ships as an **npm CLI package** (`@senwong/prompt-vault`): `npm start`
boots a tiny local server (`node:http`, bound to `127.0.0.1`, port 7331) that serves one
self-contained HTML file and opens it in the browser. The page is offline and still works
double-clicked, but **CLI-history ingestion needs the server** — it scans Codex/OpenCode
history server-side and hands it back via `/api/scan`. No runtime build; no network to run.

## Build & run

**IMPORTANT: edit `prompt-vault/src/*`, then run `node build.mjs`.** The app does not
run JSX in the browser — it is compiled and inlined into one HTML file. Skip the build
and your change is invisible.

| Task               | Command (run from repo root)              |
| ------------------ | ----------------------------------------- |
| Build (src → HTML) | `node build.mjs` · `npm run build`        |
| Run the built app  | `npm start` (`node bin/prompt-vault.mjs`) |
| Build + run        | `npm run dev`                             |

## Repo gotchas (non-obvious; each has already burned time)

- **Source is nested:** code lives in `prompt-vault/src/`, _not_ `./src/`. There is no
  `src/components/`, no `CommandBar`, no test files. The whole toolbar (Ingest, New,
  theme, `⋯` overflow menu) is inline in `app.jsx`.
- **`prompt-vault/Prompt Vault.html` is generated _and_ git-tracked.** Never hand-edit
  it — the next build overwrites it. Edit `src/`, rebuild, commit both together.
- **Grepping the built HTML:** the build inlines CSS **verbatim** (keeps spacing:
  `display: none; ...`) but **minifies JS** (`addEventListener("resize",t)`). A failed
  grep usually means wrong formatting assumption, not a failed build.
- **Run from the repo root** (`/Users/demon/codes/prompt-vault`); `node build.mjs` fails
  from inside `prompt-vault/`. Prefer absolute paths — shell cwd isn't guaranteed to
  persist, and don't batch a `cd`-dependent command with others in one parallel group
  (a failing sibling cancels the whole batch).

## Architecture

React 18 (UMD, vendored for offline use). `build.mjs` concatenates the source files
**in load order**, esbuild-transforms JSX (`bundle:false, minify:true`), then inlines
CSS + React + app into `prompt-vault/Prompt Vault.html` (note the space in the name).

- `src/data.js` — seed prompts → `window.PV_SEED`
- `src/search.js` — hybrid search engine → `window.PVSearch`
- `src/components.jsx` — presentational components (`SearchBar`, …)
- `src/app.jsx` — the `App` component: all state/effects + the entire topbar
- `src/styles.css` — all styles, inlined verbatim
- `src/vendor/` — cached React/ReactDOM UMD (fetched once, then fully offline)

The **CLI + server** layer (added when the app became an npm package) lives _outside_
`src/` and is not part of the esbuild step:

- `bin/prompt-vault.mjs` — the `prompt-vault` bin. Re-execs with `--experimental-sqlite`
  if `node:sqlite` needs it, parses `--no-open`/`--port`, calls `startServer`, opens the
  browser.
- `server/server.mjs` — `node:http` server (no Express). Serves the built HTML at `/`,
  exposes `GET /api/scan?source=codex|opencode|all`. Picks the first free port in
  7331–7350 unless `--port` is given.
- `server/ingest.mjs` — history extraction (no HTTP). `scanCodex()` reads
  `~/.codex/sessions/**/*.jsonl`; `scanOpenCode()` reads `~/.local/share/opencode/opencode.db`
  via built-in `node:sqlite`.

## Conventions (match these)

- **Hooks are aliased** at the top of `app.jsx`: `uS`/`uE`/`uR`/`uM`/`uC` =
  useState/useEffect/useRef/useMemo/useCallback. Use the aliases.
- **Cross-file wiring is via `window.*` globals**, not `import` — files are
  concatenated, not module-resolved. Don't add ESM imports between them.
- **Responsive header = CSS container queries**, not JS. `.topbar` is
  `container-type: inline-size`; controls "shed" in `@container header (max-width:…)`
  blocks. Shedding is _reversible_ — anything mirrored in JS state (e.g. the `⋯` menu's
  open flag) must reverse with it, or it strands on screen when the window widens.
- **The sidebar rail is the deliberate exception.** Unlike the header, the rail _does_
  use JS: `resize` listeners in `app.jsx` sync `railOpen` to `window.innerWidth > 1080`,
  track topbar height (`--topbar-h`), and close the `⋯` menu. That JS is intentional —
  don't "simplify" it away — but keep new width logic out of the header itself.
- Comments explain _why_, not _what_; keep that density.

## Git

- Default branch `main`. Commit only when asked; branch off `main` first if needed.
- Commit the `src/` change **and** the rebuilt `Prompt Vault.html` together — the HTML
  is tracked and reviewers diff it.
