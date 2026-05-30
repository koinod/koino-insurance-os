/* rba-dial.jsx — global dial-via-agent helper.
 *
 * Exposes:
 *   window.repflowDialViaAgent({ lead_id, lead_name, to_number, provider?,
 *                                 dial_count?, dial_interval_seconds?, method? })
 *     1. POSTs /api/agent/dispatch-dial with the lead context
 *     2. Toasts the queue state with the typed `code` from the API on failure
 *     3. Registers the in-flight dial in window.repflowActiveDials so the
 *        DialMonitor renders an attempt counter + Stop button
 *     4. Polls /api/agent/command-result every 2s until status terminal
 *     5. Toasts the agent's actual response on terminal status
 *
 *   window.repflowCancelDial(command_id) — POST /api/agent/dispatch-cancel-dial
 *     so the agent's multi-dial loop halts mid-sequence.
 *
 *   window.repflowDialSettings — { count, intervalSec } default applied when
 *     a Call surface doesn't specify count/interval. UI controls mutate this.
 *
 *   window.repflowActiveDials — Map<command_id, {to_number, lead_name, count,
 *     interval, attempt, status, started_at}> driving the DialMonitor render.
 *
 *   window.RepflowDialMonitor — React component, mount next to ToastHost.
 *
 * Mounted globally from app.jsx (window.RBADialBootstrap component, side-effect
 * registers the helper on first render). No UI of its own — pure plumbing
 * plus an opt-in monitor component.
 *
 * Replaces the legacy `window.repflowCall(phone, name)` for the LeadDetail
 * Call button. The button falls back to repflowCall if this helper is missing
 * (e.g. user is on a build without the agent host).
 */

(function () {

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000;   // multi-dial 5×@120s = 10min worst case

const FRIENDLY_CODE = {
  no_auth:                "Sign in first.",
  no_membership:          "You're not in an agency yet.",
  no_agent:               "Install the agent on your machine: Settings → Agents → Install on a machine.",
  no_phone:               "This lead has no phone on file.",
  phone_invalid:          "Phone number format is invalid.",
  no_connector:           "Connect that provider in Settings → Agents first.",
  bad_provider:           "Set a valid default dial provider in Settings → Agents.",
  phone_link_unsupported_os: "Phone Link only works on Windows.",
  command_insert_failed:  "Couldn't queue the dial. Check the agent's heartbeat.",
  lead_not_found:         "Lead not found (try refresh).",
  lead_other_tenant:      "That lead belongs to a different agency.",
};

// User-mutable defaults for count + interval. The UI Call buttons can read
// + update these, OR pass per-click overrides to repflowDialViaAgent.
window.repflowDialSettings = window.repflowDialSettings || { count: 1, intervalSec: 15 };

// Map<command_id, dialState>. dialState shape:
//   { to_number, lead_name, count, interval, attempt, status,
//     started_at, error, method_used, last_poll_at }
// Status: 'queued' | 'claimed' | 'dialing' | 'sleeping' | 'succeeded' | 'failed' | 'expired' | 'cancelling' | 'cancelled' | 'timeout'
window.repflowActiveDials = window.repflowActiveDials || new Map();
const dialMonitorListeners = new Set();
function notifyMonitor() { dialMonitorListeners.forEach(fn => { try { fn(); } catch {} }); }

function setDialState(commandId, patch) {
  const cur = window.repflowActiveDials.get(commandId) || {};
  window.repflowActiveDials.set(commandId, { ...cur, ...patch, last_poll_at: Date.now() });
  notifyMonitor();
}
function clearDialState(commandId, finalStatus, lingerMs = 8000) {
  // Keep terminal entry visible briefly so the user sees the result, then drop.
  const cur = window.repflowActiveDials.get(commandId);
  if (!cur) return;
  window.repflowActiveDials.set(commandId, { ...cur, status: finalStatus, last_poll_at: Date.now() });
  notifyMonitor();
  // Surface a terminal event so listeners (e.g. CallRecorder auto-stop) can
  // react without polling repflowActiveDials.
  try {
    window.dispatchEvent(new CustomEvent("autodial:call:end", {
      detail: {
        commandId,
        finalStatus,
        leadId: cur.lead_id || null,
        leadName: cur.lead_name || null,
        toNumber: cur.to_number || null,
        outcomeHint: cur.outcome_hint || null,   // connected | no_answer | unknown
      },
    }));
  } catch {}
  setTimeout(() => {
    window.repflowActiveDials.delete(commandId);
    notifyMonitor();
  }, lingerMs);
}

async function jwt() {
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}

async function dispatch(args) {
  const t = await jwt();
  if (!t) {
    window.toast && window.toast("Sign in to dial.", "error");
    return null;
  }
  const r = await fetch("/api/agent/dispatch-dial", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({
      lead_id:     args.lead_id || null,
      to_number:   args.to_number || null,
      provider:    args.provider || null,
      dial_count:  args.dial_count || undefined,
      dial_interval_seconds: args.dial_interval_seconds || undefined,
      method:      args.method || undefined,
      monitor:     args.monitor || undefined,
    }),
  });
  let body = null;
  try { body = await r.json(); } catch {}
  if (!r.ok) {
    const friendly = FRIENDLY_CODE[body?.code] || body?.fix || body?.error || `HTTP ${r.status}`;
    window.toast && window.toast(`Dial: ${friendly}`, "error");
    return null;
  }
  return body;
}

async function pollResult(commandId) {
  const t = await jwt();
  if (!t) return null;
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const r = await fetch(`/api/agent/command-result?id=${encodeURIComponent(commandId)}`,
      { headers: { authorization: `Bearer ${t}` } });
    if (!r.ok) continue;
    const body = await r.json();
    const cmd = body?.command;
    if (!cmd) continue;
    // Update monitor with intermediate progress where we can. The agent
    // doesn't currently push per-attempt status, but `status` (queued →
    // claimed → succeeded/failed) is available, and final result has the
    // attempts[] array.
    if (cmd.status && cmd.status !== "succeeded" && cmd.status !== "failed" && cmd.status !== "expired") {
      setDialState(commandId, { status: cmd.status });
    }
    if (cmd.status === "succeeded" || cmd.status === "failed" || cmd.status === "expired") {
      return cmd;
    }
  }
  return { status: "timeout" };
}

window.repflowCancelDial = async function (commandId) {
  if (!commandId) return false;
  const t = await jwt();
  if (!t) {
    window.toast && window.toast("Sign in to cancel.", "error");
    return false;
  }
  setDialState(commandId, { status: "cancelling" });
  const r = await fetch("/api/agent/dispatch-cancel-dial", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ dial_command_id: commandId }),
  });
  let body = null; try { body = await r.json(); } catch {}
  if (!r.ok) {
    window.toast && window.toast(`Stop: ${body?.error || `HTTP ${r.status}`}`, "error");
    setDialState(commandId, { status: "claimed" });   // revert visual
    return false;
  }
  window.toast && window.toast(`Stop queued — agent will halt before next attempt.`, "info");
  return true;
};

// Hijack the existing global `repflowCall(phone, leadName)` so EVERY surface
// that already calls it — page-crm modal, page-floor, page-queue, autodialer,
// owner page, tenant page — automatically routes through the agent dispatch
// using window.repflowDialSettings as the count/interval default.
function installHijack() {
  const cur = window.repflowCall;
  if (cur && cur.__rbaWrapped) return;
  if (typeof cur === "function") window.repflowCallLegacy = cur;
  function wrapped(phone, leadName, opts) {
    if (typeof window.repflowDialViaAgent !== "function") {
      if (typeof window.repflowCallLegacy === "function") {
        return window.repflowCallLegacy(phone, leadName, opts);
      }
      window.toast && window.toast("Dial: agent helper missing.", "error");
      return;
    }
    const s = window.repflowDialSettings || {};
    return window.repflowDialViaAgent({
      lead_id:   (opts && opts.lead_id)   || null,
      lead_name: leadName,
      to_number: phone,
      provider:  (opts && opts.provider)  || null,
      dial_count:            (opts && opts.dial_count)            || s.count || 1,
      dial_interval_seconds: (opts && opts.dial_interval_seconds) || s.intervalSec || 15,
      method:    (opts && opts.method)    || null,
      monitor:   (opts && opts.monitor)   || false,
    });
  }
  wrapped.__rbaWrapped = true;
  window.repflowCall = wrapped;
}
installHijack();
if (typeof window !== "undefined") {
  window.addEventListener("load", installHijack);
  let _ticks = 0;
  const _t = setInterval(() => {
    installHijack();
    if (++_ticks >= 15) clearInterval(_t);
  }, 2000);
}

window.repflowDialViaAgent = async function (args) {
  const targetLabel = args.lead_name ? ` (${args.lead_name})` : "";
  const count    = Math.max(1, Math.min(5, parseInt(args.dial_count, 10) || 1));
  const interval = Math.max(5, Math.min(120, parseInt(args.dial_interval_seconds, 10) || 15));
  const multiTag = count > 1 ? ` (${count}× every ${interval}s)` : "";
  window.toast && window.toast(`Queuing dial to ${args.to_number}${targetLabel}${multiTag}…`, "info");
  const queued = await dispatch({ ...args, dial_count: count, dial_interval_seconds: interval });
  if (!queued) return;
  // Register in monitor so the DialMonitor renders a Stop button.
  setDialState(queued.command_id, {
    to_number:  queued.to_number || args.to_number,
    lead_name:  args.lead_name || null,
    lead_id:    args.lead_id || null,
    count, interval,
    attempt:    0,
    status:     "queued",
    started_at: Date.now(),
  });
  // Surface a start event so listeners (e.g. CallRecorder auto-start) can
  // capture audio for the duration of the dial — covers both pickup and
  // voicemail since the agent doesn't differentiate.
  try {
    window.dispatchEvent(new CustomEvent("autodial:call:start", {
      detail: {
        commandId: queued.command_id,
        leadId:    args.lead_id || null,
        leadName:  args.lead_name || null,
        toNumber:  queued.to_number || args.to_number,
        provider:  queued.provider || null,
        count, interval,
      },
    }));
  } catch {}
  window.toast && window.toast(
    `Agent received command (${queued.kind}, provider: ${queued.provider}). Waiting for result…`,
    "info"
  );
  const final = await pollResult(queued.command_id);
  if (!final) { clearDialState(queued.command_id, "failed"); return; }
  if (final.status === "timeout") {
    window.toast && window.toast(`Dial: agent didn't respond in 10 min. Check Settings → Agents → device status.`, "warn");
    clearDialState(queued.command_id, "timeout");
    return;
  }
  if (final.status === "failed") {
    const msg = final.error || "agent reported failure";
    window.toast && window.toast(`Dial failed: ${String(msg).slice(0, 200)}`, "error");
    clearDialState(queued.command_id, "failed");
    return;
  }
  if (final.status === "expired") {
    window.toast && window.toast(`Dial: command expired before agent claimed it (offline?).`, "warn");
    clearDialState(queued.command_id, "expired");
    return;
  }
  // succeeded
  const r = final.result || {};
  const inner = r.status || "ok";
  setDialState(queued.command_id, {
    attempt: (r.attempts && r.attempts.length) || count,
    method_used: r.method_used,
    status: r.cancelled ? "cancelled" : inner,
    outcome_hint: r.outcome_hint || null,
  });
  if (inner === "cancelled" || r.cancelled) {
    window.toast && window.toast(
      `Dial cancelled after ${(r.attempts && r.attempts.length) || 0} of ${count} attempts.`,
      "info"
    );
  } else if (inner === "dialed_via_phone_link") {
    const n = (r.attempts && r.attempts.length) || 1;
    const pluralTag = n > 1 ? ` (${n}× attempts)` : "";
    window.toast && window.toast(
      `Dialed ${r.to_number || args.to_number} via Phone Link${pluralTag}, method: ${r.method_used || "?"}. Check your paired phone.`,
      "success"
    );
  } else if (inner === "phone_link_window_not_found" || inner === "no_handler" || inner === "uia_failed") {
    window.toast && window.toast(`Dial: ${r.fix || r.detail || inner}`, "warn");
  } else if (inner === "awaiting_confirmation") {
    window.toast && window.toast(`Dial needs confirmation — check the modal top-right.`, "info");
  } else {
    window.toast && window.toast(`Dial: ${inner}`, "success");
  }
  clearDialState(queued.command_id, r.cancelled ? "cancelled" : inner);
};

/* ──────────────────────────────────────────────────────────────────────────
   DialMonitor — fixed-position pill stack showing each in-flight dial with
   attempt counter + Stop button. Mount once at app root.

   Hidable (2026-05-25): card stack was overlapping the AutoDialBar mini
   bar at the bottom of the screen. Now collapses to a single small pill
   showing the live dial count; click to expand. Persists per device in
   localStorage so it doesn't surprise reps on every reload.
   ────────────────────────────────────────────────────────────────────────── */
window.RepflowDialMonitor = function () {
  const [, force] = React.useState(0);
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem("repflow.dialmonitor.collapsed") === "1"; }
    catch { return false; }
  });
  React.useEffect(() => {
    const fn = () => force(n => n + 1);
    dialMonitorListeners.add(fn);
    return () => dialMonitorListeners.delete(fn);
  }, []);
  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("repflow.dialmonitor.collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const dials = Array.from(window.repflowActiveDials.entries());
  if (dials.length === 0) return null;

  // Sit ABOVE the AutoDialBar (which is at bottom: 0 with its own height).
  // The dialer mini bar is ~52px tall — bottom: 64 keeps a small gap.
  const styleHost = {
    position: "fixed", right: 16, bottom: 64, zIndex: 9999,
    display: "flex", flexDirection: "column", gap: 6,
    fontFamily: "ui-sans-serif,system-ui,sans-serif", fontSize: 12,
    alignItems: "flex-end",
  };

  // Collapsed: tiny pill with count + chevron. Click to expand.
  if (collapsed) {
    const activeCount = dials.filter(([, d]) =>
      ["queued","claimed","dialing","sleeping","cancelling"].includes(d.status)
    ).length;
    return (
      <div style={styleHost}>
        <button
          onClick={toggle}
          title="Show dial monitor"
          style={{
            background: "#0f172a", color: "#e2e8f0",
            border: "1px solid #1e293b", padding: "6px 10px",
            borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: activeCount > 0 ? "#22c55e" : "#64748b",
            display: "inline-block",
          }}/>
          {dials.length} dial{dials.length === 1 ? "" : "s"}
          <span style={{ opacity: 0.6, fontSize: 10 }}>▲</span>
        </button>
      </div>
    );
  }

  const stopColor   = { background: "#7f1d1d", color: "#fff" };
  const goingColor  = { background: "#0f172a", color: "#e2e8f0", borderColor: "#1e293b" };
  const doneColor   = { background: "#064e3b", color: "#d1fae5", borderColor: "#065f46" };
  const errColor    = { background: "#7f1d1d", color: "#fee2e2", borderColor: "#991b1b" };
  return (
    <div style={styleHost}>
      {/* Collapse handle — small header above the stack */}
      <button
        onClick={toggle}
        title="Collapse dial monitor"
        style={{
          background: "#0f172a", color: "#94a3b8",
          border: "1px solid #1e293b", padding: "3px 8px",
          borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}
      >
        Hide ▼
      </button>
      {dials.map(([id, d]) => {
        const isGoing = ["queued","claimed","dialing","sleeping","cancelling"].includes(d.status);
        const isDone  = ["succeeded","dialed_via_phone_link"].includes(d.status);
        const isErr   = ["failed","expired","timeout"].includes(d.status);
        const isCancl = d.status === "cancelled";
        const palette = isErr ? errColor : isDone ? doneColor : isCancl ? errColor : goingColor;
        const label   = d.lead_name || d.to_number || "dial";
        const sub     = `${d.attempt || 0}/${d.count || 1} · ${d.status}`;
        return (
          <div key={id} style={{
            ...palette,
            padding: "8px 10px", borderRadius: 8, minWidth: 240,
            border: `1px solid ${palette.borderColor || "#1e293b"}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label} · {d.to_number}
              </div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>{sub}{d.method_used ? ` · ${d.method_used}` : ""}</div>
            </div>
            {isGoing && d.count > 1 && (
              <button
                onClick={() => window.repflowCancelDial(id)}
                disabled={d.status === "cancelling"}
                style={{
                  marginLeft: 10, padding: "4px 10px", borderRadius: 6,
                  border: "1px solid #b91c1c", cursor: d.status === "cancelling" ? "not-allowed" : "pointer",
                  ...stopColor,
                  opacity: d.status === "cancelling" ? 0.5 : 1,
                }}>
                {d.status === "cancelling" ? "Stopping…" : "Stop"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   DialCountSelect — small select for "Try N×" alongside Call buttons.
   Reads/writes window.repflowDialSettings.count globally.
   ────────────────────────────────────────────────────────────────────────── */
window.RepflowDialCountSelect = function () {
  const [n, setN] = React.useState((window.repflowDialSettings && window.repflowDialSettings.count) || 1);
  React.useEffect(() => {
    window.repflowDialSettings = window.repflowDialSettings || { count: 1, intervalSec: 15 };
    window.repflowDialSettings.count = n;
  }, [n]);
  return (
    <select
      value={n}
      onChange={(e) => setN(parseInt(e.target.value, 10))}
      title="How many times should the agent try this number? Click Stop in the bottom-right monitor to halt mid-sequence."
      style={{
        padding: "4px 6px", borderRadius: 6, border: "1px solid #334155",
        background: "#0f172a", color: "#e2e8f0", fontSize: 12, cursor: "pointer",
      }}
    >
      <option value={1}>1×</option>
      <option value={2}>2×</option>
      <option value={3}>3×</option>
      <option value={4}>4×</option>
      <option value={5}>5×</option>
    </select>
  );
};

})();
