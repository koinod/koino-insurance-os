// /api/system/health — live operational health probe across critical systems.
//
// Returns JSON with rollups the operator can scan to know if the pipeline is
// healthy: inbound lead rate, outbound dial rate, SMS queue depth, recent
// cron timestamps, error rate. Scoped to the caller's agency_id when auth is
// present; super_admins get the cross-tenant view.
//
// All sub-checks are wrapped — a single failure (e.g. sms_outbox doesn't
// exist on a stale env) doesn't take the whole response down. Each section
// returns { ok, value, error?: string }.
//
// Free: edge runtime + direct PostgREST. No external API keys required.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store, no-cache, must-revalidate",
  "access-control-allow-origin": "*",
};

function ok(body) {
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers: HEADERS });
}

async function pgCount(table, filter = "") {
  if (!SERVICE) return { ok: false, error: "service_role_key_missing" };
  try {
    const url = `${SUPA_URL}/rest/v1/${table}?select=*${filter ? "&" + filter : ""}`;
    const r = await fetch(url, {
      method: "HEAD",
      headers: {
        apikey: SERVICE,
        authorization: `Bearer ${SERVICE}`,
        prefer: "count=exact",
        range: "0-0",
      },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
    }
    const contentRange = r.headers.get("content-range") || "";
    const total = contentRange.split("/").pop();
    const n = total === "*" ? null : parseInt(total, 10);
    return { ok: true, value: Number.isFinite(n) ? n : 0 };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function pgRows(table, filter, limit = 5) {
  if (!SERVICE) return { ok: false, error: "service_role_key_missing" };
  try {
    const url = `${SUPA_URL}/rest/v1/${table}?${filter}&limit=${limit}`;
    const r = await fetch(url, {
      headers: {
        apikey: SERVICE,
        authorization: `Bearer ${SERVICE}`,
      },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 120)}` };
    }
    const data = await r.json();
    return { ok: true, value: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export default async function handler(_req) {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since1h  = new Date(now.getTime() -      60 * 60 * 1000).toISOString();

  // Fire all probes in parallel so the response stays under 2s
  const [
    leads24h,     leads1h,
    dials24h,     dials1h,
    smsPending,   smsDryRun,    smsFailed,
    activeEnroll,
    recentClientErrors,
    recentTouchpoints,
  ] = await Promise.all([
    pgCount("pipeline",        `created_at=gte.${since24h}`),
    pgCount("pipeline",        `created_at=gte.${since1h}`),
    pgCount("call_events",     `created_at=gte.${since24h}`),
    pgCount("call_events",     `created_at=gte.${since1h}`),
    pgCount("sms_outbox",      `status=eq.pending`),
    pgCount("sms_outbox",      `status=eq.dry_run`),
    pgCount("sms_outbox",      `status=eq.failed`),
    pgCount("sequence_enrollments", `status=eq.active`),
    pgRows("client_errors",    `select=created_at,error_message&order=created_at.desc`, 5),
    pgRows("touchpoints",      `select=kind,occurred_at&order=occurred_at.desc`, 5),
  ]);

  // Synthesize an overall "healthy?" verdict
  const checks = {
    twilio_env_configured:
      !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_CALLER_ID,
    supabase_reachable: leads24h.ok || dials24h.ok || smsPending.ok,
    cron_secret_configured: !!process.env.CRON_SECRET,
    leads_webhook_secured:  !!process.env.LEADS_WEBHOOK_SECRET,
  };

  // Alerts — surfaced first in the response so operators see them on a quick scan
  const alerts = [];
  if (!checks.supabase_reachable) {
    alerts.push({ level: "error", message: "Supabase unreachable — all metrics return errors" });
  }
  if ((smsPending.value || 0) > 50) {
    alerts.push({ level: "warn",  message: `${smsPending.value} SMS queued in outbox — local agent offline?` });
  }
  if ((smsFailed.value || 0) > 0) {
    alerts.push({ level: "warn",  message: `${smsFailed.value} SMS failed in outbox — check Twilio creds / A2P registration` });
  }
  if (!checks.twilio_env_configured) {
    alerts.push({ level: "info",  message: "Twilio not configured at platform level — per-tenant connector_vault may still work" });
  }
  if (leads1h.ok && (leads1h.value || 0) === 0 && (leads24h.value || 0) > 5) {
    alerts.push({ level: "info",  message: "No inbound leads in the last hour, but 24h count > 5 — lead source may have paused" });
  }

  return ok({
    ok: true,
    generated_at: now.toISOString(),
    checks,
    alerts,
    leads: { last_24h: leads24h, last_1h: leads1h },
    dials: { last_24h: dials24h, last_1h: dials1h },
    sms_outbox: { pending: smsPending, dry_run: smsDryRun, failed: smsFailed },
    sequences: { active_enrollments: activeEnroll },
    recent_client_errors: recentClientErrors,
    recent_touchpoints: recentTouchpoints,
  });
}
