/* Page: Pipeline — Attio-style dense list + kanban drag-drop + lead detail.
   Role-aware: rep view scopes to my deals; mgr/owner see the full org. */
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
  const [overrides, setOverrides] = React.useState({}); // id -> { stage, owner }
  const [drag, setDrag] = React.useState(null);
  const [openLead, setOpenLead] = React.useState(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkAction, setBulkAction] = React.useState("stage");
  const [bulkValue, setBulkValue] = React.useState("Contacted");
  const [savedViews, setSavedViews] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("repflow.pipeline.views") || "[]"); } catch { return []; }
  });
  const [activeViewIdx, setActiveViewIdx] = React.useState(-1);

  const stages = ["New", "Contacted", "Quoted", "App In", "Issued"];
  const heats = ["fresh", "hot", "warm", "cold"];
  const sources = Array.from(new Set(PIPELINE.map(p => p.source)));
  const states = Array.from(new Set(PIPELINE.map(p => p.state)));
  const heatColor = (h) => h === "hot" ? "var(--accent-heat)" : h === "warm" ? "var(--state-warning)" : h === "fresh" ? "var(--accent-money)" : "var(--text-quaternary)";

  const meId = REPS[0].id;
  const all = [...extra, ...PIPELINE].map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);
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
  const moveTo = (id, stage) => setOverrides({ ...overrides, [id]: { ...(overrides[id] || {}), stage } });
  const reassign = (id, owner) => setOverrides({ ...overrides, [id]: { ...(overrides[id] || {}), owner } });

  const applyBulk = () => {
    const next = { ...overrides };
    sel.forEach(id => {
      next[id] = { ...(next[id] || {}), [bulkAction === "stage" ? "stage" : "owner"]: bulkValue };
    });
    setOverrides(next);
    setBulkOpen(false);
    setSel(new Set());
  };

  const saveView = () => {
    const name = prompt("Name this view:");
    if (!name) return;
    const view = { name, filters: { ...filters } };
    const next = [...savedViews, view];
    setSavedViews(next);
    localStorage.setItem("repflow.pipeline.views", JSON.stringify(next));
    setActiveViewIdx(next.length - 1);
  };
  const loadView = (idx) => {
    if (idx < 0 || !savedViews[idx]) return;
    setFilters(savedViews[idx].filters);
    setActiveViewIdx(idx);
  };
  const deleteView = (idx) => {
    const next = savedViews.filter((_, i) => i !== idx);
    setSavedViews(next);
    localStorage.setItem("repflow.pipeline.views", JSON.stringify(next));
    if (activeViewIdx === idx) setActiveViewIdx(-1);
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
            {[["list","List"],["kanban","Kanban"],["sequences","Sequences"]].map(([k,l]) => (
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

      {(savedViews.length > 0 || sel.size > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
          {savedViews.map((v, i) => (
            <span key={i} className={`chip ${activeViewIdx === i ? "chip-money" : ""}`} style={{ cursor: "pointer", display: "inline-flex", gap: 4 }} onClick={() => loadView(i)}>
              <span style={{ fontWeight: 500 }}>{v.name}</span>
              <button className="icon-btn" style={{ width: 14, height: 14, padding: 0, color: "var(--text-quaternary)" }} onClick={(e) => { e.stopPropagation(); deleteView(i); }}><Icons.X size={9}/></button>
            </span>
          ))}
          <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }} onClick={saveView}><Icons.Plus size={11}/> Save view</button>
          {sel.size > 0 && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{sel.size} selected</span>
              <button className="btn" onClick={() => setBulkOpen(true)}><Icons.Workflow size={11}/> Bulk action</button>
              <button className="btn btn-ghost" onClick={() => setSel(new Set())}>Clear</button>
            </span>
          )}
        </div>
      )}

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
              <div key={p.id} className={`row ${sel.has(p.id) ? "sel" : ""}`} style={{ gridTemplateColumns: cols }} onClick={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  const n = new Set(sel); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSel(n);
                } else {
                  setOpenLead(p);
                }
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
                <button className="icon-btn" onClick={(e) => { e.stopPropagation(); const n = new Set(sel); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSel(n); }}><Icons.Dots size={13}/></button>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No leads match these filters.</div>}
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 10 }}>
          {stages.map(s => {
            const items = filtered.filter(p => p.stage === s);
            const sum = items.reduce((a, b) => a + (b.ap || 0), 0);
            return (
              <div key={s} className="panel"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (drag != null) { moveTo(drag, s); setDrag(null); } }}>
                <div className="panel-h">
                  <h3>{s}</h3>
                  <span className="meta tabular">{items.length} · ${sum.toLocaleString()}</span>
                </div>
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 220 }}>
                  {items.map(p => (
                    <div key={p.id}
                      draggable
                      onDragStart={() => setDrag(p.id)}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => setOpenLead(p)}
                      style={{ background: drag === p.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 10, cursor: "grab", opacity: drag === p.id ? 0.5 : 1 }}>
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
                  {items.length === 0 && drag != null && (
                    <div style={{ padding: 14, border: "1px dashed var(--border-strong)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 11.5, textAlign: "center" }}>Drop to move to {s}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "sequences" && (() => { const PS = window.PipelineSequences; return PS ? <PS role={role}/> : null; })()}

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

      {openLead && <LeadDetail lead={openLead} role={role} onClose={() => setOpenLead(null)} onMove={(stage) => moveTo(openLead.id, stage)} onReassign={(o) => reassign(openLead.id, o)}/>}

      {bulkOpen && (
        <Shared.Modal title={`Bulk action · ${sel.size} leads`} onClose={() => setBulkOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setBulkOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={applyBulk}><Icons.Check size={11}/> Apply to {sel.size}</button>
          </>
        }>
          <Shared.Field label="Action">
            <Shared.Select value={bulkAction} onChange={(v) => { setBulkAction(v); setBulkValue(v === "stage" ? "Contacted" : REPS[0].id); }} options={[{ v: "stage", l: "Move to stage" }, { v: "owner", l: "Reassign to producer" }]}/>
          </Shared.Field>
          <Shared.Field label="Value">
            <Shared.Select value={bulkValue} onChange={setBulkValue} options={bulkAction === "stage" ? stages.map(s => ({ v: s, l: s })) : REPS.map(r => ({ v: r.id, l: r.name }))}/>
          </Shared.Field>
        </Shared.Modal>
      )}
    </div>
  );
}

function LeadDetail({ lead, role, onClose, onMove, onReassign }) {
  const { REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const owner = repById[lead.owner];
  const stages = ["New", "Contacted", "Quoted", "App In", "Issued"];
  const heatColor = lead.heat === "hot" ? "var(--accent-heat)" : lead.heat === "warm" ? "var(--state-warning)" : lead.heat === "fresh" ? "var(--accent-money)" : "var(--text-quaternary)";
  const initials = lead.lead.split(" ").map(s => s[0]).join("");

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="avatar-xs" style={{ width: 36, height: 36, fontSize: 13, background: owner?.color || "linear-gradient(135deg,#5b86e5,#36d1dc)" }}>{initials}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-display)" }}>{lead.lead}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{lead.age} · {lead.state} · {lead.source}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>

        <div className="slideout-body">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="chip" style={{ background: "color-mix(in oklch, " + heatColor + " 14%, transparent)", color: heatColor, borderColor: "color-mix(in oklch, " + heatColor + " 30%, transparent)" }}>
              <Icons.Flame size={11}/> {lead.heat}
            </span>
            <span className="chip">{lead.product}</span>
            <span className={`chip ${lead.consent === "verified" ? "chip-money" : "chip-status"}`}>Consent {lead.consent}</span>
          </div>

          <div className="divider"></div>

          <div className="field-l">Stage</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {stages.map(s => (
              <button key={s} className={`btn ${lead.stage === s ? "btn-primary" : "btn-ghost"}`} style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => onMove(s)}>{s}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <Shared.Field label="AP"><div className="tabular" style={{ fontSize: 16, fontWeight: 500 }}>{lead.ap ? `$${lead.ap.toLocaleString()}` : "—"}</div></Shared.Field>
            <Shared.Field label="Age in stage"><div className="tabular" style={{ fontSize: 16, fontWeight: 500, color: lead.days > 5 ? "var(--state-danger)" : "var(--text-primary)" }}>{lead.days}d</div></Shared.Field>
            <Shared.Field label="Last touch"><div style={{ fontSize: 13 }}>{lead.last}</div></Shared.Field>
            <Shared.Field label="Next action"><div style={{ fontSize: 13 }}>{lead.next}</div></Shared.Field>
          </div>

          <div className="divider"></div>

          <div className="field-l">Sequences</div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {(window.PIPELINE_SEQUENCES || []).slice(0, 3).map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "var(--bg-raised)", borderRadius: 6 }}>
                <Icons.Workflow size={12} style={{ color: "var(--text-tertiary)" }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.steps.length} steps · {s.days}d · {s.channel}</div>
                </div>
                <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>Enroll</button>
              </div>
            ))}
          </div>

          <div className="divider"></div>

          {role !== "rep" && (
            <Shared.Field label="Owner">
              <Shared.Select value={lead.owner} onChange={onReassign} options={REPS.map(r => ({ v: r.id, l: r.name }))}/>
            </Shared.Field>
          )}

          <div className="divider"></div>

          <div className="field-l">Compliance</div>
          <div className="panel" style={{ padding: 12, marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>LeadiD</span><span className="mono" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>9f8c-2a11…</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>TrustedForm</span><span className="chip chip-money">Captured</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--text-secondary)" }}>SOA</span><span className={`chip ${lead.stage === "App In" || lead.stage === "Issued" ? "chip-money" : "chip-status"}`}>{lead.stage === "Issued" ? "Captured" : "Before quote"}</span>
            </div>
          </div>

          <div className="divider"></div>

          <div className="field-l">Activity</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { d: lead.last,    t: "Last touch",  s: lead.next },
              { d: "Earlier",    t: "Quote sent",  s: lead.product },
              { d: lead.days + "d ago", t: "Form filled",  s: lead.source + " · " + lead.state },
            ].map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, fontSize: 12.5 }}>
                <span style={{ color: "var(--text-tertiary)" }}>{a.d}</span>
                <div><strong>{a.t}</strong><div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.s}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="slideout-foot">
          <button className="btn"><Icons.Mail size={12}/> Email</button>
          <button className="btn"><Icons.MessageSquare size={12}/> SMS</button>
          <button className="btn btn-primary"><Icons.Phone size={12}/> Call now</button>
        </div>
      </aside>
    </div>
  );
}

window.PagePipeline = PagePipeline;
