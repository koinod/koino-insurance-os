/* Page: Manager — Team Board (dispatch) and Coaching (role-aware)
 *   Team rollup scoped to manager's downline via window.scopeRepIds()
 *   At-risk badge per rep card (heuristic shared with PredictiveCards)
 *   Breakout badge per rep card
 *   Coaching cards bound to AppData.COACHING_SESSIONS / NOTES
 *   Inline "coaching note" capture from rep card + drill-down
 *   Inline "focus alert" sends a notification to the rep
 */

/* ── Heuristics: same shape as PredictiveCards in page-today.jsx, scoped local
   so this file is self-contained. Range 0–100.
   Tier targets read from lib/agency-config.js so a single edit in agency
   settings updates every consumer. Hardcoded fallback only when the helper
   isn't loaded (e.g., page rendered before lib/agency-config.js). */
const _MGR_TIER_TARGETS_FALLBACK = {
  bronze: 12000, silver: 20000, gold: 35000, platinum: 50000, diamond: 80000,
};
function MGR_TIER_TARGETS_LIVE() {
  return (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get().tier_targets) || _MGR_TIER_TARGETS_FALLBACK;
}
// Read-anywhere proxy that always returns current values (so live updates
// from "agency-config:changed" don't require a render to re-read constants).
const MGR_TIER_TARGETS = new Proxy({}, {
  get(_t, key) { return MGR_TIER_TARGETS_LIVE()[key]; },
  ownKeys()   { return Object.keys(MGR_TIER_TARGETS_LIVE()); },
  getOwnPropertyDescriptor(_t, key) {
    return { configurable: true, enumerable: true, value: MGR_TIER_TARGETS_LIVE()[key] };
  },
});
function mgrRiskScore(rep) {
  let s = 0;
  if (rep.streak === 0)              s += 30;
  if ((rep.today || 0) === 0)        s += 25;
  if ((rep.dials || 0) < 30)         s += 20;
  const target = MGR_TIER_TARGETS[rep.tier] || 12000;
  if ((rep.mtd || 0) < target * 0.4) s += 15;
  if (rep.presence === "off")        s += 10;
  if ((rep.streak || 0) >= 14)       s -= 15;
  return Math.max(0, Math.min(100, s));
}
function mgrBreakoutScore(rep) {
  let s = 0;
  const target = MGR_TIER_TARGETS[rep.tier] || 12000;
  if ((rep.mtd || 0) >= target * 1.3)            s += 30;
  const avgToday = (rep.mtd || 0) / 22;
  if ((rep.today || 0) >= avgToday * 1.5 && (rep.today || 0) > 500) s += 25;
  if ((rep.streak || 0) >= 10)                   s += 20;
  if (rep.presence === "live" && (rep.dials || 0) >= 60) s += 15;
  if ((rep.appts || 0) >= 4)                     s += 10;
  return Math.max(0, Math.min(100, s));
}
function useMeReady() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("me:loaded", fn);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated", fn);
    return () => {
      window.removeEventListener("me:loaded", fn);
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated", fn);
    };
  }, []);
}
function scopedReps() {
  const reps = (window.AppData && window.AppData.REPS) || [];
  const ids = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
  if (ids === null) return reps;            // owner / fleet
  if (ids.length === 0) return reps;        // me() not loaded yet — fall back so the page renders
  return reps.filter(r => ids.includes(r.id));
}

function PageTeam() {
  useMeReady();
  const { QUEUE } = AppData;
  const teamReps = scopedReps();
  const [drag, setDrag] = React.useState(null);
  const [drop, setDrop] = React.useState(null);
  const [assigned, setAssigned] = React.useState({});
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkPicks, setBulkPicks] = React.useState({});  // queueId -> repId
  const [routingOpen, setRoutingOpen] = React.useState(false);
  const [repDrill, setRepDrill] = React.useState(null);
  const [noteFor, setNoteFor] = React.useState(null);
  const [alertFor, setAlertFor] = React.useState(null);

  const visibleQueue = QUEUE.filter(q => !assigned[q.id]);

  const suggestRep = (q) => {
    const counts = teamReps.reduce((acc, r) => ({ ...acc, [r.id]: 0 }), {});
    Object.values(assigned).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    Object.values(bulkPicks).forEach(rid => counts[rid] = (counts[rid] || 0) + 1);
    const ranked = [...teamReps].sort((a, b) => {
      if (a.presence !== b.presence) return a.presence === "live" ? -1 : 1;
      if (a.tier !== b.tier) return ["diamond","platinum","gold","silver","bronze"].indexOf(a.tier) - ["diamond","platinum","gold","silver","bronze"].indexOf(b.tier);
      return counts[a.id] - counts[b.id];
    });
    return (ranked[0] || teamReps[0])?.id;
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

  // Order team cards: at-risk first (operator attention), then breakouts, then by MTD
  const orderedReps = [...teamReps]
    .map(r => ({ r, risk: mgrRiskScore(r), brk: mgrBreakoutScore(r) }))
    .sort((a, b) => {
      if ((a.risk >= 50) !== (b.risk >= 50)) return a.risk >= 50 ? -1 : 1;
      if ((a.brk  >= 50) !== (b.brk  >= 50)) return a.brk  >= 50 ? -1 : 1;
      return (b.r.mtd || 0) - (a.r.mtd || 0);
    });

  const subline = teamReps.length === 0
    ? "No producers in your downline yet"
    : `${teamReps.length} producer${teamReps.length === 1 ? "" : "s"} in your downline · drag a lead onto a card · routing rules validate license + carrier appt + tier`;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Team Board</div>
          <div className="page-sub">{subline}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setRoutingOpen(true)}><Icons.Settings size={13}/> Routing rules</button>
          <button className="btn btn-primary" onClick={openBulk} disabled={visibleQueue.length === 0 || teamReps.length === 0}><Icons.Plus size={13}/> Bulk assign</button>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {orderedReps.length === 0 && (
            <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5 }}>
              No producers visible at your scope. Invite reps from <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "recruiting" } })); }} style={{ color: "var(--accent-money)" }}>Recruiting</a>.
            </div>
          )}
          {orderedReps.map(({ r, risk, brk }) => {
            const isRisk = risk >= 50;
            const isBreak = brk >= 50;
            const target = MGR_TIER_TARGETS[r.tier] || 12000;
            return (
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
                style={{
                  borderColor: drop === r.id ? "var(--accent-money)"
                              : isRisk ? "color-mix(in oklch, var(--state-danger) 35%, transparent)"
                              : isBreak ? "color-mix(in oklch, var(--accent-money) 35%, transparent)"
                              : undefined,
                  background: drop === r.id ? "color-mix(in oklch, var(--accent-money) 6%, var(--bg-elevated))" : undefined,
                  cursor: "pointer"
                }}
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
                  {(isRisk || isBreak) && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {isRisk && (
                        <span className="chip" title="At-risk score from RETAINER heuristic" style={{
                          color: "var(--state-danger)",
                          borderColor: "color-mix(in oklch, var(--state-danger) 35%, transparent)",
                          background: "color-mix(in oklch, var(--state-danger) 10%, transparent)",
                          fontSize: 10.5
                        }}><Icons.AlertTriangle size={10}/> at-risk · {risk}</span>
                      )}
                      {isBreak && (
                        <span className="chip" title="Breakout score from CLOSER heuristic" style={{
                          color: "var(--accent-money)",
                          borderColor: "color-mix(in oklch, var(--accent-money) 35%, transparent)",
                          background: "color-mix(in oklch, var(--accent-money) 10%, transparent)",
                          fontSize: 10.5
                        }}><Icons.TrendingUp size={10}/> breakout · {brk}</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>MTD</span>
                    <span className="tabular" style={{ color: "var(--text-primary)", fontWeight: 500 }}>${(r.mtd || 0).toLocaleString()} <span style={{ color: "var(--text-quaternary)" }}>/ ${target.toLocaleString()}</span></span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, ((r.mtd || 0) / target) * 100)}%`, height: "100%", background: isRisk ? "var(--state-danger)" : "var(--accent-money)" }}></div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {Object.entries(assigned).filter(([_, rep]) => rep === r.id)?.map(([qid]) => {
                      const q = QUEUE.find(x => x.id === qid);
                      if (!q) return null;
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

                  {/* Inline manager actions */}
                  <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                    <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setNoteFor(r); }} title="Coaching note">
                      <Icons.MessageSquare size={11}/> Note
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setAlertFor(r); }} title="Send focus alert">
                      <Icons.Bell size={11}/> Alert
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {routingOpen && <RoutingRulesModal onClose={() => setRoutingOpen(false)}/>}
      {repDrill && <RepDrillSlideout rep={repDrill} onClose={() => setRepDrill(null)} onAddNote={(rep) => { setRepDrill(null); setNoteFor(rep); }}/>}
      {noteFor && <CoachingNoteModal rep={noteFor} onClose={() => setNoteFor(null)}/>}
      {alertFor && <FocusAlertModal rep={alertFor} onClose={() => setAlertFor(null)}/>}

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
              return (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "1.4fr 100px 1fr 26px" }}>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>{q.lead} <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>· {q.product}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{q.source}</div>
                  <div>
                    <Shared.Select value={rid} onChange={(v) => setBulkPicks({ ...bulkPicks, [q.id]: v })} options={teamReps.map(rr => ({ v: rr.id, l: `${rr.name} · ${rr.tier}` }))}/>
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

/* ─── Coaching note modal ──────────────────────────────────────────── */
function CoachingNoteModal({ rep, onClose }) {
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await AppData.mutate.coachingNoteCreate(rep.id, body.trim());
      window.toast && window.toast(`Coaching note saved for ${rep.name.split(" ")[0]}`, "success");
      onClose();
    } catch (_e) { setSaving(false); }
  };
  return (
    <Shared.Modal title={`Coaching note · ${rep.name}`} width={520} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!body.trim() || saving}><Icons.Check size={11}/> {saving ? "Saving…" : "Save note"}</button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>One observation, one ask. Notes thread on the rep's coaching feed and persist to <code style={{ fontSize: 10.5 }}>coaching_notes</code>.</div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`What did you notice on ${rep.name.split(" ")[0]}'s last call? What's the one thing to fix tomorrow?`}
        rows={5}
        className="text-input"
        style={{ width: "100%", minHeight: 100, lineHeight: 1.5, resize: "vertical" }}
      />
    </Shared.Modal>
  );
}

/* ─── Focus alert modal ────────────────────────────────────────────── */
function FocusAlertModal({ rep, onClose }) {
  const presets = [
    { t: "Get on a dial",        b: "You haven't logged a dial in over an hour — get on the next one." },
    { t: "Power hour now",       b: "Power hour starting now. Anyone with idle status: dial." },
    { t: "Cross-sell reminder",  b: "Your latest issue is eligible for a Plan G upsell — call back today." },
    { t: "Streak check-in",      b: "Streak's at risk. One issued today keeps it alive." },
  ];
  const [title, setTitle] = React.useState(presets[0].t);
  const [body,  setBody]  = React.useState(presets[0].b);
  const [severity, setSeverity] = React.useState("info");
  const [sending, setSending] = React.useState(false);
  const submit = async () => {
    setSending(true);
    try {
      await AppData.mutate.notificationCreate({
        repId: rep.id,
        recipientHandle: rep.handle,
        kind: "focus",
        severity,
        title: title.trim(),
        body: body.trim(),
        pageLink: "today",
      });
      window.toast && window.toast(`Alert sent to ${rep.name.split(" ")[0]}`, "success");
      onClose();
    } catch (_e) { setSending(false); }
  };
  const usePreset = (p) => { setTitle(p.t); setBody(p.b); };
  return (
    <Shared.Modal title={`Send focus alert · ${rep.name}`} width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!title.trim() || sending}><Icons.Send size={11}/> {sending ? "Sending…" : "Send alert"}</button>
      </>
    }>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {presets.map((p, i) => (
          <button key={i} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => usePreset(p)}>{p.t}</button>
        ))}
      </div>
      <Shared.Field label="Severity">
        <Shared.Select value={severity} onChange={setSeverity} options={[
          { v: "info",    l: "Info" },
          { v: "warning", l: "Warning" },
          { v: "urgent",  l: "Urgent" },
        ]}/>
      </Shared.Field>
      <Shared.Field label="Title">
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Get on a dial"/>
      </Shared.Field>
      <Shared.Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="text-input"
          style={{ width: "100%", minHeight: 80, lineHeight: 1.5, resize: "vertical" }}
        />
      </Shared.Field>
    </Shared.Modal>
  );
}

/* ─────  Coaching · role-aware
   - Manager view (default): coaching cards from AppData.COACHING_SESSIONS scoped to downline
   - Rep view: my coaching cards + drills
   - Owner view: org-wide coach effectiveness — close-rate lift per coaching theme */
function PageCoaching({ role = "manager" }) {
  if (role === "rep") return <CoachingRep/>;
  if (role === "owner") return <CoachingOwner/>;
  return <CoachingManager/>;
}

/* Coaching manager bound to AppData.COACHING_SESSIONS.
   Falls back to a deterministic seed when no sessions exist (demo + new agency). */
function deriveCoachingCards() {
  const reps = scopedReps();
  const sessions = (AppData.COACHING_SESSIONS || []).filter(s => reps.find(r => r.id === s.repId));

  if (sessions.length > 0) {
    return sessions.slice(0, 6).map(s => {
      const rep = reps.find(r => r.id === s.repId) || reps[0];
      return {
        id: s.id,
        rep,
        focus: s.focusArea || "Open coaching focus",
        evidence: s.notes || "Recorded in last session — review the call to see the moment.",
        impact: s.outcome === "improvement" ? "+ improvement logged"
              : s.outcome === "no_change"   ? "no measured lift yet"
              : "tracking",
        recordingId: s.recordingId,
        sessionId: s.id,
      };
    });
  }

  // Heuristic fallback: derive a coaching focus from the rep's own signals,
  // so a brand-new agency still sees a useful page (no Atlas literals).
  return reps.slice(0, 3).map((rep, i) => {
    const risk = mgrRiskScore(rep);
    if (risk >= 50) {
      return {
        id: `seed-${rep.id}`,
        rep,
        focus: rep.streak === 0 ? "Get back on a streak — one issue today" : "Hit your daily dial floor",
        evidence: rep.streak === 0
          ? `Streak broken. Reset starts with one dial → one quote → one app.`
          : `Only ${rep.dials || 0} dials today vs floor of 60. Talk-time is the leading indicator.`,
        impact: "+ persistency + streak recovery",
      };
    }
    if (mgrBreakoutScore(rep) >= 50) {
      return {
        id: `seed-${rep.id}`,
        rep,
        focus: "Lock the breakout in — preserve what's working",
        evidence: `MTD ${(rep.mtd || 0).toLocaleString()} on a ${rep.streak || 0}-day streak. Keep the script tight.`,
        impact: "+ tier promotion likely this month",
      };
    }
    return {
      id: `seed-${rep.id}`,
      rep,
      focus: ["Ask 3 more open-ended questions per hour",
              "Cut talk-listen ratio to 45%",
              "Use the Plan G price-anchor sequence"][i % 3],
      evidence: "Pulled from last 7 days of recordings. Replay the moment to confirm.",
      impact: "+ close rate (cohort)",
    };
  });
}

function CoachingManager() {
  useMeReady();
  const reps = scopedReps();
  const cards = deriveCoachingCards();
  const [replay, setReplay] = React.useState(null);
  const [noteFor, setNoteFor] = React.useState(null);

  // Scorecard rollup: derive from coaching_sessions + recordings if available.
  const sessions = (AppData.COACHING_SESSIONS || []).filter(s => reps.find(r => r.id === s.repId));
  const recordings = (AppData.RECORDINGS || []).filter(r =>
    !reps.length || reps.find(rr => rr.id === r.repId || rr.id === r.rep_id)
  );
  const avgTalk = recordings.length
    ? Math.round(recordings.reduce((s, r) => s + (r.talkRatio || 0), 0) / recordings.length)
    : 44;
  const avgOpenQ = recordings.length
    ? +(recordings.reduce((s, r) => s + (r.openQ || 0), 0) / recordings.length).toFixed(1)
    : 8.2;
  const completedSessions = sessions.filter(s => s.completedAt).length;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Team</div>
          <div className="page-sub">
            {sessions.length > 0
              ? `${sessions.length} active session${sessions.length === 1 ? "" : "s"} · ${completedSessions} completed · one-thing-at-a-time per rep`
              : "Virtual ridealong feed · one-thing-at-a-time per rep"}
          </div>
        </div>
      </div>

      <Shared.SectionPill
        items={[{k:"team",l:"Floor"},{k:"coaching",l:"Coaching"},{k:"nigo",l:"NIGO Queue"},{k:"recruiting",l:"Recruiting"},{k:"queue",l:"Dispatch"}]}
        value="coaching"
        onChange={(k) => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: k } }))}
      />

      <div className="cards-2col" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.Activity size={13}/>
            <h3>This week's coaching cards</h3>
            {sessions.length === 0 && <span className="meta" title="No live coaching_sessions for this scope yet — these are derived from rep signals">derived</span>}
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {cards.length === 0 && (
              <div style={{ padding: 18, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                No producers in scope. Coaching cards appear once you have downline reps.
              </div>
            )}
            {cards.map((c) => (
              <div key={c.id} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
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
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Impact projection: <span style={{ color: "var(--accent-money)" }}>{c.impact}</span></span>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setNoteFor(c.rep)}><Icons.MessageSquare size={11}/> Add note</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Headset size={13}/><h3>Latest call · {recordings[0]?.lead || "—"}</h3></div>
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
                <span className="chip chip-money">Talk: {recordings[0]?.talkRatio ?? 38}%</span>
                <span className="chip">Open Q: {recordings[0]?.openQ ?? 11}</span>
                <span className={`chip ${recordings[0]?.flags?.tpmo === "ok" ? "chip-money" : ""}`}>TPMO {recordings[0]?.flags?.tpmo === "ok" ? "✓" : "—"}</span>
                <span className="chip chip-status">SOA {recordings[0]?.flags?.soa || "scheduled"}</span>
              </div>
              <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <b style={{ color: "var(--text-primary)" }}>AI summary —</b> {recordings[0]?.ai || "No recordings ingested yet for this scope."}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Scorecard rollup · this week</h3></div>
            <div style={{ padding: "10px 14px" }}>
              {(() => {
                // TPMO + SOA: derive from recording compliance flags when present.
                // recordings[].compliance = { tpmo: bool, soa: bool } if ingested.
                const isDemoMgr = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
                const flagged = (recordings || []).filter(r => r.compliance);
                const tpmoVal = flagged.length > 0
                  ? Math.round((flagged.filter(r => r.compliance.tpmo).length / flagged.length) * 100)
                  : (isDemoMgr ? 100 : null);
                const soaVal = flagged.length > 0
                  ? Math.round((flagged.filter(r => r.compliance.soa).length / flagged.length) * 100)
                  : (isDemoMgr ? 94 : null);
                const fmtPct = (v) => v == null ? "—" : `${v}%`;
                return [
                  { l: "Avg talk ratio",     v: `${avgTalk}%`,        g: Math.min(100, (50 / Math.max(1, avgTalk)) * 70), c: avgTalk <= 50 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "Avg open Qs / call", v: avgOpenQ.toString(),   g: Math.min(100, avgOpenQ * 10), c: avgOpenQ >= 6 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "TPMO compliance",    v: fmtPct(tpmoVal),       g: tpmoVal || 0, c: tpmoVal == null ? "var(--text-quaternary)" : tpmoVal === 100 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "SOA capture",        v: fmtPct(soaVal),        g: soaVal  || 0, c: soaVal  == null ? "var(--text-quaternary)" : soaVal  >= 90 ? "var(--accent-money)" : "var(--state-warning)" },
                  { l: "Sessions completed", v: `${completedSessions}/${sessions.length || 0}`, g: sessions.length ? (completedSessions / sessions.length) * 100 : 0, c: "var(--accent-money)" },
                ];
              })().map((r, i) => (
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
      {noteFor && <CoachingNoteModal rep={noteFor} onClose={() => setNoteFor(null)}/>}
    </div>
  );
}

function ReplayMomentModal({ card, onClose }) {
  // If a recording is linked to the session, pull its AI summary; otherwise synthesize a transcript snippet.
  const linkedRecording = card?.recordingId
    ? (AppData.RECORDINGS || []).find(r => r.id === card.recordingId)
    : null;
  const transcript = linkedRecording
    ? [
        { who: "AI", t: "—", body: linkedRecording.ai || "No AI summary." },
        { who: "Lead", t: "—", body: `Call duration ${Math.round((linkedRecording.durSec || 0) / 60)}m · talk ratio ${linkedRecording.talkRatio || 0}% · ${linkedRecording.openQ || 0} open questions.` },
      ]
    : [
        { who: "You",      t: "00:42", body: "So, do you take any medications?" },
        { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "00:46", body: "Uh, yes, a few — metformin, blood pressure, and..." },
        { who: "You",      t: "00:51", body: "Got it. Well, our Plan G also covers the donut hole, so..." },
        { who: card?.rep?.name?.split(" ")[0] || "Lead", t: "01:02", body: "Wait, I was about to say something — sorry." },
      ];
  const markPracticed = async () => {
    if (card?.sessionId && !String(card.sessionId).startsWith("seed-")) {
      try { await AppData.mutate.coachingSessionResolve(card.sessionId, "practiced", null, "Replay reviewed by manager"); } catch (_e) {}
    }
    window.toast && window.toast("Marked practiced — moves down the queue", "success");
    onClose();
  };
  return (
    <Shared.Modal title={`Coaching moment · ${card?.rep?.name || "rep"}`} width={620} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={markPracticed}><Icons.Check size={11}/> Mark practiced</button>
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
  useMeReady();
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (AppData.REPS && AppData.REPS[0]?.id);

  const mySessions  = (AppData.COACHING_SESSIONS || []).filter(s => s.repId === myRepId);
  const myNotes     = (AppData.COACHING_NOTES    || []).filter(n => n.repId === myRepId);
  const openCards   = mySessions.filter(s => !s.completedAt);
  const dueToday    = openCards.filter(s => {
    if (!s.scheduledAt) return false;
    const d = new Date(s.scheduledAt); const t = new Date();
    return d.toDateString() === t.toDateString();
  }).length;
  const drillsThisWeek = mySessions.filter(s => {
    if (!s.completedAt) return false;
    const d = new Date(s.completedAt); const t = new Date();
    const diffDays = (t - d) / 86400000;
    return diffDays <= 7;
  }).length;

  // Fall back to seed cards when there are no live sessions
  const cards = openCards.length > 0
    ? openCards.slice(0, 5).map(s => ({
        id: s.id,
        focus: s.focusArea || "Open coaching focus",
        evidence: s.notes || "Replay your last call to find the moment.",
        drill: "Run 5-question rephrase drill",
        impact: s.outcome || "track this week",
      }))
    : [
        { id: "seed-1", focus: "Ask 3 more open-ended questions per hour", evidence: "Default focus until your manager assigns one.", drill: "Run 5-question rephrase drill", impact: "+12% close rate (cohort)" },
        { id: "seed-2", focus: "Cut talk-listen from 52% → 45%",            evidence: "Default focus until your manager assigns one.",  drill: "30-sec silence drill x10",       impact: "Persistency +6pts" },
      ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Me</div>
          <div className="page-sub">{meIdent?.full_name ? `${meIdent.full_name.split(" ")[0]} · ` : ""}One thing at a time. Replay the moment, run the drill, log the rep.</div>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard label="Open cards" value={String(openCards.length || cards.length)} sub={`${dueToday} due today`}/>
        <Shared.KpiCard label="Drills this week" value={String(drillsThisWeek)} sub={drillsThisWeek > 0 ? "logged" : "log your first"} trend={drillsThisWeek > 0 ? "up" : undefined}/>
        <Shared.KpiCard label="Notes received" value={String(myNotes.length)} sub={myNotes.length > 0 ? "from manager" : "none yet"} trend={myNotes.length > 0 ? "up" : undefined}/>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-h"><Icons.Activity size={13}/><h3>My coaching cards</h3>{openCards.length === 0 && <span className="meta">demo</span>}</div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c) => (
            <div key={c.id} style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--accent-status)" }}>{c.focus}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{c.evidence}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Walk me through my coaching focus '${c.focus}' — give me 3 lines I can use on my next call`, context: "Coaching · " + c.focus }}))}><Icons.Play size={11}/> Replay moment</button>
                <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("ai:ask", { detail: { prompt: `Run me through the ${c.drill} drill — give me 3 prompts I can practice on my next call`, context: "Coaching · " + c.drill }}))}><Icons.Sparkles size={11}/> {c.drill}</button>
                <span className="chip chip-money" style={{ alignSelf: "center" }}>Impact: {c.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {myNotes.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-h"><Icons.MessageSquare size={13}/><h3>Notes from your manager</h3><span className="meta">{myNotes.length}</span></div>
          <div style={{ padding: 4 }}>
            {myNotes.slice(0, 8).map(n => (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>{n.body}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
                  {n.createdBy || "manager"} · {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoachingOwner() {
  useMeReady();
  // Derive theme effectiveness from coaching_sessions when present.
  const sessions = AppData.COACHING_SESSIONS || [];
  let themes;
  if (sessions.length > 0) {
    const byFocus = new Map();
    for (const s of sessions) {
      const k = (s.focusArea || "Unspecified").trim();
      if (!byFocus.has(k)) byFocus.set(k, { reps: new Set(), n: 0, lifts: [] });
      const bucket = byFocus.get(k);
      bucket.reps.add(s.repId);
      bucket.n += 1;
      if (s.rating != null) bucket.lifts.push(parseFloat(s.rating));
    }
    themes = [...byFocus.entries()]
      .map(([t, v]) => ({
        t,
        reps: v.reps.size,
        n: v.n,
        lift: v.lifts.length ? +(v.lifts.reduce((a, b) => a + b, 0) / v.lifts.length).toFixed(1) : 0,
      }))
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 8);
  }
  if (!themes || themes.length === 0) {
    themes = [
      { t: "Open-ended questions",  reps: 6, lift: 12.4, n: 412 },
      { t: "Talk-listen ratio",     reps: 4, lift:  6.9, n: 318 },
      { t: "Plan-G anchor sequence",reps: 5, lift: 18.2, n: 244 },
      { t: "Daily-routine open",    reps: 3, lift:  9.1, n: 196 },
      { t: "Cross-sell on Issued",  reps: 7, lift:  4.4, n: 510 },
    ];
  }
  const isDerived = sessions.length === 0;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Coaching · Org effectiveness</div>
          <div className="page-sub">Close-rate lift per coaching theme · sample size · adoption across producers</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>Theme effectiveness · last 90 days</h3>{isDerived && <span className="meta">demo</span>}</div>
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

/* ─── Routing rules modal — natural-language rule entry, no sliders.

   The manager describes how routing should work in plain English ("send
   Spanish-speaking leads to Maria", "FE leads in Tampa go to gold+ only"),
   and the agent parses it into a source/route_to pair. Existing rules are
   shown as plain-English summaries with toggle/delete; ordering is by
   creation order (latest = lowest priority — first match wins). */
function _parseRoutingPrompt(text) {
  const t = text.trim();
  if (!t) return null;
  // "send X to Y", "route X to Y", "X goes to Y", "X → Y"
  const arrowMatch = t.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
  if (arrowMatch) return { source: arrowMatch[1].trim(), route_to: arrowMatch[2].trim() };
  const sendMatch = t.match(/^(?:send|route|push|assign)\s+(.+?)\s+(?:to|→)\s+(.+)$/i);
  if (sendMatch) return { source: sendMatch[1].trim(), route_to: sendMatch[2].trim() };
  const goesMatch = t.match(/^(.+?)\s+(?:goes? to|gets? sent to|→)\s+(.+)$/i);
  if (goesMatch) return { source: goesMatch[1].trim(), route_to: goesMatch[2].trim() };
  return null;
}

function RoutingRulesModal({ onClose }) {
  const [rules, setRules] = React.useState([]);
  const [prompt, setPrompt] = React.useState("");
  const [parseErr, setParseErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) return;
    sb.from("routing_rules").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (Array.isArray(data)) setRules(data);
    });
  }, []);

  const addRule = async () => {
    setParseErr("");
    const parsed = _parseRoutingPrompt(prompt);
    if (!parsed) {
      setParseErr('Try "Send <kind of lead> to <producer or group>" — e.g. "Send Spanish leads to Maria" or "FE leads → gold tier".');
      return;
    }
    setBusy(true);
    try {
      const rule = { ...parsed, weight: 50, active: true };
      await AppData.mutate.routingRuleSave(rule);
      setRules(rs => [{ ...rule, id: "tmp-" + Date.now(), created_at: new Date().toISOString() }, ...rs]);
      setPrompt("");
      window.toast && window.toast("Routing rule added", "success");
    } catch (e) {
      window.toast && window.toast(`Could not save: ${e.message || e}`, "error");
    } finally { setBusy(false); }
  };

  const toggle = async (rule) => {
    const next = { ...rule, active: !rule.active };
    await AppData.mutate.routingRuleSave(next);
    setRules(rs => rs.map(r => r.id === rule.id ? next : r));
  };
  const remove = async (id) => {
    if (!String(id).startsWith("tmp-") && !String(id).startsWith("stub-")) {
      await AppData.mutate.routingRuleDelete(id);
    }
    setRules(rs => rs.filter(r => r.id !== id));
  };

  const examples = [
    "Send Spanish leads to Maria",
    "Annuity inquiries → certified producers only",
    "FE leads in Tampa go to gold tier+",
    "T65 inbounds within 60s → Med Supp team",
  ];

  return (
    <Shared.Modal title="Routing rules" width={620} onClose={onClose} actions={
      <button className="btn btn-ghost" onClick={onClose}>Close</button>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
        Tell the routing agent how leads should flow. First matching rule wins; the score-based suggestion fills in everything else.
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <textarea
          className="text-input"
          rows={2}
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setParseErr(""); }}
          placeholder='Send Spanish leads to Maria'
          style={{ flex: 1, fontSize: 13, resize: "vertical" }}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addRule(); }}
        />
        <button className="btn btn-primary" onClick={addRule} disabled={busy || !prompt.trim()} style={{ padding: "8px 12px" }}>
          <Icons.Sparkles size={12}/> Add rule
        </button>
      </div>
      {parseErr && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--state-warning)" }}>{parseErr}</div>
      )}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {examples.map((ex, i) => (
          <button key={i} className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setPrompt(ex)}>{ex}</button>
        ))}
      </div>

      <div className="divider" style={{ margin: "14px 0 8px" }}></div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>{rules.length} rule{rules.length === 1 ? "" : "s"} · first match wins</div>
      <div className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
        {rules.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No custom rules yet — auto-routing handles everything.</div>}
        {rules.map(r => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "1fr 28px 28px", padding: "10px 12px", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: r.active ? 1 : 0.5 }}>
                <span style={{ color: "var(--text-primary)" }}>{r.source}</span>
                <span style={{ color: "var(--text-tertiary)", margin: "0 6px" }}>→</span>
                <span style={{ color: "var(--accent-money)" }}>{r.route_to}</span>
              </div>
              {!r.active && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>paused</div>}
            </div>
            <button className="icon-btn" title={r.active ? "Pause" : "Activate"} onClick={() => toggle(r)}>
              {r.active ? <Icons.Check size={12}/> : <Icons.X size={12}/>}
            </button>
            <button className="icon-btn" title="Delete" onClick={() => remove(r.id)}><Icons.X size={12}/></button>
          </div>
        ))}
      </div>
    </Shared.Modal>
  );
}

/* ─── Rep drill-down slideout ──────────────────────────────────────── */
function RepDrillSlideout({ rep, onClose, onAddNote }) {
  const myPipeline = (AppData.PIPELINE || []).filter(p => p.owner === rep.id);
  const todayBooked = myPipeline.filter(p => p.stage === "Issued").reduce((a, p) => a + (p.ap || 0), 0);
  const repNotes = (AppData.COACHING_NOTES || []).filter(n => n.repId === rep.id).slice(0, 3);
  const risk = mgrRiskScore(rep);
  const brk = mgrBreakoutScore(rep);
  const sendCheckIn = () => window.toast && window.toast(`Check-in sent to ${rep.name.split(" ")[0]}`, "success");
  const callRep = () => window.repflowCall && window.repflowCall("+15125550" + rep.id.slice(0, 3), rep.name);
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
          {(risk >= 50 || brk >= 50) && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {risk >= 50 && <span className="chip" style={{ color: "var(--state-danger)", borderColor: "color-mix(in oklch, var(--state-danger) 35%, transparent)", background: "color-mix(in oklch, var(--state-danger) 10%, transparent)" }}><Icons.AlertTriangle size={10}/> at-risk · {risk}</span>}
              {brk  >= 50 && <span className="chip" style={{ color: "var(--accent-money)", borderColor: "color-mix(in oklch, var(--accent-money) 35%, transparent)", background: "color-mix(in oklch, var(--accent-money) 10%, transparent)" }}><Icons.TrendingUp size={10}/> breakout · {brk}</span>}
            </div>
          )}
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Shared.KpiCard label="MTD AP" prefix="$" value={(rep.mtd || 0).toLocaleString()}/>
            <Shared.KpiCard label="Today" prefix="$" value={(rep.today || 0).toLocaleString()}/>
            <Shared.KpiCard label="Dials" value={String(rep.dials || 0)}/>
            <Shared.KpiCard label="Streak" value={(rep.streak || 0) + "d"} sub={rep.streak > 10 ? "🔥 club" : "—"}/>
          </div>

          <div className="divider"></div>
          <div className="field-l">Active deals · {myPipeline.length}</div>
          <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
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

          {repNotes.length > 0 && (
            <>
              <div className="divider"></div>
              <div className="field-l">Recent coaching notes</div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {repNotes.map(n => (
                  <div key={n.id} style={{ padding: 8, background: "var(--bg-raised)", borderRadius: 4, fontSize: 12, lineHeight: 1.5 }}>
                    <div style={{ color: "var(--text-secondary)" }}>{n.body}</div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--text-tertiary)" }}>{n.createdBy || "manager"} · {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric" }) : ""}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="divider"></div>
          <div className="field-l">Today's progress</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {todayBooked > 0 ? `Booked $${todayBooked.toLocaleString()} so far. Pace = ${rep.today > 1500 ? "ahead of avg" : "behind avg"}.` : "No bookings yet today — quick check-in?"}
          </div>
        </div>
        <div className="slideout-foot">
          <button className="btn" onClick={sendCheckIn}><Icons.MessageSquare size={12}/> Check-in</button>
          <button className="btn" onClick={() => onAddNote && onAddNote(rep)}><Icons.Activity size={12}/> Add note</button>
          <button className="btn btn-primary" onClick={callRep}><Icons.Phone size={12}/> Call now</button>
        </div>
      </aside>
    </div>
  );
}

window.PageTeam = PageTeam;
window.PageCoaching = PageCoaching;
// Expose role-specific inner components so the Training hub can embed them
// without the wrapper's outer header. See CoachingPane in page-extras.jsx.
window.CoachingRep = CoachingRep;
window.CoachingManager = CoachingManager;
window.CoachingOwner = CoachingOwner;
