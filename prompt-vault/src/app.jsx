/* ============================================================
   app.jsx — Prompt Vault application
   ============================================================ */
const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM, useCallback: uC } = React;

const LS_KEY = "promptVault.v1";
const LS_THEME = "promptVault.theme";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch {}
  return window.PV_SEED;
}

function App() {
  const [prompts, setPrompts] = uS(loadState);
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
  const [drag, setDrag] = uS(false);
  const [railOpen, setRailOpen] = uS(() => (typeof window !== "undefined" ? window.innerWidth > 1080 : true));
  const [detailMobileOpen, setDetailMobileOpen] = uS(false); // detail overlay visibility on narrow screens
  const [staggerOn, setStaggerOn] = uS(true); // card entrance plays on first load only
  const [overflowOpen, setOverflowOpen] = uS(false); // topbar ⋯ menu (narrow widths only)

  const searchRef = uR(null);
  const overflowRef = uR(null);
  const engine = uM(() => new window.PVSearch(), []);
  engine.build(prompts);

  /* persistence */
  uE(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(prompts)); } catch {} }, [prompts]);
  uE(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  /* track topbar height so mobile drawers sit flush beneath it */
  uE(() => {
    const setH = () => { const tb = document.querySelector(".topbar"); if (tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px"); };
    setH(); window.addEventListener("resize", setH);
    return () => window.removeEventListener("resize", setH);
  }, []);

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

  /* keyboard: cmd/ctrl-K focus, esc clear */
  uE(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (e.key === "Escape" && document.activeElement === searchRef.current && query) { setQuery(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query]);

  /* counts for sidebar (respect search-independent buckets)
     Library counts stay global; Status counts reflect the selected library so
     the numbers can never promise more than the list will show (e.g. Pinned
     reads 0 under OpenCode when every pinned prompt is Manual). */
  const counts = uM(() => {
    const bySource = { all: 0, codex: 0, opencode: 0, manual: 0 };
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

  /* graceful detail close: keep the last prompt mounted and animate it out when
     the selection clears (e.g. the list becomes empty) instead of snapping shut */
  const [exiting, setExiting] = uS(null);
  const prevSel = uR(null);
  const exitTimer = uR(null);
  uE(() => {
    if (selected) {
      prevSel.current = selected;
      if (exitTimer.current) { clearTimeout(exitTimer.current); exitTimer.current = null; }
      setExiting(null);
    } else if (prevSel.current && !exitTimer.current) {
      setExiting(prevSel.current);
      prevSel.current = null;
      setDetailMobileOpen(false); // mobile: slide the drawer out
      exitTimer.current = setTimeout(() => { setExiting(null); exitTimer.current = null; }, 240);
    }
  }, [selected]);
  const panelPrompt = selected || exiting;
  const closing = !selected && !!exiting;

  /* mutations */
  const update = uC((id, patch, silent) => {
    setPrompts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const action = uC((kind, p) => {
    if (kind === "pin") { update(p.id, { pinned: !p.pinned }); toast(p.pinned ? "Unpinned" : "Pinned to top", "pin"); }
    else if (kind === "archive") { update(p.id, { archived: !p.archived }); toast(p.archived ? "Restored" : "Archived", "archive"); }
    else if (kind === "delete") {
      setPrompts((ps) => ps.filter((x) => x.id !== p.id)); toast("Deleted", "trash");
    } else if (kind === "duplicate") {
      const copy = { ...p, id: window.uid(), title: p.title + " (copy)", pinned: false, useCount: 0, createdAt: Date.now(), lastUsed: Date.now() };
      setPrompts((ps) => { const i = ps.findIndex((x) => x.id === p.id); const n = [...ps]; n.splice(i + 1, 0, copy); return n; });
      setSelId(copy.id); toast("Duplicated", "dup");
    }
  }, [update, toast]);

  const newPrompt = uC(() => {
    const p = window.pvMk({ title: "New prompt", content: "Write your prompt here. Use {{variables}} for fill-ins.", source: "manual", tags: [] });
    setPrompts((ps) => [p, ...ps]);
    setSource("all"); setStatus("active"); setActiveTags([]); setQuery("");
    setSelId(p.id); setDetailMobileOpen(true);
    toast("Draft created", "plus");
  }, [toast]);

  /* ingestion */
  const ingestText = uC((text, src) => {
    const parsed = window.parseJSONL(text, src);
    if (!parsed.length) { toast("No user prompts found in that file", "x"); return; }
    setPrompts((ps) => {
      const existing = new Set(ps.map((p) => p.content.slice(0, 120)));
      const fresh = parsed.filter((p) => !existing.has(p.content.slice(0, 120)));
      if (!fresh.length) { toast("Already imported", "check"); return ps; }
      setTimeout(() => toast(`Ingested ${fresh.length} prompt${fresh.length > 1 ? "s" : ""} from ${src}`, "import"), 0);
      setSource(src); setStatus("active"); setActiveTags([]); setQuery("");
      return [...fresh, ...ps];
    });
  }, [toast]);

  const onPick = uC((kind, file) => {
    setShowImport(false);
    if (kind === "codex") ingestText(window.SAMPLE_CODEX, "codex");
    else if (kind === "opencode") ingestText(window.SAMPLE_OPENCODE, "opencode");
    else if (kind === "file" && file) {
      const r = new FileReader();
      r.onload = () => ingestText(String(r.result), /code/i.test(file.name) ? "opencode" : "codex");
      r.readAsText(file);
    }
  }, [ingestText]);

  /* global drag-drop */
  uE(() => {
    let depth = 0;
    const over = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); depth++; setDrag(true); } };
    const leave = (e) => { depth--; if (depth <= 0) { depth = 0; setDrag(false); } };
    const drop = (e) => {
      e.preventDefault(); depth = 0; setDrag(false);
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { const r = new FileReader(); r.onload = () => ingestText(String(r.result), /code/i.test(f.name) ? "opencode" : "codex"); r.readAsText(f); }
    };
    const dragover = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); };
    window.addEventListener("dragenter", over);
    window.addEventListener("dragover", dragover);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", over);
      window.removeEventListener("dragover", dragover);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [ingestText]);

  const SORT_LABELS = { recent: "Recent", uses: "Most used", created: "Newest", az: "A–Z" };
  const cycleSort = () => {
    const order = ["recent", "uses", "created", "az"];
    setSortBy(order[(order.indexOf(sortBy) + 1) % order.length]);
  };

  const heading = source === "all"
    ? (status === "archived" ? "Archived" : status === "pinned" ? "Pinned" : "All prompts")
    : ({ codex: "Codex", opencode: "OpenCode", manual: "Manual" }[source]);

  const bodyClass = [
    "body",
    railOpen ? "" : "rail-collapsed",
    selected ? "" : "no-detail",
    detailMobileOpen ? "detail-open" : "",
  ].join(" ");

  return (
    <div className="app">
      {/* top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <button className="mark" onClick={() => setRailOpen((v) => !v)} title={railOpen ? "Collapse sidebar" : "Expand sidebar"} aria-label="Toggle sidebar">
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
                  : "Create a prompt, or ingest your Codex / OpenCode history to fill the vault."}</p>
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

        {panelPrompt && (
          <aside className={`detail ${closing ? "closing" : ""}`}>
            <button className="icon-btn detail-close" onClick={() => setDetailMobileOpen(false)} title="Back to list"><Icon d="x" size={16} /></button>
            <Detail prompt={panelPrompt} onUpdate={update} onAction={action} toast={toast} />
          </aside>
        )}

        {/* mobile drawer scrims */}
        <div className="drawer-scrim rail-scrim" onClick={() => setRailOpen(false)} />
        <div className="drawer-scrim detail-scrim" onClick={() => setDetailMobileOpen(false)} />
      </div>

      {drag && <DropOverlay over={drag} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onPick={onPick} />}
      <Toasts items={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
