// /api/stripe/portal — billing portal redirect for an existing customer.
// Owner clicks "Manage billing" → we look up their stripe_customer_id and
// mint a portal session URL.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return new Response(JSON.stringify({ error: "stripe_not_configured" }), { status: 503, headers: { "content-type": "application/json" }});

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" }});
  const jwt = auth.slice(7);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  body = body || {};
  if (typeof body.agency_id !== "string" || body.agency_id.length === 0 || body.agency_id.length > 64) {
    return new Response(JSON.stringify({ error: "agency_id must be a non-empty string ≤ 64 chars" }), { status: 400 });
  }
  const { agency_id } = body;

  // Look up the customer ID under the user's RLS
  const r = await fetch(`${SUPA_URL}/rest/v1/agencies?id=eq.${agency_id}&select=stripe_customer_id`, {
    headers: { "apikey": anon, "authorization": `Bearer ${jwt}` }
  });
  if (!r.ok) return new Response(JSON.stringify({ error: "agency lookup failed", detail: await r.text() }), { status: r.status });
  const rows = await r.json();
  const customer = rows && rows[0] && rows[0].stripe_customer_id;
  if (!customer) return new Response(JSON.stringify({ error: "no_subscription", detail: "No Stripe customer linked yet — start a subscription first." }), { status: 404 });

  const origin = new URL(req.url).origin;
  const params = new URLSearchParams();
  params.set("customer", customer);
  params.set("return_url", `${origin}/?stripe=portal`);
  const sr = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { "authorization": `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const sj = await sr.json();
  if (!sr.ok) return new Response(JSON.stringify({ error: "portal_failed", detail: sj }), { status: sr.status, headers: { "content-type": "application/json" }});
  return new Response(JSON.stringify({ url: sj.url }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }});
}
