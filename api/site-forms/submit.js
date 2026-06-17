// /api/site-forms/submit — public form-submit endpoint for any agency-hosted
// micro-site (careers landing, quiz funnel, consumer lead funnel) that lives
// on its own domain + Vercel project but shares THIS Supabase.
//
// Auth model: the site passes form_id + webhook_token in the body. We look
// them up in agency_site_forms; the token is the shared secret. No HMAC,
// no agency-side env var, no per-site key rotation needed. Public origin.
//
// Flow per request:
//   1. Validate form_id + webhook_token against agency_site_forms.
//   2. Insert into agency_site_submissions (raw audit, append-only).
//   3. Route into the form's target_table (recruiting_applicants for the
//      UEP careers form; pipeline / leads for consumer funnels).
//   4. Stamp the audit row with resolved_table + resolved_row_id.
// Service role key used throughout — site visitors are anon, RLS would
// otherwise block.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const ok  = (b)              => new Response(JSON.stringify(b),                       { status: 200, headers: HEADERS });
const err = (status, msg, x) => new Response(JSON.stringify({ ok: false, error: msg, ...(x || {}) }), { status, headers: HEADERS });

async function sbFetch(path, init = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "apikey":        SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type":  "application/json",
    },
  });
}

function parseUtm(url, body) {
  const u = new URL(url);
  const out = {};
  for (const k of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"]) {
    const v = u.searchParams.get(k) || (body && body[k]);
    if (v) out[k] = String(v);
  }
  return out;
}

function scoreFromRouting(routing, normalized) {
  // Routing example: {"lead_score":{"licensed_yes":40,"npn_present":15, ...}}
  const r = (routing && routing.lead_score) || {};
  let s = 0;
  if (normalized.licensed === "yes")    s += +r.licensed_yes    || 0;
  if (normalized.licensed === "no")     s += +r.licensed_no     || 0;
  if (normalized.licensed === "no_no")  s += +r.licensed_no_no  || 0;
  if (normalized.npn)                   s += +r.npn_present     || 0;
  if (normalized.state)                 s += +r.state_present   || 0;
  if (normalized.experience && normalized.experience.length > 24) s += +r.experience_present || 0;
  return s || null;
}

function routeRow(targetTable, agencyId, form, body) {
  // Map the form payload to the destination table's required shape.
  const score   = scoreFromRouting(form.routing, body);
  const source  = (form.routing && form.routing.default_source) || `site:${form.slug}`;
  if (targetTable === "recruiting_applicants") {
    return {
      agency_id:  agencyId,
      name:       String(body.name || body.full_name || "Unknown").trim(),
      handle:     body.handle || null,
      state:      body.state || null,
      email:      body.email || null,
      phone:      body.phone || null,
      source,
      lead_score: score,
      status:     "applied",
      payload:    body,
    };
  }
  if (targetTable === "pipeline" || targetTable === "leads") {
    return {
      agency_id:    agencyId,
      lead_name:    String(body.name || body.full_name || "Unknown").trim(),
      phone:        body.phone || null,
      email:        body.email || null,
      state:        body.state || null,
      stage:        "New",
      source,
      raw_payload:  body,
    };
  }
  return null;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST")    return err(405, "POST only");
  if (!SERVICE)                 return err(500, "service role key not configured");

  let body = {};
  try { body = await req.json(); }
  catch { return err(400, "invalid JSON"); }

  const form_id = String(body.form_id || "").trim();
  const token   = String(body.webhook_token || "").trim();
  if (!form_id || !token) return err(400, "form_id + webhook_token required");

  // Validate form + token. Use the unique form_id and constant-time equality
  // by letting PostgREST do the equality check server-side.
  const formRes = await sbFetch(
    `agency_site_forms?id=eq.${encodeURIComponent(form_id)}&webhook_token=eq.${encodeURIComponent(token)}&select=id,agency_id,site_id,slug,fields,target_table,routing,status&limit=1`
  );
  if (!formRes.ok) return err(500, "form lookup failed", { detail: await formRes.text() });
  const forms = await formRes.json().catch(() => []);
  const form  = forms[0];
  if (!form)                          return err(401, "invalid form_id or token");
  if (form.status !== "active")       return err(403, `form ${form.status}`);

  // Strip auth-y keys out of the recorded payload — we don't want the token
  // surviving in agency_site_submissions.raw_payload.
  const clean = { ...body };
  delete clean.form_id;
  delete clean.webhook_token;

  const utm = parseUtm(req.url, body);
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip  = fwd.split(",")[0].trim() || null;
  const ua  = req.headers.get("user-agent") || null;

  // 1. Insert audit row first so we never lose a submission, even if routing fails.
  const subRes = await sbFetch("agency_site_submissions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      agency_id:   form.agency_id,
      site_id:     form.site_id,
      form_id:     form.id,
      raw_payload: clean,
      utm,
      source_ip:   ip,
      user_agent:  ua,
      status:      "received",
    }),
  });
  if (!subRes.ok) return err(500, "audit insert failed", { detail: await subRes.text() });
  const sub = (await subRes.json())[0];

  // 2. Route into the target_table. Don't 500 the caller on a routing failure —
  // the audit row carries everything; the operator can re-route from the UI.
  let routed     = null;
  let routingErr = null;
  const row = routeRow(form.target_table, form.agency_id, form, clean);
  if (row) {
    const rRes = await sbFetch(form.target_table, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body:    JSON.stringify(row),
    });
    if (rRes.ok) {
      routed = (await rRes.json())[0];
    } else {
      routingErr = await rRes.text();
    }
  } else {
    routingErr = `unsupported target_table: ${form.target_table}`;
  }

  // 3. Patch the audit row with the routing outcome.
  await sbFetch(`agency_site_submissions?id=eq.${sub.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status:          routed ? "routed" : "rejected",
      resolved_row_id: routed ? String(routed.id) : null,
      resolved_table:  routed ? form.target_table : null,
      routing_notes:   routingErr || null,
    }),
  });

  return ok({
    ok:               true,
    submission_id:    sub.id,
    routed:           !!routed,
    resolved_row_id:  routed?.id || null,
    resolved_table:   routed ? form.target_table : null,
    routing_notes:    routingErr || null,
  });
}
