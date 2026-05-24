// /api/system/dial-readiness — per-rep dial-path probe.
//
// Answers "why isn't the dialer working for this rep?" by checking, for each
// active rep in the agency:
//   1. Do they have an active rba_install (local agent polling commands)?
//   2. Do they have connector_vault Twilio creds (or alternative provider)?
//   3. What's their default_dial_provider (twilio / sendblue / phone_link)?
//   4. Last heartbeat from their agent (stale = installed-but-offline)?
//
// Optional ?agency_id=<uuid> param scopes to one agency. Without it, the
// endpoint scans across all agencies (super-admin debug view).
//
// Output is intentionally diagnostic — each rep row gets a `ready` flag
// (boolean) + `reasons` array listing what's missing, so the consumer can
// render "X reps ready, 3 missing agent install" without re-deriving.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

function ok(body) { return new Response(JSON.stringify(body, null, 2), { status: 200, headers: HEADERS }); }
function err(s, m) { return new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: HEADERS }); }

async function pg(path) {
  if (!SERVICE) throw new Error("service_role_key_missing");
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// 5 minutes — if heartbeat older, the agent is "stale" (installed but probably offline)
const STALE_MS = 5 * 60 * 1000;

export default async function handler(req) {
  const url = new URL(req.url);
  const agencyId = url.searchParams.get("agency_id") || null;

  // Reps: scoped by agency if param present, else all active
  let repFilter = `active=eq.true&order=last_seen_at.desc.nullsfirst`;
  if (agencyId) repFilter = `agency_id=eq.${agencyId}&` + repFilter;

  let reps = [], installs = [], vaultRows = [], settingsRows = [];
  try {
    [reps, installs, vaultRows, settingsRows] = await Promise.all([
      pg(`reps?select=id,name,agency_id,active,user_id&${repFilter}&limit=200`),
      pg(`rba_installs?select=user_id,device_id,role,hostname,os,status,last_seen_at&status=eq.active&order=last_seen_at.desc&limit=500`),
      pg(`connector_vault?select=user_id,provider,account_metadata,updated_at&active=eq.true&limit=500`),
      pg(`agent_settings?select=user_id,default_dial_provider`),
    ]);
  } catch (e) {
    return err(500, e?.message || "fetch failed");
  }

  // Index by user_id for O(1) lookups
  const installByUser  = new Map(installs.map(i => [i.user_id, i]));
  const vaultByUser    = new Map();
  for (const v of vaultRows) {
    if (!vaultByUser.has(v.user_id)) vaultByUser.set(v.user_id, new Map());
    vaultByUser.get(v.user_id).set(v.provider, v);
  }
  const settingsByUser = new Map(settingsRows.map(s => [s.user_id, s]));

  const now = Date.now();
  const repRows = reps.map(r => {
    const userId = r.user_id;
    const install = userId ? installByUser.get(userId) : null;
    const vaults = userId ? vaultByUser.get(userId) : null;
    const settings = userId ? settingsByUser.get(userId) : null;
    const provider = settings?.default_dial_provider || "twilio";

    const reasons = [];
    let ready = true;

    if (!userId) {
      reasons.push("rep has no linked auth user — can't claim agent commands");
      ready = false;
    }

    if (!install) {
      reasons.push("no active rba_install — dial commands have nothing to consume");
      ready = false;
    } else {
      const hbMs = install.last_seen_at ? (now - new Date(install.last_seen_at).getTime()) : null;
      if (hbMs == null) {
        reasons.push("agent installed but never heartbeated");
        ready = false;
      } else if (hbMs > STALE_MS) {
        const mins = Math.round(hbMs / 60000);
        reasons.push(`agent heartbeat stale (${mins}m ago — agent likely offline)`);
        ready = false;
      }
    }

    if (provider === "twilio" || provider === "sendblue") {
      const v = vaults?.get(provider);
      if (!v) {
        reasons.push(`provider=${provider} but no connector_vault row — creds missing`);
        ready = false;
      } else if (provider === "twilio") {
        const nums = Array.isArray(v.account_metadata?.phone_numbers) ? v.account_metadata.phone_numbers : [];
        if (nums.length === 0) {
          reasons.push("twilio vault present but no phone_numbers in account_metadata");
          ready = false;
        }
      }
    }
    // provider=phone_link / bluetooth_phone needs no vault — relies on system dialer

    return {
      rep_id: r.id,
      rep_name: r.name,
      agency_id: r.agency_id,
      provider,
      install: install ? {
        device_id: install.device_id,
        role:      install.role,
        hostname:  install.hostname,
        os:        install.os,
        last_seen_at: install.last_seen_at,
        heartbeat_age_minutes: install.last_seen_at ? Math.round((now - new Date(install.last_seen_at).getTime()) / 60000) : null,
      } : null,
      ready,
      reasons,
    };
  });

  const readyCount = repRows.filter(r => r.ready).length;
  const totalCount = repRows.length;

  // Reasons distribution — what's blocking the most reps
  const reasonCounts = {};
  for (const r of repRows) {
    for (const reason of r.reasons) {
      // Bucket by leading clause (first colon or first dash gets stripped)
      const key = reason.split(/[—\-(:]/)[0].trim();
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
  }
  const blockers = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  return ok({
    ok: true,
    generated_at: new Date().toISOString(),
    agency_id: agencyId,
    total_reps: totalCount,
    ready_reps: readyCount,
    blocked_reps: totalCount - readyCount,
    blockers,
    reps: repRows,
  });
}
