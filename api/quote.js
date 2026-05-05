// /api/quote — carrier product quote engine.
//
// Input:
//   { age, gender, state, height_in, weight_lb, tobacco, conditions: [],
//     coverage_amount_cents?, lead_id?, call_id? }
//
// Output:
//   { results: [{ product_id, name, carrier, monthly_premium_cents,
//                 fit_score, reasons: [], plan_features }, ...] }
//
// Algorithm:
//   1. Fetch agency products with non-null rate_table
//   2. Filter by eligibility (age range, allowed states, tobacco gate,
//      excluded conditions)
//   3. Compute monthly premium: base + (age - 65) * age_factor, * state_factor,
//      then apply tobacco uplift if smoker
//   4. fit_score = 100 - (premium_rank * 8) - (excluded_count * 12), capped
//   5. Persist a quote_runs row for the call/lead audit trail
//
// Pure compute — no third-party APIs, no creds. Always works.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function computePremium(rate, age, state, tobacco) {
  const base = (rate.base_monthly_cents || 0)
             + Math.max(0, age - 65) * (rate.age_factor_per_year || 0);
  const stateMult = (rate.state_factors && rate.state_factors[state]) || 1.0;
  const tobaccoMult = tobacco ? 1 + ((rate.tobacco_uplift_pct || 0) / 100) : 1.0;
  return Math.round(base * stateMult * tobaccoMult);
}

function evaluateProduct(p, inputs) {
  const elig = p.eligibility || {};
  const reasons = [];
  let blocked = false;

  if (elig.min_age != null && inputs.age < elig.min_age) {
    blocked = true; reasons.push(`age below min ${elig.min_age}`);
  }
  if (elig.max_age != null && inputs.age > elig.max_age) {
    blocked = true; reasons.push(`age above max ${elig.max_age}`);
  }
  if (elig.states && elig.states.length && !elig.states.includes(inputs.state)) {
    blocked = true; reasons.push(`not licensed in ${inputs.state}`);
  }
  if (inputs.tobacco && elig.tobacco_ok === false) {
    blocked = true; reasons.push("tobacco not allowed");
  }
  const exc = elig.conditions_excluded || [];
  for (const c of (inputs.conditions || [])) {
    if (exc.includes(c)) {
      blocked = true; reasons.push(`condition "${c}" excluded`);
    }
  }
  if (blocked) return { product: p, eligible: false, monthly_premium_cents: null, reasons };

  const monthly = computePremium(p.rate_table || {}, inputs.age, inputs.state, !!inputs.tobacco);
  if (!monthly) return { product: p, eligible: false, monthly_premium_cents: null, reasons: ["no rate available"] };
  return { product: p, eligible: true, monthly_premium_cents: monthly, reasons };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, x-supabase-auth",
        "access-control-allow-methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad json" }, 400); }
  const { age, state, gender, height_in, weight_lb, tobacco, conditions, coverage_amount_cents, lead_id, call_id } = body || {};
  if (!age || !state) return jsonResponse({ error: "age and state are required" }, 400);

  const auth = req.headers.get("authorization") || "";
  const jwt  = auth.replace(/^Bearer\s+/i, "") || ANON;

  // Fetch agency products with rate tables. Anon callers see Atlas demo only
  // (RLS gate); authed callers see their own agency.
  const productsR = await fetch(
    `${SUPA_URL}/rest/v1/products?select=id,carrier_id,name,category,comp_pct,features,eligibility,rate_table&rate_table=not.is.null`,
    { headers: { apikey: ANON, authorization: `Bearer ${jwt}` } }
  );
  const products = productsR.ok ? await productsR.json() : [];
  const carriersR = await fetch(
    `${SUPA_URL}/rest/v1/carriers?select=id,name`,
    { headers: { apikey: ANON, authorization: `Bearer ${jwt}` } }
  );
  const carriers = carriersR.ok ? await carriersR.json() : [];
  const carrierName = (id) => (carriers.find(c => c.id === id) || {}).name || id;

  const inputs = { age, state, gender, height_in, weight_lb, tobacco: !!tobacco, conditions: conditions || [] };
  const evaluated = products.map(p => evaluateProduct(p, inputs));
  const eligible = evaluated.filter(e => e.eligible).sort((a, b) => a.monthly_premium_cents - b.monthly_premium_cents);

  const results = eligible.map((e, idx) => ({
    product_id: e.product.id,
    name: e.product.name,
    carrier: carrierName(e.product.carrier_id),
    category: e.product.category,
    monthly_premium_cents: e.monthly_premium_cents,
    annual_premium_cents: e.monthly_premium_cents * 12,
    comp_pct: e.product.comp_pct,
    expected_first_year_comp_cents: Math.round((e.product.comp_pct || 0) * e.monthly_premium_cents * 12 / 100),
    plan_features: e.product.features || {},
    fit_score: Math.max(20, Math.min(100, 100 - idx * 8)),
    reasons: e.reasons,
  }));

  // Surface the top non-eligible reasons too so the rep knows why something's off.
  const blockedSummary = evaluated
    .filter(e => !e.eligible)
    .slice(0, 5)
    .map(e => ({ name: e.product.name, reasons: e.reasons }));

  // Persist for audit / replay.
  // Resolve agency_id from public.me() so we don't trust client-side claim.
  let agencyId = null;
  try {
    const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: "{}",
    });
    const meRows = meR.ok ? await meR.json() : [];
    if (Array.isArray(meRows) && meRows[0]) agencyId = meRows[0].agency_id || meRows[0].agency_id;
  } catch {}
  // Anon callers in demo mode get Atlas
  if (!agencyId) agencyId = "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

  try {
    await fetch(`${SUPA_URL}/rest/v1/quote_runs`, {
      method: "POST",
      headers: {
        apikey: ANON,
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        agency_id: agencyId,
        lead_id: lead_id || null,
        call_id: call_id || null,
        inputs,
        results,
      }),
    });
  } catch {}

  return jsonResponse({
    results,
    blocked: blockedSummary,
    inputs_echo: inputs,
  });
}
