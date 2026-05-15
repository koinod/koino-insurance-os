/* rba-dial.jsx — global dial-via-agent helper.
 *
 * Exposes window.repflowDialViaAgent({ lead_id, lead_name, to_number, provider? })
 * which:
 *   1. POSTs /api/agent/dispatch-dial with the lead context
 *   2. Toasts the queue state with the typed `code` from the API on failure
 *   3. Polls /api/agent/command-result every 2s until status terminal
 *   4. Toasts the agent's actual response (with method_used, dialed digits, etc.)
 *
 * Mounted globally from app.jsx (window.RBADialBootstrap component, side-effect
 * registers the helper on first render). No UI of its own — pure plumbing.
 *
 * Replaces the legacy `window.repflowCall(phone, name)` for the LeadDetail
 * Call button. The button falls back to repflowCall if this helper is missing
 * (e.g. user is on a build without the agent host).
 */

(function () {

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 5 * 60 * 1000;

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
      lead_id: args.lead_id || null,
      to_number: args.to_number || null,
      provider: args.provider || null,
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
    if (cmd.status === "succeeded" || cmd.status === "failed" || cmd.status === "expired") {
      return cmd;
    }
  }
  return { status: "timeout" };
}

window.repflowDialViaAgent = async function (args) {
  // args: { lead_id, lead_name, to_number, provider? }
  const targetLabel = args.lead_name ? ` (${args.lead_name})` : "";
  window.toast && window.toast(`Queuing dial to ${args.to_number}${targetLabel}…`, "info");
  const queued = await dispatch(args);
  if (!queued) return;
  window.toast && window.toast(
    `Agent received command (${queued.kind}, provider: ${queued.provider}). Waiting for result…`,
    "info"
  );
  const final = await pollResult(queued.command_id);
  if (!final) return;
  if (final.status === "timeout") {
    window.toast && window.toast(`Dial: agent didn't respond in 5 min. Check Settings → Agents → device status.`, "warn");
    return;
  }
  if (final.status === "failed") {
    const msg = final.error || "agent reported failure";
    window.toast && window.toast(`Dial failed: ${String(msg).slice(0, 200)}`, "error");
    return;
  }
  if (final.status === "expired") {
    window.toast && window.toast(`Dial: command expired before agent claimed it (offline?).`, "warn");
    return;
  }
  // succeeded
  const r = final.result || {};
  const inner = r.status || "ok";
  if (inner === "dialed_via_phone_link") {
    window.toast && window.toast(
      `Dialed ${r.to_number || args.to_number} via Phone Link (${r.method_used || "?"}). Check your paired phone.`,
      "success"
    );
  } else if (inner === "phone_link_window_not_found" || inner === "no_handler" || inner === "uia_failed") {
    window.toast && window.toast(`Dial: ${r.fix || r.detail || inner}`, "warn");
  } else if (inner === "awaiting_confirmation") {
    window.toast && window.toast(`Dial needs confirmation — check the modal top-right.`, "info");
  } else {
    window.toast && window.toast(`Dial: ${inner}`, "success");
  }
};

})();
