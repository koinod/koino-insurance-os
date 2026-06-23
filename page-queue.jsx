/* Page: Dial Queue (rep) / Dispatch (mgr) — role-aware
   Rep view: their dial queue with TPMO + queue-health + compliance side panels.
   Manager (Dispatch) view: routing-style queue with team capacity + spend strip. */
const SpendStrip = window.SpendStrip;
function PageQueue({ onCall, role = "rep" }) {
  if (role === "manager") return <DispatchView onCall={onCall}/>;
  return <DialQueueView onCall={onCall}/>;
}

// Estimated first-year commission for a queue row. Returns null when we
// don't have enough data to compute. Reps see this next to the lead so they
// dial the high-comp leads first instead of guessing.
//   base = lead.targetPremium (IUL) || lead.ap
//   pct  = AppData.PRODUCTS.compPct for the matched product
function estCommissionForLead(lead) {
  if (!lead) return null;
  const ap = Number(lead.ap || 0);
  if (!ap) return null;
  const products = (window.AppData && window.AppData.PRODUCTS) || [];
  if (products.length === 0) return null;
  const lp = String(lead.product || "").toLowerCase().trim();
  if (!lp) return null;
  const match =
    products.find(p => p.name && lp === p.name.toLowerCase()) ||
    products.find(p => p.name && lp.includes(p.name.toLowerCase())) ||
    products.find(p => p.name && p.name.toLowerCase().includes(lp));
  if (!match || !match.compPct) return null;
  return Math.round(ap * Number(match.compPct) / 100);
}

function DialQueueView({ onCall }) {
  const { QUEUE, PIPELINE } = AppData;
  // Reps see "their" queue by default: their own assigned pipeline
  // leads (New + Contacted) merged into a dial-ready list. The shared inbound
  // funnel is one click away via the "Inbound (all)" tab so nobody loses
  // speed-to-lead access. Manager + owner views (DispatchView / Floor's
  // role-aware queue) already see fleet-wide.
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myRepId = meIdent?.rep_id || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id) : null);

  const [tab, setTab] = React.useState("mine");

  const myPipeline = (PIPELINE || [])
    .filter(p => p.owner === myRepId && (p.stage === "New" || p.stage === "Contacted"))
    .map(p => ({
      id: "p-" + p.id,
      lead: p.lead, age: p.age, state: p.state,
      source: p.source || "—", product: p.product,
      ap: p.ap || 0,
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
            <div className="list-h" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 70px 64px 72px" }}>
              <div></div><div>Lead</div><div>Age/St</div><div>Source</div><div>Product</div><div style={{textAlign:"right"}}>Score</div><div style={{textAlign:"right"}} title="Estimated first-year commission · AP × product comp%">Est $</div><div style={{textAlign:"right"}}>{tab === "mine" ? "Last" : "SLA"}</div><div></div>
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
              const est = estCommissionForLead(l);
              return (
                <div key={l.id} className="row" style={{ gridTemplateColumns: "16px minmax(170px,2.2fr) 64px minmax(110px,1.2fr) minmax(90px,1fr) 56px 70px 64px 72px" }}>
                  <span className="dot" style={{ background: c }}></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <strong style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.lead}</strong>
                    <span title="LeadiD verified" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 999, background: "color-mix(in oklch, var(--accent-money) 18%, transparent)", color: "var(--accent-money)", fontSize: 9, fontWeight: 700, flex: "0 0 auto" }}>✓</span>
                  </div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{l.age} · {l.state}</div>
                  <div style={{ color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.source}</div>
                  <div style={{ minWidth: 0 }}><span className="chip" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{l.product}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: l.score >= 90 ? "var(--accent-money)" : l.score >= 80 ? "var(--accent-status)" : "var(--text-secondary)" }}>{l.score}</div>
                  <div className="tabular" title={est != null ? `Estimated first-year commission · $${l.ap?.toLocaleString() || "?"} AP` : "Add AP + matching product to see estimated commission"} style={{ textAlign: "right", color: est != null ? "var(--accent-money)" : "var(--text-quaternary)", fontWeight: est != null ? 600 : 400 }}>
                    {est != null ? `$${est.toLocaleString()}` : "—"}
                  </div>
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
                      title={l.phone ? "Pin to autodial queue (Floor)" : "No phone on file"}
                      disabled={!l.phone}
                      onClick={() => l.phone && window.AutodialQueue && window.AutodialQueue.add({
                        id: "q-" + l.id,
                        lead_id: l.lead_id || l.id || null,
                        lead: l.lead,
                        phone: l.phone,
                        product: l.product,
                        age: l.age,
                        state: l.state,
                        ap: l.ap || 0,
                        source: l.source || "Queue",
                        score: l.score || 80,
                      })}>
                      <Icons.Plus size={12}/>
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

/* ─── Producer insights panel — used on Dispatch + Routing settings.
   Shows each producer's routing-relevant state ONCE (not per inbound row).
   Surfaces: presence, current load, close rate L30, licensed states,
   carrier appt count. Manager can read at a glance who's available + why
   they'd score the way they do. */
function ProducerInsightsPanel({ REPS, ctx, agencyRules, onEdit }) {
  const apptStateCount = (rid) => Object.keys(ctx.apptIdx[rid] || {}).length;
  const apptCarrierCount = (rid) => {
    const states = ctx.apptIdx[rid] || {};
    const set = new Set();
    for (const s of Object.values(states)) for (const c of s) set.add(c);
    return set.size;
  };
  const sorted = [...REPS].sort((a, b) => {
    // idle first, then live, then offline; tier desc within group
    const presenceRank = { idle: 3, live: 2, off: 0, offline: 0 };
    const pa = presenceRank[a.presence] || 1, pb = presenceRank[b.presence] || 1;
    if (pa !== pb) return pb - pa;
    const tierRank = { diamond: 5, platinum: 4, gold: 3, silver: 2, bronze: 1 };
    return (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0);
  });

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/>
        <h3>Producer insights</h3>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }} onClick={onEdit}><Icons.Edit size={11}/> Routing</button>
      </div>
      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 0 }}>
        {REPS.length === 0 && (
          <div style={{ padding: "16px 0", textAlign: "center", color: "var(--text-tertiary)" }}>No producers yet — invite one to start routing.</div>
        )}
        {sorted.map(r => {
          const inFlight = (ctx.pickCount[r.id] || 0) + (r.appts || 0);
          const cr = ctx.closeRateByRep[r.id];
          const states = apptStateCount(r.id);
          const carriers = apptCarrierCount(r.id);
          const presenceColor = r.presence === "idle" ? "var(--accent-money)" : r.presence === "live" ? "var(--state-warning)" : "var(--text-quaternary)";
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="dot" style={{ background: presenceColor, width: 6, height: 6 }}></span>
                <Shared.Avatar rep={r} size={20}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name.split(" ")[0]}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{r.tier} · {r.presence}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                <div>load <strong style={{ color: inFlight >= 6 ? "var(--state-danger)" : inFlight >= 3 ? "var(--state-warning)" : "var(--text-primary)" }}>{inFlight}</strong></div>
                <div>{cr?.total >= 3 ? `${cr.pct}% close · L30` : "—"}</div>
                <div>{states > 0 ? `${states} states · ${carriers} carriers` : "no appts"}</div>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontSize: 11 }}>
          {agencyRules.length > 0
            ? `${agencyRules.length} active routing rule${agencyRules.length === 1 ? "" : "s"} — open Routing to edit`
            : "Auto-routing scores by appointment + capacity + close rate. Add a custom rule to override."}
        </div>
      </div>
    </div>
  );
}

/* ─── Tone-coloured reason chip strip (used in dispatch row + drilldown) ── */
function ReasonChips({ reasons }) {
  if (!reasons || reasons.length === 0) return null;
  const toneColor = {
    ok:      "var(--accent-money)",
    warn:    "var(--state-warning)",
    bad:     "var(--state-danger)",
    neutral: "var(--text-tertiary)",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {reasons.map((r, i) => {
        const text = typeof r === "string" ? r : r.t;
        const tone = typeof r === "string" ? "neutral" : (r.tone || "neutral");
        const color = toneColor[tone] || toneColor.neutral;
        return (
          <span key={i} style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 999,
            color,
            border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
            background: `color-mix(in oklch, ${color} 8%, transparent)`,
            whiteSpace: "nowrap",
          }}>{text}</span>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Smart routing — score each rep against each lead using real data.

   Pulls from:
     - APPOINTMENTS  → rep × carrier × state (active appointments)
     - PRODUCTS      → resolve lead product → carrier(s)
     - POLICIES + COMMISSIONS → recent close rate per rep (L30)
     - QUEUE picks + rep.appts → current load
     - ROUTING_RULES → agency overrides (source/route/weight)

   Returns { score, reasons[] } where each reason is structured so the
   dispatch UI can colour it (ok / warn / bad / neutral).
   ───────────────────────────────────────────────────────────────────────── */
function _productCategoryRegex(productName) {
  const p = String(productName || "").toLowerCase();
  if (/med\s*supp|plan\s*g|plan\s*n/.test(p))            return /med\s*supp|plan\s*g|plan\s*n/i;
  if (/final\s*expense|^fe\b|fe\s/.test(p))              return /final\s*expense|^fe\b|fe\s/i;
  if (/annuity|spda|fia/.test(p))                        return /annuity|spda|fia/i;
  if (/iul|whole\s*life|wl|term/.test(p))                return /iul|whole\s*life|wl|term/i;
  return /./;  // unknown product → don't filter carriers
}

function buildRoutingContext(REPS, picks) {
  const appts = AppData.APPOINTMENTS || [];
  const products = AppData.PRODUCTS || [];
  const policies = AppData.POLICIES || [];

  // apptIdx[repId][state] = Set(carrierIds) — active appointments only
  const apptIdx = {};
  for (const a of appts) {
    if (a.status && a.status !== "active") continue;
    if (!a.repId || !a.state || !a.carrierId) continue;
    apptIdx[a.repId] = apptIdx[a.repId] || {};
    (apptIdx[a.repId][a.state] = apptIdx[a.repId][a.state] || new Set()).add(a.carrierId);
  }

  // Recent close rate L30 per rep — issued vs (issued + lost) on apps submitted in window
  const cutoff = Date.now() - 30 * 86400000;
  const closeRateByRep = {};
  for (const p of policies) {
    if (!p.owner || !p.submissionDate) continue;
    if (new Date(p.submissionDate).getTime() < cutoff) continue;
    const c = closeRateByRep[p.owner] = closeRateByRep[p.owner] || { total: 0, won: 0 };
    c.total += 1;
    if (p.status === "issued" || p.status === "in_force" || p.status === "active") c.won += 1;
  }
  for (const k of Object.keys(closeRateByRep)) {
    const c = closeRateByRep[k];
    c.pct = c.total > 0 ? Math.round((c.won / c.total) * 100) : 0;
  }

  // pickCount[repId] = how many leads currently routed to that rep this session
  const pickCount = {};
  for (const rid of Object.values(picks || {})) {
    if (rid) pickCount[rid] = (pickCount[rid] || 0) + 1;
  }

  // Carriers matching each product category — { regex.source: Set(carrierId) }
  // Lazy: compute per-call in scoreRepForLead since each lead has its own product.
  const carriersByProductRegex = (re) => {
    const set = new Set();
    for (const p of products) {
      if (re.test(`${p.name || ""} ${p.category || ""}`)) set.add(p.carrierId);
    }
    return set;
  };

  return { apptIdx, closeRateByRep, pickCount, carriersByProductRegex, hasAppts: appts.length > 0 };
}

function scoreRepForLead(rep, lead, picks, ctx) {
  if (rep.presence === "off") return { score: -1, reasons: [{ t: "offline", tone: "bad" }] };
  ctx = ctx || buildRoutingContext(AppData.REPS || [], picks);

  let score = 50;
  const reasons = [];

  // 1) Presence
  if (rep.presence === "idle")      { score += 25; reasons.push({ t: "idle now", tone: "ok" }); }
  else if (rep.presence === "live") { score += 6;  reasons.push({ t: "on call", tone: "neutral" }); }

  // 2) Capacity
  const inFlight = (ctx.pickCount[rep.id] || 0) + (rep.appts || 0);
  if (inFlight >= 6)      { score -= 30; reasons.push({ t: `over capacity (${inFlight})`, tone: "bad" }); }
  else if (inFlight >= 3) {              reasons.push({ t: `load ${inFlight}`, tone: "warn" }); }
  else if (inFlight > 0)  {              reasons.push({ t: `load ${inFlight}`, tone: "neutral" }); }

  // 3) Carrier appointment match (state + product). Only enforced when we have
  // appointment data on file; new agencies without imported appointments are
  // not penalized — manager picks the rule.
  if (ctx.hasAppts) {
    const repAppts = ctx.apptIdx[rep.id] || {};
    const stateAppts = (lead.state && repAppts[lead.state]) || null;  // Set(carrierIds) | null
    const productRe = _productCategoryRegex(lead.product);
    const productCarriers = ctx.carriersByProductRegex(productRe);

    if (!stateAppts) {
      score -= 30;
      reasons.push({ t: `not licensed in ${lead.state || "state"}`, tone: "bad" });
    } else if (productCarriers.size > 0) {
      const matches = [...stateAppts].filter(cid => productCarriers.has(cid));
      if (matches.length > 0) {
        score += 25;
        reasons.push({ t: `appt ${lead.state} · ${matches.length} carrier${matches.length === 1 ? "" : "s"}`, tone: "ok" });
      } else {
        score -= 10;
        reasons.push({ t: `${lead.state} licensed · no carrier appt for product`, tone: "warn" });
      }
    } else {
      // Unknown product — no penalty, just confirm state license
      score += 8;
      reasons.push({ t: `licensed ${lead.state}`, tone: "ok" });
    }
  }

  // 4) Recent close rate
  const cr = ctx.closeRateByRep[rep.id];
  if (cr && cr.total >= 3) {
    if (cr.pct >= 30)     { score += 14; reasons.push({ t: `${cr.pct}% close · L30`, tone: "ok" }); }
    else if (cr.pct < 10) { score -= 8;  reasons.push({ t: `${cr.pct}% close · L30`, tone: "warn" }); }
    else                  {              reasons.push({ t: `${cr.pct}% close · L30`, tone: "neutral" }); }
  }

  // 5) Tier — tiebreak + don't waste hot leads on bronze
  const tierRank = { diamond: 5, platinum: 4, gold: 3, silver: 2, bronze: 1 };
  const t = tierRank[rep.tier] || 0;
  score += t * 2;
  if ((lead.score || 0) >= 90 && t <= 1) {
    score -= 18;
    reasons.push({ t: "bronze on hot lead", tone: "warn" });
  } else if (t >= 4 && (lead.score || 0) >= 80) {
    reasons.push({ t: `${rep.tier}`, tone: "ok" });
  } else if (t >= 1) {
    reasons.push({ t: `${rep.tier}`, tone: "neutral" });
  }

  return { score, reasons };
}

function DispatchView({ onCall }) {
  const { QUEUE, REPS } = AppData;
  const [picks, setPicks]         = React.useState({});  // queueId -> repId
  const [filter, setFilter]       = React.useState({ heat: "all", product: "all" });
  const [autoRoute, setAutoRoute] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);
  const [insightLeadId, setInsightLeadId] = React.useState(null);
  const [agencyRules, setAgencyRules] = React.useState([]);

  // Routing context — rebuilt when picks/REPS/data change. Single source of
  // truth for both the dropdown options and the suggestion engine.
  const ctx = React.useMemo(() => buildRoutingContext(REPS, picks), [REPS, picks, AppData.LIVE]);

  // Pull agency-specific routing rules so the side panel reflects what's actually
  // configured. Falls back to the score weights when no rules are defined.
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !AppData.LIVE) return;
    sb.from("routing_rules").select("*").eq("active", true).order("weight", { ascending: false })
      .then(({ data }) => { if (Array.isArray(data)) setAgencyRules(data); });
  }, [AppData.LIVE]);

  const filtered = QUEUE.filter(q =>
    (filter.heat === "all" || (filter.heat === "hot" ? q.elapsed < 30 : q.elapsed >= 30)) &&
    (filter.product === "all" || q.product === filter.product)
  );

  // Best rep per lead — sorted by score desc using the shared context.
  const rankedFor = (lead) => REPS
    .map(r => ({ rep: r, ...scoreRepForLead(r, lead, picks, ctx) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  const suggestionFor = (lead) => {
    const ranked = rankedFor(lead);
    return ranked[0] || { rep: REPS[0], reasons: [{ t: "fallback", tone: "neutral" }], score: 0 };
  };

  const setPick = (qid, rid) => setPicks(p => ({ ...p, [qid]: rid }));

  // Auto-route: when toggled on, fill picks AND persist the assignment via
  // queueAssign so the lead actually lands on the rep's pipeline. Re-runs on
  // every new arrival in QUEUE. Manual picks still win — anything already in
  // picks is left alone.
  React.useEffect(() => {
    if (!autoRoute) return;
    const unassigned = QUEUE.filter(q => !picks[q.id]);
    if (unassigned.length === 0) return;
    const plan = unassigned.map(q => ({ q, repId: suggestionFor(q).rep.id })).filter(p => p.repId);
    if (plan.length === 0) return;
    setPicks(prev => {
      const next = { ...prev };
      plan.forEach(({ q, repId }) => { next[q.id] = repId; });
      return next;
    });
    (async () => {
      let ok = 0;
      for (const { q, repId } of plan) {
        try {
          if (AppData.mutate && AppData.mutate.queueAssign) {
            await AppData.mutate.queueAssign(q.id, repId);
            ok += 1;
          }
        } catch (_e) { /* per-row failure already surfaced by mutator */ }
      }
      if (ok > 0) window.toast && window.toast(`Auto-routed ${ok} lead${ok === 1 ? "" : "s"}`, "success");
    })();
  // eslint-disable-next-line
  }, [autoRoute, QUEUE.length]);

  const sendOne = async (q, rid) => {
    setPick(q.id, rid);
    try {
      if (AppData.mutate?.queueAssign) await AppData.mutate.queueAssign(q.id, rid);
    } catch (e) { window.toast?.(`Queue assign failed: ${e?.message || e}`, "error"); console.error("[queue.assign]", e); return; }
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
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{autoRoute ? "ON · auto-assigning inbounds" : "OFF"}</span>
          </label>
          <button className="btn" onClick={() => setShowRules(true)}><Icons.Settings size={13}/> Routing rules</button>
        </div>
      </div>

      {(() => {
        // Live spend strip — CPA today, lead spend today, dispatch SLA, breaches
        const today = new Date(); today.setHours(0,0,0,0);
        const issuedToday = (AppData.POLICIES || []).filter(p => p.issuedAt && new Date(p.issuedAt) >= today).length;
        const leadSpendToday = (AppData.EXPENSES || [])
          .filter(e => e.kind === "lead_spend" && e.paid_at && new Date(e.paid_at) >= today)
          .reduce((s, e) => s + (e.amount_cents || 0), 0);
        const cpaToday = issuedToday > 0 ? Math.round(leadSpendToday / 100 / issuedToday) : null;
        const queueElapsed = QUEUE.map(q => q.elapsed || 0).filter(n => n > 0);
        const avgSla = queueElapsed.length > 0 ? Math.round(queueElapsed.reduce((a, b) => a + b, 0) / queueElapsed.length) : null;
        const breaches = QUEUE.filter(q => (q.elapsed || 0) > 120).length;
        return (
          <SpendStrip items={[
            { l: "Team CPA today", v: cpaToday != null ? `$${cpaToday.toLocaleString()}` : "—", tone: cpaToday != null ? "money" : undefined },
            { l: "Lead spend today", v: leadSpendToday > 0 ? `$${Math.round(leadSpendToday / 100).toLocaleString()}` : "—" },
            { l: "Avg dispatch SLA", v: avgSla != null ? `${avgSla}s` : "—", tone: avgSla != null && avgSla < 60 ? "money" : (avgSla != null && avgSla > 120 ? "warn" : undefined) },
            { l: "SLA breaches",    v: String(breaches), tone: breaches > 0 ? "warn" : undefined },
          ]}/>
        );
      })()}

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
              const rid = picks[q.id] || (suggestion.rep && suggestion.rep.id);
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <Shared.Select value={rid} onChange={(v) => setPick(q.id, v)}
                      options={rankedFor(q).map(({ rep, score }) => ({ v: rep.id, l: `${rep.name.split(" ")[0]} · ${rep.presence} · score ${score}` }))}/>
                    {isManual ? (
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>manual override</span>
                    ) : (
                      <ReasonChips reasons={suggestion.reasons}/>
                    )}
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

        <ProducerInsightsPanel REPS={REPS} ctx={ctx} agencyRules={agencyRules} onEdit={() => setShowRules(true)}/>
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
          // Daily target: agency_config.daily_target_default (cents-equivalent dollars); default 1800.
          const _cfg = (window.AgencyConfig && window.AgencyConfig.get && window.AgencyConfig.get()) || null;
          const _dailyTarget = (_cfg && _cfg.daily_target_default) || 1800;
          const targetProgress = Math.min(100, Math.round(((r.today || 0) / _dailyTarget) * 100));
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
// Score 0-100 = "fit for THIS product + THIS health profile". Encodes real
// underwriting guidelines extracted from carrier producer portals + FMO
// comparison sites; full source citations in /tmp/carrier-underwriting.json.
//
// Lives here so reps see ranked carriers mid-call AND so the owner Quote
// Tool (page-quote.jsx) can score saved quotes against the same engine.
//
// Each carrier exposes:
//   • underwriting — structured guideline metadata (visible in tooltips)
//   • fit(input) → { score, reason } — runtime ranking against a health profile
//
// Inputs: { product, age, tobacco, diabetes, bpHigh, bmi, state? }
const CARRIER_NICHES = [
  /* ─── Med Supp ───────────────────────────────────────────────────── */
  {
    id: "uhc", name: "UnitedHealthcare AARP", products: ["medsupp"],
    underwriting: {
      issueAges: [50, 99],
      tobaccoRateUpPct: 0,        // KILLER differentiator — UHC AARP famously doesn't surcharge tobacco
      cardiacLookbackMonths: 24,
      uwClasses: ["Preferred", "Standard"],
      sweetSpot: "T65 enrollees (especially smokers) and lower-cost states; AARP brand pull + steep new-enrollee discount",
      sources: ["UHC AARP Medicare Supplement Insurance Guide (insurance.aarpmedicaresupplement.com)", "boomerbenefits.com 2026 review"],
    },
    fit: (i) => {
      if (i.age < 50) return { score: 0, reason: "under issue-age 50" };
      let score = 78;
      const reasons = [];
      if (i.tobacco) { score += 18; reasons.push("0% tobacco rate-up"); }
      else                              reasons.push("AARP brand · steep T65 discount");
      if (i.age >= 65 && i.age <= 70) { score += 8; reasons.push("T65 sweet spot"); }
      if (i.bmi >= 40)                { score -= 8; reasons.push("build review"); }
      if (i.diabetes && i.bpHigh)     { score -= 6; reasons.push("diabetes + HTN combo"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "humana", name: "Humana", products: ["medsupp", "mapd"],
    underwriting: {
      issueAges: [65, 99],
      tobaccoRateUpPct: 15,
      bmiDeclineMin: 14, bmiDeclineMax: 40.5,   // hard decline outside this band
      cancerLookbackYears: 2,
      cardiacLookbackMonths: 24,
      sweetSpot: "Standard-build T65 in suburban/rural states with heavy MAPD overlap",
      sources: ["Humana Med Supp Underwriting Guide GNHHNV6EN"],
    },
    fit: (i) => {
      if (i.age < 65 && i.product === "medsupp") return { score: 0, reason: "Med Supp issue-age 65+" };
      if (i.product === "mapd") return { score: 70, reason: "guaranteed-issue during AEP/IEP — no health UW" };
      let score = 76;
      const reasons = [];
      if (i.bmi >= 40.5 || i.bmi <= 14) return { score: 0, reason: "outside Humana build chart 14–40.5" };
      if (i.tobacco)        { score -= 8;  reasons.push("15% tobacco rate-up"); }
      if (i.bmi >= 35)      { score -= 6;  reasons.push("upper-build band"); }
      if (i.diabetes)       { score -= 5;  reasons.push("controlled diabetes OK"); }
      else                                 reasons.push("standard-build sweet spot");
      if (i.age >= 65 && i.age <= 72) score += 6;
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "aetna", name: "Aetna SRC", products: ["medsupp"],
    underwriting: {
      issueAges: [65, 99],
      tobaccoRateUpPct: 12,
      uwClasses: ["Standard"],
      sweetSpot: "Mid-range health T65 buyers; wins on price after first re-rate cycle in attained-age states",
      sources: ["Aetna Senior Supplemental UW Guide ARLIC-1-0008"],
    },
    fit: (i) => {
      if (i.age < 65) return { score: 0, reason: "issue-age 65+" };
      let score = 74;
      const reasons = [];
      if (i.age <= 75)        { score += 6; reasons.push("strong under 75"); }
      else                    { score -= 14; reasons.push("rate spike after 75"); }
      if (i.tobacco)          { score -= 7;  reasons.push("12% tobacco rate-up"); }
      if (i.bpHigh)           { score -= 4; }
      if (i.diabetes)         { score -= 6; }
      if (i.bmi >= 38)        { score -= 8; reasons.push("build review"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") || "single-class · post-rerate winner" };
    },
  },
  {
    id: "cigna", name: "Cigna (ARLIC)", products: ["medsupp"],
    underwriting: {
      issueAges: [65, 99],
      tobaccoRateUpPct: 18,
      uwClasses: ["Preferred", "Standard", "Standard II", "Standard III"],   // 4 classes catches cases others decline
      sweetSpot: "Plan N applicants with mild substandard health — the Std II/III tiers keep cases competitors decline",
      sources: ["Cigna ARLIC Producer Guide", "Loyal American Plan N rate sheets"],
    },
    fit: (i) => {
      if (i.age < 65) return { score: 0, reason: "issue-age 65+" };
      let score = 72;
      const reasons = [];
      // 4-tier UW means Cigna keeps cases that other carriers decline.
      const subStandardCount = (i.diabetes ? 1 : 0) + (i.bpHigh ? 1 : 0) + (i.bmi >= 35 ? 1 : 0) + (i.tobacco ? 1 : 0);
      if (subStandardCount >= 2) { score += 12; reasons.push("Std II/III catches your case"); }
      else                                       reasons.push("Plan N price standout");
      if (i.tobacco)        score -= 6;
      if (i.bmi >= 40)      score -= 6;
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "moo", name: "Mutual of Omaha", products: ["medsupp", "fe"],
    underwriting: {
      issueAges: [45, 85],
      tobaccoRateUpPct: 30,
      uwClasses: ["Level", "Graded (2yr waiting)"],
      stateExclusions: { fe_level: ["NY"], fe_graded: ["MT","NC","NY"] },
      diabetesDeclineRule: "diabetes WITH complications → decline; clean controlled diabetes accepted",
      sweetSpot: "FE 50-75 with manageable conditions; benchmark FE rates on standard cases",
      sources: ["Mutual of Omaha Living Promise FE Producer Guide", "Living Promise rate sheets 2026"],
    },
    fit: (i) => {
      let score = 0;
      const reasons = [];
      if (i.product === "fe") {
        if (i.age < 45 || i.age > 85) return { score: 0, reason: "FE issue 45-85" };
        score = 80;
        if (i.diabetes && i.bpHigh)  { score -= 18; reasons.push("Graded tier · diab+HTN"); }
        else if (i.diabetes || i.bpHigh) { score -= 6; reasons.push("Level tier · controlled"); }
        else                                            reasons.push("benchmark FE rates");
        if (i.tobacco)               { score -= 9;  reasons.push("30% tobacco rate-up"); }
        if (i.bmi >= 38)             { score -= 6; }
      } else if (i.product === "medsupp") {
        if (i.age < 65) return { score: 0, reason: "Med Supp issue 65+" };
        score = 70;
        if (i.tobacco)               { score -= 8;  reasons.push("30% tobacco rate-up"); }
        else                                         reasons.push("household discount available");
      }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  /* ─── Final Expense (life) ───────────────────────────────────────── */
  {
    id: "lumico", name: "Lumico (Swiss Re)", products: ["fe"],
    underwriting: {
      issueAges: [50, 85],
      tobaccoRateUpPct: 25,
      uwClasses: ["Preferred Non-Tobacco", "Preferred Tobacco", "Standard Non-Tobacco", "Standard Tobacco", "Modified (Unismoker)"],
      buildChart: "unisex — wins for healthy female smokers + average-build males",
      sweetSpot: "55-75 good-fair health $10K-$30K face",
      sources: ["Lumico Simplified Issue FE UW Guide LUM-SIFE-UWGuide-2021-006"],
    },
    fit: (i) => {
      if (i.product !== "fe") return { score: 0, reason: "FE only" };
      if (i.age < 50 || i.age > 85) return { score: 0, reason: "FE issue 50-85" };
      let score = 76;
      const reasons = [];
      if (i.tobacco && i.age >= 55 && i.age <= 75) { score += 8; reasons.push("unisex chart helps tobacco"); }
      else if (i.tobacco)                                             score -= 4;
      if (i.diabetes && i.bpHigh)  { score -= 10; reasons.push("Modified class · 2-condition"); }
      if (i.bmi >= 38)             { score -= 6;  reasons.push("upper build band"); }
      if (!i.diabetes && !i.bpHigh && !i.tobacco) reasons.push("Preferred class likely");
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "aig", name: "AIG (American General Life)", products: ["fe", "term"],
    underwriting: {
      term: { tobaccoRateUpPct: 100, bmiRange: [18.5, 33], autoDecline: ["HIV+", "Type-1 Diabetes", "Organ Transplant"] },
      giwl: { faceMin: 5000, faceMax: 25000, gradedMonths: 24, healthQs: false },
      sweetSpot_term: "30-55yo non-standard term lengths (Select-a-Term has 18 durations); convertible to permanent without evidence to 70",
      sweetSpot_fe: "GIWL for health-impaired declines elsewhere; $5K–$25K with 2yr graded benefit",
      sources: ["AIG Underwriting Guide AGLC101638", "Select-a-Term product brochure"],
    },
    fit: (i) => {
      let score = 0;
      const reasons = [];
      if (i.product === "term") {
        if (i.bmi < 18.5 || i.bmi > 33) return { score: 0, reason: "outside term BMI 18.5–33" };
        score = 78;
        if (i.age >= 30 && i.age <= 55) { score += 6; reasons.push("Select-a-Term sweet spot"); }
        if (i.tobacco)        { score -= 14; reasons.push("100% tobacco rate-up"); }
        if (i.diabetes)       { score = 0; return { score, reason: "Type-1 diabetes auto-decline; Type-2 case-by-case" }; }
        if (i.bpHigh)         { score -= 5; }
      } else if (i.product === "fe") {
        score = 64;
        if (i.diabetes && i.bpHigh) { score += 14; reasons.push("GIWL no health Qs"); }
        else if (i.diabetes || i.bpHigh) { score += 6; reasons.push("GIWL fallback option"); }
        else                              reasons.push("$5K–$25K graded · 2yr");
        if (i.tobacco)        { score -= 4; }
      }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  /* ─── Corebridge Financial — spun out of AIG 2022. IUL + MYGA live here;
        legacy AIG term + GIWL stay under the aig row above. ────────── */
  {
    id: "corebridge", name: "Corebridge Financial", products: ["iul", "annuity"],
    underwriting: {
      iul:  { product: "Corebridge QoL Max Accumulator+ III", bmiRange: [18.5, 33], tobaccoLookbackMonths: 12 },
      annuity: { product: "Corebridge American Pathway Fixed 5/7 MYGA", maxIssueAge: 90 },
      sweetSpot_iul: "Accumulation IUL for 35-55 affluent clients; AU+ no-exam path up to $2M",
      sweetSpot_annuity: "Pre-retiree MYGA with 5/7-yr guaranteed rate; $100K+ premium tier earns top rates",
      sources: ["QoL Max Accumulator+ III Producer Guide", "American Pathway Fixed 5/7 rate flyer"],
    },
    fit: (i) => {
      let score = 0;
      const reasons = [];
      if (i.product === "iul") {
        if (i.bmi < 18.5 || i.bmi > 33) return { score: 0, reason: "outside IUL BMI 18.5–33" };
        score = 80;
        if (i.age >= 35 && i.age <= 55) { score += 8; reasons.push("AU+ no-exam sweet spot"); }
        if (i.tobacco)  { score -= 10; reasons.push("12mo tobacco lookback"); }
        if (i.diabetes) { score -= 8; reasons.push("diabetes case-by-case"); }
      } else if (i.product === "annuity") {
        score = 82;
        if (i.age >= 55 && i.age <= 75) { score += 6; reasons.push("MYGA pre-retiree sweet spot"); }
        if (i.age > 90)                  { return { score: 0, reason: "max issue age 90" }; }
      }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  /* ─── Annuity / IUL ──────────────────────────────────────────────── */
  {
    id: "fg", name: "F&G", products: ["annuity", "iul"],
    underwriting: {
      myga: { minPremium: 10000, mvaExcludedStates: ["MN","MO","NJ","OR","PA","UT","WA"] },
      iul: { floor: 0.0025, product: "Pathsetter" },
      sweetSpot: "Pre-retirees 55-75 with $10K-$500K rollover; consistently top-3 on MYGA rate sheets",
      sources: ["F&G Power Accumulator MYGA brochure", "Pathsetter IUL ADV2261"],
    },
    fit: (i) => {
      if (i.product !== "annuity" && i.product !== "iul") return { score: 0, reason: "annuity/IUL only" };
      let score = 86;
      const reasons = [];
      if (i.age >= 55 && i.age <= 75) { score += 6; reasons.push("pre-retiree sweet spot"); }
      if (i.product === "annuity") reasons.push("top-3 MYGA rates");
      else                          reasons.push("Pathsetter IUL · 0.25% floor");
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },

  /* ─── Newly added carriers (life-side: Term / FE / IUL) ─────────────── */
  {
    id: "transamerica", name: "Transamerica", products: ["fe", "term", "iul"],
    underwriting: {
      issueAges: { fe: [50, 85], term: [18, 80], iul: [0, 85] },
      uwClasses: ["Preferred Plus", "Preferred", "Standard Plus", "Standard", "Standard II", "Graded"],
      sweetSpot: "Trendsetter Term aggressive 30–55 healthy non-tobacco; FE GIWL fallback for substandard cases",
      sources: ["Transamerica Trendsetter Super Underwriting Guide TASE-G", "GIWL/SIWL Field Guide TPM4042"],
    },
    fit: (i) => {
      let score = 78;
      const reasons = [];
      if (i.age < 30) { score -= 6; reasons.push("term aggressive 30+"); }
      if (i.tobacco)  { score -= 8; reasons.push("tobacco rate-up"); }
      if (i.bmi >= 35) { score -= 6; reasons.push("build watch"); }
      if (i.product === "fe" && i.age >= 60) { score += 8; reasons.push("FE GIWL strong 60+"); }
      else if (i.product === "term" && i.age >= 30 && i.age <= 55) { score += 10; reasons.push("Trendsetter sweet spot"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "ethos", name: "Ethos", products: ["term"],
    underwriting: {
      issueAges: { term: [20, 65] },
      uwClasses: ["Preferred", "Standard"],
      instantIssue: { maxFace: 1500000, maxAge: 55 },   // no exam under these caps
      sweetSpot: "Healthy 25–50 buyers wanting <60 second instant issue; auto-decline above moderate health flags",
      sources: ["Ethos Life Underwriting Guide 2025"],
    },
    fit: (i) => {
      if (i.age > 65) return { score: 0, reason: "term issue-age cap 65" };
      let score = 80;
      const reasons = [];
      if (i.age <= 50 && !i.tobacco && (i.bmi || 0) < 32 && (i.flags || 0) <= 1) {
        score += 12; reasons.push("instant-issue eligible");
      } else if ((i.flags || 0) >= 2) {
        score -= 25; reasons.push("Ethos declines moderate-substandard");
      }
      if (i.tobacco) score -= 8;
      return { score, reason: reasons.slice(0, 2).join(" · ") || "digital instant issue" };
    },
  },
  {
    id: "americanamicable", name: "American Amicable", products: ["fe", "term"],
    underwriting: {
      issueAges: { fe: [50, 85], term: [18, 75] },
      uwClasses: ["Preferred Non-Tobacco", "Standard Non-Tobacco", "Preferred Tobacco", "Standard Tobacco", "Modified", "Graded"],
      sweetSpot: "Senior Choice FE — wins on Type-2 diabetes oral, controlled HBP cases other FE carriers decline",
      sources: ["American Amicable Senior Choice Field Guide AA-SCH", "Term Made Simple UW Manual"],
    },
    fit: (i) => {
      let score = 76;
      const reasons = [];
      if (i.product === "fe" && (i.diabetes || i.bpHigh)) {
        score += 10; reasons.push("Senior Choice keeps mild substandard");
      }
      if (i.tobacco) { score -= 6; reasons.push("tobacco rate-up"); }
      if (i.age >= 60 && i.age <= 80) { score += 4; reasons.push("FE sweet spot 60–80"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "instabrain", name: "Instabrain (multi)", products: ["fe", "term", "iul"],
    underwriting: {
      issueAges: { fe: [40, 85], term: [18, 75], iul: [0, 80] },
      aggregator: true,
      sweetSpot: "Use as the auto-router fallback — feeds the same profile to 12+ life carriers and surfaces the cheapest binding offer in <90 seconds",
      sources: ["Instabrain partner UW (multi-carrier aggregator)"],
    },
    fit: (i) => {
      let score = 82;
      const reasons = ["multi-carrier aggregator"];
      if ((i.flags || 0) >= 2) { score += 6; reasons.push("auto-routes to substandard-friendly carrier"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "foresters", name: "Foresters", products: ["term", "iul"],
    underwriting: {
      issueAges: { term: [18, 80], iul: [0, 80] },
      uwClasses: ["Preferred Plus", "Preferred", "Standard Plus", "Standard", "Standard II"],
      memberBenefits: true,
      sweetSpot: "Term + IUL with member benefit pull (scholarships, will kits) — wins on family-budget conscious 30–55",
      sources: ["Foresters Your Term Underwriting Guide", "Advantage Plus II IUL guide"],
    },
    fit: (i) => {
      let score = 74;
      const reasons = [];
      if (i.age >= 30 && i.age <= 55) { score += 6; reasons.push("family-stage sweet spot"); }
      if (i.tobacco) { score -= 7; reasons.push("tobacco rate-up"); }
      reasons.push("member benefits");
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  {
    id: "sbli", name: "SBLI", products: ["term"],
    underwriting: {
      issueAges: { term: [18, 75] },
      uwClasses: ["Preferred Plus Non-Tobacco", "Preferred Non-Tobacco", "Standard Plus Non-Tobacco", "Standard Non-Tobacco", "Preferred Tobacco", "Standard Tobacco"],
      sweetSpot: "Best-in-class term rates 30–50 healthy non-tobacco; consistently top-2 on Compulife rate sheets for healthy applicants",
      sources: ["SBLI 2026 Term UW Guide"],
    },
    fit: (i) => {
      let score = 80;
      const reasons = [];
      if (i.age <= 50 && !i.tobacco && (i.flags || 0) <= 1) { score += 10; reasons.push("top-2 best-class price"); }
      if (i.tobacco) score -= 6;
      if ((i.flags || 0) >= 2) { score -= 12; reasons.push("substandard not its sweet spot"); }
      return { score, reason: reasons.slice(0, 2).join(" · ") };
    },
  },
  /* ─── Americo (FE + term) — added 2026-05-19 ──────────────────────────── */
  {
    id: "americo", name: "Americo Financial", products: ["fe", "term"],
    underwriting: {
      issueAges: { fe: [50, 85], term: [20, 75] },
      uwClasses: ["Standard Non-Nicotine", "Standard Nicotine"],
      fe:   { product: "Eagle Premier / Ultra Protector", faceMax: 30000, tobaccoLookbackMonths: 12 },
      term: { product: "Continuous Protection Term (CPT)", faceMax: 450000, tobaccoLookbackMonths: 24, instantDecision: true },
      sweetSpot_fe:   "Eagle Premier Level for healthy 50-85; Ultra Protector II keeps insulin diabetics with retinopathy/neuropathy declined elsewhere; UP III GI safety-net",
      sweetSpot_term: "Simplified-issue term to $450K with no medical exam — built-in living benefits (terminal/chronic/critical) at no extra cost",
      sources: ["Americo Eagle Premier Agent Guide", "Americo Term Series Agent Guide", "Americo UW Reference Guide"],
    },
    fit: (i) => {
      const reasons = [];
      let score = 0;
      if (i.product === "fe") {
        if (i.age < 50 || i.age > 85) return { score: 0, reason: "FE issue 50-85" };
        score = 78;
        if (i.tobacco) { score -= 4; reasons.push("12mo cigarette lookback (cigars/pipe OK)"); }
        if (i.diabetes && (i.flags || 0) >= 1) { score += 8; reasons.push("UP II keeps insulin+complications"); }
        else if (!i.diabetes && !i.bpHigh) reasons.push("Eagle Premier Level full day-one DB");
      } else if (i.product === "term") {
        if (i.age < 20 || i.age > 75) return { score: 0, reason: "Term issue 20-75" };
        score = 78;
        if (i.tobacco) { score -= 8; reasons.push("24mo nicotine lookback (strict)"); }
        else reasons.push("$450K non-medical instant decision");
        if ((i.flags || 0) >= 2) { score -= 10; reasons.push("accept/reject — no substandard"); }
      }
      return { score, reason: reasons.slice(0, 2).join(" · ") || "no exam · instant decision" };
    },
  },
];

const PRODUCT_OPTIONS = [
  { v: "medsupp", l: "Med Supp" },
  { v: "mapd",    l: "Medicare Advantage" },
  { v: "fe",      l: "Final Expense / Whole Life" },
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

// Substitute the {{lead_*}} / {{rep_*}} / {{product}} / {{state}} tokens with
// the actual values from the live call. Falls back to a humanized form of
// the token name if no value is bound, so a rep never reads "{{lead_name}}"
// out loud on a call.
function substituteTokens(body, ctx) {
  if (!body) return "";
  const lead = ctx?.lead || {};
  const me   = ctx?.me   || {};
  const map = {
    lead_name:   lead.lead || lead.name || "your lead",
    lead_first:  ((lead.lead || lead.name || "").split(" ")[0]) || "your lead",
    lead_state:  lead.state || "your state",
    product:     lead.product || "your coverage",
    rep_first:   (me.full_name || me.name || "").split(" ")[0] || "your producer",
    rep_full:    me.full_name || me.name || "your producer",
    agency:      me.agency_name || "the agency",
    n_orgs:      "8",       // CMS template count — replace with real number when carriers are wired
    n_plans:     "32",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, k) => {
    const v = map[k.toLowerCase()];
    return v != null ? v : full;
  });
}

function InCallScripts({ lead }) {
  // Reads agency-shared scripts from AppData.SCRIPTS_LIB (migration 0010);
  // falls back to FALLBACK_SCRIPTS for empty agencies / offline use.
  // Live token substitution: {{lead_name}} → "Cheryl" using the active call lead.
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
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const ctx = { lead, me: meIdent };
  const liveScripts = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
  const scripts = liveScripts.length > 0 ? liveScripts : (window.isDemoAgency && window.isDemoAgency() ? FALLBACK_SCRIPTS : []);
  const [openId, setOpenId] = React.useState(null);
  const [q, setQ]           = React.useState("");
  const filtered = scripts.filter(s => !q || s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()));
  const copy = (s) => {
    try { navigator.clipboard.writeText(substituteTokens(s.body, ctx)); window.toast && window.toast("Script copied (with lead name swapped in)", "success"); }
    catch (_e) {}
  };
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
                  {substituteTokens(s.body, ctx)}
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

/* ─────────────────────────────────────────────────────────────────────────
   InCallQuoteAssist — auto-populating quote panel for live calls.

   Subscribes to `transcript:segment` events (from LiveTranscriber) and
   regex-extracts health/demographic attributes from caller utterances,
   maintaining a running quote profile. Each new segment triggers a
   RateEngine.calculatePremium pass across appointed carriers, ranked by
   monthly premium ascending.

   The "missing info" panel surfaces what's still unknown — drives the rep to
   ask the next high-leverage question to refine the quote ("ask if she's on
   any heart meds — would unlock 2 more carriers").

   Falls back to manual mode if no transcript flowing (no OPENAI_API_KEY etc.)
   ───────────────────────────────────────────────────────────────────────── */
function InCallQuoteAssist({ lead }) {
  const [profile, setProfile] = React.useState({
    age: null, state: lead?.state || null, gender: null, tobacco: null,
    heightInches: null, weightLbs: null,
    healthDetail: {
      diabetesType: null, bpHigh: null, cholesterolHigh: null,
      sleepApnea: null, copd: null, cancerWindow: null, cardiacWindow: null,
    },
    product: lead?.product?.toLowerCase().includes("med") ? "medsupp"
           : lead?.product?.toLowerCase().includes("expense") ? "fe"
           : lead?.product?.toLowerCase().includes("annuity") ? "annuity"
           : "medsupp",
    planVariant: "G",
  });
  const [extractLog, setExtractLog] = React.useState([]);
  const [manualOpen, setManualOpen] = React.useState(false);

  const niches = window.CARRIER_NICHES || [];

  // Reset profile when lead changes (next call in autodial)
  React.useEffect(() => {
    setProfile(p => ({ ...p, age: null, tobacco: null,
      healthDetail: { diabetesType: null, bpHigh: null, cholesterolHigh: null,
        sleepApnea: null, copd: null, cancerWindow: null, cardiacWindow: null }}));
    setExtractLog([]);
  }, [lead && lead.id]);

  // ── Extraction patterns ─────────────────────────────────────────────────
  const STATE_NAME_TO_CODE = {
    alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA",
    colorado:"CO", connecticut:"CT", delaware:"DE", florida:"FL", georgia:"GA",
    hawaii:"HI", idaho:"ID", illinois:"IL", indiana:"IN", iowa:"IA", kansas:"KS",
    kentucky:"KY", louisiana:"LA", maine:"ME", maryland:"MD", massachusetts:"MA",
    michigan:"MI", minnesota:"MN", mississippi:"MS", missouri:"MO", montana:"MT",
    nebraska:"NE", nevada:"NV", "new hampshire":"NH", "new jersey":"NJ",
    "new mexico":"NM", "new york":"NY", "north carolina":"NC", "north dakota":"ND",
    ohio:"OH", oklahoma:"OK", oregon:"OR", pennsylvania:"PA", "rhode island":"RI",
    "south carolina":"SC", "south dakota":"SD", tennessee:"TN", texas:"TX",
    utah:"UT", vermont:"VT", virginia:"VA", washington:"WA", "west virginia":"WV",
    wisconsin:"WI", wyoming:"WY",
  };

  const extractFromText = (text) => {
    const t = text.toLowerCase();
    const updates = {};
    const log = [];

    // Age — "I'm 67" / "67 years old" / "I'll be 65"
    const ageMatch = t.match(/\b(?:i'?m|i am|i'll be|she'?s|he'?s|she is|he is|turning)\s+(\d{2})\b/) || t.match(/\b(\d{2})\s+years?\s+old\b/);
    if (ageMatch) {
      const age = +ageMatch[1];
      if (age >= 40 && age <= 99) { updates.age = age; log.push(`age=${age}`); }
    }

    // State — full names
    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      const re = new RegExp(`\\b${name}\\b`, "i");
      if (re.test(t)) { updates.state = code; log.push(`state=${code}`); break; }
    }

    // Tobacco
    if (/\b(smok|cigarett|cigar|vap|tobacco|chew|nicotine)/.test(t)) {
      const negated = /\b(don'?t|never|no|not|quit|stopped)\s+(\w+\s+){0,3}(smok|cigarett|tobacco|vap)/.test(t);
      updates.tobacco = !negated;
      log.push(`tobacco=${!negated}`);
    }

    // Diabetes — type + meds
    if (/\b(diabet|a1c|sugar)/.test(t)) {
      const detail = {};
      if (/\btype\s*1\b|insulin[- ]dependent/.test(t)) detail.diabetesType = "type1";
      else if (/\binsulin\b/.test(t)) detail.diabetesType = "type2_insulin";
      else if (/\bmetformin|jardiance|ozempic|trulicity|januvia\b/.test(t)) detail.diabetesType = "type2_oral";
      else if (/\btype\s*2\b/.test(t)) detail.diabetesType = "type2_oral";
      else if (/\bdiabet/.test(t)) detail.diabetesType = "type2_oral";
      if (detail.diabetesType) { updates.healthDetail = detail; log.push(`diabetes=${detail.diabetesType}`); }
    }

    // BP / hypertension
    if (/\b(blood pressure|hypertens|lisinopril|amlodipine|losartan|hctz|metoprolol)/.test(t)) {
      const hd = updates.healthDetail || {};
      hd.bpHigh = /\buncontrolled|high\b/.test(t) ? "uncontrolled" : "controlled";
      updates.healthDetail = hd;
      log.push(`bp=${hd.bpHigh}`);
    }

    // Cholesterol
    if (/\b(cholester|statin|lipitor|crestor|atorvastatin|rosuvastatin)/.test(t)) {
      const hd = updates.healthDetail || {};
      hd.cholesterolHigh = true;
      updates.healthDetail = hd;
      log.push(`cholesterol=high`);
    }

    // Cardiac
    if (/\b(heart attack|stent|bypass|cabg|cardiac|stroke|af[ib]?b?|atrial fib)/.test(t)) {
      const hd = updates.healthDetail || {};
      // Look for time markers
      if (/\b(last (week|month)|recent|just had|few months ago|6 months)/.test(t)) hd.cardiacWindow = "<12mo";
      else if (/\b(last year|year ago|18 months|two years|2 years)/.test(t))        hd.cardiacWindow = "12-24mo";
      else                                                                            hd.cardiacWindow = ">24mo";
      updates.healthDetail = hd;
      log.push(`cardiac=${hd.cardiacWindow}`);
    }

    // Cancer
    if (/\b(cancer|chemo|radiation|tumor|lymphoma|leukemia|carcinoma)/.test(t)) {
      const hd = updates.healthDetail || {};
      if (/\bcurrent|active|just diagnosed|chemo|radiation\b/.test(t))   hd.cancerWindow = "active";
      else if (/\b(last year|year ago|18 months)/.test(t))                hd.cancerWindow = "<2y";
      else if (/\b(2 years|3 years|4 years|5 years)/.test(t))             hd.cancerWindow = "2-5y";
      else                                                                 hd.cancerWindow = "5y+";
      updates.healthDetail = hd;
      log.push(`cancer=${hd.cancerWindow}`);
    }

    // COPD
    if (/\b(copd|emphysema|chronic bronchit)/.test(t)) {
      const hd = updates.healthDetail || {};
      hd.copd = true;
      updates.healthDetail = hd;
      log.push(`copd=true`);
    }

    // Sleep apnea
    if (/\b(sleep apnea|cpap)/.test(t)) {
      const hd = updates.healthDetail || {};
      hd.sleepApnea = /cpap/.test(t) ? "cpap" : "untreated";
      updates.healthDetail = hd;
      log.push(`sleepApnea=${hd.sleepApnea}`);
    }

    // Height — "five foot five" / "5'5\"" / "5 foot 7"
    const htMatch = t.match(/\b(\d)\s*['']\s*(\d{1,2})\b/) || t.match(/\b(\d)\s*foot\s*(\d{1,2})\b/) || t.match(/\b(five|six)\s+(foot|feet)\s+(\w+)\b/);
    if (htMatch) {
      const ft = htMatch[1] === "five" ? 5 : htMatch[1] === "six" ? 6 : +htMatch[1];
      const inches = (typeof htMatch[2] === "string" && isNaN(+htMatch[2])) ? null : +(htMatch[2] || htMatch[3]);
      if (ft && inches != null && !isNaN(inches)) {
        updates.heightInches = ft * 12 + inches;
        log.push(`height=${ft}'${inches}"`);
      }
    }

    // Weight
    const wtMatch = t.match(/\b(\d{2,3})\s*(?:lbs|pounds|lb\.)/);
    if (wtMatch) { updates.weightLbs = +wtMatch[1]; log.push(`weight=${wtMatch[1]}lbs`); }

    return { updates, log };
  };

  // Subscribe to transcript stream
  React.useEffect(() => {
    const onSeg = (e) => {
      const seg = e.detail;
      if (!seg || !seg.text) return;
      const { updates, log } = extractFromText(seg.text);
      if (Object.keys(updates).length === 0) return;
      setProfile(p => {
        const next = { ...p };
        if (updates.age != null && p.age == null)         next.age = updates.age;
        if (updates.state)                                 next.state = updates.state;
        if (updates.tobacco != null && p.tobacco == null)  next.tobacco = updates.tobacco;
        if (updates.heightInches)                          next.heightInches = updates.heightInches;
        if (updates.weightLbs)                             next.weightLbs = updates.weightLbs;
        if (updates.healthDetail) {
          next.healthDetail = { ...p.healthDetail };
          for (const k of Object.keys(updates.healthDetail)) {
            if (next.healthDetail[k] == null || updates.healthDetail[k] != null) {
              next.healthDetail[k] = updates.healthDetail[k];
            }
          }
        }
        return next;
      });
      if (log.length > 0) setExtractLog(prev => [...prev.slice(-9), { t: seg.t || 0, log: log.join(" · ") }]);
    };
    window.addEventListener("transcript:segment", onSeg);
    return () => window.removeEventListener("transcript:segment", onSeg);
  }, []);

  // Compute live BMI + ranked quotes
  const bmi = window.RateEngine?.bmiFrom?.(profile.heightInches, profile.weightLbs);
  const profileForEngine = {
    ...profile,
    bmi,
    // Default unknown booleans to false-ish for engine compatibility
    tobacco: profile.tobacco === true,
    healthDetail: {
      diabetesType:    profile.healthDetail.diabetesType    || "none",
      bpHigh:          profile.healthDetail.bpHigh          || "none",
      cholesterolHigh: !!profile.healthDetail.cholesterolHigh,
      sleepApnea:      profile.healthDetail.sleepApnea      || "none",
      copd:            !!profile.healthDetail.copd,
      cancerWindow:    profile.healthDetail.cancerWindow    || "none",
      cardiacWindow:   profile.healthDetail.cardiacWindow   || "none",
    },
  };

  const ready = profile.age != null;
  const ranked = React.useMemo(() => {
    if (!ready || !window.RateEngine) return [];
    const eligible = niches.filter(c => c.products.includes(profile.product));
    const results = eligible.map(carrier => {
      if (profile.product === "annuity") {
        const a = window.RateEngine.calculateAnnuityYield(carrier, profileForEngine);
        return a ? { carrier, ...a, displayValue: `${a.apy}% APY`, decline: false } : { carrier, decline: true, reason: "no annuity" };
      }
      const r = window.RateEngine.calculatePremium(carrier, profile.product, profileForEngine);
      if (r.decline) return { carrier, decline: true, reason: r.reason };
      return { carrier, premium: r.premium, uwClass: r.uwClass, displayValue: `$${r.premium}/mo`, decline: false };
    });
    return results.sort((a, b) => {
      if (a.decline !== b.decline) return a.decline ? 1 : -1;
      return (a.premium || 0) - (b.premium || 0);
    });
  }, [JSON.stringify(profileForEngine), niches.length, ready]);

  // Missing info nudges — what should the rep ask next?
  const nudges = [];
  if (profile.age == null)                           nudges.push("Confirm age — base rate band depends on it");
  if (profile.tobacco == null)                       nudges.push("Ask: any tobacco use? UHC AARP has 0% rate-up — huge if yes");
  if (profile.heightInches == null || profile.weightLbs == null) nudges.push("Ask height + weight — Humana hard-declines outside BMI 14–40.5");
  if (profile.healthDetail.diabetesType == null)     nudges.push("Ask: any diabetes? Type-1 is auto-decline, insulin moves to Std II/Modified");
  if (profile.healthDetail.cardiacWindow == null && profile.age >= 60) nudges.push("Ask about heart history — recent MI/stent declines on most med supp");

  const quoted = ranked.filter(r => !r.decline);
  const declined = ranked.filter(r => r.decline);

  // GAP — save the current quote snapshot to the lead via lead_quotes (migration 0013)
  const saveQuote = async () => {
    const me = window.me && window.me();
    try {
      await window.AppData.mutate.leadQuoteSave({
        leadId: lead?.id || null,
        repId: me?.rep_id,
        product: profile.product,
        inputs: { age: profile.age, state: profile.state, tobacco: profile.tobacco, bmi, healthDetail: profile.healthDetail, planVariant: profile.planVariant },
        ranked: quoted.map(r => ({ carrierId: r.carrierId, name: r.name, score: r.score, reason: r.reason, premium: r.premium || null })),
        recommendedCarrierId: quoted[0]?.carrierId || null,
      });
      window.toast && window.toast("Quote saved to lead", "success");
    } catch (e) { window.toast?.(`Quote save failed: ${e?.message || e}`, "error"); console.error("[queue.leadQuoteSave]", e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Auto-extracted profile preview */}
      <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Icons.Sparkles size={11} style={{ color: "var(--accent-money)" }}/>
          <strong style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Auto-extracted</strong>
          <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 10, padding: "2px 6px" }} onClick={saveQuote} disabled={!quoted.length} title={quoted.length ? "Save this quote to the lead's record" : "No quote yet"}>
            <Icons.Check size={10}/> Save to lead
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setManualOpen(o => !o)}>
            {manualOpen ? "Hide" : "Edit"}
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 10.5 }}>
          <span className={`chip ${profile.age != null ? "chip-money" : ""}`}>age {profile.age || "?"}</span>
          <span className={`chip ${profile.state ? "chip-money" : ""}`}>{profile.state || "state ?"}</span>
          <span className={`chip ${profile.tobacco != null ? "chip-money" : ""}`}>{profile.tobacco === true ? "tobacco" : profile.tobacco === false ? "non-tobacco" : "tobacco?"}</span>
          {bmi && <span className={`chip ${bmi >= 14 && bmi <= 40 ? "chip-money" : "chip-status"}`}>BMI {bmi.toFixed(1)}</span>}
          {profile.healthDetail.diabetesType && <span className="chip">{profile.healthDetail.diabetesType.replace("_", " ")}</span>}
          {profile.healthDetail.bpHigh && <span className="chip">BP {profile.healthDetail.bpHigh}</span>}
          {profile.healthDetail.cholesterolHigh && <span className="chip">↑chol</span>}
          {profile.healthDetail.cardiacWindow && profile.healthDetail.cardiacWindow !== "none" && <span className="chip chip-status">cardiac {profile.healthDetail.cardiacWindow}</span>}
          {profile.healthDetail.cancerWindow && profile.healthDetail.cancerWindow !== "none" && <span className="chip chip-status">cancer {profile.healthDetail.cancerWindow}</span>}
          {profile.healthDetail.copd && <span className="chip chip-status">COPD</span>}
        </div>
        {manualOpen && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Shared.Field label="Age">
              <input className="text-input" type="number" value={profile.age || ""} onChange={(e) => setProfile(p => ({ ...p, age: +e.target.value || null }))}/>
            </Shared.Field>
            <Shared.Field label="State">
              <input className="text-input" value={profile.state || ""} onChange={(e) => setProfile(p => ({ ...p, state: e.target.value.toUpperCase() }))} placeholder="TX"/>
            </Shared.Field>
            <Shared.Field label="Tobacco">
              <Shared.Select value={profile.tobacco === true ? "yes" : profile.tobacco === false ? "no" : "?"}
                onChange={(v) => setProfile(p => ({ ...p, tobacco: v === "yes" ? true : v === "no" ? false : null }))}
                options={[{v:"?",l:"unknown"},{v:"no",l:"non-tobacco"},{v:"yes",l:"tobacco"}]}/>
            </Shared.Field>
            <Shared.Field label="Plan (medsupp)">
              <Shared.Select value={profile.planVariant} onChange={(v) => setProfile(p => ({ ...p, planVariant: v }))}
                options={[{v:"G",l:"Plan G"},{v:"N",l:"Plan N"}]}/>
            </Shared.Field>
          </div>
        )}
      </div>

      {/* Ranked quotes */}
      {!ready ? (
        <div style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>
          Listening for age + state to start quoting…<br/>
          Mention a number near "old" or "I'm" and I'll start ranking carriers.
        </div>
      ) : quoted.length === 0 ? (
        <div style={{ padding: 14, background: "color-mix(in oklch, var(--state-danger) 10%, var(--bg-raised))", borderRadius: 6, fontSize: 12, color: "var(--state-danger)", lineHeight: 1.5 }}>
          All appointed carriers declined this profile. Check declines below for the reason — may need GIWL fallback (AIG).
        </div>
      ) : (
        <div style={{ background: "var(--bg-raised)", borderRadius: 6, padding: 6 }}>
          {quoted.slice(0, 5).map((r, i) => (
            <div key={r.carrier.id} style={{
              display: "grid", gridTemplateColumns: "1fr 70px 80px",
              padding: "8px 10px", marginBottom: 3,
              background: i === 0 ? "color-mix(in oklch, var(--accent-money) 12%, transparent)" : "transparent",
              borderRadius: 4, alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{r.carrier.name}
                  {i === 0 && <span className="chip chip-money" style={{ marginLeft: 6, fontSize: 9.5 }}>cheapest</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>{r.uwClass || "—"}</div>
              </div>
              <div className="tabular" style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "var(--accent-money)" : "var(--text-primary)", textAlign: "right" }}>
                {r.displayValue}
              </div>
              <div style={{ textAlign: "right" }}>
                <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 6px" }}
                  onClick={() => window.toast && window.toast(`Lock-in ${r.carrier.name} ${r.displayValue} — start app`, "success")}>
                  Lock in
                </button>
              </div>
            </div>
          ))}
          {declined.length > 0 && (
            <div style={{ marginTop: 6, padding: "6px 10px", fontSize: 10.5, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
              {declined.length} declined: {declined.map(r => r.carrier.name.split(" ")[0]).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Missing info nudges */}
      {nudges.length > 0 && (
        <div style={{ padding: 10, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 30%, transparent)", borderRadius: 6, fontSize: 11.5, color: "var(--text-primary)", lineHeight: 1.5 }}>
          <div style={{ fontSize: 10.5, color: "var(--accent-status)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Ask next
          </div>
          {nudges.slice(0, 2).map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      )}

      {/* Extraction log — debug visibility */}
      {extractLog.length > 0 && (
        <details style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
          <summary style={{ cursor: "pointer" }}>extraction log ({extractLog.length})</summary>
          <div style={{ marginTop: 4, paddingLeft: 8 }}>
            {extractLog.map((e, i) => (
              <div key={i} className="mono" style={{ fontSize: 10 }}>{e.t}: {e.log}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* Live call transcript — subscribes to live_transcript_segments via Supabase
   realtime for the active call_sid. Gates:
   • No callSid → "Transcript available for Twilio-bridge calls only"
   • No segments after 15s → "No transcript yet — check DEEPGRAM_API_KEY"
   Speaker colors: rep = accent-money (green), lead = accent-status (blue) */
function LiveCallTranscript({ callSid }) {
  const [segments, setSegments]     = React.useState([]);
  const [noSignal, setNoSignal]     = React.useState(false);
  const bottomRef                   = React.useRef(null);
  const channelRef                  = React.useRef(null);

  React.useEffect(() => {
    if (!callSid) return;
    setSegments([]);
    setNoSignal(false);

    // 15-second "no signal" timer — fires if Deepgram isn't producing output
    const timer = setTimeout(() => setNoSignal(true), 15000);

    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { clearTimeout(timer); return; }

    // Fetch any segments that already exist for this call (page reload case)
    sb.from("live_transcript_segments")
      .select("id,speaker,text,is_final,ts_offset_ms,created_at")
      .eq("call_sid", callSid)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSegments(data);
          clearTimeout(timer);
          setNoSignal(false);
        }
      });

    // Realtime subscription for new segments
    const ch = sb.channel(`transcript:${callSid}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table:  "live_transcript_segments",
        filter: `call_sid=eq.${callSid}`,
      }, (payload) => {
        clearTimeout(timer);
        setNoSignal(false);
        setSegments(prev => {
          // Replace interim segment from same speaker if previous was non-final
          if (!payload.new.is_final && prev.length > 0) {
            const last = prev[prev.length - 1];
            if (!last.is_final && last.speaker === payload.new.speaker) {
              return [...prev.slice(0, -1), payload.new];
            }
          }
          return [...prev, payload.new];
        });
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      clearTimeout(timer);
      sb.removeChannel(ch);
    };
  }, [callSid]);

  // Auto-scroll to bottom on new segments
  React.useEffect(() => {
    bottomRef.current && bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  if (!callSid) {
    return (
      <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.55, background: "var(--bg-raised)", borderRadius: 6 }}>
        <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--text-secondary)" }}>Live transcript</div>
        Transcript is available for calls placed via the Twilio bridge (connector_vault).
        Direct-dial and desktop helper calls are not streamed.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
        <span className="dot dot-live" style={{ width: 6, height: 6 }}></span>
        Live transcript
        <span style={{ marginLeft: "auto", color: "var(--text-quaternary)" }}>{segments.filter(s => s.is_final).length} utterances</span>
      </div>

      {noSignal && segments.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: "var(--state-warning)", background: "color-mix(in oklch, var(--state-warning) 8%, transparent)", borderRadius: 6, lineHeight: 1.5 }}>
          No transcript signal after 15s. Check that <code className="mono" style={{ fontSize: 11 }}>DEEPGRAM_API_KEY</code> is set in Vercel env.
          Recording still saves — transcript will appear post-call via the transcription cron.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 2 }}>
          {segments.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-quaternary)", padding: "8px 0" }}>Waiting for speech…</div>
          )}
          {segments.map((seg, i) => (
            <div key={seg.id || i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                color: seg.speaker === "rep" ? "var(--accent-money)" : seg.speaker === "lead" ? "var(--accent-status)" : "var(--text-quaternary)",
              }}>{seg.speaker === "rep" ? "You" : seg.speaker === "lead" ? "Lead" : "—"}</span>
              <span style={{ fontSize: 12.5, color: seg.is_final ? "var(--text-primary)" : "var(--text-tertiary)", lineHeight: 1.5 }}>{seg.text}</span>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
      )}
    </div>
  );
}

function InCall({ onClose, lead, callSid, autodial }) {
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

  // Demo lead used by AutoDialBar / UI when caller didn't pass one in. Only
  // synthesized for the demo agency — real tenants render an empty placeholder.
  const _isDemo = !!(window.isDemoAgency && window.isDemoAgency());
  const activeLead = lead || (_isDemo
    ? { id: "demo-cheryl", lead: "Cheryl Hampton", state: "TX", product: "Med Supp Plan G" }
    : { id: "no-lead", lead: "—", state: "—", product: "—" });
  const isAutodial = autodial || (adState && adState.active);
  const stage = adState?.stage;
  const paused = adState?.paused;

  const toggleMute = () => {
    setMuted(m => !m);
    // If a Twilio Voice connection is active, mute its outbound audio track.
    try {
      const conn = window.__twActive || (window.Twilio && window.Twilio.Device && window.Twilio.Device.activeConnection && window.Twilio.Device.activeConnection());
      if (conn && typeof conn.mute === "function") conn.mute(!muted);
    } catch (e) { window.toast?.(`Mute failed: ${e?.message || e}`, "error"); console.error("[queue.twilioMute]", e); }
    window.toast && window.toast(!muted ? "Muted" : "Unmuted", "info");
  };
  const toggleHold = () => {
    setOnHold(h => !h);
    window.toast && window.toast(!onHold ? "On hold" : "Resumed", "info");
  };
  const onScheduleSOA = () => window.scheduleSOA && window.scheduleSOA(activeLead);
  const onSendAppLink = () => window.sendAppLink && window.sendAppLink(activeLead);
  const onSendSMS     = () => window.smsCompose  && window.smsCompose(activeLead, activeLead.phone);
  // Stash the active lead's pipeline id, flip Floor into Deals mode, close the
  // call modal, and navigate. DealsMode reads back from sessionStorage and
  // pre-selects the lead in DealWriteForm so the rep types AP + comp% only —
  // not the whole form. Closes the verbal-yes → logged-commission gap.
  const onWonWriteDeal = () => {
    const id = activeLead?._pipelineId || activeLead?.leadId || activeLead?.id;
    try {
      if (id) sessionStorage.setItem("repflow.dealwrite.leadId", String(id));
      sessionStorage.setItem("repflow.floor.mode", "deals");
    } catch {}
    onClose && onClose();
    setTimeout(() => { window.gotoPage && window.gotoPage("floor"); }, 60);
  };

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
              { k: "transcript",l: "Transcript" },
              { k: "detail",    l: "Lead detail" },
            ].map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} className={tab === t.k ? "btn" : "btn btn-ghost"} style={{ padding: "3px 10px" }}>{t.l}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", paddingRight: 4 }}>
            {tab === "script"     && <InCallScripts lead={activeLead}/>}
            {tab === "quote"      && <InCallQuoteAssist lead={activeLead}/>}
            {tab === "transcript" && <LiveCallTranscript callSid={callSid}/>}
            {tab === "rebuttals" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { obj: "I already have coverage", reb: "Totally fair — most folks I talk to do. The only reason I'm asking is plans changed for 2026 and a lot of carriers raised premiums. Worth a 90-second comparison so you know either way?" },
                  { obj: "It's too expensive",       reb: "Hear you on price. Let me ask — vs what you have today, or vs what feels reasonable? Because we have a tier that's $42/mo with similar drug coverage, and most people don't realize that's even an option." },
                  { obj: "Let me think about it",    reb: "Of course — what specifically would you want to think over? I'd rather walk through it now while I'm here than have you sit on questions for a week." },
                  { obj: "Send me something in the mail", reb: "Happy to. The carrier requires we run quote tool live since it pulls real plan data. Two minutes — if it's not a fit I'll mail the comparison anyway. Sound fair?" },
                ].map(r => (
                  <button
                    key={r.obj}
                    className="btn"
                    style={{ justifyContent: "flex-start", height: "auto", padding: "8px 10px", whiteSpace: "normal", textAlign: "left" }}
                    onClick={() => {
                      navigator.clipboard.writeText(r.reb).then(() => {
                        window.toast && window.toast(`Rebuttal copied: "${r.obj}"`, "success");
                      });
                    }}
                    title="Click to copy the full rebuttal to clipboard"
                  >
                    <Icons.Sparkles size={11} style={{ color: "var(--accent-money)", flexShrink: 0 }}/>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, fontSize: 12 }}>{r.obj}</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 11, lineHeight: 1.45 }}>{r.reb}</span>
                    </div>
                  </button>
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
              <button className="btn btn-primary" onClick={onWonWriteDeal} title="Close → log the deal now, pre-filled with this lead">
                <Icons.Award size={12}/> Won → Write deal
              </button>
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
window.CARRIER_NICHES   = CARRIER_NICHES;    // consumed by PageQuote (page-quote.jsx)
window.PRODUCT_OPTIONS  = PRODUCT_OPTIONS;
