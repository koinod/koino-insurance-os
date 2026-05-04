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

  // Resolve the supabase JWT, if any, for forwarding to /api/me.
  function getJwt() {
    try {
      const sb = window.getSupabase && window.getSupabase();
      // Read sync from session if Supabase already hydrated
      const raw = localStorage.getItem("repflow.auth");
      if (raw) {
        const j = JSON.parse(raw);
        return j?.access_token || j?.currentSession?.access_token || null;
      }
    } catch {}
    return null;
  }

  async function fetchMe() {
    const jwt = getJwt();
    try {
      const r = await fetch("/api/me", {
        method: "GET",
        headers: jwt ? { authorization: "Bearer " + jwt } : {},
      });
      if (!r.ok) return null;
      const me = await r.json();
      // Default to demo guest if no row
      window.__me = me;
      saveCached(me);
      window.dispatchEvent(new CustomEvent("me:loaded", { detail: me }));
      return me;
    } catch {
      return null;
    }
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

  // Bootstrap: kick off the fetch immediately, but don't block.
  if (typeof window !== "undefined") {
    fetchMe();
  }

  // Convenience scope helpers used across pages
  window.canSeeFleet = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin");
  };
  window.canSeeTeam = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin" || me.role === "manager");
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
