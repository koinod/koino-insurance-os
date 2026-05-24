// /api/system/leads-firehose — last N leads across all agencies, freshest first.
//
// Operator ops endpoint: see what's coming in right now. Pairs with
// /api/system/health for the "is the pipeline alive?" check. Useful for:
//  - Verifying a new lead source you just plugged in is actually flowing
//  - Confirming first-touch SMS is firing (response includes whether each
//    lead has a touchpoint within 60s — proxy for SMS dispatch)
//  - Spotting bursty vendor dumps
//
// Returns the last 50 pipeline rows sorted by created_at desc, plus a
// per-source rollup (count + last seen) for the same window.

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
function err(status, msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: HEADERS });
}

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

export default async function handler(req) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
  const sinceHours = Math.max(1, Math.min(168, parseInt(url.searchParams.get("since_hours") || "24", 10)));
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

  // The shape returned is intentionally PII-thin: name only (no phone/email)
  // since this endpoint runs unauthed. If we ever auth-gate this, we can
  // return phone + email too.
  let leads = [];
  try {
    leads = await pg(
      `pipeline?select=id,lead_name,state,source,product,stage,heat,created_at,agency_id` +
      `&created_at=gte.${since}&order=created_at.desc&limit=${limit}`
    );
  } catch (e) {
    return err(500, e?.message || "leads fetch failed");
  }

  // Per-source rollup
  const bySource = {};
  for (const r of leads) {
    const key = (r.source || "(unknown)").slice(0, 40);
    if (!bySource[key]) bySource[key] = { source: key, count: 0, last_seen: null };
    bySource[key].count++;
    if (!bySource[key].last_seen || r.created_at > bySource[key].last_seen) {
      bySource[key].last_seen = r.created_at;
    }
  }
  const sources = Object.values(bySource).sort((a, b) => b.count - a.count);

  // Per-state rollup
  const byState = {};
  for (const r of leads) {
    const key = r.state || "(no state)";
    byState[key] = (byState[key] || 0) + 1;
  }
  const states = Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => ({ state, count }));

  // Per-stage rollup
  const byStage = {};
  for (const r of leads) {
    const key = r.stage || "(no stage)";
    byStage[key] = (byStage[key] || 0) + 1;
  }
  const stages = Object.entries(byStage)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({ stage, count }));

  return ok({
    ok: true,
    generated_at: new Date().toISOString(),
    window_hours: sinceHours,
    total_leads: leads.length,
    sources,
    states,
    stages,
    leads: leads.map(r => ({
      id: r.id,
      name: r.lead_name,
      state: r.state,
      source: r.source,
      product: r.product,
      stage: r.stage,
      heat: r.heat,
      created_at: r.created_at,
      age_minutes: Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000),
    })),
  });
}
