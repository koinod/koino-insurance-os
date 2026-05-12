/* page-attribution.jsx — Lead Vendors page + ROI loop

   Wires Lead Vendors → Pipeline (cost per lead) → Policies (issued AP per
   source) into a single ROI table per vendor / state / product / month.
   Owner sees the full org view; manager scopes via window.scopeRepIds().

   Live data flow:
     AppData.LEAD_SOURCES  → vendor catalog (id, name, vendor, kind)
     AppData.EXPENSES      → lead_spend rows tagged to lead_source_id
     AppData.PIPELINE      → leads (count + state + product + owner)
     AppData.POLICIES      → issued AP per lead (joined back to source)
     AppData.ATTRIBUTIONS  → first-touch / last-touch credit per lead

   Demo arrays only render for demo agencies (was: every viewer). */

(function () {

const VENDORS_DEMO = [
  { id: "v1", name: "Facebook · T65 v3 creative",  category: "Paid social", spend: 4820, leads: 142, cpl: 33.94, contacts: 124, quotes: 41, issued: 14, ap: 26840, persistency: 92, status: "ok"  },
  { id: "v2", name: "Facebook · FE 2026 lookalike", category: "Paid social", spend: 3140, leads: 96,  cpl: 32.71, contacts: 78,  quotes: 22, issued: 8,  ap: 12480, persistency: 84, status: "ok"  },
  { id: "v3", name: "Inbound calls · Convoso",       category: "Inbound",     spend: 1280, leads: 38,  cpl: 33.68, contacts: 38,  quotes: 24, issued: 14, ap: 28110, persistency: 96, status: "ok"  },
  { id: "v4", name: "T65 list · DataMail",            category: "List",        spend: 1840, leads: 184, cpl: 10.00, contacts: 92,  quotes: 22, issued: 6,  ap:  9340, persistency: 81, status: "ok"  },
  { id: "v5", name: "Referral · Producer downline",  category: "Referral",    spend:  120, leads: 34,  cpl:  3.53, contacts: 32,  quotes: 18, issued: 11, ap: 22180, persistency: 94, status: "ok"  },
  { id: "v6", name: "LinkedIn · agency owners",      category: "Paid social", spend: 2410, leads: 48,  cpl: 50.21, contacts: 22,  quotes:  9, issued: 2,  ap:  3240, persistency: 78, status: "warn" },
  { id: "v7", name: "Google · 'medicare supplement'", category: "Paid search", spend: 6240, leads: 88,  cpl: 70.91, contacts: 52,  quotes: 31, issued: 12, ap: 24400, persistency: 93, status: "ok"  },
];

const BY_STATE_DEMO = [
  { state: "TX", spend: 4820, ap: 18420, lift: 3.82 },
  { state: "FL", spend: 3140, ap: 12480, lift: 3.97 },
  { state: "GA", spend: 1280, ap:  9340, lift: 7.30 },
  { state: "NV", spend:  840, ap:  6210, lift: 7.39 },
  { state: "AZ", spend: 1610, ap:  3210, lift: 1.99 },
  { state: "OH", spend: 1240, ap:  4820, lift: 3.89 },
  { state: "PA", spend:  920, ap:  6480, lift: 7.04 },
];

const BY_PRODUCT_DEMO = [
  { p: "Med Supp Plan G", spend: 6840, ap: 28840, lift: 4.22 },
  { p: "Med Supp Plan N", spend: 1240, ap:  4820, lift: 3.89 },
  { p: "Final Expense",    spend: 4820, ap: 18420, lift: 3.82 },
  { p: "Annuity",          spend: 2140, ap: 12420, lift: 5.81 },
];

// Roll up live data into the prototype's expected vendor / state / product
// shapes for a given period. Returns { vendors, byState, byProduct, isLive }.
// When the tenant has no lead spend or sources, callers fall back to the
// demo arrays for demo agencies and render an empty state for real agencies.
function _liveAttribution(period = "MTD", treeScopeIds = null) {
  const sources    = (window.AppData && window.AppData.LEAD_SOURCES) || [];
  const expenses   = (window.AppData && window.AppData.EXPENSES) || [];
  const pipeline   = (window.AppData && window.AppData.PIPELINE) || [];
  const policies   = (window.AppData && window.AppData.POLICIES) || [];
  const attributions = (window.AppData && window.AppData.ATTRIBUTIONS) || [];

  // Period cutoff — same windows as page-expenses.jsx + page-today so the
  // operator sees the same numbers between surfaces.
  const now = new Date();
  const cutoff = (() => {
    if (period === "MTD") return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === "T30") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    if (period === "T90") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    if (period === "YTD") return new Date(now.getFullYear(), 0, 1);
    return new Date(0);
  })();

  // Apply manager scope, then layer the Org Tree handoff scope. tree scope
  // wins (operator explicitly clicked "Drill into sub-tree"); manager scope
  // is the default for non-owner viewers.
  const managerScope = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const effectiveScope = treeScopeIds && treeScopeIds.length > 0 ? treeScopeIds : managerScope;
  const scopedPipeline = effectiveScope ? pipeline.filter(l => !l.owner || effectiveScope.includes(l.owner)) : pipeline;
  const scopedPolicies = effectiveScope ? policies.filter(p => !p.owner || effectiveScope.includes(p.owner)) : policies;

  // 1. Spend per source (cents) within the period window. Lead-spend
  // expenses tagged to a lead_source_id are authoritative; untagged spend
  // bucketed under "_untagged" so the operator sees the gap.
  const spendBySource = {};
  for (const e of expenses) {
    if (e.kind !== "lead_spend") continue;
    if (e.paid_at && new Date(e.paid_at) < cutoff) continue;
    const k = e.lead_source_id || "_untagged";
    spendBySource[k] = (spendBySource[k] || 0) + (e.amount_cents || 0);
  }
  if (Object.keys(spendBySource).length === 0) {
    return { vendors: [], byState: [], byProduct: [], isLive: false };
  }

  // 2. Lead → source map. Prefer attributions.last_touch_at picked source;
  // fall back to pipeline.source string match against source.name.
  const sourceByName = new Map(sources.map(s => [String(s.name || "").toLowerCase(), s.id]));
  const sourceIdByLead = new Map();
  for (const a of attributions) {
    if (a.leadId && a.sourceId) sourceIdByLead.set(a.leadId, a.sourceId);
  }
  for (const l of scopedPipeline) {
    if (sourceIdByLead.has(l.id)) continue;
    const sid = sourceByName.get(String(l.source || "").toLowerCase());
    if (sid) sourceIdByLead.set(l.id, sid);
  }

  // 3. Per-source counters: leads, contacts, quotes, issued, AP.
  const counter = () => ({ leads: 0, contacts: 0, quotes: 0, issued: 0, ap: 0 });
  const bySource = {};
  for (const sid of Object.keys(spendBySource)) bySource[sid] = counter();
  const stageHasContact = new Set(["Contacted", "Quoted", "App In", "Issued"]);
  const stageHasQuote   = new Set(["Quoted", "App In", "Issued"]);
  for (const l of scopedPipeline) {
    const sid = sourceIdByLead.get(l.id) || "_untagged";
    if (!bySource[sid]) bySource[sid] = counter();
    bySource[sid].leads++;
    if (stageHasContact.has(l.stage)) bySource[sid].contacts++;
    if (stageHasQuote.has(l.stage))   bySource[sid].quotes++;
    if (l.stage === "Issued")           bySource[sid].issued++;
  }
  const policyByLead = new Map();
  for (const p of scopedPolicies) if (p.leadId) policyByLead.set(p.leadId, p);
  for (const l of scopedPipeline) {
    const sid = sourceIdByLead.get(l.id) || "_untagged";
    const pol = policyByLead.get(l.id);
    if (!bySource[sid]) bySource[sid] = counter();
    if (pol) bySource[sid].ap += pol.ap || 0;
  }

  const sourceById = Object.fromEntries(sources.map(s => [s.id, s]));
  const vendors = Object.entries(spendBySource).map(([sid, spendCents]) => {
    const src = sourceById[sid];
    const c   = bySource[sid] || counter();
    const spend = spendCents / 100;
    return {
      id: sid,
      name: src ? src.name : (sid === "_untagged" ? "Untagged spend" : sid),
      category: src ? (src.kind || src.vendor || "Other") : "Untagged",
      spend, leads: c.leads,
      cpl: c.leads ? spend / c.leads : 0,
      contacts: c.contacts, quotes: c.quotes, issued: c.issued,
      ap: c.ap,
      persistency: null, status: spend > 0 && c.ap === 0 ? "warn" : "ok",
    };
  }).filter(v => v.spend > 0 || v.leads > 0);

  // By state — sum across leads, attribute spend by lead-share per source.
  const stateAgg = {};
  for (const l of scopedPipeline) {
    if (!l.state) continue;
    const sid = sourceIdByLead.get(l.id) || "_untagged";
    const sourceSpend = spendBySource[sid] || 0;
    const sourceLeads = (bySource[sid] || counter()).leads || 1;
    const sharePerLead = sourceSpend / sourceLeads / 100;
    stateAgg[l.state] = stateAgg[l.state] || { spend: 0, ap: 0 };
    stateAgg[l.state].spend += sharePerLead;
    const pol = policyByLead.get(l.id);
    if (pol) stateAgg[l.state].ap += pol.ap || 0;
  }
  const byState = Object.entries(stateAgg).map(([state, v]) => ({
    state, spend: Math.round(v.spend), ap: Math.round(v.ap),
    lift: v.spend > 0 ? +(v.ap / v.spend).toFixed(2) : 0,
  }));

  // By product — issued policies grouped by product_text.
  const productAgg = {};
  for (const l of scopedPipeline) {
    const sid = sourceIdByLead.get(l.id) || "_untagged";
    const sourceSpend = spendBySource[sid] || 0;
    const sourceLeads = (bySource[sid] || counter()).leads || 1;
    const sharePerLead = sourceSpend / sourceLeads / 100;
    const pol = policyByLead.get(l.id);
    const key = pol?.product || l.product || "Unspecified";
    productAgg[key] = productAgg[key] || { spend: 0, ap: 0 };
    productAgg[key].spend += sharePerLead;
    if (pol) productAgg[key].ap += pol.ap || 0;
  }
  const byProduct = Object.entries(productAgg).map(([p, v]) => ({
    p, spend: Math.round(v.spend), ap: Math.round(v.ap),
    lift: v.spend > 0 ? +(v.ap / v.spend).toFixed(2) : 0,
  }));

  return { vendors, byState, byProduct, isLive: true };
}

function PageAttribution({ role = "owner" }) {
  // Re-render on hydrate / mutate ticks so realtime expense + policy inserts
  // move the numbers without the operator refreshing the page.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);

  // Scope handoff from Org Tree -> "Drill into sub-tree" puts rep_ids and
  // a human label into sessionStorage; we read them once on mount, restrict
  // _liveAttribution's pipeline/policies to those reps, and surface a
  // "Filtered to: X" chip the operator can clear.
  const [scopeFromTree, setScopeFromTree] = React.useState(null);
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("repflow.scope.rep_ids");
      const label = sessionStorage.getItem("repflow.scope.label");
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids) && ids.length > 0) setScopeFromTree({ ids, label: label || "filtered" });
      }
      sessionStorage.removeItem("repflow.scope.rep_ids");
      sessionStorage.removeItem("repflow.scope.label");
    } catch {}
  }, []);

  const [tab, setTab] = React.useState("vendors");
  const [period, setPeriod] = React.useState("MTD");  // MTD | T30 | T90 | YTD
  const [sort, setSort] = React.useState({ key: "roas", dir: "desc" });
  const [newVendorOpen, setNewVendorOpen] = React.useState(false);

  const live = _liveAttribution(period, scopeFromTree?.ids);
  const isDemoAgency = !!(window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency());
  const VENDORS    = live.isLive ? live.vendors    : (isDemoAgency ? VENDORS_DEMO    : []);
  const BY_STATE   = live.isLive ? live.byState    : (isDemoAgency ? BY_STATE_DEMO   : []);
  const BY_PRODUCT = live.isLive ? live.byProduct  : (isDemoAgency ? BY_PRODUCT_DEMO : []);

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

  const periodLabel = { MTD: "Month to date", T30: "Trailing 30d", T90: "Trailing 90d", YTD: "Year to date" }[period] || period;

  // Export CSV of the currently-active tab. Function is what the operator
  // sees: vendor / state / product rollup downloads as a CSV per-period.
  const exportCsv = () => {
    let header, rows, fileBase;
    if (tab === "vendors") {
      header = ["vendor","category","spend","leads","cpl","issued","cpa","ap","roas"];
      rows = sorted.map(v => [v.name, v.category, v.spend.toFixed(2), v.leads, v.cpl.toFixed(2), v.issued, v.cpa.toFixed(2), v.ap.toFixed(2), v.roas.toFixed(2)]);
      fileBase = "attribution_vendors";
    } else if (tab === "state") {
      header = ["state","spend","ap","roas"];
      rows = BY_STATE.map(r => [r.state, r.spend, r.ap, r.lift]);
      fileBase = "attribution_by_state";
    } else if (tab === "product") {
      header = ["product","spend","ap","roas"];
      rows = BY_PRODUCT.map(r => [r.p, r.spend, r.ap, r.lift]);
      fileBase = "attribution_by_product";
    } else {
      window.toast && window.toast("Switch to By vendor / state / product to export", "info");
      return;
    }
    const escape = (cell) => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header.join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}_${period.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    window.toast && window.toast(`Exported ${period} ${tab}`, "success");
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Lead Vendors · Attribution</div>
          <div className="page-sub">
            {periodLabel} · acquisition cost → pipeline outcomes → policies, by vendor / state / product
            {scopeFromTree && (
              <span style={{ marginLeft: 10, padding: "2px 10px", borderRadius: 100, background: "color-mix(in oklch, var(--accent-money) 12%, transparent)", color: "var(--accent-money)", fontSize: 11, fontWeight: 500 }}>
                Filtered: {scopeFromTree.label}
                <button onClick={() => setScopeFromTree(null)} className="btn btn-ghost" style={{ marginLeft: 6, padding: "0 4px", fontSize: 10, color: "var(--accent-money)" }} title="Clear filter">×</button>
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.SectionPill
            items={[{k:"T30",l:"30d"},{k:"MTD",l:"MTD"},{k:"T90",l:"90d"},{k:"YTD",l:"YTD"}]}
            value={period}
            onChange={setPeriod}
            dense
          />
          <button className="btn" onClick={exportCsv} title={`Download ${tab} as CSV`}>
            <Icons.ArrowUpRight size={13}/> Export
          </button>
          <button className="btn btn-primary" onClick={() => setNewVendorOpen(true)}>
            <Icons.Plus size={13}/> New vendor
          </button>
        </div>
      </div>

      {newVendorOpen && (
        <NewLeadVendorModal onClose={() => setNewVendorOpen(false)}/>
      )}

      <div className="kpi-row">
        <Shared.KpiCard hero label="Spend MTD" prefix="$" value={totalSpend.toLocaleString()} sub={`${totalLeads} leads`}/>
        <Shared.KpiCard      label="Realized AP" prefix="$" value={totalAP.toLocaleString()} sub={`${totalIssued} issued`} trend="up"/>
        <Shared.KpiCard      label="Blended ROAS" value={blendedROAS.toFixed(2) + "x"} trend="up"/>
        <Shared.KpiCard      label="Blended CPA" prefix="$" value={Math.round(blendedCPA).toLocaleString()}/>
      </div>

      <Shared.SectionPill
        items={[{k:"vendors",l:"By vendor"},{k:"state",l:"By state"},{k:"product",l:"By product"},{k:"roi",l:"ROI explorer"}]}
        value={tab}
        onChange={setTab}
      />

      {VENDORS.length === 0 && (
        <div className="koino-ds">
          <div className="koino-empty">
            <div className="koino-empty-icon"><Icons.TrendingUp size={16}/></div>
            <h4>No lead spend tracked yet</h4>
            <p>Log lead-spend expenses with a <span className="mono" style={{ color: "var(--k-a)" }}>lead_source_id</span> tag in Expenses. ROAS, CPA, and CPL populate here automatically as policies issue against those leads.</p>
            <button
              className="koino-btn koino-btn-primary"
              onClick={() => window.gotoPage && window.gotoPage("expenses")}
            ><Icons.ArrowUpRight size={11}/> Open Expenses</button>
          </div>
        </div>
      )}

      {tab === "vendors" && (
        <div className="panel">
          <div className="panel-h"><h3>By vendor · {period}</h3><span className="meta">{VENDORS.length} source{VENDORS.length === 1 ? "" : "s"}</span></div>
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

      {tab === "roi" && <ROIExplorer enriched={enriched} period={period}/>}
    </div>
  );
}

function ROIExplorer({ enriched, period }) {
  const [budget, setBudget] = React.useState(20000);
  // Saturation cap derived from each vendor's historical spend × 2 — better
  // than the arbitrary $12k flat cap. Smaller vendors don't get over-allocated.
  const sorted = [...enriched].filter(v => v.roas > 0).sort((a, b) => b.roas - a.roas);
  let remaining = budget;
  const alloc = sorted.map(v => {
    const cap = Math.max(v.spend * 2, 1500);   // floor at $1.5k so new vendors get a shot
    const give = Math.min(remaining, cap);
    remaining -= give;
    return { ...v, alloc: give };
  });
  const projAP = alloc.reduce((a, v) => a + v.alloc * v.roas, 0);

  // Owner override percentage from agency config; fall back to industry
  // default. Was hardcoded 22%; now reflects whatever the owner set in
  // Settings -> Org config (or the future Compensation tab).
  const overridePct = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().override_pct) || 0.22;

  return (
    <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>If I spent ${budget.toLocaleString()} next month</h3>
          <span className="meta">basis: {period}</span>
        </div>
        <div style={{ padding: 14 }}>
          <input type="range" min={5000} max={100000} step={1000} value={budget} onChange={(e) => setBudget(+e.target.value)} style={{ width: "100%" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
            <span>$5k</span><span>$100k</span>
          </div>

          <div style={{ marginTop: 14 }}>
            {alloc.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
                No vendors with positive ROAS to allocate against. Log lead spend + issue policies to unlock the projection.
              </div>
            )}
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
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
              Net to owner override ({Math.round(overridePct * 100)}%): ${Math.round(projAP * overridePct).toLocaleString()}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
              Override % from AgencyConfig — change in Settings to recalibrate.
            </div>
          </div>
        </div>
      </div>

      <OptimizationOpportunitiesPanel vendors={enriched}/>
    </div>
  );
}

// Live-data optimization signals. Was a static list of 4 hardcoded items
// referencing demo vendor names; now derived from the actual VENDORS array
// for the current period.
function OptimizationOpportunitiesPanel({ vendors }) {
  const ops = React.useMemo(() => {
    const out = [];
    // Cut: any vendor spending > $100 with ROAS < 2 (loses money)
    for (const v of vendors) {
      if (v.spend < 100) continue;
      if (v.roas < 2 && v.roas > 0) {
        out.push({
          k: "Cut", c: "var(--state-danger)",
          t: v.name,
          b: `ROAS ${v.roas.toFixed(2)}x — below 2x threshold. -$${Math.round(v.spend).toLocaleString()}/period, -$${Math.round(v.ap).toLocaleString()} AP.`,
        });
      }
    }
    // Scale: top-ROAS vendors above 4x with at least 5 leads (statistical
    // signal). Suggest doubling spend.
    const scalable = vendors.filter(v => v.roas >= 4 && v.leads >= 5).sort((a, b) => b.roas - a.roas).slice(0, 2);
    for (const v of scalable) {
      out.push({
        k: "Scale", c: "var(--accent-money)",
        t: v.name,
        b: `ROAS ${v.roas.toFixed(2)}x · CPL $${v.cpl.toFixed(0)}. Double spend → estimated +$${Math.round(v.spend * v.roas).toLocaleString()} AP.`,
      });
    }
    // Watch: persistency available (not null) and < 85
    for (const v of vendors) {
      if (v.persistency != null && v.persistency < 85 && v.persistency > 0) {
        out.push({
          k: "Watch", c: "var(--state-warning)",
          t: v.name,
          b: `Persistency ${v.persistency}% below cohort target (85%). Risk of 13-mo lapse chargebacks.`,
        });
      }
    }
    // Test: vendors with very small spend (< $200) but issued at least 1
    // policy — high signal, low investment so far. Suggest testing more.
    for (const v of vendors) {
      if (v.spend > 0 && v.spend < 200 && v.issued >= 1) {
        out.push({
          k: "Test", c: "var(--accent-status)",
          t: v.name,
          b: `Only $${Math.round(v.spend)} spent but ${v.issued} issued (ROAS ${v.roas.toFixed(1)}x). Test a $1-2k bump next period.`,
        });
      }
    }
    // Untagged: warn if "_untagged" bucket has spend
    const untagged = vendors.find(v => v.id === "_untagged");
    if (untagged && untagged.spend > 0) {
      out.push({
        k: "Tag", c: "var(--state-warning)",
        t: "Untagged lead spend",
        b: `$${Math.round(untagged.spend).toLocaleString()} of spend isn't tied to a lead source — ROAS can't be computed. Tag each expense in Expenses → Edit.`,
      });
    }
    return out.slice(0, 6);
  }, [vendors]);

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Optimization opportunities</h3>
        <span className="meta">{ops.length === 0 ? "all clear" : `${ops.length} signal${ops.length === 1 ? "" : "s"}`}</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {ops.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
            No signals from current data. Add more vendors or wait for more issued policies before the system can recommend cuts / scales.
          </div>
        )}
        {ops.map((x, i) => (
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
  );
}

// Modal to add a new agency_lead_sources row. Writes via supabase client
// (the page already reads back through AppData.LEAD_SOURCES on the next
// hydrate tick, so the new vendor appears in the vendor list automatically).
function NewLeadVendorModal({ onClose }) {
  const [form, setForm] = React.useState({ name: "", vendor: "", kind: "paid_social", cost_per_lead: "" });
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!form.name.trim()) { window.toast && window.toast("Name required", "warn"); return; }
    setBusy(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const aid = window.getActiveAgencyId && window.getActiveAgencyId();
      if (!sb) throw new Error("Supabase not loaded");
      if (!aid) throw new Error("No active agency");
      const cpl = parseFloat(form.cost_per_lead);
      const row = {
        agency_id: aid,
        name: form.name.trim(),
        vendor: form.vendor.trim() || null,
        kind: form.kind,
        cost_per_lead_cents: !isNaN(cpl) && cpl > 0 ? Math.round(cpl * 100) : null,
        active: true,
      };
      const { error } = await sb.from("agency_lead_sources").insert(row);
      if (error) throw error;
      window.toast && window.toast(`Added lead source: ${form.name}`, "success");
      if (window.hydrateFromSupabase) await window.hydrateFromSupabase();
      onClose();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <Shared.Modal title="New lead vendor" width={520} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !form.name.trim()}>
          <Icons.Plus size={11}/> {busy ? "Saving…" : "Add vendor"}
        </button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12, lineHeight: 1.55 }}>
        Add a lead source so spend can be tagged in Expenses and roll up here as ROAS. Once it's saved, tag your existing lead-spend rows to populate the vendor view.
      </div>
      <Shared.Field label="Display name *">
        <input className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Facebook · T65 v3 creative" autoFocus/>
      </Shared.Field>
      <Shared.Field label="Vendor / platform">
        <input className="text-input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="FB Ads, Convoso, DataMail, Google Ads…"/>
      </Shared.Field>
      <Shared.Field label="Kind">
        <Shared.Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[
          { v: "paid_social",  l: "Paid social" },
          { v: "paid_search",  l: "Paid search" },
          { v: "inbound",       l: "Inbound calls" },
          { v: "list",           l: "List / direct mail" },
          { v: "referral",       l: "Referral" },
          { v: "other",           l: "Other" },
        ]}/>
      </Shared.Field>
      <Shared.Field label="Cost per lead (optional, $)" hint="Used as a fallback when expenses aren't tagged">
        <input className="text-input" type="number" step="0.01" min="0" value={form.cost_per_lead} onChange={(e) => setForm({ ...form, cost_per_lead: e.target.value })} placeholder="33.50"/>
      </Shared.Field>
    </Shared.Modal>
  );
}

window.PageAttribution = PageAttribution;

})();
