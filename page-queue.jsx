/* Page: Dial Queue (rep) / Dispatch (mgr) — role-aware
   Rep view: their dial queue with TPMO + queue-health + compliance side panels.
   Manager (Dispatch) view: routing-style queue with team capacity + spend strip. */
function PageQueue({ onCall, role = "rep" }) {
  if (role === "manager") return <DispatchView onCall={onCall}/>;
  return <DialQueueView onCall={onCall}/>;
}

function DialQueueView({ onCall }) {
  const { QUEUE } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Dial Queue</div>
          <div className="page-sub">{QUEUE.length} lead{QUEUE.length === 1 ? "" : "s"} · scored & sequenced · TPMO disclaimer auto-fires on connect</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Filter size={13}/> Filters</button>
          <button className="btn btn-primary" onClick={onCall}><Icons.Phone size={13}/> Start dialing</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Cost / dial",     v: "$2.40" },
        { l: "Comp / dial",      v: "$32.6", tone: "money" },
        { l: "Connect rate",     v: "38%",   tone: "money" },
        { l: "Quote rate",       v: "11%" },
      ]}/>

      <div className="queue-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <h3>Queue · Med Supp + FE</h3>
            <span className="meta">sort: speed-to-lead</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 64px 72px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{textAlign:"right"}}>Score</div><div style={{textAlign:"right"}}>SLA</div><div></div>
            </div>
            {QUEUE.map((l, i) => {
              const c = l.elapsed < 30 ? "var(--accent-money)" : l.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 64px 72px" }}>
                  <span className="dot" style={{ background: c }}></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <strong style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.lead}</strong>
                    <span title="LeadiD verified" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 999, background: "color-mix(in oklch, var(--accent-money) 18%, transparent)", color: "var(--accent-money)", fontSize: 9, fontWeight: 700, flex: "0 0 auto" }}>✓</span>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{l.age} · {l.state}</div>
                  <div style={{ color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.source}</div>
                  <div style={{ minWidth: 0 }}><span className="chip" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{l.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: l.score >= 90 ? "var(--accent-money)" : l.score >= 80 ? "var(--accent-status)" : "var(--text-secondary)" }}>{l.score}</div>
                  <div className="tabular" style={{ textAlign: "right", color: c, fontWeight: 500 }}>{l.elapsed}s</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} title="Dial"
                      onClick={() => i === 0
                        ? (onCall && onCall())
                        : window.repflowCall && window.repflowCall(l.phone || "+15125550" + l.id.replace(/\D/g, "").slice(0, 3), l.lead)}>
                      <Icons.Phone size={12}/>
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} title="Send SMS"
                      onClick={() => window.smsCompose && window.smsCompose(l, l.phone)}>
                      <Icons.MessageSquare size={12}/>
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }} title="Schedule SOA"
                      onClick={() => window.scheduleSOA && window.scheduleSOA(l)}>
                      <Icons.Calendar size={12}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><h3>Queue health</h3></div>
            <div style={{ padding: "12px 14px" }}>
              {[
                { l: "< 30s SLA",       v: "23", c: "var(--accent-money)" },
                { l: "30 – 60s",         v: "12", c: "var(--accent-status)" },
                { l: "60 – 120s",        v:  "8", c: "var(--state-warning)" },
                { l: "> 120s breach",   v:  "4", c: "var(--state-danger)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 3 ? "1px solid var(--border-subtle)" : 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}><span className="dot" style={{ background: r.c, marginRight: 8 }}></span>{r.l}</span>
                  <span className="tabular" style={{ fontWeight: 500 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><Icons.Shield size={13}/><h3>Compliance</h3></div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>TPMO disclaimer</span><span className="chip chip-money">Auto · 60s</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>SOA on Med Supp</span><span className="chip chip-status">Pre-call gate</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Recording</span><span className="chip chip-money">All calls · 10y</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>State licenses</span><span className="chip">12 active</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DispatchView({ onCall }) {
  const { QUEUE, REPS } = AppData;
  const [picks, setPicks] = React.useState({});  // queueId -> repId
  const [filter, setFilter] = React.useState({ heat: "all", product: "all" });

  const setPick = (qid, rid) => setPicks({ ...picks, [qid]: rid });
  const filtered = QUEUE.filter(q =>
    (filter.heat === "all" || (filter.heat === "hot" ? q.elapsed < 30 : q.elapsed >= 30)) &&
    (filter.product === "all" || q.product === filter.product)
  );

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Dispatch</div>
          <div className="page-sub">Route inbound queue across {REPS.filter(r => r.presence === "live").length} live producers · auto-suggested by capacity</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Settings size={13}/> Routing rules</button>
          <button className="btn btn-primary" onClick={onCall}><Icons.Phone size={13}/> Open in-call</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Team CPA today", v: "$87",   tone: "money" },
        { l: "Lead spend today", v: "$1,240" },
        { l: "Avg dispatch SLA", v: "21s",  tone: "money" },
        { l: "Breaches",         v: "4",    tone: "warn" },
      ]}/>

      <div className="dispatch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <h3>Inbound · awaiting dispatch</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Shared.Select value={filter.heat} onChange={(v) => setFilter({ ...filter, heat: v })} options={[{ v: "all", l: "All heat" }, { v: "hot", l: "Hot < 30s" }, { v: "cold", l: "≥ 30s" }]}/>
              <Shared.Select value={filter.product} onChange={(v) => setFilter({ ...filter, product: v })} options={[{ v: "all", l: "All products" }, ...Array.from(new Set(QUEUE.map(q => q.product))).map(p => ({ v: p, l: p }))]}/>
            </div>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "16px 1.6fr 60px 1fr 72px 1.4fr 70px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Product</div><div className="tabular" style={{ textAlign: "right" }}>SLA</div><div>Assign to</div><div></div>
            </div>
            {filtered.map(q => {
              const c = q.elapsed < 30 ? "var(--accent-money)" : q.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
              const rid = picks[q.id] || REPS[0].id;
              return (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "16px 1.6fr 60px 1fr 72px 1.4fr 70px" }}>
                  <span className="dot" style={{ background: c }}></span>
                  <div style={{ fontWeight: 500 }}>{q.lead}</div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)" }}>{q.age} · {q.state}</div>
                  <div className="cell-truncate"><span className="chip">{q.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: c, fontWeight: 500 }}>{q.elapsed}s</div>
                  <div><Shared.Select value={rid} onChange={(v) => setPick(q.id, v)} options={REPS.map(r => ({ v: r.id, l: `${r.name} · ${r.presence === "live" ? "live" : "idle"} · ${r.appts}` }))}/></div>
                  <button className="btn btn-primary" style={{ padding: "3px 8px" }} onClick={() => setPick(q.id, rid)}><Icons.Phone size={11}/> Send</button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Users size={13}/><h3>Producer capacity</h3></div>
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              {REPS.slice(0, 6).map(r => {
                const load = Math.min(100, (Object.values(picks).filter(rid => rid === r.id).length + r.appts) * 14);
                return (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 8, fontSize: 12.5, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Shared.Avatar rep={r} size={18}/>
                      <span style={{ fontWeight: 500 }}>{r.name.split(" ")[0]}</span>
                      <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                    </div>
                    <div style={{ height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${load}%`, height: "100%", background: load > 80 ? "var(--state-warning)" : "var(--accent-money)" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><Icons.Bolt size={13} style={{ color: "var(--accent-heat)" }}/><h3>Routing rules</h3></div>
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>• T65 list → Med Supp specialists</div>
              <div>• FB FE creative → producer w/ &lt; 4 appts</div>
              <div>• Inbound &lt; 30s → tier ≥ Gold</div>
              <div>• Annuity → certified producer only</div>
              <div>• Spanish — round-robin among bilingual</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carrier underwriting niches (used by the in-call Quote tool) ────────
// Score 0-100 = "fit for THIS product + THIS health profile". Tunable as
// the agency learns. Lives here so reps see ranked carriers mid-call.
const CARRIER_NICHES = [
  { id: "uhc",     name: "UnitedHealthcare", products: ["medsupp"],          fit: (i) => ({
      score: 90 - (i.tobacco ? 25 : 0) - (i.diabetes ? 10 : 0) - (i.bpHigh ? 5 : 0) + (i.age >= 65 && i.age <= 70 ? 5 : 0),
      reason: i.tobacco ? "rated up for tobacco" : "T65 sweet-spot · clean health"
  }) },
  { id: "humana",  name: "Humana",            products: ["medsupp", "mapd"],   fit: (i) => ({
      score: 85 - (i.bpHigh ? 5 : 0) + (i.tobacco ? 5 : 0) + (i.diabetes ? 8 : 0),
      reason: i.diabetes ? "tolerates type-2 diabetes well" : i.tobacco ? "tobacco-friendly underwriting" : "broad product line"
  }) },
  { id: "aetna",   name: "Aetna SRC",         products: ["medsupp"],          fit: (i) => ({
      score: (i.age <= 75 ? 85 : 50) - (i.tobacco ? 30 : 0) - (i.bpHigh ? 10 : 0) - (i.diabetes ? 8 : 0),
      reason: i.age > 75 ? "rate spike after 75" : i.tobacco ? "strict tobacco rate-up" : "competitive Plan G under 75"
  }) },
  { id: "moo",     name: "Mutual of Omaha",   products: ["medsupp", "fe"],     fit: (i) => ({
      score: 75 + (i.product === "fe" ? 10 : 0) + (i.age >= 70 ? 5 : 0) - (i.bmi > 35 ? 10 : 0),
      reason: i.product === "fe" ? "FE up to age 80, simplified issue" : "household discount available"
  }) },
  { id: "cigna",   name: "Cigna",             products: ["medsupp"],          fit: (i) => ({
      score: 80 - (i.tobacco ? 15 : 0) - (i.bmi > 35 ? 8 : 0),
      reason: "Plan N standout — lower premium, copay structure"
  }) },
  { id: "fg",      name: "F&G",                products: ["annuity", "iul"],    fit: (i) => ({
      score: i.product === "annuity" || i.product === "iul" ? 90 : 0,
      reason: "MYGA + IUL with strong cap rates"
  }) },
  { id: "lumico",  name: "Lumico",             products: ["fe"],                fit: (i) => ({
      score: i.product === "fe" ? (75 - (i.bmi > 40 ? 15 : 0) - (i.diabetes && i.bpHigh ? 10 : 0)) : 0,
      reason: "FE with mid-tier health acceptance"
  }) },
  { id: "aig",     name: "AIG",                products: ["fe", "term"],         fit: (i) => ({
      score: i.product === "fe" ? 70 : i.product === "term" ? 80 : 0,
      reason: i.product === "fe" ? "GIWL no exam · graded benefit" : "competitive term to age 75"
  }) },
];

const PRODUCT_OPTIONS = [
  { v: "medsupp", l: "Med Supp" },
  { v: "mapd",    l: "Medicare Advantage" },
  { v: "fe",      l: "Final Expense" },
  { v: "term",    l: "Term Life" },
  { v: "iul",     l: "IUL" },
  { v: "annuity", l: "Annuity" },
];

const FALLBACK_SCRIPTS = [
  { id: "f-open",   title: "Med Supp Plan G — open",      cat: "Open",       version: "v3.1", body: "Hi {{lead_name}}, this is {{rep_first}} with Atlas. The reason for my call is to make sure your Medicare Supplement gives you the same Plan G coverage at a lower rate. Quick question — are you most concerned about the monthly cost or the network freedom?" },
  { id: "f-fe",     title: "Final Expense — empathy",      cat: "Open",       version: "v2.4", body: "Most of my clients tell me the hardest part isn't paying for a policy, it's the thought of leaving the people they love with a bill on top of grief. Can I ask — if something happened tomorrow, who would you not want to leave that burden on?" },
  { id: "f-tpmo",   title: "TPMO disclosure (verbatim)",   cat: "Compliance", version: "v1.0", body: "We do not offer every plan available in your area. Currently we represent N organizations which offer N products in your area. Please contact Medicare.gov or 1-800-MEDICARE for all options." },
  { id: "f-rebut1", title: "Rebuttal — 'too expensive'",   cat: "Cross-sell", version: "v1.0", body: "I hear you. Quick math — if a hospital stay last year cost you $1,200 out-of-pocket on Advantage, and Plan G's max is $240, the premium pays for itself the first time you use it. What's your typical year look like?" },
  { id: "f-rebut2", title: "Rebuttal — 'I need to think'", cat: "Cross-sell", version: "v1.2", body: "Totally fair. The only reason I push to lock today is the rate I quoted is tied to today's underwriting class — if your med count changes by next week, the rate moves. What part are you sitting on?" },
  { id: "f-rebut3", title: "Rebuttal — 'send in mail'",    cat: "Cross-sell", version: "v1.0", body: "Happy to. Before I do — the rate sheet is 18 pages and 80% of it doesn't apply to you. Want me to send the one-page summary tailored to your meds and doctors, or the full deck?" },
  { id: "f-aep",    title: "AEP — switch reasons",          cat: "Open",       version: "v4.2", body: "Three reasons people switch during AEP: (1) the drug list changed, (2) their doctor dropped, (3) the premium jumped. Which of those is hitting you hardest this year?" },
];

function InCallScripts() {
  const [scripts] = React.useState(() => {
    try { const raw = localStorage.getItem("repflow:scripts"); if (raw) return JSON.parse(raw); } catch (_e) {}
    return FALLBACK_SCRIPTS;
  });
  const [openId, setOpenId] = React.useState(null);
  const [q, setQ]           = React.useState("");
  const filtered = scripts.filter(s => !q || s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()));
  const copy = (s) => { try { navigator.clipboard.writeText(s.body); window.toast && window.toast("Script copied", "success"); } catch (_e) {} };
  return (
    <div>
      <input className="text-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Search scripts…" value={q} onChange={(e) => setQ(e.target.value)}/>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.map(s => {
          const open = openId === s.id;
          const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
          return (
            <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", cursor: "pointer" }} onClick={() => setOpenId(open ? null : s.id)}>
                <Chev size={11} style={{ color: "var(--text-tertiary)" }}/>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }} className="cell-truncate">{s.title}</span>
                <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); copy(s); }} title="Copy"><Icons.Copy size={11}/></button>
              </div>
              {open && (
                <div style={{ padding: "8px 10px 10px 24px", fontSize: 12, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {s.body}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 14, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No scripts match.</div>}
      </div>
    </div>
  );
}

function CarrierQuoteTool() {
  const [product,  setProduct]  = React.useState("medsupp");
  const [age,      setAge]      = React.useState(67);
  const [tobacco,  setTobacco]  = React.useState(false);
  const [diabetes, setDiabetes] = React.useState(false);
  const [bpHigh,   setBpHigh]   = React.useState(false);
  const [bmi,      setBmi]      = React.useState(28);
  const inputs = { product, age: +age, tobacco, diabetes, bpHigh, bmi: +bmi };
  const ranked = CARRIER_NICHES
    .filter(c => c.products.includes(product))
    .map(c => ({ ...c, ...c.fit(inputs) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <Shared.Field label="Product"><Shared.Select value={product} onChange={setProduct} options={PRODUCT_OPTIONS}/></Shared.Field>
        <Shared.Field label="Age"><input className="text-input" type="number" value={age} onChange={(e) => setAge(e.target.value)}/></Shared.Field>
        <Shared.Field label="BMI"><input className="text-input" type="number" value={bmi} onChange={(e) => setBmi(e.target.value)}/></Shared.Field>
        <div/>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {[
          { l: "Tobacco",      v: tobacco,  set: setTobacco },
          { l: "Type-2 diab.", v: diabetes, set: setDiabetes },
          { l: "High BP",      v: bpHigh,   set: setBpHigh },
        ].map(t => (
          <button key={t.l} onClick={() => t.set(!t.v)} className="btn"
            style={{ padding: "4px 10px", fontSize: 11.5, background: t.v ? "var(--accent-heat)" : "var(--bg-raised)", color: t.v ? "white" : "var(--text-secondary)" }}>{t.l}</button>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        Recommended ({ranked.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {ranked.map((c, i) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", background: i === 0 ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 5, border: i === 0 ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid transparent" }}>
            <span style={{ fontWeight: 600, fontSize: 11.5, minWidth: 100 }}>{c.name}</span>
            <span style={{ flex: 1, fontSize: 11, color: "var(--text-tertiary)" }}>{c.reason}</span>
            <div style={{ width: 50, height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: Math.max(0, Math.min(100, c.score)) + "%", height: "100%", background: c.score >= 80 ? "var(--accent-money)" : c.score >= 60 ? "var(--state-warning)" : "var(--state-danger)" }}/>
            </div>
            <span className="tabular" style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 24, textAlign: "right" }}>{Math.round(c.score)}</span>
          </div>
        ))}
        {ranked.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)", fontSize: 11.5 }}>
            No carriers appointed for {product}. Add appointment in Resources → Carriers.
          </div>
        )}
      </div>
    </div>
  );
}

function InCall({ onClose, lead }) {
  const [tab, setTab] = React.useState("script");
  const [tpmoFired, setTpmoFired] = React.useState(false);
  const [sec, setSec] = React.useState(0);
  const [muted, setMuted]         = React.useState(false);
  const [onHold, setOnHold]       = React.useState(false);
  React.useEffect(() => {
    if (onHold) return;  // freeze timer while on hold
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [onHold]);
  React.useEffect(() => { if (sec >= 8) setTpmoFired(true); }, [sec]);

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  // Demo lead used by AutoDialBar / UI when caller didn't pass one in
  const activeLead = lead || { id: "demo-cheryl", lead: "Cheryl Hampton", state: "TX", product: "Med Supp Plan G" };

  const toggleMute = () => {
    setMuted(m => !m);
    // If a Twilio Voice connection is active, mute its outbound audio track.
    try {
      const conn = window.__twActive || (window.Twilio && window.Twilio.Device && window.Twilio.Device.activeConnection && window.Twilio.Device.activeConnection());
      if (conn && typeof conn.mute === "function") conn.mute(!muted);
    } catch (_e) {}
    window.toast && window.toast(!muted ? "Muted" : "Unmuted", "info");
  };
  const toggleHold = () => {
    setOnHold(h => !h);
    window.toast && window.toast(!onHold ? "On hold" : "Resumed", "info");
  };
  const onScheduleSOA = () => window.scheduleSOA && window.scheduleSOA(activeLead);
  const onSendAppLink = () => window.sendAppLink && window.sendAppLink(activeLead);
  const onSendSMS     = () => window.smsCompose  && window.smsCompose(activeLead, activeLead.phone);

  return (
    <div className="incall" onClick={onClose}>
      <div className="incall-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 20, borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot dot-live" style={{ width: 8, height: 8 }}></span>
            <span style={{ color: "var(--accent-money)", fontWeight: 500, fontSize: 12 }}>LIVE</span>
            <span className="tabular mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>{mm}:{ss}</span>
          </div>
          <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Cheryl Hampton</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 2 }}>67 · Travis County, TX · zip 78704 · T65 list</div>

          <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="chip chip-info">Plan G eligible</span>
            <span className="chip">No prior Med Supp</span>
            <span className="chip">Spouse 64</span>
            <span className="chip chip-money">LeadiD ✓ verified</span>
          </div>

          <div style={{ marginTop: 14, padding: 12, background: tpmoFired ? "color-mix(in oklch, var(--accent-money) 10%, transparent)" : "color-mix(in oklch, var(--accent-heat) 12%, transparent)", border: `1px solid ${tpmoFired ? "color-mix(in oklch, var(--accent-money) 30%, transparent)" : "color-mix(in oklch, var(--accent-heat) 30%, transparent)"}`, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: tpmoFired ? "var(--accent-money)" : "var(--accent-heat)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <Icons.Shield size={12}/> TPMO Disclaimer {tpmoFired ? "captured" : `auto-firing in ${Math.max(0, 8 - sec)}s`}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer..."
            </div>
          </div>

          <div className="divider"></div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {[
              { k: "script",    l: "Scripts" },
              { k: "quote",     l: "Quote" },
              { k: "rebuttals", l: "Rebuttals" },
              { k: "detail",    l: "Lead detail" },
            ].map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} className={tab === t.k ? "btn" : "btn btn-ghost"} style={{ padding: "3px 10px" }}>{t.l}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", paddingRight: 4 }}>
            {tab === "script"    && <InCallScripts/>}
            {tab === "quote"     && <CarrierQuoteTool/>}
            {tab === "rebuttals" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["I already have coverage", "It's too expensive", "Let me think about it", "Send me something in the mail"].map(r => (
                  <button key={r} className="btn" style={{ justifyContent: "flex-start" }}><Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/>{r}</button>
                ))}
              </div>
            )}
            {tab === "detail" && (
              <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                <div>LeadiD: 9f8c-2a11-...</div>
                <div>TrustedForm: cert_qz482...</div>
                <div>Form filled: 14s ago</div>
                <div>IP: 67.184.x.x · TX</div>
                <div>UTM: fb_ad_t65_v3</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
            {/* Real-time transcription via /api/transcribe (Whisper).
                Captures the rep's mic + the Twilio remote audio when active. */}
            {window.LiveTranscriber
              ? (() => { const T = window.LiveTranscriber; return <T active={!onHold} leadName={activeLead.lead}/>; })()
              : <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Transcriber loading…</div>}

            <div style={{ marginTop: 18, padding: 12, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-money)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <Icons.Sparkles size={11}/> AI suggests
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-primary)" }}>AI suggestions populate from the live transcript as the call progresses.</div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={muted ? "btn btn-primary" : "btn"} onClick={toggleMute}>
              <Icons.Mic size={12}/> {muted ? "Unmute" : "Mute"}
            </button>
            <button className={onHold ? "btn btn-primary" : "btn"} onClick={toggleHold}>
              <Icons.Pause size={12}/> {onHold ? "Resume" : "Hold"}
            </button>
            <button className="btn" onClick={onSendSMS}><Icons.MessageSquare size={12}/> SMS</button>
            <button className="btn" onClick={onScheduleSOA}><Icons.Calendar size={12}/> Schedule SOA</button>
            <button className="btn" onClick={onSendAppLink}><Icons.Check size={12}/> Send app link</button>
            <div style={{ flex: 1 }}></div>
            <button className="btn" style={{ background: "var(--state-danger)", color: "white" }} onClick={onClose}><Icons.Stop size={12}/> End call</button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageQueue = PageQueue;
window.InCall = InCall;
