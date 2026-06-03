/* ============================================================
   data.js — the vault-entry factory.
   History ingestion lives server-side now (see server/ingest.mjs);
   the browser only creates/edits entries, it no longer parses files.
   PV_SEED is empty by design: a fresh install starts with an empty
   vault (see the "No prompts here yet" empty state) — users fill it
   by creating prompts or ingesting their CLI history.
   Exposes: window.PV_SEED, window.uid, window.pvMk, window.pvHash
   ============================================================ */
(function () {
  const now = Date.now();
  let _id = 0;
  const uid = () => `p_${Date.now().toString(36)}_${(_id++).toString(36)}`;

  /* A stable, deterministic identity for a prompt's *content* — the same text
     always hashes to the same key, across reloads and across machines. Unlike
     the random `id` (minted fresh on every ingest), this is what dedup and
     tombstones key on: ingestion re-reads the append-only CLI history on every
     launch, so without a content-stable key we couldn't tell a re-seen prompt
     from a new one, nor remember which ones the user deleted. Whitespace is
     normalized first so cosmetically-equal prompts collapse to one key.
     cyrb53 (a fast 53-bit string hash) → base36; not cryptographic, just a
     compact collision-resistant fingerprint over the full content. */
  function hash(s) {
    s = String(s || "").trim().replace(/\s+/g, " ");
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(36);
  }

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
  window.pvHash = hash;
})();
