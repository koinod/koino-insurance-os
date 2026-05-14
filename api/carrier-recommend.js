// /api/carrier-recommend — life + annuity carrier shortlist for a case.
//
// Drives two consumers:
//   • The autoquoter (agent/quote_agent.py) calls this BEFORE opening
//     Playwright sessions, so it skips dead-end carriers and tries the
//     best-fit ones first.
//   • The Quoter UI shows reps a manual shortlist with reasons + portal
//     URLs when the autoquoter isn't available.
//
// Input:
//   {
//     // who
//     age, gender, state, height_in, weight_lb, tobacco,
//     conditions: ["diabetes_t2", ...],
//     // identity edge cases (the long tail that gets reps stuck)
//     id_type: "ssn" | "ein" | "itin" | "passport",
//     citizenship: "us" | "green_card" | "h1b" | "l1" | ... | "foreign_national",
//     residency_months: 24,
//     // money
//     product_kind: "term" | "whole" | "iul" | "fia" | "myga" | "spia",
//     face_amount_cents?, premium_cents?, term_years?,
//     // annuity-only
//     funding_source: "qualified" | "non_qualified",
//     // lifestyle
//     aviation: { type: "private", hours_per_year: 120 },
//     dui_lookback_months: 18, ...
//     // optional context
//     lead_id?, call_id?
//   }
//
// Output:
//   {
//     ranked: [{
//       carrier_id, carrier_name, product_id, product_name,
//       quote_priority, autoquoter_supported, scraper_slug,
//       e_app_url, quoter_url, producer_portal_url,
//       severity_summary: "ok" | "rate_up" | "refer_uw",
//       reasons: ["aviation: private pilot OK <200hrs"],
//       caveats: ["rate-up to Standard per build chart"],
//       blockers: []   // empty for ranked items
//     }, ...],
//     declined: [{ carrier_name, product_name, blockers: [...] }, ...],
//     refer_uw: [{ carrier_name, product_name, missing_rules: [...] }, ...]
//   }
//
// Algorithm:
//   1. Resolve product_kind → category + subtype filter on products
//      (life: term/whole/iul/gul/vul/final_expense; annuity: fia/myga/spia/...)
//   2. Pull approved underwriting rules per candidate product.
//   3. Evaluate every rule against the case → severity bucket per product.
//   4. Drop `decline` and `postpone` to declined[].
//   5. If a critical rule_type has no row on file → refer_uw bucket
//      (we don't silently pass — long tail is the whole point).
//   6. Score remaining = quote_priority ASC, then commission DESC.

import { DEMO_AGENCY_ID } from "../lib/demo.js";

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const LIFE_SUBTYPES    = ["term","whole","iul","gul","vul","final_expense"];
const ANNUITY_SUBTYPES = ["fia","myga","mygabuf","spia","dia","vat","registered_index_linked"];

// Rules every carrier MUST have on file before we'll pass a case through
// without a refer_uw flag. If absent, we surface "refer_uw" rather than
// silently sending the rep into a dead-end app.
const REQUIRED_LIFE_RULES = [
  "id_type", "citizenship", "age_band", "state_avail", "tobacco",
  "build_chart", "face_amount",
];
const REQUIRED_ANNUITY_RULES = [
  "id_type", "citizenship", "age_band", "state_avail",
  "funding_source", "face_amount",
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-supabase-auth",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

// ── Per-rule_type evaluators ─────────────────────────────────────────────
// Each returns { matches: bool, note?: string }. The rule's own `severity`
// determines the action when it matches.

function inAgeBand(payload, c) {
  if (c.age == null) return { matches: false };
  const min = payload.min_age, max = payload.max_age;
  const ok  = (min == null || c.age >= min) && (max == null || c.age <= max);
  return { matches: !ok, note: ok ? null : `age ${c.age} outside ${min ?? "-"}–${max ?? "-"}` };
}

function evaluateRule(rule, c) {
  const p = rule.payload || {};
  switch (rule.rule_type) {
    case "id_type": {
      const allowed = p.allowed || [];
      if (!c.id_type) return { matches: false };
      const ok = allowed.includes(c.id_type);
      return { matches: !ok, note: ok ? null : `id_type ${c.id_type} not accepted (allowed: ${allowed.join(",")})` };
    }
    case "citizenship": {
      const allowed = p.allowed || [];
      if (!c.citizenship) return { matches: false };
      const ok = allowed.includes(c.citizenship);
      return { matches: !ok, note: ok ? null : `citizenship "${c.citizenship}" not accepted` };
    }
    case "residency_months": {
      const min = p.min_months;
      if (min == null || c.residency_months == null) return { matches: false };
      const ok = c.residency_months >= min;
      return { matches: !ok, note: ok ? null : `residency ${c.residency_months}mo < required ${min}mo` };
    }
    case "state_avail": {
      const allowed = p.states || [];
      if (!c.state) return { matches: false };
      const ok = allowed.length === 0 || allowed.includes(c.state);
      return { matches: !ok, note: ok ? null : `not licensed in ${c.state}` };
    }
    case "age_band":
      return inAgeBand(p, c);
    case "gender_rules": {
      if (!p.required_gender || !c.gender) return { matches: false };
      return { matches: c.gender !== p.required_gender, note: `gender restricted to ${p.required_gender}` };
    }
    case "build_chart": {
      // payload: { table: [{min_h_in, max_h_in, max_w_lb}], rate_class }
      if (c.height_in == null || c.weight_lb == null || !Array.isArray(p.table)) return { matches: false };
      const row = p.table.find(r => c.height_in >= (r.min_h_in ?? 0) && c.height_in <= (r.max_h_in ?? 99));
      if (!row) return { matches: false };
      const over = c.weight_lb > (row.max_w_lb ?? 9999);
      return { matches: over, note: over ? `over build chart for ${c.height_in}in (max ${row.max_w_lb}lb)` : null };
    }
    case "tobacco": {
      if (c.tobacco == null) return { matches: false };
      if (p.allowed === false && c.tobacco) return { matches: true, note: "tobacco use disqualifies" };
      return { matches: false };
    }
    case "condition_decline": {
      const list = p.conditions || [];
      const hit  = (c.conditions || []).filter(x => list.includes(x));
      return { matches: hit.length > 0, note: hit.length ? `decline conditions: ${hit.join(", ")}` : null };
    }
    case "condition_rate_class": {
      const list = p.conditions || [];
      const hit  = (c.conditions || []).filter(x => list.includes(x));
      return { matches: hit.length > 0, note: hit.length ? `rate-class trigger: ${hit.join(", ")}` : null };
    }
    case "rx_lookback": {
      const months = p.lookback_months;
      const flagged = (c.rx_flags || []).some(f => (f.months_ago ?? 0) <= months);
      return { matches: flagged, note: flagged ? `rx flag within ${months}mo lookback` : null };
    }
    case "face_amount": {
      if (c.face_amount_cents == null) return { matches: false };
      const min = p.min_cents, max = p.max_cents;
      const tooLow  = min != null && c.face_amount_cents < min;
      const tooHigh = max != null && c.face_amount_cents > max;
      return {
        matches: tooLow || tooHigh,
        note: tooLow ? `face below carrier min` : tooHigh ? `face above carrier max` : null,
      };
    }
    case "income_multiple": {
      // payload: { max_multiple_by_age_band: [{min,max,mult}] }
      if (c.face_amount_cents == null || c.annual_income_cents == null) return { matches: false };
      const band = (p.bands || []).find(b => c.age >= (b.min ?? 0) && c.age <= (b.max ?? 999));
      if (!band) return { matches: false };
      const cap = c.annual_income_cents * (band.mult || 0);
      return { matches: c.face_amount_cents > cap, note: c.face_amount_cents > cap ? `face exceeds ${band.mult}× income` : null };
    }
    case "business_purpose": {
      // matches when this is a business-purpose case AND this carrier doesn't allow it.
      const need = c.id_type === "ein" || c.business_purpose === true;
      if (!need) return { matches: false };
      const ok = p.allowed === true;
      return { matches: !ok, note: ok ? null : "carrier doesn't write EIN-owned / business-purpose policies" };
    }
    case "trust_owned":
    case "premium_finance":
    case "1035_exchange":
    case "replacement": {
      const flagKey = {
        trust_owned: "trust_owned",
        premium_finance: "premium_finance",
        "1035_exchange": "exchange_1035",
        replacement: "is_replacement",
      }[rule.rule_type];
      if (!c[flagKey]) return { matches: false };
      const ok = p.allowed !== false;
      return { matches: !ok, note: ok ? null : `carrier doesn't accept ${rule.rule_type}` };
    }
    case "foreign_travel": {
      const months = (c.foreign_travel || []).reduce((a, t) => a + (t.weeks_per_year || 0), 0);
      const limit = p.max_weeks_per_year;
      if (limit == null) return { matches: false };
      return { matches: months > limit, note: months > limit ? `foreign travel ${months}wk > ${limit}wk` : null };
    }
    case "aviation": {
      if (!c.aviation) return { matches: false };
      const t = c.aviation.type;
      const hrs = c.aviation.hours_per_year || 0;
      if (p.disallow_types && p.disallow_types.includes(t)) return { matches: true, note: `aviation type "${t}" disallowed` };
      if (p.max_hours_per_year != null && hrs > p.max_hours_per_year)
        return { matches: true, note: `aviation hours ${hrs} > ${p.max_hours_per_year}` };
      return { matches: false };
    }
    case "avocation": {
      const list = p.disallow || [];
      const hit  = (c.avocations || []).filter(x => list.includes(x));
      return { matches: hit.length > 0, note: hit.length ? `avocation: ${hit.join(", ")}` : null };
    }
    case "criminal_history":
      return { matches: !!c.felony_lookback_months && c.felony_lookback_months <= (p.lookback_months || 0),
               note: "felony in lookback" };
    case "dui_lookback": {
      const m = c.dui_lookback_months;
      if (m == null || p.lookback_months == null) return { matches: false };
      return { matches: m <= p.lookback_months, note: `DUI ${m}mo ago within ${p.lookback_months}mo lookback` };
    }
    case "bankruptcy_lookback": {
      const m = c.bankruptcy_lookback_months;
      if (m == null || p.lookback_months == null) return { matches: false };
      return { matches: m <= p.lookback_months, note: `bankruptcy ${m}mo ago within ${p.lookback_months}mo` };
    }
    case "funding_source": {
      if (!c.funding_source) return { matches: false };
      const allowed = p.allowed || [];
      const ok = allowed.includes(c.funding_source);
      return { matches: !ok, note: ok ? null : `funding source "${c.funding_source}" not accepted` };
    }
    case "exam_required": {
      if (c.face_amount_cents == null || p.threshold_cents == null) return { matches: false };
      const triggers = c.face_amount_cents >= p.threshold_cents;
      return { matches: triggers, note: triggers ? `paramed exam required above $${(p.threshold_cents/100).toLocaleString()}` : null };
    }
    case "accelerated_uw_path": {
      if (c.face_amount_cents == null || p.max_cents == null) return { matches: false };
      const eligible = c.face_amount_cents <= p.max_cents;
      return { matches: !eligible, note: eligible ? null : "above instant-decision ceiling" };
    }
    case "rider_eligibility":
    case "conversion_window":
    case "financial_just":
    case "net_worth_min":
    case "mib_rules":
      // Informational rules — only match if explicit hard gate present.
      return { matches: !!p.always_match, note: p.note || null };
    default:
      return { matches: false };
  }
}

function categoryFor(kind) {
  if (LIFE_SUBTYPES.includes(kind))    return { category: "life",    subtype: kind };
  if (ANNUITY_SUBTYPES.includes(kind)) return { category: "annuity", subtype: kind };
  return null;
}

function requiredRulesFor(category) {
  return category === "annuity" ? REQUIRED_ANNUITY_RULES : REQUIRED_LIFE_RULES;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST")    return new Response("POST only", { status: 405, headers: corsHeaders() });

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad json" }, 400); }

  const c = body || {};
  if (!c.product_kind) return jsonResponse({ error: "product_kind required" }, 400);
  const cat = categoryFor(c.product_kind);
  if (!cat) return jsonResponse({ error: `unknown product_kind: ${c.product_kind}` }, 400);

  const auth = req.headers.get("authorization") || "";
  const jwt  = auth.replace(/^Bearer\s+/i, "") || ANON;
  const sbHeaders = { apikey: ANON, authorization: `Bearer ${jwt}` };

  // Pull candidate products + their subtype features (filters by category +
  // subtype) + carrier names + carrier_profiles (priority/url metadata).
  const featuresTable = cat.category === "life" ? "product_features_life" : "product_features_annuity";
  const featR = await fetch(
    `${SUPA_URL}/rest/v1/${featuresTable}?select=product_id,product_subtype&product_subtype=eq.${cat.subtype}`,
    { headers: sbHeaders }
  );
  const features = featR.ok ? await featR.json() : [];
  const productIds = features.map(f => f.product_id);
  if (productIds.length === 0) {
    return jsonResponse({ ranked: [], declined: [], refer_uw: [], note: `no ${cat.subtype} products in catalog yet` });
  }
  const idList = productIds.map(id => `"${id}"`).join(",");

  const [productsR, rulesR, carriersR, profilesR] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/products?select=id,carrier_id,name,category,comp_pct,is_active&id=in.(${idList})&is_active=eq.true`,
          { headers: sbHeaders }),
    fetch(`${SUPA_URL}/rest/v1/product_underwriting_rules?select=id,product_id,rule_type,payload,severity&review_status=eq.approved&product_id=in.(${idList})`,
          { headers: sbHeaders }),
    fetch(`${SUPA_URL}/rest/v1/carriers?select=id,name,status`,
          { headers: sbHeaders }),
    fetch(`${SUPA_URL}/rest/v1/carrier_profiles?select=carrier_id,quote_priority,autoquoter_supported,scraper_slug,e_app_url,quoter_url,producer_portal_url,jit_appointment,bind_speed_hours,commission_tier`,
          { headers: sbHeaders }),
  ]);

  const products = productsR.ok ? await productsR.json() : [];
  const rules    = rulesR.ok    ? await rulesR.json()    : [];
  const carriers = carriersR.ok ? await carriersR.json() : [];
  const profiles = profilesR.ok ? await profilesR.json() : [];
  const carrierById = Object.fromEntries(carriers.map(x => [x.id, x]));
  const profileById = Object.fromEntries(profiles.map(x => [x.carrier_id, x]));
  const rulesByProduct = rules.reduce((m, r) => ((m[r.product_id] ||= []).push(r), m), {});
  const required = requiredRulesFor(cat.category);

  const ranked = [], declined = [], refer_uw = [];

  for (const p of products) {
    const carrier = carrierById[p.carrier_id] || { name: p.carrier_id };
    const profile = profileById[p.carrier_id] || {};
    const productRules = rulesByProduct[p.id] || [];
    const present = new Set(productRules.map(r => r.rule_type));
    const missing = required.filter(t => !present.has(t));

    const reasons = [], caveats = [], blockers = [];
    let worstSeverity = "ok";  // ok < info < rate_up < refer_uw < postpone < decline
    const sevRank = { ok:0, info:1, rate_up:2, refer_uw:3, postpone:4, decline:5 };
    function bump(s) { if (sevRank[s] > sevRank[worstSeverity]) worstSeverity = s; }

    for (const r of productRules) {
      const ev = evaluateRule(r, c);
      if (!ev.matches) continue;
      const note = `${r.rule_type}: ${ev.note || "matched"}`;
      if (r.severity === "decline" || r.severity === "postpone") {
        blockers.push(note);
      } else if (r.severity === "rate_up") {
        caveats.push(note);
      } else if (r.severity === "refer_uw") {
        caveats.push(`refer_uw — ${note}`);
      } else {
        reasons.push(note);
      }
      bump(r.severity);
    }

    if (missing.length > 0 && worstSeverity !== "decline") {
      // We don't have full UW data for this carrier+product — flag it.
      refer_uw.push({
        carrier_id: p.carrier_id,
        carrier_name: carrier.name,
        product_id: p.id,
        product_name: p.name,
        missing_rules: missing,
        note: "Insufficient underwriting data on file — confirm with carrier informal inquiry.",
      });
      continue;
    }

    const base = {
      carrier_id: p.carrier_id,
      carrier_name: carrier.name,
      product_id: p.id,
      product_name: p.name,
      quote_priority: profile.quote_priority ?? 100,
      autoquoter_supported: !!profile.autoquoter_supported,
      scraper_slug: profile.scraper_slug || null,
      e_app_url: profile.e_app_url || null,
      quoter_url: profile.quoter_url || null,
      producer_portal_url: profile.producer_portal_url || null,
      jit_appointment: !!profile.jit_appointment,
      bind_speed_hours: profile.bind_speed_hours || null,
      commission_tier: profile.commission_tier || null,
      comp_pct: p.comp_pct,
      severity_summary: worstSeverity,
      reasons, caveats, blockers,
    };

    if (worstSeverity === "decline" || worstSeverity === "postpone") {
      declined.push(base);
    } else {
      ranked.push(base);
    }
  }

  // Sort: lower quote_priority first, higher commission second.
  ranked.sort((a, b) =>
    (a.quote_priority - b.quote_priority) ||
    ((b.comp_pct || 0) - (a.comp_pct || 0))
  );

  // Audit row — mirror api/quote.js pattern.
  let agencyId = null;
  try {
    const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
      method: "POST",
      headers: { ...sbHeaders, "content-type": "application/json" },
      body: "{}",
    });
    const meRows = meR.ok ? await meR.json() : [];
    if (Array.isArray(meRows) && meRows[0]) agencyId = meRows[0].agency_id;
  } catch {}
  if (!agencyId) agencyId = DEMO_AGENCY_ID;

  try {
    await fetch(`${SUPA_URL}/rest/v1/quote_runs`, {
      method: "POST",
      headers: { ...sbHeaders, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        agency_id: agencyId,
        lead_id: c.lead_id || null,
        call_id: c.call_id || null,
        inputs: { kind: "carrier_recommend", case: c },
        results: { ranked: ranked.map(r => r.carrier_id), declined: declined.map(r => r.carrier_id) },
      }),
    });
  } catch {}

  return new Response(JSON.stringify({ ranked, declined, refer_uw, inputs_echo: c }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders() },
  });
}
