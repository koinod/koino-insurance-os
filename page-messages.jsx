/* page-messages.jsx — unified Messages hub.
   2026-05-25: refactor from internal-DM-only to a tabbed comms surface.

   Tabs (role-aware):
     • SMS         — outbound SMS to leads/clients, grouped by phone.
                     Default tab for both rep and manager.
     • Team        — internal DM + group chat (the old PageMessages).
     • Workflows   — manager/owner only · embeds PageWorkflows.
     • Recruiting  — manager/owner only · embeds PageRecruiting.

   The SMS tab reads from AppData.SMS_LOG (populated by SmsComposeModal
   on every successful /api/twilio-sms send) and groups by phone. New
   sends invoke window.smsCompose() — the same modal the Floor + CRM
   surfaces use, so every SMS in the agency flows through one log. */

(function () {

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), now = Date.now(), m = Math.round((now - d) / 60000);
  if (m < 1)   return "now";
  if (m < 60)  return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

function PageMessages({ role = "rep" }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    window.addEventListener("data:hydrated", fn);
    window.addEventListener("data:mutated",  fn);
    window.addEventListener("data:realtime", fn);
    return () => {
      window.removeEventListener("data:hydrated", fn);
      window.removeEventListener("data:mutated",  fn);
      window.removeEventListener("data:realtime", fn);
    };
  }, []);

  const isManagerLike = role === "manager" || role === "owner" || role === "admin" || role === "imo_owner" || role === "super_admin";

  const TABS = React.useMemo(() => {
    const base = [
      { k: "sms",  l: "SMS",  icon: "MessageSquare" },
      { k: "team", l: "Team", icon: "Users" },
    ];
    if (isManagerLike) {
      base.push({ k: "workflows",  l: "Workflows",  icon: "Workflow" });
      base.push({ k: "recruiting", l: "Recruiting", icon: "Users" });
    }
    return base;
  }, [isManagerLike]);

  const [tab, setTab] = React.useState("sms");

  return (
    <div className="page-pad" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Messages</div>
          <div className="page-sub">
            {tab === "sms"        && "Outbound SMS to leads · grouped by phone · Twilio-backed"}
            {tab === "team"       && "Internal DMs + group chat with your team"}
            {tab === "workflows"  && "SMS sequences, drip campaigns, and automation"}
            {tab === "recruiting" && "Recruiting outreach + applicant conversations"}
          </div>
        </div>
      </div>

      <Shared.SectionPill items={TABS} value={tab} onChange={setTab}/>

      <div style={{ flex: 1, minHeight: 0, marginTop: 12 }}>
        {tab === "sms"        && <SmsTab/>}
        {tab === "team"       && <TeamChatTab/>}
        {tab === "workflows"  && isManagerLike && <EmbeddedWorkflows/>}
        {tab === "recruiting" && isManagerLike && <EmbeddedRecruiting role={role}/>}
      </div>
    </div>
  );
}

/* ─── SMS tab ─────────────────────────────────────────────────────────────
   Groups AppData.SMS_LOG by recipient phone. Left column = conversations,
   right column = the thread + a "New SMS" affordance that opens the same
   modal used everywhere else (window.smsCompose). */
function SmsTab() {
  const log = window.AppData?.SMS_LOG || [];
  const pipeline = window.AppData?.PIPELINE || [];

  // Group by phone → conversation rows
  const conversations = React.useMemo(() => {
    const byPhone = new Map();
    for (const m of log) {
      const key = (m.to || "").trim();
      if (!key) continue;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key).push(m);
    }
    return Array.from(byPhone.entries()).map(([phone, msgs]) => {
      const sorted = msgs.slice().sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      const last = sorted[0];
      const lead = pipeline.find(p => p.id === last?.leadId) || pipeline.find(p => p.phone === phone) || null;
      return {
        phone,
        lead,
        leadName: lead?.lead || lead?.name || phone,
        lastAt: last?.at,
        lastBody: last?.body || "",
        lastStatus: last?.status || "",
        count: msgs.length,
        msgs: sorted,
      };
    }).sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
  }, [log.length, pipeline.length]);

  const [activeKey, setActiveKey] = React.useState(null);
  React.useEffect(() => {
    if (!activeKey && conversations.length) setActiveKey(conversations[0].phone);
  }, [conversations.length, activeKey]);

  const active = conversations.find(c => c.phone === activeKey);

  const newSms = () => {
    // Generic compose with no lead bound — user fills in destination.
    window.smsCompose && window.smsCompose(null, "");
  };
  const reply = () => {
    if (!active) return;
    window.smsCompose && window.smsCompose(active.lead || null, active.phone);
  };

  return (
    <div className="panel" style={{ height: "100%", display: "grid", gridTemplateColumns: "280px 1fr", gap: 0, overflow: "hidden", padding: 0 }}>
      {/* ── conversation list ───────────────────────────────── */}
      <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Conversations</span>
          <button className="btn btn-primary" style={{ height: 24, fontSize: 11 }} onClick={newSms}>
            <Icons.Plus size={11}/> New
          </button>
        </div>
        {conversations.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.6 }}>
            No SMS yet.<br/>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={newSms}>Send your first text</button>
            <div style={{ marginTop: 10, fontSize: 11 }}>Or text from any lead on the <a href="#" onClick={(e) => { e.preventDefault(); window.gotoPage && window.gotoPage("floor"); }} style={{ color: "var(--accent-money)" }}>Floor</a>.</div>
          </div>
        )}
        {conversations.map(c => {
          const isActive = c.phone === activeKey;
          return (
            <div key={c.phone} onClick={() => setActiveKey(c.phone)} style={{
              padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
              background: isActive ? "var(--bg-raised)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icons.MessageSquare size={11} style={{ color: "var(--text-tertiary)" }}/>
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }} className="cell-truncate">{c.leadName}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{fmtTime(c.lastAt)}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)" }}>{c.phone}</span>
                <span>· {c.count} msg{c.count === 1 ? "" : "s"}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--text-secondary)" }} className="cell-truncate">{c.lastBody}</div>
            </div>
          );
        })}
      </div>

      {/* ── thread ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        {!active && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            Pick a conversation or start a new one.
          </div>
        )}
        {active && (
          <>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.MessageSquare size={13} style={{ color: "var(--text-secondary)" }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }} className="cell-truncate">{active.leadName}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{active.phone}</div>
              </div>
              {active.lead && (
                <button className="btn" style={{ height: 26, fontSize: 11 }}
                  onClick={() => window.repflowCall && window.repflowCall(active.phone, active.leadName)}>
                  <Icons.Phone size={11}/> Call
                </button>
              )}
              <button className="btn btn-primary" style={{ height: 26, fontSize: 11 }} onClick={reply}>
                <Icons.Send size={11}/> New text
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {active.msgs.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, padding: 20 }}>No messages yet.</div>
              )}
              {active.msgs.slice().reverse().map(m => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 2, padding: "0 4px 0 0" }}>
                    You · {fmtTime(m.at)} {m.status ? `· ${m.status}` : ""}
                  </div>
                  <div style={{
                    padding: "7px 11px", borderRadius: 12, maxWidth: "75%", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 12.5,
                    background: "var(--accent-money)", color: "white",
                    borderTopRightRadius: 4,
                  }}>
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Inbound replies aren't wired yet — outbound only via Twilio. <a href="#" onClick={(e) => { e.preventDefault(); reply(); }} style={{ color: "var(--accent-money)" }}>Send another →</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Team chat tab (the original PageMessages, lifted in-place) ─────── */
function TeamChatTab() {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myHandle = meIdent?.handle || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].handle) : null) || "(self)";
  const reps = AppData.REPS || [];
  const repByHandle = (h) => reps.find(r => r.handle === h);

  const allThreads  = AppData.THREADS         || [];
  const allMembers  = AppData.THREAD_MEMBERS  || [];
  const allMessages = AppData.MESSAGES        || [];

  const myThreadIds = new Set(allMembers.filter(m => m.member === myHandle).map(m => m.threadId));
  const myThreads = allThreads
    .filter(t => myThreadIds.has(t.id))
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  const [activeId, setActiveId] = React.useState(myThreads[0]?.id || null);
  const [composer, setComposer] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const streamRef = React.useRef(null);

  React.useEffect(() => {
    if (!activeId && myThreads.length) setActiveId(myThreads[0].id);
  }, [myThreads.length, activeId]);

  const activeMessages = React.useMemo(() => {
    if (!activeId) return [];
    return allMessages
      .filter(m => m.threadId === activeId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [activeId, allMessages.length]);
  React.useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [activeMessages.length, activeId]);

  const activeThread = myThreads.find(t => t.id === activeId);
  const activeOtherMembers = allMembers
    .filter(m => m.threadId === activeId && m.member !== myHandle)
    .map(m => repByHandle(m.member) || { handle: m.member, name: m.member });

  const threadLabel = (t) => {
    if (t.subject) return t.subject;
    const others = allMembers
      .filter(m => m.threadId === t.id && m.member !== myHandle)
      .map(m => repByHandle(m.member)?.name || m.member);
    return others.length === 0 ? "(only you)" : others.join(", ");
  };
  const threadPreview = (t) => {
    const last = allMessages.filter(m => m.threadId === t.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return last ? (last.sender === myHandle ? `You: ${last.body}` : last.body) : "(no messages yet)";
  };

  const send = async () => {
    const body = composer.trim();
    if (!body || !activeId) return;
    setComposer("");
    try { await window.AppData.mutate.messagePost({ threadId: activeId, body }); }
    catch (e) { window.toast?.(`Send failed: ${e?.message || e}`, "error"); console.error("[messages.send]", e); }
  };
  const onComposerKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const startNewDm = async (handle) => {
    if (!handle || handle === myHandle) return;
    try {
      const t = await window.AppData.mutate.threadEnsure({ memberHandles: [myHandle, handle], kind: "dm" });
      setActiveId(t.id);
      setComposeOpen(false);
    } catch (e) { window.toast?.(`Open DM failed: ${e?.message || e}`, "error"); console.error("[messages.threadEnsure]", e); }
  };

  return (
    <div className="panel" style={{ height: "100%", display: "grid", gridTemplateColumns: "260px 1fr", gap: 0, overflow: "hidden", padding: 0 }}>
      <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Threads</span>
          <button className="btn btn-primary" style={{ height: 24, fontSize: 11 }} onClick={() => setComposeOpen(true)}>
            <Icons.Plus size={11}/> New
          </button>
        </div>
        {myThreads.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.55 }}>
            No threads yet.<br/>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setComposeOpen(true)}>Start one</button>
          </div>
        )}
        {myThreads.map(t => {
          const active = t.id === activeId;
          const KindIcon = t.kind === "group" ? Icons.Users : Icons.MessageSquare;
          return (
            <div key={t.id} onClick={() => setActiveId(t.id)} style={{
              padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
              background: active ? "var(--bg-raised)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <KindIcon size={11} style={{ color: "var(--text-tertiary)" }}/>
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }} className="cell-truncate">{threadLabel(t)}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{fmtTime(t.lastMessageAt)}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-tertiary)" }} className="cell-truncate">{threadPreview(t)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        {!activeThread && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
            Select a thread or start a new one.
          </div>
        )}
        {activeThread && (() => {
          const HeadIcon = activeThread.kind === "group" ? Icons.Users : Icons.MessageSquare;
          return (
          <>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
              <HeadIcon size={13} style={{ color: "var(--text-secondary)" }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }} className="cell-truncate">{threadLabel(activeThread)}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                  {activeOtherMembers.length === 0 ? "just you" : activeOtherMembers.map(m => m.name).join(" · ")}
                </div>
              </div>
            </div>

            <div ref={streamRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {activeMessages.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, padding: 20 }}>No messages yet — say something.</div>
              )}
              {activeMessages.map((m, i) => {
                const mine = m.sender === myHandle;
                const senderRep = repByHandle(m.sender);
                const showHeader = i === 0 || activeMessages[i - 1].sender !== m.sender;
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    {showHeader && (
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 2, padding: mine ? "0 4px 0 0" : "0 0 0 4px" }}>
                        {mine ? "You" : (senderRep?.name || m.sender)} · {fmtTime(m.createdAt)}
                      </div>
                    )}
                    <div style={{
                      padding: "7px 11px", borderRadius: 12, maxWidth: "75%", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 12.5,
                      background: mine ? "var(--accent-money)" : "var(--bg-raised)",
                      color: mine ? "white" : "var(--text-primary)",
                      borderTopRightRadius: mine ? 4 : 12, borderTopLeftRadius: mine ? 12 : 4,
                    }}>
                      {m.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 10, display: "flex", gap: 8 }}>
              <textarea className="text-input" rows={1} value={composer}
                onChange={(e) => setComposer(e.target.value)} onKeyDown={onComposerKey}
                placeholder="Type a message · Enter to send · Shift+Enter for newline"
                style={{ flex: 1, resize: "none", minHeight: 36 }}/>
              <button className="btn btn-primary" disabled={!composer.trim()} onClick={send}>
                <Icons.Send size={11}/>
              </button>
            </div>
          </>
          );
        })()}
      </div>

      {composeOpen && (
        <Shared.Modal title="Start a new direct message" width={420} onClose={() => setComposeOpen(false)}>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>Pick a teammate to DM.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
            {reps.filter(r => r.handle !== myHandle).map(r => (
              <button key={r.id} onClick={() => startNewDm(r.handle)}
                style={{ padding: "8px 10px", textAlign: "left", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-raised)", borderRadius: 5, border: "1px solid transparent", cursor: "pointer" }}>
                <Shared.Avatar rep={r} size={22}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.handle}</div>
                </div>
                <Icons.ArrowRight size={11} style={{ color: "var(--text-tertiary)" }}/>
              </button>
            ))}
          </div>
        </Shared.Modal>
      )}
    </div>
  );
}

/* ─── Workflows tab (manager+) ─────────────────────────────────────────── */
function EmbeddedWorkflows() {
  const Comp = window.PageWorkflows;
  if (!Comp) {
    return (
      <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
        Workflows surface not loaded — refresh the page.
      </div>
    );
  }
  return <div style={{ height: "100%", overflow: "auto" }}><Comp/></div>;
}

/* ─── Recruiting tab (manager+) ────────────────────────────────────────── */
function EmbeddedRecruiting({ role }) {
  const Comp = window.PageRecruiting;
  if (!Comp) {
    return (
      <div className="panel" style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
        Recruiting surface not loaded — refresh the page.
      </div>
    );
  }
  return <div style={{ height: "100%", overflow: "auto" }}><Comp role={role}/></div>;
}

window.PageMessages = PageMessages;

})();
