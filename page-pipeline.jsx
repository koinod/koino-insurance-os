/* Page: Pipeline (Attio-style dense list) — role-aware
   Rep view: only their own deals. Manager/Owner: full org. */
function PagePipeline({ role = "owner" }) {
  const { PIPELINE, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const [view, setView] = React.useState("list");
  const [sel, setSel] = React.useState(new Set());
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [filters, setFilters] = React.useState({ stage: "all", heat: "all", owner: "all", state: "all", source: "all", maxDays: 30 });
  const [newRow, setNewRow] = React.useState({ lead: "", age: 65, state: "TX", product: "Med Supp Plan G", source: "FB Lead Form", owner: REPS[0].id });
  const [extra, setExtra] = React.useState([]);

  const stages = ["New", "Contacted", "Quoted", "App In", "Issued"];
  const heats = ["fresh", "hot", "warm", "cold"];
  const sources = Array.from(new Set(PIPELINE.map(p => p.source)));
  const states = Array.from(new Set(PIPELINE.map(p => p.state)));
  const heatColor = (h) => h === "hot" ? "var(--accent-heat)" : h === "warm" ? "var(--state-warning)" : h === "fresh" ? "var(--accent-money)" : "var(--text-quaternary)";

  // Rep view scopes to "their" deals; we use the first rep as a stand-in for the logged-in user.
  const meId = REPS[0].id;
  const all = [...extra, ...PIPELINE];
  const scoped = role === "rep" ? all.filter(p => p.owner === meId) : all;
  const filtered = scoped.filter(p =>
    (filters.stage  === "all" || p.stage  === filters.stage) &&
    (filters.heat   === "all" || p.heat   === filters.heat) &&
    (filters.owner  === "all" || p.owner  === filters.owner) &&
    (filters.state  === "all" || p.state  === filters.state) &&
    (filters.source === "all" || p.source === filters.source) &&
    (p.days <= filters.maxDays)
  );

  const cols = "20px 1fr 90px 1fr 90px 60px 1fr 1fr 80px 30px";
  const submit = () => {
    if (!newRow.lead.trim()) return;
    const id = Math.max(0, ...all.map(p => p.id || 0)) + 1;
    setExtra([{ id, lead: newRow.lead, age: +newRow.age, state: newRow.state, stage: "New", product: newRow.product, ap: 0, days: 0, last: "Just added", next: "First dial", source: newRow.source, owner: newRow.owner, consent: "verified", heat: "fresh" }, ...extra]);
    setNewRow({ ...newRow, lead: "" });
    setNewOpen(false);
  };
  const activeFilters = Object.entries(filters).filter(([k, v]) => v !== "all" && k !== "maxDays").length + (filters.maxDays < 30 ? 1 : 0);

  const subtitle = role === "rep"
    ? `My pipeline · ${filtered.length} active · ${filtered.filter(p => p.stage === "App In").length} in app stage`
    : `All contacts · ${filtered.length} active · ${filtered.filter(p => p.stage === "App In").length} in app stage`;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Pipeline</div>
          <div className="page-sub">{subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2 }}>
            {[["list","List"],["kanban","Kanban"]].map(([k,l]) => (
              <button key={k} onClick={() => setView(k)} className={view === k ? "btn" : "btn btn-ghost"} style={{ padding: "3px 10px", border: 0, background: view === k ? "var(--bg-raised)" : "transparent" }}>{l}</button>
            ))}
          </div>
          <button className="btn" onClick={() => setFilterOpen(true)}>
            <Icons.Filter size={13}/> Filter
            {activeFilters > 0 && <span className="chip chip-info" style={{ fontSize: 10, marginLeft: 4 }}>{activeFilters}</span>}
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icons.Plus size={13}/> New lead</button>
        </div>
      </div>

      {view === "list" && (
        <div className="panel">
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: cols }}>
              <div></div>
              <div>Lead</div>
              <div>Age/St</div>
              <div>Stage</div>
              <div style={{ textAlign: "right" }}>AP</div>
              <div className="tabular" style={{ textAlign: "right" }}>Days</div>
              <div>Last touch</div>
              <div>Next action</div>
              <div>Owner</div>
              <div></div>
            </div>
            {filtered.map(p => (
              <div key={p.id} className={`row ${sel.has(p.id) ? "sel" : ""}`} style={{ gridTemplateColumns: cols }} onClick={() => {
                const n = new Set(sel); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSel(n);
              }}>
                <span className="dot" style={{ background: heatColor(p.heat) }}></span>
                <div className="cell-truncate" style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>{p.lead}<span style={{ color: "var(--text-quaternary)", fontWeight: 400, fontSize: 11 }}>· {p.product}</span></div>
                <div className="cell-truncate tabular" style={{ color: "var(--text-tertiary)" }}>{p.age} · {p.state}</div>
                <div><span className={`chip ${
                  p.stage === "Issued" ? "chip-money" :
                  p.stage === "App In" ? "chip-info" :
                  p.stage === "Quoted" ? "chip-status" : ""
                }`}>{p.stage}</span></div>
                <div className="tabular" style={{ textAlign: "right", color: p.ap ? "var(--text-primary)" : "var(--text-quaternary)" }}>{p.ap ? `$${p.ap.toLocaleString()}` : "—"}</div>
                <div className="tabular" style={{ textAlign: "right", color: p.days > 5 ? "var(--state-danger)" : "var(--text-tertiary)" }}>{p.days}d</div>
                <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{p.last}</div>
                <div className="cell-truncate" style={{ color: "var(--text-secondary)" }}>{p.next}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Shared.Avatar rep={repById[p.owner]} size={18}/>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{repById[p.owner].name.split(" ")[0]}</span>
                </div>
                <button className="icon-btn"><Icons.Dots size={13}/></button>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No leads match these filters.</div>}
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 10 }}>
          {stages.map(s => {
            const items = filtered.filter(p => p.stage === s);
            const sum = items.reduce((a, b) => a + (b.ap || 0), 0);
            return (
              <div key={s} className="panel">
                <div className="panel-h">
                  <h3>{s}</h3>
                  <span className="meta tabular">{items.length} · ${sum.toLocaleString()}</span>
                </div>
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 200 }}>
                  {items.map(p => (
                    <div key={p.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500 }}>
                        <span className="dot" style={{ background: heatColor(p.heat) }}></span>
                        {p.lead}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{p.product}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <span className="tabular" style={{ fontSize: 12, fontWeight: 500 }}>{p.ap ? `$${p.ap.toLocaleString()}` : "—"}</span>
                        <Shared.Avatar rep={repById[p.owner]} size={16}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filterOpen && (
        <Shared.Modal title="Filter pipeline" onClose={() => setFilterOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setFilters({ stage: "all", heat: "all", owner: "all", state: "all", source: "all", maxDays: 30 })}>Reset</button>
            <button className="btn btn-primary" onClick={() => setFilterOpen(false)}>Apply</button>
          </>
        }>
          <Shared.Field label="Stage"><Shared.Select value={filters.stage} onChange={(v) => setFilters({ ...filters, stage: v })} options={[{ v: "all", l: "All stages" }, ...stages.map(s => ({ v: s, l: s }))]}/></Shared.Field>
          <Shared.Field label="Heat"><Shared.Select value={filters.heat} onChange={(v) => setFilters({ ...filters, heat: v })} options={[{ v: "all", l: "Any heat" }, ...heats.map(h => ({ v: h, l: h }))]}/></Shared.Field>
          {role !== "rep" && <Shared.Field label="Owner"><Shared.Select value={filters.owner} onChange={(v) => setFilters({ ...filters, owner: v })} options={[{ v: "all", l: "Any rep" }, ...REPS.map(r => ({ v: r.id, l: r.name }))]}/></Shared.Field>}
          <Shared.Field label="State"><Shared.Select value={filters.state} onChange={(v) => setFilters({ ...filters, state: v })} options={[{ v: "all", l: "Any state" }, ...states.map(s => ({ v: s, l: s }))]}/></Shared.Field>
          <Shared.Field label="Source"><Shared.Select value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} options={[{ v: "all", l: "Any source" }, ...sources.map(s => ({ v: s, l: s }))]}/></Shared.Field>
          <Shared.Field label={`Max age in stage · ${filters.maxDays}d`}>
            <input type="range" min={1} max={30} value={filters.maxDays} onChange={(e) => setFilters({ ...filters, maxDays: +e.target.value })} style={{ width: "100%" }}/>
          </Shared.Field>
        </Shared.Modal>
      )}

      {newOpen && (
        <Shared.Modal title="New lead" onClose={() => setNewOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={!newRow.lead.trim()}><Icons.Plus size={12}/> Add to pipeline</button>
          </>
        }>
          <Shared.Field label="Name"><input className="text-input" value={newRow.lead} onChange={(e) => setNewRow({ ...newRow, lead: e.target.value })} placeholder="Cheryl Hampton" autoFocus/></Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Age"><input className="text-input" type="number" min={18} max={110} value={newRow.age} onChange={(e) => setNewRow({ ...newRow, age: e.target.value })}/></Shared.Field>
            <Shared.Field label="State"><Shared.Select value={newRow.state} onChange={(v) => setNewRow({ ...newRow, state: v })} options={["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"].map(s => ({ v: s, l: s }))}/></Shared.Field>
          </div>
          <Shared.Field label="Product"><Shared.Select value={newRow.product} onChange={(v) => setNewRow({ ...newRow, product: v })} options={["Med Supp Plan G","Med Supp Plan N","Final Expense $10K","Final Expense $15K","Final Expense $20K","Final Expense $25K","Annuity $50K"].map(s => ({ v: s, l: s }))}/></Shared.Field>
          <Shared.Field label="Source"><Shared.Select value={newRow.source} onChange={(v) => setNewRow({ ...newRow, source: v })} options={["FB Lead Form","Inbound call","T65 list","Referral","Cross-sell"].map(s => ({ v: s, l: s }))}/></Shared.Field>
          {role !== "rep" && <Shared.Field label="Owner"><Shared.Select value={newRow.owner} onChange={(v) => setNewRow({ ...newRow, owner: v })} options={REPS.map(r => ({ v: r.id, l: r.name }))}/></Shared.Field>}
        </Shared.Modal>
      )}
    </div>
  );
}

window.PagePipeline = PagePipeline;
