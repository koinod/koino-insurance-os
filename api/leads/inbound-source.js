// /api/leads/inbound-source — per-source inbound lead webhook.
//
// Usage:
//   POST /api/leads/inbound-source?source=<slug>
//   Headers:
//     content-type: application/json
//     x-repflow-signature: sha256=<HMAC-SHA256(rawBody, source.inbound_hmac_secret)>
//   Body:
//     Provider-specific JSON. The source's `field_map` translates the provider's
//     keys (dot-path supported) into RepFlow's pipeline schema.
//
// Pipeline:
//   1. Look up agency_lead_sources by inbound_slug. Returns 404 if not found.
//   2. Verify HMAC against the source's inbound_hmac_secret.
//   3. Apply field_map to the body → normalized lead.
//   4. Insert into public.pipeline (stage='New', heat='fresh', source=<source.name>).
//   5. If source.default_sequence_id is set, insert sequence_enrollments
//      with next_send_at = now() so drip-runner picks it up on the next tick.
//   6. Update source.last_received_at + inbound_count.
//
// Multi-tenant safety: the agency_id comes ENTIRELY from the matched source row,
// never from the request body. Caller cannot forge their way into another tenant.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-repflow-signature",
  "access-control-allow-methods": "POST, OPTIONS",
};

const ok  = (b) => new Response(JSON.stringify(b), { status: 200, headers: HEADERS });
const err = (s, m, extra) => new Response(JSON.stringify({ ok: false, error: m, ...(extra || {}) }), { status: s, headers: HEADERS });

async function pg(method, path, body) {
  const key = SERVICE || ANON;
  const r = await fetch(`${SUPA_URL}${path}`, {
    method,
    headers: {
      "apikey":        key,
      "authorization": `Bearer ${key}`,
      "content-type":  "application/json",
      ...(body ? { "prefer": "return=representation" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
}

async function verifyHmac(rawBody, header, secret) {
  if (!secret) return true; // source has no secret configured yet → dev mode
  if (!header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const provided = header.replace(/^sha256=/, "").trim();
  if (hex.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

// Resolve a dot-path against a JSON object. "contact.phone" → body.contact.phone.
function dotGet(obj, path) {
  if (!obj || !path) return undefined;
  if (!path.includes(".")) return obj[path];
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// Apply field_map to extract { lead_name, phone, email, state, age, product, ap_cents }
// from the provider's body. Falls back to common-shape inference (the same
// alias table the legacy /api/leads/inbound uses) when field_map is empty or a
// specific field has no mapping.
function applyMap(body, fieldMap) {
  const map = fieldMap || {};
  const pick = (rfKey, fallbackKeys = []) => {
    // 1. explicit map entry whose value === rfKey: dotGet the map key
    const providerKey = Object.keys(map).find(k => map[k] === rfKey);
    if (providerKey) {
      const v = dotGet(body, providerKey);
      if (v != null && v !== "") return v;
    }
    // 2. fallback aliases on the raw body
    for (const k of fallbackKeys) {
      const v = dotGet(body, k);
      if (v != null && v !== "") return v;
    }
    return null;
  };

  const first = pick("first_name", ["first_name", "firstName", "given_name"]);
  const last  = pick("last_name",  ["last_name",  "lastName",  "family_name"]);
  const composed = [first, last].filter(Boolean).join(" ");
  const lead_name = pick("lead_name", ["lead_name", "name", "full_name", "fullName", "contact.name"]) || (composed || null);

  const phoneRaw = pick("phone", ["phone", "phone_number", "phoneNumber", "mobile", "contact.phone"]);
  const phone = phoneRaw ? String(phoneRaw).trim() : null;

  const email = pick("email", ["email", "email_address", "contact.email"]);
  const stateRaw = pick("state", ["state", "state_code", "region"]);
  const state = stateRaw ? String(stateRaw).toUpperCase().slice(0, 2) : null;

  const ageRaw = pick("age", ["age", "dob_age"]);
  const age = ageRaw != null ? parseInt(ageRaw, 10) || null : null;

  const product = pick("product", ["product", "product_interest", "productType", "lead_type"]);

  const apRaw = pick("ap", ["ap", "annualized_premium", "premium"]);
  const ap_cents = pick("ap_cents", ["ap_cents"]) || (apRaw != null ? Math.round(parseFloat(apRaw) * 100) : 0);

  return { lead_name, phone, email, state, age, product, ap_cents };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method === "GET")     return ok({ ok: true, expects: "POST JSON with ?source=<slug> + x-repflow-signature" });
  if (req.method !== "POST")    return err(405, "POST only");

  const url  = new URL(req.url);
  const slug = url.searchParams.get("source");
  if (!slug) return err(400, "missing ?source=<slug>");

  const rawBody = await req.text();

  // ── 1. Resolve the source ────────────────────────────────────────────
  let source;
  try {
    const rows = await pg("GET", `/rest/v1/agency_lead_sources?inbound_slug=eq.${encodeURIComponent(slug)}&select=id,agency_id,name,inbound_hmac_secret,field_map,default_sequence_id&limit=1`);
    source = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return err(500, "source lookup failed", { detail: String(e.message || e) });
  }
  if (!source) return err(404, "unknown source slug");
  if (!source.agency_id) return err(500, "source missing agency_id");

  // ── 2. Verify HMAC ───────────────────────────────────────────────────
  const sigOk = await verifyHmac(rawBody, req.headers.get("x-repflow-signature"), source.inbound_hmac_secret);
  if (!sigOk) return err(401, "invalid signature");

  // ── 3. Parse + map ───────────────────────────────────────────────────
  let body;
  try { body = JSON.parse(rawBody || "{}"); }
  catch { return err(400, "body must be JSON"); }

  const lead = applyMap(body, source.field_map);
  if (!lead.lead_name && !lead.phone && !lead.email) {
    return err(400, "lead must include at least lead_name, phone, or email after field_map");
  }

  // ── 4. Insert into pipeline ──────────────────────────────────────────
  let inserted;
  try {
    const row = {
      agency_id: source.agency_id,
      lead_name: lead.lead_name || "Inbound lead (no name)",
      phone:     lead.phone,
      email:     lead.email,
      state:     lead.state,
      age:       lead.age,
      product:   lead.product,
      ap_cents:  lead.ap_cents || 0,
      stage:     "New",
      heat:      "fresh",
      source:    source.name,
      consent:   "express",          // webhook-posted leads are assumed to carry written consent (per source agreement)
      days_in_stage: 0,
    };
    const data = await pg("POST", `/rest/v1/pipeline`, row);
    inserted = Array.isArray(data) ? data[0] : data;
  } catch (e) {
    return err(500, "pipeline insert failed", { detail: String(e.message || e) });
  }

  // ── 5. Auto-enroll if the source has a default sequence ──────────────
  let enrollment = null;
  if (source.default_sequence_id && inserted?.id) {
    try {
      const data = await pg("POST", `/rest/v1/sequence_enrollments`, {
        lead_pipeline_id: inserted.id,
        sequence_id:      source.default_sequence_id,
        status:           "active",
        current_step:     0,
        agency_id:        source.agency_id,
        next_send_at:     new Date().toISOString(),
      });
      enrollment = Array.isArray(data) ? data[0] : data;
    } catch (e) {
      // Don't fail the inbound just because auto-enroll fell over — the lead
      // is captured. Surface the error in the response for debugging.
      return ok({ ok: true, lead_id: inserted.id, enrollment_error: String(e.message || e) });
    }
  }

  // ── 6. Bump source counters ──────────────────────────────────────────
  try {
    await pg("PATCH", `/rest/v1/agency_lead_sources?id=eq.${source.id}`, {
      last_received_at: new Date().toISOString(),
      inbound_count: (Number(source.inbound_count) || 0) + 1,
    });
  } catch { /* counter is journal-only, never block on it */ }

  return ok({
    ok: true,
    lead_id: inserted?.id,
    enrollment_id: enrollment?.id || null,
    source: source.name,
  });
}
