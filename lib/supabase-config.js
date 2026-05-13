// lib/supabase-config.js — single source of truth for the Supabase URL + anon key.
//
// Loaded as a regular <script> in index.html and mobile.html (sets window.SUPABASE_*).
// MUST stay valid as a non-module script — no `export` / `import` here.
// Edge/Node consumers read process.env directly with the same defaults; this file
// is the documentation pin, not their import target.
//
// Resolution order (browser):
//   window.__ENV.SUPABASE_URL → DEFAULT_URL
//   window.__ENV.SUPABASE_ANON → DEFAULT_ANON
// To env-inject at deploy without a build step, drop a small inline
// `<script>window.__ENV = { SUPABASE_URL: "...", SUPABASE_ANON: "..." }</script>`
// BEFORE this file in index.html / mobile.html.
//
// The anon key is public-tier (RLS-protected) by design — every browser already
// has it. Defaults exist so the static site works without env wiring; flip the
// Vercel env vars + window.__ENV to migrate to a different Supabase project.

(function () {
  const DEFAULT_URL  = "https://jfphwmzwteermalzwojp.supabase.co";
  const DEFAULT_ANON = "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

  const env = (typeof window !== "undefined" && window.__ENV) || {};
  const SUPABASE_URL  = env.SUPABASE_URL  || DEFAULT_URL;
  const SUPABASE_ANON = env.SUPABASE_ANON || DEFAULT_ANON;

  if (typeof window !== "undefined") {
    window.SUPABASE_URL  = SUPABASE_URL;
    window.SUPABASE_ANON = SUPABASE_ANON;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.SUPABASE_URL  = SUPABASE_URL;
    globalThis.SUPABASE_ANON = SUPABASE_ANON;
  }
})();
