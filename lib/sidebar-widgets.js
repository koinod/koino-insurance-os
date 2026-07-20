/* sidebar-widgets.js — Widget registry + per-user layout persistence helpers.
 *
 * Each widget carries a `roles` array — the composer filters its library by
 * the current viewer role so reps don't see admin widgets, super_admin doesn't
 * see manager-only insurance ops, etc.
 *
 * Loaded BEFORE shared.jsx so window.SIDEBAR_* is ready when the Sidebar renders.
 *
 * Exposes on window:
 *   SIDEBAR_WIDGETS       — categorized widget definitions (each w/ `roles` array)
 *   SIDEBAR_ROLE_DEFAULTS — default layout ids per role
 *   widgetsForRole(role)  — flat filtered list for a role
 *   saveSidebarLayout(layout)  — upsert + dispatch event (optimistic)
 *   loadSidebarLayout()        — fetch user's row, fallback to role default
 *   resetSidebarLayout()       — delete user's row (reverts to default)
 */

(() => {
  // Pre-render sync: if the user previously collapsed the sidebar, apply the
  // html attribute IMMEDIATELY (before React mounts) so the first paint shows
  // the correct width — no flash of expanded sidebar on every reload.
  try {
    if (localStorage.getItem("repflow.sidebar.collapsed") === "1") {
      document.documentElement.dataset.sidebarCollapsed = "1";
    }
  } catch (e) {}

  // Role groupings used in `roles` arrays below.
  const ALL_ROLES   = ["rep","agent","manager","owner","super_admin","admin","imo_owner"];
  const MGR_PLUS    = ["manager","owner","admin","imo_owner"];           // insurance agency manager+
  const OWNER_PLUS  = ["owner","admin","imo_owner"];                     // can manage agency finances
  const REP_PLUS    = ["rep","agent","manager","owner","admin","imo_owner"]; // anyone on the agency side
  const SAAS_ADMIN  = ["super_admin"];                                   // SaaS platform operator only

  window.SIDEBAR_WIDGETS = {
    nav: [
      /* ── Insurance-agency pages (rep / manager / owner) ── */
      { id: "nav.today",       kind: "nav", label: "Today",         icon: "Home",          pageId: "today",                roles: REP_PLUS },
      { id: "nav.floor",       kind: "nav", label: "Floor",         icon: "Phone",         pageId: "floor",                roles: REP_PLUS },
      { id: "nav.messages",    kind: "nav", label: "Messages",      icon: "MessageSquare", pageId: "messages",             roles: REP_PLUS },
      { id: "nav.leaderboard", kind: "nav", label: "Leaderboard",   icon: "Trophy",        pageId: "leaderboard",          roles: REP_PLUS },
      { id: "nav.crm",         kind: "nav", label: "CRM",           icon: "Users",         pageId: "crm",                  roles: REP_PLUS },
      { id: "nav.quote",       kind: "nav", label: "Quote Tool",    icon: "Sparkles",      pageId: "quote",                roles: REP_PLUS },
      { id: "nav.vault",       kind: "nav", label: "Vault",         icon: "Folder",        pageId: "vault",                roles: REP_PLUS },
      { id: "nav.coaching",    kind: "nav", label: "Coaching",      icon: "Mic",           pageId: "coaching",             roles: REP_PLUS },

      /* ── Personal P&L — open to reps so they can see their own money loop ── */

      /* ── Manager+ pages ── */
      { id: "nav.tree",        kind: "nav", label: "Tree",          icon: "Workflow",      pageId: "tree",                 roles: MGR_PLUS },
      { id: "nav.recruiting",  kind: "nav", label: "Recruiting",    icon: "Users",         pageId: "recruiting",           roles: MGR_PLUS },
      { id: "nav.recruits",    kind: "nav", label: "Recruits",      icon: "User",          pageId: "recruits",             roles: MGR_PLUS },
      { id: "nav.leaddrip",    kind: "nav", label: "Lead Drip",     icon: "Send",          pageId: "leaddrip",             roles: MGR_PLUS },
      { id: "nav.nigo",        kind: "nav", label: "NIGO Queue",    icon: "AlertTriangle", pageId: "nigo",                 roles: MGR_PLUS },

      /* ── Owner-only ── */
      { id: "nav.invite-team", kind: "nav", label: "Invite Team",   icon: "Users",         pageId: "invite-team",          roles: OWNER_PLUS },

      /* ── Universal ── */
      { id: "nav.settings",    kind: "nav", label: "Settings",      icon: "Settings",      pageId: "settings",             roles: ALL_ROLES },
      { id: "nav.connections", kind: "nav", label: "Connections",   icon: "Plug",          pageId: "connections",          roles: MGR_PLUS },

      /* ── SaaS platform admin (super_admin only) ──
       * All pageIds land on PageAdminHub via app.jsx, with the right
       * initialSubpage. Adding a widget here surfaces the surface in the
       * composer library so super-admins can pin it directly to their
       * left sidebar instead of always tunneling through the HQ hub tab. */
      { id: "nav.admin-hq",         kind: "nav", label: "HQ (cross-agency)", icon: "Globe",       pageId: "admin-hq",         roles: SAAS_ADMIN },
      { id: "nav.admin-clients",    kind: "nav", label: "Clients",           icon: "Building",    pageId: "admin",            roles: SAAS_ADMIN },
      { id: "nav.admin-billing",    kind: "nav", label: "Subscriptions",     icon: "Wallet",      pageId: "admin-billing",    roles: SAAS_ADMIN },
      { id: "nav.admin-members",    kind: "nav", label: "Users",             icon: "Users",       pageId: "admin-members",    roles: SAAS_ADMIN },
      { id: "nav.admin-invites",    kind: "nav", label: "Onboarding",        icon: "Bell",        pageId: "admin-invites",    roles: SAAS_ADMIN },
      { id: "nav.admin-carriers",   kind: "nav", label: "Carriers Config",   icon: "Plug",        pageId: "admin-carriers",   roles: SAAS_ADMIN },
      { id: "nav.admin-security",   kind: "nav", label: "Security",          icon: "Shield",      pageId: "admin-security",   roles: SAAS_ADMIN },
      { id: "nav.admin-audit",      kind: "nav", label: "Audit Log",         icon: "Activity",    pageId: "admin-audit",      roles: SAAS_ADMIN },
      { id: "nav.lab",              kind: "nav", label: "Lab",               icon: "Sparkles",    pageId: "lab",              roles: SAAS_ADMIN },
      /* Added 2026-05-25 — were reachable from the HQ hub but not pinnable. */
      { id: "nav.admin-flags",      kind: "nav", label: "Feature Flags",     icon: "ToggleRight", pageId: "admin-flags",      roles: SAAS_ADMIN },
      { id: "nav.admin-system",     kind: "nav", label: "System Probes",     icon: "Cpu",         pageId: "admin-system",     roles: SAAS_ADMIN },
      { id: "nav.admin-customize",  kind: "nav", label: "Customize Sidebar", icon: "Edit",        pageId: "admin-customize",  roles: SAAS_ADMIN },
      { id: "nav.admin-hierarchy",  kind: "nav", label: "Org Hierarchy",     icon: "Workflow",    pageId: "admin-hierarchy",  roles: SAAS_ADMIN },
      { id: "nav.admin-scrape",     kind: "nav", label: "UW Scrape Queue",   icon: "Search",      pageId: "admin-scrape",     roles: SAAS_ADMIN },
      { id: "nav.admin-devices",    kind: "nav", label: "Devices",           icon: "Smartphone",  pageId: "admin-devices",    roles: SAAS_ADMIN },
    ],

  };

  // Default sidebar per role — what they see before any customization.
  // Mirrors the old static NAV map so existing users don't lose their layout.
  window.SIDEBAR_ROLE_DEFAULTS = {
    rep:         ["nav.today","nav.floor","nav.messages","nav.leaderboard","nav.crm","nav.quote","nav.vault"],
    agent:       ["nav.today","nav.floor","nav.messages","nav.leaderboard","nav.crm","nav.quote","nav.vault"],
    manager:     ["nav.today","nav.floor","nav.crm","nav.quote","nav.vault","nav.recruiting"],
    owner:       ["nav.today","nav.floor","nav.crm","nav.quote","nav.vault","nav.invite-team"],
    admin:       ["nav.today","nav.floor","nav.crm","nav.quote","nav.vault","nav.invite-team"],
    imo_owner:   ["nav.today","nav.floor","nav.crm","nav.quote","nav.vault","nav.invite-team"],
    // Slimmed 2026-05-25: HQ hub now hosts every admin surface behind one
    // horizontal nav, so the sidebar default carries just HQ + Settings. The
    // composer library still exposes all 15 admin widgets (admin-hq, clients,
    // billing, members, invites, carriers, security, audit, lab, flags,
    // system, customize, hierarchy, scrape, devices) so super-admins can pin
    // any of them directly to the sidebar if they prefer one-click access.
    super_admin: ["nav.admin-hq","nav.settings"],
  };

  // Flat lookup: widget id → definition
  function _allWidgets() {
    const all = {};
    for (const cat of Object.values(window.SIDEBAR_WIDGETS)) {
      for (const w of cat) all[w.id] = w;
    }
    return all;
  }

  function _expandIds(ids) {
    const all = _allWidgets();
    return ids.map(id => all[id]).filter(Boolean);
  }

  // Returns the default layout for a role (full widget objects).
  function _roleDefault(role) {
    const r = role || window.me?.()?.role || "manager";
    const ids = window.SIDEBAR_ROLE_DEFAULTS[r] || window.SIDEBAR_ROLE_DEFAULTS.manager;
    return _expandIds(ids);
  }

  const LOCAL_LAYOUT_PREFIX = "repflow.sidebar.layout.v2";

  function _layoutRole(activeRole) {
    return activeRole || window.__authRole || window.me?.()?.role || "manager";
  }

  async function _resolveIdentity(sb, fallbackUser = null) {
    const me = window.me?.() || window.__me || null;
    let sessionUser = fallbackUser || null;
    if (!sessionUser && sb?.auth?.getSession) {
      try {
        const { data } = await sb.auth.getSession();
        sessionUser = data?.session?.user || null;
      } catch {}
    }
    if (!sessionUser && sb?.auth?.getUser) {
      try {
        const { data } = await sb.auth.getUser();
        sessionUser = data?.user || null;
      } catch {}
    }
    return {
      userId: sessionUser?.id || me?.user_id || me?.id || null,
      user: sessionUser,
      me,
    };
  }

  function _localLayoutKey(role, identity) {
    const me = identity?.me || window.me?.() || window.__me || null;
    const userId = identity?.userId || me?.user_id || me?.id || null;
    const ident = userId || me?.handle || "local";
    return `${LOCAL_LAYOUT_PREFIX}:${ident}:${role}`;
  }

  function _cleanLayout(items, role) {
    if (!Array.isArray(items)) return [];
    const legacyMap = {
      "nav.book": "nav.crm", "nav.pnl": "nav.crm", "nav.commissions": "nav.crm",
      "nav.expenses": "nav.crm", "nav.carriers": "nav.crm",
    };
    const seen = new Set();
    return items.map(i => {
      const mappedId = legacyMap[i?.id] || i?.id;
      const definition = _allWidgets()[mappedId];
      return definition ? { ...definition } : { ...i, id: mappedId };
    }).filter(i => {
      const lbl = (i.label || "").toLowerCase().trim();
      const id = (i.id || "").toLowerCase().trim();
      if (seen.has(id)) return false;
      seen.add(id);
      return lbl !== "start coaching" && !id.includes("start-coaching") && !id.includes("start_coaching") && (!role || !i.roles || i.roles.includes(role));
    });
  }

  function _readLocalLayout(role, identity) {
    try {
      const raw = localStorage.getItem(_localLayoutKey(role, identity));
      const layout = raw ? JSON.parse(raw) : null;
      return Array.isArray(layout) && layout.length ? _cleanLayout(layout, role) : null;
    } catch {
      return null;
    }
  }

  function _writeLocalLayout(role, layout, identity) {
    try { localStorage.setItem(_localLayoutKey(role, identity), JSON.stringify(_cleanLayout(layout, role))); } catch {}
  }

  function _removeLocalLayout(role, identity) {
    try { localStorage.removeItem(_localLayoutKey(role, identity)); } catch {}
  }

  // Public helper: what widgets are visible to this role?
  // Used by the composer to filter its library by current role.
  window.widgetsForRole = function (role) {
    const filtered = { nav: [] };
    for (const [cat, items] of Object.entries(window.SIDEBAR_WIDGETS)) {
      filtered[cat] = _cleanLayout(items.filter(w => !w.roles || w.roles.includes(role)));
    }
    return filtered;
  };

  /* ── saveSidebarLayout(layout) ─────────────────────────────────────────────
   * Optimistic: dispatches sidebar:updated FIRST so the UI repaints
   * immediately, then persists in the background. If persist fails the user
   * sees a warning toast but the sidebar already reflects the change.
   */
  window.saveSidebarLayout = async function (layout, activeRole) {
    const role = _layoutRole(activeRole);
    const clean = _cleanLayout(layout, role);
    // 1) Fire the event right away — Sidebar listener picks this up and
    //    re-renders. Pre-migration this WAS the bug: the dispatch was gated
    //    on a successful upsert that couldn't happen.
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout: clean, role } }));

    // 2) Persist locally immediately. This covers demo/offline mode and keeps
    // the layout stable even if the server-side migration has not landed yet.
    // 3) Persist in the background.
    const sb = window.getSupabase && window.getSupabase();
    const identity = await _resolveIdentity(sb);
    _writeLocalLayout(role, clean, identity);
    if (!sb) return; // demo/no-supabase: local cache only
    try {
      const { userId, me } = identity;
      if (!userId) return;
      const { error } = await sb.from("user_sidebar_layouts").upsert({
        user_id:    userId,
        agency_id:  me?.agency_id || null,
        role,
        layout: clean,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,role" });
      if (error) {
        console.error("[saveSidebarLayout]", error);
        window.toast?.(`Sidebar saved locally — sync failed: ${error.message}`, "warn");
      } else {
        window.toast?.("Sidebar saved", "success");
      }
    } catch (e) {
      console.error("[saveSidebarLayout]", e);
      window.toast?.("Sidebar saved locally — sync error", "warn");
    }
  };

  /* ── loadSidebarLayout() ──────────────────────────────────────────────────
   * Fetches user's saved layout (keyed by user_id). Falls back to role
   * default when no row exists or Supabase is unavailable.
   */
  // `activeRole` is the role the caller is currently *viewing* the sidebar
  // as (super_admin Ian may flip to "manager" or "rep" via the role pills).
  // When the persisted layout was saved for a different role, return that
  // role's default instead of serving the wrong-role widgets — otherwise a
  // super_admin's saved admin layout overrides the manager NAV when they
  // click "Mgr".
  window.loadSidebarLayout = async function (activeRole) {
    const role = _layoutRole(activeRole);
    const sb = window.getSupabase && window.getSupabase();
    const identity = await _resolveIdentity(sb);
    if (!sb) return _readLocalLayout(role, identity) || _roleDefault(role);
    try {
      if (!identity.userId) return _readLocalLayout(role, identity) || _roleDefault(role);
      const { data, error } = await sb.from("user_sidebar_layouts")
        .select("layout, role")
        .eq("user_id", identity.userId)
        .eq("role", role)
        .maybeSingle();
      if (error || !data || !Array.isArray(data.layout) || data.layout.length === 0) {
        return _readLocalLayout(role, identity) || _roleDefault(role);
      }
      const clean = _cleanLayout(data.layout, role);
      _writeLocalLayout(role, clean, identity);
      return clean;
    } catch (e) {
      return _readLocalLayout(role, identity) || _roleDefault(role);
    }
  };

  /* ── resetSidebarLayout() ─────────────────────────────────────────────────
   * Deletes the user's row. Optimistic dispatch first so UI updates,
   * then DB cleanup.
   */
  window.resetSidebarLayout = async function (activeRole) {
    const role = _layoutRole(activeRole);
    const defaultLayout = _roleDefault(role);
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout: defaultLayout, role } }));
    const sb = window.getSupabase && window.getSupabase();
    const identity = await _resolveIdentity(sb);
    _removeLocalLayout(role, identity);
    if (!sb) return defaultLayout;
    try {
      if (identity.userId) {
        await sb.from("user_sidebar_layouts").delete().eq("user_id", identity.userId).eq("role", role);
        window.toast?.("Sidebar reset to default", "success");
      }
    } catch (e) {
      console.error("[resetSidebarLayout]", e);
    }
    return defaultLayout;
  };
})();
