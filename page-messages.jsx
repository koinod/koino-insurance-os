/* page-messages.jsx — agency-internal Messages.
   Closes GAP-C2. Threaded DM + group chat for managers and reps. Lives
   alongside the broadcast tool (Admin) and the notifications panel.

   Two-column layout:
     • Left  — thread list (DMs + groups), sorted by lastMessageAt desc.
     • Right — selected thread's message stream + composer.

   Reads from window.AppData.{THREADS, THREAD_MEMBERS, MESSAGES} which
   data.jsx hydrates from public.{threads, thread_members, messages}.
   Writes through window.AppData.mutate.{threadEnsure, messagePost}. */

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

  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const myHandle = meIdent?.handle || (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].handle) || "(self)";
  const reps = AppData.REPS || [];
  const repByHandle = (h) => reps.find(r => r.handle === h);

  const allThreads  = AppData.THREADS         || [];
  const allMembers  = AppData.THREAD_MEMBERS  || [];
  const allMessages = AppData.MESSAGES        || [];

  // Threads I'm a member of (or empty list when realtime hasn't seeded any)
  const myThreadIds = new Set(allMembers.filter(m => m.member === myHandle).map(m => m.threadId));
  const myThreads = allThreads
    .filter(t => myThreadIds.has(t.id))
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  const [activeId, setActiveId] = React.useState(myThreads[0]?.id || null);
  const [composer, setComposer] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const streamRef = React.useRef(null);

  // Auto-pick the first thread on first render once myThreads resolves
  React.useEffect(() => {
    if (!activeId && myThreads.length) setActiveId(myThreads[0].id);
  }, [myThreads.length, activeId]);

  // Auto-scroll stream to bottom on new messages
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
    catch (_e) {}
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
    } catch (_e) {}
  };

  return (
    <div className="page-pad" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div className="page-h">
        <div>
          <div className="page-title">Messages</div>
          <div className="page-sub">{myThreads.length} thread{myThreads.length === 1 ? "" : "s"} · DMs + group chats</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setComposeOpen(true)}>
            <Icons.Plus size={12}/> New message
          </button>
        </div>
      </div>

      <div className="panel" style={{ flex: 1, display: "grid", gridTemplateColumns: "260px 1fr", gap: 0, overflow: "hidden", padding: 0 }}>
        {/* ── Thread list ─────────────────────────────────────────── */}
        <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Threads
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

        {/* ── Active thread ───────────────────────────────────────── */}
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

window.PageMessages = PageMessages;

})();
