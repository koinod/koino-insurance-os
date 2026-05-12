/* page-recruiting.jsx — Recruiting workbench. Three tabs:
 *   • Funnel        — kanban by applicant status, click cards to advance/open
 *   • Conversations — applicant inbox + thread + composer
 *   • Programs      — campaigns (live/paused) + per-campaign metrics
 *
 * Reads from window.AppData.RECRUITING_{CAMPAIGNS,APPLICANTS,MESSAGES}
 * (hydrated by data.jsx from public.recruiting_* tables).
 *
 * Scoping (GAP-MR1): manager view filters applicants/campaigns to their
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

  const fmt$ = (n) => "$" + (n || 0).toLocaleString();
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

    // GAP-MR1: manager scopes to downline; owner sees fleet.
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

    // GAP-MR2 — send a real onboarding invite (mint_invite RPC) so the
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

    return (
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 10, height: "calc(100vh - 280px)", minHeight: 400 }}>
        <div className="panel" style={{ padding: 0, overflowY: "auto" }}>
          {inbox.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>No conversations yet.</div>
          )}
          {inbox.map(({ a, last }) => {
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

  function ConversationDetail({ applicant, thread, campaigns }) {
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const cmp = campaigns.find(c => c.id === applicant.campaignId);
    const recruiter = repById(applicant.recruiterId);
    // Channel selection (was hardcoded "instagram"): prefer the channel of
    // the latest inbound from the applicant, else the campaign source, else
    // instagram as a final fallback.
    const lastInbound = [...thread].reverse().find(m => m.direction === "in");
    const defaultChannel = lastInbound?.channel || cmp?.source || "instagram";
    const [channel, setChannel] = useState(defaultChannel);
    React.useEffect(() => { setChannel(defaultChannel); }, [applicant.id, defaultChannel]);

    const send = async () => {
      const body = draft.trim();
      if (!body) return;
      setSending(true);
      try {
        await window.AppData.mutate.recruitingMessageSend(applicant.id, body, channel, false);
        setDraft("");
      } catch (e) {
        window.toast && window.toast(`Send failed: ${e?.message || e}`, "error");
      } finally { setSending(false); }
    };

    const advance = async () => {
      const idx = STAGES.findIndex(s => s.id === applicant.status);
      const next = STAGES[Math.min(idx + 1, STAGES.length - 2)];
      if (next && next.id !== applicant.status) {
        try {
          await window.AppData.mutate.recruitingApplicantSetStatus(applicant.id, next.id);
          window.toast && window.toast(`${applicant.name.split(" ")[0]} → ${next.label}`, "success");
        } catch (_e) {}
      }
    };

    return (
      <>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{applicant.name} <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>· {applicant.handle}</span></div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {applicant.status} · {applicant.state} {cmp ? "· " + cmp.name : ""} {recruiter ? "· recruiter " + recruiter.name : ""}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={advance}>
            <Icons.ArrowUpRight size={13}/> Advance stage
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {thread.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No messages yet — send the first one below.</div>}
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
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{m.body}</div>
                <div style={{ fontSize: 10, color: "var(--text-quaternary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  {I && <I size={10}/>}
                  {ago(m.sentAt)}
                  {m.aiDrafted && <span style={{ marginLeft: 6, color: "var(--accent-status)" }}>· AI drafted</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <Shared.Select
            value={channel}
            onChange={setChannel}
            options={[
              { v: "instagram", l: "IG" },
              { v: "linkedin",  l: "LI" },
              { v: "sms",       l: "SMS" },
              { v: "email",     l: "Email" },
              { v: "phone",     l: "Phone log" },
            ]}
          />
          <input
            className="text-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Type a message via ${channel}…`}
            disabled={sending}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={send} disabled={!draft.trim() || sending}>
            <Icons.Send size={12}/> {sending ? "Sending…" : "Send"}
          </button>
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
      } catch (_e) {}
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

  window.PageRecruiting = PageRecruiting;
})();
