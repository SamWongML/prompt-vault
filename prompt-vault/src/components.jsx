/* ============================================================
   components.jsx — UI building blocks for Prompt Vault
   Exports components to window for app.jsx to consume.
   ============================================================ */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---------- icons (stroke, 24 grid) ---------- */
const I = {
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35",
  vault: "M4 5h16v14H4zM9 5v14M14 9.5h.01M14 14.5h.01",
  sidebar: "M4 5h16v14H4zM9.5 5v14",
  prompt: "M6.5 8.5l3.6 3.5-3.6 3.5M13 16.4h4.6",
  plus: "M12 5v14M5 12h14",
  sun: "M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M20 6L9 17l-5-5",
  pin: "M9 4h6l-1 6 3 3v2H7v-2l3-3z M12 15v5",
  archive: "M3 7h18v3H3zM5 10v10h14V10M9 14h6",
  trash: "M4 7h16M9 7V4h6v3m-8 0v13h10V7",
  edit: "M4 20h4L18 10l-4-4L4 16zM14 6l4 4",
  dup: "M8 8h12v12H8zM4 4h12v12",
  layers: "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  x: "M6 6l12 12M18 6L6 18",
  import: "M12 3v12m0 0l-4-4m4 4l4-4M5 21h14",
  sort: "M3 7h12M3 12h8M3 17h4M17 6v12m0 0l3-3m-3 3l-3-3",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  doc: "M6 2h9l5 5v15H6zM15 2v5h5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  chevron: "M9 6l6 6-6 6",
  panelRight: "M4 5h16v14H4zM15 5v14",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
function Icon({ d, size = 18, sw = 1.7, fill = "none", style }) {
  const paths = I[d] || d;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths.split(" M").map((seg, i) => <path key={i} d={(i ? "M" : "") + seg} />)}
    </svg>
  );
}

/* ---------- helpers ---------- */
function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 90) return "just now";
  const m = s / 60; if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24; if (d < 30) return `${Math.round(d)}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
function extractVars(text) {
  const set = new Set(); let m;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(text))) set.add(m[1]);
  return [...set];
}
function highlight(text, terms) {
  if (!terms || !terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark className="hl" key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>
  );
}
const SRC_META = {
  codex:    { label: "codex",    cls: "src-codex",    color: "var(--clay)" },
  opencode: { label: "opencode", cls: "src-opencode", color: "var(--sage)" },
  manual:   { label: "manual",   cls: "src-manual",   color: "var(--text-3)" },
};

/* ---------- format renderers (copy targets) ---------- */
function fillVars(text, values) {
  return text.replace(VAR_RE, (m, name) => (values && values[name]) ? values[name] : m);
}
function asFormat(prompt, fmt, values) {
  const body = fillVars(prompt.content, values);
  if (fmt === "markdown") return `## ${prompt.title}\n\n${body}`;
  if (fmt === "xml") return `<prompt name="${prompt.title}">\n${body}\n</prompt>`;
  if (fmt === "json") return JSON.stringify({ title: prompt.title, tags: prompt.tags, prompt: body }, null, 2);
  return body; // raw
}

/* ---------- SearchBar + modes ---------- */
const SEARCH_MODES = [["hybrid", "Hybrid"], ["keyword", "Keyword"], ["semantic", "Semantic"]];

const SEARCH_PH_LONG = "Search prompts by keyword or meaning…";
const SEARCH_PH_SHORT = "Search prompts…";

function SearchBar({ value, onChange, mode, setMode, inputRef }) {
  const [focused, setFocused] = useState(false);
  // The placeholder swaps to the short form only when the *field itself* is too
  // narrow to show the long text — measured directly (ResizeObserver on the
  // input, compared against the long string's actual rendered width) rather than
  // guessed from a viewport breakpoint. So it stays correct however the flex
  // header distributes space, and reclaims the long text the moment the ⌘K badge
  // sheds and frees room. CSS can't vary placeholder text; the input keeps a
  // full, stable aria-label regardless.
  const [compact, setCompact] = useState(false);
  const modesRef = useRef(null);

  useEffect(() => {
    const el = inputRef && inputRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    // px the long placeholder needs in the input's own font (+ caret breathing room)
    const needWidth = () => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return ctx.measureText(SEARCH_PH_LONG).width + 16;
    };
    let need = needWidth();
    const evaluate = () => setCompact(el.getBoundingClientRect().width < need);
    const ro = new ResizeObserver(evaluate);
    ro.observe(el);
    // web fonts load async; their metrics can shift the threshold — re-measure once ready
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { need = needWidth(); evaluate(); });
    return () => ro.disconnect();
  }, [inputRef]);

  const placeholder = compact ? SEARCH_PH_SHORT : SEARCH_PH_LONG;

  // radiogroup keyboard pattern: arrows move + select + focus, with wraparound
  const onModeKey = (e) => {
    const keys = SEARCH_MODES.map(([k]) => k);
    const i = keys.indexOf(mode);
    let next;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % keys.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + keys.length) % keys.length;
    else return;
    e.preventDefault();
    setMode(keys[next]);
    const btns = modesRef.current && modesRef.current.querySelectorAll("button");
    if (btns && btns[next]) btns[next].focus();
  };

  return (
    <>
      <div className="search-wrap" role="search">
        <div className={`search ${focused ? "focused" : ""}`}>
          <Icon d="search" style={{}} />
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            aria-label="Search prompts by keyword or meaning"
            aria-keyshortcuts="Meta+K Control+K"
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {value
            ? <button className="kbd kbd-esc" aria-label="Clear search" style={{ cursor: "pointer" }} onClick={() => onChange("")}>esc</button>
            : <span className="kbd kbd-hint" aria-hidden="true">⌘K</span>}
        </div>
      </div>
      <div className="modes" role="radiogroup" aria-label="Search mode" title="Search strategy" ref={modesRef} onKeyDown={onModeKey}>
        {SEARCH_MODES.map(([k, l]) => (
          <button key={k} role="radio" aria-checked={mode === k} tabIndex={mode === k ? 0 : -1} className={mode === k ? "on" : ""} onClick={() => setMode(k)} title={l}>
            <span className="dot" style={{ background: k === "keyword" ? "var(--clay)" : k === "semantic" ? "var(--sage)" : "linear-gradient(135deg, var(--clay) 0 50%, var(--sage) 50% 100%)" }} />
            <span className="modes-label">{l}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Sidebar / rail ---------- */
function Rail({ counts, sources, source, setSource, status, setStatus, allTags, activeTags, toggleTag }) {
  const srcRows = [
    ["all", "All prompts", "vault"],
    ["codex", "Codex", "spark"],
    ["opencode", "OpenCode", "layers"],
    ["manual", "Manual", "edit"],
  ];
  return (
    <aside className="rail">
      <div className="rail-group">
        <div className="label">Library</div>
        {srcRows.map(([k, label, ic]) => (
          <button key={k} className={`nav-item ${source === k ? "on" : ""}`} onClick={() => setSource(k)}>
            <span className="ico" style={{ color: k === "codex" ? "var(--clay)" : k === "opencode" ? "var(--sage)" : undefined }}>
              <Icon d={ic} size={16} />
            </span>
            {label}
            <span className="ct">{counts.bySource[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="rail-group">
        <div className="label">Status</div>
        {[["active", "Active", "doc"], ["pinned", "Pinned", "pin"], ["archived", "Archived", "archive"]].map(([k, label, ic]) => (
          <button key={k} className={`nav-item ${status === k ? "on" : ""}`} onClick={() => setStatus(k)}>
            <span className="ico"><Icon d={ic} size={16} /></span>
            {label}
            <span className="ct">{counts.byStatus[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="rail-group">
          <div className="label">Tags</div>
          <div className="tag-cloud">
            {allTags.map((t) => (
              <button key={t} className={`tag-chip ${activeTags.includes(t) ? "on" : ""}`} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------- Prompt card ---------- */
function Card({ result, prompt, selected, onClick, searching, terms, idx, animateIn }) {
  const src = SRC_META[prompt.source] || SRC_META.manual;
  const snippet = prompt.content.replace(VAR_RE, "$1").trim();
  return (
    <article
      className={`card ${animateIn ? "enter" : ""} ${selected ? "sel" : ""}`}
      style={animateIn ? { animationDelay: `${Math.min(idx, 10) * 26}ms` } : undefined}
      onClick={onClick}
    >
      {searching && result && (
        <div className="rel">
          <div className="signals">
            {result.signals.includes("kw") && <span className="sig sig-kw">keyword</span>}
            {result.signals.includes("sem") && <span className="sig sig-sem">meaning</span>}
          </div>
          <div className="relbar" title={`relevance ${(result.relevance * 100) | 0}%`}>
            <i style={{ width: `${Math.max(12, result.relevance * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="card-top">
        {prompt.pinned && <span className="pin-dot" title="Pinned"><Icon d="pin" size={14} fill="currentColor" sw={1.7} /></span>}
        <h3 className="card-title" style={{ paddingRight: searching ? 120 : 0 }}>
          {searching && terms ? highlight(prompt.title, terms) : prompt.title}
        </h3>
      </div>
      <div className="card-snippet">
        {searching && terms ? highlight(snippet, terms) : snippet}
      </div>
      <div className="card-foot">
        <span className={`src-badge ${src.cls}`}><span className="d" style={{ background: src.color }} />{src.label}</span>
        <span className="card-meta">{relTime(prompt.lastUsed)}</span>
        {prompt.useCount > 0 && <><span className="meta-dot">·</span><span className="card-meta">{prompt.useCount} uses</span></>}
        <span className="mini-tags">
          {prompt.tags.slice(0, 3).map((t) => <span key={t} className="mini-tag">{t}</span>)}
        </span>
      </div>
    </article>
  );
}

/* ---------- Detail pane ---------- */
function Detail({ prompt, onUpdate, onAction, toast }) {
  const [fmt, setFmt] = useState("raw");
  const [values, setValues] = useState({});
  const [editing, setEditing] = useState(false);
  const [newTag, setNewTag] = useState("");
  const bodyRef = useRef(null);
  const titleRef = useRef(null);

  const vars = useMemo(() => extractVars(prompt.content), [prompt.content]);
  useEffect(() => { setValues({}); setFmt("raw"); setEditing(false); }, [prompt.id]);

  const renderBody = () => {
    const text = prompt.content;
    const parts = []; let last = 0; let m;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const name = m[1];
      const filled = values[name];
      parts.push(<span className="var" key={m.index}>{filled || `{{${name}}}`}</span>);
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.map((p, i) => <React.Fragment key={i}>{p}</React.Fragment>);
  };

  const copy = async () => {
    const out = asFormat(prompt, fmt, values);
    try { await navigator.clipboard.writeText(out); }
    catch { const ta = document.createElement("textarea"); ta.value = out; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    onUpdate(prompt.id, { useCount: prompt.useCount + 1, lastUsed: Date.now() }, true);
    toast(`Copied as ${fmt === "raw" ? "raw text" : fmt}`, "copy");
  };

  const commitEdit = () => {
    const content = bodyRef.current ? bodyRef.current.innerText : prompt.content;
    const title = titleRef.current ? titleRef.current.innerText.trim() : prompt.title;
    onUpdate(prompt.id, { content, title: title || prompt.title });
    setEditing(false);
    toast("Saved", "check");
  };

  const src = SRC_META[prompt.source] || SRC_META.manual;

  return (
    <div className="detail-inner swap" key={prompt.id}>
      <div className="detail-head">
        <h1
          className="detail-title"
          ref={titleRef}
          contentEditable={editing}
          suppressContentEditableWarning
        >{prompt.title}</h1>
        <div className="detail-actions">
          <button className={`act ${prompt.pinned ? "on" : ""}`} title={prompt.pinned ? "Unpin" : "Pin"} aria-pressed={prompt.pinned}
            onClick={() => onAction("pin", prompt)}><Icon d="pin" size={16} fill={prompt.pinned ? "currentColor" : "none"} sw={1.7} /></button>
          <button className={`act ${editing ? "on" : ""}`} title={editing ? "Save" : "Edit"}
            onClick={() => editing ? commitEdit() : setEditing(true)}><Icon d={editing ? "check" : "edit"} size={16} /></button>
          <button className="act" title="Duplicate" onClick={() => onAction("duplicate", prompt)}><Icon d="dup" size={15} /></button>
          <button className="act" title={prompt.archived ? "Unarchive" : "Archive"} onClick={() => onAction("archive", prompt)}><Icon d="archive" size={16} /></button>
          <button className="act danger" title="Delete" onClick={() => onAction("delete", prompt)}><Icon d="trash" size={16} /></button>
        </div>
      </div>

      <div className="detail-metarow">
        <span className={`src-badge ${src.cls}`}><span className="d" style={{ background: src.color }} />{src.label}</span>
        {prompt.project && <span className="card-meta" title="origin working directory">{prompt.project}</span>}
      </div>

      {/* format selector + body */}
      <div>
        <div className="detail-section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span>Prompt</span>
          <div className="fmt-tabs">
            {[["raw", "Raw"], ["markdown", "Markdown"], ["xml", "XML"], ["json", "JSON"]].map(([k, l]) => (
              <button key={k} className={fmt === k ? "on" : ""} onClick={() => setFmt(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div
          className="code-block"
          ref={bodyRef}
          contentEditable={editing}
          suppressContentEditableWarning
        >
          {editing ? prompt.content : (fmt === "raw" ? renderBody() : asFormat(prompt, fmt, values))}
        </div>
      </div>

      {/* variable fill-ins */}
      {vars.length > 0 && !editing && (
        <div className="vars-panel">
          <div className="vh"><Icon d="spark" size={13} /> Fill variables — they flow into every copy format</div>
          {vars.map((v) => (
            <div className="var-field" key={v}>
              <label>{`{{${v}}}`}</label>
              <input value={values[v] || ""} placeholder={`value for ${v}`} onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}

      <div className="copy-row">
        <button className="btn btn-primary copy-btn" onClick={copy}>
          <Icon d="copy" size={16} /> Copy {fmt === "raw" ? "" : `as ${fmt}`}
        </button>
      </div>

      {/* tags */}
      <div>
        <div className="detail-section-label" style={{ marginBottom: 8 }}>Tags</div>
        <div className="tag-editor">
          {prompt.tags.map((t) => (
            <span className="et" key={t}>{t}
              <button onClick={() => onUpdate(prompt.id, { tags: prompt.tags.filter((x) => x !== t) })}><Icon d="x" size={12} /></button>
            </span>
          ))}
          <input
            value={newTag} placeholder="add tag"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                const t = newTag.trim().toLowerCase();
                if (!prompt.tags.includes(t)) onUpdate(prompt.id, { tags: [...prompt.tags, t] });
                setNewTag("");
              }
            }}
          />
        </div>
      </div>

      {/* meta */}
      <div>
        <div className="detail-section-label" style={{ marginBottom: 8 }}>Details</div>
        <dl className="kv">
          <dt>used</dt><dd>{prompt.useCount} times · last {relTime(prompt.lastUsed)}</dd>
          <dt>created</dt><dd>{relTime(prompt.createdAt)}</dd>
          <dt>length</dt><dd>{prompt.content.length} chars · ~{Math.max(1, Math.round(prompt.content.split(/\s+/).length * 1.3))} tokens</dd>
          {vars.length > 0 && <><dt>variables</dt><dd>{vars.join(", ")}</dd></>}
        </dl>
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
function Toasts({ items }) {
  return (
    <div className="toasts">
      {items.map((t) => (
        <div className="toast" key={t.id}><Icon d={t.icon || "check"} size={16} />{t.msg}</div>
      ))}
    </div>
  );
}

/* ---------- Import modal ---------- */
function ImportModal({ onClose, onPick }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Ingest prompts</h3>
          <p>Pull your own prompts out of local agent histories. Drop a real <code>.jsonl</code> here anytime, or load a sample to see the parse.</p>
        </div>
        <div className="modal-body">
          <button className="src-opt" onClick={() => onPick("codex")}>
            <span className="si" style={{ background: "var(--clay-wash)", color: "var(--clay)" }}><Icon d="spark" size={20} /></span>
            <span>
              <div className="st">Codex CLI history</div>
              <div className="sd">~/.codex/sessions/**/rollout-*.jsonl</div>
            </span>
            <span style={{ marginLeft: "auto", color: "var(--text-3)" }}><Icon d="chevron" size={16} /></span>
          </button>
          <button className="src-opt" onClick={() => onPick("opencode")}>
            <span className="si" style={{ background: "var(--sage-wash)", color: "var(--sage)" }}><Icon d="layers" size={20} /></span>
            <span>
              <div className="st">OpenCode history</div>
              <div className="sd">session transcripts (.jsonl)</div>
            </span>
            <span style={{ marginLeft: "auto", color: "var(--text-3)" }}><Icon d="chevron" size={16} /></span>
          </button>
          <label className="src-opt" style={{ cursor: "pointer" }}>
            <span className="si" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}><Icon d="import" size={20} /></span>
            <span>
              <div className="st">Choose a .jsonl file…</div>
              <div className="sd">parsed locally — nothing leaves your machine</div>
            </span>
            <input type="file" accept=".jsonl,.json,application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) onPick("file", f); }} />
          </label>
        </div>
        <div className="modal-foot">
          <span className="hint">user prompts only · envelopes &amp; assistant turns skipped</span>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Drop overlay ---------- */
function DropOverlay({ over }) {
  return (
    <div className="dropzone">
      <div className={`box ${over ? "over" : ""}`}>
        <span className="bigico"><Icon d="import" size={30} /></span>
        <h3>Drop your .jsonl</h3>
        <p>Codex or OpenCode session files — we'll extract just your prompts.</p>
      </div>
    </div>
  );
}

/* ---------- export ---------- */
Object.assign(window, {
  Icon, SearchBar, Rail, Card, Detail, Toasts, ImportModal, DropOverlay,
  relTime, extractVars, asFormat, SRC_META,
});
