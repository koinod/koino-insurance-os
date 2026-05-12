// /api/stripe/admin — cross-agency Stripe roll-up for super_admin.
//
// Replaces the "local subscriptions table sum" approximation with a live
// Stripe API fetch. Lists all active+trialing+past_due subscriptions,
// groups by customer.metadata.agency_id, returns per-agency MRR + status
// counts.
//
// Gating: requires (a) a Supabase JWT in Authorization header, (b) that
// user is on the koino_super_admins allowlist (verified via the
// viewer_is_super_admin RPC). Non-super callers get 403.
//
// Returns 503 with a clear error when STRIPE_SECRET_KEY isn't set — the
// frontend (Billing tab) treats 503 as "not configured" and falls back
// to the local subscriptions table.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-supabase-auth, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

async function callRpc(fn, body, jwt) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": ANON,
      "authorization": `Bearer ${jwt || ANON}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function stripeList(path, key) {
  // GET https://api.stripe.com/v1/<path>. Handles pagination (cap at 5
  // pages = 500 subs — anything beyond that is a separate fan-out task).
  const all = [];
  let cursor = null;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`https://api.stripe.com/v1/${path}`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("starting_after", cursor);
    // Surface the customer fields needed for the agency_id metadata lookup
    url.searchParams.append("expand[]", "data.customer");
    const r = await fetch(url, { headers: { "authorization": `Bearer ${key}` } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`stripe ${path} ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    all.push(...(j.data || []));
    if (!j.has_more || !j.data || j.data.length === 0) break;
    cursor = j.data[j.data.length - 1].id;
  }
  return all;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: corsHeaders() });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return new Response(JSON.stringify({
      error: "stripe_not_configured",
      missing: ["STRIPE_SECRET_KEY"],
      hint: "Set STRIPE_SECRET_KEY in Vercel env and redeploy. Falls back to local subscriptions table until then.",
    }), { status: 503, headers: corsHeaders() });
  }

  const auth = req.headers.get("authorization") || req.headers.get("x-supabase-auth") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "") || null;
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders() });
  }

  // Verify super_admin via the security-definer RPC. The RPC reads
  // koino_super_admins under auth.uid() = caller's user_id (from JWT).
  const isSuper = await callRpc("viewer_is_super_admin", {}, jwt);
  const ok = (typeof isSuper === "boolean" && isSuper === true)
          || (Array.isArray(isSuper) && isSuper.length && (isSuper[0] === true || isSuper[0]?.viewer_is_super_admin === true));
  if (!ok) {
    return new Response(JSON.stringify({ error: "forbidden", reason: "super_admin required" }), { status: 403, headers: corsHeaders() });
  }

  let subs;
  try {
    subs = await stripeList("subscriptions?status=all", key);
  } catch (e) {
    return new Response(JSON.stringify({ error: "stripe_fetch_failed", detail: String(e.message || e) }), { status: 502, headers: corsHeaders() });
  }

  // Group: agency_id (from customer.metadata.agency_id, falling back to
  // subscription.metadata.agency_id) → { mrr_cents, status counts }.
  // We sum the per-item amount * quantity, divided by months for yearly
  // intervals so MRR is normalized to monthly.
  const buckets = new Map();
  let unscoped_mrr_cents = 0;
  let unscoped_count = 0;

  for (const s of subs) {
    const customer = s.customer && typeof s.customer === "object" ? s.customer : null;
    const agencyId =
      (s.metadata && s.metadata.agency_id) ||
      (customer && customer.metadata && customer.metadata.agency_id) ||
      null;
    let monthly = 0;
    for (const item of (s.items?.data || [])) {
      const unit = item.price?.unit_amount || 0;
      const qty  = item.quantity || 1;
      const interval = item.price?.recurring?.interval || "month";
      const intervalCount = item.price?.recurring?.interval_count || 1;
      // Normalize to monthly cents
      const monthsInInterval =
        interval === "year"  ? 12 * intervalCount :
        interval === "week"  ? intervalCount / 4.345 :
        interval === "day"   ? intervalCount / 30.437 :
        intervalCount;
      monthly += Math.round((unit * qty) / Math.max(1, monthsInInterval));
    }
    if (!agencyId) {
      unscoped_mrr_cents += monthly;
      unscoped_count += 1;
      continue;
    }
    if (!buckets.has(agencyId)) {
      buckets.set(agencyId, {
        agency_id: agencyId,
        mrr_cents: 0,
        active: 0, trialing: 0, past_due: 0, canceled: 0, other: 0,
        sub_count: 0,
        customer_emails: new Set(),
      });
    }
    const b = buckets.get(agencyId);
    if (s.status === "active" || s.status === "trialing") b.mrr_cents += monthly;
    if (b[s.status] !== undefined) b[s.status] += 1; else b.other += 1;
    b.sub_count += 1;
    if (customer?.email) b.customer_emails.add(customer.email);
  }

  const rows = Array.from(buckets.values()).map(b => ({
    ...b,
    customer_emails: Array.from(b.customer_emails),
  })).sort((a, b) => b.mrr_cents - a.mrr_cents);

  const totals = rows.reduce((acc, r) => ({
    mrr_cents: acc.mrr_cents + r.mrr_cents,
    active:    acc.active    + r.active,
    trialing:  acc.trialing  + r.trialing,
    past_due:  acc.past_due  + r.past_due,
    canceled:  acc.canceled  + r.canceled,
    sub_count: acc.sub_count + r.sub_count,
  }), { mrr_cents: 0, active: 0, trialing: 0, past_due: 0, canceled: 0, sub_count: 0 });

  return new Response(JSON.stringify({
    source: "stripe_live",
    rows,
    totals,
    unscoped: { mrr_cents: unscoped_mrr_cents, count: unscoped_count },
    fetched_at: new Date().toISOString(),
    sub_count: subs.length,
  }), { status: 200, headers: corsHeaders() });
}
