/* Page: Manager — Team Board (dispatch) and Coaching */
function PageTeam() {
  const { REPS, QUEUE } = AppData;
  const [drag, setDrag] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const [assigned, setAssigned] = React.useState({});

  const visibleQueue = QUEUE.filter(q => !assigned[q.id]);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Team Board</div>
          <div className="page-sub">Drag a lead onto a producer · routing rules validate state license, carrier appt, and tier</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icons.Settings size={13}/> Routing rules</button>
          <button className="btn btn-primary"><Icons.Plus size={13}/> Bulk assign</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Phone size={13}/><h3>Unassigned queue</h3><span className="meta">{visibleQueue.length}</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleQueue.map(q => (
              <div key={q.id}
                draggable
                onDragStart={() => setDrag(q)}
                onDragEnd={() => setDrag(null)}
                style={{ padding: 10, background: drag?.id === q.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, cursor: "grab" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500 }}>
                  <Icons.GripVertical size={12} style={{ color: "var(--text-quaternary)" }}/>
                  {q.lead}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>{q.age} · {q.state} · {q.product}</span>
                  <span className="tabular" style={{ color: q.elapsed < 30 ? "var(--accent-money)" : "var(--state-warning)" }}>{q.elapsed}s</span>
                </div>
              </div>
            ))}
            {visibleQueue.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>All leads assigned. Pull more from AEP pool?</div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {REPS.slice(0, 6).map(r => (
            <div key={r.id} className="panel"
              onDragOver={(e) => { e.preventDefault(); setDrop(r.id); }}
              onDragLeave={() => setDrop(null)}
              onDrop={() => {
                if (drag) {
                  setAssigned({ ...assigned, [drag.id]: r.id });
                  setDrag(null); setDrop(null);
                }
              }}
              style={{ borderColor: drop === r.id ? "var(--accent-money)" : undefined, background: drop === r.id ? "color-mix(in oklch, var(--accent-money) 6%, var(--bg-elevated))" : undefined }}>
              <div className="panel-h">
                <Shared.Avatar rep={r} size={22}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}></span>
                    {r.presence === "live" ? "on call" : "idle"} · {r.appts} appts
                  </div>
                </div>
                <Shared.TierChip tier={r.tier} compact/>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>MTD</span>
                  <span className="tabular" style={{ color: "var(--text-primary)", fontWeight: 500 }}>${r.mtd.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (r.mtd / 50000) * 100)}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {Object.entries(assigned).filter(([_, rep]) => rep === r.id).map(([qid]) => {
                    const q = QUEUE.find(x => x.id === qid);
                    return (
                      <div key={qid} style={{ padding: "4px 8px", background: "var(--bg-raised)", borderRadius: 4, fontSize: 11.5, display: "flex", justifyContent: "space-between" }}>
                        <span>{q.lead}</span>
                        <span className="chip chip-money" style={{ fontSize: 9.5 }}>NEW</span>
                      </div>
                    );
                  })}
                  {!Object.values(assigned).includes(r.id) && drag && (
                    <div style={{ padding: 8, border: "1px dashed var(--border-strong)", borderRadius: 4, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>Drop to assign</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageCoaching() {
  const { REPS, RECORDINGS } = AppData;
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching</div>
          <div className="page-sub">Virtual ridealong feed · one-thing-at-a-time per rep</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Activity size={13}/><h3>This week's coaching cards</h3></div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { rep: REPS[0], focus: "Ask 3 more open-ended questions/hour", evidence: "4 closed-ended in first 6 min of Cheryl Hampton call", impact: "+12% close rate (cohort)" },
              { rep: REPS[2], focus: "Cut talk-listen ratio from 58% → 45%", evidence: "Robert Mendez tried to share medication concern twice; you talked over both times", impact: "Robert is most-cancelled segment" },
              { rep: REPS[5], focus: "Use the Plan G price-anchor sequence", evidence: "0 anchors used in 14 quoted calls last week", impact: "Closes drop 38% without anchor" },
            ].map((c, i) => (
              <div key={i} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Shared.Avatar rep={c.rep} size={26}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.rep.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}><Shared.TierChip tier={c.rep.tier} compact/> · {c.rep.handle}</div>
                  </div>
                  <button className="btn btn-ghost"><Icons.Play size={11}/> Replay moment</button>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.evidence}</div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>Impact projection: <span style={{ color: "var(--accent-money)" }}>{c.impact}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Headset size={13}/><h3>Latest call · Cheryl Hampton</h3></div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
                <span className="mono">30:42</span>
                <div style={{ flex: 1, height: 28, position: "relative", background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden" }}>
                  {/* fake waveform */}
                  <svg width="100%" height="28" viewBox="0 0 200 28" preserveAspectRatio="none">
                    {Array.from({ length: 60 }).map((_, i) => {
                      const h = 4 + Math.abs(Math.sin(i * 0.7)) * 18 + (i % 5 === 0 ? 4 : 0);
                      return <rect key={i} x={i * 3.4} y={(28 - h) / 2} width="1.6" height={h} fill={i < 38 ? "var(--accent-money)" : "var(--text-quaternary)"}/>;
                    })}
                  </svg>
                </div>
                <span className="mono">42:11</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="chip chip-money">Talk: 38%</span>
                <span className="chip">Open Q: 11</span>
                <span className="chip chip-money">TPMO ✓</span>
                <span className="chip chip-status">SOA scheduled</span>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <b style={{ color: "var(--text-primary)" }}>AI summary —</b> Strong rapport. Cheryl is high-intent; mentioned 3 medications and a recent ER visit. Marcus closed-ended on "how do you spend your days" — try: "Walk me through your day."
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Scorecard rollup · this week</h3></div>
            <div style={{ padding: "10px 14px" }}>
              {[
                { l: "Avg talk ratio", v: "44%", g: 70, c: "var(--accent-money)" },
                { l: "Avg open Qs / call", v: "8.2", g: 82, c: "var(--accent-money)" },
                { l: "TPMO compliance", v: "100%", g: 100, c: "var(--accent-money)" },
                { l: "SOA capture", v: "94%", g: 94, c: "var(--accent-status)" },
                { l: "Cross-sell mentions", v: "1.3 / call", g: 35, c: "var(--state-warning)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px", alignItems: "center", padding: "6px 0", borderBottom: i < 4 ? "1px solid var(--border-subtle)" : 0, fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.l}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.v}</span>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginLeft: 14, overflow: "hidden" }}>
                    <div style={{ width: `${r.g}%`, height: "100%", background: r.c }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageTeam = PageTeam;
window.PageCoaching = PageCoaching;
