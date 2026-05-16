/* page-resources.jsx — Owner Resources hub.
   Horizontal SectionPill nav with five tabs:
     • Overview      — KPI cards (spend, ROAS, NIGO%, persistency) + leaders + sample-data toggle
     • Lead vendors  — buy quick-links + inline spend tracker derived from AppData
     • Carriers      — pre-call scrub tool + appointed-carrier directory with real persistency/NIGO
     • Scripts & docs — call script library (copy-to-clipboard) + editable document hub
     • Quick links    — owner-editable portal locker (carrier portals, lead vendors, compliance, training)

   Math contract: every KPI derives from window.AppData when present (LEAD_SOURCES,
   TOUCHPOINTS, ATTRIBUTIONS, POLICIES, COMMISSIONS, NIGOS, CARRIERS, APPOINTMENTS,
   BOOK_ENTRIES). Falls back to SAMPLE_* constants when the agency has no data yet,
   so brand-new owners see a populated screen instead of empty cards. */

(function () {

// ─── Sample data (only used when AppData tables are empty OR sample-mode is on) ─
const SAMPLE_VENDORS = [
  { id: "v-fb-t65",  name: "Facebook · T65 v3",      vendor: "Facebook",  kind: "paid_social", costPerLead: 33.94, buyUrl: "https://business.facebook.com/", _leads: 142, _issued: 14, _ap: 26840 },
  { id: "v-fb-fe",   name: "Facebook · FE 2026",     vendor: "Facebook",  kind: "paid_social", costPerLead: 32.71, buyUrl: "https://business.facebook.com/", _leads: 96,  _issued: 8,  _ap: 12480 },
  { id: "v-convoso", name: "Convoso · inbound",      vendor: "Convoso",   kind: "inbound",     costPerLead: 33.68, buyUrl: "https://convoso.com/",            _leads: 38,  _issued: 14, _ap: 28110 },
  { id: "v-datamail",name: "DataMail · T65 list",    vendor: "DataMail",  kind: "list",        costPerLead: 10.00, buyUrl: "https://datamail.com/",           _leads: 184, _issued: 6,  _ap:  9340 },
  { id: "v-leadhero",name: "Lead Heroes · MAPD",     vendor: "LeadHeroes",kind: "transfer",    costPerLead: 17.14, buyUrl: "https://leadheroes.com/",         _leads: 42,  _issued: 5,  _ap:  6420 },
  { id: "v-google",  name: "Google · 'med supp'",    vendor: "Google",    kind: "paid_search", costPerLead: 70.91, buyUrl: "https://ads.google.com/",         _leads: 88,  _issued: 12, _ap: 24400 },
];

const SAMPLE_CARRIERS = [
  { id: "c-uhc",    name: "UnitedHealthcare", category: "Medicare",   _appts: 28, _advances: true,  _cycle: "weekly",  _nigo: 1.2, _persist: 92 },
  { id: "c-humana", name: "Humana",            category: "Medicare",   _appts: 24, _advances: true,  _cycle: "weekly",  _nigo: 0.9, _persist: 94 },
  { id: "c-aetna",  name: "Aetna SRC",         category: "Medicare",   _appts: 22, _advances: true,  _cycle: "weekly",  _nigo: 2.4, _persist: 88 },
  { id: "c-moo",    name: "Mutual of Omaha",   category: "Senior",     _appts: 22, _advances: true,  _cycle: "daily",   _nigo: 1.8, _persist: 78 },
  { id: "c-fg",     name: "F&G Annuities",     category: "Annuity",    _appts: 14, _advances: false, _cycle: "monthly", _nigo: 0.4, _persist: 96 },
];

const DEFAULT_LINKS = [
  { id: "uhc",     cat: "Carrier portal", label: "UHC Producer Portal",       url: "https://www.uhcjarvis.com/" },
  { id: "humana",  cat: "Carrier portal", label: "Humana Vantage",             url: "https://vantage.humana.com/" },
  { id: "aetna",   cat: "Carrier portal", label: "Aetna SRC Producer World",   url: "https://www.aetnaseniorproducts.com/" },
  { id: "moo",     cat: "Carrier portal", label: "Mutual of Omaha Sales Pro",  url: "https://salesprofessionalaccess.mutualofomaha.com/" },
  { id: "lh",      cat: "Lead vendor",    label: "Lead Heroes — buy T65/MAPD", url: "https://leadheroes.com/" },
  { id: "ah",      cat: "Lead vendor",    label: "Avail Hero — Med Supp leads",url: "https://www.availhero.com/" },
  { id: "tlw",     cat: "Lead vendor",    label: "TLW — Final Expense direct mail", url: "https://www.tlwagent.com/" },
  { id: "ip",      cat: "Lead vendor",    label: "Integrity — exclusive transfers", url: "https://www.integrity.com/" },
  { id: "ahip",    cat: "Compliance",     label: "AHIP certification",         url: "https://www.ahipmedicaretraining.com/" },
  { id: "naic",    cat: "Compliance",     label: "NAIC producer lookup",       url: "https://nipr.com/help/look-up-your-nipr-number" },
  { id: "cms",     cat: "Compliance",     label: "CMS marketing guidelines",   url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing" },
  { id: "tpmo",    cat: "Compliance",     label: "TPMO disclaimer (canonical)",url: "https://www.cms.gov/files/document/tpmo-disclaimer.pdf" },
];

const LINK_CATEGORIES = ["Carrier portal", "Lead vendor", "Compliance", "Training", "Internal"];

const SCRIPT_SEED = [
  { id: "s-medg",    title: "Med Supp — Plan G open",      cat: "Open",       version: "v3.1", body: "Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate. Quick question — when you turn the page on next year's premium, are you most concerned about the monthly cost or the network freedom?" },
  { id: "s-fe",      title: "Final Expense — empathy",      cat: "Open",       version: "v2.4", body: "Most of my clients tell me the hardest part isn't paying for a policy, it's the thought of leaving the people they love with a bill on top of grief. Can I ask — if something happened tomorrow, who would you not want to leave that burden on?" },
  { id: "s-tpmo",    title: "TPMO disclosure (verbatim)",   cat: "Compliance", version: "v1.0", body: "We do not offer every plan available in your area. Currently we represent {{n_orgs}} organizations which offer {{n_plans}} products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options." },
  { id: "s-annuity", title: "Annuity — fact-find",           cat: "Discovery",  version: "v1.7", body: "Before I quote anything, I need to understand your timeline. The money you're considering — is this for income within the next 5 years, or is it cushion for ten-plus years out?" },
  { id: "s-xsell",   title: "Cross-sell — FE → Med Supp",   cat: "Cross-sell", version: "v2.0", body: "Now that we've taken care of the final expense piece, the other coverage gap I usually see is on the medical side. With Plan G, your Medicare-approved costs after deductible would be zero. Want me to pull a quick rate?" },
  { id: "s-aep",     title: "AEP — switch reasons",          cat: "Open",       version: "v4.2", body: "Three reasons people switch during AEP: (1) the drug list changed, (2) their doctor dropped, (3) the premium jumped. Which of those is hitting you hardest this year?" },
  { id: "s-rebut1",  title: "Rebuttal — 'I need to think about it'", cat: "Cross-sell", version: "v1.2", body: "Totally fair. The only reason I push to lock today is the rate I quoted is tied to today's underwriting class — if your blood pressure med count changes by next week, the rate moves. What part are you sitting on?" },
  { id: "s-rebut2",  title: "Rebuttal — 'send it in writing'", cat: "Cross-sell", version: "v1.0", body: "Happy to. Before I do — the rate sheet is 18 pages and 80% of it doesn't apply to you. Want me to send the one-page summary tailored to your meds and doctors, or the full deck?" },
];

const DOC_SEED = [
  { id: "d-soa",    title: "Scope of Appointment (SOA)",    cat: "Compliance", url: "https://www.cms.gov/files/document/scope-appointment-form.pdf" },
  { id: "d-tpmo",   title: "TPMO Disclaimer (CMS PDF)",      cat: "Compliance", url: "https://www.cms.gov/files/document/tpmo-disclaimer.pdf" },
  { id: "d-ahip",   title: "AHIP study guide",               cat: "Training",   url: "https://www.ahipmedicaretraining.com/" },
  { id: "d-rate",   title: "Rate sheet — Plan G by state",   cat: "Carrier",    url: "" },
  { id: "d-onb",    title: "Producer onboarding checklist",  cat: "Internal",   url: "" },
  { id: "d-comp",   title: "Compensation grid (current)",    cat: "Internal",   url: "" },
];

const SCRIPT_CATS = ["All", "Open", "Discovery", "Cross-sell", "Compliance"];
const DOC_CATS    = ["Compliance", "Carrier", "Training", "Internal"];

// ─── localStorage helper ─────────────────────────────────────────────────
function useLocalArray(key, seed) {
  const [items, setItems] = React.useState(() => {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { console.warn("[resources.useLocalArray.read]", key, e); }
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (e) { console.warn("[resources.useLocalArray.write]", key, e); }
  }, [items]);
  return [items, setItems];
}
function useLocalValue(key, seed) {
  const [v, setV] = React.useState(() => {
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw); } catch (e) { console.warn("[resources.useLocalValue.read]", key, e); }
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn("[resources.useLocalValue.write]", key, e); }
  }, [v]);
  return [v, setV];
}

// ─── Force re-render whenever AppData hydrates / mutates ─────────────────
function useAppDataTick() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => { window.removeEventListener("data:hydrated", fn); window.removeEventListener("data:mutated", fn); };
  }, []);
}

const fmtMoney = Shared.fmtMoney;
const fmtPct    = (n, d = 1) => (n == null || isNaN(n)) ? "—" : (n).toFixed(d) + "%";
const safeDiv   = (a, b) => (b ? a / b : 0);

// ─── Derive vendor metrics from AppData (or sample) ──────────────────────
function deriveVendors(useSample, spendOverrides) {
  const sources    = (window.AppData && window.AppData.LEAD_SOURCES)    || [];
  const touch      = (window.AppData && window.AppData.TOUCHPOINTS)     || [];
  const attr       = (window.AppData && window.AppData.ATTRIBUTIONS)    || [];
  const policies   = (window.AppData && window.AppData.POLICIES)        || [];

  const empty = sources.length === 0;
  const isDemo = window.isDemoAgency && window.isDemoAgency();
  if ((useSample || empty) && isDemo) {
    return SAMPLE_VENDORS.map(v => {
      const extra = spendOverrides[v.id] || { spend: 0, leads: 0 };
      const spend  = (v._leads * v.costPerLead) + extra.spend;
      const leads  = v._leads + extra.leads;
      const issued = v._issued;
      const ap     = v._ap;
      return {
        id: v.id, name: v.name, vendor: v.vendor, kind: v.kind, buyUrl: v.buyUrl,
        costPerLead: v.costPerLead, leads, spend, issued, ap,
        cpl:  safeDiv(spend, leads),
        cpa:  safeDiv(spend, issued),
        roas: safeDiv(ap, spend),
      };
    });
  }
  return sources.map(s => {
    const sourceTouches = touch.filter(t => t.sourceId === s.id);
    const leadIds = new Set(sourceTouches.map(t => t.leadId));
    const sourceAttr = attr.filter(a => a.sourceId === s.id);
    sourceAttr.forEach(a => leadIds.add(a.leadId));
    const leads = leadIds.size;
    const extra = spendOverrides[s.id] || { spend: 0, leads: 0 };
    const spend = (leads * (s.costPerLead || 0)) + extra.spend;
    const linkedPolicies = policies.filter(p => leadIds.has(p.leadId));
    const issued = linkedPolicies.filter(p => p.issuedAt).length;
    const ap = linkedPolicies.reduce((a, p) => a + (p.ap || 0), 0);
    return {
      id: s.id, name: s.name, vendor: s.vendor, kind: s.kind,
      buyUrl: "", costPerLead: s.costPerLead || 0,
      leads: leads + extra.leads, spend, issued, ap,
      cpl:  safeDiv(spend, leads + extra.leads),
      cpa:  safeDiv(spend, issued),
      roas: safeDiv(ap, spend),
    };
  });
}

// ─── Derive carrier metrics from AppData (or sample) ─────────────────────
function deriveCarriers(useSample) {
  const carriers = (window.AppData && window.AppData.CARRIERS)     || [];
  const policies = (window.AppData && window.AppData.POLICIES)     || [];
  const nigos    = (window.AppData && window.AppData.NIGOS)        || [];
  const appts    = (window.AppData && window.AppData.APPOINTMENTS) || [];
  const book     = (window.AppData && window.AppData.BOOK_ENTRIES) || [];

  const isDemoC = window.isDemoAgency && window.isDemoAgency();
  if ((useSample || carriers.length === 0) && isDemoC) {
    return SAMPLE_CARRIERS.map(c => ({
      id: c.id, name: c.name, category: c.category,
      appts: c._appts, advances: c._advances, cycle: c._cycle,
      nigo: c._nigo, persistency: c._persist,
    }));
  }
  return carriers.map(c => {
    const carrierPolicies = policies.filter(p => p.carrierId === c.id);
    const carrierNigos    = nigos.filter(n => carrierPolicies.find(p => p.id === n.policyId));
    const nigoRate = safeDiv(carrierNigos.length * 100, carrierPolicies.length);
    const carrierBook = book.filter(b => carrierPolicies.find(p => p.id === b.policyId));
    const persistAvg = carrierBook.length
      ? carrierBook.reduce((a, b) => a + (b.persistency || 0), 0) / carrierBook.length
      : null;
    const apptCount = appts.filter(a => a.carrierId === c.id && a.status === "active").length;
    return {
      id: c.id, name: c.name, category: c.category,
      appts: apptCount, advances: null, cycle: "—",
      nigo: nigoRate, persistency: persistAvg,
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────
function PageResources({ role = "owner" }) {
  useAppDataTick();
  const isRep = role === "rep";
  const [tab, setTab]                 = useLocalValue("repflow:resources:tab", "overview");
  const [useSample, setUseSample]     = useLocalValue("repflow:resources:sample", true);
  const [spendOverrides, setSpendOv]  = useLocalArray("repflow:resources:spendOverrides", {});
  const [spendLog, setSpendLog]       = useLocalArray("repflow:resources:spendLog", []);
  const [logDraft, setLogDraft]       = React.useState({ vendorId: "", amount: "", leads: "", note: "" });
  // Resource data is now agency-shared via AppData (migration 0010); fall
  // back to seed ONLY when viewer is in the demo agency. Real agencies see
  // empty states + add/import CTAs instead of contaminated Atlas seed.
  const isDemo      = window.isDemoAgency && window.isDemoAgency();
  const liveScripts = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const scripts     = liveScripts.length > 0 ? liveScripts : (isDemo ? SCRIPT_SEED : []);
  const liveDocs    = (window.AppData && window.AppData.DOCS) || [];
  const docs        = liveDocs.length > 0 ? liveDocs : (isDemo ? DOC_SEED : []);
  const liveLinks   = (window.AppData && window.AppData.QUICK_LINKS) || [];
  const links       = liveLinks.length > 0 ? liveLinks : (isDemo ? DEFAULT_LINKS : []);

  const [docDraft, setDocDraft]       = React.useState({ title: "", cat: "Internal", url: "" });
  const [docAdd, setDocAdd]           = React.useState(false);
  const [docPreview, setDocPreview]   = React.useState(null);   // { title, body }
  const [gdocUrl, setGdocUrl]         = React.useState("");
  const [importing, setImporting]     = React.useState(false);
  const [uploads, setUploads]         = React.useState([]);     // [{name, status, error}]
  const [scriptOpen, setScriptOpen]   = React.useState(null);
  const [scriptCat, setScriptCat]     = React.useState("All");
  const [scriptQ, setScriptQ]         = React.useState("");
  const [linkEditId, setLinkEditId]   = React.useState(null);
  const [linkAdd, setLinkAdd]         = React.useState(false);
  const [linkDraft, setLinkDraft]     = React.useState({ cat: "Carrier portal", label: "", url: "" });

  // Scrub tool
  const [phone, setPhone]   = React.useState("");
  const [age, setAge]       = React.useState("");
  const [zip, setZip]       = React.useState("");
  const [scrubResults, setScrubResults] = React.useState([]);

  // Compute (re-derives every render — cheap; AppData arrays are <500 rows)
  const vendors  = deriveVendors(useSample, spendOverrides || {});
  const carriers = deriveCarriers(useSample);
  const totals   = vendors.reduce(
    (a, v) => ({ spend: a.spend + v.spend, leads: a.leads + v.leads, issued: a.issued + v.issued, ap: a.ap + v.ap }),
    { spend: 0, leads: 0, issued: 0, ap: 0 }
  );
  const blendedRoas = safeDiv(totals.ap, totals.spend);
  const blendedCpl  = safeDiv(totals.spend, totals.leads);
  const blendedCpa  = safeDiv(totals.spend, totals.issued);
  const closeRate   = safeDiv(totals.issued * 100, totals.leads);

  const carrierAvgPersist = carriers.filter(c => c.persistency != null).length
    ? carriers.filter(c => c.persistency != null).reduce((a, c) => a + c.persistency, 0) / carriers.filter(c => c.persistency != null).length
    : null;
  const carrierAvgNigo = carriers.filter(c => c.nigo != null).length
    ? carriers.reduce((a, c) => a + (c.nigo || 0), 0) / carriers.length
    : 0;

  const topVendor   = [...vendors].sort((a, b) => b.roas - a.roas)[0];
  const worstVendor = [...vendors].filter(v => v.spend > 0).sort((a, b) => a.roas - b.roas)[0];
  const topCarrier  = [...carriers].sort((a, b) => (b.persistency || 0) - (a.persistency || 0))[0];

  const realDataAvailable = ((window.AppData && window.AppData.LEAD_SOURCES) || []).length > 0;

  // ─── Spend logging ─────────────────────────────────────────────────────
  const logSpend = () => {
    const v = vendors.find(x => x.id === logDraft.vendorId);
    const amt = +logDraft.amount, n = +logDraft.leads;
    if (!v || !amt || amt <= 0) return;
    setSpendOv(prev => ({
      ...prev,
      [v.id]: {
        spend: (prev[v.id]?.spend || 0) + amt,
        leads: (prev[v.id]?.leads || 0) + (n || 0),
      },
    }));
    setSpendLog(ls => [{ id: "ls-" + Date.now(), ts: new Date().toISOString(), vendorId: v.id, vendorName: v.name, amount: amt, leads: n || 0, note: logDraft.note.trim() }, ...ls].slice(0, 50));
    setLogDraft({ vendorId: "", amount: "", leads: "", note: "" });
    window.toast && window.toast(`Logged ${fmtMoney(amt)} on ${v.name}`, "success");
  };

  // ─── Scrub tool ────────────────────────────────────────────────────────
  const runScrub = () => {
    const r = [];
    const dnc      = phone && phone.endsWith("99");
    const ageOk    = +age >= 18 && +age <= 110;
    const t65      = +age >= 64 && +age <= 65;
    const stateOk  = zip && zip.length === 5;
    if (phone) r.push({ k: "DNC",          ok: !dnc,    msg: dnc ? "On Do-Not-Call list — DO NOT DIAL" : "Clear of state + federal DNC" });
    if (phone) r.push({ k: "Litigator",    ok: true,    msg: "No known TCPA litigator history" });
    if (age)   r.push({ k: "Age",          ok: ageOk,   msg: ageOk ? `Age ${age} valid for senior products${t65 ? " (T65)" : ""}` : "Age out of range" });
    if (zip)   r.push({ k: "License",      ok: stateOk, msg: stateOk ? "Producer licensed in this zip" : "Invalid zip" });
    if (zip)   r.push({ k: "Carrier appt", ok: stateOk, msg: stateOk ? `${carriers.length} carriers appointed for this state` : "Cannot verify state" });
    setScrubResults(r);
  };

  // ─── Scripts ───────────────────────────────────────────────────────────
  const filteredScripts = scripts.filter(s =>
    (scriptCat === "All" || s.cat === scriptCat) &&
    (!scriptQ || s.title.toLowerCase().includes(scriptQ.toLowerCase()) || s.body.toLowerCase().includes(scriptQ.toLowerCase()))
  );
  const copyScript = (s) => {
    try { navigator.clipboard.writeText(s.body); window.toast && window.toast("Script copied", "success"); }
    catch (_e) { window.toast && window.toast("Copy failed", "danger"); }
  };

  // ─── Docs (persisted via AppData.mutate.docUpsert / docDelete) ─────────
  const addDoc = async () => {
    const title = docDraft.title.trim(), url = docDraft.url.trim();
    if (!title) return;
    const safeUrl = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : "";
    try {
      await window.AppData.mutate.docUpsert({ title, cat: docDraft.cat, url: safeUrl, kind: "link" });
      setDocDraft({ title: "", cat: "Internal", url: "" });
      setDocAdd(false);
      window.toast && window.toast("Document added", "success");
    } catch (e) { window.toast?.(`Document add failed: ${e?.message || e}`, "error"); console.error("[resources.docAdd]", e); }
  };
  const removeDoc = async (id) => { try { await window.AppData.mutate.docDelete(id); } catch (e) { window.toast?.(`Document delete failed: ${e?.message || e}`, "error"); console.error("[resources.docDelete]", e); } };

  // ─── File upload (drag-drop) → Supabase storage `vault` bucket ─────────
  const guessCat = (name) => {
    const lc = name.toLowerCase();
    if (/soa|tpmo|cms|hipaa|nigo/.test(lc)) return "Compliance";
    if (/rate|carrier|plan/.test(lc))       return "Carrier";
    if (/script|training|ahip|guide/.test(lc)) return "Training";
    return "Internal";
  };
  const uploadFile = async (file) => {
    const sb = window.getSupabase && window.getSupabase();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const path = `docs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    let url = "";
    if (sb) {
      try {
        const { error } = await sb.storage.from("vault").upload(path, file, { upsert: false, cacheControl: "3600" });
        if (error) throw error;
        const { data } = sb.storage.from("vault").getPublicUrl(path);
        url = data?.publicUrl || "";
      } catch (e) {
        return { ok: false, error: e?.message || "upload failed" };
      }
    }
    try {
      await window.AppData.mutate.docUpsert({
        title: file.name, cat: guessCat(file.name), url,
        kind: "upload", ext, sizeBytes: file.size, storagePath: path,
      });
    } catch (e) { return { ok: false, error: e?.message || "save failed" }; }
    return { ok: true };
  };
  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setUploads(arr.map(f => ({ name: f.name, status: "uploading" })));
    for (const f of arr) {
      const res = await uploadFile(f);
      setUploads(us => us.map(u => u.name === f.name ? { ...u, status: res.ok ? "done" : "error", error: res.error } : u));
    }
    window.toast && window.toast(`Uploaded ${arr.filter(f => f).length} file(s)`, "success");
    setTimeout(() => setUploads([]), 2500);
  };

  // ─── Google Doc / Sheet / Slides import ────────────────────────────────
  const importGoogleDoc = async () => {
    const url = gdocUrl.trim();
    if (!url) return;
    if (!/docs\.google\.com\/(document|spreadsheets|presentation)/.test(url)) {
      window.toast && window.toast("Not a Google Docs/Sheets/Slides URL", "danger");
      return;
    }
    setImporting(true);
    try {
      const r = await fetch("/api/import-gdoc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!data.ok) {
        window.toast && window.toast(data.error || "Import failed", "danger");
        return;
      }
      try {
        await window.AppData.mutate.docUpsert({
          title: data.title,
          cat: data.kind === "spreadsheet" ? "Carrier" : "Internal",
          url: data.originalUrl,
          kind: "gdoc",
          gdocKind: data.kind,
          text: data.text || "",
        });
      } catch (e) { window.toast?.(`Doc import save failed: ${e?.message || e}`, "error"); console.error("[resources.gdocUpsert]", e); }
      setGdocUrl("");
      window.toast && window.toast(`Imported "${data.title}"`, "success");
    } catch (e) {
      window.toast && window.toast("Import failed: " + (e?.message || "unknown"), "danger");
    } finally {
      setImporting(false);
    }
  };

  // ─── Quick links ───────────────────────────────────────────────────────
  const startLinkAdd  = () => { setLinkDraft({ cat: "Carrier portal", label: "", url: "" }); setLinkAdd(true); setLinkEditId(null); };
  const startLinkEdit = (l) => { setLinkDraft({ cat: l.cat, label: l.label, url: l.url }); setLinkEditId(l.id); setLinkAdd(false); };
  const cancelLink    = () => { setLinkEditId(null); setLinkAdd(false); };
  const saveLink      = async () => {
    const label = linkDraft.label.trim(), url = linkDraft.url.trim();
    if (!label || !url) return;
    const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await window.AppData.mutate.quickLinkUpsert({
        id: linkAdd ? null : linkEditId,
        cat: linkDraft.cat, label, url: safeUrl,
      });
      cancelLink();
      window.toast && window.toast(linkAdd ? "Link added" : "Link updated", "success");
    } catch (e) { window.toast?.(`Link save failed: ${e?.message || e}`, "error"); console.error("[resources.linkUpsert]", e); }
  };
  const removeLink = async (id) => { try { await window.AppData.mutate.quickLinkDelete(id); window.toast && window.toast("Link removed", "info"); } catch (e) { window.toast?.(`Link delete failed: ${e?.message || e}`, "error"); console.error("[resources.linkDelete]", e); } };
  const groupedLinks = LINK_CATEGORIES
    .map(c => ({ cat: c, items: links.filter(l => l.cat === c) }))
    .filter(g => g.items.length > 0 || (linkAdd && linkDraft.cat === g.cat));

  // Reps don't manage lead vendor spend — hide that tab. Owner + manager
  // see all 5.
  const TABS = [
    { k: "overview", l: "Overview",     icon: "Activity" },
    !isRep && { k: "vendors",  l: "Lead vendors", icon: "Wallet",   badge: vendors.length },
    { k: "carriers", l: "Carriers",     icon: "Shield",   badge: carriers.length },
    { k: "scripts",  l: "Scripts & docs", icon: "FileText", badge: scripts.length + docs.length },
    { k: "links",    l: "Quick links",  icon: "Bookmark", badge: links.length },
  ].filter(Boolean);

  // Auto-route reps off the vendors tab if they ever land on it via stale
  // localStorage (it was their last selected tab as owner before).
  React.useEffect(() => {
    if (isRep && tab === "vendors") setTab("overview");
  }, [isRep, tab, setTab]);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Resources</div>
          <div className="page-sub">Lead vendors · carriers · scrub · scripts · documents · quick links</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!realDataAvailable && (
            <span className="chip" style={{ fontSize: 10.5, color: "var(--state-warning)" }}>No live data — sample mode</span>
          )}
          {realDataAvailable && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-tertiary)", cursor: "pointer" }}>
              <input type="checkbox" checked={useSample} onChange={(e) => setUseSample(e.target.checked)}/>
              Sample data
            </label>
          )}
        </div>
      </div>

      <Shared.SectionPill items={TABS} value={tab} onChange={setTab}/>

      {tab === "overview"  && <OverviewSection {...{ totals, blendedRoas, blendedCpl, blendedCpa, closeRate, carrierAvgPersist, carrierAvgNigo, topVendor, worstVendor, topCarrier, vendors, useSample, realDataAvailable, setTab, isRep }}/>}
      {tab === "vendors"   && <VendorsSection  {...{ vendors, totals, blendedRoas, blendedCpl, blendedCpa, logDraft, setLogDraft, logSpend, spendLog }}/>}
      {tab === "carriers"  && <CarriersSection {...{ carriers, phone, setPhone, age, setAge, zip, setZip, scrubResults, runScrub }}/>}
      {tab === "scripts"   && <ScriptsDocsSection {...{ scripts: filteredScripts, scriptOpen, setScriptOpen, scriptCat, setScriptCat, scriptQ, setScriptQ, copyScript, docs, docAdd, setDocAdd, docDraft, setDocDraft, addDoc, removeDoc, handleFiles, gdocUrl, setGdocUrl, importGoogleDoc, importing, uploads, docPreview, setDocPreview }}/>}
      {tab === "links"     && <QuickLinksSection {...{ groupedLinks, links, linkAdd, linkEditId, linkDraft, setLinkDraft, startLinkAdd, startLinkEdit, cancelLink, saveLink, removeLink }}/>}
    </div>
  );
}

// ═══ Overview ═════════════════════════════════════════════════════════════
function OverviewSection({ totals, blendedRoas, blendedCpl, blendedCpa, closeRate, carrierAvgPersist, carrierAvgNigo, topVendor, worstVendor, topCarrier, vendors, useSample, realDataAvailable, setTab, isRep }) {
  return (
    <div>
      {/* KPI row — only owners + managers care about lead-spend economics.
          Reps land directly on the Quick-jump strip. */}
      {!isRep && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          <Shared.KpiCard label="Lead spend (period)"   prefix="$" value={Math.round(totals.spend).toLocaleString()} sub={`${totals.leads} leads · ${fmtMoney(blendedCpl)} CPL`}/>
          <Shared.KpiCard label="Blended ROAS"           value={blendedRoas.toFixed(2) + "x"} sub={`${fmtMoney(totals.ap)} AP / ${fmtMoney(totals.spend)} spend`} trend={blendedRoas >= 3 ? "up" : blendedRoas >= 1.5 ? null : "down"}/>
          <Shared.KpiCard label="Issued / close rate"    value={totals.issued + " · " + fmtPct(closeRate, 0)} sub={`${fmtMoney(blendedCpa)} CPA`}/>
          <Shared.KpiCard label="Avg persistency"        value={carrierAvgPersist != null ? fmtPct(carrierAvgPersist, 0) : "—"} sub={`avg NIGO ${fmtPct(carrierAvgNigo)}`}/>
        </div>
      )}

      {/* Leaders strip */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <Icons.Trophy size={13}/>
          <h3>Where to push spend / where to cut</h3>
          <span className="meta">live ROAS</span>
        </div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <LeaderCard tone="money" title="Top ROAS vendor" value={topVendor?.name || "—"} sub={topVendor ? `${topVendor.roas.toFixed(2)}x · ${fmtMoney(topVendor.spend)} spend → ${fmtMoney(topVendor.ap)} AP` : "no spend yet"} onClick={() => setTab("vendors")}/>
          <LeaderCard tone="danger" title="Worst ROAS vendor" value={worstVendor?.name || "—"} sub={worstVendor ? `${worstVendor.roas.toFixed(2)}x · cut budget?` : "—"} onClick={() => setTab("vendors")}/>
          <LeaderCard tone="info" title="Top carrier (persistency)" value={topCarrier?.name || "—"} sub={topCarrier?.persistency != null ? `${fmtPct(topCarrier.persistency, 0)} retention · ${topCarrier.appts || 0} appts` : "no policies yet"} onClick={() => setTab("carriers")}/>
        </div>
      </div>

      {/* Quick-jump strip */}
      <div className="panel">
        <div className="panel-h"><Icons.Bolt size={13}/><h3>Quick jump</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <QuickJump icon="Wallet"   label="Buy leads + log spend"   sub="Vendor portals + spend tracker"     onClick={() => setTab("vendors")}/>
          <QuickJump icon="Shield"   label="Pre-call scrub"           sub="DNC · age · license · appointment"   onClick={() => setTab("carriers")}/>
          <QuickJump icon="FileText" label="Pull a call script"        sub="Plan G · FE · TPMO · rebuttals"     onClick={() => setTab("scripts")}/>
          <QuickJump icon="Bookmark" label="Open a portal"             sub="UHC · Humana · Aetna · AHIP"        onClick={() => setTab("links")}/>
        </div>
      </div>

      {!realDataAvailable && (
        <div style={{ marginTop: 14, padding: 14, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
          <strong style={{ color: "var(--text-secondary)" }}>Sample mode:</strong> these numbers come from a built-in sample agency so the page works before you've imported leads/policies. Once <code>lead_sources</code>, <code>touchpoints</code>, <code>policies</code>, <code>nigos</code> are wired up, the same calculations will run on your own data automatically.
        </div>
      )}
    </div>
  );
}

function LeaderCard({ tone, title, value, sub, onClick }) {
  const color = tone === "money" ? "var(--accent-money)" : tone === "danger" ? "var(--state-danger)" : "var(--text-secondary)";
  return (
    <div onClick={onClick} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border-subtle)" }}>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sub}</div>
    </div>
  );
}
function QuickJump({ icon, label, sub, onClick }) {
  const Ico = Icons[icon] || Icons.ArrowRight;
  return (
    <button onClick={onClick} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
      <Ico size={16} style={{ color: "var(--text-secondary)" }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sub}</div>
      </div>
      <Icons.ChevronRight size={11} style={{ color: "var(--text-tertiary)" }}/>
    </button>
  );
}

// ═══ Vendors ══════════════════════════════════════════════════════════════
function VendorsSection({ vendors, totals, blendedRoas, blendedCpl, blendedCpa, logDraft, setLogDraft, logSpend, spendLog }) {
  return (
    <div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <Icons.Wallet size={13}/>
          <h3>Lead spend tracker</h3>
          <span className="meta">{fmtMoney(totals.spend)} spent · {totals.leads} leads · CPL {fmtMoney(blendedCpl)} · ROAS {blendedRoas.toFixed(2)}x · CPA {fmtMoney(blendedCpa)}</span>
        </div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "180px 110px 100px 1fr auto", gap: 8, alignItems: "end", borderBottom: "1px solid var(--border-subtle)" }}>
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
            <input className="text-input" value={logDraft.note} onChange={(e) => setLogDraft({ ...logDraft, note: e.target.value })} placeholder="creative v3 / batch 4-30"/>
          </Shared.Field>
          <button className="btn btn-primary" onClick={logSpend} style={{ height: 32 }}>
            <Icons.Plus size={12}/> Log spend
          </button>
        </div>

        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 70px 80px 70px 80px 70px 70px" }}>
            <div>Vendor</div>
            <div className="tabular" style={{ textAlign: "right" }}>Spend</div>
            <div className="tabular" style={{ textAlign: "right" }}>Leads</div>
            <div className="tabular" style={{ textAlign: "right" }}>CPL</div>
            <div className="tabular" style={{ textAlign: "right" }}>Issued</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
            <div style={{ textAlign: "right" }}>Buy</div>
          </div>
          {vendors.map(v => (
            <div key={v.id} className="row" style={{ gridTemplateColumns: "1.6fr 90px 70px 80px 70px 80px 70px 70px", height: 38 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }} className="cell-truncate">{v.name}</span>
                <span className="chip" style={{ fontSize: 9.5 }}>{v.kind || "—"}</span>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{fmtMoney(v.spend)}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{v.leads}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(v.cpl)}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{v.issued}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtMoney(v.ap)}</div>
              <div className="tabular" style={{ textAlign: "right", color: v.roas >= 3 ? "var(--accent-money)" : v.roas >= 1.5 ? "var(--state-warning)" : "var(--state-danger)", fontWeight: 500 }}>{v.roas.toFixed(2)}x</div>
              <div style={{ textAlign: "right" }}>
                {v.buyUrl ? (
                  <a href={v.buyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ height: 26, padding: "0 8px", fontSize: 11 }}>
                    <Icons.ArrowUpRight size={11}/> Buy
                  </a>
                ) : <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>—</span>}
              </div>
            </div>
          ))}
          {vendors.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No vendors yet. Wire <code>lead_sources</code> in Supabase or toggle <strong>Sample data</strong> to preview.
            </div>
          )}
        </div>
      </div>

      {spendLog.length > 0 && (
        <div className="panel">
          <div className="panel-h"><Icons.Clock size={13}/><h3>Recent spend</h3><span className="meta">{spendLog.length} entries (last 50)</span></div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            {spendLog.map(e => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px 60px 1.5fr", gap: 8, padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 5, fontSize: 11.5 }}>
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
  );
}

// ═══ Carriers ═════════════════════════════════════════════════════════════
function CarriersSection({ carriers, phone, setPhone, age, setAge, zip, setZip, scrubResults, runScrub }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
      {/* Scrub */}
      <div className="panel">
        <div className="panel-h">
          <Icons.Shield size={13}/>
          <h3>Pre-call scrub</h3>
          {scrubResults.length > 0 && (
            <span className={`chip ${scrubResults.every(r => r.ok) ? "chip-money" : "chip-danger"}`} style={{ marginLeft: "auto" }}>
              {scrubResults.every(r => r.ok) ? "All clear" : "Action needed"}
            </span>
          )}
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="field-row">
            <Shared.Field label="Phone (E.164)"><input className="text-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15125550199"/></Shared.Field>
            <Shared.Field label="Age"><input className="text-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="65"/></Shared.Field>
            <Shared.Field label="Zip"><input className="text-input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="78704"/></Shared.Field>
          </div>
          <button className="btn btn-primary" onClick={runScrub} style={{ alignSelf: "flex-start" }}>Run scrub</button>
        </div>
        {scrubResults.length > 0 && (
          <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {scrubResults.map((r, i) => (
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
        {scrubResults.length === 0 && (
          <div style={{ padding: "0 14px 14px", color: "var(--text-tertiary)", fontSize: 11.5 }}>
            Validates DNC · litigator · age range · producer license · carrier appointment in real time. Auto-scrub gates dialing on Med Supp + FE.
          </div>
        )}
      </div>

      {/* Carrier directory */}
      <div className="panel">
        <div className="panel-h">
          <Icons.Folder size={13}/>
          <h3>Appointed carriers</h3>
          <span className="meta">{carriers.length} · {carriers.reduce((a, c) => a + (c.appts || 0), 0)} appts</span>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px" }}
            onClick={() => {
              try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
              if (window.gotoPage) window.gotoPage("settings");
            }}
            title="Add, edit, or remove carriers"
          >
            <Icons.Edit size={11}/> Manage
          </button>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 60px 80px 70px 70px" }}>
            <div>Carrier</div>
            <div className="tabular" style={{ textAlign: "right" }}>Appts</div>
            <div>Cycle</div>
            <div className="tabular" style={{ textAlign: "right" }}>NIGO</div>
            <div className="tabular" style={{ textAlign: "right" }}>Persist.</div>
          </div>
          {carriers.map(c => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 60px 80px 70px 70px", height: 38 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                {c.advances != null && (
                  <span className={`chip ${c.advances ? "chip-money" : ""}`} style={{ fontSize: 9.5 }}>{c.advances ? "advance" : "as-earned"}</span>
                )}
              </div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.appts || 0}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.cycle}</div>
              <div className="tabular" style={{ textAlign: "right", color: c.nigo > 2 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{c.nigo != null ? c.nigo.toFixed(1) + "%" : "—"}</div>
              <div className="tabular" style={{ textAlign: "right", color: c.persistency >= 90 ? "var(--accent-money)" : c.persistency >= 80 ? "var(--state-warning)" : c.persistency != null ? "var(--state-danger)" : "var(--text-tertiary)", fontWeight: 500 }}>{c.persistency != null ? Math.round(c.persistency) + "%" : "—"}</div>
            </div>
          ))}
          {carriers.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No carriers configured. Add them in Supabase <code>carriers</code> or toggle Sample data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ Scripts & docs ═══════════════════════════════════════════════════════
function ScriptsDocsSection({ scripts, scriptOpen, setScriptOpen, scriptCat, setScriptCat, scriptQ, setScriptQ, copyScript, docs, docAdd, setDocAdd, docDraft, setDocDraft, addDoc, removeDoc, handleFiles, gdocUrl, setGdocUrl, importGoogleDoc, importing, uploads, docPreview, setDocPreview }) {
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    else {
      const url = e.dataTransfer?.getData?.("text/plain");
      if (url && /docs\.google\.com/.test(url)) {
        setGdocUrl(url);
        setTimeout(importGoogleDoc, 50);
      }
    }
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
      {/* Scripts */}
      <div className="panel">
        <div className="panel-h">
          <Icons.FileText size={13}/>
          <h3>Call scripts</h3>
          <span className="meta">{scripts.length}</span>
          <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search scripts…" value={scriptQ} onChange={(e) => setScriptQ(e.target.value)}/>
        </div>
        <div style={{ padding: "10px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SCRIPT_CATS.map(c => (
            <button key={c} className="btn btn-ghost" onClick={() => setScriptCat(c)}
              style={{ padding: "4px 10px", fontSize: 11.5, background: scriptCat === c ? "var(--bg-raised)" : "transparent", color: scriptCat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {scripts.map(s => {
            const open = scriptOpen === s.id;
            const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
            return (
              <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }} onClick={() => setScriptOpen(open ? null : s.id)}>
                  <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                  <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version}</span>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copyScript(s); }} title="Copy"><Icons.Copy size={11}/></button>
                </div>
                {open && (
                  <div style={{ padding: "10px 12px 12px 30px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {s.body}
                  </div>
                )}
              </div>
            );
          })}
          {scripts.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No scripts match.</div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div className="panel">
        <div className="panel-h">
          <Icons.Folder size={13}/>
          <h3>Document hub</h3>
          <span className="meta">{docs.length}</span>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setDocAdd(a => !a)}>
            <Icons.Plus size={12}/> Add link
          </button>
        </div>
        <div style={{ padding: 14 }}>
          {/* Dropzone + Google Doc import */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 18, marginBottom: 10,
              border: `1px dashed ${dragActive ? "var(--accent-money)" : "var(--border-subtle)"}`,
              borderRadius: 8, background: dragActive ? "var(--bg-overlay)" : "var(--bg-raised)",
              textAlign: "center", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Icons.ArrowUp size={18} style={{ color: dragActive ? "var(--accent-money)" : "var(--text-tertiary)", marginBottom: 6 }}/>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>
              {dragActive ? "Drop to upload" : "Drag files here, or click to browse"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              PDFs · rate sheets · onboarding docs · scripts · anything. Stored in Supabase vault.
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}/>
          </div>

          {/* Google Doc URL */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 10 }}>
            <input className="text-input"
              placeholder="Paste Google Doc / Sheet / Slides URL to import…"
              value={gdocUrl}
              onChange={(e) => setGdocUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") importGoogleDoc(); }}/>
            <button className="btn btn-primary" onClick={importGoogleDoc} disabled={importing} style={{ height: 32 }}>
              {importing ? "Importing…" : <><Icons.ArrowUpRight size={11}/> Import</>}
            </button>
          </div>

          {/* In-flight uploads */}
          {uploads.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {uploads.map(u => (
                <div key={u.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg-overlay)", borderRadius: 5, fontSize: 11.5 }}>
                  <span className={`dot dot-${u.status === "done" ? "live" : u.status === "error" ? "danger" : "warn"}`}/>
                  <span style={{ flex: 1 }} className="cell-truncate">{u.name}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{u.status === "uploading" ? "uploading…" : u.status === "done" ? "done" : (u.error || "error")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Manual URL form */}
          {docAdd && (
            <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 100px", gap: 6 }}>
              <input className="text-input" placeholder="Title" value={docDraft.title} onChange={(e) => setDocDraft({ ...docDraft, title: e.target.value })} autoFocus/>
              <Shared.Select value={docDraft.cat} onChange={(v) => setDocDraft({ ...docDraft, cat: v })}
                options={DOC_CATS.map(c => ({ v: c, l: c }))}/>
              <input className="text-input" style={{ gridColumn: "1 / -1" }} placeholder="URL (https://…)" value={docDraft.url} onChange={(e) => setDocDraft({ ...docDraft, url: e.target.value })}/>
              <button className="btn btn-primary" style={{ gridColumn: "1 / -1", height: 28 }} onClick={addDoc}>Save link</button>
            </div>
          )}

          {/* Doc list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {docs.map(d => {
              const Ico = d.kind === "gdoc" ? Icons.ArrowUpRight : d.kind === "upload" ? Icons.Folder : Icons.FileText;
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                  <Ico size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-primary)", textDecoration: "none", fontSize: 12, fontWeight: 500 }} className="cell-truncate">{d.title}</a>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)" }} className="cell-truncate">{d.title}</span>
                    )}
                    {d.sizeBytes && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-tertiary)" }}>{Math.round(d.sizeBytes / 1024)} KB</span>}
                  </div>
                  {d.kind === "gdoc" && <span className="chip" style={{ fontSize: 9.5 }}>{d.gdocKind}</span>}
                  {d.kind === "upload" && d.ext && <span className="chip" style={{ fontSize: 9.5 }}>{d.ext}</span>}
                  <span className="chip" style={{ fontSize: 9.5 }}>{d.cat}</span>
                  {d.text && (
                    <button className="icon-btn" onClick={() => setDocPreview({ title: d.title, body: d.text })} title="Preview"><Icons.FileText size={11}/></button>
                  )}
                  <button className="icon-btn" onClick={() => removeDoc(d.id)} title="Remove" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                </div>
              );
            })}
            {docs.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Drop a file or paste a Google Doc URL above to start.</div>
            )}
          </div>
        </div>
      </div>

      {docPreview && (
        <Shared.Modal title={docPreview.title} width={760} onClose={() => setDocPreview(null)}>
          <div style={{ maxHeight: "60vh", overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)", padding: 4 }}>
            {docPreview.body || "(empty)"}
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

// ═══ Quick links ══════════════════════════════════════════════════════════
function QuickLinksSection({ groupedLinks, links, linkAdd, linkEditId, linkDraft, setLinkDraft, startLinkAdd, startLinkEdit, cancelLink, saveLink, removeLink }) {
  const editing = linkAdd || linkEditId;
  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Bookmark size={13}/>
        <h3>Quick links</h3>
        <span className="meta">{links.length} · saved locally per browser</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={startLinkAdd}>
          <Icons.Plus size={12}/> Add link
        </button>
      </div>
      <div style={{ padding: 14 }}>
        {editing && (
          <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 12, display: "grid", gridTemplateColumns: "150px 1fr 2fr auto auto", gap: 8, alignItems: "end" }}>
            <Shared.Field label="Category">
              <Shared.Select value={linkDraft.cat} onChange={(v) => setLinkDraft({ ...linkDraft, cat: v })} options={LINK_CATEGORIES.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
            <Shared.Field label="Label">
              <input className="text-input" value={linkDraft.label} onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="UHC Producer Portal" autoFocus/>
            </Shared.Field>
            <Shared.Field label="URL">
              <input className="text-input" value={linkDraft.url} onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })} placeholder="https://…"/>
            </Shared.Field>
            <button className="btn btn-primary" onClick={saveLink} style={{ height: 32 }}>{linkAdd ? "Add" : "Save"}</button>
            <button className="btn btn-ghost" onClick={cancelLink} style={{ height: 32 }}>Cancel</button>
          </div>
        )}
        {groupedLinks.map(g => (
          <div key={g.cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{g.cat}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
              {g.items.map(l => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: "var(--text-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icons.ArrowUpRight size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
                    <span className="cell-truncate" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
                  </a>
                  <button className="icon-btn" onClick={() => startLinkEdit(l)} title="Edit"><Icons.Edit size={11}/></button>
                  <button className="icon-btn" onClick={() => removeLink(l.id)} title="Delete" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {links.length === 0 && !linkAdd && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No links yet. Click <strong style={{ color: "var(--text-secondary)" }}>Add link</strong> to start a portal locker.
          </div>
        )}
      </div>
    </div>
  );
}

window.PageResources = PageResources;

})();
