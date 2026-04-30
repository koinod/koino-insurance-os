/* page-attribution.jsx — Lead Vendors page + ROI loop

   Wires Lead Vendors → Pipeline (cost per lead) → Commissions (realized AP
   per lead) into a single ROI table per vendor / state / product / month.
   Owner sees the full org view; manager sees their downline (in real wiring
   would scope by upline). */

(function () {

const VENDORS = [
  { id: "v1", name: "Facebook · T65 v3 creative",  category: "Paid social", spend: 4820, leads: 142, cpl: 33.94, contacts: 124, quotes: 41, issued: 14, ap: 26840, persistency: 92, status: "ok"  },
  { id: "v2", name: "Facebook · FE 2026 lookalike", category: "Paid social", spend: 3140, leads: 96,  cpl: 32.71, contacts: 78,  quotes: 22, issued: 8,  ap: 12480, persistency: 84, status: "ok"  },
  { id: "v3", name: "Inbound calls · Convoso",       category: "Inbound",     spend: 1280, leads: 38,  cpl: 33.68, contacts: 38,  quotes: 24, issued: 14, ap: 28110, persistency: 96, status: "ok"  },
  { id: "v4", name: "T65 list · DataMail",            category: "List",        spend: 1840, leads: 184, cpl: 10.00, contacts: 92,  quotes: 22, issued: 6,  ap:  9340, persistency: 81, status: "ok"  },
  { id: "v5", name: "Referral · Producer downline",  category: "Referral",    spend:  120, leads: 34,  cpl:  3.53, contacts: 32,  quotes: 18, issued: 11, ap: 22180, persistency: 94, status: "ok"  },
  { id: "v6", name: "LinkedIn · agency owners",      category: "Paid social", spend: 2410, leads: 48,  cpl: 50.21, contacts: 22,  quotes:  9, issued: 2,  ap:  3240, persistency: 78, status: "warn" },
  { id: "v7", name: "Google · 'medicare supplement'", category: "Paid search", spend: 6240, leads: 88,  cpl: 70.91, contacts: 52,  quotes: 31, issued: 12, ap: 24400, persistency: 93, status: "ok"  },
];

const BY_STATE = [
  { state: "TX", spend: 4820, ap: 18420, lift: 3.82 },
  { state: "FL", spend: 3140, ap: 12480, lift: 3.97 },
  { state: "GA", spend: 1280, ap:  9340, lift: 7.30 },
  { state: "NV", spend:  840, ap:  6210, lift: 7.39 },
  { state: "AZ", spend: 1610, ap:  3210, lift: 1.99 },
  { state: "OH", spend: 1240, ap:  4820, lift: 3.89 },
  { state: "PA", spend:  920, ap:  6480, lift: 7.04 },
];

const BY_PRODUCT = [
  { p: "Med Supp Plan G", spend: 6840, ap: 28840, lift: 4.22 },
  { p: "Med Supp Plan N", spend: 1240, ap:  4820, lift: 3.89 },
  { p: "Final Expense",    spend: 4820, ap: 18420, lift: 3.82 },
  { p: "Annuity",          spend: 2140, ap: 12420, lift: 5.81 },
];

function PageAttribution({ role = "owner" }) {
  const [tab, setTab] = React.useState("vendors");
  const [sort, setSort] = React.useState({ key: "roas", dir: "desc" });

  const enriched = VENDORS.map(v => ({
    ...v,
    closeRate: v.contacts ? (v.issued / v.contacts) * 100 : 0,
    cpa:        v.issued ? v.spend / v.issued : 0,
    cpc:        v.contacts ? v.spend / v.contacts : 0,
    roas:       v.spend ? v.ap / v.spend : 0,
  }));

  const sortBy = (k) => setSort(s => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  const sorted = [...enriched].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.dir === "desc" ? -cmp : cmp;
  });
  const SortH = ({ k, label, right }) => (
    <div onClick={() => sortBy(k)} style={{ cursor: "pointer", textAlign: right ? "right" : "left", display: "flex", gap: 4, justifyContent: right ? "flex-end" : "flex-start" }}>
      {label}{sort.key === k && <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{sort.dir === "desc" ? "↓" : "↑"}</span>}
    </div>
  );

  const totalSpend = VENDORS.reduce((a, v) => a + v.spend, 0);
  const totalAP    = VENDORS.reduce((a, v) => a + v.ap, 0);
  const totalLeads = VENDORS.reduce((a, v) => a + v.leads, 0);
  const totalIssued= VENDORS.reduce((a, v) => a + v.issued, 0);
  const blendedROAS = totalSpend ? totalAP / totalSpend : 0;
  const blendedCPA  = totalIssued ? totalSpend / totalIssued : 0;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Lead Vendors · Attribution</div>
          <div className="page-sub">Acquisition cost → Pipeline outcomes → Commissions, by vendor / state / product</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Calendar size={13}/> April</button>
          <button className="btn"><Icons.ArrowUpRight size={13}/> Export</button>
          <button className="btn btn-primary"><Icons.Plus size={13}/> New vendor</button>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Spend MTD" prefix="$" value={totalSpend.toLocaleString()} sub={`${totalLeads} leads`}/>
        <Shared.KpiCard      label="Realized AP" prefix="$" value={totalAP.toLocaleString()} sub={`${totalIssued} issued`} trend="up"/>
        <Shared.KpiCard      label="Blended ROAS" value={blendedROAS.toFixed(2) + "x"} trend="up"/>
        <Shared.KpiCard      label="Blended CPA" prefix="$" value={Math.round(blendedCPA).toLocaleString()}/>
      </div>

      <div className="rec-tabs">
        {[["vendors","By vendor"],["state","By state"],["product","By product"],["roi","ROI explorer"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rec-tab ${tab === k ? "active" : ""}`}>{l}</button>
        ))}
      </div>

      {tab === "vendors" && (
        <div className="panel">
          <div className="panel-h"><h3>By vendor · April</h3><span className="meta">{VENDORS.length} sources</span></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 80px 80px 90px 90px 80px" }}>
              <SortH k="name"      label="Vendor"/>
              <SortH k="category"  label="Category"/>
              <SortH k="spend"     label="Spend" right/>
              <SortH k="leads"     label="Leads" right/>
              <SortH k="cpl"       label="CPL"   right/>
              <SortH k="issued"    label="Issued" right/>
              <SortH k="cpa"       label="CPA"   right/>
              <SortH k="ap"        label="AP"    right/>
              <SortH k="roas"      label="ROAS"  right/>
            </div>
            {sorted.map(v => (
              <div key={v.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 80px 80px 90px 90px 80px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dot dot-${v.status === "ok" ? "live" : "warn"}`}></span>
                  <span style={{ fontWeight: 500 }}>{v.name}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{v.category}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${v.spend.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{v.leads}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${v.cpl.toFixed(2)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>{v.issued}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${Math.round(v.cpa).toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${v.ap.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: v.roas >= 4 ? "var(--accent-money)" : v.roas >= 2 ? "var(--accent-status)" : "var(--state-danger)", fontWeight: 600 }}>{v.roas.toFixed(2)}x</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "state" && (
        <div className="panel">
          <div className="panel-h"><h3>By state</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "100px 100px 100px 100px 1fr" }}>
              <div>State</div>
              <div className="tabular" style={{ textAlign: "right" }}>Spend</div>
              <div className="tabular" style={{ textAlign: "right" }}>AP</div>
              <div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
              <div></div>
            </div>
            {BY_STATE.sort((a, b) => b.lift - a.lift).map(r => (
              <div key={r.state} className="row" style={{ gridTemplateColumns: "100px 100px 100px 100px 1fr" }}>
                <div style={{ fontWeight: 500 }}>{r.state}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${r.spend.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${r.ap.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: r.lift >= 4 ? "var(--accent-money)" : "var(--text-secondary)", fontWeight: 600 }}>{r.lift.toFixed(2)}x</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, r.lift * 12)}%`, height: "100%", background: r.lift >= 4 ? "var(--accent-money)" : "var(--state-warning)" }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "product" && (
        <div className="panel">
          <div className="panel-h"><h3>By product</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 100px 100px 1fr" }}>
              <div>Product</div>
              <div className="tabular" style={{ textAlign: "right" }}>Spend</div>
              <div className="tabular" style={{ textAlign: "right" }}>AP</div>
              <div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
              <div></div>
            </div>
            {BY_PRODUCT.sort((a, b) => b.lift - a.lift).map(r => (
              <div key={r.p} className="row" style={{ gridTemplateColumns: "1.4fr 100px 100px 100px 1fr" }}>
                <div style={{ fontWeight: 500 }}>{r.p}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${r.spend.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${r.ap.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: r.lift >= 4 ? "var(--accent-money)" : "var(--text-secondary)", fontWeight: 600 }}>{r.lift.toFixed(2)}x</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, r.lift * 12)}%`, height: "100%", background: r.lift >= 4 ? "var(--accent-money)" : "var(--state-warning)" }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "roi" && <ROIExplorer enriched={enriched}/>}
    </div>
  );
}

function ROIExplorer({ enriched }) {
  const [budget, setBudget] = React.useState(20000);
  // Greedy allocator: spend $1 at a time on the highest-ROAS vendor that hasn't hit a saturation cap
  const cap = 12000; // arbitrary saturation cap per vendor for prototype
  const sorted = [...enriched].sort((a, b) => b.roas - a.roas);
  let remaining = budget;
  const alloc = sorted.map(v => {
    const give = Math.min(remaining, cap);
    remaining -= give;
    return { ...v, alloc: give };
  });
  const projAP = alloc.reduce((a, v) => a + v.alloc * v.roas, 0);

  return (
    <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>What if I spent ${budget.toLocaleString()} next month?</h3></div>
        <div style={{ padding: 14 }}>
          <input type="range" min={5000} max={50000} step={1000} value={budget} onChange={(e) => setBudget(+e.target.value)} style={{ width: "100%" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
            <span>$5k</span><span>$50k</span>
          </div>

          <div style={{ marginTop: 14 }}>
            {alloc.filter(a => a.alloc > 0).map(a => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 80px 80px 1fr", padding: "6px 0", alignItems: "center", fontSize: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                <span className="tabular" style={{ textAlign: "right" }}>${a.alloc.toLocaleString()}</span>
                <span className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>{a.roas.toFixed(2)}x</span>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                  <div style={{ width: `${(a.alloc / budget) * 100}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: 12, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "var(--accent-money)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>Projected outcome</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, marginTop: 4 }}>${Math.round(projAP).toLocaleString()} AP</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>Net to owner override (22%): ${Math.round(projAP * 0.22).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Optimization opportunities</h3></div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { k: "Cut",   t: "LinkedIn · agency owners", b: "ROAS 1.34x — below 2x threshold. -$2,410/mo, -$3.2k AP. Net +$2,300", c: "var(--state-danger)" },
            { k: "Scale", t: "Referral · Producer downline", b: "ROAS 184x. Marginal CAC = $3.53. Push downline incentives.",   c: "var(--accent-money)" },
            { k: "Test",  t: "Google 'medicare supplement' broaden", b: "Top of funnel CPC bidding may be too narrow — test +20% budget", c: "var(--accent-status)" },
            { k: "Watch", t: "T65 list · DataMail",        b: "Persistency 81%, below cohort. Watch FE 13-mo lapse next month.",     c: "var(--state-warning)" },
          ].map((x, i) => (
            <div key={i} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="chip" style={{ color: x.c, borderColor: `color-mix(in oklch, ${x.c} 30%, transparent)`, background: `color-mix(in oklch, ${x.c} 10%, transparent)`, fontWeight: 600 }}>{x.k}</span>
                <strong style={{ fontSize: 12.5 }}>{x.t}</strong>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>{x.b}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.PageAttribution = PageAttribution;

})();
