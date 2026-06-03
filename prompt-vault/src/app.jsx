/* ============================================================
   app.jsx — Prompt Vault application
   ============================================================ */
const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM, useCallback: uC } = React;

const LS_KEY = "promptVault.v1";
const LS_THEME = "promptVault.theme";
const LS_RAIL = "promptVault.rail"; // docked-sidebar collapse preference
const LS_TOMB = "promptVault.tombstones.v1"; // content-hashes of prompts the user deleted

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch {}
  return window.PV_SEED;
}

/* The vault snapshot the CLI server inlined into the page (see the #pv-bootstrap
   note in build.mjs / server.mjs). Reading it synchronously lets the very first
   render show real prompts — no fetch-on-mount waterfall. Returns null when the
   page is opened bare (file://), where the sentinel isn't valid JSON: that's the
   signal we're offline, so the app stays in localStorage mode. A *present* payload
   (even with an empty prompts[]) means the server answered, so it doubles as the
   "server mode" flag and lets boot() skip the /api/prompts round-trip. */
function readBootstrap() {
  try {
    const el = document.getElementById("pv-bootstrap");
    const data = el && JSON.parse(el.textContent);
    return data && Array.isArray(data.prompts) ? data : null;
  } catch { return null; }
}

/* First-render prompts: prefer the server's inlined snapshot, so a populated vault
   paints immediately. An empty snapshot (fresh install, or first run after the
   localStorage→SQLite upgrade) falls through to loadState() — that shows any
   pending localStorage vault at once, which boot() then migrates up and reconciles. */
function initialPrompts() {
  const b = readBootstrap();
  return b && b.prompts.length ? b.prompts : loadState();
}

/* Hashes of prompts the user deleted, so a history re-scan can't resurrect them.
   The vault is server-authoritative now and the server owns the live tombstones
   (a SQLite table); this browser-side set survives only to hand earlier deletions
   — recorded back when the vault lived in localStorage — up to the server once,
   during the one-time migration. */
function loadTombstones() {
  try { const a = JSON.parse(localStorage.getItem(LS_TOMB)); if (Array.isArray(a)) return new Set(a); } catch {}
  return new Set();
}

/* The vault has two homes. When the page is served by the local CLI server, that
   server is the source of truth: prompts live in SQLite on disk (durable, port-
   independent, no 5 MB cap) and every change is a small /api call. When the file
   is opened directly (file://, no server), there's no API and no history to ingest,
   so we fall back to the old localStorage store. boot() probes which world we're in;
   `server` flips to true only once /api/prompts answers. */
const api = {
  load: () => fetch("/api/prompts").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  post: (prompts) => fetch("/api/prompts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompts }) }),
  patch: (id, patch) => fetch(`/api/prompts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }),
  del: (id) => fetch(`/api/prompts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  ingest: (src) => fetch(`/api/ingest?source=${src}`, { method: "POST" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  import: (prompts, tombstones) => fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompts, tombstones }) }),
};

/* the user's saved choice for the docked rail (desktop). It's the durable half of
   the sidebar's two-faced state: on desktop railOpen mirrors this, on narrow widths
   railOpen is a transient overlay flag and this is left untouched. */
function loadRailCollapsed() { try { return localStorage.getItem(LS_RAIL) === "1"; } catch { return false; } }

/* Flip the theme without the colour crawl. styles.css gives cards, buttons, the
   topbar, chips etc. transitions for hover/focus — but a custom-property swap fires
   those same transitions, so a naive toggle tweens background/border/box-shadow
   (all main-thread *paint* properties, never composited) across every visible
   element at once, and the recolour drops frames into a region-by-region sweep. So
   we don't animate the swap at all: drop a global no-transition rule, flip the
   attribute, force one synchronous style flush so the new colours snap into place
   *under* that rule, then lift it on the next task so hover transitions resume.
   getComputedStyle is the flush — not requestAnimationFrame, which can fire before
   the new styles commit and let the tween leak through. This is next-themes'
   battle-tested disableTransitionOnChange technique. */
function applyTheme(theme) {
  const root = document.documentElement;
  const kill = document.createElement("style");
  kill.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
  document.head.appendChild(kill);
  root.setAttribute("data-theme", theme);
  window.getComputedStyle(document.body); // commit the snap while the rule is still live
  setTimeout(() => kill.remove(), 1);     // resume hover transitions on the next task
}

function App() {
  const [prompts, setPrompts] = uS(initialPrompts);
  const [theme, setTheme] = uS(() => localStorage.getItem(LS_THEME) || "light");
  const [query, setQuery] = uS("");
  const [mode, setMode] = uS("hybrid");
  const [source, setSource] = uS("all");
  const [status, setStatus] = uS("active");
  const [activeTags, setActiveTags] = uS([]);
  const [selId, setSelId] = uS(null);
  const [sortBy, setSortBy] = uS("recent"); // recent | uses | created | az
  const [toasts, setToasts] = uS([]);
  const [showImport, setShowImport] = uS(false);
  const [railCollapsed, setRailCollapsed] = uS(loadRailCollapsed); // persisted desktop preference
  /* live flag the layout reads. Desktop honours the saved preference; narrow widths
     start hidden (the rail is a summoned overlay there, not a docked column). */
  const [railOpen, setRailOpen] = uS(() =>
    typeof window === "undefined" ? true : window.innerWidth > 1080 ? !loadRailCollapsed() : false);
  const [detailMobileOpen, setDetailMobileOpen] = uS(false); // detail overlay visibility on narrow screens
  const [staggerOn, setStaggerOn] = uS(true); // card entrance plays on first load only
  const [overflowOpen, setOverflowOpen] = uS(false); // topbar ⋯ menu (narrow widths only)

  const searchRef = uR(null);
  const overflowRef = uR(null);
  const themeReady = uR(false); // <head> script set data-theme pre-paint; skip the flip-snap on mount
  /* Which world are we in (see the `api` note above)? A ref, not state: it's read
     inside mutation callbacks and the persistence effect, and flipping it must not
     re-run effects that key off prompts. boot() sets it true once the server answers. */
  const server = uR(false);
  /* Rebuild the search index only when the prompt set changes — not on every
     render. build() re-tokenizes every prompt's full text (tens of ms once the
     whole history is ingested), so running it per render put that cost on the
     critical path of unrelated state changes (e.g. the rail-collapse toggle,
     stalling the first animation frames). */
  const engine = uM(() => { const e = new window.PVSearch(); e.build(prompts); return e; }, [prompts]);

  /* persistence (offline mode only — in server mode each mutation is its own
     /api call, so mirroring the whole array to localStorage would just re-introduce
     the 5 MB cap and the write-amplification we moved to SQLite to escape). */
  uE(() => { if (server.current) return; try { localStorage.setItem(LS_KEY, JSON.stringify(prompts)); } catch {} }, [prompts]);
  uE(() => {
    localStorage.setItem(LS_THEME, theme);
    /* the <head> bootstrap already set data-theme before first paint, so the
       initial run has nothing to animate — only later user toggles need the snap. */
    if (!themeReady.current) { themeReady.current = true; document.documentElement.setAttribute("data-theme", theme); return; }
    applyTheme(theme);
  }, [theme]);
  uE(() => { try { localStorage.setItem(LS_RAIL, railCollapsed ? "1" : "0"); } catch {} }, [railCollapsed]);

  /* track topbar height so mobile drawers sit flush beneath it */
  uE(() => {
    const setH = () => { const tb = document.querySelector(".topbar"); if (tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px"); };
    setH(); window.addEventListener("resize", setH);
    return () => window.removeEventListener("resize", setH);
  }, []);

  /* keep the rail tied to the layout it belongs to. railOpen is one flag with
     breakpoint-dependent meaning — a persistent column on desktop, a summoned
     overlay drawer on narrow — so crossing the 1080 boundary must re-sync it, or
     it strands: resize a desktop window down and the sidebar lingers as a floating
     overlay. Narrowing always hides it (keeps the phone drawer shut by the time
     720 makes it an overlay, which the CSS flash-guard depends on); widening
     restores the *saved* preference rather than forcing open, so a deliberate
     desktop collapse survives a narrow round-trip instead of springing back. Only
     act on an actual crossing, so a deliberate collapse survives same-side resizes. */
  uE(() => {
    let wasWide = window.innerWidth > 1080;
    const onResize = () => {
      const nowWide = window.innerWidth > 1080;
      if (nowWide !== wasWide) { wasWide = nowWide; setRailOpen(nowWide ? !railCollapsed : false); }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [railCollapsed]);

  /* let the first-load card stagger play once, then stop animating on filter/search */
  uE(() => { const t = setTimeout(() => setStaggerOn(false), 800); return () => clearTimeout(t); }, []);

  /* dismiss the topbar overflow menu on Escape, an outside click, or a resize.
     The ⋯ trigger only exists at narrow widths (a container query hides it as
     the header grows). Closing on resize keeps the menu's open state tied to its
     trigger, so a menu opened while narrow can't linger — floating and orphaned —
     once the window widens and the inline Ingest button comes back. */
  uE(() => {
    if (!overflowOpen) return;
    const close = () => setOverflowOpen(false);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onDown = (e) => { if (overflowRef.current && !overflowRef.current.contains(e.target)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); window.removeEventListener("resize", close); };
  }, [overflowOpen]);

  /* toast helper */
  const toast = uC((msg, icon) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  }, []);

  /* keyboard: cmd/ctrl-K focus; Escape clears the search, else retracts the
     narrow-screen detail drawer. With the close button gone, the scrim is the
     pointer affordance and Escape is the keyboard one (the WAI dialog pattern).
     Guard contentEditable so Escape mid-edit doesn't yank the drawer shut and
     drop an unsaved title/body. */
  uE(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (e.key === "Escape") {
        const ae = document.activeElement;
        if (ae === searchRef.current && query) setQuery("");
        else if (detailMobileOpen && !(ae && ae.isContentEditable)) setDetailMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, detailMobileOpen]);

  /* counts for sidebar (respect search-independent buckets)
     Library counts stay global; Status counts reflect the selected library so
     the numbers can never promise more than the list will show (e.g. Pinned
     reads 0 under OpenCode when every pinned prompt is Manual). */
  const counts = uM(() => {
    const bySource = { all: 0, codex: 0, opencode: 0, claude: 0, manual: 0 };
    const byStatus = { active: 0, pinned: 0, archived: 0 };
    prompts.forEach((p) => {
      if (!p.archived) { bySource.all++; bySource[p.source] = (bySource[p.source] || 0) + 1; }
      if (source !== "all" && p.source !== source) return; // status counts are scoped to the active library
      if (p.archived) byStatus.archived++;
      else { byStatus.active++; if (p.pinned) byStatus.pinned++; }
    });
    return { bySource, byStatus };
  }, [prompts, source]);

  const allTags = uM(() => {
    const m = {};
    prompts.forEach((p) => { if (!p.archived) p.tags.forEach((t) => (m[t] = (m[t] || 0) + 1)); });
    return Object.keys(m).sort((a, b) => m[b] - m[a]);
  }, [prompts]);

  /* base filter (source/status/tags) */
  const filtered = uM(() => {
    return prompts.filter((p) => {
      if (status === "archived") { if (!p.archived) return false; }
      else { if (p.archived) return false; if (status === "pinned" && !p.pinned) return false; }
      if (source !== "all" && p.source !== source) return false;
      if (activeTags.length && !activeTags.every((t) => p.tags.includes(t))) return false;
      return true;
    });
  }, [prompts, status, source, activeTags]);

  /* search + sort */
  const searching = query.trim().length > 0;
  const terms = uM(() => window.pvTokenize(query), [query]);

  const view = uM(() => {
    if (searching) {
      const ranked = engine.query(query, mode);
      const allow = new Set(filtered.map((p) => p.id));
      return ranked.filter((r) => allow.has(r.doc.id)).map((r) => ({ prompt: r.doc, result: r }));
    }
    const arr = [...filtered];
    const sorters = {
      recent: (a, b) => b.lastUsed - a.lastUsed,
      uses: (a, b) => b.useCount - a.useCount,
      created: (a, b) => b.createdAt - a.createdAt,
      az: (a, b) => a.title.localeCompare(b.title),
    };
    arr.sort((a, b) => (b.pinned - a.pinned) || sorters[sortBy](a, b));
    return arr.map((p) => ({ prompt: p, result: null }));
  }, [filtered, searching, query, mode, sortBy, prompts]);

  /* keep a valid selection */
  uE(() => {
    if (!view.length) { setSelId(null); return; }
    if (!view.find((v) => v.prompt.id === selId)) setSelId(view[0].prompt.id);
  }, [view]);
  const selected = prompts.find((p) => p.id === selId) || null;

  /* The detail pane is a persistent column on desktop (it shows a placeholder
     when nothing is selected), so there's no close to animate there. The only
     thing to retract is the narrow-screen overlay drawer: when the selection
     clears (the list filtered/emptied to zero) slide it out to reveal the list.
     A normal scrim/Esc close keeps the selection, so its content stays put. */
  uE(() => { if (!selected) setDetailMobileOpen(false); }, [selected]);

  /* mutations — optimistic in memory, then persisted. In server mode each one is a
     granular /api write (one row); in offline mode the localStorage effect above
     catches the state change. */
  const update = uC((id, patch, silent) => {
    setPrompts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (server.current) api.patch(id, patch);
  }, []);

  const action = uC((kind, p) => {
    if (kind === "pin") { update(p.id, { pinned: !p.pinned }); toast(p.pinned ? "Unpinned" : "Pinned to top", "pin"); }
    else if (kind === "archive") { update(p.id, { archived: !p.archived }); toast(p.archived ? "Restored" : "Archived", "archive"); }
    else if (kind === "delete") {
      // server mode tombstones the content server-side so a re-scan can't revive it;
      // offline mode has no history ingestion, so plain removal is enough.
      if (server.current) api.del(p.id);
      setPrompts((ps) => ps.filter((x) => x.id !== p.id)); toast("Deleted", "trash");
    } else if (kind === "duplicate") {
      const copy = { ...p, id: window.uid(), title: p.title + " (copy)", pinned: false, useCount: 0, createdAt: Date.now(), lastUsed: Date.now() };
      setPrompts((ps) => { const i = ps.findIndex((x) => x.id === p.id); const n = [...ps]; n.splice(i + 1, 0, copy); return n; });
      if (server.current) api.post([copy]);
      setSelId(copy.id); toast("Duplicated", "dup");
    }
  }, [update, toast]);

  const newPrompt = uC(() => {
    const p = window.pvMk({ title: "New prompt", content: "Write your prompt here. Use {{variables}} for fill-ins.", source: "manual", tags: [] });
    setPrompts((ps) => [p, ...ps]);
    if (server.current) api.post([p]);
    setSource("all"); setStatus("active"); setActiveTags([]); setQuery("");
    setSelId(p.id); setDetailMobileOpen(true);
    toast("Draft created", "plus");
  }, [toast]);

  /* Merge prompts the server just ingested into the in-memory view. Dedup +
     tombstone filtering + persistence already happened server-side (see
     store.ingest); these are the genuinely new ones, so we just prepend them.
     Ingestion is now always user-initiated (the Ingest popup), so we surface the
     result and jump the view to the source the user just imported from. */
  const mergeAdded = uC((added, src) => {
    if (!added.length) return;
    setPrompts((ps) => [...added, ...ps]);
    toast(`Ingested ${added.length} prompt${added.length > 1 ? "s" : ""} from ${src}`, "import");
    setSource(src); setStatus("active"); setActiveTags([]); setQuery("");
  }, [toast]);

  /* the local server reads your Codex/OpenCode history off disk, merges anything
     new into the vault, and hands back what it added. No file picker. */
  const scanSource = uC(async (src) => {
    setShowImport(false);
    if (!server.current) return toast("History ingestion needs the local server — run `prompt-vault`.", "x");
    try {
      toast("Reading your history…", "import");
      const { added, notes } = await api.ingest(src);
      // a note with nothing found = the source was unavailable (e.g. OpenCode on
      // Node < 22.5) — show why instead of a misleading "no prompts found".
      if (notes && notes.length && !added.length) return toast(notes[0], "x");
      if (!added.length) return toast("Already imported", "check");
      mergeAdded(added, src);
    } catch (e) { toast((e && e.message) || "Couldn't read your history", "x"); }
  }, [mergeAdded, toast]);

  /* boot: settle which world we're in and reconcile the durable vault.

     The fast path needs no network at all: the CLI server inlines the vault into
     the page (#pv-bootstrap), so a populated vault is already on screen from the
     first render — boot just flips the server flag and we're done. This kills the
     old fetch-on-mount waterfall, where the page painted an empty state and only
     showed real data after a second /api/prompts round-trip resolved.

     Two cases still need an async step:
       • server mode, empty vault → first run after the localStorage→SQLite upgrade:
         hand the old localStorage vault (+ its deletion tombstones) up to the
         server once, while it's still empty.
       • no bootstrap (a bare file:// page, or HTML served without injection) →
         fall back to probing /api/prompts: it answers under the CLI server (older
         build, no sentinel) and fails on file://, where we stay in localStorage mode.

     History ingestion deliberately does NOT run here — it forces a full recursive
     scan of the entire Codex/Claude/OpenCode history on disk, which once left first
     load waiting seconds. It's strictly user-initiated now (Ingest popup → scanSource). */
  uE(() => {
    (async () => {
      const boot = readBootstrap();
      if (boot) {
        // server answered in-page — no round-trip. initialPrompts() already
        // rendered boot.prompts when non-empty; only the empty-vault migration is left.
        server.current = true;
        const local = loadState();
        if (!boot.prompts.length && local.length) {
          await api.import(local, [...loadTombstones()]).catch(() => {});
          setPrompts(local);
        }
        return;
      }
      try {
        const { prompts: remote } = await api.load();
        server.current = true;
        const local = loadState();
        if (!remote.length && local.length) {
          await api.import(local, [...loadTombstones()]).catch(() => {});
          setPrompts(local);
        } else {
          setPrompts(remote);
        }
      } catch {} // offline mode — nothing more to do
    })();
  }, []); // run once on mount

  const SORT_LABELS = { recent: "Recent", uses: "Most used", created: "Newest", az: "A–Z" };
  const cycleSort = () => {
    const order = ["recent", "uses", "created", "az"];
    setSortBy(order[(order.indexOf(sortBy) + 1) % order.length]);
  };

  const heading = source === "all"
    ? (status === "archived" ? "Archived" : status === "pinned" ? "Pinned" : "All prompts")
    : ({ codex: "Codex", opencode: "OpenCode", claude: "Claude Code", manual: "Manual" }[source]);

  const bodyClass = [
    "body",
    railOpen ? "" : "rail-collapsed",
    detailMobileOpen ? "detail-open" : "",
  ].join(" ");

  return (
    <div className="app">
      {/* top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <button className="mark" onClick={() => { const n = !railOpen; if (window.innerWidth > 1080) setRailCollapsed(!n); setRailOpen(n); }} title={railOpen ? "Collapse sidebar" : "Expand sidebar"} aria-label="Toggle sidebar">
            <Icon d="prompt" size={20} sw={2} style={{ color: "#fff" }} />
          </button>
          <span>
            <div className="name"><b>Prompt</b> Vault</div>
            <div className="sub">{prompts.filter((p) => !p.archived).length} prompts · local</div>
          </span>
        </div>

        <div className="topbar-search">
          <SearchBar value={query} onChange={setQuery} mode={mode} setMode={setMode} inputRef={searchRef} />
        </div>

        <div className="topbar-actions" ref={overflowRef}>
          <button className="btn btn-ghost" title="Ingest prompts" onClick={() => setShowImport(true)}><Icon d="import" size={16} /> <span className="btn-label">Ingest</span></button>
          <button className="btn btn-primary" title="New prompt" onClick={newPrompt}><Icon d="plus" size={16} /> <span className="btn-label">New</span></button>
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
            <Icon d={theme === "light" ? "moon" : "sun"} size={18} />
          </button>
          <button className="icon-btn topbar-overflow" aria-label="More actions" aria-haspopup="true" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((v) => !v)}>
            <Icon d="more" size={18} />
          </button>
          {overflowOpen && (
            <div className="topbar-overflow-menu" role="menu">
              <button role="menuitem" onClick={() => { setShowImport(true); setOverflowOpen(false); }}><Icon d="import" size={16} /> Ingest</button>
            </div>
          )}
        </div>
      </header>

      {/* body */}
      <div className={bodyClass}>
        <Rail
          counts={counts} source={source} setSource={(s) => { setSource(s); if (window.innerWidth <= 1080) setRailOpen(false); }}
          status={status} setStatus={(s) => { setStatus(s); if (window.innerWidth <= 1080) setRailOpen(false); }}
          allTags={allTags} activeTags={activeTags}
          toggleTag={(t) => setActiveTags((ts) => ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t])}
        />

        <main className="list-col">
          <div className="list-head">
            <h2>{searching ? "Results" : heading}</h2>
            <span className="count">
              {searching ? `${view.length} match${view.length !== 1 ? "es" : ""} · ${mode}` : `${view.length}`}
            </span>
            {!searching && (
              <button className="sort sortbtn" onClick={cycleSort} title="Change sort"><Icon d="sort" size={14} /> {SORT_LABELS[sortBy]}</button>
            )}
          </div>

          {view.length === 0 ? (
            <div className="empty">
              <div className="inner">
                <span className="glyph"><Icon d={searching ? "search" : "vault"} size={26} /></span>
                <h3>{searching ? "Nothing matches" : "No prompts here yet"}</h3>
                <p>{searching
                  ? "Try fewer words, or switch to Semantic mode to match on meaning rather than exact terms."
                  : "Create a prompt, or ingest your Codex, OpenCode, or Claude Code history to fill the vault."}</p>
                {!searching && <button className="btn btn-primary" onClick={newPrompt} style={{ marginTop: 4 }}><Icon d="plus" size={16} /> New prompt</button>}
              </div>
            </div>
          ) : (
            <div className="cards">
              {view.map(({ prompt, result }, i) => (
                <Card
                  key={prompt.id} prompt={prompt} result={result}
                  selected={prompt.id === selId} searching={searching} terms={terms} idx={i}
                  animateIn={staggerOn}
                  onClick={() => { setSelId(prompt.id); setDetailMobileOpen(true); }}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="detail">
          {selected
            ? <Detail prompt={selected} onUpdate={update} onAction={action} toast={toast} />
            : (
              <div className="empty">
                <div className="inner">
                  <span className="glyph"><Icon d="prompt" size={26} /></span>
                  <h3>Nothing selected</h3>
                  <p>Select a prompt to view, copy, and edit it here.</p>
                </div>
              </div>
            )}
        </aside>

        {/* mobile drawer scrims */}
        <div className="drawer-scrim rail-scrim" onClick={() => setRailOpen(false)} />
        <div className="drawer-scrim detail-scrim" onClick={() => setDetailMobileOpen(false)} />
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onScan={scanSource} />}
      <Toasts items={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
