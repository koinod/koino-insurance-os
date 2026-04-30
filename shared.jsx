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
    { id: "pipeline",    label: "Pipeline",     icon: "Pipeline", badge: "12" },
    { id: "queue",       label: "Dial Queue",   icon: "Phone",    badge: "47" },
    { id: "calls",       label: "Calls",        icon: "Headset" },
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
    { id: "recruiting",  label: "Recruiting",   icon: "ArrowUpRight" },
    { id: "training",    label: "Training",     icon: "Book" },
  ],
  owner: [
    { id: "pnl",         label: "P&L",          icon: "TrendingUp" },
    { id: "tree",        label: "Org Tree",     icon: "Users" },
    { id: "book",        label: "Book Analytics", icon: "Activity" },
    { id: "recruiting",  label: "Recruiting",   icon: "ArrowUpRight" },
    { id: "coaching",    label: "Coaching",     icon: "Activity" },
    { id: "commissions", label: "Commissions",  icon: "Wallet" },
    { id: "training",    label: "Training",     icon: "Book" },
    { id: "vault",       label: "Compliance Vault", icon: "Shield" },
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
        <button className="icon-btn"><Icons.Settings size={14}/></button>
      </div>
    </nav>
  );
};

/* ───── Topbar ───── */
const Topbar = ({ crumbs, aep, openCmdK, toggleRail, railOn, openMobile }) => (
  <div className="topbar">
    <div className="crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep"><Icons.ChevronRight size={12}/></span>}
          <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
        </React.Fragment>
      ))}
    </div>
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
    <button className="icon-btn"><Icons.Bell size={15}/></button>
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
    { label: "Connections",        icon: "Plug",       nav: "connections" },
    { label: "Hardware",           icon: "Server",     nav: "hardware" },
    { label: "Agents",             icon: "Cpu",        nav: "agents" },
    { label: "Workflows",          icon: "Workflow",   nav: "workflows" },
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

/* ───── AI Rail ───── */
const AIRail = ({ context }) => {
  const [val, setVal] = useState("");
  return (
    <aside className="airail">
      <div className="airail-h">
        <Icons.Sparkles size={14} style={{ color: "var(--accent-money)" }}/>
        <span className="title">Co-pilot</span>
        <span className="meta">{context}</span>
      </div>
      <div className="airail-body">
        <div className="ai-msg">
          <div className="who"><Avatar rep={AppData.REPS[0]} size={16}/> You · 11:42a</div>
          <div className="body">Why is Cheryl Hampton's quote $180 higher than Robert's same plan?</div>
        </div>
        <div className="ai-msg assistant">
          <div className="who"><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/> Repflow · 11:42a · 1.4s</div>
          <div className="body">Cheryl is in <b>Travis County, TX</b> (zip 78704) where the carrier's Plan G base rate is 11% higher than Robert's <b>Pinellas County, FL</b>. She's also 3 years older — combined effect is +$184/yr.</div>
          <div className="ai-trace">
            <div className="step"><span className="ok">✓</span> tool: <span style={{ color: "var(--text-secondary)" }}>quote.lookup</span><span className="ms">142ms</span></div>
            <div className="step"><span className="ok">✓</span> tool: <span style={{ color: "var(--text-secondary)" }}>rate.compare</span><span className="ms">221ms</span></div>
            <div className="step"><span className="ok">✓</span> model: <span style={{ color: "var(--text-secondary)" }}>claude-haiku-4-5</span><span className="ms">980ms</span></div>
          </div>
        </div>
        <div className="ai-msg assistant">
          <div className="who"><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/> Suggested artifact</div>
          <div className="ai-artifact">
            <div className="ai-artifact-h">
              <Icons.MessageSquare size={11}/> Rebuttal · "It's more expensive than my Medicare Advantage"
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.55 }}>
              "I hear you — and you're right that the monthly is higher. The trade is predictability. With your Plan G, your max out-of-pocket is the Part B deductible — $240 this year. With your Advantage plan, when you got that knee scoped last summer, what did you owe?"
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn btn-primary"><Icons.Play size={11}/> Use in next call</button>
              <button className="btn btn-ghost">Save</button>
            </div>
          </div>
        </div>
      </div>
      <div className="airail-foot">
        <div style={{ display: "flex", gap: 6 }}>
          <input className="airail-input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Ask anything, or hold ⌥ to dictate"/>
          <button className="icon-btn" style={{ background: "var(--bg-raised)" }}><Icons.Mic size={14}/></button>
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
