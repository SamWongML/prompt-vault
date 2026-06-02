/* ============================================================
   data.js — seed prompts + the vault-entry factory.
   History ingestion lives server-side now (see server/ingest.mjs);
   the browser only creates/edits entries, it no longer parses files.
   Exposes: window.PV_SEED, window.uid, window.pvMk
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

  window.PV_SEED = SEED;
  window.uid = uid;
  window.pvMk = mk;
})();
