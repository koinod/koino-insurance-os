/* Mobile screens for Repflow — wrapped in IOSDevice frames */
const { useState } = React;

// ── Tiny icons (Lucide-like, 18px default) ──────────────────────────────
const MIcon = {
  Phone: ({ s = 18, c = "currentColor" }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  ),
  Home: ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  List: ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>,
  Trophy: ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  Wallet: ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v4"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M16 14h6"/></svg>,
  Mic: ({ s = 22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></svg>,
  MicOff: ({ s = 22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/></svg>,
  Sparkles: ({ s = 12 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>,
  Shield: ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>,
  ChevR: ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Plus: ({ s = 22 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Flame: ({ s = 12 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  Hash: ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
};

// ── Bottom nav (shared) ─────────────────────────────────────────────────
function MBottomNav({ active = "home", onNav = () => {} }) {
  const items = [
    { id: "home", l: "Today", icon: <MIcon.Home/> },
    { id: "queue", l: "Queue", icon: <MIcon.List/> },
    { id: "fab", l: "", icon: <MIcon.Phone s={22}/>, fab: true },
    { id: "lb", l: "Board", icon: <MIcon.Trophy/> },
    { id: "comm", l: "Comm.", icon: <MIcon.Wallet/> },
  ];
  return (
    <div className="m-bottomnav">
      {items.map(i => (
        <button key={i.id} className="m-bn-item" data-active={active === i.id} data-fab={!!i.fab} onClick={() => onNav(i.fab ? "queue" : i.id)}>
          {i.icon}
          {i.l && <span>{i.l}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Screen 1: Today ─────────────────────────────────────────────────────
function MScreenToday({ onNav }) {
  // Hydrate everything from demo / live AppData so the screen is honest.
  // Resolve the signed-in rep via me(); fall back to REPS[0] ONLY when in
  // demo mode so a real producer doesn't see Marcus as their identity.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isDemo  = !!(window.isDemoAgency && window.isDemoAgency());
  const me = (meIdent?.rep_id && (AppData.REPS || []).find(r => r.id === meIdent.rep_id))
          || (isDemo ? (AppData.REPS || [])[0] : null)
          || (meIdent ? { id: meIdent.rep_id || "viewer", name: meIdent.full_name || "You", tier: meIdent.tier || "bronze", today: 0, mtd: 0, dials: 0, appts: 0, streak: 0 } : null);
  const hot  = (AppData.QUEUE || []).filter(q => q.elapsed < 60).slice(0, 3);
  const upNext = (AppData.PIPELINE || [])
    .filter(p => p.next && p.stage !== "Issued" && p.stage !== "Lost")
    .filter(p => !meIdent?.rep_id || p.owner === meIdent.rep_id || isDemo)
    .slice(0, 4)
    .map((p, i) => ({ time: ["11:30","1:00","2:30","4:00"][i], who: p.lead, what: p.next, chip: p.product?.split(" ").slice(0, 2).join(" ") }));
  const todayBooked = me?.today || 0;
  // Daily target derives from tier threshold / 22 workdays (matches the
  // desktop GAP-P3 math). Was a hardcoded $3,800 borrowed from Atlas seed.
  const TIER_THRESH = { bronze: 12000, silver: 20000, gold: 35000, platinum: 50000, diamond: 60000 };
  const target = Math.round(((TIER_THRESH[(me?.tier || "bronze").toLowerCase()] || 12000)) / 22);
  const pct = Math.min(100, Math.round((todayBooked / Math.max(1, target)) * 100));
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const monthDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const initials = me?.name?.split(" ").map(s => s[0]).join("") || "";
  const issuedToday = (AppData.PIPELINE || []).filter(p => p.stage === "Issued").length;

  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{dayName} · {monthDate}</div>
          <div className="m-title">{(me?.name || "Producer").split(" ")[0] === "Producer" ? "Welcome back" : "Good morning, " + me.name.split(" ")[0]}</div>
        </div>
        <div className="m-avatar" style={{ background: me?.color }}>{initials}</div>
      </div>

      <div className="m-scroll">
        {hot.length > 0 && (
          <div className="m-notif" style={{ marginTop: 4 }}>
            <span className="m-live"></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{hot.length} hot {hot.length === 1 ? "lead" : "leads"} waiting <span className="m-chip heat" style={{ marginLeft: 6 }}><MIcon.Flame/> {hot[0].elapsed}s SLA</span></div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{hot.map(h => h.lead).join(" · ")}</div>
            </div>
            <button className="m-btn m-btn-pri m-btn-pill" onClick={() => onNav("queue")}>Dial</button>
          </div>
        )}

        <div className="m-section-h"><span>Today's progress</span><span style={{ color: "var(--accent-money)" }}>+${todayBooked.toLocaleString()}</span></div>
        <div className="m-kpi-row">
          <div className="m-kpi"><div className="m-kpi-l">Premium MTD</div><div className="m-kpi-v">${((me?.mtd || 0) / 1000).toFixed(1)}k</div><div className="m-kpi-d" style={{ color: "var(--accent-money)" }}>{me?.mtd > 30000 ? "on pace" : "behind"}</div></div>
          <div className="m-kpi"><div className="m-kpi-l">Apps issued</div><div className="m-kpi-v">{issuedToday}</div><div className="m-kpi-d">this month</div></div>
          <div className="m-kpi"><div className="m-kpi-l">Dials</div><div className="m-kpi-v">{me?.dials || 0}</div><div className="m-kpi-d">today</div></div>
          <div className="m-kpi"><div className="m-kpi-l">Streak</div><div className="m-kpi-v">{me?.streak || 0}d</div><div className="m-kpi-d" style={{ color: "var(--accent-heat)" }}>{me?.streak > 10 ? "🔥 club" : "warming up"}</div></div>
        </div>

        <div className="m-section-h"><span>Daily target</span><span>${target.toLocaleString()}</span></div>
        <div className="m-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--text-secondary)" }}>
            <span>${todayBooked.toLocaleString()} · {pct}%</span><span style={{ color: "var(--text-tertiary)" }}>${(target - todayBooked).toLocaleString()} to goal</span>
          </div>
          <div className="m-bar"><div className="m-bar-fill" style={{ width: pct + "%" }}></div></div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <span className="m-chip">{me?.appts || 0} appts</span>
            <span className="m-chip">{me?.tier || "bronze"} tier</span>
          </div>
        </div>

        {upNext.length > 0 && (
          <>
            <div className="m-section-h"><span>Up next</span></div>
            <div className="m-card" style={{ padding: 0 }}>
              {upNext.map((a, i) => (
                <div key={i} className="m-lead" style={{ padding: "12px 14px", borderBottom: i < upNext.length - 1 ? "1px solid var(--border-subtle)" : 0 }}>
                  <div className="m-lead-i" style={{ fontFamily: "var(--font-mono)", color: "var(--accent-money)", background: "color-mix(in oklch, var(--accent-money) 12%, transparent)" }}>{a.time}</div>
                  <div className="m-lead-b">
                    <div className="m-lead-t">{a.who}</div>
                    <div className="m-lead-s">{a.what}</div>
                  </div>
                  <span className="m-chip">{a.chip}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <MBottomNav active="home" onNav={onNav}/>
    </div>
  );
}

// ── Screen 2: Dial Queue ────────────────────────────────────────────────
function MScreenQueue({ onNav, onCall, onLead }) {
  const QUEUE = AppData.QUEUE || [];
  // Local filter state — replaces the static "All" chip that did nothing.
  const [activeFilter, setActiveFilter] = useState("all");
  const counts = {
    all: QUEUE.length,
    hot: QUEUE.filter(q => q.elapsed < 30).length,
    mid: QUEUE.filter(q => q.elapsed >= 30 && q.elapsed < 60).length,
    medSupp: QUEUE.filter(q => /med\s*supp/i.test(q.product || "")).length,
    fe: QUEUE.filter(q => /\bfe\b|final expense/i.test(q.product || "")).length,
  };
  const filterChips = [
    { k: "all",     l: "All",          n: counts.all },
    { k: "hot",     l: "Hot · <30s",  n: counts.hot, c: "money" },
    { k: "mid",     l: "30–60s",       n: counts.mid },
    { k: "medSupp", l: "Med Supp",     n: counts.medSupp },
    { k: "fe",      l: "FE",            n: counts.fe },
  ];
  const visible = QUEUE.filter(q => {
    if (activeFilter === "all") return true;
    if (activeFilter === "hot") return q.elapsed < 30;
    if (activeFilter === "mid") return q.elapsed >= 30 && q.elapsed < 60;
    if (activeFilter === "medSupp") return /med\s*supp/i.test(q.product || "");
    if (activeFilter === "fe") return /\bfe\b|final expense/i.test(q.product || "");
    return true;
  });
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Dial Queue</div>
          <div className="m-sub">{visible.length} lead{visible.length === 1 ? "" : "s"}{activeFilter !== "all" ? " · filtered" : ""} · sorted by SLA</div>
        </div>
        <button
          className="m-btn m-btn-pill"
          style={{ height: 32 }}
          onClick={() => setActiveFilter(activeFilter === "all" ? "hot" : "all")}
          title="Toggle hot-only filter"
        >{activeFilter === "all" ? "Filter" : "All"}</button>
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, overflowX: "auto" }}>
        {filterChips.map((t) => {
          const active = activeFilter === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setActiveFilter(t.k)}
              className={`m-chip ${t.c || ""}`}
              style={{
                height: 28, padding: "0 12px", fontSize: 12,
                fontWeight: active ? 700 : 500,
                background: active ? "#00d4aa" : undefined,
                color: active ? "#000" : undefined,
                borderColor: active ? "#00d4aa" : undefined,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{t.l} <span style={{ opacity: 0.7, marginLeft: 4 }}>{t.n}</span></button>
          );
        })}
      </div>

      <div className="m-scroll" style={{ paddingTop: 4 }}>
        {visible.length === 0 && (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// queue · empty</span>
            <span>{activeFilter === "all" ? "No leads waiting." : "No matches for this filter."}</span>
          </div>
        )}
        {visible.map((l, i) => {
          const heatColor = l.elapsed < 30 ? "#00d4aa" : l.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
          const hasPhone = !!l.phone;
          return (
            <div key={l.id} className="m-card" style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }} onClick={() => onLead && onLead(l)}>
              <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: heatColor }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 14.5, fontWeight: 500 }}>{l.lead}</strong>
                  <span title="LeadiD verified" style={{ width: 14, height: 14, borderRadius: 999, background: "rgba(0,212,170,0.20)", color: "#00d4aa", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{l.age} · {l.state} · {l.source}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span className="m-chip">{l.product}</span>
                  <span className="m-chip" style={{ color: l.score >= 90 ? "#00d4aa" : "var(--text-secondary)", borderColor: l.score >= 90 ? "rgba(0,212,170,0.30)" : undefined }}>Score {l.score}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", color: heatColor, fontWeight: 600, fontSize: 12 }}>{l.elapsed}s</span>
                <button
                  disabled={!hasPhone}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!hasPhone) { window.toast && window.toast(`No phone on file for ${l.lead}`, "warn"); return; }
                    onCall && onCall(l);
                  }}
                  title={hasPhone ? `Call ${l.phone}` : "No phone on file"}
                  style={{
                    height: 36, width: 36, padding: 0, borderRadius: 999,
                    background: hasPhone ? "#00d4aa" : "var(--bg-raised)",
                    color: hasPhone ? "#000" : "var(--text-tertiary)",
                    border: "none",
                    cursor: hasPhone ? "pointer" : "not-allowed",
                    display: "grid", placeItems: "center",
                    boxShadow: hasPhone ? "0 4px 14px rgba(0,212,170,0.22)" : "none",
                  }}
                >
                  <MIcon.Phone s={16} c={hasPhone ? "#000" : "currentColor"}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <MBottomNav active="queue" onNav={onNav}/>
    </div>
  );
}

// ── Screen 3: In-Call ───────────────────────────────────────────────────
function MScreenCall({ lead, onEnd }) {
  const [sec, setSec] = useState(34);
  const [muted, setMuted] = useState(false);
  React.useEffect(() => {
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const tpmoFired = sec >= 8;
  // Default lead label was a literal "Cheryl Hampton" — that's the demo
  // story name and leaks into the call screen if the call view ever
  // mounts before a lead is bound. Now: dash-placeholder until bound.
  const name = lead?.lead || "—";
  const meta = lead ? `${lead.age} · ${lead.state} · ${lead.source}` : "no lead bound";

  return (
    <div className="m-call">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="m-live"></span>
        <span style={{ fontSize: 11, color: "var(--accent-money)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>LIVE</span>
        <span className="m-call-time" style={{ marginLeft: "auto" }}>{mm}:{ss}</span>
      </div>
      <div className="m-call-name" style={{ marginTop: 18 }}>{name}</div>
      <div className="m-call-sub">{meta}</div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <span className="m-chip info">Plan G eligible</span>
        <span className="m-chip">No prior MS</span>
        <span className="m-chip money">LeadiD ✓</span>
      </div>

      <div className="m-coach" style={{
        background: tpmoFired ? "color-mix(in oklch, var(--accent-money) 8%, transparent)" : "color-mix(in oklch, var(--accent-heat) 12%, transparent)",
        borderColor: tpmoFired ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : "color-mix(in oklch, var(--accent-heat) 30%, transparent)",
      }}>
        <div className="m-coach-l" style={{ color: tpmoFired ? "var(--accent-money)" : "var(--accent-heat)" }}>
          <MIcon.Shield/> TPMO {tpmoFired ? "captured" : `firing in ${Math.max(0, 8 - sec)}s`}
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          "We do not offer every plan available in your area. Any information we provide is limited..."
        </div>
      </div>

      <div className="m-coach" style={{ marginTop: 10 }}>
        <div className="m-coach-l"><MIcon.Sparkles/> AI suggests now</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
          {lead?.lead
            ? <>Open with daily-routine question. Pivot to <b>Plan G coverage gap</b> if they mention current meds.</>
            : <>Open with daily-routine questions before pricing.</>}
        </div>
        {/* Each suggestion is now a button that fires the matching action. */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="m-chip"
            style={{ cursor: "pointer", border: "1px solid var(--border-subtle)" }}
            onClick={() => {
              if (window.gotoPage) window.gotoPage("library");
              else window.toast && window.toast("Open desktop · Library → scripts", "info");
            }}
          >Show script</button>
          <button
            className="m-chip"
            style={{ cursor: "pointer", border: "1px solid var(--border-subtle)" }}
            onClick={() => {
              const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
              const agencyName = meIdent?.agency_name || "your agency";
              if (lead && window.generateSOAPdf) window.generateSOAPdf(lead, agencyName);
              else window.toast && window.toast("SOA generator unavailable", "warn");
            }}
          >Send SOA</button>
          <button
            className="m-chip"
            style={{ cursor: "pointer", border: "1px solid var(--border-subtle)" }}
            onClick={() => {
              if (window.gotoPage) window.gotoPage("quote");
              else window.toast && window.toast("Quote available on desktop", "info");
            }}
          >Open quote</button>
        </div>
      </div>

      <div className="m-call-actions">
        <button className="m-cab" data-active={muted} onClick={() => setMuted(m => !m)}>
          {muted ? <MIcon.MicOff/> : <MIcon.Mic/>}
          <span>{muted ? "Muted" : "Mute"}</span>
        </button>
        <button
          className="m-cab"
          onClick={() => window.toast && window.toast("DTMF keypad opens during a real call on the dialer overlay.", "info")}
          title="Send DTMF tones during the live call"
        ><MIcon.Hash/><span>Keypad</span></button>
        <button
          className="m-cab"
          onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Suggest a rebuttal for ${name}'s most likely objection on ${lead?.product || "Med Supp"}`, context: "Mobile call · rebuttal" } }))}
          title="Ask AI for a rebuttal"
        ><MIcon.Sparkles s={20}/><span>Rebut</span></button>
      </div>
      <button className="m-cab danger" style={{ height: 56, marginTop: 4 }} onClick={onEnd}>End call</button>
    </div>
  );
}

// ── Screen 4: Lead Detail ───────────────────────────────────────────────
function MScreenLead({ lead, onBack, onCall }) {
  // Was defaulting to a Cheryl Hampton seed when navigation landed here
  // without a lead bound. That leaked demo identity into a real rep view.
  if (!lead) {
    return (
      <div className="m-screen">
        <div className="m-header">
          <button className="m-btn m-btn-pill" style={{ height: 32 }} onClick={onBack}>← Queue</button>
        </div>
        <div className="m-scroll" style={{ display: "grid", placeItems: "center", padding: 36, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// no lead bound</span>
            <span>Pick a lead from the queue.</span>
          </div>
        </div>
      </div>
    );
  }
  const l = lead;
  const hasPhone = !!l.phone;
  // Action wiring — was four buttons with no onClick. Now each routes
  // through the same helpers the desktop LeadDetail uses.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const onSMS = () => {
    if (!hasPhone) { window.toast && window.toast(`No phone on file for ${l.lead}`, "warn"); return; }
    window.smsCompose && window.smsCompose(l, l.phone);
  };
  const onSOA = () => {
    const agencyName = meIdent?.agency_name || "your agency";
    if (window.generateSOAPdf) window.generateSOAPdf(l, agencyName);
    else window.toast && window.toast("SOA generator unavailable", "warn");
  };
  const onNote = () => {
    // Note capture isn't on mobile yet — bounce to desktop CRM with a hint.
    window.toast && window.toast("Notes coming to mobile soon — log via desktop CRM for now.", "info");
  };
  // Derive a stable avatar color from the lead's name hash (was a static
  // orange/yellow gradient that made every lead look like the same person).
  const _hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const _hue = _hash(l.lead || "") % 360;
  const avatarBg = `linear-gradient(135deg, hsl(${_hue} 60% 55%), hsl(${(_hue + 30) % 360} 65% 45%))`;
  return (
    <div className="m-screen">
      <div className="m-header">
        <button className="m-btn m-btn-pill" style={{ height: 32 }} onClick={onBack}>← Queue</button>
        <div style={{ flex: 1 }}></div>
        <button
          className="m-btn m-btn-pill"
          style={{ height: 32 }}
          title="More actions"
          onClick={onNote}
        >•••</button>
      </div>
      <div className="m-scroll">
        <div className="m-detail-h">
          <div className="m-avatar" style={{ background: avatarBg }}>{l.lead.split(" ").map(n => n[0]).slice(0,2).join("")}</div>
          <div style={{ flex: 1 }}>
            <div className="m-detail-name">{l.lead}</div>
            <div className="m-detail-sub">{l.age} · {l.state} · {l.source}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span className="m-chip money">Score {l.score}</span>
              <span className="m-chip heat"><MIcon.Flame/> {l.elapsed}s</span>
              <span className="m-chip">{l.product}</span>
            </div>
          </div>
        </div>

        <div className="m-act-row">
          <button className="m-cab" data-active={hasPhone} disabled={!hasPhone} onClick={onCall}><MIcon.Phone s={20}/><span>Call</span></button>
          <button className="m-cab" disabled={!hasPhone} onClick={onSMS}><MIcon.Sparkles s={18}/><span>SMS</span></button>
          <button className="m-cab" onClick={onSOA}><MIcon.Shield s={18}/><span>SOA</span></button>
          <button className="m-cab" onClick={onNote}><MIcon.Plus s={20}/><span>Note</span></button>
        </div>

        <div className="m-section-h"><span>Compliance</span>
          <span className="m-chip" style={{ color: l.consent === "verified" ? "#00d4aa" : undefined }}>
            {l.consent === "verified" ? "Verified" : (l.consent || "Pending")}
          </span>
        </div>
        <div className="m-card">
          {(() => {
            // Was three hardcoded rows. Now derive from the lead row
            // (which carries consent + product hint) + show "needs"
            // states only when the stage hasn't passed the relevant gate.
            const product = (l.product || "").toLowerCase();
            const isMedSupp = product.includes("med") || product.includes("supp");
            const leadIdShort = l.leadId || l.lead_id || l.id;
            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>LeadiD</span>
                  <span className="mono" style={{ fontSize: 11.5, color: l.consent === "verified" ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                    {l.consent === "verified" ? (leadIdShort ? String(leadIdShort).slice(-9) : "captured") : "not captured"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>TrustedForm</span>
                  <span className="m-chip" style={{ color: l.consent === "verified" ? "#00d4aa" : undefined }}>
                    {l.consent === "verified" ? "Captured" : "Pending"}
                  </span>
                </div>
                {isMedSupp && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                    <span style={{ color: "var(--text-secondary)" }}>SOA needed</span>
                    <span className="m-chip warn">Before quote</span>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="m-section-h"><span>Activity</span></div>
        <div className="m-card">
          {(() => {
            const touches = (AppData.TOUCHPOINTS || [])
              .filter(t => t.leadId === l.id || t.lead_pipeline_id === l.id || t.leadId === l.leadId)
              .slice(0, 4);
            const fmtRel = (iso) => {
              if (!iso) return "—";
              const ms = Date.now() - new Date(iso).getTime();
              const m = Math.round(ms / 60000);
              if (m < 1) return "now";
              if (m < 60) return `${m}m ago`;
              const h = Math.round(m / 60);
              if (h < 24) return `${h}h ago`;
              return `${Math.round(h / 24)}d ago`;
            };
            if (touches.length > 0) {
              return touches.map((t, i) => (
                <div key={t.id || i} className="m-tl-i">
                  <div className="m-tl-d">{fmtRel(t.occurredAt || t.occurred_at)}</div>
                  <div className="m-tl-b"><b>{t.kind || "Touch"}</b>{(t.summary || t.body) && <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{t.summary || t.body}</div>}</div>
                </div>
              ));
            }
            // Fallback: derive a single row from the lead itself.
            return (
              <>
                {l.source && (
                  <div className="m-tl-i">
                    <div className="m-tl-d">{l.elapsed != null ? `${l.elapsed}s ago` : "—"}</div>
                    <div className="m-tl-b"><b>Form filled</b><div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{[l.source, l.state].filter(Boolean).join(" · ")}</div></div>
                  </div>
                )}
                <div className="m-tl-i">
                  <div className="m-tl-d">— —</div>
                  <div className="m-tl-b" style={{ color: "var(--text-tertiary)" }}>No prior contact logged</div>
                </div>
              </>
            );
          })()}
        </div>

        <button
          disabled={!hasPhone}
          onClick={onCall}
          style={{
            marginTop: 16, width: "100%",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "12px 16px",
            background: hasPhone ? "#00d4aa" : "var(--bg-raised)",
            color: hasPhone ? "#000" : "var(--text-tertiary)",
            border: "none", borderRadius: 10,
            fontWeight: 700, fontSize: 13,
            cursor: hasPhone ? "pointer" : "not-allowed",
            boxShadow: hasPhone ? "0 4px 14px rgba(0,212,170,0.22)" : "none",
          }}
        ><MIcon.Phone s={16} c={hasPhone ? "#000" : "currentColor"}/> {hasPhone ? "Call now" : "Add a phone first"}</button>
      </div>
    </div>
  );
}

// ── Screen 5: Leaderboard ───────────────────────────────────────────────
function MScreenLeaderboard({ onNav }) {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id;
  const [boardTab, setBoardTab] = useState("agency");
  const fullRanked = [...(AppData.REPS || [])].sort((a, b) => (b.mtd || 0) - (a.mtd || 0));
  // Filter the ranked list by tab. "all" is identical to "agency" until
  // cross-agency views ship; "personal" scopes to just the viewer plus the
  // two reps immediately above/below for context.
  const ranked = (() => {
    if (boardTab === "personal" && myRepId) {
      const myIdx = fullRanked.findIndex(r => r.id === myRepId);
      if (myIdx < 0) return [];
      const start = Math.max(0, myIdx - 1);
      const end = Math.min(fullRanked.length, myIdx + 2);
      return fullRanked.slice(start, end);
    }
    return fullRanked;
  })();
  const monthLabel = new Date().toLocaleDateString("en-US", { month: "short" });
  const agencyName = meIdent?.agency_name || "Agency";
  // Podium requires 3 reps + agency tab; flat list otherwise.
  const podium = boardTab === "agency" && ranked.length >= 3 ? [ranked[1], ranked[0], ranked[2]] : null;
  const tail   = boardTab === "agency" && ranked.length >= 3 ? ranked.slice(3) : ranked;
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Leaderboard</div>
          <div className="m-sub">MTD premium · {agencyName}</div>
        </div>
        <span className="m-chip">{monthLabel}</span>
      </div>

      {(() => {
        // Tabs were three static chips. Now: scope the ranked list to
        // "Agency" (all reps), "Personal" (only me, with a delta header),
        // and "All teams" stays as a placeholder labelled "All" until
        // cross-agency views ship — at which point this can read from
        // a future v_cross_agency_leaderboard view.
        const tabs = [
          { k: "agency",   l: "Agency" },
          { k: "all",      l: "All teams" },
          { k: "personal", l: "Personal" },
        ];
        return (
          <div style={{ padding: "0 16px 8px", display: "flex", gap: 6 }}>
            {tabs.map((t) => {
              const active = boardTab === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => setBoardTab(t.k)}
                  className="m-chip"
                  style={{
                    height: 28, padding: "0 12px", fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    background: active ? "#00d4aa" : undefined,
                    color: active ? "#000" : undefined,
                    borderColor: active ? "#00d4aa" : undefined,
                    cursor: "pointer",
                  }}
                >{t.l}</button>
              );
            })}
          </div>
        );
      })()}

      <div className="m-scroll" style={{ paddingTop: 4 }}>
        {ranked.length === 0 && (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// board · empty</span>
            <span>No producers on the board yet.</span>
          </div>
        )}
        {/* Top 3 podium (only when 3+ reps) */}
        {podium && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1fr", gap: 8, alignItems: "end", padding: "16px 0 10px" }}>
          {podium.map((r, i) => {
            const place = i === 0 ? 2 : i === 1 ? 1 : 3;
            const h = place === 1 ? 96 : place === 2 ? 76 : 60;
            return (
              <div key={r.id} style={{ textAlign: "center" }}>
                <div className="m-rank-av" style={{ background: r.color, width: place === 1 ? 56 : 44, height: place === 1 ? 56 : 44, margin: "0 auto 8px", fontSize: place === 1 ? 16 : 13 }}>{r.name.split(" ").map(n => n[0]).join("")}</div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name.split(" ")[0]}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--accent-money)", fontWeight: 600 }}>${((r.mtd || 0) / 1000).toFixed(1)}k</div>
                <div style={{ height: h, borderRadius: "8px 8px 0 0", marginTop: 8, background: place === 1 ? "linear-gradient(180deg, var(--accent-money), color-mix(in oklch, var(--accent-money) 40%, transparent))" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderBottom: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 18, color: place === 1 ? "oklch(0.18 0.005 260)" : "var(--text-primary)" }}>{place}</div>
              </div>
            );
          })}
        </div>
        )}

        {(() => {
          // In "personal" tab the rank index in tail is local; map back to
          // the rep's full-board position so the rep sees their TRUE rank.
          const tierColor = (t) => ({ gold: "#D9A441", silver: "#C0C0C8", bronze: "#A97142", platinum: "#E5E4E2", diamond: "#B9F2FF" }[t]);
          const startRank = podium ? 4 : 1;
          return tail.map((r, i) => {
            const isMe = r.id === myRepId;
            const rank = boardTab === "personal"
              ? (fullRanked.findIndex(x => x.id === r.id) + 1)
              : (i + startRank);
            return (
              <div
                key={r.id}
                className="m-rank"
                style={{
                  background: isMe ? "rgba(0,212,170,0.08)" : undefined,
                  borderLeft: isMe ? "3px solid #00d4aa" : "3px solid transparent",
                }}
              >
                <div className="m-rank-n" style={{ color: isMe ? "#00d4aa" : undefined }}>{rank}</div>
                <div className="m-rank-av" style={{ background: r.color }}>{r.name.split(" ").map(n => n[0]).join("")}</div>
                <div className="m-rank-b">
                  <div className="m-rank-name">
                    {r.name}
                    {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: "#00d4aa", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em" }}>YOU</span>}
                  </div>
                  <div className="m-rank-meta">{r.dials || 0} dials · {r.appts || 0} appts · 🔥 {r.streak || 0}d</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="m-rank-v">${((r.mtd || 0) / 1000).toFixed(1)}k</div>
                  <span className="m-tier" style={{ background: `color-mix(in oklch, ${tierColor(r.tier) || "#888"} 30%, transparent)`, color: tierColor(r.tier) || "#888" }}>{(r.tier || "").toUpperCase()}</span>
                </div>
              </div>
            );
          });
        })()}

        {(() => {
          // Tier progression block was hardcoded "Platinum → Diamond · $42.3k / $60k · 70%".
          // Derive from the viewer's actual tier + MTD.
          const TIER_THRESH = { bronze: 12000, silver: 20000, gold: 35000, platinum: 50000, diamond: 60000 };
          const TIER_NEXT   = { bronze: "silver", silver: "gold", gold: "platinum", platinum: "diamond", diamond: null };
          const myIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
          const myRow = (AppData.REPS || []).find(r => r.id === myIdent?.rep_id) || ranked[0];
          if (!myRow) return null;
          const tier = (myRow.tier || "bronze").toLowerCase();
          const next = TIER_NEXT[tier];
          const nextThr = next ? TIER_THRESH[next] : null;
          const mtd = myRow.mtd || 0;
          const pct = nextThr ? Math.min(100, (mtd / Math.max(1, nextThr)) * 100) : 100;
          const remaining = nextThr ? Math.max(0, nextThr - mtd) : 0;
          return (
            <>
              <div className="m-section-h"><span>Tier progression</span></div>
              <div className="m-card">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                  <span>{tier.charAt(0).toUpperCase() + tier.slice(1)} {next ? "→" : ""} {next && <b>{next.charAt(0).toUpperCase() + next.slice(1)}</b>}</span>
                  {nextThr && <span className="mono" style={{ color: "var(--text-tertiary)" }}>${(mtd/1000).toFixed(1)}k / ${(nextThr/1000).toFixed(0)}k</span>}
                </div>
                <div className="m-bar"><div className="m-bar-fill" style={{ width: pct + "%" }}></div></div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 8 }}>
                  {next ? `$${remaining.toLocaleString()} to ${next} · resets monthly` : "Top tier — keep stacking"}
                </div>
              </div>
            </>
          );
        })()}
      </div>
      <MBottomNav active="lb" onNav={onNav}/>
    </div>
  );
}

// ── Screen 6: Commissions ───────────────────────────────────────────────
function MScreenComm({ onNav }) {
  // Derive everything from AppData.COMMISSIONS for the signed-in rep
  // when present; demo agencies fall back to the hardcoded illustrative
  // rows so the sandbox tour still looks alive.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isDemo  = !!(window.isDemoAgency && window.isDemoAgency());
  const myId    = meIdent?.rep_id || (isDemo ? AppData.REPS?.[0]?.id : null);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long" });

  const myCommissions = (AppData.COMMISSIONS || []).filter(c => c.repId === myId);
  const expectedThisMonth = myCommissions
    .filter(c => (c.earnedAt || c.paidAt || "").startsWith(monthKey))
    .reduce((s, c) => s + (c.amount || 0), 0);
  const advance = myCommissions.filter(c => c.kind === "advance" && (c.earnedAt || "").startsWith(monthKey)).reduce((s, c) => s + (c.amount || 0), 0);
  const earned  = myCommissions.filter(c => c.kind === "earned"  && (c.earnedAt || "").startsWith(monthKey)).reduce((s, c) => s + (c.amount || 0), 0);
  const nigoCount = (AppData.NIGOS || []).filter(n => n.repId === myId && (n.status === "open" || n.status === "in_review")).length;

  // Trailing 6-month bars derived from COMMISSIONS earnedAt totals.
  const months = (() => {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = d.toISOString().slice(0, 7);
      const total = myCommissions.filter(c => (c.earnedAt || "").startsWith(k)).reduce((s, c) => s + (c.amount || 0), 0);
      out.push({ k, l: d.toLocaleDateString("en-US", { month: "short" }), v: total, cur: i === 0 });
    }
    const max = Math.max(1, ...out.map(o => o.v));
    return out.map(o => ({ ...o, v: Math.round((o.v / max) * 100) }));
  })();

  // Recent issued policies (use POLICIES + matching commission row).
  const myRecentIssues = (AppData.POLICIES || [])
    .filter(p => p.owner === myId && p.status === "issued")
    .sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))
    .slice(0, 5)
    .map(p => {
      const c = myCommissions.find(c => c.policyId === p.id);
      return {
        who: p.lead || p.policyNumber || "Policy",
        p: p.product || "—",
        ap: p.ap || 0,
        com: c?.amount || 0,
        st: c?.kind || "expected",
        c: c?.kind === "advance" ? "money" : c?.kind === "earned" ? "info" : "warn",
      };
    });

  const demoIssues = isDemo && myRecentIssues.length === 0 ? [
    { who: "Cheryl Hampton", p: "Plan G",   ap: 1840, com: 920, st: "advance", c: "money" },
    { who: "Robert Mendez", p: "FE $15K",  ap: 1320, com: 660, st: "advance", c: "money" },
    { who: "Henry Akins",   p: "Annuity",  ap: 4250, com: 425, st: "as-earned", c: "info" },
  ] : null;
  const rowsToShow = demoIssues || myRecentIssues;

  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Commissions</div>
          <div className="m-sub">{monthLabel} · paid weekly</div>
        </div>
        <button
          className="m-btn m-btn-pill"
          style={{ height: 32 }}
          onClick={() => {
            // Wire to /commissions on desktop. Mobile statement export
            // ships when commission CSV download endpoint is in place.
            if (window.gotoPage) window.gotoPage("commissions");
            else window.toast && window.toast("Statement available on desktop · /commissions", "info");
          }}
        >Statement</button>
      </div>

      <div className="m-scroll">
        <div className="m-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Expected this month</div>
          <div className="m-kpi-v" style={{ fontSize: 36, marginTop: 4 }}>${expectedThisMonth.toLocaleString()}<span style={{ fontSize: 16, color: "var(--text-tertiary)", marginLeft: 6 }}>.00</span></div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {advance > 0 && <span className="m-chip money">${(advance/1000).toFixed(1)}k advance</span>}
            {earned > 0  && <span className="m-chip">${(earned/1000).toFixed(1)}k as-earned</span>}
            {nigoCount > 0 && <span className="m-chip warn">{nigoCount} NIGO</span>}
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="m-bars">{months.map((m) => (<div key={m.k} className={m.cur ? "cur" : ""} style={{ height: `${m.v}%` }}></div>))}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 6, fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "center" }}>{months.map((m) => <div key={m.k}>{m.l}</div>)}</div>
          </div>
        </div>

        <div className="m-section-h"><span>Recent issues</span></div>
        <div className="m-card" style={{ padding: 0 }}>
          {rowsToShow.length === 0 && (
            <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.7rem", color: "#00d4aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>// no issues yet</span>
              <span>Your first issued policy will land here.</span>
            </div>
          )}
          {rowsToShow.map((r, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--border-subtle)" : 0, gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{r.who}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>{r.p} · ${r.ap.toLocaleString()} AP</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>${r.com}</div>
                <span className={`m-chip ${r.c}`} style={{ marginTop: 2 }}>{r.st}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <MBottomNav active="comm" onNav={onNav}/>
    </div>
  );
}

// Export
Object.assign(window, { MScreenToday, MScreenQueue, MScreenCall, MScreenLead, MScreenLeaderboard, MScreenComm, MBottomNav });
