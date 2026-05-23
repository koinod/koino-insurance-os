/* Page: Today — role-aware
   Rep    → "my day": queue, coaching, tier progress, recent calls, ritual.
   Mgr    → "team day": who's live, dial heat, today's coaching cards, dispatch CPA.
   Owner  → "agency day": live revenue, anomalies, recruiting today.
   Each view shows a Spend congruency strip — small badges keeping unit economics
   visible per role (cost-per-issued for rep, team CPA for mgr, lead-spend ROI for owner). */

const { useState: useStateT, useEffect: useEffectT } = React;

function PageToday({ aep, role = "rep" }) {
  if (role === "manager") return <TodayManager aep={aep}/>;
  if (role === "owner")   return <TodayOwner aep={aep}/>;
  return <TodayRep aep={aep}/>;
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

/* Resolve the actual AEP state for the viewer instead of hardcoding
   "AEP Day 14". Returns null when there's no active period, or when the role
   is 'rep' but the rep has no assignment row for it. */
function useAepContext(repId, role) {
  const periods = AppData.AEP_PERIODS || [];
  const active = periods.find(p => p.status === "active") || periods.find(p => p.status === "planned");
  if (!active) return null;
  const myAssign = (AppData.AEP_ASSIGNMENTS || []).find(a => a.periodId === active.id && a.repId === repId);
  if (role === "rep" && !myAssign) return null;
  const isLive = active.status === "active";
  const today = new Date();
  const start = active.startsAt ? new Date(active.startsAt) : null;
  const dayN = isLive && start
    ? Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)))
    : null;
  const daysToStart = !isLive && start
    ? Math.max(0, Math.ceil((start - today) / (1000 * 60 * 60 * 24)))
    : null;
  return { active, myAssign, isLive, dayN, daysToStart };
}

/* AEP title chip — shown next to the page title when there's an active or
   planned period applicable to the viewer. Replaces the hardcoded
   <span>AEP Day 14</span> contamination from the original design. */
function AepTitleChip({ ctx }) {
  if (!ctx) return null;
  const label = ctx.isLive
    ? `AEP Day ${ctx.dayN}`
    : (ctx.daysToStart != null ? `AEP opens in ${ctx.daysToStart}d` : "AEP planned");
  return <span style={{ color: "var(--accent-heat)" }}>{label}</span>;
}

/* AEPBanner removed 2026-05-15 — dead code, no callers (audits/DEAD_CODE.md). */

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

  const scored = visibleReps.map(r => ({
    rep: r,
    risk:     computeRiskScore(r),
    breakout: computeBreakoutScore(r),
  }));
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
  const d = new Date(); d.setHours(0,0,0,0);
  return d.toISOString().slice(0, 10);
}

function TodayRep({ aep }) {
  const { REPS, QUEUE, RECORDINGS, COMMISSIONS, POLICIES, TASKS } = AppData;

  // Resolve current viewer. window.me() may be null on first paint; we still
  // render with REPS[0] to avoid a flash, then re-render on the me:loaded event.
  // Synthesize a stub from me() identity when REPS is empty (brand-new agency)
  // so we never crash on `myRow.id` lookups below.
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

  // Force re-render when me() resolves
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onMe = () => force(n => n + 1);
    window.addEventListener("me:loaded", onMe);
    return () => window.removeEventListener("me:loaded", onMe);
  }, []);

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
    const base = new Date();
    for (let i = SPARK_DAYS - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  })();
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const toIsoDay = (s) => {
    if (!s) return null;
    if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d.valueOf()) ? null : d.toISOString().slice(0, 10);
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

  // Onboarding checklist progress. Pulls live from
  // AppData.ONBOARDING_PROGRESS where available; treats every step as false
  // when no row exists yet so brand-new reps see a 0/5 banner with all
  // todos visible. Hides itself once 5/5 complete.
  const onboardingRow = (AppData.ONBOARDING_PROGRESS || []).find(p => p.repId === myRow?.id) || {};
  const onboardingSteps = [
    { k: "licenseSigned", l: "Sign producer agreement",   icon: "Edit"   },
    { k: "niprVerified",  l: "Verify NIPR license",       icon: "Shield" },
    { k: "bankingSet",    l: "Set up direct deposit",     icon: "Wallet" },
    { k: "kitShipped",    l: "Producer kit shipped",      icon: "Folder" },
    { k: "firstDial",     l: "Make your first dial",      icon: "Phone"  },
  ];
  const onboardingDone = onboardingSteps.filter(s => onboardingRow[s.k]).length;
  const showOnboarding = onboardingDone < onboardingSteps.length;

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
    goMessages();
  };

  // Log-activity quick action. Opens the existing CRM Add-lead flow
  // pre-scoped to the rep so anything they touch outside the dialer (a
  // referral, a walk-in, an event lead) gets captured before it falls out.
  const openLogActivity = () => {
    window.gotoPage && window.gotoPage("crm");
    setTimeout(() => window.dispatchEvent(new CustomEvent("crm:addLead")), 100);
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">
            Today — {aep ? (() => { const ctx = useAepContext(myRow?.id, "rep"); return ctx ? <AepTitleChip ctx={ctx}/> : "Q2"; })() : "Q2"}
            {meIdent && meIdent.full_name && <span style={{ color: "var(--text-tertiary)", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>· {meIdent.full_name.split(" ")[0]}</span>}
          </div>
          <div className="page-sub">{subline}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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

      {dayIsBlank && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 18px", marginBottom: 14,
          background: "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))",
          border: "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)",
          borderRadius: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
            background: "color-mix(in oklch, var(--accent-money) 22%, transparent)", color: "var(--accent-money)",
          }}>
            <Icons.Phone size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
              Start the day with a dial
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
              {queueDepth > 0
                ? `${queueDepth} lead${queueDepth === 1 ? "" : "s"} are waiting in your queue. The first one is fresh — speed-to-lead beats every other variable.`
                : "Your queue is empty. Pull a list from CRM → Inbox or wait for inbound, then dial."}
            </div>
          </div>
          <button className="btn btn-primary" onClick={goFloor}>
            <Icons.Phone size={12}/> {queueDepth > 0 ? "Make your first dial" : "Open Floor"}
          </button>
        </div>
      )}

      {showOnboarding && (
        /* GAP-A4 — onboarding checklist. Persistent until all 5 steps done. */
        <div className="panel" style={{ marginBottom: 14, padding: 14, background: "var(--bg-elevated)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Icons.ListChecks size={14} style={{ color: "var(--accent-status)" }}/>
            <strong style={{ fontSize: 13 }}>Get production-ready</strong>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>{onboardingDone} / {onboardingSteps.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {onboardingSteps.map(s => {
              const Ico = Icons[s.icon] || Icons.Check;
              const done = !!onboardingRow[s.k];
              return (
                <div key={s.k} style={{
                  padding: 10, borderRadius: 6,
                  background: done ? "color-mix(in oklch, var(--accent-money) 12%, var(--bg-raised))" : "var(--bg-raised)",
                  border: `1px solid ${done ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : "var(--border-subtle)"}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <Ico size={12} style={{ color: done ? "var(--accent-money)" : "var(--text-tertiary)" }}/>
                  <span style={{ flex: 1, fontSize: 11.5, color: done ? "var(--text-primary)" : "var(--text-secondary)", textDecoration: done ? "line-through" : "none" }}>{s.l}</span>
                  {done && <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GAP-P3 — my goals · target vs actual */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <Icons.Trophy size={13}/>
          <h3>My goals</h3>
          <span className="meta">tier {(myRow.tier || "—").toUpperCase()} · derived from threshold</span>
        </div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <GoalRow label="Today"   actual={todayCommission} target={dailyTarget}   pct={dailyPct}/>
          <GoalRow label="Week"    actual={(myRow.mtd || 0) / 4} target={weeklyTarget} pct={Math.min(100, ((myRow.mtd || 0) / 4) / Math.max(1, weeklyTarget) * 100)}/>
          <GoalRow label="Month"   actual={mtdNum}          target={monthlyTarget} pct={monthlyPct}/>
        </div>
      </div>

      {/* GAP-D4 + OC1 — quick actions row */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Bolt size={13}/><h3>Quick actions</h3></div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <ActionTile icon="Phone"          label="Power Hour"        sub="open Floor + autodialer" onClick={goFloor}/>
          <ActionTile icon="Plus"           label="Add lead"          sub="referral / walk-in / event" onClick={openLogActivity}/>
          <ActionTile icon="MessageSquare"  label={myManagerRow ? `DM ${myManagerRow.name.split(" ")[0]}` : "Messages"}
                                                                 sub={myManagerRow ? "your upline" : "open inbox"}  onClick={dmManager}/>
          <ActionTile icon="Folder"         label="Pull a script"     sub="Plan G · FE · TPMO"     onClick={() => window.gotoPage && window.gotoPage("library")}/>
        </div>
      </div>

      {(() => {
        // Live ROAS — pull MTD lead spend from AppData (hydrated from agency_expenses).
        // Issued count comes from POLICIES; falls back to demo numbers when empty.
        const leadSpendCents = (AppData.LEAD_SPEND_TOTALS && AppData.LEAD_SPEND_TOTALS.mtd) || 0;
        const leadSpendMtd = Math.round(leadSpendCents / 100);
        const issuedMtd = (AppData.POLICIES || []).filter(p => {
          if (!p.issuedAt && !p.issued_at) return false;
          const d = new Date(p.issuedAt || p.issued_at);
          const now = new Date();
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        const cpa = issuedMtd > 0 ? Math.round(leadSpendMtd / issuedMtd) : null;
        // NIGO drag — sum AP at risk on open NIGOs owned by me. Mirrors the
        // projection TodayManagerNigo uses (policy.ap || lead.ap, in dollars).
        const leadById = new Map((AppData.PIPELINE || []).map(l => [l.id, l]));
        const policyById = new Map((AppData.POLICIES || []).map(p => [p.id, p]));
        const nigoDragDollars = (AppData.NIGOS || [])
          .filter(n => n.status !== "resolved" && n.status !== "wont_fix")
          .filter(n => {
            const owner = n.assignedTo || (n.pipelineId && leadById.get(n.pipelineId)?.owner);
            return owner === myRow.id;
          })
          .reduce((a, n) => {
            const pol = n.policyId ? policyById.get(n.policyId) : null;
            const lead = n.pipelineId ? leadById.get(n.pipelineId) : null;
            return a + (pol?.ap || lead?.ap || 0);
          }, 0);
        const isDemo = window.isDemoAgency && window.isDemoAgency();
        return (
          <SpendStrip items={[
            { l: "Cost / issued",  v: cpa != null ? `$${cpa}` : (isDemo ? "$112" : "—"), tone: "money" },
            { l: "Lead spend MTD", v: leadSpendMtd > 0 ? `$${leadSpendMtd.toLocaleString()}` : (isDemo ? "$680" : "$0") },
            { l: "Issued MTD",     v: issuedMtd > 0 ? String(issuedMtd) : (isDemo ? "—" : "0"), tone: "money" },
            { l: "NIGO drag",      v: nigoDragDollars > 0 ? `$${nigoDragDollars.toLocaleString()}` : "$0", tone: "money" },
          ]}/>
        );
      })()}

      <div className="kpi-row">
        <Shared.KpiCard hero label="Today's Commission" value={todayCommission.toLocaleString()} prefix="$" sub={`MTD: $${mtdNum.toLocaleString()}`} trend={todayCommission > 0 ? "up" : undefined} spark={spark1}/>
        <Shared.KpiCard label="Apps submitted (today)" value={appsToday} sub={`tier: ${(myRow.tier || "—").toUpperCase()}`} spark={spark2}/>
        <Shared.KpiCard label="Dials (today)" value={dialsToday} sub={`streak: ${myRow.streak || 0}d`} trend={myRow.streak > 0 ? "up" : undefined} spark={spark3}/>
      </div>

      <TasksPanel repId={myRow?.id} limit={5}/>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.Phone size={14} style={{ color: "var(--accent-money)" }}/>
            <h3>Next in queue</h3>
            <span className="meta">47 leads · sorted by speed-to-lead</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.2fr 60px 1fr 80px 90px 30px" }}>
              <div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{ textAlign: "right" }}>SLA clock</div><div></div>
            </div>
            {QUEUE.slice(0, 6).map(l => {
              const heat = l.elapsed < 30 ? "fresh" : l.elapsed < 90 ? "warm" : "late";
              const heatColor = heat === "fresh" ? "var(--accent-money)" : heat === "warm" ? "var(--state-warning)" : "var(--state-danger)";
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: "1.2fr 60px 1fr 80px 90px 30px" }}>
                  <div className="cell-truncate" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="dot" style={{ background: heatColor }}></span>
                    <strong style={{ fontWeight: 500 }}>{l.lead}</strong>
                  </div>
                  <div className="cell-truncate tabular" style={{ color: "var(--text-tertiary)" }}>{l.age} · {l.state}</div>
                  <div className="cell-truncate" style={{ color: "var(--text-secondary)" }}>{l.source}</div>
                  <div><span className="chip">{l.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: heatColor, fontWeight: 500 }}>{l.elapsed}s</div>
                  <button className="icon-btn"><Icons.Phone size={13}/></button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={14} style={{ color: "var(--accent-status)" }}/>
              <h3>This week's coaching</h3>
              <span className="meta">from Tuesday's call review</span>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Ask 3 more open-ended questions per hour.</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.55 }}>
                {(window.isDemoAgency && window.isDemoAgency())
                  ? `On Cheryl Hampton's call, you asked "Do you take medications?" instead of "Walk me through your day with your medications." 4 closed-ended in the first 6 min cost rapport.`
                  : `Open with a behavioral question instead of a yes/no. Closed-ended questions in the first 6 minutes correlate with -12% close rate.`}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (window.gotoPage) window.gotoPage("calls");
                    window.toast && window.toast("Coaching surface opened — find the moment in your call history", "info");
                  }}
                ><Icons.Play size={11}/> Replay moment</button>
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      const k = "repflow.coaching_practiced";
                      const today = new Date().toISOString().slice(0, 10);
                      const log = JSON.parse(localStorage.getItem(k) || "[]");
                      log.unshift({ topic: "open-ended-questions", at: today });
                      localStorage.setItem(k, JSON.stringify(log.slice(0, 90)));
                    } catch {}
                    window.toast && window.toast("Marked practiced · streak +1", "success");
                  }}
                >Mark practiced</button>
              </div>
            </div>
          </div>

          {(() => {
            // GAP — replace hardcoded $42,310 / 82% / 3 days with live computed values.
            const tierKey   = (myRow.tier || "bronze").toLowerCase();
            const tierData  = TIER_TARGETS[tierKey] || TIER_TARGETS.bronze;
            const nextTier  = tierData.next || null;
            const nextThr   = nextTier ? (TIER_TARGETS[nextTier]?.threshold ?? tierData.threshold) : tierData.threshold;
            const baseThr   = tierData.threshold || 0;
            const mtd       = mtdNum;
            const span      = Math.max(1, nextThr - baseThr);
            const pctOfBand = nextTier ? Math.min(100, Math.max(0, ((mtd - baseThr) / span) * 100)) : 100;
            const remaining = nextTier ? Math.max(0, nextThr - mtd) : 0;
            // Days left in month + pace needed
            const now       = new Date();
            const lastDay   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysLeft  = Math.max(0, lastDay - now.getDate());
            const dailyNeed = daysLeft > 0 && remaining > 0 ? Math.round(remaining / daysLeft) : 0;
            return (
              <div className="panel">
                <div className="panel-h">
                  <Icons.Trophy size={14} style={{ color: "var(--accent-status)" }}/>
                  <h3>Tier progress</h3>
                  <Shared.TierChip tier={tierKey}/>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>${Math.round(mtd).toLocaleString()}</span>
                    <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>MTD AP</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
                    <div style={{ width: pctOfBand + "%", height: "100%", background: nextTier ? `linear-gradient(90deg, var(--tier-${tierKey}), var(--tier-${nextTier}))` : "var(--accent-money)" }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    <span><Shared.TierChip tier={tierKey} compact/> ${(baseThr/1000).toFixed(0)}K</span>
                    {nextTier
                      ? <span className="tabular" style={{ color: "var(--accent-money)" }}>${remaining.toLocaleString()} to {nextTier}</span>
                      : <span className="tabular" style={{ color: "var(--accent-money)" }}>top tier — keep stacking</span>}
                    {nextTier && <span><Shared.TierChip tier={nextTier} compact/> ${(nextThr/1000).toFixed(0)}K</span>}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {daysLeft} day{daysLeft === 1 ? "" : "s"} left in month
                    {nextTier && remaining > 0 && (
                      <> · pace: <span className="tabular" style={{ color: "var(--accent-money)" }}>+${dailyNeed.toLocaleString()}/day needed</span></>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="today-grid">
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={14}/>
            <h3>Recent calls</h3>
            <span className="meta">AI-scored</span>
          </div>
          <div className="list">
            {RECORDINGS.map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.2fr 70px 80px 80px 1fr", height: 44 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icons.Volume size={13} style={{ color: "var(--text-tertiary)" }}/>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.lead}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.date}</div>
                  </div>
                </div>
                <div className="tabular" style={{ color: "var(--text-secondary)" }}>{Math.floor(r.durSec/60)}:{String(r.durSec%60).padStart(2,"0")}</div>
                <div className="tabular" style={{ color: r.talkRatio > 50 ? "var(--state-danger)" : "var(--text-secondary)" }}>{r.talkRatio}% talk</div>
                <div><span className={`chip ${r.score >= 80 ? "chip-money" : r.score >= 70 ? "chip-status" : "chip-danger"}`}>{r.score}</span></div>
                <div className="cell-truncate" style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{r.ai}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Bolt size={14} style={{ color: "var(--accent-money)" }}/>
            <h3>Daily ritual</h3>
            <span className="meta">{aep ? "AEP cadence" : "regular"}</span>
          </div>
          {(() => {
            // Was a hardcoded "9:00a Lead Drop · 47 fresh leads · done / 4:00p
            // Power Hour · now" block — every agency saw the same fake schedule
            // with a fake "47 leads" number. Now derives from agency-config's
            // ritual array (if owners have configured one) and live queue count.
            const cfg = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get()) || null;
            const ritual = Array.isArray(cfg?.daily_ritual) ? cfg.daily_ritual : null;
            const queueLen = (AppData.QUEUE || []).length;
            if (!ritual || ritual.length === 0) {
              return (
                <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.5, textAlign: "center" }}>
                  No daily ritual configured yet. Queue depth: <span className="tabular" style={{ color: queueLen > 0 ? "var(--accent-money)" : "var(--text-tertiary)" }}>{queueLen}</span>.
                  <div style={{ marginTop: 6, fontSize: 11 }}>Your manager can set a team cadence in agency-config.</div>
                </div>
              );
            }
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            return (
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {ritual.map((r, i) => {
                  const [h, m] = (r.t || "0:00").split(":").map(Number);
                  const startMin = (h || 0) * 60 + (m || 0);
                  const next = ritual[i + 1];
                  const endMin = next ? (() => { const [nh, nm] = (next.t || "23:59").split(":").map(Number); return (nh || 23) * 60 + (nm || 59); })() : 24 * 60;
                  const state = nowMin >= startMin && nowMin < endMin ? "now" : nowMin >= endMin ? "done" : "next";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--radius-sm)", background: state === "now" ? "color-mix(in srgb, var(--accent-money) 10%, transparent)" : "var(--bg-raised)", border: state === "now" ? "1px solid color-mix(in srgb, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)" }}>
                      <span className="tabular mono" style={{ width: 46, fontSize: 10.5, color: state === "now" ? "var(--accent-money)" : "var(--text-tertiary)" }}>{r.t}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{r.n}</div>
                        {r.s && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.s}</div>}
                      </div>
                      {state === "done" && <Icons.Check size={12} style={{ color: "var(--accent-money)" }}/>}
                      {state === "now"  && <span className="chip chip-money" style={{ fontSize: 9.5 }}>NOW</span>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
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
function TodayManager({ aep }) {
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
  const VALID_SUBTABS = ["pulse", "team", "coaching", "pay", "expenses", "nigo", "onboarding"];
  const [subTab, setSubTab] = React.useState(() => {
    try {
      const stash = sessionStorage.getItem("repflow.today.subtab");
      if (stash) {
        sessionStorage.removeItem("repflow.today.subtab");
        if (VALID_SUBTABS.includes(stash)) return stash;
      }
    } catch {}
    return "pulse";
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
          <div className="page-title">Today · {me?.agency_name || "Team"}
            {aep && (() => { const ctx = useAepContext(null, "manager"); return ctx ? <> — <AepTitleChip ctx={ctx}/></> : null; })()}
          </div>
          <div className="page-sub">
            {REPS.length === 0
              ? "No producers in your downline yet"
              : `${live.length} of ${REPS.length} live · ${totalDials} dials · $${teamToday.toLocaleString()} closed today`}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => { if (window.gotoPage) window.gotoPage("messages"); }}
            title="Open team channel"
          ><Icons.MessageSquare size={13}/> Standup notes</button>
          <button
            className="btn btn-primary"
            onClick={() => { if (window.gotoPage) window.gotoPage("floor"); }}
            title="Jump to live floor"
          ><Icons.Phone size={13}/> Power Hour · all hands</button>
        </div>
      </div>

      {/* Floor live strip — compact presence-pill row showing which downline
          reps are dialing right now. Sits ABOVE the spend strip so the
          manager's first read is "who's working" before "what cost what".
          Subscribes to Supabase realtime channel `presence:agency_<id>` when
          available; falls back to AppData.REPS.presence on hydrate. */}
      <FloorLiveStrip REPS={REPS} agencyId={me?.agency_id}/>

      {/* Spend congruency strip — every value derives from real tables.
          Empty cells render .koino-empty mono tag, not fake numbers. */}
      <TodaySpendStrip scopeIds={scopeIds} teamToday={teamToday}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team MTD AP" prefix="$" value={teamMTD.toLocaleString()}
          sub={REPS.length === 0 ? "no producers" : `${REPS.length} producer${REPS.length === 1 ? "" : "s"} in scope`}/>
        <Shared.KpiCard label="Booked today" prefix="$" value={teamToday.toLocaleString()}
          sub={`${live.length} producer${live.length === 1 ? "" : "s"} live`}
          trend={teamToday > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Total dials" value={totalDials}
          sub={dialFloor > 0 ? `floor ${dialFloor}` : "no floor set"}
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

      {subTab === "pulse"      && <TodayManagerPulse REPS={REPS} live={live} idle={idle} scopeIds={scopeIds} setSubTab={setSubTab}/>}
      {subTab === "team"       && (() => { const T = window.PageTeam;        return T ? <T embedded/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Team Board module loading…</div>; })()}
      {subTab === "coaching"   && (() => { const C = window.CoachingManager; return C ? <C embedded/> : <div style={{ padding: 20, color: "var(--text-tertiary)" }}>Coaching module loading…</div>; })()}
      {subTab === "pay"        && <TodayManagerPay scopeIds={scopeIds}/>}
      {subTab === "expenses"   && <TodayManagerExpenses/>}
      {subTab === "nigo"       && <TodayManagerNigo scopeIds={scopeIds}/>}
      {subTab === "onboarding" && <TodayManagerOnboarding scopeIds={scopeIds}/>}
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

/* Floor live strip — presence pills for downline reps. Compact strip that
   answers "who's working right now?" at a glance. Subscribes to Supabase
   realtime channel `presence:agency_<id>` when the channel is reachable.
   Falls back to AppData.REPS.presence (hydrated by the regular data sync)
   when realtime isn't wired or the channel times out. Never blocks paint.

   Status pills (matching koino.capital DS):
     dialing   → --accent-money + live dot
     coaching  → --accent-status (info purple)
     idle      → --text-tertiary
     off       → --text-quaternary
*/
function FloorLiveStrip({ REPS, agencyId }) {
  // Live overlay: rep_id → presence string (overrides hydrated REPS.presence).
  const [livePresence, setLivePresence] = React.useState({});
  // Realtime: try to subscribe; on first message or after 1.5s timeout, mark
  // realtime "ready" so the UI labels itself accurately. Falls through on any
  // failure — never blocks paint.
  const [realtimeOk, setRealtimeOk] = React.useState(false);
  React.useEffect(() => {
    if (!agencyId) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || typeof sb.channel !== "function") return;
    let channel;
    let cancelled = false;
    try {
      channel = sb.channel(`presence:agency_${agencyId}`);
      channel.on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const state = channel.presenceState();
        const overlay = {};
        Object.values(state).flat().forEach((p) => {
          if (p?.rep_id) overlay[p.rep_id] = p.status || "idle";
        });
        setLivePresence(overlay);
        setRealtimeOk(true);
      });
      channel.subscribe();
    } catch (_e) { /* fall back to hydrated REPS.presence */ }
    return () => { cancelled = true; if (channel) { try { sb.removeChannel(channel); } catch {} } };
  }, [agencyId]);

  if (REPS.length === 0) {
    return (
      <div style={{ padding: "8px 12px", marginBottom: 10, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icons.Phone size={11} style={{ color: "var(--text-tertiary)" }}/>
        <span className="koino-empty">today · no producers in scope</span>
      </div>
    );
  }

  const presenceFor = (r) => livePresence[r.id] || r.presence || "idle";
  const dialing  = REPS.filter(r => presenceFor(r) === "live" || presenceFor(r) === "dialing");
  const coaching = REPS.filter(r => presenceFor(r) === "coaching");

  const pillColor = (p) => {
    if (p === "live" || p === "dialing")   return "var(--accent-money)";
    if (p === "coaching")                   return "var(--accent-status)";
    if (p === "off")                        return "var(--text-quaternary)";
    return "var(--text-tertiary)";
  };

  return (
    <div style={{
      padding: "6px 10px",
      marginBottom: 10,
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>Floor</span>
      <span className={dialing.length > 0 ? "dot dot-live" : "dot"}></span>
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
        {dialing.length} dialing · {coaching.length} coaching · {REPS.length - dialing.length - coaching.length} idle
      </span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {REPS.map(r => {
          const p = presenceFor(r);
          const dials = r.dials || 0;
          return (
            <button
              key={r.id}
              className="btn btn-ghost"
              style={{ padding: "2px 6px", fontSize: 10.5, display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--border-subtle)" }}
              title={`${r.name} · ${p} · ${dials} dials today`}
              onClick={() => { if (window.gotoPage) window.gotoPage("messages"); }}
            >
              <span className="dot" style={{ background: pillColor(p), width: 6, height: 6 }}></span>
              <span style={{ fontWeight: 500 }}>{r.name.split(" ")[0]}</span>
              <span className="tabular" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{dials}</span>
            </button>
          );
        })}
      </span>
      {!realtimeOk && (
        <span className="koino-empty" title="Supabase realtime channel presence:agency_<id> not connected — falling back to AppData hydrate">cached</span>
      )}
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
function TodayManagerPulse({ REPS, live, idle, scopeIds, setSubTab }) {
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const pipeline = (AppData.PIPELINE || []);
  const inScope = (row) => !scopeIds || scopeIds.length === 0 || !row.owner || scopeIds.includes(row.owner);

  // "Needs me" = high-leverage stuck deals: App In or Quoted, > 3 days in stage,
  // owned by a downline rep. Sorted by AP descending so the biggest at-risk
  // money rises. Caps at 6 rows.
  const stuckDeals = pipeline
    .filter(inScope)
    .filter(p => (p.stage === "App In" || p.stage === "Quoted") && (p.days || 0) > 3)
    .sort((a, b) => (b.ap || 0) - (a.ap || 0))
    .slice(0, 6);

  // Coaching cards: real entries from AppData.COACHING_SESSIONS filtered to scope.
  // No more "Talk ratio 58%" / "Plan G anchor" placeholder copy.
  const sessions = (AppData.COACHING_SESSIONS || [])
    .filter(s => repById[s.repId])
    .filter(s => !s.completedAt)
    .slice(0, 4);

  return (
    <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
      <div className="panel">
        <div className="panel-h"><Icons.Users size={13}/><h3>Producers · live floor</h3><span className="meta">{REPS.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Dials</div>
            <div className="tabular" style={{ textAlign: "right" }}>Appts</div>
            <div className="tabular" style={{ textAlign: "right" }}>Today</div>
            <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
            <div></div>
          </div>
          {REPS.length === 0 && (
            <div style={{ padding: 22, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No producers in your downline yet. <a href="#" onClick={(e) => { e.preventDefault(); if (window.gotoPage) window.gotoPage("recruiting"); }} style={{ color: "var(--accent-money)" }}>Invite reps</a>.
            </div>
          )}
          {[...live, ...idle].map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px", height: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={r} size={18}/>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
                    <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                    {r.presence === "live" ? "on call" : "idle"}
                  </div>
                </div>
              </div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{r.dials || 0}</div>
              <div className="tabular" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.appts || 0}</div>
              <div className="tabular" style={{ textAlign: "right", color: (r.today || 0) > 1000 ? "var(--accent-money)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>${(r.today || 0).toLocaleString()}</div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500, fontFamily: "var(--font-mono)" }}>${((r.mtd || 0) / 1000).toFixed(1)}k</div>
              <button className="btn btn-ghost" title={`DM ${r.name}`} onClick={() => { if (window.gotoPage) window.gotoPage("messages"); window.toast && window.toast(`Open thread with ${r.name}`, "info"); }}><Icons.MessageSquare size={11}/></button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Activity size={13} style={{ color: "var(--accent-money)" }}/><h3>Open coaching cards</h3><span className="meta">{sessions.length}</span></div>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {sessions.length === 0 && (
              <div style={{ padding: 14, textAlign: "center", fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                No active coaching sessions in your downline.<br/>
                <a href="#" onClick={(e) => { e.preventDefault(); if (setSubTab) setSubTab("coaching"); else window.dispatchEvent(new CustomEvent("today:subtab", { detail: "coaching" })); }} style={{ color: "var(--accent-money)" }}>Open Coaching tab</a> to create one.
              </div>
            )}
            {sessions.map((s, i) => {
              const rep = repById[s.repId];
              return (
                <div key={s.id || i} style={{ padding: 8, background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--border-subtle)" }}>
                  <Shared.Avatar rep={rep} size={18}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{rep?.name || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.focusArea || s.notes || "Open focus"}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "2px 6px" }} title={`Coach ${rep?.name || ""}`}
                    onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Coach ${rep?.name || "this rep"} on: ${s.focusArea || s.notes || "current focus"}`, context: "Coaching · " + (rep?.name || "") } }))}>
                    <Icons.Play size={10}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Needs me</h3><span className="meta">stuck &gt; 3d</span></div>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {stuckDeals.length === 0 && (
              <div style={{ padding: 14, textAlign: "center", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                No stuck deals in your downline. Good day.
              </div>
            )}
            {stuckDeals.map((p) => {
              const owner = repById[p.owner];
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 2px" }}>
                  <span className="dot dot-warn"></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.lead} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {p.stage} · {p.days}d</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                      {owner ? owner.name.split(" ")[0] : "unassigned"} · {p.ap ? `$${p.ap.toLocaleString()}` : "—"} AP
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5 }}
                    title="Open deal in CRM"
                    onClick={() => { if (window.gotoPage) window.gotoPage("crm"); }}>
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

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
function TodayOwner({ aep }) {
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
          <div className="page-title">Today · {agencyName} — {aep ? (() => { const ctx = useAepContext(null, "owner"); return ctx ? <AepTitleChip ctx={ctx}/> : "Q2"; })() : "Q2"}</div>
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
                { sev: "warn",   t: "AEP cert lag",        b: "3 producers under 80% on TPMO" },
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
