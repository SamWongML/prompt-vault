/* ============================================================
   data.js — the vault-entry factory.
   History ingestion lives server-side now (see server/ingest.mjs);
   the browser only creates/edits entries, it no longer parses files.
   PV_SEED is empty by design: a fresh install starts with an empty
   vault (see the "No prompts here yet" empty state) — users fill it
   by creating prompts or ingesting their CLI history.
   Exposes: window.PV_SEED, window.uid, window.pvMk
   ============================================================ */
(function () {
  const now = Date.now();
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

  const SEED = [];

  window.PV_SEED = SEED;
  window.uid = uid;
  window.pvMk = mk;
})();
