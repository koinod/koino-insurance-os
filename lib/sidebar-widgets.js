/* sidebar-widgets.js — Widget registry + per-user layout persistence helpers.
 *
 * Loaded BEFORE shared.jsx so the Sidebar component can call these at render time.
 * Exposes on window:
 *   SIDEBAR_WIDGETS       — categorized widget definitions
 *   SIDEBAR_ROLE_DEFAULTS — default layout ids per role
 *   saveSidebarLayout(layout)  — upsert to user_sidebar_layouts
 *   loadSidebarLayout()        — fetch user's row, fallback to role default
 *   resetSidebarLayout()       — delete user's row (reverts to default)
 */

(() => {
  // Full widget catalog. Each entry has enough info for the Sidebar to render it
  // AND for the Composer to display it in the library.
  // nav.pageId   = the page id passed to setPage() in app.jsx routing.
  // stat.widget  = key into window.SidebarStatTiles (defined in sidebar-composer.jsx).
  // action.action = window function called when user clicks the action item.
  window.SIDEBAR_WIDGETS = {
    nav: [
      { id: "nav.today",       kind: "nav", label: "Today",         icon: "Home",       pageId: "today" },
      { id: "nav.floor",       kind: "nav", label: "Floor",         icon: "Phone",      pageId: "floor" },
      { id: "nav.pnl",         kind: "nav", label: "P&L",           icon: "Wallet",     pageId: "pnl" },
      { id: "nav.book",        kind: "nav", label: "Book",          icon: "Activity",   pageId: "book" },
      { id: "nav.quote",       kind: "nav", label: "Quote Tool",    icon: "Sparkles",   pageId: "quote" },
      { id: "nav.leaddrip",    kind: "nav", label: "Lead Drip",     icon: "Send",       pageId: "leaddrip" },
      { id: "nav.vault",       kind: "nav", label: "Vault",         icon: "Folder",     pageId: "vault" },
      { id: "nav.tree",        kind: "nav", label: "Tree",          icon: "Network",    pageId: "tree" },
      { id: "nav.expenses",    kind: "nav", label: "Expenses",      icon: "Receipt",    pageId: "expenses" },
      { id: "nav.recruiting",  kind: "nav", label: "Recruiting",    icon: "Users",      pageId: "recruiting" },
      { id: "nav.recruits",    kind: "nav", label: "Recruits",      icon: "UserPlus",   pageId: "recruits" },
      { id: "nav.crm",         kind: "nav", label: "CRM",           icon: "Users",      pageId: "crm" },
      { id: "nav.leaderboard", kind: "nav", label: "Leaderboard",   icon: "Trophy",     pageId: "leaderboard" },
      { id: "nav.coaching",    kind: "nav", label: "Coaching",      icon: "Mic",        pageId: "coaching" },
      { id: "nav.messages",    kind: "nav", label: "Messages",      icon: "MessageSquare", pageId: "messages" },
      { id: "nav.carriers",    kind: "nav", label: "Carriers",      icon: "Shield",     pageId: "carrier-appointments" },
      { id: "nav.invite-team", kind: "nav", label: "Invite Team",   icon: "UserPlus",   pageId: "invite-team" },
      { id: "nav.settings",    kind: "nav", label: "Settings",      icon: "Settings",   pageId: "settings" },
      { id: "nav.nigo",        kind: "nav", label: "NIGO Queue",    icon: "AlertCircle",pageId: "nigo" },
      { id: "nav.commissions", kind: "nav", label: "Commissions",   icon: "DollarSign", pageId: "commissions" },
    ],
    stats: [
      { id: "stat.net-mtd",        kind: "stat", label: "Net MTD",           widget: "NetMTDTile" },
      { id: "stat.top-rep",        kind: "stat", label: "Top Rep",           widget: "TopRepTile" },
      { id: "stat.pending-approv", kind: "stat", label: "Pending Approvals", widget: "PendingApprovalsTile" },
      { id: "stat.open-deals",     kind: "stat", label: "Open Deals",        widget: "OpenDealsTile" },
      { id: "stat.nigo-queue",     kind: "stat", label: "NIGO Queue",        widget: "NigoQueueTile" },
      { id: "stat.expense-mtd",    kind: "stat", label: "Expense MTD",       widget: "ExpenseMTDTile" },
    ],
    actions: [
      { id: "act.log-deal",       kind: "action", label: "Log Deal",        icon: "Plus",     action: "openQuickLogDeal" },
      { id: "act.log-expense",    kind: "action", label: "Log Expense",     icon: "Receipt",  action: "openQuickLogExpense" },
      { id: "act.start-coaching", kind: "action", label: "Start Coaching",  icon: "Mic",      action: "openCoachingSession" },
      { id: "act.send-invite",    kind: "action", label: "Send Invite",     icon: "UserPlus", action: "openInviteModal" },
    ],
  };

  // Default layouts per role — fallback when user has no saved layout.
  window.SIDEBAR_ROLE_DEFAULTS = {
    manager:     ["nav.today","nav.floor","nav.pnl","nav.book","nav.quote","nav.vault","nav.carriers","nav.recruiting"],
    owner:       ["nav.today","nav.floor","nav.pnl","nav.book","nav.quote","nav.vault","nav.expenses","nav.invite-team"],
    super_admin: ["nav.today","nav.pnl","nav.book","nav.vault","nav.tree","nav.expenses","nav.settings"],
    admin:       ["nav.today","nav.pnl","nav.book","nav.vault","nav.tree","nav.expenses","nav.settings"],
    imo_owner:   ["nav.today","nav.pnl","nav.book","nav.vault","nav.tree","nav.expenses","nav.settings"],
  };

  // Flat lookup map: widget id → definition
  function _allWidgets() {
    const all = {};
    for (const cat of Object.values(window.SIDEBAR_WIDGETS)) {
      for (const w of cat) all[w.id] = w;
    }
    return all;
  }

  // Expand an array of widget ids into full widget objects.
  function _expandIds(ids) {
    const all = _allWidgets();
    return ids.map(id => all[id]).filter(Boolean);
  }

  // Returns the default layout array (full objects) for the current role.
  function _roleDefault() {
    const me = window.me && window.me();
    const role = me?.role || "manager";
    const ids = window.SIDEBAR_ROLE_DEFAULTS[role] || window.SIDEBAR_ROLE_DEFAULTS.manager;
    return _expandIds(ids);
  }

  /* ── saveSidebarLayout(layout) ─────────────────────────────────────────────
   * Upserts the user's layout to user_sidebar_layouts. layout is an array of
   * widget descriptor objects (not just ids — store full objects for resilience
   * against registry changes).
   * Dispatches "sidebar:updated" so the Sidebar re-renders immediately.
   */
  window.saveSidebarLayout = async function (layout) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const me = window.me && window.me();
    if (!me?.agency_id) return;
    const role = me.role || "manager";
    const { error } = await sb.from("user_sidebar_layouts").upsert({
      user_id:    user.id,
      agency_id:  me.agency_id,
      role,
      layout:     layout,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) { console.error("[saveSidebarLayout]", error); return; }
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout } }));
  };

  /* ── loadSidebarLayout() ──────────────────────────────────────────────────
   * Returns the user's saved layout array. Falls back to role default when
   * no row exists or Supabase is unavailable.
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
   * Deletes the user's row. Next load returns the role default.
   * Dispatches "sidebar:updated" with the default layout.
   */
  window.resetSidebarLayout = async function () {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("user_sidebar_layouts").delete().eq("user_id", user.id);
    const defaultLayout = _roleDefault();
    window.dispatchEvent(new CustomEvent("sidebar:updated", { detail: { layout: defaultLayout } }));
    return defaultLayout;
  };
})();
