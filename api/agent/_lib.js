// Shared helpers for /api/agent/* — Supabase wiring, CORS, token plumbing.
export const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
export const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
export const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function cors() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-supabase-auth, x-agent-token, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

export async function rpc(fn, body, jwt) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": ANON,
      "authorization": `Bearer ${jwt || ANON}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

// Look up an active install by its agent_token bearer. Uses service role so
// the agent doesn't need a user JWT — the agent_token IS the credential.
export async function loadInstallByToken(agent_token) {
  if (!agent_token || !SERVICE) return null;
  const r = await fetch(`${SUPA_URL}/rest/v1/rba_installs?select=device_id,user_id,agency_id,role,status&agent_token=eq.${encodeURIComponent(agent_token)}`, {
    headers: { "apikey": SERVICE, "authorization": `Bearer ${SERVICE}` }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (row.status !== "active") return null;
  return row;
}

export function readAgentToken(req) {
  return (req.headers.get("x-agent-token") || "").trim() || null;
}

export function readUserJwt(req) {
  const a = req.headers.get("authorization") || req.headers.get("x-supabase-auth") || "";
  return a.replace(/^Bearer\s+/i, "") || null;
}

// Capability ledger — what each role's local agent is allowed to call.
// The web app's RLS still gates database writes; this gates LOCAL tools that
// don't touch the DB (shell, fs, browser automation).
export const CAPABILITIES = {
  rep: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: false, write_commissions: false, write_invites: false,
          write_agency_settings: false },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: false,
             record_system_audio: "during_calls_only", read_clipboard: "with_prompt",
             open_url: true, shell: false, fs_outside_workspace: false },
    rate: { dials_per_hour: 120, drafts_per_hour: 60, browser_runs_per_hour: 30 },
  },
  manager: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: "downline_only", write_commissions: false, write_invites: false,
          write_agency_settings: false },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: "during_calls_only", read_clipboard: true,
             open_url: true, shell: false, fs_outside_workspace: false },
    rate: { dials_per_hour: 240, drafts_per_hour: 120, browser_runs_per_hour: 60 },
  },
  owner: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: true, write_commissions: true, write_invites: true,
          write_agency_settings: true },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: true, read_clipboard: true,
             open_url: true, shell: false, fs_outside_workspace: false },
    rate: { dials_per_hour: 600, drafts_per_hour: 600, browser_runs_per_hour: 240 },
    confirm_required: ["send_real_sms", "charge_card", "delete_policy", "bulk_action_ge_10"],
  },
  admin: {
    // IMO-wide — all child agencies under imo_id, but never cross-IMO
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: true, write_commissions: true, write_invites: true,
          write_agency_settings: true, cross_agency_within_imo: true },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: true, read_clipboard: true,
             open_url: true, shell: false, fs_outside_workspace: false },
    rate: { dials_per_hour: 1200, drafts_per_hour: 1200, browser_runs_per_hour: 600 },
    confirm_required: ["send_real_sms", "charge_card", "delete_policy", "bulk_action_ge_10",
                       "switch_into_agency"],
  },
};
