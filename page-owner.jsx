/* Page: Owner — P&L + Org Tree

   Every number on this page is computed from the agency's actual records:
   POLICIES + COMMISSIONS + CLAWBACKS + EXPENSES + NIGOS + RECRUITING_APPLICANTS.
   Demo agencies get the same math — they just have seeded records to chew on.
   Empty data → "—". No hardcoded fallback numbers. */
function _pnlLiveMetrics(period) {
  const policies = AppData.POLICIES || [];
  const commissions = AppData.COMMISSIONS || [];
  const clawbacks = AppData.CLAWBACKS || [];
  const policyById = Object.fromEntries(policies.map(p => [p.id, p]));

  const now = new Date();
  const startMtd = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYtd = new Date(now.getFullYear(), 0, 1);
  const startT12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startPriorMtd = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPriorMtd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const cutoff = period === "MTD" ? startMtd : period === "YTD" ? startYtd : startT12;
  const tsIn = (s) => s && new Date(s) >= cutoff;
  const tsBetween = (s, a, b) => s && new Date(s) >= a && new Date(s) <= b;

  const overrideRev = commissions.filter(c => c.kind === "override" && tsIn(c.earnedAt))
    .reduce((a, c) => a + (c.amount || 0), 0);
  const overrideRevPrior = commissions.filter(c => c.kind === "override" && tsBetween(c.earnedAt, startPriorMtd, endPriorMtd))
    .reduce((a, c) => a + (c.amount || 0), 0);
  const apSubmitted = policies.filter(p => tsIn(p.submissionDate))
    .reduce((a, p) => a + (p.ap || 0), 0);
  const apSubmittedPrior = policies.filter(p => tsBetween(p.submissionDate, startPriorMtd, endPriorMtd))
    .reduce((a, p) => a + (p.ap || 0), 0);
  const apsCount = policies.filter(p => tsIn(p.submissionDate)).length;
  const nigoDrag = clawbacks.filter(c => tsIn(c.recordedAt))
    .reduce((a, c) => a + (c.amount || 0), 0);
  const nigoDragPrior = clawbacks.filter(c => tsBetween(c.recordedAt, startPriorMtd, endPriorMtd))
    .reduce((a, c) => a + (c.amount || 0), 0);

  const producerComp = commissions.filter(c => c.kind !== "override" && tsIn(c.earnedAt));
  const grossProducer = producerComp.reduce((a, c) => a + (c.amount || 0), 0);
  const byProductRe = (re) => producerComp.filter(c => {
    const p = policyById[c.policyId];
    return p && re.test(String(p.product || ""));
  }).reduce((a, c) => a + (c.amount || 0), 0);

  const medSupp = byProductRe(/med\s*supp|plan\s*g|plan\s*n/i);
  const fe      = byProductRe(/final\s*expense|^fe\b|fe\s/i);
  const annuity = byProductRe(/annuity|spda|fia/i);
  const leadSpend = (AppData.LEAD_SPEND_TOTALS && AppData.LEAD_SPEND_TOTALS[period.toLowerCase()]) || 0;
  const fixedCosts = AppData.AGENCY_FIXED_COSTS_CENTS || 0;

  // 12-month spark for override revenue + AP submitted
  const monthBucket = (rows, getDate, getVal) => {
    const out = new Array(12).fill(0);
    for (const r of rows) {
      if (!getDate(r)) continue;
      const d = new Date(getDate(r));
      const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (months < 0 || months > 11) continue;
      out[11 - months] += getVal(r) || 0;
    }
    return out;
  };
  const sparkRevArr = monthBucket(commissions.filter(c => c.kind === "override"), c => c.earnedAt, c => c.amount / 100);
  const sparkApArr  = monthBucket(policies, p => p.submissionDate, p => p.ap / 1000);

  const hasLive = commissions.length > 0 || policies.length > 0;
  const sparkRev = hasLive && sparkRevArr.some(v => v > 0) ? sparkRevArr.map(v => Math.round(v)) : null;
  const sparkOR  = hasLive && sparkApArr.some(v => v > 0)  ? sparkApArr.map(v => Math.round(v))  : null;

  const pctDelta = (cur, prior) => prior > 0 ? Math.round(((cur - prior) / prior) * 1000) / 10 : null;

  return {
    hasLive,
    overrideRev, overrideRevDelta: pctDelta(overrideRev, overrideRevPrior),
    apSubmitted, apSubmittedDelta: pctDelta(apSubmitted, apSubmittedPrior),
    apsCount, nigoDrag, nigoDragDelta: pctDelta(nigoDrag, nigoDragPrior),
    grossProducer, medSupp, fe, annuity, leadSpend, fixedCosts,
    sparkRev, sparkOR,
  };
}

// ── Live anomaly engine ───────────────────────────────────────────────────
// Computes warning signals from real data instead of hardcoded list.
function _computeAnomalies() {
  const anomalies = [];
  const policies = AppData.POLICIES || [];
  const nigos = AppData.NIGOS || [];
  const courses = AppData.COURSES || [];
  const expenses = AppData.EXPENSES || [];
  const carriers = AppData.CARRIERS || [];
  const carrierById = Object.fromEntries(carriers.map(c => [c.id, c]));
  const now = Date.now();
  const d7 = 7 * 86400000, d30 = 30 * 86400000;

  // 1) Persistency drift — % of cohort policies issued 60-180d ago that are now lapsed/cancelled
  const cohort = policies.filter(p => {
    if (!p.issuedAt) return false;
    const age = now - new Date(p.issuedAt).getTime();
    return age >= 60 * 86400000 && age <= 180 * 86400000;
  });
  if (cohort.length >= 5) {
    const lapsed = cohort.filter(p => p.persistency === "lapsed" || p.status === "cancelled").length;
    const lapseRate = (lapsed / cohort.length) * 100;
    if (lapseRate > 15) {
      anomalies.push({
        sev: lapseRate > 25 ? "danger" : "warn",
        t: "Persistency drift",
        b: `${lapseRate.toFixed(1)}% lapse rate · ${cohort.length}-policy cohort 60–180d`,
        a: "Drill", target: "performance"
      });
    }
  }

  // 2) NIGO spike — carriers with > 3 NIGOs in last 7d
  const nigoByCarrier = {};
  for (const n of nigos) {
    if (!n.createdAt || (now - new Date(n.createdAt).getTime()) > d7) continue;
    const pol = policies.find(p => p.id === n.policyId);
    const carrierId = pol?.carrierId;
    if (!carrierId) continue;
    nigoByCarrier[carrierId] = (nigoByCarrier[carrierId] || 0) + 1;
  }
  for (const [cid, count] of Object.entries(nigoByCarrier)) {
    if (count >= 3) {
      const cName = carrierById[cid]?.name || "carrier";
      anomalies.push({
        sev: count >= 5 ? "danger" : "warn",
        t: "NIGO spike",
        b: `${cName} · ${count} returned in 7d`,
        a: "Open queue", target: "nigo"
      });
    }
  }

  // 3) AEP / compliance cert gaps — courses on AEP/Compliance not complete by AEP cutoff
  const aepCourses = courses.filter(c => /AEP|Compliance|TPMO/i.test(c.track) && c.status !== "complete");
  if (aepCourses.length > 0) {
    anomalies.push({
      sev: "warn",
      t: "Cert gap",
      b: `${aepCourses.length} cert${aepCourses.length === 1 ? "" : "s"} not complete (TPMO/AEP)`,
      a: "Notify", target: "training"
    });
  }

  // 4) Lead source ROI — sources with > 30% CPL change last 30d vs prior 30d
  const startNow30 = now - d30, startPrior30 = now - 2 * d30;
  const spendBy = (since, until) => {
    const out = {};
    for (const e of expenses) {
      if (e.kind !== "lead_spend" || !e.paid_at) continue;
      const t = new Date(e.paid_at).getTime();
      if (t < since || t >= until) continue;
      const k = e.lead_source_id || e.notes || "unspec";
      out[k] = (out[k] || 0) + (e.amount_cents || 0);
    }
    return out;
  };
  const cur = spendBy(startNow30, now), prev = spendBy(startPrior30, startNow30);
  for (const [k, curCents] of Object.entries(cur)) {
    const prevCents = prev[k] || 0;
    if (prevCents < 5000) continue; // ignore noise (<$50 prior)
    const delta = ((curCents - prevCents) / prevCents) * 100;
    if (Math.abs(delta) > 30) {
      anomalies.push({
        sev: "info",
        t: "Lead source shift",
        b: `${k} · ${delta > 0 ? "+" : ""}${delta.toFixed(0)}% spend MoM`,
        a: "Approve", target: "attribution"
      });
    }
  }

  return anomalies;
}

// ── States covered: distinct states across POLICIES + APPOINTMENTS ────────
function _statesCovered() {
  const set = new Set();
  for (const p of (AppData.POLICIES || [])) { if (p.state) set.add(p.state); }
  for (const a of (AppData.APPOINTMENTS || [])) { if (a.state && (!a.status || a.status === "active")) set.add(a.state); }
  return set.size;
}

function _recruitingFunnel() {
  const apps = AppData.RECRUITING_APPLICANTS || [];
  if (apps.length === 0) return [];
  const total = apps.length;
  const contracted = apps.filter(a => a.status === "contracted" || a.status === "first_app" || a.status === "producing").length;
  const firstApp   = apps.filter(a => a.status === "first_app" || a.status === "producing").length;
  const producing  = apps.filter(a => a.status === "producing").length;
  const w = (n) => total > 0 ? Math.max(2, (n / total) * 100) : 0;
  return [
    { l: "Applied",           v: total,       w: 100 },
    { l: "Contracted",        v: contracted,  w: w(contracted) },
    { l: "First app",         v: firstApp,    w: w(firstApp) },
    { l: "Producing 90+ days", v: producing,  w: w(producing) },
  ];
}

// Anomaly snooze — per-user, persisted to localStorage so the operator
// can dismiss signal noise (e.g. "I know about that NIGO spike, hide it
// for 24h"). Keyed by a stable signal hash (type + body) so the same
// anomaly can be snoozed across renders.
const SNOOZE_KEY = "repflow.owner.anomaly_snooze.v1";
function _loadSnoozes() {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    // Prune expired
    const fresh = {};
    for (const [k, until] of Object.entries(parsed)) {
      if (until > now) fresh[k] = until;
    }
    return fresh;
  } catch { return {}; }
}
function _saveSnoozes(s) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch {}
}
function _anomalyKey(a) { return `${a.t}::${a.b}`; }

function PagePnL() {
  const [period, setPeriod]      = React.useState("MTD");  // MTD | T12 | YTD
  const m = _pnlLiveMetrics(period);
  const dollarsLive = (cents) => `${Math.round(cents / 100).toLocaleString()}`;
  const fmtKpiCents = (cents) => {
    if (cents == null) return "—";
    if (cents >= 100000000) return `${(cents / 100000000).toFixed(2)}M`;
    if (cents >= 100000)    return `${Math.round(cents / 100).toLocaleString()}`;
    return `${(cents / 100).toFixed(0)}`;
  };
  const fmtDelta = (d, neg = false) => {
    if (d == null) return "no prior period";
    const arrow = d >= 0 ? "+" : "";
    const word  = neg ? (d <= 0 ? "vs last month (good)" : "vs last month (worse)")
                      : "vs last month";
    return `${arrow}${d}% ${word}`;
  };
  const overrideKpi = m.overrideRev > 0 ? dollarsLive(m.overrideRev) : "—";
  const apKpi       = m.apSubmitted > 0 ? fmtKpiCents(m.apSubmitted) : "—";
  const apSub       = m.apsCount > 0 ? `${m.apsCount} app${m.apsCount === 1 ? "" : "s"} · ${fmtDelta(m.apSubmittedDelta)}` : "no apps yet";
  const nigoKpi     = m.nigoDrag > 0 ? dollarsLive(m.nigoDrag) : "—";
  const overrideSub = m.overrideRev > 0 ? `live · ${fmtDelta(m.overrideRevDelta)}` : "no override commissions yet";
  const nigoSub     = m.nigoDrag > 0 ? `live · ${fmtDelta(m.nigoDragDelta, true)}` : "no clawbacks";
  const recFunnel = _recruitingFunnel();
  const [snoozes, setSnoozes] = React.useState(() => _loadSnoozes());
  const anomaliesAll = _computeAnomalies();
  const anomalies = anomaliesAll.filter(a => !snoozes[_anomalyKey(a)]);
  const snoozedCount = anomaliesAll.length - anomalies.length;
  const snoozeFor = (a, hours) => {
    const next = { ...snoozes, [_anomalyKey(a)]: Date.now() + hours * 3600 * 1000 };
    setSnoozes(next); _saveSnoozes(next);
    window.toast && window.toast(`Snoozed "${a.t}" for ${hours}h`, "info");
  };
  const unsnoozeAll = () => {
    setSnoozes({}); _saveSnoozes({});
    window.toast && window.toast("Cleared snoozes", "info");
  };
  const [askValue, setAskValue]  = React.useState("");
  const [waterfallDrill, setDrill] = React.useState(null);

  const agency = (window.__activeAgency || {});
  const agencyName = agency.name || "Your agency";
  const producerCount = (AppData.REPS || []).length;
  const stateCount = _statesCovered();
  const periodLabel = period === "MTD" ? "Month to date" : period === "T12" ? "Trailing 12" : "Year to date";

  const ask = (q) => {
    const prompt = q || askValue.trim();
    if (!prompt) return;
    // Open AI rail if it's not already open, and seed it with the prompt
    window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt, context: "P&L · " + period }}));
    setAskValue("");
  };

  // Compute the live waterfall once so both render and export pull from
  // the same source of truth.
  const waterfall = (() => {
    const live = [
      { l: "Producer commissions (gross)", v: Math.round(m.grossProducer / 100), ind: 0, c: "var(--accent-money)" },
      { l: "  Med Supp",                   v: Math.round(m.medSupp / 100),       ind: 1, c: "var(--accent-money)" },
      { l: "  Final Expense",              v: Math.round(m.fe / 100),            ind: 1, c: "var(--accent-money-dim)" },
      { l: "  Annuity",                    v: Math.round(m.annuity / 100),       ind: 1, c: "var(--state-info)" },
      { l: "Override pool (your slice)",   v: Math.round(m.overrideRev / 100),   ind: 0, c: "var(--accent-money)" },
      { l: "− Lead spend",                 v: -Math.round(m.leadSpend / 100),    ind: 0, c: "var(--state-danger)" },
      { l: "− NIGO chargebacks",           v: -Math.round(m.nigoDrag / 100),     ind: 0, c: "var(--state-danger)" },
      { l: "− SaaS / payroll / other",     v: -Math.round(m.fixedCosts / 100),   ind: 0, c: "var(--text-quaternary)" },
    ];
    // Net to owner = override - outflow (producer commissions are paid OUT to producers, not owner revenue)
    const net = Math.round(m.overrideRev / 100) - Math.round(m.leadSpend / 100) - Math.round(m.nigoDrag / 100) - Math.round(m.fixedCosts / 100);
    live.push({ l: "Net to owner", v: net, ind: 0, c: net >= 0 ? "var(--accent-money)" : "var(--state-danger)", bold: true });
    return live;
  })();

  const exportAudit = () => {
    const slug = (agency.slug || agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agency");
    const payload = {
      period, period_label: periodLabel,
      generated_at: new Date().toISOString(),
      agency: { id: agency.id, slug: agency.slug, name: agencyName, plan: agency.plan, is_imo: agency.is_imo },
      kpis: {
        override_revenue_cents: m.overrideRev,
        ap_submitted_cents: m.apSubmitted,
        apps_count: m.apsCount,
        nigo_drag_cents: m.nigoDrag,
        gross_producer_comp_cents: m.grossProducer,
        lead_spend_cents: m.leadSpend,
        fixed_costs_cents: m.fixedCosts,
      },
      waterfall: waterfall.map(r => ({ label: r.l.trim(), dollars: r.v })),
      anomalies,
      counts: {
        producers: producerCount,
        states_covered: stateCount,
        policies: (AppData.POLICIES || []).length,
        commissions: (AppData.COMMISSIONS || []).length,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}-audit-${period.toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${period} audit pack`, "success");
  };

  // GAP-RP1 — CSV export of the live PnL waterfall (separate from the JSON audit pack)
  const exportPnlCsv = () => {
    const slug = (agency.slug || agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agency");
    const headers = ["Line","Dollars","Period"];
    const rows = waterfall.map(r => [r.l.trim(), r.v, period]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}-pnl-${period.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${period} PnL CSV`, "success");
  };

  const handleAnomaly = (target) => {
    if (target) window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: target }}));
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Agency P&L</div>
          <div className="page-sub">{agencyName} · {periodLabel} · {producerCount} producer{producerCount === 1 ? "" : "s"} · {stateCount} state{stateCount === 1 ? "" : "s"} · {m.hasLive ? "live" : "needs data"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.SectionPill items={[{k:"MTD",l:"MTD"},{k:"T12",l:"T12"},{k:"YTD",l:"YTD"}]} value={period} onChange={setPeriod} dense/>
          <button className="btn" onClick={exportPnlCsv} title="Download waterfall as CSV">CSV</button>
          <button className="btn" onClick={exportAudit}><Icons.ArrowUpRight size={13}/> Export audit</button>
        </div>
      </div>

      {/* Ask the Book — actually wired to the AI rail */}
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, marginBottom: 14 }}>
        <Icons.Sparkles size={14} style={{ color: "var(--accent-money)" }}/>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12.5, flex: "0 0 auto" }}>Ask the Book —</span>
        <input
          className="text-input"
          value={askValue}
          onChange={(e) => setAskValue(e.target.value)}
          placeholder='e.g. "Which downlines have persistency under 80% on FE 13-mo?"'
          style={{ flex: 1, background: "transparent", border: 0, color: "var(--text-primary)", padding: 0, fontSize: 12.5, outline: "none" }}
        />
        <button type="submit" className="btn btn-ghost" style={{ padding: "2px 8px" }}><Icons.Send size={11}/></button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, marginTop: -6 }}>
        {[
          "Which downlines drag persistency below 80%?",
          "Top 3 producers by override contribution this month",
          "If I cut the worst-performing lead source, what's the net impact?",
        ].map((q, i) => (
          <button key={i} className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => ask(q)}>{q}</button>
        ))}
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label={`Override revenue · ${period}`} value={overrideKpi} prefix={overrideKpi === "—" ? "" : "$"} sub={overrideSub} trend={m.overrideRevDelta != null ? (m.overrideRevDelta >= 0 ? "up" : "down") : undefined} spark={m.sparkRev}/>
        <Shared.KpiCard label="AP submitted" value={apKpi} prefix={apKpi === "—" ? "" : "$"} sub={apSub} trend={m.apSubmittedDelta != null ? (m.apSubmittedDelta >= 0 ? "up" : "down") : undefined} spark={m.sparkOR}/>
        <Shared.KpiCard label="NIGO drag" value={nigoKpi} prefix={nigoKpi === "—" ? "" : "$"} sub={nigoSub} trend={m.nigoDragDelta != null ? (m.nigoDragDelta <= 0 ? "up" : "down") : undefined} neg={m.nigoDrag > 0}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.TrendingUp size={13}/>
            <h3>Revenue waterfall · {periodLabel.toLowerCase()}</h3>
            <span className="meta">drill any row</span>
          </div>
          <div className="list">
            {(!m.hasLive) && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                No commission or policy data yet. Submit your first app or import commissions to see the waterfall.
              </div>
            )}
            {m.hasLive && (() => {
              const max = Math.max(...waterfall.map(r => Math.abs(r.v)), 1);
              return waterfall.map((r, i) => ({ ...r, w: Math.max(2, Math.round(Math.abs(r.v) / max * 100)) }));
            })().map((r, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 110px", height: 36, paddingLeft: 14 + r.ind * 16, cursor: "pointer", background: waterfallDrill === r.l ? "var(--bg-raised)" : undefined }}
                onClick={() => setDrill(waterfallDrill === r.l ? null : r.l)}>
                <div style={{ color: r.bold ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: r.bold ? 600 : 400, fontSize: 12.5 }}>{r.l}</div>
                <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden", margin: "0 14px" }}>
                  <div style={{ width: `${r.w}%`, height: "100%", background: r.c }}></div>
                </div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: r.bold ? 600 : 500, color: r.v < 0 ? "var(--state-danger)" : "var(--text-primary)" }}>${Math.abs(r.v).toLocaleString()}</div>
              </div>
            ))}
            {waterfallDrill && (() => {
              // Real drill: pull contributing rows from the relevant ledger.
              const label = waterfallDrill.trim();
              const reps = AppData.REPS || [];
              const repName = (id) => reps.find(r => r.id === id)?.name || id;
              const policies = AppData.POLICIES || [];
              const policyById = Object.fromEntries(policies.map(p => [p.id, p]));
              let rows = [];
              let nav = null;

              if (/^Producer commissions/i.test(label) || /Med Supp|Final Expense|Annuity/i.test(label)) {
                const re = label.includes("Med Supp") ? /med\s*supp|plan\s*g|plan\s*n/i
                  : label.includes("Final Expense") ? /final\s*expense|^fe\b|fe\s/i
                  : label.includes("Annuity") ? /annuity|spda|fia/i : null;
                const filtered = (AppData.COMMISSIONS || []).filter(c => c.kind !== "override" && (!re || re.test(String(policyById[c.policyId]?.product || ""))));
                const byRep = {};
                for (const c of filtered) byRep[c.repId] = (byRep[c.repId] || 0) + (c.amount || 0);
                rows = Object.entries(byRep).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rid, cents]) => ({ k: repName(rid), v: cents }));
                nav = "performance";
              } else if (/Override pool/i.test(label)) {
                const filtered = (AppData.COMMISSIONS || []).filter(c => c.kind === "override");
                const byRep = {};
                for (const c of filtered) byRep[c.repId] = (byRep[c.repId] || 0) + (c.amount || 0);
                rows = Object.entries(byRep).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rid, cents]) => ({ k: repName(rid) + " (override)", v: cents }));
                nav = "performance";
              } else if (/Lead spend/i.test(label)) {
                const exp = (AppData.EXPENSES || []).filter(e => e.kind === "lead_spend").slice(0, 5);
                rows = exp.map(e => ({ k: e.notes || e.lead_source_id || "lead spend", v: -(e.amount_cents || 0) }));
                nav = "expenses";
              } else if (/NIGO/i.test(label)) {
                const cb = AppData.CLAWBACKS || [];
                const byRep = {};
                for (const c of cb) byRep[c.repId] = (byRep[c.repId] || 0) + (c.amount || 0);
                rows = Object.entries(byRep).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rid, cents]) => ({ k: repName(rid), v: -cents }));
                nav = "nigo";
              } else if (/SaaS|payroll/i.test(label)) {
                const exp = (AppData.EXPENSES || []).filter(e => e.kind !== "lead_spend").slice(0, 5);
                rows = exp.map(e => ({ k: e.notes || e.kind || "fixed cost", v: -(e.amount_cents || 0) }));
                nav = "expenses";
              }

              return (
                <div style={{ padding: 12, background: "var(--bg-raised)", borderTop: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong style={{ color: "var(--text-primary)" }}>{label}</strong>
                    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>top contributors</span>
                  </div>
                  {rows.length === 0 && <div style={{ color: "var(--text-quaternary)", fontSize: 11.5 }}>No contributors found in this period.</div>}
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11.5 }}>
                      <span>{r.k}</span>
                      <span className="tabular" style={{ color: r.v < 0 ? "var(--state-danger)" : "var(--text-primary)" }}>${Math.abs(Math.round(r.v / 100)).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {nav && <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: nav }}))}><Icons.ArrowUpRight size={11}/> Open ledger</button>}
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => ask(`Break down "${label}" — top 3 contributors and what changed vs last ${period}`)}><Icons.Sparkles size={10}/> Ask the Book</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/>
              <h3>Anomalies</h3>
              <span className="meta">
                {anomalies.length === 0 ? "all clear" : `${anomalies.length} signal${anomalies.length === 1 ? "" : "s"}`}
                {snoozedCount > 0 && <> · <button className="btn btn-ghost" style={{ padding: "1px 6px", fontSize: 10.5 }} onClick={unsnoozeAll} title="Restore all snoozed anomalies">{snoozedCount} snoozed · clear</button></>}
              </span>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {anomalies.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "16px 0", textAlign: "center" }}>
                  {snoozedCount > 0
                    ? <>All visible anomalies snoozed. <button className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={unsnoozeAll}>Restore</button></>
                    : "No anomalies detected. Persistency, NIGO, certs, and lead-spend trends look normal."}
                </div>
              )}
              {anomalies.map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
                  <span className={`dot dot-${x.sev === "danger" ? "danger" : x.sev === "warn" ? "warn" : "live"}`} style={{ marginTop: 5 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.t}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{x.b}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => handleAnomaly(x.target)}>{x.a}</button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => snoozeFor(x, 24)} title="Hide for 24h">
                      <Icons.X size={10}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <h3>Recruiting funnel</h3>
              <span className="meta">{recFunnel.length === 0 ? "no applicants" : "live · recruiting_applicants"}</span>
            </div>
            <div style={{ padding: 14 }}>
              {recFunnel.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "16px 0", textAlign: "center" }}>
                  No applicant data yet. Connect a recruiting source on the Recruiting page.
                </div>
              )}
              {recFunnel.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 60px 1fr", padding: "5px 0", alignItems: "center", fontSize: 12, borderBottom: i < recFunnel.length - 1 ? "1px solid var(--border-subtle)" : 0 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
                  <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, marginLeft: 14, overflow: "hidden" }}>
                    <div style={{ width: `${r.w}%`, height: "100%", background: "var(--accent-money)" }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageOrgTree() {
  const REPS = AppData.REPS || [];
  const [view, setView] = React.useState("tree");
  const agency = (window.__activeAgency || {});
  // Prefer the agency object's name; fall back to me().agency_name so brand-new
  // tenants see their real name even before the agencies row is hydrated.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const agencyName = agency.name || meIdent?.agency_name || "Your agency";
  const rootTier = agency.is_imo ? "diamond" : "platinum";

  // Derive groups from rep.region if present, else single bucket. Empty agencies
  // render the agency root with no children.
  const regionsMap = {};
  for (const r of REPS) {
    const key = r.region || "_all";
    (regionsMap[key] = regionsMap[key] || []).push(r);
  }
  const hasRegions = Object.keys(regionsMap).length > 1 || (Object.keys(regionsMap)[0] && Object.keys(regionsMap)[0] !== "_all");
  const regionList = hasRegions
    ? Object.entries(regionsMap).map(([k, members]) => ({ id: `region:${k}`, name: k, members }))
    : [];

  // ── Live rollups: book of business + persistency + NIGO rate per rep ──
  // book = sum of AP cents on policies owned by rep. Falls back to rep.mtd (cents)
  // for sizing only when the rep has no policies (empty BOB renders as "—").
  const policies = AppData.POLICIES || [];
  const nigos    = AppData.NIGOS    || [];
  const commissions = AppData.COMMISSIONS || [];
  const bookByRep = {}, polCountByRep = {}, activeByRep = {}, nigoByRep = {}, overrideByRep = {};
  for (const p of policies) {
    if (!p.owner) continue;
    bookByRep[p.owner]      = (bookByRep[p.owner] || 0) + (p.ap || 0);
    polCountByRep[p.owner]  = (polCountByRep[p.owner] || 0) + 1;
    if (p.persistency === "active" || p.persistency === "in_force") {
      activeByRep[p.owner]  = (activeByRep[p.owner] || 0) + 1;
    }
  }
  const policyOwnerById = Object.fromEntries(policies.map(p => [p.id, p.owner]));
  for (const n of nigos) {
    const owner = n.assignedTo || (n.policyId && policyOwnerById[n.policyId]);
    if (owner) nigoByRep[owner] = (nigoByRep[owner] || 0) + 1;
  }
  for (const c of commissions) {
    if (c.kind === "override" && c.repId) {
      overrideByRep[c.repId] = (overrideByRep[c.repId] || 0) + (c.amount || 0);
    }
  }
  // Book of business in dollars. If no policies on file yet, use MTD as a
  // sizing proxy so the org chart still renders meaningful node sizes.
  const bookFor = (r) => {
    const cents = bookByRep[r.id] || 0;
    return cents > 0 ? Math.round(cents / 100) : (r.mtd || 0);
  };
  const persistencyFor = (r) => {
    const total = polCountByRep[r.id] || 0;
    if (total === 0) return null;
    return Math.round(((activeByRep[r.id] || 0) / total) * 1000) / 10;
  };
  const nigoRateFor = (r) => {
    const total = polCountByRep[r.id] || 0;
    if (total === 0) return null;
    return Math.round(((nigoByRep[r.id] || 0) / total) * 1000) / 10;
  };

  // Hierarchical layout (Tree) — root → optional regions → reps. Adaptive to
  // agency size: 0 reps shows just the agency root; small agencies skip the
  // region layer; multi-region agencies group accordingly.
  const sizeFromBook = (book) => Math.max(8, Math.min(32, 12 + (book / 8000)));
  const W = 960;
  const repNodes = REPS.length > 0 ? (() => {
    if (hasRegions) {
      const out = [];
      let xOff = 0;
      for (let r = 0; r < regionList.length; r++) {
        const reg = regionList[r];
        const w = (reg.members.length / REPS.length) * (W - 80);
        reg.members.forEach((mem, i) => {
          const x = 40 + xOff + (reg.members.length === 1 ? w / 2 : (i / (reg.members.length - 1)) * w);
          out.push({ id: mem.id, x: Math.round(x), y: 290, name: mem.name, tier: mem.tier, size: sizeFromBook(bookFor(mem)), book: bookFor(mem) });
        });
        xOff += w;
      }
      return out;
    }
    return REPS.map((r, i) => {
      const x = REPS.length === 1 ? W / 2 : 40 + (i / (REPS.length - 1)) * (W - 80);
      return { id: r.id, x: Math.round(x), y: hasRegions ? 290 : 220, name: r.name, tier: r.tier, size: sizeFromBook(bookFor(r)), book: bookFor(r) };
    });
  })() : [];
  const regionNodes = hasRegions ? regionList.map((reg, i) => {
    const x = regionList.length === 1 ? W / 2 : 200 + (i / (regionList.length - 1)) * (W - 400);
    return { id: reg.id, x: Math.round(x), y: 160, name: reg.name, tier: "platinum", size: 18 };
  }) : [];
  const tree = [
    { id: "owner", x: W / 2, y: 40, name: agencyName, tier: rootTier, size: 22 },
    ...regionNodes,
    ...repNodes,
  ];
  const links = hasRegions
    ? [
        ...regionNodes.map(n => ["owner", n.id]),
        ...REPS.map(r => [`region:${r.region || "_all"}`, r.id]),
      ]
    : REPS.map(r => ["owner", r.id]);

  // Radial layout — owner at center, regions ring (if any), reps on outer ring
  const cx = W / 2, cy = 220;
  const radial = [
    { id: "owner", x: cx, y: cy, name: agencyName, tier: rootTier, size: 22 },
    ...regionList.map((reg, i) => {
      const a = (i / Math.max(regionList.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return { id: reg.id, x: cx + Math.cos(a) * 110, y: cy + Math.sin(a) * 110, name: reg.name, tier: "platinum", size: 18 };
    }),
    ...REPS.map((r, i) => {
      const a = REPS.length > 0 ? (i / REPS.length) * Math.PI * 2 - Math.PI / 2 : 0;
      return { id: r.id, x: cx + Math.cos(a) * 200, y: cy + Math.sin(a) * 200, name: r.name, tier: r.tier, size: sizeFromBook(bookFor(r)), book: bookFor(r) };
    }),
  ];
  const radialLinks = hasRegions
    ? [
        ...regionList.map(reg => ["owner", reg.id]),
        ...REPS.map(r => [`region:${r.region || "_all"}`, r.id]),
      ]
    : REPS.map(r => ["owner", r.id]);

  const layout = view === "radial" ? radial : tree;
  const lk = view === "radial" ? radialLinks : links;

  const colorFor = (t) => ({ bronze:"#A97142", silver:"#C0C0C8", gold:"#D9A441", platinum:"#E5E4E2", diamond:"#B9F2FF" }[t]);
  const [hover, setHover] = React.useState("owner");
  const sel = layout.find(n => n.id === hover) || layout[0];

  // Flat sortable rep table
  const [sort, setSort] = React.useState({ key: "mtd", dir: "desc" });
  const sortBy = (k) => setSort(s => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  const flatRows = [...REPS].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.dir === "desc" ? -cmp : cmp;
  });
  const SortH = ({ k, label, right }) => (
    <div onClick={() => sortBy(k)} style={{ cursor: "pointer", textAlign: right ? "right" : "left", display: "flex", alignItems: "center", gap: 4, justifyContent: right ? "flex-end" : "flex-start" }}>
      {label}{sort.key === k && <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{sort.dir === "desc" ? "↓" : "↑"}</span>}
    </div>
  );

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Organization</div>
          <div className="page-sub">{agencyName} · {REPS.length} producer{REPS.length === 1 ? "" : "s"} {hasRegions ? `· ${regionList.length} region${regionList.length === 1 ? "" : "s"}` : ""} · click a node for scorecard</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2 }}>
            {[["tree","Tree"],["radial","Radial"],["flat","Flat"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className="btn btn-ghost" style={{ padding: "3px 10px", background: view === k ? "var(--bg-raised)" : "transparent", color: view === k ? "var(--text-primary)" : "var(--text-tertiary)" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {view !== "flat" && (
        <div className="org-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
          <div className="panel" style={{ height: 480 }}>
            <div className="panel-h">
              <h3>{agencyName} {view === "radial" ? "· radial" : (hasRegions ? "→ regions → producers" : "→ producers")}</h3>
              <span className="meta">color = tier · size = book of business</span>
            </div>
            {REPS.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                No producers yet. Invite your first producer from <a href="#" onClick={(e) => { e.preventDefault(); try { sessionStorage.setItem("repflow.settings.tab", "team"); } catch {}; if (window.gotoPage) window.gotoPage("settings"); }} style={{ color: "var(--accent-money)" }}>Settings → Team</a>.
              </div>
            )}
            {REPS.length > 0 && <svg viewBox="0 0 960 440" style={{ width: "100%", height: "calc(100% - 44px)" }}>
              <defs>
                {layout.map(n => (
                  <radialGradient key={`g-${view}-${n.id}`} id={`g-${view}-${n.id}`}>
                    <stop offset="0%" stopColor={colorFor(n.tier)} stopOpacity="0.9"/>
                    <stop offset="100%" stopColor={colorFor(n.tier)} stopOpacity="0.5"/>
                  </radialGradient>
                ))}
              </defs>
              {lk.map(([a, b], i) => {
                const A = layout.find(n => n.id === a), B = layout.find(n => n.id === b);
                if (!A || !B) return null;
                return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--border-subtle)" strokeWidth="1"/>;
              })}
              {layout.map(n => (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }} onMouseEnter={() => setHover(n.id)} onClick={() => setHover(n.id)}>
                  <circle r={n.size + 8} fill="none" stroke={colorFor(n.tier)} strokeOpacity={hover === n.id ? 0.5 : 0.15} strokeWidth={hover === n.id ? 2 : 1.5}/>
                  <circle r={n.size} fill={`url(#g-${view}-${n.id})`} stroke={colorFor(n.tier)} strokeWidth="1.2"/>
                  <text x="0" y={n.size + 18} textAnchor="middle" fill="var(--text-secondary)" fontSize="10.5" fontFamily="var(--font-ui)">{n.name.split(" ")[0]}</text>
                </g>
              ))}
            </svg>}
          </div>

          <div className="panel">
            <div className="panel-h"><h3>{sel?.name || agencyName}</h3><Shared.TierChip tier={sel?.tier || rootTier}/></div>
            {(() => {
              // Resolve scope: rep node → that rep; region/owner → all reps in subtree.
              const repObj = sel?.id ? REPS.find(r => r.id === sel.id) : null;
              const regionId = sel?.id && sel.id.startsWith("region:") ? sel.id.slice(7) : null;
              const scopeRepIds = repObj ? [repObj.id]
                : regionId ? REPS.filter(r => (r.region || "_all") === regionId).map(r => r.id)
                : REPS.map(r => r.id);
              const totalBookCents = scopeRepIds.reduce((a, id) => a + (bookByRep[id] || 0), 0);
              const totalBookDollars = totalBookCents > 0 ? Math.round(totalBookCents / 100) : 0;
              const totalPolicies = scopeRepIds.reduce((a, id) => a + (polCountByRep[id] || 0), 0);
              const totalActive   = scopeRepIds.reduce((a, id) => a + (activeByRep[id] || 0), 0);
              const totalNigos    = scopeRepIds.reduce((a, id) => a + (nigoByRep[id] || 0), 0);
              const totalOverrideCents = scopeRepIds.reduce((a, id) => a + (overrideByRep[id] || 0), 0);
              const persistencyPct = totalPolicies > 0 ? Math.round((totalActive / totalPolicies) * 1000) / 10 : null;
              const nigoRatePct    = totalPolicies > 0 ? Math.round((totalNigos / totalPolicies) * 1000) / 10  : null;
              const recApps = AppData.RECRUITING_APPLICANTS || [];
              const cutoff = Date.now() - 30 * 86400000;
              const recruitsL30 = recApps.filter(a => scopeRepIds.includes(a.recruiterRepId) && a.createdAt && new Date(a.createdAt).getTime() >= cutoff).length;
              const producerCommScope = commissions.filter(c => c.kind !== "override" && scopeRepIds.includes(c.repId)).reduce((a, c) => a + (c.amount || 0), 0);
              const overridePct = producerCommScope > 0 ? Math.round((totalOverrideCents / producerCommScope) * 1000) / 10 : null;
              const dash = (v, suffix = "") => v == null ? "—" : `${v}${suffix}`;
              return (
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Book of business</div>
              <div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", marginTop: 4 }}>{totalBookDollars > 0 ? `$${totalBookDollars.toLocaleString()}` : "—"}</div>
              <div style={{ fontSize: 11.5, color: totalBookDollars > 0 ? "var(--accent-money)" : "var(--text-quaternary)", marginTop: 2 }}>
                {totalBookDollars > 0 ? <><Icons.TrendingUp size={11}/> {totalPolicies} {totalPolicies === 1 ? "policy" : "policies"} · {totalActive} active</> : "no policies on file"}
              </div>

              <div className="divider"></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Persistency</div><div className="tabular" style={{ fontWeight: 500 }}>{dash(persistencyPct, "%")}</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>NIGO rate</div><div className="tabular" style={{ fontWeight: 500 }}>{dash(nigoRatePct, "%")}</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Recruits L30</div><div className="tabular" style={{ fontWeight: 500 }}>{recruitsL30 || "—"}</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Override</div><div className="tabular" style={{ fontWeight: 500 }}>{dash(overridePct, "%")}</div></div>
              </div>

              <div className="divider"></div>
              {sel?.id && AppData.REPS.find(r => r.id === sel.id) && (
                <Shared.Field label="Tier override">
                  <Shared.Select value={sel.tier} onChange={async (v) => {
                    await AppData.mutate.tieringOverride(sel.id, v);
                    window.toast && window.toast(`${sel.name} → ${v.toUpperCase()}${AppData.LIVE ? " · saved" : ""}`, "success");
                  }} options={["bronze","silver","gold","platinum","diamond"].map(t => ({ v: t, l: t.toUpperCase() }))}/>
                </Shared.Field>
              )}
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => {
                // Carry the selected scope into the target page via
                // sessionStorage so downstream pages can pre-filter to
                // this node's reps. Cleared on first read by the consumer.
                try {
                  if (scopeRepIds && scopeRepIds.length > 0) {
                    sessionStorage.setItem("repflow.scope.rep_ids", JSON.stringify(scopeRepIds));
                    sessionStorage.setItem("repflow.scope.label", sel?.name || agencyName);
                  }
                } catch {}
                if (repObj) {
                  // Single rep — performance page filtered to them
                  window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "performance" }}));
                } else {
                  // Region/owner node — attribution by region
                  window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "attribution" }}));
                }
              }}><Icons.ArrowUpRight size={12}/> Drill into sub-tree</button>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {view === "flat" && (
        <div className="panel">
          <div className="panel-h"><h3>All producers · sortable</h3><span className="meta">{REPS.length}</span></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 100px 80px 80px 80px" }}>
              <SortH k="name"   label="Producer"/>
              <SortH k="tier"   label="Tier"/>
              <SortH k="mtd"    label="MTD" right/>
              <SortH k="streak" label="Streak" right/>
              <SortH k="dials"  label="Dials" right/>
              <SortH k="appts"  label="Appts" right/>
            </div>
            {flatRows.map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.6fr 90px 100px 80px 80px 80px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={22}/>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{r.handle}</span>
                </div>
                <div><Shared.TierChip tier={r.tier} compact/></div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${(r.mtd || 0).toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: (r.streak || 0) > 10 ? "var(--accent-heat)" : "var(--text-tertiary)" }}>{r.streak || 0}d</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.dials || 0}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.appts || 0}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.PagePnL = PagePnL;
window.PageOrgTree = PageOrgTree;
