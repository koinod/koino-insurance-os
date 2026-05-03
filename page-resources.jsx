/* page-resources.jsx — Owner: tools + carrier directory + editable quick links.
   Combines what used to be Scrubbers + Carriers + a brand-new editable
   link-locker so the agency owner has one place for portals, AHIP, NAIC,
   training URLs, partner agreements, etc.

   Three sections:
     1. Pre-call scrub tool (DNC / age / license / appointment)
     2. Carrier directory (compact list — drill into Compliance Vault for
        retention, into Performance for downstream metrics)
     3. Quick links — owner-editable, persisted to localStorage. Categorized. */

(function () {

const DEFAULT_LINKS = [
  { id: "uhc",     cat: "Carrier portal", label: "UHC Producer Portal",       url: "https://www.uhcjarvis.com/" },
  { id: "humana",  cat: "Carrier portal", label: "Humana Vantage",             url: "https://vantage.humana.com/" },
  { id: "aetna",   cat: "Carrier portal", label: "Aetna SRC Producer World",   url: "https://www.aetnaseniorproducts.com/" },
  { id: "moo",     cat: "Carrier portal", label: "Mutual of Omaha Sales Pro",  url: "https://salesprofessionalaccess.mutualofomaha.com/" },
  { id: "ahip",    cat: "Compliance",     label: "AHIP certification",         url: "https://www.ahipmedicaretraining.com/" },
  { id: "naic",    cat: "Compliance",     label: "NAIC producer lookup",       url: "https://nipr.com/help/look-up-your-nipr-number" },
  { id: "cms",     cat: "Compliance",     label: "CMS marketing guidelines",   url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing" },
  { id: "tpmo",    cat: "Compliance",     label: "TPMO disclaimer (canonical)", url: "https://www.cms.gov/files/document/tpmo-disclaimer.pdf" },
];

const CATEGORIES = ["Carrier portal", "Compliance", "Training", "Internal"];

// ─── Carrier directory data (mirrors page-ops-depth, condensed) ─────────
const CARRIERS = [
  { id: "uhc",    name: "UnitedHealthcare", appt: 28, advances: true,  cycle: "weekly",  nigo: 1.2, persistency: 92 },
  { id: "humana", name: "Humana",            appt: 24, advances: true,  cycle: "weekly",  nigo: 0.9, persistency: 94 },
  { id: "aetna",  name: "Aetna SRC",         appt: 22, advances: true,  cycle: "weekly",  nigo: 2.4, persistency: 88 },
  { id: "moo",    name: "Mutual of Omaha",   appt: 22, advances: true,  cycle: "daily",   nigo: 1.8, persistency: 78 },
  { id: "fg",     name: "F&G Annuities",     appt: 14, advances: false, cycle: "monthly", nigo: 0.4, persistency: 96 },
];

function PageResources() {
  // ─── State: scrub tool ────────────────────────────────────────────────
  const [phone, setPhone]     = React.useState("");
  const [age, setAge]         = React.useState("");
  const [zip, setZip]         = React.useState("");
  const [results, setResults] = React.useState([]);

  const runScrub = () => {
    const r = [];
    const dnc      = phone && phone.endsWith("99");
    const ageOk    = +age >= 18 && +age <= 110;
    const t65       = +age >= 64 && +age <= 65;
    const stateOk  = zip && zip.length === 5;
    if (phone) r.push({ k: "DNC",          ok: !dnc,    msg: dnc ? "On Do-Not-Call list — DO NOT DIAL" : "Clear of state + federal DNC" });
    if (phone) r.push({ k: "Litigator",    ok: true,    msg: "No known TCPA litigator history" });
    if (age)    r.push({ k: "Age",          ok: ageOk,   msg: ageOk ? `Age ${age} valid for senior products${t65 ? " (T65)" : ""}` : "Age out of range" });
    if (zip)    r.push({ k: "License",      ok: stateOk, msg: stateOk ? "Producer Marcus Avila licensed in this zip" : "Invalid zip" });
    if (zip)    r.push({ k: "Carrier appt", ok: stateOk, msg: stateOk ? "UHC, Humana, Aetna SRC appointed for this state" : "Cannot verify state" });
    setResults(r);
  };

  // ─── State: editable quick links (persisted to localStorage) ──────────
  const [links, setLinks] = React.useState(() => {
    try {
      const raw = localStorage.getItem("repflow:owner:links");
      if (raw) return JSON.parse(raw);
    } catch (_e) {}
    return DEFAULT_LINKS;
  });
  React.useEffect(() => {
    try { localStorage.setItem("repflow:owner:links", JSON.stringify(links)); } catch (_e) {}
  }, [links]);

  const [editId, setEditId]   = React.useState(null);
  const [draft, setDraft]     = React.useState({ cat: "Carrier portal", label: "", url: "" });
  const [adding, setAdding]   = React.useState(false);

  const startAdd  = () => { setDraft({ cat: "Carrier portal", label: "", url: "" }); setAdding(true); setEditId(null); };
  const startEdit = (l) => { setDraft({ cat: l.cat, label: l.label, url: l.url }); setEditId(l.id); setAdding(false); };
  const cancel    = () => { setEditId(null); setAdding(false); };
  const save      = () => {
    const label = draft.label.trim(), url = draft.url.trim();
    if (!label || !url) return;
    const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (adding) {
      setLinks(ls => [...ls, { id: "lk-" + Date.now(), cat: draft.cat, label, url: safeUrl }]);
    } else if (editId) {
      setLinks(ls => ls.map(l => l.id === editId ? { ...l, cat: draft.cat, label, url: safeUrl } : l));
    }
    cancel();
    window.toast && window.toast(adding ? "Link added" : "Link updated", "success");
  };
  const remove = (id) => {
    setLinks(ls => ls.filter(l => l.id !== id));
    window.toast && window.toast("Link removed", "info");
  };

  const grouped = CATEGORIES.map(c => ({ cat: c, items: links.filter(l => l.cat === c) })).filter(g => g.items.length > 0 || (adding && draft.cat === g.cat));

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Resources</div>
          <div className="page-sub">Pre-call scrubber · carrier directory · editable quick links</div>
        </div>
      </div>

      {/* ─── Top row: scrub tool + carrier directory ────────────────── */}
      <div className="resources-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        {/* SCRUB TOOL */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Shield size={13}/>
            <h3>Pre-call scrub</h3>
            {results.length > 0 && (
              <span className={`chip ${results.every(r => r.ok) ? "chip-money" : "chip-danger"}`} style={{ marginLeft: "auto" }}>
                {results.every(r => r.ok) ? "All clear" : "Action needed"}
              </span>
            )}
          </div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <Shared.Field label="Phone (E.164)"><input className="text-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15125550199"/></Shared.Field>
            <Shared.Field label="Age"><input className="text-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="65"/></Shared.Field>
            <Shared.Field label="Zip"><input className="text-input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="78704"/></Shared.Field>
            <button className="btn btn-primary" onClick={runScrub} style={{ height: 32 }}>Run</button>
          </div>
          {results.length > 0 && (
            <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                  <span className={`dot dot-${r.ok ? "live" : "danger"}`}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{r.k}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.msg}</div>
                  </div>
                  <span className={`chip ${r.ok ? "chip-money" : "chip-danger"}`}>{r.ok ? "PASS" : "FAIL"}</span>
                </div>
              ))}
            </div>
          )}
          {results.length === 0 && (
            <div style={{ padding: "0 14px 14px", color: "var(--text-tertiary)", fontSize: 11.5 }}>
              Validates DNC · litigator · age range · producer license · carrier appointment in real time. Auto-scrub gates dialing on Med Supp + FE.
            </div>
          )}
        </div>

        {/* CARRIER DIRECTORY */}
        <div className="panel">
          <div className="panel-h">
            <Icons.Folder size={13}/>
            <h3>Appointed carriers</h3>
            <span className="meta">{CARRIERS.length} · {CARRIERS.reduce((a, c) => a + c.appt, 0)} appts</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 80px 70px 70px" }}>
              <div>Carrier</div>
              <div className="tabular" style={{ textAlign: "right" }}>Appts</div>
              <div>Cycle</div>
              <div className="tabular" style={{ textAlign: "right" }}>NIGO</div>
              <div className="tabular" style={{ textAlign: "right" }}>Persist.</div>
            </div>
            {CARRIERS.map(c => (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 80px 70px 70px", height: 38 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className={`chip ${c.advances ? "chip-money" : ""}`} style={{ fontSize: 9.5 }}>{c.advances ? "advance" : "as-earned"}</span>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.appt}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.cycle}</div>
                <div className="tabular" style={{ textAlign: "right", color: c.nigo > 2 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{c.nigo}%</div>
                <div className="tabular" style={{ textAlign: "right", color: c.persistency >= 90 ? "var(--accent-money)" : c.persistency >= 80 ? "var(--state-warning)" : "var(--state-danger)", fontWeight: 500 }}>{c.persistency}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Quick links — editable ─────────────────────────────────── */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.Bookmark size={13}/>
          <h3>Quick links</h3>
          <span className="meta">{links.length} · saved locally per browser</span>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={startAdd}>
            <Icons.Plus size={12}/> Add link
          </button>
        </div>

        <div style={{ padding: 14 }}>
          {(adding || editId) && (
            <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 12, display: "grid", gridTemplateColumns: "150px 1fr 2fr auto auto", gap: 8, alignItems: "end" }}>
              <Shared.Field label="Category">
                <Shared.Select value={draft.cat} onChange={(v) => setDraft({ ...draft, cat: v })} options={CATEGORIES.map(c => ({ v: c, l: c }))}/>
              </Shared.Field>
              <Shared.Field label="Label">
                <input className="text-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="UHC Producer Portal" autoFocus/>
              </Shared.Field>
              <Shared.Field label="URL">
                <input className="text-input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://..."/>
              </Shared.Field>
              <button className="btn btn-primary" onClick={save} style={{ height: 32 }}>{adding ? "Add" : "Save"}</button>
              <button className="btn btn-ghost" onClick={cancel} style={{ height: 32 }}>Cancel</button>
            </div>
          )}

          {grouped.map(g => (
            <div key={g.cat} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{g.cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
                {g.items.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: "var(--text-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icons.ArrowUpRight size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
                      <span className="cell-truncate" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
                    </a>
                    <button className="icon-btn" onClick={() => startEdit(l)} title="Edit"><Icons.Edit size={11}/></button>
                    <button className="icon-btn" onClick={() => remove(l.id)} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {links.length === 0 && !adding && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No links yet. Click <strong style={{ color: "var(--text-secondary)" }}>Add link</strong> to start a portal locker.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.PageResources = PageResources;

})();
