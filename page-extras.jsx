/* page-extras.jsx — role-aware pages: Vault, Tiering, Commissions, Training, Recruiting, Calls, Book.
   Each page exports a single component that branches on `role` so a single sidebar entry
   serves rep / manager / owner with the right density.

   Conventions:
     - All money in dollars in display (the underlying domain is cents in Supabase).
     - Hardcoded demo state lives in module scope; real pages read from Supabase. */

const Money = ({ v, dim }) => (
  <span className="tabular" style={{ color: dim ? "var(--text-tertiary)" : undefined, fontWeight: dim ? 400 : 500 }}>
    ${Math.abs(v).toLocaleString()}
  </span>
);

/* ─────────────────────────────────────────────────────────────────────────
   1. Compliance Vault — auditable artifact store (recordings, SOAs, consent)
   ───────────────────────────────────────────────────────────────────────── */
function PageVault({ role = "owner" }) {
  const { RECORDINGS, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const [tab, setTab] = React.useState("artifacts");
  const [q, setQ] = React.useState("");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [extras, setExtras] = React.useState([]);
  const [retentionEdits, setRetentionEdits] = React.useState({});

  const updateRetention = async (id, retention) => {
    setRetentionEdits(s => ({ ...s, [id]: retention }));
    try {
      await AppData.mutate.vaultRetentionUpdate(id, retention);
      window.toast && window.toast(`Retention updated to ${retention}${AppData.LIVE ? "" : " (demo)"}`, "success");
    } catch (_e) {}
  };

  // Synthesized SOAs + consent receipts to back the page
  const SEED_ARTIFACTS = [
    { id: "soa-1", kind: "SOA",        lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "scheduled" },
    { id: "soa-2", kind: "SOA",        lead: "Robert Mendez",  repId: "dani", date: "Today, 9:02a",  retention: "10y",  status: "captured"  },
    { id: "lid-1", kind: "LeadiD",     lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:01a", retention: "13mo", status: "captured"  },
    { id: "tf-1",  kind: "TrustedForm",lead: "Robert Mendez",  repId: "dani", date: "Today, 8:48a",  retention: "13mo", status: "captured"  },
    { id: "rec-1", kind: "Recording",  lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "complete"  },
    { id: "rec-2", kind: "Recording",  lead: "Robert Mendez",  repId: "dani", date: "Today, 9:02a",  retention: "10y",  status: "complete"  },
    { id: "con-1", kind: "Consent",    lead: "Linda Cho",      repId: "marc", date: "Yesterday",     retention: "13mo", status: "captured"  },
    { id: "tpmo-1",kind: "TPMO disc.", lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "captured"  },
  ];

  const ARTIFACTS = [...extras, ...SEED_ARTIFACTS].map(a => retentionEdits[a.id] ? { ...a, retention: retentionEdits[a.id] } : a);
  const filtered = ARTIFACTS.filter(a => !q || (a.lead + " " + a.kind).toLowerCase().includes(q.toLowerCase()));

  const submitUpload = async (form) => {
    const newRow = {
      id: "vault-" + Date.now(),
      kind: form.kind, lead_name: form.lead, lead: form.lead, repId: form.repId, rep_id: form.repId,
      date: "Just added", retention: form.retention, status: "captured",
    };
    try {
      await AppData.mutate.vaultArtifactInsert({
        kind: form.kind, lead_name: form.lead, rep_id: form.repId,
        retention: form.retention, status: "captured"
      });
    } catch (_e) {}
    setExtras(es => [newRow, ...es]);
    setUploadOpen(false);
    window.toast && window.toast(`Vault entry added · ${form.kind} for ${form.lead}`, "success");
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Compliance Vault</div>
          <div className="page-sub">Auditor-ready · recordings, SOAs, consent · retention timer per artifact</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input className="text-input" style={{ width: 220 }} placeholder="Search lead or kind..." value={q} onChange={(e) => setQ(e.target.value)}/>
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}><Icons.Plus size={13}/> Upload artifact</button>
          <button className="btn" onClick={() => {
            const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
            const orgName = meIdent?.agency_name || "Your agency";
            const artifactCount = ARTIFACTS.length;
            const html = `
              <h1>Compliance Audit Pack</h1>
              <div class="meta">${orgName} · Generated ${new Date().toLocaleDateString()}</div>
              <p><strong>${artifactCount.toLocaleString()} artifact${artifactCount === 1 ? "" : "s"} retained</strong> in the vault.</p>
              <table>
                <thead><tr><th>Kind</th><th>Lead</th><th>Producer</th><th>Captured</th><th>Status</th><th>Retention</th></tr></thead>
                <tbody>
                ${ARTIFACTS.map(a => { const rep = repById[a.repId]; return `<tr><td>${a.kind}</td><td>${a.lead}</td><td>${rep?.name || ""}</td><td>${a.date}</td><td>${a.status}</td><td>${a.retention}</td></tr>`; }).join("")}
                </tbody>
              </table>`;
            window.exportPDF && window.exportPDF("Compliance Audit Pack", html);
          }}><Icons.ArrowUpRight size={13}/> Export audit pack</button>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Artifacts retained" value="14,820" sub="last 13 months"/>
        <Shared.KpiCard label="SOA capture" value="98.2%" sub="goal 95%" trend="up"/>
        <Shared.KpiCard label="TPMO compliance" value="100%" sub="zero violations" trend="up"/>
        <Shared.KpiCard label="Open chargebacks" value="2" sub="docs in review"/>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h3>Artifacts</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {["artifacts", "policies", "scrub"].map(t => (
              <button key={t} onClick={() => setTab(t)} className="btn btn-ghost" style={{ padding: "3px 10px", background: tab === t ? "var(--bg-raised)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {t === "artifacts" ? "Artifacts" : t === "policies" ? "Retention policy" : "Auto-scrub policy"}
              </button>
            ))}
          </div>
        </div>
        {tab === "artifacts" && (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "120px 1fr 1fr 1fr 100px 100px 30px" }}>
              <div>Kind</div><div>Lead</div><div>Producer</div><div>Captured</div><div>Status</div><div>Retention</div><div></div>
            </div>
            {filtered.map(a => (
              <div key={a.id} className="row" style={{ gridTemplateColumns: "120px 1fr 1fr 1fr 100px 100px 30px" }}>
                <div><span className="chip">{a.kind}</span></div>
                <div className="cell-truncate" style={{ fontWeight: 500 }}>{a.lead}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Shared.Avatar rep={repById[a.repId]} size={18}/>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{repById[a.repId]?.name.split(" ")[0]}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.date}</div>
                <div><span className={`chip ${a.status === "captured" || a.status === "complete" ? "chip-money" : "chip-status"}`}>{a.status}</span></div>
                <div>
                  <Shared.Select value={a.retention} onChange={(v) => updateRetention(a.id, v)} options={[{ v: "13mo", l: "13mo" }, { v: "10y", l: "10y" }, { v: "indef", l: "indefinite" }]}/>
                </div>
                <button className="icon-btn"><Icons.ArrowUpRight size={12}/></button>
              </div>
            ))}
          </div>
        )}
        {tab === "policies" && (
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: "Recording (sales)", v: "10 years post-issue", d: "CMS / state insurance dept aligned" },
              { k: "SOA",                v: "10 years",            d: "Captured via TwentyHours, vault on issue" },
              { k: "TPMO disclaimer",    v: "10 years",            d: "Auto-clipped from recording, indexed" },
              { k: "LeadiD",             v: "13 months",            d: "Jornaya certificate per inbound form" },
              { k: "TrustedForm",        v: "13 months",            d: "Certificate per outbound or web form" },
              { k: "Consent receipt",    v: "13 months",            d: "Express consent for telemarketing under TCPA" },
            ].map((p, i) => (
              <div key={i} className="panel" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{p.k}</strong>
                  <span className="chip">{p.v}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6 }}>{p.d}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "scrub" && (
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: "DNC scrub",         v: "Every dial",  d: "State + federal DNC + Atlas internal opt-out checked before route" },
              { k: "License gate",      v: "Realtime",     d: "Producer cannot dial leads in states they're not licensed in" },
              { k: "Carrier appointment", v: "Realtime",   d: "Validated against the lead's state — pre-qual at the dialer" },
              { k: "TPMO disclaimer",   v: "Within 8s",    d: "Auto-fires on every Med Supp connect, captured in recording" },
              { k: "Litigator screen",  v: "Pre-dial",     d: "Known TCPA litigator history blocks the dial" },
              { k: "Audit log",         v: "All scrubs",   d: "Result + timestamp + producer ID logged for trailing audit" },
            ].map((p, i) => (
              <div key={i} className="panel" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{p.k}</strong>
                  <span className="chip chip-money">{p.v}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6 }}>{p.d}</div>
              </div>
            ))}
            <div style={{ gridColumn: "span 2", padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icons.Shield size={14} style={{ color: "var(--accent-money)" }}/>
              <div style={{ flex: 1 }}>Need to test a specific number, age, or zip? The interactive scrub tool lives in <strong style={{ color: "var(--text-primary)" }}>Resources</strong>.</div>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "resources" }}))}>
                <Icons.ArrowUpRight size={11}/> Open scrubber
              </button>
            </div>
          </div>
        )}
      </div>

      {uploadOpen && <VaultUploadModal onClose={() => setUploadOpen(false)} onSubmit={submitUpload}/>}
    </div>
  );
}

function VaultUploadModal({ onClose, onSubmit }) {
  const [form, setForm] = React.useState({ kind: "SOA", lead: "", repId: AppData.REPS[0]?.id, retention: "10y" });
  const valid = form.lead.trim().length > 0;
  return (
    <Shared.Modal title="Upload artifact" width={460} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => valid && onSubmit(form)} disabled={!valid}><Icons.Plus size={11}/> Upload</button>
      </>
    }>
      <Shared.Field label="Kind">
        <Shared.Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={["SOA","Recording","LeadiD","TrustedForm","Consent","TPMO disc.","App","Other"].map(k => ({ v: k, l: k }))}/>
      </Shared.Field>
      <Shared.Field label="Lead name">
        <input className="text-input" value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })} placeholder="Cheryl Hampton" autoFocus/>
      </Shared.Field>
      <Shared.Field label="Producer">
        <Shared.Select value={form.repId} onChange={(v) => setForm({ ...form, repId: v })} options={AppData.REPS.map(r => ({ v: r.id, l: r.name }))}/>
      </Shared.Field>
      <Shared.Field label="Retention">
        <Shared.Select value={form.retention} onChange={(v) => setForm({ ...form, retention: v })} options={[{ v: "13mo", l: "13mo" }, { v: "10y", l: "10y" }, { v: "indef", l: "indefinite" }]}/>
      </Shared.Field>
      <div style={{ padding: 10, border: "1px dashed var(--border-strong)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 11.5, textAlign: "center" }}>
        File-drop placeholder · binary upload would route to Supabase Storage in the multi-tenant build
      </div>
    </Shared.Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   2. Tiering Console — owner power: who decides who's Diamond?
   ───────────────────────────────────────────────────────────────────────── */
function PageTiering() {
  const { REPS } = AppData;
  const TIER_ORDER = ["bronze","silver","gold","platinum","diamond"];

  // Initial rules — editable
  const [rules, setRules] = React.useState({
    bronze:   { mtd: 0,     persistency: 0  },
    silver:   { mtd: 15000, persistency: 70 },
    gold:     { mtd: 25000, persistency: 80 },
    platinum: { mtd: 35000, persistency: 85 },
    diamond:  { mtd: 50000, persistency: 90 },
  });
  // Per-rep overrides
  const [overrides, setOverrides] = React.useState({});
  const [history, setHistory] = React.useState([
    { who: "Tony Park",   from: "gold",     to: "platinum", reason: "Lost a lead to no fault — protect tier",    when: "Apr 28" },
    { who: "Remy Chen",   from: "silver",   to: "bronze",   reason: "Persistency drift, 6-mo cohort",            when: "Apr 21" },
  ]);

  const persFor = (rep) => 88 + (rep.streak % 7); // synthesized

  const calcTier = (rep) => {
    const p = persFor(rep);
    let t = "bronze";
    for (const k of TIER_ORDER) {
      if (rep.mtd >= rules[k].mtd && p >= rules[k].persistency) t = k;
    }
    return t;
  };

  const setOverride = async (id, t) => {
    const rep = REPS.find(r => r.id === id);
    const auto = calcTier(rep);
    if (t === auto) {
      const n = { ...overrides }; delete n[id]; setOverrides(n);
    } else {
      setOverrides({ ...overrides, [id]: t });
      setHistory([{ who: rep.name, from: rep.tier, to: t, reason: "Manual override", when: "now" }, ...history]);
    }
    try { await AppData.mutate.tieringOverride(id, t); window.toast && window.toast(`${rep.name} → ${t.toUpperCase()}${AppData.LIVE ? " · saved" : ""}`, "success"); }
    catch (_e) {}
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Tiering Console</div>
          <div className="page-sub">Define tier rules. Override per-rep when judgment beats numbers. Audit log included.</div>
        </div>
      </div>

      <div className="tiering-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Award size={13}/><h3>Tier rules</h3><span className="meta">all conditions AND</span></div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {TIER_ORDER.map(t => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10, alignItems: "center" }}>
                <div><Shared.TierChip tier={t}/></div>
                <Shared.Field label={`MTD ≥ $${rules[t].mtd.toLocaleString()}`}>
                  <input type="range" min={0} max={70000} step={1000} value={rules[t].mtd} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], mtd: +e.target.value } })}/>
                </Shared.Field>
                <Shared.Field label={`Persistency ≥ ${rules[t].persistency}%`}>
                  <input type="range" min={0} max={100} value={rules[t].persistency} onChange={(e) => setRules({ ...rules, [t]: { ...rules[t], persistency: +e.target.value } })}/>
                </Shared.Field>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Users size={13}/><h3>Per-rep tier · auto vs override</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 80px 90px 100px 1fr" }}>
              <div>Producer</div>
              <div className="tabular" style={{ textAlign: "right" }}>MTD</div>
              <div className="tabular" style={{ textAlign: "right" }}>Persist.</div>
              <div>Auto</div>
              <div>Effective</div>
            </div>
            {REPS.map(r => {
              const auto = calcTier(r);
              const eff = overrides[r.id] || auto;
              return (
                <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 80px 90px 100px 1fr" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Shared.Avatar rep={r} size={20}/>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  </div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>${(r.mtd/1000).toFixed(1)}k</div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{persFor(r)}%</div>
                  <div><Shared.TierChip tier={auto} compact/></div>
                  <div>
                    <Shared.Select value={eff} onChange={(v) => setOverride(r.id, v)} options={TIER_ORDER.map(t => ({ v: t, l: t.toUpperCase() + (t === auto ? " (auto)" : "") }))}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><Icons.Activity size={13}/><h3>Override audit log</h3><span className="meta">{history.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 100px 1.6fr 100px" }}>
            <div>Producer</div><div>From</div><div>To</div><div>Reason</div><div>When</div>
          </div>
          {history.map((h, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1fr 100px 100px 1.6fr 100px" }}>
              <div style={{ fontWeight: 500 }}>{h.who}</div>
              <div><Shared.TierChip tier={h.from} compact/></div>
              <div><Shared.TierChip tier={h.to} compact/></div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12.5 }}>{h.reason}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{h.when}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   3. Commissions — rep statement / mgr team rollup / owner override pool
   ───────────────────────────────────────────────────────────────────────── */
function PageCommissions({ role = "rep" }) {
  if (role === "manager") return <CommissionsManager/>;
  if (role === "owner")   return <CommissionsOwner/>;
  return <CommissionsRep/>;
}

const STATEMENT = [
  { date: "Today",      lead: "Cheryl Hampton", carrier: "Aetna SRC",     product: "Plan G",    ap: 1840, pct: 50, expected: 920,  paid: 920,  status: "advance"  },
  { date: "Today",      lead: "Robert Mendez",  carrier: "UHC",            product: "FE $15K",   ap: 1320, pct: 50, expected: 660,  paid: 660,  status: "advance"  },
  { date: "Yesterday",  lead: "Henry Akins",    carrier: "F&G Annuities",  product: "Annuity",   ap: 4250, pct: 10, expected: 425,  paid: 0,    status: "as-earned"},
  { date: "Apr 26",     lead: "Linda Cho",      carrier: "Humana Vantage", product: "Plan N",    ap: 1490, pct: 50, expected: 745,  paid: 0,    status: "NIGO · sigs missing" },
  { date: "Apr 24",     lead: "Don Phelps",     carrier: "Aetna SRC",      product: "FE $10K",   ap: 0,    pct: 0,  expected: 0,    paid: -480, status: "Chargeback" },
  { date: "Apr 22",     lead: "Naomi Reese",    carrier: "Aetna SRC",      product: "Plan G",    ap: 1780, pct: 50, expected: 890,  paid: 890,  status: "paid"     },
  { date: "Apr 19",     lead: "Patricia Volker",carrier: "UHC",            product: "Plan G",    ap: 2120, pct: 50, expected: 1060, paid: 1060, status: "paid"     },
];

// ─── Account-based commission calculator ───────────────────────────────────
// Single source of truth: each row in policies carries comp_rate_pct +
// expected_commission (set by deal-write). PAID amounts come from the
// commissions ledger (advances / earned / trails). This makes the rep,
// manager, and owner views all derive from the same data — change a comp%
// at deal entry and every downstream number moves.
function buildStatement({ repId } = {}) {
  const policies = AppData.POLICIES || [];
  const commissions = AppData.COMMISSIONS || [];
  const pipeline = AppData.PIPELINE || [];
  const carriers = AppData.CARRIERS || [];
  const clawbacks = AppData.CLAWBACKS || [];
  const carrierById = new Map(carriers.map(c => [c.id, c]));
  const leadById   = new Map(pipeline.map(l => [l.id, l]));

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso); if (isNaN(d)) return iso;
    const today = new Date(); today.setHours(0,0,0,0);
    const day = new Date(d); day.setHours(0,0,0,0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 14)  return `${diff}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const rows = policies
    .filter(p => !repId || p.owner === repId)
    .map(p => {
      // Sum any paid commissions tied to this policy
      const paidForPolicy = commissions
        .filter(c => c.policyId === p.id)
        .reduce((a, c) => a + (c.amount || 0), 0);
      // expected: prefer stored expected, else AP × comp%
      const base = p.targetPremium || p.ap || 0;
      const pct  = p.compRatePct != null ? p.compRatePct : 0;
      const expected = p.expectedCommission != null ? p.expectedCommission : Math.round(base * pct / 100);
      const lead     = p.leadId ? leadById.get(p.leadId) : null;
      const carrier  = carrierById.get(p.carrierId);
      // Status mapping
      const status = p.status === "issued" || p.status === "active" ? (paidForPolicy > 0 ? "paid" : "pending payout")
                    : p.status === "submitted" || p.status === "app_in" ? "submitted"
                    : p.status === "declined" || p.status === "withdrawn" ? p.status
                    : p.status || "—";
      return {
        policyId: p.id,
        date: fmtDate(p.submissionDate || p.issuedAt),
        lead: lead?.lead || (p.policyNumber ? `Policy ${p.policyNumber}` : "—"),
        carrier: carrier?.name || p.carrierId || "—",
        product: p.product || "—",
        ap: p.ap || 0,
        pct,
        expected,
        paid: paidForPolicy,
        status,
      };
    });

  // Append chargebacks (negative paid)
  clawbacks
    .filter(cb => !repId || cb.repId === repId)
    .forEach(cb => rows.push({
      policyId: cb.policyId,
      date: fmtDate(cb.recordedAt),
      lead: "(chargeback)",
      carrier: "—", product: "—", ap: 0, pct: 0,
      expected: 0, paid: -(cb.amount || 0), status: "Chargeback",
    }));

  return rows;
}

function CommissionsRep() {
  // Always recompute from policies + commissions ledger so any deal entered
  // anywhere by this rep flows through immediately.
  const repId = AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id;
  const liveRows = buildStatement({ repId });
  const ROWS = liveRows && liveRows.length ? liveRows : STATEMENT;
  const total = ROWS.reduce((a, r) => a + r.expected, 0);
  const paid  = ROWS.reduce((a, r) => a + r.paid, 0);
  const inClearing = total - Math.max(0, paid);
  const charge = ROWS.filter(r => r.paid < 0).reduce((a, r) => a + r.paid, 0);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Me</div>
          <div className="page-sub">Statement · advances vs as-earned · NIGO and chargeback alerts</div>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => {
          const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
          const producerName = meIdent?.full_name || "Producer";
          const orgName = meIdent?.agency_name || "Your agency";
          const periodLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
          const html = `
            <h1>Statement · ${periodLabel}</h1>
            <div class="meta">${producerName} · ${orgName} · ${new Date().toLocaleDateString()}</div>
            <table>
              <thead><tr><th>Date</th><th>Lead</th><th>Carrier</th><th>Product</th><th style="text-align:right">AP</th><th style="text-align:right">Comp %</th><th style="text-align:right">Expected</th><th style="text-align:right">Paid</th><th>Status</th></tr></thead>
              <tbody>
              ${ROWS.map(r => `<tr><td>${r.date}</td><td>${r.lead}</td><td>${r.carrier}</td><td>${r.product}</td><td style="text-align:right">$${(r.ap || 0).toLocaleString()}</td><td style="text-align:right">${r.pct}%</td><td style="text-align:right">$${r.expected.toLocaleString()}</td><td style="text-align:right">$${r.paid.toLocaleString()}</td><td>${r.status}</td></tr>`).join("")}
              </tbody>
            </table>`;
          window.exportPDF && window.exportPDF(`Statement · ${periodLabel}`, html);
        }}><Icons.ArrowUpRight size={13}/> Statement PDF</button>
        <button className="btn" style={{ marginLeft: 8 }} onClick={() => window.AppData.exportCsv(ROWS, "commissions-statement",
          [
            { k: "date",     l: "Date" },
            { k: "lead",     l: "Lead" },
            { k: "carrier",  l: "Carrier" },
            { k: "product",  l: "Product" },
            { k: "ap",       l: "AP",       fmt: (v) => v || 0 },
            { k: "pct",      l: "Comp %" },
            { k: "expected", l: "Expected", fmt: (v) => v || 0 },
            { k: "paid",     l: "Paid",     fmt: (v) => v || 0 },
            { k: "status",   l: "Status" },
          ])}><Icons.ArrowDown size={13}/> Export CSV</button>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Expected MTD" prefix="$" value={total.toLocaleString()} sub="across 7 issues" trend="up"/>
        <Shared.KpiCard label="Paid MTD" prefix="$" value={Math.max(0, paid).toLocaleString()} sub="advances + as-earned"/>
        <Shared.KpiCard label="In clearing" prefix="$" value={inClearing.toLocaleString()} sub="2 NIGO"/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Statement</h3><span className="meta">{ROWS.length} rows · this month</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 80px 60px 90px 90px 1fr" }}>
            <div>Date</div><div>Lead</div><div>Carrier</div><div>Product</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>%</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div>Status</div>
          </div>
          {ROWS.map((r, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 80px 60px 90px 90px 1fr" }}>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{r.date}</div>
              <div className="cell-truncate" style={{ fontWeight: 500 }}>{r.lead}</div>
              <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{r.carrier}</div>
              <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{r.product}</div>
              <div className="tabular" style={{ textAlign: "right" }}>{r.ap ? `$${r.ap.toLocaleString()}` : "—"}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.pct}%</div>
              <div className="tabular" style={{ textAlign: "right" }}><Money v={r.expected}/></div>
              <div className="tabular" style={{ textAlign: "right", color: r.paid < 0 ? "var(--state-danger)" : undefined }}><Money v={r.paid}/></div>
              <div><span className={`chip ${
                r.status === "paid" || r.status === "advance" ? "chip-money" :
                r.status === "as-earned" ? "chip-info" :
                r.status.startsWith("Chargeback") ? "chip-danger" : "chip-status"
              }`}>{r.status}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommissionsManager() {
  const { REPS } = AppData;
  // Aggregate buildStatement per rep — same comp% input flows up
  const perRep = REPS.map(r => {
    const rows = buildStatement({ repId: r.id });
    const issued = rows.filter(x => x.status === "paid" || x.status === "pending payout").length;
    const ap     = rows.reduce((a, x) => a + (x.ap || 0), 0);
    const expected = rows.reduce((a, x) => a + (x.expected || 0), 0);
    const paid    = rows.reduce((a, x) => a + Math.max(0, x.paid || 0), 0);
    const charge  = rows.filter(x => (x.paid || 0) < 0)?.reduce((a, x) => a + x.paid, 0);
    return { rep: r, issued, ap, expected, paid, ic: Math.max(0, expected - paid), charge };
  });
  const teamAp       = perRep.reduce((a, x) => a + x.ap, 0);
  const teamExpected = perRep.reduce((a, x) => a + x.expected, 0);
  const teamPaid     = perRep.reduce((a, x) => a + x.paid, 0);
  const teamIc       = Math.max(0, teamExpected - teamPaid);
  const teamCharge   = perRep.reduce((a, x) => a + x.charge, 0);

  // Fall back to demo numbers if no policies have been written yet
  const isEmpty = teamAp === 0 && teamExpected === 0;
  const display = isEmpty
    ? { ap: 295000, expected: 184260, paid: 142080, ic: 42180, charge: -11420 }
    : { ap: teamAp, expected: teamExpected, paid: teamPaid, ic: teamIc, charge: teamCharge };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Team rollup</div>
          <div className="page-sub">Per-producer ledger · computed from rep-entered comp % at deal-write</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team expected MTD" prefix="$" value={display.expected.toLocaleString()} sub={`across ${perRep.reduce((a, x) => a + x.issued, 0) || 14} issues`} trend="up"/>
        <Shared.KpiCard label="Team paid MTD" prefix="$" value={display.paid.toLocaleString()} sub="advances + as-earned"/>
        <Shared.KpiCard label="In clearing" prefix="$" value={display.ic.toLocaleString()} sub={isEmpty ? "14 apps" : "expected − paid"}/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(display.charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Producers · this month</h3><span className="meta">click rep to drill</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 70px 100px 110px 100px 100px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Issued</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div className="tabular" style={{ textAlign: "right" }}>In-clearing</div>
          </div>
          {perRep.map(({ rep, issued, ap, expected, paid, ic }) => {
            // Synthesize numbers when no real policies yet so the page isn't empty
            const fakeAp = rep.mtd;
            const fakePaid = Math.round(rep.mtd * 0.62);
            const showAp = isEmpty ? fakeAp : ap;
            const showExpected = isEmpty ? Math.round(rep.mtd * 0.5) : expected;
            const showPaid = isEmpty ? fakePaid : paid;
            const showIc = isEmpty ? Math.max(0, showExpected - showPaid) : ic;
            const showIssued = isEmpty ? Math.round(rep.mtd / 1800) : issued;
            return (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.6fr 70px 100px 110px 100px 100px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={rep} size={20}/>
                  <span style={{ fontWeight: 500 }}>{rep.name}</span>
                  <Shared.TierChip tier={rep.tier} compact/>
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>{showIssued}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${showAp.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>${showExpected.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${showPaid.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>${showIc.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommissionsOwner() {
  // Account-wide pool: union of every rep's deals → producer commissions →
  // implied override slice. Owner sets the override % below; everything moves.
  const { REPS } = AppData;
  const [overridePct, setOverridePct] = React.useState(20);  // owner's slice on top of producer comp
  const allRows = buildStatement();   // all reps
  const issued = allRows.filter(r => r.status === "paid" || r.status === "pending payout").length;
  const totalAp       = allRows.reduce((a, r) => a + (r.ap || 0), 0);
  const totalExpected = allRows.reduce((a, r) => a + (r.expected || 0), 0);
  const totalPaid     = allRows.reduce((a, r) => a + Math.max(0, r.paid || 0), 0);
  const overridePool  = Math.round(totalAp * overridePct / 100);
  const isEmpty = totalAp === 0;

  // Region split — rough: first 5 reps = Atlanta, rest = Tampa
  const regionRows = ["Atlanta region", "Tampa region"].map((name, i) => {
    const reps = REPS.slice(i === 0 ? 0 : 5, i === 0 ? 5 : undefined);
    const ids = new Set(reps.map(r => r.id));
    const rows = allRows.filter(r => {
      const pol = (AppData.POLICIES || []).find(p => p.id === r.policyId);
      return pol && ids.has(pol.owner);
    });
    const ap = rows.reduce((a, r) => a + (r.ap || 0), 0);
    const ovr = Math.round(ap * overridePct / 100);
    return { name, reps: reps.length, ap, ovr };
  });

  // Fallback display when no real deals
  const display = isEmpty
    ? { pool: 258420, net: 104700, paidOut: 412300, totalAp: 731000 }
    : { pool: overridePool, net: Math.round(overridePool * 0.4), paidOut: totalPaid, totalAp };

  // GAP-RP1 — CSV export of the per-rep statement powering the override pool
  const exportCommissions = () => {
    const headers = ["Period","Rep","Carrier","Lead","AP","Expected","Paid","Status"];
    const rows = allRows.map(r => {
      const pol = (AppData.POLICIES || []).find(p => p.id === r.policyId) || {};
      const rep = (AppData.REPS    || []).find(p => p.id === pol.owner)    || {};
      return [r.period || "", rep.name || "", pol.carrier || "", pol.lead || "", r.ap || 0, r.expected || 0, r.paid || 0, r.status || ""];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `commissions-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${rows.length} commission rows`, "success");
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Override pool</div>
          <div className="page-sub">Account-wide rollup · {issued || 14} issues this period · override % set by you below</div>
        </div>
        <button className="btn" onClick={exportCommissions} disabled={isEmpty} title={isEmpty ? "No commission rows to export" : "Download CSV of all commission rows"}>Export CSV</button>
      </div>
      <div className="kpi-row">
        <Shared.KpiCard hero label="Override pool · MTD" prefix="$" value={display.pool.toLocaleString()} sub={`${overridePct}% of $${display.totalAp.toLocaleString()} AP`} trend="up"/>
        <Shared.KpiCard label="Net to owner" prefix="$" value={display.net.toLocaleString()} sub="after lead spend + NIGO" trend="up"/>
        <Shared.KpiCard label="Paid to producers" prefix="$" value={display.paidOut.toLocaleString()} sub={`${REPS.length} producers`}/>
        <Shared.KpiCard label="Coverage" value={`${(display.pool / 100000).toFixed(2)}x`} sub="vs $100k goal" trend={display.pool >= 100000 ? "up" : "down"}/>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h"><Icons.Calculator size={13}/><h3>Owner override %</h3><span className="meta">applies to all producer AP</span></div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Override slice</span>
            <span className="tabular" style={{ fontSize: 14, fontWeight: 600 }}>{overridePct}%</span>
          </div>
          <input type="range" min={5} max={40} step={1} value={overridePct} onChange={(e) => setOverridePct(+e.target.value)} style={{ width: "100%" }}/>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            At {overridePct}%, every $1k of producer AP returns ${(overridePct * 10).toFixed(0)} to the owner pool. Rep comp % is set per-deal at write time.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>By region</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
            <div>Region</div>
            <div className="tabular" style={{ textAlign: "right" }}>Producers</div>
            <div className="tabular" style={{ textAlign: "right" }}>Total AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Override</div>
            <div></div>
          </div>
          {regionRows.map((r, i) => {
            const showAp  = isEmpty ? [412800, 318200][i] : r.ap;
            const showOvr = isEmpty ? [92420, 71390][i]   : r.ovr;
            const max     = Math.max(...regionRows.map(x => isEmpty ? Math.max(92420, 71390) : x.ovr), 1);
            return (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{r.reps}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${showAp.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${showOvr.toLocaleString()}</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                  <div style={{ width: `${(showOvr / max) * 100}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   4. Training — rep / mgr / owner
   ───────────────────────────────────────────────────────────────────────── */
/* ─── ProductTraining store ───────────────────────────────────────────────
   Persists three things to localStorage and broadcasts a "training:changed"
   event so every Training pane stays in sync after edits:
     • courses        — owner-authored library (sections + lessons)
     • progress       — per-rep, per-course completedLessons + completedAt
     • assignments    — manager assigns courseId → repIds with optional dueDate
   Status is derived (not stored) so the source of truth is always progress. */
const ProductTraining = (() => {
  const K_COURSES     = "repflow:product_training_courses";
  const K_PROGRESS    = "repflow:product_training_progress";
  const K_ASSIGNMENTS = "repflow:product_training_assignments";

  function seedCourses() {
    return (AppData.COURSES || []).map((c) => ({
      ...c,
      required: c.required ?? false,  // owners explicitly flag required after authoring lessons
      description: c.description || "",
      sections: c.sections || [],
    }));
  }
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (_e) {}
    return fallback;
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_e) {}
  }
  function broadcast() {
    window.dispatchEvent(new CustomEvent("training:changed"));
  }
  function loadCourses()     { return loadJSON(K_COURSES, seedCourses()); }
  function loadProgress()    { return loadJSON(K_PROGRESS, {}); }
  function loadAssignments() { return loadJSON(K_ASSIGNMENTS, []); }

  function totalLessons(course) {
    return (course.sections || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
  }
  function lessonIds(course) {
    const ids = [];
    (course.sections || []).forEach((s, si) => (s.lessons || []).forEach((_, li) => ids.push(`${si}.${li}`)));
    return ids;
  }
  function getProgress(progress, repId, courseId) {
    return (progress[repId] && progress[repId][courseId]) || { completedLessons: [], completedAt: null };
  }
  function deriveStatus(course, prog, assignment) {
    // Pure derivation from lessons + assignments. Ignore the legacy
    // course.status field — seed data sets it but it conflicts with the
    // progress-driven model (e.g. status:"complete" + zero lessons).
    const total = totalLessons(course);
    const done  = prog.completedLessons.length;
    if (total > 0 && done >= total) return "complete";
    if (done > 0) return "in-progress";
    if (assignment?.dueDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (assignment.dueDate < today) return "overdue";
    }
    if (assignment) return "assigned";
    if (course.required) return "due";  // required courses are implicitly assigned
    return "assigned";
  }
  function statusFor(repId, course, progress, assignments) {
    const prog = getProgress(progress, repId, course.id);
    const a    = assignments.find(x => x.courseId === course.id && (x.repIds || []).includes(repId));
    return deriveStatus(course, prog, a);
  }
  function percentFor(repId, course, progress) {
    // Progress is derived from lessons completed, period. Seed courses with
    // a legacy `status: "complete"` field but zero lessons must NOT report
    // 100% — that creates a "fully filled bar but status: due" mismatch.
    const total = totalLessons(course);
    if (total === 0) return 0;
    return Math.round((getProgress(progress, repId, course.id).completedLessons.length / total) * 100);
  }
  function isComplete(repId, course, progress) {
    return statusFor(repId, course, progress, []) === "complete";
  }

  // React hooks — every Training pane subscribes via these and re-renders on change.
  function useStore() {
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const onChange = () => force(n => n + 1);
      window.addEventListener("training:changed", onChange);
      return () => window.removeEventListener("training:changed", onChange);
    }, []);
    return {
      courses: loadCourses(),
      progress: loadProgress(),
      assignments: loadAssignments(),
      saveCourses: (next) => {
        const v = typeof next === "function" ? next(loadCourses()) : next;
        saveJSON(K_COURSES, v); broadcast();
      },
      saveProgress: (next) => {
        const v = typeof next === "function" ? next(loadProgress()) : next;
        saveJSON(K_PROGRESS, v); broadcast();
      },
      saveAssignments: (next) => {
        const v = typeof next === "function" ? next(loadAssignments()) : next;
        saveJSON(K_ASSIGNMENTS, v); broadcast();
      },
    };
  }

  function markLessonComplete(repId, courseId, lessonId) {
    const all = loadProgress();
    const repProg = all[repId] || {};
    const cur = repProg[courseId] || { completedLessons: [], completedAt: null };
    if (!cur.completedLessons.includes(lessonId)) {
      cur.completedLessons = [...cur.completedLessons, lessonId];
    }
    repProg[courseId] = cur;
    all[repId] = repProg;

    // Auto-flag completedAt when all lessons done.
    const courses = loadCourses();
    const course = courses.find(c => c.id === courseId);
    if (course) {
      const total = totalLessons(course);
      if (total > 0 && cur.completedLessons.length >= total && !cur.completedAt) {
        cur.completedAt = new Date().toISOString();
        all[repId][courseId] = cur;
      }
    }
    saveJSON(K_PROGRESS, all); broadcast();
  }

  function unmarkLessonComplete(repId, courseId, lessonId) {
    const all = loadProgress();
    const cur = (all[repId] || {})[courseId];
    if (!cur) return;
    cur.completedLessons = cur.completedLessons.filter(x => x !== lessonId);
    cur.completedAt = null;
    all[repId][courseId] = cur;
    saveJSON(K_PROGRESS, all); broadcast();
  }

  // Required course = required flag OR explicit assignment. Open = not yet complete.
  function requiredCoursesFor(repId, courses, progress, assignments) {
    return courses.filter(c => {
      if (c.required) return true;
      return assignments.some(a => a.courseId === c.id && (a.repIds || []).includes(repId));
    });
  }
  function openRequiredCount(repId, courses, progress, assignments) {
    return requiredCoursesFor(repId, courses, progress, assignments)
      .filter(c => totalLessons(c) > 0)  // ignore empty courses still being authored
      .filter(c => statusFor(repId, c, progress, assignments) !== "complete")
      .length;
  }

  return {
    useStore, totalLessons, lessonIds, getProgress, statusFor, percentFor, isComplete,
    requiredCoursesFor, openRequiredCount, markLessonComplete, unmarkLessonComplete,
  };
})();

/* ─── Embed helpers — accept Loom / YouTube / Vimeo / Wistia / direct mp4 ─ */
function toEmbedSrc(url = "") {
  const u = String(url).trim();
  if (!u) return "";
  const loom = u.match(/loom\.com\/share\/([a-z0-9]+)/i);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  const wist = u.match(/(?:wistia\.com\/(?:medias|embed)|wi\.st\/)\/?([a-z0-9]+)/i);
  if (wist) return `https://fast.wistia.net/embed/iframe/${wist[1]}`;
  return u;
}
function isDirectVideo(url = "") {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url) || url.startsWith("data:video/");
}
/* Pull a thumbnail from a YouTube URL when we can — Vimeo/Loom/Wistia thumbnails
   require an API call so we let those fall through to a placeholder. */
function thumbFromUrl(url = "") {
  const u = String(url).trim();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  return "";
}
function detectVideoSourceLabel(url = "") {
  const u = String(url).toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "YouTube";
  if (/vimeo\.com/.test(u))             return "Vimeo";
  if (/loom\.com/.test(u))              return "Loom";
  if (/wistia\.com|wi\.st/.test(u))     return "Wistia";
  if (isDirectVideo(u))                  return "Direct";
  return "Embed";
}

const COURSE_TRACKS = ["Onboarding", "FE", "Med Supp", "AEP", "Life", "Annuity", "Compliance"];

/* ─────────────────────────────────────────────────────────────────────────
   4. Training — unified hub: Call Coaching · Call Library · Product Training
   The legacy /coaching route in index.html now lands here with defaultTab="coaching".
   ───────────────────────────────────────────────────────────────────────── */
function PageTraining({ role = "rep", defaultTab = "coaching" }) {
  const [tab, setTab] = React.useState(defaultTab);
  const store = ProductTraining.useStore();
  // Guard: empty REPS (fresh agency, pre-hydrate) must not crash the page.
  const meId = (window.me && window.me()?.rep_id) || AppData.REPS[0]?.id || null;
  const requiredOpen = meId ? ProductTraining.openRequiredCount(meId, store.courses, store.progress, store.assignments) : 0;

  const tabs = [
    { k: "coaching", l: "Call Coaching",    icon: "Activity" },
    { k: "library",  l: "Call Library",     icon: "Headset" },
    { k: "product",  l: "Product Training", icon: "Book", badge: role === "rep" && requiredOpen > 0 ? requiredOpen : undefined },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Training</div>
          <div className="page-sub">
            {tab === "coaching" && "Coaching cards · scorecards · drill replays"}
            {tab === "library"  && "Recorded calls · waveform · AI scoring"}
            {tab === "product"  && (role === "owner" ? "Course library · authoring · required onboarding" : "Courses · videos · scripts · cert progress")}
          </div>
        </div>
      </div>

      <div className="training-tabs section-pill">
        {tabs.map(t => {
          const Ic = Icons[t.icon];
          return (
            <button key={t.k} className={tab === t.k ? "active" : ""} onClick={() => setTab(t.k)}>
              <Ic size={12} style={{ marginRight: 6, verticalAlign: "middle" }}/>
              {t.l}
              {t.badge != null && <span className="badge tabular" style={{ marginLeft: 6, fontSize: 10 }}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {tab === "coaching" && <CoachingPane role={role}/>}
      {tab === "library"  && <CallLibraryPane role={role}/>}
      {tab === "product"  && <ProductTrainingPane role={role} store={store} meId={meId} requiredOpen={requiredOpen}/>}
    </div>
  );
}

/* Defer to the existing PageCoaching — it already handles all three roles.
   We strip its outer page-pad since we're already inside one. */
function CoachingPane({ role }) {
  // Render the role-specific inner component (CoachingRep / CoachingManager /
  // CoachingOwner) directly. The .training-embed class hides the duplicate
  // page-h title AND the manager's inner dashboard SectionPill (which would
  // otherwise surface unrelated nav links: Floor / NIGO / Dispatch).
  const Inner = role === "manager" ? window.CoachingManager
              : role === "owner"   ? window.CoachingOwner
              : window.CoachingRep;
  const Fallback = window.PageCoaching;
  if (!Inner && !Fallback) return <div style={{ padding: 30, color: "var(--text-tertiary)" }}>Coaching module loading…</div>;
  return (
    <div className="training-embed">
      {Inner ? <Inner/> : <Fallback role={role}/>}
    </div>
  );
}

function CallLibraryPane({ role }) {
  const { RECORDINGS, REPS } = AppData;
  const meId = REPS[0].id;
  const visible = role === "rep" ? RECORDINGS.filter(r => !r.repId || r.repId === meId) : RECORDINGS;

  const [selId, setSelId] = React.useState(visible[0]?.id);
  const [q, setQ]         = React.useState("");
  const filtered = visible.filter(r => !q || r.lead.toLowerCase().includes(q.toLowerCase()));
  const sel = filtered.find(r => r.id === selId) || filtered[0];

  return (
    <div className="calls-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h">
          <h3>Recordings</h3>
          <span className="meta">{filtered.length}</span>
          <input className="text-input" style={{ width: 140, marginLeft: "auto", fontSize: 11.5 }} placeholder="Search lead…" value={q} onChange={(e) => setQ(e.target.value)}/>
        </div>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" }}>
          {filtered.map(r => (
            <button key={r.id} onClick={() => setSelId(r.id)} className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 10, background: sel?.id === r.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <strong style={{ fontSize: 12.5 }}>{r.lead}</strong>
                <span className="tabular" style={{ color: r.score >= 80 ? "var(--accent-money)" : r.score >= 60 ? "var(--state-warning)" : "var(--state-danger)", fontSize: 11.5 }}>{r.score}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)", fontSize: 11 }}>
                <span>{r.date}</span>
                <span className="mono">{Math.floor(r.durSec / 60)}:{String(r.durSec % 60).padStart(2, "0")}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 20, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>No recordings match.</div>}
        </div>
      </div>

      {sel && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel.lead} · score {sel.score}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Summarize the call with ${sel.lead} and grade my open-ended question rate`, context: "Call · " + sel.lead }}))}><Icons.Sparkles size={11}/> Analyze</button>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
              <span className="mono">00:00</span>
              <div style={{ flex: 1, height: 36, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                <svg width="100%" height="36" viewBox="0 0 240 36" preserveAspectRatio="none">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 4 + Math.abs(Math.sin(i * 0.5 + (sel.id?.length || 0))) * 26 + (i % 7 === 0 ? 4 : 0);
                    return <rect key={i} x={i * 3} y={(36 - h) / 2} width="1.6" height={h} fill={i < 48 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                  })}
                </svg>
              </div>
              <span className="mono">{Math.floor(sel.durSec / 60)}:{String(sel.durSec % 60).padStart(2, "0")}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`chip ${sel.talkRatio < 50 ? "chip-money" : "chip-status"}`}>Talk: {sel.talkRatio}%</span>
              <span className="chip">Open Q: {sel.openQ}</span>
              <span className={`chip ${sel.flags?.tpmo === "ok" ? "chip-money" : "chip-status"}`}>TPMO {sel.flags?.tpmo === "ok" ? "✓" : "?"}</span>
              <span className={`chip ${sel.flags?.soa === "captured" || sel.flags?.soa === "scheduled" ? "chip-money" : ""}`}>SOA {sel.flags?.soa}</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel.ai}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductTrainingPane({ role, store, meId, requiredOpen }) {
  if (role === "owner")   return <ProductTrainingOwner store={store}/>;
  if (role === "manager") return <ProductTrainingManager store={store}/>;
  return <ProductTrainingRep store={store} meId={meId} requiredOpen={requiredOpen}/>;
}

/* ─── Default video library + scripts library ─────────────────────────────
   Both seed lists. The user's library is `seeds + localStorage extras`,
   merged at render time. Owner can edit via TrainingOwner authoring view. */
// Placeholder cards — owners paste real training URLs via TrainingOwner authoring view.
// src intentionally empty so the embed renders an empty state, not a placeholder video.
const DEFAULT_VIDEOS = [
  { id: "v-medg",  title: "Med Supp · Plan G — opening + objections",  cat: "Med Supp",      durMin: 12, src: "", thumb: "" },
  { id: "v-fe",    title: "Final Expense — empathy & emotional setup", cat: "Final Expense", durMin: 18, src: "", thumb: "" },
  { id: "v-aep",   title: "AEP — fast switch reasons that close",      cat: "AEP",           durMin: 9,  src: "", thumb: "" },
  { id: "v-iul",   title: "IUL — target premium vs annual premium",    cat: "Life",          durMin: 22, src: "", thumb: "" },
  { id: "v-tpmo",  title: "TPMO disclosure — verbatim walkthrough",    cat: "Compliance",    durMin: 6,  src: "", thumb: "" },
  { id: "v-cross", title: "Cross-sell — Med Supp → FE in one call",    cat: "Med Supp",      durMin: 14, src: "", thumb: "" },
];

const DEFAULT_SCRIPTS = [
  { id: "s-medg",   title: "Med Supp — Plan G open",       cat: "Open",       version: "v3.1", updated: "2d ago", body: `Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate. Quick question — when you turn the page on next year's premium, are you most concerned about the monthly cost or the network freedom?` },
  { id: "s-fe",     title: "Final Expense — empathy",       cat: "Open",       version: "v2.4", updated: "1w ago", body: `Most of my clients tell me the hardest part isn't paying for a policy, it's the thought of leaving the people they love with a bill on top of grief. Can I ask — if something happened tomorrow, who would you not want to leave that burden on?` },
  { id: "s-tpmo",   title: "TPMO disclosure (verbatim)",   cat: "Compliance", version: "v1.0", updated: "3w ago", body: `We do not offer every plan available in your area. Currently we represent {{n_orgs}} organizations which offer {{n_plans}} products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.` },
  { id: "s-annuity",title: "Annuity — fact-find",           cat: "Discovery",  version: "v1.7", updated: "5d ago", body: `Before I quote anything, I need to understand your timeline. The money you're considering — is this for income within the next 5 years, or is it cushion for ten-plus years out?` },
  { id: "s-xsell",  title: "Cross-sell — FE → Med Supp",   cat: "Cross-sell", version: "v2.0", updated: "1d ago", body: `Now that we've taken care of the final expense piece, the other coverage gap I usually see is on the medical side. With Plan G, your Medicare-approved costs after deductible would be zero. Want me to pull a quick rate?` },
  { id: "s-aep",    title: "AEP — switch reasons",          cat: "Open",       version: "v4.2", updated: "Today",   body: `Three reasons people switch during AEP: (1) the drug list changed, (2) their doctor dropped, (3) the premium jumped. Which of those is hitting you hardest this year?` },
];

const VIDEO_CATS  = ["All", "Med Supp", "Final Expense", "AEP", "Life", "Compliance"];
const SCRIPT_CATS = ["All", "Open", "Discovery", "Cross-sell", "Compliance"];

function useLocalArray(key, seed) {
  const [items, setItems] = React.useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_e) {}
    return seed;
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (_e) {}
  }, [items]);
  return [items, setItems];
}

function VideoLibrary({ canEdit = true }) {
  // Resource data is now agency-shared via AppData.VIDEOS (migration 0010);
  // fall back to seed when nothing has been added yet so the page never
  // renders empty for fresh agencies.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
  const live   = (window.AppData && window.AppData.VIDEOS) || [];
  const videos = live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_VIDEOS : []);
  const [cat, setCat]             = React.useState("All");
  const [q, setQ]                 = React.useState("");
  const [sel, setSel]             = React.useState(null);
  const [editing, setEditing]     = React.useState(null);  // {id?, title, cat, durMin, url}
  const filtered = videos.filter(v =>
    (cat === "All" || v.cat === cat) &&
    (!q || v.title.toLowerCase().includes(q.toLowerCase()))
  );

  const startNew  = () => setEditing({ id: null, title: "", cat: "Med Supp", durMin: "", url: "" });
  const startEdit = (v) => {
    const guess = v.src && v.src.includes("/embed/")
      ? v.src.replace("youtube.com/embed/", "youtube.com/watch?v=").replace("player.vimeo.com/video/", "vimeo.com/")
      : v.sourceUrl || v.src;
    setEditing({ id: v.id, title: v.title, cat: v.cat, durMin: v.durMin || "", url: guess || "" });
  };
  const saveVideo = async () => {
    const url = (editing.url || "").trim();
    if (!editing.title.trim() || !url) return;
    const src = toEmbedSrc(url);
    const thumb = thumbFromUrl(url) || editing.thumb || "";
    try {
      await window.AppData.mutate.videoUpsert({
        id: editing.id,
        title: editing.title.trim(),
        cat: editing.cat,
        durMin: +editing.durMin || 0,
        src, thumb,
        sourceUrl: url,
        sourceLabel: detectVideoSourceLabel(url),
      });
      window.toast && window.toast(editing.id ? "Video updated" : "Video added", "success");
      setEditing(null);
    } catch (_e) {
      // toast already raised by mutator
    }
  };
  const removeVideo = async (id) => {
    if (sel?.id === id) setSel(null);
    try { await window.AppData.mutate.videoDelete(id); window.toast && window.toast("Video removed", "info"); }
    catch (_e) {}
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Video size={13}/>
        <h3>Video library</h3>
        <span className="meta">{filtered.length} of {videos.length}</span>
        <input className="text-input" style={{ width: 220, marginLeft: "auto" }} placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)}/>
        {canEdit && (
          <button className="btn btn-primary" onClick={startNew}><Icons.Plus size={12}/> Add video</button>
        )}
      </div>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {VIDEO_CATS.map(c => (
          <button key={c} className="btn btn-ghost" onClick={() => setCat(c)}
            style={{ padding: "4px 10px", fontSize: 11.5, background: cat === c ? "var(--bg-raised)" : "transparent", color: cat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {c}
          </button>
        ))}
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {filtered.map(v => (
          <div key={v.id} style={{ background: "var(--bg-raised)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)", position: "relative" }}>
            <div onClick={() => setSel(v)} style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)", cursor: "pointer" }}>
              {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icons.Play size={16} style={{ color: "white", marginLeft: 2 }}/>
                </div>
              </div>
              {v.durMin > 0 && <div style={{ position: "absolute", bottom: 6, right: 6, padding: "2px 6px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 10.5, color: "white" }}>{v.durMin}m</div>}
              {v.sourceLabel && <div style={{ position: "absolute", top: 6, left: 6, padding: "2px 6px", background: "rgba(0,0,0,0.55)", borderRadius: 3, fontSize: 9.5, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>{v.sourceLabel}</div>}
            </div>
            <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12.5 }} className="cell-truncate">{v.title}</div>
                <div style={{ marginTop: 4 }}><span className="chip">{v.cat}</span></div>
              </div>
              {canEdit && (
                <>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(v); }} title="Edit"><Icons.Edit size={11}/></button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); removeVideo(v.id); }} title="Remove" style={{ color: "var(--state-danger)" }}><Icons.X size={11}/></button>
                </>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No videos match your filter. {canEdit && <span>Click <strong style={{ color: "var(--text-secondary)" }}>Add video</strong> to paste a YouTube / Vimeo / Loom / Wistia URL.</span>}
          </div>
        )}
      </div>

      {sel && (
        <Shared.Modal title={sel.title} width={800} onClose={() => setSel(null)}>
          {isDirectVideo(sel.src) ? (
            <video src={sel.src} controls autoPlay style={{ width: "100%", borderRadius: 6, background: "black" }}/>
          ) : (
            <div style={{ position: "relative", paddingTop: "56.25%", background: "black", borderRadius: 6, overflow: "hidden" }}>
              <iframe src={sel.src} title={sel.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}/>
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            <Icons.Clock size={11}/> {sel.durMin || 0} min · <span className="chip">{sel.cat}</span>
            {sel.sourceLabel && <span className="chip" style={{ fontSize: 9.5 }}>{sel.sourceLabel}</span>}
          </div>
        </Shared.Modal>
      )}

      {editing && (
        <Shared.Modal title={editing.id ? "Edit video" : "Add video to library"} width={560} onClose={() => setEditing(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <Shared.Field label="Video URL (YouTube / Vimeo / Loom / Wistia / direct .mp4)">
              <input className="text-input" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/… etc."
                autoFocus={!editing.id}/>
            </Shared.Field>
            <Shared.Field label="Title">
              <input className="text-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Plan G — opening line walkthrough"/>
            </Shared.Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
              <Shared.Field label="Category">
                <Shared.Select value={editing.cat} onChange={(v) => setEditing({ ...editing, cat: v })}
                  options={VIDEO_CATS.filter(c => c !== "All").map(c => ({ v: c, l: c }))}/>
              </Shared.Field>
              <Shared.Field label="Length (min)">
                <input className="text-input" type="number" value={editing.durMin} onChange={(e) => setEditing({ ...editing, durMin: e.target.value })} placeholder="12"/>
              </Shared.Field>
            </div>
            {editing.url && (
              <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                <strong style={{ color: "var(--text-secondary)" }}>{detectVideoSourceLabel(editing.url)}</strong> · embed src: <code style={{ wordBreak: "break-all" }}>{toEmbedSrc(editing.url)}</code>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!editing.title.trim() || !editing.url.trim()} onClick={saveVideo}>
              {editing.id ? "Save" : "Add to library"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

function ScriptsLibrary() {
  // Agency-shared via AppData.SCRIPTS_LIB (migration 0010); seed fallback for
  // empty agencies so the page renders content immediately.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);
  const live    = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const scripts = live.length > 0 ? live : (window.isDemoAgency && window.isDemoAgency() ? DEFAULT_SCRIPTS : []);
  const [cat, setCat]             = React.useState("All");
  const [q, setQ]                 = React.useState("");
  const [openId, setOpenId]       = React.useState(null);
  const [editing, setEditing]     = React.useState(null);   // {id?, title, cat, body}
  const [copyToast, setCopyToast] = React.useState(null);

  const filtered = scripts.filter(s =>
    (cat === "All" || s.cat === cat) &&
    (!q || s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()))
  );
  const open = openId ? scripts.find(s => s.id === openId) : null;

  const startNew  = () => setEditing({ id: null, title: "", cat: "Open", body: "" });
  const startEdit = (s) => setEditing({ id: s.id, title: s.title, cat: s.cat, body: s.body });
  const save = async () => {
    if (!editing.title.trim() || !editing.body.trim()) return;
    try {
      await window.AppData.mutate.scriptUpsert({
        id: editing.id,
        title: editing.title.trim(),
        cat: editing.cat,
        body: editing.body,
      });
      window.toast && window.toast(editing.id ? "Script updated" : "Script added", "success");
      setEditing(null);
    } catch (_e) {}
  };
  const remove = async (id) => {
    if (openId === id) setOpenId(null);
    try { await window.AppData.mutate.scriptDelete(id); window.toast && window.toast("Script removed", "info"); }
    catch (_e) {}
  };
  const copyBody = async (s) => {
    try {
      await navigator.clipboard.writeText(s.body);
      setCopyToast(s.id);
      setTimeout(() => setCopyToast(null), 1400);
    } catch (_e) {
      window.toast && window.toast("Copy blocked by browser", "warn");
    }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.FileText size={13}/>
        <h3>Scripts library</h3>
        <span className="meta">{filtered.length} of {scripts.length}</span>
        <input className="text-input" style={{ width: 200, marginLeft: "auto" }} placeholder="Search title or body…" value={q} onChange={(e) => setQ(e.target.value)}/>
        <button className="btn btn-primary" onClick={startNew}><Icons.Plus size={12}/> New</button>
      </div>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SCRIPT_CATS.map(c => (
          <button key={c} className="btn btn-ghost" onClick={() => setCat(c)}
            style={{ padding: "4px 10px", fontSize: 11.5, background: cat === c ? "var(--bg-raised)" : "transparent", color: cat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: open ? "1fr 1.4fr" : "1fr", gap: 0 }}>
        <div className="list" style={{ borderRight: open ? "1px solid var(--border-subtle)" : "none" }}>
          {filtered.map(s => (
            <div key={s.id} className="row" style={{ gridTemplateColumns: "1.4fr 90px 80px 90px", height: 40, cursor: "pointer", background: openId === s.id ? "var(--bg-raised)" : undefined }}
              onClick={() => setOpenId(s.id)}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 12.5 }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.version} · {s.updated}</div>
              </div>
              <div><span className="chip">{s.cat}</span></div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{s.body.split(" ").length}w</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copyBody(s); }} title="Copy">
                  {copyToast === s.id ? <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/> : <Icons.Copy size={11}/>}
                </button>
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(s); }} title="Edit"><Icons.Edit size={11}/></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No scripts match your filter.
            </div>
          )}
        </div>

        {open && (
          <div style={{ padding: 16, background: "var(--bg-elevated)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{open.title}</strong>
              <span className="meta" style={{ fontSize: 11 }}>{open.version} · {open.updated}</span>
            </div>
            <div style={{ marginBottom: 12 }}><span className="chip">{open.cat}</span></div>
            <div style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {open.body}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
              Variables: <code style={{ fontSize: 11 }}>{`{{lead_name}}`}</code> · <code style={{ fontSize: 11 }}>{`{{rep_first}}`}</code> · <code style={{ fontSize: 11 }}>{`{{n_orgs}}`}</code> are filled at speak-time on the dialer.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => remove(open.id)} style={{ color: "var(--state-danger)" }}>
                <Icons.X size={11}/> Delete
              </button>
              <button className="btn" onClick={() => copyBody(open)}>
                {copyToast === open.id ? <><Icons.Check size={11}/> Copied</> : <><Icons.Copy size={11}/> Copy</>}
              </button>
              <button className="btn btn-primary" onClick={() => startEdit(open)}>
                <Icons.Edit size={11}/> Edit
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <Shared.Modal title={editing.id ? "Edit script" : "New script"} width={620} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!editing.title.trim() || !editing.body.trim()}>
              <Icons.Check size={11}/> {editing.id ? "Save" : "Add"}
            </button>
          </>
        }>
          <Shared.Field label="Title">
            <input className="text-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Med Supp · Plan G open" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Category">
            <Shared.Select value={editing.cat} onChange={(v) => setEditing({ ...editing, cat: v })} options={SCRIPT_CATS.filter(c => c !== "All").map(c => ({ v: c, l: c }))}/>
          </Shared.Field>
          <Shared.Field label="Body">
            <textarea className="text-input" rows={10} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder={`Hi {{lead_name}}, this is {{rep_first}} with Atlas...`}
              style={{ width: "100%", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}/>
          </Shared.Field>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Use <code style={{ fontSize: 11 }}>{`{{lead_name}}`}</code> / <code style={{ fontSize: 11 }}>{`{{rep_first}}`}</code> for runtime substitution.
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ─── Status chip helper used across rep/manager/owner views ─────────── */
const STATUS_CHIP_CLASS = {
  "complete":    "chip-money",
  "in-progress": "chip-info",
  "due":         "chip-status",
  "overdue":     "chip-status",
  "assigned":    "",
};
function StatusChip({ status }) {
  return <span className={`chip ${STATUS_CHIP_CLASS[status] || ""}`} style={status === "overdue" ? { color: "var(--state-danger)", borderColor: "var(--state-danger)" } : undefined}>{status}</span>;
}

/* ─── Reusable course list with real progress bars ────────────────────── */
function CourseList({ courses, store, repId, onOpen, showRequiredFlag }) {
  return (
    <div className="list">
      <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 90px 1fr 110px 110px" }}>
        <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div>Progress</div><div>Status</div><div></div>
      </div>
      {courses.map(c => {
        const status = ProductTraining.statusFor(repId, c, store.progress, store.assignments);
        const pct    = ProductTraining.percentFor(repId, c, store.progress);
        const cta    = status === "complete" ? "Review" : (pct > 0 ? "Resume" : "Start");
        return (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 90px 1fr 110px 110px" }}>
            <div>
              <div style={{ fontWeight: 500 }}>{c.title}</div>
              {showRequiredFlag && c.required && <div style={{ fontSize: 10.5, color: "var(--accent-status)", marginTop: 2 }}>required</div>}
            </div>
            <div><span className="chip">{c.track}</span></div>
            <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12 }}>
              <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}></div>
              </div>
              <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 30, textAlign: "right" }}>{pct}%</span>
            </div>
            <div><StatusChip status={status}/></div>
            <div><button className="btn btn-ghost" onClick={() => onOpen(c)}><Icons.Play size={11}/> {cta}</button></div>
          </div>
        );
      })}
      {courses.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No courses here.</div>
      )}
    </div>
  );
}

/* ─── Course viewer (rep) — walks sections + lessons, marks complete ──── */
function CourseViewerModal({ course, repId, store, onClose }) {
  const sections = course.sections || [];
  const lessons = sections.flatMap((s, si) => (s.lessons || []).map((l, li) => ({ ...l, _sec: s.title, _i: `${si}.${li}` })));
  const total = lessons.length;
  const prog  = ProductTraining.getProgress(store.progress, repId, course.id);

  // Resume at first incomplete lesson, else 0.
  const initial = Math.max(0, lessons.findIndex(l => !prog.completedLessons.includes(l._i)));
  const [idx, setIdx] = React.useState(initial === -1 ? 0 : initial);
  const lesson = lessons[idx];
  const isDone = lesson ? prog.completedLessons.includes(lesson._i) : false;
  const completedCount = prog.completedLessons.length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  const toggle = () => {
    if (!lesson) return;
    if (isDone) ProductTraining.unmarkLessonComplete(repId, course.id, lesson._i);
    else        ProductTraining.markLessonComplete(repId,   course.id, lesson._i);
    if (!isDone && idx < lessons.length - 1) setIdx(idx + 1);  // auto-advance on complete
  };

  return (
    <Shared.Modal title={course.title} width={920} onClose={onClose}>
      {total === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          This course doesn't have any lessons yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
            <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--accent-money)" : "var(--accent-status)" }}></div>
            </div>
            <span className="tabular">{completedCount} of {total} complete · {pct}%</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14, minHeight: 420 }}>
            <div style={{ borderRight: "1px solid var(--border-subtle)", paddingRight: 12, maxHeight: 460, overflowY: "auto" }}>
              {sections.map((s, si) => (
                <div key={si} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)", marginBottom: 4 }}>{s.title}</div>
                  {(s.lessons || []).map((l, li) => {
                    const lid = `${si}.${li}`;
                    const flat = lessons.findIndex(x => x._i === lid);
                    const done = prog.completedLessons.includes(lid);
                    return (
                      <button key={li} onClick={() => setIdx(flat)} className="btn btn-ghost"
                        style={{ display: "flex", justifyContent: "flex-start", width: "100%", padding: "6px 8px", fontSize: 12, background: flat === idx ? "var(--bg-raised)" : "transparent", marginBottom: 2, gap: 6 }}>
                        {done
                          ? <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/>
                          : <Icons.Play size={10} style={{ color: "var(--text-tertiary)" }}/>}
                        <span style={{ flex: 1, textAlign: "left", color: done ? "var(--text-tertiary)" : "var(--text-primary)" }}>{l.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div>
              {lesson && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{lesson._sec}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{lesson.title}</div>
                  {lesson.videoUrl ? (
                    isDirectVideo(lesson.videoUrl) ? (
                      <video src={lesson.videoUrl} controls style={{ width: "100%", borderRadius: 6, background: "black" }}/>
                    ) : (
                      <div style={{ position: "relative", paddingTop: "56.25%", background: "black", borderRadius: 6, overflow: "hidden" }}>
                        <iframe src={toEmbedSrc(lesson.videoUrl)} title={lesson.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}/>
                      </div>
                    )
                  ) : (
                    <div style={{ padding: 30, textAlign: "center", background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 13 }}>
                      No video on this lesson yet.
                    </div>
                  )}
                  {lesson.description && (
                    <div style={{ marginTop: 12, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                      {lesson.description}
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                    <button className="btn" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>
                      <Icons.ArrowRight size={11} style={{ transform: "rotate(180deg)" }}/> Previous
                    </button>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Lesson {idx + 1} of {total}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={isDone ? "btn" : "btn btn-primary"} onClick={toggle}>
                        {isDone ? <><Icons.X size={11}/> Mark incomplete</> : <><Icons.Check size={11}/> Mark complete</>}
                      </button>
                      <button className="btn" disabled={idx === lessons.length - 1} onClick={() => setIdx(i => Math.min(lessons.length - 1, i + 1))}>
                        Next <Icons.ArrowRight size={11}/>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Shared.Modal>
  );
}

/* ─── Rep · Product Training ──────────────────────────────────────────── */
function ProductTrainingRep({ store, meId, requiredOpen }) {
  const [tab, setTab] = React.useState("courses");
  const [openCourse, setOpenCourse] = React.useState(null);

  const required = ProductTraining.requiredCoursesFor(meId, store.courses, store.progress, store.assignments);
  const optional = store.courses.filter(c => !required.includes(c));
  const activeCount = store.courses.filter(c => ProductTraining.statusFor(meId, c, store.progress, store.assignments) !== "complete")?.length;

  return (
    <>
      {requiredOpen > 0 && (
        <div style={{ marginBottom: 12, padding: 12, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid var(--accent-status)", borderRadius: 6, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <Icons.Bell size={14} style={{ color: "var(--accent-status)" }}/>
          <div style={{ flex: 1 }}>
            <strong>{requiredOpen}</strong> required onboarding course{requiredOpen === 1 ? "" : "s"} remaining. Complete these before taking your first live calls.
          </div>
        </div>
      )}

      <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2, width: "fit-content", marginBottom: 12 }}>
        {[
          { k: "courses", l: "Courses",  icon: "Book" },
          { k: "videos",  l: "Videos",   icon: "Video" },
          { k: "scripts", l: "Scripts",  icon: "FileText" },
        ].map(t => {
          const Ic = Icons[t.icon];
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className="btn btn-ghost"
              style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, background: tab === t.k ? "var(--bg-raised)" : "transparent", color: tab === t.k ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              <Ic size={12}/> {t.l}
            </button>
          );
        })}
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Required remaining" value={requiredOpen} sub={requiredOpen === 0 ? "onboarding complete" : "must finish"}/>
        <Shared.KpiCard label="Active courses" value={activeCount}/>
        <Shared.KpiCard label="Cert progress" value="62%" sub="AEP 2026 cert" trend="up"/>
        <Shared.KpiCard label="CE hours · YTD" value="14.5"/>
      </div>

      {tab === "courses" && (
        <>
          {required.length > 0 && (
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="panel-h">
                <Icons.Shield size={13} style={{ color: "var(--accent-status)" }}/>
                <h3>Required onboarding</h3>
                <span className="meta">{required.filter(c => ProductTraining.statusFor(meId, c, store.progress, store.assignments) === "complete")?.length} of {required.length} complete</span>
              </div>
              <CourseList courses={required} store={store} repId={meId} onOpen={setOpenCourse}/>
            </div>
          )}
          <div className="panel">
            <div className="panel-h"><Icons.Book size={13}/><h3>My courses</h3></div>
            <CourseList courses={optional} store={store} repId={meId} onOpen={setOpenCourse}/>
          </div>
        </>
      )}

      {tab === "videos"  && <VideoLibrary canEdit={role !== "rep"}/>}
      {tab === "scripts" && <ScriptsLibrary/>}

      {openCourse && <CourseViewerModal course={openCourse} repId={meId} store={store} onClose={() => setOpenCourse(null)}/>}
    </>
  );
}

/* ─── Manager · Product Training ─────────────────────────────────────── */
function ProductTrainingManager({ store }) {
  const { REPS } = AppData;
  const [showAssign, setShowAssign] = React.useState(false);

  // Per-rep: # required courses overdue or stuck.
  const atRisk = REPS.map(r => {
    const required = ProductTraining.requiredCoursesFor(r.id, store.courses, store.progress, store.assignments);
    const overdue  = required.filter(c => ProductTraining.statusFor(r.id, c, store.progress, store.assignments) === "overdue");
    const open     = required.filter(c => ProductTraining.statusFor(r.id, c, store.progress, store.assignments) !== "complete");
    return { rep: r, overdue, open };
  }).filter(x => x.overdue.length > 0 || (x.open.length >= 2));

  // Avg completion rate column per rep across all courses.
  const repAvg = (rep) => {
    if (store.courses.length === 0) return 0;
    const sum = store.courses.reduce((a, c) => a + ProductTraining.percentFor(rep.id, c, store.progress), 0);
    return Math.round(sum / store.courses.length);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 6 }}>
        <button className="btn btn-primary" onClick={() => setShowAssign(true)}><Icons.Plus size={13}/> Assign course</button>
      </div>

      {atRisk.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-h">
            <Icons.Bell size={13} style={{ color: "var(--state-danger)" }}/>
            <h3>At-risk producers</h3>
            <span className="meta">{atRisk.length} need attention</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px 140px" }}>
              <div>Producer</div><div>Concern</div><div className="tabular" style={{ textAlign: "right" }}>Overdue</div><div className="tabular" style={{ textAlign: "right" }}>Open req.</div><div></div>
            </div>
            {atRisk.map(({ rep, overdue, open }) => (
              <div key={rep.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px 140px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={rep} size={20}/>
                  <span style={{ fontWeight: 500 }}>{rep.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {overdue.length > 0 ? overdue.map(c => c.title).slice(0, 2).join(" · ") : "Multiple open required courses"}
                </div>
                <div className="tabular" style={{ textAlign: "right", color: overdue.length > 0 ? "var(--state-danger)" : "var(--text-tertiary)" }}>{overdue.length}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{open.length}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => window.toast && window.toast(`Check-in sent to ${rep.name.split(" ")[0]}`, "success")}><Icons.MessageSquare size={11}/> Check in</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h"><h3>Enrollment matrix</h3><span className="meta">{REPS.length} producers × {store.courses.length} courses</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: `1.4fr repeat(${store.courses.length}, 1fr) 80px` }}>
            <div>Producer</div>
            {store.courses.map(c => <div key={c.id} className="cell-truncate" style={{ fontSize: 11 }} title={c.title}>{c.title}</div>)}
            <div className="tabular" style={{ textAlign: "right" }}>Avg %</div>
          </div>
          {REPS.map(rep => (
            <div key={rep.id} className="row" style={{ gridTemplateColumns: `1.4fr repeat(${store.courses.length}, 1fr) 80px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={rep} size={20}/>
                <span style={{ fontWeight: 500 }}>{rep.name}</span>
              </div>
              {store.courses.map(c => {
                const status = ProductTraining.statusFor(rep.id, c, store.progress, store.assignments);
                const pct    = ProductTraining.percentFor(rep.id, c, store.progress);
                return (
                  <div key={c.id} title={`${c.title} · ${pct}%`}>
                    <span className={`chip ${STATUS_CHIP_CLASS[status] || ""}`} style={status === "overdue" ? { color: "var(--state-danger)", borderColor: "var(--state-danger)" } : undefined}>
                      {pct > 0 && pct < 100 ? `${pct}%` : status}
                    </span>
                  </div>
                );
              })}
              <div className="tabular" style={{ textAlign: "right", color: repAvg(rep) >= 80 ? "var(--accent-money)" : repAvg(rep) >= 50 ? "var(--text-secondary)" : "var(--state-warning)" }}>{repAvg(rep)}%</div>
            </div>
          ))}
        </div>
      </div>

      {showAssign && <AssignCourseModal store={store} onClose={() => setShowAssign(false)}/>}
    </>
  );
}

/* ─── Manager · Assign Course modal ───────────────────────────────────── */
function AssignCourseModal({ store, onClose }) {
  const { REPS } = AppData;
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || "");
  const [repIds, setRepIds]     = React.useState([]);
  const [dueDate, setDueDate]   = React.useState("");
  const toggle = (id) => setRepIds(rs => rs.includes(id) ? rs.filter(x => x !== id) : [...rs, id]);

  const save = () => {
    if (!courseId || repIds.length === 0) return;
    const a = {
      id: "asgn-" + Date.now(),
      courseId,
      repIds,
      dueDate: dueDate || null,
      assignedAt: new Date().toISOString(),
    };
    store.saveAssignments(prev => [...prev, a]);
    window.toast && window.toast(`Assigned to ${repIds.length} producer${repIds.length === 1 ? "" : "s"}`, "success");
    onClose();
  };

  return (
    <Shared.Modal title="Assign course" width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!courseId || repIds.length === 0}>
          <Icons.Check size={11}/> Assign
        </button>
      </>
    }>
      <Shared.Field label="Course">
        <Shared.Select value={courseId} onChange={setCourseId} options={store.courses.map(c => ({ v: c.id, l: c.title }))}/>
      </Shared.Field>
      <Shared.Field label="Due date (optional)">
        <input className="text-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
      </Shared.Field>
      <div className="field-l" style={{ marginTop: 8 }}>Producers · {repIds.length} selected</div>
      <div style={{ marginTop: 6, maxHeight: 240, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
        {REPS.map(r => (
          <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
            <input type="checkbox" checked={repIds.includes(r.id)} onChange={() => toggle(r.id)}/>
            <Shared.Avatar rep={r} size={20}/>
            <span style={{ flex: 1 }}>{r.name}</span>
            <span className="meta" style={{ fontSize: 11 }}>{r.handle}</span>
          </label>
        ))}
      </div>
    </Shared.Modal>
  );
}

/* ─── Owner · Product Training authoring (Course Builder) ────────────── */
function ProductTrainingOwner({ store }) {
  const { REPS } = AppData;
  const [editing, setEditing] = React.useState(null);

  const newCourse = () => setEditing({
    id: "c-" + Date.now(),
    title: "",
    track: "Onboarding",
    durMin: 0,
    status: "assigned",
    required: false,
    description: "",
    sections: [],
    _isNew: true,
  });
  const editCourse = (c) => setEditing({ ...c, sections: (c.sections || []).map(s => ({ ...s, lessons: [...(s.lessons || [])] })) });
  const removeCourse = (id) => {
    if (!confirm("Delete this course? This can't be undone.")) return;
    store.saveCourses(cs => cs.filter(c => c.id !== id));
    window.toast && window.toast("Course deleted", "info");
  };
  const saveCourse = (course) => {
    const { _isNew, ...c } = course;
    if (_isNew) store.saveCourses(cs => [...cs, c]);
    else        store.saveCourses(cs => cs.map(x => x.id === c.id ? c : x));
    window.toast && window.toast(_isNew ? "Course created" : "Course saved", "success");
    setEditing(null);
  };
  const toggleRequired = (id) => {
    store.saveCourses(cs => cs.map(c => c.id === id ? { ...c, required: !c.required } : c));
  };

  // Owner library row stats: enrollment + completion rate.
  const enrolledCount = (course) => REPS.filter(r => {
    if (course.required) return true;
    return store.assignments.some(a => a.courseId === course.id && (a.repIds || []).includes(r.id));
  }).length;
  const completionRate = (course) => {
    const enrolled = REPS.filter(r => course.required || store.assignments.some(a => a.courseId === course.id && (a.repIds || []).includes(r.id)));
    if (enrolled.length === 0) return 0;
    const done = enrolled.filter(r => ProductTraining.statusFor(r.id, course, store.progress, store.assignments) === "complete")?.length;
    return Math.round((done / enrolled.length) * 100);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn" onClick={() => window.toast && window.toast("Course audit trail opens once you've published a course", "info")}><Icons.ArrowUpRight size={13}/> Audit trail</button>
        <button className="btn btn-primary" onClick={newCourse}><Icons.Plus size={13}/> New course</button>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Course library</h3><span className="meta">{store.courses.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 90px 90px 110px 100px" }}>
            <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Sec.</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div className="tabular" style={{ textAlign: "right" }}>Enrolled</div><div className="tabular" style={{ textAlign: "right" }}>Complete %</div><div>Required</div><div></div>
          </div>
          {store.courses.map(c => {
            const lessonCount = (c.sections || []).reduce((a, s) => a + (s.lessons?.length || 0), 0);
            const enrolled = enrolledCount(c);
            const completed = completionRate(c);
            return (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 80px 80px 90px 90px 110px 100px" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{c.title || <span style={{ color: "var(--text-tertiary)" }}>Untitled</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{lessonCount} lesson{lessonCount === 1 ? "" : "s"}</div>
                </div>
                <div><span className="chip">{c.track}</span></div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{(c.sections || []).length}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{enrolled}</div>
                <div className="tabular" style={{ textAlign: "right", color: completed >= 80 ? "var(--accent-money)" : completed >= 50 ? "var(--text-secondary)" : "var(--state-warning)" }}>{completed}%</div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!c.required} onChange={() => toggleRequired(c.id)}/>
                    {c.required ? <span style={{ color: "var(--accent-status)" }}>required</span> : <span style={{ color: "var(--text-tertiary)" }}>optional</span>}
                  </label>
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="icon-btn" onClick={() => editCourse(c)} title="Edit"><Icons.Edit size={11}/></button>
                  <button className="icon-btn" onClick={() => removeCourse(c.id)} title="Delete"><Icons.X size={11}/></button>
                </div>
              </div>
            );
          })}
          {store.courses.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No courses yet. Click <strong>New course</strong> to start building.
            </div>
          )}
        </div>
      </div>

      {editing && <CourseBuilderModal course={editing} setCourse={setEditing} onSave={saveCourse} onCancel={() => setEditing(null)}/>}
    </>
  );
}

/* ─── Course Builder modal — sections, lessons, video upload/embed ───── */
function CourseBuilderModal({ course, setCourse, onSave, onCancel }) {
  const c = course;
  const update = (patch) => setCourse({ ...c, ...patch });
  const updateSection = (si, patch) => update({ sections: c.sections.map((s, i) => i === si ? { ...s, ...patch } : s) });
  const updateLesson = (si, li, patch) => update({
    sections: c.sections.map((s, i) => i !== si ? s : ({ ...s, lessons: s.lessons.map((l, j) => j === li ? { ...l, ...patch } : l) })),
  });
  const addSection = () => update({ sections: [...c.sections, { title: `Section ${c.sections.length + 1}`, lessons: [] }] });
  const removeSection = (si) => update({ sections: c.sections.filter((_, i) => i !== si) });
  const moveSection = (si, dir) => {
    const ns = [...c.sections]; const j = si + dir;
    if (j < 0 || j >= ns.length) return;
    [ns[si], ns[j]] = [ns[j], ns[si]];
    update({ sections: ns });
  };
  const addLesson = (si) => update({
    sections: c.sections.map((s, i) => i === si ? { ...s, lessons: [...s.lessons, { title: "New lesson", videoUrl: "", description: "" }] } : s),
  });
  const removeLesson = (si, li) => update({
    sections: c.sections.map((s, i) => i === si ? { ...s, lessons: s.lessons.filter((_, j) => j !== li) } : s),
  });
  const moveLesson = (si, li, dir) => {
    update({
      sections: c.sections.map((s, i) => {
        if (i !== si) return s;
        const ls = [...s.lessons]; const j = li + dir;
        if (j < 0 || j >= ls.length) return s;
        [ls[li], ls[j]] = [ls[j], ls[li]];
        return { ...s, lessons: ls };
      }),
    });
  };
  const onUploadVideo = (si, li, file) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      window.toast && window.toast("Files >6MB won't persist in browser storage — paste a Loom link instead", "warn");
    }
    const reader = new FileReader();
    reader.onload = () => updateLesson(si, li, { videoUrl: reader.result });
    reader.readAsDataURL(file);
  };

  const canSave = !!c.title.trim();

  return (
    <Shared.Modal title={c._isNew ? "New course" : "Edit course"} width={860} onClose={onCancel} actions={
      <>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(c)} disabled={!canSave}>
          <Icons.Check size={11}/> {c._isNew ? "Create course" : "Save changes"}
        </button>
      </>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Shared.Field label="Title">
          <input className="text-input" value={c.title} onChange={(e) => update({ title: e.target.value })} placeholder="Final Expense Closing 101" autoFocus/>
        </Shared.Field>
        <Shared.Field label="Track">
          <Shared.Select value={c.track} onChange={(v) => update({ track: v })} options={COURSE_TRACKS.map(t => ({ v: t, l: t }))}/>
        </Shared.Field>
      </div>
      <Shared.Field label="Description">
        <textarea className="text-input" rows={2} value={c.description} onChange={(e) => update({ description: e.target.value })}
          placeholder="What this course teaches and who should take it" style={{ width: "100%", lineHeight: 1.55 }}/>
      </Shared.Field>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center" }}>
        <Shared.Field label="Duration (min)">
          <input className="text-input" type="number" value={c.durMin} onChange={(e) => update({ durMin: +e.target.value || 0 })}/>
        </Shared.Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 18 }}>
          <input type="checkbox" checked={!!c.required} onChange={(e) => update({ required: e.target.checked })}/>
          <span>Required for new reps · must be completed before first live calls</span>
        </label>
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 13 }}>Sections</strong>
          <span className="meta" style={{ marginLeft: 8 }}>{c.sections.length}</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={addSection}><Icons.Plus size={11}/> Add section</button>
        </div>

        {c.sections.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12.5 }}>
            No sections yet. Click <strong>Add section</strong> to start.
          </div>
        )}

        {c.sections.map((s, si) => (
          <div key={si} style={{ marginBottom: 10, border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-raised)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 22 }}>#{si + 1}</span>
              <input className="text-input" value={s.title} onChange={(e) => updateSection(si, { title: e.target.value })} placeholder="Section title" style={{ flex: 1 }}/>
              <button className="icon-btn" onClick={() => moveSection(si, -1)} disabled={si === 0} title="Move up"><Icons.ArrowRight size={11} style={{ transform: "rotate(-90deg)" }}/></button>
              <button className="icon-btn" onClick={() => moveSection(si,  1)} disabled={si === c.sections.length - 1} title="Move down"><Icons.ArrowRight size={11} style={{ transform: "rotate(90deg)" }}/></button>
              <button className="icon-btn" onClick={() => removeSection(si)} title="Remove section"><Icons.X size={11}/></button>
            </div>

            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {s.lessons.map((l, li) => (
                <div key={li} style={{ padding: 10, background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", minWidth: 28 }}>L{si + 1}.{li + 1}</span>
                    <input className="text-input" value={l.title} onChange={(e) => updateLesson(si, li, { title: e.target.value })} placeholder="Lesson title" style={{ flex: 1 }}/>
                    <button className="icon-btn" onClick={() => moveLesson(si, li, -1)} disabled={li === 0} title="Move up"><Icons.ArrowRight size={11} style={{ transform: "rotate(-90deg)" }}/></button>
                    <button className="icon-btn" onClick={() => moveLesson(si, li,  1)} disabled={li === s.lessons.length - 1} title="Move down"><Icons.ArrowRight size={11} style={{ transform: "rotate(90deg)" }}/></button>
                    <button className="icon-btn" onClick={() => removeLesson(si, li)} title="Remove lesson"><Icons.X size={11}/></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                    <input className="text-input"
                      value={l.videoUrl?.startsWith("data:") ? "(uploaded file)" : (l.videoUrl || "")}
                      readOnly={l.videoUrl?.startsWith("data:")}
                      onChange={(e) => updateLesson(si, li, { videoUrl: e.target.value })}
                      placeholder="Paste Loom / YouTube / Vimeo link or upload →"/>
                    <label className="btn btn-ghost" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                      <Icons.ArrowUpRight size={11}/> Upload
                      <input type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => onUploadVideo(si, li, e.target.files?.[0])}/>
                    </label>
                  </div>
                  <textarea className="text-input" rows={2} value={l.description} onChange={(e) => updateLesson(si, li, { description: e.target.value })}
                    placeholder="What this lesson covers (optional)" style={{ width: "100%", marginTop: 6, lineHeight: 1.5 }}/>
                  {l.videoUrl && !l.videoUrl.startsWith("data:") && (
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                      Embed: <code style={{ fontSize: 10.5 }}>{toEmbedSrc(l.videoUrl).slice(0, 70)}{toEmbedSrc(l.videoUrl).length > 70 ? "…" : ""}</code>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => addLesson(si)}><Icons.Plus size={11}/> Add lesson</button>
            </div>
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}


/* ─────────────────────────────────────────────────────────────────────────
   6. Calls — Gong-style cards with waveform, transcript, AI score
   ───────────────────────────────────────────────────────────────────────── */
function PageCalls({ role = "rep" }) {
  const { RECORDINGS, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  // GAP-D1 — resolve the actual signed-in viewer instead of REPS[0]=Marcus.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const meId = meIdent?.rep_id || (REPS[0] && REPS[0].id);
  // Manager view scopes to downline; rep to self; owner sees fleet.
  const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  const visible = role === "rep"
    ? RECORDINGS.filter(r => !r.repId || r.repId === meId)
    : role === "manager" && scopeIds
      ? RECORDINGS.filter(r => !r.repId || scopeIds.includes(r.repId))
      : RECORDINGS;

  const [selId, setSelId] = React.useState(visible[0]?.id);
  const sel = visible.find(r => r.id === selId) || visible[0];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Calls</div>
          <div className="page-sub">{role === "rep" ? "My calls" : "All recorded calls"} · waveform · talk ratio · AI score</div>
        </div>
      </div>

      <div className="calls-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Recordings</h3><span className="meta">{visible.length}</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map(r => (
              <button key={r.id} onClick={() => setSelId(r.id)} className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 10, background: sel?.id === r.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <strong style={{ fontSize: 12.5 }}>{r.lead}</strong>
                  <span className="tabular" style={{ color: r.score >= 80 ? "var(--accent-money)" : r.score >= 60 ? "var(--state-warning)" : "var(--state-danger)", fontSize: 11.5 }}>{r.score}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)", fontSize: 11 }}>
                  <span>{r.date}</span>
                  <span className="mono">{Math.floor(r.durSec / 60)}:{String(r.durSec % 60).padStart(2, "0")}</span>
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                {role === "rep" ? "No calls logged yet — make your first dial from the Floor." : "No recorded calls in scope."}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel?.lead} · score {sel?.score}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => sel && window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Summarize the call with ${sel.lead} and grade my open-ended question rate`, context: "Call · " + sel.lead }}))}><Icons.Sparkles size={11}/> Analyze</button>
              <button className="btn btn-ghost" onClick={() => sel && AppData.mutate.vaultArtifactInsert({ kind: "Recording", lead_name: sel.lead, rep_id: sel.repId, retention: "10y", status: "complete" }).then(() => window.toast && window.toast(`Sent ${sel.lead}'s recording to Vault`, "success"))}><Icons.Shield size={11}/> Send to vault</button>
              <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "vault" }}))}><Icons.ArrowUpRight size={11}/> Open Vault</button>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
              <span className="mono">00:00</span>
              <div style={{ flex: 1, height: 36, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                <svg width="100%" height="36" viewBox="0 0 240 36" preserveAspectRatio="none">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 4 + Math.abs(Math.sin(i * 0.5 + (sel?.id?.length || 0))) * 26 + (i % 7 === 0 ? 4 : 0);
                    return <rect key={i} x={i * 3} y={(36 - h) / 2} width="1.6" height={h} fill={i < 48 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                  })}
                </svg>
              </div>
              <span className="mono">{Math.floor((sel?.durSec || 0) / 60)}:{String((sel?.durSec || 0) % 60).padStart(2, "0")}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`chip ${sel?.talkRatio < 50 ? "chip-money" : "chip-status"}`}>Talk: {sel?.talkRatio}%</span>
              <span className="chip">Open Q: {sel?.openQ}</span>
              <span className={`chip ${sel?.flags?.tpmo === "ok" ? "chip-money" : "chip-status"}`}>TPMO {sel?.flags?.tpmo === "ok" ? "✓" : "?"}</span>
              <span className={`chip ${sel?.flags?.soa === "captured" || sel?.flags?.soa === "scheduled" ? "chip-money" : ""}`}>SOA {sel?.flags?.soa}</span>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel?.ai || <span style={{ color: "var(--text-tertiary)" }}>processing…</span>}
            </div>

            {/* Whisper transcript when available — falls back to a hint when the
                transcribe pipeline hasn't run yet for this recording. */}
            {sel && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icons.FileText size={11}/> Transcript
                </div>
                {window.PostCallTranscript
                  ? (() => { const T = window.PostCallTranscript; return <T recordingId={sel.id}/>; })()
                  : <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Transcript module loading…</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   7. Book Analytics — owner
   ───────────────────────────────────────────────────────────────────────── */
/* ─── Book Analytics — owner-facing book of business surface ───────────────
   Three actually-distinct views (Mix / Cohorts / Cross-sell) instead of one
   panel pair that ignored the tab switcher. KPI row uses compact cards
   (no oversized hero) with mini-trends so density beats size. */

const BOOK_PERIOD_LABELS = { "3mo": "3-mo", "13mo": "13-mo", "24mo": "24-mo" };

function BookKpi({ label, value, sub, tone, trend }) {
  // Compact KPI tile — replaces hero KpiCard. 3:1 density vs the old card.
  const color = tone === "money" ? "var(--accent-money)" : tone === "danger" ? "var(--state-danger)" : tone === "warn" ? "var(--state-warning)" : undefined;
  return (
    <div className="panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 500, color, fontFamily: "var(--font-display)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: trend === "up" ? "var(--accent-money)" : trend === "dn" ? "var(--state-warning)" : "var(--text-tertiary)" }}>
          {trend === "up" && "▲ "}{trend === "dn" && "▼ "}{sub}
        </div>
      )}
    </div>
  );
}

function PageBook() {
  const [period, setPeriod] = React.useState("13mo");
  const [view, setView]     = React.useState("mix");
  const [drill, setDrill]   = React.useState(null);

  // Real data when present; sample when not.
  const policies = window.AppData?.POLICIES || [];
  const carriers = window.AppData?.CARRIERS || [];
  const book     = window.AppData?.BOOK_ENTRIES || [];

  // Demo seed only renders for the demo agency. Real tenants with no policies
  // see an empty-state CTA instead of fabricated UHC/Humana/Aetna AP numbers.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const carrierMix = (() => {
    if (carriers.length === 0 || policies.length === 0) {
      return isDemo ? [
        { id: "uhc",   name: "UHC",            apps: 184, ap: 1842000, persist: 94, nigo: 1.4 },
        { id: "hum",   name: "Humana Vantage", apps: 132, ap: 1320000, persist: 92, nigo: 2.0 },
        { id: "aet",   name: "Aetna SRC",      apps: 124, ap: 1108000, persist: 87, nigo: 3.1 },
        { id: "fg",    name: "F&G Annuities",  apps:  42, ap: 1860000, persist: 96, nigo: 0.6 },
        { id: "moo",   name: "Mutual of Omaha",apps:  88, ap:  708000, persist: 78, nigo: 1.9 },
      ] : [];
    }
    return carriers.map(c => {
      const cps = policies.filter(p => p.carrierId === c.id);
      const cBook = book.filter(b => cps.find(p => p.id === b.policyId));
      const persistAvg = cBook.length ? cBook.reduce((a, b) => a + (b.persistency || 0), 0) / cBook.length : null;
      return {
        id: c.id, name: c.name,
        apps: cps.length,
        ap: cps.reduce((a, p) => a + (p.ap || 0), 0),
        persist: persistAvg != null ? Math.round(persistAvg) : null,
        nigo: null,
      };
    }).sort((a, b) => b.ap - a.ap);
  })();
  const totalAp = carrierMix.reduce((a, c) => a + (c.ap || 0), 0);
  const maxAp   = Math.max(1, ...carrierMix.map(c => c.ap || 0));
  const apMM    = totalAp > 0 ? (totalAp / 1_000_000).toFixed(2) + "M" : "—";

  const exportBook = () => {
    const headers = ["Carrier","Apps","AP","Persistency","NIGO"];
    const rows = carrierMix.map(c => [c.name, c.apps, c.ap, c.persist ?? "", c.nigo ?? ""]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `book-${period}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    window.toast && window.toast(`Exported ${rows.length} carriers · ${period}`, "success");
  };

  // Drilldown derives from the current carrier mix
  const drillRow = drill ? carrierMix.find(c => c.id === drill) : null;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Book Analytics</div>
          <div className="page-sub">In-force AP · persistency · lapse · cross-sell pathway · carrier mix</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Shared.SectionPill items={[{k:"3mo",l:"3mo"},{k:"13mo",l:"13mo"},{k:"24mo",l:"24mo"}]} value={period} onChange={setPeriod} dense/>
          <button className="btn" onClick={exportBook} title="CSV of the carrier mix table"><Icons.ArrowUpRight size={13}/> Export</button>
        </div>
      </div>

      <Shared.SectionPill
        items={[
          {k:"mix",       l:"Carrier mix",  icon:"Folder"},
          {k:"cohorts",   l:"Cohorts",      icon:"Activity"},
          {k:"crosssell", l:"Cross-sell",   icon:"ArrowUpRight"},
        ]}
        value={view}
        onChange={setView}
      />

      {/* Compact KPI strip — 4 equal tiles, no hero. KPIs display "—" for
          real tenants until persistency / lapse / cross-sell rollups are
          computed from policies + book entries. Demo keeps the seed values. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <BookKpi label="In-force AP"             value={apMM === "—" ? "—" : "$" + apMM}        sub={isDemo ? "+9.4% YoY" : ""}     trend={isDemo ? "up" : undefined}   tone="money"/>
        <BookKpi label={`Persistency · ${BOOK_PERIOD_LABELS[period]}`} value={isDemo ? "91.4%" : "—"} sub={isDemo ? "goal 90%" : "no data"} trend={isDemo ? "up" : undefined}  tone={isDemo ? "money" : undefined}/>
        <BookKpi label="Lapse rate"              value={isDemo ? "4.2%" : "—"}              sub={isDemo ? "-0.6 WoW" : "no data"}      trend={isDemo ? "up" : undefined}/>
        <BookKpi label="Cross-sell rate"         value={isDemo ? "22%" : "—"}               sub={isDemo ? "FE → Med Supp" : "no data"} trend={isDemo ? "up" : undefined}/>
      </div>

      {/* ─── Carrier mix view ─── */}
      {view === "mix" && (
        <div className="book-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <Icons.Folder size={13}/>
              <h3>Carrier mix · in-force</h3>
              <span className="meta">{carrierMix.length} carriers · ${apMM} AP</span>
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 70px 90px 70px 70px 1fr" }}>
                <div>Carrier</div>
                <div className="tabular" style={{ textAlign: "right" }}>Apps</div>
                <div className="tabular" style={{ textAlign: "right" }}>AP</div>
                <div className="tabular" style={{ textAlign: "right" }}>Persist</div>
                <div className="tabular" style={{ textAlign: "right" }}>NIGO</div>
                <div></div>
              </div>
              {carrierMix.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No carrier data yet — add appointments under Settings → Carriers, then write your first deal on the Floor.
                </div>
              )}
              {carrierMix.map(r => {
                const w = ((r.ap || 0) / maxAp) * 100;
                const persistTone = r.persist == null ? "var(--text-tertiary)" : r.persist >= 90 ? "var(--accent-money)" : r.persist >= 80 ? "var(--state-warning)" : "var(--state-danger)";
                return (
                  <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 70px 90px 70px 70px 1fr", cursor: "pointer", background: drill === r.id ? "var(--bg-raised)" : undefined, height: 32 }} onClick={() => setDrill(drill === r.id ? null : r.id)}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.apps}</div>
                    <div className="tabular" style={{ textAlign: "right" }}>${(r.ap / 1000).toFixed(0)}k</div>
                    <div className="tabular" style={{ textAlign: "right", color: persistTone, fontWeight: 500 }}>{r.persist != null ? r.persist + "%" : "—"}</div>
                    <div className="tabular" style={{ textAlign: "right", color: r.nigo != null && r.nigo > 2 ? "var(--state-warning)" : "var(--text-tertiary)" }}>{r.nigo != null ? r.nigo.toFixed(1) + "%" : "—"}</div>
                    <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden", alignSelf: "center" }}>
                      <div style={{ width: `${w}%`, height: "100%", background: "var(--accent-money)" }}></div>
                    </div>
                  </div>
                );
              })}
              {drillRow && (
                <div style={{ padding: 12, background: "var(--bg-raised)", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 13 }}>{drillRow.name}</strong>
                    <button className="icon-btn" onClick={() => setDrill(null)}><Icons.X size={11}/></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11.5 }}>
                    <div><span style={{ color: "var(--text-tertiary)" }}>Persistency</span><div style={{ fontWeight: 500 }}>{drillRow.persist != null ? drillRow.persist + "%" : "—"} over {BOOK_PERIOD_LABELS[period]}</div></div>
                    <div><span style={{ color: "var(--text-tertiary)" }}>NIGO rate</span><div style={{ fontWeight: 500, color: drillRow.nigo != null && drillRow.nigo > 2 ? "var(--state-warning)" : undefined }}>{drillRow.nigo != null ? drillRow.nigo.toFixed(1) + "%" : "—"}</div></div>
                    <div><span style={{ color: "var(--text-tertiary)" }}>Avg AP/app</span><div style={{ fontWeight: 500 }}>${drillRow.apps ? Math.round(drillRow.ap / drillRow.apps).toLocaleString() : "—"}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Break down ${drillRow.name}: top contributors, NIGO drivers, persistency drift over ${period}`, context: "Book · " + drillRow.name }}))}>
                      <Icons.Sparkles size={11}/> Ask the Book
                    </button>
                    <button className="btn btn-ghost" onClick={() => {
                      try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
                      if (window.gotoPage) window.gotoPage("settings");
                    }}>Open in Settings → Carriers</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <Icons.Activity size={13}/>
              <h3>Persistency cohorts</h3>
              <span className="meta">by carrier × product</span>
            </div>
            <div style={{ padding: 14 }}>
              {(isDemo ? [
                { l: "Med Supp · UHC",        v: 94 },
                { l: "Med Supp · Humana",     v: 92 },
                { l: "FE · UHC",              v: 88 },
                { l: "FE · Mutual of Omaha",  v: 78 },
                { l: "Annuity · F&G",         v: 96 },
              ] : []).map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 50px 1fr", padding: "4px 0", alignItems: "center", fontSize: 11.5 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}%</span>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                    <div style={{ width: `${r.v}%`, height: "100%", background: r.v >= 90 ? "var(--accent-money)" : r.v >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}></div>
                  </div>
                </div>
              ))}
              {!isDemo && (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No persistency data yet. Cohorts populate as policies hit month 3.
                </div>
              )}
            </div>
            {isDemo && (
              <>
                <div className="divider" style={{ margin: "0 14px" }}></div>
                <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--state-warning)" }}>Watch:</strong> FE / Mutual of Omaha at 78% — replacement risk. Pull a cancellations report to confirm.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Cohorts view — issue-month survival curves ─── */}
      {view === "cohorts" && !isDemo && (
        <div className="panel" style={{ padding: 36, textAlign: "center" }}>
          <Icons.Activity size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No cohort data yet</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Survival curves render once policies have aged at least one month. Each issue-month gets its own row; we track in-force % at every month forward.
          </div>
        </div>
      )}
      {view === "cohorts" && isDemo && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Activity size={13}/>
            <h3>Survival by issue cohort</h3>
            <span className="meta">% in-force at month N · {BOOK_PERIOD_LABELS[period]}</span>
          </div>
          <div style={{ padding: 12, overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px repeat(13, 1fr)", gap: 4, fontSize: 10, alignItems: "center" }}>
              <div style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>Issue cohort</div>
              {Array.from({length: 13}).map((_, i) => <div key={i} style={{ textAlign: "center", color: "var(--text-tertiary)" }}>M{i}</div>)}
              {[
                { c: "Apr 2025", curve: [100,99,98,97,96,95,94,93,92,92,91,90,89] },
                { c: "May 2025", curve: [100,99,99,98,97,95,94,93,92,91,90,89,88] },
                { c: "Jun 2025", curve: [100,98,96,94,92,90,88,86,84,82,80,78,76] },
                { c: "Jul 2025", curve: [100,99,98,97,96,96,95,94,93,92,91,90,90] },
                { c: "Aug 2025", curve: [100,99,99,98,98,97,97,96,95,95,94,93,93] },
                { c: "Sep 2025", curve: [100,99,98,97,96,95,94,93,92,91,90,null,null] },
                { c: "Oct 2025", curve: [100,99,99,98,97,96,95,94,93,92,null,null,null] },
                { c: "Nov 2025", curve: [100,99,98,98,97,96,95,94,93,null,null,null,null] },
                { c: "Dec 2025", curve: [100,99,99,98,98,97,96,95,null,null,null,null,null] },
                { c: "Jan 2026", curve: [100,99,99,98,97,96,95,null,null,null,null,null,null] },
                { c: "Feb 2026", curve: [100,99,99,98,97,96,null,null,null,null,null,null,null] },
                { c: "Mar 2026", curve: [100,99,98,98,97,null,null,null,null,null,null,null,null] },
              ].map(row => (
                <React.Fragment key={row.c}>
                  <div style={{ fontWeight: 500, fontSize: 11 }}>{row.c}</div>
                  {row.curve.map((v, i) => {
                    if (v == null) return <div key={i} style={{ height: 24, background: "transparent" }}/>;
                    const tone = v >= 95 ? "var(--accent-money)" : v >= 88 ? "var(--state-warning)" : "var(--state-danger)";
                    return (
                      <div key={i} title={`${row.c} · M${i} · ${v}%`} style={{ height: 24, background: `color-mix(in oklch, ${tone} ${v - 60}%, transparent)`, borderRadius: 3, display: "grid", placeItems: "center", color: v >= 95 ? "var(--bg-base)" : "var(--text-secondary)", fontWeight: 500, fontSize: 10 }}>
                        {v}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--state-warning)" }}>Jun 2025 cohort</strong> dropped to 76% by month 12 — 14 points below the rolling 12-cohort median.
              <button className="btn btn-ghost" style={{ marginLeft: 8, fontSize: 10.5 }} onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: "Why did the June 2025 cohort lapse so heavily? Pull the policies and replacement notes.", context: "Book · cohort drift" }}))}>
                <Icons.Sparkles size={10}/> Ask
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cross-sell view — pathway conversion ─── */}
      {view === "crosssell" && !isDemo && (
        <div className="panel" style={{ padding: 36, textAlign: "center" }}>
          <Icons.ArrowUpRight size={20} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No cross-sell data yet</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            Pathways populate once you have multi-policy clients. Each "X issued → Y attached" arc tracks conversion rate and avg time-to-attach.
          </div>
        </div>
      )}
      {view === "crosssell" && isDemo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Pathway conversion</h3><span className="meta">last {BOOK_PERIOD_LABELS[period]}</span></div>
            <div style={{ padding: 12 }}>
              {[
                { from: "Final Expense issued",  to: "Med Supp",    base: 412, conv: 91, days: 47 },
                { from: "Med Adv issued",        to: "Part D",      base: 304, conv: 78, days: 9 },
                { from: "Med Supp issued",      to: "Annuity",      base: 220, conv: 38, days: 152 },
                { from: "Term Life issued",      to: "IUL",          base: 88, conv: 24, days: 210 },
                { from: "ACA issued",            to: "Med Supp 65",  base: 64, conv: 18, days: 380 },
              ].map((r, i) => {
                const rate = (r.conv / r.base) * 100;
                const tone = rate >= 25 ? "var(--accent-money)" : rate >= 10 ? "var(--state-warning)" : "var(--state-danger)";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 70px 60px 1fr", padding: "8px 0", alignItems: "center", fontSize: 11.5, borderBottom: i < 4 ? "1px solid var(--border-subtle)" : 0 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{r.from}</div>
                      <div style={{ color: "var(--text-tertiary)", fontSize: 10.5, marginTop: 2 }}>→ {r.to}</div>
                    </div>
                    <div className="tabular" style={{ textAlign: "right", color: tone, fontWeight: 500 }}>{rate.toFixed(0)}%</div>
                    <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 10.5 }}>{r.days}d avg</div>
                    <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, rate * 2)}%`, height: "100%", background: tone }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13}/><h3>Untouched cross-sell opportunities</h3><span className="meta">policies eligible · no follow-up logged</span></div>
            <div style={{ padding: 12 }}>
              {[
                { seg: "FE issued > 30d, no Med Supp quote",    n: 78,  ap: 142000 },
                { seg: "MA issued, no PDP attached",             n: 49,  ap:  62000 },
                { seg: "Med Supp issued > 90d, no annuity intro",n: 134, ap: 380000 },
                { seg: "Term Life issued, no IUL conversation",  n: 26,  ap:  88000 },
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px", padding: "9px 0", alignItems: "center", fontSize: 11.5, borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0 }}>
                  <div style={{ color: "var(--text-secondary)" }}>{r.seg}</div>
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.n} clients</div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)", fontWeight: 500 }}>${(r.ap / 1000).toFixed(0)}k AP</div>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: 8, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text-secondary)" }}>Total opportunity:</strong> 287 clients · $672k AP if every segment converts at the agency's typical {period} rate.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={() => {
                  if (window.gotoPage) window.gotoPage("crm");
                  window.toast && window.toast("Open CRM → filter by 'untouched cross-sell' segment", "info");
                }}
              >
                <Icons.ArrowUpRight size={11}/> Open in CRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   8. Settings — role-aware (org / billing / integrations / API / routing /
      notifications). Owner sees everything, mgr sees team-relevant
      sections, rep sees only their profile.
   ───────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────
   PageSettings — role-aware tabs per the 2026-05-11 audit spec:

   rep         : Profile, Notifications, Personal connectors, Resources
   manager     : Profile, Notifications, Personal connectors, Team scripts,
                 Resources
   owner       : Profile, Notifications, Connectors (all), Agents, Team
                 management, Carriers, Products, Billing, Compliance,
                 Branding, Organization, Routing rules, API keys
   admin       : everything owner has + Cross-agency, Audit log,
                 Provision sub-agency
   imo_owner   : same as admin (IMO operator)
   super_admin : everything + Feature flags, Demo controls, Global
                 integrations

   Every save is wired through either:
     - sb.rpc("save_profile", {p}) for the signed-in user, OR
     - AppData.mutate.orgSettingsSave({...}) → public.org_settings, OR
     - the table-specific RPC documented inline.

   Permission gates:
     - If the viewer's role rank is below the section's minimum role, render
       a "ks-denied" banner instead of the editable form. This prevents a
       leaky tab in case a stale tab key survives a role downgrade.

   Design system: scoped via .koino-settings-ds — green-on-black + soft
   rounded cards. See styles.css.
   ───────────────────────────────────────────────────────────────────────── */

// Tab catalogue. Each tab knows: its label, the section header it sits under,
// and the minimum role rank required to render. Tabs assemble into a per-role
// ordered list via SETTINGS_TAB_ORDER below.
const SETTINGS_TAB_DEFS = {
  profile:            { label: "Profile",             section: "personal", icon: "Users",         min: "rep" },
  notifications:      { label: "Notifications",       section: "personal", icon: "Bell",          min: "rep" },
  personal_connectors:{ label: "Personal connectors", section: "personal", icon: "Plug",          min: "rep" },
  resources:          { label: "Resources",           section: "personal", icon: "FileText",      min: "rep" },
  team_scripts:       { label: "Team scripts",        section: "team",     icon: "MessageSquare", min: "manager" },
  team:               { label: "Team management",     section: "team",     icon: "Users",         min: "owner" },
  agents:             { label: "Agents",              section: "agency",   icon: "Sparkles",      min: "owner" },
  integrations:       { label: "Connectors",          section: "agency",   icon: "Plug",          min: "owner" },
  carriers:           { label: "Carriers",            section: "agency",   icon: "Shield",        min: "owner" },
  products:           { label: "Products",            section: "agency",   icon: "Cpu",           min: "owner" },
  routing:            { label: "Routing rules",       section: "agency",   icon: "Workflow",      min: "owner" },
  api:                { label: "API keys",            section: "agency",   icon: "Bolt",          min: "owner" },
  org:                { label: "Organization",        section: "agency",   icon: "Building",      min: "owner" },
  branding:           { label: "Branding",            section: "agency",   icon: "Sparkles",      min: "owner" },
  compliance:         { label: "Compliance",          section: "agency",   icon: "Shield",        min: "owner" },
  billing:            { label: "Billing",             section: "agency",   icon: "Wallet",        min: "owner" },
  cross_agency:       { label: "Cross-agency",        section: "platform", icon: "Server",        min: "admin" },
  audit_log:          { label: "Audit log",           section: "platform", icon: "Activity",      min: "admin" },
  provision:          { label: "Provision sub-agency",section: "platform", icon: "Plus",          min: "admin" },
  feature_flags:      { label: "Feature flags",       section: "global",   icon: "Bookmark",      min: "super_admin" },
  demo_controls:      { label: "Demo controls",       section: "global",   icon: "Brain",         min: "super_admin" },
  global_integrations:{ label: "Global integrations", section: "global",   icon: "Workflow",      min: "super_admin" },
};

const SETTINGS_ROLE_RANK = { super_admin: 6, owner: 5, imo_owner: 4, admin: 3, manager: 2, rep: 1 };

// Per-role ordered tab list. Higher roles get all lower-role tabs as well,
// in the standard "personal → team → agency → platform → global" flow.
const SETTINGS_TAB_ORDER = {
  rep: [
    "profile", "notifications", "personal_connectors", "resources",
  ],
  manager: [
    "profile", "notifications", "personal_connectors",
    "team_scripts", "resources",
  ],
  owner: [
    "profile", "notifications", "personal_connectors",
    "team", "team_scripts",
    "org", "branding", "carriers", "products", "agents",
    "integrations", "compliance", "routing", "api", "billing",
  ],
  // imo_owner manages an IMO with multiple sub-agencies (admin tier).
  imo_owner: [
    "profile", "notifications", "personal_connectors",
    "team", "team_scripts",
    "org", "branding", "carriers", "products", "agents",
    "integrations", "compliance", "routing", "api", "billing",
    "cross_agency", "provision", "audit_log",
  ],
  admin: [
    "profile", "notifications", "personal_connectors",
    "team", "team_scripts",
    "org", "branding", "carriers", "products", "agents",
    "integrations", "compliance", "routing", "api", "billing",
    "cross_agency", "provision", "audit_log",
  ],
  super_admin: [
    "profile", "notifications", "personal_connectors",
    "team", "team_scripts",
    "org", "branding", "carriers", "products", "agents",
    "integrations", "compliance", "routing", "api", "billing",
    "cross_agency", "provision", "audit_log",
    "feature_flags", "demo_controls", "global_integrations",
  ],
};

const SETTINGS_SECTION_LABELS = {
  personal: "You",
  team:     "Team",
  agency:   "Agency",
  platform: "Cross-agency",
  global:   "Platform",
};

function PageSettings({ role = "owner" }) {
  // Normalize role — anything we don't recognize falls to rep (least privileged).
  const normRole = SETTINGS_TAB_ORDER[role] ? role : "rep";
  const viewerRank = SETTINGS_ROLE_RANK[normRole] || 1;
  const tabs = SETTINGS_TAB_ORDER[normRole];

  // Allow other pages to deeplink into a specific tab via sessionStorage.
  const initialTab = (() => {
    try {
      const stash = sessionStorage.getItem("repflow.settings.tab");
      if (stash) {
        sessionStorage.removeItem("repflow.settings.tab");
        // Normalize a few legacy keys.
        const normalized = stash === "integrations" ? "integrations"
                          : stash === "telegram"   ? "personal_connectors"
                          : stash;
        if (tabs.includes(normalized)) return normalized;
      }
    } catch {}
    return tabs[0];
  })();
  const [tab, setTab] = React.useState(initialTab);

  // Allow any descendant to switch tabs by dispatching a `settings:tab`
  // CustomEvent (used by, e.g., the Products → Carriers redirect). Falls
  // back gracefully if the requested tab isn't allowed for this role.
  React.useEffect(() => {
    const onJump = (e) => {
      const k = e.detail;
      if (typeof k === "string" && tabs.includes(k)) setTab(k);
    };
    window.addEventListener("settings:tab", onJump);
    return () => window.removeEventListener("settings:tab", onJump);
  }, [tabs]);

  // Group tabs by section for the rail header.
  const grouped = React.useMemo(() => {
    const groups = {};
    tabs.forEach(k => {
      const def = SETTINGS_TAB_DEFS[k];
      if (!def) return;
      (groups[def.section] = groups[def.section] || []).push([k, def]);
    });
    return groups;
  }, [tabs]);

  // Permission gate per tab — fail-closed.
  const canRender = (tabKey) => {
    const def = SETTINGS_TAB_DEFS[tabKey];
    if (!def) return false;
    const need = SETTINGS_ROLE_RANK[def.min] || 99;
    return viewerRank >= need;
  };

  const renderTab = () => {
    if (!canRender(tab)) {
      return <SettingsDenied tabKey={tab} viewerRole={normRole}/>;
    }
    switch (tab) {
      case "profile":             return <SettingsProfile role={normRole}/>;
      case "notifications":       return <SettingsNotifications/>;
      case "personal_connectors": return <SettingsPersonalConnectors/>;
      case "resources":           return <SettingsResources role={normRole}/>;
      case "team_scripts":        return <SettingsTeamScripts canEdit={viewerRank >= 2}/>;
      case "team":                { const T = window.SettingsTeam;  return T ? <T/> : <SettingsBackendMissing label="Team management"/>; }
      case "org":                 return <SettingsOrg/>;
      case "branding":            return <SettingsBranding/>;
      case "carriers":            { const C = window.SettingsCarriers; return C ? <C canEdit={viewerRank >= 5}/> : <SettingsBackendMissing label="Carriers"/>; }
      case "products":            return <SettingsProducts canEdit={viewerRank >= 5}/>;
      case "agents":              return <SettingsAgents role={normRole}/>;
      case "integrations":        return <SettingsIntegrations/>;
      case "compliance":          return <SettingsCompliance/>;
      case "routing":             return <SettingsRouting/>;
      case "api":                 return <SettingsApi/>;
      case "billing":             return <SettingsBilling/>;
      case "cross_agency":        return <SettingsCrossAgency/>;
      case "provision":           return <SettingsProvisionSubAgency/>;
      case "audit_log":           return <SettingsAuditLog/>;
      case "feature_flags":       return <SettingsFeatureFlags/>;
      case "demo_controls":       return <SettingsDemoControls/>;
      case "global_integrations": return <SettingsGlobalIntegrations/>;
      default:                    return null;
    }
  };

  const tabIcon = (key) => {
    const ic = SETTINGS_TAB_DEFS[key]?.icon;
    const Cmp = ic && Icons[ic];
    return Cmp ? <Cmp size={13}/> : <span style={{ width: 13, display: "inline-block" }}/>;
  };

  const subForRole = {
    rep:         "Your profile, notifications, personal connectors, resources",
    manager:     "Your profile + team scripts + agency resources",
    owner:       "Run the agency — team, carriers, billing, compliance, branding, agents",
    imo_owner:   "Run the IMO — every agency setting + cross-agency + sub-agency provisioning",
    admin:       "Cross-agency oversight — audit log, provisioning, every agency tab",
    super_admin: "Platform — feature flags, demo controls, global integrations",
  }[normRole] || "Settings";

  return (
    <div className="page-pad koino-settings-ds">
      <div className="page-h">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">{subForRole}</div>
        </div>
        <div className="ks-pin-row">
          <button
            className={"btn " + (tab === "profile" ? "btn-primary" : "")}
            onClick={() => setTab("profile")}
          >
            <Icons.Users size={13}/> Edit profile
          </button>
        </div>
      </div>

      <div className="settings-grid settings-grid-responsive" style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 14 }}>
        <nav className="ks-tabs" aria-label="Settings sections">
          {Object.entries(grouped).map(([sec, items], si) => (
            <React.Fragment key={sec}>
              {si > 0 && <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 6px" }}/>}
              <div className="ks-section-label">{SETTINGS_SECTION_LABELS[sec] || sec}</div>
              {items.map(([k, def]) => (
                <button
                  key={k}
                  className={"ks-tab" + (tab === k ? " is-active" : "")}
                  onClick={() => setTab(k)}
                  type="button"
                >
                  <span className="ks-tab-dot"/>
                  {tabIcon(k)}
                  <span>{def.label}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}

/* Permission-denied banner — rendered when a role can see a tab in
 * sessionStorage / URL deeplink but lacks the role rank to load it. */
function SettingsDenied({ tabKey, viewerRole }) {
  const def = SETTINGS_TAB_DEFS[tabKey] || {};
  return (
    <div className="ks-denied">
      <Icons.Shield size={18} style={{ color: "var(--state-danger)" }}/>
      <div>
        <div><strong>{def.label || tabKey}</strong> requires the <span className="mono">{def.min || "owner"}</span> role.</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>You're signed in as <span className="mono">{viewerRole}</span>. Ask an owner / IMO admin to grant access.</div>
      </div>
    </div>
  );
}

/* Stub for window-injected panels we couldn't find at runtime (SettingsTeam,
 * SettingsCarriers etc). Surfaces what's missing instead of rendering blank. */
function SettingsBackendMissing({ label }) {
  return (
    <div className="ks-empty">
      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{label} panel is not loaded</div>
      <div style={{ marginTop: 4 }}>Refresh the page; if it still doesn't appear, the bundling step missed its file.</div>
    </div>
  );
}

function SettingsOrg() {
  // Don't seed real org fields with Atlas demo strings — empty inputs render
  // the placeholder cleanly and signal "fill me in" instead of "this is the
  // seed I should overwrite". Demo agency keeps the seed for the sandbox.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const O = window.AppData?.ORG_SETTINGS || {};
  const seed = {
    name:   O.name   || (isDemo ? "Atlas Insurance Group" : (meIdent?.agency_name || "")),
    legal:  O.legal  || (isDemo ? "Atlas IMO LLC"          : ""),
    domain: O.domain || (isDemo ? "atlasimo.com"           : ""),
    npn:    O.npn    || (isDemo ? "19384726"               : ""),
  };
  const [form,   setForm]   = React.useState(seed);
  const [dirty,  setDirty]  = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const patch = {};
      Object.keys(dirty).forEach(k => { patch[k] = form[k]; });
      await window.AppData.mutate.orgSettingsSave(patch);
      setDirty({});
      window.toast && window.toast(`Organization saved${window.AppData?.LIVE ? "" : " (demo only — sign in for persistence)"}`, "success");
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  // Domain pseudo-validation — surface a warning but never block submit.
  const domainLooksOk = !form.domain || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.domain.trim());

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Organization</h3>
        <span className="ks-tile-tag" style={{ marginLeft: 0 }}>org_settings</span>
      </div>
      <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Shared.Field label="Display name" hint="What shows in the sidebar + producer-facing surfaces"><input className="text-input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Atlas Insurance Group"/></Shared.Field>
        <Shared.Field label="Legal entity" hint="LLC / Inc. / sole prop on contracts"><input className="text-input" value={form.legal} onChange={(e) => update("legal", e.target.value)} placeholder="Atlas IMO LLC"/></Shared.Field>
        <Shared.Field label="Domain" hint={domainLooksOk ? "Bare domain — no https://" : "Doesn't look like a domain"}><input className="text-input" value={form.domain} onChange={(e) => update("domain", e.target.value)} placeholder="atlasimo.com" style={{ borderColor: domainLooksOk ? undefined : "var(--state-warning)" }}/></Shared.Field>
        <Shared.Field label="NPN" hint="National Producer Number — digits only"><input className="text-input" value={form.npn} onChange={(e) => update("npn", e.target.value.replace(/\D/g, ""))} placeholder="19384726"/></Shared.Field>
      </div>
      <div className="divider"></div>
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 11.5, fontWeight: 600 }}>Operating states</h3>
      <OperatingStatesEditor/>
      <div className="divider"></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}><Icons.Check size={12}/> {saving ? "Saving…" : "Save organization"}</button>
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? "" : "s"}</span>}
      </div>
    </div>
  );
}

const ALL_US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function OperatingStatesEditor() {
  // SHAPE-NOT-DATA: empty default for real agencies. Demo agency still seeds
  // a handful of states so the sandbox tour shows the editor populated.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const stored = window.AppData?.ORG_SETTINGS?.operating_states;
  const initial = Array.isArray(stored) ? stored : (isDemo ? ["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"] : []);
  const [states, setStates] = React.useState(initial);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy]       = React.useState(false);

  const persist = async (next) => {
    const previous = states;
    setStates(next);
    if (window.AppData?.ORG_SETTINGS) window.AppData.ORG_SETTINGS.operating_states = next;
    if (window.AppData?.mutate?.orgSettingsSave) {
      setBusy(true);
      try {
        await window.AppData.mutate.orgSettingsSave({ operating_states: next });
      } catch (e) {
        // Rollback so the chip strip doesn't lie about what the DB has.
        setStates(previous);
        if (window.AppData?.ORG_SETTINGS) window.AppData.ORG_SETTINGS.operating_states = previous;
        window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
      } finally { setBusy(false); }
    }
  };

  const remove = (s) => persist(states.filter(x => x !== s));
  const toggle = (s) => persist(states.includes(s) ? states.filter(x => x !== s) : [...states, s].sort());

  const available = ALL_US_STATES.filter(s => !states.includes(s));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {states.length === 0 && (
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>No states yet — add the states this agency is currently writing in.</span>
        )}
        {states.map(s => (
          <span key={s} className="chip chip-money" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {s}
            <button onClick={() => remove(s)} className="icon-btn" style={{ width: 14, height: 14, padding: 0, opacity: 0.6 }} title={`Remove ${s}`}>
              <Icons.X size={9}/>
            </button>
          </span>
        ))}
        <button className="btn btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setPicking(p => !p)} disabled={busy}>
          <Icons.Plus size={11}/> Add{busy && " · saving…"}
        </button>
      </div>
      {picking && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>{available.length} states available</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {available.map(s => (
              <button key={s} onClick={() => toggle(s)} className="chip" style={{ cursor: "pointer", border: 0 }}>
                {s}
              </button>
            ))}
            {available.length === 0 && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>All 51 states + DC already operating.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsBilling() {
  // Reads real plan + payment method out of org_settings. Demo agency
  // continues to render the marketing-grade illustration so the sandbox tour
  // doesn't look bare; real agencies get an empty state pointing to /admin
  // (where Stripe wiring will land) or to support.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const O = window.AppData?.ORG_SETTINGS || {};
  const plan       = O.plan       || (isDemo ? "Network · Annual" : null);
  const planMeta   = O.plan_meta  || (isDemo ? "Up to 25 producers · all integrations · 24h support" : null);
  const renewAt    = O.plan_renews_at || null;
  const card       = O.stripe_card_brand && O.stripe_card_last4
    ? { brand: O.stripe_card_brand, last4: O.stripe_card_last4, exp: O.stripe_card_exp || "" }
    : (isDemo ? { brand: "VISA", last4: "4419", exp: "09/27" } : null);
  const portalUrl  = O.stripe_portal_url;
  const usage      = Array.isArray(O.usage_summary) ? O.usage_summary : (isDemo ? [
    { l: "Active producers", v: "9 / 25",          w: 36 },
    { l: "Voice AI minutes", v: "12,480 / 50,000", w: 25 },
    { l: "Lead enrichment",  v: "1,840 / 5,000",   w: 37 },
    { l: "Storage",          v: "412 GB / 1 TB",   w: 41 },
  ] : []);

  const goBilling = () => {
    if (window.gotoPage) window.gotoPage("billing");
    else window.toast && window.toast("Billing page not yet wired", "info");
  };
  const updatePayment = () => {
    if (portalUrl) { window.open(portalUrl, "_blank", "noopener,noreferrer"); return; }
    window.toast && window.toast("No Stripe portal URL configured — set ORG_SETTINGS.stripe_portal_url", "warn");
  };

  if (!plan && !card && usage.length === 0) {
    return (
      <div className="ks-empty">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No billing on file</div>
        <div style={{ marginTop: 4 }}>Plan + payment method appear here once your agency is provisioned through KOINO support.</div>
        <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center" }}>
          <a className="btn" href="mailto:billing@koino.capital?subject=Activate%20billing"><Icons.Mail size={11}/> Email billing</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Wallet size={14}/> Plan<span className="ks-tile-tag">{renewAt ? `renews ${new Date(renewAt).toLocaleDateString()}` : "active"}</span></div>
        {plan ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{plan}</div>
              {planMeta && <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 2 }}>{planMeta}</div>}
            </div>
            <button className="btn btn-ghost" onClick={goBilling}>Manage plan</button>
          </div>
        ) : <div className="ks-tile-sub">Plan not set — contact billing@koino.capital to provision.</div>}
      </div>

      {usage.length > 0 && (
        <div className="panel" style={{ padding: 14 }}>
          <h3 style={{ margin: 0, marginBottom: 10, fontSize: 12.5, fontWeight: 600 }}>Usage this month</h3>
          {usage.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 200px", padding: "8px 0", alignItems: "center", borderBottom: i < usage.length - 1 ? "1px solid var(--border-subtle)" : 0, fontSize: 12.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
              <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
              <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                <div style={{ width: `${r.w}%`, height: "100%", background: "var(--accent-money)" }}></div>
              </div>
          </div>
        ))}
            </div>
          ))}
        </div>
      )}

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Wallet size={14}/> Payment method<span className="ks-tile-tag">{card ? "on file" : "missing"}</span></div>
        {card ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)" }}>
            <span className="chip">{card.brand}</span>
            <span className="mono" style={{ fontSize: 12.5 }}>**** {card.last4}</span>
            {card.exp && <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>· expires {card.exp}</span>}
            <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={updatePayment}>Update</button>
          </div>
        ) : (
          <div className="ks-tile-sub">No payment method on file. {portalUrl ? <button className="btn btn-ghost" onClick={updatePayment}>Add one in Stripe</button> : "Set ORG_SETTINGS.stripe_portal_url to enable self-service updates."}</div>
        )}
      </div>
    </div>
  );
}

function SettingsIntegrations() {
  // Pass 6 (2026-05-11): source of truth is public.connector_catalog crossed
  // with the agency's public.connections rows for connected status.
  // AppData.CONNECTIONS is now [] by default for real agencies (P1 fix), so
  // reading from it directly would hide all available connectors. The
  // catalog table is the catalog; connections is the configured-state side.
  const [catalog, setCatalog]     = React.useState([]);
  const [connections, setConnections] = React.useState([]);
  const [loading, setLoading]     = React.useState(true);
  const [loadErr, setLoadErr]     = React.useState(null);
  const [testing, setTesting]     = React.useState(null);
  const [twilioOpen, setTwilioOpen]     = React.useState(false);
  const [genericOpen, setGenericOpen]   = React.useState(null);

  const refresh = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    try {
      const [cat, conn] = await Promise.all([
        sb.from("connector_catalog").select("*"),
        sb.from("connections").select("id, connector_key, status, meta, config"),
      ]);
      // connector_catalog should be queryable by all authed users (it's a
      // global catalog). connections is RLS-scoped to viewer_agency_ids().
      if (cat.error && cat.error.code !== "PGRST116") setLoadErr(cat.error.message || String(cat.error));
      setCatalog(Array.isArray(cat.data) ? cat.data : []);
      setConnections(Array.isArray(conn.data) ? conn.data : []);
    } catch (e) {
      setLoadErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const byKey = React.useMemo(() => {
    const m = new Map();
    connections.forEach(c => m.set(c.connector_key || c.id, c));
    return m;
  }, [connections]);

  const test = async (key, label) => {
    setTesting(key);
    try {
      const r = await fetch("/api/connector/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connector_key: key }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j?.ok || j?.status === "ok")) window.toast && window.toast(`${label}: healthy`, "success");
      else window.toast && window.toast(`${label}: ${j?.error || "test failed"}`, "warn");
    } catch (_e) {
      window.toast && window.toast(`${label}: test endpoint unreachable`, "warn");
    } finally {
      setTesting(null);
      refresh();
    }
  };

  // Fall back to legacy CONNECTIONS list ONLY for demo agencies so the
  // sandbox tour still looks alive. Real agencies see the live catalog.
  const isDemoAgency = !!(window.isDemoAgency && window.isDemoAgency());
  if (isDemoAgency && catalog.length === 0 && (AppData.CONNECTIONS || []).length > 0) {
    const CONNECTIONS = AppData.CONNECTIONS;
    return (
      <div className="panel">
        <div className="panel-h"><h3>Connected services</h3><span className="meta">demo data · {CONNECTIONS.length} configured</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 140px" }}>
            <div>Service</div><div>Category</div><div>Status</div><div>Detail</div><div></div>
          </div>
          {CONNECTIONS.map(c => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 140px" }}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div style={{ color: "var(--text-tertiary)" }}>{c.category}</div>
              <div><span className={`chip ${c.status === "ok" ? "chip-money" : c.status === "warn" ? "chip-status" : "chip-danger"}`}>{c.status === "ok" ? "Connected" : c.status === "warn" ? "Action needed" : "Down"}</span></div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{c.meta}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => { if (c.id === "twilio") setTwilioOpen(true); else if (window.CONNECTOR_SCHEMAS && window.CONNECTOR_SCHEMAS[c.id]) setGenericOpen(c.id); }}>{c.status === "ok" ? "Configure" : "Reconnect"}</button>
              </div>
            </div>
          ))}
        </div>
        {twilioOpen && window.TwilioConfigModal && (() => { const M = window.TwilioConfigModal; return <M onClose={() => setTwilioOpen(false)}/>; })()}
        {genericOpen && window.ConnectorConfigModal && (() => { const M = window.ConnectorConfigModal; return <M connectorId={genericOpen} onClose={() => setGenericOpen(null)}/>; })()}
      </div>
    );
  }

  if (loading) {
    return <div className="ks-empty">Loading connector catalog…</div>;
  }
  if (loadErr) {
    return (
      <div className="ks-denied">
        <Icons.AlertTriangle size={16}/>
        <div>
          <strong>Couldn't load connectors</strong>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{loadErr}</div>
          <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button>
        </div>
      </div>
    );
  }
  if (catalog.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ margin: 0, marginBottom: 6 }}>Connectors</h3>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          No connectors in <code style={{ fontSize: 10.5 }}>connector_catalog</code> yet. Once your backend seeds the catalog, every integration (Twilio, Stripe, Gmail, iPipeline, etc.) will appear here with status badges.
        </div>
      </div>
    );
  }

  // Group by category for legibility
  const groups = catalog.reduce((acc, c) => {
    const cat = c.category || "Other";
    (acc[cat] = acc[cat] || []).push(c);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Object.entries(groups).map(([cat, items]) => (
        <div className="panel" key={cat}>
          <div className="panel-h"><h3>{cat}</h3><span className="meta">{items.filter(c => byKey.get(c.connector_key || c.id)?.status === "ok").length}/{items.length} connected</span></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 1.4fr 200px" }}>
              <div>Service</div><div>Status</div><div>Detail</div><div></div>
            </div>
            {items.map(c => {
              const key  = c.connector_key || c.id;
              const live = byKey.get(key);
              const isConnected = live && live.status === "ok";
              const isWarn      = live && live.status === "warn";
              return (
                <div key={key} className="row" style={{ gridTemplateColumns: "1.6fr 100px 1.4fr 200px" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.label || c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.description || ""}</div>
                  </div>
                  <div>
                    <span className={`chip ${isConnected ? "chip-money" : isWarn ? "chip-status" : ""}`}>
                      {isConnected ? "Connected" : isWarn ? "Action needed" : "Not connected"}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{live?.meta || ""}</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {isConnected && (
                      <button className="btn btn-ghost" onClick={() => test(key, c.label || c.name)} disabled={testing === key}>
                        {testing === key ? "Testing…" : "Test"}
                      </button>
                    )}
                    <button className="btn" onClick={() => {
                      if (key === "twilio") setTwilioOpen(true);
                      else setGenericOpen(key);
                    }}>
                      {isConnected ? "Configure" : isWarn ? "Reconnect" : "Connect"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {twilioOpen && window.TwilioConfigModal && (() => { const M = window.TwilioConfigModal; return <M onClose={() => { setTwilioOpen(false); refresh(); }}/>; })()}
      {genericOpen && window.ConnectorConfigModal && (() => { const M = window.ConnectorConfigModal; return <M connectorId={genericOpen} onClose={() => { setGenericOpen(null); refresh(); }}/>; })()}
    </div>
  );
}

/* Settings → Agents — install/uninstall AI agents recommended for the
 * viewer's role. Sources truth from suggested_agents_for_role(role) RPC.
 *
 * Install flow tries:
 *   1. RPC public.install_agent(p_agent_key) — if present, single round-trip
 *   2. Direct upsert into public.rba_installs (agency_id from current_agency_id,
 *      agent_key from suggestion). If `rba_installs` is missing we surface
 *      the error rather than silently succeed.
 *
 * Uninstall hits public.rba_installs delete (RLS confines to viewer agency).
 *
 * Pass 6 (2026-05-11).
 */
function SettingsAgents({ role = "owner" }) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [installs,    setInstalls]    = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [err,         setErr]         = React.useState(null);
  const [busyKey,     setBusyKey]     = React.useState(null);
  const [agencyId,    setAgencyId]    = React.useState(null);

  const refresh = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    try {
      const aid = (await sb.rpc("current_agency_id"))?.data || null;
      setAgencyId(aid);
      const [sug, ins] = await Promise.all([
        sb.rpc("suggested_agents_for_role", { p_role: role }),
        sb.from("rba_installs").select("agent_key, status, installed_at"),
      ]);
      if (Array.isArray(sug?.data)) setSuggestions(sug.data);
      if (Array.isArray(ins?.data)) setInstalls(ins.data);
      if (sug?.error && sug.error.code !== "PGRST116") setErr(sug.error.message || String(sug.error));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [role]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const installedKeys = React.useMemo(() => new Set(installs.map(i => i.agent_key)), [installs]);

  const install = async (agentKey, label) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setBusyKey(agentKey);
    try {
      // Try RPC first
      let ok = false;
      try {
        const r = await sb.rpc("install_agent", { p_agent_key: agentKey });
        if (!r.error) ok = true;
      } catch (_e) {}
      if (!ok) {
        // Fallback: direct insert. agency_id falls from RLS or current_agency_id.
        const row = { agent_key: agentKey, status: "installed" };
        if (agencyId) row.agency_id = agencyId;
        const r2 = await sb.from("rba_installs").upsert(row, { onConflict: "agency_id,agent_key" });
        if (r2.error) throw r2.error;
      }
      window.toast && window.toast(`${label} installed`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Install failed: ${e?.message || e}`, "error");
    } finally { setBusyKey(null); }
  };

  const uninstall = async (agentKey, label) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setBusyKey(agentKey);
    try {
      let q = sb.from("rba_installs").delete().eq("agent_key", agentKey);
      if (agencyId) q = q.eq("agency_id", agencyId);
      const r = await q;
      if (r.error) throw r.error;
      window.toast && window.toast(`${label} uninstalled`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Uninstall failed: ${e?.message || e}`, "error");
    } finally { setBusyKey(null); }
  };

  if (loading) {
    return <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading agent recommendations…</div>;
  }
  if (err) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--state-danger)" }}>Couldn't load agents</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 10px" }}>{err}</div>
        <button className="btn" onClick={refresh}>Try again</button>
      </div>
    );
  }
  if (suggestions.length === 0) {
    return (
      <div className="panel" style={{ padding: 18 }}>
        <h3 style={{ margin: 0, marginBottom: 6 }}>Agents</h3>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          No agents seeded in <code style={{ fontSize: 10.5 }}>role_agent_defaults</code> for the <strong>{role}</strong> role yet. Ask your IMO admin to populate defaults, or install agents directly from the Ops → Agents page.
        </div>
      </div>
    );
  }

  const required = suggestions.filter(a => a.required);
  const optional = suggestions.filter(a => !a.required);

  const renderRow = (a) => {
    const key = a.agent_key || a.id;
    const label = a.label || a.name || key;
    const installed = installedKeys.has(key);
    return (
      <div key={key} className="row" style={{ gridTemplateColumns: "1.4fr 1.6fr 130px", padding: "10px 12px", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
            {a.required && <span className="chip chip-status" style={{ marginRight: 6, fontSize: 10 }}>required</span>}
            {a.host_hint && <span style={{ fontSize: 10.5 }}>runs on {a.host_hint}</span>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{a.description || ""}</div>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {installed ? (
            <>
              <span className="chip chip-money" style={{ fontSize: 10.5 }}>installed</span>
              <button
                className="btn btn-ghost"
                disabled={a.required || busyKey === key}
                title={a.required ? "Required agents can't be uninstalled" : "Uninstall"}
                onClick={() => uninstall(key, label)}
              >
                {busyKey === key ? "…" : "Uninstall"}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busyKey === key} onClick={() => install(key, label)}>
              {busyKey === key ? "Installing…" : "Install"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {required.length > 0 && (
        <div className="panel">
          <div className="panel-h">
            <h3>Required for {role}s</h3>
            <span className="meta">{required.filter(a => installedKeys.has(a.agent_key || a.id)).length}/{required.length} installed</span>
          </div>
          <div className="list">{required.map(renderRow)}</div>
        </div>
      )}
      {optional.length > 0 && (
        <div className="panel">
          <div className="panel-h">
            <h3>Recommended</h3>
            <span className="meta">{optional.length} optional agents</span>
          </div>
          <div className="list">{optional.map(renderRow)}</div>
        </div>
      )}
    </div>
  );
}

/* API keys — agency-scoped keys persisted to public.api_keys (migration
 * 0019). Plaintext returned exactly once by api_key_issue() RPC; we hold it
 * in a one-shot reveal block then drop it from memory.
 *
 * The webhooks panel underneath stays demo-only for now — no webhooks table
 * exists yet. We're honest about that with an inline note. */
function SettingsApi() {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [justIssued, setJustIssued] = React.useState(null); // { plaintext, prefix, label }
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("api_keys")
        .select("id, label, prefix, scopes, created_at, last_used_at, expires_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const issue = async () => {
    if (!sb) return;
    if (!newLabel.trim()) { window.toast && window.toast("Label required", "warn"); return; }
    setBusy(true);
    try {
      const r = await sb.rpc("api_key_issue", { p_label: newLabel.trim() });
      if (r.error) throw r.error;
      // RPC returns table-set — supabase-js gives us an array, take row 0.
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row || !row.plaintext) throw new Error("RPC returned no plaintext");
      setJustIssued({ plaintext: row.plaintext, prefix: row.prefix, label: newLabel.trim() });
      setCreating(false); setNewLabel("");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Issue failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  const revoke = async (row) => {
    if (!sb) return;
    if (!confirm(`Revoke "${row.label}" (prefix ${row.prefix}…)? Integrations using it will start failing.`)) return;
    const r = await sb.rpc("api_key_revoke", { p_id: row.id });
    if (r.error) { window.toast && window.toast(`Revoke failed: ${r.error.message}`, "error"); return; }
    window.toast && window.toast(`${row.label} revoked`, "success");
    await refresh();
  };

  if (loading) return <div className="ks-empty">Loading API keys…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div>Couldn't load API keys: <span className="mono">{err}</span></div></div>;

  const active = rows.filter(r => !r.revoked_at);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {justIssued && (
        <div className="ks-tile" style={{ borderColor: "var(--accent-money)" }}>
          <div className="ks-tile-h">
            <Icons.Sparkles size={14}/> {justIssued.label}
            <span className="ks-tile-tag">save now — you won't see this again</span>
          </div>
          <div className="ks-tile-sub">Copy this key into your integration's config. Once you close this banner the plaintext is gone — only the prefix and the SHA-256 hash remain in our database.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, background: "var(--bg-base)", borderRadius: 8 }}>
            <span className="mono" style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all" }}>{justIssued.plaintext}</span>
            <button className="btn" onClick={() => navigator.clipboard.writeText(justIssued.plaintext).then(() => window.toast && window.toast("Copied", "success"))}><Icons.Copy size={12}/> Copy</button>
            <button className="btn btn-ghost" onClick={() => setJustIssued(null)}><Icons.X size={12}/></button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="ks-section-label" style={{ padding: 0 }}>API keys</div>
        <span className="chip">{active.length} active · {rows.length - active.length} revoked</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
          <Icons.Plus size={12}/> New key
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="ks-empty">
          <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No API keys issued yet</div>
          <div style={{ marginTop: 4 }}>Click New key to mint one. We hash and store only the prefix and SHA-256 — the plaintext is shown to you once and never again.</div>
        </div>
      ) : (
        <div className="panel"><div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 120px 130px 90px" }}>
            <div>Label</div><div>Prefix</div><div>Last used</div><div>Issued</div><div></div>
          </div>
          {rows.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 120px 130px 90px", opacity: r.revoked_at ? 0.5 : 1 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{r.label}</div>
                {r.revoked_at && <div style={{ fontSize: 10.5, color: "var(--state-danger)" }}>revoked {new Date(r.revoked_at).toLocaleDateString()}</div>}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{r.prefix}…</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.last_used_at ? new Date(r.last_used_at).toLocaleString() : "never"}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {!r.revoked_at && <button className="btn btn-ghost" onClick={() => revoke(r)} style={{ fontSize: 10.5 }}>Revoke</button>}
              </div>
            </div>
          ))}
        </div></div>
      )}

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Send size={14}/> Webhooks<span className="ks-tile-tag">coming soon</span></div>
        <div className="ks-tile-sub">Outbound webhooks (lead.new, deal.issued, deal.nigo) aren't persisted yet — needs the <span className="mono">webhooks</span> table. Until then, push from your side via the REST API and an API key above.</div>
      </div>

      {creating && (
        <Shared.Modal title="Issue API key" width={460} onClose={() => { setCreating(false); setNewLabel(""); }} actions={
          <>
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewLabel(""); }}>Cancel</button>
            <button className="btn btn-primary" onClick={issue} disabled={busy || !newLabel.trim()}><Icons.Check size={11}/> {busy ? "Minting…" : "Issue key"}</button>
          </>
        }>
          <Shared.Field label="Label" hint="What's this key for? Shows up in the list above.">
            <input className="text-input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Zapier prod, Salesforce sync, internal cron…" autoFocus/>
          </Shared.Field>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
            Default scopes: <span className="mono">leads:read, leads:write, pipeline:read</span>. Per-key scopes will arrive in a follow-up.
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

/* Routing rules — agency-scoped lead routing config persisted to
 * public.routing_rules (migration 0019). Inline weight slider auto-saves on
 * mouseup. Full edit / create goes through a modal. */
function SettingsRouting() {
  const sb = window.getSupabase && window.getSupabase();
  const [rules,   setRules]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [editing, setEditing] = React.useState(null);  // null | {id?, source, route_to, weight, active}
  const [busy,    setBusy]    = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("routing_rules")
        .select("id, source, route_to, weight, active, notes, updated_at")
        .order("weight", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const persistWeight = async (id, weight) => {
    if (!sb) return;
    const { error } = await sb.from("routing_rules").update({ weight, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) window.toast && window.toast(`Save weight failed: ${error.message}`, "error");
  };

  const toggleActive = async (row) => {
    if (!sb) return;
    const next = !row.active;
    const { error } = await sb.from("routing_rules").update({ active: next, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { window.toast && window.toast(`Toggle failed: ${error.message}`, "error"); return; }
    window.toast && window.toast(`${row.source}: ${next ? "active" : "paused"}`, "success");
    await refresh();
  };

  const deleteRule = async (row) => {
    if (!sb) return;
    if (!confirm(`Delete routing rule "${row.source} → ${row.route_to}"?`)) return;
    const { error } = await sb.from("routing_rules").delete().eq("id", row.id);
    if (error) { window.toast && window.toast(`Delete failed: ${error.message}`, "error"); return; }
    window.toast && window.toast("Rule removed", "success");
    await refresh();
  };

  const save = async () => {
    if (!sb || !editing) return;
    if (!editing.source?.trim() || !editing.route_to?.trim()) {
      window.toast && window.toast("Source and route are required", "warn"); return;
    }
    setBusy(true);
    try {
      const payload = {
        source:   editing.source.trim(),
        route_to: editing.route_to.trim(),
        weight:   Math.max(0, Math.min(100, +editing.weight || 50)),
        active:   editing.active !== false,
        notes:    editing.notes || null,
      };
      let r;
      if (editing.id) r = await sb.from("routing_rules").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
      else            r = await sb.from("routing_rules").insert(payload);
      if (r.error) throw r.error;
      window.toast && window.toast(editing.id ? "Rule updated" : "Rule added", "success");
      setEditing(null);
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="ks-empty">Loading routing rules…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div>Couldn't load routing rules: <span className="mono">{err}</span></div></div>;

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Routing rules</h3>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{rules.filter(r => r.active).length} active · {rules.length} total · higher priority routes first</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ source: "", route_to: "", weight: 50, active: true })}><Icons.Plus size={12}/> New rule</button>
      </div>

      {rules.length === 0 ? (
        <div className="ks-empty">No routing rules yet. Add one to control which producer gets which lead source. Without rules, leads fall to round-robin across active reps.</div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 90px 110px" }}>
            <div>Source / trigger</div><div>Route to</div><div>Priority</div><div>Active</div><div></div>
          </div>
          {rules.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 90px 110px", opacity: r.active ? 1 : 0.55 }}>
              <div style={{ fontWeight: 500 }}>{r.source}</div>
              <div style={{ color: "var(--text-secondary)" }}>{r.route_to}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={0} max={100} value={r.weight}
                       onChange={(e) => setRules(rs => rs.map(x => x.id === r.id ? { ...x, weight: +e.target.value } : x))}
                       onMouseUp={(e) => persistWeight(r.id, +e.target.value)}
                       onTouchEnd={(e) => persistWeight(r.id, +e.target.value)}
                       style={{ flex: 1 }}/>
                <span className="tabular" style={{ width: 30, fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.weight}</span>
              </div>
              <div><button className="btn btn-ghost" onClick={() => toggleActive(r)} style={{ fontSize: 10.5 }}>{r.active ? "ON" : "OFF"}</button></div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => setEditing({ ...r })}><Icons.Edit size={11}/></button>
                <button className="btn btn-ghost" onClick={() => deleteRule(r)} title="Delete rule"><Icons.X size={11}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Shared.Modal title={editing.id ? "Edit routing rule" : "New routing rule"} width={460} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Icons.Check size={11}/> {busy ? "Saving…" : "Save"}</button>
          </>
        }>
          <Shared.Field label="Source / trigger">
            <input className="text-input" value={editing.source || ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="e.g. FB Lead Form · T65" autoFocus/>
          </Shared.Field>
          <Shared.Field label="Route to">
            <input className="text-input" value={editing.route_to || ""} onChange={(e) => setEditing({ ...editing, route_to: e.target.value })} placeholder="e.g. Med Supp specialists / Bilingual round-robin"/>
          </Shared.Field>
          <Shared.Field label={`Priority weight · ${editing.weight ?? 50}`}>
            <input type="range" min={0} max={100} value={editing.weight ?? 50} onChange={(e) => setEditing({ ...editing, weight: +e.target.value })} style={{ width: "100%" }}/>
          </Shared.Field>
          <Shared.Field label="Notes (optional)">
            <textarea className="text-input" rows={2} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}/>
          </Shared.Field>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })}/>
            Active
          </label>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   New settings tabs introduced by the 2026-05-11 role-audit pass.
   Each component is honest about its backend: it either reads from a known
   table/RPC, or renders a clear "needs wiring" empty state instead of
   pretending to save.
   ───────────────────────────────────────────────────────────────────────── */

/* Personal connectors — Telegram chat id + handle + alert opt-ins.
 * Stored on public.profiles via save_profile({p: {telegram_chat_id, ...}}).
 * Coexists with org-wide Connectors (Integrations tab) — that one is
 * agency-shared, this one is the signed-in user's own. */
function SettingsPersonalConnectors() {
  const sb = window.getSupabase && window.getSupabase();
  const [loading, setLoading]   = React.useState(true);
  const [err,     setErr]       = React.useState(null);
  const [form,    setForm]      = React.useState({ telegram_chat_id: "", telegram_handle: "", slack_member_id: "", phone_for_alerts: "" });
  const [dirty,   setDirty]     = React.useState({});
  const [saving,  setSaving]    = React.useState(false);
  const [saveMsg, setSaveMsg]   = React.useState("");
  const [testing, setTesting]   = React.useState(false);
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };

  React.useEffect(() => {
    if (!sb) { setLoading(false); return; }
    (async () => {
      try {
        const r = await sb.rpc("get_my_profile");
        if (r.error) throw r.error;
        const p = (typeof r.data === "string" ? JSON.parse(r.data) : (r.data || {})).profile || {};
        setForm({
          telegram_chat_id: p.telegram_chat_id || "",
          telegram_handle:  p.telegram_handle || "",
          slack_member_id:  p.slack_member_id || "",
          phone_for_alerts: p.phone_for_alerts || p.phone || "",
        });
        setDirty({});
      } catch (e) { setErr(String(e?.message || e)); }
      finally    { setLoading(false); }
    })();
  }, [sb]);

  const save = async () => {
    if (!sb || Object.keys(dirty).length === 0) return;
    setSaving(true); setSaveMsg("");
    try {
      const patch = {};
      Object.keys(dirty).forEach(k => { patch[k] = form[k]; });
      const r = await sb.rpc("save_profile", { p: patch });
      if (r.error) throw r.error;
      setDirty({});
      setSaveMsg("Saved.");
      window.toast && window.toast("Personal connectors saved", "success");
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  const testTelegram = async () => {
    if (!form.telegram_chat_id) { window.toast && window.toast("Set chat id first", "warn"); return; }
    if (Object.keys(dirty).length > 0) { window.toast && window.toast("Save first — test pings the saved chat id", "warn"); return; }
    setTesting(true);
    try {
      const r = await fetch("/api/connector/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ connector_key: "telegram_personal", target: form.telegram_chat_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j.ok || j.status === "ok")) window.toast && window.toast("Telegram test message sent — check your DMs", "success");
      else window.toast && window.toast(`Test failed: ${j?.error || `HTTP ${r.status}`}`, "warn");
    } catch (e) {
      window.toast && window.toast(`Test endpoint unreachable: ${e?.message || e}`, "warn");
    } finally { setTesting(false); }
  };

  if (loading) return <div className="ks-empty">Loading personal connectors…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div>Couldn't load profile: <span className="mono">{err}</span></div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ks-tile">
        <div className="ks-tile-h">
          <Icons.Send size={14}/> Telegram
          <span className="ks-tile-tag">{form.telegram_chat_id ? "configured" : "not set"}</span>
        </div>
        <div className="ks-tile-sub">Get personal pages for hot leads, NIGOs and morning briefs straight to Telegram. Open <span className="mono">@RepFlowBot</span>, send <span className="mono">/start</span>, paste the chat id it replies with.</div>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Shared.Field label="Chat id"><input className="text-input" value={form.telegram_chat_id} onChange={(e) => update("telegram_chat_id", e.target.value.replace(/[^\d-]/g, ""))} placeholder="123456789"/></Shared.Field>
          <Shared.Field label="Handle (optional)"><input className="text-input" value={form.telegram_handle} onChange={(e) => update("telegram_handle", e.target.value)} placeholder="@yourhandle"/></Shared.Field>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn" onClick={testTelegram} disabled={!form.telegram_chat_id || testing}><Icons.Send size={12}/> {testing ? "Sending…" : "Send test ping"}</button>
          {Object.keys(dirty).includes("telegram_chat_id") && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>save first to test</span>}
        </div>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.MessageSquare size={14}/> Slack DMs<span className="ks-tile-tag">{form.slack_member_id ? "configured" : "off"}</span></div>
        <div className="ks-tile-sub">Routes commission paid / NIGO assignments to your Slack DMs. Find your <span className="mono">U…</span> member id under Profile → Copy member id in Slack.</div>
        <Shared.Field label="Slack member id"><input className="text-input" value={form.slack_member_id} onChange={(e) => update("slack_member_id", e.target.value)} placeholder="U01ABCD2EF"/></Shared.Field>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Phone size={14}/> Alerts phone<span className="ks-tile-tag">SMS</span></div>
        <div className="ks-tile-sub">SMS pings for new lead in queue + NIGO returns. Defaults to your profile phone.</div>
        <Shared.Field label="Phone (E.164)"><input className="text-input" value={form.phone_for_alerts} onChange={(e) => update("phone_for_alerts", e.target.value)} placeholder="+14045550142"/></Shared.Field>
      </div>

      <div className="panel" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}>
          <Icons.Check size={12}/> {saving ? "Saving…" : "Save connectors"}
        </button>
        {saveMsg  && <span style={{ color: "var(--accent-money)", fontSize: 12 }}>{saveMsg}</span>}
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? "" : "s"}</span>}
      </div>
    </div>
  );
}

/* Resources tab — read-only catalogue of agency scripts / videos / docs /
 * quick-links. Pulls from public.agency_{scripts,videos,docs,quick_links}.
 * Reps and managers see these; managers additionally see the Team scripts
 * editor on its own tab. */
function SettingsResources({ role = "rep" }) {
  const sb = window.getSupabase && window.getSupabase();
  const [scripts, setScripts] = React.useState([]);
  const [videos,  setVideos]  = React.useState([]);
  const [docs,    setDocs]    = React.useState([]);
  const [links,   setLinks]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // Per-source errors so the manager sees "videos table missing" but the
  // other three sections still render. Silent catch was hiding real issues.
  const [errs,    setErrs]    = React.useState({});

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    const newErrs = {};
    const safeFetch = async (table, columns, order) => {
      try {
        let q = sb.from(table).select(columns).limit(40);
        if (order) q = q.order(order, { ascending: false });
        const { data, error } = await q;
        if (error) { newErrs[table] = error.message || String(error); return []; }
        return Array.isArray(data) ? data : [];
      } catch (e) { newErrs[table] = String(e?.message || e); return []; }
    };
    const [s, v, d, l] = await Promise.all([
      safeFetch("agency_scripts",      "id, title, kind, updated_at",  "updated_at"),
      safeFetch("agency_videos",       "id, title, url, updated_at",   "updated_at"),
      safeFetch("agency_docs",         "id, title, url, updated_at",   "updated_at"),
      safeFetch("agency_quick_links",  "id, label, url",                null),
    ]);
    setScripts(s); setVideos(v); setDocs(d); setLinks(l); setErrs(newErrs);
    setLoading(false);
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="ks-empty">Loading resources…</div>;

  const total = scripts.length + videos.length + docs.length + links.length;
  const errEntries = Object.entries(errs);

  if (total === 0 && errEntries.length === 0) {
    return (
      <div className="ks-empty">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No resources yet</div>
        <div style={{ marginTop: 4 }}>Your manager / owner can add scripts, videos and docs from the main Resources page. They'll appear here once published.</div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => window.gotoPage && window.gotoPage("resources")}><Icons.ArrowUpRight size={11}/> Open Resources page</button>
      </div>
    );
  }

  const tile = (item, label) => (
    <a key={item.id} href={item.url || "#"} target={item.url ? "_blank" : undefined} rel="noopener noreferrer"
       className="ks-tile" style={{ textDecoration: "none", color: "inherit", cursor: item.url ? "pointer" : "default" }}>
      <div className="ks-tile-h"><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.title || item.label}</span><span className="ks-tile-tag">{label}</span></div>
      {item.kind && <div className="ks-tile-sub">{item.kind}</div>}
    </a>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ks-tile" style={{ background: "transparent", border: 0, padding: 0 }}>
        <div className="ks-tile-sub">Read-only view of everything your agency has published — scripts, training videos, docs, quick links.
          {role === "rep" && " Ask your manager to publish new material; you can't edit from here."}
        </div>
      </div>
      {errEntries.length > 0 && (
        <div className="ks-denied">
          <Icons.AlertTriangle size={16} style={{ color: "var(--state-warning)" }}/>
          <div>
            <strong>Some sources couldn't load</strong>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
              {errEntries.map(([t, e]) => <div key={t} className="mono" style={{ fontSize: 10.5 }}>{t}: {e}</div>)}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button>
          </div>
        </div>
      )}
      {scripts.length > 0 && (
        <div>
          <div className="ks-section-label">Scripts</div>
          <div className="ks-grid">{scripts.map(s => tile(s, s.kind || "script"))}</div>
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <div className="ks-section-label">Videos</div>
          <div className="ks-grid">{videos.map(v => tile(v, "video"))}</div>
        </div>
      )}
      {docs.length > 0 && (
        <div>
          <div className="ks-section-label">Docs</div>
          <div className="ks-grid">{docs.map(d => tile(d, "doc"))}</div>
        </div>
      )}
      {links.length > 0 && (
        <div>
          <div className="ks-section-label">Quick links</div>
          <div className="ks-grid">{links.map(l => tile(l, "link"))}</div>
        </div>
      )}
    </div>
  );
}

/* Team scripts — manager+ can publish / archive scripts that show up in the
 * rep's Resources tab. Reads + writes public.agency_scripts. */
function SettingsTeamScripts({ canEdit }) {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [editing, setEditing] = React.useState(null); // null | {id?, title, kind, body, status}
  const [busy,    setBusy]    = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("active"); // active | all | archived
  const [kindFilter,   setKindFilter]   = React.useState("all");

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("agency_scripts")
        .select("id, title, kind, body, status, updated_at")
        .order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const filtered = React.useMemo(() => rows.filter(r => {
    if (statusFilter === "active"   && r.status === "archived") return false;
    if (statusFilter === "archived" && r.status !== "archived") return false;
    if (kindFilter !== "all" && (r.kind || "opener") !== kindFilter) return false;
    return true;
  }), [rows, statusFilter, kindFilter]);

  const save = async () => {
    if (!sb || !editing) return;
    if (!editing.title.trim()) { window.toast && window.toast("Title required", "warn"); return; }
    setBusy(true);
    try {
      const payload = { title: editing.title.trim(), kind: editing.kind || "opener", body: editing.body || "", status: editing.status || "published" };
      let r;
      if (editing.id) r = await sb.from("agency_scripts").update(payload).eq("id", editing.id);
      else            r = await sb.from("agency_scripts").insert(payload);
      if (r.error) throw r.error;
      window.toast && window.toast(editing.id ? "Script updated" : "Script published", "success");
      setEditing(null);
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  const archive = async (row) => {
    if (!sb) return;
    if (!confirm(`Archive "${row.title}"? Reps will stop seeing it in Resources.`)) return;
    const { error } = await sb.from("agency_scripts").update({ status: "archived" }).eq("id", row.id);
    if (error) { window.toast && window.toast(`Archive failed: ${error.message}`, "error"); return; }
    window.toast && window.toast("Script archived", "success");
    await refresh();
  };

  if (loading) return <div className="ks-empty">Loading team scripts…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div>Couldn't load team scripts: <span className="mono">{err}</span><div style={{ marginTop: 6 }}><button className="btn btn-ghost" onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button></div></div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="ks-section-label" style={{ padding: 0 }}>Team scripts</div>
        <span className="chip">{rows.filter(r => r.status !== "archived").length} live · {rows.length} total</span>
        <Shared.Select value={statusFilter} onChange={setStatusFilter} options={[
          { v: "active",   l: "Active only" },
          { v: "all",      l: "All statuses" },
          { v: "archived", l: "Archived" },
        ]}/>
        <Shared.Select value={kindFilter} onChange={setKindFilter} options={[
          { v: "all",       l: "All kinds" },
          { v: "opener",    l: "Opener" },
          { v: "rebuttal",  l: "Rebuttal" },
          { v: "discovery", l: "Discovery" },
          { v: "close",     l: "Close" },
          { v: "voicemail", l: "Voicemail" },
        ]}/>
        {canEdit && <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setEditing({ title: "", kind: "opener", body: "", status: "published" })}><Icons.Plus size={12}/> New script</button>}
      </div>
      {filtered.length === 0 ? (
        <div className="ks-empty">{rows.length === 0 ? (canEdit ? "No team scripts yet. Click New script to publish your first." : "Ask your manager to publish one.") : "No scripts match the current filters."}</div>
      ) : (
        <div className="ks-grid-wide">
          {filtered.map(r => (
            <div key={r.id} className="ks-tile">
              <div className="ks-tile-h">
                <span style={{ fontSize: 12.5 }}>{r.title}</span>
                <span className="ks-tile-tag">{r.kind || "script"}</span>
              </div>
              {r.body && <div className="ks-tile-sub" style={{ whiteSpace: "pre-wrap", maxHeight: 90, overflow: "hidden" }}>{r.body.slice(0, 240)}{r.body.length > 240 ? "…" : ""}</div>}
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {r.status === "archived" && <span className="chip chip-danger" style={{ fontSize: 10 }}>archived</span>}
                {canEdit && (
                  <>
                    <button className="btn btn-ghost" onClick={() => setEditing({ ...r })}><Icons.Edit size={11}/> Edit</button>
                    {r.status !== "archived" && <button className="btn btn-ghost" onClick={() => archive(r)} title="Archive"><Icons.X size={11}/></button>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Shared.Modal title={editing.id ? "Edit script" : "New team script"} width={520} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Icons.Check size={11}/> {busy ? "Saving…" : "Save"}</button>
          </>
        }>
          <Shared.Field label="Title"><input className="text-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus/></Shared.Field>
          <Shared.Field label="Kind">
            <Shared.Select value={editing.kind || "opener"} onChange={(v) => setEditing({ ...editing, kind: v })} options={[
              { v: "opener",    l: "Opener" },
              { v: "rebuttal",  l: "Rebuttal" },
              { v: "discovery", l: "Discovery" },
              { v: "close",     l: "Close" },
              { v: "voicemail", l: "Voicemail" },
            ]}/>
          </Shared.Field>
          <Shared.Field label="Body" hint="Plain text or markdown — what reps see when they open the script">
            <textarea className="text-input" rows={8} value={editing.body || ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })}/>
          </Shared.Field>
          <Shared.Field label="Status">
            <Shared.Select value={editing.status || "published"} onChange={(v) => setEditing({ ...editing, status: v })} options={[
              { v: "published", l: "Published — visible to reps" },
              { v: "draft",     l: "Draft — owner / manager only" },
              { v: "archived",  l: "Archived" },
            ]}/>
          </Shared.Field>
        </Shared.Modal>
      )}
    </div>
  );
}

/* Compliance — DNC / Jornaya / TrustedForm account ids + agency-wide opt-out
 * uploads. Persisted under public.org_settings via AppData.mutate.orgSettingsSave. */
function SettingsCompliance() {
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const O = (window.AppData?.ORG_SETTINGS) || {};
  const [form, setForm] = React.useState({
    dnc_list_url:        O.dnc_list_url || "",
    jornaya_account_id:  O.jornaya_account_id || "",
    jornaya_site_id:     O.jornaya_site_id || "",
    trustedform_account: O.trustedform_account || "",
    quiet_hours_start:   O.quiet_hours_start || "21:00",
    quiet_hours_end:     O.quiet_hours_end || "08:00",
    record_all_calls:    O.record_all_calls ?? true,
    soa_required:        O.soa_required ?? true,
  });
  const [dirty, setDirty]   = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const patch = {};
      Object.keys(dirty).forEach(k => { patch[k] = form[k]; });
      await window.AppData.mutate.orgSettingsSave(patch);
      setDirty({});
      window.toast && window.toast(`Compliance saved${window.AppData?.LIVE ? "" : " (demo only)"}`, "success");
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Shield size={14}/> DNC list<span className="ks-tile-tag">{form.dnc_list_url ? "set" : "missing"}</span></div>
        <div className="ks-tile-sub">URL or storage path to your federal/state DNC scrub list. Your dialer should reject any number that appears here.</div>
        <Shared.Field label="DNC source URL"><input className="text-input" value={form.dnc_list_url} onChange={(e) => update("dnc_list_url", e.target.value)} placeholder="https://… or s3://agency-bucket/dnc.csv"/></Shared.Field>
        <Shared.Field label="Quiet hours" hint="Outbound dialing blocked outside this window (local time of the lead).">
          <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="text-input" type="time" value={form.quiet_hours_start} onChange={(e) => update("quiet_hours_start", e.target.value)}/>
            <input className="text-input" type="time" value={form.quiet_hours_end} onChange={(e) => update("quiet_hours_end", e.target.value)}/>
          </div>
        </Shared.Field>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Activity size={14}/> Jornaya LeadiD<span className="ks-tile-tag">{form.jornaya_account_id ? "configured" : "off"}</span></div>
        <div className="ks-tile-sub">Tracks every web lead's TCPA consent. Account + site id from your Jornaya dashboard.</div>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Shared.Field label="Account id"><input className="text-input" value={form.jornaya_account_id} onChange={(e) => update("jornaya_account_id", e.target.value)} placeholder="JV-XXXXX"/></Shared.Field>
          <Shared.Field label="Site id"><input className="text-input" value={form.jornaya_site_id} onChange={(e) => update("jornaya_site_id", e.target.value)} placeholder="ST-XXXXX"/></Shared.Field>
        </div>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Activity size={14}/> TrustedForm<span className="ks-tile-tag">{form.trustedform_account ? "configured" : "off"}</span></div>
        <div className="ks-tile-sub">ActiveProspect TrustedForm cert proves consent timestamp. Account id from app.trustedform.com.</div>
        <Shared.Field label="Account id"><input className="text-input" value={form.trustedform_account} onChange={(e) => update("trustedform_account", e.target.value)} placeholder="AP-XXXXX"/></Shared.Field>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Mic size={14}/> Call recording<span className="ks-tile-tag">{form.record_all_calls ? "on" : "off"}</span></div>
        <div className="ks-tile-sub">Record every dialer call. Required by most carriers for SOA and post-issue verification.</div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 12.5 }}>
          <input type="checkbox" checked={form.record_all_calls} onChange={(e) => update("record_all_calls", e.target.checked)}/>
          Record all outbound + inbound calls
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 12.5 }}>
          <input type="checkbox" checked={form.soa_required} onChange={(e) => update("soa_required", e.target.checked)}/>
          Require SOA on Medicare appointments
        </label>
      </div>

      <div className="panel" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}>
          <Icons.Check size={12}/> {saving ? "Saving…" : "Save compliance"}
        </button>
        {isDemo && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>demo agency · changes won't persist</span>}
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved</span>}
      </div>
    </div>
  );
}

/* Branding — agency logo URL, primary brand color, dark/light mode default.
 * Persisted to public.org_settings. Live preview swatches on the right. */
function SettingsBranding() {
  const O = (window.AppData?.ORG_SETTINGS) || {};
  const [form, setForm] = React.useState({
    brand_logo_url:   O.brand_logo_url || "",
    brand_color:      O.brand_color || "#00d4aa",
    brand_color_dark: O.brand_color_dark || "#0d0d0d",
    public_name:      O.public_name || O.name || "",
    tagline:          O.tagline || "",
    default_theme:    O.default_theme || "dark",
  });
  const [dirty, setDirty]   = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const patch = {};
      Object.keys(dirty).forEach(k => { patch[k] = form[k]; });
      await window.AppData.mutate.orgSettingsSave(patch);
      setDirty({});
      window.toast && window.toast("Branding saved", "success");
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ks-grid-wide">
        <div className="ks-tile">
          <div className="ks-tile-h"><Icons.Building size={14}/> Public identity</div>
          <Shared.Field label="Public agency name"><input className="text-input" value={form.public_name} onChange={(e) => update("public_name", e.target.value)} placeholder="Atlas Insurance Group"/></Shared.Field>
          <Shared.Field label="Tagline"><input className="text-input" value={form.tagline} onChange={(e) => update("tagline", e.target.value)} placeholder="Senior life & Medicare specialists"/></Shared.Field>
          <Shared.Field label="Logo URL"><input className="text-input" value={form.brand_logo_url} onChange={(e) => update("brand_logo_url", e.target.value)} placeholder="https://cdn.../logo.svg"/></Shared.Field>
        </div>
        <div className="ks-tile">
          <div className="ks-tile-h"><Icons.Sparkles size={14}/> Brand colors</div>
          <Shared.Field label="Primary"><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={form.brand_color} onChange={(e) => update("brand_color", e.target.value)} style={{ width: 32, height: 32, border: 0, background: "transparent", padding: 0 }}/>
            <input className="text-input" value={form.brand_color} onChange={(e) => update("brand_color", e.target.value)} style={{ flex: 1 }}/>
          </div></Shared.Field>
          <Shared.Field label="Dark surface"><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={form.brand_color_dark} onChange={(e) => update("brand_color_dark", e.target.value)} style={{ width: 32, height: 32, border: 0, background: "transparent", padding: 0 }}/>
            <input className="text-input" value={form.brand_color_dark} onChange={(e) => update("brand_color_dark", e.target.value)} style={{ flex: 1 }}/>
          </div></Shared.Field>
          <Shared.Field label="Default theme">
            <Shared.Select value={form.default_theme} onChange={(v) => update("default_theme", v)} options={[
              { v: "dark",  l: "Dark (recommended)" },
              { v: "light", l: "Light" },
              { v: "auto",  l: "Match user" },
            ]}/>
          </Shared.Field>
        </div>
      </div>

      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Bookmark size={14}/> Preview</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, background: form.brand_color_dark, borderRadius: 10 }}>
          {form.brand_logo_url
            ? <img src={form.brand_logo_url} alt="logo" style={{ height: 36, borderRadius: 6 }} onError={(e) => { e.currentTarget.style.display = "none"; }}/>
            : <div style={{ width: 36, height: 36, borderRadius: 8, background: form.brand_color, display: "grid", placeItems: "center", fontWeight: 700, color: "#0a0a0a" }}>{(form.public_name || "K")[0]}</div>
          }
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{form.public_name || "Your agency"}</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{form.tagline || "Tagline shows up under your name in producer-facing surfaces"}</div>
          </div>
          <button style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, background: form.brand_color, color: "#0a0a0a", fontWeight: 600, border: 0, fontSize: 12 }}>Primary CTA</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}>
          <Icons.Check size={12}/> {saving ? "Saving…" : "Save branding"}
        </button>
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved</span>}
      </div>
    </div>
  );
}

/* Products — agency-managed products from public.products. Owner can toggle
 * which ones reps see in the quote engine. Read-only for managers. */
function SettingsProducts({ canEdit }) {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [busyId,  setBusyId]  = React.useState(null);
  const [lineFilter, setLineFilter] = React.useState("all");

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("products")
        .select("id, carrier_id, line, name, status, commission_pct, updated_at")
        .order("line").limit(200);
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (row) => {
    if (!sb || !canEdit) return;
    setBusyId(row.id);
    try {
      const next = row.status === "active" ? "paused" : "active";
      const { error } = await sb.from("products").update({ status: next, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      window.toast && window.toast(`${row.name}: ${next}`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusyId(null); }
  };

  if (loading) return <div className="ks-empty">Loading products…</div>;
  if (err) {
    return (
      <div className="ks-denied">
        <Icons.AlertTriangle size={16}/>
        <div>
          <strong>Couldn't load products</strong>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }} className="mono">{err}</div>
          <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button>
        </div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="ks-empty">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No products mapped to this agency yet</div>
        <div style={{ marginTop: 4 }}>Add carrier appointments first (Carriers tab), then publish their product catalog.</div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => {
          try { sessionStorage.setItem("repflow.settings.tab", "carriers"); } catch {}
          window.dispatchEvent(new CustomEvent("settings:tab", { detail: "carriers" }));
        }}>Open Carriers</button>
      </div>
    );
  }
  const lines = Array.from(new Set(rows.map(r => r.line || "Other"))).sort();
  const filtered = lineFilter === "all" ? rows : rows.filter(r => (r.line || "Other") === lineFilter);

  const byLine = filtered.reduce((m, r) => { (m[r.line || "Other"] = m[r.line || "Other"] || []).push(r); return m; }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="ks-section-label" style={{ padding: 0 }}>Products</div>
        <span className="chip">{rows.filter(r => r.status === "active").length}/{rows.length} active</span>
        <Shared.Select value={lineFilter} onChange={setLineFilter} options={[{ v: "all", l: "All lines" }, ...lines.map(l => ({ v: l, l }))]}/>
        <button className="btn btn-ghost" onClick={refresh} style={{ marginLeft: "auto" }}><Icons.RefreshCw size={11}/> Refresh</button>
      </div>
      {Object.entries(byLine).map(([line, items]) => (
        <div className="panel" key={line}>
          <div className="panel-h">
            <h3>{line}</h3>
            <span className="meta">{items.filter(r => r.status === "active").length}/{items.length} active</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 120px" }}>
              <div>Product</div><div>Commission %</div><div>Status</div><div></div>
            </div>
            {items.map(r => (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 120px" }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div className="tabular">{r.commission_pct != null ? `${Number(r.commission_pct).toFixed(2)}%` : "—"}</div>
                <div><span className={`chip ${r.status === "active" ? "chip-money" : ""}`}>{r.status || "unknown"}</span></div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {canEdit ? (
                    <button className="btn btn-ghost" disabled={busyId === r.id} onClick={() => toggle(r)}>
                      {busyId === r.id ? "…" : (r.status === "active" ? "Pause" : "Activate")}
                    </button>
                  ) : <span style={{ fontSize: 10.5, color: "var(--text-quaternary)" }}>read-only</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Cross-agency — admin / imo_owner sees every agency they have visibility
 * into via viewer_agency_ids(). */
function SettingsCrossAgency() {
  const sb = window.getSupabase && window.getSupabase();
  const [rows, setRows]     = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,    setErr]    = React.useState(null);
  const [filter, setFilter] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState("all");

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("agencies")
        .select("id, name, kind, parent_agency_id, created_at, is_demo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="ks-empty">Loading visible agencies…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div>Couldn't load agencies: <span className="mono">{err}</span><div style={{ marginTop: 6 }}><button className="btn btn-ghost" onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button></div></div></div>;
  if (rows.length === 0) return <div className="ks-empty">You only see one agency — yourself. Add child agencies in Provision sub-agency.</div>;

  const filtered = rows.filter(r => {
    if (kindFilter !== "all" && (r.kind || "agency") !== kindFilter) return false;
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (r.name || "").toLowerCase().includes(f) || (r.id || "").toLowerCase().includes(f);
  });
  const byId = new Map(rows.map(r => [r.id, r]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or id…" style={{ maxWidth: 280 }}/>
        <Shared.Select value={kindFilter} onChange={setKindFilter} options={[
          { v: "all",    l: "All kinds" },
          { v: "agency", l: "Agency" },
          { v: "imo",    l: "IMO" },
        ]}/>
        <span className="chip">{filtered.length} of {rows.length}</span>
        <button className="btn btn-ghost" onClick={refresh} style={{ marginLeft: "auto" }}><Icons.RefreshCw size={11}/> Refresh</button>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Visible agencies</h3><span className="meta">RLS-scoped via viewer_agency_ids()</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 1fr 110px 90px 100px" }}>
            <div>Agency</div><div>Kind</div><div>Parent</div><div>Created</div><div>Mode</div><div></div>
          </div>
          {filtered.map(r => {
            const parent = r.parent_agency_id ? byId.get(r.parent_agency_id) : null;
            return (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.6fr 90px 1fr 110px 90px 100px" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.id.slice(0, 8)}…</div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.kind || "agency"}</div>
                <div style={{ fontSize: 11.5, color: parent ? "var(--text-secondary)" : "var(--text-quaternary)" }}>{parent ? parent.name : "—"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</div>
                <div>{r.is_demo ? <span className="chip">demo</span> : <span className="chip chip-money" style={{ fontSize: 10 }}>live</span>}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => {
                    try { localStorage.setItem("repflow.active_agency", r.id); } catch {}
                    window.toast && window.toast(`Switching to ${r.name}…`, "info");
                    window.location.reload();
                  }}>Open</button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="ks-empty" style={{ margin: 8 }}>No agencies match the current filters.</div>}
        </div>
      </div>
    </div>
  );
}

/* Provision sub-agency — calls public.create_child_agency() RPC if present.
 * Falls back to a direct insert. */
function SettingsProvisionSubAgency() {
  const sb = window.getSupabase && window.getSupabase();
  const [form, setForm] = React.useState({ name: "", owner_email: "", kind: "agency", is_demo: false });
  const [busy, setBusy] = React.useState(false);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!sb) return;
    if (!form.name.trim() || !form.owner_email.trim()) {
      window.toast && window.toast("Name + owner email required", "warn"); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email.trim())) {
      window.toast && window.toast("Owner email looks invalid", "warn"); return;
    }
    setBusy(true);
    try {
      let ok = false;
      let rpcErr = null;
      try {
        const r = await sb.rpc("create_child_agency", { p_name: form.name.trim(), p_owner_email: form.owner_email.trim(), p_kind: form.kind, p_is_demo: form.is_demo });
        if (!r.error) ok = true;
        else rpcErr = r.error;
      } catch (e) { rpcErr = e; }
      if (!ok) {
        // Fallback path: insert agency, then mint an invite via /api/invites/create
        // so it carries the correct agency_id binding + auth token.
        const ins = await sb.from("agencies").insert({ name: form.name.trim(), kind: form.kind, is_demo: form.is_demo }).select("id").single();
        if (ins.error) throw ins.error;
        const newAgencyId = ins.data?.id;
        if (!newAgencyId) throw new Error("Agency created but id not returned");
        try {
          const { data: session } = await sb.auth.getSession();
          if (session?.session) {
            const inviteRes = await fetch("/api/invites/create", {
              method: "POST",
              headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
              body: JSON.stringify({ agency_id: newAgencyId, role: "owner", email_hint: form.owner_email.trim() })
            });
            if (!inviteRes.ok) {
              const j = await inviteRes.json().catch(() => ({}));
              window.toast && window.toast(`Agency created — invite mint failed: ${j.error || inviteRes.statusText}`, "warn");
            } else {
              const j = await inviteRes.json();
              if (j.invite_url) {
                navigator.clipboard?.writeText(j.invite_url).catch(() => {});
                window.toast && window.toast(`Invite link copied — send to ${form.owner_email}`, "success");
              }
            }
          }
        } catch (e2) {
          window.toast && window.toast(`Agency created — invite endpoint unreachable: ${e2?.message || e2}`, "warn");
        }
      }
      window.toast && window.toast(`Provisioned ${form.name}`, "success");
      setForm({ name: "", owner_email: "", kind: "agency", is_demo: false });
    } catch (e) {
      window.toast && window.toast(`Provision failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.Plus size={14}/> Provision a sub-agency</div>
        <div className="ks-tile-sub">Creates a child agency under your IMO. The owner email gets a magic-link invite to claim the agency on first sign-in.</div>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Shared.Field label="Agency name"><input className="text-input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Atlas SE Region"/></Shared.Field>
          <Shared.Field label="Owner email"><input className="text-input" type="email" value={form.owner_email} onChange={(e) => update("owner_email", e.target.value)} placeholder="owner@subagency.com"/></Shared.Field>
          <Shared.Field label="Kind">
            <Shared.Select value={form.kind} onChange={(v) => update("kind", v)} options={[
              { v: "agency", l: "Single agency" },
              { v: "imo",    l: "IMO (can have its own children)" },
            ]}/>
          </Shared.Field>
          <Shared.Field label="Demo data">
            <label style={{ display: "flex", gap: 6, alignItems: "center", padding: 7, fontSize: 12 }}>
              <input type="checkbox" checked={form.is_demo} onChange={(e) => update("is_demo", e.target.checked)}/>
              Seed with demo pipeline / reps
            </label>
          </Shared.Field>
        </div>
        <div>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icons.Check size={12}/> {busy ? "Provisioning…" : "Create sub-agency"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Audit log — read-only feed of audit events. Queries public.audit_log if
 * present, otherwise notifications fallback. */
function SettingsAuditLog() {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [source,  setSource]  = React.useState("audit_log");
  const [filter,  setFilter]  = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [limit,   setLimit]   = React.useState(100);

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      let r = await sb.from("audit_log")
        .select("id, agency_id, action, actor_id, target_table, target_id, created_at, payload")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (r.error) {
        // Fall back to notifications — same row shape from this UI's
        // perspective (id, created_at, action, target).
        const r2 = await sb.from("notifications")
          .select("id, kind, created_at, body, payload")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (!r2.error) { setRows(Array.isArray(r2.data) ? r2.data : []); setSource("notifications"); }
        else          { setRows([]); setErr(r.error.message || String(r.error)); }
      } else {
        setRows(Array.isArray(r.data) ? r.data : []);
        setSource("audit_log");
      }
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb, limit]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const actions = React.useMemo(() => {
    const s = new Set();
    rows.forEach(r => { const a = r.action || r.kind; if (a) s.add(a); });
    return Array.from(s).sort();
  }, [rows]);

  if (loading) return <div className="ks-empty">Loading audit log…</div>;
  if (err && rows.length === 0) {
    return (
      <div className="ks-denied">
        <Icons.AlertTriangle size={16}/>
        <div>
          <strong>Couldn't load audit log</strong>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{err}</div>
          <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button>
        </div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="ks-empty">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No audit events yet</div>
        <div style={{ marginTop: 4 }}>Audit events show up here as your team uses the OS. Reads are scoped via viewer_agency_ids() so you see your own agency's footprint.</div>
      </div>
    );
  }

  const filtered = rows.filter(r => {
    if (actionFilter !== "all" && (r.action || r.kind) !== actionFilter) return false;
    if (!filter.trim()) return true;
    return JSON.stringify(r).toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter actions / actors / targets…" style={{ maxWidth: 280 }}/>
        <Shared.Select value={actionFilter} onChange={setActionFilter} options={[{ v: "all", l: "All actions" }, ...actions.map(a => ({ v: a, l: a }))]}/>
        <Shared.Select value={limit} onChange={(v) => setLimit(+v)} options={[
          { v: 50,  l: "last 50"  },
          { v: 100, l: "last 100" },
          { v: 250, l: "last 250" },
          { v: 500, l: "last 500" },
        ]}/>
        <span className="chip">{filtered.length} of {rows.length}</span>
        <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-tertiary)" }}>source: {source}</span>
        <button className="btn btn-ghost" onClick={refresh}><Icons.RefreshCw size={12}/> Refresh</button>
      </div>
      <div className="panel">
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "140px 1fr 1.2fr 110px" }}>
            <div>When</div><div>Action</div><div>Target</div><div>Actor</div>
          </div>
          {filtered.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: "140px 1fr 1.2fr 110px" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }} title={r.created_at}>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</div>
              <div style={{ fontWeight: 500 }}>{r.action || r.kind || "—"}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.target_table ? `${r.target_table}/${(r.target_id || "").toString().slice(0, 8)}` : (r.body || "—")}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{(r.actor_id || "").toString().slice(0, 8) || "—"}</div>
            </div>
          ))}
          {filtered.length === 0 && <div className="ks-empty" style={{ margin: 8 }}>No events match the current filters.</div>}
        </div>
      </div>
    </div>
  );
}

/* Feature flags — super-admin only. Reads public.feature_flags. */
function SettingsFeatureFlags() {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [busyKey, setBusyKey] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [newRow, setNewRow] = React.useState({ key: "", enabled: false, scope: "global", description: "" });
  const [filter, setFilter] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("feature_flags").select("*").order("key");
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (row) => {
    setBusyKey(row.key);
    try {
      const { error } = await sb.from("feature_flags").update({ enabled: !row.enabled, updated_at: new Date().toISOString() }).eq("key", row.key);
      if (error) throw error;
      window.toast && window.toast(`${row.key}: ${!row.enabled ? "ON" : "OFF"}`, "success");
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Toggle failed: ${e?.message || e}`, "error");
    } finally { setBusyKey(null); }
  };

  const create = async () => {
    if (!newRow.key.trim()) { window.toast && window.toast("Key required", "warn"); return; }
    try {
      const { error } = await sb.from("feature_flags").insert({ key: newRow.key.trim(), enabled: newRow.enabled, scope: newRow.scope, description: newRow.description });
      if (error) throw error;
      window.toast && window.toast(`Flag ${newRow.key} created`, "success");
      setCreating(false); setNewRow({ key: "", enabled: false, scope: "global", description: "" });
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Create failed: ${e?.message || e}`, "error");
    }
  };

  if (loading) return <div className="ks-empty">Loading feature flags…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div><strong>Couldn't load flags</strong><div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{err}</div><button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button></div></div>;

  const filtered = rows.filter(r => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return r.key.toLowerCase().includes(f) || (r.description || "").toLowerCase().includes(f);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="ks-section-label" style={{ padding: 0 }}>Feature flags</div>
        <span className="chip">{rows.filter(r => r.enabled).length}/{rows.length} on</span>
        <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by key or description…" style={{ maxWidth: 260 }}/>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}><Icons.Plus size={12}/> New flag</button>
      </div>
      {rows.length === 0 ? (
        <div className="ks-empty">No flags defined yet. Click New flag to add one — flags become readable to every authed user immediately.</div>
      ) : filtered.length === 0 ? (
        <div className="ks-empty">No flags match the filter.</div>
      ) : (
        <div className="panel"><div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 1fr 100px" }}>
            <div>Key</div><div>Scope</div><div>Description</div><div></div>
          </div>
          {filtered.map(r => (
            <div key={r.key} className="row" style={{ gridTemplateColumns: "1.4fr 100px 1fr 100px" }}>
              <div className="mono" style={{ fontWeight: 500 }}>{r.key}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.scope || "global"}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.description || "—"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" disabled={busyKey === r.key} onClick={() => toggle(r)}>
                  {busyKey === r.key ? "…" : (r.enabled ? <span style={{ color: "var(--accent-money)", fontWeight: 700 }}>ON</span> : <span style={{ color: "var(--text-quaternary)" }}>OFF</span>)}
                </button>
              </div>
            </div>
          ))}
        </div></div>
      )}
      {creating && (
        <Shared.Modal title="New feature flag" width={460} onClose={() => setCreating(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create}><Icons.Check size={11}/> Create</button>
          </>
        }>
          <Shared.Field label="Key"><input className="text-input mono" value={newRow.key} onChange={(e) => setNewRow({ ...newRow, key: e.target.value.replace(/[^a-z0-9_]/gi, "_") })} placeholder="auto_quoter_v2" autoFocus/></Shared.Field>
          <Shared.Field label="Scope">
            <Shared.Select value={newRow.scope} onChange={(v) => setNewRow({ ...newRow, scope: v })} options={[
              { v: "global", l: "Global — every agency" },
              { v: "agency", l: "Per-agency override" },
              { v: "user",   l: "Per-user override" },
            ]}/>
          </Shared.Field>
          <Shared.Field label="Description"><textarea className="text-input" rows={3} value={newRow.description} onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}/></Shared.Field>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={newRow.enabled} onChange={(e) => setNewRow({ ...newRow, enabled: e.target.checked })}/>
            Enable immediately
          </label>
        </Shared.Modal>
      )}
    </div>
  );
}

/* Demo controls — reset / reseed the demo agency for super-admin testing. */
function SettingsDemoControls() {
  const sb = window.getSupabase && window.getSupabase();
  const [busy, setBusy] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  // The Atlas demo agency id is fixed in migration 0001 and reused as the
  // anon-RLS carve-out. We surface it so the operator knows exactly which
  // tenant the destructive actions hit.
  const DEMO_ID = window.Shared?.DEMO_AGENCY_ID || "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

  const refreshStats = React.useCallback(async () => {
    if (!sb) return;
    try {
      const [pipe, calls, reps] = await Promise.all([
        sb.from("pipeline").select("id", { count: "exact", head: true }).eq("agency_id", DEMO_ID),
        sb.from("recordings").select("id", { count: "exact", head: true }).eq("agency_id", DEMO_ID),
        sb.from("reps").select("id", { count: "exact", head: true }).eq("agency_id", DEMO_ID),
      ]);
      setStats({
        pipeline:   typeof pipe.count   === "number" ? pipe.count   : null,
        recordings: typeof calls.count  === "number" ? calls.count  : null,
        reps:       typeof reps.count   === "number" ? reps.count   : null,
      });
    } catch (_e) {}
  }, [sb, DEMO_ID]);
  React.useEffect(() => { refreshStats(); }, [refreshStats]);

  const call = async (rpc, label, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(rpc);
    try {
      const r = await sb.rpc(rpc);
      if (r.error) throw r.error;
      window.toast && window.toast(`${label}: done`, "success");
      await refreshStats();
    } catch (e) {
      window.toast && window.toast(`${label} failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ks-tile">
        <div className="ks-tile-h">
          <Icons.Brain size={14}/> Demo agency
          <span className="ks-tile-tag mono">{DEMO_ID.slice(0, 8)}…</span>
        </div>
        <div className="ks-tile-sub">The Atlas demo agency is the seed shown to anon visitors. These actions reset its pipeline, reps, and recorded calls back to factory defaults — they only affect this exact agency_id.</div>
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 6 }}>
            <div style={{ padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 8 }}><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Pipeline</div><div className="tabular" style={{ fontSize: 15, fontWeight: 700 }}>{stats.pipeline ?? "—"}</div></div>
            <div style={{ padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 8 }}><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Recordings</div><div className="tabular" style={{ fontSize: 15, fontWeight: 700 }}>{stats.recordings ?? "—"}</div></div>
            <div style={{ padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 8 }}><div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Reps</div><div className="tabular" style={{ fontSize: 15, fontWeight: 700 }}>{stats.reps ?? "—"}</div></div>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <button className="btn" disabled={busy === "reseed_demo"}         onClick={() => call("reseed_demo",         "Reseed demo",     "Reseed the demo agency (overwrites Atlas data)?")}>{busy === "reseed_demo"         ? "…" : "Reseed demo"}</button>
          <button className="btn" disabled={busy === "reset_demo_pipeline"} onClick={() => call("reset_demo_pipeline", "Reset pipeline",  "Reset the demo pipeline (kanban + queue) only?")}>{busy === "reset_demo_pipeline" ? "…" : "Reset pipeline"}</button>
          <button className="btn" disabled={busy === "wipe_demo_calls"}     onClick={() => call("wipe_demo_calls",     "Wipe calls",      "Wipe the demo agency's call recordings?")}>{busy === "wipe_demo_calls"     ? "…" : "Wipe demo calls"}</button>
        </div>
      </div>
      <div className="ks-tile">
        <div className="ks-tile-h"><Icons.AlertTriangle size={14}/> RPC notes</div>
        <div className="ks-tile-sub">These call public RPCs (<span className="mono">reseed_demo / wipe_demo_calls / reset_demo_pipeline</span>). If an RPC isn't defined yet you'll see "function … does not exist" — that means nothing was changed; safe to ignore until the RPC ships.</div>
      </div>
    </div>
  );
}

/* Global integrations — super-admin manages the connector_catalog itself
 * (not per-agency connections). */
function SettingsGlobalIntegrations() {
  const sb = window.getSupabase && window.getSupabase();
  const [rows,    setRows]    = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [busy,    setBusy]    = React.useState(false);
  const [filter,  setFilter]  = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");

  const refresh = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const { data, error } = await sb.from("connector_catalog").select("*").order("category").order("label");
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setErr(String(e?.message || e)); }
    finally    { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const categories = React.useMemo(() => Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort(), [rows]);
  const filtered = rows.filter(r => {
    if (catFilter !== "all" && r.category !== catFilter) return false;
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (r.label || "").toLowerCase().includes(f)
        || (r.connector_key || "").toLowerCase().includes(f)
        || (r.description || "").toLowerCase().includes(f);
  });

  const save = async () => {
    if (!editing?.connector_key?.trim()) { window.toast && window.toast("Key required", "warn"); return; }
    setBusy(true);
    try {
      const payload = {
        connector_key: editing.connector_key.trim(),
        label:         editing.label || editing.connector_key,
        category:      editing.category || "Other",
        description:   editing.description || "",
        is_enabled:    editing.is_enabled !== false,
      };
      const { error } = await sb.from("connector_catalog").upsert(payload, { onConflict: "connector_key" });
      if (error) throw error;
      window.toast && window.toast(`Catalog ${payload.connector_key} saved`, "success");
      setEditing(null);
      await refresh();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="ks-empty">Loading global connector catalog…</div>;
  if (err)     return <div className="ks-denied"><Icons.AlertTriangle size={16}/> <div><strong>Couldn't load catalog</strong><div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{err}</div><button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={refresh}><Icons.RefreshCw size={11}/> Retry</button></div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="ks-section-label" style={{ padding: 0 }}>Connector catalog</div>
        <span className="chip">{rows.filter(r => r.is_enabled !== false).length}/{rows.length} enabled</span>
        <input className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" style={{ maxWidth: 220 }}/>
        <Shared.Select value={catFilter} onChange={setCatFilter} options={[{ v: "all", l: "All categories" }, ...categories.map(c => ({ v: c, l: c }))]}/>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setEditing({ connector_key: "", label: "", category: "Other", description: "", is_enabled: true })}>
          <Icons.Plus size={12}/> New connector
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="ks-empty">Catalog is empty. Add the first connector to make it visible to every agency.</div>
      ) : filtered.length === 0 ? (
        <div className="ks-empty">No connectors match the filter.</div>
      ) : (
        <div className="panel"><div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 110px 1fr 90px 80px" }}>
            <div>Connector</div><div>Category</div><div>Description</div><div>Status</div><div></div>
          </div>
          {filtered.map(r => (
            <div key={r.connector_key} className="row" style={{ gridTemplateColumns: "1fr 110px 1fr 90px 80px" }}>
              <div><div style={{ fontWeight: 500 }}>{r.label || r.connector_key}</div><div className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.connector_key}</div></div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.category}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.description}</div>
              <div><span className={`chip ${r.is_enabled === false ? "" : "chip-money"}`}>{r.is_enabled === false ? "off" : "on"}</span></div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-ghost" onClick={() => setEditing({ ...r })}><Icons.Edit size={11}/></button></div>
            </div>
          ))}
        </div></div>
      )}
      {editing && (
        <Shared.Modal title={editing.connector_key && rows.some(r => r.connector_key === editing.connector_key) ? "Edit connector" : "New connector"} width={520} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Icons.Check size={11}/> {busy ? "Saving…" : "Save"}</button>
          </>
        }>
          <Shared.Field label="Key (snake_case)"><input className="text-input mono" value={editing.connector_key} onChange={(e) => setEditing({ ...editing, connector_key: e.target.value.replace(/[^a-z0-9_]/gi, "_") })} placeholder="twilio / stripe / gmail"/></Shared.Field>
          <Shared.Field label="Label"><input className="text-input" value={editing.label || ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Twilio"/></Shared.Field>
          <Shared.Field label="Category"><input className="text-input" value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Voice / CRM / Billing / Compliance"/></Shared.Field>
          <Shared.Field label="Description"><textarea className="text-input" rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })}/></Shared.Field>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={editing.is_enabled !== false} onChange={(e) => setEditing({ ...editing, is_enabled: e.target.checked })}/>
            Visible to every agency
          </label>
        </Shared.Modal>
      )}
    </div>
  );
}

/* Notifications — what events I get a ping for. Loads existing prefs on
 * mount from public.notification_prefs (via the existing AppData mutate
 * helper). Toggles auto-save with optimistic UI; on error rolls back.
 *
 * Note: there are TWO notification surfaces in this app:
 *   - SettingsNotifications (this) — per-event opt-in (leadNew, nigo, …)
 *   - SettingsPersonalConnectors    — which channels (Telegram, Slack, …)
 * They're complementary; this one controls *what*, that one controls *how*. */
const NOTIF_DEFAULTS = {
  leadNew: true, leadStuck: true, dealIssued: true, nigo: true,
  coachingNew: false, recruitingNew: true, dailyDigest: true,
};
const NOTIF_DEFS = [
  ["leadNew",       "New lead in my queue",          "Push within 30s of routing"],
  ["leadStuck",     "Lead stuck > 3 days in stage",  "Daily morning digest"],
  ["dealIssued",    "Deal issued",                    "Push immediately"],
  ["nigo",          "NIGO returned",                   "Push + email + escalate to mgr"],
  ["coachingNew",   "New coaching card for me",       "Daily digest"],
  ["recruitingNew", "New applicant in funnel",         "Daily"],
  ["dailyDigest",   "Daily digest email",              "08:00 weekdays"],
];

function SettingsNotifications() {
  const sb = window.getSupabase && window.getSupabase();
  const [prefs,   setPrefs]   = React.useState(NOTIF_DEFAULTS);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState(null);
  const [savingKey, setSavingKey] = React.useState(null);

  React.useEffect(() => {
    if (!sb) { setLoading(false); return; }
    (async () => {
      try {
        // Try the dedicated table first.
        const r = await sb.from("notification_prefs")
          .select("prefs")
          .eq("user_id", (await sb.auth.getUser()).data?.user?.id || "")
          .maybeSingle();
        if (r.error && r.error.code !== "PGRST116") throw r.error;
        if (r.data?.prefs && typeof r.data.prefs === "object") {
          setPrefs({ ...NOTIF_DEFAULTS, ...r.data.prefs });
        }
      } catch (e) {
        setErr(String(e?.message || e));
      } finally { setLoading(false); }
    })();
  }, [sb]);

  const update = async (k, v) => {
    const previous = prefs;
    const next = { ...prefs, [k]: v };
    setPrefs(next);                 // optimistic
    setSavingKey(k);
    try {
      await window.AppData.mutate.notificationPrefsSave("me", next);
    } catch (e) {
      // Rollback on failure — never leave the UI in a fake "saved" state.
      setPrefs(previous);
      window.toast && window.toast(`Couldn't save: ${e?.message || e}`, "error");
    } finally { setSavingKey(null); }
  };

  if (loading) return <div className="ks-empty">Loading notification preferences…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {err && (
        <div className="ks-denied">
          <Icons.AlertTriangle size={16} style={{ color: "var(--state-warning)" }}/>
          <div>
            <strong>Using defaults</strong>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>Couldn't read your saved preferences: <span className="mono">{err}</span>. Toggling will create a new row.</div>
          </div>
        </div>
      )}
      <div className="ks-tile" style={{ background: "transparent", border: 0, padding: 0 }}>
        <div className="ks-tile-sub">Which events trigger a notification. The <em>how</em> (Telegram / SMS / Slack / email digest) lives in <strong>Personal connectors</strong>.</div>
      </div>
      <div className="panel">
        {NOTIF_DEFS.map(([k, l, sub], i) => (
          <label key={k} style={{ display: "grid", gridTemplateColumns: "auto 1fr 110px", gap: 12, padding: "12px 14px", borderBottom: i < NOTIF_DEFS.length - 1 ? "1px solid var(--border-subtle)" : 0, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={!!prefs[k]} onChange={(e) => update(k, e.target.checked)} disabled={savingKey === k}/>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{l}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 1 }}>{sub}</div>
            </div>
            <span style={{ textAlign: "right", color: savingKey === k ? "var(--text-tertiary)" : (prefs[k] ? "var(--accent-money)" : "var(--text-quaternary)"), fontSize: 11.5, fontWeight: 500 }}>
              {savingKey === k ? "saving…" : (prefs[k] ? "ON" : "off")}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
/* Settings → Profile — bound to public.profiles via save_profile +
 * get_my_profile RPCs (2026-05-11 backend).
 *
 * Was: every input was uncontrolled (defaultValue=) with no onChange,
 * no save button, and hardcoded "marcus@atlasimo.com" / Atlas chips —
 * the "can't save my profile info" bug Ian reported.
 *
 * Now:
 *  - get_my_profile() on mount loads profile + memberships + agency_id
 *  - controlled inputs across every editable field
 *  - save_profile(p jsonb) on click — backend preserves keys not sent
 *  - v_user_metrics rendered as a tiny KPI strip for the signed-in user
 *  - NPN, licensed_states (multi-select), license_expirations
 *    (per-state date), E&O carrier + expiry, notification_prefs
 *    (email / sms / telegram / in_app + digest_frequency) all wired.
 */
const PROFILE_ALL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const PROFILE_TIMEZONES = [
  { v: "America/New_York",     l: "Eastern (ET)" },
  { v: "America/Chicago",      l: "Central (CT)" },
  { v: "America/Denver",       l: "Mountain (MT)" },
  { v: "America/Phoenix",      l: "Arizona (no DST)" },
  { v: "America/Los_Angeles",  l: "Pacific (PT)" },
  { v: "America/Anchorage",    l: "Alaska" },
  { v: "Pacific/Honolulu",     l: "Hawaii" },
];
const DIGEST_FREQ = [
  { v: "off",     l: "Off" },
  { v: "realtime",l: "Real-time" },
  { v: "daily",   l: "Daily digest" },
  { v: "weekly",  l: "Weekly digest" },
];

function SettingsProfile({ role }) {
  const sb = window.getSupabase && window.getSupabase();
  const [loading,  setLoading]  = React.useState(true);
  const [loadErr,  setLoadErr]  = React.useState(null);
  const [saving,   setSaving]   = React.useState(false);
  const [saveMsg,  setSaveMsg]  = React.useState("");
  const [bundle,   setBundle]   = React.useState(null); // { profile, memberships, current_agency_id, is_platform_admin }
  const [metrics,  setMetrics]  = React.useState(null);
  // avatarOk MUST live at the top with the other hooks — calling useState
  // after a conditional `if (loading) return` would violate the Rules of
  // Hooks the moment loading flips false (different hook count between
  // renders → React tears down state).
  const [avatarOk, setAvatarOk] = React.useState(true);

  // Form state shadows the bundle.profile fields. We track ONLY user-touched
  // fields in `dirty` so save_profile sends a minimal patch and the backend
  // preserves untouched keys (the contract per the RPC spec).
  const [form,  setForm]  = React.useState({});
  const [dirty, setDirty] = React.useState({});
  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(d => ({ ...d, [k]: true })); };
  const updateNotif = (k, v) => {
    setForm(f => ({ ...f, notification_prefs: { ...(f.notification_prefs || {}), [k]: v } }));
    setDirty(d => ({ ...d, notification_prefs: true }));
  };
  // Reset avatarOk when the URL changes — declared here so all hooks fire
  // unconditionally on every render (Rules of Hooks).
  React.useEffect(() => { setAvatarOk(true); }, [form.avatar_url]);

  const load = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true); setLoadErr(null);
    try {
      const r = await sb.rpc("get_my_profile");
      if (r.error) throw r.error;
      const b = (typeof r.data === "string") ? JSON.parse(r.data) : (r.data || {});
      setBundle(b);
      const p = b?.profile || {};
      setForm({
        display_name:        p.display_name || "",
        full_name:           p.full_name || "",
        email:               p.email || "",
        phone:               p.phone || "",
        title:               p.title || "",
        bio:                 p.bio || "",
        pronouns:            p.pronouns || "",
        avatar_url:          p.avatar_url || "",
        linkedin_url:        p.linkedin_url || "",
        website_url:         p.website_url || "",
        timezone:            p.timezone || "America/New_York",
        theme:               p.theme || "system",
        density:             p.density || "comfortable",
        default_landing:     p.default_landing || "",
        npn:                 p.npn || "",
        licensed_states:     Array.isArray(p.licensed_states) ? p.licensed_states : [],
        license_expirations: (p.license_expirations && typeof p.license_expirations === "object") ? p.license_expirations : {},
        eando_carrier:       p.eando_carrier || "",
        eando_expires_at:    p.eando_expires_at || "",
        background_check_status: p.background_check_status || "",
        notification_prefs:  (p.notification_prefs && typeof p.notification_prefs === "object") ? p.notification_prefs : {
          email: true, sms: false, telegram: false, in_app: true, digest_frequency: "daily",
        },
      });
      setDirty({});
      // Fetch metrics in the background — don't block the form on this.
      try {
        const mr = await sb.from("v_user_metrics").select("*").maybeSingle();
        if (mr.data) setMetrics(mr.data);
      } catch (_e) {}
    } catch (e) {
      setLoadErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [sb]);
  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!sb) return;
    setSaving(true); setSaveMsg("");
    try {
      // Build minimal patch — only dirty keys + their current value.
      // Email is auth-managed; never include it in a save_profile patch even
      // if some stale dirty flag survives (defense-in-depth).
      const patch = {};
      Object.keys(dirty).forEach(k => { if (k !== "email") patch[k] = form[k]; });
      if (Object.keys(patch).length === 0) {
        setSaveMsg("Nothing to save."); setSaving(false);
        setTimeout(() => setSaveMsg(""), 1500);
        return;
      }
      const r = await sb.rpc("save_profile", { p: patch });
      if (r.error) throw r.error;
      setSaveMsg("Saved.");
      window.toast && window.toast("Profile saved", "success");
      // Refresh me() so any header chip / sidebar greeting picks up the new
      // display_name without a full reload.
      if (window.refreshMe) await window.refreshMe();
      await load();
      setTimeout(() => setSaveMsg(""), 1500);
    } catch (e) {
      setSaveMsg("");
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
    } finally { setSaving(false); }
  };

  const toggleState = (s) => {
    const cur = Array.isArray(form.licensed_states) ? form.licensed_states : [];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s].sort();
    update("licensed_states", next);
  };
  const setStateExpiry = (s, iso) => {
    const cur = (form.license_expirations && typeof form.license_expirations === "object") ? form.license_expirations : {};
    const next = { ...cur };
    if (iso) next[s] = iso; else delete next[s];
    update("license_expirations", next);
  };

  if (loading) {
    return <div className="ks-empty">Loading profile…</div>;
  }
  if (loadErr) {
    return (
      <div className="ks-denied" style={{ alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Icons.AlertTriangle size={18} style={{ color: "var(--state-danger)" }}/>
          <strong>Couldn't load your profile</strong>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }} className="mono">{loadErr}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={load}><Icons.RefreshCw size={12}/> Try again</button>
          <button className="btn btn-ghost" onClick={() => window.signOut && window.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  const memberships = bundle?.memberships || [];
  const isPlatformAdmin = !!bundle?.is_platform_admin;
  const np = form.notification_prefs || {};

  // P7: Licensing section is only relevant for producer-side roles
  // (owner / manager / rep / admin). A user whose ONLY memberships are
  // imo_owner has no producer license to manage from this surface — hide.
  // Falls open if memberships isn't populated yet so we don't accidentally
  // hide a section the user needs on a slow load.
  const licensingRoles = new Set(["owner", "manager", "rep", "admin"]);
  const showLicensing = memberships.length === 0
    || memberships.some(m => licensingRoles.has(m.role));

  // Live avatar — if avatar_url is present and loads, render the image;
  // on error fall through to Shared.Avatar's initials block.
  // (useState + useEffect both live at the top of the component — see above.)
  const previewName = form.display_name || form.full_name || form.email || "—";
  const previewHandle = form.display_name ? "@" + form.display_name.split(/\s+/)[0].toLowerCase() : "";
  const avatarBlock = (form.avatar_url && avatarOk) ? (
    <img
      src={form.avatar_url}
      alt={previewName}
      onError={() => setAvatarOk(false)}
      style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", background: "var(--bg-raised)", flexShrink: 0 }}
    />
  ) : (
    <Shared.Avatar rep={{ name: previewName, handle: previewHandle, color: "var(--text-tertiary)" }} size={48}/>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {avatarBlock}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{previewName === "—" ? "Set your name" : previewName}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {form.title || role}
              {isPlatformAdmin && <span className="chip chip-status" style={{ marginLeft: 8, fontSize: 10 }}>platform admin</span>}
              {memberships.length > 0 && <span style={{ marginLeft: 8 }}>· {memberships.length} membership{memberships.length === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>

        {/* Metrics strip (best-effort — hidden if v_user_metrics is missing). */}
        {metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
            {[
              ["Commissions",       metrics.commissions_count       ?? 0],
              ["Calls recorded",    metrics.calls_recorded          ?? 0],
              ["Agency policies",   metrics.agency_policies_total   ?? 0],
              ["Agency open pipe",  metrics.agency_pipeline_open    ?? 0],
            ].map(([l, v]) => (
              <div key={l} style={{ padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{l}</div>
                <div className="tabular" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="divider"></div>

        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Identity</h4>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Shared.Field label="Display name"><input className="text-input" value={form.display_name} onChange={(e) => update("display_name", e.target.value)} placeholder="What teammates call you"/></Shared.Field>
          <Shared.Field label="Legal full name"><input className="text-input" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="On your producer license"/></Shared.Field>
          <Shared.Field label="Email" hint="Auth-managed — change via Sign out → magic-link with new address."><input className="text-input" value={form.email} readOnly disabled style={{ opacity: 0.7, cursor: "not-allowed" }} placeholder="you@agency.com"/></Shared.Field>
          <Shared.Field label="Phone"><input className="text-input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 (404) 555-0142"/></Shared.Field>
          <Shared.Field label="Title"><input className="text-input" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Senior producer"/></Shared.Field>
          <Shared.Field label="Pronouns"><input className="text-input" value={form.pronouns} onChange={(e) => update("pronouns", e.target.value)} placeholder="they/them"/></Shared.Field>
          <Shared.Field label="Avatar URL"><input className="text-input" value={form.avatar_url} onChange={(e) => update("avatar_url", e.target.value)} placeholder="https://…"/></Shared.Field>
          <Shared.Field label="Website"><input className="text-input" value={form.website_url} onChange={(e) => update("website_url", e.target.value)} placeholder="https://your.site"/></Shared.Field>
          <Shared.Field label="LinkedIn"><input className="text-input" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…"/></Shared.Field>
          <Shared.Field label="Time zone"><Shared.Select value={form.timezone} onChange={(v) => update("timezone", v)} options={PROFILE_TIMEZONES}/></Shared.Field>
        </div>
        <Shared.Field label="Bio"><textarea className="text-input" rows={3} value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder="Short bio — appears in your producer profile."/></Shared.Field>
      </div>

      {showLicensing && (
      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Licensing</h4>
        <div className="profile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Shared.Field label="NPN" hint="National Producer Number"><input className="text-input" value={form.npn} onChange={(e) => update("npn", e.target.value.replace(/\D/g, ""))} placeholder="19384726"/></Shared.Field>
          <Shared.Field label="E&O carrier"><input className="text-input" value={form.eando_carrier} onChange={(e) => update("eando_carrier", e.target.value)} placeholder="NAPA / E&amp;O Pro / Hiscox"/></Shared.Field>
          <Shared.Field label="E&O expiration"><input className="text-input" type="date" value={form.eando_expires_at || ""} onChange={(e) => update("eando_expires_at", e.target.value || null)}/></Shared.Field>
          <Shared.Field label="Background check" hint="Status from your IMO / E&O carrier">
            <Shared.Select value={form.background_check_status} onChange={(v) => update("background_check_status", v)} options={[
              { v: "",          l: "—" },
              { v: "pending",   l: "Pending" },
              { v: "submitted", l: "Submitted" },
              { v: "in_review", l: "In review" },
              { v: "cleared",   l: "Cleared" },
              { v: "flagged",   l: "Flagged" },
              { v: "expired",   l: "Expired" },
            ]}/>
          </Shared.Field>
        </div>
        <Shared.Field label={`Licensed states (${(form.licensed_states || []).length})`} hint="Click a state to toggle. Set its expiration on the right when active.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "var(--bg-raised)", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
            {PROFILE_ALL_STATES.map(s => {
              const on = (form.licensed_states || []).includes(s);
              return (
                <button key={s} onClick={() => toggleState(s)} className={`chip ${on ? "chip-money" : ""}`} style={{ cursor: "pointer", border: 0, fontWeight: 500 }}>
                  {s}
                </button>
              );
            })}
          </div>
        </Shared.Field>
        {(form.licensed_states || []).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {(form.licensed_states || []).map(s => (
              <div key={s} style={{ padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="chip chip-money" style={{ fontSize: 10.5 }}>{s}</span>
                <input className="text-input" type="date" style={{ flex: 1, fontSize: 11.5, padding: "4px 6px" }} value={(form.license_expirations || {})[s] || ""} onChange={(e) => setStateExpiry(s, e.target.value || null)}/>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>Notification preferences</h4>
        <div className="profile-grid-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            ["email",    "Email"],
            ["sms",      "SMS"],
            ["telegram", "Telegram"],
            ["in_app",   "In-app"],
          ].map(([k, l]) => {
            const on = !!np[k];
            return (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, background: on ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: on ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)" }}>
                <input type="checkbox" checked={on} onChange={() => updateNotif(k, !on)}/>
                <span>{l}</span>
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 10 }}>
          <Shared.Field label="Digest frequency"><Shared.Select value={np.digest_frequency || "daily"} onChange={(v) => updateNotif("digest_frequency", v)} options={DIGEST_FREQ}/></Shared.Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>App preferences</h4>
        <div className="profile-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Shared.Field label="Theme"><Shared.Select value={form.theme} onChange={(v) => update("theme", v)} options={[
            { v: "system", l: "Match system" }, { v: "light",  l: "Light" }, { v: "dark",   l: "Dark" },
          ]}/></Shared.Field>
          <Shared.Field label="Density"><Shared.Select value={form.density} onChange={(v) => update("density", v)} options={[
            { v: "comfortable", l: "Comfortable" }, { v: "compact",     l: "Compact" },
          ]}/></Shared.Field>
          <Shared.Field label="Default landing page"><input className="text-input" value={form.default_landing} onChange={(e) => update("default_landing", e.target.value)} placeholder="today / floor / pipeline …"/></Shared.Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(dirty).length === 0}>
          <Icons.Check size={12}/> {saving ? "Saving…" : "Save profile"}
        </button>
        {saveMsg && <span style={{ color: "var(--accent-money)", fontSize: 12 }}>{saveMsg}</span>}
        {Object.keys(dirty).length > 0 && !saving && <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length === 1 ? "" : "s"}</span>}
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Session</h3>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={() => window.signOut && window.signOut()}><Icons.X size={12}/> Sign out</button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>Ends your Supabase session and clears local state.</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   9. Notifications panel (slide-out from Bell icon)
   ───────────────────────────────────────────────────────────────────────── */
function NotificationsPanel({ open, onClose, goto }) {
  if (!open) return null;
  // Demo-only illustrative notifications. Real tenants get an empty state
  // ("no notifications yet") instead of seeing Cheryl Hampton / Robert Mendez.
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const FALLBACK = isDemo ? [
    { kind: "lead",     t: "Hot inbound · Cheryl Hampton",    d: "14s",       sub: "FB T65 · score 92 · TX",                page: "queue" },
    { kind: "issued",   t: "Deal issued · Naomi Reese",        d: "8m",        sub: "Aetna SRC Plan G · $1,780 AP",          page: "commissions" },
    { kind: "nigo",     t: "NIGO returned · Linda Cho",         d: "1h",        sub: "Sigs missing · Plan N",                  page: "calls" },
    { kind: "coaching", t: "New coaching card",                  d: "2h",        sub: "Open-ended Q drill assigned",            page: "coaching" },
    { kind: "anomaly",  t: "Persistency drift · Tampa",          d: "3h",        sub: "FE 13-mo cohort -3.2pts WoW",           page: "book" },
    { kind: "recruit",  t: "New applicant · Stacy V",            d: "yesterday", sub: "Already licensed in TX",                  page: "recruiting" },
  ] : [];
  // Live notifications: AppData.NOTIFICATIONS, mapped onto the panel shape.
  // Sort unread first, then most recent. Fallback to FALLBACK if empty.
  const fmtDelta = (iso) => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const linkToPage = (link) => {
    if (!link) return null;
    const m = String(link).match(/page=([a-z-]+)/);
    return m ? m[1] : null;
  };
  const live = (AppData.NOTIFICATIONS || []).map(n => ({
    kind: n.kind,
    t: n.title,
    d: fmtDelta(n.createdAt),
    sub: n.body || "",
    page: linkToPage(n.link),
    unread: !n.readAt,
    id: n.id,
  })).sort((a, b) => (a.unread === b.unread) ? 0 : (a.unread ? -1 : 1));
  const items = live.length > 0 ? live : FALLBACK;
  const unreadCount = live.length > 0 ? live.filter(i => i.unread).length : items.length;
  const colorOf = (k) => k === "lead_assigned" || k === "lead" ? "var(--accent-money)" :
                       k === "commission_paid" || k === "issued" ? "var(--accent-money)" :
                       k === "nigo" ? "var(--state-danger)" :
                       k === "tier_promo" ? "var(--accent-money)" :
                       k === "anomaly" ? "var(--state-warning)" :
                       "var(--accent-status)";
  const markAllRead = async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || live.length === 0) { onClose(); return; }
    const ids = live.filter(i => i.unread).map(i => i.id);
    if (ids.length === 0) { onClose(); return; }
    await sb.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    window.hydrateFromSupabase && window.hydrateFromSupabase();
    onClose();
  };
  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Bell size={14}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Notifications</div>
            <span className="chip chip-money">{unreadCount}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-ghost" onClick={markAllRead}>Mark read</button>
            <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
          </div>
        </div>
        <div className="slideout-body" style={{ padding: 0 }}>
          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
              <Icons.Bell size={20} style={{ color: "var(--text-quaternary)" }}/>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No notifications yet</div>
              <div style={{ fontSize: 11.5, marginTop: 4 }}>Lead assignments, NIGO returns, and team activity will land here.</div>
            </div>
          ) : items.map((n, i) => (
            <div key={i} onClick={() => { goto && goto(n.page); onClose(); }} style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
              <span className="dot" style={{ background: colorOf(n.kind), marginTop: 6 }}></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.t}</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>{n.sub}</div>
              </div>
              <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>{n.d}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   10. Keyboard shortcuts help (?)
   ───────────────────────────────────────────────────────────────────────── */
function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  const groups = [
    { title: "Global", items: [
      ["⌘K / Ctrl+K", "Command palette"],
      ["?",            "Shortcut help"],
      ["Esc",           "Close any overlay"],
    ]},
    { title: "Navigation (in palette)", items: [
      ["↑ ↓",  "Move selection"],
      ["Enter", "Open page or run action"],
    ]},
    { title: "On a call", items: [
      ["M",     "Mute / unmute"],
      ["S",     "Send SOA"],
      ["Space", "Pause transcript"],
    ]},
    { title: "Pipeline", items: [
      ["F",   "Filter"],
      ["N",   "New lead"],
      ["1-5", "Move selected lead to stage"],
    ]},
  ];
  return (
    <Shared.Modal title="Keyboard shortcuts" width={520} onClose={onClose} actions={
      <button className="btn btn-primary" onClick={onClose}>Got it</button>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {groups.map(g => (
          <div key={g.title}>
            <div className="field-l" style={{ marginBottom: 6 }}>{g.title}</div>
            {g.items.map(([k, l]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
                <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                <span className="kbd mono">{k}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}

/* Stub fallback retained for unknown page IDs */
function PageStub({ title, sub }) {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{sub}</div>
        </div>
      </div>
      <div className="panel" style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)" }}>
        <Icons.Sparkles size={20} style={{ color: "var(--accent-money)" }}/>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>Page coming online</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>This view is wired in the data layer; UI ships in the next build.</div>
      </div>
    </div>
  );
}

window.PageVault          = PageVault;
window.PageTiering        = PageTiering;
window.PageCommissions    = PageCommissions;
window.PageTraining       = PageTraining;
/* PageRecruiting moved to page-recruiting.jsx */
window.PageCalls          = PageCalls;
window.PageBook           = PageBook;
window.PageSettings       = PageSettings;
window.PageStub           = PageStub;
window.NotificationsPanel = NotificationsPanel;
window.ShortcutsHelp      = ShortcutsHelp;
