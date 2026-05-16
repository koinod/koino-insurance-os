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
  // Training courses + completion now live in TRAINING_* (migration 0019);
  // legacy AppData.COURSES is being retired. Read both, prefer TRAINING_*.
  const trainingCourses     = AppData.TRAINING_COURSES || [];
  const trainingProgress    = AppData.TRAINING_PROGRESS || {};
  const trainingAssignments = AppData.TRAINING_ASSIGNMENTS || [];
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

  // 3) AEP / compliance cert gaps — count AEP/Compliance courses that have
  //    at least one assigned rep who hasn't completed all lessons. Replaces
  //    the legacy AppData.COURSES.status === "complete" check.
  const certCourses = trainingCourses.filter(c => /AEP|Compliance|TPMO/i.test(c.track || ""));
  const incompleteCerts = certCourses.filter(c => {
    const totalLessons = (c.sections || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
    if (totalLessons === 0) return false;
    const assignment = trainingAssignments.find(a => a.courseId === c.id);
    const requiredReps = c.required
      ? Object.keys(trainingProgress) // any rep on the floor is on the hook
      : (assignment?.repIds || []);
    if (requiredReps.length === 0) return false;
    return requiredReps.some(repId => {
      const done = trainingProgress[repId]?.[c.id]?.completedLessons?.length || 0;
      return done < totalLessons;
    });
  });
  if (incompleteCerts.length > 0) {
    anomalies.push({
      sev: "warn",
      t: "Cert gap",
      b: `${incompleteCerts.length} cert${incompleteCerts.length === 1 ? "" : "s"} not complete (TPMO/AEP)`,
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
  const anomalies = _computeAnomalies();
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
            <h3>Revenue waterfall · this month</h3>
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
              <span className="meta">{anomalies.length === 0 ? "all clear" : `${anomalies.length} signal${anomalies.length === 1 ? "" : "s"}`}</span>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {anomalies.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "16px 0", textAlign: "center" }}>
                  No anomalies detected. Persistency, NIGO, certs, and lead-spend trends look normal.
                </div>
              )}
              {anomalies.map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
                  <span className={`dot dot-${x.sev === "danger" ? "danger" : x.sev === "warn" ? "warn" : "live"}`} style={{ marginTop: 5 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.t}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{x.b}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => handleAnomaly(x.target)}>{x.a}</button>
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
                if (sel?.id && AppData.REPS.find(r => r.id === sel.id)) {
                  // It's a rep — go to leaderboard filtered to them (placeholder: just go to leaderboard)
                  window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "leaderboard" }}));
                } else {
                  // Region/owner node — go to attribution by region
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

/* ─────────────────────────────────────────────────────────────────────────────
   MANAGER SECTION — merged from page-manager.jsx
   Manager sees team scope (scopeRepIds()); owner sees full agency.
   Both roles can access all components below.
   ───────────────────────────────────────────────────────────────────────────── */

const _MGR_TIER_TARGETS_FALLBACK = {
  bronze: 12000, silver: 20000, gold: 35000, platinum: 50000, diamond: 80000,
};
function MGR_TIER_TARGETS_LIVE() {
  return (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().tier_targets) || _MGR_TIER_TARGETS_FALLBACK;
}
const MGR_TIER_TARGETS = new Proxy({}, {
  get(_t, key) { return MGR_TIER_TARGETS_LIVE()[key]; },
  ownKeys()   { return Object.keys(MGR_TIER_TARGETS_LIVE()); },
  getOwnPropertyDescriptor(_t, key) {
    return { configurable: true, enumerable: true, value: MGR_TIER_TARGETS_LIVE()[key] };
  },
});
function mgrRiskScore(rep) {
  let s = 0;
  if (rep.streak === 0)              s += 30;
  if ((rep.today || 0) === 0)        s += 25;
  if ((rep.dials || 0) < 30)         s += 20;
  const target = MGR_TIER_TARGETS[rep.tier] || 12000;
  if ((rep.mtd || 0) < target * 0.4) s += 15;
  if (rep.presence === "off")        s += 10;
  if ((rep.streak || 0) >= 14)       s -= 15;
  return Math.max(0, Math.min(100, s));
}
function mgrBreakoutScore(rep) {
  let s = 0;
  const target = MGR_TIER_TARGETS[rep.tier] || 12000;
  if ((rep.mtd || 0) >= target * 1.3)            s += 30;
  const avgToday = (rep.mtd || 0) / 22;
  if ((rep.today || 0) >= avgToday * 1.5 && (rep.today || 0) > 500) s += 25;
  if ((rep.streak || 0) >= 10)                   s += 20;
  if (rep.presence === "live" && (rep.dials || 0) >= 60) s += 15;
  if ((rep.appts || 0) >= 4)                     s += 10;
  return Math.max(0, Math.min(100, s));
}
function useMeReady() {
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
}
function scopedReps() {
  const reps = (window.AppData && window.AppData.REPS) || [];
  const ids = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  if (ids === null) return reps;
  if (ids.length === 0) return reps;
  return reps.filter(r => ids.includes(r.id));
}

function PageTeam() {
  useMeReady();
  const { QUEUE } = AppData;
  const teamReps = scopedReps();
  const [drag, setDrag] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const [assigned, setAssigned] = React.useState({});
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkPicks, setBulkPicks] = React.useState({});
  const [routingOpen, setRoutingOpen] = React.useState(false);
  const [repDrill, setRepDrill] = React.useState(null);
  const [noteFor, setNoteFor] = React.useState(null);
  const [alertFor, setAlertFor] = React.useState(null);

  const visibleQueue = QUEUE.filter(q => !assigned[q.id]);

  const suggestRep = (q) => {
    const counts = teamReps.reduce((acc, r) => ({ ...acc, [r.id]: 0 }), {});
    Object.values(assigned).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    Object.values(bulkPicks).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    const ranked = [...teamReps].sort((a, b) => {
      if (a.presence !== b.presence) return a.presence === "live" ? -1 : 1;
      if (a.tier !== b.tier) return ["diamond","platinum","gold","silver","bronze"].indexOf(a.tier) - ["diamond","platinum","gold","silver","bronze"].indexOf(b.tier);
      return counts[a.id] - counts[b.id];
    });
    return (ranked[0] || teamReps[0])?.id;
  };

  const openBulk = () => {
    const picks = {};
    visibleQueue.forEach(q => picks[q.id] = suggestRep(q));
    setBulkPicks(picks);
    setBulkOpen(true);
  };
  const commitBulk = async () => {
    const picks = { ...bulkPicks };
    setAssigned({ ...assigned, ...picks });
    setBulkOpen(false);
    window.toast && window.toast(`Routing ${Object.keys(picks).length} leads${AppData.LIVE ? "..." : ""}`, "info");
    if (AppData.LIVE) {
      try {
        await Promise.all(Object.entries(picks).map(([qid, rid]) => AppData.mutate.queueAssign(qid, rid)));
        window.toast && window.toast(`Routed ${Object.keys(picks).length} leads`, "success");
      } catch (e) { window.toast?.(`Route batch failed: ${e?.message || e}`, "error"); console.error("[owner.queueAssignBatch]", e); }
    }
  };

  const orderedReps = [...teamReps]
    .map(r => ({ r, risk: mgrRiskScore(r), brk: mgrBreakoutScore(r) }))
    .sort((a, b) => {
      if ((a.risk >= 50) !== (b.risk >= 50)) return a.risk >= 50 ? -1 : 1;
      if ((a.brk  >= 50) !== (b.brk  >= 50)) return a.brk  >= 50 ? -1 : 1;
      return (b.r.mtd || 0) - (a.r.mtd || 0);
    });

  const subline = teamReps.length === 0
    ? "No producers in your downline yet"
    : `${teamReps.length} producer${teamReps.length === 1 ? "" : "s"} in your downline · drag a lead onto a card · routing rules validate license + carrier appt + tier`;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Team Board</div>
          <div className="page-sub">{subline}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setRoutingOpen(true)}><Icons.Settings size={13}/> Routing rules</button>
          <button className="btn btn-primary" onClick={openBulk} disabled={visibleQueue.length === 0 || teamReps.length === 0}><Icons.Plus size={13}/> Bulk assign</button>
        </div>
      </div>

      <Shared.SectionPill
        items={[{k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},{k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"}]}
        value="team"
        onChange={(k) => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      <div className="team-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Phone size={13}/><h3>Unassigned queue</h3><span className="meta">{visibleQueue.length}</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleQueue.map(q => (
              <div key={q.id}
                draggable
                onDragStart={() => setDrag(q)}
                onDragEnd={() => setDrag(null)}
                style={{ padding: 10, background: drag?.id === q.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, cursor: "grab" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500 }}>
                  <Icons.GripVertical size={12} style={{ color: "var(--text-quaternary)" }}/>
                  {q.lead}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>{q.age} · {q.state} · {q.product}</span>
                  <span className="tabular" style={{ color: q.elapsed < 30 ? "var(--accent-money)" : "var(--state-warning)" }}>{q.elapsed}s</span>
                </div>
              </div>
            ))}
            {visibleQueue.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>All leads assigned. Pull more from AEP pool?</div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {orderedReps.length === 0 && (
            <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No producers visible at your scope. Invite reps from <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } })); }} style={{ color: "var(--accent-money)" }}>Recruiting</a>.
            </div>
          )}
          {orderedReps.map(({ r, risk, brk }) => {
            const isRisk = risk >= 50;
            const isBreak = brk >= 50;
            const target = MGR_TIER_TARGETS[r.tier] || 12000;
            return (
              <div key={r.id} className="panel"
                onDragOver={(e) => { e.preventDefault(); setDrop(r.id); }}
                onDragLeave={() => setDrop(null)}
                onDrop={async () => {
                  if (drag) {
                    setAssigned({ ...assigned, [drag.id]: r.id });
                    const dragSnap = drag;
                    setDrag(null); setDrop(null);
                    try {
                      await AppData.mutate.queueAssign(dragSnap.id, r.id);
                      window.toast && window.toast(`${dragSnap.lead} → ${r.name.split(" ")[0]}${AppData.LIVE ? " · routed" : ""}`, "success");
                    } catch (e) { window.toast?.(`Route failed: ${e?.message || e}`, "error"); console.error("[owner.queueAssignDnD]", e); }
                  }
                }}
                style={{
                  borderColor: drop === r.id ? "var(--accent-money)"
                              : isRisk ? "color-mix(in oklch, var(--state-danger) 35%, transparent)"
                              : isBreak ? "color-mix(in oklch, var(--accent-money) 35%, transparent)"
                              : undefined,
                  background: drop === r.id ? "color-mix(in oklch, var(--accent-money) 6%, var(--bg-elevated))" : undefined,
                  cursor: "pointer"
                }}
                onClick={(e) => { if (e.target.closest("button")) return; setRepDrill(r); }}>
                <div className="panel-h">
                  <Shared.Avatar rep={r} size={22}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                      {r.presence === "live" ? "on call" : "idle"} · {r.appts} appts
                    </div>
                  </div>
                  <Shared.TierChip tier={r.tier} compact/>
                </div>
                <div style={{ padding: 10 }}>
                  {(isRisk || isBreak) && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {isRisk && (
                        <span className="chip" title="At-risk score from RETAINER heuristic" style={{
                          color: "var(--state-danger)",
                          borderColor: "color-mix(in oklch, var(--state-danger) 35%, transparent)",
                          background: "color-mix(in oklch, var(--state-danger) 10%, transparent)",
                          fontSize: 10.5
                        }}><Icons.AlertTriangle size={10}/> at-risk · {risk}</span>
                      )}
                      {isBreak && (
                        <span className="chip" title="Breakout score from CLOSER heuristic" style={{
                          color: "var(--accent-money)",
                          borderColor: "color-mix(in oklch, var(--accent-money) 35%, transparent)",
                          background: "color-mix(in oklch, var(--accent-money) 10%, transparent)",
                          fontSize: 10.5
                        }}><Icons.TrendingUp size={10}/> breakout · {brk}</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>MTD</span>
                    <span className="tabular" style={{ color: "var(--text-primary)", fontWeight: 500 }}>${(r.mtd || 0).toLocaleString()} <span style={{ color: "var(--text-quaternary)" }}>/ ${target.toLocaleString()}</span></span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, ((r.mtd || 0) / target) * 100)}%`, height: "100%", background: isRisk ? "var(--state-danger)" : "var(--accent-money)" }}></div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {Object.entries(assigned).filter(([_, rep]) => rep === r.id)?.map(([qid]) => {
                      const q = QUEUE.find(x => x.id === qid);
                      if (!q) return null;
                      return (
                        <div key={qid} style={{ padding: "4px 8px", background: "var(--bg-raised)", borderRadius: 4, fontSize: 11.5, display: "flex", justifyContent: "space-between" }}>
                          <span>{q.lead}</span>
                          <span className="chip chip-money" style={{ fontSize: 9.5 }}>NEW</span>
                        </div>
                      );
                    })}
                    {!Object.values(assigned).includes(r.id) && drag && (
                      <div style={{ padding: 8, border: "1px dashed var(--border-strong)", borderRadius: 4, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>Drop to assign</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                    <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setNoteFor(r); }} title="Coaching note">
                      <Icons.MessageSquare size={11}/> Note
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setAlertFor(r); }} title="Send focus alert">
                      <Icons.Bell size={11}/> Alert
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {routingOpen && <RoutingRulesModal onClose={() => setRoutingOpen(false)}/>}
      {repDrill && <RepDrillSlideout rep={repDrill} onClose={() => setRepDrill(null)} onAddNote={(rep) => { setRepDrill(null); setNoteFor(rep); }}/>}
      {noteFor && <CoachingNoteModal rep={noteFor} onClose={() => setNoteFor(null)}/>}
      {alertFor && <FocusAlertModal rep={alertFor} onClose={() => setAlertFor(null)}/>}

      {bulkOpen && (
        <Shared.Modal title="Bulk assign queue" width={620} onClose={() => setBulkOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setBulkOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={commitBulk}><Icons.Check size={12}/> Assign {Object.keys(bulkPicks).length}</button>
          </>
        }>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>Auto-suggested by presence, tier, and current load. License + carrier appointment validated.</div>
          <div className="list" style={{ border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 1fr 26px" }}>
              <div>Lead</div><div>Source</div><div>Producer</div><div></div>
            </div>
            {visibleQueue.map(q => {
              const rid = bulkPicks[q.id];
              return (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "1.4fr 100px 1fr 26px" }}>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>{q.lead} <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>· {q.product}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{q.source}</div>
                  <div>
                    <Shared.Select value={rid} onChange={(v) => setBulkPicks({ ...bulkPicks, [q.id]: v })} options={teamReps.map(rr => ({ v: rr.id, l: `${rr.name} · ${rr.tier}` }))}/>
                  </div>
                  <button className="icon-btn" title="Skip" onClick={() => { const np = { ...bulkPicks }; delete np[q.id]; setBulkPicks(np); }}><Icons.X size={12}/></button>
                </div>
              );
            })}
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

function CoachingNoteModal({ rep, onClose }) {
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await AppData.mutate.coachingNoteCreate(rep.id, body.trim());
      window.toast && window.toast(`Coaching note saved for ${rep.name.split(" ")[0]}`, "success");
      onClose();
    } catch (_e) { setSaving(false); }
  };
  return (
    <Shared.Modal title={`Coaching note · ${rep.name}`} width={520} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!body.trim() || saving}><Icons.Check size={11}/> {saving ? "Saving…" : "Save note"}</button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>One observation, one ask. Notes thread on the rep's coaching feed and persist to <code style={{ fontSize: 10.5 }}>coaching_notes</code>.</div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`What did you notice on ${rep.name.split(" ")[0]}'s last call? What's the one thing to fix tomorrow?`}
        rows={5}
        className="text-input"
        style={{ width: "100%", minHeight: 100, lineHeight: 1.5, resize: "vertical" }}
      />
    </Shared.Modal>
  );
}

function FocusAlertModal({ rep, onClose }) {
  const presets = [
    { t: "Get on a dial",        b: "You haven't logged a dial in over an hour — get on the next one." },
    { t: "Power hour now",       b: "Power hour starting now. Anyone with idle status: dial." },
    { t: "Cross-sell reminder",  b: "Your latest issue is eligible for a Plan G upsell — call back today." },
    { t: "Streak check-in",      b: "Streak's at risk. One issued today keeps it alive." },
  ];
  const [title, setTitle] = React.useState(presets[0].t);
  const [body,  setBody]  = React.useState(presets[0].b);
  const [severity, setSeverity] = React.useState("info");
  const [sending, setSending] = React.useState(false);
  const submit = async () => {
    setSending(true);
    try {
      await AppData.mutate.notificationCreate({
        repId: rep.id,
        recipientHandle: rep.handle,
        kind: "focus",
        severity,
        title: title.trim(),
        body: body.trim(),
        pageLink: "today",
      });
      window.toast && window.toast(`Alert sent to ${rep.name.split(" ")[0]}`, "success");
      onClose();
    } catch (_e) { setSending(false); }
  };
  const usePreset = (p) => { setTitle(p.t); setBody(p.b); };
  return (
    <Shared.Modal title={`Send focus alert · ${rep.name}`} width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!title.trim() || sending}><Icons.Send size={11}/> {sending ? "Sending…" : "Send alert"}</button>
      </>
    }>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {presets.map((p, i) => (
          <button key={i} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => usePreset(p)}>{p.t}</button>
        ))}
      </div>
      <Shared.Field label="Severity">
        <Shared.Select value={severity} onChange={setSeverity} options={[
          { v: "info",    l: "Info" },
          { v: "warning", l: "Warning" },
          { v: "urgent",  l: "Urgent" },
        ]}/>
      </Shared.Field>
      <Shared.Field label="Title">
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Get on a dial"/>
      </Shared.Field>
      <Shared.Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="text-input"
          style={{ width: "100%", minHeight: 80, lineHeight: 1.5, resize: "vertical" }}
        />
      </Shared.Field>
    </Shared.Modal>
  );
}

function PageCoaching({ role = "manager" }) {
  if (role === "rep") return <CoachingRep/>;
  if (role === "owner") return <CoachingOwner/>;
  return <CoachingManager/>;
}

function deriveCoachingCards() {
  const reps = scopedReps();
  const sessions = (AppData.COACHING_SESSIONS || []).filter(s => reps.find(r => r.id === s.repId));

  if (sessions.length > 0) {
    return sessions.slice(0, 6).map(s => {
      const rep = reps.find(r => r.id === s.repId) || reps[0];
      return {
        id: s.id,
        rep,
        focus: s.focusArea || "Open coaching focus",
        evidence: s.notes || "Recorded in last session — review the call to see the moment.",
        impact: s.outcome === "improvement" ? "+ improvement logged"
              : s.outcome === "no_change"   ? "no measured lift yet"
              : "tracking",
        recordingId: s.recordingId,
        sessionId: s.id,
      };
    });
  }

  return reps.slice(0, 3).map((rep, i) => {
    const risk = mgrRiskScore(rep);
    if (risk >= 50) {
      return {
        id: `seed-${rep.id}`,
        rep,
        focus: rep.streak === 0 ? "Get back on a streak — one issue today" : "Hit your daily dial floor",
        evidence: rep.streak === 0
          ? `Streak broken. Reset starts with one dial → one quote → one app.`
          : `Only ${rep.dials || 0} dials today vs floor of 60. Talk-time is the leading indicator.`,
        impact: "+ persistency + streak recovery",
      };
    }
    if (mgrBreakoutScore(rep) >= 50) {
      return {
        id: `seed-${rep.id}`,
        rep,
        focus: "Lock the breakout in — preserve what's working",
        evidence: `MTD ${(rep.mtd || 0).toLocaleString()} on a ${rep.streak || 0}-day streak. Keep the script tight.`,
        impact: "+ tier promotion likely this month",
      };
    }
    return {
      id: `seed-${rep.id}`,
      rep,
      focus: ["Ask 3 more open-ended questions per hour",
              "Cut talk-listen ratio to 45%",
              "Use the Plan G price-anchor sequence"][i % 3],
      evidence: "Pulled from last 7 days of recordings. Replay the moment to confirm.",
      impact: "+ close rate (cohort)",
    };
  });
}

function CoachingManager() {
  useMeReady();
  const reps = scopedReps();
  const cards = deriveCoachingCards();
  const [replay, setReplay] = React.useState(null);
  const [noteFor, setNoteFor] = React.useState(null);

  const sessions = (AppData.COACHING_SESSIONS || []).filter(s => reps.find(r => r.id === s.repId));
  const recordings = (AppData.RECORDINGS || []).filter(r =>
    !reps.length || reps.find(rr => rr.id === r.repId || rr.id === r.rep_id)
  );
  const avgTalk = recordings.length
    ? Math.round(recordings.reduce((s, r) => s + (r.talkRatio || 0), 0) / recordings.length)
    : 44;
  const avgOpenQ = recordings.length
    ? +(recordings.reduce((s, r) => s + (r.openQ || 0), 0) / recordings.length).toFixed(1)
    : 8.2;
  const completedSessions = sessions.filter(s => s.completedAt).length;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Team</div>
          <div className="page-sub">
            {sessions.length > 0
              ? `${sessions.length} active session${sessions.length === 1 ? "" : "s"} · ${completedSessions} completed · one-thing-at-a-time per rep`
              : "Virtual ridealong feed · one-thing-at-a-time per rep"}
          </div>
        </div>
      </div>

      <Shared.SectionPill
        items={[{k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},{k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"}]}
        value="coaching"
        onChange={(k) => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      <div className="cards-2col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.Activity size={13}/>
            <h3>This week's coaching cards</h3>
            {sessions.length === 0 && <span className="meta" title="No live coaching_sessions for this scope yet — these are derived from rep signals">derived</span>}
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {cards.length === 0 && (
              <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                No producers in scope. Coaching cards appear once you have downline reps.
              </div>
            )}
            {cards.map((c) => (
              <div key={c.id} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Shared.Avatar rep={c.rep} size={26}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.rep.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}><Shared.TierChip tier={c.rep.tier} compact/> · {c.rep.handle}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setReplay(c)}><Icons.Play size={11}/> Replay moment</button>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.evidence}</div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Impact projection: <span style={{ color: "var(--accent-money)" }}>{c.impact}</span></span>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setNoteFor(c.rep)}><Icons.MessageSquare size={11}/> Add note</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Headset size={13}/><h3>Latest call · {recordings[0]?.lead || "—"}</h3></div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
                <span className="mono">30:42</span>
                <div style={{ flex: 1, height: 28, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                  <svg width="100%" height="28" viewBox="0 0 200 28" preserveAspectRatio="none">
                    {Array.from({ length: 60 }).map((_, i) => {
                      const h = 4 + Math.abs(Math.sin(i * 0.7)) * 18 + (i % 5 === 0 ? 4 : 0);
                      return <rect key={i} x={i * 3.4} y={(28 - h) / 2} width="1.6" height={h} fill={i < 38 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                    })}
                  </svg>
                </div>
                <span className="mono">42:11</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="chip chip-money">Talk: {recordings[0]?.talkRatio ?? 38}%</span>
                <span className="chip">Open Q: {recordings[0]?.openQ ?? 11}</span>
                <span className={`chip ${recordings[0]?.flags?.tpmo === "ok" ? "chip-money" : ""}`}>TPMO {recordings[0]?.flags?.tpmo === "ok" ? "✓" : "—"}</span>
                <span className="chip chip-status">SOA {recordings[0]?.flags?.soa || "scheduled"}</span>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <b style={{ color: "var(--text-primary)" }}>AI summary —</b> {recordings[0]?.ai || "No recordings ingested yet for this scope."}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Scorecard rollup · this week</h3></div>
            <div style={{ padding: "10px 14px" }}>
              {(() => {
                const isDemoMgr = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
                const flagged = (recordings || []).filter(r => r.compliance);
                const tpmoVal = flagged.length > 0
                  ? Math.round((flagged.filter(r => r.compliance.tpmo).length / flagged.length) * 100)
                  : (isDemoMgr ? 100 : null);
                const soaVal = flagged.length > 0
                  ? Math.round((flagged.filter(r => r.compliance.soa).length / flagged.length) * 100)
                  : (isDemoMgr ? 94 : null);
                const fmtPct = (v) => v == null ? "—" : `${v}%`;
                return [
                  { l: "Avg talk ratio",     v: `${avgTalk}%`,        g: Math.min(100, (50 / Math.max(1, avgTalk)) * 70), c: avgTalk <= 50 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "Avg open Qs / call", v: avgOpenQ.toString(),   g: Math.min(100, avgOpenQ * 10), c: avgOpenQ >= 6 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "TPMO compliance",    v: fmtPct(tpmoVal),       g: tpmoVal || 0, c: tpmoVal == null ? "var(--text-quaternary)" : tpmoVal === 100 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "SOA capture",        v: fmtPct(soaVal),        g: soaVal  || 0, c: soaVal  == null ? "var(--text-quaternary)" : soaVal  >= 90 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "Sessions completed", v: `${completedSessions}/${sessions.length || 0}`, g: sessions.length ? (completedSessions / sessions.length) * 100 : 0, c: "var(--accent-money)" },
                ];
              })().map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px", alignItems: "center", padding: "6px 0", borderBottom: i < 4 ? "1px solid var(--border-subtle)" : 0, fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                    <div style={{ width: `${r.g}%`, height: "100%", background: r.c }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {replay && <ReplayMomentModal card={replay} onClose={() => setReplay(null)}/>}
      {noteFor && <CoachingNoteModal rep={noteFor} onClose={() => setNoteFor(null)}/>}
    </div>
  );
}

function ReplayMomentModal({ card, onClose }) {
  const linkedRecording = card?.recordingId
    ? (AppData.RECORDINGS || []).find(r => r.id === card.recordingId)
    : null;
  const transcript = linkedRecording
    ? [
        { who: "AI", t: "—", body: linkedRecording.ai || "No AI summary." },
        { who: "Lead", t: "—", body: `Call duration ${Math.round((linkedRecording.durSec || 0) / 60)}m · talk ratio ${linkedRecording.talkRatio || 0}% · ${linkedRecording.openQ || 0} open questions.` },
      ]
    : [
        { who: "You",      t: "00:42", body: "So, do you take any medications?" },
        { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "00:46", body: "Uh, yes, a few — metformin, blood pressure, and..." },
        { who: "You",      t: "00:51", body: "Got it. Well, our Plan G also covers the donut hole, so..." },
        { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "01:02", body: "Wait, I was about to say something — sorry." },
      ];
  const markPracticed = async () => {
    if (card?.sessionId && !String(card.sessionId).startsWith("seed-")) {
      try { await AppData.mutate.coachingSessionResolve(card.sessionId, "practiced", null, "Replay reviewed by manager"); } catch (e) { window.toast?.(`Mark practiced failed: ${e?.message || e}`, "error"); console.error("[owner.coachingSessionResolve]", e); }
    }
    window.toast && window.toast("Marked practiced — moves down the queue", "success");
    onClose();
  };
  return (
    <Shared.Modal title={`Coaching moment · ${card?.rep?.name || "rep"}`} width={620} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={markPracticed}><Icons.Check size={11}/> Mark practiced</button>
      </>
    }>
      <div style={{ padding: 12, background: "color-mix(in oklch, var(--accent-status) 8%, transparent)", borderRadius: 6, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.55 }}>
        <strong style={{ color: "var(--accent-status)" }}>Focus —</strong> {card?.focus}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {transcript.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10, alignItems: "start" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{m.t}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: m.who === "You" ? "var(--accent-money)" : "var(--text-secondary)" }}>{m.who}</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        <strong style={{ color: "var(--text-primary)" }}>What to try next time:</strong> "Walk me through what your morning looks like with those medications." Open-ended → fewer interruptions → richer discovery.
      </div>
    </Shared.Modal>
  );
}

function CoachingRep() {
  useMeReady();
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]?.id) : null);

  const mySessions  = (AppData.COACHING_SESSIONS || []).filter(s => s.repId === myRepId);
  const myNotes     = (AppData.COACHING_NOTES    || []).filter(n => n.repId === myRepId);
  const openCards   = mySessions.filter(s => !s.completedAt);
  const dueToday    = openCards.filter(s => {
    if (!s.scheduledAt) return false;
    const d = new Date(s.scheduledAt); const t = new Date();
    return d.toDateString() === t.toDateString();
  }).length;
  const drillsThisWeek = mySessions.filter(s => {
    if (!s.completedAt) return false;
    const d = new Date(s.completedAt); const t = new Date();
    const diffDays = (t - d) / 86400000;
    return diffDays <= 7;
  }).length;

  // Seed cards previously shown the fake "+12% close rate (cohort)" / "Persistency +6pts"
  // numbers to every agency on first paint. Gate to demo so real tenants see an empty state.
  const _isDemoCoach = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || (window.isDemoAgency && window.isDemoAgency()) || false;
  const cards = openCards.length > 0
    ? openCards.slice(0, 5).map(s => ({
        id: s.id,
        focus: s.focusArea || "Open coaching focus",
        evidence: s.notes || "Replay your last call to find the moment.",
        drill: "Run 5-question rephrase drill",
        impact: s.outcome || "track this week",
      }))
    : (_isDemoCoach ? [
        { id: "seed-1", focus: "Ask 3 more open-ended questions per hour", evidence: "Default focus until your manager assigns one.", drill: "Run 5-question rephrase drill", impact: "+12% close rate (cohort)" },
        { id: "seed-2", focus: "Cut talk-listen from 52% → 45%",            evidence: "Default focus until your manager assigns one.",  drill: "30-sec silence drill x10",       impact: "Persistency +6pts" },
      ] : []);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Me</div>
          <div className="page-sub">{meIdent?.full_name ? `${meIdent.full_name.split(" ")[0]} · ` : ""}One thing at a time. Replay the moment, run the drill, log the rep.</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Open cards" value={String(openCards.length || cards.length)} sub={`${dueToday} due today`}/>
        <Shared.KpiCard label="Drills this week" value={String(drillsThisWeek)} sub={drillsThisWeek > 0 ? "logged" : "log your first"} trend={drillsThisWeek > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Notes received" value={String(myNotes.length)} sub={myNotes.length > 0 ? "from manager" : "none yet"} trend={myNotes.length > 0 ? "up" : undefined}/>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-h"><Icons.Activity size={13}/><h3>My coaching cards</h3>{openCards.length === 0 && <span className="meta">demo</span>}</div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c) => (
            <div key={c.id} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.evidence}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Walk me through my coaching focus '${c.focus}' — give me 3 lines I can use on my next call`, context: "Coaching · " + c.focus }}))}><Icons.Play size={11}/> Replay moment</button>
                <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Run me through the ${c.drill} drill — give me 3 prompts I can practice on my next call`, context: "Coaching · " + c.drill }}))}><Icons.Sparkles size={11}/> {c.drill}</button>
                <span className="chip chip-money" style={{ alignSelf: "center" }}>Impact: {c.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {myNotes.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-h"><Icons.MessageSquare size={13}/><h3>Notes from your manager</h3><span className="meta">{myNotes.length}</span></div>
          <div style={{ padding: 4 }}>
            {myNotes.slice(0, 8).map(n => (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>{n.body}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
                  {n.createdBy || "manager"} · {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoachingOwner() {
  useMeReady();
  const sessions = AppData.COACHING_SESSIONS || [];
  let themes;
  if (sessions.length > 0) {
    const byFocus = new Map();
    for (const s of sessions) {
      const k = (s.focusArea || "Unspecified").trim();
      if (!byFocus.has(k)) byFocus.set(k, { reps: new Set(), n: 0, lifts: [] });
      const bucket = byFocus.get(k);
      bucket.reps.add(s.repId);
      bucket.n += 1;
      if (s.rating != null) bucket.lifts.push(parseFloat(s.rating));
    }
    themes = [...byFocus.entries()]
      .map(([t, v]) => ({
        t,
        reps: v.reps.size,
        n: v.n,
        lift: v.lifts.length ? +(v.lifts.reduce((a, b) => a + b, 0) / v.lifts.length).toFixed(1) : 0,
      }))
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 8);
  }
  if (!themes || themes.length === 0) {
    themes = [
      { t: "Open-ended questions",  reps: 6, lift: 12.4, n: 412 },
      { t: "Talk-listen ratio",     reps: 4, lift:  6.9, n: 318 },
      { t: "Plan-G anchor sequence",reps: 5, lift: 18.2, n: 244 },
      { t: "Daily-routine open",    reps: 3, lift:  9.1, n: 196 },
      { t: "Cross-sell on Issued",  reps: 7, lift:  4.4, n: 510 },
    ];
  }
  const isDerived = sessions.length === 0;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Org effectiveness</div>
          <div className="page-sub">Close-rate lift per coaching theme · sample size · adoption across producers</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>Theme effectiveness · last 90 days</h3>{isDerived && <span className="meta">demo</span>}</div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 90px 1fr" }}>
            <div>Theme</div><div className="tabular" style={{ textAlign: "right" }}>Reps</div><div className="tabular" style={{ textAlign: "right" }}>Calls</div><div>Close-rate lift</div>
          </div>
          {themes.map((t, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1.6fr 90px 90px 1fr" }}>
              <div style={{ fontWeight: 500 }}>{t.t}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{t.reps}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{t.n}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, t.lift * 5)}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
                <span className="tabular" style={{ color: "var(--accent-money)", fontWeight: 600, fontSize: 12, minWidth: 52, textAlign: "right" }}>+{t.lift.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function _parseRoutingPrompt(text) {
  const t = text.trim();
  if (!t) return null;
  const arrowMatch = t.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
  if (arrowMatch) return { source: arrowMatch[1].trim(), route_to: arrowMatch[2].trim() };
  const sendMatch = t.match(/^(?:send|route|push|assign)\s+(.+?)\s+(?:to|→)\s+(.+)$/i);
  if (sendMatch) return { source: sendMatch[1].trim(), route_to: sendMatch[2].trim() };
  const goesMatch = t.match(/^(.+?)\s+(?:goes? to|gets? sent to|→)\s+(.+)$/i);
  if (goesMatch) return { source: goesMatch[1].trim(), route_to: goesMatch[2].trim() };
  return null;
}

function RoutingRulesModal({ onClose }) {
  const [rules, setRules] = React.useState([]);
  const [prompt, setPrompt] = React.useState("");
  const [parseErr, setParseErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) return;
    sb.from("routing_rules").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (Array.isArray(data)) setRules(data);
    });
  }, []);

  const addRule = async () => {
    setParseErr("");
    const parsed = _parseRoutingPrompt(prompt);
    if (!parsed) {
      setParseErr('Try "Send <kind of lead> to <producer or group>" — e.g. "Send Spanish leads to Maria" or "FE leads → gold tier".');
      return;
    }
    setBusy(true);
    try {
      const rule = { ...parsed, weight: 50, active: true };
      await AppData.mutate.routingRuleSave(rule);
      setRules(rs => [{ ...rule, id: "tmp-" + Date.now(), created_at: new Date().toISOString() }, ...rs]);
      setPrompt("");
      window.toast && window.toast("Routing rule added", "success");
    } catch (e) {
      window.toast && window.toast(`Could not save: ${e.message || e}`, "error");
    } finally { setBusy(false); }
  };

  const toggle = async (rule) => {
    const next = { ...rule, active: !rule.active };
    await AppData.mutate.routingRuleSave(next);
    setRules(rs => rs.map(r => r.id === rule.id ? next : r));
  };
  const remove = async (id) => {
    if (!String(id).startsWith("tmp-") && !String(id).startsWith("stub-")) {
      await AppData.mutate.routingRuleDelete(id);
    }
    setRules(rs => rs.filter(r => r.id !== id));
  };

  const examples = [
    "Send Spanish leads to Maria",
    "Annuity inquiries → certified producers only",
    "FE leads in Tampa go to gold tier+",
    "T65 inbounds within 60s → Med Supp team",
  ];

  return (
    <Shared.Modal title="Routing rules" width={620} onClose={onClose} actions={
      <button className="btn btn-ghost" onClick={onClose}>Close</button>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
        Tell the routing agent how leads should flow. First matching rule wins; the score-based suggestion fills in everything else.
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <textarea
          className="text-input"
          rows={2}
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setParseErr(""); }}
          placeholder='Send Spanish leads to Maria'
          style={{ flex: 1, fontSize: 13, resize: "vertical" }}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addRule(); }}
        />
        <button className="btn btn-primary" onClick={addRule} disabled={busy || !prompt.trim()} style={{ padding: "8px 12px" }}>
          <Icons.Sparkles size={12}/> Add rule
        </button>
      </div>
      {parseErr && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--state-warning)" }}>{parseErr}</div>
      )}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {examples.map((ex, i) => (
          <button key={i} className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setPrompt(ex)}>{ex}</button>
        ))}
      </div>

      <div className="divider" style={{ margin: "14px 0 8px" }}></div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>{rules.length} rule{rules.length === 1 ? "" : "s"} · first match wins</div>
      <div className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
        {rules.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No custom rules yet — auto-routing handles everything.</div>}
        {rules.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "1fr 28px 28px", padding: "10px 12px", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: r.active ? 1 : 0.5 }}>
                <span style={{ color: "var(--text-primary)" }}>{r.source}</span>
                <span style={{ color: "var(--text-tertiary)", margin: "0 6px" }}>→</span>
                <span style={{ color: "var(--accent-money)" }}>{r.route_to}</span>
              </div>
              {!r.active && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>paused</div>}
            </div>
            <button className="icon-btn" title={r.active ? "Pause" : "Activate"} onClick={() => toggle(r)}>
              {r.active ? <Icons.Check size={12}/> : <Icons.X size={12}/>}
            </button>
            <button className="icon-btn" title="Delete" onClick={() => remove(r.id)}><Icons.X size={12}/></button>
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}

function RepDrillSlideout({ rep, onClose, onAddNote }) {
  const myPipeline = (AppData.PIPELINE || []).filter(p => p.owner === rep.id);
  const todayBooked = myPipeline.filter(p => p.stage === "Issued").reduce((a, p) => a + (p.ap || 0), 0);
  const repNotes = (AppData.COACHING_NOTES || []).filter(n => n.repId === rep.id).slice(0, 3);
  const risk = mgrRiskScore(rep);
  const brk = mgrBreakoutScore(rep);
  const sendCheckIn = () => window.toast && window.toast(`Check-in sent to ${rep.name.split(" ")[0]}`, "success");
  const callRep = () => window.repflowCall && window.repflowCall("+15125550" + rep.id.slice(0, 3), rep.name);
  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Shared.Avatar rep={rep} size={36}/>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-display)" }}>{rep.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                <Shared.TierChip tier={rep.tier} compact/>
                <span>· {rep.handle}</span>
                <span className={`dot dot-${rep.presence === "live" ? "live" : "idle"}`}></span>
                {rep.presence}
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>
        <div className="slideout-body">
          {(risk >= 50 || brk >= 50) && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {risk >= 50 && <span className="chip" style={{ color: "var(--state-danger)", borderColor: "color-mix(in oklch, var(--state-danger) 35%, transparent)", background: "color-mix(in oklch, var(--state-danger) 10%, transparent)" }}><Icons.AlertTriangle size={10}/> at-risk · {risk}</span>}
              {brk  >= 50 && <span className="chip" style={{ color: "var(--accent-money)", borderColor: "color-mix(in oklch, var(--accent-money) 35%, transparent)", background: "color-mix(in oklch, var(--accent-money) 10%, transparent)" }}><Icons.TrendingUp size={10}/> breakout · {brk}</span>}
            </div>
          )}
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Shared.KpiCard label="MTD AP" prefix="$" value={(rep.mtd || 0).toLocaleString()}/>
            <Shared.KpiCard label="Today" prefix="$" value={(rep.today || 0).toLocaleString()}/>
            <Shared.KpiCard label="Dials" value={String(rep.dials || 0)}/>
            <Shared.KpiCard label="Streak" value={(rep.streak || 0) + "d"} sub={rep.streak > 10 ? "🔥 club" : "—"}/>
          </div>

          <div className="divider"></div>
          <div className="field-l">Active deals · {myPipeline.length}</div>
          <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {myPipeline.length === 0 && <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>No active deals.</div>}
            {myPipeline.map(p => (
              <div key={p.id} style={{ padding: 8, background: "var(--bg-raised)", borderRadius: 4, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{p.lead}</strong>
                  <span className="tabular">{p.ap ? `$${p.ap.toLocaleString()}` : "—"}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 2 }}>{p.product} · {p.stage} · {p.days}d</div>
              </div>
            ))}
          </div>

          {repNotes.length > 0 && (
            <>
              <div className="divider"></div>
              <div className="field-l">Recent coaching notes</div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {repNotes.map(n => (
                  <div key={n.id} style={{ padding: 8, background: "var(--bg-raised)", borderRadius: 4, fontSize: 12, lineHeight: 1.5 }}>
                    <div style={{ color: "var(--text-secondary)" }}>{n.body}</div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-tertiary)" }}>{n.createdBy || "manager"} · {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric" }) : ""}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="divider"></div>
          <div className="field-l">Today's progress</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {todayBooked > 0 ? `Booked $${todayBooked.toLocaleString()} so far. Pace = ${rep.today > 1500 ? "ahead of avg" : "behind avg"}.` : "No bookings yet today — quick check-in?"}
          </div>
        </div>
        <div className="slideout-foot">
          <button className="btn" onClick={sendCheckIn}><Icons.MessageSquare size={12}/> Check-in</button>
          <button className="btn" onClick={() => onAddNote && onAddNote(rep)}><Icons.Activity size={12}/> Add note</button>
          <button className="btn btn-primary" onClick={callRep}><Icons.Phone size={12}/> Call now</button>
        </div>
      </aside>
    </div>
  );
}

/* ─── Downline tree — wired to downline_of(root_rep_id) RPC.
   Shows yourself + direct downline only; never renders upline nodes. */
function DownlineTree() {
  const [nodes, setNodes] = React.useState(null);
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id;

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !myRepId) {
      setNodes(AppData.REPS || []);
      return;
    }
    sb.rpc("downline_of", { root_rep_id: myRepId })
      .then(({ data, error }) => {
        if (error || !data) { setNodes(AppData.REPS || []); return; }
        const ids = new Set(data.map(d => d.rep_id));
        setNodes((AppData.REPS || []).filter(r => ids.has(r.id)));
      })
      .catch(() => setNodes(AppData.REPS || []));
  }, [myRepId]);

  if (nodes === null) {
    return <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13 }}>Loading downline…</div>;
  }

  const byParent = {};
  for (const r of nodes) {
    const parentInScope = nodes.find(n => n.id === r.upline_id);
    const key = parentInScope ? r.upline_id : "__root";
    (byParent[key] = byParent[key] || []).push(r);
  }

  function RepNode({ rep, depth }) {
    const children = byParent[rep.id] || [];
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 0", paddingLeft: depth * 20,
          borderBottom: "1px solid var(--border-subtle)"
        }}>
          {depth > 0 && <span style={{ color: "var(--text-quaternary)", fontSize: 11, fontFamily: "var(--font-mono)" }}>└─</span>}
          <Shared.Avatar rep={rep} size={22}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{rep.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
              <Shared.TierChip tier={rep.tier} compact/>
              <span className={`dot dot-${rep.presence === "live" ? "live" : "idle"}`}></span>
              <span>{rep.presence}</span>
            </div>
          </div>
          <span className="tabular" style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 70, textAlign: "right" }}>
            ${(rep.mtd || 0).toLocaleString()}
          </span>
        </div>
        {children.map(c => <RepNode key={c.id} rep={c} depth={depth + 1}/>)}
      </div>
    );
  }

  const roots = byParent["__root"] || [];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Downline</div>
          <div className="page-sub">{nodes.length} producer{nodes.length === 1 ? "" : "s"} · yourself + direct downline · never shows upline</div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-h">
          <Icons.Users size={13}/>
          <h3>Team tree</h3>
          <span className="meta">{nodes.length}</span>
        </div>
        {nodes.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No downline reps yet.{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } })); }} style={{ color: "var(--accent-money)" }}>Recruit your first producer →</a>
          </div>
        )}
        <div style={{ padding: "0 14px" }}>
          {roots.map(r => <RepNode key={r.id} rep={r} depth={0}/>)}
        </div>
      </div>
    </div>
  );
}

window.PageTeam = PageTeam;
window.PageCoaching = PageCoaching;
window.CoachingRep = CoachingRep;
window.CoachingManager = CoachingManager;
window.CoachingOwner = CoachingOwner;
window.DownlineTree = DownlineTree;
