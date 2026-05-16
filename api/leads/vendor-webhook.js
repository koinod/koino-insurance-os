// /api/leads/vendor-webhook — per-vendor inbound lead endpoint.
//
// URL:   POST /api/leads/vendor-webhook?slug=<endpoint_slug>
// Auth:  HMAC-SHA256 via x-webhook-signature header (sha256=<hex>).
//        Secret is per-vendor, stored in lead_vendor_webhooks.hmac_secret.
//        Requests without a valid signature are rejected 401.
//
// On success:
//   • Inserts a pipeline row (stage='New', heat='fresh')
//   • Logs cost to agency_expenses (kind='lead_spend') — best-effort
//   • Inserts a touchpoints row — best-effort
//   Pipeline INSERT triggers Supabase postgres_changes realtime → data:realtime
//   CustomEvent → Floor strip lights up automatically (no extra broadcast needed).
//
// Configuration: owner creates/activates vendor in Lead Drip > Vendors tab.
// Pre-seeded vendors: Hometown Quotes, EverQuote, Quinstreet, MediaAlpha.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const CORS = {
  "content-type":                "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-webhook-signature, x-repflow-signature",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};

const ok  = b     => new Response(JSON.stringify(b),                      { status: 200, headers: CORS });
const err = (s,m) => new Response(JSON.stringify({ ok: false, error: m }), { status: s,   headers: CORS });

// ─── Supabase REST helper (service-role) ─────────────────────────────────────
async function pgFetch(path, opts = {}) {
  const key = SERVICE || ANON;
  const r = await fetch(`${SUPA_URL}${path}`, {
    ...opts,
    headers: {
      "apikey":          key,
      "authorization":   `Bearer ${key}`,
      "content-type":    "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Constant-time HMAC-SHA256 verify ────────────────────────────────────────
async function verifyHmac(rawBody, sigHeader, secret) {
  if (!secret || !sigHeader) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const provided = sigHeader.replace(/^sha256=/, "").trim();
    if (hex.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

// ─── Field normalization (handles every vendor's different field names) ───────
function normalizeLead(body) {
  const name = body.lead_name || body.name || body.full_name ||
    [body.first_name, body.last_name].filter(Boolean).join(" ") || null;
  const phone   = body.phone || body.phone_number || body.mobile || body.cell || null;
  const email   = body.email || body.email_address || null;
  const state   = (body.state || body.state_code || body.region || "").toUpperCase().slice(0, 2) || null;
  const age     = body.age != null ? parseInt(body.age, 10) : null;
  const product = body.product || body.product_interest || body.productType || body.line || null;
  const apCents = body.ap_cents != null ? parseInt(body.ap_cents, 10)
                : body.ap      != null  ? Math.round(parseFloat(body.ap) * 100) : 0;
  return { name, phone, email, state, age, product, apCents };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url  = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  if (!slug) return err(400, "missing ?slug= parameter");

  // Look up vendor config — service role bypasses RLS so this works even
  // before the operator has a session. The slug is the only public-facing
  // identifier; the HMAC secret is never returned to callers.
  let vendor;
  try {
    const rows = await pgFetch(
      `/rest/v1/lead_vendor_webhooks?endpoint_slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`,
      { headers: { "prefer": "return=representation" } }
    );
    vendor = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error("[vendor-webhook] config lookup:", e.message);
    return err(500, "config lookup failed");
  }

  if (!vendor) return err(404, "webhook endpoint not found or inactive");

  // GET — health check / config test (returns safe info, not the secret)
  if (req.method === "GET") {
    return ok({
      ok: true,
      vendor: vendor.vendor_name,
      slug:   vendor.endpoint_slug,
      status: "active",
      expects: "POST with JSON body + x-webhook-signature: sha256=<hex>",
    });
  }
  if (req.method !== "POST") return err(405, "POST only");

  // HMAC validation — reject without valid signature
  const rawBody = await req.text();
  if (rawBody.length > 65_536) {
    return err(413, "body too large (max 64KB)");
  }
  const sigHeader = req.headers.get("x-webhook-signature")
                 || req.headers.get("x-repflow-signature")
                 || "";
  const hmacOk = await verifyHmac(rawBody, sigHeader, vendor.hmac_secret);
  if (!hmacOk) {
    console.warn("[vendor-webhook] invalid HMAC", { slug, sigHeader: sigHeader.slice(0, 20) });
    return err(401, "invalid signature — check your HMAC secret");
  }

  // ─── Replay protection ────────────────────────────────────────────────────
  // 1) Timestamp window: if vendor sends x-webhook-timestamp (unix seconds),
  //    reject when drift > 5 minutes. Optional header — many vendors omit it,
  //    so when absent we fall through to (2) below.
  // 2) Request-ID dedupe: vendor MAY send x-webhook-id; we record it in
  //    webhook_replay_seen (best-effort; failure to write doesn't block).
  //    A duplicate (slug, request_id) returns 200 with { duplicate: true }
  //    so retries are idempotent without re-firing the pipeline insert.
  const tsHeader = req.headers.get("x-webhook-timestamp") || "";
  if (tsHeader) {
    const t = parseInt(tsHeader, 10);
    if (!Number.isFinite(t)) return err(400, "x-webhook-timestamp must be a unix-seconds integer");
    const driftSec = Math.abs(Math.floor(Date.now() / 1000) - t);
    if (driftSec > 300) {
      console.warn("[vendor-webhook] timestamp drift", { slug, driftSec });
      return err(401, "timestamp drift exceeds 5 minutes — request rejected as potential replay");
    }
  }
  const reqIdHeader = (req.headers.get("x-webhook-id") || req.headers.get("x-request-id") || "").slice(0, 128);
  if (reqIdHeader) {
    try {
      // Try to record the request-id. If the underlying table doesn't exist yet
      // (migration not applied) the insert errors — we treat that as "no
      // dedupe available" and proceed. When the migration IS applied, a unique
      // constraint on (slug, request_id) makes the second insert 409, which
      // we catch and return as a duplicate.
      const dupCheck = await fetch(
        `${SUPA_URL}/rest/v1/webhook_replay_seen?on_conflict=slug,request_id`,
        {
          method: "POST",
          headers: {
            apikey: SERVICE || ANON,
            authorization: `Bearer ${SERVICE || ANON}`,
            "content-type": "application/json",
            prefer: "return=representation,resolution=ignore-duplicates",
          },
          body: JSON.stringify({ slug, request_id: reqIdHeader, seen_at: new Date().toISOString() }),
        }
      );
      if (dupCheck.status === 200 || dupCheck.status === 201) {
        const rows = await dupCheck.json().catch(() => []);
        // ignore-duplicates returns [] when the row already existed
        if (Array.isArray(rows) && rows.length === 0) {
          return ok({ ok: true, duplicate: true, request_id: reqIdHeader, vendor: vendor.vendor_name });
        }
      }
      // Any other status code (table missing, etc) — proceed without dedupe.
    } catch {
      // Best-effort; never block ingest on the dedupe-table being unavailable.
    }
  }

  // Parse body (JSON or form-encoded)
  let body;
  try { body = JSON.parse(rawBody); } catch {
    try {
      body = {};
      new URLSearchParams(rawBody).forEach((v, k) => { body[k] = v; });
    } catch { return err(400, "unparseable body"); }
  }

  const lead = normalizeLead(body);
  if (!lead.name && !lead.phone && !lead.email) {
    return err(400, "lead must include name, phone, or email");
  }

  const agencyId = vendor.agency_id;

  // ── Insert pipeline row ───────────────────────────────────────────────────
  let inserted;
  try {
    const rows = await pgFetch("/rest/v1/pipeline", {
      method: "POST",
      headers: { "prefer": "return=representation" },
      body: JSON.stringify({
        lead_name:          lead.name || `Inbound · ${vendor.vendor_name}`,
        age:                lead.age,
        state:              lead.state,
        stage:              "New",
        product:            lead.product,
        ap_cents:           lead.apCents,
        days_in_stage:      0,
        last_activity_text: `Inbound from ${vendor.vendor_name}`,
        next_action:        "First dial",
        source:             vendor.vendor_name,
        consent:            "verified",
        heat:               "fresh",
        agency_id:          agencyId,
        ...(lead.phone ? { phone: lead.phone } : {}),
        ...(lead.email ? { email: lead.email } : {}),
      }),
    });
    inserted = Array.isArray(rows) ? rows[0] : rows;
  } catch (e) {
    console.error("[vendor-webhook] pipeline insert:", e.message);
    return err(500, "pipeline insert failed: " + e.message);
  }

  // ── Log cost to agency_expenses (best-effort) ─────────────────────────────
  if (vendor.cost_per_lead_cents > 0 && agencyId) {
    try {
      await pgFetch("/rest/v1/agency_expenses", {
        method: "POST",
        headers: { "prefer": "return=minimal" },
        body: JSON.stringify({
          agency_id:   agencyId,
          kind:        "lead_spend",
          amount_cents: vendor.cost_per_lead_cents,
          description: `Lead inbound · ${vendor.vendor_name}`,
          vendor:      vendor.vendor_name,
          paid_at:     new Date().toISOString().slice(0, 10),
          paid_by:     "agency",
          notes:       inserted?.id ? `pipeline_id=${inserted.id}` : null,
        }),
      });
    } catch { /* cost log is best-effort */ }
  }

  // ── Touchpoint (best-effort) ──────────────────────────────────────────────
  if (inserted?.id && agencyId) {
    try {
      await pgFetch("/rest/v1/touchpoints", {
        method: "POST",
        headers: { "prefer": "return=minimal" },
        body: JSON.stringify({
          lead_pipeline_id: inserted.id,
          kind:             "form_submit",
          occurred_at:      new Date().toISOString(),
          agency_id:        agencyId,
        }),
      });
    } catch { /* touchpoint best-effort */ }
  }

  // Pipeline INSERT above triggers Supabase postgres_changes realtime event.
  // data.jsx subscription maps it to AppData.PIPELINE and fires data:realtime
  // CustomEvent — Floor strip updates automatically, no extra broadcast needed.

  return ok({
    ok:          true,
    pipeline_id: inserted?.id,
    vendor:      vendor.vendor_name,
    received: {
      name:   lead.name,
      phone:  lead.phone,
      source: vendor.vendor_name,
    },
  });
}
