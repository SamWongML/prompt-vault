/* ============================================================
   data.js — seed prompts + real JSONL ingestion
   Exposes: window.PV_SEED, window.parseJSONL, window.uid, window.SAMPLE_CODEX, window.SAMPLE_OPENCODE
   ============================================================ */
(function () {
  const now = Date.now();
  const day = 86400000;
  let _id = 0;
  const uid = () => `p_${Date.now().toString(36)}_${(_id++).toString(36)}`;

  function mk(o) {
    return Object.assign({
      id: uid(),
      title: "Untitled",
      content: "",
      tags: [],
      source: "manual",        // manual | codex | opencode
      project: null,
      createdAt: now,
      lastUsed: now,
      useCount: 0,
      pinned: false,
      archived: false,
    }, o);
  }

  const SEED = [
    mk({
      title: "Senior code reviewer",
      source: "manual", pinned: true, useCount: 41, lastUsed: now - day * 0.4,
      tags: ["review", "system", "quality"], project: "~/work/api",
      content:
`You are a meticulous senior engineer reviewing a pull request for {{language}}.
Focus on, in order: correctness, security, then readability.

For each issue:
- quote the exact line
- explain the risk in one sentence
- propose a concrete fix

Be direct. Skip praise. If the diff is sound, say so in one line.`,
    }),
    mk({
      title: "Security audit checklist",
      source: "manual", pinned: true, useCount: 18, lastUsed: now - day * 2.1,
      tags: ["security", "review", "audit"],
      content:
`Audit the attached code for vulnerabilities. Check specifically:
- injection (SQL, command, template)
- missing authn/authz on sensitive routes
- secrets or tokens committed to source
- unsafe deserialization
- unsanitized user input reaching the DOM

Report findings as a ranked list, highest severity first, with a one-line remediation each.`,
    }),
    mk({
      title: "Conventional commit message",
      source: "codex", useCount: 96, lastUsed: now - day * 0.1,
      tags: ["git", "commit"], project: "~/work/web",
      content:
`Write a Conventional Commits message for the staged diff.
Format: type(scope): summary  (≤ 60 chars, imperative mood)
Then a blank line and 1–3 bullet points explaining *why*, not what.
Allowed types: feat, fix, refactor, perf, docs, test, chore.`,
    }),
    mk({
      title: "Optimize a slow SQL query",
      source: "manual", useCount: 12, lastUsed: now - day * 5,
      tags: ["sql", "performance", "database"],
      content:
`Here is a Postgres query that runs slowly:

{{query}}

Explain the likely bottleneck, suggest indexes to add, and rewrite the query to be faster. Show the EXPLAIN reasoning briefly. Assume the table has ~10M rows.`,
    }),
    mk({
      title: "Refactor for readability",
      source: "codex", useCount: 33, lastUsed: now - day * 1.2,
      tags: ["refactor", "cleanup"], project: "~/work/api",
      content:
`Refactor the selected function for readability without changing behavior.
- extract well-named helpers
- remove nesting with early returns
- name things for intent, not type
Return only the rewritten code plus a 2-line note on what changed.`,
    }),
    mk({
      title: "Write Jest unit tests",
      source: "codex", useCount: 27, lastUsed: now - day * 3,
      tags: ["testing", "jest", "javascript"], project: "~/work/web",
      content:
`Write Jest unit tests for the selected module.
Cover the happy path, edge cases, and one failure mode.
Use describe/it, mock external calls, and prefer table-driven cases with it.each.
Aim for meaningful assertions, not coverage padding.`,
    }),
    mk({
      title: "Debug this stack trace",
      source: "opencode", useCount: 51, lastUsed: now - day * 0.7,
      tags: ["debug", "errors"], project: "~/side/scraper",
      content:
`I'm getting this error:

{{stacktrace}}

Walk back from the top frame, form a hypothesis for the root cause, and tell me the single most likely fix. If you need to see a file, name it and I'll paste it.`,
    }),
    mk({
      title: "Explain this regex",
      source: "opencode", useCount: 22, lastUsed: now - day * 8,
      tags: ["regex", "explain"],
      content:
`Explain this regular expression token by token, in plain English:

{{pattern}}

Then give one example string that matches and one that doesn't, and note any catastrophic-backtracking risk.`,
    }),
    mk({
      title: "Generate TypeScript types from JSON",
      source: "manual", useCount: 15, lastUsed: now - day * 4,
      tags: ["typescript", "types"],
      content:
`Given this JSON sample, generate idiomatic TypeScript interfaces.
- mark optional fields with ?
- use union literals for enum-like strings
- prefer interfaces over types for objects
Don't invent fields that aren't present.

{{json}}`,
    }),
    mk({
      title: "Dockerfile for a Node service",
      source: "codex", useCount: 9, lastUsed: now - day * 11,
      tags: ["docker", "devops"], project: "~/work/api",
      content:
`Write a production Dockerfile for a Node 20 service.
- multi-stage build, npm ci with cache
- run as non-root user
- only copy what's needed into the final image
- expose PORT from env, default 3000
Keep the final image small and add a brief comment per stage.`,
    }),
    mk({
      title: "Summarize a PR diff for the team",
      source: "opencode", useCount: 19, lastUsed: now - day * 1.9,
      tags: ["git", "summarize", "docs"],
      content:
`Summarize this diff for a teammate who hasn't seen the code.
Lead with the user-facing change in one sentence.
Then: what changed technically, any risk areas, and what to look at first in review. Keep it under 120 words.`,
    }),
    mk({
      title: "Convert callbacks to async/await",
      source: "codex", useCount: 14, lastUsed: now - day * 6,
      tags: ["refactor", "javascript"], project: "~/side/scraper",
      content:
`Convert the selected callback-style code to async/await.
Preserve error handling semantics (no swallowed errors), use try/catch where a callback received an error arg, and keep concurrency where the original ran things in parallel.`,
    }),
    mk({
      title: "Tailwind component from a description",
      source: "opencode", useCount: 8, lastUsed: now - day * 9,
      tags: ["frontend", "css", "react"],
      content:
`Build a React + Tailwind component for: {{description}}.
- semantic HTML, accessible by default (labels, roles, focus states)
- responsive with mobile-first classes
- no arbitrary values unless unavoidable
Return one self-contained component.`,
    }),
    mk({
      title: "Bash one-liner",
      source: "codex", useCount: 38, lastUsed: now - day * 0.9,
      tags: ["bash", "shell"],
      content:
`Give me a single safe bash one-liner that: {{task}}.
Explain it in one line after. Prefer POSIX tools, quote variables, and avoid anything destructive without a confirmation step.`,
    }),
    mk({
      title: "Onboarding explainer",
      source: "manual", useCount: 6, lastUsed: now - day * 14,
      tags: ["docs", "explain"],
      content:
`Explain the selected module as if onboarding a new engineer.
Start with its one job, then how data flows through it, then the two gotchas that would bite a newcomer. Use plain language and avoid restating the code.`,
    }),
    mk({
      title: "FastAPI endpoint scaffold",
      source: "manual", useCount: 11, lastUsed: now - day * 7,
      tags: ["python", "api"], project: "~/work/ml",
      content:
`Scaffold a FastAPI endpoint for: {{resource}}.
- Pydantic request/response models
- dependency-injected DB session
- proper status codes and a 404 path
- a docstring usable as OpenAPI summary
Return the router code only.`,
    }),
    mk({
      title: "Rubber-duck a design decision",
      source: "opencode", useCount: 7, lastUsed: now - day * 16,
      tags: ["architecture", "explain"],
      content:
`I'm deciding between {{option_a}} and {{option_b}} for {{context}}.
Ask me the 3 questions that most change the answer. Then, given typical defaults, tell me which you'd pick and the one thing that would flip your choice.`,
    }),
  ];

  /* -----------------------------------------------------------
     JSONL ingestion — Codex rollout-*.jsonl & OpenCode logs.
     We pull user-authored prompts out of agent transcripts.
     Handles several real shapes seen in the wild.
     ----------------------------------------------------------- */
  function textFromContent(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === "string" ? c : c && (c.text || c.content || c.input_text)) || "")
        .join("")
        .trim();
    }
    if (content && typeof content === "object") return content.text || content.content || "";
    return "";
  }

  // skip the environment/instruction blocks Codex injects as the "user"
  function looksLikeEnvelope(t) {
    if (!t) return true;
    const s = t.trim();
    if (s.length < 3) return true;
    return /^<(environment_context|user_instructions|environment|instructions)>/i.test(s) ||
           /^# Project Context/i.test(s) ||
           /<\/?(environment_context|user_instructions)>/i.test(s);
  }

  function deriveTitle(text) {
    const firstLine = text.split("\n").find((l) => l.trim().length) || text;
    let t = firstLine.trim().replace(/^[#>*\-\s]+/, "");
    if (t.length > 64) t = t.slice(0, 61).trimEnd() + "…";
    return t || "Imported prompt";
  }

  function guessTags(text) {
    const t = text.toLowerCase();
    const map = {
      git: /\b(commit|git|pull request|\bpr\b|diff|rebase|merge)\b/,
      sql: /\b(sql|select |query|postgres|database)\b/,
      refactor: /\b(refactor|clean ?up|simplify|rewrite)\b/,
      testing: /\b(test|jest|pytest|unit test|coverage)\b/,
      debug: /\b(debug|stack ?trace|error|exception|traceback|bug)\b/,
      review: /\b(review|audit|critique)\b/,
      docker: /\b(docker|dockerfile|container)\b/,
      regex: /\b(regex|regular expression|pattern)\b/,
      python: /\b(python|fastapi|flask|django)\b/,
      typescript: /\b(typescript|\bts\b|interface|type)\b/,
      frontend: /\b(react|tailwind|css|component|ui)\b/,
      security: /\b(security|vulnerab|auth|sanitize|injection)\b/,
      bash: /\b(bash|shell|one-liner|command line)\b/,
    };
    const out = [];
    for (const k in map) if (map[k].test(t)) out.push(k);
    return out.slice(0, 4);
  }

  function parseJSONL(text, source) {
    const src = source || "codex";
    const lines = text.split(/\r?\n/);
    let cwd = null;
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      let obj;
      try { obj = JSON.parse(s); } catch { continue; }
      // capture session cwd from a meta line if present
      const meta = obj.payload || obj;
      if (!cwd) cwd = meta.cwd || meta.cwd_path || (meta.git && meta.git.cwd) || cwd;

      // Normalize to a possible message object across formats.
      const candidates = [];
      if (obj.type === "message" || obj.role) candidates.push(obj);
      if (obj.payload && (obj.payload.role || obj.payload.type === "message")) candidates.push(obj.payload);
      if (obj.message && (obj.message.role)) candidates.push(obj.message);
      if (obj.item && obj.item.role) candidates.push(obj.item);

      for (const m of candidates) {
        const role = m.role || (m.author && m.author.role);
        if (role !== "user") continue;
        const txt = textFromContent(m.content != null ? m.content : m.text);
        if (looksLikeEnvelope(txt)) continue;
        if (txt.length < 8) continue;
        const key = txt.slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        const ts = m.timestamp || obj.timestamp || obj.ts;
        const when = ts ? (typeof ts === "number" ? ts : Date.parse(ts)) : now;
        out.push(mk({
          title: deriveTitle(txt),
          content: txt.trim(),
          source: src,
          tags: guessTags(txt),
          project: cwd,
          createdAt: when || now,
          lastUsed: when || now,
          useCount: 0,
        }));
      }
    }
    return out;
  }

  /* sample raw JSONL (looks like real codex/opencode rollout lines) */
  const SAMPLE_CODEX = [
    JSON.stringify({ type: "session_meta", payload: { cwd: "~/work/payments-api", git: { branch: "feat/idempotency" } } }),
    JSON.stringify({ type: "message", role: "user", content: [{ type: "text", text: "<environment_context>os=darwin shell=zsh</environment_context>" }] }),
    JSON.stringify({ type: "message", role: "user", timestamp: now - day * 0.3, content: [{ type: "text", text: "Add an idempotency key to the POST /charges endpoint so retries don't double-charge. Store keys in Redis with a 24h TTL and return the cached response on a repeat key." }] }),
    JSON.stringify({ type: "message", role: "assistant", content: [{ type: "text", text: "Sure — here's the plan…" }] }),
    JSON.stringify({ type: "message", role: "user", timestamp: now - day * 0.25, content: [{ type: "text", text: "Now write an integration test that fires the same request twice concurrently and asserts only one charge is created." }] }),
    JSON.stringify({ type: "message", role: "user", timestamp: now - day * 0.2, content: [{ type: "text", text: "Refactor the webhook handler to verify the Stripe signature before doing any work, and reject with 400 on a bad signature." }] }),
  ].join("\n");

  const SAMPLE_OPENCODE = [
    JSON.stringify({ message: { role: "user", timestamp: now - day * 1.1, content: "Trace why the dataloader returns stale results after a mutation — I think the cache key ignores the tenant id." } }),
    JSON.stringify({ message: { role: "assistant", content: "Let's look at the keyFn…" } }),
    JSON.stringify({ message: { role: "user", timestamp: now - day * 1.05, content: "Write a migration that backfills the tenant_id column from the parent org and makes it NOT NULL afterward." } }),
    JSON.stringify({ message: { role: "user", timestamp: now - day * 1.0, content: "Explain the difference between SERIALIZABLE and REPEATABLE READ for this transaction and which one I actually need here." } }),
  ].join("\n");

  window.PV_SEED = SEED;
  window.parseJSONL = parseJSONL;
  window.uid = uid;
  window.pvMk = mk;
  window.SAMPLE_CODEX = SAMPLE_CODEX;
  window.SAMPLE_OPENCODE = SAMPLE_OPENCODE;
})();
