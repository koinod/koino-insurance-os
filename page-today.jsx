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

/* GAP-P3 — single goal column. Bar tinted by progress band. */
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

/* Quick-action tile used by GAP-D4 + GAP-OC1. */
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

/* GAP-D5 — Resolve the actual AEP state for the viewer instead of hardcoding
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

/* ───── AEP banner + Tasks live panels (used by all role views) ─────────── */
function AEPBanner({ repId, role = "rep" }) {
  const ctx = useAepContext(repId, role);
  if (!ctx) return null;
  const { active, myAssign, isLive, daysToStart } = ctx;
  const pctApps = myAssign && myAssign.targetApps > 0 ? Math.round((myAssign.completedApps / myAssign.targetApps) * 100) : 0;
  return (
    <div className="panel" style={{ padding: "12px 16px", marginBottom: 14, background: "color-mix(in oklch, var(--accent-heat) 6%, transparent)", borderColor: "color-mix(in oklch, var(--accent-heat) 30%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="chip" style={{ color: "var(--accent-heat)", borderColor: "color-mix(in oklch, var(--accent-heat) 40%, transparent)", background: "color-mix(in oklch, var(--accent-heat) 12%, transparent)", fontWeight: 600 }}>
          {isLive ? "🔥 AEP LIVE" : "AEP UPCOMING"}
        </span>
        <strong style={{ fontSize: 13 }}>{active.name}</strong>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
          {active.startsAt} → {active.endsAt}
          {!isLive && daysToStart != null && daysToStart > 0 && <span> · opens in {daysToStart}d</span>}
        </span>
        {myAssign && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 12 }}>
            <span><strong className="tabular">{myAssign.completedApps}</strong> / {myAssign.targetApps} apps <span style={{ color: "var(--text-tertiary)" }}>({pctApps}%)</span></span>
            <span><strong className="tabular">${myAssign.completedAp.toLocaleString()}</strong> / ${myAssign.targetAp.toLocaleString()} AP</span>
            {myAssign.territory && <span className="chip">{myAssign.territory}</span>}
          </span>
        )}
      </div>
    </div>
  );
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

/* GAP-X1 v1 — predictive heuristics (RETAINER + RECRUITER sub-agents preview).
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
  // Gated by feature flag `predictive_cards` (default on). Set globally
  // from platform-admin → Flags, or per-agency from agency-flags modal.
  // When off the section disappears entirely — a no-op render.
  const ffOn = (typeof window !== "undefined" && window.featureFlagOn)
    ? window.featureFlagOn("predictive_cards", true)
    : true;
  if (!ffOn) return null;
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
const TIER_TARGETS = {
  bronze:   { next: "silver",    threshold: 12000 },
  silver:   { next: "gold",      threshold: 20000 },
  gold:     { next: "platinum",  threshold: 35000 },
  platinum: { next: "diamond",   threshold: 50000 },
  diamond:  { next: null,        threshold: null   },
};

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
  const myRow   = (REPS || []).find(r => meIdent && (r.id === meIdent.rep_id || r.handle === meIdent.handle))
                || (REPS || [])[0]
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

  // Sparklines remain demo for now (need historical aggregation table — Sprint-1 work).
  const spark1 = [12,18,15,22,30,28,35,42];
  const spark2 = [4,6,5,8,11,9,12,14];

  // GAP-A1 — first-action CTA. Show a hero banner whenever the rep has done
  // nothing today (no dials, no apps, no commissions) so a brand-new producer
  // is not staring at a wall of zeros wondering what to click first.
  const dayIsBlank = dialsToday === 0 && appsToday === 0 && todayCommission === 0;
  const queueDepth = (QUEUE || []).length;
  const goFloor = () => window.gotoPage && window.gotoPage("floor");
  const goCrm   = () => window.gotoPage && window.gotoPage("crm");
  const goMessages = () => window.gotoPage && window.gotoPage("messages");

  // GAP-P3 — my-goals card data. Daily target derives from tier threshold /
  // 22 workdays, weekly = daily × 5, monthly = tier threshold. Real targets
  // can override via tier-specific goals schema later.
  const dailyTarget   = Math.round((tierInfo.threshold || 12000) / 22);
  const weeklyTarget  = dailyTarget * 5;
  const monthlyTarget = tierInfo.threshold || 12000;
  const dailyPct   = Math.min(100, (todayCommission / Math.max(1, dailyTarget))   * 100);
  const monthlyPct = Math.min(100, (mtdNum         / Math.max(1, monthlyTarget)) * 100);

  // GAP-A4 — onboarding checklist progress. Pulls live from
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

  // GAP-OC1 — DM-your-manager. Resolve upline rep from me().upline_id when
  // available; fall back to first manager-role rep. Click → Messages page
  // with a thread auto-opened to that manager.
  const myManagerId = meIdent?.upline_id || null;
  const myManagerRow = REPS.find(r => myManagerId && r.id === myManagerId) || null;
  const dmManager = async () => {
    if (!myManagerRow) return goMessages();
    try {
      await window.AppData.mutate.threadEnsure({ memberHandles: [myRow.handle, myManagerRow.handle], kind: "dm" });
    } catch (_e) {}
    goMessages();
  };

  // GAP-D4 — log-activity quick action. Opens the existing CRM Add-lead flow
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
          <ActionTile icon="Plus"           label="Log activity"      sub="referral / walk-in / event" onClick={openLogActivity}/>
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
        const isDemo = window.isDemoAgency && window.isDemoAgency();
        return (
          <SpendStrip items={[
            { l: "Cost / issued",  v: cpa != null ? `$${cpa}` : (isDemo ? "$112" : "—"), tone: "money" },
            { l: "Lead spend MTD", v: leadSpendMtd > 0 ? `$${leadSpendMtd.toLocaleString()}` : (isDemo ? "$680" : "$0") },
            { l: "Issued MTD",     v: issuedMtd > 0 ? String(issuedMtd) : (isDemo ? "—" : "0"), tone: "money" },
            { l: "NIGO drag",      v: "$0", tone: "money" },
          ]}/>
        );
      })()}

      <div className="kpi-row">
        <Shared.KpiCard hero label="Today's Commission" value={todayCommission.toLocaleString()} prefix="$" sub={`MTD: $${mtdNum.toLocaleString()}`} trend={todayCommission > 0 ? "up" : undefined} spark={spark1}/>
        <Shared.KpiCard label="Apps submitted (today)" value={appsToday} sub={`tier: ${(myRow.tier || "—").toUpperCase()}`} spark={spark2}/>
        <Shared.KpiCard label="Dials (today)" value={dialsToday} sub={`streak: ${myRow.streak || 0}d`} trend={myRow.streak > 0 ? "up" : undefined} spark={[60,72,68,75,80,78,85,87]}/>
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
                On Cheryl Hampton's call, you asked "Do you take medications?" instead of "Walk me through your day with your medications." 4 closed-ended in the first 6 min cost rapport.
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
            <Icons.Bolt size={14} style={{ color: "var(--accent-heat)" }}/>
            <h3>Daily ritual</h3>
            <span className="meta">{aep ? "AEP cadence" : "regular"}</span>
          </div>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { t: "9:00a",  n: "Lead Drop",          s: "47 fresh leads in queue",        d: "done" },
              { t: "12:00p", n: "Mid-day check-in",   s: "Talk-ratio review w/ AI",         d: "done" },
              { t: "4:00p",  n: "Power Hour",         s: "Group dial · Discord war-room",   d: "now"  },
              { t: "7:00p",  n: "Today's Closes",     s: "Leaderboard freeze · post wins",  d: "next" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: r.d === "now" ? "color-mix(in oklch, var(--accent-heat) 12%, transparent)" : "var(--bg-raised)" }}>
                <span className="tabular mono" style={{ width: 50, fontSize: 11, color: r.d === "now" ? "var(--accent-heat)" : "var(--text-tertiary)" }}>{r.t}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.n}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.s}</div>
                </div>
                {r.d === "done" && <Icons.Check size={13} style={{ color: "var(--accent-money)" }}/>}
                {r.d === "now"  && <span className="chip chip-heat">LIVE</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Manager view ─────────────────────────────────────────────────────── */
function TodayManager({ aep }) {
  const { REPS } = AppData;
  const live  = (REPS || []).filter(r => r.presence === "live");
  const idle  = (REPS || []).filter(r => r.presence !== "live");
  const teamMTD = (REPS || []).reduce((a, r) => a + (r.mtd || 0), 0);
  const teamToday = (REPS || []).reduce((a, r) => a + (r.today || 0), 0);
  const totalDials = (REPS || []).reduce((a, r) => a + (r.dials || 0), 0);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Today · {(() => { const m = window.me && window.me(); return m?.agency_name || "Team"; })()} — {aep ? (() => { const ctx = useAepContext(null, "manager"); return ctx ? <AepTitleChip ctx={ctx}/> : "Q2"; })() : "Q2"}</div>
          <div className="page-sub">{live.length} of {REPS.length} live · {totalDials} dials · ${teamToday.toLocaleString()} closed today</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (window.gotoPage) window.gotoPage("messages");
              window.toast && window.toast("Open your team channel to post standup notes", "info");
            }}
          ><Icons.MessageSquare size={13}/> Standup notes</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (window.gotoPage) window.gotoPage("floor");
              window.toast && window.toast("Power Hour started · all hands on Floor", "success");
            }}
          ><Icons.Phone size={13}/> Power Hour · all hands</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Team CPA today",  v: "$87",   tone: "money" },
        { l: "Lead spend today", v: "$1,240" },
        { l: "Comp paid today",  v: `$${(teamToday * 0.62).toFixed(0)}`, tone: "money" },
        { l: "Open NIGO",        v: "2",    tone: "warn" },
      ]}/>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team MTD AP" prefix="$" value={teamMTD.toLocaleString()} sub="+12% vs last month" trend="up"/>
        <Shared.KpiCard label="Booked today" prefix="$" value={teamToday.toLocaleString()} sub={`${live.length} producers live`}/>
        <Shared.KpiCard label="Total dials" value={totalDials} sub="goal 700" trend="up"/>
      </div>

      <PredictiveCards scope="team"/>
      <ForecastStrip scope="team"/>

      <div className="today-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Users size={13}/><h3>Producers · live floor</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px" }}>
              <div>Producer</div>
              <div className="tabular" style={{ textAlign: "right" }}>Dials</div>
              <div className="tabular" style={{ textAlign: "right" }}>Appts</div>
              <div className="tabular" style={{ textAlign: "right" }}>Today</div>
              <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
              <div></div>
            </div>
            {[...live, ...idle].map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 80px 90px 100px 70px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={20}/>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
                      <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                      {r.presence === "live" ? "on call" : "idle"}
                    </div>
                  </div>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.dials || 0}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{r.appts || 0}</div>
                <div className="tabular" style={{ textAlign: "right", color: (r.today || 0) > 1000 ? "var(--accent-money)" : "var(--text-secondary)" }}>${(r.today || 0).toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${((r.mtd || 0) / 1000).toFixed(1)}k</div>
                <button className="btn btn-ghost" title={`DM ${r.name}`} onClick={() => { if (window.gotoPage) window.gotoPage("messages"); window.toast && window.toast(`Open thread with ${r.name}`, "info"); }}><Icons.MessageSquare size={11}/></button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13} style={{ color: "var(--accent-status)" }}/><h3>Today's coaching cards</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {(() => {
                // Coaching cards: real entries from AppData.COACHING_SESSIONS when present,
                // else illustrative cards bound to whatever reps actually exist in the agency.
                // Was hardcoded to REPS[0]/REPS[2]/REPS[5] which crashed any agency with <6 reps.
                const real = (AppData.COACHING_SESSIONS || [])
                  .slice(0, 3)
                  .map(s => ({ rep: (REPS || []).find(r => r.id === s.repId), note: s.note || s.summary || "Coaching note" }))
                  .filter(c => c.rep);
                if (real.length > 0) return real;
                const illustrative = [
                  "4 closed-ended Q on first call. Replay ready.",
                  "Talk ratio 58% on a recent call. Pull moment.",
                  "Skipped Plan G anchor on 14 quotes.",
                ];
                return (REPS || []).slice(0, 3).map((rep, i) => ({ rep, note: illustrative[i] || "Coaching note" }));
              })().map((c, i) => (
                <div key={i} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  <Shared.Avatar rep={c.rep} size={20}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.rep?.name || "—"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.note}</div>
                  </div>
                  <button className="btn btn-ghost" title={`Coach ${c.rep?.name || ""}`} onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Coach ${c.rep?.name || "this rep"} on: ${c.note}`, context: "Coaching · " + (c.rep?.name || "") } }))}><Icons.Play size={10}/></button>
                </div>
              ))}
              {(REPS || []).length === 0 && (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
                  No producers yet — invite your first rep from Settings → Team to start coaching.
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Needs me</h3></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { l: "Robert Mendez App In · carrier review pending",   a: "Push" },
                { l: "Ramona Diaz · beneficiary form not signed",       a: "Nudge" },
                { l: "Henry Akins · annuity sigs · 4d in stage",         a: "Escalate" },
              ].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span className="dot dot-warn"></span>
                  <span style={{ flex: 1 }}>{x.l}</span>
                  <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>{x.a}</button>
                </div>
              ))}
            </div>
          </div>
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
  const agencyName = meIdent?.agency_name || "Atlas Insurance Group";

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
