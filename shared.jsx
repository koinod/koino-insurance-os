/* Shared atomic components for Repflow */
const { useState, useEffect, useRef, useMemo } = React;

const TierChip = ({ tier, compact }) => (
  <span className={`tier tier-${tier}`}>
    <span className="gem"></span>
    {!compact && (AppData.TIER_LABELS[tier] || String(tier).toUpperCase())}
  </span>
);

const Avatar = ({ rep, size = 22 }) => {
  // Guard against missing rep entirely (e.g. lookups against an empty REPS
  // table) — render a neutral placeholder instead of crashing the panel.
  if (!rep) {
    return <span className="avatar-xs" style={{ width: size, height: size, fontSize: size * 0.42, background: "var(--bg-raised)", color: "var(--text-tertiary)" }}>—</span>;
  }
  const name = rep.name || rep.handle || rep.id || "";
  const initials = name.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("") || "?";
  return (
    <span className="avatar-xs" style={{ width: size, height: size, fontSize: size * 0.42, background: rep.color || "var(--bg-raised)" }}>
      {initials}
    </span>
  );
};

const Sparkline = ({ data, width = 70, height = 28, color = "var(--accent-money)", neg }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const range = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const fill = `${d} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg className="kpi-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={fill} fill={neg ? "var(--state-danger)" : color} opacity="0.10"/>
      <path d={d} stroke={neg ? "var(--state-danger)" : color} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
};

const KpiCard = ({ label, value, prefix, suffix, sub, trend, hero, spark, neg }) => (
  <div className={`kpi ${hero ? "hero" : ""}`}>
    <div className="kpi-label">{label}</div>
    <div className={`kpi-val tabular money`}>
      {prefix}{value}{suffix && <span style={{ fontSize: "0.55em", color: "var(--text-tertiary)", fontWeight: 500, marginLeft: 4 }}>{suffix}</span>}
    </div>
    {sub && (
      <div className="kpi-meta">
        {trend === "up" && <span className="up tabular"><Icons.TrendingUp size={12}/> {sub}</span>}
        {trend === "dn" && <span className="dn tabular"><Icons.TrendingDown size={12}/> {sub}</span>}
        {!trend && <span className="tabular">{sub}</span>}
      </div>
    )}
    {spark && <Sparkline data={spark} width={hero ? 130 : 70} height={hero ? 56 : 28} neg={neg}/>}
  </div>
);

/* ───── Sidebar ─────
   Pages shared across roles render role-aware variants (driven by `role` prop).
   The NAV map decides which role sees which page in their sidebar. */
// NAV 2026-05-19 — manager sidebar collapsed 11 → 7 items. Lifecycle
// surfaces fold into their host page as sub-tabs (CRM/LeadDrip/NIGO →
// Book; AutoQuoter → Quote; Tree → Vault). Deep links into the old
// routes (crm, leaddrip, auto-quoter, tree, etc.) still resolve via the
// switch in app.jsx — they just no longer occupy sidebar real estate.
const NAV = {
  rep: [
    { id: "today",       label: "Today",        icon: "Home" },
    { id: "floor",       label: "Floor",        icon: "Phone",    badge: "47" },
    { id: "messages",    label: "Messages",     icon: "MessageSquare" },
    { id: "leaderboard", label: "Leaderboard",  icon: "Trophy" },
    { id: "book",        label: "Book",         icon: "Activity" },
    { id: "quote",       label: "Quote",        icon: "Sparkles" },
    { id: "vault",       label: "Vault",        icon: "Folder" },
  ],
  manager: [
    { id: "today",       label: "Today",        icon: "Home" },
    { id: "floor",       label: "Floor",        icon: "Phone" },
    { id: "book",        label: "Book",         icon: "Activity" },
    { id: "quote",       label: "Quote",        icon: "Sparkles" },
    { id: "pnl",         label: "P&L",          icon: "Wallet" },
    { id: "vault",       label: "Vault",        icon: "Folder" },
    { id: "carrier-appointments", label: "Carriers", icon: "Shield" },
    { id: "recruiting",  label: "Recruiting",   icon: "Users" },
  ],
  ops: [
    { id: "connections", label: "Connections",  icon: "Plug" },
  ],
};

// Owner = manager + Expenses + Invite Team.
NAV.owner = [
  ...NAV.manager,
  { id: "expenses",     label: "Expenses",     icon: "Wallet" },
  { id: "invite-team",  label: "Invite Team",  icon: "Users" },
];
NAV.admin     = NAV.owner;  // legacy alias
NAV.imo_owner = NAV.owner;

// super_admin = SaaS platform / business operator only. Insurance-agency
// operator pages (Today, P&L, Lead Drip, Vault, Tree, Expenses, Invite Team)
// are scoped to owner/manager/rep — super_admin runs the *software*: client
// agencies, subscriptions, security, carriers config, onboarding, and the
// growth funnel for the software business itself. Each entry deep-links into
// a PageAdmin tab via initialTab.
// super_admin sidebar collapsed 10 → 2 items (2026-05-25). The HQ hub
// (PageAdminHub) now hosts every platform/admin surface behind one
// horizontal nav: HQ · Clients · Subscriptions · Users · Onboarding · Carriers ·
// Security · Audit · Flags · System · Lab · Customize. Deep links into the
// old admin-* routes still resolve via the app.jsx switch — they all land
// on the hub with the correct initial sub-tab.
NAV.super_admin = [
  { id: "admin-hq",       label: "HQ",             icon: "BarChart3" }, // single platform hub
  { id: "settings",       label: "Settings",       icon: "Settings"  },
];

const SidebarBrand = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
    };
  }, []);
  const me = (typeof window !== "undefined" && window.me && window.me()) || null;
  // Agency name shown under "Repflow" brand — real agency for authed users,
  // "Demo Agency" for ?demo=1 sandbox, "—" while resolving.
  const agencyLabel = me?.agency_name
    || (me?.is_demo ? "Demo Agency" : (me ? "—" : "Loading…"));
  return (
    <div className="sb-brand">
      <div className="sb-brand-mark">R</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sb-brand-name">Repflow</div>
        <div className="sb-brand-meta" title={agencyLabel}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {agencyLabel}
        </div>
      </div>
    </div>
  );
};

// Roles that get a customizable sidebar. Every authed role can pin/reorder
// their own widgets — the composer library filters by role so reps only
// see rep-appropriate widgets, super_admin sees the SaaS admin widgets, etc.
const CUSTOM_ROLES = new Set(["rep","agent","manager","owner","super_admin","admin","imo_owner"]);

const Sidebar = ({ role, setRole, page, setPage, openCmdK }) => {
  const [composerOpen, setComposerOpen] = useState(false);
  // null = still loading from DB; array = ready (may be role-default)
  const [customLayout, setCustomLayout] = useState(null);
  const isDynamic = CUSTOM_ROLES.has(role);

  // Collapsed state — persists per device via localStorage. Drives a
  // data-sidebar-collapsed attribute on <html> which the CSS uses to shrink
  // the grid column AND restyle every nav-row to icon-only mode.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("repflow.sidebar.collapsed") === "1"; } catch { return false; }
  });

  // Sync collapsed → DOM + storage on every change.
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? "1" : "0";
    try { localStorage.setItem("repflow.sidebar.collapsed", collapsed ? "1" : "0"); } catch (e) {}
    // Fire event so any external listener (e.g. ai-sidebar layout) can react.
    window.dispatchEvent(new CustomEvent("sidebar:collapsed", { detail: { collapsed } }));
  }, [collapsed]);

  // Cmd/Ctrl+B keyboard toggle (matches VS Code muscle memory).
  // Ignored when focus is in an input/textarea so power-users can still type "b".
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "b" && e.key !== "B") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setCollapsed(c => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!isDynamic) { setCustomLayout(null); return; }
    let cancelled = false;
    window.loadSidebarLayout?.(role).then(l => { if (!cancelled) setCustomLayout(l || []); });
    const onUpdate = (e) => setCustomLayout(e.detail?.layout || []);
    window.addEventListener("sidebar:updated", onUpdate);
    return () => { cancelled = true; window.removeEventListener("sidebar:updated", onUpdate); };
  }, [role, isDynamic]);

  // PageAdminHub's "Customize" tab fires this event so the existing composer
  // modal opens from inside the hub without duplicating the composer
  // implementation. Any other surface can fire the same event.
  useEffect(() => {
    const onOpen = () => setComposerOpen(true);
    window.addEventListener("sidebar:composer:open", onOpen);
    return () => window.removeEventListener("sidebar:composer:open", onOpen);
  }, []);

  // While async load is in flight, fall back to the static map so the sidebar
  // isn't blank. Once the DB row resolves, customLayout replaces it.
  const items = isDynamic
    ? (customLayout !== null ? customLayout : (NAV[role] || []))
    : (NAV[role] || []);

  function renderItem(item) {
    const kind = item.kind || "nav";
    if (kind === "nav") {
      const pageId = item.pageId || item.id;
      const Ico = Icons[item.icon] || Icons.Circle;
      return (
        <button
          key={item.id}
          className={`sb-item ${page === pageId ? "active" : ""}`}
          onClick={() => setPage(pageId)}
          title={item.label}  /* shown by browser when collapsed (label hidden) */
        >
          <Ico size={15}/>
          <span>{item.label}</span>
          {item.badge && <span className="badge tabular">{item.badge}</span>}
        </button>
      );
    }
    if (kind === "stat") {
      const Tile = window.SidebarStatTiles?.[item.widget];
      if (!Tile) return <div key={item.id} className="sb-stat-tile"><span className="sb-stat-lbl">{item.label}</span></div>;
      return <Tile key={item.id}/>;
    }
    if (kind === "action") {
      const Ico = Icons[item.icon] || Icons.Circle;
      return (
        <button
          key={item.id}
          className="sb-item"
          onClick={() => typeof window[item.action] === "function" && window[item.action]()}
          title={item.label}
        >
          <Ico size={15}/><span>{item.label}</span>
        </button>
      );
    }
    return null;
  }

  return (
    <nav className="sidebar" data-collapsed={collapsed ? "1" : "0"}>
      <div className="sb-brand-row">
        <SidebarBrand/>
        <button
          className="sb-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <Icons.ChevronRight
            size={12}
            style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 180ms var(--ease-out)" }}
          />
        </button>
      </div>

      {(window.isSuperAdmin() || window.isDemoAgency()) && (
        <div className="role-switch">
          {["rep","manager","super_admin"].map(r => (
            <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)} title={r}>
              {r === "rep" ? "Rep" : r === "manager" ? "Mgr" : "Admin"}
            </button>
          ))}
        </div>
      )}

      <div className="sb-section">Workspace</div>
      <div className="sb-nav">
        {items.map(renderItem)}
        {isDynamic && (
          <button
            className="sb-item sb-item-composer"
            title="Customize your sidebar"
            onClick={() => setComposerOpen(true)}
            style={{ opacity: 0.6 }}
          >
            <Icons.Edit size={12}/>
            <span style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>Customize…</span>
          </button>
        )}
      </div>

      {/* Composer modal — lazy ref to window so it loads after this script.
          Keyed by role so the role-switch preview (super_admin → manager view)
          fully remounts the composer with the new role's widget library. */}
      {composerOpen && window.SidebarComposer && React.createElement(
        window.SidebarComposer,
        { key: `composer-${role}`, onClose: () => setComposerOpen(false), role }
      )}

      <div className="sb-section">Operations</div>
      <div className="sb-nav">
        {NAV.ops.map(it => {
          const Ico = Icons[it.icon] || Icons.Circle;
          return (
            <button
              key={it.id}
              className={`sb-item ${page === it.id ? "active" : ""}`}
              onClick={() => setPage(it.id)}
              title={it.label}
            >
              <Ico size={15}/>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sb-spacer"/>

      <div style={{ padding: "0 8px 8px" }}>
        <button className="sb-item" onClick={openCmdK} title="Command palette (⌘K)">
          <Icons.Search size={15}/>
          <span>Command</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <SidebarUser setPage={setPage}/>
    </nav>
  );
};

/* Resolve the actual signed-in viewer. NEVER falls back to AppData.REPS[0] —
   that was the "static bottom-left" bug where every account looked like
   Marcus Avila / Atlas. We render the real me() identity, only matching
   AppData.REPS for the avatar color/initials when the rep_id genuinely
   exists in the agency. */
const SidebarUser = ({ setPage }) => {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
    };
  }, []);
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  // Match the rep row in this agency only — purely for avatar colors. We do
  // NOT borrow another rep's name/tier as a fallback.
  const matchedRep = meIdent?.rep_id
    ? (AppData.REPS || []).find(r => r.id === meIdent.rep_id)
    : null;
  // Build a stub rep for Avatar from real identity so the initials match.
  const avatarRep = matchedRep || (meIdent
    ? { id: meIdent.rep_id || "viewer", name: meIdent.full_name || meIdent.handle || "Viewer", color: matchedRep?.color }
    : { id: "loading", name: "—", color: "var(--text-tertiary)" });
  const name = meIdent?.full_name
    || (meIdent?.handle ? meIdent.handle.replace(/^@/, "") : null)
    || (meIdent ? "Viewer" : "Loading…");
  const tier = meIdent?.tier || matchedRep?.tier || "bronze";
  const role = meIdent?.role ? meIdent.role.replace("_", " ") : null;
  const agencyLine = meIdent?.agency_name || (meIdent?.is_demo ? "Demo Agency" : null);
  return (
    <div className="sb-user" title={agencyLine ? `${name} · ${agencyLine}` : name}>
      <Avatar rep={avatarRep} size={26}/>
      <div className="sb-user-info">
        <div className="sb-user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div className="sb-user-role" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <TierChip tier={tier} compact/>
          {role && <span style={{ textTransform: "capitalize" }}>{role}</span>}
          {agencyLine && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)" }}>
              · {agencyLine}
            </span>
          )}
        </div>
      </div>
      <button className="icon-btn" onClick={() => setPage("settings")} title="Settings"><Icons.Settings size={14}/></button>
    </div>
  );
};

/* ───── Topbar ───── */
const LiveBadge = () => {
  const live = AppData.LIVE;
  return (
    <span className={`live-badge ${live ? "on" : "off"}`} title={live ? "Reading live data from Supabase" : "Showing demo data — Supabase not connected or empty"}>
      <span className="dot"></span>
      {live ? "live" : "demo"}
    </span>
  );
};

const AccountChip = () => {
  const [open, setOpen] = React.useState(false);
  const [me, setMe]     = React.useState(typeof window !== "undefined" && window.me ? window.me() : null);
  React.useEffect(() => {
    const onLoad = (e) => setMe(e.detail || (window.me && window.me()));
    window.addEventListener("me:loaded", onLoad);
    return () => window.removeEventListener("me:loaded", onLoad);
  }, []);
  const inDemo = (() => { try { return sessionStorage.getItem("repflow.demo") === "1"; } catch { return false; } })();
  const isAuthed = !!(me && me.authenticated && !me.is_demo);
  // Loading = me() not yet returned. Avoid flashing "Guest" while we're still
  // resolving the real identity right after sign-in.
  const isLoading = !me;
  const label = isAuthed
    ? (me.full_name || me.handle || me.agency_name || "Account")
    : isLoading
      ? "…"
      : (inDemo || me?.is_demo ? "Demo" : "Guest");
  const sub = isAuthed
    ? (me.agency_name || (me.role ? me.role.replace("_", " ") : ""))
    : isLoading
      ? "Loading…"
      : (inDemo || me?.is_demo ? "Read-only · Demo Instance" : "Not signed in");

  const tone = isAuthed ? "var(--accent-money)"
    : isLoading ? "var(--text-tertiary)"
    : (inDemo || me?.is_demo) ? "var(--accent-status)"
    : "var(--text-tertiary)";
  return (
    <div style={{ position: "relative" }}>
      <button
        className="lb-pill"
        title={`${label} · ${sub}`}
        onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: tone, borderColor: `color-mix(in oklch, ${tone} 35%, transparent)` }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: tone, display: "inline-block" }}></span>
        <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <Icons.ChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 120ms" }}/>
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 240,
            background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
            borderRadius: 8, padding: 10, zIndex: 50,
            boxShadow: "0 12px 32px color-mix(in oklch, black 35%, transparent)"
          }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{label}</div>
          {isAuthed && me.handle && me.handle !== label && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{me.handle}</div>
          )}
          {sub && sub !== label && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>
          )}
          {isAuthed && (me.role || me.tier) && (
            <div style={{ marginTop: 8, fontSize: 10.5, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {me.role && <span className="chip" style={{ textTransform: "capitalize" }}>{me.role.replace("_", " ")}</span>}
              {me.tier && <span className="chip" style={{ textTransform: "capitalize" }}>{me.tier}</span>}
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "10px -10px 0", padding: "8px 10px 0" }}>
            {isAuthed ? (
              <>
                <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", fontSize: 12, marginBottom: 4 }}
                  onClick={() => { setOpen(false); if (window.gotoPage) window.gotoPage("settings"); }}>
                  <Icons.Settings size={11}/> Account settings
                </button>
                <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }}
                  onClick={() => window.signOut && window.signOut()}>
                  <Icons.X size={11}/> Sign out
                </button>
              </>
            ) : (
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                onClick={() => {
                  try { sessionStorage.clear(); } catch (e) { console.warn("[shared.signOutClear]", e); }
                  window.location.reload();
                }}>
                <Icons.Send size={11}/> Sign in to a real account
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Topbar = ({ crumbs, aep, openCmdK, toggleRail, railOn, openMobile, openNotifications, openSettings, notifCount }) => (
  <div className="topbar">
    <div className="crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep"><Icons.ChevronRight size={12}/></span>}
          <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <LiveBadge/>
    <AccountChip/>
    {window.AgencySwitcher && (() => { const A = window.AgencySwitcher; return <A/>; })()}
    <div className="topbar-spacer"/>
    {/* AEP SURGE pill removed 2026-05-11 (P8) — feature archived. The
        `aep` prop continues to be plumbed through (always false now) so
        re-enabling is one line: restore the original conditional. */}
    <button className="cmdk-trigger" onClick={openCmdK}>
      <Icons.Search size={13}/>
      <span>Search or run a command</span>
      <span className="kbd">⌘K</span>
    </button>
    <button
      className="topbar-action"
      onClick={() => window.dispatchEvent(new CustomEvent("quicklog:deal"))}
      title="Log a deal"
    >
      <Icons.FileText size={13} style={{ color: "var(--accent-money)" }}/>
      <span>Deal</span>
    </button>
    <button
      className="topbar-action"
      onClick={() => window.dispatchEvent(new CustomEvent("quicklog:expense"))}
      title="Log an expense"
    >
      <Icons.Wallet size={13} style={{ color: "var(--accent-status)" }}/>
      <span>Expense</span>
    </button>
    <button className="icon-btn" onClick={openMobile} title="Open rep mobile prototype">
      <Icons.Phone size={15}/>
    </button>
    <button
      className="icon-btn"
      onClick={() => { if (window.toggleAISidebar) window.toggleAISidebar(); else if (toggleRail) toggleRail(); }}
      title="AI Copilot (⌘J)"
    >
      <Icons.Sparkles size={15} style={{ color: "var(--accent-money)" }}/>
    </button>
    <button className="icon-btn" onClick={openNotifications} title="Notifications" style={{ position: "relative" }}>
      <Icons.Bell size={15}/>
      {notifCount > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "var(--accent-heat)", boxShadow: "0 0 0 2px var(--bg-base)" }}></span>}
    </button>
    {openSettings && (
      <button className="icon-btn" onClick={openSettings} title="Settings">
        <Icons.Settings size={15}/>
      </button>
    )}
  </div>
);

/* ───── Cmd K ───── */
// Agent actions — clicking one POSTs /api/agent/jobs/enqueue with `kind`.
// `roles` is the role allow-list (must match seeded role_actions rows in 0026).
// `payload` is the static job payload; runtime context (latest call, top NIGO,
// etc.) is left to the worker that picks up the job — keeping the panel a
// thin trigger surface.
const AGENT_ACTIONS = [
  // Built-in flows (composite worker logic, kind matches role_actions in 0026)
  { kind: "recruiting_scan",     roles: ["manager","owner","imo_owner","admin","super_admin"], label: "Run recruiting scan",                        icon: "ArrowUpRight" },
  { kind: "pull_carrier_appts",  roles: ["manager","owner","imo_owner","admin","super_admin"], label: "Sync carrier appointments",                  icon: "Shield"       },
  { kind: "pull_comp_statement", roles: ["owner","imo_owner","admin","super_admin"],           label: "Pull latest commission statement",           icon: "Wallet"       },
  { kind: "transcribe_call",     roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Transcribe my most recent call",       icon: "Headset",     payload: { latest: true } },
  { kind: "nigo_followup",       roles: ["rep"],                                               label: "Send NIGO follow-up to top stalled deal",     icon: "Bell",        payload: { latest: true } },
  { kind: "coaching_drop",       roles: ["manager","imo_owner"],                               label: "Drop coaching note on a rep",                 icon: "Users",       payload: { latest: true } },
  { kind: "quote_carrier",       roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Quote current carrier rate sheet",     icon: "Wallet"       },
  { kind: "send_sms",            roles: ["rep","manager"],                                     label: "Send SMS to current lead",                    icon: "Phone",       payload: { latest: true } },
  { kind: "mint_install_token",  roles: ["admin","owner","imo_owner","super_admin"],           label: "Generate local agent install token",          icon: "Plug",        policy: { requires_approval: true } },

  // Direct-mapped agent tool kinds (one-to-one with runtime/tools/<kind>.py; seeded in 0031)
  { kind: "create_lead",         roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Capture this lead into pipeline",      icon: "Sparkles",   group: "intake" },
  { kind: "draft_email",         roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Draft an email (local LLM)",           icon: "FileText",   group: "compose" },
  { kind: "draft_sms",           roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Draft an SMS (local LLM)",             icon: "Phone",      group: "compose" },
  { kind: "script_review",       roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "QA a script (tone + compliance)",      icon: "Shield",     group: "review" },
  { kind: "file_review",         roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Summarize a file in the workspace",    icon: "Folder",     group: "review" },
  { kind: "twilio_dial",         roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Dial current lead via Twilio",         icon: "Phone",      group: "comms" },
  { kind: "phone_link_dial",     roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Dial current lead via Phone Link",     icon: "Phone",      group: "comms" },
  { kind: "sendblue_send",       roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Send iMessage (Sendblue)",             icon: "Phone",      group: "comms" },
  { kind: "ig_dm_reply",         roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Reply to IG DMs",                      icon: "Sparkles",   group: "social" },
  { kind: "meta_dm_send",        roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Send a Meta DM",                       icon: "Sparkles",   group: "social" },
  { kind: "linkedin_send",       roles: ["manager","owner","imo_owner","admin","super_admin"],       label: "Send a LinkedIn message",              icon: "Sparkles",   group: "social" },
  { kind: "linkedin_inbox_scan", roles: ["manager","owner","imo_owner","admin","super_admin"],       label: "Scan LinkedIn inbox",                  icon: "Sparkles",   group: "social" },
  { kind: "fathom_pull_notes",   roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Pull notes from latest Fathom call",   icon: "Headset",    group: "pull" },
  { kind: "fb_pull_lead_forms",  roles: ["manager","owner","imo_owner","admin","super_admin"],       label: "Pull Facebook lead forms",             icon: "Sparkles",   group: "pull" },
  { kind: "auto_quote",          roles: ["rep","manager","owner","imo_owner","admin","super_admin"], label: "Run auto-quote across carriers",       icon: "Wallet",     group: "quote" },
  { kind: "browser_run",         roles: ["manager","owner","imo_owner","admin","super_admin"],       label: "Run a guided Playwright task",         icon: "Plug",       group: "browser" },
];

// Awareness collector — the sidebar (and any other caller) folds these into
// every enqueue so the worker has a snapshot of what the user was doing.
// Window-global so non-React surfaces (e.g. CmdK) can also include context.
window.__aiAwareness = window.__aiAwareness || {};
window.__collectAwareness = function () {
  try {
    const sel = (typeof window !== "undefined" && window.getSelection)
      ? String(window.getSelection() || "").slice(0, 240) : "";
    const route = window.location?.hash || window.location?.pathname || "";
    const title = (typeof document !== "undefined" ? document.title : "") || "";
    const merged = { ...(window.__aiAwareness || {}), route, title, selection: sel,
                     captured_at: new Date().toISOString() };
    return merged;
  } catch { return {}; }
};

async function enqueueAgentJob(action, extraContext) {
  const { kind, payload = {}, policy = {} } = action;
  try {
    let jwt = null;
    const sb = window.getSupabase && window.getSupabase();
    if (sb) {
      const { data } = await sb.auth.getSession();
      jwt = data?.session?.access_token || null;
    }
    if (!jwt) { window.toast?.("Sign in to run agent actions", "error"); return; }
    // Fold the awareness snapshot in under payload.context so workers can
    // condition on it without breaking the existing typed payload contract.
    const ctx = window.__collectAwareness ? window.__collectAwareness() : {};
    const merged = { ...payload, context: { ...ctx, ...(extraContext || {}) } };
    // Bridge: hit /commands/enqueue (writes rba_commands, the live agent queue).
    // /jobs/enqueue (agent_jobs) is the newer destination but the agent doesn't
    // poll it yet — switch when the agent runtime migrates.
    const r = await fetch("/api/agent/commands/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ kind, payload: merged, policy }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok)         { window.toast?.(`Agent: ${body.error || r.status}`, "error"); return null; }
    if (body.denied)   { window.toast?.(`Denied (${body.ring}): ${body.reason}`, "error"); return null; }
    if (body.idempotent) { window.toast?.(`${kind} already queued`, "info"); return body; }
    if (body.status === "pending_approval") { window.toast?.(`${kind} pending approval`, "info"); return body; }
    window.toast?.(`Queued: ${kind}`, "success");
    return body;
  } catch (e) {
    window.toast?.(`Agent error: ${e.message || e}`, "error");
    return null;
  }
}
window.enqueueAgentJob = enqueueAgentJob;

const CMD_ITEMS = {
  Actions: AGENT_ACTIONS.map(a => ({ label: a.label, icon: a.icon, _kind: "agent_action", _action: a })),
  Navigate: [
    { label: "Today",              icon: "Home",         nav: "today" },
    { label: "Pipeline",           icon: "Pipeline",     nav: "pipeline" },
    { label: "Dial Queue",         icon: "Phone",        nav: "queue" },
    { label: "Calls",              icon: "Headset",      nav: "calls" },
    { label: "Leaderboard",        icon: "Trophy",       nav: "leaderboard" },
    { label: "Performance · standings + tiering + forecast", icon: "Trophy", nav: "performance" },
    { label: "Commissions",        icon: "Wallet",       nav: "commissions" },
    { label: "Training",           icon: "Book",         nav: "training" },
    { label: "Vault",              icon: "Folder",       nav: "vault" },
    { label: "Resources · scrub tool + carriers + links", icon: "Folder", nav: "resources" },
    { label: "Recruiting Funnel",  icon: "ArrowUpRight", nav: "recruiting" },
    { label: "P&L",                icon: "TrendingUp",   nav: "pnl" },
    { label: "Org Tree",           icon: "Users",        nav: "tree" },
    { label: "Book Analytics",     icon: "Activity",     nav: "book" },
    { label: "Lead Vendors · ROI", icon: "Wallet",       nav: "attribution" },
    { label: "NIGO Queue",         icon: "Bell",         nav: "nigo" },
    { label: "Connections",        icon: "Plug",         nav: "connections" },
    { label: "Settings",           icon: "Settings",     nav: "settings" },
  ],
  "Ask Repflow": [
    { label: "Show leads I haven't touched in 7 days",            icon: "Sparkles", nav: "pipeline" },
    { label: "Compare my conversion vs the team, last month",     icon: "Sparkles", nav: "leaderboard" },
    { label: "Why did my last chargeback happen?",                icon: "Sparkles", nav: "calls" },
  ],
};

const CmdK = ({ open, onClose, goto }) => {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef();
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 60); } }, [open]);

  // Unified search: builds a virtual dataset from leads + scripts + docs +
  // quick links + reps + carriers — a query "Cheryl" returns Cheryl Hampton's
  // pipeline row + every doc/script that mentions her. Pages stay top of list.
  const dataset = useMemo(() => {
    const items = [];
    const role = (typeof window !== "undefined" && window.me && window.me()?.role) || null;
    Object.entries(CMD_ITEMS).forEach(([sec, list]) => {
      list.forEach(i => {
        // Carry the source _kind through (agent_action / page) but tag with sec.
        const base = { ...i, sec };
        if (i._kind === "agent_action") {
          // Role-filter: hide actions the caller's role can't dispatch.
          if (role && Array.isArray(i._action?.roles) && !i._action.roles.includes(role)) return;
          items.push(base);
        } else {
          items.push({ ...base, _kind: "page" });
        }
      });
    });
    if (q && q.length >= 2) {
      const ql = q.toLowerCase();
      const safeStartsWith = (s) => (s || "").toLowerCase().includes(ql);
      // Leads
      (window.AppData?.PIPELINE || []).slice(0, 200).forEach(p => {
        if (safeStartsWith(p.lead) || safeStartsWith(p.product) || safeStartsWith(p.source) || safeStartsWith(p.state)) {
          items.push({ label: `${p.lead} · ${p.product || "—"}`, sec: "Leads", icon: "Phone", _kind: "lead", _payload: p,
            sub: `${p.stage} · ${p.state || "—"} · owner ${p.owner || "—"}` });
        }
      });
      // Reps
      (window.AppData?.REPS || []).forEach(r => {
        if (safeStartsWith(r.name) || safeStartsWith(r.handle) || safeStartsWith(r.tier)) {
          items.push({ label: r.name, sec: "Reps", icon: "Users", _kind: "rep", _payload: r,
            sub: `${r.handle} · ${r.tier?.toUpperCase()}` });
        }
      });
      // Scripts
      (window.AppData?.SCRIPTS_LIB || []).forEach(s => {
        if (safeStartsWith(s.title) || safeStartsWith(s.body) || safeStartsWith(s.cat)) {
          items.push({ label: s.title, sec: "Scripts", icon: "FileText", _kind: "script", _payload: s,
            sub: `${s.cat} · ${s.version || ""}` });
        }
      });
      // Docs
      (window.AppData?.DOCS || []).forEach(d => {
        if (safeStartsWith(d.title) || safeStartsWith(d.cat) || safeStartsWith(d.text)) {
          items.push({ label: d.title, sec: "Docs", icon: "Folder", _kind: "doc", _payload: d,
            sub: `${d.cat} · ${d.kind || "link"}` });
        }
      });
      // Quick links
      (window.AppData?.QUICK_LINKS || []).forEach(l => {
        if (safeStartsWith(l.label) || safeStartsWith(l.cat) || safeStartsWith(l.url)) {
          items.push({ label: l.label, sec: "Links", icon: "Bookmark", _kind: "link", _payload: l,
            sub: l.cat });
        }
      });
      // Carriers
      (window.AppData?.CARRIERS || []).forEach(c => {
        if (safeStartsWith(c.name) || safeStartsWith(c.category)) {
          items.push({ label: c.name, sec: "Carriers", icon: "Shield", _kind: "carrier", _payload: c,
            sub: c.category });
        }
      });
    }
    return items;
  }, [q]);

  const flat = useMemo(() => {
    if (!q) return dataset.filter(i => i._kind === "page" || i._kind === "agent_action");
    const ql = q.toLowerCase();
    return dataset.filter(i => i.label.toLowerCase().includes(ql) || (i.sub || "").toLowerCase().includes(ql))?.slice(0, 50);
  }, [dataset, q]);

  const run = (it) => {
    if (!it) return onClose();
    if (it._kind === "agent_action") { enqueueAgentJob(it._action); onClose(); return; }
    if (it._kind === "page" && it.nav && goto) { goto(it.nav); onClose(); return; }
    if (it._kind === "lead")    { goto && goto("crm");     window.dispatchEvent(new CustomEvent("crm:focusLead", { detail: it._payload })); onClose(); return; }
    if (it._kind === "rep")     { goto && goto("team");                                                                                    onClose(); return; }
    if (it._kind === "script")  { goto && goto("library"); window.dispatchEvent(new CustomEvent("library:openScript", { detail: it._payload })); onClose(); return; }
    if (it._kind === "doc")     { if (it._payload?.url) window.open(it._payload.url, "_blank"); else { goto && goto("library"); } onClose(); return; }
    if (it._kind === "link")    { if (it._payload?.url) window.open(it._payload.url, "_blank"); onClose(); return; }
    if (it._kind === "carrier") { goto && goto("library"); onClose(); return; }
    if (it.nav && goto)         { goto(it.nav); }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(flat.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); run(flat[sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, sel]);

  if (!open) return null;
  const grouped = flat.reduce((acc, it) => { (acc[it.sec] ||= []).push(it); return acc; }, {});

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Type a command, ask anything..." onKeyDown={(e) => e.key === "Escape" && onClose()}/>
        <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {Object.entries(grouped).map(([sec, items]) => (
            <div key={sec} className="cmdk-section">
              <div className="cmdk-section-title">{sec}</div>
              {items.map((it, i) => {
                const Ico = Icons[it.icon] || Icons.ArrowRight;
                const idx = flat.indexOf(it);
                return (
                  <div key={i} className={`cmdk-item ${idx === sel ? "sel" : ""}`} onMouseEnter={() => setSel(idx)} onClick={() => run(it)}>
                    <Ico size={14} style={{ color: it._kind === "agent_action" ? "var(--accent-money)" : "var(--text-tertiary)" }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{it.label}</div>
                      {it.sub && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>{it.sub}</div>}
                    </div>
                    {it._kind === "agent_action" && <span className="kbd" style={{ background: "color-mix(in oklch, var(--accent-money) 18%, transparent)", color: "var(--accent-money)", border: 0 }}>agent</span>}
                    {it.kbd && <span className="kbd">{it.kbd}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div style={{ padding: "20px", color: "var(--text-tertiary)", textAlign: "center", fontSize: 12.5 }}>No matches</div>}
        </div>
      </div>
    </div>
  );
};

/* ───── AI Rail (functional — calls /api/copilot which proxies to Gemini) ───── */
const SUGGESTIONS_BY_PAGE = {
  pnl:          ["Which downline is dragging persistency below 80%?", "What's my biggest leak in the P&L this month?", "If I cut the worst-performing lead source, what's the net impact?"],
  pipeline:     ["Show me leads I haven't touched in 7 days", "Which deals are most likely to close this week?", "Why is this deal stuck in 'App In'?"],
  queue:        ["Which lead in the queue should I dial first and why?", "Draft a 30-second opener for the top scored lead", "Which producers are hottest right now?"],
  leaderboard:  ["Compare my conversion vs Tony's last month", "What's the gap between #1 and #2 this month?"],
  performance:  ["Who would qualify for Diamond if MTD threshold dropped to $45k?", "Which producers are most at risk of missing tier this month?", "What's our 30-day weighted forecast vs goal?"],
  team:         ["Who's at risk of missing tier this month?", "Which producer needs a coaching nudge today?"],
  coaching:     ["Top 3 issues across all producer calls this week", "Which coaching theme is moving the needle most?"],
  vault:        ["Find the FE objection-handling script", "Which courses are still incomplete for the team?"],
  resources:    ["Which carrier portal needs the credentials reset this month?", "Add a quick link for the new training URL"],
  recruiting:   ["Which campaign has the lowest cost per producer?", "Draft a follow-up DM for {{handle}} based on their reply"],
  commissions:  ["Where's my biggest variance vs carrier statements this month?"],
  book:          ["Which carrier mix segment has the best persistency?"],
  default:       ["Summarize what's on this page", "What should I focus on right now?", "What changed since yesterday?"],
};

function pageKeyFromContext(context) {
  if (!context) return "default";
  const c = String(context).toLowerCase();
  if (c.includes("p&l") || c.includes("pnl")) return "pnl";
  if (c.includes("pipeline")) return "pipeline";
  if (c.includes("queue") || c.includes("dispatch")) return "queue";
  if (c.includes("performance") || c.includes("standings")) return "performance";
  if (c.includes("leaderboard")) return "leaderboard";
  if (c.includes("team")) return "team";
  if (c.includes("coaching")) return "coaching";
  if (c.includes("vault")) return "vault";
  if (c.includes("resources")) return "resources";
  if (c.includes("tiering")) return "performance";
  if (c.includes("forecast")) return "performance";
  if (c.includes("recruit")) return "recruiting";
  if (c.includes("commission")) return "commissions";
  if (c.includes("book")) return "book";
  return "default";
}

const AIRail = ({ context }) => {
  const [val, setVal]       = useState("");
  const [history, setHist]  = useState([]); // [{role, text, ms}]
  const [busy, setBusy]     = useState(false);
  const bottomRef            = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history.length, busy]);

  // External pages can dispatch CustomEvent('ai:ask', { detail: { prompt, context }})
  // to seed the rail with a prompt and auto-fire it.
  useEffect(() => {
    const onAsk = (e) => { const p = e.detail?.prompt; if (p) ask(p); };
    window.addEventListener("ai:ask", onAsk);
    return () => window.removeEventListener("ai:ask", onAsk);
  }, [busy]);

  const ask = async (prompt) => {
    if (!prompt.trim() || busy) return;
    setHist(h => [...h, { role: "user", text: prompt }]);
    setVal("");
    setBusy(true);
    try {
      // If signed in, forward the Supabase JWT so the Edge fn can fetch live data
      // under authenticated RLS. Demo mode just sends no token.
      let jwt = null;
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        jwt = data?.session?.access_token || null;
      }
      const headers = { "content-type": "application/json" };
      if (jwt) headers["x-supabase-auth"] = `Bearer ${jwt}`;
      // Pass last 3 turns so the copilot has short-term memory for vague
      // follow-ups like "what do you need?" / "??". Each turn = {q, a}.
      const recent = [];
      for (let i = hist.length - 1; i >= 0 && recent.length < 3; i--) {
        const m = hist[i];
        if (m.role === "assistant" && i > 0 && hist[i-1]?.role === "user") {
          recent.unshift({ q: hist[i-1].text || "", a: m.text || "" });
        }
      }
      const resp = await fetch("/api/copilot", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, context, history: recent })
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error + (j.detail ? " — " + j.detail.slice(0, 200) : ""));
      setHist(h => [...h, { role: "assistant", text: j.text, ms: j.ms, model: j.model, tools: j.tools_used }]);
    } catch (e) {
      setHist(h => [...h, { role: "assistant", text: "Couldn't reach the model. " + (e.message || ""), ms: 0, err: true }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = SUGGESTIONS_BY_PAGE[pageKeyFromContext(context)] || SUGGESTIONS_BY_PAGE.default;

  return (
    <aside className="airail">
      <div className="airail-h">
        <Icons.Sparkles size={14} style={{ color: "var(--accent-money)" }}/>
        <span className="title">Co-pilot</span>
        <span className="meta">{context}</span>
        {history.length > 0 && <button className="icon-btn" onClick={() => setHist([])} title="Clear"><Icons.X size={12}/></button>}
      </div>
      <div className="airail-body">
        {history.length === 0 && (
          <>
            <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Ask anything about <strong style={{ color: "var(--text-primary)" }}>{context}</strong>. I see your current page and can pull from your data.
            </div>
            <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {suggestions.map((s, i) => (
                <button key={i} className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: "8px 10px", fontSize: 12, textAlign: "left", whiteSpace: "normal", height: "auto", lineHeight: 1.4 }} onClick={() => ask(s)}>
                  <Icons.Sparkles size={11} style={{ color: "var(--accent-money)", flex: "0 0 auto" }}/>
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {history.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role === "assistant" ? "assistant" : ""}`}>
            <div className="who">
              {m.role === "user" ? (() => {
                // Use real signed-in viewer for the "You" avatar instead of REPS[0].
                const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
                const matched = meIdent?.rep_id ? (AppData.REPS || []).find(r => r.id === meIdent.rep_id) : null;
                const stub = matched || (meIdent ? { id: meIdent.rep_id || "you", name: meIdent.full_name || "You" } : { id: "you", name: "You" });
                return <><Avatar rep={stub} size={16}/> You</>;
              })() : <><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/> Repflow{m.ms ? ` · ${(m.ms/1000).toFixed(1)}s` : ""}{m.tools?.length ? ` · queried ${m.tools.join(", ")}` : ""}</>}
            </div>
            <div className="body" style={{ whiteSpace: "pre-wrap", color: m.err ? "var(--state-danger)" : undefined }}>{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="ai-msg assistant">
            <div className="who"><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/> Repflow · thinking...</div>
            <div className="body" style={{ display: "flex", gap: 4 }}>
              <span className="ai-dot"></span><span className="ai-dot"></span><span className="ai-dot"></span>
            </div>
          </div>
        )}
        <div ref={bottomRef}></div>
      </div>
      <div className="airail-foot">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="airail-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Ask anything, or hold ⌥ to dictate"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask(val))}
            disabled={busy}
          />
          <button className="icon-btn" onClick={() => ask(val)} disabled={busy || !val.trim()} style={{ background: "var(--bg-raised)" }}><Icons.Send size={14}/></button>
        </div>
      </div>
    </aside>
  );
};

/* ───── Modal + form primitives (used by Pipeline filter, New-lead, Bulk-assign) ───── */
const Modal = ({ title, children, onClose, actions, width = 460 }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width }}>
        <div className="modal-h">
          <div className="modal-t">{title}</div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-foot">{actions}</div>}
      </div>
    </div>
  );
};

const Field = ({ label, children, hint }) => (
  <label className="field">
    <span className="field-l">{label}</span>
    {children}
    {hint && <span className="field-h">{hint}</span>}
  </label>
);

const Select = ({ value, onChange, options }) => (
  <select className="text-input" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o, i) => <option key={i} value={o.v ?? o.value}>{o.l ?? o.label}</option>)}
  </select>
);

/* Section pill — horizontal liquid-glass tabs for combining related pages
   within one screen. Use as: <SectionPill items={[{k:"a",l:"All"},...]}
   value={tab} onChange={setTab}/> */
const SectionPill = ({ items, value, onChange, dense }) => (
  <div className="section-pill" style={dense ? { margin: "0 0 8px" } : undefined}>
    {items.map(it => (
      <button key={it.k} className={value === it.k ? "active" : ""} onClick={() => onChange(it.k)}>
        {it.icon && Icons[it.icon] ? React.createElement(Icons[it.icon], { size: 11, style: { marginRight: 4, verticalAlign: "middle" } }) : null}
        {it.l}
        {it.badge != null && <span className="badge tabular" style={{ marginLeft: 6, fontSize: 9.5 }}>{it.badge}</span>}
      </button>
    ))}
  </div>
);

/* Validation helpers — every form should reach for these instead of trusting
   the input element. Phone uses a permissive E.164 (10-15 digits, optional +).
   Age clamps to 0-120 to catch typos like 999. ZIP is 5 or 5+4. */
const Validate = {
  phone(v) {
    if (!v) return { ok: true,  msg: "" };
    const cleaned = String(v).replace(/[\s\-().]/g, "");
    return /^\+?[1-9]\d{9,14}$/.test(cleaned)
      ? { ok: true, msg: "" }
      : { ok: false, msg: "Phone must be E.164 (10-15 digits, optional +)" };
  },
  age(v) {
    if (v === "" || v == null) return { ok: true, msg: "" };
    const n = Number(v);
    if (!Number.isFinite(n))   return { ok: false, msg: "Age must be a number" };
    if (n < 0 || n > 120)      return { ok: false, msg: "Age must be 0-120" };
    return { ok: true, msg: "" };
  },
  zip(v) {
    if (!v) return { ok: true, msg: "" };
    return /^\d{5}(-\d{4})?$/.test(String(v).trim())
      ? { ok: true, msg: "" }
      : { ok: false, msg: "ZIP must be 5 digits (or 5+4)" };
  },
  state(v) {
    if (!v) return { ok: true, msg: "" };
    return /^[A-Z]{2}$/.test(String(v).trim().toUpperCase())
      ? { ok: true, msg: "" }
      : { ok: false, msg: "State must be 2-letter code" };
  },
  money(v) {
    if (v === "" || v == null) return { ok: true, msg: "" };
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(n)) return { ok: false, msg: "Must be a number" };
    if (n < 0)               return { ok: false, msg: "Cannot be negative" };
    return { ok: true, msg: "" };
  },
};

/* ValidatedInput — text-input that shows inline error tone + message when the
   value fails its kind's check. Use as drop-in: <ValidatedInput kind="phone"
   value={...} onChange={...}/>. */
const ValidatedInput = ({ kind, value, onChange, className = "text-input", ...rest }) => {
  const v = Validate[kind] ? Validate[kind](value) : { ok: true, msg: "" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <input className={className} value={value || ""} onChange={onChange} {...rest}
        style={{ ...(rest.style || {}), borderColor: !v.ok && value ? "var(--state-danger)" : undefined }}/>
      {!v.ok && value && (
        <span style={{ fontSize: 10.5, color: "var(--state-danger)" }}>{v.msg}</span>
      )}
    </div>
  );
};

/* React class error boundary — wraps page content so a single throwing
   component doesn't blank the whole app. Logs to console + offers a reset.
   resetKey is bumped on Try-again so children get a fresh mount (the previous
   implementation just cleared err state; if the throw was deterministic on
   the same children, the user clicked Try-again and got the same crash). */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, info: null, resetKey: 0 }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    console.error("[ErrorBoundary]", err, info?.componentStack);
    this.setState({ info });
    if (window.toast) window.toast(`UI error: ${err?.message || err}`, "error");
    // Report to the server-side error log (lib/error-reporter.js). React
    // boundary errors don't bubble to window.onerror, so without this hook
    // panel crashes are invisible to /api/client-error.
    if (window.reportClientError) {
      try { window.reportClientError(err, info); } catch {}
    }
  }
  render() {
    if (!this.state.err) return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    const stack = this.state.err?.stack || "";
    const compStack = this.state.info?.componentStack || "";
    const compFrames = compStack.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 5);
    return (
      <div style={{ padding: 18, margin: 14, background: "var(--bg-raised)", border: "1px solid color-mix(in oklch, var(--state-danger) 35%, transparent)", borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--state-danger)", marginBottom: 6 }}>This panel hit an error.</div>
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)", marginBottom: 8, whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err)}</div>
        {(compFrames.length > 0 || stack) && (
          <details style={{ marginBottom: 10 }}>
            <summary style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>Where (click to expand)</summary>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap", marginTop: 6, maxHeight: 220, overflow: "auto" }}>
              {compFrames.join("\n")}
              {stack ? "\n— js stack —\n" + stack.split("\n").slice(0, 8).join("\n") : ""}
            </div>
          </details>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => this.setState(s => ({ err: null, info: null, resetKey: s.resetKey + 1 }))}>Try again</button>
          <button className="btn" onClick={() => window.location.reload()}>Reload page</button>
          <button className="btn btn-ghost" onClick={() => window.signOut && window.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }
}

/* Skeleton row — drop-in for any list/table during initial Supabase hydrate.
   Animates a shimmer; honors prefers-reduced-motion. */
const Skeleton = ({ height = 14, width = "100%", radius = 4, count = 1, gap = 8 }) => {
  const item = (
    <div style={{
      height, width, borderRadius: radius,
      background: "linear-gradient(90deg, var(--bg-raised) 0%, var(--bg-overlay) 50%, var(--bg-raised) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s ease-in-out infinite",
    }}/>
  );
  if (count === 1) return item;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }).map((_, i) => <div key={i}>{item}</div>)}
    </div>
  );
};

/* Agency timezone resolver — every page that displays "Today" should use this
   instead of `new Date()` so distributed teams don't see different totals.
   Reads me().agency_timezone (column added by future migration when needed),
   falls back to the agency's first-rep state mapping, finally browser local.
   Also exposes formatInTz(date) for formatting rolled-up calendar dates. */
const AgencyTime = (() => {
  const STATE_TO_TZ = {
    AL: "America/Chicago",     AK: "America/Anchorage",  AZ: "America/Phoenix",
    AR: "America/Chicago",     CA: "America/Los_Angeles",CO: "America/Denver",
    CT: "America/New_York",    DE: "America/New_York",   FL: "America/New_York",
    GA: "America/New_York",    HI: "Pacific/Honolulu",   ID: "America/Boise",
    IL: "America/Chicago",     IN: "America/Indianapolis",IA: "America/Chicago",
    KS: "America/Chicago",     KY: "America/New_York",   LA: "America/Chicago",
    ME: "America/New_York",    MD: "America/New_York",   MA: "America/New_York",
    MI: "America/Detroit",     MN: "America/Chicago",    MS: "America/Chicago",
    MO: "America/Chicago",     MT: "America/Denver",     NE: "America/Chicago",
    NV: "America/Los_Angeles", NH: "America/New_York",   NJ: "America/New_York",
    NM: "America/Denver",      NY: "America/New_York",   NC: "America/New_York",
    ND: "America/Chicago",     OH: "America/New_York",   OK: "America/Chicago",
    OR: "America/Los_Angeles", PA: "America/New_York",   RI: "America/New_York",
    SC: "America/New_York",    SD: "America/Chicago",    TN: "America/Chicago",
    TX: "America/Chicago",     UT: "America/Denver",     VT: "America/New_York",
    VA: "America/New_York",    WA: "America/Los_Angeles",WV: "America/New_York",
    WI: "America/Chicago",     WY: "America/Denver",
  };
  function resolve() {
    const m = window.me && window.me();
    if (m?.agency_timezone)   return m.agency_timezone;
    if (m?.agency_state && STATE_TO_TZ[m.agency_state]) return STATE_TO_TZ[m.agency_state];
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  }
  return {
    resolve,
    todayStr() {
      try { return new Date().toLocaleDateString("en-CA", { timeZone: resolve() }); }
      catch { return new Date().toISOString().slice(0, 10); }
    },
    format(d, opts) {
      try { return new Date(d).toLocaleString("en-US", { timeZone: resolve(), ...(opts || {}) }); }
      catch { return new Date(d).toLocaleString(); }
    },
  };
})();

/* Demo agency guard — every fallback to seed/sample data must check this so
   a real signed-in agency never sees Atlas / Cheryl / Marcus content.
   Real agencies hit empty states with import/add CTAs instead. */
const DEMO_AGENCY_ID = "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";
const isDemoAgency = () => {
  // Multi-source check — pre-auth, demo skip, the legacy hardcoded ID,
  // or the live is_demo flag on the active agency (new IMO/agency model).
  if (window.__demoSkip) return true;
  if (window.__activeAgency && window.__activeAgency.is_demo) return true;
  const m = window.me && window.me();
  if (!m) return true;
  if (m.is_demo === true) return true;
  if (m.agency_id && String(m.agency_id) === DEMO_AGENCY_ID) return true;
  return false;
};

/* Public version toggle — when true, we hide 'Advanced Agentic' and 
   'Installation' pages (OCI node management, raw LLM configs) to simplify 
   the experience for the first wave of real users. */
const isPublicVersion = () => {
  if (typeof window === "undefined") return false;
  return !!(window.location.hostname === "repflow.com" || window.__publicMode);
};

const fmtMoney = (n) => "$" + Math.round(Number(n) || 0).toLocaleString();
const fmtMoneyCents = (cents) => "$" + Math.round((Number(cents) || 0) / 100).toLocaleString();
const fmtMoneyExact = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

window.Shared = { TierChip, Avatar, Sparkline, KpiCard, Sidebar, Topbar, CmdK, AIRail, NAV, Modal, Field, Select, SectionPill, Validate, ValidatedInput, ErrorBoundary, Skeleton, AgencyTime, isDemoAgency, DEMO_AGENCY_ID, isPublicVersion, fmtMoney, fmtMoneyCents, fmtMoneyExact };
window.isDemoAgency = isDemoAgency;
window.isPublicVersion = isPublicVersion;
window.AgencyTime = AgencyTime;

/* AutodialQueue — per-rep "play queue" for the autodialer.
   localStorage stays the synchronous cache (UI never blocks on the network).
   Every mutation also debounce-upserts the same payload to public.user_prefs
   (key = "autodial_queue") so the queue survives a device switch.
   On me:loaded, call AutodialQueue.hydrate() once — fetches the server row,
   merges with local (server wins iff its updated_at is newer than local's),
   and dispatches autodial:queue:changed so any open UI re-renders. */
window.AutodialQueue = (() => {
  const KEY     = "repflow.autodial.queue.v1";
  const META    = "repflow.autodial.queue.meta.v1"; // { updated_at: ISO }
  const PREF    = "autodial_queue";

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  };
  const readMeta = () => {
    try { return JSON.parse(localStorage.getItem(META) || "{}"); }
    catch { return {}; }
  };
  const writeMeta = (m) => {
    try { localStorage.setItem(META, JSON.stringify(m)); } catch (_e) {}
  };

  let pushTimer = null;
  const schedulePush = () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 600);
  };

  const repId = () => {
    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    return me?.rep_id || null;
  };

  const pushNow = async () => {
    pushTimer = null;
    const sb  = window.getSupabase && window.getSupabase();
    const rid = repId();
    if (!sb || !rid) return; // anon / pre-signin → cache-only is fine
    const value = read();
    const updated_at = new Date().toISOString();
    writeMeta({ updated_at });
    try {
      const { error } = await sb.from("user_prefs").upsert(
        { rep_id: rid, key: PREF, value, updated_at },
        { onConflict: "rep_id,key" }
      );
      if (error && !/relation .* does not exist/i.test(error.message || "")) {
        // Don't spam the user when the migration hasn't been applied yet —
        // localStorage already holds the queue, the upsert is best-effort.
        console.warn("AutodialQueue push failed:", error.message || error);
      }
    } catch (e) {
      console.warn("AutodialQueue push threw:", e?.message || e);
    }
  };

  const write = (rows, { push = true } = {}) => {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); }
    catch (e) { console.warn("[shared.localStorageWrite]", e); }
    writeMeta({ updated_at: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent("autodial:queue:changed"));
    if (push) schedulePush();
  };

  return {
    list() { return read(); },
    count() { return read().length; },
    has(id) { return read().some(x => x.id === id); },
    add(item) {
      if (!item || !item.id) return false;
      const cur = read();
      if (cur.some(x => x.id === item.id)) return false;
      write([...cur, { ...item, _addedAt: Date.now() }]);
      window.toast && window.toast(`${item.lead || "Lead"} added to autodial`, "success");
      return true;
    },
    remove(id) { write(read().filter(x => x.id !== id)); },
    clear() { write([]); },

    // hydrate() — pull the server row and reconcile with local. Server wins
    // iff its updated_at is strictly newer than the local meta timestamp;
    // otherwise we push local up (covers the offline-mutate-then-online
    // case). Fires autodial:queue:changed if the local list actually
    // changes. Safe to call multiple times. Returns the resolved list.
    async hydrate() {
      const sb  = window.getSupabase && window.getSupabase();
      const rid = repId();
      if (!sb || !rid) return read();
      try {
        const { data, error } = await sb.from("user_prefs")
          .select("value, updated_at")
          .eq("rep_id", rid)
          .eq("key", PREF)
          .maybeSingle();
        if (error) {
          if (!/relation .* does not exist/i.test(error.message || "")) {
            console.warn("AutodialQueue hydrate failed:", error.message || error);
          }
          return read();
        }
        if (!data) {
          // No server row yet — push local up (if any) so it's there next
          // time we land on a different device.
          if (read().length > 0) schedulePush();
          return read();
        }
        const localMeta = readMeta();
        const serverNewer = !localMeta.updated_at
          || new Date(data.updated_at) > new Date(localMeta.updated_at);
        if (serverNewer) {
          const serverList = Array.isArray(data.value) ? data.value : [];
          const prevJSON = JSON.stringify(read());
          const nextJSON = JSON.stringify(serverList);
          if (prevJSON !== nextJSON) {
            // Adopt server state without re-pushing — server is already the
            // authoritative copy we just read.
            write(serverList, { push: false });
            writeMeta({ updated_at: data.updated_at });
          } else {
            writeMeta({ updated_at: data.updated_at });
          }
          return serverList;
        }
        // Local is newer (or equal) — push to catch the server up.
        schedulePush();
        return read();
      } catch (e) {
        console.warn("AutodialQueue hydrate threw:", e?.message || e);
        return read();
      }
    },
  };
})();
