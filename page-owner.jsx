/* Page: Owner — P&L + Org Tree

   All numbers below are derived from AppData.POLICIES + AppData.COMMISSIONS +
   AppData.CLAWBACKS + AppData.RECRUITING_APPLICANTS. When live data is empty
   we fall back to demo numbers ONLY for the demo agency; real agencies see
   "—" / null states until their ledger is populated. */
function _pnlLiveMetrics(period) {
  const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
  const policies = AppData.POLICIES || [];
  const commissions = AppData.COMMISSIONS || [];
  const clawbacks = AppData.CLAWBACKS || [];
  const policyById = Object.fromEntries(policies.map(p => [p.id, p]));

  const now = new Date();
  const startMtd = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYtd = new Date(now.getFullYear(), 0, 1);
  const startT12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const cutoff = period === "MTD" ? startMtd : period === "YTD" ? startYtd : startT12;
  const tsIn = (s) => s && new Date(s) >= cutoff;

  const overrideRev = commissions.filter(c => c.kind === "override" && tsIn(c.earnedAt))
    .reduce((a, c) => a + (c.amount || 0), 0);
  const apSubmitted = policies.filter(p => tsIn(p.submissionDate))
    .reduce((a, p) => a + (p.ap || 0), 0);
  const apsCount = policies.filter(p => tsIn(p.submissionDate)).length;
  const nigoDrag = clawbacks.filter(c => tsIn(c.recordedAt))
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
  const sparkRev = hasLive && sparkRevArr.some(v => v > 0) ? sparkRevArr.map(v => Math.round(v))
    : (isDemo ? [120,134,128,148,162,158,180,195,210,228,242,258] : null);
  const sparkOR  = hasLive && sparkApArr.some(v => v > 0) ? sparkApArr.map(v => Math.round(v))
    : (isDemo ? [38,42,40,46,52,49,58,63,68,74,79,84] : null);

  return {
    isDemo, hasLive,
    overrideRev, apSubmitted, apsCount, nigoDrag,
    grossProducer, medSupp, fe, annuity, leadSpend,
    sparkRev, sparkOR,
  };
}

function _recruitingFunnel() {
  const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
  const apps = AppData.RECRUITING_APPLICANTS || [];
  if (apps.length === 0 && isDemo) {
    return [
      { l: "FB / LinkedIn / YT applied", v: 412, w: 100 },
      { l: "Contracted",                 v: 58,  w: 14 },
      { l: "First app submitted",        v: 24,  w: 6 },
      { l: "Producing 90+ days",         v: 14,  w: 3.4 },
    ];
  }
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
  // Demo-only fallbacks for the KPI strip
  const overrideKpi = m.overrideRev > 0 ? dollarsLive(m.overrideRev) : (m.isDemo ? "258,420" : "—");
  const apKpi       = m.apSubmitted > 0 ? fmtKpiCents(m.apSubmitted) : (m.isDemo ? "1.84M" : "—");
  const apSub       = m.apsCount > 0 ? `${m.apsCount} apps` : (m.isDemo ? "412 apps" : "needs data");
  const nigoKpi     = m.nigoDrag > 0 ? dollarsLive(m.nigoDrag) : (m.isDemo ? "11,420" : "—");
  const recFunnel = _recruitingFunnel();
  const [askValue, setAskValue]  = React.useState("");
  const [waterfallDrill, setDrill] = React.useState(null);

  const ask = (q) => {
    const prompt = q || askValue.trim();
    if (!prompt) return;
    // Open AI rail if it's not already open, and seed it with the prompt
    window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt, context: "P&L · " + period }}));
    setAskValue("");
  };

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify({ period, generated_at: new Date().toISOString(), agency: "Atlas IMO" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `atlas-audit-${period.toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${period} audit pack`, "success");
  };

  const handleAnomaly = (kind) => {
    const map = { "Drill": "book", "Open queue": "nigo", "Notify": "training", "Approve": "attribution" };
    const target = map[kind];
    if (target) window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: target }}));
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Agency P&L</div>
          <div className="page-sub">Atlas Insurance Group · {period === "MTD" ? "Month to date" : period === "T12" ? "Trailing 12" : "Year to date"} · 9 producers · 7 states · live</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.SectionPill items={[{k:"MTD",l:"MTD"},{k:"T12",l:"T12"},{k:"YTD",l:"YTD"}]} value={period} onChange={setPeriod} dense/>
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
        <Shared.KpiCard hero label={`Override revenue · ${period}`} value={overrideKpi} prefix={overrideKpi === "—" ? "" : "$"} sub={m.overrideRev > 0 ? "live · commissions ledger" : (m.isDemo ? "+18.2% vs last month" : "no commissions yet")} trend={m.overrideRev > 0 ? "up" : undefined} spark={m.sparkRev}/>
        <Shared.KpiCard label="AP submitted" value={apKpi} prefix={apKpi === "—" ? "" : "$"} sub={apSub} trend={m.apSubmitted > 0 ? "up" : undefined} spark={m.sparkOR}/>
        <Shared.KpiCard label="NIGO drag" value={nigoKpi} prefix={nigoKpi === "—" ? "" : "$"} sub={m.nigoDrag > 0 ? "live · clawbacks" : (m.isDemo ? "-$2.1k WoW" : "no clawbacks")} trend={m.nigoDrag > 0 ? "up" : undefined} neg={m.nigoDrag > 0 || m.isDemo}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.TrendingUp size={13}/>
            <h3>Revenue waterfall · this month</h3>
            <span className="meta">drill any row</span>
          </div>
          <div className="list">
            {(() => {
              // Demo waterfall when nothing live; otherwise derive in dollars.
              const demoWaterfall = [
                { l: "Producer commissions (gross)", v: 412300, ind: 0, c: "var(--accent-money)" },
                { l: "  Med Supp",                   v: 198200, ind: 1, c: "var(--accent-money)" },
                { l: "  Final Expense",              v: 134700, ind: 1, c: "var(--accent-money-dim)" },
                { l: "  Annuity",                    v: 79400,  ind: 1, c: "var(--state-info)" },
                { l: "Override pool (your slice)",   v: 258420, ind: 0, c: "var(--accent-money)" },
                { l: "− Lead spend",                 v: -78200, ind: 0, c: "var(--state-danger)" },
                { l: "− NIGO chargebacks",           v: -11420, ind: 0, c: "var(--state-danger)" },
                { l: "− SaaS / payroll / other",     v: -64100, ind: 0, c: "var(--text-quaternary)" },
                { l: "Net to owner",                 v: 104700, ind: 0, c: "var(--accent-money)", bold: true },
              ];
              const live = [
                { l: "Producer commissions (gross)", v: Math.round(m.grossProducer / 100), ind: 0, c: "var(--accent-money)" },
                { l: "  Med Supp",                   v: Math.round(m.medSupp / 100),       ind: 1, c: "var(--accent-money)" },
                { l: "  Final Expense",              v: Math.round(m.fe / 100),            ind: 1, c: "var(--accent-money-dim)" },
                { l: "  Annuity",                    v: Math.round(m.annuity / 100),       ind: 1, c: "var(--state-info)" },
                { l: "Override pool (your slice)",   v: Math.round(m.overrideRev / 100),   ind: 0, c: "var(--accent-money)" },
                { l: "− Lead spend",                 v: -Math.round(m.leadSpend / 100),    ind: 0, c: "var(--state-danger)" },
                { l: "− NIGO chargebacks",           v: -Math.round(m.nigoDrag / 100),     ind: 0, c: "var(--state-danger)" },
                // SaaS/payroll: load from agency_fixed_costs if present, else "needs data"
                { l: "− SaaS / payroll / other",     v: -Math.round((AppData.AGENCY_FIXED_COSTS_CENTS || 0) / 100), ind: 0, c: "var(--text-quaternary)" },
              ];
              const net = live.reduce((a, r) => a + r.v, 0);
              live.push({ l: "Net to owner", v: net, ind: 0, c: "var(--accent-money)", bold: true });
              const useLive = m.hasLive;
              const rows = useLive ? live : (m.isDemo ? demoWaterfall : []);
              const max = Math.max(...rows.map(r => Math.abs(r.v)), 1);
              return rows.map((r, i) => ({ ...r, w: Math.max(2, Math.round(Math.abs(r.v) / max * 100)) }));
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
            {waterfallDrill && (
              <div style={{ padding: 12, background: "var(--bg-raised)", borderTop: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--text-primary)" }}>{waterfallDrill}</strong> — drill panel placeholder. Plug in commission ledger / NIGO / lead-spend tables here for the full breakdown.
                <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => ask(`Break down "${waterfallDrill}" — top 3 contributors and what changed vs last ${period}`)}><Icons.Sparkles size={10}/> Ask the Book</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/>
              <h3>Anomalies</h3>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { sev: "warn", t: "Persistency drift", b: "FE 13-mo cohort · -3.2pts WoW · Tampa downline", a: "Drill" },
                { sev: "danger", t: "NIGO spike", b: "Aetna SRC apps · 4 returned · age verification", a: "Open queue" },
                { sev: "warn", t: "AEP readiness", b: "3 producers under 80% on TPMO cert", a: "Notify" },
                { sev: "info", t: "Lead source ROI", b: "FB 'T65 v3' creative · -22% CPL · scale up?", a: "Approve" },
              ].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
                  <span className={`dot dot-${x.sev === "danger" ? "danger" : x.sev === "warn" ? "warn" : "live"}`} style={{ marginTop: 5 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.t}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{x.b}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => handleAnomaly(x.a)}>{x.a}</button>
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
  const { REPS } = AppData;
  const [view, setView] = React.useState("tree");
  const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;

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
  // Convert AP cents to dollars for display sizing
  const bookFor = (r) => {
    const cents = bookByRep[r.id] || 0;
    return cents > 0 ? Math.round(cents / 100) : (isDemo ? r.mtd : 0);
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

  // Hierarchical layout (Tree)
  const sizeFromBook = (book) => Math.max(8, Math.min(32, 12 + (book / 8000)));
  const tree = [
    { id: "owner", x: 480, y: 40,  name: "Atlas IMO",       tier: "diamond",  size: 22 },
    { id: "atl",   x: 240, y: 160, name: "Atlanta region", tier: "platinum", size: 18 },
    { id: "tpa",   x: 720, y: 160, name: "Tampa region",   tier: "platinum", size: 18 },
    ...REPS.slice(0,5).map((r, i) => ({ id: r.id, x: 80  + i * 90, y: 290, name: r.name, tier: r.tier, size: sizeFromBook(bookFor(r)), book: bookFor(r) })),
    ...REPS.slice(5).map((r, i) => ({ id: r.id, x: 560 + i * 90, y: 290, name: r.name, tier: r.tier, size: sizeFromBook(bookFor(r)), book: bookFor(r) })),
  ];
  const links = [
    ["owner","atl"],["owner","tpa"],
    ...REPS.slice(0,5).map(r => ["atl", r.id]),
    ...REPS.slice(5).map(r => ["tpa", r.id]),
  ];

  // Radial layout — owner at center, regions at first ring, reps at outer ring
  const cx = 480, cy = 220;
  const radial = [
    { id: "owner", x: cx, y: cy, name: "Atlas IMO", tier: "diamond", size: 22 },
    ...["atl","tpa"].map((rid, i) => {
      const a = (i / 2) * Math.PI * 2 - Math.PI / 2;
      return { id: rid, x: cx + Math.cos(a) * 110, y: cy + Math.sin(a) * 110, name: rid === "atl" ? "Atlanta region" : "Tampa region", tier: "platinum", size: 18 };
    }),
    ...REPS.map((r, i) => {
      const a = (i / REPS.length) * Math.PI * 2 - Math.PI / 2;
      return { id: r.id, x: cx + Math.cos(a) * 200, y: cy + Math.sin(a) * 200, name: r.name, tier: r.tier, size: sizeFromBook(bookFor(r)), book: bookFor(r) };
    }),
  ];
  const radialLinks = [
    ["owner","atl"],["owner","tpa"],
    ...REPS.slice(0,5).map(r => ["atl", r.id]),
    ...REPS.slice(5).map(r => ["tpa", r.id]),
  ];

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
          <div className="page-sub">{REPS.length} producers · 2 regions · click a node for scorecard</div>
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
              <h3>Atlas IMO {view === "radial" ? "· radial" : "→ regions → producers"}</h3>
              <span className="meta">color = tier · size = book of business</span>
            </div>
            <svg viewBox="0 0 960 440" style={{ width: "100%", height: "calc(100% - 44px)" }}>
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
            </svg>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>{sel?.name}</h3><Shared.TierChip tier={sel?.tier || "platinum"}/></div>
            {(() => {
              // Resolve scope: rep node → that rep; region/owner → all reps in subtree.
              const repObj = sel?.id ? REPS.find(r => r.id === sel.id) : null;
              const scopeRepIds = repObj ? [repObj.id]
                : sel?.id === "atl" ? REPS.slice(0, 5).map(r => r.id)
                : sel?.id === "tpa" ? REPS.slice(5).map(r => r.id)
                : REPS.map(r => r.id);
              const totalBookCents = scopeRepIds.reduce((a, id) => a + (bookByRep[id] || 0), 0);
              const totalBookDollars = totalBookCents > 0 ? Math.round(totalBookCents / 100) : (isDemo ? 1840000 : 0);
              const totalPolicies = scopeRepIds.reduce((a, id) => a + (polCountByRep[id] || 0), 0);
              const totalActive   = scopeRepIds.reduce((a, id) => a + (activeByRep[id] || 0), 0);
              const totalNigos    = scopeRepIds.reduce((a, id) => a + (nigoByRep[id] || 0), 0);
              const totalOverrideCents = scopeRepIds.reduce((a, id) => a + (overrideByRep[id] || 0), 0);
              const persistencyPct = totalPolicies > 0 ? Math.round((totalActive / totalPolicies) * 1000) / 10
                : (isDemo ? 91.4 : null);
              const nigoRatePct = totalPolicies > 0 ? Math.round((totalNigos / totalPolicies) * 1000) / 10
                : (isDemo ? 2.1 : null);
              // Recruits L30: count of recruiting_applicants whose recruiterRepId is in scope and createdAt within 30d
              const recApps = AppData.RECRUITING_APPLICANTS || [];
              const cutoff = Date.now() - 30 * 86400000;
              const recruitsL30 = recApps.filter(a => scopeRepIds.includes(a.recruiterRepId) && a.createdAt && new Date(a.createdAt).getTime() >= cutoff).length;
              // Override % = override commissions / producer commissions in scope (live), else demo 22%
              const producerCommScope = commissions.filter(c => c.kind !== "override" && scopeRepIds.includes(c.repId)).reduce((a, c) => a + (c.amount || 0), 0);
              const overridePct = producerCommScope > 0 ? Math.round((totalOverrideCents / producerCommScope) * 1000) / 10
                : (isDemo ? 22 : null);
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
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Recruits L30</div><div className="tabular" style={{ fontWeight: 500 }}>{recruitsL30 || (isDemo ? "3" : "—")}</div></div>
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
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${r.mtd.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: r.streak > 10 ? "var(--accent-heat)" : "var(--text-tertiary)" }}>{r.streak}d</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.dials}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.appts}</div>
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
