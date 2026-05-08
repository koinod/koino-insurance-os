/* lib/me.js — frontend identity helper. Loaded BEFORE any page-*.jsx so they
 * can read window.me() synchronously after the first hydration.
 *
 * Hits /api/me on first call, stores result on window.__me, then returns it
 * synchronously on subsequent calls. Pages that need to render scoped data
 * should:
 *
 *    const me = window.me();   // sync, may be null on very first call
 *    if (!me) return <Loading/>;
 *    const myDeals = AppData.PIPELINE.filter(p => p.owner === me.rep_id);
 *
 * To force a refetch (e.g., after sign-in): window.refreshMe().
 *
 * Closes GAP-X4 from the frontend side.
 */

(function () {
  const ME_KEY = "__repflow_me_v1";

  function loadCached() {
    try {
      const raw = sessionStorage.getItem(ME_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function saveCached(me) {
    try { sessionStorage.setItem(ME_KEY, JSON.stringify(me || null)); } catch {}
  }

  // Resolve the supabase JWT for forwarding to /api/me. Prefer the live SDK
  // session (auto-refreshes expired tokens) over the raw localStorage blob —
  // the previous version returned a stale access_token after expiry, and
  // /api/me would 401 → me() stuck as null → user looked signed-out while
  // actually signed in.
  async function getJwt() {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb && sb.auth && typeof sb.auth.getSession === "function") {
        const r = await sb.auth.getSession();
        const tok = r?.data?.session?.access_token;
        if (tok) return tok;
      }
      // Fallback to localStorage if supabase SDK isn't ready yet (early boot).
      const raw = localStorage.getItem("repflow.auth");
      if (raw) {
        const j = JSON.parse(raw);
        return j?.access_token || j?.currentSession?.access_token || null;
      }
    } catch {}
    return null;
  }

  async function fetchMe() {
    let me = null;
    try {
      const jwt = await getJwt();
      const r = await fetch("/api/me", {
        method: "GET",
        headers: jwt ? { authorization: "Bearer " + jwt } : {},
      });
      if (r.ok) me = await r.json();
    } catch (e) {
      console.error("fetchMe failed:", e);
    }
    // ALWAYS update window.__me + cache + dispatch the event, even on null —
    // otherwise UI components waiting on me:loaded never unstick (e.g. the
    // AccountChip "..." spinner).
    window.__me = me;
    saveCached(me);
    try { window.dispatchEvent(new CustomEvent("me:loaded", { detail: me })); } catch {}
    return me;
  }

  // Synchronous accessor — returns cached me() or null if not yet loaded.
  // Pages can also bind to "me:loaded" event to know when it's ready.
  window.me = function () {
    if (window.__me) return window.__me;
    const cached = loadCached();
    if (cached) {
      window.__me = cached;
      return cached;
    }
    return null;
  };

  // Force refetch (after sign-in / sign-out).
  window.refreshMe = async function () {
    sessionStorage.removeItem(ME_KEY);
    window.__me = null;
    return await fetchMe();
  };

  /**
   * window.signOut() — global helper to clear sessions and return to login.
   * Clears Supabase auth, Repflow storage keys, and demo flags.
   */
  window.signOut = async function () {
    const sb = window.getSupabase && window.getSupabase();
    // Sign out of Supabase first so the SDK clears its own storage.
    try { if (sb && sb.auth) await sb.auth.signOut(); } catch (e) { console.error("supabase signOut:", e); }

    // Sweep storage
    try {
      sessionStorage.clear();
      // Keep only onboarding_complete in local storage if we want, but usually better to sweep.
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("repflow.") || k.startsWith("repflow:") || k.includes("supabase.auth.token"))) {
          keys.push(k);
        }
      }
      for (const k of keys) { try { localStorage.removeItem(k); } catch {} }
    } catch (e) { console.error("storage sweep failed:", e); }

    // Reset globals
    window.__me = null;
    window.__activeAgency = null;
    window.__demoSkip = false;
    window.__demoAgencyIds = [];
    window.__authRole = null;

    // Reload bootstraps the supabase client + AppData hydrate from scratch.
    window.location.reload();
  };

  // Bootstrap: kick off the fetch immediately, but don't block.
  if (typeof window !== "undefined") {
    fetchMe();
  }

  // Convenience scope helpers used across pages
  window.canSeeFleet = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin" || me.role === "super_admin");
  };
  window.canSeeTeam = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin" || me.role === "super_admin" || me.role === "manager");
  };
  // Demo flag — true when the active agency is is_demo. Drives "use seed
  // data" fallbacks across the UI (so we don't bake Atlas/Cheryl rows into
  // a real agency's empty state).
  window.isDemoAgency = function () {
    return !!(window.__activeAgency && window.__activeAgency.is_demo) || !!window.__demoSkip;
  };
  // Super admin sees everything (cross-IMO). Used by platform-admin views.
  window.isSuperAdmin = function () {
    const me = window.me();
    return me && me.role === "super_admin";
  };
  // Returns the rep_ids the viewer is allowed to scope queries to.
  // - owner → null (means "no filter")
  // - manager → [me.rep_id, ...downline_ids]
  // - rep / agent → [me.rep_id]
  window.scopeRepIds = function () {
    const me = window.me();
    if (!me) return [];
    if (window.canSeeFleet()) return null;
    if (window.canSeeTeam()) return [me.rep_id, ...(me.downline_ids || [])].filter(Boolean);
    return me.rep_id ? [me.rep_id] : [];
  };
})();
