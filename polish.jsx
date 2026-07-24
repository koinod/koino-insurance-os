/* polish.jsx — Toasts, Skeletons, EmptyState, OnboardingTour, CSV import,
   CSV/PDF export. All exposed as window.* and consumed by the app. */

(function () {

/* ──────────────────────────────────────────────────────────────────────────
   1. Toast system — window.toast(msg, kind?)
   ────────────────────────────────────────────────────────────────────────── */
let toastSeed = 0;
const toastListeners = new Set();
const activeToasts = [];

window.toast = function (msg, kind = "info") {
  const id = ++toastSeed;
  const t = { id, msg, kind, ts: Date.now() };
  activeToasts.push(t);
  toastListeners.forEach(fn => fn());
  setTimeout(() => {
    const idx = activeToasts.findIndex(x => x.id === id);
    if (idx >= 0) { activeToasts.splice(idx, 1); toastListeners.forEach(fn => fn()); }
  }, kind === "error" ? 6000 : 3500);
};

function ToastHost() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, []);
  return (
    <div className="toast-host">
      {activeToasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === "success" && <Icons.Check size={13}/>}
          {t.kind === "error"   && <Icons.X size={13}/>}
          {t.kind === "info"    && <Icons.Sparkles size={13}/>}
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button className="icon-btn" onClick={() => { const i = activeToasts.findIndex(x => x.id === t.id); if (i >= 0) { activeToasts.splice(i, 1); toastListeners.forEach(fn => fn()); } }}><Icons.X size={11}/></button>
        </div>
      ))}
    </div>
  );
}
window.ToastHost = ToastHost;

/* ──────────────────────────────────────────────────────────────────────────
   2. Skeleton — used while live data is loading
   ────────────────────────────────────────────────────────────────────────── */
window.Skeleton = function ({ rows = 6, cols = 5 }) {
  return (
    <div className="panel">
      <div className="panel-h"><div className="skel skel-line" style={{ width: 120, height: 12 }}></div></div>
      <div className="list">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((_, c) => <div key={c} className="skel skel-line" style={{ height: 11, width: `${60 + (r + c) % 30}%` }}></div>)}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   3. EmptyState — generic
   ────────────────────────────────────────────────────────────────────────── */
window.EmptyState = function ({ icon = "Sparkles", title, sub, action }) {
  const Ico = Icons[icon] || Icons.Sparkles;
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Ico size={20} style={{ color: "var(--accent-money)" }}/></div>
      <div className="empty-state-title">{title}</div>
      {sub && <div className="empty-state-sub">{sub}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   4. OnboardingTour — first-time floating coachmarks
   ────────────────────────────────────────────────────────────────────────── */
const TOUR_STEPS = [
  { title: "Welcome to Repflow", body: "This is your operator-grade workspace for life & health distribution. 30 seconds to get oriented?" },
  { title: "Switch roles in the sidebar",   body: "Top-left toggle flips you between Rep, Manager, and Owner views. Each role sees only what's relevant." },
  { title: "Press ⌘K anywhere",              body: "The command palette navigates between every page and runs key actions. Try it — type the page name." },
  { title: "Co-pilot rail (top-right ✦)",     body: "Toggle the AI rail. It sees your current page and answers operator-grade questions about your data." },
  { title: "📞 in the topbar",                 body: "Opens the producer mobile prototype — a clickable rep app for the field." },
  { title: "You're set",                       body: "Dive in. Press ? anytime for keyboard shortcuts, gear icon for Settings." },
];

function OnboardingTour() {
  const [step, setStep]   = React.useState(0);
  const [hidden, setHidden] = React.useState(() => localStorage.getItem("repflow.tour.done") === "1");

  if (hidden) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const finish = () => { localStorage.setItem("repflow.tour.done", "1"); setHidden(true); };

  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{step + 1} / {TOUR_STEPS.length}</span>
          <button className="btn btn-ghost" onClick={finish}>Skip tour</button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 6 }}>{s.title}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55 }}>{s.body}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          {!last && <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next →</button>}
          {last  && <button className="btn btn-primary" onClick={finish}><Icons.Check size={11}/> Got it</button>}
        </div>
      </div>
    </div>
  );
}
window.OnboardingTour = OnboardingTour;

/* ──────────────────────────────────────────────────────────────────────────
   5. CSV import — parse leads CSV into Pipeline
   ────────────────────────────────────────────────────────────────────────── */
/* RFC-4180-ish CSV parser — handles quoted fields, escaped quotes, CR/LF.
   Returns { headers: [...], rows: [{header: value, ...}, ...] }. */
function parseCsvText(input) {
  const text = String(input || "").replace(/^﻿/, "");  // strip BOM
  const out = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\r") { /* swallow — \r\n handled by \n branch */ }
      else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
      else { cell += ch; }
    }
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  // Drop trailing blank rows
  while (out.length && out[out.length - 1].every(v => !String(v).trim())) out.pop();
  if (out.length === 0) return { headers: [], rows: [] };
  const headers = out[0].map(h => String(h).trim());
  const rows = out.slice(1).map(arr => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (arr[i] !== undefined ? String(arr[i]) : "").trim(); });
    return o;
  });
  return { headers, rows };
}

/* Auto-map CSV header names to our pipeline fields. Fuzzy: lowercases,
   strips non-alnum, then matches against alias lists. */
const CSV_FIELD_ALIASES = {
  lead:   ["lead", "leadname", "name", "fullname", "contact", "client"],
  phone:  ["phone", "phonenumber", "mobile", "cell", "tel", "telephone", "number"],
  email:  ["email", "emailaddress", "mail"],
  age:    ["age", "yearsold"],
  state:  ["state", "stateabbrev", "stateabbreviation", "region"],
  product: ["product", "plan", "policy", "interest"],
  monthly: ["monthly", "monthlypremium", "monthlyamount", "monthlycontribution", "mocontribution", "desiredmocontribution", "desiredmonthlycontribution", "desiredmonthly", "contribution"],
  ap:     ["ap", "annualizedpremium", "premium", "annpremium"],
  source: ["source", "leadsource", "campaign", "vendor", "ad", "platform"],
  owner:  ["owner", "ownerrepid", "rep", "agent", "assignedto", "assignedrep"],
};
// Pull the first number out of a monthly-contribution cell — handles
// "$100-$250" (lower bound), "Minimum of $100", "$100 - $249", etc.
function parseMonthlyContribution(raw) {
  if (!raw) return 0;
  const nums = String(raw).match(/\d[\d,]*(?:\.\d+)?/g);
  if (!nums || !nums.length) return 0;
  return parseFloat(nums[0].replace(/,/g, "")) || 0;
}
function normHeader(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function autoMapHeaders(headers) {
  const map = {};  // field -> headerName | ""
  for (const field of Object.keys(CSV_FIELD_ALIASES)) {
    const aliases = CSV_FIELD_ALIASES[field].map(normHeader);
    const hit = headers.find(h => aliases.includes(normHeader(h)));
    map[field] = hit || "";
  }
  return map;
}
function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  if (digits.length >= 7) return "+" + digits;
  return "";
}

function CSVImport({ onClose, onImported, batchMeta = {} }) {
  const [text, setText]       = React.useState("");
  const [parsedHeaders, setParsedHeaders] = React.useState([]);
  const [parsedRows, setParsedRows]       = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  const [step, setStep]       = React.useState("paste"); // paste | map | preview | importing | done
  const [progress, setProgress] = React.useState({ done: 0, failed: 0, skipped: 0 });
  const [errors, setErrors]   = React.useState([]);
  const [dragOver, setDragOver] = React.useState(false);

  const REPS    = (typeof AppData !== "undefined" && AppData.REPS) || [];
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? REPS[0]?.id : null) || null;
  const agencyId = meIdent?.agency_id || null;

  // Lead-vendor attribution: tag every imported lead to the source that
  // produced it (agency_lead_sources). Carries through to deal-write so
  // per-vendor lead/contact/close rates + ROAS roll up on Attribution.
  const [vendorId, setVendorId] = React.useState(batchMeta.leadSourceId || "");
  const [vendors, setVendors]   = React.useState([]);
  React.useEffect(() => {
    if (!agencyId) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.from("agency_lead_sources").select("id,name,vendor").eq("agency_id", agencyId).eq("active", true).order("name")
      .then(({ data }) => setVendors(data || []), () => {});
  }, [agencyId]);

  const parseInput = (raw) => {
    const { headers, rows } = parseCsvText(raw);
    if (headers.length === 0 || rows.length === 0) {
      window.toast && window.toast("CSV needs a header row + at least one data row", "error");
      return;
    }
    setParsedHeaders(headers);
    setParsedRows(rows);
    setMapping(autoMapHeaders(headers));
    setStep("map");
  };
  const handleParseClick = () => parseInput(text);
  const handleFile = async (file) => {
    if (!file) return;
    const t = await file.text();
    setText(t);
    parseInput(t);
  };

  // Build mapped row objects from parsed CSV using current mapping
  const mappedRows = React.useMemo(() => {
    return parsedRows.map(raw => {
      const get = (field) => mapping[field] ? raw[mapping[field]] || "" : "";
      const phone = normalizePhone(get("phone"));
      const owner = get("owner")
        || (REPS.find(r => r.handle === get("owner") || r.id === get("owner") || r.name === get("owner"))?.id)
        || batchMeta.owner
        || myRepId;
      // AP preference: monthly × 12 when monthly column mapped, else AP column.
      const monthlyRaw = get("monthly");
      const ap = monthlyRaw
        ? parseMonthlyContribution(monthlyRaw) * 12
        : (parseFloat(String(get("ap")).replace(/[$,]/g, "")) || 0);
      return {
        lead:    get("lead"),
        phone,
        email:   get("email").toLowerCase(),
        age:     parseInt(get("age"), 10) || null,
        state:   (get("state") || "").toUpperCase().slice(0, 2),
        stage:   "New",
        product: get("product") || null,
        ap,
        source:  batchMeta.source || get("source") || "CSV import",
        lead_source_id: vendorId || null,
        import_batch_id: batchMeta.batchId || null,
        owner,
        consent: "verified",
        heat:    "fresh",
        days:    0,
        last:    "Imported",
        next:    "First dial",
      };
    });
  }, [parsedRows, mapping, myRepId, vendorId, batchMeta]);

  // Validation + dedup against existing pipeline (by phone)
  const validation = React.useMemo(() => {
    const existingPhones = new Set(((AppData.PIPELINE || []).map(p => normalizePhone(p.phone)).filter(Boolean)));
    const seen = new Set();
    return mappedRows.map((r, i) => {
      const issues = [];
      if (!r.lead) issues.push("missing name");
      if (r.phone && existingPhones.has(r.phone)) issues.push("duplicate phone");
      if (r.phone && seen.has(r.phone)) issues.push("duplicate in CSV");
      if (r.phone) seen.add(r.phone);
      return { row: r, idx: i, issues };
    });
  }, [mappedRows]);

  const importable = validation.filter(v => v.issues.length === 0 || v.issues.every(x => x === "duplicate phone" || x === "duplicate in CSV"));
  const skipped    = validation.filter(v => v.issues.includes("duplicate phone") || v.issues.includes("duplicate in CSV"));
  const blocked    = validation.filter(v => v.issues.includes("missing name"));

  const importNow = async () => {
    setStep("importing");
    setProgress({ done: 0, failed: 0, skipped: skipped.length });
    setErrors([]);
    const toImport = validation.filter(v => v.issues.length === 0).map(v => v.row);
    let done = 0, failed = 0;
    const errs = [];
    for (const row of toImport) {
      try {
        await AppData.mutate.pipelineInsert({
          ...row,
          // pipelineInsert assigns id internally on the AppData side; provide tmp for optimistic
          id: "tmp-csv-" + Date.now() + "-" + done,
        });
        done++;
      } catch (e) {
        failed++;
        errs.push({ name: row.lead, error: e?.message || "insert failed" });
      }
      setProgress({ done, failed, skipped: skipped.length });
    }
    setErrors(errs);
    setStep("done");
    window.toast && window.toast(`Imported ${done} of ${toImport.length} leads${failed ? ` · ${failed} failed` : ""}${skipped.length ? ` · ${skipped.length} skipped (dupes)` : ""}`, failed ? "warn" : "success");
    onImported && onImported({ imported: done, skipped: skipped.length, failed });
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <Shared.Modal title="Import leads from CSV" width={720} onClose={onClose} actions={
      step === "paste" ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleParseClick} disabled={!text.trim()}>Parse →</button>
        </>
      ) : step === "map" ? (
        <>
          <button className="btn btn-ghost" onClick={() => setStep("paste")}>← Back</button>
          <button className="btn btn-primary" onClick={() => setStep("preview")} disabled={!mapping.lead}>Preview →</button>
        </>
      ) : step === "preview" ? (
        <>
          <button className="btn btn-ghost" onClick={() => setStep("map")}>← Back</button>
          <button className="btn btn-primary" onClick={importNow} disabled={validation.filter(v => v.issues.length === 0).length === 0}>
            <Icons.Check size={11}/> Import {validation.filter(v => v.issues.length === 0).length}
          </button>
        </>
      ) : step === "done" ? (
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      ) : null
    }>
      {step === "paste" && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
            Drop a <span className="mono">.csv</span> file or paste below. We auto-detect column names — common formats from Convoso, GoHighLevel, Excel exports all work. Required columns: <strong>name + phone</strong>. Optional: email, age, state, product, AP, source, owner.
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              padding: 18, marginBottom: 10,
              border: `2px dashed ${dragOver ? "var(--accent-money)" : "var(--border-subtle)"}`,
              borderRadius: 8,
              background: dragOver ? "color-mix(in oklch, var(--accent-money) 8%, transparent)" : "var(--bg-raised)",
              textAlign: "center", fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer",
            }}
            onClick={() => document.getElementById("csv-file-input")?.click()}
          >
            <Icons.ArrowUpRight size={16} style={{ color: "var(--text-tertiary)", marginBottom: 6 }}/>
            <div>{dragOver ? "Drop the CSV here" : "Drop CSV here or click to choose"}</div>
            <input id="csv-file-input" type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}/>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center", marginBottom: 6 }}>— or paste text —</div>
          <textarea className="text-input" rows={8} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={`name,phone,email,age,state,product,ap,source\nJane Doe,+15125551234,jane@example.com,67,TX,Med Supp Plan G,1840,FB Lead Form\nJohn Smith,(305) 555-9821,,71,FL,Final Expense $15K,1320,Inbound call`}
            style={{ width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 11.5 }}/>
        </>
      )}

      {step === "map" && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>
            {parsedRows.length} row{parsedRows.length === 1 ? "" : "s"} parsed. Confirm column mapping — we auto-detected what we could.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
            {Object.keys(CSV_FIELD_ALIASES).map(field => {
              const required = field === "lead";
              return (
                <React.Fragment key={field}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right", paddingRight: 8 }}>
                    {field}{required && <span style={{ color: "var(--state-danger)" }}> *</span>}
                  </span>
                  <Shared.Select
                    value={mapping[field] || ""}
                    onChange={(v) => setMapping(m => ({ ...m, [field]: v }))}
                    options={[{ v: "", l: "(none)" }, ...parsedHeaders.map(h => ({ v: h, l: h }))]}
                  />
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center", marginTop: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right", paddingRight: 8 }}>lead vendor</span>
            <Shared.Select
              value={vendorId}
              onChange={(v) => setVendorId(v)}
              options={[{ v: "", l: vendors.length ? "— No vendor / unattributed —" : "— No vendors yet · add in Settings → Lead sources —" }, ...vendors.map(s => ({ v: s.id, l: s.name + (s.vendor ? ` · ${s.vendor}` : "") }))]}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
            Tag every lead in this file to its source vendor — powers per-vendor lead/contact/close rates and ROAS on Attribution. Leave blank if mixed or unknown.
          </div>
          {!mapping.lead && (
            <div style={{ padding: 8, fontSize: 11.5, color: "var(--state-warning)", background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", borderRadius: 6 }}>
              Map the <strong>lead</strong> column before continuing.
            </div>
          )}
          {mapping.lead && !mapping.phone && (
            <div style={{ padding: 8, fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 8 }}>
              No phone column mapped — leads will import without phone numbers and won't be dialable until enriched.
            </div>
          )}
        </>
      )}

      {step === "preview" && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: "var(--text-secondary)" }}>
            <strong>{validation.filter(v => v.issues.length === 0).length}</strong> ready to import
            {skipped.length > 0 && <span style={{ color: "var(--text-tertiary)" }}> · <strong>{skipped.length}</strong> skipped (duplicate phone)</span>}
            {blocked.length > 0 && <span style={{ color: "var(--state-danger)" }}> · <strong>{blocked.length}</strong> blocked (missing name)</span>}
          </div>
          <div className="list" style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
            <div className="list-h" style={{ gridTemplateColumns: "1.3fr 130px 1.2fr 50px 50px 1fr 100px" }}>
              <div>Name</div><div>Phone</div><div>Email</div><div>Age</div><div>St</div><div>Product</div><div>Status</div>
            </div>
            {validation.slice(0, 100).map((v, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.3fr 130px 1.2fr 50px 50px 1fr 100px" }}>
                <div className="cell-truncate" style={{ color: v.issues.includes("missing name") ? "var(--state-danger)" : undefined }}>{v.row.lead || <em>—</em>}</div>
                <div className="cell-truncate mono" style={{ fontSize: 11 }}>{v.row.phone || <span style={{ color: "var(--text-quaternary)" }}>—</span>}</div>
                <div className="cell-truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{v.row.email || "—"}</div>
                <div className="tabular">{v.row.age || "—"}</div>
                <div>{v.row.state || "—"}</div>
                <div className="cell-truncate" style={{ fontSize: 11.5 }}>{v.row.product || "—"}</div>
                <div>
                  {v.issues.length === 0
                    ? <span className="chip chip-money" style={{ fontSize: 10 }}>ready</span>
                    : v.issues.includes("missing name")
                      ? <span className="chip" style={{ fontSize: 10, color: "var(--state-danger)" }}>blocked</span>
                      : <span className="chip" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>dupe</span>}
                </div>
              </div>
            ))}
          </div>
          {validation.length > 100 && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>… {validation.length - 100} more rows not shown in preview</div>}
        </>
      )}

      {step === "importing" && (
        <div style={{ padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Importing… {progress.done} done · {progress.failed} failed</div>
          <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${(progress.done + progress.failed) / Math.max(1, validation.filter(v => v.issues.length === 0).length) * 100}%`, height: "100%", background: "var(--accent-money)", transition: "width 200ms" }}/>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Each lead is written through the standard pipelineInsert mutator — RLS, audit, realtime fan-out all fire.</div>
        </div>
      )}

      {step === "done" && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Icons.Check size={28} style={{ color: "var(--accent-money)" }}/>
          <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8 }}>Done.</div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--accent-money)" }}>{progress.done}</strong> imported{" · "}
            <strong style={{ color: progress.failed ? "var(--state-danger)" : "var(--text-tertiary)" }}>{progress.failed}</strong> failed{" · "}
            <strong style={{ color: "var(--text-tertiary)" }}>{progress.skipped}</strong> skipped (dupes)
          </div>
          {errors.length > 0 && (
            <div style={{ marginTop: 14, textAlign: "left", maxHeight: 140, overflowY: "auto", padding: 10, background: "color-mix(in oklch, var(--state-danger) 8%, transparent)", borderRadius: 6, fontSize: 11.5 }}>
              {errors.slice(0, 10).map((e, i) => (
                <div key={i}><strong>{e.name}</strong> — <span style={{ color: "var(--state-danger)" }}>{e.error}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </Shared.Modal>
  );
}
window.CSVImport = CSVImport;
window.parseCsvText = parseCsvText;

/* ──────────────────────────────────────────────────────────────────────────
   6. Export — CSV / Excel-flavored / PDF (HTML print)
   ────────────────────────────────────────────────────────────────────────── */
window.exportCSV = function (rows, filename = "export.csv") {
  if (!rows || !rows.length) { window.toast("Nothing to export", "error"); return; }
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes("\"") || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.toast(`Exported ${rows.length} rows`, "success");
};

window.exportPDF = function (title, html) {
  const w = window.open("", "_blank");
  if (!w) { window.toast("Pop-up blocked — allow pop-ups to export PDF", "error"); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; padding: 40px; max-width: 920px; margin: 0 auto; color: #14171c; }
      h1 { font-size: 22px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
      th { background: #f9fafb; font-weight: 600; }
      .meta { color: #6b7280; font-size: 11px; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
  window.toast("Print dialog opened — save as PDF", "info");
};

})();
