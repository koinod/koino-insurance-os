// /api/stripe/checkout — creates a Checkout Session for the agency.
//
// Plans (no setup fee — dropped 2026-06-01; Agency is a flat $997/mo up to 15 agents):
//   rep_solo            — $97/mo, optional 7-day trial
//   agency_setup        — $997/mo recurring, billed immediately
//   agency_trial_7d      — 7-day free trial → $997/mo recurring
//
// Body: { plan, agency_id, customer_email?, trial_7d?, billing? }
//   billing: "monthly" (default) | "annual" — annual = 2 months free, prepaid, no trial.
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_AGENCY_MONTHLY  (recurring $997/mo)
//   STRIPE_PRICE_REP_MONTHLY      (recurring $97/mo)
// Optional (enable annual prepay; falls back to monthly if unset):
//   STRIPE_PRICE_AGENCY_ANNUAL   (recurring $9,970/yr)
//   STRIPE_PRICE_REP_ANNUAL       (recurring $970/yr)
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
  // Annual prepay (2 months free) — optional; falls back to monthly if unset.
  const agencyYr= process.env.STRIPE_PRICE_AGENCY_ANNUAL;
  const repYr   = process.env.STRIPE_PRICE_REP_ANNUAL;

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
  if (body.billing != null && (typeof body.billing !== "string" || !["monthly","annual"].includes(body.billing))) {
    return new Response(JSON.stringify({ error: "billing must be 'monthly' or 'annual'" }), { status: 400, headers: { "content-type": "application/json" }});
  }
  const { plan = "agency_setup", agency_id, customer_email, trial_7d = false } = body;
  const isRep = plan === "rep_solo";
  // Annual only engages if the matching annual price is actually configured; otherwise
  // we silently fall back to monthly so checkout can never break on a missing env var.
  const annual = body.billing === "annual" && !!(isRep ? repYr : agencyYr);
  const recurringPrice = isRep ? (annual ? repYr : repMo) : (annual ? agencyYr : agencyMo);
  const tier = isRep ? "rep_solo" : "agency_starter";
  // Trial rules: annual is prepaid (no trial). Monthly: rep honors trial_7d flag;
  // agency_trial_7d gets a 7-day trial; agency_setup bills immediately.
  let trialDays = 0;
  if (!annual) {
    if (isRep && trial_7d) trialDays = 7;
    else if (plan === "agency_trial_7d") trialDays = 7;
  }
  const billingLabel = annual ? "annual" : "monthly";

  const origin = new URL(req.url).origin;
  const success_url = (process.env.STRIPE_SUCCESS_URL || `${origin}/?stripe=ok&session_id={CHECKOUT_SESSION_ID}`).replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
  const cancel_url   = process.env.STRIPE_CANCEL_URL   || `${origin}/?stripe=cancel`;

  if (!recurringPrice) {
    return new Response(JSON.stringify({ error: "stripe_not_configured", detail: `Missing price env for ${isRep ? "rep" : "agency"} ${billingLabel}.` }), { status: 503, headers: { "content-type": "application/json" }});
  }

  // One subscription, one recurring price. Monthly = $97/$997; annual = $970/$9,970
  // (2 months free, prepaid, no trial). No setup fee on any path.
  const subscription_data = { metadata: { agency_id, plan, billing: billingLabel } };
  if (trialDays > 0) subscription_data.trial_period_days = trialDays;

  let session;
  try {
    session = await stripe("checkout/sessions", secret, {
      mode: "subscription",
      line_items: [{ price: recurringPrice, quantity: 1 }],
      subscription_data,
      success_url, cancel_url,
      client_reference_id: agency_id,
      customer_email: customer_email || undefined,
      metadata: { agency_id, plan, tier, billing: billingLabel },
      allow_promotion_codes: true,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "checkout_failed", detail: err.detail || String(err.message) }), { status: err.status || 502, headers: { "content-type": "application/json" }});
  }

  return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
