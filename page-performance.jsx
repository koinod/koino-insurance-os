/* page-performance.jsx — Owner: combined Leaderboard + Tiering + Forecast.
   One scrollable, uncrowded page that answers three owner questions at a glance:
     1. Who's winning right now? (standings)
     2. What's coming? (weighted forecast curve)
     3. Are tiers honest? (rules + recent overrides)

   Rep + manager keep the original PageLeaderboard with podium/badges/war-room.
   This page is wired only when role === "owner". */

(function () {

const TIER_ORDER = ["bronze","silver","gold","platinum","diamond"];
// Live: average AP per product from issued policies, falling back to agency
// config defaults, then to industry baselines. Recomputes only when POLICIES
// reference changes.
function _avgApByKeyword(policies, keyword) {
  const matched = policies.filter(p => p.product && p.product.toLowerCase().includes(keyword.toLowerCase()) && p.ap > 0);
  if (matched.length === 0) return null;
  return Math.round(matched.reduce((a, p) => a + p.ap, 0) / matched.length);
}
function _stageProbLive() {
  return (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().stage_close_probabilities)
    || { "New": 0.04, "Contacted": 0.12, "Quoted": 0.32, "App In": 0.78, "Issued": 1.0 };
}
function _fallbackApDefaults() {
  return (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().fallback_ap_by_product)
    || { "Plan G": 1800, "Plan N": 1500, "Final Expense": 1300, "Annuity": 4000 };
}
function _fallbackApFor(product, policies) {
  const fb = _fallbackApDefaults();
  const learned =
    product?.includes("Plan G")        ? _avgApByKeyword(policies, "Plan G")        :
    product?.includes("Plan N")        ? _avgApByKeyword(policies, "Plan N")        :
    product?.includes("Annuity")       ? _avgApByKeyword(policies, "Annuity")       :
    product?.includes("Final Expense") ? _avgApByKeyword(policies, "Final Expense") :
    null;
  if (learned) return learned;
  if (product?.includes("Plan G"))        return fb["Plan G"];
  if (product?.includes("Plan N"))        return fb["Plan N"];
  if (product?.includes("Annuity"))       return fb["Annuity"];
  if (product?.includes("Final Expense")) return fb["Final Expense"];
  return fb["Final Expense"] || 1300;
}
const STAGE_PROB = new Proxy({}, {
  get(_t, key) { return _stageProbLive()[key]; },
  ownKeys()    { return Object.keys(_stageProbLive()); },
  getOwnPropertyDescriptor(_t, key) {
    return { configurable: true, enumerable: true, value: _stageProbLive()[key] };
  },
});
const FALLBACK_AP = (p) => _fallbackApFor(p.product, AppData.POLICIES || []);

function PagePerformance() {
  const REPS = AppData.REPS || [];
  const pipeline = AppData.PIPELINE || [];

  const [period, setPeriod] = React.useState("MTD");          // MTD | WTD | T12 | AEP
  const [tierOpen, setTierOpen] = React.useState(false);      // tier rules drawer
  const [forecastGoal, setForecastGoal] = React.useState(50000);

  // ─── Tier rules (editable) + per-rep override state ─────────────────────
  // Initial values come from lib/agency-config.js so a single edit in agency
  // settings flows through. Fallback retained when the helper isn't loaded.
  const [rules, setRules] = React.useState(
    (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().tier_thresholds) || {
      bronze:   { mtd: 0,     persistency: 0  },
      silver:   { mtd: 15000, persistency: 70 },
      gold:     { mtd: 25000, persistency: 80 },
      platinum: { mtd: 35000, persistency: 85 },
      diamond:  { mtd: 50000, persistency: 90 },
    }
  );
  // Owners editing thresholds in this UI persist back to agency config.
  React.useEffect(() => {
    if (!window.AgencyConfig || !window.AgencyConfig.update) return;
    const me = window.me && window.me();
    if (!me || me.role !== "owner") return;
    const cfg = window.AgencyConfig.get();
    if (JSON.stringify(cfg.tier_thresholds) === JSON.stringify(rules)) return;
    window.AgencyConfig.update({ tier_thresholds: rules });
  }, [rules]);
  const [overrides, setOverrides] = React.useState({});
  const [history, setHistory] = React.useState(
    ((window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency())
      ? [
          { who: "Tony Park", from: "gold",   to: "platinum", reason: "Lost lead to no fault — protect tier", when: "Apr 28" },
          { who: "Remy Chen", from: "silver", to: "bronze",   reason: "Persistency drift, 6-mo cohort",        when: "Apr 21" },
        ]
      : [])
  );
  // Persistency = % of issued policies still in force, derived from
  // AppData.POLICIES. When a rep has no policies on file we fall back to a
  // streak-derived demo value (bounded 88–94) only on the demo agency, else
  // null so tier calc treats them as below threshold (forces real data first).
  const _isDemoPerf = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
  const _persByRep = React.useMemo(() => {
    const policies = AppData.POLICIES || [];
    const total = {}, active = {};
    for (const p of policies) {
      if (!p.owner) continue;
      total[p.owner]  = (total[p.owner] || 0) + 1;
      if (p.persistency === "active" || p.persistency === "in_force") {
        active[p.owner] = (active[p.owner] || 0) + 1;
      }
    }
    const out = {};
    for (const id of Object.keys(total)) {
      out[id] = Math.round((active[id] / total[id]) * 1000) / 10;
    }
    return out;
  }, [AppData.POLICIES]);
  const persFor = (rep) => {
    const live = _persByRep[rep.id];
    if (typeof live === "number") return live;
    return _isDemoPerf ? 88 + (rep.streak % 7) : 0;
  };
  const calcTier = (rep) => {
    const p = persFor(rep);
    let t = "bronze";
    for (const k of TIER_ORDER) if (rep.mtd >= rules[k].mtd && p >= rules[k].persistency) t = k;
    return t;
  };
  const setOverride = async (id, t) => {
    const rep = REPS.find(r => r.id === id); if (!rep) return;
    const auto = calcTier(rep);
    if (t === auto) {
      const n = { ...overrides }; delete n[id]; setOverrides(n);
    } else {
      setOverrides({ ...overrides, [id]: t });
      setHistory([{ who: rep.name, from: rep.tier, to: t, reason: "Manual override", when: "now" }, ...history]);
    }
    try { await AppData.mutate.tieringOverride(id, t); window.toast && window.toast(`${rep.name} → ${t.toUpperCase()}${AppData.LIVE ? " · saved" : ""}`, "success"); } catch (_e) {}
  };

  // ─── Forecast math ──────────────────────────────────────────────────────
  const weightedAP = pipeline.reduce((a, p) => a + (p.ap || FALLBACK_AP(p)) * (STAGE_PROB[p.stage] || 0), 0);
  const inApp      = pipeline.filter(p => p.stage === "App In").length;
  const issuedMtd  = pipeline.filter(p => p.stage === "Issued").length;
  const coverage   = (weightedAP / Math.max(forecastGoal, 1));

  // 30-day exponential curve toward weightedAP (cumulative)
  const curve = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, ap: weightedAP * (1 - Math.exp(-(i + 1) / 12)) }));

  // ─── Standings ──────────────────────────────────────────────────────────
  const sorted = [...REPS].sort((a, b) => b.mtd - a.mtd);
  const max    = sorted[0]?.mtd || 1;

  // ─── Hero KPI helpers ───────────────────────────────────────────────────
  const top         = sorted[0];
  const promoted    = history.filter(h => TIER_ORDER.indexOf(h.to) > TIER_ORDER.indexOf(h.from))?.length;
  const demoted     = history.filter(h => TIER_ORDER.indexOf(h.to) < TIER_ORDER.indexOf(h.from))?.length;

  // GAP-RP1 — CSV export of standings (rank · rep · MTD · today · streak · dials · tier)
  const exportStandingsCsv = () => {
    const headers = ["Rank","Rep","Tier","MTD","Today","Streak","Dials","Appts"];
    const rows = sorted.map((r, i) => [i + 1, r.name || "", r.tier || "", r.mtd || 0, r.today || 0, r.streak || 0, r.dials || 0, r.appts || 0]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `performance-${period.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${rows.length} producers · ${period}`, "success");
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Performance</div>
          <div className="page-sub">Standings · forecast · tiering — one view, owner cockpit</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.SectionPill items={[{k:"WTD",l:"WTD"},{k:"MTD",l:"MTD"},{k:"T12",l:"T12"},{k:"AEP",l:"AEP"}]} value={period} onChange={setPeriod} dense/>
          <button className="btn" onClick={exportStandingsCsv} disabled={sorted.length === 0} title={sorted.length === 0 ? "No producers to export" : "Download standings CSV"}>CSV</button>
          <button className="btn" onClick={() => setTierOpen(o => !o)}>
            <Icons.Award size={13}/> {tierOpen ? "Hide" : "Tier rules"}
          </button>
        </div>
      </div>

      {/* ─── Hero KPIs ─────────────────────────────────────────────────── */}
      <div className="kpi-row">
        <Shared.KpiCard hero
          label="Top performer"
          value={top?.name?.split(" ")[0] || "—"}
          sub={top ? `$${(top.mtd || 0).toLocaleString()} · ${top.streak || 0}d streak` : "no producers yet"}
          trend={top ? "up" : undefined}/>
        <Shared.KpiCard
          label="Weighted pipeline"
          prefix={pipeline.length > 0 ? "$" : ""}
          value={pipeline.length > 0 ? Math.round(weightedAP).toLocaleString() : "—"}
          sub={pipeline.length > 0 ? `${pipeline.length} deals · all stages × prob` : "no pipeline yet"}/>
        <Shared.KpiCard
          label="Coverage"
          value={pipeline.length > 0 && weightedAP > 0 ? coverage.toFixed(2) + "x" : "—"}
          sub={pipeline.length > 0 ? `vs $${forecastGoal.toLocaleString()} goal` : "set a goal in the panel below"}
          trend={pipeline.length > 0 ? (coverage >= 1 ? "up" : "down") : undefined}
          neg={pipeline.length > 0 && coverage < 1}/>
        <Shared.KpiCard
          label="Tier movement"
          value={`+${promoted} / -${demoted}`}
          sub={`${history.length} adjustments this month`}/>
      </div>

      {/* ─── Main: Standings (wide) + Forecast (narrow) ───────────────── */}
      <div className="perf-main" style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 14 }}>
        {/* STANDINGS */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Trophy size={13}/>
            <h3>Standings · {period}</h3>
            <span className="meta">click rep for scorecard</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "32px 1.5fr 90px 100px 60px 1fr" }}>
              <div>#</div><div>Producer</div><div>Tier</div>
              <div style={{ textAlign: "right" }}>MTD AP</div>
              <div style={{ textAlign: "right" }}>Δ</div>
              <div></div>
            </div>
            {sorted.map((r, i) => {
              const eff = overrides[r.id] || r.tier;
              // Highlight the actual signed-in rep, not Marcus from the demo seed.
              const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
              const isYou = !!(meIdent && r.id === meIdent.rep_id);
              // Δ column: keep the illustrative gradient in demo mode; show "—"
              // for real tenants until prior-period rank tracking is wired in.
              const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
              const delta = isDemo ? (i < 3 ? +(3 - i) : i > 5 ? -(i - 5) : 0) : null;
              return (
                <div key={r.id} className="row" style={{ gridTemplateColumns: "32px 1.5fr 90px 100px 60px 1fr", height: 38 }}>
                  <div className="tabular" style={{ fontWeight: 600, color: i < 3 ? "var(--accent-status)" : "var(--text-tertiary)" }}>{i + 1}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Shared.Avatar rep={r} size={20}/>
                    <span className="cell-truncate" style={{ fontWeight: 500 }}>
                      {r.name}
                      {isYou && <span className="chip" style={{ marginLeft: 4, fontSize: 9.5 }}>YOU</span>}
                    </span>
                    {r.streak > 10 && <Icons.Flame size={11} style={{ color: "var(--accent-heat)" }}/>}
                  </div>
                  <div><Shared.TierChip tier={eff} compact/></div>
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${(r.mtd || 0).toLocaleString()}</div>
                  <div className="tabular" style={{ textAlign: "right", fontSize: 11.5, color: delta > 0 ? "var(--accent-money)" : delta < 0 ? "var(--state-danger)" : "var(--text-quaternary)" }}>
                    {delta == null ? "—" : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "—"}
                  </div>
                  <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden", margin: "0 8px" }}>
                    <div style={{ width: `${(r.mtd / max) * 100}%`, height: "100%", background: i < 3 ? "linear-gradient(90deg, var(--accent-status), var(--accent-money))" : "var(--accent-money-dim)" }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FORECAST */}
        <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-h">
            <Icons.TrendingUp size={13}/>
            <h3>30-day forecast</h3>
            <span className="meta">weighted</span>
          </div>
          <div style={{ padding: 14, paddingBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>
                ${Math.round(weightedAP).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{inApp} App In · {issuedMtd} issued</div>
            </div>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none" style={{ display: "block" }}>
              {(() => {
                const m = Math.max(...curve.map(c => c.ap), 1);
                const path = curve.map((c, i) => `${i === 0 ? "M" : "L"} ${(i / (curve.length - 1)) * 600} ${110 - (c.ap / m) * 100}`).join(" ");
                const fill = path + ` L 600 110 L 0 110 Z`;
                return <><path d={fill} fill="var(--accent-money)" opacity="0.12"/><path d={path} stroke="var(--accent-money)" strokeWidth="1.8" fill="none"/></>;
              })()}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
              <span>Today</span><span>+15d</span><span>+30d</span>
            </div>
          </div>

          {/* Stage probability strip — compact */}
          <div style={{ padding: "0 14px 12px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {Object.entries(STAGE_PROB).map(([s, p]) => (
              <div key={s} style={{ padding: "6px 4px", background: "var(--bg-raised)", borderRadius: 5, textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s}</div>
                <div className="tabular" style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>{(p * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>

          {/* Goal slider — owner sets the bar */}
          <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: "var(--text-tertiary)" }}>Coverage goal</span>
              <span className="tabular" style={{ fontWeight: 500 }}>${forecastGoal.toLocaleString()}</span>
            </div>
            <input type="range" min={10000} max={200000} step={5000} value={forecastGoal} onChange={(e) => setForecastGoal(+e.target.value)} style={{ width: "100%" }}/>
          </div>
        </div>
      </div>

      {/* ─── Tier rules drawer (collapsed by default) ─────────────────── */}
      {tierOpen && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-h">
            <Icons.Award size={13}/>
            <h3>Tier rules · all conditions AND</h3>
            <span className="meta">{Object.keys(overrides).length} active overrides</span>
            <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setTierOpen(false)}>Done</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 14 }}>
            {/* Compact rules grid */}
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8, alignItems: "center" }}>
                {TIER_ORDER.map(t => (
                  <React.Fragment key={t}>
                    <div><Shared.TierChip tier={t} compact/></div>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>MTD ≥ ${rules[t].mtd.toLocaleString()}</div>
                      <input type="range" min={0} max={70000} step={1000} value={rules[t].mtd} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], mtd: +e.target.value } })} style={{ width: "100%" }}/>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Persist. ≥ {rules[t].persistency}%</div>
                      <input type="range" min={0} max={100} value={rules[t].persistency} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], persistency: +e.target.value } })} style={{ width: "100%" }}/>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Per-rep auto vs effective */}
            <div className="list" style={{ maxHeight: 280, overflowY: "auto" }}>
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 70px 90px 1fr" }}>
                <div>Producer</div>
                <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
                <div>Auto</div>
                <div>Effective</div>
              </div>
              {REPS.map(r => {
                const auto = calcTier(r);
                const eff  = overrides[r.id] || auto;
                const isOverride = eff !== auto;
                return (
                  <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 70px 90px 1fr", height: 36 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Shared.Avatar rep={r} size={18}/>
                      <span style={{ fontWeight: 500, fontSize: 12 }}>{r.name}</span>
                    </div>
                    <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 11.5 }}>${(r.mtd/1000).toFixed(1)}k</div>
                    <div><Shared.TierChip tier={auto} compact/></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Shared.Select value={eff} onChange={(v) => setOverride(r.id, v)} options={TIER_ORDER.map(t => ({ v: t, l: t.toUpperCase() + (t === auto ? " (auto)" : "") }))}/>
                      {isOverride && <span title="manual override" className="dot dot-warn"></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit log — recent only */}
          {history.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Recent overrides</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {history.slice(0, 5).map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 100, fontWeight: 500 }}>{h.who}</span>
                    <Shared.TierChip tier={h.from} compact/>
                    <Icons.ArrowUpRight size={10} style={{ color: "var(--text-tertiary)" }}/>
                    <Shared.TierChip tier={h.to} compact/>
                    <span style={{ flex: 1, color: "var(--text-tertiary)", fontSize: 11.5 }}>{h.reason}</span>
                    <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>{h.when}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.PagePerformance = PagePerformance;

})();
