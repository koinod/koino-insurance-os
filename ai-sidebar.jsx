/* AI Copilot — right-rail slide-over.
 *
 * Lives at window.AISidebar (component) + window.toggleAISidebar() (open/close).
 * Mounted from the app root (see shared.jsx App component).
 *
 * What it does:
 *   1. Tracks page-context awareness (route, title, selection, clipboard
 *      intent, focus app/idle if the agent reports them) and ships it with
 *      every enqueue under payload.context.
 *   2. Renders role-gated action buttons from AGENT_ACTIONS.
 *   3. Subscribes to public.rba_commands via Supabase realtime and renders
 *      the last 20 jobs with live status (queued → running → done/failed/
 *      pending_approval).
 *
 * Built to match the existing Repflow palette (var(--bg-raised) etc.).
 */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const AI_SIDEBAR_WIDTH = 400;
const AI_SIDEBAR_INSET = 12;
const JOB_FETCH_LIMIT = 20;
const CHAT_HISTORY_TURNS = 3;

// Liquid-glass surface — used by the outer aside + a few inner panels.
const GLASS_BG = "color-mix(in oklch, var(--bg-base) 62%, transparent)";
const GLASS_BG_RAISED = "color-mix(in oklch, var(--bg-raised) 70%, transparent)";
const GLASS_BORDER = "1px solid color-mix(in oklch, white 9%, transparent)";

// Tools that need extra inputs before we can enqueue — we render a tiny
// inline form instead of firing immediately. Keep this list short — most
// actions should be one-tap.
const ACTIONS_NEEDING_INPUT = {
  create_lead:    [{ key: "lead",  label: "Lead name",    required: true  },
                   { key: "phone", label: "Phone",        required: false },
                   { key: "state", label: "State (e.g. TX)", required: false }],
  draft_email:    [{ key: "intent", label: "Intent (e.g. follow_up)", required: false },
                   { key: "lead_name", label: "Lead name (optional)", required: false }],
  draft_sms:      [{ key: "lead_name", label: "Lead name", required: true }],
  twilio_dial:    [{ key: "to", label: "Phone (E.164)",  required: true  }],
  phone_link_dial:[{ key: "to", label: "Phone",          required: true  }],
  sendblue_send:  [{ key: "to", label: "Phone (E.164)",  required: true  },
                   { key: "body", label: "Message", required: true }],
  linkedin_send:  [{ key: "to", label: "Recipient handle/URL", required: true },
                   { key: "body", label: "Message", required: true }],
  meta_dm_send:   [{ key: "to", label: "Recipient", required: true },
                   { key: "body", label: "Message", required: true }],
  script_review:  [{ key: "filename", label: "File in workspace", required: true }],
  file_review:    [{ key: "filename", label: "File in workspace", required: true }],
  browser_run:    [{ key: "url", label: "Approved URL", required: true },
                   { key: "action", label: "open, screenshot, or extract_text", required: false }],
  ig_dm_reply:    [{ key: "auto_send", label: "Auto-send (true/false)", required: false }],
};

// Render group dividers for visual scanning. Order matters.
const ACTION_GROUP_ORDER = ["intake", "compose", "review", "comms", "social", "pull", "quote", "browser", "_legacy"];
const ACTION_GROUP_LABELS = {
  intake: "Lead intake",
  compose: "Compose",
  review:  "Review",
  comms:   "Calls + Messaging",
  social:  "Social",
  pull:    "Pulls",
  quote:   "Quotes",
  browser: "Browser",
  _legacy: "Flows",
};

// Keep only commands backed by a shipped runtime tool. Older composite flow
// names remained visible after their worker was removed, so clicks could only
// end in a denial or "no tool registered" result.
const FUNCTIONAL_AGENT_KINDS = new Set([
  "create_lead", "draft_email", "draft_sms", "script_review", "file_review",
  "twilio_dial", "phone_link_dial", "phone_link_inspect", "sendblue_send",
  "ig_dm_reply", "meta_dm_send", "linkedin_send", "linkedin_inbox_scan",
  "fathom_pull_notes", "fb_pull_lead_forms", "auto_quote", "browser_run",
]);

const StatusPill = ({ status }) => {
  const map = {
    queued:           ["#94a3b8", "queued"],
    running:          ["var(--accent-money)", "running…"],
    succeeded:        ["#10b981", "done"],
    failed:           ["var(--state-danger)", "failed"],
    pending_approval: ["#f59e0b", "needs OK"],
    denied:           ["#7c2d12", "denied"],
    cancelled:        ["#6b7280", "cancelled"],
  };
  const [bg, label] = map[status] || ["#475569", status];
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.2, textTransform: "uppercase",
      background: bg, color: "#fff",
    }}>{label}</span>
  );
};

const JobRow = ({ job, onSelect }) => {
  const created = new Date(job.created_at);
  const elapsed = (() => {
    const s = Math.floor((Date.now() - created.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return created.toLocaleDateString();
  })();
  return (
    <button
      onClick={() => onSelect?.(job)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 10px", border: "none", background: "transparent",
        borderBottom: "1px solid var(--border-subtle, #1f242c)",
        cursor: "pointer", color: "var(--text-primary, #e8ebee)",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{job.kind}</span>
        <StatusPill status={job.status}/>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary, #6b7480)" }}>{elapsed}</span>
        {job.error && <span style={{ fontSize: 10, color: "var(--state-danger, #ef4444)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.error}</span>}
      </div>
    </button>
  );
};

const JobDetail = ({ job, onBack }) => {
  if (!job) return null;
  const fmt = (v) => typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return (
    <div style={{ padding: 12, overflow: "auto", flex: 1 }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--accent-money)", cursor: "pointer", padding: 0, marginBottom: 8 }}>← back</button>
      <h4 style={{ fontSize: 13, marginBottom: 8 }}>{job.kind}</h4>
      <div style={{ marginBottom: 8 }}><StatusPill status={job.status}/></div>
      {job.payload && Object.keys(job.payload).length > 0 && (<>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>payload</div>
        <pre style={{ background: "var(--bg-raised)", padding: 8, borderRadius: 4, fontSize: 11, overflow: "auto", marginBottom: 12 }}>{fmt(job.payload)}</pre>
      </>)}
      {job.result && (<>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>result</div>
        <pre style={{ background: "var(--bg-raised)", padding: 8, borderRadius: 4, fontSize: 11, overflow: "auto", marginBottom: 12 }}>{fmt(job.result)}</pre>
      </>)}
      {job.error && (<>
        <div style={{ fontSize: 10, color: "var(--state-danger)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>error</div>
        <pre style={{ background: "rgba(239,68,68,0.08)", padding: 8, borderRadius: 4, fontSize: 11, color: "#fca5a5", overflow: "auto" }}>{job.error}</pre>
      </>)}
    </div>
  );
};

const ActionButton = ({ action, onRun }) => {
  const [expanded, setExpanded] = useState(false);
  const [vals, setVals] = useState({});
  const needs = ACTIONS_NEEDING_INPUT[action.kind];

  const fire = () => {
    if (!needs) return onRun(action, {});
    const missing = needs.filter(f => f.required && !String(vals[f.key] || "").trim());
    if (missing.length) { window.toast?.(`Missing: ${missing.map(m=>m.label).join(", ")}`, "error"); return; }
    onRun(action, vals);
    setExpanded(false);
    setVals({});
  };

  return (
    <div style={{ border: "1px solid var(--border-subtle, #1f242c)", borderRadius: 6, marginBottom: 6, overflow: "hidden" }}>
      <button
        onClick={() => needs ? setExpanded(e => !e) : fire()}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "8px 10px", background: "var(--bg-raised, #1a1f25)",
          border: "none", color: "var(--text-primary, #e8ebee)",
          cursor: "pointer", fontSize: 12, textAlign: "left",
        }}>
        <span>{action.label}</span>
        {needs && <span style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{expanded ? "−" : "+"}</span>}
      </button>
      {expanded && needs && (
        <div style={{ padding: 8, background: "var(--bg-base, #14171c)", borderTop: "1px solid var(--border-subtle, #1f242c)" }}>
          {needs.map(f => (
            <input
              key={f.key}
              placeholder={f.label + (f.required ? " *" : "")}
              value={vals[f.key] || ""}
              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{
                display: "block", width: "100%", marginBottom: 6,
                padding: "5px 7px", fontSize: 12,
                background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
                borderRadius: 4, color: "var(--text-primary)",
              }}/>
          ))}
          <button onClick={fire} style={{
            background: "var(--accent-money, #10b981)", color: "#000", border: "none",
            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Run</button>
        </div>
      )}
    </div>
  );
};

const AwarenessPanel = ({ awareness, clipboardSnippet, onPasteClipboard }) => (
  <div style={{
    padding: "8px 12px", background: "var(--bg-raised, #1a1f25)",
    borderBottom: "1px solid var(--border-subtle, #1f242c)",
    fontSize: 11, color: "var(--text-secondary, #9ba3ad)",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-money, #10b981)", display: "inline-block" }}/>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{awareness.route || "/"}</span>
    </div>
    {awareness.selection && (
      <div style={{ marginTop: 4, fontStyle: "italic", color: "var(--text-tertiary, #6b7480)" }}>
        Sel: "{awareness.selection.slice(0, 80)}{awareness.selection.length > 80 ? "…" : ""}"
      </div>
    )}
    {awareness.foreground_app && (
      <div style={{ marginTop: 2 }}>App: {awareness.foreground_app}</div>
    )}
    {awareness.idle_seconds != null && (
      <div style={{ marginTop: 2 }}>Idle: {awareness.idle_seconds}s</div>
    )}
    {clipboardSnippet && (
      <div style={{ marginTop: 4, padding: "4px 6px", background: "var(--bg-base)", borderRadius: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Clipboard:</span>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clipboardSnippet}</span>
        <button onClick={onPasteClipboard} style={{ background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--accent-money)", borderRadius: 3, padding: "1px 5px", fontSize: 10, cursor: "pointer" }}>use</button>
      </div>
    )}
  </div>
);

// ── Chat tab — converse with the copilot via /api/copilot (same Edge fn
//    the older AIRail used; supports Supabase JWT for live data + recent
//    turn memory). Renders into the sidebar's main panel area.
const ChatTab = ({ awareness }) => {
  const [val, setVal] = useState("");
  const [history, setHist] = useState([]); // [{role:'user'|'assistant', text, ms?, err?}]
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history.length, busy]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const ask = useCallback(async (prompt) => {
    if (!prompt.trim() || busy) return;
    const q = prompt.trim();
    setHist(h => [...h, { role: "user", text: q }]);
    setVal("");
    setBusy(true);
    try {
      let jwt = null;
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        jwt = data?.session?.access_token || null;
      }
      const headers = { "content-type": "application/json" };
      if (jwt) headers["x-supabase-auth"] = `Bearer ${jwt}`;
      // Last N turns as {q,a} so the copilot has short-term memory.
      const turns = Array.isArray(history) ? history : [];
      const recent = [];
      for (let i = turns.length - 1; i >= 0 && recent.length < CHAT_HISTORY_TURNS; i--) {
        if (turns[i].role === "assistant" && i > 0 && turns[i-1]?.role === "user") {
          recent.unshift({ q: turns[i-1].text || "", a: turns[i].text || "" });
        }
      }
      const context = awareness?.route || "";
      const resp = await fetch("/api/copilot", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: q, context, history: recent }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error((j.error || "request failed") + (j.detail ? " — " + String(j.detail).slice(0, 200) : ""));
      setHist(h2 => [...h2, { role: "assistant", text: j.text || "(no response)", ms: j.ms, model: j.model }]);
    } catch (e) {
      setHist(h2 => [...h2, { role: "assistant", text: "Couldn't reach the model. " + (e.message || ""), err: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, history, awareness?.route]);

  // Seedable from anywhere: window.dispatchEvent(new CustomEvent('ai:ask',{detail:{prompt}}))
  useEffect(() => {
    const onAsk = (e) => { const p = e.detail?.prompt; if (p) ask(p); };
    window.addEventListener("ai:ask", onAsk);
    return () => window.removeEventListener("ai:ask", onAsk);
  }, [ask]);

  const submit = (e) => { e.preventDefault?.(); ask(val); };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ overflow: "auto", flex: 1, padding: "10px 12px" }}>
        {history.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5, padding: "4px 2px" }}>
            Ask anything about <strong style={{ color: "var(--text-primary)" }}>{awareness?.route || "this page"}</strong>. The copilot sees your route, selection, and recent turns.
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            marginBottom: 8,
          }}>
            <div style={{
              maxWidth: "86%",
              padding: "7px 10px",
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: m.role === "user"
                ? "color-mix(in oklch, var(--accent-money) 22%, transparent)"
                : m.err
                  ? "color-mix(in oklch, var(--state-danger, #ef4444) 14%, transparent)"
                  : GLASS_BG_RAISED,
              border: m.role === "user"
                ? "1px solid color-mix(in oklch, var(--accent-money) 36%, transparent)"
                : GLASS_BORDER,
              color: "var(--text-primary)",
            }}>
              {m.text}
              {m.role === "assistant" && (m.ms != null || m.model) && (
                <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", marginTop: 4, fontFamily: "JetBrains Mono, monospace" }}>
                  {m.model || ""}{m.model && m.ms != null ? " · " : ""}{m.ms != null ? `${m.ms}ms` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "4px 2px" }}>thinking…</div>
        )}
        <div ref={bottomRef}/>
      </div>
      <form onSubmit={submit} style={{
        padding: 10,
        borderTop: GLASS_BORDER,
        display: "flex",
        gap: 6,
        background: "color-mix(in oklch, var(--bg-base) 50%, transparent)",
      }}>
        <textarea
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); }
          }}
          placeholder="Ask the copilot…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            padding: "8px 10px",
            fontSize: 12.5,
            lineHeight: 1.4,
            maxHeight: 120,
            background: GLASS_BG_RAISED,
            border: GLASS_BORDER,
            borderRadius: 10,
            color: "var(--text-primary)",
            fontFamily: "inherit",
            outline: "none",
          }}/>
        <button type="submit" disabled={!val.trim() || busy} style={{
          padding: "0 14px",
          background: val.trim() && !busy ? "var(--accent-money, #10b981)" : "color-mix(in oklch, var(--accent-money) 30%, transparent)",
          color: "#0a0d12",
          border: "none",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          cursor: val.trim() && !busy ? "pointer" : "not-allowed",
        }}>Send</button>
      </form>
    </div>
  );
};

const AISidebar = ({ open, onClose }) => {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [awareness, setAwareness] = useState(() => window.__collectAwareness?.() || {});
  const [clipboardSnippet, setClipboardSnippet] = useState("");
  const [tab, setTab] = useState("chat"); // 'chat' | 'actions' | 'jobs'
  const [filter, setFilter] = useState("");

  const role = useMemo(() => (typeof window !== "undefined" && window.me && window.me()?.role) || null, []);

  // ── Awareness updater ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const update = () => setAwareness(window.__collectAwareness?.() || {});
    update();
    const intervalId = setInterval(update, 1500);

    // Track last activity for idle calculation (also exposed on window for
    // future use).
    const markActivity = () => { window.__lastActivity = Date.now(); };
    document.addEventListener("mousemove", markActivity);
    document.addEventListener("keydown", markActivity);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("mousemove", markActivity);
      document.removeEventListener("keydown", markActivity);
    };
  }, [open]);

  // ── Clipboard sniffer (opt-in: only reads when user clicks the "read clipboard" affordance, browsers gate this) ──
  useEffect(() => {
    if (!open || !navigator.clipboard?.readText) return;
    const tryRead = async () => {
      try { const t = await navigator.clipboard.readText(); if (t && t.length < 500) setClipboardSnippet(t.slice(0, 240)); } catch {}
    };
    // Triggered only when the sidebar gains focus / user clicks inside,
    // so we don't perpetually steal clipboard access.
    const onFocus = () => tryRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open]);

  const usePasteClipboard = useCallback(() => {
    if (!clipboardSnippet) return;
    window.__aiAwareness = { ...(window.__aiAwareness||{}), clipboard: clipboardSnippet };
    setAwareness(window.__collectAwareness?.() || {});
  }, [clipboardSnippet]);

  // ── Realtime rba_commands subscription ─────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const sb = window.getSupabase?.();
    if (!sb) return;
    let cancelled = false;

    (async () => {
      const { data: sess } = await sb.auth.getSession();
      const jwt = sess?.session?.access_token;
      if (!jwt) return;
      const { data, error } = await sb
        .from("rba_commands")
        .select("id, kind, status, payload, result, error, created_at, started_at, completed_at, agency_id, device_id, posted_by")
        .order("created_at", { ascending: false })
        .limit(JOB_FETCH_LIMIT);
      if (!cancelled && data) setJobs(data);
    })();

    const channel = sb
      .channel("ai-sidebar-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "rba_commands" }, (payload) => {
        setJobs((prev) => {
          const incoming = payload.new || payload.old;
          if (!incoming) return prev;
          const filtered = prev.filter((j) => j.id !== incoming.id);
          if (payload.eventType === "DELETE") return filtered;
          return [incoming, ...filtered].slice(0, JOB_FETCH_LIMIT);
        });
      })
      .subscribe();

    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [open]);

  // ── Action runner ────────────────────────────────────────────────────
  const runAction = useCallback(async (action, extraPayload) => {
    const merged = { ...action, payload: { ...(action.payload || {}), ...(extraPayload || {}) } };
    const result = await window.enqueueAgentJob(merged);
    if (result?.command_id || result?.job_id) {
      const newId = result.command_id || result.job_id;
      // Pre-populate the list so the UI feels immediate even before realtime
      // delivers the INSERT event.
      setJobs((prev) => [{ id: newId, kind: action.kind, status: result.status || "queued", payload: merged.payload, created_at: new Date().toISOString() }, ...prev].slice(0, JOB_FETCH_LIMIT));
      setTab("jobs");
    }
  }, []);

  // ── Filtered + grouped action list ───────────────────────────────────
  const visibleActions = useMemo(() => {
    const q = filter.toLowerCase();
    return (typeof AGENT_ACTIONS !== "undefined" ? AGENT_ACTIONS : [])
      .filter(a => FUNCTIONAL_AGENT_KINDS.has(a.kind))
      .filter(a => !role || (a.roles || []).includes(role) || (a.roles || []).includes("super_admin"))
      .filter(a => !q || a.kind.includes(q) || a.label.toLowerCase().includes(q));
  }, [filter, role]);

  const groupedActions = useMemo(() => {
    const groups = {};
    visibleActions.forEach(a => {
      const g = a.group || "_legacy";
      (groups[g] = groups[g] || []).push(a);
    });
    return groups;
  }, [visibleActions]);

  // ── Keyboard: ESC to close ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.22)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.18s",
          zIndex: 8999,
        }}/>
      <aside
        style={{
          position: "fixed",
          top: AI_SIDEBAR_INSET,
          right: AI_SIDEBAR_INSET,
          bottom: AI_SIDEBAR_INSET,
          width: AI_SIDEBAR_WIDTH,
          maxWidth: `calc(100vw - ${AI_SIDEBAR_INSET * 2}px)`,
          background: GLASS_BG,
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: GLASS_BORDER,
          borderRadius: 18,
          boxShadow: [
            "inset 0 1px 0 color-mix(in oklch, white 10%, transparent)",
            "inset 0 -1px 0 color-mix(in oklch, black 28%, transparent)",
            "0 24px 60px rgba(0,0,0,0.45)",
          ].join(", "),
          transform: open ? "translateX(0)" : `translateX(calc(100% + ${AI_SIDEBAR_INSET * 2}px))`,
          opacity: open ? 1 : 0,
          transition: "transform 0.22s cubic-bezier(0.32,0.72,0.24,1.06), opacity 0.18s ease-out",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          zIndex: 9000,
          color: "var(--text-primary, #e8ebee)",
        }}>
        <header style={{
          padding: "10px 14px",
          borderBottom: GLASS_BORDER,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "color-mix(in oklch, var(--bg-base) 30%, transparent)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--accent-money, #10b981)",
              boxShadow: "0 0 8px color-mix(in oklch, var(--accent-money) 70%, transparent)",
            }}/>
            <span style={{ fontWeight: 700, fontSize: 13 }}>AI Copilot</span>
            <span style={{ fontSize: 10, color: "var(--text-tertiary, #6b7480)", fontFamily: "JetBrains Mono, monospace" }}>{role || "—"}</span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0, width: 24, height: 24 }} aria-label="Close">×</button>
        </header>

        <AwarenessPanel awareness={awareness} clipboardSnippet={clipboardSnippet} onPasteClipboard={usePasteClipboard}/>

        <div style={{ display: "flex", borderBottom: GLASS_BORDER, padding: "0 6px" }}>
          {["chat", "actions", "jobs"].map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedJob(null); }} style={{
              flex: 1, padding: "8px 10px", background: "transparent",
              border: "none", color: tab === t ? "var(--accent-money)" : "var(--text-tertiary)",
              cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
              borderBottom: tab === t ? "2px solid var(--accent-money)" : "2px solid transparent",
            }}>
              {t === "chat" ? "Chat" : t === "actions" ? "Actions" : `Jobs (${jobs.length})`}
            </button>
          ))}
        </div>

        {tab === "chat" && <ChatTab awareness={awareness}/>}

        {tab === "actions" && (
          <div style={{ overflow: "auto", flex: 1, padding: 10 }}>
            <input
              placeholder="Filter actions…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ width: "100%", padding: "5px 8px", marginBottom: 10, fontSize: 12,
                       background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
                       borderRadius: 4, color: "var(--text-primary)" }}/>
            {ACTION_GROUP_ORDER.map(g => {
              const list = groupedActions[g] || [];
              if (!list.length) return null;
              return (
                <div key={g} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary, #6b7480)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{ACTION_GROUP_LABELS[g] || g}</div>
                  {list.map(a => <ActionButton key={a.kind} action={a} onRun={runAction}/>)}
                </div>
              );
            })}
            {!visibleActions.length && (
              <div style={{ color: "var(--text-tertiary)", fontSize: 12, padding: 20, textAlign: "center" }}>No actions available for role <b>{role || "?"}</b></div>
            )}
          </div>
        )}

        {tab === "jobs" && !selectedJob && (
          <div style={{ overflow: "auto", flex: 1 }}>
            {jobs.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No jobs yet. Fire an action.</div>}
            {jobs.map(j => <JobRow key={j.id} job={j} onSelect={setSelectedJob}/>)}
          </div>
        )}

        {tab === "jobs" && selectedJob && (
          <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)}/>
        )}
      </aside>
    </>
  );
};

// ── Floating toggle button — REMOVED ────────────────────────────────────
// AI Copilot is now opened from the topbar Sparkles button (shared.jsx
// Topbar → window.toggleAISidebar()) and from the Cmd+J hotkey. Keeping a
// no-op component so the AICopilotMount JSX below doesn't have to change.
const AISidebarToggle = () => null;

// ── Mount point — wraps the toggle + sidebar together so the host App only
//    has to render <AICopilotMount/> once.
const AICopilotMount = () => {
  const [open, setOpen] = useState(false);

  // Global toggler so non-React code (CmdK, page buttons, hotkeys) can open.
  useEffect(() => {
    window.toggleAISidebar = () => setOpen(o => !o);
    window.openAISidebar   = () => setOpen(true);
    window.closeAISidebar  = () => setOpen(false);
    const onAsk = () => setOpen(true);
    window.addEventListener("ai:ask", onAsk);
    return () => {
      window.removeEventListener("ai:ask", onAsk);
      delete window.toggleAISidebar;
      delete window.openAISidebar;
      delete window.closeAISidebar;
    };
  }, []);

  // Hotkey: Cmd/Ctrl + J
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <>
      <AISidebar open={open} onClose={() => setOpen(false)}/>
      <AISidebarToggle open={open} onToggle={() => setOpen(o => !o)}/>
    </>
  );
};

window.AISidebar = AISidebar;
window.AICopilotMount = AICopilotMount;
