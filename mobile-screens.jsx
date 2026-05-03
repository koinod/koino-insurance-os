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
  const me   = AppData.REPS && AppData.REPS[0];
  const hot  = (AppData.QUEUE || []).filter(q => q.elapsed < 60).slice(0, 3);
  const upNext = (AppData.PIPELINE || [])
    .filter(p => p.next && p.stage !== "Issued" && p.stage !== "Lost")
    .slice(0, 4)
    .map((p, i) => ({ time: ["11:30","1:00","2:30","4:00"][i], who: p.lead, what: p.next, chip: p.product?.split(" ").slice(0, 2).join(" ") }));
  const todayBooked = me?.today || 0;
  const target = 3800;
  const pct = Math.min(100, Math.round((todayBooked / target) * 100));
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const monthDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const initials = me?.name?.split(" ").map(s => s[0]).join("") || "MA";
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
  const { QUEUE } = AppData;
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Dial Queue</div>
          <div className="m-sub">47 leads · sorted by SLA</div>
        </div>
        <button className="m-btn m-btn-pill" style={{ height: 32 }}>Filter</button>
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, overflowX: "auto" }}>
        {[
          { l: "All", n: 47, a: true },
          { l: "Hot · <30s", n: 23, c: "money" },
          { l: "30–60s", n: 12 },
          { l: "Med Supp", n: 28 },
          { l: "FE", n: 19 },
        ].map((t, i) => (
          <span key={i} className={`m-chip ${t.c || ""}`} style={{ height: 28, padding: "0 12px", fontSize: 12, fontWeight: t.a ? 600 : 500, background: t.a ? "var(--text-primary)" : undefined, color: t.a ? "var(--bg-base)" : undefined, borderColor: t.a ? "var(--text-primary)" : undefined }}>{t.l} <span style={{ opacity: 0.6, marginLeft: 4 }}>{t.n}</span></span>
        ))}
      </div>

      <div className="m-scroll" style={{ paddingTop: 4 }}>
        {QUEUE.map((l, i) => {
          const heatColor = l.elapsed < 30 ? "var(--accent-money)" : l.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
          return (
            <div key={l.id} className="m-card" style={{ padding: 12, marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }} onClick={() => onLead && onLead(l)}>
              <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: heatColor }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 14.5, fontWeight: 500 }}>{l.lead}</strong>
                  <span title="LeadiD verified" style={{ width: 14, height: 14, borderRadius: 999, background: "color-mix(in oklch, var(--accent-money) 20%, transparent)", color: "var(--accent-money)", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{l.age} · {l.state} · {l.source}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span className="m-chip">{l.product}</span>
                  <span className="m-chip" style={{ color: l.score >= 90 ? "var(--accent-money)" : "var(--text-secondary)", borderColor: l.score >= 90 ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : undefined }}>Score {l.score}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", color: heatColor, fontWeight: 600, fontSize: 12 }}>{l.elapsed}s</span>
                <button className="m-btn m-btn-pri" style={{ height: 36, width: 36, padding: 0, borderRadius: 999 }} onClick={(e) => { e.stopPropagation(); onCall && onCall(l); }}>
                  <MIcon.Phone s={16} c="oklch(0.18 0.005 260)"/>
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
  const name = lead?.lead || "Cheryl Hampton";
  const meta = lead ? `${lead.age} · ${lead.state} · ${lead.source}` : "67 · Travis County, TX · T65 list";

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
          Open with daily-routine question. Cheryl mentioned 3 medications — pivot to <b>Plan G drug-free coverage gap</b>.
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="m-chip">Show script</span>
          <span className="m-chip">Send SOA</span>
          <span className="m-chip">Quote $145/mo</span>
        </div>
      </div>

      <div className="m-call-actions">
        <button className="m-cab" data-active={muted} onClick={() => setMuted(m => !m)}>
          {muted ? <MIcon.MicOff/> : <MIcon.Mic/>}
          <span>{muted ? "Muted" : "Mute"}</span>
        </button>
        <button className="m-cab"><MIcon.Hash/><span>Keypad</span></button>
        <button className="m-cab"><MIcon.Sparkles s={20}/><span>Rebut</span></button>
      </div>
      <button className="m-cab danger" style={{ height: 56, marginTop: 4 }} onClick={onEnd}>End call</button>
    </div>
  );
}

// ── Screen 4: Lead Detail ───────────────────────────────────────────────
function MScreenLead({ lead, onBack, onCall }) {
  const l = lead || { lead: "Cheryl Hampton", age: 67, state: "TX", source: "FB Lead Form", product: "Med Supp", score: 92, elapsed: 14 };
  return (
    <div className="m-screen">
      <div className="m-header">
        <button className="m-btn m-btn-pill" style={{ height: 32 }} onClick={onBack}>← Queue</button>
        <div style={{ flex: 1 }}></div>
        <button className="m-btn m-btn-pill" style={{ height: 32 }}>•••</button>
      </div>
      <div className="m-scroll">
        <div className="m-detail-h">
          <div className="m-avatar" style={{ background: "linear-gradient(135deg,#f7971e,#ffd200)" }}>{l.lead.split(" ").map(n => n[0]).slice(0,2).join("")}</div>
          <div style={{ flex: 1 }}>
            <div className="m-detail-name">{l.lead}</div>
            <div className="m-detail-sub">{l.age} · {l.state} · {l.source}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <span className="m-chip money">Score {l.score}</span>
              <span className="m-chip heat"><MIcon.Flame/> {l.elapsed}s</span>
              <span className="m-chip">{l.product}</span>
            </div>
          </div>
        </div>

        <div className="m-act-row">
          <button className="m-cab" data-active onClick={onCall}><MIcon.Phone s={20}/><span>Call</span></button>
          <button className="m-cab"><MIcon.Sparkles s={18}/><span>SMS</span></button>
          <button className="m-cab"><MIcon.Shield s={18}/><span>SOA</span></button>
          <button className="m-cab"><MIcon.Plus s={20}/><span>Note</span></button>
        </div>

        <div className="m-section-h"><span>Compliance</span><span className="m-chip money">Verified</span></div>
        <div className="m-card">
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13 }}><span style={{ color: "var(--text-secondary)" }}>LeadiD</span><span className="mono" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>9f8c-2a11…</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13 }}><span style={{ color: "var(--text-secondary)" }}>TrustedForm</span><span className="m-chip money">Captured</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}><span style={{ color: "var(--text-secondary)" }}>SOA needed</span><span className="m-chip warn">Before quote</span></div>
        </div>

        <div className="m-section-h"><span>Activity</span></div>
        <div className="m-card">
          <div className="m-tl-i"><div className="m-tl-d">14s ago</div><div className="m-tl-b"><b>Form filled</b><div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>FB ad · t65_v3 · Travis County</div></div></div>
          <div className="m-tl-i"><div className="m-tl-d">— —</div><div className="m-tl-b" style={{ color: "var(--text-tertiary)" }}>No prior contact</div></div>
        </div>

        <button className="m-btn m-btn-pri m-btn-block" style={{ marginTop: 16 }} onClick={onCall}><MIcon.Phone s={16} c="oklch(0.18 0.005 260)"/> Call now</button>
      </div>
    </div>
  );
}

// ── Screen 5: Leaderboard ───────────────────────────────────────────────
function MScreenLeaderboard({ onNav }) {
  const ranked = [...AppData.REPS].sort((a, b) => b.mtd - a.mtd);
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Leaderboard</div>
          <div className="m-sub">MTD premium · Atlanta office</div>
        </div>
        <span className="m-chip">Oct</span>
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6 }}>
        {["Office", "All teams", "Personal"].map((t, i) => (
          <span key={i} className="m-chip" style={{ height: 28, padding: "0 12px", fontSize: 12, fontWeight: i === 0 ? 600 : 500, background: i === 0 ? "var(--text-primary)" : undefined, color: i === 0 ? "var(--bg-base)" : undefined, borderColor: i === 0 ? "var(--text-primary)" : undefined }}>{t}</span>
        ))}
      </div>

      <div className="m-scroll" style={{ paddingTop: 4 }}>
        {/* Top 3 podium */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1fr", gap: 8, alignItems: "end", padding: "16px 0 10px" }}>
          {[ranked[1], ranked[0], ranked[2]].map((r, i) => {
            const place = i === 0 ? 2 : i === 1 ? 1 : 3;
            const h = place === 1 ? 96 : place === 2 ? 76 : 60;
            return (
              <div key={r.id} style={{ textAlign: "center" }}>
                <div className="m-rank-av" style={{ background: r.color, width: place === 1 ? 56 : 44, height: place === 1 ? 56 : 44, margin: "0 auto 8px", fontSize: place === 1 ? 16 : 13 }}>{r.name.split(" ").map(n => n[0]).join("")}</div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name.split(" ")[0]}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--accent-money)", fontWeight: 600 }}>${(r.mtd / 1000).toFixed(1)}k</div>
                <div style={{ height: h, borderRadius: "8px 8px 0 0", marginTop: 8, background: place === 1 ? "linear-gradient(180deg, var(--accent-money), color-mix(in oklch, var(--accent-money) 40%, transparent))" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderBottom: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 18, color: place === 1 ? "oklch(0.18 0.005 260)" : "var(--text-primary)" }}>{place}</div>
              </div>
            );
          })}
        </div>

        {ranked.slice(3).map((r, i) => {
          const tierColor = { gold: "#D9A441", silver: "#C0C0C8", bronze: "#A97142", platinum: "#E5E4E2", diamond: "#B9F2FF" }[r.tier];
          return (
            <div key={r.id} className="m-rank">
              <div className="m-rank-n">{i + 4}</div>
              <div className="m-rank-av" style={{ background: r.color }}>{r.name.split(" ").map(n => n[0]).join("")}</div>
              <div className="m-rank-b">
                <div className="m-rank-name">{r.name}</div>
                <div className="m-rank-meta">{r.dials} dials · {r.appts} appts · 🔥 {r.streak}d</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="m-rank-v">${(r.mtd / 1000).toFixed(1)}k</div>
                <span className="m-tier" style={{ background: `color-mix(in oklch, ${tierColor} 30%, transparent)`, color: tierColor }}>{r.tier.toUpperCase()}</span>
              </div>
            </div>
          );
        })}

        <div className="m-section-h"><span>Tier progression</span></div>
        <div className="m-card">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span>Platinum → <b>Diamond</b></span><span className="mono" style={{ color: "var(--text-tertiary)" }}>$42.3k / $60k</span></div>
          <div className="m-bar"><div className="m-bar-fill" style={{ width: "70%" }}></div></div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 8 }}>$17,690 to Diamond · resets monthly · unlocks +5pt override</div>
        </div>
      </div>
      <MBottomNav active="lb" onNav={onNav}/>
    </div>
  );
}

// ── Screen 6: Commissions ───────────────────────────────────────────────
function MScreenComm({ onNav }) {
  const months = [{ l: "May", v: 38 }, { l: "Jun", v: 44 }, { l: "Jul", v: 52 }, { l: "Aug", v: 48 }, { l: "Sep", v: 61 }, { l: "Oct", v: 42, cur: true }];
  return (
    <div className="m-screen">
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div className="m-title" style={{ fontSize: 24 }}>Commissions</div>
          <div className="m-sub">October · paid weekly</div>
        </div>
        <button className="m-btn m-btn-pill" style={{ height: 32 }}>Statement</button>
      </div>

      <div className="m-scroll">
        <div className="m-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Expected this month</div>
          <div className="m-kpi-v" style={{ fontSize: 36, marginTop: 4 }}>$12,840<span style={{ fontSize: 16, color: "var(--text-tertiary)", marginLeft: 6 }}>.00</span></div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span className="m-chip money">$8.2k advance</span>
            <span className="m-chip">$4.6k as-earned</span>
            <span className="m-chip warn">2 NIGO</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="m-bars">{months.map((m, i) => (<div key={i} className={m.cur ? "cur" : ""} style={{ height: `${m.v}%` }}></div>))}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 6, fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "center" }}>{months.map((m, i) => <div key={i}>{m.l}</div>)}</div>
          </div>
        </div>

        <div className="m-section-h"><span>Recent issues</span></div>
        <div className="m-card" style={{ padding: 0 }}>
          {[
            { who: "Cheryl Hampton", p: "Plan G", ap: 1840, com: 920, st: "advance", c: "money" },
            { who: "Robert Mendez", p: "FE $15K", ap: 1320, com: 660, st: "advance", c: "money" },
            { who: "Henry Akins", p: "Annuity", ap: 4250, com: 425, st: "as-earned", c: "info" },
            { who: "Linda Cho", p: "Plan N", ap: 1490, com: 0, st: "NIGO · sigs missing", c: "warn" },
            { who: "Don Phelps", p: "FE $10K", ap: 0, com: 0, st: "Chargeback risk", c: "warn" },
          ].map((r, i, arr) => (
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

        <div className="m-section-h"><span>Tier override</span></div>
        <div className="m-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 500 }}>Platinum override · 7%</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>Hit Diamond → +5pt on team production</div>
            </div>
            <MIcon.ChevR/>
          </div>
        </div>
      </div>

      <MBottomNav active="comm" onNav={onNav}/>
    </div>
  );
}

// Export
Object.assign(window, { MScreenToday, MScreenQueue, MScreenCall, MScreenLead, MScreenLeaderboard, MScreenComm, MBottomNav });
