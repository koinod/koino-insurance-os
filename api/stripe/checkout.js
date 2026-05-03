// /api/stripe/checkout — creates a Checkout Session for the agency.
//
// Plans:
//   rep_solo            — $97/mo, optional 7-day trial
//   agency_setup        — $5,000 one-time setup (includes month 1 via 30-day trial) + $997/mo recurring
//   agency_trial_7d      — 7-day free trial → $5,000 setup invoiced at trial-end + $997/mo recurring
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_SETUP_5000      (one-time price)
//   STRIPE_PRICE_AGENCY_MONTHLY  (recurring $997)
//   STRIPE_PRICE_REP_MONTHLY      (recurring $97)
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
  const setupId = process.env.STRIPE_PRICE_SETUP_5000;
  const agencyMo= process.env.STRIPE_PRICE_AGENCY_MONTHLY;
  const repMo   = process.env.STRIPE_PRICE_REP_MONTHLY;

  if (!secret) {
    return new Response(JSON.stringify({
      error: "stripe_not_configured",
      detail: "Set STRIPE_SECRET_KEY + STRIPE_PRICE_SETUP_5000 + STRIPE_PRICE_AGENCY_MONTHLY + STRIPE_PRICE_REP_MONTHLY on Vercel. Then create the prices in Stripe Dashboard: $5,000 one-time setup; $997/mo recurring (agency); $97/mo recurring (rep solo).",
      missing: [
        !secret  ? "STRIPE_SECRET_KEY"          : null,
        !setupId ? "STRIPE_PRICE_SETUP_5000"     : null,
        !agencyMo? "STRIPE_PRICE_AGENCY_MONTHLY" : null,
        !repMo   ? "STRIPE_PRICE_REP_MONTHLY"    : null,
      ].filter(Boolean)
    }), { status: 503, headers: { "content-type": "application/json" }});
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  const { plan = "agency_setup", agency_id, customer_email, trial_7d = false } = body || {};
  if (!agency_id) return new Response(JSON.stringify({ error: "agency_id required" }), { status: 400, headers: { "content-type": "application/json" }});

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
      // 7-day free trial → $5k setup invoiced at trial end + $997/mo
      session = await stripe("checkout/sessions", secret, {
        mode: "subscription",
        line_items: [
          { price: agencyMo, quantity: 1 },
          { price: setupId,  quantity: 1 },
        ],
        subscription_data: { trial_period_days: 7, metadata: { agency_id, plan: "agency_trial_7d" } },
        success_url, cancel_url,
        client_reference_id: agency_id,
        customer_email: customer_email || undefined,
        metadata: { agency_id, plan: "agency_trial_7d", tier: "agency_starter" },
        allow_promotion_codes: true,
      });
    } else {
      // agency_setup (default): $5k setup charged immediately + 30-day trial covers month 1 + $997/mo recurring
      session = await stripe("checkout/sessions", secret, {
        mode: "subscription",
        line_items: [
          { price: setupId,  quantity: 1 },
          { price: agencyMo, quantity: 1 },
        ],
        subscription_data: { trial_period_days: 30, metadata: { agency_id, plan: "agency_setup" } },
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
