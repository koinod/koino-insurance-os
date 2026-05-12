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

  // Bootstrap: kick off the fetch immediately, but don't block.
  if (typeof window !== "undefined") {
    fetchMe();
  }

  // Convenience scope helpers used across pages
  window.canSeeFleet = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin" || me.role === "super_admin" || me.is_super_admin === true);
  };
  window.canSeeTeam = function () {
    const me = window.me();
    return me && (me.role === "owner" || me.role === "admin" || me.role === "super_admin" || me.role === "manager" || me.is_super_admin === true);
  };
  // Demo flag — true when the active agency is is_demo. Drives "use seed
  // data" fallbacks across the UI (so we don't bake Atlas/Cheryl rows into
  // a real agency's empty state).
  window.isDemoAgency = function () {
    return !!(window.__activeAgency && window.__activeAgency.is_demo) || !!window.__demoSkip;
  };
  // Super admin sees everything (cross-IMO). Used by platform-admin views.
  // Two paths: the koino_super_admins allowlist (canonical, returned as
  // me.is_super_admin) OR the legacy role='super_admin' shorthand from
  // agency_members. Either is sufficient.
  window.isSuperAdmin = function () {
    const me = window.me();
    return !!(me && (me.is_super_admin === true || me.role === "super_admin"));
  };
  // True iff the super-admin has chosen a specific agency to act as. The
  // ImpersonationBanner reads this; data.jsx scope() does too (via the
  // existing repflow.active_agency localStorage which we mirror to a flag).
  window.superAdminActingAs = function () {
    try {
      const id = localStorage.getItem("repflow.super_admin_acting_as");
      return id || null;
    } catch { return null; }
  };
  // Set/clear the acting-as target. Also writes repflow.active_agency so the
  // existing data.jsx getActiveAgencyId() picks it up without changes.
  window.startSuperAdminActAs = async function (agencyId, agencyName, reason) {
    try { localStorage.setItem("repflow.super_admin_acting_as", agencyId); } catch {}
    try { localStorage.setItem("repflow.active_agency", agencyId); } catch {}
    const sb = window.getSupabase && window.getSupabase();
    if (sb) {
      try { await sb.rpc("super_admin_act_as_start", { p_target_agency: agencyId, p_reason: reason || null }); } catch {}
    }
    window.dispatchEvent(new CustomEvent("admin:impersonate", { detail: { agency_id: agencyId, agency_name: agencyName } }));
    window.hydrateFromSupabase && window.hydrateFromSupabase();
  };
  window.stopSuperAdminActAs = async function () {
    const id = window.superAdminActingAs();
    try { localStorage.removeItem("repflow.super_admin_acting_as"); } catch {}
    try { localStorage.removeItem("repflow.active_agency"); } catch {}
    const sb = window.getSupabase && window.getSupabase();
    if (sb && id) {
      try { await sb.rpc("super_admin_act_as_stop", { p_target_agency: id }); } catch {}
    }
    window.dispatchEvent(new CustomEvent("admin:impersonate", { detail: null }));
    window.hydrateFromSupabase && window.hydrateFromSupabase();
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
