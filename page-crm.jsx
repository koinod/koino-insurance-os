/* page-crm.jsx — CRM hub.
   One screen for the whole lead lifecycle: Inbox (newest leads across all
   sources) · Sources (connectors + cost-per-lead per channel) · Pipeline
   (stage view) · Lifecycle (funnel from lead → contacted → quoted → issued).

   Built to scale from "we buy leads from vendors" to "we run our own ads
   for clients" — Sources tab supports connecting Facebook Ads, Google Ads,
   Convoso, lead vendors, manual CSV upload, and webhooks.

   Math comes from window.AppData (PIPELINE, LEAD_SOURCES, TOUCHPOINTS,
   ATTRIBUTIONS, REPS) with sample-mode fallback when the agency is empty. */

(function () {

const SAMPLE_SOURCES = [
  { id: "fb-leads",    name: "Facebook Lead Ads",     kind: "owned_ads",   vendor: "Meta",     status: "connected", costPerLead: 28.40, leadsMtd: 142, contactedMtd: 124, issuedMtd: 14, ap: 26840, accountId: "act_18293817", lastSync: "2m ago" },
  { id: "google-ads",  name: "Google Search Ads",      kind: "owned_ads",   vendor: "Google",   status: "connected", costPerLead: 70.91, leadsMtd: 88,  contactedMtd: 52,  issuedMtd: 12, ap: 24400, accountId: "8128-491-2918", lastSync: "5m ago" },
  { id: "convoso",     name: "Convoso · inbound",      kind: "transfers",   vendor: "Convoso",  status: "connected", costPerLead: 33.68, leadsMtd: 38,  contactedMtd: 38,  issuedMtd: 14, ap: 28110, accountId: "atlas-imo",   lastSync: "now" },
  { id: "leadhero",    name: "Lead Heroes",             kind: "vendor",      vendor: "LeadHeroes", status: "connected", costPerLead: 17.14, leadsMtd: 42,  contactedMtd: 29,  issuedMtd: 5,  ap:  6420, accountId: "atlas-04",     lastSync: "1h ago" },
  { id: "datamail",    name: "DataMail · T65 list",    kind: "list",        vendor: "DataMail", status: "manual",    costPerLead: 10.00, leadsMtd: 184, contactedMtd: 92,  issuedMtd: 6,  ap:  9340, accountId: "csv import",   lastSync: "2d ago" },
  { id: "referral",    name: "Producer referrals",      kind: "referral",    vendor: "Internal", status: "always_on", costPerLead:  3.53, leadsMtd: 34,  contactedMtd: 32,  issuedMtd: 11, ap: 22180, accountId: "—",            lastSync: "now" },
];

const KIND_META = {
  owned_ads:  { l: "Owned ads",       i: "Bolt",      tone: "money" },
  transfers:  { l: "Live transfers",  i: "Phone",     tone: "info" },
  vendor:     { l: "Lead vendor",     i: "Wallet",    tone: null },
  list:       { l: "List",            i: "FileText",  tone: null },
  referral:   { l: "Referral",        i: "Users",     tone: "money" },
  webhook:    { l: "Webhook",         i: "Plug",      tone: "info" },
  manual:     { l: "Manual upload",   i: "ArrowUp",   tone: null },
};

const CONNECTOR_CATALOG = [
  { id: "fb-ads",      name: "Facebook Lead Ads",  kind: "owned_ads",  setup: "Connect Meta Business account → select forms → leads stream in via webhook." },
  { id: "google-ads",  name: "Google Ads",          kind: "owned_ads",  setup: "OAuth Google Ads → grant Lead Form Extensions read → ROAS attribution flows back." },
  { id: "tiktok-ads",  name: "TikTok Lead Gen",     kind: "owned_ads",  setup: "OAuth TikTok Business → instant forms ingest. Newer surface — strong T55-T65 reach." },
  { id: "convoso",     name: "Convoso transfers",   kind: "transfers",  setup: "API key + auto-route inbound → producer queue under 60s." },
  { id: "ringy",       name: "Ringy / iSalesCRM",   kind: "transfers",  setup: "Webhook URL pointed at /api/leads/inbound; we map fields automatically." },
  { id: "leadhero",    name: "Lead Heroes",         kind: "vendor",     setup: "Vendor API key + drop email — we score + dedupe before posting to queue." },
  { id: "tlw",         name: "TLW direct mail",     kind: "vendor",     setup: "Daily CSV email → IMAP grab → vault archive + queue insert." },
  { id: "csv",         name: "CSV upload",           kind: "manual",     setup: "Drop a CSV — we infer columns + queue the rows for verification + dialing." },
  { id: "webhook",     name: "Generic webhook",     kind: "webhook",    setup: "POST your leads to /api/leads/inbound with HMAC-signed body. JSON or form-encoded." },
];

const STAGES = ["New", "Contacted", "Quoted", "App In", "Issued", "Lost"];
const STAGE_TONE = {
  New:       "var(--accent-status)",
  Contacted: "var(--accent-info)",
  Quoted:    "var(--accent-money)",
  "App In":  "color-mix(in oklch, var(--accent-money) 70%, var(--accent-status))",
  Issued:    "var(--accent-money)",
  Lost:      "var(--state-danger)",
};
const HEAT_TONE = { fresh: "var(--accent-money)", hot: "var(--state-warning)", warm: "var(--accent-info)", cold: "var(--text-tertiary)" };

const fmtMoney = (n) => "$" + Math.round(n || 0).toLocaleString();
const safeDiv = (a, b) => (b ? a / b : 0);

function useAppDataTick() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => { window.removeEventListener("data:hydrated", fn); window.removeEventListener("data:mutated", fn); };
  }, []);
}

function deriveSources(useSample) {
  const sources  = (window.AppData && window.AppData.LEAD_SOURCES) || [];
  const touch    = (window.AppData && window.AppData.TOUCHPOINTS)  || [];
  const attr     = (window.AppData && window.AppData.ATTRIBUTIONS) || [];
  const policies = (window.AppData && window.AppData.POLICIES)     || [];
  if (useSample || sources.length === 0) return SAMPLE_SOURCES;
  return sources.map(s => {
    const sourceTouches = touch.filter(t => t.sourceId === s.id);
    const leadIds = new Set(sourceTouches.map(t => t.leadId));
    const sourceAttr = attr.filter(a => a.sourceId === s.id);
    sourceAttr.forEach(a => leadIds.add(a.leadId));
    const linkedPolicies = policies.filter(p => leadIds.has(p.leadId));
    return {
      id: s.id, name: s.name, kind: s.kind || "vendor", vendor: s.vendor || "—",
      status: "connected",
      costPerLead: s.costPerLead || 0,
      leadsMtd: leadIds.size,
      contactedMtd: Math.round(leadIds.size * 0.7),
      issuedMtd: linkedPolicies.filter(p => p.issuedAt).length,
      ap: linkedPolicies.reduce((a, p) => a + (p.ap || 0), 0),
      accountId: "—", lastSync: "live",
    };
  });
}

function PageCrm({ role = "owner" }) {
  useAppDataTick();
  const [tab, setTab]             = React.useState("inbox");
  const [useSample, setUseSample] = React.useState(true);
  const [stageFilter, setStage]   = React.useState("all");
  const [sourceFilter, setSF]     = React.useState("all");
  const [ownerFilter, setOF]      = React.useState("all");
  const [q, setQ]                 = React.useState("");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [activeLead, setActiveLead]   = React.useState(null);
  const [addLeadOpen, setAddLeadOpen] = React.useState(false);

  const sources  = deriveSources(useSample);
  const pipeline = (window.AppData && window.AppData.PIPELINE) || [];
  const reps     = (window.AppData && window.AppData.REPS)     || [];

  const realDataAvailable = (window.AppData && window.AppData.LEAD_SOURCES) ? window.AppData.LEAD_SOURCES.length > 0 : false;

  // ── KPI rollup ──────────────────────────────────────────────────────────
  const totalLeads      = sources.reduce((a, s) => a + s.leadsMtd, 0);
  const totalContacted  = sources.reduce((a, s) => a + s.contactedMtd, 0);
  const totalIssued     = sources.reduce((a, s) => a + s.issuedMtd, 0);
  const totalSpend      = sources.reduce((a, s) => a + (s.costPerLead * s.leadsMtd), 0);
  const totalAp         = sources.reduce((a, s) => a + s.ap, 0);
  const blendedRoas     = safeDiv(totalAp, totalSpend);
  const contactRate     = safeDiv(totalContacted * 100, totalLeads);
  const closeRate       = safeDiv(totalIssued * 100, totalLeads);

  // ── Filters for inbox / pipeline ────────────────────────────────────────
  const sourceNames = Array.from(new Set([
    ...sources.map(s => s.name),
    ...pipeline.map(p => p.source).filter(Boolean),
  ]));
  const filteredLeads = pipeline.filter(p =>
    (stageFilter === "all"  || p.stage === stageFilter) &&
    (sourceFilter === "all" || p.source === sourceFilter) &&
    (ownerFilter === "all"  || p.owner === ownerFilter) &&
    (!q || (p.lead || "").toLowerCase().includes(q.toLowerCase()) || (p.product || "").toLowerCase().includes(q.toLowerCase()))
  );

  const reassign = (leadId, repId) => {
    const mut = window.AppData?.mutate;
    const rep = reps.find(r => r.id === repId);
    if (mut?.pipelineUpdate) mut.pipelineUpdate(leadId, { owner: repId });
    else {
      const row = pipeline.find(p => p.id === leadId);
      if (row) row.owner = repId;
    }
    window.toast && window.toast(`Assigned to ${rep?.name || repId}`, "success");
  };
  const setStageOf = (leadId, stage) => {
    const mut = window.AppData?.mutate;
    if (mut?.pipelineUpdate) mut.pipelineUpdate(leadId, { stage });
    else {
      const row = pipeline.find(p => p.id === leadId);
      if (row) row.stage = stage;
    }
  };

  // ── Manual lead create + CSV export ─────────────────────────────────────
  const addLead = (form) => {
    const mut = window.AppData?.mutate;
    const row = {
      id: "lead-" + Date.now(),
      lead: form.name, age: +form.age || null, state: form.state, phone: form.phone,
      stage: "New", product: form.product, ap: 0, days: 0,
      last: "Just now", next: "First dial",
      source: form.source || "Manual entry",
      owner: form.owner || (reps[0]?.id),
      consent: "verified", heat: "fresh",
    };
    if (mut?.pipelineCreate) mut.pipelineCreate(row);
    else if (window.AppData?.PIPELINE) window.AppData.PIPELINE.unshift(row);
    setAddLeadOpen(false);
    window.toast && window.toast(`Added ${form.name}`, "success");
  };

  const exportCsv = () => {
    if (!filteredLeads.length) { window.toast && window.toast("No leads to export", "info"); return; }
    const cols = ["lead","age","state","source","product","stage","owner","ap","days","heat","consent"];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const ownerName = (id) => reps.find(r => r.id === id)?.name || id || "";
    const rows = filteredLeads.map(l => cols.map(c => c === "owner" ? esc(ownerName(l.owner)) : esc(l[c])).join(","));
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.toast && window.toast(`Exported ${filteredLeads.length} leads`, "success");
  };

  const TABS = [
    { k: "inbox",     l: "Inbox",     icon: "Bell",     badge: filteredLeads.length },
    { k: "sources",   l: "Sources",   icon: "Plug",     badge: sources.length },
    { k: "pipeline",  l: "Pipeline",  icon: "Pipeline" },
    { k: "lifecycle", l: "Lifecycle", icon: "Activity" },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">CRM</div>
          <div className="page-sub">Lead inbox · sources · pipeline · lifecycle — one screen for the whole funnel</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!realDataAvailable && <span className="chip" style={{ fontSize: 10.5, color: "var(--state-warning)" }}>sample mode</span>}
          {realDataAvailable && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-tertiary)", cursor: "pointer" }}>
              <input type="checkbox" checked={useSample} onChange={(e) => setUseSample(e.target.checked)}/> sample
            </label>
          )}
          <button className="btn btn-ghost" onClick={exportCsv} title="Export filtered leads as CSV">
            <Icons.ArrowDown size={12}/> Export CSV
          </button>
          <button className="btn btn-ghost" onClick={() => setAddLeadOpen(true)}>
            <Icons.Plus size={12}/> Add lead
          </button>
          <button className="btn btn-primary" onClick={() => setConnectOpen(true)}>
            <Icons.Plug size={12}/> Connect source
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
        <Shared.KpiCard label="Leads (period)"     value={totalLeads.toLocaleString()}  sub={`${sources.length} sources`}/>
        <Shared.KpiCard label="Contact rate"       value={contactRate.toFixed(0) + "%"} sub={`${totalContacted} contacted`}/>
        <Shared.KpiCard label="Issued / close"     value={totalIssued + " · " + closeRate.toFixed(1) + "%"} sub="period"/>
        <Shared.KpiCard label="Lead spend"         prefix="$" value={Math.round(totalSpend).toLocaleString()} sub={`CPL ${fmtMoney(safeDiv(totalSpend, totalLeads))}`}/>
        <Shared.KpiCard label="Blended ROAS"       value={blendedRoas.toFixed(2) + "x"} sub={`${fmtMoney(totalAp)} AP`} trend={blendedRoas >= 3 ? "up" : blendedRoas >= 1.5 ? null : "down"}/>
      </div>

      <Shared.SectionPill items={TABS} value={tab} onChange={setTab}/>

      {tab === "inbox"     && <InboxSection {...{ leads: filteredLeads, reps, sources, sourceNames, stageFilter, setStage, sourceFilter, setSF, ownerFilter, setOF, q, setQ, reassign, setStageOf, setActiveLead }}/>}
      {tab === "sources"   && <SourcesSection {...{ sources, setConnectOpen }}/>}
      {tab === "pipeline"  && <PipelineSection {...{ leads: pipeline, reps, setStageOf, setActiveLead }}/>}
      {tab === "lifecycle" && <LifecycleSection {...{ totalLeads, totalContacted, totalIssued, totalSpend, totalAp, blendedRoas, sources }}/>}

      {connectOpen   && <ConnectModal onClose={() => setConnectOpen(false)}/>}
      {activeLead    && <LeadDetailModal lead={activeLead} reps={reps} onClose={() => setActiveLead(null)} reassign={reassign} setStageOf={setStageOf}/>}
      {addLeadOpen   && <AddLeadModal reps={reps} sourceNames={sourceNames} onClose={() => setAddLeadOpen(false)} onSave={addLead}/>}
    </div>
  );
}

// ═══ Add lead modal ═══════════════════════════════════════════════════════
function AddLeadModal({ reps, sourceNames, onClose, onSave }) {
  const [form, setForm] = React.useState({
    name: "", phone: "", age: "", state: "", product: "Med Supp Plan G",
    source: sourceNames[0] || "Manual entry", owner: reps[0]?.id || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim().length > 0;
  return (
    <Shared.Modal title="Add a lead manually" width={520} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Shared.Field label="Full name *">
          <input className="text-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus/>
        </Shared.Field>
        <Shared.Field label="Phone (E.164)">
          <input className="text-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+15125550199"/>
        </Shared.Field>
        <Shared.Field label="Age">
          <input className="text-input" type="number" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="65"/>
        </Shared.Field>
        <Shared.Field label="State">
          <input className="text-input" value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="TX"/>
        </Shared.Field>
        <Shared.Field label="Product">
          <input className="text-input" value={form.product} onChange={(e) => set("product", e.target.value)}/>
        </Shared.Field>
        <Shared.Field label="Source">
          <Shared.Select value={form.source} onChange={(v) => set("source", v)}
            options={[{ v: "Manual entry", l: "Manual entry" }, ...sourceNames.map(n => ({ v: n, l: n }))]}/>
        </Shared.Field>
        <Shared.Field label="Assign to">
          <Shared.Select value={form.owner} onChange={(v) => set("owner", v)} options={reps.map(r => ({ v: r.id, l: r.name }))}/>
        </Shared.Field>
        <div/>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(form)}>
          <Icons.Plus size={11}/> Add lead
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Shared.Modal>
  );
}

// ═══ Inbox ════════════════════════════════════════════════════════════════
function InboxSection({ leads, reps, sources, sourceNames, stageFilter, setStage, sourceFilter, setSF, ownerFilter, setOF, q, setQ, reassign, setStageOf, setActiveLead }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Bell size={13}/>
        <h3>Lead inbox</h3>
        <span className="meta">{leads.length} · sorted newest first</span>
      </div>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 160px 160px 160px", gap: 8, alignItems: "end", borderBottom: "1px solid var(--border-subtle)" }}>
        <input className="text-input" placeholder="Search leads or products…" value={q} onChange={(e) => setQ(e.target.value)}/>
        <Shared.Select value={stageFilter} onChange={setStage} options={[{ v: "all", l: "All stages" }, ...STAGES.map(s => ({ v: s, l: s }))]}/>
        <Shared.Select value={sourceFilter} onChange={setSF} options={[{ v: "all", l: "All sources" }, ...sourceNames.map(n => ({ v: n, l: n }))]}/>
        <Shared.Select value={ownerFilter} onChange={setOF} options={[{ v: "all", l: "All owners" }, ...reps.map(r => ({ v: r.id, l: r.name }))]}/>
      </div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "12px 1.5fr 60px 100px 1fr 1fr 80px 90px" }}>
          <div></div><div>Lead</div><div>Age</div><div>Source</div><div>Product</div><div>Owner</div><div className="tabular" style={{ textAlign: "right" }}>AP</div><div>Stage</div>
        </div>
        {leads.map(l => {
          const owner = reps.find(r => r.id === l.owner);
          return (
            <div key={l.id} className="row" style={{ gridTemplateColumns: "12px 1.5fr 60px 100px 1fr 1fr 80px 90px", height: 40, cursor: "pointer" }} onClick={() => setActiveLead(l)}>
              <span className="dot" style={{ background: HEAT_TONE[l.heat] || "var(--text-tertiary)" }}/>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <strong style={{ fontWeight: 500 }} className="cell-truncate">{l.lead}</strong>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{l.state}</span>
              </div>
              <div className="tabular" style={{ color: "var(--text-tertiary)" }}>{l.age}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }} className="cell-truncate">{l.source}</div>
              <div style={{ fontSize: 11.5 }} className="cell-truncate">{l.product}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <Shared.Select value={l.owner} onChange={(v) => reassign(l.id, v)} options={reps.map(r => ({ v: r.id, l: r.name }))}/>
              </div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-secondary)" }}>{l.ap ? fmtMoney(l.ap) : "—"}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <Shared.Select value={l.stage} onChange={(v) => setStageOf(l.id, v)} options={STAGES.map(s => ({ v: s, l: s }))}/>
              </div>
            </div>
          );
        })}
        {leads.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No leads match the filter. Try clearing or connect a new source.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Sources ══════════════════════════════════════════════════════════════
function SourcesSection({ sources, setConnectOpen }) {
  return (
    <div>
      <div className="panel">
        <div className="panel-h">
          <Icons.Plug size={13}/>
          <h3>Connected sources</h3>
          <span className="meta">{sources.length} live · {sources.filter(s => s.status === "connected").length} healthy</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setConnectOpen(true)}>
            <Icons.Plus size={11}/> Add
          </button>
        </div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {sources.map(s => {
            const km = KIND_META[s.kind] || KIND_META.vendor;
            const Ico = Icons[km.i] || Icons.Folder;
            const cpl = s.costPerLead;
            const spend = cpl * s.leadsMtd;
            const roas = safeDiv(s.ap, spend);
            const close = safeDiv(s.issuedMtd * 100, s.leadsMtd);
            return (
              <div key={s.id} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Ico size={14} style={{ color: "var(--text-secondary)" }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }} className="cell-truncate">{s.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{km.l} · {s.vendor}</div>
                  </div>
                  <span className={`chip ${s.status === "connected" ? "chip-money" : s.status === "manual" ? "" : "chip-status"}`} style={{ fontSize: 9.5 }}>{s.status}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <Mini label="Leads"    value={s.leadsMtd}/>
                  <Mini label="CPL"      value={fmtMoney(cpl)}/>
                  <Mini label="Close"    value={close.toFixed(0) + "%"}/>
                  <Mini label="ROAS"     value={roas.toFixed(2) + "x"} tone={roas >= 3 ? "money" : roas >= 1.5 ? null : "danger"}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                  <Icons.Clock size={10}/> {s.lastSync} · {s.accountId}
                  <div style={{ flex: 1 }}/>
                  <button className="btn btn-ghost" style={{ height: 22, padding: "0 6px", fontSize: 10.5 }}>Configure</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }) {
  const color = tone === "money" ? "var(--accent-money)" : tone === "danger" ? "var(--state-danger)" : "var(--text-primary)";
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

// ═══ Pipeline (Kanban) ════════════════════════════════════════════════════
function PipelineSection({ leads, reps, setStageOf, setActiveLead }) {
  const byStage = STAGES.map(s => ({ stage: s, items: leads.filter(l => l.stage === s) }));
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Pipeline size={13}/>
        <h3>Pipeline</h3>
        <span className="meta">{leads.length} active · drag stage in dropdown to advance</span>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 8 }}>
        {byStage.map(col => (
          <div key={col.stage} style={{ background: "var(--bg-raised)", borderRadius: 6, padding: 8, minHeight: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span className="dot" style={{ background: STAGE_TONE[col.stage] }}/>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{col.stage}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>{col.items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {col.items.map(l => {
                const owner = reps.find(r => r.id === l.owner);
                return (
                  <div key={l.id} onClick={() => setActiveLead(l)}
                    style={{ padding: 8, background: "var(--bg-overlay)", borderRadius: 5, cursor: "pointer", border: `1px solid ${HEAT_TONE[l.heat] === "var(--text-tertiary)" ? "transparent" : "color-mix(in oklch, " + HEAT_TONE[l.heat] + " 30%, transparent)"}` }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500 }} className="cell-truncate">{l.lead}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }} className="cell-truncate">{l.product}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, color: "var(--text-tertiary)" }}>
                      <span>{owner?.name || l.owner}</span>
                      <div style={{ flex: 1 }}/>
                      {l.ap ? <span style={{ fontWeight: 500, color: "var(--accent-money)" }}>{fmtMoney(l.ap)}</span> : null}
                    </div>
                  </div>
                );
              })}
              {col.items.length === 0 && (
                <div style={{ padding: 14, textAlign: "center", color: "var(--text-tertiary)", fontSize: 11 }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Lifecycle / funnel ═══════════════════════════════════════════════════
function LifecycleSection({ totalLeads, totalContacted, totalIssued, totalSpend, totalAp, blendedRoas, sources }) {
  // Funnel steps: Lead → Contacted → Quoted (estimated 0.65 of contacted) → Issued
  const quoted = Math.round(totalContacted * 0.65);
  const steps = [
    { l: "Leads",      v: totalLeads,     pct: 100 },
    { l: "Contacted",  v: totalContacted, pct: safeDiv(totalContacted * 100, totalLeads) },
    { l: "Quoted",     v: quoted,         pct: safeDiv(quoted * 100, totalLeads) },
    { l: "Issued",     v: totalIssued,    pct: safeDiv(totalIssued * 100, totalLeads) },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h"><Icons.Activity size={13}/><h3>Funnel</h3></div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => (
            <div key={s.l}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{s.l}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.v.toLocaleString()} · {s.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: "var(--bg-overlay)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: s.pct + "%", height: "100%", background: i === 0 ? "var(--accent-status)" : i === 1 ? "var(--accent-info)" : i === 2 ? "color-mix(in oklch, var(--accent-money) 70%, var(--accent-status))" : "var(--accent-money)" }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Spend → revenue</h3></div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Row label="Total lead spend"  value={fmtMoney(totalSpend)}/>
          <Row label="Annual premium"     value={fmtMoney(totalAp)} tone="money"/>
          <Row label="Blended ROAS"       value={blendedRoas.toFixed(2) + "x"} tone={blendedRoas >= 3 ? "money" : blendedRoas >= 1.5 ? null : "danger"}/>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>By source</div>
          {sources.map(s => {
            const spend = s.costPerLead * s.leadsMtd;
            const roas = safeDiv(s.ap, spend);
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px", gap: 6, fontSize: 11.5, padding: "4px 0" }}>
                <span className="cell-truncate">{s.name}</span>
                <span className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(spend)}</span>
                <span className="tabular" style={{ textAlign: "right", color: roas >= 3 ? "var(--accent-money)" : roas >= 1.5 ? "var(--state-warning)" : "var(--state-danger)", fontWeight: 500 }}>{roas.toFixed(2)}x</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }) {
  const color = tone === "money" ? "var(--accent-money)" : tone === "danger" ? "var(--state-danger)" : "var(--text-primary)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

// ═══ Connect-source modal ═════════════════════════════════════════════════
function ConnectModal({ onClose }) {
  const [picked, setPicked] = React.useState(null);
  const onConnect = (c) => {
    window.toast && window.toast(`OAuth flow for ${c.name} — coming soon. Drop a webhook URL or CSV in the meantime.`, "info");
    onClose();
  };
  return (
    <Shared.Modal title="Connect a lead source" width={680} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {CONNECTOR_CATALOG.map(c => {
          const km = KIND_META[c.kind] || KIND_META.vendor;
          const Ico = Icons[km.i] || Icons.Plug;
          const active = picked === c.id;
          return (
            <div key={c.id} onClick={() => setPicked(c.id)}
              style={{ padding: 12, background: active ? "color-mix(in oklch, var(--accent-money) 12%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 6, border: `1px solid ${active ? "color-mix(in oklch, var(--accent-money) 40%, transparent)" : "var(--border-subtle)"}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Ico size={13} style={{ color: "var(--text-secondary)" }}/>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{km.l}</div>
              {active && (
                <div style={{ marginTop: 8, padding: 8, background: "var(--bg-overlay)", borderRadius: 4, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {c.setup}
                  <button className="btn btn-primary" style={{ marginTop: 8, width: "100%", height: 28 }} onClick={(e) => { e.stopPropagation(); onConnect(c); }}>
                    <Icons.ArrowUpRight size={11}/> Start setup
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Shared.Modal>
  );
}

// ═══ Lead detail modal ════════════════════════════════════════════════════
function LeadDetailModal({ lead, reps, onClose, reassign, setStageOf }) {
  const owner = reps.find(r => r.id === lead.owner);
  return (
    <Shared.Modal title={lead.lead} width={620} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Age">{lead.age}</Field>
        <Field label="State">{lead.state}</Field>
        <Field label="Source">{lead.source}</Field>
        <Field label="Product">{lead.product}</Field>
        <Field label="AP">{lead.ap ? fmtMoney(lead.ap) : "—"}</Field>
        <Field label="Days in pipeline">{lead.days}</Field>
        <Field label="Last touch">{lead.last}</Field>
        <Field label="Next">{lead.next}</Field>
      </div>

      <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Shared.Field label="Owner">
          <Shared.Select value={lead.owner} onChange={(v) => reassign(lead.id, v)} options={reps.map(r => ({ v: r.id, l: r.name }))}/>
        </Shared.Field>
        <Shared.Field label="Stage">
          <Shared.Select value={lead.stage} onChange={(v) => setStageOf(lead.id, v)} options={STAGES.map(s => ({ v: s, l: s }))}/>
        </Shared.Field>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={() => { window.repflowCall && window.repflowCall(lead.phone || "", lead.lead); onClose(); }}>
          <Icons.Phone size={11}/> Call
        </button>
        <button className="btn" onClick={() => window.smsCompose && window.smsCompose(lead, lead.phone)}>
          <Icons.MessageSquare size={11}/> SMS
        </button>
        <button className="btn" onClick={() => window.scheduleSOA && window.scheduleSOA(lead)}>
          <Icons.Calendar size={11}/> Schedule SOA
        </button>
        <div style={{ flex: 1 }}/>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Shared.Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{children}</div>
    </div>
  );
}

window.PageCrm = PageCrm;

})();
