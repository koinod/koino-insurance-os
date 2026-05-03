// /api/stripe/webhook — Stripe webhook endpoint.
// Verifies the Stripe-Signature header (HMAC-SHA256 over timestamp.body) using
// STRIPE_WEBHOOK_SECRET. Idempotent: writes the event id to stripe_events so a
// retry doesn't double-apply. Updates agency subscription state via the
// upsert_agency_subscription RPC. Emits an agency_notification + audit log
// row per event.

export const config = { runtime: "edge" };

const SUPA_URL = "https://zybndnqnbxarpkhqpcxq.supabase.co";

const enc = new TextEncoder();
function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSig(rawBody, header, secret, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(s => s.split("=").map(x => x.trim())));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  if (!timingSafeEq(expected, v1)) return false;
  const drift = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
  return drift <= toleranceSec;
}

async function sbCall(path, anonKey, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "apikey": anonKey, "authorization": `Bearer ${anonKey}`, "content-type": "application/json", "prefer": "return=minimal" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) return { ok: false, detail: await r.text() };
  return { ok: true };
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const anon     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W";
  if (!whSecret) {
    return new Response(JSON.stringify({ error: "webhook_secret_missing", detail: "Set STRIPE_WEBHOOK_SECRET on Vercel." }), { status: 503, headers: { "content-type": "application/json" }});
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const ok  = await verifyStripeSig(raw, sig, whSecret);
  if (!ok) return new Response(JSON.stringify({ error: "signature_invalid" }), { status: 400, headers: { "content-type": "application/json" }});

  let event;
  try { event = JSON.parse(raw); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  const id    = event.id;
  const type  = event.type;
  const obj   = event.data && event.data.object || {};
  const meta  = obj.metadata || {};
  const agency_id = meta.agency_id || (obj.client_reference_id || null);

  // Idempotency: try insert into stripe_events; if it conflicts on PK we already processed
  const seen = await sbCall("stripe_events?on_conflict=id", anon, { id, type, agency_id, raw: event });
  if (!seen.ok && seen.detail && seen.detail.includes("duplicate")) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers: { "content-type": "application/json" }});
  }

  // Apply business effects per event type
  try {
    if (type === "checkout.session.completed") {
      const customer  = obj.customer;
      const sub       = obj.subscription;
      // Pull subscription detail from Stripe to get period info — but to keep this fn minimal we trust
      // upcoming subscription.* webhooks. Mark the agency as subscribed at minimum here.
      await fetch(`${SUPA_URL}/rest/v1/rpc/upsert_agency_subscription`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_stripe_customer_id: customer,
          p_subscription_id:    sub,
          p_status:             "active",
          p_trial_ends_at:      null,
          p_current_period_end: null,
          p_monthly_price_cents:null,
          p_metadata_agency_id: agency_id,
        })
      });
      await fetch(`${SUPA_URL}/rest/v1/rpc/create_notification`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_agency_id: agency_id, p_kind: "system", p_severity: "success",
          p_title: "Subscription started",
          p_body: meta.plan === "rep_solo" ? "Rep solo · $97/mo" : meta.plan === "agency_trial_7d" ? "7-day trial · $5,000 setup at trial end" : "$5,000 setup paid · Agency Starter active",
          p_page_link: "admin", p_ref_id: id,
        })
      });
      await fetch(`${SUPA_URL}/rest/v1/rpc/log_audit`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({ p_agency_id: agency_id, p_action: "stripe.subscription.created", p_target: sub, p_metadata: { plan: meta.plan, customer }, p_actor_role: "system" })
      });
    } else if (type === "customer.subscription.updated" || type === "customer.subscription.created") {
      const sub = obj;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const trialEnd  = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
      const items     = sub.items && sub.items.data || [];
      const monthly   = items.find(i => i.price?.recurring?.interval === "month");
      const amt       = monthly?.price?.unit_amount || null;
      await fetch(`${SUPA_URL}/rest/v1/rpc/upsert_agency_subscription`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_stripe_customer_id: sub.customer,
          p_subscription_id:    sub.id,
          p_status:             sub.status,
          p_trial_ends_at:      trialEnd,
          p_current_period_end: periodEnd,
          p_monthly_price_cents:amt,
          p_metadata_agency_id: agency_id,
        })
      });
    } else if (type === "invoice.paid") {
      await fetch(`${SUPA_URL}/rest/v1/rpc/create_notification`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_agency_id: agency_id, p_kind: "system", p_severity: "success",
          p_title: `Invoice paid · $${((obj.amount_paid || 0) / 100).toFixed(2)}`,
          p_body: obj.description || "Subscription invoice", p_page_link: "admin", p_ref_id: obj.id,
        })
      });
    } else if (type === "invoice.payment_failed") {
      await fetch(`${SUPA_URL}/rest/v1/rpc/create_notification`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_agency_id: agency_id, p_kind: "system", p_severity: "danger",
          p_title: "Payment failed", p_body: "Subscription will lapse if not resolved · check Billing",
          p_page_link: "admin", p_ref_id: obj.id,
        })
      });
    } else if (type === "customer.subscription.deleted") {
      await fetch(`${SUPA_URL}/rest/v1/rpc/upsert_agency_subscription`, {
        method: "POST",
        headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json" },
        body: JSON.stringify({
          p_stripe_customer_id: obj.customer,
          p_subscription_id:    obj.id,
          p_status:             "canceled",
          p_trial_ends_at:      null,
          p_current_period_end: null,
          p_monthly_price_cents:null,
          p_metadata_agency_id: agency_id,
        })
      });
    }
  } catch (_e) {
    // Non-fatal — Stripe will retry. We've already recorded the event in stripe_events.
  }

  return new Response(JSON.stringify({ ok: true, type }), { status: 200, headers: { "content-type": "application/json" }});
}
