// POST /api/connector/stripe-webhook — Stripe events.
//
// Handles:
//   • payment_intent.succeeded / charge.succeeded → automation_fire(payment_succeeded)
//   • payment_intent.payment_failed              → automation_fire(payment_failed)
//   • invoice.paid                               → automation_fire(payment_succeeded)
//   • customer.subscription.deleted              → automation_fire(churn)  (future)
//
// Match to lead via customer.email. No Stripe signature verification yet
// (TODO: verify Stripe-Signature header against STRIPE_WEBHOOK_SECRET).
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

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

  let event;
  try { event = await req.json(); }
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
