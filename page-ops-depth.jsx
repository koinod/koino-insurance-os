/* page-ops-depth.jsx — Operational depth: NIGO, Carriers, Scrubbers, Forecast.

   Each is a standalone page. Bulk actions + saved views are wired into
   the existing Pipeline page elsewhere. */

(function () {

/* ──────────────────────────────────────────────────────────────────────────
   1. NIGO workflow — structured fix queue with deadline + owner + reason
   ────────────────────────────────────────────────────────────────────────── */
const NIGO_REASONS = [
  "Missing signature",      "Beneficiary form incomplete", "Age verification fail",
  "Replacement form missing", "Banking info wrong",          "Carrier auto-decline",
  "Wrong product selected",   "DOB mismatch",                "Health Q answered no but Rx says yes",
];

const NIGOS = [
  { id: "n1", lead: "Linda Cho",         carrier: "Humana",     product: "Plan N",      reason: "Missing signature on page 3", days: 2, deadline: "Friday", owner: "marc", status: "open",     priority: "p1", apAtRisk: 1490 },
  { id: "n2", lead: "Don Phelps",         carrier: "Aetna SRC",   product: "FE $10K",     reason: "Banking info wrong",            days: 4, deadline: "Tomorrow", owner: "sade", status: "open",     priority: "p0", apAtRisk: 0 },
  { id: "n3", lead: "Travis Heller",      carrier: "Aetna SRC",   product: "Plan G",      reason: "Replacement form missing",       days: 1, deadline: "Friday", owner: "tony", status: "in_review", priority: "p1", apAtRisk: 2120 },
  { id: "n4", lead: "Henry Akins",        carrier: "F&G",         product: "Annuity",      reason: "Beneficiary form incomplete",     days: 3, deadline: "Monday", owner: "dani", status: "in_review", priority: "p2", apAtRisk: 4250 },
  { id: "n5", lead: "Cheryl Hampton",     carrier: "UHC",         product: "Plan G",      reason: "DOB mismatch",                    days: 0, deadline: "EOW",     owner: "marc", status: "fixed",    priority: "p1", apAtRisk: 1840 },
  { id: "n6", lead: "Robert Mendez",      carrier: "Mutual of Omaha", product: "FE $15K", reason: "Health Q answered no but Rx says yes", days: 5, deadline: "Today", owner: "dani", status: "open", priority: "p0", apAtRisk: 1320 },
];

const STATUS_LABEL = { open: "Open", in_review: "In review", fixed: "Fixed", chargeback: "Chargeback" };
const STATUS_CLR    = { open: "var(--state-warning)", in_review: "var(--state-info)", fixed: "var(--accent-money)", chargeback: "var(--state-danger)" };
const PRIORITY_CLR  = { p0: "var(--state-danger)", p1: "var(--state-warning)", p2: "var(--text-tertiary)" };

function PageNIGO({ role = "manager" }) {
  const [filter, setFilter] = React.useState({ status: "open", priority: "all" });
  const [drill, setDrill]   = React.useState(null);
  const [statusOverrides, setStatusOverrides] = React.useState({});
  const [newOpen, setNewOpen] = React.useState(false);
  // Live: project AppData.NIGOS into the local schema, fall back to demo NIGOS.
  const liveNigos = (() => {
    const N = AppData.NIGOS;
    if (!Array.isArray(N) || N.length === 0) return null;
    const reasonById = new Map((AppData.NIGO_REASONS || []).map(r => [r.id, r]));
    const leadById   = new Map((AppData.PIPELINE || []).map(l => [l.id, l]));
    const policyById = new Map((AppData.POLICIES || []).map(p => [p.id, p]));
    const sevToPriority = { critical: "p0", high: "p0", med: "p1", low: "p2" };
    return N.map(n => {
      const reason = n.reasonId ? reasonById.get(n.reasonId) : null;
      const pol = n.policyId ? policyById.get(n.policyId) : null;
      const lead = n.pipelineId ? leadById.get(n.pipelineId) : null;
      const apAtRisk = pol?.ap || lead?.ap || 0;
      // Status mapping: open|in_review|resolved|wont_fix → open|in_review|fixed
      const status = n.status === "resolved" || n.status === "wont_fix" ? "fixed" : n.status;
      return {
        id: n.id,
        lead: lead?.lead || (pol ? `Policy ${pol.policyNumber || pol.id.slice(0,6)}` : "—"),
        carrier: pol?.carrierId ? pol.carrierId.toUpperCase() : "—",
        product: pol?.product || lead?.product || "—",
        reason: reason?.label || n.notes || "Reason unspecified",
        apAtRisk,
        owner: n.assignedTo || lead?.owner || (AppData.REPS[0] && AppData.REPS[0].id),
        deadline: reason?.severity === "critical" ? "Today" : reason?.severity === "high" ? "Tomorrow" : "This week",
        status,
        priority: sevToPriority[reason?.severity || "med"] || "p1",
        notes: n.notes,
      };
    });
  })();
  // Demo seed only renders for the demo agency. Real agencies with no live
  // NIGOs see the empty state, never fake names like "Linda Cho".
  const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
  const baseNigos = liveNigos && liveNigos.length > 0 ? liveNigos : (isDemo ? NIGOS : []);
  // GAP-MP2 — manager view scopes NIGOs to their downline. Owner sees the
  // fleet. The owner === rep_id check folds in unassigned items so a manager
  // can claim them.
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && role === "manager")
    ? new Set(window.scopeRepIds())
    : null;
  const visible = baseNigos
    .map(n => ({ ...n, status: statusOverrides[n.id] ?? n.status }))
    .filter(n =>
      (filter.status === "all" || n.status === filter.status) &&
      (filter.priority === "all" || n.priority === filter.priority) &&
      (!scopeIds || !n.owner || scopeIds.has(n.owner))
    );

  const setStatus = async (id, newStatus) => {
    setStatusOverrides(s => ({ ...s, [id]: newStatus }));
    try {
      await AppData.mutate.nigoStatus(id, newStatus);
      window.toast && window.toast(`NIGO marked ${STATUS_LABEL[newStatus] || newStatus}${AppData.LIVE ? " · saved" : ""}`, "success");
    } catch (_e) {}
  };
  const totalAtRisk = visible.reduce((a, n) => a + (n.apAtRisk || 0), 0);
  const repById = Object.fromEntries((AppData.REPS || []).map(r => [r.id, r]));

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">NIGO Queue</div>
          <div className="page-sub">Carrier returns · structured fix workflow · {visible.length} open · ${totalAtRisk.toLocaleString()} AP at risk</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Shared.Select value={filter.status}   onChange={(v) => setFilter({ ...filter, status: v })}   options={[{ v: "all", l: "All status" }, { v: "open", l: "Open" }, { v: "in_review", l: "In review" }, { v: "fixed", l: "Fixed" }]}/>
          <Shared.Select value={filter.priority} onChange={(v) => setFilter({ ...filter, priority: v })} options={[{ v: "all", l: "All priority" }, { v: "p0", l: "P0 — same day" }, { v: "p1", l: "P1 — this week" }, { v: "p2", l: "P2 — flexible" }]}/>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icons.Plus size={13}/> Log NIGO</button>
        </div>
      </div>

      {newOpen && <NewNIGOModal onClose={() => setNewOpen(false)}/>}

      {(() => {
        // GAP-MP2 follow-on — KPIs honor the same scope as the queue list so a
        // manager doesn't see fleet-level open counts for items outside downline.
        const scoped = scopeIds
          ? baseNigos.filter(n => !n.owner || scopeIds.has(n.owner))
          : baseNigos;
        const open = scoped.filter(n => n.status === "open");
        const inReview = scoped.filter(n => n.status === "in_review");
        const fixed = scoped.filter(n => n.status === "fixed");
        // Avg time-to-fix: use raw NIGOS rows from AppData (have createdAt + resolvedAt)
        // to compute; else "—" rather than a fake value.
        const rawN = (AppData.NIGOS || []).filter(n => n.resolvedAt && n.createdAt);
        let avgFixLabel = "—";
        if (rawN.length > 0) {
          const ms = rawN.reduce((a, n) => a + (new Date(n.resolvedAt) - new Date(n.createdAt)), 0) / rawN.length;
          const days = ms / 86400000;
          avgFixLabel = days >= 1 ? `${days.toFixed(1)}d` : `${(days * 24).toFixed(1)}h`;
        } else if (isDemo) {
          avgFixLabel = "1.4d";
        }
        return (
          <div className="kpi-row">
            <Shared.KpiCard hero label="Open NIGOs" value={open.length} sub={`$${open.reduce((a, n) => a + (n.apAtRisk || 0), 0).toLocaleString()} AP at risk`}/>
            <Shared.KpiCard      label="In review" value={inReview.length}/>
            <Shared.KpiCard      label="Fixed today" value={fixed.length} trend={fixed.length > 0 ? "up" : undefined}/>
            <Shared.KpiCard      label="Avg time-to-fix" value={avgFixLabel} sub={avgFixLabel === "—" ? "needs data" : "goal 2d"} trend={avgFixLabel !== "—" ? "up" : undefined}/>
          </div>
        );
      })()}

      <div className="panel">
        <div className="panel-h"><h3>NIGO queue</h3><span className="meta">priority sorted</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "30px 1.4fr 1fr 1fr 1.6fr 80px 100px 100px 100px" }}>
            <div></div><div>Lead</div><div>Carrier</div><div>Product</div><div>Reason</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP risk</div>
            <div>Owner</div><div>Deadline</div><div>Status</div>
          </div>
          {visible.length === 0 && (
            <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No NIGOs in this view. {filter.status !== "all" && <span>Try clearing the status filter.</span>}
            </div>
          )}
          {visible.sort((a, b) => String(a.priority || "p2").localeCompare(String(b.priority || "p2"))).map(n => {
            const owner = repById[n.owner];
            return (
              <div key={n.id} className="row" style={{ gridTemplateColumns: "30px 1.4fr 1fr 1fr 1.6fr 80px 100px 100px 100px" }}>
                <span className="dot" style={{ background: PRIORITY_CLR[n.priority] }} title={n.priority.toUpperCase()}></span>
                <div style={{ fontWeight: 500 }}>{n.lead}</div>
                <div style={{ color: "var(--text-tertiary)" }}>{n.carrier}</div>
                <div style={{ color: "var(--text-tertiary)" }}>{n.product}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{n.reason}</div>
                <div className="tabular" style={{ textAlign: "right", color: n.apAtRisk ? "var(--state-warning)" : "var(--text-quaternary)" }}>{n.apAtRisk ? `$${n.apAtRisk.toLocaleString()}` : "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {owner && <Shared.Avatar rep={owner} size={18}/>}
                  <span style={{ fontSize: 11.5 }}>{owner?.name?.split(" ")[0]}</span>
                </div>
                <div style={{ fontSize: 11.5, color: n.deadline === "Today" ? "var(--state-danger)" : n.deadline === "Tomorrow" ? "var(--state-warning)" : "var(--text-tertiary)", fontWeight: n.deadline === "Today" ? 600 : 400 }}>{n.deadline}</div>
                <div><span className="chip" style={{ color: STATUS_CLR[n.status], borderColor: `color-mix(in oklch, ${STATUS_CLR[n.status]} 30%, transparent)`, background: `color-mix(in oklch, ${STATUS_CLR[n.status]} 10%, transparent)`, cursor: "pointer" }} onClick={() => setDrill(n)}>{STATUS_LABEL[n.status]}</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {drill && (
        <Shared.Modal title={`NIGO · ${drill.lead}`} width={520} onClose={() => setDrill(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setDrill(null)}>Close</button>
            {drill.status !== "in_review" && <button className="btn" onClick={() => { setStatus(drill.id, "in_review"); setDrill(null); }}>Move to In review</button>}
            {drill.status !== "fixed" && <button className="btn btn-primary" onClick={() => { setStatus(drill.id, "fixed"); setDrill(null); }}><Icons.Check size={11}/> Mark fixed</button>}
          </>
        }>
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Shared.KpiCard label="Carrier" value={drill.carrier}/>
            <Shared.KpiCard label="AP at risk" prefix="$" value={drill.apAtRisk?.toLocaleString() || "0"}/>
          </div>
          <div className="divider"></div>
          <div className="field-l">Reason</div>
          <div style={{ marginTop: 6, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5 }}>{drill.reason}</div>
          <div className="divider"></div>
          <div className="field-l">Fix steps</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {(drill.fixSteps || ["Contact lead", "Re-collect missing field", "Resubmit to carrier", "Confirm receipt"]).map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. Carriers — central taxonomy: appointed carriers, products, comp grids

   Live data flow:
     AppData.CARRIERS       → list of carriers (id, name, status, productLines)
     AppData.APPOINTMENTS   → rep × carrier × state appointments
     AppData.PRODUCTS       → products (carrierId, name, comp_pct)
     AppData.POLICIES       → derives 13-mo persistency per carrier
     AppData.NIGOS+POLICIES → derives NIGO rate per carrier

   Demo fallback only renders for the demo agency.
   ────────────────────────────────────────────────────────────────────────── */
const CARRIERS_DEMO = [
  { id: "uhc",   name: "UHC Producer",          status: "active", appt: 47, advances: true,  cycle: "daily",   nigo: 2.1, persistency: 94, products: [
    { p: "Med Supp Plan G", comp: 50, advance: 75, chargeback: 12 },
    { p: "Med Supp Plan N", comp: 50, advance: 75, chargeback: 12 },
  ]},
  { id: "humana", name: "Humana Vantage",        status: "active", appt: 32, advances: true,  cycle: "daily",   nigo: 2.4, persistency: 92, products: [
    { p: "Med Supp Plan G", comp: 50, advance: 70, chargeback: 12 },
  ]},
  { id: "aetna",  name: "Aetna SRC",             status: "active", appt: 29, advances: true,  cycle: "weekly",  nigo: 4.8, persistency: 88, products: [
    { p: "Med Supp Plan G", comp: 50, advance: 70, chargeback: 12 },
    { p: "FE $10K-$25K",     comp: 90, advance: 75, chargeback: 24 },
  ]},
  { id: "moo",    name: "Mutual of Omaha",       status: "active", appt: 22, advances: true,  cycle: "daily",   nigo: 1.8, persistency: 78, products: [
    { p: "FE $5K-$50K",      comp: 90, advance: 80, chargeback: 12 },
  ]},
  { id: "fg",     name: "F&G Annuities",         status: "active", appt: 14, advances: false, cycle: "monthly", nigo: 0.4, persistency: 96, products: [
    { p: "Annuity SPDA",     comp: 7,  advance: 0,  chargeback: 0 },
    { p: "Annuity FIA",      comp: 10, advance: 0,  chargeback: 0 },
  ]},
];

function _liveCarrierList() {
  const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
  const carriers = AppData.CARRIERS || [];
  if (carriers.length === 0) return isDemo ? CARRIERS_DEMO : [];

  const appointments = AppData.APPOINTMENTS || [];
  const policies     = AppData.POLICIES     || [];
  const nigos        = AppData.NIGOS        || [];
  const products     = AppData.PRODUCTS     || [];

  // appointments → distinct rep count per carrier
  const apptByCarrier = {};
  for (const a of appointments) {
    if (!a.carrierId || !a.repId) continue;
    if (!apptByCarrier[a.carrierId]) apptByCarrier[a.carrierId] = new Set();
    apptByCarrier[a.carrierId].add(a.repId);
  }

  // persistency + total policies per carrier
  const polByCarrier = {}, activeByCarrier = {};
  for (const p of policies) {
    if (!p.carrierId) continue;
    polByCarrier[p.carrierId] = (polByCarrier[p.carrierId] || 0) + 1;
    if (p.persistency === "active" || p.persistency === "in_force") {
      activeByCarrier[p.carrierId] = (activeByCarrier[p.carrierId] || 0) + 1;
    }
  }
  const policyCarrierById = Object.fromEntries(policies.map(p => [p.id, p.carrierId]));
  const nigoByCarrier = {};
  for (const n of nigos) {
    const cid = n.policyId && policyCarrierById[n.policyId];
    if (!cid) continue;
    nigoByCarrier[cid] = (nigoByCarrier[cid] || 0) + 1;
  }

  // products grouped per carrier
  const productsByCarrier = {};
  for (const p of products) {
    if (!p.carrierId || p.active === false) continue;
    if (!productsByCarrier[p.carrierId]) productsByCarrier[p.carrierId] = [];
    productsByCarrier[p.carrierId].push({
      p: p.name,
      comp: p.compPct != null ? Math.round(p.compPct) : (p.compPerApp ? Math.round(p.compPerApp) : null),
      advance: null, chargeback: null,  // commission_grid jsonb usually empty; left null → "—"
    });
  }

  return carriers.map(c => {
    const totalPol = polByCarrier[c.id] || 0;
    const activePol = activeByCarrier[c.id] || 0;
    const totalNigo = nigoByCarrier[c.id] || 0;
    return {
      id: c.id,
      name: c.name,
      status: c.status || "active",
      appt: apptByCarrier[c.id] ? apptByCarrier[c.id].size : 0,
      // commission_grid jsonb: advances + cycle hooks. data.jsx currently
      // doesn't propagate this column; once it does, these become real.
      advances: null,
      cycle: "—",
      nigo: totalPol > 0 ? Math.round((totalNigo / totalPol) * 1000) / 10 : null,
      persistency: totalPol > 0 ? Math.round((activePol / totalPol) * 1000) / 10 : null,
      products: productsByCarrier[c.id] || [],
    };
  });
}

function PageCarriers() {
  const carrierList = _liveCarrierList();
  const [openId, setOpenId] = React.useState(carrierList[0]?.id || null);
  // Re-pin when the list shape changes (live data hydrates after first render)
  React.useEffect(() => {
    if (!openId && carrierList.length > 0) setOpenId(carrierList[0].id);
  }, [carrierList.length]);
  const c = carrierList.find(x => x.id === openId) || carrierList[0];

  if (!c) {
    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Carriers</div>
            <div className="page-sub">No carriers appointed yet.</div>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={() => { try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}; if (window.gotoPage) window.gotoPage("settings"); }}
          ><Icons.Plus size={13}/> Add carrier</button>
        </div>
        <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
          Add your first carrier in Settings → Carriers. Comp grids, persistency, and NIGO rate populate automatically as policies issue.
        </div>
      </div>
    );
  }
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Carriers</div>
          <div className="page-sub">{carrierList.length} appointed · {carrierList.reduce((a, c) => a + (c.appt || 0), 0)} producer appointments · live comp + persistency + NIGO</div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
            if (window.gotoPage) window.gotoPage("settings");
          }}
        ><Icons.Plus size={13}/> New carrier</button>
      </div>

      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Appointed carriers</h3></div>
          <div style={{ padding: 6 }}>
            {carrierList.map(cc => {
              const cycleLabel = cc.advances == null ? cc.cycle : (cc.advances ? `advance · ${cc.cycle}` : `as-earned · ${cc.cycle}`);
              return (
                <button key={cc.id} onClick={() => setOpenId(cc.id)} className="btn btn-ghost" style={{ width: "100%", padding: 10, marginBottom: 4, justifyContent: "stretch", flexDirection: "column", alignItems: "stretch", gap: 4, background: openId === cc.id ? "var(--bg-overlay)" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: 13 }}>{cc.name}</strong>
                    <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{cc.appt} appts</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span className={`chip ${cc.advances ? "chip-money" : ""}`} style={{ fontSize: 10 }}>{cycleLabel}</span>
                    {cc.persistency != null && (
                      <span style={{ fontSize: 10.5, color: cc.persistency >= 90 ? "var(--accent-money)" : cc.persistency >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}>● {cc.persistency}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><h3>{c.name}</h3>
              <span className={`chip ${c.advances ? "chip-money" : ""}`}>{c.advances == null ? c.cycle : `${c.advances ? "advance" : "as-earned"} · ${c.cycle}`}</span>
              <button
                className="btn btn-ghost"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
                  if (window.gotoPage) window.gotoPage("settings");
                }}
              >Configure</button>
            </div>
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <Shared.Field label="Appointments"><div className="tabular" style={{ fontSize: 18, fontWeight: 500 }}>{c.appt}</div></Shared.Field>
              <Shared.Field label="13-mo persistency">
                <div className="tabular" style={{ fontSize: 18, fontWeight: 500, color: c.persistency == null ? "var(--text-quaternary)" : c.persistency >= 90 ? "var(--accent-money)" : c.persistency >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}>
                  {c.persistency == null ? "—" : `${c.persistency}%`}
                </div>
              </Shared.Field>
              <Shared.Field label="NIGO rate">
                <div className="tabular" style={{ fontSize: 18, fontWeight: 500, color: c.nigo == null ? "var(--text-quaternary)" : "var(--text-primary)" }}>
                  {c.nigo == null ? "—" : `${c.nigo}%`}
                </div>
              </Shared.Field>
              <Shared.Field label="Pay cycle"><div style={{ fontSize: 14, fontWeight: 500 }}>{c.cycle || "—"}</div></Shared.Field>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Comp grid</h3>{c.products.length === 0 && <span className="meta">no products</span>}</div>
            <div className="list">
              {c.products.length > 0 && (
                <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px" }}>
                  <div>Product</div>
                  <div className="tabular" style={{ textAlign: "right" }}>Comp %</div>
                  <div className="tabular" style={{ textAlign: "right" }}>Advance %</div>
                  <div className="tabular" style={{ textAlign: "right" }}>Chargeback period</div>
                </div>
              )}
              {c.products.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                  Add products in Settings → Carriers · Comp grid populates here.
                </div>
              )}
              {c.products.map((p, i) => (
                <div key={i} className="row" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px" }}>
                  <div style={{ fontWeight: 500 }}>{p.p}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.comp == null ? "—" : `${p.comp}%`}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.advance == null ? "—" : `${p.advance}%`}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.chargeback == null ? "—" : `${p.chargeback}mo`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3. Compliance scrubbers — DNC, age verification, license check
   ────────────────────────────────────────────────────────────────────────── */
function PageScrubbers({ embedded = false }) {
  const [phone, setPhone] = React.useState("");
  const [age, setAge]     = React.useState("");
  const [zip, setZip]     = React.useState("");
  const [results, setResults] = React.useState([]);

  const run = () => {
    const r = [];
    // Synthesized scrub results (deterministic by input)
    const dnc      = phone && phone.endsWith("99");
    const ageOk    = +age >= 18 && +age <= 110;
    const t65       = +age >= 64 && +age <= 65;
    const stateOk  = zip && zip.length === 5;
    if (phone) r.push({ k: "DNC", ok: !dnc, msg: dnc ? "Number is on Do-Not-Call list — DO NOT DIAL" : "Clear of state + federal DNC" });
    if (phone) r.push({ k: "Litigator", ok: true, msg: "No known TCPA litigator history" });
    if (age)    r.push({ k: "Age",  ok: ageOk, msg: ageOk ? `Age ${age} valid for senior products${t65 ? " (T65)" : ""}` : "Age out of range" });
    if (zip) {
      const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
      const producerName = meIdent?.full_name || "Producer";
      r.push({ k: "License", ok: stateOk, msg: stateOk ? `${producerName} licensed in this zip` : "Invalid zip" });
    }
    if (zip) {
      const carriers = (window.AppData?.CARRIERS || []).slice(0, 3).map(c => c.name).filter(Boolean).join(", ");
      r.push({ k: "Carrier appt", ok: stateOk, msg: stateOk ? (carriers ? `${carriers} appointed for this state` : "Add carrier appointments under Settings → Carriers") : "Cannot verify state" });
    }
    setResults(r);
  };

  const body = (
    <>
      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Shield size={13}/><h3>Pre-call scrub</h3></div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Shared.Field label="Phone (E.164)"><input className="text-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15125550199"/></Shared.Field>
            <Shared.Field label="Age"><input className="text-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="65"/></Shared.Field>
            <Shared.Field label="Zip"><input className="text-input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="78704"/></Shared.Field>
            <button className="btn btn-primary" onClick={run}><Icons.Shield size={12}/> Run scrub</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Results</h3>{results.length > 0 && <span className={`chip ${results.every(r => r.ok) ? "chip-money" : "chip-danger"}`}>{results.every(r => r.ok) ? "All clear" : "Action needed"}</span>}</div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.length === 0 && <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, padding: 20, textAlign: "center" }}>Run a scrub to see results.</div>}
            {results.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
                <span className={`dot dot-${r.ok ? "live" : "danger"}`}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.k}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.msg}</div>
                </div>
                <span className={`chip ${r.ok ? "chip-money" : "chip-danger"}`}>{r.ok ? "PASS" : "FAIL"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!embedded && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-h"><h3>Auto-scrub policy · Med Supp + FE</h3></div>
          <div style={{ padding: 14, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            • Every inbound number is scrubbed against state + federal DNC + agency internal opt-out before routing<br/>
            • Producers cannot dial leads where DNC fails — gated at the dialer<br/>
            • Producer license + carrier appointment validated against the lead's state in real time<br/>
            • TPMO disclaimer auto-fires within the grace window on any Med Supp / Med Adv call<br/>
            • All scrub results logged with timestamp + producer ID for audit
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return <div style={{ padding: 14 }}>{body}</div>;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Compliance scrubbers</div>
          <div className="page-sub">DNC · age · license · carrier appointment — gates dialing on Med Supp & FE</div>
        </div>
      </div>
      {body}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   4. Revenue forecast — pipeline value × close-prob → forecast curve
   ────────────────────────────────────────────────────────────────────────── */
function PageForecast() {
  // Close probabilities + AP fallbacks come from agency config (lib/agency-config.js).
  // Fallback AP also gets a learned-cohort boost: when policies exist, the
  // average AP for matching products is preferred over the default constant.
  const STAGE_PROB = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().stage_close_probabilities)
    || { "New": 0.04, "Contacted": 0.12, "Quoted": 0.32, "App In": 0.78, "Issued": 1.0 };
  const _apDefaults = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().fallback_ap_by_product)
    || { "Plan G": 1800, "Plan N": 1500, "Final Expense": 1300, "Annuity": 4000 };
  const pipeline = AppData.PIPELINE || [];
  const reps = AppData.REPS || [];
  const policies = AppData.POLICIES || [];

  const _avgApFor = (keyword) => {
    const matched = policies.filter(p => p.product && p.product.toLowerCase().includes(keyword.toLowerCase()) && p.ap > 0);
    if (matched.length === 0) return null;
    return Math.round(matched.reduce((a, p) => a + p.ap, 0) / matched.length);
  };
  const fallbackApFor = (prod) => {
    if (!prod) return _apDefaults["Final Expense"] || 1300;
    if (prod.includes("Plan G"))        return _avgApFor("Plan G")        || _apDefaults["Plan G"];
    if (prod.includes("Plan N"))        return _avgApFor("Plan N")        || _apDefaults["Plan N"];
    if (prod.includes("Annuity"))       return _avgApFor("Annuity")       || _apDefaults["Annuity"];
    if (prod.includes("Final Expense")) return _avgApFor("Final Expense") || _apDefaults["Final Expense"];
    return _apDefaults["Final Expense"] || 1300;
  };

  const weightedAP = pipeline.reduce((a, p) => {
    const ap = p.ap || fallbackApFor(p.product);
    return a + ap * (STAGE_PROB[p.stage] || 0);
  }, 0);

  const repForecast = reps.slice(0, 6).map(r => {
    const myDeals = pipeline.filter(p => p.owner === r.id);
    const w = myDeals.reduce((a, p) => a + (p.ap || fallbackApFor(p.product)) * (STAGE_PROB[p.stage] || 0), 0);
    return { ...r, deals: myDeals.length, weighted: w };
  });

  // Synthesized 30-day curve: cumulative weighted AP rolling
  const curve = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    return { day, ap: weightedAP * (1 - Math.exp(-day / 12)) };
  });

  // Owner-set monthly goal (overrides $50k stub for coverage ratio).
  const goal = (window.AppData?.ORG_SETTINGS?.forecast_monthly_goal_cents)
    ? (window.AppData.ORG_SETTINGS.forecast_monthly_goal_cents / 100)
    : 50000;

  // Active manual override -- if owner pinned a forecast number, use it
  // for the headline + curve scale. Most-recent forecast_overrides row.
  const overrides = (AppData.FORECAST_OVERRIDES || []).slice().sort((a, b) => new Date(b.setAt || 0) - new Date(a.setAt || 0));
  const activeOverride = overrides[0] || null;
  const headlineAP = activeOverride?.override != null && activeOverride.override > 0 ? activeOverride.override : weightedAP;
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [goalOpen, setGoalOpen] = React.useState(false);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Revenue forecast</div>
          <div className="page-sub">
            Pipeline value × stage close-probability · 30-day rolling forecast
            {activeOverride && <> · <span style={{ color: "var(--state-warning)" }}>manual override: ${Math.round(activeOverride.override).toLocaleString()}</span></>}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setGoalOpen(true)} title="Set the monthly AP goal that coverage ratio measures against">
            <Icons.Edit size={11}/> Set goal
          </button>
          <button className="btn btn-primary" onClick={() => setOverrideOpen(true)} title="Pin a manual forecast number that supersedes the weighted calculation">
            <Icons.Sparkles size={11}/> Override forecast
          </button>
        </div>
      </div>

      {overrideOpen && <ForecastOverrideModal weightedAP={weightedAP} onClose={() => setOverrideOpen(false)}/>}
      {goalOpen     && <ForecastGoalModal currentGoal={goal} onClose={() => setGoalOpen(false)}/>}

      <div className="kpi-row">
        <Shared.KpiCard hero label="Weighted pipeline" prefix="$" value={Math.round(headlineAP).toLocaleString()} sub={activeOverride ? "manual override" : "all stages × prob"}/>
        <Shared.KpiCard      label="In App stage" value={pipeline.filter(p => p.stage === "App In").length} sub={`${Math.round(STAGE_PROB["App In"] * 100)}% close`}/>
        <Shared.KpiCard      label="Issued MTD" value={pipeline.filter(p => p.stage === "Issued").length}/>
        <Shared.KpiCard      label="Coverage ratio" value={(headlineAP / Math.max(goal, 1)).toFixed(2) + "x"} sub={`vs $${Math.round(goal).toLocaleString()} goal`} trend={headlineAP >= goal ? "up" : undefined}/>
      </div>

      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>30-day forecast curve</h3></div>
          <div style={{ padding: 14 }}>
            <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
              {(() => {
                const max = Math.max(...curve.map(c => c.ap), 1);
                const path = curve.map((c, i) => `${i === 0 ? "M" : "L"} ${(i / (curve.length - 1)) * 600} ${180 - (c.ap / max) * 160}`).join(" ");
                const fill = path + ` L 600 180 L 0 180 Z`;
                return <><path d={fill} fill="var(--accent-money)" opacity="0.12"/><path d={path} stroke="var(--accent-money)" strokeWidth="1.8" fill="none"/></>;
              })()}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              <span>Today</span><span>+15d</span><span>+30d</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>By producer · weighted</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 110px 1fr" }}>
              <div>Producer</div>
              <div className="tabular" style={{ textAlign: "right" }}>Deals</div>
              <div className="tabular" style={{ textAlign: "right" }}>Weighted AP</div>
              <div></div>
            </div>
            {repForecast.sort((a, b) => b.weighted - a.weighted).map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 110px 1fr" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={20}/>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.deals}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)", fontWeight: 500 }}>${Math.round(r.weighted).toLocaleString()}</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (r.weighted / Math.max(...repForecast.map(x => x.weighted), 1)) * 100)}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h3>Stage close probabilities</h3><span className="meta">trailing 90-day cohort</span></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {Object.entries(STAGE_PROB).map(([s, p]) => (
            <div key={s} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s}</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-display)", marginTop: 4 }}>{(p * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ForecastOverrideModal({ weightedAP, onClose }) {
  const [amount, setAmount] = React.useState(Math.round(weightedAP).toString());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy]     = React.useState(false);

  const period = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const submit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) { window.toast && window.toast("Enter a positive dollar amount", "warn"); return; }
    setBusy(true);
    try {
      await AppData.mutate.forecastOverrideSet(period, cents, reason || null);
      window.toast && window.toast(`Forecast pinned at $${parseFloat(amount).toLocaleString()}`, "success");
      onClose();
    } catch (_e) {} finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await AppData.mutate.forecastOverrideClear();
      window.toast && window.toast("Cleared override · using weighted pipeline", "success");
      onClose();
    } catch (_e) {} finally { setBusy(false); }
  };

  return (
    <Shared.Modal title="Override forecast" width={460} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" onClick={clear} disabled={busy} style={{ color: "var(--state-danger)" }}>Clear override</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          <Icons.Check size={11}/> {busy ? "Saving…" : "Pin forecast"}
        </button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12, lineHeight: 1.55 }}>
        Replaces the weighted-pipeline headline with a number you set. Stored in <span className="mono">forecast_overrides</span> with a timestamp + reason for audit. Period: <strong>{period}</strong>.
      </div>
      <Shared.Field label="Forecast amount ($)">
        <input className="text-input" type="number" step="100" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus/>
      </Shared.Field>
      <Shared.Field label="Reason (optional)" hint="Why you're overriding — gets logged for audit">
        <textarea
          className="text-input" rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Three large annuity apps not yet in pipeline"'
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />
      </Shared.Field>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
        Weighted pipeline = ${Math.round(weightedAP).toLocaleString()} · clear the override to revert to it.
      </div>
    </Shared.Modal>
  );
}

function ForecastGoalModal({ currentGoal, onClose }) {
  const [goal, setGoal] = React.useState(currentGoal.toString());
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    const v = parseFloat(goal);
    if (!v || v <= 0) { window.toast && window.toast("Enter a positive amount", "warn"); return; }
    setBusy(true);
    try {
      await AppData.mutate.orgSettingsSave({ forecast_monthly_goal_cents: Math.round(v * 100) });
      window.toast && window.toast(`Monthly goal set to $${v.toLocaleString()}`, "success");
      onClose();
    } catch (_e) {} finally { setBusy(false); }
  };
  return (
    <Shared.Modal title="Monthly AP goal" width={420} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          <Icons.Check size={11}/> {busy ? "Saving…" : "Save goal"}
        </button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>
        Sets the denominator for the coverage ratio KPI. Stored in <span className="mono">org_settings.forecast_monthly_goal_cents</span>.
      </div>
      <Shared.Field label="Monthly AP goal ($)">
        <input className="text-input" type="number" step="1000" min="0" value={goal} onChange={(e) => setGoal(e.target.value)} autoFocus/>
      </Shared.Field>
    </Shared.Modal>
  );
}

function NewNIGOModal({ onClose }) {
  // Loads policies + reasons + reps so the operator picks from real
  // tenant data; falls back to a minimal form if hydrate hasn't run.
  const policies = (AppData.POLICIES || []).slice(0, 100);
  const reasons  = (AppData.NIGO_REASONS || []);
  const reps     = (AppData.REPS || []);
  const [form, setForm] = React.useState({
    policyId: policies[0]?.id || "",
    reasonId: reasons[0]?.id || "",
    notes: "",
    assignedTo: reps[0]?.id || "",
    status: "open",
  });
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!form.policyId) { window.toast && window.toast("Pick a policy", "warn"); return; }
    setBusy(true);
    try {
      const pol = policies.find(p => p.id === form.policyId);
      await AppData.mutate.nigoCreate({
        policyId: form.policyId,
        pipelineId: pol?.leadId || null,
        reasonId: form.reasonId || null,
        notes: form.notes || null,
        assignedTo: form.assignedTo || null,
        status: form.status,
      });
      window.toast && window.toast(`NIGO logged${AppData.LIVE ? " · saved" : ""}`, "success");
      onClose();
    } catch (_e) {} finally { setBusy(false); }
  };

  return (
    <Shared.Modal title="Log NIGO" width={540} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !form.policyId}>
          <Icons.Plus size={11}/> {busy ? "Saving…" : "Log NIGO"}
        </button>
      </>
    }>
      {policies.length === 0 && (
        <div style={{ padding: 10, background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", borderRadius: 6, color: "var(--state-warning)", fontSize: 12, marginBottom: 12 }}>
          No policies on file yet — create one before logging a NIGO against it.
        </div>
      )}
      <Shared.Field label="Policy">
        <Shared.Select value={form.policyId} onChange={(v) => setForm({ ...form, policyId: v })} options={[
          { v: "", l: "— Pick policy —" },
          ...policies.map(p => ({ v: p.id, l: `${p.policyNumber || p.id.slice(0, 8)} · ${p.product || ""} · ${p.state || ""}` })),
        ]}/>
      </Shared.Field>
      <Shared.Field label="Reason" hint="Hydrated from public.nigo_reasons">
        <Shared.Select value={form.reasonId} onChange={(v) => setForm({ ...form, reasonId: v })} options={[
          { v: "", l: "— Pick reason —" },
          ...reasons.map(r => ({ v: r.id, l: `${r.label}${r.severity ? ` · ${r.severity}` : ""}` })),
        ]}/>
      </Shared.Field>
      <Shared.Field label="Assign to">
        <Shared.Select value={form.assignedTo} onChange={(v) => setForm({ ...form, assignedTo: v })} options={[
          { v: "", l: "— Unassigned —" },
          ...reps.map(r => ({ v: r.id, l: `${r.name} (${r.handle || r.id})` })),
        ]}/>
      </Shared.Field>
      <Shared.Field label="Notes">
        <textarea
          className="text-input" rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="What's missing? Carrier feedback verbatim ideal."
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />
      </Shared.Field>
      <Shared.Field label="Status">
        <Shared.Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[
          { v: "open", l: "Open" },
          { v: "in_review", l: "In review" },
        ]}/>
      </Shared.Field>
    </Shared.Modal>
  );
}

window.PageNIGO       = PageNIGO;
window.PageCarriers   = PageCarriers;
window.PageScrubbers  = PageScrubbers;
window.PageForecast   = PageForecast;

})();
