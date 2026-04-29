/* Page: Pipeline (Attio-style dense list) */
function PagePipeline() {
  const { PIPELINE, REPS } = AppData;
  const repById = Object.fromEntries(REPS.map(r => [r.id, r]));
  const [view, setView] = React.useState("list");
  const [sel, setSel] = React.useState(new Set());

  const stages = ["New", "Contacted", "Quoted", "App In", "Issued"];
  const heatColor = (h) => h === "hot" ? "var(--accent-heat)" : h === "warm" ? "var(--state-warning)" : h === "fresh" ? "var(--accent-money)" : "var(--text-quaternary)";

  const cols = "20px 1fr 90px 1fr 90px 60px 1fr 1fr 80px 30px";

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Pipeline</div>
          <div className="page-sub">All contacts · 12 active · 4 in app stage</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 2 }}>
            {[["list","List"],["kanban","Kanban"]].map(([k,l]) => (
              <button key={k} onClick={() => setView(k)} className={view === k ? "btn" : "btn btn-ghost"} style={{ padding: "3px 10px", border: 0, background: view === k ? "var(--bg-raised)" : "transparent" }}>{l}</button>
            ))}
          </div>
          <button className="btn"><Icons.Filter size={13}/> Filter</button>
          <button className="btn btn-primary"><Icons.Plus size={13}/> New lead</button>
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
            {PIPELINE.map(p => (
              <div key={p.id} className={`row ${sel.has(p.id) ? "sel" : ""}`} style={{ gridTemplateColumns: cols }} onClick={() => {
                const n = new Set(sel); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSel(n);
              }}>
                <span className="dot" style={{ background: heatColor(p.heat) }}></span>
                <div className="cell-truncate" style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>{p.lead}<span style={{ color: "var(--text-quaternary)", fontWeight: 400, fontSize: 11 }}>· {p.product}</span></div>
                <div className="cell-truncate tabular" style={{ color: "var(--text-tertiary)" }}>{p.age} · {p.state}</div>
                <div><span className={`chip ${
                  p.stage === "Issued" ? "chip-money" :
                  p.stage === "App In" ? "chip-info" :
                  p.stage === "Quoted" ? "chip-status" :
                  p.stage === "Contacted" ? "" : ""
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
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 10 }}>
          {stages.map(s => {
            const items = PIPELINE.filter(p => p.stage === s);
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
    </div>
  );
}

window.PagePipeline = PagePipeline;
