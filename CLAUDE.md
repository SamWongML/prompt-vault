# CLAUDE.md — Prompt Vault

Calm, developer-oriented prompt manager: hybrid search, CLI-history ingestion,
multi-format copy. Ships as **one self-contained, offline, double-clickable HTML
file** — no server, no runtime build, no network needed to run it.

## How to work here

These four mirror the exact mistakes that have already cost a session in this repo.

- **Don't assume — verify, then act.** Wrong, silent assumptions are the #1 failure
  mode here. Don't guess file paths, build behavior, or APIs: `ls`/grep/read first.
  If two readings are plausible, state both and ask rather than picking silently.
- **Surgical changes.** Every changed line should trace to the request. Don't refactor
  adjacent code, don't "tidy" things you weren't asked to. Match the surrounding
  (often terse, single-line) style instead of imposing your own.
- **Simplicity.** Would a senior engineer call this overcomplicated? The header's
  responsive behavior is intentionally **CSS-only** (container queries) — don't reach
  for JS width-measurement. No speculative abstractions for a single caller.
- **Verify before you claim done.** There is no test suite. "Done" = `node build.mjs`
  exits 0 **and** you've confirmed the change is in the built HTML (see below).

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

## Conventions (match these)

- **Hooks are aliased** at the top of `app.jsx`: `uS`/`uE`/`uR`/`uM`/`uC` =
  useState/useEffect/useRef/useMemo/useCallback. Use the aliases.
- **Cross-file wiring is via `window.*` globals**, not `import` — files are
  concatenated, not module-resolved. Don't add ESM imports between them.
- **Responsive header = CSS container queries**, not JS. `.topbar` is
  `container-type: inline-size`; controls "shed" in `@container header (max-width:…)`
  blocks. Shedding is _reversible_ — anything mirrored in JS state (e.g. the `⋯` menu's
  open flag) must reverse with it, or it strands on screen when the window widens.
- Comments explain _why_, not _what_; keep that density.

## Git

- Default branch `main`. Commit only when asked; branch off `main` first if needed.
- Commit the `src/` change **and** the rebuilt `Prompt Vault.html` together — the HTML
  is tracked and reviewers diff it.
