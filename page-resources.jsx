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
  { id: "lh",      cat: "Lead vendor",    label: "Lead Heroes — buy T65/MAPD", url: "https://leadheroes.com/" },
  { id: "ah",      cat: "Lead vendor",    label: "Avail Hero — Med Supp leads", url: "https://www.availhero.com/" },
  { id: "tlw",     cat: "Lead vendor",    label: "TLW — Final Expense direct mail", url: "https://www.tlwagent.com/" },
  { id: "ip",      cat: "Lead vendor",    label: "Integrity Producer — exclusive transfers", url: "https://www.integrity.com/" },
  { id: "ahip",    cat: "Compliance",     label: "AHIP certification",         url: "https://www.ahipmedicaretraining.com/" },
  { id: "naic",    cat: "Compliance",     label: "NAIC producer lookup",       url: "https://nipr.com/help/look-up-your-nipr-number" },
  { id: "cms",     cat: "Compliance",     label: "CMS marketing guidelines",   url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing" },
  { id: "tpmo",    cat: "Compliance",     label: "TPMO disclaimer (canonical)", url: "https://www.cms.gov/files/document/tpmo-disclaimer.pdf" },
];

const CATEGORIES = ["Carrier portal", "Lead vendor", "Compliance", "Training", "Internal"];

// ─── Lead vendor seed (mirrors page-attribution VENDORS so spend tracking
//     stays consistent if a user jumps between pages). Only the fields we
//     need for the inline tracker are kept here. Buy URL is editable via
//     the Quick Links section above. */
const LEAD_VENDOR_SEED = [
  { id: "v1", name: "Facebook · T65 v3",      buyUrl: "https://business.facebook.com/", budget: 5000, spend: 4820, leads: 142, ap: 26840 },
  { id: "v2", name: "Facebook · FE 2026",     buyUrl: "https://business.facebook.com/", budget: 3500, spend: 3140, leads: 96,  ap: 12480 },
  { id: "v3", name: "Convoso · inbound",      buyUrl: "https://convoso.com/",            budget: 1500, spend: 1280, leads: 38,  ap: 28110 },
  { id: "v4", name: "DataMail · T65 list",    buyUrl: "https://datamail.com/",           budget: 2000, spend: 1840, leads: 184, ap:  9340 },
  { id: "v5", name: "Lead Heroes · MAPD",     buyUrl: "https://leadheroes.com/",         budget: 1200, spend:  720, leads:  42, ap:  6420 },
  { id: "v6", name: "Google · 'med supp'",    buyUrl: "https://ads.google.com/",         budget: 7000, spend: 6240, leads: 88,  ap: 24400 },
];

// ─── Scripts & document hub seed. Mirrors page-extras DEFAULT_SCRIPTS
//     for the call scripts; documents are first-class artifacts with URLs. */
const SCRIPT_SEED = [
  { id: "s-medg",    title: "Med Supp — Plan G open",     cat: "Open",       version: "v3.1", body: "Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate. Quick question — when you turn the page on next year's premium, are you most concerned about the monthly cost or the network freedom?" },
  { id: "s-fe",      title: "Final Expense — empathy",     cat: "Open",       version: "v2.4", body: "Most of my clients tell me the hardest part isn't paying for a policy, it's the thought of leaving the people they love with a bill on top of grief. Can I ask — if something happened tomorrow, who would you not want to leave that burden on?" },
  { id: "s-tpmo",    title: "TPMO disclosure (verbatim)", cat: "Compliance", version: "v1.0", body: "We do not offer every plan available in your area. Currently we represent {{n_orgs}} organizations which offer {{n_plans}} products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options." },
  { id: "s-annuity", title: "Annuity — fact-find",          cat: "Discovery",  version: "v1.7", body: "Before I quote anything, I need to understand your timeline. The money you're considering — is this for income within the next 5 years, or is it cushion for ten-plus years out?" },
  { id: "s-xsell",   title: "Cross-sell — FE → Med Supp",  cat: "Cross-sell", version: "v2.0", body: "Now that we've taken care of the final expense piece, the other coverage gap I usually see is on the medical side. With Plan G, your Medicare-approved costs after deductible would be zero. Want me to pull a quick rate?" },
  { id: "s-aep",     title: "AEP — switch reasons",         cat: "Open",       version: "v4.2", body: "Three reasons people switch during AEP: (1) the drug list changed, (2) their doctor dropped, (3) the premium jumped. Which of those is hitting you hardest this year?" },
];

const DOC_SEED = [
  { id: "d-soa",    title: "Scope of Appointment (SOA)",    cat: "Compliance", url: "https://www.cms.gov/files/document/scope-appointment-form.pdf" },
  { id: "d-tpmo",   title: "TPMO Disclaimer (CMS PDF)",      cat: "Compliance", url: "https://www.cms.gov/files/document/tpmo-disclaimer.pdf" },
  { id: "d-ahip",   title: "AHIP study guide",               cat: "Training",   url: "https://www.ahipmedicaretraining.com/" },
  { id: "d-rate",   title: "Rate sheet — Plan G by state",   cat: "Carrier",    url: "" },
  { id: "d-onb",    title: "Producer onboarding checklist",  cat: "Internal",   url: "" },
];

// localStorage helper used across sections for owner-editable lists
function useLocalArray(key, seed) {
  const [items, setItems] = React.useState(() => {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (_e) {}
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (_e) {}
  }, [items]);
  return [items, setItems];
}

const fmtMoney = (n) => "$" + Math.round(n || 0).toLocaleString();

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

  // ─── State: lead vendors + spend log ──────────────────────────────────
  const [vendors, setVendors] = useLocalArray("repflow:owner:leadVendors", LEAD_VENDOR_SEED);
  const [spendLog, setSpendLog] = useLocalArray("repflow:owner:leadSpendLog", []);
  const [logDraft, setLogDraft] = React.useState({ vendorId: "", amount: "", leads: "", note: "" });

  const totals = vendors.reduce(
    (a, v) => ({ budget: a.budget + (+v.budget || 0), spend: a.spend + (+v.spend || 0), leads: a.leads + (+v.leads || 0), ap: a.ap + (+v.ap || 0) }),
    { budget: 0, spend: 0, leads: 0, ap: 0 }
  );
  const blendedRoas = totals.spend ? totals.ap / totals.spend : 0;
  const blendedCpl  = totals.leads ? totals.spend / totals.leads : 0;

  const logSpend = () => {
    const v = vendors.find(x => x.id === logDraft.vendorId);
    const amt = +logDraft.amount, n = +logDraft.leads;
    if (!v || !amt || amt <= 0) return;
    setVendors(vs => vs.map(x => x.id === v.id
      ? { ...x, spend: (+x.spend || 0) + amt, leads: (+x.leads || 0) + (n || 0) }
      : x));
    setSpendLog(ls => [{ id: "ls-" + Date.now(), ts: new Date().toISOString(), vendorId: v.id, vendorName: v.name, amount: amt, leads: n || 0, note: logDraft.note.trim() }, ...ls].slice(0, 50));
    setLogDraft({ vendorId: "", amount: "", leads: "", note: "" });
    window.toast && window.toast(`Logged ${fmtMoney(amt)} on ${v.name}`, "success");
  };

  // ─── State: scripts + docs hub ────────────────────────────────────────
  const [scripts] = useLocalArray("repflow:scripts", SCRIPT_SEED);
  const [docs, setDocs] = useLocalArray("repflow:owner:docs", DOC_SEED);
  const [docDraft, setDocDraft] = React.useState({ title: "", cat: "Internal", url: "" });
  const [docAdd, setDocAdd] = React.useState(false);
  const [scriptOpen, setScriptOpen] = React.useState(null);
  const [scriptQ, setScriptQ] = React.useState("");
  const filteredScripts = scripts.filter(s => !scriptQ || s.title.toLowerCase().includes(scriptQ.toLowerCase()) || s.body.toLowerCase().includes(scriptQ.toLowerCase()));

  const copyScript = (s) => {
    try { navigator.clipboard.writeText(s.body); window.toast && window.toast("Script copied", "success"); }
    catch (_e) { window.toast && window.toast("Copy failed", "danger"); }
  };
  const addDoc = () => {
    const title = docDraft.title.trim(), url = docDraft.url.trim();
    if (!title) return;
    const safeUrl = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : "";
    setDocs(ds => [...ds, { id: "doc-" + Date.now(), title, cat: docDraft.cat, url: safeUrl }]);
    setDocDraft({ title: "", cat: "Internal", url: "" });
    setDocAdd(false);
    window.toast && window.toast("Document added", "success");
  };
  const removeDoc = (id) => setDocs(ds => ds.filter(d => d.id !== id));

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

      {/* ─── Lead vendors — buy + spend tracker (same tab) ─────────────── */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.Wallet size={13}/>
          <h3>Lead vendors · spend tracker</h3>
          <span className="meta">
            {vendors.length} vendors · MTD {fmtMoney(totals.spend)} / {fmtMoney(totals.budget)} · {totals.leads} leads · CPL {fmtMoney(blendedCpl)} · ROAS {blendedRoas.toFixed(2)}x
          </span>
        </div>

        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "120px 110px 100px 100px 1fr auto", gap: 8, alignItems: "end", borderBottom: "1px solid var(--border-subtle)" }}>
          <Shared.Field label="Vendor">
            <Shared.Select value={logDraft.vendorId} onChange={(v) => setLogDraft({ ...logDraft, vendorId: v })}
              options={[{ v: "", l: "Choose…" }, ...vendors.map(v => ({ v: v.id, l: v.name }))]}/>
          </Shared.Field>
          <Shared.Field label="Amount $">
            <input className="text-input" type="number" value={logDraft.amount} onChange={(e) => setLogDraft({ ...logDraft, amount: e.target.value })} placeholder="250"/>
          </Shared.Field>
          <Shared.Field label="Leads">
            <input className="text-input" type="number" value={logDraft.leads} onChange={(e) => setLogDraft({ ...logDraft, leads: e.target.value })} placeholder="8"/>
          </Shared.Field>
          <Shared.Field label="Note">
            <input className="text-input" value={logDraft.note} onChange={(e) => setLogDraft({ ...logDraft, note: e.target.value })} placeholder="creative v3"/>
          </Shared.Field>
          <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>
            Logs spend against vendor totals + appends to the audit trail below. Stays on this tab.
          </div>
          <button className="btn btn-primary" onClick={logSpend} style={{ height: 32 }}>
            <Icons.Plus size={12}/> Log spend
          </button>
        </div>

        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 100px 70px 80px 80px 70px 70px" }}>
            <div>Vendor</div>
            <div className="tabular" style={{ textAlign: "right" }}>Budget</div>
            <div className="tabular" style={{ textAlign: "right" }}>Spend</div>
            <div className="tabular" style={{ textAlign: "right" }}>Leads</div>
            <div className="tabular" style={{ textAlign: "right" }}>CPL</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
            <div style={{ textAlign: "right" }}>Buy</div>
          </div>
          {vendors.map(v => {
            const cpl = v.leads ? v.spend / v.leads : 0;
            const roas = v.spend ? v.ap / v.spend : 0;
            const pct = v.budget ? Math.min(100, (v.spend / v.budget) * 100) : 0;
            const overBudget = v.budget && v.spend > v.budget;
            return (
              <div key={v.id} className="row" style={{ gridTemplateColumns: "1.6fr 90px 100px 70px 80px 80px 70px 70px", height: 38 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }} className="cell-truncate">{v.name}</span>
                  <div style={{ flex: "0 0 60px", height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: overBudget ? "var(--state-danger)" : "var(--accent-money)" }}/>
                  </div>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(v.budget)}</div>
                <div className="tabular" style={{ textAlign: "right", color: overBudget ? "var(--state-danger)" : "var(--text-primary)", fontWeight: 500 }}>{fmtMoney(v.spend)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{v.leads}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(cpl)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(v.ap)}</div>
                <div className="tabular" style={{ textAlign: "right", color: roas >= 3 ? "var(--accent-money)" : roas >= 1.5 ? "var(--state-warning)" : "var(--state-danger)", fontWeight: 500 }}>{roas.toFixed(2)}x</div>
                <div style={{ textAlign: "right" }}>
                  {v.buyUrl ? (
                    <a href={v.buyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ height: 26, padding: "0 8px", fontSize: 11 }}>
                      <Icons.ArrowUpRight size={11}/> Buy
                    </a>
                  ) : <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {spendLog.length > 0 && (
          <div style={{ padding: "10px 14px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Recent spend ({spendLog.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {spendLog.slice(0, 6).map(e => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 60px 1fr", gap: 8, padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 5, fontSize: 11.5 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{new Date(e.ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span style={{ fontWeight: 500 }}>{e.vendorName}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{fmtMoney(e.amount)}</span>
                  <span className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{e.leads || "—"}L</span>
                  <span style={{ color: "var(--text-tertiary)" }} className="cell-truncate">{e.note || ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Scripts + document hub ─────────────────────────────────────── */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <Icons.FileText size={13}/>
          <h3>Scripts &amp; documents</h3>
          <span className="meta">{scripts.length} scripts · {docs.length} docs</span>
          <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search scripts…" value={scriptQ} onChange={(e) => setScriptQ(e.target.value)}/>
        </div>

        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          {/* SCRIPTS */}
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Call scripts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredScripts.map(s => {
                const open = scriptOpen === s.id;
                const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
                return (
                  <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }} onClick={() => setScriptOpen(open ? null : s.id)}>
                      <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                      <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                      <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version}</span>
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copyScript(s); }} title="Copy">
                        <Icons.Copy size={11}/>
                      </button>
                    </div>
                    {open && (
                      <div style={{ padding: "10px 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {s.body}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredScripts.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No scripts match.</div>
              )}
            </div>
          </div>

          {/* DOCS */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Document hub</div>
              <button className="btn btn-ghost" style={{ marginLeft: "auto", height: 24, padding: "0 8px", fontSize: 11 }} onClick={() => setDocAdd(a => !a)}>
                <Icons.Plus size={11}/> Add doc
              </button>
            </div>

            {docAdd && (
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 100px", gap: 6 }}>
                <input className="text-input" placeholder="Title" value={docDraft.title} onChange={(e) => setDocDraft({ ...docDraft, title: e.target.value })} autoFocus/>
                <Shared.Select value={docDraft.cat} onChange={(v) => setDocDraft({ ...docDraft, cat: v })}
                  options={["Compliance", "Carrier", "Training", "Internal"].map(c => ({ v: c, l: c }))}/>
                <input className="text-input" style={{ gridColumn: "1 / -1" }} placeholder="URL or upload path (optional)" value={docDraft.url} onChange={(e) => setDocDraft({ ...docDraft, url: e.target.value })}/>
                <button className="btn btn-primary" style={{ gridColumn: "1 / -1", height: 28 }} onClick={addDoc}>Save document</button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                  <Icons.FileText size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)", textDecoration: "none", fontSize: 12, fontWeight: 500 }} className="cell-truncate">{d.title}</a>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)" }} className="cell-truncate">{d.title} <span style={{ fontSize: 10 }}>(no URL)</span></span>
                    )}
                  </div>
                  <span className="chip" style={{ fontSize: 9.5 }}>{d.cat}</span>
                  <button className="icon-btn" onClick={() => removeDoc(d.id)} title="Remove" style={{ color: "var(--state-danger)" }}>
                    <Icons.X size={11}/>
                  </button>
                </div>
              ))}
              {docs.length === 0 && !docAdd && (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No documents yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageResources = PageResources;

})();
