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
  { id: "convoso",     name: "Convoso · inbound",      kind: "transfers",   vendor: "Convoso",  status: "connected", costPerLead: 33.68, leadsMtd: 38,  contactedMtd: 38,  issuedMtd: 14, ap: 28110, accountId: "agency-comms",    lastSync: "now" },
  { id: "leadhero",    name: "Lead Heroes",             kind: "vendor",      vendor: "LeadHeroes", status: "connected", costPerLead: 17.14, leadsMtd: 42,  contactedMtd: 29,  issuedMtd: 5,  ap:  6420, accountId: "agency-leads",     lastSync: "1h ago" },

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

const STAGES = ["New", "Contacted", "Quoted", "App In", "Issued", "Cancelled", "Lost"];
const STAGE_TONE = {
  New:       "var(--accent-status)",
  Contacted: "var(--accent-info)",
  Quoted:    "var(--accent-money)",
  "App In":  "color-mix(in oklch, var(--accent-money) 70%, var(--accent-status))",
  Issued:    "var(--accent-money)",
  Cancelled: "var(--state-warning)",
  Lost:      "var(--state-danger)",
};
const HEAT_TONE = { fresh: "var(--accent-money)", hot: "var(--state-warning)", warm: "var(--accent-info)", cold: "var(--text-tertiary)" };

const fmtMoney = Shared.fmtMoney;
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
  const isDemo = window.isDemoAgency && window.isDemoAgency();
  if ((useSample || sources.length === 0) && isDemo) return SAMPLE_SOURCES;
  if (sources.length === 0) return [];
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
  // Default sub-tab from sessionStorage so a deep-link can land on
  // "recruiting" / "leads" / "pipeline". 2026-05-12: "inbox" was renamed to
  // "leads" — alias the old key so existing deep-links still resolve.
  const initialTab = (() => {
    try {
      const stash = sessionStorage.getItem("repflow.crm.tab");
      if (stash) {
        sessionStorage.removeItem("repflow.crm.tab");
        if (stash === "inbox") return "leads";
        if (["leads", "pipeline", "sources", "recruiting", "lifecycle"].includes(stash)) return stash;
      }
    } catch {}
    return "leads";
  })();
  const [tab, setTab]             = React.useState(initialTab);
  // Default sample mode ON only for the demo agency. Real tenants start
  // empty so they're not confronted with Atlas IMO / Lead Heroes seed rows.
  const [useSample, setUseSample] = React.useState(() => !!(window.isDemoAgency && window.isDemoAgency()));
  const [stageFilter, setStage]   = React.useState("all");
  const [sourceFilter, setSF]     = React.useState("all");
  const [ownerFilter, setOF]      = React.useState("all");
  const [q, setQ]                 = React.useState("");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [activeLead, setActiveLead]   = React.useState(null);
  const [addLeadOpen, setAddLeadOpen] = React.useState(false);
  const [csvOpen, setCsvOpen]         = React.useState(false);

  // Today's "Log activity" tile dispatches crm:addLead, which we
  // pick up here to pop the Add-lead modal automatically on landing.
  React.useEffect(() => {
    const fn = () => setAddLeadOpen(true);
    window.addEventListener("crm:addLead", fn);
    return () => window.removeEventListener("crm:addLead", fn);
  }, []);

  const sources  = deriveSources(useSample);
  const rawPipeline = (window.AppData && window.AppData.PIPELINE) || [];
  const rawReps     = (window.AppData && window.AppData.REPS)     || [];

  // Team scope (session 1 directive): manager view filters pipeline + reps
  // via window.scopeRepIds(). Owner / admin → null (no filter). Manager →
  // downline_ids. Rep → self only. Empty array (me() loading) falls through
  // to full lists so the page renders.
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const inScopeRep = (id) => scopeIds === null || scopeIds.length === 0 || !id || scopeIds.includes(id);
  const pipeline = scopeIds === null || scopeIds.length === 0
    ? rawPipeline
    : rawPipeline.filter(p => !p.owner || scopeIds.includes(p.owner));
  const reps = scopeIds === null || scopeIds.length === 0
    ? rawReps
    : rawReps.filter(r => scopeIds.includes(r.id));

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
  const setSourceOf = (leadId, source) => {
    const mut = window.AppData?.mutate;
    if (mut?.pipelineUpdate) mut.pipelineUpdate(leadId, { source });
    else {
      const row = pipeline.find(p => p.id === leadId);
      if (row) row.source = source;
    }
    window.toast && window.toast(`Source updated to ${source}`, "success");
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

  // Recruiting tab folds in the PageRecruiting workspace (was a separate
  // sidebar item). Restructure 2026-05-12: keep CRM as the single lifecycle
  // hub for "people we're trying to onboard" — leads (consumers) + recruits
  // (producers). Badge count = active recruiting applicants when loaded.
  const recruitingApplicants = (window.AppData && window.AppData.RECRUITING_APPLICANTS) || [];
  const activeApplicants = recruitingApplicants.filter(a => a.status !== "dropped" && a.status !== "producing").length;

  // CRM tab order — daily-work tabs first, configuration tabs last.
  // Leads     → fresh inbound, stage = New / lead, scoped to team.
  // Pipeline  → kanban for the whole team funnel (Contacted → Issued).
  // Recruiting → producer applicants (separate funnel, same shape).
  // Sources / Lifecycle → configuration + reporting at the back.
  const newLeadsCount = pipeline.filter(p => p.stage === "New" || p.stage === "lead").length;
  const TABS = [
    { k: "leads",       l: "Leads",       icon: "Bell",         badge: newLeadsCount },
    { k: "pipeline",    l: "Pipeline",    icon: "Pipeline",     badge: pipeline.length },
    { k: "recruiting",  l: "Recruiting",  icon: "ArrowUpRight", badge: activeApplicants },
    { k: "sources",     l: "Sources",     icon: "Plug",         badge: sources.length },
    { k: "lifecycle",   l: "Lifecycle",   icon: "Activity" },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">CRM</div>
          <div className="page-sub">Leads · pipeline · sources · recruiting · lifecycle — one screen for everyone you're trying to onboard</div>
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
          <button className="btn btn-ghost" onClick={() => setCsvOpen(true)} title="Bulk import leads from CSV">
            <Icons.ArrowUp size={12}/> Import CSV
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

      {tab === "leads"      && (() => {
        // Leads tab = fresh inbound only. Default-filters to stage="New" or
        // "lead" so the manager sees what needs first-touch, distinct from
        // the full Pipeline kanban. The existing filter row still lets you
        // expand to other stages.
        const leadsOnly = filteredLeads.filter(p => stageFilter !== "all" ? true : (p.stage === "New" || p.stage === "lead"));
        return <InboxSection {...{ leads: leadsOnly, reps, sources, sourceNames, stageFilter, setStage, sourceFilter, setSF, ownerFilter, setOF, q, setQ, reassign, setStageOf, setSourceOf, setActiveLead }}/>;
      })()}
      {tab === "sources"    && <SourcesSection {...{ sources, setConnectOpen }}/>}
      {tab === "pipeline"   && <PipelineSection {...{ leads: pipeline, reps, setStageOf, setActiveLead }}/>}
      {tab === "recruiting" && (() => {
        // Embed PageRecruiting here. The component takes a role prop and
        // self-scopes via window.scopeRepIds() so the manager view is already
        // downline-restricted. Render in a "nested" mode by suppressing its
        // own page-h via a wrapper class.
        const PR = window.PageRecruiting;
        if (!PR) return <div className="panel" style={{ padding: 22, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>Recruiting workspace not loaded — refresh the page.</div>;
        return <div className="crm-nested-recruiting"><PR role={role}/></div>;
      })()}
      {tab === "lifecycle"  && <LifecycleSection {...{ totalLeads, totalContacted, totalIssued, totalSpend, totalAp, blendedRoas, sources }}/>}

      {connectOpen   && <ConnectModal onClose={() => setConnectOpen(false)}/>}
      {activeLead    && <LeadDetailModal lead={activeLead} reps={reps} sourceNames={sourceNames} onClose={() => setActiveLead(null)} reassign={reassign} setStageOf={setStageOf} setSourceOf={setSourceOf}/>}
      {addLeadOpen   && <AddLeadModal reps={reps} sourceNames={sourceNames} role={role} onClose={() => setAddLeadOpen(false)} onSave={addLead}/>}
      {csvOpen       && <CsvImportModal reps={reps} onClose={() => setCsvOpen(false)}/>}
    </div>
  );
}

// ═══ CSV import modal ═════════════════════════════════════════════════════
// Fully client-side: parse the file in the browser, auto-map columns by
// header name, let the operator override, then batch-insert via AppData
// mutations so each row hits Supabase + the realtime channel.
const CSV_FIELDS = [
  { k: "name",    l: "Name",    aliases: ["lead_name", "full_name", "fullname", "name", "first_name+last_name", "contact"] },
  { k: "phone",   l: "Phone",   aliases: ["phone", "phone_number", "mobile", "cell", "primary_phone"] },
  { k: "email",   l: "Email",   aliases: ["email", "email_address", "primary_email"] },
  { k: "age",     l: "Age",     aliases: ["age", "dob_age"] },
  { k: "state",   l: "State",   aliases: ["state", "state_code", "region"] },
  { k: "product", l: "Product", aliases: ["product", "product_interest", "plan"] },
  { k: "source",  l: "Source",  aliases: ["source", "lead_source", "vendor", "utm_source"] },
  { k: "ap",      l: "AP $",    aliases: ["ap", "annual_premium", "premium"] },
  { k: "stage",   l: "Stage",   aliases: ["stage", "status"] },
];
const SKIP_VALUE = "__skip__";

// RFC-4180-ish CSV row parser. Handles quoted fields with embedded commas
// and "" escapes. Does NOT handle multi-line quoted values across newlines —
// good enough for 99% of vendor exports.
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const splitRow = (line) => {
    const out = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map(splitRow);
  return { headers, rows };
}

function autoMapColumns(headers) {
  const lc = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const map = {};
  CSV_FIELDS.forEach(f => {
    const idx = lc.findIndex(h => f.aliases.includes(h));
    if (idx >= 0) map[f.k] = idx;
  });
  return map;
}

function CsvImportModal({ reps, onClose }) {
  const [file, setFile]       = React.useState(null);
  const [headers, setHeaders] = React.useState([]);
  const [rows, setRows]       = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  const [defaultOwner, setDefaultOwner] = React.useState(reps[0]?.id || "");
  const [defaultSource, setDefaultSource] = React.useState("CSV import");
  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress]   = React.useState({ done: 0, total: 0, errors: 0 });
  const fileRef = React.useRef(null);

  const onFile = async (f) => {
    if (!f) return;
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setFile(f);
    setHeaders(headers);
    setRows(rows);
    setMapping(autoMapColumns(headers));
  };

  const importNow = async () => {
    if (!rows.length) return;
    setImporting(true);
    setProgress({ done: 0, total: rows.length, errors: 0 });
    let done = 0, errors = 0;
    for (const cells of rows) {
      const get = (k) => mapping[k] != null && mapping[k] !== SKIP_VALUE ? cells[mapping[k]] : "";
      let name = get("name");
      if (!name) {
        // Try first_name + last_name composition
        const fnIdx = headers.findIndex(h => /^first[ _]?name$/i.test(h));
        const lnIdx = headers.findIndex(h => /^last[ _]?name$/i.test(h));
        if (fnIdx >= 0 || lnIdx >= 0) name = [cells[fnIdx], cells[lnIdx]].filter(Boolean).join(" ");
      }
      if (!name) { errors++; setProgress(p => ({ ...p, errors })); continue; }
      const apRaw = get("ap");
      const ap = apRaw ? parseFloat(String(apRaw).replace(/[^0-9.]/g, "")) : 0;
      const row = {
        id: "tmp-" + Date.now() + "-" + done,
        lead: name,
        phone: get("phone") || null,
        email: get("email") || null,
        age:   get("age") ? parseInt(get("age"), 10) : null,
        state: (get("state") || "").toUpperCase().slice(0, 2) || null,
        product: get("product") || "Med Supp Plan G",
        source: get("source") || defaultSource,
        stage: get("stage") || "New",
        ap,
        days: 0,
        last: "Imported just now",
        next: "First dial",
        owner: defaultOwner,
        consent: "verified",
        heat: "fresh",
      };
      try {
        await window.AppData.mutate.pipelineInsert(row);
        done++;
      } catch (e) {
        errors++;
      }
      setProgress({ done, total: rows.length, errors });
    }
    setImporting(false);
    window.toast && window.toast(`Imported ${done} of ${rows.length} leads${errors ? ` · ${errors} skipped` : ""}`, errors ? "warn" : "success");
    if (errors === 0) onClose();
  };

  const previewRows = rows.slice(0, 5);

  return (
    <Shared.Modal title="Import leads from CSV" width={760} onClose={importing ? null : onClose}>
      {!file && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: 36, textAlign: "center", border: "1px dashed var(--border-subtle)",
            borderRadius: 8, background: "var(--bg-raised)", cursor: "pointer",
          }}>
          <Icons.ArrowUp size={20} style={{ color: "var(--text-tertiary)", marginBottom: 8 }}/>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Drop a CSV file or click to browse</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
            First row must be the header. We'll auto-detect <code>name</code>, <code>phone</code>, <code>email</code>, <code>age</code>, <code>state</code>, <code>product</code>, <code>source</code>, <code>ap</code>, <code>stage</code>.
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0])}/>
        </div>
      )}

      {file && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
            <Icons.FileText size={12} style={{ color: "var(--text-tertiary)" }}/>
            <span style={{ flex: 1, fontWeight: 500 }}>{file.name}</span>
            <span style={{ color: "var(--text-tertiary)" }}>{rows.length} rows · {headers.length} columns</span>
            <button className="btn btn-ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }} onClick={() => { setFile(null); setRows([]); setHeaders([]); }}>Choose another</button>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Column mapping</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {CSV_FIELDS.map(f => (
              <div key={f.k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 70, fontSize: 11.5, color: "var(--text-secondary)" }}>{f.l}</span>
                <Shared.Select
                  value={mapping[f.k] != null ? String(mapping[f.k]) : SKIP_VALUE}
                  onChange={(v) => setMapping(m => ({ ...m, [f.k]: v === SKIP_VALUE ? undefined : Number(v) }))}
                  options={[
                    { v: SKIP_VALUE, l: "— skip —" },
                    ...headers.map((h, i) => ({ v: String(i), l: h || `(col ${i + 1})` })),
                  ]}/>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <Shared.Field label="Default source (when CSV has none)">
              <input className="text-input" value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}/>
            </Shared.Field>
            <Shared.Field label="Assign all to">
              <Shared.Select value={defaultOwner} onChange={setDefaultOwner} options={reps.map(r => ({ v: r.id, l: r.name }))}/>
            </Shared.Field>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Preview ({previewRows.length} of {rows.length})</div>
          <div style={{ overflow: "auto", maxHeight: 180, border: "1px solid var(--border-subtle)", borderRadius: 5, marginBottom: 14 }}>
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-raised)" }}>
                  {headers.map((h, i) => <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 500, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => <td key={j} style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importing && (
            <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                <span>Importing… {progress.done} / {progress.total}</span>
                {progress.errors > 0 && <span style={{ color: "var(--state-warning)" }}>{progress.errors} skipped</span>}
              </div>
              <div style={{ height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: ((progress.done + progress.errors) / progress.total) * 100 + "%", height: "100%", background: "var(--accent-money)" }}/>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!rows.length || importing || mapping.name == null} onClick={importNow}>
              {importing ? `Importing…` : `Import ${rows.length} leads`}
            </button>
            <button className="btn btn-ghost" disabled={importing} onClick={onClose}>Cancel</button>
            {mapping.name == null && <span style={{ alignSelf: "center", fontSize: 11, color: "var(--state-warning)" }}>Map a Name column to continue</span>}
          </div>
        </div>
      )}
    </Shared.Modal>
  );
}

// ═══ Add lead modal ═══════════════════════════════════════════════════════
function AddLeadModal({ reps, sourceNames, role, onClose, onSave }) {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isRep = role === "rep";
  const myRepId = meIdent?.rep_id || null;
  const defaultOwner = isRep && myRepId
    ? myRepId
    : (reps[0]?.id || myRepId || "");
  const [form, setForm] = React.useState({
    name: "", phone: "", age: "", state: "", product: "Med Supp Plan G",
    source: sourceNames[0] || "Manual entry", owner: defaultOwner,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim().length > 0;
  const ownerLockedToSelf = isRep;
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
        {ownerLockedToSelf ? (
          <Shared.Field label="Assigned to">
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "8px 10px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
              You ({meIdent?.full_name || meIdent?.handle || "current user"}) — reps can only add leads to their own book.
            </div>
          </Shared.Field>
        ) : (
          <Shared.Field label="Assign to">
            {reps.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 0", lineHeight: 1.5 }}>
                No teammates yet — invite a producer first under Settings → Team. The lead will be assigned to you when you add the first one.
              </div>
            ) : (
              <Shared.Select value={form.owner} onChange={(v) => set("owner", v)} options={reps.map(r => ({ v: r.id, l: r.name }))}/>
            )}
          </Shared.Field>
        )}
        <div/>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid || (reps.length > 0 && !form.owner)} onClick={() => onSave(form)}>
          <Icons.Plus size={11}/> Add lead
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Shared.Modal>
  );
}

// ═══ Inbox ════════════════════════════════════════════════════════════════
function InboxSection({ leads, reps, sources, sourceNames, stageFilter, setStage, sourceFilter, setSF, ownerFilter, setOF, q, setQ, reassign, setStageOf, setSourceOf, setActiveLead }) {
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
              <div onClick={(e) => e.stopPropagation()}>
                <Shared.Select
                  value={l.source || ""}
                  onChange={(v) => setSourceOf && setSourceOf(l.id, v)}
                  options={[
                    { v: "",  l: "— source —" },
                    ...sourceNames.map(n => ({ v: n, l: n })),
                  ]}
                />
              </div>
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
                  <button
                    className="btn btn-ghost"
                    style={{ height: 22, padding: "0 6px", fontSize: 10.5 }}
                    onClick={() => {
                      try { sessionStorage.setItem("repflow.settings.tab", "integrations"); } catch {}
                      if (window.gotoPage) window.gotoPage("settings");
                    }}
                  >Configure</button>
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
function LeadDetailModal({ lead, reps, sourceNames = [], onClose, reassign, setStageOf, setSourceOf }) {
  const owner = reps.find(r => r.id === lead.owner);
  return (
    <Shared.Modal title={lead.lead} width={620} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Age">{lead.age}</Field>
        <Field label="State">{lead.state}</Field>
        <Field label="Product">{lead.product}</Field>
        <Field label="AP">{lead.ap ? fmtMoney(lead.ap) : "—"}</Field>
        <Field label="Days in pipeline">{lead.days}</Field>
        <Field label="Last touch">{lead.last}</Field>
        <Field label="Next">{lead.next}</Field>
      </div>

      <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Shared.Field label="Source">
          <Shared.Select
            value={lead.source || ""}
            onChange={(v) => setSourceOf && setSourceOf(lead.id, v)}
            options={[
              { v: "", l: "— source —" },
              ...sourceNames.map(n => ({ v: n, l: n })),
            ]}
          />
        </Shared.Field>
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
