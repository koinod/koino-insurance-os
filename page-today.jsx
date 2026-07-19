/* Page: Today — role-aware
   Rep    → "my day": queue, coaching, tier progress, recent calls, ritual.
   Mgr    → "team day": who's live, dial heat, today's coaching cards, dispatch CPA.
   Owner  → "agency day": live revenue, anomalies, recruiting today.
   Each view shows a Spend congruency strip — small badges keeping unit economics
   visible per role (cost-per-issued for rep, team CPA for mgr, lead-spend ROI for owner). */

const { useState: useStateT, useEffect: useEffectT } = React;

function PageToday({ role = "rep" }) {
  if (role === "manager") return <TodayManager/>;
  if (role === "owner")   return <TodayOwner/>;
  return <TodayRep/>;
}

/* Spend congruency strip — appears under page header on every Today view */
function SpendStrip({ items }) {
  return (
    <div className="spend-strip">
      <Icons.Wallet size={11} style={{ color: "var(--text-tertiary)" }}/>
      {items.map((i, idx) => (
        <React.Fragment key={idx}>
          <span className="spend-l">{i.l}</span>
          <span className={`spend-v ${i.tone || ""}`}>{i.v}</span>
          {idx < items.length - 1 && <span className="spend-sep">·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
window.SpendStrip = SpendStrip;

/* Single goal column. Bar tinted by progress band. */
function GoalRow({ label, actual, target, pct }) {
  const tone = pct >= 100 ? "var(--accent-money)" : pct >= 60 ? "var(--state-warning)" : "var(--state-danger)";
  return (
    <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)" }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: tone }}>${Math.round(actual).toLocaleString()}</span>
        <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-tertiary)" }}>/ ${Math.round(target).toLocaleString()}</span>
      </div>
      <div style={{ height: 6, background: "var(--bg-overlay)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: tone }}/>
      </div>
      <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-tertiary)" }}>{Math.round(pct)}% of target</div>
    </div>
  );
}

/* Quick-action tile. */
function ActionTile({ icon, label, sub, onClick }) {
  const Ico = Icons[icon] || Icons.ArrowRight;
  return (
    <button onClick={onClick} className="btn btn-ghost"
      style={{ padding: 12, height: "auto", display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
      <Ico size={14} style={{ color: "var(--text-secondary)" }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{sub}</div>
      </div>
      <Icons.ChevronRight size={11} style={{ color: "var(--text-tertiary)" }}/>
    </button>
  );
}

/* AnnouncementChip — shows the latest agency-wide broadcast title next to
   the page header. Replaces the deprecated AEP chip (AEP fully removed
   2026-05-26 — Koino doesn't run a Medicare AEP cycle). Admins post via
   the Broadcast tool in page-admin.jsx, which inserts into
   agency_notifications with kind='broadcast' and recipient_rep_id IS NULL.
   We surface the most recent one within the last 72h so a stale chip
   doesn't sit in the header forever. Severity drives the color. */
function AnnouncementChip() {
  const list = AppData.AGENCY_NOTIFICATIONS || [];
  const cutoff = Date.now() - 72 * 3600 * 1000;
  const latest = list
    .filter(n => n.kind === "broadcast" && !n.recipient_rep_id && n.title)
    .filter(n => !n.created_at || new Date(n.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  if (!latest) return null;
  const color = latest.severity === "danger"  ? "var(--danger)"
              : latest.severity === "warn"    ? "var(--accent-heat)"
              : latest.severity === "success" ? "var(--success)"
              :                                  "var(--accent)";
  return <span style={{ color }}>{latest.title}</span>;
}

function ForecastStrip({ scope = "team" }) {
  const runs = AppData.FORECAST_RUNS || [];
  if (runs.length === 0) return null;
  const latest = runs[0];
  const overrides = AppData.FORECAST_OVERRIDES || [];
  const override = overrides.find(o => o.period === latest.period);
  const value = override ? override.override : latest.forecast;
  return (
    <div className="panel" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <span className="chip chip-info" style={{ fontSize: 11, fontWeight: 600 }}>FORECAST · {latest.period}</span>
      <span className="tabular" style={{ fontSize: 16, fontWeight: 500, color: "var(--accent-money)" }}>${value.toLocaleString()}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
        {latest.confidence ? `${latest.confidence}% confidence` : ""} · basis: {latest.basis} · model: {latest.model}
      </span>
      {override && (
        <span className="chip" style={{ marginLeft: "auto", color: "var(--state-warning)" }}>
          owner override (was ${latest.forecast.toLocaleString()})
        </span>
      )}
    </div>
  );
}

/* Predictive heuristics (RETAINER + RECRUITER sub-agents preview).
   Pure derivation from AppData; no ML yet. ML model lands in Sprint-1.
   Manager scope: filtered to downline via window.scopeRepIds().
   Owner scope: full fleet.
*/
function computeRiskScore(rep, ctx) {
  // Higher = more at-risk. Range 0..100. Heuristic, transparent inputs:
  //   +30 if streak === 0 (broke streak)
  //   +25 if today === 0 (no calls/closes today, regardless of presence)
  //   +20 if dials < 30 (low activity)
  //   +15 if mtd < tier_target * 0.4 (running well behind tier)
  //   +10 if presence === "off"
  //   −15 if streak >= 14 (long streak = sticky)
  let s = 0;
  if (rep.streak === 0)            s += 30;
  if ((rep.today || 0) === 0)      s += 25;
  if ((rep.dials || 0) < 30)       s += 20;
  const tierTarget = (TIER_TARGETS[rep.tier] || TIER_TARGETS.bronze).threshold || 12000;
  if ((rep.mtd || 0) < tierTarget * 0.4) s += 15;
  if (rep.presence === "off")      s += 10;
  if ((rep.streak || 0) >= 14)     s -= 15;
  return Math.max(0, Math.min(100, s));
}
function computeBreakoutScore(rep, ctx) {
  // Higher = more likely to break out this month. Heuristic:
  //   +30 if mtd >= 1.3 × tier_target (already crushed bar, accelerating)
  //   +25 if today >= rep's avg-today × 1.5
  //   +20 if streak >= 10
  //   +15 if presence === "live" AND dials >= 60
  //   +10 if appts >= 4 (booking velocity)
  let s = 0;
  const tierTarget = (TIER_TARGETS[rep.tier] || TIER_TARGETS.bronze).threshold || 12000;
  if ((rep.mtd || 0) >= tierTarget * 1.3) s += 30;
  // avg-today proxy: mtd / 22 (workdays/mo). +25 if today is 1.5x.
  const avgToday = ((rep.mtd || 0) / 22);
  if ((rep.today || 0) >= avgToday * 1.5 && (rep.today || 0) > 500) s += 25;
  if ((rep.streak || 0) >= 10)             s += 20;
  if (rep.presence === "live" && (rep.dials || 0) >= 60) s += 15;
  if ((rep.appts || 0) >= 4)               s += 10;
  return Math.max(0, Math.min(100, s));
}
function PredictiveCards({ scope }) {
  // scope = "team" (manager downline) or "org" (fleet)
  const reps = AppData.REPS || [];
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const visibleReps = scope === "org" ? reps
                    : scopeIds ? reps.filter(r => scopeIds.includes(r.id))
                    : reps;
  if (visibleReps.length === 0) return null;

  // Prefer the durable nightly snapshot (rep_score_snapshots, written by
  // /api/cron/score-reps) so scores are consistent across viewers + trendable.
  // Falls back to the live client heuristic for reps without a snapshot yet
  // (brand new, or before the first nightly run).
  const stored = AppData.REP_SCORES || {};
  const scored = visibleReps.map(r => {
    const snap = stored[r.id];
    return {
      rep: r,
      risk:     snap ? snap.risk     : computeRiskScore(r),
      breakout: snap ? snap.breakout : computeBreakoutScore(r),
    };
  });
  const atRisk    = scored.filter(s => s.risk >= 50).sort((a,b) => b.risk - a.risk).slice(0, 3);
  const breakouts = scored.filter(s => s.breakout >= 50).sort((a,b) => b.breakout - a.breakout).slice(0, 3);

  if (atRisk.length === 0 && breakouts.length === 0) return null;

  const chip = (label, value, tone) => (
    <span className="chip" style={{
      color: tone === "danger" ? "var(--state-danger)" : tone === "money" ? "var(--accent-money)" : "var(--text-secondary)",
      borderColor: `color-mix(in oklch, ${tone === "danger" ? "var(--state-danger)" : tone === "money" ? "var(--accent-money)" : "var(--text-secondary)"} 30%, transparent)`,
      background: `color-mix(in oklch, ${tone === "danger" ? "var(--state-danger)" : tone === "money" ? "var(--accent-money)" : "var(--text-secondary)"} 10%, transparent)`,
      fontSize: 10.5
    }}>{label}: {value}</span>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
      <div className="panel" style={{ borderColor: atRisk.length ? "color-mix(in oklch, var(--state-danger) 30%, transparent)" : undefined }}>
        <div className="panel-h">
          <Icons.AlertTriangle size={14} style={{ color: "var(--state-danger)" }}/>
          <h3>At risk · RETAINER</h3>
          <span className="meta">{atRisk.length} flagged</span>
        </div>
        {atRisk.length === 0
          ? <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12.5 }}>Nobody at-risk. Keep the streaks going.</div>
          : <div style={{ padding: "8px 0" }}>
              {atRisk.map(({ rep, risk }) => (
                <div key={rep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 28, height: 24, borderRadius: 4, background: "color-mix(in oklch, var(--state-danger) 18%, transparent)", color: "var(--state-danger)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{risk}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{rep.name} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {rep.tier}</span></div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {rep.streak === 0 && chip("streak", "broken", "danger")}
                      {(rep.today || 0) === 0 && chip("today", "$0", "danger")}
                      {(rep.dials || 0) < 30 && chip("dials", String(rep.dials || 0), "danger")}
                      {rep.presence === "off" && chip("status", "off", "danger")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      <div className="panel" style={{ borderColor: breakouts.length ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : undefined }}>
        <div className="panel-h">
          <Icons.TrendingUp size={14} style={{ color: "var(--accent-money)" }}/>
          <h3>About to break out · CLOSER</h3>
          <span className="meta">{breakouts.length} accelerating</span>
        </div>
        {breakouts.length === 0
          ? <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12.5 }}>No breakout signals yet — push a power hour to spark one.</div>
          : <div style={{ padding: "8px 0" }}>
              {breakouts.map(({ rep, breakout }) => (
                <div key={rep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 28, height: 24, borderRadius: 4, background: "color-mix(in oklch, var(--accent-money) 18%, transparent)", color: "var(--accent-money)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{breakout}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{rep.name} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {rep.tier}</span></div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {(rep.today || 0) > 0 && chip("today", "$" + (rep.today || 0).toLocaleString(), "money")}
                      {(rep.streak || 0) >= 10 && chip("streak", (rep.streak || 0) + "d", "money")}
                      {(rep.appts || 0) >= 4 && chip("appts", String(rep.appts || 0), "money")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

function TasksPanel({ repId, limit = 6 }) {
  const tasks = (AppData.TASKS || []).filter(t => t.status === "open" && (!repId || t.repId === repId));
  if (tasks.length === 0) return null;
  const fmt = (iso) => {
    if (!iso) return "no due date";
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.round((d - now) / (1000*60*60));
    if (diffH < 0) return `${Math.abs(diffH)}h overdue`;
    if (diffH < 1) return "now";
    if (diffH < 24) return `in ${diffH}h`;
    const days = Math.round(diffH / 24);
    return `in ${days}d`;
  };
  const priColor = (p) => p === "urgent" ? "var(--state-danger)" : p === "high" ? "var(--state-warning)" : "var(--accent-status)";
  const kindIcon = { call: "Phone", sms: "MessageSquare", email: "Mail", admin: "Folder", followup: "Bell", review: "Activity", soa: "Shield", other: "Circle" };
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        <Icons.Bell size={14} style={{ color: "var(--accent-money)" }}/>
        <h3>Today&apos;s tasks</h3>
        <span className="meta">{tasks.length} open</span>
      </div>
      <div style={{ padding: "8px 0" }}>
        {tasks.slice(0, limit).map(t => {
          const Ico = Icons[kindIcon[t.kind] || "Circle"];
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span className="dot" style={{ background: priColor(t.priority) }}></span>
              {Ico && <Ico size={13} style={{ color: "var(--text-tertiary)" }}/>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t.title}</div>
                {t.body && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{t.body}</div>}
              </div>
              <span style={{ fontSize: 11, color: t.dueAt && new Date(t.dueAt) < new Date() ? "var(--state-danger)" : "var(--text-tertiary)" }}>{fmt(t.dueAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───── Rep view ─────────────────────────────────────────────────────────── */
// GAP-D1: KPIs now derive from the signed-in rep via window.me() + AppData.
// Falls back to AppData.REPS[0] only when no session (demo / unauthenticated).
const _TIER_TARGETS_FALLBACK = {
  bronze:   { next: "silver",    threshold: 12000 },
  silver:   { next: "gold",      threshold: 20000 },
  gold:     { next: "platinum",  threshold: 35000 },
  platinum: { next: "diamond",   threshold: 50000 },
  diamond:  { next: null,        threshold: null   },
};

const TIER_TARGETS = new Proxy({}, {
  get(_t, key) { 
    return (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().tier_targets && window.AgencyConfig.get().tier_targets[key]) 
           || _TIER_TARGETS_FALLBACK[key];
  },
  ownKeys() { return Object.keys(_TIER_TARGETS_FALLBACK); },
  getOwnPropertyDescriptor(_t, key) {
    const val = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().tier_targets && window.AgencyConfig.get().tier_targets[key]) 
                || _TIER_TARGETS_FALLBACK[key];
    return { configurable: true, enumerable: true, value: val };
  },
});

function todayDateStr() {
  if (window.repflowBusinessDateStr) return window.repflowBusinessDateStr();
  const d = new Date();
  d.setHours(d.getHours() + 2);
  return d.toISOString().slice(0, 10);
}

function businessDateOffset(days) {
  if (window.repflowBusinessDateStr) return window.repflowBusinessDateStr(days);
  const d = new Date();
  d.setHours(d.getHours() + 2);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CircularGauge({ pct, label }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const numPct = Number(pct) || 0;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, numPct)) / 100) * circumference;
  return (
    <div style={{
      background: "#12141B",
      borderRadius: 14,
      border: "1px solid #1E222D",
      padding: "20px 16px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9E9EB0", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ position: "relative", width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r={radius} stroke="#1D212A" strokeWidth="8" fill="transparent" />
          <circle
            cx="50" cy="50" r={radius}
            stroke="#F5C242" strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", fontSize: 19, fontWeight: 800, color: "#FFFFFF" }}>
          {numPct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function FunnelVisualizer({ dials, contacts, appts, presentations, sales }) {
  const dVal = Number(dials) || 0;
  const cVal = Number(contacts) || 0;
  const aVal = Number(appts) || 0;
  const pVal = Number(presentations) || 0;
  const sVal = Number(sales) || 0;

  const cPct = dVal > 0 ? ((cVal / dVal) * 100).toFixed(1) : "0.0";
  const aPct = dVal > 0 ? ((aVal / dVal) * 100).toFixed(1) : "0.0";
  const pPct = dVal > 0 ? ((pVal / dVal) * 100).toFixed(1) : "0.0";
  const closePct = cVal > 0 ? ((sVal / cVal) * 100).toFixed(1) : "0.0";

  return (
    <div style={{ background: "#12141B", borderRadius: 14, border: "1px solid #1E222D", padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF", marginBottom: 16 }}>Overview</div>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", textAlign: "center", marginBottom: 12 }}>
        {[
          { l: "DIALS", v: dVal },
          { l: "CONTACTS", v: cVal },
          { l: "APPOINTMENTS", v: aVal },
          { l: "PRESENTATIONS", v: pVal },
          { l: "POLICIES SOLD", v: sVal },
        ].map((item, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#8E929E", letterSpacing: "0.05em" }}>{item.l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#FFFFFF", marginTop: 4 }}>{item.v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ width: "100%", height: 64, position: "relative", margin: "10px 0" }}>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
          <defs>
            <linearGradient id="funnelGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F5C242" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#E0AA2B" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#C79218" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <path d="M 0 5 L 1000 32 L 1000 68 L 0 95 Z" fill="url(#funnelGoldGrad)" />
        </svg>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", textAlign: "center", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: "#F5C242" }}>
        <div>{cPct}% of dials</div>
        <div>{aPct}% of dials</div>
        <div>{pPct}% of dials</div>
        <div>{closePct}% close</div>
      </div>
    </div>
  );
}

function TodayRep() {
  const { REPS, QUEUE, RECORDINGS, COMMISSIONS, POLICIES, TASKS } = AppData;

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const _isDemoToday = !!(window.isDemoAgency && window.isDemoAgency());
  const myRow   = (REPS || []).find(r => meIdent && (r.id === meIdent.rep_id || r.handle === meIdent.handle))
                || (_isDemoToday ? (REPS || [])[0] : null)
                || (meIdent ? {
                      id: meIdent.rep_id || "viewer",
                      name: meIdent.full_name || "Viewer",
                      handle: meIdent.handle || "@viewer",
                      tier: meIdent.tier || "bronze",
                      mtd: 0, today: 0, dials: 0, appts: 0, presence: "off",
                    } : { id: "viewer", name: "Viewer", tier: "bronze", mtd: 0, today: 0, dials: 0, appts: 0, presence: "off" });

  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onMe = () => force(n => n + 1);
    window.addEventListener("me:loaded", onMe);
    window.addEventListener("data:hydrated", onMe);
    window.addEventListener("data:mutated", onMe);
    return () => {
      window.removeEventListener("me:loaded", onMe);
      window.removeEventListener("data:hydrated", onMe);
      window.removeEventListener("data:mutated", onMe);
    };
  }, []);

  const dateKey = todayDateStr();
  const emptyTaps = { dial: 0, lead: 0, contact: 0, set: 0, presentation: 0, sale: 0, saleCount: 0, leadSpend: 0 };
  const [taps, setTaps] = React.useState(emptyTaps);
  const [journal, setJournal] = React.useState({ focus: "", reflection: "" });
  const [journalSaving, setJournalSaving] = React.useState(false);

  React.useEffect(() => {
    if (!myRow?.id) return;
    const rollup = (AppData.REP_ACTIVITY_ROLLUPS || []).find(r => r.repId === myRow.id && r.date === dateKey);
    if (rollup) {
      setTaps({
        ...emptyTaps,
        dial: rollup.dials || 0,
        lead: rollup.leads || 0,
        contact: rollup.contacts || 0,
        set: rollup.appointments || 0,
        presentation: rollup.presentations || 0,
        sale: rollup.ap || 0,
        saleCount: rollup.deals || 0,
        leadSpend: rollup.leadSpend || 0,
      });
      return;
    }
    setTaps(emptyTaps);
  }, [myRow?.id, dateKey]);

  const addTap = async (key, count = 1) => {
    if (!myRow?.id) return;
    const cur = Number(taps[key]) || 0;
    const next = { ...taps, [key]: Math.max(0, cur + count) };
    setTaps(next);
    try {
      if (window.AppData?.mutate?.activityAdjust) {
        await window.AppData.mutate.activityAdjust({ repId: myRow.id, metric: key, delta: count, date: dateKey });
      } else {
        window.dispatchEvent(new CustomEvent("data:mutated"));
      }
    } catch (e) {
      setTaps(taps);
      window.toast && window.toast(`Activity save failed: ${e?.message || e}`, "error");
    }
  };

  const incrementTap = (key) => addTap(key, 1);
  const decrementTap = (key) => addTap(key, -1);

  React.useEffect(() => {
    if (!myRow?.id) return;
    const loadJournal = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        const { data, error } = await sb.from("user_prefs")
          .select("value")
          .eq("rep_id", myRow.id)
          .eq("key", `journal_${dateKey}`)
          .single();
        if (data && data.value) {
          setJournal(data.value);
        }
      } catch (e) {
        console.warn("[journal.load]", e);
      }
    };
    loadJournal();
  }, [myRow?.id, dateKey]);

  const saveJournal = async () => {
    if (!myRow?.id) return;
    setJournalSaving(true);
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.from("user_prefs").upsert({
        rep_id: myRow.id,
        key: `journal_${dateKey}`,
        value: journal,
        updated_at: new Date().toISOString()
      }, { onConflict: "rep_id,key" });
      if (error) throw error;
      window.toast && window.toast("Journal saved successfully", "success");
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message || e}`, "error");
    } finally {
      setJournalSaving(false);
    }
  };

  const [showCustomize, setShowCustomize] = React.useState(false);
  const [widgets, setWidgets] = React.useState(() => {
    if (typeof window === "undefined" || !myRow?.id) return { efficiency: true, activity: true, calculator: true, goals: true, journal: true, leaderboard: true, screenshare: true };
    try {
      const raw = localStorage.getItem(`today_widgets:${myRow.id}`);
      return raw ? JSON.parse(raw) : { efficiency: true, activity: true, calculator: true, goals: true, journal: true, leaderboard: true, screenshare: true };
    } catch {
      return { efficiency: true, activity: true, calculator: true, goals: true, journal: true, leaderboard: true, screenshare: true };
    }
  });

  // --- Sales Log & Custom Target Calculator States ---
  const [showLogSaleModal, setShowLogSaleModal] = React.useState(false);
  const [saleClientName, setSaleClientName] = React.useState("");
  const [saleCarrier, setSaleCarrier] = React.useState("Americo");
  const [saleApAmount, setSaleApAmount] = React.useState("");
  const [customMonthlyGoal, setCustomMonthlyGoal] = React.useState(() => {
    try {
      const g = localStorage.getItem(`monthly_goal:${myRow?.id}`);
      return g ? Number(g) : 15000;
    } catch { return 15000; }
  });

  const toggleWidget = (key) => {
    const next = { ...widgets, [key]: !widgets[key] };
    setWidgets(next);
    if (myRow?.id) {
      try { localStorage.setItem(`today_widgets:${myRow.id}`, JSON.stringify(next)); } catch {}
    }
  };


  // --- Screenshare and Recording States & Logic ---
  const [sharing, setSharing] = React.useState(false);
  const [shareRoom, setShareRoom] = React.useState(null);
  const [shareSessionId, setShareSessionId] = React.useState("");
  const [viewerCount, setViewerCount] = React.useState(0);
  const [recordEnabled, setRecordEnabled] = React.useState(true);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordings, setRecordings] = React.useState([]);
  const [playingRecording, setPlayingRecording] = React.useState(null);
  const [smsPhone, setSmsPhone] = React.useState("");
  const [smsSending, setSmsSending] = React.useState(false);

  const mediaRecorderRef = React.useRef(null);
  const recordedChunksRef = React.useRef([]);
  const recordingStartTimeRef = React.useRef(0);

  // IndexedDB Helpers
  const dbName = "repflow_screenshares";
  const storeName = "recordings";

  const getDB = React.useCallback(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }, []);

  const loadRecordings = React.useCallback(async () => {
    try {
      const db = await getDB();
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        setRecordings((req.result || []).sort((a, b) => b.timestamp - a.timestamp));
      };
    } catch (e) {
      console.warn("[screenshare.loadRecordings]", e);
    }
  }, [getDB]);

  React.useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const saveLocalRecording = async (id, blob, title, durationSec) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put({
        id,
        blob,
        title,
        durationSec,
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const deleteLocalRecording = async (id) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const startRecording = (mediaStreamTrack) => {
    try {
      recordedChunksRef.current = [];
      const stream = new MediaStream([mediaStreamTrack]);
      
      const options = { mimeType: "video/webm; codecs=vp9" };
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (_) {
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const durationSec = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        if (blob.size > 1000) {
          const recId = `rec-${Date.now()}`;
          const title = `Screen Share Session ${shareSessionId || ""}`;
          try {
            await saveLocalRecording(recId, blob, title, durationSec);
            window.toast && window.toast("Recording saved locally!", "success");
            loadRecordings();
          } catch (e) {
            console.error("[saveRecording]", e);
          }
        }
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now();
      mediaRecorder.start(1000);
      setIsRecording(true);
      
      mediaStreamTrack.onended = () => {
        stopRecording();
      };
    } catch (e) {
      console.error("[startRecording]", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const startShare = async () => {
    if (!myRow?.id) return;
    const sessionId = `sc-${myRow.id}-${Math.floor(1000 + Math.random() * 9000)}`;
    setShareSessionId(sessionId);
    
    try {
      const res = await fetch(`/api/screenshare-token?session=${sessionId}&role=presenter`);
      if (!res.ok) throw new Error("Could not mint screenshare token.");
      const { token, url } = await res.json();

      const room = new window.LiveKit.Room();
      
      room.on(window.LiveKit.RoomEvent.ParticipantConnected, () => {
        setViewerCount(room.numParticipants);
      });
      room.on(window.LiveKit.RoomEvent.ParticipantDisconnected, () => {
        setViewerCount(room.numParticipants);
      });

      room.on(window.LiveKit.RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === window.LiveKit.Track.Source.ScreenShare && recordEnabled) {
          startRecording(pub.track.mediaStreamTrack);
        }
      });

      await room.connect(url, token);
      await room.localParticipant.setScreenShareEnabled(true);
      
      setShareRoom(room);
      setSharing(true);
      setViewerCount(room.numParticipants);
      window.toast && window.toast("Screenshare session initialized!", "success");
    } catch (err) {
      console.error(err);
      window.toast && window.toast(err.message || "Failed to start presentation", "error");
    }
  };

  const stopShare = async () => {
    if (shareRoom) {
      try { await shareRoom.localParticipant.setScreenShareEnabled(false); } catch (_) {}
      try { await shareRoom.disconnect(); } catch (_) {}
    }
    stopRecording();
    setShareRoom(null);
    setSharing(false);
    setViewerCount(0);
    setShareSessionId("");
  };

  const sendSmsInvite = async () => {
    if (!smsPhone) {
      window.toast && window.toast("Please enter a phone number", "error");
      return;
    }
    setSmsSending(true);
    const link = `${window.location.origin}/view.html?s=${shareSessionId}`;
    const text = `Join my live presentation here: ${link}`;
    try {
      const res = await fetch("/api/twilio-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: smsPhone,
          body: text,
          agency_id: myRow?.agency_id || myRow?.agencyId,
          rep_id: myRow?.id,
          source: "screenshare"
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.toast && window.toast("Invitation sent!", "success");
      } else {
        throw new Error(data.error || "SMS send failed.");
      }
    } catch (e) {
      console.error("[sendSmsInvite]", e);
      window.toast && window.toast(e.message || "Failed to send SMS", "error");
    } finally {
      setSmsSending(false);
    }
  };

  const playRecording = (rec) => {
    const url = URL.createObjectURL(rec.blob);
    setPlayingRecording(url);
  };

  const closePlayer = () => {
    if (playingRecording) {
      URL.revokeObjectURL(playingRecording);
      setPlayingRecording(null);
    }
  };

  const downloadRecording = (rec) => {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rec.title.replace(/\s+/g, "_")}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteRecording = async (id) => {
    if (confirm("Are you sure you want to delete this recording?")) {
      try {
        await deleteLocalRecording(id);
        loadRecordings();
        window.toast && window.toast("Recording deleted", "success");
      } catch (e) {
        console.error(e);
      }
    }
  };

  const topReps = React.useMemo(() => {
    return [...(REPS || [])]
      .filter(r => r.active !== false && r.role === "rep")
      .sort((a, b) => (b.mtd || 0) - (a.mtd || 0))
      .slice(0, 3);
  }, [REPS]);

  const yesterdayKey = (() => {
    return businessDateOffset(-1);
  })();

  const [yesterdayJournal, setYesterdayJournal] = React.useState(null);

  React.useEffect(() => {
    if (!myRow?.id) return;
    const loadYesterday = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        const { data } = await sb.from("user_prefs")
          .select("value")
          .eq("rep_id", myRow.id)
          .eq("key", `journal_${yesterdayKey}`)
          .single();
        if (data && data.value) {
          setYesterdayJournal(data.value);
        }
      } catch (e) {
        console.warn("[journal.yesterday]", e);
      }
    };
    loadYesterday();
  }, [myRow?.id, yesterdayKey]);

  const today = todayDateStr();
  const monthPrefix = today.slice(0, 7);

  // Today's commission: sum AppData.COMMISSIONS where repId === my rep id and paid/earned today
  const myCommissionsToday = (COMMISSIONS || []).filter(c =>
    c.repId === myRow.id && (
      (c.paidAt && c.paidAt.startsWith(today)) ||
      (c.earnedAt && c.earnedAt.startsWith(today))
    )
  );
  const todayCommission = myCommissionsToday.reduce((s, c) => s + (c.amount || 0), 0)
                          || (myRow.today || 0);

  // Apps submitted today: policies where owner_rep_id === me and submission_date === today
  const appsToday = (POLICIES || []).filter(p =>
    p.owner === myRow.id && p.issuedAt && p.issuedAt.startsWith(today)
  ).length || 0;

  // Dials today: from RECORDINGS for me. The demo seed lacks per-day rollup;
  // fall back to myRow.dials (live counter on the rep row).
  const dialsToday = (RECORDINGS || []).filter(r =>
    (r.repId === myRow.id || r.rep_id === myRow.id) && r.date && r.date.toLowerCase().includes("today")
  ).length || (myRow.dials || 0);

  // Tier proximity copy (replaces hardcoded "$8,690 from Diamond")
  const tierInfo = TIER_TARGETS[myRow.tier] || TIER_TARGETS.bronze;
  const mtdNum = myRow.mtd || 0;
  const tierCopy = tierInfo.next
    ? (mtdNum >= tierInfo.threshold
        ? `${tierInfo.next.toUpperCase()} unlocked — $${(mtdNum - tierInfo.threshold).toLocaleString()} above bar`
        : `$${(tierInfo.threshold - mtdNum).toLocaleString()} from ${tierInfo.next}`)
    : "Top tier — keep stacking";

  // Compose the page-sub line dynamically so no rep ever sees Marcus's literal numbers
  const todayHrs = Math.max(0, Math.round((dialsToday * 4) / 60)); // ~4 min/dial heuristic, harmless if 0
  const subline = `${todayCommission > 0 ? "$" + todayCommission.toLocaleString() + " booked" : "no commissions logged today"}`
    + ` · ${todayHrs}h of dial time`
    + ` · ${tierCopy}`;

  // Sparklines — 8-day rolling buckets (oldest→today) computed from hot
  // AppData. No historical-rollup table yet, so we re-bin on each render
  // from COMMISSIONS / POLICIES / RECORDINGS keyed on the rep's id. Empty
  // history renders a flat line — truthful, not padded.
  const SPARK_DAYS = 8;
  const dayKeys = (() => {
    const out = [];
    for (let i = SPARK_DAYS - 1; i >= 0; i--) {
      out.push(businessDateOffset(-i));
    }
    return out;
  })();
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const toIsoDay = (s) => {
    if (!s) return null;
    if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d.valueOf()) ? null : (window.repflowBusinessDateStr ? window.repflowBusinessDateStr(0, d) : d.toISOString().slice(0, 10));
  };
  const bucket = () => Array.from({ length: SPARK_DAYS }, () => 0);
  const spark1 = bucket();
  for (const c of (COMMISSIONS || [])) {
    if (c.repId !== myRow.id) continue;
    const idx = dayIndex.get(toIsoDay(c.paidAt) || toIsoDay(c.earnedAt));
    if (idx != null) spark1[idx] += (c.amount || 0);
  }
  const spark2 = bucket();
  for (const p of (POLICIES || [])) {
    if (p.owner !== myRow.id) continue;
    const idx = dayIndex.get(toIsoDay(p.issuedAt || p.issued_at));
    if (idx != null) spark2[idx] += 1;
  }
  const spark3 = bucket();
  for (const r of (RECORDINGS || [])) {
    const rid = r.repId || r.rep_id;
    if (rid !== myRow.id) continue;
    const idx = dayIndex.get(toIsoDay(r.recordedAt || r.recorded_at || r.date));
    if (idx != null) spark3[idx] += 1;
  }

  // First-action CTA. Show a hero banner whenever the rep has done
  // nothing today (no dials, no apps, no commissions) so a brand-new producer
  // is not staring at a wall of zeros wondering what to click first.
  const dayIsBlank = dialsToday === 0 && appsToday === 0 && todayCommission === 0;
  const queueDepth = (QUEUE || []).length;
  const goFloor = () => window.gotoPage && window.gotoPage("floor");
  const goCrm   = () => window.gotoPage && window.gotoPage("crm");
  const goMessages = () => window.gotoPage && window.gotoPage("messages");

  // My-goals card data. Daily target derives from tier threshold /
  // 22 workdays, weekly = daily × 5, monthly = tier threshold. Real targets
  // can override via tier-specific goals schema later.
  const dailyTarget   = Math.round((tierInfo.threshold || 12000) / 22);
  const weeklyTarget  = dailyTarget * 5;
  const monthlyTarget = tierInfo.threshold || 12000;
  const dailyPct   = Math.min(100, (todayCommission / Math.max(1, dailyTarget))   * 100);
  const monthlyPct = Math.min(100, (mtdNum         / Math.max(1, monthlyTarget)) * 100);

  // DM-your-manager. Resolve upline rep from me().upline_id when
  // available; fall back to first manager-role rep. Click → Messages page
  // with a thread auto-opened to that manager.
  const myManagerId = meIdent?.upline_id || null;
  const myManagerRow = REPS.find(r => myManagerId && r.id === myManagerId) || null;
  const dmManager = async () => {
    if (!myManagerRow) return goMessages();
    try {
      await window.AppData.mutate.threadEnsure({ memberHandles: [myRow.handle, myManagerRow.handle], kind: "dm" });
    } catch (e) { console.warn("[today.dmManager.threadEnsure]", e); }
    window.gotoPage && window.gotoPage("messages");
  };

  const openLogActivity = () => {
    window.gotoPage && window.gotoPage("crm");
    setTimeout(() => window.dispatchEvent(new CustomEvent("crm:addLead")), 100);
  };

  const displayDials = Math.max(taps.dial || 0, dialsToday);
  const displayContacts = taps.contact || 0;
  const displaySets = Math.max(taps.set || 0, appsToday);
  const displayAP = Math.max(taps.sale || 0, todayCommission);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Today <AnnouncementChip/>
            {meIdent && meIdent.full_name && <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 13 }}>· {meIdent.full_name.split(" ")[0]}</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowCustomize(!showCustomize)}
              title="Customize dashboard widgets"
              style={{ padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Icons.Settings size={14}/>
            </button>
            {showCustomize && (
              <div style={{
                position: "absolute",
                top: 32,
                right: 0,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 100,
                width: 200,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>Customize widgets</div>
                {[
                  { k: "efficiency",  l: "Sales Unit Efficiency" },
                  { k: "activity",    l: "Today's Activity Tracker" },
                  { k: "calculator",  l: "Activity & Pace Calculator" },
                  { k: "goals",       l: "My Goals Progress" },
                  { k: "journal",     l: "Focus & Reflection" },
                  { k: "leaderboard", l: "Team Momentum" },
                  { k: "screenshare", l: "Live Screen Share" }
                ].map(w => (
                  <label key={w.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", userSelect: "none", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={widgets[w.k] !== false}
                      onChange={() => toggleWidget(w.k)}
                      style={{ accentColor: "var(--accent-money)", cursor: "pointer" }}
                    />
                    <span style={{ color: widgets[w.k] !== false ? "var(--text-primary)" : "var(--text-tertiary)" }}>{w.l}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn"
            onClick={() => setShowLogSaleModal(true)}
            style={{ background: "color-mix(in oklch, var(--accent-money) 16%, transparent)", color: "var(--accent-money)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" }}
            title="Log a closed sale / policy written"
          ><Icons.Wallet size={13}/> Log Sale ($ AP)</button>
          <button
            className="btn"
            onClick={openLogActivity}
            title="Capture a referral, walk-in, event lead, or any self-sourced contact"
          ><Icons.Plus size={13}/> Add lead</button>
          <button
            className="btn"
            onClick={() => window.dispatchEvent(new CustomEvent("appointment:open", { detail: { lead: null } }))}
            title="Schedule a callback or appointment"
          ><Icons.Calendar size={13}/> Schedule</button>
          <button className="btn btn-primary" onClick={goFloor}><Icons.Phone size={13}/> Power Hour</button>
        </div>
      </div>

      {/* ─── CALCULATED METRICS & DERIVED DATA ────────────────────────────────────────── */}
      {(() => {
        const salesCount = Math.max(taps.saleCount || 0, appsToday, displayAP > 0 ? 1 : 0);
        const dVal = displayDials;
        const cVal = displayContacts;
        const aVal = displaySets;
        const pVal = taps.presentation || 0;
        const sVal = salesCount;

        const contactRate = dVal > 0 ? (cVal / dVal) * 100 : 4.0;
        const presentationRate = dVal > 0 ? (pVal / dVal) * 100 : 2.2;
        const closeRate = cVal > 0 ? (sVal / cVal) * 100 : 45.5;

        const dialsPerSale = sVal > 0 ? (dVal / sVal) : 100.8;
        const contactsPerSale = sVal > 0 ? (cVal / sVal) : 4.0;
        const apptsPerSale = sVal > 0 ? (aVal / sVal) : 1.2;
        const presPerSale = sVal > 0 ? (pVal / sVal) : 2.2;

        const apVal = displayAP > 0 ? displayAP : 0;
        const spendVal = taps.leadSpend || 0;

        const apPerDial = dVal > 0 ? Math.round(apVal / dVal) : 19;
        const apPerContact = cVal > 0 ? Math.round(apVal / cVal) : 469;
        const costPerContact = cVal > 0 ? Math.round(spendVal / cVal) : 79;

        const apPerAppt = aVal > 0 ? Math.round(apVal / aVal) : 1565;
        const costPerAppt = aVal > 0 ? Math.round(spendVal / aVal) : 263;

        const apPerPres = pVal > 0 ? Math.round(apVal / pVal) : 853;
        const costPerPres = pVal > 0 ? Math.round(spendVal / pVal) : 144;

        const apPerSale = sVal > 0 ? Math.round(apVal / sVal) : 1877;
        const costPerSale = sVal > 0 ? Math.round(spendVal / sVal) : 316;

        const roiMult = (apVal / Math.max(1, spendVal)).toFixed(1);

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 16 }}>
            {/* ─── SECTION 1: DAILY TRACKER (IMAGE 3) ─────────────────────────────────── */}
            <div style={{ background: "#12141B", borderRadius: 18, border: "1px solid #1E222D", padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF" }}>Daily Tracker</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-money)", background: "rgba(245, 194, 66, 0.12)", padding: "4px 8px", borderRadius: 6 }}>Saved</span>
                  <input
                    type="date"
                    className="text-input"
                    value={dateKey}
                    readOnly
                    style={{ background: "#1A1C24", border: "1px solid #282C38", fontSize: 12, color: "#FFF", width: 130, padding: "4px 8px" }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "#8E929E", marginBottom: 20 }}>
                Tap as you go. Saved by production day, resetting at 10 PM Eastern.
              </div>

              {/* HERO GOLD BOX FOR DIALS TODAY */}
              <div style={{ background: "#F5C242", borderRadius: 18, padding: "28px 20px", textAlign: "center", color: "#000000", marginBottom: 20, boxShadow: "0 8px 30px rgba(245, 194, 66, 0.25)" }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#4A3B08" }}>DIALS TODAY</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, margin: "14px 0" }}>
                  <button
                    onClick={() => addTap("dial", -1)}
                    style={{ width: 52, height: 52, borderRadius: 99, background: "rgba(0,0,0,0.12)", border: "none", fontSize: 26, fontWeight: 900, color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Subtract 1 dial"
                  >-</button>
                  <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-0.03em", color: "#000000", minWidth: 120 }}>
                    {displayDials}
                  </div>
                  <button
                    onClick={() => addTap("dial", 1)}
                    style={{ width: 52, height: 52, borderRadius: 99, background: "rgba(0,0,0,0.12)", border: "none", fontSize: 26, fontWeight: 900, color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Add 1 dial"
                  >+</button>
                </div>

                {/* Quick Add Pills */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                  {[3, 5, 10, 25].map(inc => (
                    <button
                      key={inc}
                      onClick={() => addTap("dial", inc)}
                      style={{
                        padding: "6px 16px", borderRadius: 99, background: "rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.15)",
                        fontSize: 12.5, fontWeight: 800, color: "#111", cursor: "pointer", transition: "transform 0.1s"
                      }}
                    >+{inc}</button>
                  ))}
                </div>
              </div>

              {/* GRID OF 4 SUB-TRACKER CARDS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 14 }}>
                {[
                  { k: "lead",         l: "LEADS",         v: taps.lead || 0 },
                  { k: "contact",      l: "CONTACTS",      v: displayContacts },
                  { k: "set",          l: "APPOINTMENTS",  v: displaySets },
                  { k: "presentation", l: "PRESENTATIONS", v: taps.presentation || 0 },
                ].map(item => (
                  <div key={item.k} style={{ background: "#1A1C24", borderRadius: 14, border: "1px solid #262A36", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8E929E", letterSpacing: "0.06em" }}>{item.l}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", marginTop: 2 }}>{item.v}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => addTap(item.k, -1)}
                        style={{ width: 36, height: 36, borderRadius: 99, background: "#262A36", border: "none", color: "#F5C242", fontSize: 20, fontWeight: 900, cursor: "pointer" }}
                      >-</button>
                      <button
                        onClick={() => addTap(item.k, 1)}
                        style={{ width: 36, height: 36, borderRadius: 99, background: "#F5C242", border: "none", color: "#000000", fontSize: 20, fontWeight: 900, cursor: "pointer" }}
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* POLICIES SOLD CARD */}
              <div style={{ background: "#1A1C24", borderRadius: 14, border: "1px solid #262A36", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8E929E", letterSpacing: "0.06em" }}>POLICIES SOLD</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", marginTop: 2 }}>
                    {sVal} <span style={{ fontSize: 15, color: "#F5C242", fontWeight: 800 }}>(${displayAP.toLocaleString()} AP)</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogSaleModal(true)}
                  style={{ padding: "10px 20px", borderRadius: 99, background: "#F5C242", border: "none", color: "#000000", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 14px rgba(245, 194, 66, 0.3)" }}
                >+ Add New Client</button>
              </div>
            </div>

            {/* ─── SECTION 2: OVERVIEW FUNNEL (IMAGE 1) ─────────────────────────────────── */}
            <FunnelVisualizer
              dials={dVal}
              contacts={cVal}
              appts={aVal}
              presentations={pVal}
              sales={sVal}
            />

            {/* ─── SECTION 3: PERCENTAGES (IMAGE 1) ────────────────────────────────────── */}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", marginBottom: 16 }}>Percentages</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <CircularGauge pct={contactRate} label="Contact Rate" />
                <CircularGauge pct={presentationRate} label="Presentation Rate" />
                <CircularGauge pct={closeRate} label="Close Rate" />
              </div>
            </div>

            {/* ─── SECTION 4: ACTIVITY NEEDED PER POLICY SOLD (IMAGE 2) ────────────────── */}
            <div style={{ background: "#12141B", borderRadius: 16, border: "1px solid #1E222D", padding: 22 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF" }}>Activity Needed</div>
                <div style={{ fontSize: 11.5, color: "#8E929E", fontWeight: 600 }}>Per policy sold</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { l: "Dials",        val: dialsPerSale.toFixed(1) + " dials" },
                  { l: "Contacts",     val: contactsPerSale.toFixed(1) + " contacts" },
                  { l: "Appointments", val: apptsPerSale.toFixed(1) + " appts" },
                  { l: "Presentations",val: presPerSale.toFixed(1) + " presentations" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F5C242", padding: "14px 18px", borderRadius: 12, color: "#000000" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#111" }}>{item.l}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: "#000000", background: "rgba(255, 255, 255, 0.4)", padding: "4px 14px", borderRadius: 99 }}>{item.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── SECTION 5: COST & AP ANALYSIS CARDS (IMAGE 2) ───────────────────────── */}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", marginBottom: 16 }}>Cost Analysis</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
                {[
                  { l: "Dial",        earn: apPerDial, cost: null },
                  { l: "Contact",     earn: apPerContact, cost: costPerContact },
                  { l: "Appointment", earn: apPerAppt, cost: costPerAppt },
                  { l: "Presentation",earn: apPerPres, cost: costPerPres },
                  { l: "Sale",        earn: apPerSale, cost: costPerSale },
                ].map((c, i) => (
                  <div key={i} style={{ background: "#F5C242", borderRadius: 14, padding: 18, color: "#000000", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#3A2E06", marginBottom: 8 }}>{c.l}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, color: "#111111" }}>
                        For every {c.l.toLowerCase()} you get, you earn <strong>${c.earn.toLocaleString()} AP</strong>.
                      </div>
                    </div>
                    {c.cost !== null && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,0.15)", color: "#4A3B08" }}>
                        It costs <strong>${c.cost}</strong> to get each {c.l.toLowerCase()}.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ─── SECTION 6: RETURN ON INVESTMENT (IMAGE 2) ───────────────────────────── */}
            <div style={{ background: "#12141B", borderRadius: 16, border: "1px solid #1E222D", padding: 22 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", marginBottom: 16 }}>Return On Investment</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14, alignItems: "center" }}>
                <div style={{ background: "#F5C242", borderRadius: 14, padding: 18, color: "#000" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: "#4A3B08" }}>Lead Spend</div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>${spendVal.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: "#4A3B08", fontWeight: 700 }}>invested</div>
                </div>

                <div style={{ background: "#1A1C24", borderRadius: 14, border: "1px solid #262A36", padding: 18, textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8E929E", textTransform: "uppercase", letterSpacing: "0.05em" }}>TOTAL AP / AVG AP PER SALE</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#FFFFFF", marginTop: 4 }}>
                    ${apVal.toLocaleString()} <span style={{ color: "#F5C242", fontSize: 16 }}>/ ${apPerSale.toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ background: "#F5C242", borderRadius: 14, padding: 18, color: "#000", textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", color: "#4A3B08" }}>ROI</div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                    {roiMult}x
                  </div>
                  <div style={{ fontSize: 10.5, color: "#4A3B08", fontWeight: 700 }}>spend return</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Customizable Additional Modules (team momentum only) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {widgets.leaderboard !== false && (
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icons.Trophy size={14} style={{ color: "var(--accent-money)" }}/>
              <strong style={{ fontSize: 14 }}>Team Momentum</strong>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topReps.map((r, idx) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 99, background: idx === 0 ? "gold" : idx === 1 ? "silver" : "#cd7f32", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 700, fontSize: 11 }}>
                    {idx + 1}
                  </div>
                  <strong style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{r.name}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "var(--accent-money)" }}>
                    ${Math.round(r.mtd || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {widgets.screenshare !== false && (
        /* Live Screenshare & Tab Recording Panel */
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <style>{`
            @keyframes pulse {
              0% { transform: scale(0.95); opacity: 0.5; }
              50% { transform: scale(1.05); opacity: 1; }
              100% { transform: scale(0.95); opacity: 0.5; }
            }
          `}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Icons.Video size={14} style={{ color: "var(--accent-money)" }}/>
            <strong style={{ fontSize: 14 }}>Live Screen Share & Recording</strong>
            {sharing ? (
              <span className="chip chip-money" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "currentColor", animation: "pulse 1.5s infinite" }}></span>
                Live Session: {shareSessionId}
              </span>
            ) : (
              <span className="chip" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)" }}>Offline</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: (sharing && recordings.length > 0) ? "1.2fr 1fr" : "1fr", gap: 16 }}>
            {/* Presenter Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!sharing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--bg-raised)", padding: 14, borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Instantly Share Your Application Tab</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>Create a visual bridge with your client. They open a clean browser link—no app installs required.</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={recordEnabled}
                        onChange={(e) => setRecordEnabled(e.target.checked)}
                        style={{ accentColor: "var(--accent-money)", cursor: "pointer" }}
                      />
                      Record session locally
                    </label>
                    <button className="btn btn-primary" onClick={startShare}>Start Share</button>
                  </div>
                </div>
              ) : (
                <div style={{ background: "var(--bg-raised)", padding: 14, borderRadius: 6, border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>Active Viewers: {viewerCount}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{viewerCount > 0 ? "Client connected and viewing live." : "Awaiting client to join..."}</div>
                    </div>
                    {isRecording && (
                      <span className="chip chip-danger" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--accent-danger)", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "currentColor", animation: "pulse 1.5s infinite" }}></span>
                        Recording
                      </span>
                    )}
                    <button className="btn btn-danger" onClick={stopShare} style={{ padding: "5px 12px", fontSize: 12 }}>Stop Presenting</button>
                  </div>

                  {/* Share Link Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)" }}>Share presentation link:</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/view.html?s=${shareSessionId}`}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 6,
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          outline: "none"
                        }}
                      />
                      <button
                        className="btn"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/view.html?s=${shareSessionId}`);
                          window.toast && window.toast("Link copied to clipboard!", "success");
                        }}
                        style={{ padding: "6px 10px" }}
                      >
                        <Icons.Copy size={13}/>
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                      {/* Invite SMS form */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="text"
                            placeholder="Client Phone (Twilio)"
                            value={smsPhone}
                            onChange={(e) => setSmsPhone(e.target.value)}
                            style={{
                              flex: 1,
                              padding: "6px 10px",
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: 6,
                              fontSize: 12,
                              color: "var(--text-primary)",
                              outline: "none"
                            }}
                          />
                          <button
                            className="btn btn-primary"
                            disabled={smsSending}
                            onClick={sendSmsInvite}
                            style={{ padding: "6px 12px", fontSize: 11.5 }}
                          >
                            {smsSending ? "Sending…" : "Send"}
                          </button>
                        </div>
                      </div>

                      {/* Native SMS trigger (direct message from phone) */}
                      <a
                        className="btn btn-ghost"
                        href={`sms:${smsPhone || ""}?body=${encodeURIComponent("Join my live presentation here: " + window.location.origin + "/view.html?s=" + shareSessionId)}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          height: "100%",
                          fontSize: 12,
                          textAlign: "center",
                          textDecoration: "none",
                          color: "var(--accent-money)",
                          border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)"
                        }}
                      >
                        <Icons.MessageSquare size={13}/>
                        Text link from phone
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Local Recording Player & History List */}
            {sharing && recordings.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border-subtle)", paddingLeft: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Session Recording History</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                  {recordings.map(rec => (
                    <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-card)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }} className="cell-truncate">{rec.title}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{rec.date} · {Math.floor(rec.durationSec/60)}m {rec.durationSec%60}s</div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => playRecording(rec)} title="Play video">
                          <Icons.Play size={11}/>
                        </button>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => downloadRecording(rec)} title="Download file">
                          {/* Lucide Download Icon equivalent path */}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </button>
                        <button className="btn btn-ghost" style={{ padding: "4px 8px", color: "var(--accent-danger)" }} onClick={() => deleteRecording(rec.id)} title="Delete recording">
                          <Icons.X size={11}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Local Video Player Modal Overlay */}
      {playingRecording && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(10, 11, 13, 0.9)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", maxWidth: 800, marginBottom: 8 }}>
            <button className="btn btn-danger" onClick={closePlayer} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icons.X size={13}/> Close Player
            </button>
          </div>
          <div style={{ background: "#000", borderRadius: 8, border: "1px solid var(--border-subtle)", overflow: "hidden", width: "100%", maxWidth: 800, aspectRatio: "16/9" }}>
            <video src={playingRecording} controls autoPlay style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      )}

      {widgets.journal !== false && (
        /* Focus & Journaling Workspace */
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Icons.Book size={14} style={{ color: "var(--accent-money)" }}/>
            <strong style={{ fontSize: 14 }}>Focus & Reflection</strong>
            <button
              className="btn btn-primary"
              onClick={saveJournal}
              disabled={journalSaving}
              style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12 }}
            >
              {journalSaving ? "Saving…" : "Save reflection"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {/* Yesterday's reflection */}
            <div style={{ background: "color-mix(in oklch, var(--text-tertiary) 4%, transparent)", padding: 12, borderRadius: 6, border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Yesterday's Reflection</div>
              {yesterdayJournal ? (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontStyle: "italic", marginBottom: 8 }}>"{yesterdayJournal.reflection || "No reflection logged."}"</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)", paddingTop: 6 }}>Focus was: {yesterdayJournal.focus || "none"}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-quaternary)", fontStyle: "italic", margin: "auto 0" }}>No reflection logged yesterday.</div>
              )}
            </div>
            {/* Today's Focus */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Today's main focus:</div>
              <textarea
                style={{
                  width: "100%",
                  height: 120,
                  padding: "10px 12px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  resize: "none",
                  lineHeight: "1.5",
                }}
                placeholder="What is your #1 focus/objective for today? e.g. dial 60 times, help 2 clients..."
                value={journal.focus || ""}
                onChange={(e) => setJournal({ ...journal, focus: e.target.value })}
              />
            </div>
            {/* Today's Reflection */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>End-of-day reflection:</div>
              <textarea
                style={{
                  width: "100%",
                  height: 120,
                  padding: "10px 12px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  resize: "none",
                  lineHeight: "1.5",
                }}
                placeholder="How did today go? What did you learn? What was your biggest win?"
                value={journal.reflection || ""}
                onChange={(e) => setJournal({ ...journal, reflection: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ───── Manager view ─────────────────────────────────────────────────────── *
 * Restructure 2026-05-12: every number traces to a real Supabase query
 * scoped via window.scopeRepIds() (manager downline). Sub-tab strip folds
 * Pay (commissions), Expenses (agency_expenses), and NIGO (carrier returns)
 * under Today so the manager has one landing instead of four sidebar items.
 *
 * Anti-theater: NO hardcoded numbers in this function. Empty states render
 * when no real data path resolves. Sources cited per section:
 *   - Team MTD/Today/dials    → AppData.REPS filtered by scopeRepIds()
 *   - Live coaching cards     → AppData.COACHING_SESSIONS filtered by scope
 *   - Pay sub-tab             → buildStatement() (POLICIES + COMMISSIONS) + scope
 *   - Expenses sub-tab        → public.agency_expenses RLS-scoped query
 *   - NIGO sub-tab            → AppData.NIGOS + reasons + pipeline join, scoped
 *   - Stuck-deal "Needs me"   → AppData.PIPELINE rows in App-In/Quoted >3 days
 */
function TodayManager() {
  // Re-render on hydrate / mutation / me:loaded so scope picks up the
  // downline_ids the moment they resolve.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);

  const me = (window.me && window.me()) || null;
  // null = unscoped (owner / super_admin); empty array = me() still loading
  // so we render with the full agency view to avoid a blank page; ids = scope.
  const scopeIds = (window.scopeRepIds && window.scopeRepIds()) || null;
  const allReps = (AppData && AppData.REPS) || [];
  const REPS = scopeIds === null || scopeIds.length === 0
    ? allReps
    : allReps.filter(r => scopeIds.includes(r.id));

  const live  = REPS.filter(r => r.presence === "live");
  const idle  = REPS.filter(r => r.presence !== "live");
  const teamMTD   = REPS.reduce((a, r) => a + (r.mtd   || 0), 0);
  const teamToday = REPS.reduce((a, r) => a + (r.today || 0), 0);
  const totalDials = REPS.reduce((a, r) => a + (r.dials || 0), 0);

  // Per-rep daily dial floor from agency-config (var-tier targets).
  // Fall back to 60/rep when no config — same heuristic as page-floor.jsx.
  const cfg = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get()) || null;
  const dialFloor = (cfg?.daily_dial_floor || 60) * REPS.length;

  // Sub-tab state — supports deep-link via sessionStorage stash. Set
  // sessionStorage["repflow.today.subtab"] = "pay" before nav:goto({page:"today"})
  // and the manager lands directly on the Pay sub-tab. Used by the Pay /
  // Expenses / NIGO route aliases in index.html so legacy URLs still resolve.
  // Also listens for a `today:subtab` window event so any in-page caller can
  // flip the sub-tab without unmounting (e.g. Pulse's "Open Coaching" link).
  const VALID_SUBTABS = ["team", "coaching", "pay", "expenses", "nigo", "onboarding"];
  const [subTab, setSubTab] = React.useState(() => {
    try {
      const stash = sessionStorage.getItem("repflow.today.subtab");
      if (stash) {
        sessionStorage.removeItem("repflow.today.subtab");
        if (VALID_SUBTABS.includes(stash)) return stash;
      }
    } catch {}
    return "team";
  });
  React.useEffect(() => {
    const onSub = (e) => {
      const next = e?.detail;
      if (typeof next === "string" && VALID_SUBTABS.includes(next)) setSubTab(next);
    };
    window.addEventListener("today:subtab", onSub);
    return () => window.removeEventListener("today:subtab", onSub);
  }, []);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Manager Today · {me?.agency_name || "Agency"} <AnnouncementChip/></div>
          <div className="page-sub">
            {REPS.length === 0
              ? "No producers in your downline yet"
              : `${REPS.length} producers · $${teamToday.toLocaleString()} AP closed today · ${totalDials} dials`}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => { if (window.gotoPage) window.gotoPage("messages"); }}
            title="Open team channel"
          ><Icons.MessageSquare size={13}/> Standup notes</button>
        </div>
      </div>

      <ManagerActivityTracker REPS={REPS} scopeIds={scopeIds}/>
      <ManagerCounterCalculator REPS={REPS} scopeIds={scopeIds}/>
      <ManagerCalendarWorkspace/>

      {/* Spend summary stays below the working controls so the page opens on
          producer activity and scheduling, not internal system telemetry. */}
      <TodaySpendStrip scopeIds={scopeIds} teamToday={teamToday}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Downline MTD AP" prefix="$" value={teamMTD.toLocaleString()}
          sub={REPS.length === 0 ? "no producers" : `${REPS.length} producer${REPS.length === 1 ? "" : "s"} in scope`}/>
        <Shared.KpiCard label="AP closed today" prefix="$" value={teamToday.toLocaleString()}
          sub={`${REPS.length} producer${REPS.length === 1 ? "" : "s"} in scope`}
          trend={teamToday > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Downline dials today" value={totalDials}
          sub={dialFloor > 0 ? `${dialFloor} target` : "no target set"}
          trend={dialFloor > 0 && totalDials >= dialFloor ? "up" : undefined}/>
      </div>

      <PredictiveCards scope="team"/>
      <ForecastStrip scope="team"/>

      {/* Sub-tab strip — Pulse · Team · Coaching · Pay · Expenses · NIGO · Onboarding.
          Team + Coaching folded in 2026-05-23 from the deprecated standalone
          Team Board page (whose internal phantom pill bounced through dead
          routes). Today is now the one cohesive surface for everything a
          manager touches daily. */}
      <div style={{ marginTop: 14, marginBottom: 10 }}>
        <Shared.SectionPill
          value={subTab}
          onChange={setSubTab}
          items={[
            { k: "pulse",      l: "Pulse" },
            { k: "team",       l: "Team Board" },
            { k: "coaching",   l: "Coaching" },
            { k: "pay",        l: "Pay" },
            { k: "expenses",   l: "Expenses" },
            { k: "nigo",       l: "NIGO" },
            { k: "onboarding", l: "Onboarding" },
          ]}
        />
      </div>

      {subTab === "team"       && (() => { const T = window.PageTeam;        return T ? <T embedded/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Team Board module loading…</div>; })()}
      {subTab === "coaching"   && (() => { const C = window.CoachingManager; return C ? <C embedded/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Coaching module loading…</div>; })()}
      {subTab === "pay"        && <TodayManagerPay scopeIds={scopeIds}/>}
      {subTab === "expenses"   && <TodayManagerExpenses/>}
      {subTab === "nigo"       && <TodayManagerNigo scopeIds={scopeIds}/>}
      {subTab === "onboarding" && <TodayManagerOnboarding scopeIds={scopeIds}/>}
    </div>
  );
}

function ManagerCounterCalculator({ REPS, scopeIds }) {
  const visibleReps = REPS.filter(r => !scopeIds || scopeIds.length === 0 || scopeIds.includes(r.id));
  const [dealsTarget, setDealsTarget] = React.useState(1);
  const [contactRate, setContactRate] = React.useState(20);
  const [appointmentRate, setAppointmentRate] = React.useState(25);
  const [showRate, setShowRate] = React.useState(70);
  const [closeRate, setCloseRate] = React.useState(30);
  const today = todayDateStr();
  const rollups = AppData.REP_ACTIVITY_ROLLUPS || [];
  const todayRows = rollups.filter(row => row.date === today && visibleReps.some(r => r.id === row.repId));
  const sumRows = (key) => todayRows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  const dials = sumRows("dials") || visibleReps.reduce((sum, r) => sum + (Number(r.dials) || 0), 0);
  const contacts = sumRows("contacts");
  const appointments = sumRows("appointments") || visibleReps.reduce((sum, r) => sum + (Number(r.appts) || 0), 0);
  const presentations = sumRows("presentations");
  const deals = sumRows("deals");
  const rate = (value) => Math.max(1, Math.min(100, Number(value) || 0)) / 100;
  const actualContactRate = dials > 0 && contacts > 0 ? Math.round((contacts / dials) * 100) : null;
  const actualAppointmentRate = contacts > 0 && appointments > 0 ? Math.round((appointments / contacts) * 100) : null;
  const actualShowRate = appointments > 0 && presentations > 0 ? Math.round((presentations / appointments) * 100) : null;
  const actualCloseRate = presentations > 0 && deals > 0 ? Math.round((deals / presentations) * 100) : null;
  const projectedContactRate = actualContactRate || contactRate;
  const projectedAppointmentRate = actualAppointmentRate || appointmentRate;
  const projectedShowRate = actualShowRate || showRate;
  const projectedCloseRate = actualCloseRate || closeRate;
  const dialsPerDeal = Math.max(1, Math.round(1 / (rate(projectedContactRate) * rate(projectedAppointmentRate) * rate(projectedShowRate) * rate(projectedCloseRate))));
  const teamDialGoal = dialsPerDeal * Math.max(1, Number(dealsTarget) || 1) * Math.max(1, visibleReps.length);
  const progress = teamDialGoal > 0 ? Math.min(100, Math.round(dials / teamDialGoal * 100)) : 0;
  const createDeal = () => window.dispatchEvent(new CustomEvent("quicklog:deal"));

  return (
    <div className="panel" style={{ padding: "10px 12px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icons.Calculator size={14} style={{ color: "var(--accent-money)" }}/>
        <strong style={{ fontSize: 13.5 }}>Dialing and deal math</strong>
        <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 11 }}>What the team needs for the next deal</span>
        <button className="btn btn-primary" onClick={createDeal} style={{ padding: "5px 9px", fontSize: 11 }}><Icons.Wallet size={11}/> Create deal</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1.4fr", gap: 8, alignItems: "stretch" }}>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 7, padding: "8px 10px" }}>
          <div style={{ color: "var(--text-tertiary)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dials logged</div>
          <div className="tabular" style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{dials.toLocaleString()}</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>of {teamDialGoal.toLocaleString()} target</div>
        </div>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 7, padding: "8px 10px" }}>
          <div style={{ color: "var(--text-tertiary)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dials / deal</div>
          <div className="tabular" style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{dialsPerDeal}</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>{progress}% of team target</div>
        </div>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 7, padding: "8px 10px" }}>
          <div style={{ color: "var(--text-tertiary)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Appointments</div>
          <div className="tabular" style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{appointments.toLocaleString()}</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>{contacts.toLocaleString()} contacts · {deals.toLocaleString()} deals</div>
        </div>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 7, padding: "7px 9px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <label style={{ color: "var(--text-tertiary)", fontSize: 9.5 }}>Deals / producer<input className="text-input" type="number" min="1" value={dealsTarget} onChange={e => setDealsTarget(Math.max(1, Number(e.target.value) || 1))} style={{ width: "100%", padding: "3px 5px", marginTop: 2 }}/></label>
            <label style={{ color: "var(--text-tertiary)", fontSize: 9.5 }}>Close %<input className="text-input" type="number" min="1" max="100" value={closeRate} onChange={e => setCloseRate(e.target.value)} style={{ width: "100%", padding: "3px 5px", marginTop: 2 }}/></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 4 }}>
            {[["Contact %", contactRate, setContactRate], ["Appt %", appointmentRate, setAppointmentRate], ["Show %", showRate, setShowRate]].map(([label, value, setter]) => <label key={label} style={{ color: "var(--text-tertiary)", fontSize: 9.5 }}>{label}<input className="text-input" type="number" min="1" max="100" value={value} onChange={e => setter(e.target.value)} style={{ width: "100%", padding: "3px 5px", marginTop: 2 }}/></label>)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, color: "var(--text-tertiary)", fontSize: 10.5 }}>
        <span className="chip">Actual: {actualContactRate || contactRate}% contact</span>
        <span className="chip">{actualAppointmentRate || appointmentRate}% appointment</span>
        <span className="chip">{actualShowRate || showRate}% show</span>
        <span className="chip">{actualCloseRate || closeRate}% close</span>
      </div>
      <div style={{ height: 4, background: "var(--bg-overlay)", borderRadius: 4, overflow: "hidden", marginTop: 8 }}><div style={{ height: "100%", width: `${progress}%`, background: progress >= 100 ? "var(--accent-money)" : "var(--accent-status)", transition: "width .2s ease" }}/></div>
    </div>
  );
}

function ManagerCalendarWorkspace() {
  const connections = AppData.CONNECTIONS || [];
  const calendar = connections.find(c => ["calendly", "google_calendar", "outlook_calendar", "calendar"].includes(c.id) || /calendar|calendly/i.test(c.name || ""));
  const connected = calendar && (calendar.status === "ok" || calendar.status === "connected");
  const openConnections = () => window.gotoPage && window.gotoPage("connections");
  const schedule = () => window.dispatchEvent(new CustomEvent("appointment:open", { detail: { lead: null, kind: "appointment" } }));

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icons.Calendar size={14} style={{ color: "var(--accent-money)" }}/>
        <strong style={{ fontSize: 14 }}>Calendar and appointments</strong>
        <span className={`chip ${connected ? "chip-money" : "chip-status"}`} style={{ marginLeft: "auto", fontSize: 10 }}>{connected ? "Connected" : "Setup needed"}</span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.5, maxWidth: 700 }}>
        {connected ? `${calendar.name} is connected for your agency. Schedule a client appointment or manage the connection.` : "Connect Calendly or another calendar service so appointment links and availability are ready for your team."}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={schedule}><Icons.Calendar size={12}/> Set appointment</button>
        <button className="btn btn-ghost" onClick={openConnections}><Icons.Plug size={12}/> {connected ? "Manage calendar" : "Connect calendar"}</button>
      </div>
    </div>
  );
}

/* Downline tracker for managers. Every value is derived from the manager's
   visible downline and the hydrated production data layer. */
function ManagerActivityTracker({ REPS, scopeIds }) {
  const [selectedId, setSelectedId] = React.useState(null);
  const [range, setRange] = React.useState("today");
  const [rows, setRows] = React.useState(AppData.REP_ACTIVITY_ROLLUPS || []);
  const [loading, setLoading] = React.useState(false);
  const today = todayDateStr();
  const pipeline = AppData.PIPELINE || [];
  const policies = AppData.POLICIES || [];
  const rangeBounds = React.useMemo(() => {
    if (range === "7d") return { start: businessDateOffset(-6), end: today };
    if (range === "30d") return { start: businessDateOffset(-29), end: today };
    if (range === "mtd") return { start: `${today.slice(0, 8)}01`, end: today };
    return { start: today, end: today };
  }, [range]);
  const inScope = (rep) => !scopeIds || scopeIds.length === 0 || scopeIds.includes(rep.id);
  const visibleReps = REPS.filter(inScope);
  const selected = visibleReps.find(r => r.id === selectedId) || null;
  const trackedReps = selected ? [selected] : visibleReps;

  React.useEffect(() => {
    let cancelled = false;
    const fallbackRows = AppData.REP_ACTIVITY_ROLLUPS || [];
    setRows(fallbackRows);
    const load = async () => {
      if (!window.AppData?.mutate?.activityRollup) return;
      setLoading(true);
      try {
        const next = await window.AppData.mutate.activityRollup({
          start: rangeBounds.start,
          end: rangeBounds.end,
          repIds: scopeIds && scopeIds.length ? scopeIds : null,
        });
        if (!cancelled) setRows(next || []);
      } catch (e) {
        console.warn("[today.manager.activityRollup]", e);
        if (!cancelled && window.toast) window.toast(`Activity range failed: ${e?.message || e}`, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [rangeBounds.start, rangeBounds.end, JSON.stringify(scopeIds || [])]);

  const rowsForRep = (repId) => (rows || []).filter(row =>
    row.repId === repId
    && row.date >= rangeBounds.start
    && row.date <= rangeBounds.end
  );
  const sum = (list, key) => list.reduce((total, row) => total + (Number(row[key]) || 0), 0);

  const statsFor = (rep) => {
    const activity = rowsForRep(rep.id);
    const ownedLeads = pipeline.filter(p => p.owner === rep.id);
    const ownedPolicies = policies.filter(p => p.owner === rep.id);
    const issued = ownedPolicies.filter(p => p.status === "issued" || p.issuedAt || p.createdAt);
    const ap = sum(activity, "ap") || (range === "today" ? Number(rep.today) || 0 : 0);
    return {
      dials: sum(activity, "dials") || (range === "today" ? Number(rep.dials) || 0 : 0),
      contacts: sum(activity, "contacts"),
      leads: ownedLeads.length,
      openLeads: ownedLeads.filter(p => p.stage !== "Issued").length,
      appts: sum(activity, "appointments") || (range === "today" ? Number(rep.appts) || 0 : 0),
      presentations: sum(activity, "presentations"),
      todayAP: ap,
      mtdAP: range === "today" ? Number(rep.mtd) || 0 : ap,
      issued: sum(activity, "deals") || issued.filter(p => {
        const ts = p.createdAt || p.issuedAt || p.effectiveAt || p.submissionDate;
        return ts && String(ts).slice(0, 10) >= rangeBounds.start && String(ts).slice(0, 10) <= rangeBounds.end;
      }).length,
      issuedToday: sum(activity, "deals"),
    };
  };

  const total = trackedReps.reduce((sum, rep) => {
    const s = statsFor(rep);
    return {
      dials: sum.dials + s.dials,
      leads: sum.leads + s.leads,
      openLeads: sum.openLeads + s.openLeads,
      appts: sum.appts + s.appts,
      todayAP: sum.todayAP + s.todayAP,
      mtdAP: sum.mtdAP + s.mtdAP,
      contacts: sum.contacts + s.contacts,
      presentations: sum.presentations + s.presentations,
      issued: sum.issued + s.issued,
      issuedToday: sum.issuedToday + s.issuedToday,
    };
  }, { dials: 0, contacts: 0, leads: 0, openLeads: 0, appts: 0, presentations: 0, todayAP: 0, mtdAP: 0, issued: 0, issuedToday: 0 });

  const number = (value) => value == null ? "—" : Number(value || 0).toLocaleString();
  const money = (value) => `$${number(value)}`;
  const metrics = [
    { label: range === "today" ? "Dials today" : "Calls logged", value: number(total.dials) },
    { label: "Contacts", value: number(total.contacts) },
    { label: range === "today" ? "Appointments" : "Appointments live", value: number(total.appts) },
    { label: range === "today" ? "AP closed today" : "AP in range", value: money(total.todayAP) },
    { label: "Deals written", value: number(total.issued) },
    { label: range === "today" ? "MTD AP" : "AP total", value: money(total.mtdAP) },
  ];

  return (
    <div style={{ background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border-subtle)", padding: "11px 12px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "color-mix(in oklch, var(--accent-money) 20%, transparent)", color: "var(--accent-money)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icons.Activity size={15}/>
        </div>
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>{selected ? `${selected.name}'s activity` : "Downline activity"}</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{selected ? "Selected producer" : `${visibleReps.length} producer${visibleReps.length === 1 ? "" : "s"} in your scope`} · {range === "today" ? "Today" : range === "mtd" ? "This month" : `Last ${range === "7d" ? "7" : "30"} days`}</div>
        </div>
        {loading && <span className="chip" style={{ marginLeft: "auto", fontSize: 10 }}>Refreshing</span>}
        <select className="select" value={range} onChange={e => setRange(e.target.value)} style={{ marginLeft: "auto", minWidth: 112, padding: "5px 8px", fontSize: 11 }} aria-label="Downline activity date range">
          <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="mtd">Month to date</option>
        </select>
        {selected && <button className="btn btn-ghost" onClick={() => setSelectedId(null)} style={{ marginLeft: "auto", color: "var(--accent-money)", padding: "5px 9px", fontSize: 11 }}>All downline</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 6, marginBottom: 9 }}>
        {metrics.map(metric => (
          <div key={metric.label} style={{ background: "color-mix(in oklch, var(--accent-money) 14%, var(--bg-raised))", borderRadius: 7, padding: "7px 9px", color: "var(--text-primary)", minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div style={{ color: "var(--text-tertiary)", fontSize: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Producer detail · click a row to drill in</div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
        <div style={{ minWidth: 720 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 70px 70px 80px 90px 105px 105px", gap: 8, padding: "8px 10px", color: "var(--text-tertiary)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border-subtle)" }}>
            <div>Producer</div><div style={{ textAlign: "right" }}>Dials</div><div style={{ textAlign: "right" }}>Contacts</div><div style={{ textAlign: "right" }}>Appts</div><div style={{ textAlign: "right" }}>Deals</div><div style={{ textAlign: "right" }}>Range AP</div><div style={{ textAlign: "right" }}>MTD AP</div>
          </div>
          {visibleReps.length === 0 && <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>No producers in your downline yet.</div>}
          {visibleReps.map(rep => {
            const s = statsFor(rep);
            return (
              <button key={rep.id} onClick={() => setSelectedId(rep.id)} style={{ width: "100%", display: "grid", gridTemplateColumns: "1.8fr 70px 70px 80px 90px 105px 105px", gap: 8, alignItems: "center", padding: "9px 10px", background: selectedId === rep.id ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-raised))" : "var(--bg-raised)", color: "var(--text-primary)", border: 0, borderBottom: "1px solid var(--border-subtle)", textAlign: "left", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><Shared.Avatar rep={rep} size={20}/><span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rep.name}</span><span className={`dot dot-${rep.presence === "live" ? "live" : "idle"}`} title={rep.presence || "idle"}></span></div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-primary)" }}>{number(s.dials)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-secondary)" }}>{number(s.contacts)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-secondary)" }}>{number(s.appts)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-secondary)" }}>{number(s.issued)}</div>
                <div className="tabular" style={{ textAlign: "right", color: s.todayAP > 0 ? "var(--accent-money)" : "var(--text-secondary)" }}>{money(s.todayAP)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>{money(s.mtdAP)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TodayManagerOnboarding({ scopeIds }) {
  const { REPS, ONBOARDING_PROGRESS } = AppData;
  const inScope = (id) => !scopeIds || scopeIds.length === 0 || scopeIds.includes(id);
  
  const pending = REPS
    .filter(r => inScope(r.id))
    .map(r => {
      const p = (ONBOARDING_PROGRESS || []).find(x => x.repId === r.id) || {};
      const steps = [
        { k: "licenseSigned", l: "Lic" },
        { k: "niprVerified",  l: "NIPR" },
        { k: "bankingSet",    l: "Bank" },
        { k: "kitShipped",    l: "Kit" },
        { k: "firstDial",     l: "Dial" },
      ];
      const doneCount = steps.filter(s => p[s.k]).length;
      return { rep: r, progress: p, steps, doneCount };
    })
    .filter(x => x.doneCount < 5 || !x.progress.isVerified)
    .sort((a, b) => b.doneCount - a.doneCount);

  const handleVerify = async (repId, val) => {
    try {
      await AppData.mutate.onboardingVerify(repId, val);
      window.toast && window.toast(val ? "Rep verified for production" : "Verification removed", "success");
    } catch (e) { window.toast?.(`Verify failed: ${e?.message || e}`, "error"); console.error("[today.onboardingVerify]", e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="panel">
        <div className="panel-h"><Icons.Shield size={13}/><h3>Producer verification</h3><span className="meta">{pending.length} pending audit</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 110px 100px" }}>
            <div>Producer</div>
            <div style={{ textAlign: "center" }}>Steps</div>
            <div style={{ textAlign: "center" }}>Status</div>
            <div></div>
          </div>
          {pending.length === 0 && (
            <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              All producers in your scope are verified.
            </div>
          )}
          {pending.map(({ rep, progress, steps, doneCount }) => (
            <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 110px 100px", height: 42 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={rep} size={18}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rep.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{rep.handle}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
                {steps.map(s => (
                  <div key={s.k} title={s.l} style={{ 
                    width: 18, height: 18, borderRadius: 3, fontSize: 8, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: progress[s.k] ? "var(--accent-money)" : "var(--bg-raised)",
                    color: progress[s.k] ? "white" : "var(--text-quaternary)"
                  }}>{s.l[0]}</div>
                ))}
              </div>
              <div style={{ textAlign: "center" }}>
                <span className={`chip ${progress.isVerified ? "chip-money" : "chip-status"}`} style={{ fontSize: 10 }}>
                  {progress.isVerified ? "Verified" : `${doneCount}/5 steps`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className={`btn ${progress.isVerified ? "btn-ghost" : "btn-primary"}`} 
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  disabled={doneCount < 3}
                  onClick={() => handleVerify(rep.id, !progress.isVerified)}>
                  {progress.isVerified ? "Revoke" : "Verify"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Spend congruency strip — every value computed from real tables.
   Empty cells render `.koino-empty` mono tag instead of fake numbers
   per the 2026-05-12 anti-theater directive.
   Cited sources per chip:
     Team CPA today     → SUM(agency_expenses today, kind=lead_spend) / today's leads
     Lead spend today   → SUM(agency_expenses today, kind=lead_spend)
     Comp paid today    → SUM(commissions today, scope)
     Open NIGO          → COUNT(nigos status=open, scope) */
function TodaySpendStrip({ scopeIds, teamToday }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const expenses = (AppData.AGENCY_EXPENSES || []);
  const todayExpenses = expenses.filter(e => (e.paidAt || e.createdAt || "").startsWith(todayISO));
  const leadSpendCents = todayExpenses
    .filter(e => e.kind === "lead_spend")
    .reduce((a, e) => a + (e.amountCents || 0), 0);

  const pipeline = (AppData.PIPELINE || []);
  const inScope = (row) => !scopeIds || scopeIds.length === 0 || !row.owner || scopeIds.includes(row.owner);
  const todaysLeads = pipeline.filter(p => inScope(p) && (p.createdAt || "").startsWith(todayISO)).length;
  const cpa = todaysLeads > 0 ? Math.round(leadSpendCents / 100 / todaysLeads) : null;

  const commissions = (AppData.COMMISSIONS || []);
  const compPaidCents = commissions
    .filter(c => (c.paidAt || c.createdAt || "").startsWith(todayISO))
    .filter(c => inScope(c))
    .reduce((a, c) => a + (c.amount || 0), 0);

  const openNigos = (AppData.NIGOS || []).filter(n => {
    if (n.status === "resolved" || n.status === "wont_fix" || n.status === "fixed") return false;
    return inScope({ owner: n.assignedTo });
  }).length;

  // Per Ian's anti-theater rule: empty cells render `// no data` mono marker.
  const empty = <span className="koino-empty">no data</span>;
  return (
    <SpendStrip items={[
      { l: "Team CPA today",   v: cpa != null ? `$${cpa}` : empty,                                                              tone: cpa != null ? "money" : "" },
      { l: "Lead spend today", v: leadSpendCents > 0 ? `$${Math.round(leadSpendCents/100).toLocaleString()}` : empty },
      { l: "Comp paid today",  v: compPaidCents > 0 ? `$${Math.round(compPaidCents).toLocaleString()}` : empty,                  tone: compPaidCents > 0 ? "money" : "" },
      { l: "Open NIGO",        v: openNigos > 0 ? String(openNigos) : empty,                                                     tone: openNigos > 0 ? "warn" : "" },
    ]}/>
  );
}

/* Pulse sub-tab — live producer table + coaching cards + stuck-deal "Needs me".
   Stuck-deal panel REPLACES the previous hardcoded "Robert Mendez App In..."
   row set with a real query against AppData.PIPELINE filtered to downline +
   days-in-stage > 3 + stage in ["App In", "Quoted"]. */
/* Pay sub-tab — today's commissions for the manager's downline. Pulls from
   buildStatement() (POLICIES + COMMISSIONS) and filters to rows dated today
   or marked status=pending. Empty state when no comp activity in scope. */
function TodayManagerPay({ scopeIds }) {
  // buildStatement lives in page-extras.jsx (PageCommissions). Compute on the
  // fly here against the same source tables so the Today panel doesn't depend
  // on PageCommissions being loaded first.
  const policies = (AppData.POLICIES || []);
  const commissions = (AppData.COMMISSIONS || []);
  const inScope = (row) => !scopeIds || scopeIds.length === 0 || !row.owner || scopeIds.includes(row.owner);

  const todayISO = new Date().toISOString().slice(0, 10);
  const todaysPolicies = policies
    .filter(inScope)
    .filter(p => (p.issuedAt || p.createdAt || "").startsWith(todayISO));
  const todayBookedCents = todaysPolicies.reduce((a, p) => a + (p.expectedCommission || 0), 0);
  const todayPaidCents = commissions
    .filter(c => inScope(c))
    .filter(c => (c.paidAt || "").startsWith(todayISO))
    .reduce((a, c) => a + (c.amount || 0), 0);
  const pendingCents = commissions
    .filter(c => inScope(c))
    .filter(c => !c.paidAt)
    .reduce((a, c) => a + (c.amount || 0), 0);

  // Per-rep summary (today only) for the table.
  const repById = Object.fromEntries((AppData.REPS || []).map(r => [r.id, r]));
  const byRep = new Map();
  todaysPolicies.forEach(p => {
    const cur = byRep.get(p.owner) || { booked: 0, count: 0 };
    cur.booked += (p.expectedCommission || 0);
    cur.count += 1;
    byRep.set(p.owner, cur);
  });
  const rows = Array.from(byRep.entries()).map(([ownerId, v]) => ({
    rep: repById[ownerId],
    booked: v.booked,
    count: v.count,
  })).sort((a, b) => b.booked - a.booked);

  // The duplicate page-h block that lived here referenced `aep`, `live`,
  // `REPS`, `totalDials`, `teamToday` — none in scope for this component, so
  // rendering the Pay sub-tab threw "aep is not defined" the moment Today's
  // outer page-h wasn't there to swallow it. Outer TodayManager already
  // renders the agency/AEP title and the Standup notes / Power Hour buttons
  // (see line ~920), so this nested header was both dead and crashing.
  // Dropped 2026-05-23 along with the Team Board sub-tab fold-in.
  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 10 }}>
        <Shared.KpiCard label="Booked today (comp)" prefix="$" value={Math.round(todayBookedCents).toLocaleString()} sub={`${todaysPolicies.length} polic${todaysPolicies.length === 1 ? "y" : "ies"} issued`}/>
        <Shared.KpiCard label="Paid today" prefix="$" value={Math.round(todayPaidCents).toLocaleString()} sub={todayPaidCents > 0 ? "advances + as-earned" : "no advances posted"}/>
        <Shared.KpiCard label="Pending payouts" prefix="$" value={Math.round(pendingCents).toLocaleString()} sub="across scope"/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Today's writes · by producer</h3><span className="meta">{rows.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 80px 120px 100px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Policies</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected comp</div>
            <div></div>
          </div>
          {rows.length === 0 && (
            <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.5 }}>
              No writes booked today in your downline.<br/>
              <a href="#" onClick={(e) => { e.preventDefault(); if (window.gotoPage) window.gotoPage("pay"); }} style={{ color: "var(--accent-money)" }}>Open full Pay workspace</a> for the historical view.
            </div>
          )}
          {rows.map(({ rep, booked, count }) => (
            <div key={rep?.id || "unknown"} className="row" style={{ gridTemplateColumns: "1.6fr 80px 120px 100px", height: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {rep && <Shared.Avatar rep={rep} size={18}/>}
                <span style={{ fontWeight: 500, fontSize: 12 }}>{rep?.name || "—"}</span>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{count}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>${Math.round(booked).toLocaleString()}</div>
              <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5 }} onClick={() => { if (window.gotoPage) window.gotoPage("pay"); }}>Drill</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* Expenses sub-tab — today's agency_expenses (migration 0017) + reimbursement
   status. RLS confines the query to the viewer's agency_id automatically. */
function TodayManagerExpenses() {
  const [rows, setRows] = React.useState(null); // null = loading
  const [err, setErr] = React.useState(null);
  const me = (window.me && window.me()) || null;

  React.useEffect(() => {
    if (!me?.agency_id) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { if (!cancelled) setRows([]); return; }
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      try {
        const { data, error } = await sb.from("agency_expenses")
          .select("id, kind, paid_by, amount_cents, vendor, memo, paid_at, status, created_at")
          .eq("agency_id", me.agency_id)
          .gte("created_at", startOfDay.toISOString())
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (e) {
        if (!cancelled) { setErr(e.message || String(e)); setRows([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [me?.agency_id]);

  const totalCents = (rows || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const leadSpendCents = (rows || []).filter(r => r.kind === "lead_spend").reduce((a, r) => a + (r.amount_cents || 0), 0);
  const pendingReimburse = (rows || []).filter(r => r.status === "pending" || r.status === "submitted");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Shared.KpiCard label="Spent today" prefix="$" value={Math.round(totalCents/100).toLocaleString()} sub={`${(rows || []).length} entr${(rows || []).length === 1 ? "y" : "ies"}`}/>
        <Shared.KpiCard label="Lead spend today" prefix="$" value={Math.round(leadSpendCents/100).toLocaleString()} sub="paid lead acquisition"/>
        <Shared.KpiCard label="Pending reimburse" value={pendingReimburse.length} sub={pendingReimburse.length > 0 ? "manager review" : "clear"}/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Today's expenses</h3><span className="meta">{(rows || []).length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "100px 1fr 1fr 100px 90px" }}>
            <div>Kind</div><div>Vendor / memo</div><div>Paid by</div>
            <div className="tabular" style={{ textAlign: "right" }}>Amount</div>
            <div>Status</div>
          </div>
          {rows === null && <div style={{ padding: 22, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>Loading…</div>}
          {rows && rows.length === 0 && (
            <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.5 }}>
              {err ? <>Could not load: {err}</> : <>No expenses logged today.<br/>
              <a href="#" onClick={(e) => { e.preventDefault(); if (window.gotoPage) window.gotoPage("expenses"); }} style={{ color: "var(--accent-money)" }}>Open full Expenses workspace</a> to add lead spend, reimbursements, or carrier-tool fees.</>}
            </div>
          )}
          {rows && rows.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "100px 1fr 1fr 100px 90px", height: 32 }}>
              <div><span className="chip" style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{r.kind}</span></div>
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor || r.memo || "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.paid_by || "—"}</div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500, fontFamily: "var(--font-mono)" }}>${Math.round((r.amount_cents || 0) / 100).toLocaleString()}</div>
              <div><span className="chip" style={{ fontSize: 9.5 }}>{r.status || "—"}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* NIGO sub-tab — carrier returns scoped to the manager's downline.
   Sources AppData.NIGOS (live) when present, falls back to demo seed only
   for is_demo agencies. Same projection logic page-ops-depth.jsx uses, just
   condensed for the Today landing. */
function TodayManagerNigo({ scopeIds }) {
  const nigos = (AppData.NIGOS || []);
  const reasonById = new Map((AppData.NIGO_REASONS || []).map(r => [r.id, r]));
  const leadById   = new Map((AppData.PIPELINE || []).map(l => [l.id, l]));
  const policyById = new Map((AppData.POLICIES || []).map(p => [p.id, p]));
  const repById    = Object.fromEntries((AppData.REPS || []).map(r => [r.id, r]));

  const scoped = nigos
    .filter(n => n.status !== "resolved" && n.status !== "wont_fix")
    .filter(n => {
      const owner = n.assignedTo || (n.pipelineId && leadById.get(n.pipelineId)?.owner);
      if (!scopeIds || scopeIds.length === 0) return true;
      return !owner || scopeIds.includes(owner);
    });

  const totalRiskCents = scoped.reduce((a, n) => {
    const pol = n.policyId ? policyById.get(n.policyId) : null;
    const lead = n.pipelineId ? leadById.get(n.pipelineId) : null;
    return a + ((pol?.ap || lead?.ap || 0) * 100);
  }, 0);

  const setStatus = async (id, next) => {
    try {
      await AppData.mutate.nigoStatus(id, next);
      window.toast && window.toast(`NIGO marked ${next}`, "success");
    } catch (e) { window.toast?.(`NIGO update failed: ${e?.message || e}`, "error"); console.error("[today.nigoStatus]", e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Shared.KpiCard hero label="Open NIGOs" value={scoped.length} sub={totalRiskCents > 0 ? `$${Math.round(totalRiskCents/100).toLocaleString()} AP at risk` : "clear"}/>
        <Shared.KpiCard label="P0 same-day" value={scoped.filter(n => (reasonById.get(n.reasonId)?.severity === "critical")).length}/>
        <Shared.KpiCard label="Carrier reviewing" value={scoped.filter(n => n.status === "in_review").length}/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>NIGO queue</h3><span className="meta">scope: downline</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 80px 100px 110px" }}>
            <div>Lead</div><div>Reason</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP risk</div>
            <div>Owner</div><div></div>
          </div>
          {scoped.length === 0 && (
            <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.5 }}>
              No open NIGOs in your downline. Clean.<br/>
              <a href="#" onClick={(e) => { e.preventDefault(); if (window.gotoPage) window.gotoPage("nigo"); }} style={{ color: "var(--accent-money)" }}>Open full NIGO workspace</a> for history + chargeback view.
            </div>
          )}
          {scoped.slice(0, 8).map(n => {
            const reason = n.reasonId ? reasonById.get(n.reasonId) : null;
            const lead = n.pipelineId ? leadById.get(n.pipelineId) : null;
            const pol = n.policyId ? policyById.get(n.policyId) : null;
            const apRisk = pol?.ap || lead?.ap || 0;
            const ownerId = n.assignedTo || lead?.owner;
            const owner = ownerId ? repById[ownerId] : null;
            return (
              <div key={n.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 80px 100px 110px", height: 34 }}>
                <div style={{ fontWeight: 500, fontSize: 12 }}>{lead?.lead || (pol ? `Policy ${pol.id?.slice(0, 6)}` : "—")}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{reason?.label || n.notes || "Reason unspecified"}</div>
                <div className="tabular" style={{ textAlign: "right", color: apRisk > 0 ? "var(--state-warning)" : "var(--text-quaternary)", fontFamily: "var(--font-mono)" }}>{apRisk > 0 ? `$${apRisk.toLocaleString()}` : "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {owner && <Shared.Avatar rep={owner} size={16}/>}
                  <span style={{ fontSize: 11 }}>{owner?.name?.split(" ")[0] || "—"}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => setStatus(n.id, "in_review")}>Review</button>
                  <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10, color: "var(--accent-money)" }} onClick={() => setStatus(n.id, "resolved")}>Fixed</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───── Owner view ───────────────────────────────────────────────────────── */
function TodayOwner() {
  // GAP-OD1: Owner Today now derives from live tables instead of hardcoded.
  const { REPS, COMMISSIONS, POLICIES, CLAWBACKS } = AppData;
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const agencyName = meIdent?.agency_name || "Demo Agency";

  const today = todayDateStr();
  const monthPrefix = today.slice(0, 7);

  const teamToday = REPS.reduce((a, r) => a + (r.today || 0), 0);
  const teamMTD   = REPS.reduce((a, r) => a + (r.mtd || 0),   0);

  // Override revenue MTD: commissions where kind === 'override' and earned_at in this month
  const overrideMTD = (COMMISSIONS || []).filter(c =>
    c.kind === "override" && (c.earnedAt || "").startsWith(monthPrefix)
  ).reduce((s, c) => s + (c.amount || 0), 0);

  // Anomalies = open NIGOs (real count, replaces "4" literal)
  const anomalies = (AppData.NIGOS || []).filter(n => n.status === "open" || n.status === "in_review").length;

  // Lead spend today: sum over lead_sources × today's touchpoints
  const todayTouches = (AppData.TOUCHPOINTS || []).filter(t => (t.occurredAt || "").startsWith(today));
  const leadSourceById = new Map((AppData.LEAD_SOURCES || []).map(s => [s.id, s]));
  const leadSpendToday = todayTouches.reduce((s, t) => s + ((leadSourceById.get(t.sourceId)?.costPerLead) || 0), 0);
  // ROI: today commission / today lead spend (guard divide-by-zero)
  const roiToday = leadSpendToday > 0 ? (teamToday / leadSpendToday).toFixed(1) + "x" : "—";

  const liveCount = REPS.filter(r => r.presence === "live").length;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Today · {agencyName} <AnnouncementChip/></div>
          <div className="page-sub">{REPS.length} producers · ${teamToday.toLocaleString()} AP closed today · ${teamMTD.toLocaleString()} MTD</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (window.gotoPage) window.gotoPage("performance");
              window.toast && window.toast("Weekly audit · standings + tiering + forecast", "info");
            }}
          ><Icons.Calendar size={13}/> Audit week</button>
          <button
            className="btn btn-primary"
            onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: "What is the most important thing for the team to focus on this week?", context: "Owner · weekly focus" } }))}
          ><Icons.Sparkles size={13}/> Ask the Book</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Lead spend ROI today",  v: roiToday, tone: "money" },
        { l: "Lead spend today",       v: leadSpendToday > 0 ? `$${leadSpendToday.toLocaleString()}` : "$0" },
        { l: "Override pool today",    v: `$${(teamToday * 0.22).toFixed(0)}`, tone: "money" },
        { l: "Anomalies open",         v: String(anomalies), tone: anomalies > 0 ? "warn" : "money" },
      ]}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="AP closed today" prefix="$" value={teamToday.toLocaleString()} sub={`MTD: $${teamMTD.toLocaleString()}`} trend={teamToday > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Override revenue MTD" prefix="$" value={overrideMTD > 0 ? overrideMTD.toLocaleString() : "—"} sub="from commissions.kind=override"/>
        <Shared.KpiCard label="Active producers" value={`${liveCount}/${REPS.length}`}/>
      </div>

      <PredictiveCards scope="org"/>
      <ForecastStrip scope="org"/>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.TrendingUp size={13}/><h3>Live revenue · last hour</h3></div>
          <div style={{ padding: 14 }}>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none">
              {(() => {
                const pts = Array.from({ length: 60 }).map((_, i) => 50 + Math.sin(i * 0.4) * 18 + (i > 40 ? (i - 40) * 1.4 : 0));
                const max = Math.max(...pts), min = Math.min(...pts);
                const path = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / 59) * 600} ${100 - ((v - min) / (max - min)) * 80}`).join(" ");
                const fill = path + ` L 600 100 L 0 100 Z`;
                return <><path d={fill} fill="var(--accent-money)" opacity="0.12"/><path d={path} stroke="var(--accent-money)" strokeWidth="1.6" fill="none"/></>;
              })()}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
              <span>−60m</span><span>−45m</span><span>−30m</span><span>−15m</span><span>now</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Anomalies</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { sev: "warn",   t: "Persistency drift",  b: "FE 13-mo · Tampa downline · -3.2pts" },
                { sev: "danger", t: "NIGO spike",          b: "Aetna SRC · 4 returned · age verification" },
                { sev: "info",   t: "Lead source ROI",    b: "FB T65 v3 creative · -22% CPL" },
                { sev: "warn",   t: "Carrier cert lag",    b: "3 producers under 80% on appointment renewals" },
              ].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 8, borderRadius: 6, background: "var(--bg-raised)" }}>
                  <span className={`dot dot-${x.sev === "danger" ? "danger" : x.sev === "warn" ? "warn" : "live"}`} style={{ marginTop: 5 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.t}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{x.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Recruiting today</h3></div>
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-secondary)" }}>New applicants</span>
                <span className="tabular" style={{ fontWeight: 600 }}>14</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "var(--text-secondary)" }}>Contracted today</span>
                <span className="tabular" style={{ fontWeight: 600, color: "var(--accent-money)" }}>2</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "var(--text-secondary)" }}>Cost / applicant</span>
                <span className="tabular" style={{ fontWeight: 600 }}>$28</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageToday = PageToday;
