/* ============================================================
   search.js — lightweight hybrid search, fully client-side.
   • Lexical: BM25 over title + content + tags
   • Semantic: cosine similarity over a curated concept-vector
     (a lightweight stand-in for an embedding model — no network,
      no weights to download; captures meaning beyond exact terms)
   • Fusion: Reciprocal Rank Fusion (RRF) — combines the two
     rankings without score normalization.
   Exposes: window.PVSearch
   ============================================================ */
(function () {
  const STOP = new Set("a an the of to for and or in on at is are be this that with your you i it as from by into can will would should".split(" "));

  function tokenize(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[`*_>#~]/g, " ")
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 1 && !STOP.has(w));
  }

  /* ---- concept space (the "semantic" dimensions) ---- */
  const CONCEPTS = {
    review:      ["review", "audit", "feedback", "critique", "quality", "lint", "improve"],
    git:         ["commit", "git", "pr", "pull", "request", "diff", "branch", "merge", "rebase"],
    refactor:    ["refactor", "clean", "cleanup", "readability", "simplify", "restructure", "rewrite", "tidy"],
    performance: ["optimize", "optimise", "performance", "faster", "fast", "speed", "slow", "efficient", "latency", "bottleneck"],
    testing:     ["test", "tests", "unit", "jest", "pytest", "coverage", "spec", "tdd", "assert"],
    debug:       ["debug", "error", "errors", "stacktrace", "stack", "trace", "traceback", "bug", "exception", "crash", "fix", "broken"],
    database:    ["sql", "query", "database", "db", "postgres", "mysql", "join", "index", "migration", "schema", "transaction"],
    security:    ["security", "secure", "vulnerability", "vulnerabilities", "auth", "exploit", "sanitize", "injection", "token", "secret"],
    docs:        ["document", "documentation", "docs", "explain", "onboard", "onboarding", "readme", "comment", "summarize", "summary"],
    frontend:    ["react", "css", "tailwind", "component", "ui", "frontend", "style", "responsive", "accessible"],
    devops:      ["docker", "dockerfile", "deploy", "ci", "pipeline", "kubernetes", "container", "devops", "image", "build"],
    python:      ["python", "fastapi", "flask", "django", "pip", "pydantic"],
    typescript:  ["typescript", "ts", "type", "types", "interface", "generic"],
    shell:       ["bash", "shell", "command", "script", "cli", "terminal", "oneliner", "posix"],
    regex:       ["regex", "pattern", "match", "expression", "regexp"],
    transform:   ["convert", "transform", "migrate", "port", "translate", "generate", "scaffold"],
    api:         ["api", "endpoint", "rest", "route", "router", "request", "http", "webhook"],
    design:      ["design", "architecture", "decide", "decision", "tradeoff", "approach", "choose"],
  };
  const DIMS = Object.keys(CONCEPTS);
  // word -> list of concept dims it belongs to
  const WORD2DIM = {};
  DIMS.forEach((dim) => CONCEPTS[dim].forEach((w) => {
    (WORD2DIM[w] = WORD2DIM[w] || []).push(dim);
  }));

  function conceptVector(tokens) {
    const v = new Float64Array(DIMS.length);
    for (const tk of tokens) {
      const dims = WORD2DIM[tk];
      if (dims) for (const d of dims) v[DIMS.indexOf(d)] += 1;
    }
    // L2 normalize
    let norm = 0; for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  }
  function cosine(a, b) {
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  class PVSearch {
    constructor() { this.docs = []; this.index = null; }

    // build BM25 stats + concept vectors
    build(items) {
      this.docs = items;
      const N = items.length || 1;
      const df = {};
      const docTokens = [];
      let totalLen = 0;
      items.forEach((it) => {
        const text = `${it.title} ${it.title} ${it.tags.join(" ")} ${it.content}`;
        const toks = tokenize(text);
        totalLen += toks.length;
        const tf = {};
        const uniq = new Set();
        toks.forEach((t) => { tf[t] = (tf[t] || 0) + 1; uniq.add(t); });
        uniq.forEach((t) => { df[t] = (df[t] || 0) + 1; });
        docTokens.push({ tf, len: toks.length, vec: conceptVector(toks) });
      });
      const idf = {};
      for (const t in df) idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      this.index = { N, idf, docTokens, avgdl: totalLen / N || 1 };
    }

    _bm25(qTokens) {
      const { idf, docTokens, avgdl } = this.index;
      const k1 = 1.5, b = 0.75;
      return docTokens.map((d) => {
        let score = 0;
        const matched = [];
        for (const t of qTokens) {
          const f = d.tf[t]; if (!f) continue;
          const w = idf[t] || 0;
          score += w * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgdl));
          matched.push(t);
        }
        return { score, matched };
      });
    }

    _semantic(qTokens) {
      const qv = conceptVector(qTokens);
      const hasQ = qv.some((x) => x !== 0);
      return this.index.docTokens.map((d) => (hasQ ? cosine(qv, d.vec) : 0));
    }

    // returns ranked [{doc, lexical, semantic, fused, matched, signals}]
    query(q, mode) {
      const qTokens = tokenize(q);
      if (!this.index) return [];
      const bm = this._bm25(qTokens);
      const sem = this._semantic(qTokens);

      // rank lists for RRF
      const lexOrder = bm.map((r, i) => [i, r.score]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
      const semOrder = sem.map((s, i) => [i, s]).filter((x) => x[1] > 0.08).sort((a, b) => b[1] - a[1]);
      const lexRank = {}; lexOrder.forEach(([i], r) => (lexRank[i] = r));
      const semRank = {}; semOrder.forEach(([i], r) => (semRank[i] = r));
      const K = 60;

      const maxLex = Math.max(1e-9, ...bm.map((r) => r.score));
      const maxSem = Math.max(1e-9, ...sem);

      const results = this.docs.map((doc, i) => {
        const lexical = bm[i].score;
        const semantic = sem[i];
        let fused = 0;
        if (mode === "keyword") fused = lexical > 0 ? lexRank[i] != null ? 1 / (K + lexRank[i]) : 0 : 0;
        else if (mode === "semantic") fused = semantic > 0.08 ? 1 / (K + semRank[i]) : 0;
        else { // hybrid RRF
          if (lexRank[i] != null) fused += 1 / (K + lexRank[i]);
          if (semRank[i] != null) fused += 1 / (K + semRank[i]);
        }
        const signals = [];
        if (lexical > 0 && mode !== "semantic") signals.push("kw");
        // Match the inclusion threshold (semOrder filters > 0.08) so any result
        // that ranked in via semantic similarity also shows the MEANING signal —
        // otherwise docs in the 0.08–0.12 band appear with no badge at all.
        if (semantic > 0.08 && mode !== "keyword") signals.push("sem");
        return {
          doc, lexical, semantic, fused,
          matched: bm[i].matched,
          relevance: Math.min(1, (lexical / maxLex) * 0.6 + (semantic / maxSem) * 0.4),
          signals,
        };
      });

      return results
        .filter((r) => r.fused > 0)
        .sort((a, b) => b.fused - a.fused || b.relevance - a.relevance);
    }
  }

  window.PVSearch = PVSearch;
  window.pvTokenize = tokenize;
})();
