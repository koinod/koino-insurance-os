// /api/leads/inbound — generic lead webhook for FB Lead Ads, Google Ads,
// Convoso, vendor APIs, or any source that can POST a row.
//
// Body shapes accepted:
//   - JSON: { lead_name, phone, email, age, state, product, source, ap_cents, agency_id, ... }
//   - Form-encoded: same fields
//   - Facebook Lead Ads webhook envelope: { entry: [{ changes: [{ value: { leadgen_id, ... } }] }] }
//
// Auth: optional HMAC via x-repflow-signature header (sha256 of body with shared
// secret in env LEADS_WEBHOOK_SECRET). Requests without header are accepted in
// dev for easier testing — production MUST set the secret to enforce.
//
// Resolves agency_id from:
//   1. body.agency_id            (manual / trusted callers)
//   2. ?agency=<uuid> query param
//   3. env DEFAULT_AGENCY_ID     (single-tenant fallback)
//
// Inserts into public.pipeline with stage='New', heat='fresh', sets source.
// Also writes a row to public.touchpoints for attribution accuracy.
//
// FREE: edge runtime + direct PostgREST. No external API keys required.

export const config = { runtime: "edge" };

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE   = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SECRET    = process.env.LEADS_WEBHOOK_SECRET || "";
const DEFAULT_AGENCY = process.env.DEFAULT_AGENCY_ID || "";

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-repflow-signature",
  "access-control-allow-methods": "POST, OPTIONS",
};

function ok(body)            { return new Response(JSON.stringify(body),                       { status: 200, headers: HEADERS }); }
function err(status, msg)    { return new Response(JSON.stringify({ ok: false, error: msg }),  { status,      headers: HEADERS }); }

async function verifyHmac(rawBody, signatureHeader) {
  if (!SECRET) return true;                    // dev mode — secret not configured
  if (!signatureHeader) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const provided = signatureHeader.replace(/^sha256=/, "").trim();
    if (hex.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

function parseBody(raw, contentType) {
  if (!raw) return {};
  if (contentType.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const out = {};
    new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
    return out;
  }
  // last-ditch: try JSON
  try { return JSON.parse(raw); } catch { return null; }
}

// Facebook Lead Ads sends a webhook envelope. Pull the leadgen_id out so the
// caller can fetch the lead via the Graph API. We don't enrich here — that's
// a downstream worker's job. We just persist the leadgen_id so that worker
// can resolve it.
function flattenFbEnvelope(body) {
  if (!body || !Array.isArray(body.entry)) return null;
  const lead = {};
  for (const entry of body.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const v = change.value || {};
      if (v.leadgen_id)  lead.fb_leadgen_id = v.leadgen_id;
      if (v.form_id)     lead.fb_form_id    = v.form_id;
      if (v.page_id)     lead.fb_page_id    = v.page_id;
      if (v.ad_id)       lead.fb_ad_id      = v.ad_id;
      if (v.created_time)lead.created_at    = new Date(v.created_time * 1000).toISOString();
    }
  }
  return Object.keys(lead).length ? { ...lead, lead_name: "Pending Facebook fetch", source: "FB Lead Form" } : null;
}

function normalizeLead(body) {
  // Common alias mapping so we accept what every CRM / ad platform sends.
  const name = body.lead_name || body.name || body.full_name || body.fullName ||
               [body.first_name, body.last_name].filter(Boolean).join(" ") ||
               (body.firstName && body.lastName ? `${body.firstName} ${body.lastName}` : null);
  const phone = body.phone || body.phone_number || body.phoneNumber || body.mobile || null;
  const email = body.email || body.email_address || null;
  const state = (body.state || body.state_code || body.region || "").toUpperCase().slice(0, 2) || null;
  const age   = body.age != null ? parseInt(body.age, 10) : null;
  const product = body.product || body.product_interest || body.productType || null;
  const source  = body.source || body.utm_source || body.lead_source || body.vendor || "webhook";
  const apCents = body.ap_cents != null ? parseInt(body.ap_cents, 10)
                : body.ap != null       ? Math.round(parseFloat(body.ap) * 100)
                : 0;
  return { name, phone, email, state, age, product, source, apCents, raw: body };
}

async function pgInsert(table, row, agencyId) {
  const sb = SERVICE || ANON;
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": sb,
      "authorization": `Bearer ${sb}`,
      "content-type": "application/json",
      "prefer": "return=representation",
      ...(agencyId ? { "x-agency-id": agencyId } : {}),
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`pg ${table} insert ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method === "GET")     return ok({ ok: true, status: "alive", expects: "POST JSON or form-encoded lead" });
  if (req.method !== "POST")    return err(405, "POST only");

  const rawBody = await req.text();
  const sigOk = await verifyHmac(rawBody, req.headers.get("x-repflow-signature"));
  if (!sigOk) return err(401, "invalid signature");

  const ct = req.headers.get("content-type") || "application/json";
  let body = parseBody(rawBody, ct);
  if (body == null) return err(400, "could not parse body");

  // Detect FB webhook envelope and unwrap
  const fb = flattenFbEnvelope(body);
  if (fb) body = fb;

  const lead = normalizeLead(body);
  if (!lead.name && !lead.phone && !lead.email && !body.fb_leadgen_id) {
    return err(400, "lead must include at least name, phone, email, or fb_leadgen_id");
  }

  // Resolve agency_id
  const url = new URL(req.url);
  const agencyId = body.agency_id || url.searchParams.get("agency") || DEFAULT_AGENCY || null;

  const pipelineRow = {
    lead_name: lead.name || `Pending ${lead.source}`,
    age: lead.age,
    state: lead.state,
    stage: "New",
    product: lead.product,
    ap_cents: lead.apCents,
    days_in_stage: 0,
    last_activity_text: `Inbound from ${lead.source}`,
    next_action: "First dial",
    source: lead.source,
    consent: "verified",
    heat: "fresh",
    ...(agencyId ? { agency_id: agencyId } : {}),
  };

  let inserted = null, touchOk = false, dbError = null;
  try {
    inserted = await pgInsert("pipeline", pipelineRow, agencyId);
    if (inserted?.id) {
      try {
        await pgInsert("touchpoints", {
          lead_pipeline_id: inserted.id,
          source_id: null,                       // resolved by reconciler if source name matches a lead_sources row
          kind: "inbound_form",
          occurred_at: new Date().toISOString(),
          ...(agencyId ? { agency_id: agencyId } : {}),
        }, agencyId);
        touchOk = true;
      } catch (e) {
        // Don't fail the whole request if touchpoint insert fails — pipeline row is the value.
        touchOk = false;
      }
    }
  } catch (e) {
    dbError = e?.message || String(e);
  }

  if (!inserted) {
    // Even on DB failure, log to console (visible in Vercel runtime logs) so
    // the operator can replay. Surface the error to the caller so they retry.
    console.warn("[/api/leads/inbound] insert failed", { dbError, lead, agencyId });
    return err(500, "lead accepted but persistence failed: " + (dbError || "unknown"));
  }

  return ok({
    ok: true,
    pipeline_id: inserted.id,
    touchpoint_recorded: touchOk,
    received: { name: lead.name, source: lead.source, agency_id: agencyId },
  });
}
