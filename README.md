# Prompt Vault

A calm, developer-oriented **prompt vault** — fully local. Store prompts, find
them with **hybrid search** (keyword *and* meaning), and copy any prompt in the
format you need (Raw · Markdown · XML · JSON) with `{{variable}}` fill-ins.

Run it from the CLI and it starts a tiny local server, opens in your browser, and
**auto-ingests your own prompts straight out of your Codex / OpenCode history** —
read off disk on your machine, nothing leaves it.

```
prompt-vault/
  Prompt Vault.html   ← the built UI (one file), served by the CLI
  src/                ← editable UI source
    styles.css        ·  design system + layout + motion
    data.js           ·  seed prompts + the vault-entry factory
    search.js         ·  hybrid search — BM25 + concept-vector semantics, fused with RRF
    components.jsx    ·  UI building blocks (icons, search, rail, cards, detail, modal)
    app.jsx           ·  app state, filtering, ingestion, shortcuts, persistence
    vendor/           ·  React + ReactDOM (production UMD), inlined at build time
server/
  server.mjs          ← local HTTP server: serves the UI + the /api/scan endpoint
  ingest.mjs          ← reads Codex .jsonl + OpenCode SQLite (node:sqlite) off disk
build.mjs             ← assembles the single-file UI (esbuild precompiles the JSX)
bin/prompt-vault.mjs  ← CLI: start the server + open the browser
```

## Run it

```bash
npx @senwong/prompt-vault          # no install — fetch & run
# or install it:
npm install -g @senwong/prompt-vault
prompt-vault                       # starts the server + opens your browser
```

Flags: `--port <n>` to pin a port, `--no-open` to start without opening a browser.
Override where it looks for history with the `CODEX_HOME` / `OPENCODE_DATA_DIR`
environment variables.

On launch it quietly scans your Codex (`~/.codex/sessions`) and OpenCode
(`~/.local/share/opencode/opencode.db`) history and merges in anything new; the
**Ingest** button re-scans on demand. Your vault persists in the browser
(`localStorage`).

> Requires **Node ≥ 22.5** — the OpenCode reader uses the built-in `node:sqlite`.

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
- **Ingest CLI history** — auto-ingested on launch, or re-scan from the Ingest
  panel. The server reads your real Codex rollout transcripts and OpenCode
  database and keeps only your prompts (skips environment envelopes and assistant
  turns), deriving the originating project from the session `cwd`.
- **Copy in 4 formats** — Raw, Markdown, XML (`<prompt>`), JSON — with
  `{{variable}}` fill-ins that flow into every format.
- **Management** — pin (floats to top), inline edit, duplicate, archive, delete,
  live tag editing, and sort (recent / most used / newest / A–Z).
- **Calm UX** — warm Anthropic-inspired light theme + low-contrast dark toggle,
  `⌘K` search, grid-aligned header, static detail panel, restrained motion,
  fully responsive (rail and detail become overlay drawers on narrow screens).

## Do you need a database?

**No.** Prompt Vault persists to your browser's `localStorage`, which keeps it
zero-infrastructure — nothing to provision. The CLI serves the app over
`http://localhost`, so persistence is reliable. If you ever want shared or
cross-device sync, that's when a backing store would make sense; for a local
single-user vault it isn't needed.

## Origin

Recreated from a Claude Design (`claude.ai/design`) handoff bundle. `src/` mirrors
the design prototype's files; the single-file UI build, local server, and CLI are
the production packaging.
