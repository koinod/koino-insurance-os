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
function CSVImport({ onClose }) {
  const [text, setText]   = React.useState("");
  const [parsed, setParsed] = React.useState([]);
  const [step, setStep]   = React.useState("paste"); // paste | preview | done

  const parseCSV = () => {
    const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { window.toast("CSV needs a header + at least one row", "error"); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
      const cells = line.split(",").map(c => c.trim());
      const o = {};
      headers.forEach((h, i) => o[h] = cells[i] || "");
      return o;
    });
    setParsed(rows);
    setStep("preview");
  };

  const importNow = async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (sb && AppData.LIVE) {
      // Push to Supabase
      const ok = await sb.from("pipeline").insert(parsed.map(r => ({
        lead_name: r.name || r.lead || r.lead_name,
        age: parseInt(r.age) || null,
        state: (r.state || "").toUpperCase(),
        stage: r.stage || "New",
        product: r.product || "Med Supp Plan G",
        ap_cents: Math.round(parseFloat(r.ap || 0) * 100),
        days_in_stage: 0,
        last_activity_text: "Imported",
        next_action: "First dial",
        source: r.source || "CSV import",
        owner_rep_id: r.owner || AppData.REPS[0].id,
        consent: "verified",
        heat: "fresh",
      })));
      if (ok.error) { window.toast("Import failed: " + ok.error.message, "error"); return; }
      window.toast(`Imported ${parsed.length} leads to Supabase`, "success");
      window.hydrateFromSupabase && window.hydrateFromSupabase();
    } else {
      // Demo mode: just append to in-memory
      AppData.PIPELINE = [...parsed.map((r, i) => ({
        id: 1000 + i,
        lead: r.name || r.lead || r.lead_name,
        age: parseInt(r.age) || 65,
        state: (r.state || "TX").toUpperCase(),
        stage: r.stage || "New",
        product: r.product || "Med Supp Plan G",
        ap: parseFloat(r.ap || 0),
        days: 0,
        last: "Imported",
        next: "First dial",
        source: r.source || "CSV import",
        owner: r.owner || AppData.REPS[0].id,
        consent: "verified",
        heat: "fresh",
      })), ...AppData.PIPELINE];
      window.dispatchEvent(new CustomEvent("data:hydrated"));
      window.toast(`Imported ${parsed.length} leads (demo mode)`, "success");
    }
    setStep("done");
    setTimeout(onClose, 600);
  };

  return (
    <Shared.Modal title="Import leads from CSV" width={620} onClose={onClose} actions={
      step === "paste" ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={parseCSV} disabled={!text.trim()}>Parse →</button>
        </>
      ) : step === "preview" ? (
        <>
          <button className="btn btn-ghost" onClick={() => setStep("paste")}>← Back</button>
          <button className="btn btn-primary" onClick={importNow}><Icons.Check size={11}/> Import {parsed.length}</button>
        </>
      ) : null
    }>
      {step === "paste" && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>
            Paste a CSV with columns: <span className="mono">name, age, state, product, ap, source, owner</span>. First row = headers.
          </div>
          <textarea className="text-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="name,age,state,product,ap,source,owner&#10;Cheryl Hampton,67,TX,Med Supp Plan G,1840,FB Lead Form,marc&#10;Robert Mendez,71,FL,Final Expense $15K,1320,Inbound call,dani" style={{ width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12 }}/>
        </>
      )}
      {step === "preview" && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>{parsed.length} rows ready to import</div>
          <div className="list" style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 50px 60px 1.2fr 80px 1fr" }}>
              <div>Name</div><div>Age</div><div>State</div><div>Product</div><div className="tabular" style={{ textAlign: "right" }}>AP</div><div>Source</div>
            </div>
            {parsed.slice(0, 50).map((r, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 50px 60px 1.2fr 80px 1fr" }}>
                <div>{r.name || r.lead || r.lead_name}</div>
                <div className="tabular">{r.age}</div>
                <div>{r.state}</div>
                <div className="cell-truncate">{r.product}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${parseFloat(r.ap || 0).toLocaleString()}</div>
                <div className="cell-truncate">{r.source}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {step === "done" && <div style={{ padding: 30, textAlign: "center", color: "var(--accent-money)" }}><Icons.Check size={20}/><div>Done.</div></div>}
    </Shared.Modal>
  );
}
window.CSVImport = CSVImport;

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
