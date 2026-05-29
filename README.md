# Prompt Vault

A calm, developer-oriented **prompt vault** — one page, fully local, offline.
Store prompts, find them with **hybrid search** (keyword *and* meaning), ingest
your own prompts straight out of **Codex / OpenCode** CLI history, and copy any
prompt in the format you need (Raw · Markdown · XML · JSON) with `{{variable}}`
fill-ins.

The whole app ships as **one self-contained HTML file** — no build, no server,
no network needed to run it. Copy it anywhere and open it.

```
prompt-vault/
  Prompt Vault.html   ← the app: a single portable file (committed, ready to run)
  src/                ← editable source (recreated 1:1 from the Claude Design handoff)
    styles.css        ·  design system + layout + motion
    data.js           ·  seed prompts + real .jsonl ingestion (Codex/OpenCode)
    search.js         ·  hybrid search — BM25 + concept-vector semantics, fused with RRF
    components.jsx    ·  UI building blocks (icons, search, rail, cards, detail, modals)
    app.jsx           ·  app state, filtering, ingestion, shortcuts, persistence
    vendor/           ·  React + ReactDOM (production UMD), inlined at build time
build.mjs             ← assembles the self-contained HTML (esbuild precompiles the JSX)
bin/prompt-vault.mjs  ← cross-platform CLI launcher
```

## Run it

**Portable (no tooling):** open `prompt-vault/Prompt Vault.html` directly in any
browser — double-click it, or drag it onto a browser window. That's the whole app.

**From the CLI:**

```bash
npm start                 # opens the app in your default browser
# or, after `npm link` / global install:
prompt-vault
# or directly:
node bin/prompt-vault.mjs
```

## Rebuild from source

Only needed if you edit anything in `src/`. The committed HTML is already built.

```bash
npm install      # one-time: pulls esbuild (dev only)
npm run build    # → regenerates prompt-vault/Prompt Vault.html
npm run dev      # build + open
```

The build concatenates the source in load order, transforms JSX → plain
`React.createElement` with esbuild (so there's **no in-browser Babel** and no
console warnings), then inlines the CSS and React into one HTML file. React is
vendored on first build into `src/vendor/` so later builds work fully offline.

## Features

- **Hybrid search** — real BM25 (lexical) + a local concept-vector "semantic"
  layer, fused with Reciprocal Rank Fusion. No model download, no API key, no
  network. Toggle **Hybrid / Keyword / Semantic**; cards show `keyword`/`meaning`
  signal chips and a relevance bar. (e.g. *"make my code run faster"* surfaces
  *"Optimize a slow SQL query"* by meaning.)
- **Ingest CLI history** — drag any `.jsonl` onto the window, or use the Ingest
  panel's Codex / OpenCode samples. It parses real rollout transcripts and keeps
  only your prompts (skips environment envelopes and assistant turns), deriving
  the originating project from the session `cwd`.
- **Copy in 4 formats** — Raw, Markdown, XML (`<prompt>`), JSON — with
  `{{variable}}` fill-ins that flow into every format.
- **Management** — pin (floats to top), inline edit, duplicate, archive, delete,
  live tag editing, and sort (recent / most used / newest / A–Z).
- **Calm UX** — warm Anthropic-inspired light theme + low-contrast dark toggle,
  `⌘K` search, grid-aligned header, static detail panel, restrained motion,
  fully responsive (rail and detail become overlay drawers on narrow screens).

## Do you need a database?

**No.** Prompt Vault persists to your browser's `localStorage`, which keeps it
zero-infrastructure and portable — nothing to install or run. If you ever want
shared or cross-device sync, that's when a backing store would make sense; for a
local single-user vault it isn't needed.

> Note: when opened via `file://`, some browsers restrict `localStorage`. Edits
> still work for the session; if you want guaranteed persistence, serve the file
> from any static server (e.g. `npx serve prompt-vault`).

## Origin

Recreated from a Claude Design (`claude.ai/design`) handoff bundle. `src/` mirrors
the design prototype's files verbatim; the portable single-file build and CLI
launcher are the production packaging.
