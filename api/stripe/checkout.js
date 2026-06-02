// /api/stripe/checkout — creates a Checkout Session for the agency.
//
// Plans (no setup fee — dropped 2026-06-01; Agency is a flat $997/mo up to 15 agents):
//   rep_solo            — $97/mo, optional 7-day trial
//   agency_setup        — $997/mo recurring, billed immediately
//   agency_trial_7d      — 7-day free trial → $997/mo recurring
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_AGENCY_MONTHLY  (recurring $997)
//   STRIPE_PRICE_REP_MONTHLY      (recurring $97)
// (STRIPE_PRICE_SETUP_5000 is no longer used.)
//
// Optional:
//   STRIPE_SUCCESS_URL  (defaults to origin/?stripe=ok)
//   STRIPE_CANCEL_URL    (defaults to origin/?stripe=cancel)

export const config = { runtime: "edge" };

async function stripe(path, secret, body) {
  const url = `https://api.stripe.com/v1/${path}`;
  const opts = {
    method: body ? "POST" : "GET",
    headers: { "authorization": `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
  };
  if (body) {
    const params = new URLSearchParams();
    const flatten = (obj, prefix = "") => {
      for (const [k, v] of Object.entries(obj)) {
        if (v == null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) v.forEach((item, i) => {
          if (typeof item === "object" && item !== null) flatten(item, `${key}[${i}]`);
          else params.append(`${key}[${i}]`, String(item));
        });
        else if (typeof v === "object") flatten(v, key);
        else params.append(key, String(v));
      }
    };
    flatten(body);
    opts.body = params.toString();
  }
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) { const err = new Error(j?.error?.message || "stripe error"); err.detail = j; err.status = r.status; throw err; }
  return j;
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const secret  = process.env.STRIPE_SECRET_KEY;
  const agencyMo= process.env.STRIPE_PRICE_AGENCY_MONTHLY;
  const repMo   = process.env.STRIPE_PRICE_REP_MONTHLY;

  if (!secret) {
    return new Response(JSON.stringify({
      error: "stripe_not_configured",
      detail: "Set STRIPE_SECRET_KEY + STRIPE_PRICE_AGENCY_MONTHLY + STRIPE_PRICE_REP_MONTHLY on Vercel. Then create the prices in Stripe Dashboard: $997/mo recurring (agency); $97/mo recurring (rep solo).",
      missing: [
        !secret  ? "STRIPE_SECRET_KEY"          : null,
        !agencyMo? "STRIPE_PRICE_AGENCY_MONTHLY" : null,
        !repMo   ? "STRIPE_PRICE_REP_MONTHLY"    : null,
      ].filter(Boolean)
    }), { status: 503, headers: { "content-type": "application/json" }});
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  body = body || {};
  const ALLOWED_PLANS = ["rep_solo","agency_setup","agency_trial_7d"];
  if (body.plan != null && (typeof body.plan !== "string" || !ALLOWED_PLANS.includes(body.plan))) {
    return new Response(JSON.stringify({ error: `plan must be one of: ${ALLOWED_PLANS.join(", ")}` }), { status: 400, headers: { "content-type": "application/json" }});
  }
  if (typeof body.agency_id !== "string" || body.agency_id.length === 0 || body.agency_id.length > 64) {
    return new Response(JSON.stringify({ error: "agency_id must be a non-empty string ≤ 64 chars" }), { status: 400, headers: { "content-type": "application/json" }});
  }
  if (body.customer_email != null && (typeof body.customer_email !== "string" || body.customer_email.length > 320)) {
    return new Response(JSON.stringify({ error: "customer_email must be a string ≤ 320 chars" }), { status: 400, headers: { "content-type": "application/json" }});
  }
  if (body.trial_7d != null && typeof body.trial_7d !== "boolean") {
    return new Response(JSON.stringify({ error: "trial_7d must be a boolean" }), { status: 400, headers: { "content-type": "application/json" }});
  }
  const { plan = "agency_setup", agency_id, customer_email, trial_7d = false } = body;

  const origin = new URL(req.url).origin;
  const success_url = (process.env.STRIPE_SUCCESS_URL || `${origin}/?stripe=ok&session_id={CHECKOUT_SESSION_ID}`).replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
  const cancel_url   = process.env.STRIPE_CANCEL_URL   || `${origin}/?stripe=cancel`;

  let session;
  try {
    if (plan === "rep_solo") {
      // $97/mo, optional 7-day trial
      session = await stripe("checkout/sessions", secret, {
        mode: "subscription",
        line_items: [{ price: repMo, quantity: 1 }],
        subscription_data: trial_7d ? { trial_period_days: 7, metadata: { agency_id, plan: "rep_solo" } } : { metadata: { agency_id, plan: "rep_solo" } },
        success_url, cancel_url,
        client_reference_id: agency_id,
        customer_email: customer_email || undefined,
        metadata: { agency_id, plan: "rep_solo", tier: "rep_solo" },
        allow_promotion_codes: true,
      });
    } else if (plan === "agency_trial_7d") {
      // 7-day free trial → $997/mo. No setup fee (dropped 2026-06-01: Agency is a
      // flat $997/mo for up to 15 agents).
      session = await stripe("checkout/sessions", secret, {
        mode: "subscription",
        line_items: [
          { price: agencyMo, quantity: 1 },
        ],
        subscription_data: { trial_period_days: 7, metadata: { agency_id, plan: "agency_trial_7d" } },
        success_url, cancel_url,
        client_reference_id: agency_id,
        customer_email: customer_email || undefined,
        metadata: { agency_id, plan: "agency_trial_7d", tier: "agency_starter" },
        allow_promotion_codes: true,
      });
    } else {
      // agency_setup: $997/mo, billed immediately, no trial, no setup fee.
      session = await stripe("checkout/sessions", secret, {
        mode: "subscription",
        line_items: [
          { price: agencyMo, quantity: 1 },
        ],
        subscription_data: { metadata: { agency_id, plan: "agency_setup" } },
        success_url, cancel_url,
        client_reference_id: agency_id,
        customer_email: customer_email || undefined,
        metadata: { agency_id, plan: "agency_setup", tier: "agency_starter" },
        allow_promotion_codes: true,
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "checkout_failed", detail: err.detail || String(err.message) }), { status: err.status || 502, headers: { "content-type": "application/json" }});
  }

  return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
