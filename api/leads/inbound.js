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

// Full state name → USPS 2-letter code. Lowercase + trim for match.
// Bug discovered 2026-05-24: vendors send "Texas" / "Florida" / "Tennessee"
// which the prior `.toUpperCase().slice(0,2)` truncated to "TE" / "FL" / "TE"
// — silent data corruption. Now we look up by full name first, then fall
// back to a 2-letter pass-through, then null.
const STATE_NAME_TO_CODE = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
  "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
  "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO",
  "montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH",
  "oklahoma":"OK","oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC",
  "south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT",
  "virginia":"VA","washington":"WA","west virginia":"WV","wisconsin":"WI","wyoming":"WY",
  "district of columbia":"DC","puerto rico":"PR",
};
const VALID_USPS = new Set(Object.values(STATE_NAME_TO_CODE));

function normalizeState(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // 1. Already a 2-letter USPS code?
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && VALID_USPS.has(upper)) return upper;
  // 2. Full state name (case-insensitive, trim trailing punctuation)
  const key = trimmed.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
  if (STATE_NAME_TO_CODE[key]) return STATE_NAME_TO_CODE[key];
  // 3. Try the first word — handles "Texas," / "Texas USA" / "Texas - Houston"
  const firstWord = key.split(" ")[0];
  if (firstWord && STATE_NAME_TO_CODE[firstWord]) return STATE_NAME_TO_CODE[firstWord];
  // 4. Two-word like "new york" — handled above by `key`. If we're still
  //    here, just return null rather than corrupt the column.
  return null;
}

function normalizeLead(body) {
  // Common alias mapping so we accept what every CRM / ad platform sends.
  const name = body.lead_name || body.name || body.full_name || body.fullName ||
               [body.first_name, body.last_name].filter(Boolean).join(" ") ||
               (body.firstName && body.lastName ? `${body.firstName} ${body.lastName}` : null);
  const phone = body.phone || body.phone_number || body.phoneNumber || body.mobile || null;
  const email = body.email || body.email_address || null;
  const state = normalizeState(body.state || body.state_code || body.region);
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

  // Resolve agency_id.
  //
  // SECURITY: callers MUST NOT be able to address an arbitrary tenant via
  // body or query — that would let a webhook signed with the shared secret
  // dump leads into someone else's pipeline. We bind the agency to the
  // deployment via the DEFAULT_AGENCY_ID env var. To route inbound to
  // multiple tenants, set up per-tenant webhook URLs (one Vercel project
  // env override each) or extend this to a per-secret tenant-binding table.
  //
  // body.agency_id / ?agency are still honored ONLY when LEADS_WEBHOOK_SECRET
  // is unset (dev mode) so local testing isn't blocked.
  const url = new URL(req.url);
  const agencyId = SECRET
    ? (DEFAULT_AGENCY || null)
    : (body.agency_id || url.searchParams.get("agency") || DEFAULT_AGENCY || null);

  // Branch: insurance lead vs recruit. Recruits land in recruiting_applicants
  // (Recruiting page). Insurance leads land in pipeline (Pipeline/CRM).
  const isRecruit =
    body.kind === "recruit" ||
    body.kind === "applicant" ||
    /careers|recruit|apply|applicant/i.test(String(lead.source || ""));

  if (isRecruit) {
    const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
    const handle = lead.email
      ? "@" + lead.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "")
      : "@" + (lead.name || "applicant").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
    const applicantRow = {
      name: lead.name || "Pending applicant",
      handle,
      state: lead.state,
      status: "applied",
      enrolled_at: new Date().toISOString(),
      ...(agencyId ? { agency_id: agencyId } : {}),
    };
    let appInserted = null, appErr = null;
    try {
      appInserted = await pgInsert("recruiting_applicants", applicantRow, agencyId);
      // Best-effort: log a recruiting_messages row capturing email/phone/notes/track
      // so the recruiter can see the original application in context. Never block
      // the response on this — it's a journal, not the source of truth.
      if (appInserted?.id) {
        const journal = [
          lead.email   ? `email: ${lead.email}` : null,
          lead.phone   ? `phone: ${lead.phone}` : null,
          meta.license_status ? `license: ${meta.license_status}` : null,
          meta.track   ? `track: ${meta.track}` : null,
          meta.experience ? `experience: ${meta.experience}` : null,
          body.notes   ? `notes: ${body.notes}` : null,
          `source: ${lead.source}`,
        ].filter(Boolean).join("\n");
        try {
          await pgInsert("recruiting_messages", {
            applicant_id: appInserted.id,
            channel: "form",
            direction: "inbound",
            body: journal,
            sent_at: new Date().toISOString(),
            ...(agencyId ? { agency_id: agencyId } : {}),
          }, agencyId);
        } catch { /* journal best-effort */ }
      }
    } catch (e) {
      appErr = e?.message || String(e);
    }
    if (!appInserted) {
      console.warn("[/api/leads/inbound::recruit] insert failed", { appErr, lead, agencyId });
      return err(500, "applicant accepted but persistence failed: " + (appErr || "unknown"));
    }
    return ok({
      ok: true,
      kind: "recruit",
      applicant_id: appInserted.id,
      received: { name: lead.name, source: lead.source, agency_id: agencyId },
    });
  }

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
          kind: "form_submit",
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

  // ── First-touch SMS auto-fire ────────────────────────────────────────
  // Speed-to-lead is the #1 close-rate factor. Fire an immediate templated
  // SMS the moment a lead lands, BEFORE any human dials. Opt-in per agency
  // via org_settings; default OFF so existing tenants don't accidentally
  // start texting strangers.
  //
  // Tokens: {first} {product} {agency} {state}
  //
  // Failure is non-blocking — pipeline row insertion is the value; SMS is
  // gravy. Log + continue.
  let firstTouchSms = { fired: false, reason: "not_attempted" };
  if (lead.phone && agencyId) {
    try {
      const cfgR = await fetch(
        `${SUPA_URL}/rest/v1/org_settings?agency_id=eq.${agencyId}&key=eq.first_touch_sms&select=value&limit=1`,
        { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
      );
      const cfgRows = cfgR.ok ? await cfgR.json() : [];
      const cfg = cfgRows[0]?.value || null;
      if (cfg?.enabled && cfg?.template) {
        const first = (lead.name || "").trim().split(/\s+/)[0] || "there";
        const body = String(cfg.template)
          .split("{first}").join(first)
          .split("{product}").join(lead.product || "your coverage")
          .split("{agency}").join(cfg.agency_name || "your producer")
          .split("{state}").join(lead.state || "your state");

        const smsR = await fetch(`${new URL(req.url).origin}/api/twilio-sms`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            to: lead.phone,
            body,
            lead_id: inserted.id,
            source: "lead_inbound:first_touch",
          }),
        });
        const smsJ = await smsR.json().catch(() => ({}));
        firstTouchSms = {
          fired: smsR.ok,
          reason: smsR.ok ? "queued" : (smsJ.error || `HTTP ${smsR.status}`),
          path: smsJ.path || null,
          sid: smsJ.sid || null,
        };
      } else {
        firstTouchSms.reason = cfg ? "disabled" : "not_configured";
      }
    } catch (e) {
      firstTouchSms = { fired: false, reason: e?.message || "network_error" };
    }
  } else if (!lead.phone) {
    firstTouchSms.reason = "no_phone";
  }

  return ok({
    ok: true,
    pipeline_id: inserted.id,
    touchpoint_recorded: touchOk,
    first_touch_sms: firstTouchSms,
    received: { name: lead.name, source: lead.source, agency_id: agencyId },
  });
}
