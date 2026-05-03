/* Page: Manager — Team Board (dispatch) and Coaching (role-aware) */
function PageTeam() {
  const { REPS, QUEUE } = AppData;
  const [drag, setDrag] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const [assigned, setAssigned] = React.useState({});
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkPicks, setBulkPicks] = React.useState({});  // queueId -> repId

  const visibleQueue = QUEUE.filter(q => !assigned[q.id]);

  const suggestRep = (q) => {
    // Auto-suggest: live presence > tier > available capacity (fewest assigned today)
    const counts = REPS.reduce((acc, r) => ({ ...acc, [r.id]: 0 }), {});
    Object.values(assigned).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    Object.values(bulkPicks).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    const ranked = [...REPS].sort((a, b) => {
      if (a.presence !== b.presence) return a.presence === "live" ? -1 : 1;
      if (a.tier !== b.tier) return ["diamond","platinum","gold","silver","bronze"].indexOf(a.tier) - ["diamond","platinum","gold","silver","bronze"].indexOf(b.tier);
      return counts[a.id] - counts[b.id];
    });
    return ranked[0].id;
  };

  const openBulk = () => {
    const picks = {};
    visibleQueue.forEach(q => picks[q.id] = suggestRep(q));
    setBulkPicks(picks);
    setBulkOpen(true);
  };
  const commitBulk = async () => {
    const picks = { ...bulkPicks };
    setAssigned({ ...assigned, ...picks });
    setBulkOpen(false);
    window.toast && window.toast(`Routing ${Object.keys(picks).length} leads${AppData.LIVE ? "..." : ""}`, "info");
    if (AppData.LIVE) {
      try {
        await Promise.all(Object.entries(picks).map(([qid, rid]) => AppData.mutate.queueAssign(qid, rid)));
        window.toast && window.toast(`Routed ${Object.keys(picks).length} leads`, "success");
      } catch (_e) {}
    }
  };

  const [routingOpen, setRoutingOpen] = React.useState(false);
  const [repDrill, setRepDrill] = React.useState(null);

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Team Board</div>
          <div className="page-sub">Drag a lead onto a producer · routing rules validate state license, carrier appt, and tier</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setRoutingOpen(true)}><Icons.Settings size={13}/> Routing rules</button>
          <button className="btn btn-primary" onClick={openBulk} disabled={visibleQueue.length === 0}><Icons.Plus size={13}/> Bulk assign</button>
        </div>
      </div>

      <Shared.SectionPill
        items={[{k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},{k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"}]}
        value="team"
        onChange={(k) => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      <div className="team-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {REPS.slice(0, 6).map(r => (
            <div key={r.id} className="panel"
              onDragOver={(e) => { e.preventDefault(); setDrop(r.id); }}
              onDragLeave={() => setDrop(null)}
              onDrop={async () => {
                if (drag) {
                  setAssigned({ ...assigned, [drag.id]: r.id });
                  const dragSnap = drag;
                  setDrag(null); setDrop(null);
                  try {
                    await AppData.mutate.queueAssign(dragSnap.id, r.id);
                    window.toast && window.toast(`${dragSnap.lead} → ${r.name.split(" ")[0]}${AppData.LIVE ? " · routed" : ""}`, "success");
                  } catch (_e) {}
                }
              }}
              style={{ borderColor: drop === r.id ? "var(--accent-money)" : undefined, background: drop === r.id ? "color-mix(in oklch, var(--accent-money) 6%, var(--bg-elevated))" : undefined, cursor: "pointer" }}
              onClick={(e) => { if (e.target.closest("button")) return; setRepDrill(r); }}>
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

      {routingOpen && <RoutingRulesModal onClose={() => setRoutingOpen(false)}/>}
      {repDrill && <RepDrillSlideout rep={repDrill} onClose={() => setRepDrill(null)}/>}

      {bulkOpen && (
        <Shared.Modal title="Bulk assign queue" width={620} onClose={() => setBulkOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setBulkOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={commitBulk}><Icons.Check size={12}/> Assign {Object.keys(bulkPicks).length}</button>
          </>
        }>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>Auto-suggested by presence, tier, and current load. License + carrier appointment validated.</div>
          <div className="list" style={{ border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 1fr 26px" }}>
              <div>Lead</div><div>Source</div><div>Producer</div><div></div>
            </div>
            {visibleQueue.map(q => {
              const rid = bulkPicks[q.id];
              const r = REPS.find(x => x.id === rid);
              return (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "1.4fr 100px 1fr 26px" }}>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>{q.lead} <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>· {q.product}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{q.source}</div>
                  <div>
                    <Shared.Select value={rid} onChange={(v) => setBulkPicks({ ...bulkPicks, [q.id]: v })} options={REPS.map(rr => ({ v: rr.id, l: `${rr.name} · ${rr.tier}` }))}/>
                  </div>
                  <button className="icon-btn" title="Skip" onClick={() => { const np = { ...bulkPicks }; delete np[q.id]; setBulkPicks(np); }}><Icons.X size={12}/></button>
                </div>
              );
            })}
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ─────  Coaching · role-aware
   - Manager view (default): existing card feed for all reps + waveform + scorecard
   - Rep view: my coaching cards + drills
   - Owner view: org-wide coach effectiveness — close-rate lift per coaching theme */
function PageCoaching({ role = "manager" }) {
  const { REPS, RECORDINGS } = AppData;
  if (role === "rep") return <CoachingRep/>;
  if (role === "owner") return <CoachingOwner/>;
  return <CoachingManager/>;
}

function CoachingManager() {
  const { REPS } = AppData;
  const [replay, setReplay] = React.useState(null);
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Team</div>
          <div className="page-sub">Virtual ridealong feed · one-thing-at-a-time per rep</div>
        </div>
      </div>

      <div className="cards-2col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
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
                  <button className="btn btn-ghost" onClick={() => setReplay(c)}><Icons.Play size={11}/> Replay moment</button>
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

      {replay && <ReplayMomentModal card={replay} onClose={() => setReplay(null)}/>}
    </div>
  );
}

function ReplayMomentModal({ card, onClose }) {
  // Synthesized transcript snippet that plausibly matches the coaching focus
  const transcript = [
    { who: "You",      t: "00:42", body: "So, do you take any medications?" },
    { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "00:46", body: "Uh, yes, a few — metformin, blood pressure, and..." },
    { who: "You",      t: "00:51", body: "Got it. Well, our Plan G also covers the donut hole, so..." },
    { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "01:02", body: "Wait, I was about to say something — sorry." },
  ];
  return (
    <Shared.Modal title={`Coaching moment · ${card?.rep?.name || "rep"}`} width={620} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => { window.toast && window.toast("Marked practiced — moves down the queue", "success"); onClose(); }}><Icons.Check size={11}/> Mark practiced</button>
      </>
    }>
      <div style={{ padding: 12, background: "color-mix(in oklch, var(--accent-status) 8%, transparent)", borderRadius: 6, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.55 }}>
        <strong style={{ color: "var(--accent-status)" }}>Focus —</strong> {card?.focus}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {transcript.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10, alignItems: "start" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{m.t}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: m.who === "You" ? "var(--accent-money)" : "var(--text-secondary)" }}>{m.who}</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        <strong style={{ color: "var(--text-primary)" }}>What to try next time:</strong> "Walk me through what your morning looks like with those medications." Open-ended → fewer interruptions → richer discovery.
      </div>
    </Shared.Modal>
  );
}

function CoachingRep() {
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Me</div>
          <div className="page-sub">One thing at a time. Replay the moment, run the drill, log the rep.</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Open cards" value="3" sub="2 due today"/>
        <Shared.KpiCard label="Drills this week" value="7" sub="+2 vs last" trend="up"/>
        <Shared.KpiCard label="Close-rate lift" value="+9.4%" prefix="" suffix="" sub="cohort baseline" trend="up"/>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-h"><Icons.Activity size={13}/><h3>My coaching cards</h3></div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { focus: "Ask 3 more open-ended questions per hour", evidence: "4 closed-ended in first 6 min of Cheryl Hampton call", drill: "Run 5-question rephrase drill", impact: "+12% close rate (cohort)" },
            { focus: "Cut talk-listen from 52% → 45%", evidence: "Talked over Robert Mendez twice on his medication concern", drill: "30-sec silence drill x10", impact: "Persistency +6pts" },
            { focus: "Lead with daily-routine question on T65", evidence: "Skipped on 7 of last 10 T65 dials", drill: "Watch top-3 Marcus opens", impact: "Quote-rate +18%" },
          ].map((c, i) => (
            <div key={i} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.evidence}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Walk me through my coaching focus '${c.focus}' — give me 3 lines I can use on my next call`, context: "Coaching · " + c.focus }}))}><Icons.Play size={11}/> Replay moment</button>
                <button className="btn"><Icons.Sparkles size={11}/> {c.drill}</button>
                <span className="chip chip-money" style={{ alignSelf: "center" }}>Impact: {c.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CoachingOwner() {
  const themes = [
    { t: "Open-ended questions", reps: 6, lift: 12.4, n: 412 },
    { t: "Talk-listen ratio",     reps: 4, lift:  6.9, n: 318 },
    { t: "Plan-G anchor sequence",reps: 5, lift: 18.2, n: 244 },
    { t: "Daily-routine open",    reps: 3, lift:  9.1, n: 196 },
    { t: "Cross-sell on Issued",  reps: 7, lift:  4.4, n: 510 },
  ];
  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Org effectiveness</div>
          <div className="page-sub">Close-rate lift per coaching theme · sample size · adoption across producers</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>Theme effectiveness · last 90 days</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 90px 90px 1fr" }}>
            <div>Theme</div><div className="tabular" style={{ textAlign: "right" }}>Reps</div><div className="tabular" style={{ textAlign: "right" }}>Calls</div><div>Close-rate lift</div>
          </div>
          {themes.map((t, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: "1.6fr 90px 90px 1fr" }}>
              <div style={{ fontWeight: 500 }}>{t.t}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{t.reps}</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{t.n}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, t.lift * 5)}%`, height: "100%", background: "var(--accent-money)" }}></div>
                </div>
                <span className="tabular" style={{ color: "var(--accent-money)", fontWeight: 600, fontSize: 12, minWidth: 52, textAlign: "right" }}>+{t.lift.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Routing rules modal — full editor backed by Supabase ─────────── */
function RoutingRulesModal({ onClose }) {
  const [rules, setRules] = React.useState([
    { id: "stub-1", source: "FB Lead Form · T65",         route_to: "Med Supp specialists", weight: 60,  active: true },
    { id: "stub-2", source: "Inbound < 30s",               route_to: "Tier ≥ Gold",          weight: 90,  active: true },
    { id: "stub-3", source: "Annuity",                      route_to: "Certified producer",   weight: 100, active: true },
    { id: "stub-4", source: "Spanish",                      route_to: "Bilingual round-robin", weight: 50, active: true },
  ]);
  const [editing, setEditing] = React.useState(null);

  React.useEffect(() => {
    if (!AppData.LIVE) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.from("routing_rules").select("*").order("weight", { ascending: false }).then(({ data }) => {
      if (data && data.length) setRules(data);
    });
  }, []);

  const upsert = async (rule) => {
    await AppData.mutate.routingRuleSave(rule);
    if (rule.id?.startsWith("stub-")) {
      // local-only save while not in LIVE mode
      setRules(rs => rs.map(r => r.id === rule.id ? rule : r));
    } else if (rule.id) {
      setRules(rs => rs.map(r => r.id === rule.id ? rule : r));
    } else {
      setRules(rs => [...rs, { ...rule, id: "tmp-" + Date.now() }]);
    }
    setEditing(null);
    window.toast && window.toast("Routing rule saved", "success");
  };
  const remove = async (id) => {
    if (!String(id).startsWith("stub-")) await AppData.mutate.routingRuleDelete(id);
    setRules(rs => rs.filter(r => r.id !== id));
  };

  return (
    <Shared.Modal title="Routing rules" width={680} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => setEditing({ source: "", route_to: "", weight: 50, active: true })}><Icons.Plus size={11}/> New rule</button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Higher weight wins ties. Inactive rules don't fire. Persisted to Supabase when signed in.</div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1.6fr 1.6fr 80px 80px 80px" }}>
          <div>Source / trigger</div><div>Route to</div><div className="tabular" style={{ textAlign: "right" }}>Weight</div><div>State</div><div></div>
        </div>
        {rules.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "1.6fr 1.6fr 80px 80px 80px" }}>
            <div style={{ fontWeight: 500 }}>{r.source}</div>
            <div style={{ color: "var(--text-secondary)" }}>{r.route_to}</div>
            <div className="tabular" style={{ textAlign: "right" }}>{r.weight}</div>
            <div>
              <span className={`chip ${r.active ? "chip-money" : ""}`}>{r.active ? "active" : "off"}</span>
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button className="icon-btn" onClick={() => setEditing(r)}><Icons.Settings size={11}/></button>
              <button className="icon-btn" onClick={() => remove(r.id)}><Icons.X size={11}/></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--bg-raised)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
          <Shared.Field label="Source / trigger"><input className="text-input" value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="FB Lead Form · T65"/></Shared.Field>
          <Shared.Field label="Route to"><input className="text-input" value={editing.route_to} onChange={(e) => setEditing({ ...editing, route_to: e.target.value })} placeholder="Med Supp specialists"/></Shared.Field>
          <Shared.Field label={`Weight · ${editing.weight}`}><input type="range" min={0} max={100} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: +e.target.value })}/></Shared.Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })}/> Active
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => upsert(editing)} disabled={!editing.source.trim() || !editing.route_to.trim()}><Icons.Check size={11}/> Save</button>
          </div>
        </div>
      )}
    </Shared.Modal>
  );
}

/* ─── Rep drill-down slideout ──────────────────────────────────────── */
function RepDrillSlideout({ rep, onClose }) {
  const myPipeline = AppData.PIPELINE.filter(p => p.owner === rep.id);
  const todayBooked = myPipeline.filter(p => p.stage === "Issued").reduce((a, p) => a + (p.ap || 0), 0);
  const sendCheckIn = () => {
    window.toast && window.toast(`Check-in sent to ${rep.name.split(" ")[0]}`, "success");
  };
  const callRep = () => {
    window.repflowCall && window.repflowCall("+15125550" + rep.id.slice(0, 3), rep.name);
  };
  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Shared.Avatar rep={rep} size={36}/>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--font-display)" }}>{rep.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                <Shared.TierChip tier={rep.tier} compact/>
                <span>· {rep.handle}</span>
                <span className={`dot dot-${rep.presence === "live" ? "live" : "idle"}`}></span>
                {rep.presence}
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>
        <div className="slideout-body">
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Shared.KpiCard label="MTD AP" prefix="$" value={rep.mtd.toLocaleString()}/>
            <Shared.KpiCard label="Today" prefix="$" value={rep.today.toLocaleString()}/>
            <Shared.KpiCard label="Dials" value={rep.dials}/>
            <Shared.KpiCard label="Streak" value={rep.streak + "d"} sub={rep.streak > 10 ? "🔥 club" : "—"}/>
          </div>

          <div className="divider"></div>
          <div className="field-l">Active deals · {myPipeline.length}</div>
          <div style={{ marginTop: 6, maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {myPipeline.length === 0 && <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>No active deals.</div>}
            {myPipeline.map(p => (
              <div key={p.id} style={{ padding: 8, background: "var(--bg-raised)", borderRadius: 4, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{p.lead}</strong>
                  <span className="tabular">{p.ap ? `$${p.ap.toLocaleString()}` : "—"}</span>
                </div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 2 }}>{p.product} · {p.stage} · {p.days}d</div>
              </div>
            ))}
          </div>

          <div className="divider"></div>
          <div className="field-l">Today's progress</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {todayBooked > 0 ? `Booked $${todayBooked.toLocaleString()} so far. Pace = ${rep.today > 1500 ? "ahead of avg" : "behind avg"}.` : "No bookings yet today — quick check-in?"}
          </div>
        </div>
        <div className="slideout-foot">
          <button className="btn" onClick={sendCheckIn}><Icons.MessageSquare size={12}/> Send check-in</button>
          <button className="btn"><Icons.Activity size={12}/> Coaching cards</button>
          <button className="btn btn-primary" onClick={callRep}><Icons.Phone size={12}/> Call now</button>
        </div>
      </aside>
    </div>
  );
}

window.PageTeam = PageTeam;
window.PageCoaching = PageCoaching;
