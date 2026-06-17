/* page-recruiting.jsx — Recruiting workbench. Three tabs:
 *   • Funnel        — kanban by applicant status, click cards to advance/open
 *   • Conversations — applicant inbox + thread + composer
 *   • Programs      — campaigns (live/paused) + per-campaign metrics
 *
 * Reads from window.AppData.RECRUITING_{CAMPAIGNS,APPLICANTS,MESSAGES}
 * (hydrated by data.jsx from public.recruiting_* tables).
 *
 * Scoping: manager view filters applicants/campaigns to their
 * downline (window.scopeRepIds()); owner sees fleet-wide; rep doesn't have
 * a recruiting nav entry.
 *
 * Actions go through window.AppData.mutate.*:
 *   recruitingApplicantSetStatus, recruitingMessageSend,
 *   recruitingCampaignToggle, recruitingApplicantAdd
 */
(function () {
  const { useState, useEffect, useMemo } = React;

  // ─── Funnel stages — visible labels on top, DB status underneath ───────
  const STAGES = [
    { id: "applied",    label: "Applied",     hint: "fresh leads" },
    { id: "in_review",  label: "In review",   hint: "interview / NIPR" },
    { id: "contracted", label: "Contracted",  hint: "signed agency contract" },
    { id: "first_app",  label: "First app",   hint: "submitted first deal" },
    { id: "producing",  label: "Producing",   hint: "consistent producer" },
    { id: "dropped",    label: "Dropped",     hint: "out — for the record" },
  ];

  const SOURCE_LABEL = {
    instagram: "Instagram", linkedin: "LinkedIn", sms: "SMS", email: "Email",
    event: "Event", referral: "Referral", facebook: "Facebook", other: "Other",
  };

  // Map channels to icons that actually exist in icons.jsx; "MessageSquare"
  // is the safe fallback for anything we can't otherwise render.
  const CHANNEL_ICON = {
    instagram: "MessageSquare", linkedin: "Users", sms: "MessageSquare",
    email: "Mail", phone: "Phone", facebook: "MessageSquare",
  };

  const fmt$ = Shared.fmtMoney;
  const ago = (iso) => {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.round(ms / 36e5);
    if (h < 1) return "just now";
    if (h < 24) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  };

  function repById(id) {
    if (!id) return null;
    return (window.AppData?.REPS || []).find(r => r.id === id) || null;
  }

  function useScope() {
    const me      = (typeof window !== "undefined" && window.me && window.me()) || null;
    const repIds  = window.scopeRepIds && window.scopeRepIds();
    const isOwner = !!(window.canSeeFleet && window.canSeeFleet());
    return { me, repIds, isOwner };
  }

  function useMutationListener() {
    const [, force] = useState(0);
    useEffect(() => {
      const h = () => force(n => n + 1);
      window.addEventListener("data:hydrated", h);
      window.addEventListener("data:mutated", h);
      return () => { window.removeEventListener("data:hydrated", h); window.removeEventListener("data:mutated", h); };
    }, []);
  }

  function PageRecruiting({ role = "owner" }) {
    useMutationListener();
    const [tab, setTab] = useState("funnel");
    const [activeApplicant, setActiveApplicant] = useState(null);
    const [showAddApplicant, setShowAddApplicant] = useState(false);
    const [showAddCampaign, setShowAddCampaign] = useState(false);

    const scope = useScope();
    const isManager = role === "manager";
    const me = scope.me;
    const agencyName = me?.agency_name || "Recruiting";

    // Manager scopes to downline; owner sees fleet.
    const filterByScope = (rows, key = "recruiterId") => {
      if (!isManager || !scope.repIds) return rows;
      const set = new Set(scope.repIds);
      return rows.filter(r => !r[key] || set.has(r[key]));
    };

    const allCampaigns  = window.AppData?.RECRUITING_CAMPAIGNS  || [];
    const allApplicants = window.AppData?.RECRUITING_APPLICANTS || [];
    const allMessages   = window.AppData?.RECRUITING_MESSAGES   || [];

    const campaigns  = filterByScope(allCampaigns,  "ownerRepId");
    const applicants = filterByScope(allApplicants, "recruiterId");

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Recruiting</div>
            <div className="page-sub">
              {isManager ? "My downline" : agencyName}
              {" · "}
              {applicants.length} applicants
              {" · "}
              {campaigns.filter(c => c.status === "live").length} live campaigns
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowAddApplicant(true)}>
              <Icons.Plus size={13}/> Add applicant
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddCampaign(true)}>
              <Icons.Plus size={13}/> New campaign
            </button>
          </div>
        </div>

        {showAddApplicant && (
          <AddApplicantModal
            campaigns={campaigns}
            myRepId={me?.rep_id}
            onClose={() => setShowAddApplicant(false)}
          />
        )}
        {showAddCampaign && (
          <AddCampaignModal
            myRepId={me?.rep_id}
            isManager={isManager}
            onClose={() => setShowAddCampaign(false)}
          />
        )}

        <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border-subtle)" }}>
          {[
            { id: "invite",        label: "Invite team",   icon: "Plus" },
            { id: "funnel",        label: "Funnel",        icon: "Pipeline" },
            { id: "conversations", label: "Conversations", icon: "MessageSquare" },
            { id: "programs",      label: "Programs",      icon: "Sparkles" },
            ...(scope.isOwner || isManager
              ? [{ id: "settings", label: "Settings", icon: "Settings" }]
              : []),
          ].map(t => {
            const I = Icons[t.icon] || Icons.Circle;
            return (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 14px", fontSize: 13,
                  background: "transparent", border: "none",
                  borderBottom: tab === t.id ? "2px solid var(--accent-action)" : "2px solid transparent",
                  color: tab === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
                  cursor: "pointer", marginBottom: -1,
                }}>
                {I && <I size={13}/>} {t.label}
              </button>
            );
          })}
        </div>

        {tab === "invite" && (
          window.InviteTeamPanel
            ? <window.InviteTeamPanel/>
            : <div className="panel" style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12.5 }}>Invite UI not loaded — refresh the page.</div>
        )}
        {tab === "funnel" && (
          <FunnelTab
            campaigns={campaigns}
            applicants={applicants}
            messages={allMessages}
            onOpen={(a) => { setActiveApplicant(a); setTab("conversations"); }}
            isManager={isManager}
          />
        )}
        {tab === "conversations" && (
          <ConversationsTab
            applicants={applicants}
            messages={allMessages}
            campaigns={campaigns}
            activeApplicant={activeApplicant}
            setActive={setActiveApplicant}
          />
        )}
        {tab === "programs" && (
          <ProgramsTab
            campaigns={allCampaigns}
            applicants={allApplicants}
            isManager={isManager}
            myRepIds={scope.repIds}
          />
        )}
        {tab === "settings" && (scope.isOwner || isManager) && (
          <SettingsTab role={role} me={me}/>
        )}
      </div>
    );
  }

  // ─── Funnel — kanban by status ─────────────────────────────────────────
  function FunnelTab({ campaigns, applicants, messages, onOpen, isManager }) {
    const total = applicants.length;
    const advancing = applicants.filter(a => ["contracted","first_app","producing"].includes(a.status))?.length;
    const dropped = applicants.filter(a => a.status === "dropped").length;
    const conversionPct = total ? Math.round((advancing / total) * 100) : 0;
    const liveCampaigns = campaigns.filter(c => c.status === "live").length;
    const avgCpa = campaigns.length
      ? Math.round(campaigns.reduce((s, c) => s + (c.cpa || 0), 0) / campaigns.length)
      : 0;

    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          <Shared.KpiCard label="Active applicants" value={total - dropped} sub={`${total} total · ${dropped} dropped`} />
          <Shared.KpiCard label="Conversion" value={`${conversionPct}%`} sub={`${advancing} of ${total} contracted+`} trend={conversionPct >= 35 ? "up" : "down"} />
          <Shared.KpiCard label="Live campaigns" value={liveCampaigns} sub={`${campaigns.length} total`} />
          <Shared.KpiCard label="Avg CPA" value={fmt$(avgCpa)} sub="cost per acquisition" />
        </div>

        {applicants.length === 0 && campaigns.length === 0 ? (
          <div className="panel" style={{ padding: 36, textAlign: "center" }}>
            <Icons.Users size={20} style={{ color: "var(--text-quaternary)" }}/>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No applicants yet</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
              Add applicants directly or stand up a recruiting campaign — they'll flow through the funnel from Applied → Contracted as you advance them.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(180px, 1fr))`, gap: 8, overflowX: "auto" }}>
            {STAGES.map(stage => {
              const cards = applicants.filter(a => a.status === stage.id);
              return (
                <div key={stage.id} className="panel" style={{ minHeight: 240, padding: 0 }}>
                  <div className="panel-h">
                    <h3 style={{ fontSize: 11.5, fontWeight: 600 }}>{stage.label}</h3>
                    <span className="meta">{cards.length}</span>
                  </div>
                  <div style={{ padding: "4px 6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {cards.length === 0
                      ? <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", padding: 6 }}>{stage.hint}</div>
                      : cards.map(a => (
                          <ApplicantCard key={a.id} a={a} campaigns={campaigns} messages={messages} onOpen={() => onOpen(a)} />
                        ))
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function ApplicantCard({ a, campaigns, messages, onOpen }) {
    const cmp = campaigns.find(c => c.id === a.campaignId);
    const recruiter = repById(a.recruiterId);
    const lastMsg = (messages || []).filter(m => m.applicantId === a.id)
                                    .sort((x, y) => (y.sentAt || "") > (x.sentAt || "") ? 1 : -1)[0];
    const stages = STAGES.map(s => s.id);
    const idx = stages.indexOf(a.status);

    const advance = async (e) => {
      e.stopPropagation();
      const next = stages[Math.min(idx + 1, stages.length - 2)]; // never auto-jump to "dropped"
      if (!next || next === a.status) return;
      try {
        await window.AppData.mutate.recruitingApplicantSetStatus(a.id, next);
        const lbl = STAGES.find(s => s.id === next)?.label || next;
        window.toast && window.toast(`${a.name.split(" ")[0]} → ${lbl}`, "success");
      } catch (_e) { /* data layer toasts on error */ }
    };

    // Send a real onboarding invite (mint_invite RPC) so the
    // applicant gets a magic link instead of staying stuck in pre-application
    // limbo.
    const sendInvite = async (e) => {
      e.stopPropagation();
      const sb = window.getSupabase && window.getSupabase();
      const me = window.me && window.me();
      if (!sb) { window.toast && window.toast("Supabase not connected", "warn"); return; }
      if (!me?.agency_id) { window.toast && window.toast("Sign in first to mint invites", "warn"); return; }
      try {
        // mint_invite signature: (p_agency_id, p_role, p_email_hint, p_upline_rep_id default null)
        // Default upline = current viewer so the new rep slots in under them.
        const { data, error } = await sb.rpc("mint_invite", {
          p_agency_id:    me.agency_id,
          p_role:         "rep",
          p_email_hint:   a.email || a.handle || null,
          p_upline_rep_id: me.rep_id || null,
        });
        if (error) throw error;
        const token = typeof data === "string" ? data : (data?.token || null);
        // Analytics: capture for PostHog recruiter funnel.
        try {
          window.posthog && window.posthog.capture && window.posthog.capture("invite_minted", {
            role:        "rep",
            source:      "recruiting",
            email_hint:  a.email || a.handle || null,
            has_upline:  !!me.rep_id,
            has_token:   !!token,
          });
        } catch (_e) { /* analytics never blocks */ }
        if (token) {
          const link = `${window.location.origin}/?invite=${token}`;
          try { await navigator.clipboard.writeText(link); } catch (_e) {}
          window.toast && window.toast("Invite link copied to clipboard", "success");
        } else {
          window.toast && window.toast("Invite minted", "success");
        }
      } catch (err) {
        window.toast && window.toast(`Invite failed: ${err.message || err}`, "error");
      }
    };

    return (
      <div onClick={onOpen} style={{
        background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", padding: "8px 10px",
        cursor: "pointer", border: "1px solid var(--border-subtle)",
        transition: "border-color 120ms var(--ease-out)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
              {a.handle} · {a.state}
            </div>
          </div>
          {recruiter && <Shared.Avatar rep={recruiter} size={16}/>}
        </div>
        {cmp && <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 3 }}>{cmp.name}</div>}
        {lastMsg && (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
            <Icons.MessageSquare size={9}/> {ago(lastMsg.sentAt)}
          </div>
        )}
        <div style={{ marginTop: 5, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {idx >= 0 && idx < STAGES.length - 2 && (
            <button className="btn btn-ghost" onClick={advance}
              style={{ padding: "2px 6px", fontSize: 10 }}>
              → {STAGES[idx + 1].label}
            </button>
          )}
          {(a.status === "applied" || a.status === "in_review") && (
            <button className="btn btn-ghost" onClick={sendInvite}
              style={{ padding: "2px 6px", fontSize: 10 }} title="Mint an onboarding magic-link invite">
              <Icons.Send size={9}/> invite
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Conversations ─────────────────────────────────────────────────────
  function ConversationsTab({ applicants, messages, campaigns, activeApplicant, setActive }) {
    const lastByApp = useMemo(() => {
      const m = new Map();
      for (const msg of messages) {
        const cur = m.get(msg.applicantId);
        if (!cur || (msg.sentAt || "") > (cur.sentAt || "")) m.set(msg.applicantId, msg);
      }
      return m;
    }, [messages]);
    const inbox = useMemo(() => {
      return applicants
        .map(a => ({ a, last: lastByApp.get(a.id) }))
        .sort((x, y) => (y.last?.sentAt || "") > (x.last?.sentAt || "") ? 1 : -1);
    }, [applicants, lastByApp]);

    const active = activeApplicant
      ? applicants.find(a => a.id === activeApplicant.id) || activeApplicant
      : (inbox[0] && inbox[0].a) || null;
    const thread = active ? messages.filter(m => m.applicantId === active.id).sort((x, y) => (x.sentAt || "") > (y.sentAt || "") ? 1 : -1) : [];

    // Inbox search — surfaces every applicant (with or without messages) so
    // the operator can pick anyone to start a new conversation, not just
    // applicants who already replied.
    const [q, setQ] = useState("");
    const ql = q.trim().toLowerCase();
    const visibleInbox = ql
      ? inbox.filter(({ a }) =>
          (a.name || "").toLowerCase().includes(ql) ||
          (a.email || "").toLowerCase().includes(ql) ||
          (a.phone || "").includes(ql) ||
          (a.state || "").toLowerCase().includes(ql) ||
          (a.handle || "").toLowerCase().includes(ql) ||
          (a.source || "").toLowerCase().includes(ql))
      : inbox;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 10, height: "calc(100vh - 280px)", minHeight: 400 }}>
        <div className="panel" style={{ padding: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", display: "flex", gap: 6 }}>
            <input
              className="text-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search · start new conversation…"
              style={{ flex: 1, fontSize: 12 }}
            />
            {q && (
              <button className="btn btn-ghost" onClick={() => setQ("")} style={{ padding: "0 8px", fontSize: 11 }}>
                <Icons.X size={11}/>
              </button>
            )}
          </div>
          {visibleInbox.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
              {ql ? `No applicant matches "${q}".` : "No applicants yet."}
            </div>
          )}
          {visibleInbox.map(({ a, last }) => {
            const cmp = campaigns.find(c => c.id === a.campaignId);
            return (
              <button key={a.id} onClick={() => setActive(a)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 12px", border: "none",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: active && active.id === a.id ? "var(--bg-raised)" : "transparent",
                  cursor: "pointer",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{a.name}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-quaternary)" }}>{ago(last && last.sentAt)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(last && last.body) || "(no messages yet)"}
                </div>
                {cmp && <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 3 }}>{cmp.name} · {a.status}</div>}
              </button>
            );
          })}
        </div>

        <div className="panel" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {!active
            ? <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>Pick a conversation to view.</div>
            : <ConversationDetail applicant={active} thread={thread} campaigns={campaigns}/>
          }
        </div>
      </div>
    );
  }

  // Channel availability probe — checks rba_installs heartbeat (for agent-
  // mediated IG/LinkedIn/WhatsApp) + connections table (Twilio for SMS) so
  // the composer can show what actually works right now vs. what'll log-only.
  function useChannelHealth() {
    const [state, setState] = useState({ loading: true, agentLive: false, twilio: false, mailgun: false });
    useEffect(() => {
      let dead = false;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          const me = window.me && window.me();
          if (!sb || !me?.agency_id) { if (!dead) setState({ loading: false, agentLive: false, twilio: false, mailgun: false }); return; }
          const [installsR, connsR] = await Promise.all([
            sb.from("rba_installs")
              .select("device_id, last_seen_at, status")
              .eq("agency_id", me.agency_id)
              .order("last_seen_at", { ascending: false })
              .limit(5),
            sb.from("connections")
              .select("id, status")
              .eq("agency_id", me.agency_id),
          ]);
          const installs = Array.isArray(installsR?.data) ? installsR.data : [];
          const conns    = Array.isArray(connsR?.data)    ? connsR.data    : [];
          const fresh = (iso) => iso && (Date.now() - new Date(iso).getTime()) < 5 * 60 * 1000;
          const agentLive = installs.some(i => fresh(i.last_seen_at) && i.status !== "degraded");
          const hasConn = (id) => conns.some(c => (c.id || "").toLowerCase() === id && c.status !== "broken");
          if (!dead) setState({
            loading: false,
            agentLive,
            twilio:  hasConn("twilio") || hasConn("sendblue"),
            mailgun: hasConn("mailgun"),
          });
        } catch (e) {
          if (!dead) setState({ loading: false, agentLive: false, twilio: false, mailgun: false });
        }
      })();
      return () => { dead = true; };
    }, []);
    return state;
  }

  function ConversationDetail({ applicant, thread, campaigns }) {
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const textareaRef = React.useRef(null);
    const cmp = campaigns.find(c => c.id === applicant.campaignId);
    const recruiter = repById(applicant.recruiterId);
    const health = useChannelHealth();

    const lastInbound = [...thread].reverse().find(m => m.direction === "in");
    const defaultChannel = lastInbound?.channel || cmp?.source || "instagram";
    const [channel, setChannel] = useState(defaultChannel);
    React.useEffect(() => { setChannel(defaultChannel); }, [applicant.id, defaultChannel]);

    // Per-applicant draft persistence so switching threads doesn't lose work.
    const draftKey = `recruiting.draft.${applicant.id}.${channel}`;
    React.useEffect(() => {
      try { setDraft(sessionStorage.getItem(draftKey) || ""); }
      catch { setDraft(""); }
      // Autofocus on switch so the operator can just start typing.
      setTimeout(() => textareaRef.current?.focus(), 50);
    }, [applicant.id, channel]);
    React.useEffect(() => {
      try { if (draft) sessionStorage.setItem(draftKey, draft); else sessionStorage.removeItem(draftKey); } catch {}
    }, [draft, draftKey]);

    // ── Channel matrix ───────────────────────────────────────────────────
    // Each channel: requires-X to actually transmit, vs. log-only. v1 sends
    // SMS for real via the existing /api/twilio-sms edge fn; the others log
    // to recruiting_messages until the local-agent dispatch lands.
    const CHANNELS = [
      { id: "instagram", label: "IG",       reqAgent: true,                              actsLocal: true  },
      { id: "linkedin",  label: "LinkedIn", reqAgent: true,                              actsLocal: true  },
      { id: "sms",       label: "SMS",      reqProvider: "twilio", needsField: "phone",  actsLocal: false },
      { id: "email",     label: "Email",    needsField: "email",                         actsLocal: true  /* mailto handoff */ },
      { id: "phone",     label: "Phone",    needsField: "phone",                         actsLocal: true  /* logs only */ },
    ];
    const channelStatus = (c) => {
      if (c.needsField === "phone" && !applicant.phone) return { live: false, why: "no phone on file" };
      if (c.needsField === "email" && !applicant.email) return { live: false, why: "no email on file" };
      if (c.reqAgent && !health.agentLive)              return { live: false, why: "local agent offline — will log only" };
      if (c.reqProvider === "twilio" && !health.twilio) return { live: false, why: "Twilio not connected — will log only" };
      return { live: true };
    };
    const activeChannelDef = CHANNELS.find(c => c.id === channel) || CHANNELS[0];
    const activeStatus     = channelStatus(activeChannelDef);

    const send = async () => {
      const body = draft.trim();
      if (!body) return;
      setSending(true);
      try {
        // Always log to recruiting_messages so the thread is the canonical
        // source of truth, regardless of which provider actually carries it.
        await window.AppData.mutate.recruitingMessageSend(applicant.id, body, channel, false);

        // For SMS with a real phone + Twilio connected, fire the actual
        // outbound. /api/twilio-sms handles two-tier delivery (Twilio →
        // sms_outbox fallback). Errors there are non-fatal — message is
        // already logged.
        if (channel === "sms" && applicant.phone && health.twilio) {
          try {
            const r = await fetch("/api/twilio-sms", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ to: applicant.phone, body, source: "recruiting" }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              window.toast?.(`SMS provider returned ${r.status}${j.error ? ": " + j.error : ""} — logged but not sent`, "warn");
            } else {
              window.toast?.("SMS sent", "success");
            }
          } catch (e) {
            window.toast?.(`SMS network error — logged but not sent`, "warn");
          }
        } else if (channel === "email" && applicant.email) {
          // Mailto handoff for email — opens the operator's default client
          // pre-filled. No SMTP wiring yet.
          const subject = encodeURIComponent(`Following up`);
          const mailBody = encodeURIComponent(body);
          try { window.open(`mailto:${applicant.email}?subject=${subject}&body=${mailBody}`, "_blank"); } catch {}
          window.toast?.("Email handoff opened in your default mail client", "info");
        } else if (!activeStatus.live) {
          window.toast?.(`Logged in thread (${activeStatus.why})`, "info");
        } else {
          window.toast?.("Logged in thread", "success");
        }
        setDraft("");
      } catch (e) {
        window.toast?.(`Send failed: ${e?.message || e}`, "error");
      } finally { setSending(false); }
    };

    const advance = async () => {
      const idx = STAGES.findIndex(s => s.id === applicant.status);
      const next = STAGES[Math.min(idx + 1, STAGES.length - 2)];
      if (next && next.id !== applicant.status) {
        try {
          await window.AppData.mutate.recruitingApplicantSetStatus(applicant.id, next.id);
          window.toast && window.toast(`${applicant.name.split(" ")[0]} → ${next.label}`, "success");
        } catch (e) { window.toast?.(`Applicant status update failed: ${e?.message || e}`, "error"); console.error("[recruiting.applicantSetStatus]", e); }
      }
    };

    return (
      <>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{applicant.name}</span>
              {applicant.handle && <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>· {applicant.handle}</span>}
              {applicant.leadScore != null && (
                <span className="chip" style={{ fontSize: 9.5, color: applicant.leadScore >= 50 ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                  score {applicant.leadScore}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>{applicant.status}</span>
              {applicant.state  && <span>· {applicant.state}</span>}
              {applicant.email  && <a href={`mailto:${applicant.email}`} style={{ color: "var(--text-tertiary)" }}>· {applicant.email}</a>}
              {applicant.phone  && <a href={`tel:${applicant.phone}`}    style={{ color: "var(--text-tertiary)" }}>· {applicant.phone}</a>}
              {applicant.source && <span>· {applicant.source}</span>}
              {cmp && <span>· {cmp.name}</span>}
              {recruiter && <span>· recruiter {recruiter.name}</span>}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={advance}>
            <Icons.ArrowUpRight size={13}/> Advance stage
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {thread.length === 0 && (
            <div style={{ padding: 18, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", margin: "auto", maxWidth: 380 }}>
              <div style={{ marginBottom: 6, color: "var(--text-secondary)", fontWeight: 500 }}>No messages yet</div>
              <div>
                Pick a channel below and send the first message. Channels marked
                <span style={{ color: "var(--accent-money)" }}> live</span> transmit
                through the real provider; greyed channels log to the thread but
                won't actually send until the agent or provider is connected.
              </div>
            </div>
          )}
          {thread.map(m => {
            const out = m.direction === "out";
            const I = Icons[CHANNEL_ICON[m.channel] || "MessageSquare"];
            return (
              <div key={m.id} style={{
                alignSelf: out ? "flex-end" : "flex-start",
                maxWidth: "70%",
                background: out ? "color-mix(in srgb, var(--accent-money) 12%, transparent)" : "var(--bg-raised)",
                border: out ? "1px solid color-mix(in srgb, var(--accent-money) 30%, transparent)" : "1px solid var(--border-subtle)",
                padding: "7px 10px", borderRadius: "var(--radius-md)",
              }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.body}</div>
                <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  {I && <I size={10}/>}
                  {ago(m.sentAt)}
                  {m.aiDrafted && <span style={{ marginLeft: 6, color: "var(--accent-status)" }}>· AI drafted</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer — stacked layout: channel chips, then textarea+send.
            The previous flex row collapsed the input to zero width because
            Shared.Select greedily filled the row. */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 10px 10px", background: "var(--bg-elevated)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            {CHANNELS.map(c => {
              const st     = channelStatus(c);
              const sel    = c.id === channel;
              const tone   = st.live ? "var(--accent-money)" : "var(--text-quaternary)";
              return (
                <button key={c.id} onClick={() => setChannel(c.id)}
                  title={st.live ? `${c.label} — live` : `${c.label} — ${st.why}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", border: sel ? "1px solid var(--accent-action)" : "1px solid var(--border-subtle)",
                    borderRadius: 999, background: sel ? "color-mix(in srgb, var(--accent-action) 12%, transparent)" : "transparent",
                    color: sel ? "var(--text-primary)" : "var(--text-tertiary)",
                    fontSize: 11.5, cursor: "pointer",
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, display: "inline-block" }}/>
                  {c.label}
                </button>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-quaternary)" }}>
              {activeStatus.live
                ? (channel === "sms" ? "real SMS via Twilio" :
                   channel === "email" ? "mailto handoff" :
                   channel === "phone" ? "logs only" :
                   "via local agent")
                : activeStatus.why}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              className="text-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${applicant.name.split(" ")[0]} via ${activeChannelDef.label}…  (⌘⏎ to send)`}
              disabled={sending}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
              }}
              style={{ flex: 1, minHeight: 44, maxHeight: 160, resize: "vertical", fontFamily: "inherit", fontSize: 13, lineHeight: 1.4, padding: "8px 10px" }}
            />
            <button className="btn btn-primary" onClick={send} disabled={!draft.trim() || sending}
              style={{ whiteSpace: "nowrap", padding: "8px 14px", height: 40 }}>
              <Icons.Send size={12}/> {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ─── Programs (campaigns) ───────────────────────────────────────────────
  function ProgramsTab({ campaigns, applicants, isManager, myRepIds }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
        {campaigns.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No campaigns yet.</div>}
        {campaigns.map(c => (
          <CampaignCard key={c.id} c={c} applicants={applicants} isManager={isManager} myRepIds={myRepIds}/>
        ))}
      </div>
    );
  }

  function CampaignCard({ c, applicants, isManager, myRepIds }) {
    const owner = repById(c.ownerRepId);
    const visibleToMe = !isManager || !myRepIds || myRepIds.includes(c.ownerRepId);
    const ownApplicants = applicants.filter(a => a.campaignId === c.id);
    const inFunnel = ownApplicants.length;
    const contracted = ownApplicants.filter(a => ["contracted","first_app","producing"].includes(a.status))?.length;
    const conv = inFunnel ? Math.round((contracted / inFunnel) * 100) : 0;

    const toggle = async () => {
      const next = c.status === "live" ? "paused" : "live";
      try {
        await window.AppData.mutate.recruitingCampaignToggle(c.id, next);
        window.toast && window.toast(`${c.name} → ${next}`, "success");
      } catch (e) { window.toast?.(`Campaign toggle failed: ${e?.message || e}`, "error"); console.error("[recruiting.campaignToggle]", e); }
    };
    // Managers can only toggle campaigns they own (in their downline scope).
    const canEdit = !isManager || visibleToMe;

    return (
      <div className="panel" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>
              {SOURCE_LABEL[c.source] || c.source} · budget {fmt$(c.budget)}
            </div>
          </div>
          <span style={{
            fontSize: 9.5, padding: "2px 6px", borderRadius: "var(--radius-sm)",
            color: c.status === "live" ? "var(--accent-money)"
                 : c.status === "paused" ? "var(--state-warning)"
                 : "var(--text-tertiary)",
            background: c.status === "live" ? "color-mix(in srgb, var(--accent-money) 12%, transparent)"
                      : c.status === "paused" ? "color-mix(in srgb, var(--state-warning) 12%, transparent)"
                      : "var(--bg-raised)",
            border: `1px solid color-mix(in srgb, ${c.status === "live" ? "var(--accent-money)" : c.status === "paused" ? "var(--state-warning)" : "var(--text-tertiary)"} 30%, transparent)`,
            textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", fontFamily: "var(--font-mono)",
          }}>{c.status}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
          <Stat label="In funnel"   value={inFunnel}/>
          <Stat label="Contracted"  value={contracted}/>
          <Stat label="Producing"   value={c.producing}/>
          <Stat label="CPA"         value={fmt$(c.cpa)}/>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {owner && <Shared.Avatar rep={owner} size={18}/>}
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {owner ? owner.name : "unowned"} · {conv}% conversion
            </span>
          </div>
          <button className="btn btn-ghost"
            disabled={!canEdit}
            onClick={toggle}
            title={canEdit ? "" : "Only the campaign owner can change status"}
            style={{ fontSize: 11 }}>
            {c.status === "live" ? <><Icons.Pause size={11}/> Pause</> : <><Icons.Play size={11}/> Activate</>}
          </button>
        </div>
      </div>
    );
  }

  function Stat({ label, value }) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{value}</div>
        <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>{label}</div>
      </div>
    );
  }

  // ─── Add applicant modal ───────────────────────────────────────────────
  // Owner + manager can both add applicants. recruiterId defaults to viewer
  // so the applicant lands in the correct downline scope.
  function AddApplicantModal({ campaigns, myRepId, onClose }) {
    const [form, setForm] = useState({
      name: "", handle: "", state: "", campaignId: "", phone: "", email: "", notes: "",
    });
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async (e) => {
      e.preventDefault();
      if (!form.name.trim()) return;
      setBusy(true);
      try {
        await window.AppData.mutate.recruitingApplicantAdd({
          name: form.name.trim(),
          handle: form.handle.trim() || ("@" + form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")),
          state: (form.state || "").toUpperCase().slice(0, 2) || null,
          campaignId: form.campaignId || null,
          recruiterId: myRepId || null,
          status: "applied",
          phone: form.phone || null,
          email: form.email || null,
          notes: form.notes || null,
        });
        window.toast && window.toast("Applicant added", "success");
        onClose();
      } catch (e) {
        window.toast && window.toast(`Add failed: ${e.message || e}`, "error");
      } finally { setBusy(false); }
    };

    return (
      <Shared.Modal title="Add applicant" width={520} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={submit}>
            {busy ? "Adding…" : "Add applicant"}
          </button>
        </>
      }>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Shared.Field label="Full name *">
            <input className="text-input" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Handle">
              <input className="text-input" value={form.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@name"/>
            </Shared.Field>
            <Shared.Field label="State">
              <input className="text-input" value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} style={{ textTransform: "uppercase" }}/>
            </Shared.Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Phone">
              <input className="text-input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}/>
            </Shared.Field>
            <Shared.Field label="Email">
              <input className="text-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}/>
            </Shared.Field>
          </div>
          {campaigns.length > 0 && (
            <Shared.Field label="Campaign (optional)">
              <Shared.Select
                value={form.campaignId}
                onChange={(v) => set("campaignId", v)}
                options={[{ v: "", l: "— None —" }, ...campaigns.map(c => ({ v: c.id, l: c.name }))]}
              />
            </Shared.Field>
          )}
          <Shared.Field label="Notes">
            <textarea className="text-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Source, context, what they're looking for…"/>
          </Shared.Field>
        </form>
      </Shared.Modal>
    );
  }

  // ─── Add campaign modal ────────────────────────────────────────────────
  // Optimistically prepends to AppData.RECRUITING_CAMPAIGNS + persists via
  // direct supabase insert. Manager-scoped: ownerRepId defaults to viewer.
  function AddCampaignModal({ myRepId, isManager, onClose }) {
    const [form, setForm] = useState({
      name: "", source: "instagram", budget: "", status: "live",
    });
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async (e) => {
      e.preventDefault();
      if (!form.name.trim()) return;
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        const me = window.me && window.me();
        if (!sb || !me?.agency_id) throw new Error("Sign in first");
        const row = {
          name: form.name.trim(),
          source: form.source,
          status: form.status,
          budget_cents: form.budget ? Math.round(parseFloat(form.budget) * 100) : 0,
          owner_rep_id: myRepId || null,
          agency_id: me.agency_id,
        };
        const { data, error } = await sb.from("recruiting_campaigns").insert(row).select().single();
        if (error) throw error;
        // Optimistic local update so the new campaign appears in the Programs
        // tab immediately without waiting for a re-hydrate cycle.
        const local = {
          id: data.id,
          name: data.name,
          source: data.source,
          status: data.status,
          budget: data.budget_cents ? Math.round(data.budget_cents / 100) : 0,
          ownerRepId: data.owner_rep_id,
          producing: 0,
          cpa: 0,
        };
        (window.AppData.RECRUITING_CAMPAIGNS = window.AppData.RECRUITING_CAMPAIGNS || []).unshift(local);
        window.dispatchEvent(new CustomEvent("data:mutated"));
        window.toast && window.toast("Campaign created", "success");
        onClose();
      } catch (e) {
        window.toast && window.toast(`Create failed: ${e.message || e}`, "error");
      } finally { setBusy(false); }
    };

    return (
      <Shared.Modal title="New campaign" width={520} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={submit}>
            {busy ? "Creating…" : "Create campaign"}
          </button>
        </>
      }>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Shared.Field label="Campaign name *">
            <input className="text-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. IG growth · Q2" autoFocus required/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Source">
              <Shared.Select
                value={form.source}
                onChange={(v) => set("source", v)}
                options={[
                  { v: "instagram", l: "Instagram" },
                  { v: "linkedin", l: "LinkedIn" },
                  { v: "facebook", l: "Facebook" },
                  { v: "sms", l: "SMS" },
                  { v: "email", l: "Email" },
                  { v: "event", l: "Event" },
                  { v: "referral", l: "Referral" },
                  { v: "other", l: "Other" },
                ]}
              />
            </Shared.Field>
            <Shared.Field label="Status">
              <Shared.Select
                value={form.status}
                onChange={(v) => set("status", v)}
                options={[
                  { v: "live", l: "Live" },
                  { v: "paused", l: "Paused" },
                  { v: "draft", l: "Draft" },
                ]}
              />
            </Shared.Field>
          </div>
          <Shared.Field label="Budget ($)">
            <input className="text-input" type="number" min="0" step="50" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="500"/>
          </Shared.Field>
          {isManager && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              <Icons.Shield size={11}/> This campaign will be scoped to your downline. Owner/admin can reassign later.
            </div>
          )}
        </form>
      </Shared.Modal>
    );
  }

  /* ─── Settings tab — Local Agent · Hosted sites · Platform creds ─────── */
  function SettingsTab({ role, me }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <LocalAgentPanel/>
        <HostedSitesPanel agencyId={me?.agency_id} role={role}/>
        <PlatformCredsPanel/>
      </div>
    );
  }

  /* ── Local Agent probe — level-1 fallback when none detected ────────── */
  function LocalAgentPanel() {
    const [state, setState] = useState({ loading: true, installs: [], err: null });
    useEffect(() => {
      let dead = false;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) throw new Error("Supabase not ready");
          const me = window.me && window.me();
          if (!me?.agency_id) throw new Error("No agency context");
          // rba_installs is the heartbeat table; agent posts every ~60s.
          const { data, error } = await sb
            .from("rba_installs")
            .select("device_id, role, version, status, last_seen_at")
            .eq("agency_id", me.agency_id)
            .order("last_seen_at", { ascending: false })
            .limit(20);
          if (error) throw error;
          if (!dead) setState({ loading: false, installs: data || [], err: null });
        } catch (e) {
          if (!dead) setState({ loading: false, installs: [], err: e.message || String(e) });
        }
      })();
      return () => { dead = true; };
    }, []);

    const isFresh = (iso) => iso && (Date.now() - new Date(iso).getTime()) < 5 * 60 * 1000;
    const live = state.installs.filter(i => isFresh(i.last_seen_at));
    const stale = state.installs.filter(i => !isFresh(i.last_seen_at));

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Sparkles size={13}/><h3>Local RepFlow agent</h3>
          {!state.loading && (
            <span className="chip" style={{
              marginLeft: "auto", fontSize: 10,
              color: live.length ? "var(--accent-money)" : "var(--state-warning)"
            }}>
              {live.length
                ? `${live.length} live`
                : stale.length
                  ? "stale heartbeat"
                  : "not installed"}
            </span>
          )}
        </div>
        <div style={{ padding: 14, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          {state.loading
            ? "Probing…"
            : live.length > 0
              ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    Detected <strong>{live.length}</strong> live agent install(s). Job posting, IG / LinkedIn DMs,
                    and the inbox poller can run autonomously through your machine.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 80px", gap: 8, fontSize: 11, color: "var(--text-tertiary)", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div>Device</div><div>Role</div><div>Last heartbeat</div><div>Version</div>
                  </div>
                  {live.concat(stale).map(i => (
                    <div key={i.device_id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 80px", gap: 8, fontSize: 11.5, padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                      <div className="mono" style={{ fontSize: 10.5 }}>{i.device_id}</div>
                      <div>{i.role}</div>
                      <div style={{ color: isFresh(i.last_seen_at) ? "var(--accent-money)" : "var(--state-warning)" }}>{ago(i.last_seen_at)}</div>
                      <div>{i.version || "—"}</div>
                    </div>
                  ))}
                </>
              )
              : (
                <>
                  <div style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                      No agent detected — running in <em>Level 1</em>.
                    </div>
                    Without a local RepFlow agent, Recruiting falls back to manual outbound:
                    quick-link buttons to compose DMs on each platform, an AI-editable
                    job-description template, and a copyable careers-page URL. Outbound
                    automation (auto-posting, DM sending, inbox polling) unlocks once the
                    agent installs and heartbeats.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="btn btn-primary" href="/agent/install.sh" target="_blank" rel="noreferrer">
                      <Icons.ArrowDown size={11}/> Install (macOS / Linux)
                    </a>
                    <a className="btn btn-ghost" href="/agent/install.ps1" target="_blank" rel="noreferrer">
                      <Icons.ArrowDown size={11}/> Install (Windows)
                    </a>
                  </div>
                </>
              )
          }
          {state.err && (
            <div style={{ marginTop: 10, color: "var(--state-warning)", fontSize: 11 }}>
              Probe error: {state.err}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Hosted sites panel — Vercel deployments tied to this Supabase ──── */
  function HostedSitesPanel({ agencyId, role }) {
    const sites = (window.AppData && window.AppData.AGENCY_SITES) || [];
    const forms = (window.AppData && window.AppData.AGENCY_SITE_FORMS) || [];
    const [editing, setEditing] = useState(null); // site draft for modal
    const [formsFor, setFormsFor] = useState(null); // site id for forms drawer

    const startNew = () => setEditing({
      id: null, slug: "", kind: "careers", displayName: "", deploymentUrl: "",
      primaryDomain: "", vercelProjectId: "", status: "draft", notes: ""
    });
    const startEdit = (s) => setEditing({ ...s });
    const remove = async (id) => {
      if (!confirm("Unlink this site? Submissions stay in the audit log; the URL just stops appearing here.")) return;
      try { await window.AppData.mutate.siteDelete(id); window.toast?.("Site unlinked", "info"); }
      catch (e) { window.toast?.(`Delete failed: ${e?.message || e}`, "error"); }
    };
    const save = async () => {
      if (!editing.slug.trim()) { window.toast?.("Slug required (used in the public URL)", "error"); return; }
      try {
        await window.AppData.mutate.siteUpsert(editing);
        window.toast?.(editing.id ? "Site updated" : "Site linked", "success");
        setEditing(null);
      } catch (e) { /* toast already fired */ }
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.ArrowUpRight size={13}/><h3>Hosted sites</h3>
          <span className="meta">{sites.length}</span>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={startNew}>
            <Icons.Plus size={11}/> Link site
          </button>
        </div>
        <div style={{ padding: 14, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          {sites.length === 0 ? (
            <div style={{ padding: 18, textAlign: "center" }}>
              No sites linked. Link any Vercel deployment that should write into this
              agency's Supabase — careers pages, applicant quizzes, consumer landing
              funnels. Forms on the site post into <code>recruiting_applicants</code>,
              <code> pipeline</code>, or any other tenant-scoped table you point them at.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sites.map(s => {
                const siteForms = forms.filter(f => f.siteId === s.id);
                const open = formsFor === s.id;
                return (
                  <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                      <span className="chip" style={{ fontSize: 9.5 }}>{s.kind}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>
                          {s.displayName || s.slug}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", marginTop: 2 }}>
                          {s.deploymentUrl || s.primaryDomain || "no url set"} · {siteForms.length} form{siteForms.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="chip" style={{ fontSize: 9.5, color: s.status === "live" ? "var(--accent-money)" : "var(--text-tertiary)" }}>{s.status}</span>
                      {s.deploymentUrl && (
                        <a href={s.deploymentUrl} target="_blank" rel="noreferrer" className="icon-btn" title="Open">
                          <Icons.ArrowUpRight size={11}/>
                        </a>
                      )}
                      <button className="icon-btn" title="Forms" onClick={() => setFormsFor(open ? null : s.id)}>
                        <Icons.FileText size={11}/>
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => startEdit(s)}>
                        <Icons.Edit size={11}/>
                      </button>
                      <button className="icon-btn" title="Unlink" style={{ color: "var(--state-danger)" }} onClick={() => remove(s.id)}>
                        <Icons.X size={11}/>
                      </button>
                    </div>
                    {open && <SiteFormsDrawer site={s} forms={siteForms}/>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {editing && (
          <Shared.Modal title={editing.id ? "Edit site" : "Link a hosted site"} width={520} onClose={() => setEditing(null)} actions={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!editing.slug.trim()}>
                <Icons.Check size={11}/> {editing.id ? "Save" : "Link"}
              </button>
            </>
          }>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Shared.Field label="Slug (used in public URLs)">
                <input className="text-input" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })} placeholder="careers"/>
              </Shared.Field>
              <Shared.Field label="Kind">
                <Shared.Select value={editing.kind} onChange={v => setEditing({ ...editing, kind: v })}
                  options={[
                    { v: "careers", l: "Careers page" },
                    { v: "quiz",    l: "Quiz funnel" },
                    { v: "landing", l: "Landing page" },
                    { v: "other",   l: "Other" },
                  ]}/>
              </Shared.Field>
            </div>
            <Shared.Field label="Display name">
              <input className="text-input" value={editing.displayName} onChange={e => setEditing({ ...editing, displayName: e.target.value })} placeholder="UEP — apply"/>
            </Shared.Field>
            <Shared.Field label="Deployment URL">
              <input className="text-input" value={editing.deploymentUrl} onChange={e => setEditing({ ...editing, deploymentUrl: e.target.value })} placeholder="https://uep.vercel.app"/>
            </Shared.Field>
            <Shared.Field label="Primary domain (optional)">
              <input className="text-input" value={editing.primaryDomain} onChange={e => setEditing({ ...editing, primaryDomain: e.target.value })} placeholder="apply.umbrellaep.com"/>
            </Shared.Field>
            <Shared.Field label="Vercel project ID (optional)">
              <input className="text-input" value={editing.vercelProjectId} onChange={e => setEditing({ ...editing, vercelProjectId: e.target.value })} placeholder="prj_..."/>
            </Shared.Field>
            <Shared.Field label="Status">
              <Shared.Select value={editing.status} onChange={v => setEditing({ ...editing, status: v })}
                options={[
                  { v: "draft",    l: "Draft" },
                  { v: "live",     l: "Live" },
                  { v: "paused",   l: "Paused" },
                  { v: "archived", l: "Archived" },
                ]}/>
            </Shared.Field>
          </Shared.Modal>
        )}
      </div>
    );
  }

  /* ── Site forms drawer — list forms + show the webhook bind info ────── */
  function SiteFormsDrawer({ site, forms }) {
    const [editing, setEditing] = useState(null);
    const startNew = () => setEditing({
      id: null, siteId: site.id, slug: "", name: "",
      targetTable: "recruiting_applicants", status: "active",
      fields: [
        { key: "name",  label: "Full name", type: "text",  required: true },
        { key: "email", label: "Email",     type: "email", required: true },
        { key: "phone", label: "Phone",     type: "tel",   required: false },
      ],
      routing: {},
    });
    const save = async () => {
      if (!editing.slug.trim() || !editing.name.trim()) {
        window.toast?.("Slug + name required", "error"); return;
      }
      try {
        await window.AppData.mutate.siteFormUpsert(editing);
        setEditing(null);
        window.toast?.(editing.id ? "Form updated" : "Form created", "success");
      } catch (e) { /* toast handled */ }
    };
    const remove = async (id) => {
      if (!confirm("Delete this form? Submissions already received stay in the audit log.")) return;
      try { await window.AppData.mutate.siteFormDelete(id); }
      catch (e) { window.toast?.(`Delete failed: ${e?.message || e}`, "error"); }
    };
    return (
      <div style={{ padding: "0 10px 12px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 0", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Forms on this site</span>
          <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11 }} onClick={startNew}>
            <Icons.Plus size={10}/> New form
          </button>
        </div>
        {forms.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: "var(--text-quaternary)" }}>
            No forms yet. Add one to route submissions into a tenant-scoped table.
          </div>
        )}
        {forms.map(f => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 80px 40px", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 11.5, borderBottom: "1px solid var(--border-subtle)" }}>
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{f.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-quaternary)" }} className="mono">/{f.slug} · token {f.webhookToken?.slice(0,8)}…</div>
            </div>
            <div style={{ color: "var(--text-tertiary)" }} className="mono">{f.targetTable}</div>
            <div>{(f.fields || []).length} fields</div>
            <div style={{ color: f.status === "active" ? "var(--accent-money)" : "var(--text-tertiary)" }}>{f.status}</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="icon-btn" onClick={() => setEditing({ ...f })} title="Edit"><Icons.Edit size={10}/></button>
              <button className="icon-btn" style={{ color: "var(--state-danger)" }} onClick={() => remove(f.id)} title="Delete"><Icons.X size={10}/></button>
            </div>
          </div>
        ))}
        {editing && (
          <Shared.Modal title={editing.id ? "Edit form" : "New form"} width={560} onClose={() => setEditing(null)} actions={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}><Icons.Check size={11}/> Save</button>
            </>
          }>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Shared.Field label="Slug">
                <input className="text-input" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })} placeholder="apply"/>
              </Shared.Field>
              <Shared.Field label="Name">
                <input className="text-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Producer application"/>
              </Shared.Field>
            </div>
            <Shared.Field label="Target table">
              <Shared.Select value={editing.targetTable} onChange={v => setEditing({ ...editing, targetTable: v })}
                options={[
                  { v: "recruiting_applicants", l: "recruiting_applicants — producer funnel" },
                  { v: "pipeline",              l: "pipeline — consumer leads" },
                  { v: "leads",                 l: "leads — raw inbound" },
                ]}/>
            </Shared.Field>
            <Shared.Field label="Status">
              <Shared.Select value={editing.status} onChange={v => setEditing({ ...editing, status: v })}
                options={[
                  { v: "draft",    l: "Draft" },
                  { v: "active",   l: "Active" },
                  { v: "paused",   l: "Paused" },
                  { v: "archived", l: "Archived" },
                ]}/>
            </Shared.Field>
            <Shared.Field label="Fields JSON (array of {key,label,type,required,options?})">
              <textarea className="text-input" rows={8}
                value={JSON.stringify(editing.fields || [], null, 2)}
                onChange={e => {
                  try { setEditing({ ...editing, fields: JSON.parse(e.target.value) }); }
                  catch (_) { /* keep last good while user is typing */ }
                }}
                style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}/>
            </Shared.Field>
            <Shared.Field label="Routing JSON (lead_score weights, default owner_rep_id, etc.)">
              <textarea className="text-input" rows={4}
                value={JSON.stringify(editing.routing || {}, null, 2)}
                onChange={e => {
                  try { setEditing({ ...editing, routing: JSON.parse(e.target.value) }); }
                  catch (_) {}
                }}
                style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}/>
            </Shared.Field>
            <div style={{ fontSize: 10.5, color: "var(--text-quaternary)", marginTop: 6 }}>
              Forms POST to <code className="mono">/api/site-forms/submit</code> with
              <code className="mono"> form_id</code> + the form's <code className="mono">webhook_token</code>.
              Until that endpoint ships, raw submissions land in
              <code className="mono"> agency_site_submissions</code> for review.
            </div>
          </Shared.Modal>
        )}
      </div>
    );
  }

  /* ── Platform credentials — recruiting-relevant subset of Connections ─ */
  function PlatformCredsPanel() {
    const conns = (window.AppData && window.AppData.CONNECTIONS) || [];
    const want = ["instagram","linkedin","indeed","ziprecruiter","facebook","glassdoor","x","telegram"];
    const have = new Set(conns.map(c => (c.id || "").toLowerCase()));
    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Plug size={13}/><h3>Platform credentials</h3>
          <a className="btn btn-ghost" style={{ marginLeft: "auto" }}
             href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "connections" } })); }}>
            Open Connections →
          </a>
        </div>
        <div style={{ padding: 14, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <div style={{ marginBottom: 10, color: "var(--text-tertiary)", fontSize: 11.5 }}>
            Logins for the platforms the agent uses to post jobs, send DMs, and poll
            inbound. Manage them on the Connections page; this panel just tells you
            which platforms aren't wired up yet for recruiting.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {want.map(id => {
              const ok = have.has(id);
              return (
                <div key={id} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dot dot-${ok ? "live" : "warn"}`}></span>
                  <div style={{ flex: 1, fontSize: 12, textTransform: "capitalize" }}>{id}</div>
                  <span className="chip" style={{ fontSize: 9.5, color: ok ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                    {ok ? "linked" : "missing"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  window.PageRecruiting = PageRecruiting;
})();
