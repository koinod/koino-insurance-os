// lib/supabase-config.js — single source of truth for the Supabase URL + anon key.
//
// Loaded as a regular <script> in index.html and mobile.html (sets window.SUPABASE_*).
// Imported as ES module from /api/* Edge functions via simple string parsing.
//
// To migrate to a different Supabase project, edit the values below + flip the
// Vercel env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
// No other file in the codebase should hardcode these values.

(function () {
  const SUPABASE_URL  = "https://jfphwmzwteermalzwojp.supabase.co";
  const SUPABASE_ANON = "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

  if (typeof window !== "undefined") {
    window.SUPABASE_URL  = SUPABASE_URL;
    window.SUPABASE_ANON = SUPABASE_ANON;
  }
  // Edge / Node export shape
  if (typeof globalThis !== "undefined") {
    globalThis.SUPABASE_URL  = SUPABASE_URL;
    globalThis.SUPABASE_ANON = SUPABASE_ANON;
  }
})();
