/* Shared atomic components for Repflow */
const { useState, useEffect, useRef, useMemo } = React;

const TierChip = ({ tier, compact }) => (
  <span className={`tier tier-${tier}`}>
    <span className="gem"></span>
    {!compact && AppData.TIER_LABELS[tier]}
  </span>
);

const Avatar = ({ rep, size = 22 }) => {
  const initials = rep.name.split(" ").map(s => s[0]).slice(0, 2).join("");
  return (
    <span className="avatar-xs" style={{ width: size, height: size, fontSize: size * 0.42, background: rep.color }}>
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
const NAV = {
  rep: [
    { id: "today",       label: "Today",        icon: "Home" },
    { id: "floor",       label: "Floor",        icon: "Phone",    badge: "47" },
    { id: "coaching",    label: "Coaching",     icon: "Activity" },
    { id: "leaderboard", label: "Leaderboard",  icon: "Trophy" },
    { id: "commissions", label: "Commissions",  icon: "Wallet" },
    { id: "training",    label: "Training",     icon: "Book" },
  ],
  manager: [
    { id: "today",       label: "Today",        icon: "Home" },
    { id: "team",        label: "Team Board",   icon: "Users" },
    { id: "coaching",    label: "Coaching",     icon: "Activity" },
    { id: "pipeline",    label: "Pipeline",     icon: "Pipeline", badge: "184" },
    { id: "queue",       label: "Dispatch",     icon: "Kanban" },
    { id: "calls",       label: "Calls",        icon: "Headset" },
    { id: "leaderboard", label: "Leaderboard",  icon: "Trophy" },
    { id: "commissions", label: "Commissions",  icon: "Wallet" },
    { id: "nigo",        label: "NIGO Queue",   icon: "Bell" },
    { id: "recruiting",  label: "Recruiting",   icon: "ArrowUpRight" },
    { id: "training",    label: "Training",     icon: "Book" },
  ],
  owner: [
    { id: "pnl",         label: "P&L",          icon: "TrendingUp" },
    { id: "tree",        label: "Org Tree",     icon: "Users" },
    { id: "book",        label: "Book Analytics", icon: "Activity" },
    { id: "attribution", label: "Lead Vendors", icon: "Wallet" },
    { id: "recruiting",  label: "Recruiting",   icon: "ArrowUpRight" },
    { id: "coaching",    label: "Coaching",     icon: "Activity" },
    { id: "commissions", label: "Commissions",  icon: "Wallet" },
    { id: "training",    label: "Training",     icon: "Book" },
    { id: "vault",       label: "Compliance Vault", icon: "Shield" },
    { id: "scrubbers",   label: "Scrubbers",   icon: "Shield" },
    { id: "carriers",    label: "Carriers",    icon: "Folder" },
    { id: "forecast",    label: "Forecast",    icon: "TrendingUp" },
    { id: "tiering",     label: "Tiering",      icon: "Award" },
    { id: "leaderboard", label: "Leaderboard",  icon: "Trophy" },
  ],
  ops: [
    { id: "connections", label: "Connections",  icon: "Plug" },
    { id: "hardware",    label: "Hardware",     icon: "Server" },
    { id: "agents",      label: "Agents",       icon: "Cpu" },
    { id: "workflows",   label: "Workflows",    icon: "Workflow" },
  ],
};

const Sidebar = ({ role, setRole, page, setPage, openCmdK }) => {
  const items = NAV[role];
  return (
    <nav className="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-mark">R</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-brand-name">Repflow</div>
          <div className="sb-brand-meta">Atlas Insurance Group</div>
        </div>
      </div>

      <div className="role-switch">
        {["rep","manager","owner"].map(r => (
          <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
            {r === "rep" ? "Rep" : r === "manager" ? "Mgr" : "Owner"}
          </button>
        ))}
      </div>

      <div className="sb-section">Workspace</div>
      <div className="sb-nav">
        {items.map(it => {
          const Ico = Icons[it.icon];
          return (
            <button key={it.id} className={`sb-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
              <Ico size={15}/>
              <span>{it.label}</span>
              {it.badge && <span className="badge tabular">{it.badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="sb-section">Operations</div>
      <div className="sb-nav">
        {NAV.ops.map(it => {
          const Ico = Icons[it.icon];
          return (
            <button key={it.id} className={`sb-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
              <Ico size={15}/>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sb-spacer"/>

      <div style={{ padding: "0 8px 8px" }}>
        <button className="sb-item" onClick={openCmdK}>
          <Icons.Search size={15}/>
          <span>Command</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <div className="sb-user">
        <Avatar rep={AppData.REPS[0]} size={26}/>
        <div className="sb-user-info">
          <div className="sb-user-name">Marcus Avila</div>
          <div className="sb-user-role">
            <TierChip tier="platinum" compact/>
            <span>· Atlanta</span>
          </div>
        </div>
        <button className="icon-btn" onClick={() => setPage("settings")} title="Settings"><Icons.Settings size={14}/></button>
      </div>
    </nav>
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
    <div className="topbar-spacer"/>
    {aep && (
      <div className="aep-pill"><span className="dot"></span>AEP SURGE · Day 14 / 54</div>
    )}
    <button className="cmdk-trigger" onClick={openCmdK}>
      <Icons.Search size={13}/>
      <span>Search or run a command</span>
      <span className="kbd">⌘K</span>
    </button>
    <button className="lb-pill">
      <Icons.Trophy size={13} style={{ color: "var(--accent-status)" }}/>
      <span className="rank tabular">#3</span>
      <span className="delta-up tabular"><Icons.ArrowUp size={10}/>2</span>
    </button>
    <button className="icon-btn" onClick={openMobile} title="Open rep mobile prototype">
      <Icons.Phone size={15}/>
    </button>
    <button className="icon-btn" onClick={toggleRail} title="Toggle AI co-pilot">
      <Icons.Sparkles size={15} style={{ color: railOn ? "var(--accent-money)" : undefined }}/>
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
const CMD_ITEMS = {
  Actions: [
    { label: "Dial next lead in queue",                       kbd: "D", icon: "Phone",    nav: "queue" },
    { label: "Send SOA to current lead",                      kbd: "S", icon: "Shield",   nav: "vault" },
    { label: "Log a sale",                                    kbd: "L", icon: "Wallet",   nav: "commissions" },
    { label: "Schedule callback",                                       icon: "Calendar", nav: "today" },
    { label: "Draft rebuttal: 'I already have coverage'",               icon: "Sparkles" },
  ],
  Navigate: [
    { label: "Today",              icon: "Home",       nav: "today" },
    { label: "Pipeline",           icon: "Pipeline",   nav: "pipeline" },
    { label: "Dial Queue",         icon: "Phone",      nav: "queue" },
    { label: "Calls",              icon: "Headset",    nav: "calls" },
    { label: "Leaderboard",        icon: "Trophy",     nav: "leaderboard" },
    { label: "Commissions",        icon: "Wallet",     nav: "commissions" },
    { label: "Training",           icon: "Book",       nav: "training" },
    { label: "Compliance Vault",   icon: "Shield",     nav: "vault" },
    { label: "Tiering Console",    icon: "Award",      nav: "tiering" },
    { label: "Recruiting Funnel",  icon: "ArrowUpRight", nav: "recruiting" },
    { label: "P&L",                icon: "TrendingUp", nav: "pnl" },
    { label: "Org Tree",           icon: "Users",      nav: "tree" },
    { label: "Book Analytics",     icon: "Activity",   nav: "book" },
    { label: "Lead Vendors · ROI", icon: "Wallet",     nav: "attribution" },
    { label: "NIGO Queue",         icon: "Bell",       nav: "nigo" },
    { label: "Carriers",           icon: "Folder",     nav: "carriers" },
    { label: "Compliance scrubbers", icon: "Shield",   nav: "scrubbers" },
    { label: "Revenue forecast",    icon: "TrendingUp", nav: "forecast" },
    { label: "Connections",        icon: "Plug",       nav: "connections" },
    { label: "Hardware",           icon: "Server",     nav: "hardware" },
    { label: "Agents",             icon: "Cpu",        nav: "agents" },
    { label: "Workflows",          icon: "Workflow",   nav: "workflows" },
    { label: "Settings",           icon: "Settings",   nav: "settings" },
  ],
  "Ask Repflow": [
    { label: "Show leads I haven't touched in 7 days",            icon: "Sparkles", nav: "pipeline" },
    { label: "Compare my conversion vs Tony's, last month",       icon: "Sparkles", nav: "leaderboard" },
    { label: "Why did Cheryl Hampton's policy charge back?",      icon: "Sparkles", nav: "calls" },
  ],
};

const CmdK = ({ open, onClose, goto }) => {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef();
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 60); } }, [open]);

  const flat = useMemo(() => Object.entries(CMD_ITEMS).flatMap(([sec, items]) =>
    items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase())).map(i => ({ ...i, sec }))
  ), [q]);

  const run = (it) => {
    if (it?.nav && goto) goto(it.nav);
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
                    <Ico size={14} style={{ color: "var(--text-tertiary)" }}/>
                    <span>{it.label}</span>
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
  team:         ["Who's at risk of missing tier this month?", "Which producer needs a coaching nudge today?"],
  coaching:     ["Top 3 issues across all producer calls this week", "Which coaching theme is moving the needle most?"],
  vault:        ["Are any artifacts approaching retention expiry?", "Audit pack for Aetna SRC — what's missing?"],
  tiering:      ["Who would qualify for Diamond if MTD threshold dropped to $45k?"],
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
  if (c.includes("leaderboard")) return "leaderboard";
  if (c.includes("team")) return "team";
  if (c.includes("coaching")) return "coaching";
  if (c.includes("vault")) return "vault";
  if (c.includes("tiering")) return "tiering";
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
      const resp = await fetch("/api/copilot", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, context })
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
              {m.role === "user" ? <><Avatar rep={AppData.REPS[0]} size={16}/> You</> : <><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/> Repflow{m.ms ? ` · ${(m.ms/1000).toFixed(1)}s` : ""}{m.tools?.length ? ` · queried ${m.tools.join(", ")}` : ""}</>}
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

window.Shared = { TierChip, Avatar, Sparkline, KpiCard, Sidebar, Topbar, CmdK, AIRail, NAV, Modal, Field, Select };
