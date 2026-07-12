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
  const isService = jwt === SERVICE && !!SERVICE;
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": isService ? SERVICE : ANON,
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

export function decodeJwtPayload(jwt) {
  try {
    const payload = String(jwt || "").split(".")[1];
    if (!payload) return {};
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const json = typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function rpcBool(data, key) {
  if (typeof data === "boolean") return data;
  if (Array.isArray(data)) return data.some((row) => row === true || row?.[key] === true || row?.is_super_admin === true);
  return !!(data && (data[key] === true || data.is_super_admin === true));
}

export async function viewerIsSuperAdmin(jwt, meRow = null) {
  if (meRow?.is_super_admin === true || meRow?.role === "super_admin") return true;
  if (!jwt) return false;
  const r = await rpc("viewer_is_super_admin", {}, jwt);
  if (!r.ok) return false;
  return rpcBool(r.data, "viewer_is_super_admin");
}

// Resolve the calling user's identity by calling public.me() with their JWT.
// Returns { user_id, agency_id, role, rep_id, full_name } or null on failure.
export async function loadCallerFromJwt(jwt) {
  if (!jwt) return null;
  const r = await rpc("me", null, jwt);
  if (!r.ok || !Array.isArray(r.data)) return null;
  const row = r.data[0] || null;
  const isSuper = await viewerIsSuperAdmin(jwt, row);
  if (!row && !isSuper) return null;
  const claims = row ? {} : decodeJwtPayload(jwt);
  return {
    user_id:  row?.user_id || claims.sub || null,
    agency_id: row?.agency_id || null,
    role:     isSuper ? "super_admin" : row?.role,
    agency_role: row?.role || null,
    rep_id:   row?.rep_id || null,
    full_name: row?.full_name || claims.email || null,
    is_super_admin: isSuper,
  };
}

// Insert one row into public.agent_audit using service-role.
// Returns true on success, false otherwise. Never throws — audit failures must
// not block the surrounding request from returning a useful error to the caller.
export async function writeAgentAudit(row) {
  if (!SERVICE) return false;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/agent_audit`, {
      method: "POST",
      headers: {
        "apikey": SERVICE,
        "authorization": `Bearer ${SERVICE}`,
        "content-type": "application/json",
        "prefer": "return=minimal",
      },
      body: JSON.stringify(row),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Stable stringify for client-side idempotency: sort object keys recursively.
// JSON.stringify isn't deterministic across runtimes when key order differs.
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
}

// Capability ledger — what each role's local agent is allowed to call.
// The web app's RLS still gates database writes; this gates LOCAL tools that
// don't touch the DB (shell, fs, browser automation).
//
// Shape: { db, local, connectors, rate, confirm_required }
// Tools declare REQUIRED_CAPS as dotted paths; agent's caps_allow() walks
// the role's tree and only allows when every required path is truthy.
//
// Hard rules (PRD §10) enforced server-side by absence:
//   • shell: false on every role, ever.
//   • fs_outside_workspace: false on every role, ever.

const BASE_LOCAL_DENY = {
  shell: false,
  fs_outside_workspace: false,
};

const BASE_CONNECTORS = {
  // Boolean = "this connector usable by this role". Tokens come from
  // connector_vault per user; the boolean controls whether the agent will
  // even attempt to exchange.
  twilio: true, sendblue: true, fathom: true,
  gmail: true, outlook: true,
  linkedin: false, sales_nav: false,                   // off by default; opt-in per role
  fb_ads: true, ig_business: true, meta_dm: true,
  calendly: true, stripe: false,
  bluetooth_phone: false,                              // opt-in per device
  phantombuster: false, apollo: true, zoominfo: true, clay: true,
};

export const CAPABILITIES = {
  rep: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: false, write_commissions: false, write_invites: false,
          write_agency_settings: false },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: false,
             record_system_audio: "on_pickup", read_clipboard: "with_prompt",
             open_url: true, ...BASE_LOCAL_DENY },
    connectors: { ...BASE_CONNECTORS, linkedin: false, fb_ads: false, ig_business: false },
    rate: { dials_per_hour: 120, drafts_per_hour: 60, browser_runs_per_hour: 30 },
  },
  manager: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: "downline_only", write_commissions: false, write_invites: false,
          write_agency_settings: false },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: "on_pickup", read_clipboard: true,
             open_url: true, ...BASE_LOCAL_DENY },
    connectors: { ...BASE_CONNECTORS, linkedin: true, sales_nav: true },
    rate: { dials_per_hour: 240, drafts_per_hour: 120, browser_runs_per_hour: 60 },
  },
  owner: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: true, write_commissions: true, write_invites: true,
          write_agency_settings: true },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: "on_pickup", read_clipboard: true,
             open_url: true, ...BASE_LOCAL_DENY },
    connectors: { ...BASE_CONNECTORS, linkedin: true, sales_nav: true, stripe: true },
    rate: { dials_per_hour: 600, drafts_per_hour: 600, browser_runs_per_hour: 240 },
    confirm_required: ["send_real_sms", "send_real_email", "charge_card", "delete_policy", "bulk_action_ge_10"],
  },
  admin: {
    // IMO-wide — all child agencies under imo_id, but never cross-IMO
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: true, write_commissions: true, write_invites: true,
          write_agency_settings: true, cross_agency_within_imo: true },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: "on_pickup", read_clipboard: true,
             open_url: true, ...BASE_LOCAL_DENY },
    connectors: { ...BASE_CONNECTORS, linkedin: true, sales_nav: true, stripe: true, phantombuster: true },
    rate: { dials_per_hour: 1200, drafts_per_hour: 1200, browser_runs_per_hour: 600 },
    confirm_required: ["send_real_sms", "send_real_email", "charge_card", "delete_policy", "bulk_action_ge_10",
                       "switch_into_agency"],
  },
  super_admin: {
    db: { read_own_pipeline: true, read_own_queue: true, read_own_calls: true,
          read_team_pipeline: true, write_commissions: true, write_invites: true,
          write_agency_settings: true, cross_agency_within_imo: true, cross_imo: true },
    local: { dial_twilio: true, draft_email: true, draft_sms: true,
             browser_carrier_portal: true, browser_general: true,
             record_system_audio: true, read_clipboard: true,
             open_url: true, ...BASE_LOCAL_DENY },
    connectors: Object.fromEntries(Object.keys(BASE_CONNECTORS).map(k => [k, true])),
    rate: { dials_per_hour: 99999, drafts_per_hour: 99999, browser_runs_per_hour: 99999 },
    confirm_required: ["send_real_sms", "send_real_email", "charge_card", "delete_policy", "bulk_action_ge_10",
                       "switch_into_agency", "cross_imo_action"],
  },
};

// In-memory rate limiting state
const ipLimits = new Map();
const userLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 invite operations per minute per client

export function checkRateLimit(ip, userId) {
  const now = Date.now();

  const isRateLimited = (key, limitMap) => {
    if (!key) return false;
    let history = limitMap.get(key) || [];
    // Clean old requests outside of the window
    history = history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (history.length >= MAX_REQUESTS_PER_WINDOW) {
      return true;
    }
    history.push(now);
    limitMap.set(key, history);
    return false;
  };

  if (isRateLimited(ip, ipLimits)) return false;
  if (isRateLimited(userId, userLimits)) return false;

  return true;
}

export function verifyRequestOrigin(req) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const hostUrl = host ? (host.startsWith("http") ? new URL(host) : { hostname: host.split(":")[0] }) : null;

      const isAllowed =
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1" ||
        originUrl.hostname.endsWith(".koino.capital") ||
        (hostUrl && originUrl.hostname === hostUrl.hostname);

      if (!isAllowed) return false;
    } catch {
      return false;
    }
  }
  return true;
}

