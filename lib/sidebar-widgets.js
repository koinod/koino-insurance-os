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
      { id: "nav.book",        kind: "nav", label: "Book",          icon: "Activity",      pageId: "book",                 roles: REP_PLUS },
      { id: "nav.quote",       kind: "nav", label: "Quote Tool",    icon: "Sparkles",      pageId: "quote",                roles: REP_PLUS },
      { id: "nav.vault",       kind: "nav", label: "Vault",         icon: "Folder",        pageId: "vault",                roles: REP_PLUS },
      { id: "nav.coaching",    kind: "nav", label: "Coaching",      icon: "Mic",           pageId: "coaching",             roles: REP_PLUS },

      /* ── Manager+ pages ── */
      { id: "nav.pnl",         kind: "nav", label: "P&L",           icon: "Wallet",        pageId: "pnl",                  roles: MGR_PLUS },
      { id: "nav.tree",        kind: "nav", label: "Tree",          icon: "Workflow",      pageId: "tree",                 roles: MGR_PLUS },
      { id: "nav.recruiting",  kind: "nav", label: "Recruiting",    icon: "Users",         pageId: "recruiting",           roles: MGR_PLUS },
      { id: "nav.recruits",    kind: "nav", label: "Recruits",      icon: "User",          pageId: "recruits",             roles: MGR_PLUS },
      { id: "nav.carriers",    kind: "nav", label: "Carriers",      icon: "Shield",        pageId: "carrier-appointments", roles: MGR_PLUS },
      { id: "nav.crm",         kind: "nav", label: "CRM",           icon: "Users",         pageId: "crm",                  roles: MGR_PLUS },
      { id: "nav.leaddrip",    kind: "nav", label: "Lead Drip",     icon: "Send",          pageId: "leaddrip",             roles: MGR_PLUS },
      { id: "nav.nigo",        kind: "nav", label: "NIGO Queue",    icon: "AlertTriangle", pageId: "nigo",                 roles: MGR_PLUS },
      { id: "nav.commissions", kind: "nav", label: "Commissions",   icon: "Wallet",        pageId: "commissions",          roles: MGR_PLUS },

      /* ── Owner-only ── */
      { id: "nav.expenses",    kind: "nav", label: "Expenses",      icon: "Wallet",        pageId: "expenses",             roles: OWNER_PLUS },
      { id: "nav.invite-team", kind: "nav", label: "Invite Team",   icon: "Users",         pageId: "invite-team",          roles: OWNER_PLUS },

      /* ── Universal ── */
      { id: "nav.settings",    kind: "nav", label: "Settings",      icon: "Settings",      pageId: "settings",             roles: ALL_ROLES },
      { id: "nav.connections", kind: "nav", label: "Connections",   icon: "Plug",          pageId: "connections",          roles: MGR_PLUS },

      /* ── SaaS platform admin (super_admin only) ── */
      { id: "nav.admin-hq",       kind: "nav", label: "HQ (cross-agency)", icon: "Globe",    pageId: "admin-hq",       roles: SAAS_ADMIN },
      { id: "nav.admin-clients",  kind: "nav", label: "Clients",           icon: "Building", pageId: "admin",          roles: SAAS_ADMIN },
      { id: "nav.admin-billing",  kind: "nav", label: "Subscriptions",     icon: "Wallet",   pageId: "admin-billing",  roles: SAAS_ADMIN },
      { id: "nav.admin-members",  kind: "nav", label: "Users",             icon: "Users",    pageId: "admin-members",  roles: SAAS_ADMIN },
      { id: "nav.admin-invites",  kind: "nav", label: "Onboarding",        icon: "Bell",     pageId: "admin-invites",  roles: SAAS_ADMIN },
      { id: "nav.admin-carriers", kind: "nav", label: "Carriers Config",   icon: "Plug",     pageId: "admin-carriers", roles: SAAS_ADMIN },
      { id: "nav.admin-security", kind: "nav", label: "Security",          icon: "Shield",   pageId: "admin-security", roles: SAAS_ADMIN },
      { id: "nav.admin-audit",    kind: "nav", label: "Audit Log",         icon: "Activity", pageId: "admin-audit",    roles: SAAS_ADMIN },
      { id: "nav.lab",            kind: "nav", label: "Lab",               icon: "Sparkles", pageId: "lab",            roles: SAAS_ADMIN },
    ],

    stats: [
      /* Personal stat — any user (queries by user_id) */
      { id: "stat.pending-approv", kind: "stat", label: "Pending Approvals", widget: "PendingApprovalsTile", roles: REP_PLUS },

      /* Agency-wide stats — manager+ */
      { id: "stat.net-mtd",    kind: "stat", label: "Net MTD",     widget: "NetMTDTile",      roles: MGR_PLUS },
      { id: "stat.top-rep",    kind: "stat", label: "Top Rep",     widget: "TopRepTile",      roles: MGR_PLUS },
      { id: "stat.open-deals", kind: "stat", label: "Open Deals",  widget: "OpenDealsTile",   roles: MGR_PLUS },
      { id: "stat.nigo-queue", kind: "stat", label: "NIGO Queue",  widget: "NigoQueueTile",   roles: MGR_PLUS },

      /* Owner-finance stats */
      { id: "stat.expense-mtd", kind: "stat", label: "Expense MTD", widget: "ExpenseMTDTile", roles: OWNER_PLUS },
    ],

    actions: [
      { id: "act.log-deal",       kind: "action", label: "Log Deal",       icon: "Plus",     action: "openQuickLogDeal",      roles: REP_PLUS },
      { id: "act.start-coaching", kind: "action", label: "Start Coaching", icon: "Mic",      action: "openCoachingSession",   roles: REP_PLUS },
      { id: "act.log-expense",    kind: "action", label: "Log Expense",    icon: "Wallet",   action: "openQuickLogExpense",   roles: OWNER_PLUS },
      { id: "act.send-invite",    kind: "action", label: "Send Invite",    icon: "Users",    action: "openInviteModal",       roles: MGR_PLUS },
    ],
  };

  // Default sidebar per role — what they see before any customization.
  // Mirrors the old static NAV map so existing users don't lose their layout.
  window.SIDEBAR_ROLE_DEFAULTS = {
    rep:         ["nav.today","nav.floor","nav.messages","nav.leaderboard","nav.book","nav.quote","nav.vault"],
    agent:       ["nav.today","nav.floor","nav.messages","nav.leaderboard","nav.book","nav.quote","nav.vault"],
    manager:     ["nav.today","nav.floor","nav.book","nav.quote","nav.pnl","nav.vault","nav.carriers","nav.recruiting"],
    owner:       ["nav.today","nav.floor","nav.book","nav.quote","nav.pnl","nav.vault","nav.expenses","nav.invite-team"],
    admin:       ["nav.today","nav.floor","nav.book","nav.quote","nav.pnl","nav.vault","nav.expenses","nav.invite-team"],
    imo_owner:   ["nav.today","nav.floor","nav.book","nav.quote","nav.pnl","nav.vault","nav.expenses","nav.invite-team"],
    super_admin: ["nav.admin-hq","nav.admin-clients","nav.admin-billing","nav.admin-members","nav.admin-invites","nav.admin-carriers","nav.admin-security","nav.admin-audit","nav.lab","nav.settings"],
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

  // Public helper: what widgets are visible to this role?
  // Used by the composer to filter its library by current role.
  window.widgetsForRole = function (role) {
    const filtered = { nav: [], stats: [], actions: [] };
    for (const [cat, items] of Object.entries(window.SIDEBAR_WIDGETS)) {
      filtered[cat] = items.filter(w => !w.roles || w.roles.includes(role));
    }
    return filtered;
  };

  /* ── saveSidebarLayout(layout) ─────────────────────────────────────────────
   * Optimistic: dispatches sidebar:updated FIRST so the UI repaints
   * immediately, then persists in the background. If persist fails the user
   * sees a warning toast but the sidebar already reflects the change.
   */
  window.saveSidebarLayout = async function (layout) {
    // 1) Fire the event right away — Sidebar listener picks this up and
    //    re-renders. Pre-migration this WAS the bug: the dispatch was gated
    //    on a successful upsert that couldn't happen.
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout } }));

    // 2) Persist in the background.
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return; // demo/no-supabase: in-memory only
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const me = window.me && window.me();
      if (!me?.agency_id) return; // can't persist without an agency_id
      const role = me.role || "manager";
      const { error } = await sb.from("user_sidebar_layouts").upsert({
        user_id:    user.id,
        agency_id:  me.agency_id,
        role,
        layout,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
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
  window.loadSidebarLayout = async function () {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return _roleDefault();
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return _roleDefault();
      const { data, error } = await sb.from("user_sidebar_layouts")
        .select("layout")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data || !Array.isArray(data.layout) || data.layout.length === 0) {
        return _roleDefault();
      }
      return data.layout;
    } catch (e) {
      return _roleDefault();
    }
  };

  /* ── resetSidebarLayout() ─────────────────────────────────────────────────
   * Deletes the user's row. Optimistic dispatch first so UI updates,
   * then DB cleanup.
   */
  window.resetSidebarLayout = async function () {
    const defaultLayout = _roleDefault();
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout: defaultLayout } }));
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return defaultLayout;
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        await sb.from("user_sidebar_layouts").delete().eq("user_id", user.id);
        window.toast?.("Sidebar reset to default", "success");
      }
    } catch (e) {
      console.error("[resetSidebarLayout]", e);
    }
    return defaultLayout;
  };
})();
