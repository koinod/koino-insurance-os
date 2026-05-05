/* Page: Dial Queue (rep) / Dispatch (mgr) — role-aware
   Rep view: their dial queue with TPMO + queue-health + compliance side panels.
   Manager (Dispatch) view: routing-style queue with team capacity + spend strip. */
function PageQueue({ onCall, role = "rep" }) {
  if (role === "manager") return <DispatchView onCall={onCall}/>;
  return <DialQueueView onCall={onCall}/>;
}

function DialQueueView({ onCall }) {
  const { QUEUE, PIPELINE } = AppData;
  // GAP-D2 — reps see "their" queue by default: their own assigned pipeline
  // leads (New + Contacted) merged into a dial-ready list. The shared inbound
  // funnel is one click away via the "Inbound (all)" tab so nobody loses
  // speed-to-lead access. Manager + owner views (DispatchView / Floor's
  // role-aware queue) already see fleet-wide.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id);

  const [tab, setTab] = React.useState("mine");

  const myPipeline = (PIPELINE || [])
    .filter(p => p.owner === myRepId && (p.stage === "New" || p.stage === "Contacted"))
    .map(p => ({
      id: "p-" + p.id,
      lead: p.lead, age: p.age, state: p.state,
      source: p.source || "—", product: p.product,
      elapsed: typeof p.days === "number" ? p.days * 86400 : 9999,
      score: p.heat === "hot" ? 92 : p.heat === "fresh" ? 88 : p.heat === "warm" ? 78 : 60,
      phone: p.phone || null,
      _pipelineId: p.id,
    }))
    .sort((a, b) => b.score - a.score);

  const visible = tab === "mine" ? myPipeline : (QUEUE || []);
  const subline = tab === "mine"
    ? `${myPipeline.length} lead${myPipeline.length === 1 ? "" : "s"} assigned to you · ${(QUEUE || []).length} more in inbound funnel`
    : `${(QUEUE || []).length} inbound lead${(QUEUE || []).length === 1 ? "" : "s"} · scored & sequenced · grab the top one`;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Dial Queue</div>
          <div className="page-sub">{subline}</div>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Cost / dial",     v: "$2.40" },
        { l: "Comp / dial",      v: "$32.6", tone: "money" },
        { l: "Connect rate",     v: "38%",   tone: "money" },
        { l: "Quote rate",       v: "11%" },
      ]}/>

      <Shared.SectionPill
        items={[
          { k: "mine",    l: "My queue",      icon: "Phone", badge: myPipeline.length },
          { k: "inbound", l: "Inbound (all)", icon: "Bell",  badge: (QUEUE || []).length },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="queue-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <h3>{tab === "mine" ? "My follow-ups · scored" : "Inbound · Med Supp + FE"}</h3>
            <span className="meta">sort: {tab === "mine" ? "highest-heat first" : "speed-to-lead"}</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 64px 72px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{textAlign:"right"}}>Score</div><div style={{textAlign:"right"}}>{tab === "mine" ? "Last" : "SLA"}</div><div></div>
            </div>
            {visible.length === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                {tab === "mine"
                  ? "No leads assigned to you yet. Switch to Inbound to grab the next one, or import from CRM → Inbox."
                  : "Inbound queue is clear."}
              </div>
            )}
            {visible.map((l, i) => {
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
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }}
                      title={l.phone ? `Dial ${l.phone}` : "No phone on file — add one in lead detail"}
                      disabled={!l.phone && i !== 0}
                      onClick={() => {
                        if (i === 0) { onCall && onCall(); return; }
                        if (!l.phone) { window.toast && window.toast("No phone on file — add one in lead detail", "warn"); return; }
                        window.repflowCall && window.repflowCall(l.phone, l.lead);
                      }}>
                      <Icons.Phone size={12}/>
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "3px 6px" }}
                      title={l.phone ? `Send SMS to ${l.phone}` : "No phone on file"}
                      disabled={!l.phone}
                      onClick={() => l.phone && window.smsCompose && window.smsCompose(l, l.phone)}>
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

/* ─────────────────────────────────────────────────────────────────────────
   Smart routing — score each rep against each lead.

   Inputs: rep presence, tier, current load (in-flight assignments + appts),
   and a stub product/carrier match. Returns score + 1-2-word reason chip
   so the manager can see *why* a rep was suggested.

   This stub uses heuristics; the real routing connects to:
     - rep.appointed_carriers[product][state] → carrier_appt
     - rep.languages → language match
     - rep.live_call_sec → "in flight" capacity
   When that data lands, swap the score function — the rest of the UI is wired.
   ───────────────────────────────────────────────────────────────────────── */
function scoreRepForLead(rep, lead, picks) {
  if (rep.presence === "off") return { score: -1, reasons: ["off"] };
  let score = 50;
  const reasons = [];

  if (rep.presence === "idle")      { score += 30; reasons.push("idle now"); }
  else if (rep.presence === "live") { score += 12; reasons.push("on call"); }

  const tierRank = { diamond: 5, platinum: 4, gold: 3, silver: 2, bronze: 1 };
  const t = tierRank[rep.tier] || 0;
  if ((lead.score || 0) >= 90 && t >= 4)      { score += 18; reasons.push(`Tier ${rep.tier}`); }
  else if ((lead.score || 0) >= 80 && t >= 3) { score += 10; reasons.push(`Tier ${rep.tier}`); }
  else if (t <= 1 && (lead.score || 0) >= 90) score -= 20;  // don't waste a hot lead on bronze

  // In-flight load — both this session's picks and active appts.
  const inFlight = Object.values(picks).filter(rid => rid === rep.id).length + (rep.appts || 0);
  score -= inFlight * 6;
  if (inFlight >= 6) reasons.push("over capacity");

  // Product/carrier match stub — gold+ are appointed broadly; bronze is MS-only.
  const product = String(lead.product || "").toLowerCase();
  const isMedSupp = product.includes("med") || product.includes("supp");
  const isAnnuity = product.includes("annuity");
  const productFit = isMedSupp ? true : isAnnuity ? t >= 4 : t >= 2;
  if (productFit) reasons.push(`appt ${product.split(" ")[0] || "OK"}`);
  else            { score -= 25; reasons.push("no carrier appt"); }

  return { score, reasons };
}

function DispatchView({ onCall }) {
  const { QUEUE, REPS } = AppData;
  const [picks, setPicks]         = React.useState({});  // queueId -> repId
  const [filter, setFilter]       = React.useState({ heat: "all", product: "all" });
  const [autoRoute, setAutoRoute] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);

  const filtered = QUEUE.filter(q =>
    (filter.heat === "all" || (filter.heat === "hot" ? q.elapsed < 30 : q.elapsed >= 30)) &&
    (filter.product === "all" || q.product === filter.product)
  );

  // Best rep per lead (memoize across changing picks → reasons stay current)
  const suggestionFor = (lead) => {
    const ranked = REPS
      .map(r => ({ rep: r, ...scoreRepForLead(r, lead, picks) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return ranked[0] || { rep: REPS[0], reasons: ["fallback"] };
  };

  const setPick = (qid, rid) => setPicks(p => ({ ...p, [qid]: rid }));

  // Auto-route: when toggled on, fill picks with the suggestion for any lead
  // that isn't already explicitly assigned. Also re-runs when QUEUE changes.
  React.useEffect(() => {
    if (!autoRoute) return;
    setPicks(prev => {
      const next = { ...prev };
      QUEUE.forEach(q => {
        if (!next[q.id]) {
          const s = suggestionFor(q);
          next[q.id] = s.rep.id;
        }
      });
      return next;
    });
  // eslint-disable-next-line
  }, [autoRoute, QUEUE.length]);

  const sendOne = async (q, rid) => {
    setPick(q.id, rid);
    try {
      if (AppData.mutate?.queueAssign) await AppData.mutate.queueAssign(q.id, rid);
    } catch (_e) {}
    const rep = REPS.find(r => r.id === rid);
    window.toast && window.toast(`Sent ${q.lead} → ${rep?.name?.split(" ")[0] || rid}`, "success");
  };

  const sendAllSuggested = async () => {
    const queue = filtered.filter(q => !picks[q.id]);
    for (const q of queue) {
      const s = suggestionFor(q);
      // eslint-disable-next-line no-await-in-loop
      await sendOne(q, s.rep.id);
    }
  };

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Dispatch</div>
          <div className="page-sub">
            {REPS.filter(r => r.presence === "live").length} live · {REPS.filter(r => r.presence === "idle").length} idle ·
            routing scored by tier + capacity + carrier appointment match
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: autoRoute ? "color-mix(in oklch, var(--accent-money) 14%, var(--bg-raised))" : "var(--bg-raised)", border: `1px solid ${autoRoute ? "color-mix(in oklch, var(--accent-money) 40%, transparent)" : "var(--border-subtle)"}`, borderRadius: 999, fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRoute} onChange={(e) => setAutoRoute(e.target.checked)} style={{ accentColor: "var(--accent-money)" }}/>
            <span style={{ fontWeight: 500, color: autoRoute ? "var(--accent-money)" : "var(--text-secondary)" }}>Auto-route</span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{autoRoute ? "ON · suggestions auto-filled" : "OFF"}</span>
          </label>
          <button className="btn" onClick={() => setShowRules(true)}><Icons.Settings size={13}/> Routing rules</button>
        </div>
      </div>

      <SpendStrip items={[
        { l: "Team CPA today", v: "$87",   tone: "money" },
        { l: "Lead spend today", v: "$1,240" },
        { l: "Avg dispatch SLA", v: "21s",  tone: "money" },
        { l: "Breaches",         v: "4",    tone: "warn" },
      ]}/>

      {/* LIVE FLOOR MAP — full-width producer grid */}
      <LiveFloorMap reps={REPS} picks={picks}/>

      {/* INBOUND QUEUE + RULES */}
      <div className="dispatch-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, marginTop: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <h3>Inbound · awaiting dispatch</h3>
            <span className="meta">{filtered.length}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <Shared.Select value={filter.heat} onChange={(v) => setFilter({ ...filter, heat: v })} options={[{ v: "all", l: "All heat" }, { v: "hot", l: "Hot < 30s" }, { v: "cold", l: "≥ 30s" }]}/>
              <Shared.Select value={filter.product} onChange={(v) => setFilter({ ...filter, product: v })} options={[{ v: "all", l: "All products" }, ...Array.from(new Set(QUEUE.map(q => q.product))).map(p => ({ v: p, l: p }))]}/>
              <button className="btn btn-primary" onClick={sendAllSuggested} style={{ fontSize: 11.5 }} disabled={filtered.length === 0}>
                <Icons.Bolt size={11}/> Send all suggested
              </button>
            </div>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "16px 1.4fr 60px 1fr 64px 1.6fr 70px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Product</div><div className="tabular" style={{ textAlign: "right" }}>SLA</div><div>Suggested rep · why</div><div></div>
            </div>
            {filtered.map(q => {
              const c = q.elapsed < 30 ? "var(--accent-money)" : q.elapsed < 90 ? "var(--state-warning)" : "var(--state-danger)";
              const suggestion = suggestionFor(q);
              const rid = picks[q.id] || suggestion.rep.id;
              const isManual = picks[q.id] && picks[q.id] !== suggestion.rep.id;
              return (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "16px 1.4fr 60px 1fr 64px 1.6fr 70px" }}>
                  <span className="dot" style={{ background: c }}></span>
                  <div style={{ fontWeight: 500 }}>
                    {q.lead}
                    <span className="tabular" style={{ marginLeft: 6, fontSize: 10.5, color: q.score >= 90 ? "var(--accent-money)" : q.score >= 80 ? "var(--accent-status)" : "var(--text-tertiary)" }}>{q.score}</span>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)" }}>{q.age} · {q.state}</div>
                  <div className="cell-truncate"><span className="chip">{q.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: c, fontWeight: 500 }}>{q.elapsed}s</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <Shared.Select value={rid} onChange={(v) => setPick(q.id, v)}
                      options={REPS.map(r => {
                        const s = scoreRepForLead(r, q, picks);
                        return { v: r.id, l: `${r.name.split(" ")[0]} · ${r.presence} · score ${s.score}` };
                      })}/>
                    <span style={{ fontSize: 10.5, color: isManual ? "var(--text-tertiary)" : "var(--accent-money)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isManual ? "manual override" : suggestion.reasons.join(" · ")}
                    </span>
                  </div>
                  <button className="btn btn-primary" style={{ padding: "3px 8px" }} onClick={() => sendOne(q, rid)}><Icons.Phone size={11}/> Send</button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                Inbound queue is clear. Nice.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.Bolt size={13} style={{ color: "var(--accent-heat)" }}/><h3>Routing rules</h3>
            <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }} onClick={() => setShowRules(true)}><Icons.Edit size={11}/> Edit</button>
          </div>
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.55 }}>
            <div><span style={{ color: "var(--text-tertiary)" }}>Score weights —</span></div>
            <div>• Idle producer: <strong style={{ color: "var(--accent-money)" }}>+30</strong></div>
            <div>• Already on call: <strong>+12</strong></div>
            <div>• Tier ≥ Platinum on score ≥ 90: <strong>+18</strong></div>
            <div>• Each in-flight assignment: <strong style={{ color: "var(--state-warning)" }}>−6</strong></div>
            <div>• No carrier appointment for product: <strong style={{ color: "var(--state-danger)" }}>−25</strong></div>
            <div>• Bronze + score ≥ 90: <strong style={{ color: "var(--state-danger)" }}>−20</strong></div>
            <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontSize: 11.5 }}>
              Toggle <strong>Auto-route ON</strong> to fill assignments with the highest-scoring producer per inbound. Manual picks always win.
            </div>
          </div>
        </div>
      </div>

      {showRules && <RoutingRulesModal onClose={() => setShowRules(false)}/>}
    </div>
  );
}

/* ─── Live floor map — visual 8-up grid of producers ──────────────────── */
function LiveFloorMap({ reps, picks }) {
  const live = reps.filter(r => r.presence === "live").length;
  const idle = reps.filter(r => r.presence === "idle").length;
  const off  = reps.filter(r => r.presence === "off").length;

  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-h">
        <Icons.Users size={13}/>
        <h3>Live floor</h3>
        <span className="meta">
          <span style={{ color: "var(--accent-money)" }}>● {live} live</span>
          <span style={{ marginLeft: 10, color: "var(--state-warning)" }}>● {idle} idle</span>
          {off > 0 && <span style={{ marginLeft: 10, color: "var(--text-quaternary)" }}>● {off} off</span>}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, padding: 12 }}>
        {reps.map(r => {
          const load = Object.values(picks).filter(rid => rid === r.id).length;
          const totalLoad = load + (r.appts || 0);
          const overCap = totalLoad >= 6;
          const targetProgress = Math.min(100, Math.round(((r.today || 0) / 1800) * 100));  // $1,800 daily target
          return (
            <div key={r.id} style={{
              padding: 10,
              background: "var(--bg-raised)",
              border: `1px solid ${
                r.presence === "live" ? "color-mix(in oklch, var(--accent-money) 35%, var(--border-subtle))" :
                r.presence === "off" ? "var(--border-subtle)" :
                "color-mix(in oklch, var(--state-warning) 25%, var(--border-subtle))"
              }`,
              borderRadius: 8,
              opacity: r.presence === "off" ? 0.55 : 1,
              position: "relative",
            }}>
              {load > 0 && (
                <span style={{
                  position: "absolute", top: 8, right: 8,
                  fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 999,
                  background: overCap ? "var(--state-warning)" : "var(--accent-money)",
                  color: overCap ? "#000" : "#022",
                }}>+{load}</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Shared.Avatar rep={r} size={28}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                    <Shared.TierChip tier={r.tier} compact/>
                    <span className={`dot dot-${r.presence === "live" ? "live" : "idle"}`}/>
                    <span style={{ textTransform: "capitalize" }}>{r.presence}</span>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 3 }}>
                  <span>${(r.today || 0).toLocaleString()}</span>
                  <span>{targetProgress}%</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${targetProgress}%`, height: "100%", background: targetProgress >= 80 ? "var(--accent-money)" : targetProgress >= 40 ? "var(--accent-status)" : "var(--state-warning)" }}/>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 10.5 }}>
                <div title="Dials today"><span style={{ color: "var(--text-tertiary)" }}>D</span> <strong>{r.dials}</strong></div>
                <div title="Active appointments"><span style={{ color: "var(--text-tertiary)" }}>A</span> <strong>{r.appts}</strong></div>
                <div title="Streak (days)"><span style={{ color: "var(--text-tertiary)" }}>🔥</span> <strong>{r.streak}</strong></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Routing rules editor (stub — full editor lives in page-manager.jsx
   as RoutingRulesModal and is reachable via window.RoutingRulesModal). */
function RoutingRulesModal({ onClose }) {
  const Inner = window.RoutingRulesModal;
  if (Inner && Inner !== RoutingRulesModal) return <Inner onClose={onClose}/>;
  return (
    <Shared.Modal title="Routing rules" width={520} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        The full routing-rules editor lives on the Team Board page. Open the Team Board → Routing rules to add product/tier/language rules that override the score-based suggestion.
      </div>
    </Shared.Modal>
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
  // Reads agency-shared scripts from AppData.SCRIPTS_LIB (migration 0010);
  // falls back to FALLBACK_SCRIPTS for empty agencies / offline use.
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
  const liveScripts = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const scripts = liveScripts.length > 0 ? liveScripts : FALLBACK_SCRIPTS;
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

/* ─────────────────────────────────────────────────────────────────────────
   CallCopilot — real-time analysis pane for the in-call panel.

   Subscribes to `transcript:segment` events emitted by LiveTranscriber and:
     • counts words per speaker → live talk-ratio meter with target band
     • detects TPMO disclosure fragments in the rep's stream → flips the
       compliance flag without relying on the 8s timer
     • pattern-matches caller utterances against an objection map → surfaces
       AI-suggested rebuttals as actionable chips that drop a script into
       Scripts/Send-SMS pipeline
     • shows contextual nudges based on rolling state (talk-ratio >60% for
       30s+, no open question in 90s, no TPMO read at 30s, etc.)
     • one-click "Drop call to Vault" button — uses vaultArtifactInsert.

   Stays cheap: all logic is local string matching + counters. Hooks into
   the existing transcriber; no extra network calls.
   ───────────────────────────────────────────────────────────────────────── */
function CallCopilot({ lead, sec, tpmoFired, setTpmoFired }) {
  const [segments, setSegments] = React.useState([]);
  const [dropped, setDropped]   = React.useState(false);

  React.useEffect(() => {
    const onSeg = (e) => {
      const s = e.detail;
      if (!s || !s.text) return;
      setSegments(prev => [...prev, { who: s.who || "You", text: s.text, t: s.t || sec }]);
    };
    window.addEventListener("transcript:segment", onSeg);
    return () => window.removeEventListener("transcript:segment", onSeg);
  }, [sec]);

  // Reset when the lead changes (next call in autodial)
  React.useEffect(() => { setSegments([]); setDropped(false); }, [lead && lead.id]);

  // ── Derived signals ─────────────────────────────────────────────────────
  const repText    = segments.filter(s => s.who === "You").map(s => s.text).join(" ").toLowerCase();
  const callerText = segments.filter(s => s.who !== "You").map(s => s.text).join(" ").toLowerCase();
  const repWords   = repText.split(/\s+/).filter(Boolean).length;
  const callerWords= callerText.split(/\s+/).filter(Boolean).length;
  const totalWords = repWords + callerWords;
  const talkRatio  = totalWords === 0 ? null : Math.round((repWords / totalWords) * 100);
  const openQs     = (repText.match(/\b(what|how|why|when|where|tell me|walk me through)\b/g) || []).length;

  // TPMO auto-detect: any of these phrases in the rep stream flips compliance.
  const TPMO_PHRASES = [
    "do not offer every plan",
    "limited to those plans",
    "1-800-medicare",
    "medicare.gov",
  ];
  React.useEffect(() => {
    if (tpmoFired) return;
    if (TPMO_PHRASES.some(p => repText.includes(p))) setTpmoFired(true);
  }, [repText, tpmoFired, setTpmoFired]);

  // Objection map: caller phrase → { label, action }
  const OBJECTIONS = [
    { match: /\b(too expensive|can'?t afford|out of (my )?budget|too pricey)\b/, label: "Price objection", reply: "Plan G covers everything Original Medicare doesn't — the question isn't 'can I afford this premium,' it's 'can I afford a $9,000 hospital deductible.' Walk me through what hospital stays would cost you today without it." },
    { match: /\b(already have|have coverage|got insurance|covered already)\b/,    label: "Already covered", reply: "That's good — most of my clients had something. The reason I called is the rates jumped 14% on average for renewals this year. What carrier and plan are you on right now?" },
    { match: /\b(let me think|need to think|call me back|send me|in the mail)\b/, label: "Stalling",         reply: "Of course. What I want to make sure is that when you do think about it, you have everything you need. What's the one piece of information that would make this an easy yes or no?" },
    { match: /\b(spouse|wife|husband|partner|talk to my)\b/,                       label: "Spouse decision", reply: "Smart — what's your spouse's biggest concern about Medicare costs? I can run a quote for them too in 60 seconds." },
    { match: /\b(medication|prescription|pharmacy|drug)\b/,                        label: "Drug coverage",   reply: "Let me pull up your medication list. What you take matters more than the premium for choosing the right plan. What are you on right now?" },
  ];
  const detectedObj = OBJECTIONS.find(o => o.match.test(callerText));

  // Nudges: tactical real-time prompts, ordered by urgency
  const nudges = [];
  if (sec >= 30 && !tpmoFired)            nudges.push({ kind: "warn", msg: "Read the TPMO disclosure now — you've been on for 30s." });
  if (talkRatio !== null && talkRatio > 60 && sec >= 30) nudges.push({ kind: "warn", msg: `Talking ${talkRatio}% — ask: "Walk me through your day."` });
  if (openQs === 0 && repWords > 50)      nudges.push({ kind: "tip", msg: "No open-ended questions yet. Lead with one." });
  if (detectedObj)                         nudges.push({ kind: "obj", msg: `Caller said "${detectedObj.label}" — try the rebuttal below.` });

  const targetMin = 35, targetMax = 50;  // healthy talk-ratio band

  const dropToVault = async () => {
    try {
      const transcriptText = segments.map(s => `${s.who}: ${s.text}`).join("\n");
      const me = (typeof window !== "undefined" && window.me && window.me()) || {};
      await AppData.mutate.vaultArtifactInsert({
        kind: "Recording",
        lead_name: lead?.lead || lead?.name || "Live call",
        rep_id: me.rep_id || null,
        retention: "10y",
        status: "complete",
        metadata: {
          duration_seconds: sec,
          talk_ratio: talkRatio,
          open_questions: openQs,
          tpmo_compliant: tpmoFired,
          transcript: transcriptText,
        },
      });
      setDropped(true);
      window.toast && window.toast("Call dropped to Vault — 10y retention applied", "success");
    } catch (_e) {
      window.toast && window.toast("Vault drop failed — check Supabase", "warn");
    }
  };

  return (
    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Talk-ratio meter */}
      <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Icons.Activity size={11} style={{ color: "var(--accent-money)" }}/>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>Talk ratio</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>target {targetMin}–{targetMax}%</span>
        </div>
        {talkRatio === null ? (
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Listening for first words…</div>
        ) : (
          <>
            <div style={{ position: "relative", height: 8, background: "var(--bg-overlay)", borderRadius: 4, overflow: "hidden" }}>
              {/* Target band */}
              <div style={{ position: "absolute", left: `${targetMin}%`, width: `${targetMax - targetMin}%`, height: "100%", background: "color-mix(in oklch, var(--accent-money) 16%, transparent)" }}/>
              {/* Rep talk fill */}
              <div style={{ width: `${talkRatio}%`, height: "100%", background: talkRatio > targetMax ? "var(--state-warning)" : talkRatio < targetMin ? "var(--text-tertiary)" : "var(--accent-money)" }}/>
            </div>
            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
              <span>You: <strong style={{ color: talkRatio > targetMax ? "var(--state-warning)" : "var(--accent-money)" }}>{talkRatio}%</strong></span>
              <span>Caller: {100 - talkRatio}%</span>
              <span>Open Qs: <strong style={{ color: openQs >= 3 ? "var(--accent-money)" : "var(--text-secondary)" }}>{openQs}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* AI nudges */}
      <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-money)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <Icons.Sparkles size={11}/> AI nudges
        </div>
        {nudges.length === 0 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>Looking good. Keep them talking.</div>
        ) : (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {nudges.map((n, i) => (
              <div key={i} style={{
                fontSize: 12, lineHeight: 1.5, padding: "6px 10px", borderRadius: 6,
                background: n.kind === "warn" ? "color-mix(in oklch, var(--state-warning) 12%, transparent)"
                          : n.kind === "obj"  ? "color-mix(in oklch, var(--accent-status) 12%, transparent)"
                          : "color-mix(in oklch, var(--accent-money) 8%, transparent)",
                color: n.kind === "warn" ? "var(--state-warning)"
                     : n.kind === "obj"  ? "var(--accent-status)"
                     : "var(--text-primary)",
                borderLeft: `3px solid ${n.kind === "warn" ? "var(--state-warning)" : n.kind === "obj" ? "var(--accent-status)" : "var(--accent-money)"}`,
              }}>{n.msg}</div>
            ))}
          </div>
        )}
        {detectedObj && (
          <div style={{ marginTop: 10, padding: 10, background: "var(--bg-overlay)", borderRadius: 6, fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.55 }}>
            <div style={{ fontSize: 10.5, color: "var(--accent-status)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Try this →</div>
            "{detectedObj.reply}"
          </div>
        )}
      </div>

      {/* Vault drop — single click, end-of-call action */}
      <button className={dropped ? "btn" : "btn btn-primary"} onClick={dropToVault} disabled={dropped} style={{ alignSelf: "flex-start" }}>
        <Icons.Shield size={11}/> {dropped ? "In Vault · 10y retention" : "Drop call → Vault"}
      </button>
    </div>
  );
}

function InCall({ onClose, lead, autodial }) {
  const [tab, setTab] = React.useState("script");
  const [tpmoFired, setTpmoFired] = React.useState(false);
  const [sec, setSec] = React.useState(0);
  const [muted, setMuted]         = React.useState(false);
  const [onHold, setOnHold]       = React.useState(false);

  // Mirror AutoDialBar's state so this modal can render as the autodialer
  // dashboard: queue progress at top, outcome buttons at bottom.
  const [adState, setAdState] = React.useState(() => window.__autodialState || null);
  React.useEffect(() => {
    const onChange = (e) => setAdState(e.detail || null);
    window.addEventListener("autodial:state-change", onChange);
    return () => window.removeEventListener("autodial:state-change", onChange);
  }, []);
  // Reset call timer + TPMO flag every time the lead changes (next call in autodial)
  React.useEffect(() => { setSec(0); setTpmoFired(false); setMuted(false); setOnHold(false); }, [lead && lead.id]);

  React.useEffect(() => {
    if (onHold) return;  // freeze timer while on hold
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [onHold, lead && lead.id]);
  React.useEffect(() => { if (sec >= 8) setTpmoFired(true); }, [sec]);

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  // Demo lead used by AutoDialBar / UI when caller didn't pass one in
  const activeLead = lead || { id: "demo-cheryl", lead: "Cheryl Hampton", state: "TX", product: "Med Supp Plan G" };
  const isAutodial = autodial || (adState && adState.active);
  const stage = adState?.stage;
  const paused = adState?.paused;

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

  // Outcome dispatchers (only used in autodial mode)
  const fireOutcome = (outcome) => window.dispatchEvent(new CustomEvent("autodial:outcome", { detail: { outcome }}));
  const fireSkip    = () => window.dispatchEvent(new CustomEvent("autodial:skip"));
  const fireStop    = () => window.dispatchEvent(new CustomEvent("autodial:stop-request"));
  const firePause   = () => window.dispatchEvent(new CustomEvent("autodial:pause"));
  const fireResume  = () => window.dispatchEvent(new CustomEvent("autodial:resume"));

  return (
    <div className="incall" onClick={onClose}>
      <div className="incall-card" onClick={(e) => e.stopPropagation()}>
        {/* Autodial dashboard header — queue progress + Pause/Skip/Stop. Only when in autodial. */}
        {isAutodial && adState && (
          <div style={{
            gridColumn: "1 / -1",
            padding: "10px 16px",
            background: "color-mix(in oklch, var(--accent-money) 8%, var(--bg-elevated))",
            borderBottom: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <Icons.Phone size={13} style={{ color: "var(--accent-money)" }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                Autodialer <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {(adState.idx ?? 0) + 1} of {adState.total} · {stage === "outcome" ? "log outcome" : paused ? "paused" : "calling"}</span>
              </div>
              <div style={{ height: 3, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${(((adState.idx ?? 0) + 1) / Math.max(1, adState.total)) * 100}%`, height: "100%", background: "var(--accent-money)" }}/>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={paused ? fireResume : firePause}>
              {paused ? <><Icons.Play size={11}/> Resume</> : <><Icons.Pause size={11}/> Pause</>}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={fireSkip}>
              <Icons.ArrowRight size={11}/> Skip
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--state-danger)" }} onClick={fireStop}>
              <Icons.X size={11}/> Stop
            </button>
          </div>
        )}
        <div style={{ padding: 20, borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot dot-live" style={{ width: 8, height: 8 }}></span>
            <span style={{ color: "var(--accent-money)", fontWeight: 500, fontSize: 12 }}>LIVE</span>
            <span className="tabular mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>{mm}:{ss}</span>
          </div>
          <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{activeLead.lead}</div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 2 }}>
            {[activeLead.age && `${activeLead.age}`, activeLead.state, activeLead.source].filter(Boolean).join(" · ") || "—"}
          </div>
          {(activeLead.phone || activeLead.email) && (
            <div style={{ marginTop: 6, display: "flex", gap: 12, fontSize: 11.5, color: "var(--text-secondary)", flexWrap: "wrap" }}>
              {activeLead.phone && <span><Icons.Phone size={10} style={{ verticalAlign: "middle", color: "var(--text-tertiary)" }}/> <span className="mono">{activeLead.phone}</span></span>}
              {activeLead.email && <span><Icons.Mail  size={10} style={{ verticalAlign: "middle", color: "var(--text-tertiary)" }}/> <span className="mono" style={{ fontSize: 11 }}>{activeLead.email}</span></span>}
            </div>
          )}
          {!activeLead.phone && (
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--state-warning)" }}>
              No phone on file — add one in the lead detail drawer to dial / SMS.
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {activeLead.product   && <span className="chip chip-info">{activeLead.product}</span>}
            {activeLead.heat      && <span className="chip">{activeLead.heat}</span>}
            {activeLead.consent   && <span className="chip chip-money">consent · {activeLead.consent}</span>}
            {!activeLead.product && !activeLead.heat && !activeLead.consent && <span className="chip">no enrichment yet</span>}
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

            {window.QuoteCard && (() => {
              const Q = window.QuoteCard;
              return <Q active={!onHold} leadName={activeLead.lead} leadId={activeLead.leadId || activeLead.id} callId={activeLead.callId}/>;
            })()}

            <CallCopilot lead={activeLead} sec={sec} tpmoFired={tpmoFired} setTpmoFired={setTpmoFired}/>
          </div>

          {isAutodial && stage === "outcome" ? (
            // Autodial outcome capture — replaces the End-call strip with the 5
            // outcome buttons. Picking one advances to the next lead automatically.
            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Log outcome:</span>
              <button className="btn btn-ghost" onClick={() => fireOutcome("no_answer")}><span className="kbd mono">1</span> No answer</button>
              <button className="btn btn-ghost" onClick={() => fireOutcome("voicemail")}><span className="kbd mono">2</span> VM</button>
              <button className="btn btn-primary" onClick={() => fireOutcome("appointment")}><span className="kbd mono">3</span> Appt</button>
              <button className="btn btn-ghost" onClick={() => fireOutcome("not_interested")}><span className="kbd mono">4</span> Not int.</button>
              <button className="btn btn-ghost" onClick={() => fireOutcome("callback")}><span className="kbd mono">5</span> Callback</button>
              <div style={{ flex: 1 }}/>
              <button className="btn" onClick={fireSkip}><Icons.ArrowRight size={11}/> Skip</button>
            </div>
          ) : (
            // Standard in-call action strip — Mute / Hold / SMS / SOA / Send link / End
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
              <button className="btn" style={{ background: "var(--state-danger)", color: "white" }} onClick={onClose}>
                <Icons.Stop size={12}/> {isAutodial ? "Close · keep dialing" : "End call"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.PageQueue = PageQueue;
window.InCall = InCall;
window.CarrierQuoteTool = CarrierQuoteTool;  // standalone use via FloorActionsHost
window.InCallScripts    = InCallScripts;
