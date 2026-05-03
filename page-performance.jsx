/* page-performance.jsx — Owner: combined Leaderboard + Tiering + Forecast.
   One scrollable, uncrowded page that answers three owner questions at a glance:
     1. Who's winning right now? (standings)
     2. What's coming? (weighted forecast curve)
     3. Are tiers honest? (rules + recent overrides)

   Rep + manager keep the original PageLeaderboard with podium/badges/war-room.
   This page is wired only when role === "owner". */

(function () {

const TIER_ORDER = ["bronze","silver","gold","platinum","diamond"];
const STAGE_PROB = { "New": 0.04, "Contacted": 0.12, "Quoted": 0.32, "App In": 0.78, "Issued": 1.0 };
const FALLBACK_AP = (p) => p.product?.includes("Plan G") ? 1800
                          : p.product?.includes("Plan N") ? 1500
                          : p.product?.includes("Annuity") ? 4000 : 1300;

function PagePerformance() {
  const { REPS } = AppData;
  const pipeline = AppData.PIPELINE || [];

  const [period, setPeriod] = React.useState("MTD");          // MTD | WTD | T12 | AEP
  const [tierOpen, setTierOpen] = React.useState(false);      // tier rules drawer
  const [forecastGoal, setForecastGoal] = React.useState(50000);

  // ─── Tier rules (editable) + per-rep override state ─────────────────────
  const [rules, setRules] = React.useState({
    bronze:   { mtd: 0,     persistency: 0  },
    silver:   { mtd: 15000, persistency: 70 },
    gold:     { mtd: 25000, persistency: 80 },
    platinum: { mtd: 35000, persistency: 85 },
    diamond:  { mtd: 50000, persistency: 90 },
  });
  const [overrides, setOverrides] = React.useState({});
  const [history, setHistory] = React.useState([
    { who: "Tony Park", from: "gold",   to: "platinum", reason: "Lost lead to no fault — protect tier", when: "Apr 28" },
    { who: "Remy Chen", from: "silver", to: "bronze",   reason: "Persistency drift, 6-mo cohort",        when: "Apr 21" },
  ]);
  const persFor = (rep) => 88 + (rep.streak % 7);
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
  const promoted    = history.filter(h => TIER_ORDER.indexOf(h.to) > TIER_ORDER.indexOf(h.from)).length;
  const demoted     = history.filter(h => TIER_ORDER.indexOf(h.to) < TIER_ORDER.indexOf(h.from)).length;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Performance</div>
          <div className="page-sub">Standings · forecast · tiering — one view, owner cockpit</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.SectionPill items={[{k:"WTD",l:"WTD"},{k:"MTD",l:"MTD"},{k:"T12",l:"T12"},{k:"AEP",l:"AEP"}]} value={period} onChange={setPeriod} dense/>
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
          sub={top ? `$${top.mtd.toLocaleString()} · ${top.streak}d streak` : ""}
          trend="up"/>
        <Shared.KpiCard
          label="Weighted pipeline"
          prefix="$"
          value={Math.round(weightedAP).toLocaleString()}
          sub={`${pipeline.length} deals · all stages × prob`}/>
        <Shared.KpiCard
          label="Coverage"
          value={coverage.toFixed(2) + "x"}
          sub={`vs $${forecastGoal.toLocaleString()} goal`}
          trend={coverage >= 1 ? "up" : "down"}
          neg={coverage < 1}/>
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
              const isYou = r.id === "marc";
              const delta = i < 3 ? +(3 - i) : i > 5 ? -(i - 5) : 0;
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
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${r.mtd.toLocaleString()}</div>
                  <div className="tabular" style={{ textAlign: "right", fontSize: 11.5, color: delta > 0 ? "var(--accent-money)" : delta < 0 ? "var(--state-danger)" : "var(--text-quaternary)" }}>
                    {delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "—"}
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
