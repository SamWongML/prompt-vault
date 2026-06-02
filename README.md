<div align="center">

# Prompt Vault

**A calm, local-first prompt manager for developers.**

Hybrid search · multi-format copy · zero-click ingestion of your
Codex, OpenCode &amp; Claude Code history — all on your machine, nothing leaves it.

[![npm](https://img.shields.io/npm/v/@z2r0/prompt-vault?color=bb5c3c&label=npm)](https://www.npmjs.com/package/@z2r0/prompt-vault)
[![node](https://img.shields.io/badge/node-%E2%89%A5%2022.5-5d7460)](#requirements)
[![license: MIT](https://img.shields.io/badge/license-MIT-8a8a8a)](#license)
[![local-first](https://img.shields.io/badge/local--first-no%20network-bb5c3c)](#license)

<img src="https://raw.githubusercontent.com/SamWongML/prompt-vault/main/assets/hero.png" alt="Prompt Vault — a prompt open in the detail panel with format tabs and variable fill-ins, next to the searchable library" width="880">

</div>

Prompt Vault is a tiny, self-contained app you launch from the terminal. It stores your
prompts, finds them **by keyword _and_ by meaning**, and copies any of them in the exact
format you need — with `{{variable}}` fill-ins. It can also read your prompts straight out
of your local CLI-agent history, so the vault fills itself.

```bash
npx @z2r0/prompt-vault     # run it — no install
```

## Features

- **🔎 Hybrid search, fully offline.** Real BM25 lexical ranking fused (Reciprocal Rank
  Fusion) with a local concept-vector semantic layer — no model download, no API key, no
  network. Toggle **Hybrid / Keyword / Semantic**; every hit shows `keyword`/`meaning`
  signal chips and a relevance bar. Searching _"make my code run faster"_ surfaces
  _"Optimize a slow SQL query"_ by meaning.
- **📥 Zero-click history ingestion.** On launch it quietly reads your **Codex**,
  **OpenCode**, and **Claude Code** history off disk and merges in anything new — keeping
  only your prompts (environment envelopes and assistant turns skipped) and tracing each
  back to the project it came from. Re-scan any time from **Ingest**.
- **📋 Copy in four formats.** Raw · Markdown · XML (`<prompt>`) · JSON, with
  `{{variable}}` fill-ins that flow into every format.
- **🗂️ Stay organized.** Pin to top, inline-edit, duplicate, archive, delete, live-edit
  tags, and sort by recent / most used / newest / A–Z.
- **🔒 Local-first by design.** Your vault lives in the browser (`localStorage`); the
  server only ever _reads_ files on your machine. No account, no database, no telemetry.
- **🌿 Calm, responsive UI.** A warm, Anthropic-inspired light theme with a low-contrast
  dark mode, `⌘K` search, and a layout that folds into drawers on narrow screens.

## Install

```bash
# Run once, no install:
npx @z2r0/prompt-vault

# Or install it globally:
npm install -g @z2r0/prompt-vault
prompt-vault
```

Either way it starts a tiny local server on `127.0.0.1`, prints the URL, and opens the app
in your browser.

## Usage

1. **Launch** — run `prompt-vault`. The app opens and silently ingests any new prompts
   from your local history.
2. **Find a prompt** — search from the top bar (or press `⌘K`). Switch **Hybrid →
   Keyword → Semantic** to trade exact matching for meaning, and narrow the rail by source
   (Codex / OpenCode / Claude Code / Manual), status (Pinned / Archived), or tags.
3. **Fill &amp; copy** — open a prompt, fill any `{{variables}}`, choose a format
   (Raw / Markdown / XML / JSON), and hit **Copy**. Your values flow into every format.
4. **Curate** — add prompts with **New**, then pin, tag, edit, duplicate, or archive them
   as your library grows.

<div align="center">
<img src="https://raw.githubusercontent.com/SamWongML/prompt-vault/main/assets/search.png" alt="Hybrid search in dark mode, with keyword and meaning signal chips and relevance bars on each result" width="880">
</div>

### Flags &amp; environment

| Flag / env          | Effect                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `--port <n>`        | Pin the server port (default: first free port in `7331–7350`).     |
| `--no-open`         | Start the server without opening a browser.                        |
| `CODEX_HOME`        | Override where Codex history is read from (default `~/.codex`).     |
| `OPENCODE_DATA_DIR` | Override the OpenCode data dir (`~/.local/share/opencode`).         |

## Requirements

**Node ≥ 22.5** — the OpenCode reader uses the built-in `node:sqlite`. Everything else
(Codex/Claude ingestion, search, copy) runs on older Node too; only OpenCode ingestion
needs it.

<details>
<summary><b>Build from source</b></summary>

Only needed if you edit the UI under `src/` — the committed HTML is already built.

```bash
git clone https://github.com/SamWongML/prompt-vault
cd prompt-vault
npm install      # dev-only: pulls esbuild
npm run build    # → regenerates "prompt-vault/Prompt Vault.html"
npm run dev      # build + open
```

The UI ships as **one self-contained HTML file**. `build.mjs` concatenates the source in
load order, transforms JSX → `React.createElement` with esbuild (no in-browser Babel),
then inlines the CSS and a vendored React build into a single file that works offline —
even double-clicked. The local server (`node:http`, no Express) serves that file and
exposes one endpoint, `/api/scan`, which does the history reading. History ingestion is
the one feature that needs the server.

</details>

<details>
<summary><b>FAQ</b></summary>

**Where is my data?** In your browser's `localStorage`, served over `http://localhost`.
Nothing is uploaded.

**Do I need a database?** No. For a single-user local vault it's zero-infrastructure —
nothing to provision. A backing store would only earn its keep if you wanted cross-device
sync.

**Does anything leave my machine?** No. Ingestion reads history files locally and the page
makes no network calls; React is vendored, so it runs fully offline.

**Which histories can it read?** Codex (`~/.codex/sessions`), OpenCode
(`~/.local/share/opencode/opencode.db`), and Claude Code (`~/.claude/history.jsonl`). It
keeps user prompts only.

</details>

## License

MIT.

> Recreated from a [Claude Design](https://claude.ai/design) handoff — `src/` mirrors the
> design prototype; the single-file build, local server, and CLI are the production
> packaging.
