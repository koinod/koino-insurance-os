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

  // Synthesized SOAs + consent receipts to back the page
  const ARTIFACTS = [
    { id: "soa-1", kind: "SOA",        lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "scheduled" },
    { id: "soa-2", kind: "SOA",        lead: "Robert Mendez",  repId: "dani", date: "Today, 9:02a",  retention: "10y",  status: "captured"  },
    { id: "lid-1", kind: "LeadiD",     lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:01a", retention: "13mo", status: "captured"  },
    { id: "tf-1",  kind: "TrustedForm",lead: "Robert Mendez",  repId: "dani", date: "Today, 8:48a",  retention: "13mo", status: "captured"  },
    { id: "rec-1", kind: "Recording",  lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "complete"  },
    { id: "rec-2", kind: "Recording",  lead: "Robert Mendez",  repId: "dani", date: "Today, 9:02a",  retention: "10y",  status: "complete"  },
    { id: "con-1", kind: "Consent",    lead: "Linda Cho",      repId: "marc", date: "Yesterday",     retention: "13mo", status: "captured"  },
    { id: "tpmo-1",kind: "TPMO disc.", lead: "Cheryl Hampton", repId: "marc", date: "Today, 11:14a", retention: "10y",  status: "captured"  },
  ];

  const filtered = ARTIFACTS.filter(a => !q || (a.lead + " " + a.kind).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Compliance Vault</div>
          <div className="page-sub">Auditor-ready · recordings, SOAs, consent · retention timer per artifact</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input className="text-input" style={{ width: 220 }} placeholder="Search lead or kind..." value={q} onChange={(e) => setQ(e.target.value)}/>
          <button className="btn"><Icons.ArrowUpRight size={13}/> Export audit pack</button>
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
            {["artifacts", "policies"].map(t => (
              <button key={t} onClick={() => setTab(t)} className="btn btn-ghost" style={{ padding: "3px 10px", background: tab === t ? "var(--bg-raised)" : "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}>{t === "artifacts" ? "Artifacts" : "Retention policy"}</button>
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
                <div className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.retention}</div>
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
      </div>
    </div>
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

  const setOverride = (id, t) => {
    const rep = REPS.find(r => r.id === id);
    const auto = calcTier(rep);
    if (t === auto) {
      const n = { ...overrides }; delete n[id]; setOverrides(n);
    } else {
      setOverrides({ ...overrides, [id]: t });
      setHistory([{ who: rep.name, from: rep.tier, to: t, reason: "Manual override", when: "now" }, ...history]);
    }
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

function CommissionsRep() {
  const total = STATEMENT.reduce((a, r) => a + r.expected, 0);
  const paid  = STATEMENT.reduce((a, r) => a + r.paid, 0);
  const inClearing = total - Math.max(0, paid);
  const charge = STATEMENT.filter(r => r.paid < 0).reduce((a, r) => a + r.paid, 0);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Me</div>
          <div className="page-sub">Statement · advances vs as-earned · NIGO and chargeback alerts</div>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }}><Icons.ArrowUpRight size={13}/> Statement PDF</button>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Expected MTD" prefix="$" value={total.toLocaleString()} sub="across 7 issues" trend="up"/>
        <Shared.KpiCard label="Paid MTD" prefix="$" value={Math.max(0, paid).toLocaleString()} sub="advances + as-earned"/>
        <Shared.KpiCard label="In clearing" prefix="$" value={inClearing.toLocaleString()} sub="2 NIGO"/>
        <Shared.KpiCard label="Chargebacks" prefix="$" value={Math.abs(charge).toLocaleString()} sub="last 30d" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Statement</h3><span className="meta">{STATEMENT.length} rows · this month</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "100px 1.4fr 1fr 1fr 80px 60px 90px 90px 1fr" }}>
            <div>Date</div><div>Lead</div><div>Carrier</div><div>Product</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>%</div>
            <div className="tabular" style={{ textAlign: "right" }}>Expected</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div>Status</div>
          </div>
          {STATEMENT.map((r, i) => (
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
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Team rollup</div>
          <div className="page-sub">Per-producer ledger · variance flags vs carrier files</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Team paid MTD" prefix="$" value="184,260" sub="+12% vs last" trend="up"/>
        <Shared.KpiCard label="In clearing" prefix="$" value="42,180" sub="14 apps"/>
        <Shared.KpiCard label="NIGO drag" prefix="$" value="11,420" sub="-$2.1k WoW" neg/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Producers · this month</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 100px 100px 100px 100px" }}>
            <div>Producer</div>
            <div className="tabular" style={{ textAlign: "right" }}>Issued</div>
            <div className="tabular" style={{ textAlign: "right" }}>AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Paid</div>
            <div className="tabular" style={{ textAlign: "right" }}>In-clearing</div>
            <div className="tabular" style={{ textAlign: "right" }}>Variance</div>
          </div>
          {REPS.map(r => {
            const issued = Math.round(r.mtd / 1800);
            const ap = r.mtd;
            const paid = Math.round(r.mtd * 0.62);
            const ic = ap - paid;
            const variance = (r.id === "luis" || r.id === "remy") ? -180 : 0;
            return (
              <div key={r.id} className="row" style={{ gridTemplateColumns: "1.6fr 90px 100px 100px 100px 100px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shared.Avatar rep={r} size={20}/>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <Shared.TierChip tier={r.tier} compact/>
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>{issued}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${ap.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${paid.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>${ic.toLocaleString()}</div>
                <div className="tabular" style={{ textAlign: "right", color: variance ? "var(--state-danger)" : "var(--text-quaternary)" }}>{variance ? `-$${Math.abs(variance)}` : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommissionsOwner() {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Commissions · Override pool</div>
          <div className="page-sub">Owner override slice · regional waterfall · monthly payout</div>
        </div>
      </div>
      <div className="kpi-row">
        <Shared.KpiCard hero label="Override pool · MTD" prefix="$" value="258,420" sub="+18.2% vs last" trend="up"/>
        <Shared.KpiCard label="Net to owner" prefix="$" value="104,700" sub="after lead spend / NIGO" trend="up"/>
        <Shared.KpiCard label="Paid out to producers" prefix="$" value="412,300" sub="across 9 producers"/>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>By region · April</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
            <div>Region</div>
            <div className="tabular" style={{ textAlign: "right" }}>Producers</div>
            <div className="tabular" style={{ textAlign: "right" }}>Total AP</div>
            <div className="tabular" style={{ textAlign: "right" }}>Override</div>
            <div></div>
          </div>
          {[
            { name: "Atlanta region", reps: 5, ap: 412800, ovr: 92420 },
            { name: "Tampa region",   reps: 4, ap: 318200, ovr: 71390 },
          ].map((r, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 100px 110px 110px 1fr" }}>
              <div style={{ fontWeight: 500 }}>{r.name}</div>
              <div className="tabular" style={{ textAlign: "right" }}>{r.reps}</div>
              <div className="tabular" style={{ textAlign: "right" }}>${r.ap.toLocaleString()}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>${r.ovr.toLocaleString()}</div>
              <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 12, overflow: "hidden" }}>
                <div style={{ width: `${(r.ovr / 100000) * 100}%`, height: "100%", background: "var(--accent-money)" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   4. Training — rep / mgr / owner
   ───────────────────────────────────────────────────────────────────────── */
function PageTraining({ role = "rep" }) {
  if (role === "manager") return <TrainingManager/>;
  if (role === "owner")   return <TrainingOwner/>;
  return <TrainingRep/>;
}

function TrainingRep() {
  const { COURSES } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Training · Me</div>
          <div className="page-sub">Notion-simple courses, scripts, certifications · AEP cert progress</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Active courses" value={COURSES.filter(c => c.status !== "complete").length}/>
        <Shared.KpiCard label="Cert progress" value="62%" sub="AEP 2026 cert" trend="up"/>
        <Shared.KpiCard label="CE hours · YTD" value="14.5"/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Book size={13}/><h3>My courses</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 90px 100px 100px" }}>
            <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div>Status</div><div></div>
          </div>
          {COURSES.map(c => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 90px 100px 100px" }}>
              <div style={{ fontWeight: 500 }}>{c.title}</div>
              <div><span className="chip">{c.track}</span></div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
              <div><span className={`chip ${
                c.status === "complete" ? "chip-money" :
                c.status === "in-progress" ? "chip-info" :
                c.status === "due" ? "chip-status" : ""
              }`}>{c.status}</span></div>
              <div><button className="btn btn-ghost"><Icons.Play size={11}/> {c.status === "complete" ? "Review" : "Start"}</button></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h3>Scripts library</h3><span className="meta">always-current</span></div>
        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            "Med Supp — Plan G open",
            "Final Expense — empathy",
            "TPMO disclosure (verbatim)",
            "Annuity — fact-find",
            "Cross-sell — FE → Med Supp",
            "AEP — switch reasons",
          ].map((t, i) => (
            <div key={i} className="panel" style={{ padding: 10 }}>
              <div style={{ fontWeight: 500 }}>{t}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 4 }}>Updated 2d ago · v3.1</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn btn-ghost"><Icons.Play size={11}/> Open</button>
                <button className="btn btn-ghost">Practice</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrainingManager() {
  const { REPS, COURSES } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Training · Team</div>
          <div className="page-sub">Enrollment matrix · completion rates · due-date alerts</div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }}><Icons.Plus size={13}/> Assign course</button>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Enrollment matrix</h3><span className="meta">{REPS.length} producers × {COURSES.length} courses</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: `1.4fr repeat(${COURSES.length}, 1fr)` }}>
            <div>Producer</div>
            {COURSES.map(c => <div key={c.id} className="cell-truncate" style={{ fontSize: 11 }}>{c.title}</div>)}
          </div>
          {REPS.map(r => (
            <div key={r.id} className="row" style={{ gridTemplateColumns: `1.4fr repeat(${COURSES.length}, 1fr)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={r} size={20}/>
                <span style={{ fontWeight: 500 }}>{r.name}</span>
              </div>
              {COURSES.map((c, i) => {
                // synthesized status per (rep, course) — deterministic
                const hash = (r.id.charCodeAt(0) + i * 17) % 4;
                const status = ["complete","in-progress","due","assigned"][hash];
                return (
                  <div key={c.id}><span className={`chip ${
                    status === "complete" ? "chip-money" :
                    status === "in-progress" ? "chip-info" :
                    status === "due" ? "chip-status" : ""
                  }`}>{status}</span></div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrainingOwner() {
  const { COURSES } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Training · Authoring</div>
          <div className="page-sub">Library · version history · compliance-cert audit trail</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.ArrowUpRight size={13}/> Audit trail</button>
          <button className="btn btn-primary"><Icons.Plus size={13}/> New course</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Library</h3><span className="meta">{COURSES.length}</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 100px 90px 90px 90px 100px" }}>
            <div>Course</div><div>Track</div><div className="tabular" style={{ textAlign: "right" }}>Min</div><div className="tabular" style={{ textAlign: "right" }}>Versions</div><div className="tabular" style={{ textAlign: "right" }}>Enrolled</div><div></div>
          </div>
          {COURSES.map((c, i) => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 100px 90px 90px 90px 100px" }}>
              <div style={{ fontWeight: 500 }}>{c.title}</div>
              <div><span className="chip">{c.track}</span></div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.durMin}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{3 + (i % 4)}</div>
              <div className="tabular" style={{ textAlign: "right" }}>{4 + i}</div>
              <div><button className="btn btn-ghost">Edit</button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────────────────
   6. Calls — Gong-style cards with waveform, transcript, AI score
   ───────────────────────────────────────────────────────────────────────── */
function PageCalls({ role = "rep" }) {
  const { RECORDINGS, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  // Show all recordings; Rep view filters to their own (first rep is the user)
  const meId = REPS[0].id;
  const visible = role === "rep" ? RECORDINGS.filter(r => !r.repId || r.repId === meId) : RECORDINGS;

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
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Headset size={13}/>
            <h3>{sel?.lead} · score {sel?.score}</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost"><Icons.Play size={11}/> Play</button>
              <button className="btn btn-ghost"><Icons.ArrowUpRight size={11}/> Vault</button>
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
              <strong style={{ color: "var(--text-primary)" }}>AI summary —</strong> {sel?.ai}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   7. Book Analytics — owner
   ───────────────────────────────────────────────────────────────────────── */
function PageBook() {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Book Analytics</div>
          <div className="page-sub">Persistency · lapse · cross-sell pathway · carrier mix</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="In-force AP" prefix="$" value="6.84M" sub="+9.4% YoY" trend="up"/>
        <Shared.KpiCard label="Persistency · 13mo" value="91.4%" sub="goal 90%" trend="up"/>
        <Shared.KpiCard label="Lapse rate" value="4.2%" sub="-0.6 WoW" neg trend="up"/>
        <Shared.KpiCard label="Cross-sell rate" value="22%" sub="FE → Med Supp"/>
      </div>

      <div className="book-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Carrier mix · in-force</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 100px 1fr" }}>
              <div>Carrier</div>
              <div className="tabular" style={{ textAlign: "right" }}>Apps</div>
              <div className="tabular" style={{ textAlign: "right" }}>AP</div>
              <div></div>
            </div>
            {[
              { n: "UHC",            a: 184, p: 1842000, w: 100 },
              { n: "Humana Vantage", a: 132, p: 1320000, w: 72  },
              { n: "Aetna SRC",      a: 124, p: 1108000, w: 60  },
              { n: "F&G Annuities",  a:  42,  p: 1860000, w: 100 },
              { n: "Mutual of Omaha",a:  88,  p:  708000, w: 38  },
            ].map((r, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 100px 100px 1fr" }}>
                <div style={{ fontWeight: 500 }}>{r.n}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.a}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${r.p.toLocaleString()}</div>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                  <div style={{ width: `${r.w}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>13-mo persistency · cohorts</h3></div>
          <div style={{ padding: 14 }}>
            {[
              { l: "Med Supp · UHC",      v: 94 },
              { l: "Med Supp · Humana",   v: 92 },
              { l: "FE · UHC",            v: 88 },
              { l: "FE · Mutual of Omaha",v: 78 },
              { l: "Annuity · F&G",       v: 96 },
            ].map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 60px 1fr", padding: "5px 0", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}%</span>
                <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                  <div style={{ width: `${r.v}%`, height: "100%", background: r.v >= 90 ? "var(--accent-money)" : r.v >= 80 ? "var(--state-warning)" : "var(--state-danger)" }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   8. Settings — role-aware (org / billing / integrations / API / routing /
      notifications). Owner sees everything, mgr sees team-relevant
      sections, rep sees only their profile.
   ───────────────────────────────────────────────────────────────────────── */
function PageSettings({ role = "owner" }) {
  const TABS = role === "owner"
    ? [["org","Organization"],["billing","Billing"],["integrations","Integrations"],["api","API keys"],["routing","Routing rules"],["notifications","Notifications"],["profile","Profile"]]
    : role === "manager"
      ? [["routing","Routing rules"],["notifications","Notifications"],["profile","Profile"]]
      : [["profile","Profile"],["notifications","Notifications"]];
  const [tab, setTab] = React.useState(TABS[0][0]);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">{role === "owner" ? "Organization, billing, integrations, API, routing" : role === "manager" ? "Routing rules and team notifications" : "Your profile and notifications"}</div>
        </div>
      </div>

      <div className="settings-grid" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14 }}>
        <div className="panel" style={{ padding: 6 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", background: tab === k ? "var(--bg-raised)" : "transparent", color: tab === k ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: tab === k ? 500 : 400 }}>{l}</button>
          ))}
        </div>

        <div>
          {tab === "org"          && <SettingsOrg/>}
          {tab === "billing"      && <SettingsBilling/>}
          {tab === "integrations" && <SettingsIntegrations/>}
          {tab === "api"          && <SettingsApi/>}
          {tab === "routing"      && <SettingsRouting/>}
          {tab === "notifications"&& <SettingsNotifications/>}
          {tab === "profile"      && <SettingsProfile role={role}/>}
        </div>
      </div>
    </div>
  );
}

function SettingsOrg() {
  const [name, setName]     = React.useState("Atlas Insurance Group");
  const [legal, setLegal]   = React.useState("Atlas IMO LLC");
  const [domain, setDomain] = React.useState("atlasimo.com");
  const [npn, setNpn]       = React.useState("19384726");
  return (
    <div className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: 0, marginBottom: 12 }}>Organization</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Shared.Field label="Display name"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)}/></Shared.Field>
        <Shared.Field label="Legal entity"><input className="text-input" value={legal} onChange={(e) => setLegal(e.target.value)}/></Shared.Field>
        <Shared.Field label="Domain"><input className="text-input" value={domain} onChange={(e) => setDomain(e.target.value)}/></Shared.Field>
        <Shared.Field label="NPN"><input className="text-input" value={npn} onChange={(e) => setNpn(e.target.value)}/></Shared.Field>
      </div>
      <div className="divider"></div>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Operating states</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"].map(s => (
          <span key={s} className="chip chip-money">{s}</span>
        ))}
        <button className="btn btn-ghost" style={{ padding: "3px 10px" }}><Icons.Plus size={11}/> Add</button>
      </div>
      <div className="divider"></div>
      <button className="btn btn-primary"><Icons.Check size={12}/> Save organization</button>
    </div>
  );
}

function SettingsBilling() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Plan</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Network · Annual</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 2 }}>Up to 25 producers · all integrations · 24h support</div>
          </div>
          <button className="btn btn-ghost">Manage plan</button>
        </div>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Usage this month</h3>
        {[
          { l: "Active producers", v: "9 / 25",  w: 36 },
          { l: "Voice AI minutes", v: "12,480 / 50,000", w: 25 },
          { l: "Lead enrichment",  v: "1,840 / 5,000",   w: 37 },
          { l: "Storage",           v: "412 GB / 1 TB",   w: 41 },
        ].map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 200px", padding: "8px 0", alignItems: "center", borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0, fontSize: 12.5 }}>
            <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
            <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
            <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
              <div style={{ width: `${r.w}%`, height: "100%", background: "var(--accent-money)" }}></div>
            </div>
          </div>
        ))}
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Payment method</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)" }}>
          <span className="chip">VISA</span><span className="mono" style={{ fontSize: 12.5 }}>**** 4419</span><span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>· expires 09/27</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }}>Update</button>
        </div>
      </div>
    </div>
  );
}

function SettingsIntegrations() {
  const { CONNECTIONS } = AppData;
  return (
    <div className="panel">
      <div className="panel-h"><h3>Connected services</h3><span className="meta">{CONNECTIONS.length} configured</span></div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 100px" }}>
          <div>Service</div><div>Category</div><div>Status</div><div>Detail</div><div></div>
        </div>
        {CONNECTIONS.map(c => (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 1.6fr 100px" }}>
            <div style={{ fontWeight: 500 }}>{c.name}</div>
            <div style={{ color: "var(--text-tertiary)" }}>{c.category}</div>
            <div><span className={`chip ${c.status === "ok" ? "chip-money" : c.status === "warn" ? "chip-status" : "chip-danger"}`}>{c.status === "ok" ? "Connected" : c.status === "warn" ? "Action needed" : "Down"}</span></div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{c.meta}</div>
            <button className="btn btn-ghost">{c.status === "ok" ? "Configure" : "Reconnect"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsApi() {
  const [revealed, setRevealed] = React.useState(false);
  const KEY = "rfk_live_eyJhbGciOiJIUzI1NiJ9...QzfBn4xT2";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>API keys</h3>
        <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginBottom: 12 }}>Use this key to push leads or pull pipeline state via REST. Never commit keys to source control.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5 }}>
          <span className="mono" style={{ flex: 1, color: "var(--text-secondary)" }}>{revealed ? KEY : KEY.slice(0, 12) + "•••••••••••••••••••"}</span>
          <button className="btn btn-ghost" onClick={() => setRevealed(r => !r)}>{revealed ? "Hide" : "Reveal"}</button>
          <button className="btn btn-ghost"><Icons.Copy size={12}/> Copy</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary"><Icons.Plus size={12}/> Create new key</button>
          <button className="btn">Rotate</button>
        </div>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Webhooks</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {[
            { url: "https://atlas.zapier.com/leads",      events: "lead.new · lead.assigned",        last: "2m ago" },
            { url: "https://atlas.n8n.io/issued",         events: "deal.issued",                       last: "14m ago" },
            { url: "https://atlas.app.n8n.cloud/nigo",    events: "deal.nigo",                          last: "yesterday" },
          ].map((w, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 100px 100px" }}>
              <div className="cell-truncate mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{w.url}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{w.events}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{w.last}</div>
              <button className="btn btn-ghost">Edit</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsRouting() {
  const [rules, setRules] = React.useState([
    { id: 1, src: "FB Lead Form · T65", route: "Med Supp specialists", weight: 60 },
    { id: 2, src: "Inbound < 30s",      route: "Tier ≥ Gold",          weight: 90 },
    { id: 3, src: "Annuity",             route: "Certified producer",    weight: 100 },
    { id: 4, src: "Spanish",             route: "Bilingual round-robin", weight: 50 },
  ]);
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Routing rules</h3>
        <button className="btn btn-primary"><Icons.Plus size={12}/> New rule</button>
      </div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 60px" }}>
          <div>Source / trigger</div><div>Route to</div><div>Priority</div><div></div>
        </div>
        {rules.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr 60px" }}>
            <div style={{ fontWeight: 500 }}>{r.src}</div>
            <div style={{ color: "var(--text-secondary)" }}>{r.route}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="range" min={0} max={100} value={r.weight} onChange={(e) => setRules(rs => rs.map(x => x.id === r.id ? { ...x, weight: +e.target.value } : x))} style={{ flex: 1 }}/>
              <span className="tabular" style={{ width: 30, fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.weight}</span>
            </div>
            <button className="btn btn-ghost"><Icons.X size={11}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsNotifications() {
  const [prefs, setPrefs] = React.useState({
    leadNew: true, leadStuck: true, dealIssued: true, nigo: true, coachingNew: false, recruitingNew: true, dailyDigest: true,
  });
  const t = (k, l, sub) => (
    <label style={{ display: "grid", gridTemplateColumns: "auto 1fr 80px", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)", alignItems: "center" }}>
      <span style={{ display: "inline-block", width: 32 }}>
        <input type="checkbox" checked={prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })}/>
      </span>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{l}</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 1 }}>{sub}</div>
      </div>
      <span style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 11.5 }}>{prefs[k] ? "Email + push" : "off"}</span>
    </label>
  );
  return (
    <div className="panel" style={{ padding: 16 }}>
      <h3 style={{ margin: 0 }}>Notifications</h3>
      <div style={{ marginTop: 8 }}>
        {t("leadNew",       "New lead in my queue",         "Push within 30s of routing")}
        {t("leadStuck",     "Lead stuck > 3 days in stage", "Daily")}
        {t("dealIssued",    "Deal issued",                   "Push immediately")}
        {t("nigo",          "NIGO returned",                  "Push + email + escalate to mgr")}
        {t("coachingNew",   "New coaching card for me",      "Daily digest")}
        {t("recruitingNew", "New applicant in funnel",        "Daily")}
        {t("dailyDigest",   "Daily digest",                    "8am · weekdays")}
      </div>
    </div>
  );
}

function SettingsProfile({ role }) {
  const me = AppData.REPS[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Profile</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
          <Shared.Avatar rep={me} size={48}/>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{me.name}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{me.handle} · Atlanta · {role}</div>
          </div>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }}>Change avatar</button>
        </div>
        <div className="divider"></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Shared.Field label="Display name"><input className="text-input" defaultValue={me.name}/></Shared.Field>
          <Shared.Field label="Email"><input className="text-input" defaultValue="marcus@atlasimo.com"/></Shared.Field>
          <Shared.Field label="Phone"><input className="text-input" defaultValue="+1 (404) 555-0142"/></Shared.Field>
          <Shared.Field label="Time zone"><Shared.Select value="ET" onChange={() => {}} options={[{ v: "ET", l: "Eastern" }, { v: "CT", l: "Central" }, { v: "MT", l: "Mountain" }, { v: "PT", l: "Pacific" }]}/></Shared.Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Licenses + appointments</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {["TX","FL","GA","NV","AZ"].map(s => <span key={s} className="chip chip-money">{s} · active</span>)}
          {["NY"].map(s => <span key={s} className="chip chip-status">{s} · pending</span>)}
        </div>
        <div className="divider"></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {["UHC","Humana","Aetna SRC","Mutual of Omaha","F&G Annuities"].map(c => (
            <div key={c} className="chip">{c}</div>
          ))}
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
  const items = [
    { kind: "lead",     t: "Hot inbound · Cheryl Hampton",    d: "14s",       sub: "FB T65 · score 92 · TX",                page: "queue" },
    { kind: "issued",   t: "Deal issued · Naomi Reese",        d: "8m",        sub: "Aetna SRC Plan G · $1,780 AP",          page: "commissions" },
    { kind: "nigo",     t: "NIGO returned · Linda Cho",         d: "1h",        sub: "Sigs missing · Plan N",                  page: "calls" },
    { kind: "coaching", t: "New coaching card",                  d: "2h",        sub: "Open-ended Q drill assigned",            page: "coaching" },
    { kind: "anomaly",  t: "Persistency drift · Tampa",          d: "3h",        sub: "FE 13-mo cohort -3.2pts WoW",           page: "book" },
    { kind: "recruit",  t: "New applicant · Stacy V",            d: "yesterday", sub: "Already licensed in TX",                  page: "recruiting" },
  ];
  const colorOf = (k) => k === "lead" ? "var(--accent-money)" : k === "issued" ? "var(--accent-money)" : k === "nigo" ? "var(--state-danger)" : k === "anomaly" ? "var(--state-warning)" : "var(--accent-status)";
  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Bell size={14}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Notifications</div>
            <span className="chip chip-money">{items.length}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-ghost">Mark read</button>
            <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
          </div>
        </div>
        <div className="slideout-body" style={{ padding: 0 }}>
          {items.map((n, i) => (
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
