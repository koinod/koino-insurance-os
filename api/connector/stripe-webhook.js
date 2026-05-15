// POST /api/connector/stripe-webhook — Stripe events.
//
// Handles:
//   • payment_intent.succeeded / charge.succeeded → automation_fire(payment_succeeded)
//   • payment_intent.payment_failed              → automation_fire(payment_failed)
//   • invoice.paid                               → automation_fire(payment_succeeded)
//   • customer.subscription.deleted              → automation_fire(churn)  (future)
//
// Match to lead via customer.email. Verifies Stripe-Signature header
// against STRIPE_WEBHOOK_SECRET (HMAC-SHA256 of timestamp.body).
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

// Stripe signs with HMAC-SHA256: t=<unix>,v1=<sig>...
async function verifyStripeSig(rawBody, header, secret) {
  if (!secret) return true;  // no secret configured → skip in dev
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=", 2)));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish compare
  if (hex.length !== v1.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return r === 0;
}

export const config = { runtime: "edge" };

async function findLeadByEmail(email) {
  if (!email) return null;
  const r = await fetch(`${SUPA_URL}/rest/v1/pipeline?select=id,owner_rep_id,agency_id&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function fire(agencyId, trigger, repId, ctx) {
  await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      p_agency_id: agencyId, p_trigger: trigger, p_rep_id: repId, p_context: ctx,
    }),
  }).catch(() => {});
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // Stripe requires signature verification on the RAW body — read once.
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const ok  = await verifyStripeSig(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response(JSON.stringify({ error: "bad signature" }), { status: 401, headers: cors() });

  let event;
  try { event = JSON.parse(raw); }
  catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

  const type = event?.type || "";
  const data = event?.data?.object || {};
  let email = data.receipt_email
            || data.customer_email
            || data.billing_details?.email
            || (data.customer_details || {}).email
            || null;

  // For subscription/invoice events, email may need a lookup via Customer.
  // Skip the extra round-trip if not configured. Pull from cached customer
  // metadata if present.
  if (!email && data.customer && process.env.STRIPE_SECRET_KEY) {
    try {
      const cr = await fetch(`https://api.stripe.com/v1/customers/${data.customer}`,
        { headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
      if (cr.ok) email = (await cr.json()).email;
    } catch {}
  }

  const lead = await findLeadByEmail(email);

  const ctx = {
    stripe_event_id: event.id, stripe_type: type,
    amount_cents: data.amount || data.amount_paid || data.amount_received || null,
    currency: data.currency, email, customer_id: data.customer || null,
    lead_id: lead?.id || null,
  };

  if (type === "payment_intent.succeeded" || type === "charge.succeeded" || type === "invoice.paid") {
    if (lead) await fire(lead.agency_id, "payment_succeeded", lead.owner_rep_id, ctx);
  } else if (type === "payment_intent.payment_failed" || type === "charge.failed" || type === "invoice.payment_failed") {
    if (lead) await fire(lead.agency_id, "payment_failed", lead.owner_rep_id, ctx);
  }

  return new Response(JSON.stringify({ ok: true, type, lead_id: lead?.id || null }), { status: 200, headers: cors() });
}
