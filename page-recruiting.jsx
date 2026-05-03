/* page-recruiting.jsx — Outreach workbench (replaces stub PageRecruiting in extras)

   This is the operator-grade recruiting view: 5 tabs across one workspace —
   Campaigns, Conversations, Sequences, Leads, Insights — sharing in-page
   state so a campaign card → a conversation thread → the underlying sequence
   step is one navigation away, not a context switch.

   Manager view scopes everything to "my downline" via a header chip; owner
   sees the full org. */

(function () {

const CHANNELS = ["instagram", "linkedin", "sms", "email"];
const channelChip = {
  instagram: { l: "Instagram", c: "var(--accent-heat)" },
  linkedin:  { l: "LinkedIn",  c: "var(--state-info)" },
  sms:        { l: "SMS",       c: "var(--accent-money)" },
  email:      { l: "Email",     c: "var(--text-secondary)" },
};

const SEQUENCES = [
  { id: "seq1", name: "T65 Producer · 4 touch", channel: "instagram", days: 9, active: 142, steps: [
    { day: 0, ch: "DM",       template: "Hey {{first}} — saw your reels on senior life. We just opened 4 producer slots on the Atlas team for Q2. Open to a quick gut-check?" },
    { day: 2, ch: "DM",       template: "Following up — no pressure, but we comp 90/10 on FE and our top 5 clear $50k/mo overrides. Want me to send the grid?" },
    { day: 5, ch: "Comment",   template: "Liked your last post + commented — DM coming." },
    { day: 5, ch: "DM",       template: "Big fan of how you handled the objection in your last reel. Genuine ask: who appoints you right now?" },
    { day: 9, ch: "DM",       template: "Last note from me — closing applications Friday. If you're game, here's 15 min on my calendar: atlasimo.com/apply" },
  ]},
  { id: "seq2", name: "Licensed Producer · LinkedIn", channel: "linkedin", days: 12, active: 38, steps: [
    { day: 0, ch: "Connect",   template: "Connection request: 'Atlas IMO is opening producer slots — would love to compare notes on senior insurance distribution.'" },
    { day: 1, ch: "InMail",    template: "Thanks for connecting, {{first}}. We're seeing 38% close rates on T65 — a function of speed-to-lead + Vapi. Any chance you'd entertain a 15?" },
    { day: 4, ch: "InMail",    template: "Sharing the comp grid + override structure: atlasimo.com/grid" },
    { day: 9, ch: "InMail",    template: "Closing intake Friday — any objections I haven't addressed?" },
  ]},
  { id: "seq3", name: "Inbound LP · email nurture", channel: "email", days: 14, active: 76, steps: [
    { day: 0, ch: "Email",     template: "Welcome — your producer info packet is attached." },
    { day: 1, ch: "Email",     template: "Day 1 video: 'How the Atlas comp grid actually works'" },
    { day: 4, ch: "Email",     template: "Day 4 case study: Marcus closed $42k MTD his first 30 days." },
    { day: 7, ch: "Email",     template: "Day 7: Schedule your fit interview — atlasimo.com/apply" },
    { day: 14, ch: "Email",   template: "Last call before we close intake." },
  ]},
];

const CAMPAIGNS = [
  { id: "c1", name: "T65 Producers · IG · Q2", channel: "instagram", status: "active",
    sequenceId: "seq1", owner: "marc",
    target: 200, sent: 142, replied: 38, qualified: 12, contracted: 4,
    spark: [3, 6, 9, 7, 12, 14, 11, 16, 18],
    lastActivity: "12m ago",
    spend: 1840, costPerReply: 48 },
  { id: "c2", name: "Licensed agents · LinkedIn", channel: "linkedin", status: "active",
    sequenceId: "seq2", owner: "kira",
    target: 80, sent: 38, replied: 11, qualified: 5, contracted: 2,
    spark: [1, 2, 3, 4, 5, 4, 6, 7, 8],
    lastActivity: "1h ago",
    spend: 920, costPerReply: 84 },
  { id: "c3", name: "Inbound nurture · email", channel: "email", status: "active",
    sequenceId: "seq3", owner: "marc",
    target: 500, sent: 412, replied: 76, qualified: 24, contracted: 6,
    spark: [12, 18, 22, 26, 28, 31, 35, 38, 42],
    lastActivity: "23m ago",
    spend: 240, costPerReply: 3 },
  { id: "c4", name: "Win-back · cold producers", channel: "sms", status: "paused",
    sequenceId: "seq2", owner: "dani",
    target: 60, sent: 60, replied: 8, qualified: 2, contracted: 0,
    spark: [4, 6, 5, 4, 3, 2, 1, 0, 0],
    lastActivity: "yesterday",
    spend: 180, costPerReply: 22 },
  { id: "c5", name: "Florida agents · IG · pilot", channel: "instagram", status: "draft",
    sequenceId: "seq1", owner: "kira",
    target: 100, sent: 0, replied: 0, qualified: 0, contracted: 0,
    spark: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    lastActivity: "—",
    spend: 0, costPerReply: 0 },
];

const THREADS = [
  { id: "t1", who: "Marcus Bennett", handle: "@marcb_sells", channel: "instagram", campaign: "c1",
    status: "waiting", lastTouch: "27m ago", score: 84,
    state: "TX", lic: "active", note: "Already licensed in TX. UHC + Humana appointed.",
    msgs: [
      { from: "auto",  body: "Hey Marcus — saw your reels on senior life. We just opened 4 producer slots on the Atlas team for Q2. Open to a quick gut-check?", ts: "Apr 26 · 10:14a", step: 1 },
      { from: "them",  body: "Yeah I'd entertain it. What carriers do you appoint with?",                              ts: "Apr 26 · 10:32a" },
      { from: "auto",  body: "UHC, Humana, Aetna SRC for Med Supp + Mutual of Omaha for FE. F&G for annuity.",          ts: "Apr 26 · 10:34a", step: 2 },
      { from: "them",  body: "What's the comp grid look like?",                                                          ts: "Apr 27 · 9:18a" },
    ],
    suggested: "Sending the grid now — quick preview: 90/10 on FE first-year, 75/25 on Med Supp, 7% override on team production once you hit Platinum. Want a 15 today to walk through it?" },
  { id: "t2", who: "Stacy Vasquez", handle: "@stacy.v.life", channel: "instagram", campaign: "c1",
    status: "booked", lastTouch: "1h ago", score: 92,
    state: "FL", lic: "active", note: "Was at Family First — wants out.",
    msgs: [
      { from: "auto",  body: "Hey Stacy — saw your reels on senior life. We just opened 4 producer slots on the Atlas team for Q2. Open to a quick gut-check?", ts: "Apr 26 · 8:02a", step: 1 },
      { from: "them",  body: "Yes — already licensed in FL, leaving Family First.",                                       ts: "Apr 26 · 9:14a" },
      { from: "auto",  body: "Awesome — booked you on the calendar Friday 3pm: atlasimo.com/apply.",                       ts: "Apr 26 · 9:15a", step: 2 },
      { from: "them",  body: "Confirmed. Talk Friday.",                                                                    ts: "Apr 26 · 9:17a" },
    ],
    suggested: "Confirmed Friday at 3pm. I'll send a calendar invite + the producer info packet. Anything specific you want me to prep on?" },
  { id: "t3", who: "Reggie Tann", handle: "@reggie.tnsell", channel: "instagram", campaign: "c1",
    status: "waiting", lastTouch: "3h ago", score: 71,
    state: "GA", lic: "pending", note: "Studying for license. Ex-mortgage.",
    msgs: [
      { from: "auto", body: "Hey Reggie — saw your reels on senior life...",                ts: "Apr 25 · 4:11p", step: 1 },
      { from: "them", body: "How fast do producers get paid?",                                ts: "Apr 26 · 7:48a" },
    ],
    suggested: "Carrier-dependent: most pay daily, some weekly. We pay advance on ~85% of products. Want me to send the comp grid?" },
  { id: "t4", who: "Ana Khoury", handle: "@anak_atx", channel: "linkedin", campaign: "c2",
    status: "replied", lastTouch: "30m ago", score: 78,
    state: "TX", lic: "active", note: "5 yrs in benefits. Wants to add senior.",
    msgs: [
      { from: "auto", body: "Connection: 'Atlas IMO is opening producer slots — would love to compare notes on senior insurance distribution.'", ts: "Apr 24 · 11:00a", step: 1 },
      { from: "auto", body: "Thanks for connecting, Ana. We're seeing 38% close rates on T65 — a function of speed-to-lead + Vapi. Any chance you'd entertain a 15?", ts: "Apr 24 · 11:14a", step: 2 },
      { from: "them", body: "Do you support FE plus Med Supp on one app?",                                                                    ts: "Apr 27 · 1:22p" },
    ],
    suggested: "Yes — same intake routes both, and our Speed-to-Lead Dispatcher cross-flags the second product. Cross-sell rate is the killer feature for senior. 10 min walkthrough?" },
  { id: "t5", who: "Devon Park", handle: "@devon.park", channel: "instagram", campaign: "c5",
    status: "new", lastTouch: "—", score: 88,
    state: "FL", lic: "active", note: "Top performer at SeniorLife.",
    msgs: [], suggested: "Hey Devon — saw your reels on senior life. We just opened 4 producer slots on the Atlas team for Q2. Open to a quick gut-check?" },
  { id: "t6", who: "Lila Romero", handle: "@lila.r.insure", channel: "email", campaign: "c3",
    status: "waiting", lastTouch: "yesterday", score: 66,
    state: "AZ", lic: "active", note: "Inbound from website.",
    msgs: [
      { from: "auto", body: "Welcome — your producer info packet is attached.",            ts: "Apr 26 · 9:00a", step: 1 },
      { from: "them", body: "Got it. What's the override % at Platinum?",                    ts: "Apr 27 · 7:14a" },
    ],
    suggested: "Platinum hits 7% override on team production + tier-gated lead access. Diamond bumps to 12%. Want a 15-min walkthrough of the tier ladder?" },
];

const LEAD_STAGES = ["Applied", "Contacted", "Replied", "Booked", "Contracted", "Producing"];
const LEADS = [
  { id: "l1", name: "Marcus Bennett", handle: "@marcb_sells",   ch: "instagram", stage: "Replied",     score: 84, source: "IG · T65 list",  state: "TX", lic: "active",  last: "27m ago", note: "Wants to see comp grid" },
  { id: "l2", name: "Stacy Vasquez",   handle: "@stacy.v.life",   ch: "instagram", stage: "Booked",      score: 92, source: "IG · T65 list",  state: "FL", lic: "active",  last: "1h ago",  note: "Friday 3pm call" },
  { id: "l3", name: "Reggie Tann",     handle: "@reggie.tnsell",   ch: "instagram", stage: "Replied",    score: 71, source: "IG · T65 list",  state: "GA", lic: "pending", last: "3h ago",  note: "Studying for license" },
  { id: "l4", name: "Ana Khoury",       handle: "@anak_atx",        ch: "linkedin",  stage: "Replied",    score: 78, source: "LinkedIn",        state: "TX", lic: "active",  last: "30m ago", note: "Wants cross-sell demo" },
  { id: "l5", name: "Devon Park",       handle: "@devon.park",       ch: "instagram", stage: "Applied",    score: 88, source: "IG · pilot FL",  state: "FL", lic: "active",  last: "—",       note: "Top performer at SeniorLife" },
  { id: "l6", name: "Lila Romero",       handle: "@lila.r.insure",   ch: "email",     stage: "Contacted", score: 66, source: "Inbound LP",      state: "AZ", lic: "active",  last: "yesterday",note: "Inbound from website" },
  { id: "l7", name: "Trent Hosea",       handle: "@trent.hosea",     ch: "instagram", stage: "Contracted",score: 0,  source: "IG · T65 list",  state: "OH", lic: "active",  last: "Apr 21",  note: "Onboarding · 14 of 21" },
  { id: "l8", name: "Yumi Tanaka",       handle: "@yumi.t",          ch: "linkedin",  stage: "Contracted",score: 0,  source: "LinkedIn",        state: "WA", lic: "active",  last: "Apr 18",  note: "Onboarding · 18 of 21" },
  { id: "l9", name: "Andre Walker",      handle: "@dre.walker",      ch: "instagram", stage: "Producing", score: 0,  source: "IG · T65 list",  state: "TX", lic: "active",  last: "30d",     note: "First $5k AP issued" },
  { id: "l10", name: "Crystal Pate",      handle: "@crystal.p",       ch: "instagram", stage: "Producing", score: 0,  source: "IG · T65 list",  state: "GA", lic: "active",  last: "12d",     note: "On track for Gold" },
];

const STATUS_COLOR = { active: "var(--accent-money)", paused: "var(--state-warning)", draft: "var(--text-tertiary)" };
const STATUS_LABEL = { active: "Active", paused: "Paused", draft: "Draft" };

function ChannelChip({ channel, compact }) {
  const c = channelChip[channel] || channelChip.email;
  return <span className="chip" style={{ color: c.c, borderColor: `color-mix(in oklch, ${c.c} 30%, transparent)`, background: `color-mix(in oklch, ${c.c} 10%, transparent)` }}>{compact ? c.l[0] : c.l}</span>;
}

function MiniSparkline({ data, color = "var(--accent-money)" }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data, 1), min = Math.min(...data);
  const range = Math.max(1, max - min);
  const w = 80, h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
function PageRecruiting({ role = "owner" }) {
  const [tab, setTab] = React.useState("campaigns");
  const [activeCampaignId, setActiveCampaignId] = React.useState(null);
  const [activeThreadId,   setActiveThreadId]   = React.useState(THREADS[0].id);
  const [activeSeqId,      setActiveSeqId]      = React.useState(SEQUENCES[0].id);
  const [composeOpen,      setComposeOpen]      = React.useState(false);
  const [newCampOpen,      setNewCampOpen]      = React.useState(false);

  // For mgr: pretend to filter to their downline (in real app, by upline ancestry)
  const scopeLabel = role === "manager" ? "My downline" : "Atlas IMO";

  // Conversation activity stats for header
  const waiting = THREADS.filter(t => t.status === "waiting").length;
  const newCount = THREADS.filter(t => t.status === "new").length;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Recruiting</div>
          <div className="page-sub">{scopeLabel} · {CAMPAIGNS.filter(c => c.status === "active").length} active campaigns · {waiting} threads waiting · {newCount} new prospects</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setComposeOpen(true)}><Icons.MessageSquare size={13}/> New message</button>
          <button className="btn btn-primary" onClick={() => setNewCampOpen(true)}><Icons.Plus size={13}/> New campaign</button>
        </div>
      </div>

      <Shared.SectionPill
        items={[
          { k: "campaigns",     l: "Campaigns",     badge: CAMPAIGNS.length },
          { k: "conversations", l: "Conversations", badge: THREADS.length },
          { k: "sequences",     l: "Sequences",     badge: SEQUENCES.length },
          { k: "leads",         l: "Leads",         badge: LEADS.length },
          { k: "insights",      l: "Insights" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ display: "none" }}>{/* legacy rec-tabs marker */}
      </div>

      {tab === "campaigns"     && <CampaignsTab onOpen={(id) => { setActiveCampaignId(id); setTab("campaign-detail"); }}/>}
      {tab === "campaign-detail" && <CampaignDetail id={activeCampaignId} onBack={() => setTab("campaigns")} onThread={(id) => { setActiveThreadId(id); setTab("conversations"); }} onSequence={(id) => { setActiveSeqId(id); setTab("sequences"); }}/>}
      {tab === "conversations" && <ConversationsTab activeId={activeThreadId} onSelect={setActiveThreadId}/>}
      {tab === "sequences"     && <SequencesTab activeId={activeSeqId} onSelect={setActiveSeqId}/>}
      {tab === "leads"         && <LeadsTab onConverse={(name) => { const t = THREADS.find(t => t.who === name); if (t) { setActiveThreadId(t.id); setTab("conversations"); } }}/>}
      {tab === "insights"      && <InsightsTab/>}

      {composeOpen && <ComposeMessage onClose={() => setComposeOpen(false)}/>}
      {newCampOpen && <NewCampaignWizard onClose={() => setNewCampOpen(false)}/>}
    </div>
  );
}

/* ─── Tab: Campaigns ─────────────────────────────────────────────────────── */
function CampaignsTab({ onOpen }) {
  const [filter, setFilter] = React.useState({ ch: "all", status: "all" });
  const visible = CAMPAIGNS.filter(c =>
    (filter.ch === "all" || c.channel === filter.ch) &&
    (filter.status === "all" || c.status === filter.status)
  );

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Shared.Select value={filter.ch}     onChange={(v) => setFilter({ ...filter, ch: v })}     options={[{ v: "all", l: "All channels" }, ...CHANNELS.map(c => ({ v: c, l: channelChip[c].l }))]}/>
        <Shared.Select value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} options={[{ v: "all", l: "All statuses" }, { v: "active", l: "Active" }, { v: "paused", l: "Paused" }, { v: "draft", l: "Draft" }]}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {visible.map(c => {
          const replyRate   = c.sent ? (c.replied / c.sent) * 100 : 0;
          const qualRate     = c.replied ? (c.qualified / c.replied) * 100 : 0;
          const contractRate = c.qualified ? (c.contracted / c.qualified) * 100 : 0;
          return (
            <button key={c.id} className="panel" style={{ textAlign: "left", padding: 0, cursor: "pointer", border: "1px solid var(--border-subtle)" }} onClick={() => onOpen(c.id)}>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{c.name}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <ChannelChip channel={c.channel}/>
                      <span style={{ fontSize: 11, color: STATUS_COLOR[c.status], display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span className="dot" style={{ background: STATUS_COLOR[c.status] }}></span>
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {c.lastActivity}</span>
                    </div>
                  </div>
                  <MiniSparkline data={c.spark}/>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 14 }}>
                  {[
                    { l: "Sent",       v: c.sent },
                    { l: "Replied",    v: c.replied,    color: "var(--accent-money)" },
                    { l: "Qualified",  v: c.qualified,  color: "var(--accent-status)" },
                    { l: "Contracted", v: c.contracted, color: "var(--accent-money)" },
                  ].map((k, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
                      <div className="tabular" style={{ fontWeight: 500, fontSize: 16, color: k.color }}>{k.v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>Sent {c.sent} / {c.target}</span>
                  <span className="tabular">{replyRate.toFixed(1)}% reply</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-raised)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${(c.sent / c.target) * 100}%`, height: "100%", background: STATUS_COLOR[c.status] }}></div>
                </div>

                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>Cost / reply</span>
                  <span className="tabular" style={{ fontWeight: 500 }}>${c.costPerReply}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─── Tab: Campaign detail (drilled in) ──────────────────────────────────── */
function CampaignDetail({ id, onBack, onThread, onSequence }) {
  const c = CAMPAIGNS.find(x => x.id === id) || CAMPAIGNS[0];
  const seq = SEQUENCES.find(s => s.id === c.sequenceId);
  const threads = THREADS.filter(t => t.campaign === c.id);
  const owner = AppData.REPS.find(r => r.id === c.owner);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={onBack}>← All campaigns</button>
        <div style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{c.name}</div>
        <ChannelChip channel={c.channel}/>
        <span style={{ fontSize: 11.5, color: STATUS_COLOR[c.status] }}>● {STATUS_LABEL[c.status]}</span>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Sent"      value={c.sent}/>
        <Shared.KpiCard      label="Replied"   value={c.replied}    sub={c.sent ? `${((c.replied / c.sent) * 100).toFixed(1)}%` : "—"} trend="up"/>
        <Shared.KpiCard      label="Qualified" value={c.qualified}/>
        <Shared.KpiCard      label="Contracted" value={c.contracted}/>
        <Shared.KpiCard      label="Cost / reply" prefix="$" value={c.costPerReply}/>
      </div>

      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><Icons.Workflow size={13}/><h3>Sequence · {seq?.name}</h3>
            <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => onSequence(seq.id)}>Edit</button>
          </div>
          <div style={{ padding: 12 }}>
            {seq?.steps.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 60px 1fr", gap: 10, padding: "10px 0", borderBottom: i < seq.steps.length - 1 ? "1px solid var(--border-subtle)" : 0, alignItems: "start" }}>
                <span className="tabular mono" style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>D+{s.day}</span>
                <span className="chip">{s.ch}</span>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{s.template}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><Icons.MessageSquare size={13}/><h3>Recent activity</h3><span className="meta">{threads.length} threads</span></div>
          <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {threads.map(t => (
              <button key={t.id} onClick={() => onThread(t.id)} className="btn btn-ghost" style={{ justifyContent: "stretch", padding: "10px 12px", flexDirection: "column", alignItems: "stretch", gap: 4, background: "var(--bg-raised)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 12.5 }}>{t.who}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t.lastTouch}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className={`chip ${t.status === "booked" ? "chip-money" : t.status === "replied" ? "chip-info" : t.status === "waiting" ? "chip-status" : ""}`}>{t.status}</span>
                  <span className="cell-truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.msgs[t.msgs.length - 1]?.body || "—"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><Icons.Settings size={13}/><h3>Settings</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <Shared.Field label="Owner"><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Shared.Avatar rep={owner} size={20}/><span>{owner?.name}</span></div></Shared.Field>
          <Shared.Field label="Daily send cap"><input className="text-input" defaultValue="40 / day"/></Shared.Field>
          <Shared.Field label="Throttle"><input className="text-input" defaultValue="3-7 min between sends"/></Shared.Field>
          <Shared.Field label="Stop conditions"><input className="text-input" defaultValue="Reply, opt-out, booked"/></Shared.Field>
          <Shared.Field label="Audience size"><div className="tabular" style={{ fontSize: 14, fontWeight: 500 }}>{c.target.toLocaleString()}</div></Shared.Field>
          <Shared.Field label="Spend"><div className="tabular" style={{ fontSize: 14, fontWeight: 500 }}>${c.spend.toLocaleString()}</div></Shared.Field>
        </div>
        <div style={{ padding: "0 14px 14px", display: "flex", gap: 8 }}>
          {c.status === "active"
            ? <button className="btn"><Icons.Pause size={12}/> Pause</button>
            : c.status === "paused"
              ? <button className="btn btn-primary"><Icons.Play size={12}/> Resume</button>
              : <button className="btn btn-primary"><Icons.Play size={12}/> Launch</button>}
          <button className="btn">Duplicate</button>
          <button className="btn btn-ghost" style={{ color: "var(--state-danger)" }}>Archive</button>
        </div>
      </div>
    </>
  );
}

/* ─── Tab: Conversations ─────────────────────────────────────────────────── */
function ConversationsTab({ activeId, onSelect }) {
  const [filter, setFilter] = React.useState({ ch: "all", status: "all", campaign: "all" });
  const visible = THREADS.filter(t =>
    (filter.ch       === "all" || t.channel  === filter.ch) &&
    (filter.status   === "all" || t.status    === filter.status) &&
    (filter.campaign === "all" || t.campaign === filter.campaign)
  );
  const t = visible.find(x => x.id === activeId) || visible[0];

  return (
    <div className="convo-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr 280px", gap: 14, height: "calc(100vh - 280px)", minHeight: 540 }}>
      {/* Thread list */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panel-h" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <Shared.Select value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} options={[{ v: "all", l: "All status" }, { v: "new", l: "New" }, { v: "waiting", l: "Waiting on me" }, { v: "replied", l: "Replied" }, { v: "booked", l: "Booked" }]}/>
            <Shared.Select value={filter.ch}     onChange={(v) => setFilter({ ...filter, ch: v })}     options={[{ v: "all", l: "All channels" }, ...CHANNELS.map(c => ({ v: c, l: channelChip[c].l }))]}/>
          </div>
          <Shared.Select value={filter.campaign} onChange={(v) => setFilter({ ...filter, campaign: v })} options={[{ v: "all", l: "All campaigns" }, ...CAMPAIGNS.map(c => ({ v: c.id, l: c.name }))]}/>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
          {visible.map(th => (
            <button key={th.id} onClick={() => onSelect(th.id)} className="btn btn-ghost" style={{ width: "100%", padding: 10, marginBottom: 4, justifyContent: "stretch", flexDirection: "column", alignItems: "stretch", gap: 4, background: th.id === activeId ? "var(--bg-overlay)" : "transparent", border: "1px solid " + (th.id === activeId ? "var(--border-strong)" : "transparent") }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: 12.5 }}>{th.who}</strong>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{th.lastTouch}</span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <ChannelChip channel={th.channel} compact/>
                <span className={`chip ${th.status === "booked" ? "chip-money" : th.status === "waiting" ? "chip-status" : th.status === "new" ? "chip-info" : ""}`} style={{ fontSize: 10 }}>{th.status}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-quaternary)" }}>· score {th.score}</span>
              </div>
              <div className="cell-truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{th.msgs[th.msgs.length - 1]?.body || "(no messages yet)"}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread detail */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ConversationDetail thread={t}/>
      </div>

      {/* Lead profile sidebar */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ConversationProfile thread={t}/>
      </div>
    </div>
  );
}

function ConversationDetail({ thread }) {
  const [draft, setDraft] = React.useState("");
  React.useEffect(() => { setDraft(thread?.suggested || ""); }, [thread?.id]);
  if (!thread) return <div style={{ padding: 24, color: "var(--text-tertiary)" }}>Pick a conversation</div>;

  return (
    <>
      <div className="panel-h">
        <strong style={{ fontSize: 13 }}>{thread.who}</strong>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{thread.handle}</span>
        <ChannelChip channel={thread.channel}/>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="btn btn-ghost"><Icons.Calendar size={11}/> Book call</button>
          <button className="btn btn-ghost"><Icons.Sparkles size={11}/> Insert grid</button>
          <button className="icon-btn"><Icons.Dots size={13}/></button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {thread.msgs.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            <Icons.Sparkles size={18} style={{ color: "var(--accent-money)" }}/>
            <div style={{ marginTop: 6 }}>No messages yet — sequence will start on send</div>
          </div>
        )}
        {thread.msgs.map((m, i) => {
          const me = m.from !== "them";
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: me ? "flex-end" : "flex-start", gap: 4 }}>
              <div style={{ maxWidth: "78%", padding: "10px 12px", borderRadius: 10, background: me ? "color-mix(in oklch, var(--accent-money) 14%, transparent)" : "var(--bg-raised)", border: me ? "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" : "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5 }}>
                {m.body}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", display: "flex", gap: 6 }}>
                <span>{m.ts}</span>
                {m.from === "auto" && <span className="chip" style={{ fontSize: 9, padding: "1px 6px" }}>auto · step {m.step}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {thread.suggested && (
        <div style={{ padding: 10, margin: "0 14px", border: "1px dashed var(--border-strong)", borderRadius: 8, background: "color-mix(in oklch, var(--accent-money) 4%, transparent)" }}>
          <div style={{ fontSize: 10.5, color: "var(--accent-money)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Icons.Sparkles size={11}/> AI suggested reply
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>{thread.suggested}</div>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 12, display: "flex", gap: 8 }}>
        <textarea className="text-input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1, resize: "vertical", fontFamily: "var(--font-ui)" }}/>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn btn-primary"><Icons.Send size={12}/> Send</button>
          <button className="btn btn-ghost">Schedule</button>
          <button className="btn btn-ghost"><Icons.Sparkles size={11}/> Rewrite</button>
        </div>
      </div>
    </>
  );
}

function ConversationProfile({ thread }) {
  if (!thread) return null;
  const camp = CAMPAIGNS.find(c => c.id === thread.campaign);
  const owner = AppData.REPS.find(r => r.id === camp?.owner);
  return (
    <>
      <div className="panel-h"><h3>Profile</h3></div>
      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="avatar-xs" style={{ width: 40, height: 40, fontSize: 14, background: "linear-gradient(135deg,#5b86e5,#36d1dc)" }}>{thread.who.split(" ").map(s => s[0]).join("")}</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{thread.who}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{thread.handle}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <span className="chip">{thread.state}</span>
          <span className={`chip ${thread.lic === "active" ? "chip-money" : "chip-status"}`}>License {thread.lic}</span>
          <span className="chip chip-info">Score {thread.score}</span>
        </div>

        <div className="divider"></div>

        <div className="field-l">Campaign</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>{camp?.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>Owner: {owner?.name}</div>

        <div className="divider"></div>

        <div className="field-l">Notes</div>
        <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: "var(--text-secondary)" }}>{thread.note}</div>

        <div className="divider"></div>

        <div className="field-l">Quick actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }}><Icons.Calendar size={11}/> Send calendar invite</button>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }}><Icons.Mail size={11}/> Send producer info packet</button>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }}><Icons.Workflow size={11}/> Move to "Booked"</button>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }}><Icons.X size={11}/> Mark not-a-fit</button>
        </div>

        <div className="divider"></div>

        <div className="field-l">Activity timeline</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {thread.msgs.slice().reverse().slice(0, 3).map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 8, fontSize: 11.5 }}>
              <span style={{ color: "var(--text-tertiary)" }}>{m.ts}</span>
              <span style={{ color: m.from === "them" ? "var(--text-secondary)" : "var(--accent-money)" }}>{m.from === "them" ? "Reply" : "Sent"}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Tab: Sequences ─────────────────────────────────────────────────────── */
function SequencesTab({ activeId, onSelect }) {
  const [edits, setEdits] = React.useState({}); // seqId -> stepIdx -> template
  const seq = SEQUENCES.find(s => s.id === activeId) || SEQUENCES[0];
  const updateStep = (i, body) => setEdits({ ...edits, [seq.id]: { ...(edits[seq.id] || {}), [i]: body } });

  return (
    <div className="seq-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
      <div className="panel">
        <div className="panel-h"><h3>Sequences</h3>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }}><Icons.Plus size={11}/></button>
        </div>
        <div style={{ padding: 6 }}>
          {SEQUENCES.map(s => (
            <button key={s.id} onClick={() => onSelect(s.id)} className="btn btn-ghost" style={{ width: "100%", padding: 10, marginBottom: 4, justifyContent: "stretch", flexDirection: "column", alignItems: "stretch", gap: 4, background: activeId === s.id ? "var(--bg-overlay)" : "transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: 12.5 }}>{s.name}</strong>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{s.steps.length} steps · {s.days}d</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <ChannelChip channel={s.channel}/>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {s.active} in flight</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>{seq.name}</h3>
            <ChannelChip channel={seq.channel}/>
            <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>· {seq.active} prospects in flight</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost"><Icons.Play size={11}/> Test on me</button>
              <button className="btn btn-primary"><Icons.Check size={11}/> Save</button>
            </div>
          </div>
          <div style={{ padding: 12 }}>
            {seq.steps.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 14, padding: "12px 0", borderBottom: i < seq.steps.length - 1 ? "1px solid var(--border-subtle)" : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-raised)", border: "1px solid var(--border-strong)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600 }}>{i + 1}</div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>D+{s.day}</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span className="chip">{s.ch}</span>
                    <Shared.Select value="any" onChange={() => {}} options={[{ v: "any", l: "Send to anyone" }, { v: "no_reply", l: "Only if no reply" }, { v: "no_book", l: "Only if not booked" }]}/>
                  </div>
                  <textarea className="text-input" rows={3} defaultValue={(edits[seq.id] && edits[seq.id][i]) ?? s.template} onChange={(e) => updateStep(i, e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "var(--font-ui)" }}/>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>Vars: {`{{first}}`} {`{{state}}`} {`{{license}}`}</span>
                    <span style={{ marginLeft: "auto" }}><span className="tabular" style={{ color: "var(--text-secondary)" }}>{(edits[seq.id]?.[i] ?? s.template).length}</span> chars</span>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ marginTop: 10 }}><Icons.Plus size={11}/> Add step</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Step funnel · this sequence</h3></div>
          <div style={{ padding: 14 }}>
            {seq.steps.map((s, i) => {
              const sent     = Math.max(0, seq.active - i * 22);
              const opened   = Math.max(0, sent - 8);
              const replied  = Math.max(0, opened - 32);
              const widthSent  = (sent / seq.active) * 100;
              const widthOpen  = (opened / seq.active) * 100;
              const widthReply = (replied / seq.active) * 100;
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                    <span>D+{s.day} · {s.ch}</span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)" }}>sent {sent} · opened {opened} · replied {replied}</span>
                  </div>
                  <div style={{ position: "relative", height: 6, background: "var(--bg-raised)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${widthSent}%`,  background: "color-mix(in oklch, var(--accent-money) 30%, transparent)" }}></div>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${widthOpen}%`,  background: "color-mix(in oklch, var(--accent-money) 60%, transparent)" }}></div>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${widthReply}%`, background: "var(--accent-money)" }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Leads (funnel kanban) ─────────────────────────────────────────── */
function LeadsTab({ onConverse }) {
  const [drag, setDrag]       = React.useState(null);
  const [overrides, setOver]  = React.useState({});
  const merge = LEADS.map(l => overrides[l.id] ? { ...l, ...overrides[l.id] } : l);
  const move = (id, stage) => setOver({ ...overrides, [id]: { stage } });

  return (
    <div className="kanban-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${LEAD_STAGES.length}, 1fr)`, gap: 10 }}>
      {LEAD_STAGES.map(stage => {
        const items = merge.filter(l => l.stage === stage);
        return (
          <div key={stage} className="panel"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (drag != null) { move(drag, stage); setDrag(null); } }}>
            <div className="panel-h">
              <h3>{stage}</h3>
              <span className="meta tabular">{items.length}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 220 }}>
              {items.map(l => (
                <div key={l.id}
                  draggable
                  onDragStart={() => setDrag(l.id)}
                  onDragEnd={() => setDrag(null)}
                  onDoubleClick={() => onConverse(l.name)}
                  style={{ background: drag === l.id ? "var(--bg-overlay)" : "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 10, cursor: "grab", opacity: drag === l.id ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: 12.5, fontWeight: 500 }}>{l.name}</strong>
                    {l.score > 0 && <span className="tabular" style={{ fontSize: 10.5, color: l.score >= 85 ? "var(--accent-money)" : "var(--text-tertiary)" }}>{l.score}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>{l.handle}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    <ChannelChip channel={l.ch}/>
                    <span className="chip" style={{ fontSize: 10 }}>{l.state}</span>
                    {l.lic === "pending" && <span className="chip chip-status" style={{ fontSize: 10 }}>license pending</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 6 }}>{l.note}</div>
                  <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4 }}>{l.last}</div>
                </div>
              ))}
              {items.length === 0 && drag != null && (
                <div style={{ padding: 14, border: "1px dashed var(--border-strong)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 11, textAlign: "center" }}>Drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tab: Insights ──────────────────────────────────────────────────────── */
function InsightsTab() {
  const total = LEADS.length;
  const funnel = LEAD_STAGES.map(stage => ({ stage, count: LEADS.filter(l => l.stage === stage).length }));
  return (
    <>
      <div className="kpi-row">
        <Shared.KpiCard hero label="In funnel"        value={total}/>
        <Shared.KpiCard      label="Booked"           value={LEADS.filter(l => l.stage === "Booked").length}/>
        <Shared.KpiCard      label="Producing"        value={LEADS.filter(l => l.stage === "Producing").length}/>
        <Shared.KpiCard      label="Cost / producer"  prefix="$" value="2,140" trend="up"/>
      </div>

      <div className="rec-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h"><h3>Funnel</h3></div>
          <div style={{ padding: 14 }}>
            {funnel.map((r, i) => {
              const w = total ? (r.count / total) * 100 : 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 60px 1fr", padding: "5px 0", alignItems: "center", fontSize: 12, borderBottom: i < funnel.length - 1 ? "1px solid var(--border-subtle)" : 0 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.stage}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{r.count}</span>
                  <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, marginLeft: 14, overflow: "hidden" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: "var(--accent-money)" }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>By channel · last 90 days</h3></div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.2fr 80px 90px 80px" }}>
              <div>Channel</div>
              <div className="tabular" style={{ textAlign: "right" }}>Sent</div>
              <div className="tabular" style={{ textAlign: "right" }}>Replies</div>
              <div className="tabular" style={{ textAlign: "right" }}>$/reply</div>
            </div>
            {[
              { n: "Instagram", c: "instagram", sent: 142, replies: 38, cpr: 48 },
              { n: "LinkedIn",  c: "linkedin",  sent: 38,  replies: 11, cpr: 84 },
              { n: "Email",     c: "email",      sent: 412, replies: 76, cpr: 3 },
              { n: "SMS",       c: "sms",        sent: 60,  replies: 8,  cpr: 22 },
            ].map((r, i) => (
              <div key={i} className="row" style={{ gridTemplateColumns: "1.2fr 80px 90px 80px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ChannelChip channel={r.c}/>
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{r.sent}</div>
                <div className="tabular" style={{ textAlign: "right" }}>{r.replies}</div>
                <div className="tabular" style={{ textAlign: "right", color: r.cpr < 20 ? "var(--accent-money)" : undefined }}>${r.cpr}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h3>Top campaigns by contracted</h3></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 90px 90px 100px 100px" }}>
            <div>Campaign</div>
            <div className="tabular" style={{ textAlign: "right" }}>Sent</div>
            <div className="tabular" style={{ textAlign: "right" }}>Reply %</div>
            <div className="tabular" style={{ textAlign: "right" }}>Contracted</div>
            <div className="tabular" style={{ textAlign: "right" }}>$/contract</div>
          </div>
          {CAMPAIGNS.filter(c => c.contracted > 0).sort((a, b) => b.contracted - a.contracted).map(c => (
            <div key={c.id} className="row" style={{ gridTemplateColumns: "1.4fr 90px 90px 100px 100px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ChannelChip channel={c.channel}/>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
              </div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{c.sent}</div>
              <div className="tabular" style={{ textAlign: "right" }}>{c.sent ? ((c.replied / c.sent) * 100).toFixed(1) : 0}%</div>
              <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)" }}>{c.contracted}</div>
              <div className="tabular" style={{ textAlign: "right" }}>${c.contracted ? Math.round(c.spend / c.contracted) : "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Modals: New campaign, Compose ──────────────────────────────────────── */
function NewCampaignWizard({ onClose }) {
  const [step, setStep] = React.useState(1);
  const [data, setData] = React.useState({ name: "", channel: "instagram", sequenceId: "seq1", target: 100, audience: "T65 producers" });
  return (
    <Shared.Modal title={`New campaign · step ${step} / 3`} width={560} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3 ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next →</button> : <button className="btn btn-primary" onClick={onClose}><Icons.Check size={11}/> Launch</button>}
      </>
    }>
      {step === 1 && (
        <>
          <Shared.Field label="Campaign name"><input className="text-input" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="e.g. T65 Producers · IG · Q3"/></Shared.Field>
          <Shared.Field label="Channel"><Shared.Select value={data.channel} onChange={(v) => setData({ ...data, channel: v })} options={CHANNELS.map(c => ({ v: c, l: channelChip[c].l }))}/></Shared.Field>
          <Shared.Field label="Audience preset"><Shared.Select value={data.audience} onChange={(v) => setData({ ...data, audience: v })} options={["T65 producers", "Licensed agents", "Inbound LP", "Cold producers", "Florida agents"].map(s => ({ v: s, l: s }))}/></Shared.Field>
        </>
      )}
      {step === 2 && (
        <>
          <Shared.Field label="Use sequence"><Shared.Select value={data.sequenceId} onChange={(v) => setData({ ...data, sequenceId: v })} options={SEQUENCES.map(s => ({ v: s.id, l: `${s.name} · ${s.steps.length} steps` }))}/></Shared.Field>
          <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12.5 }}>
            {SEQUENCES.find(s => s.id === data.sequenceId)?.steps.slice(0, 2).map((s, i) => (
              <div key={i} style={{ marginBottom: 6 }}><strong>D+{s.day} · {s.ch}</strong><div style={{ color: "var(--text-tertiary)" }}>{s.template.slice(0, 80)}…</div></div>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <Shared.Field label="Daily send cap"><input className="text-input" defaultValue={40}/></Shared.Field>
          <Shared.Field label="Target audience size"><input className="text-input" type="number" value={data.target} onChange={(e) => setData({ ...data, target: +e.target.value })}/></Shared.Field>
          <Shared.Field label="Stop conditions"><input className="text-input" defaultValue="Reply, opt-out, booked"/></Shared.Field>
          <div style={{ padding: 12, background: "color-mix(in oklch, var(--accent-money) 6%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--accent-money)" }}>Ready to launch.</strong> {data.target} prospects, {SEQUENCES.find(s => s.id === data.sequenceId)?.steps.length}-touch sequence over {SEQUENCES.find(s => s.id === data.sequenceId)?.days} days. Estimated reply rate: 22-28%.
          </div>
        </>
      )}
    </Shared.Modal>
  );
}

function ComposeMessage({ onClose }) {
  const [body, setBody] = React.useState("");
  const [to, setTo]     = React.useState(THREADS[0].id);
  return (
    <Shared.Modal title="New message" width={580} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn"><Icons.Calendar size={11}/> Schedule</button>
        <button className="btn btn-primary"><Icons.Send size={11}/> Send</button>
      </>
    }>
      <Shared.Field label="To"><Shared.Select value={to} onChange={setTo} options={THREADS.map(t => ({ v: t.id, l: `${t.who} · ${channelChip[t.channel].l}` }))}/></Shared.Field>
      <Shared.Field label="Message"><textarea className="text-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message — or use ⌘J to draft with AI..." style={{ fontFamily: "var(--font-ui)", resize: "vertical" }}/></Shared.Field>
      <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
        <button className="btn btn-ghost"><Icons.Sparkles size={11}/> AI draft</button>
        <button className="btn btn-ghost"><Icons.Mail size={11}/> Insert grid</button>
        <button className="btn btn-ghost"><Icons.Calendar size={11}/> Insert calendar link</button>
      </div>
    </Shared.Modal>
  );
}

window.PageRecruiting = PageRecruiting;

})();
