/* Page: Owner — P&L + Org Tree */
function PagePnL() {
  const sparkRev = [120,134,128,148,162,158,180,195,210,228,242,258];
  const sparkOR = [38,42,40,46,52,49,58,63,68,74,79,84];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Agency P&L</div>
          <div className="page-sub">Atlas Insurance Group · Trailing 12 · 9 producers · 7 states · live</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Calendar size={13}/> T12</button>
          <button className="btn"><Icons.ArrowUpRight size={13}/> Export audit</button>
        </div>
      </div>

      {/* Ask the Book */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 10, marginBottom: 14 }}>
        <Icons.Sparkles size={14} style={{ color: "var(--accent-money)" }}/>
        <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>Ask the Book —</span>
        <span style={{ color: "var(--text-primary)", fontSize: 12.5 }}>"Which downlines have persistency under 80% in their FE 13-month cohort?"</span>
        <span className="kbd mono" style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 11 }}>⌘K</span>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Override revenue · MTD" value="258,420" prefix="$" sub="+18.2% vs last month" trend="up" spark={sparkRev}/>
        <Shared.KpiCard label="AP submitted" value="1.84M" prefix="$" sub="412 apps" trend="up" spark={sparkOR}/>
        <Shared.KpiCard label="NIGO drag" value="11,420" prefix="$" sub="-$2.1k WoW" trend="up" neg spark={[18,16,17,14,15,13,11.4]}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.TrendingUp size={13}/>
            <h3>Revenue waterfall · this month</h3>
            <span className="meta">drill any row</span>
          </div>
          <div className="list">
            {[
              { l: "Producer commissions (gross)", v: 412300, ind: 0, w: 100, c: "var(--accent-money)" },
              { l: "  Med Supp", v: 198200, ind: 1, w: 48, c: "var(--accent-money)" },
              { l: "  Final Expense", v: 134700, ind: 1, w: 33, c: "var(--accent-money-dim)" },
              { l: "  Annuity", v: 79400, ind: 1, w: 19, c: "var(--state-info)" },
              { l: "Override pool (your slice)", v: 258420, ind: 0, w: 63, c: "var(--accent-money)" },
              { l: "− Lead spend", v: -78200, ind: 0, w: 19, c: "var(--state-danger)" },
              { l: "− NIGO chargebacks", v: -11420, ind: 0, w: 3, c: "var(--state-danger)" },
              { l: "− SaaS / payroll / other", v: -64100, ind: 0, w: 16, c: "var(--text-quaternary)" },
              { l: "Net to owner", v: 104700, ind: 0, w: 25, c: "var(--accent-money)", bold: true },
            ].map((r, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 110px", height: 36, paddingLeft: 14 + r.ind * 16 }}>
                <div style={{ color: r.bold ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: r.bold ? 600 : 400, fontSize: 12.5 }}>{r.l}</div>
                <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden", margin: "0 14px" }}>
                  <div style={{ width: `${r.w}%`, height: "100%", background: r.c }}></div>
                </div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: r.bold ? 600 : 500, color: r.v < 0 ? "var(--state-danger)" : "var(--text-primary)" }}>${Math.abs(r.v).toLocaleString()}</div>
              </div>
            ))}
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
                  <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>{x.a}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Recruiting funnel</h3></div>
            <div style={{ padding: 14 }}>
              {[
                { l: "FB / LinkedIn / YT applied", v: 412, w: 100 },
                { l: "Contracted", v: 58, w: 14 },
                { l: "First app submitted", v: 24, w: 6 },
                { l: "Producing 90+ days", v: 14, w: 3.4 },
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 60px 1fr", padding: "5px 0", alignItems: "center", fontSize: 12, borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0 }}>
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

  // Hierarchical layout (Tree)
  const tree = [
    { id: "owner", x: 480, y: 40, name: "Atlas IMO", tier: "diamond", size: 22 },
    { id: "atl",   x: 240, y: 160, name: "Atlanta region", tier: "platinum", size: 18 },
    { id: "tpa",   x: 720, y: 160, name: "Tampa region",   tier: "platinum", size: 18 },
    ...REPS.slice(0,5).map((r, i) => ({ id: r.id, x: 80  + i * 90, y: 290, name: r.name, tier: r.tier, size: 12 + (r.mtd / 8000), book: r.mtd })),
    ...REPS.slice(5).map((r, i) => ({ id: r.id, x: 560 + i * 90, y: 290, name: r.name, tier: r.tier, size: 12 + (r.mtd / 8000), book: r.mtd })),
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
      return { id: r.id, x: cx + Math.cos(a) * 200, y: cy + Math.sin(a) * 200, name: r.name, tier: r.tier, size: 12 + (r.mtd / 8000), book: r.mtd };
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
                <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }} onMouseEnter={() => setHover(n.id)}>
                  <circle r={n.size + 8} fill="none" stroke={colorFor(n.tier)} strokeOpacity={hover === n.id ? 0.5 : 0.15} strokeWidth={hover === n.id ? 2 : 1.5}/>
                  <circle r={n.size} fill={`url(#g-${view}-${n.id})`} stroke={colorFor(n.tier)} strokeWidth="1.2"/>
                  <text x="0" y={n.size + 18} textAnchor="middle" fill="var(--text-secondary)" fontSize="10.5" fontFamily="var(--font-ui)">{n.name.split(" ")[0]}</text>
                </g>
              ))}
            </svg>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>{sel?.name}</h3><Shared.TierChip tier={sel?.tier || "platinum"}/></div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Book of business</div>
              <div className="tabular" style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.025em", marginTop: 4 }}>${(sel?.book || 1840000).toLocaleString()}</div>
              <div style={{ fontSize: 11.5, color: "var(--accent-money)", marginTop: 2 }}><Icons.TrendingUp size={11}/> +18% trailing 30</div>

              <div className="divider"></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Persistency</div><div className="tabular" style={{ fontWeight: 500 }}>91.4%</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>NIGO rate</div><div className="tabular" style={{ fontWeight: 500 }}>2.1%</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Recruits L30</div><div className="tabular" style={{ fontWeight: 500 }}>3</div></div>
                <div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Override</div><div className="tabular" style={{ fontWeight: 500 }}>22%</div></div>
              </div>

              <div className="divider"></div>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}><Icons.ArrowUpRight size={12}/> Drill into sub-tree</button>
            </div>
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
