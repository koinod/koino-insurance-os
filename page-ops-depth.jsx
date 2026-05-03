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
  const baseNigos = liveNigos && liveNigos.length > 0 ? liveNigos : NIGOS;
  const visible = baseNigos
    .map(n => ({ ...n, status: statusOverrides[n.id] ?? n.status }))
    .filter(n =>
      (filter.status === "all" || n.status === filter.status) &&
      (filter.priority === "all" || n.priority === filter.priority)
    );

  const setStatus = async (id, newStatus) => {
    setStatusOverrides(s => ({ ...s, [id]: newStatus }));
    try {
      await AppData.mutate.nigoStatus(id, newStatus);
      window.toast && window.toast(`NIGO marked ${STATUS_LABEL[newStatus] || newStatus}${AppData.LIVE ? " · saved" : ""}`, "success");
    } catch (_e) {}
  };
  const totalAtRisk = visible.reduce((a, n) => a + n.apAtRisk, 0);
  const repById = Object.fromEntries(AppData.REPS.map(r => [r.id, r]));

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
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Open NIGOs" value={baseNigos.filter(n => n.status === "open").length} sub={`$${baseNigos.filter(n => n.status === "open").reduce((a, n) => a + n.apAtRisk, 0).toLocaleString()} AP at risk`}/>
        <Shared.KpiCard      label="In review" value={baseNigos.filter(n => n.status === "in_review").length}/>
        <Shared.KpiCard      label="Fixed today" value={baseNigos.filter(n => n.status === "fixed").length} trend="up"/>
        <Shared.KpiCard      label="Avg time-to-fix" value="1.4d" sub="goal 2d" trend="up"/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>NIGO queue</h3><span className="meta">priority sorted</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "30px 1.4fr 1fr 1fr 1.6fr 80px 100px 100px 100px" }}>
            <div></div><div>Lead</div><div>Carrier</div><div>Product</div><div>Reason</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP risk</div>
            <div>Owner</div><div>Deadline</div><div>Status</div>
          </div>
          {visible.sort((a, b) => a.priority.localeCompare(b.priority)).map(n => {
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
   ────────────────────────────────────────────────────────────────────────── */
const CARRIERS = [
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

function PageCarriers() {
  const [openId, setOpenId] = React.useState(CARRIERS[0].id);
  const c = CARRIERS.find(x => x.id === openId);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Carriers</div>
          <div className="page-sub">{CARRIERS.length} appointed · {CARRIERS.reduce((a, c) => a + c.appt, 0)} producer appointments · comp grids + cycles + NIGO rate</div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }}><Icons.Plus size={13}/> New carrier</button>
      </div>

      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Appointed carriers</h3></div>
          <div style={{ padding: 6 }}>
            {CARRIERS.map(cc => (
              <button key={cc.id} onClick={() => setOpenId(cc.id)} className="btn btn-ghost" style={{ width: "100%", padding: 10, marginBottom: 4, justifyContent: "stretch", flexDirection: "column", alignItems: "stretch", gap: 4, background: openId === cc.id ? "var(--bg-overlay)" : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13 }}>{cc.name}</strong>
                  <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{cc.appt} appts</span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span className={`chip ${cc.advances ? "chip-money" : ""}`} style={{ fontSize: 10 }}>{cc.advances ? "advance · " + cc.cycle : "as-earned · " + cc.cycle}</span>
                  <span style={{ fontSize: 10.5, color: cc.persistency >= 90 ? "var(--accent-money)" : cc.persistency >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}>● {cc.persistency}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><h3>{c.name}</h3>
              <span className={`chip ${c.advances ? "chip-money" : ""}`}>{c.advances ? "advance" : "as-earned"} · {c.cycle}</span>
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }}>Configure</button>
            </div>
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <Shared.Field label="Appointments"><div className="tabular" style={{ fontSize: 18, fontWeight: 500 }}>{c.appt}</div></Shared.Field>
              <Shared.Field label="13-mo persistency"><div className="tabular" style={{ fontSize: 18, fontWeight: 500, color: c.persistency >= 90 ? "var(--accent-money)" : c.persistency >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}>{c.persistency}%</div></Shared.Field>
              <Shared.Field label="NIGO rate"><div className="tabular" style={{ fontSize: 18, fontWeight: 500 }}>{c.nigo}%</div></Shared.Field>
              <Shared.Field label="Pay cycle"><div style={{ fontSize: 14, fontWeight: 500 }}>{c.cycle}</div></Shared.Field>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Comp grid</h3></div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px" }}>
                <div>Product</div>
                <div className="tabular" style={{ textAlign: "right" }}>Comp %</div>
                <div className="tabular" style={{ textAlign: "right" }}>Advance %</div>
                <div className="tabular" style={{ textAlign: "right" }}>Chargeback period</div>
              </div>
              {c.products.map((p, i) => (
                <div key={i} className="row" style={{ gridTemplateColumns: "1.6fr 100px 100px 100px" }}>
                  <div style={{ fontWeight: 500 }}>{p.p}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.comp}%</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.advance}%</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.chargeback}mo</div>
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
function PageScrubbers() {
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
    if (zip)    r.push({ k: "License", ok: stateOk, msg: stateOk ? "Producer Marcus Avila licensed in this zip" : "Invalid zip" });
    if (zip)    r.push({ k: "Carrier appt", ok: stateOk, msg: stateOk ? "UHC, Humana, Aetna SRC appointed for this state" : "Cannot verify state" });
    setResults(r);
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Compliance scrubbers</div>
          <div className="page-sub">DNC · age · license · carrier appointment — gates dialing on Med Supp & FE</div>
        </div>
      </div>

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

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h3>Auto-scrub policy · Med Supp + FE</h3></div>
        <div style={{ padding: 14, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          • Every inbound number is scrubbed against state + federal DNC + Atlas internal opt-out before routing<br/>
          • Producers cannot dial leads where DNC fails — gated at the dialer<br/>
          • Producer license + carrier appointment validated against the lead's state in real time<br/>
          • TPMO disclaimer auto-fires within 8 seconds of connect on any Med Supp call<br/>
          • All scrub results logged with timestamp + producer ID for audit
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   4. Revenue forecast — pipeline value × close-prob → forecast curve
   ────────────────────────────────────────────────────────────────────────── */
function PageForecast() {
  // Close probability by stage
  const STAGE_PROB = { "New": 0.04, "Contacted": 0.12, "Quoted": 0.32, "App In": 0.78, "Issued": 1.0 };
  const pipeline = AppData.PIPELINE || [];
  const reps = AppData.REPS || [];

  const weightedAP = pipeline.reduce((a, p) => {
    const fallbackAP = p.product?.includes("Plan G") ? 1800 : p.product?.includes("Plan N") ? 1500 : p.product?.includes("Annuity") ? 4000 : 1300;
    const ap = p.ap || fallbackAP;
    return a + ap * (STAGE_PROB[p.stage] || 0);
  }, 0);

  const repForecast = reps.slice(0, 6).map(r => {
    const myDeals = pipeline.filter(p => p.owner === r.id);
    const w = myDeals.reduce((a, p) => {
      const fallbackAP = p.product?.includes("Plan G") ? 1800 : p.product?.includes("Plan N") ? 1500 : p.product?.includes("Annuity") ? 4000 : 1300;
      return a + (p.ap || fallbackAP) * (STAGE_PROB[p.stage] || 0);
    }, 0);
    return { ...r, deals: myDeals.length, weighted: w };
  });

  // Synthesized 30-day curve: cumulative weighted AP rolling
  const curve = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    return { day, ap: weightedAP * (1 - Math.exp(-day / 12)) };
  });

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Revenue forecast</div>
          <div className="page-sub">Pipeline value × stage close-probability · 30-day rolling forecast</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Weighted pipeline" prefix="$" value={Math.round(weightedAP).toLocaleString()} sub="all stages × prob"/>
        <Shared.KpiCard      label="In App stage" value={pipeline.filter(p => p.stage === "App In").length} sub="78% close"/>
        <Shared.KpiCard      label="Issued MTD" value={pipeline.filter(p => p.stage === "Issued").length}/>
        <Shared.KpiCard      label="Coverage ratio" value={(weightedAP / 50000).toFixed(2) + "x"} sub="vs $50k goal" trend="up"/>
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

window.PageNIGO       = PageNIGO;
window.PageCarriers   = PageCarriers;
window.PageScrubbers  = PageScrubbers;
window.PageForecast   = PageForecast;

})();
