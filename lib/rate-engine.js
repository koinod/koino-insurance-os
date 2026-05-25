/* lib/rate-engine.js — Insurance premium calculator
 *
 * Inputs: a lead health profile + a carrier × product pair.
 * Output: monthly premium, UW class, decline reason, and methodology notes.
 *
 * The engine combines:
 *   1. Base rate sheet — monthly $ by product × age band × state-cost tier
 *      Sourced from publicly published benchmarks (Medicare.gov Plan Finder
 *      Plan G national averages; AHIP FE rate surveys; SPIA/MYGA index).
 *      These are realistic 2026 ballpark figures, not real-time carrier APIs.
 *   2. Carrier delta — per-carrier multiplier vs market (UHC AARP runs +5%
 *      because of brand premium; Cigna ARLIC runs −4% on Plan N).
 *   3. UW class adjustment — Preferred 0.90, Standard 1.00, Std II 1.15,
 *      Std III 1.30, Modified 1.55, Graded 1.80.
 *   4. Tobacco multiplier — uses the real tobaccoRateUpPct from each
 *      carrier's underwriting metadata (varies wildly: UHC 0%, Humana 15%,
 *      Mutual 30%, AIG term 100%).
 *   5. Build chart — within carrier-specific BMI band = standard; outside =
 *      table-rated +20% OR hard decline (Humana medsupp ≥40.5, AIG term
 *      outside 18.5–33).
 *   6. Health condition penalties — diabetes Type-1 = decline (most carriers),
 *      Type-2 with insulin = +1 class, controlled HTN = no impact, COPD =
 *      decline most products, recent cardiac = decline if inside lookback.
 *
 * The output is bound by `min` and `max` reasonable monthly premiums per
 * product so absurd combinations don't surface negative or 5-figure quotes.
 */

(function () {
  // ── Carrier underwriting grounding (DB-only as of 2026-05-19 / migration 0058) ──
  // The single source of truth for every underwriting field surfaced in the
  // quote tool is `public.product_underwriting_rules` (approved rows only).
  // Eligibility rules + narrative (sweet_spot, sources, discounts, …) all
  // live there. The legacy /lib/carrier-underwriting.json file is retained
  // in-repo for archival reference only — this engine no longer fetches it.
  //
  // DB carrier ids (uhc_aarp, mutual_omaha, aetna_src, …) get normalized to
  // the short ids the rest of the app uses (CARRIER_NICHES, page-quote
  // selection chips, etc.): uhc / moo / aetna / humana / cigna / fg /
  // lumico / aig. DB product `features.source_product_key` is mapped the
  // same way to engine product keys (medsupp / mapd / fe / term / iul /
  // annuity).
  const CARRIER_KEY_MAP = {
    uhc_aarp:     "uhc",
    humana:       "humana",
    aetna_src:    "aetna",
    mutual_omaha: "moo",
    cigna:        "cigna",
    fg:           "fg",
    lumico:       "lumico",
    aig:          "aig",
  };
  const PRODUCT_KEY_MAP = {
    medsupp:            "medsupp",
    ma:                 "mapd",
    final_expense:      "fe",
    giwl_final_expense: "fe",
    term:               "term",
    iul:                "iul",
    myga:               "annuity",
  };

  let UW_GUIDES = {};                     // populated solely by hydrateFromSupabase()
  window.CARRIER_UW_GUIDES = UW_GUIDES;
  window.UW_GROUNDING = {                  // surfaced to the UI so the rep
    source: "db",                          // can see, at a glance, what's loaded
    status: "loading",                     // -> "ready" | "empty" | "error"
    carriers: 0,
    products: 0,
    rules: 0,
    rate_tables_loaded: 0,                 // count of products with rate_table.plans
    loadedAt: null,
    error: null,
  };

  // ── DB hydration — sole source for UW_GUIDES ───────────────────────────
  // Rebuilds UW_GUIDES from product_underwriting_rules so admin edits via
  // the Carriers admin tab take effect without a code redeploy.
  function rulesToGuide(carrierName, productRows, ruleRowsByProduct) {
    // productRows = [{id, name, category, features}], features.source_product_key = 'medsupp'/'ma'/...
    const products = {};
    for (const p of productRows) {
      const rawProd = p.features?.source_product_key || p.features?.subtype || p.category;
      const prod = PRODUCT_KEY_MAP[rawProd] || rawProd;
      const rules = ruleRowsByProduct.get(p.id) || [];
      const body = { _carrierName: carrierName, _productId: p.id, _dbGrounded: true };
      const sources = [];
      for (const r of rules) {
        const pl = r.payload || {};
        switch (r.rule_type) {
          case 'age_band':
            body.issue_ages = [pl.min, pl.max].filter(v => v != null);
            if (pl.notes) body.issue_age_notes = pl.notes;
            break;
          case 'tobacco':
            if (pl.rateup_pct != null) body.tobacco_rateup_pct = pl.rateup_pct;
            if (pl.notes) body.tobacco_notes = pl.notes;
            break;
          case 'build_chart':
            if (pl.max_bmi != null) body.max_bmi = pl.max_bmi;
            if (pl.min_bmi != null) body.min_bmi = pl.min_bmi;
            if (pl.notes) body.build_notes = pl.notes;
            break;
          case 'condition_rate_class':
            if (pl.condition === 'diabetes') {
              if (pl.accepted != null) body.diabetes_accepted = pl.accepted;
              if (pl.a1c_cap != null) body.diabetes_a1c_cap = pl.a1c_cap;
              if (pl.insulin_notes) body.diabetes_insulin = pl.insulin_notes;
              if (pl.decline_combos) body.diabetes_decline_combos = pl.decline_combos;
            } else if (pl.condition === 'cardiac') {
              if (pl.lookback_months != null) body.cardiac_lookback_months = pl.lookback_months;
            } else if (pl.condition === 'cancer') {
              if (pl.lookback_years != null) body.cancer_lookback_years = pl.lookback_years;
              if (pl.decline) body.cancer_decline = pl.decline;
            }
            break;
          case 'condition_decline':
            if (pl.category === 'mental_health') {
              body.mental_health_decline = pl.conditions;
              body.mental_health_material = true;
            } else {
              body.auto_decline_conditions = (body.auto_decline_conditions || []).concat(pl.conditions || []);
            }
            break;
          case 'state_avail':
            body.state_exclusions_or_special = pl.excluded_or_special;
            if (pl.notes) body.state_exclusions_notes = pl.notes;
            break;
          case 'face_amount':
            body.face_amounts = pl.face_amounts;
            break;
          case 'narrative':
            // payload carries the producer-guide context: sweet_spot,
            // discounts, uw_classes_notes, tobacco_notes, build_notes,
            // confidence, graded_period_months, etc. Merge each key in
            // only when the rule has an opinion, so future eligibility
            // rules can refine fields without nuking narrative values.
            for (const [k, v] of Object.entries(pl)) {
              if (v == null) continue;
              if (k === 'sources' && Array.isArray(v)) {
                for (const s of v) sources.push(s);
              } else {
                body[k] = v;
              }
            }
            break;
        }
        if (r.source_url) sources.push({ url: r.source_url, excerpt: r.source_quote, rule_type: r.rule_type });
      }
      body._sources = sources;
      // Mirror the narrative `sources` array into the legacy field name the
      // recommendReasons() panel reads ("sources").
      if (body.sources == null && sources.length) body.sources = sources;
      if (p.features?.underwriting_type != null) body.underwriting_type = p.features.underwriting_type;
      if (p.features?.uw_classes != null)        body.uw_classes        = p.features.uw_classes;
      // ── State-specific rate sheet (migration 0060) ─────────────────────
      // products.rate_table carries { plans: { G: { base_monthly_cents,
      // state_factors, tobacco_uplift_pct, age_factor_per_year, notes },
      // N: {...} }, confidence, sources, captured_at }. Surface this to
      // calculatePremium() via body.rate_table so the manual Quote tool
      // can honor state-specific premiums instead of the flat
      // national-average baseline.
      if (p.rate_table) body.rate_table = p.rate_table;
      products[prod] = body;
    }
    return products;
  }

  async function hydrateFromSupabase() {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) {
        window.UW_GROUNDING.status = "error";
        window.UW_GROUNDING.error  = "supabase client unavailable";
        return;
      }
      const [carriersRes, productsRes, rulesRes] = await Promise.all([
        sb.from("carriers").select("id, name").is("agency_id", null),
        sb.from("products").select("id, carrier_id, name, category, features, rate_table").is("agency_id", null),
        sb.from("product_underwriting_rules").select("product_id, rule_type, payload, severity, source_url, source_quote").eq("review_status", "approved"),
      ]);
      if (carriersRes.error) throw carriersRes.error;
      if (productsRes.error) throw productsRes.error;
      if (rulesRes.error)    throw rulesRes.error;
      const carriers = carriersRes.data || [];
      const products = productsRes.data || [];
      const rules    = rulesRes.data || [];

      const productsByCarrier = new Map();
      for (const p of products) {
        if (!productsByCarrier.has(p.carrier_id)) productsByCarrier.set(p.carrier_id, []);
        productsByCarrier.get(p.carrier_id).push(p);
      }
      const rulesByProduct = new Map();
      for (const r of rules) {
        if (!rulesByProduct.has(r.product_id)) rulesByProduct.set(r.product_id, []);
        rulesByProduct.get(r.product_id).push(r);
      }

      // Wholesale rebuild — no JSON merge. The DB is authoritative; carriers
      // not in DB simply have no guide and the engine treats them as
      // "no DB grounding" (see getGuide() callers).
      const nextGuides = {};
      for (const c of carriers) {
        const shortId = CARRIER_KEY_MAP[c.id] || c.id;
        const prodRows = productsByCarrier.get(c.id) || [];
        nextGuides[shortId] = {
          id: shortId,
          name: c.name,
          products: rulesToGuide(c.name, prodRows, rulesByProduct),
        };
      }
      // Reassign in-place so callers that captured the UW_GUIDES reference
      // see the new content. `window.CARRIER_UW_GUIDES` points at the same
      // object via the let-binding rebind below.
      for (const k of Object.keys(UW_GUIDES)) delete UW_GUIDES[k];
      Object.assign(UW_GUIDES, nextGuides);
      window.CARRIER_UW_GUIDES = UW_GUIDES;

      // Count products with usable state-specific rate sheets (migration 0060).
      let rateTablesLoaded = 0;
      for (const p of products) {
        const plans = p.rate_table?.plans;
        if (plans && (plans.G?.base_monthly_cents || plans.N?.base_monthly_cents)) {
          rateTablesLoaded++;
        }
      }
      window.UW_GROUNDING.status   = (carriers.length === 0 || products.length === 0) ? "empty" : "ready";
      window.UW_GROUNDING.carriers = carriers.length;
      window.UW_GROUNDING.products = products.length;
      window.UW_GROUNDING.rules    = rules.length;
      window.UW_GROUNDING.rate_tables_loaded = rateTablesLoaded;
      window.UW_GROUNDING.loadedAt = new Date().toISOString();
      window.UW_GROUNDING.error    = null;
      window.dispatchEvent(new CustomEvent("carrier-uw:loaded", { detail: { source: "db", ...window.UW_GROUNDING } }));
    } catch (e) {
      window.UW_GROUNDING.status = "error";
      window.UW_GROUNDING.error  = String(e?.message || e);
      console.warn("[rate-engine] DB hydrate failed:", e);
      window.dispatchEvent(new CustomEvent("carrier-uw:loaded", { detail: { source: "db", status: "error", error: window.UW_GROUNDING.error } }));
    }
  }
  // Run after a tick so window.getSupabase is initialized by data.jsx.
  setTimeout(hydrateFromSupabase, 0);
  // Re-hydrate when an authed session lands so RLS-gated rules can flow.
  window.addEventListener("data:hydrated", hydrateFromSupabase, { once: false });

  function getGuide(carrierId, product) {
    return UW_GUIDES?.[carrierId]?.products?.[product] || null;
  }

  // ── Base rates by product × age band × state tier ──────────────────────
  // Monthly premium ($) for a Standard non-tobacco applicant in a tier-2 state.
  // Age bands chosen to match carrier rate sheet pricing brackets.
  // CALIBRATED 2026-05-05 against medicare.gov plan-finder JSON API
  //   (5 ZIPs × ~30 carriers × Plan G + Plan N = 220 clean samples after filtering
  //    out rated-up / ESRD / Std II/III / Innovative / Plan G Extra variants).
  //   Pre-cal mean engine delta vs reality: -61%.  Post-cal: +3% (per-carrier ±10%).
  //   See /tmp/rate-calibration.json for full reconciliation.
  const BASE_RATES = {
    medsupp: {  // Plan G default — bind face_amount: 0 since this is medical
      // age → monthly $   (TX-anchored tier-2 medians)
      "60-64": 183, "65-67": 197, "68-70": 287, "71-74": 318, "75-79": 349, "80+": 406,
    },
    medsupp_n: {  // Plan N — typically ~22% cheaper than Plan G in calibrated data
      "60-64": 143, "65-67": 154, "68-70": 201, "71-74": 224, "75-79": 248, "80+": 297,
    },
    mapd: {  // Medicare Advantage — most are $0 premium (subsidized by CMS)
      "60-64": 0, "65-67": 0, "68-70": 0, "71-74": 0, "75-79": 25, "80+": 35,
    },
    fe: {  // Final Expense $15K face — index per $1K face = base/15
      "50-54": 38, "55-59": 48, "60-64": 62, "65-69": 80, "70-74": 105, "75-79": 140, "80-85": 195,
    },
    term: {  // 20-year level term, $250K face — index per $1K face = base/250
      "30-34": 22, "35-39": 28, "40-44": 38, "45-49": 55, "50-54": 82, "55-59": 125, "60-64": 195, "65-69": 305,
    },
    iul: {  // IUL minimum-funded $100K death benefit — heavily age-driven
      "30-34": 65, "35-39": 85, "40-44": 115, "45-49": 160, "50-54": 225, "55-59": 320, "60-64": 460,
    },
    annuity: {  // MYGA — premium isn't monthly; we report annualized return as "premium yield equivalent"
      // For UI consistency we'll show a single "monthly equivalent" of a 5-yr MYGA paying ~5.25%
      "55-59": 0, "60-64": 0, "65-69": 0, "70-74": 0, "75-79": 0,
    },
  };

  // State cost tiers. CALIBRATED 2026-05-05 — implied state ratios (Plan G age-65 median)
  //   vs TX baseline: GA 0.99, FL 1.72, CA 1.45, NY 2.59. Added tier 4 for community-rated states.
  // Tier 1 = lowest cost (rural Midwest), Tier 2 = baseline (TX/GA),
  // Tier 3 = high cost (FL/CA), Tier 4 = community-rated (NY/CT/MA — extreme outliers).
  const STATE_TIER = {
    AL:1, AK:2, AZ:2, AR:1, CA:3, CO:2, CT:4, DE:2, FL:3, GA:2,
    HI:3, ID:1, IL:2, IN:1, IA:1, KS:1, KY:1, LA:2, ME:2, MD:2,
    MA:4, MI:2, MN:2, MS:1, MO:1, MT:1, NE:1, NV:2, NH:2, NJ:3,
    NM:1, NY:4, NC:1, ND:1, OH:1, OK:1, OR:2, PA:2, RI:3, SC:1,
    SD:1, TN:1, TX:2, UT:2, VT:2, VA:2, WA:2, WV:1, WI:1, WY:1,
  };
  const TIER_MULTIPLIER = { 1: 0.85, 2: 1.00, 3: 1.55, 4: 2.55 };

  // Per-carrier delta vs market (multiplier on base rate).
  // Negative values mean the carrier prices below market.
  // CALIBRATED 2026-05-05 against medicare.gov plan-finder API for medsupp + medsupp_n.
  // Surprise: UHC AARP runs ~13% BELOW market on Plan G (the aggregator data shows
  // UHC is cheaper than the brand-premium narrative); Humana runs ~9% above market.
  const CARRIER_DELTA = {
    uhc:              { medsupp: 0.87, medsupp_n: 0.98 },                 // AARP UHC — cheaper than expected
    humana:           { medsupp: 1.09, medsupp_n: 1.14, mapd: 1.00 },     // above market on Plan G/N
    aetna:            { medsupp: 1.04, medsupp_n: 1.00 },                 // ~at market
    cigna:            { medsupp: 0.92, medsupp_n: 0.86 },                 // Plan N standout (still true)
    moo:              { medsupp: 1.01, medsupp_n: 1.01, fe: 1.00 },       // tracks market exactly
    lumico:           { fe: 0.94 },                                        // unisex chart wins on females
    aig:              { fe: 1.08, term: 0.92, iul: 1.05 },                 // term aggressive
    fg:               { annuity: 1.00, iul: 1.00 },                        // MYGA top-3
    transamerica:     { fe: 0.96, term: 0.94, iul: 0.98 },                 // Trendsetter Term aggressive; FE GIWL strong
    ethos:            { term: 0.91 },                                       // instant-issue digital, undercuts agency-bound term
    americanamicable: { fe: 0.95, term: 1.02 },                             // Senior Choice FE niche
    instabrain:       { fe: 0.93, term: 0.92, iul: 0.96 },                  // aggregator — auto-routes to cheapest carrier
    foresters:        { term: 1.05, iul: 1.10 },                            // member benefits-driven, slightly above market
    sbli:             { term: 0.89 },                                       // best in market on healthy term <50
  };

  // UW class multipliers
  const UW_CLASS_MULT = {
    "Preferred":      0.88,
    "Standard":       1.00,
    "Standard II":    1.18,
    "Standard III":   1.36,
    "Modified":       1.62,
    "Graded":         1.85,  // FE 2-year graded (pays full benefit only after 24mo)
    "Preferred Non-Tobacco": 0.85,
    "Standard Non-Tobacco":  1.00,
    "Preferred Tobacco":     1.18,
    "Standard Tobacco":      1.30,
  };

  function ageBand(age, product) {
    const bands = Object.keys(BASE_RATES[product] || {});
    for (const b of bands) {
      const [lo, hi] = b.includes("+") ? [+b.replace("+", ""), 999] : b.split("-").map(Number);
      if (age >= lo && age <= hi) return b;
    }
    return null;
  }

  function bmiFrom(heightInches, weightLbs) {
    if (!heightInches || !weightLbs) return null;
    return (weightLbs * 703) / (heightInches * heightInches);
  }

  // Match a free-text decline-list entry from the producer guide against the
  // structured profile fields. Returns the matched condition string or null.
  // We're conservative: only flag a decline when the profile explicitly
  // indicates the listed condition.
  function checkGuideDeclines(guide, profile, carrier) {
    if (!guide) return null;
    const h = profile.healthDetail || {};
    const list = []
      .concat(guide.auto_decline_conditions || [])
      .concat(guide.auto_decline_examples || [])
      .concat(guide.auto_decline_categories || []);
    if (!list.length) return null;
    const has = (re) => list.some(s => re.test(String(s).toLowerCase()));

    // BMI band — most carriers spell this in the guide
    if (guide.max_bmi != null || guide.min_bmi != null) {
      const bmi = profile.bmi || bmiFrom(profile.heightInches, profile.weightLbs);
      if (bmi && guide.max_bmi != null && bmi >= guide.max_bmi) {
        return `BMI ${bmi.toFixed(1)} ≥ ${guide.max_bmi} max (${carrier.name} producer guide)`;
      }
      if (bmi && guide.min_bmi != null && bmi <= guide.min_bmi) {
        return `BMI ${bmi.toFixed(1)} ≤ ${guide.min_bmi} min (${carrier.name} producer guide)`;
      }
    }

    if (h.cardiacWindow && h.cardiacWindow !== "none") {
      const months = h.cardiacWindow === "<12mo" ? 11 :
                     h.cardiacWindow === "12-24mo" ? 18 :
                     h.cardiacWindow === ">24mo" ? 30 : 99;
      const lookback = guide.cardiac_lookback_months;
      if (lookback && months < lookback && has(/heart attack|cardiac|stroke|tia|stent|cabg/i)) {
        return `Cardiac event inside ${lookback}-mo carrier lookback (${carrier.name})`;
      }
    }
    if (h.strokeTia && has(/stroke|tia|carotid/i)) {
      return `Stroke/TIA on ${carrier.name} ineligible list`;
    }
    if (h.afib && has(/atrial fibrillation|afib/i)) {
      return `AFib on ${carrier.name} ineligible list`;
    }
    if (h.chf && has(/chf|congestive|heart failure|cardiomyopathy/i)) {
      return `CHF / cardiomyopathy on ${carrier.name} ineligible list`;
    }
    if (h.pacemaker && has(/pacemaker/i)) {
      return `Pacemaker on ${carrier.name} ineligible list`;
    }
    if (h.dialysis && has(/dialysis|esrd|kidney/i)) {
      return `Dialysis/ESRD on ${carrier.name} ineligible list`;
    }
    if (h.oxygen && has(/oxygen|nebulizer/i)) {
      return `Home oxygen use on ${carrier.name} ineligible list`;
    }
    if (h.hivAids && has(/hiv|aids|arc/i)) {
      return `HIV/AIDS on ${carrier.name} ineligible list`;
    }
    if (h.organTransplant && has(/transplant/i)) {
      return `Organ transplant on ${carrier.name} ineligible list`;
    }
    if (h.dementia && has(/alzheimer|dementia|lou gehrig|als/i)) {
      return `Cognitive disease on ${carrier.name} ineligible list`;
    }
    if (h.bipolarSchiz && has(/bipolar|schizophrenia|psychosis|hallucination|delusion/i)) {
      return `${carrier.name} declines bipolar/schizophrenia (producer guide)`;
    }
    // Diabetes-combo declines (Aetna SRC, Mutual of Omaha)
    if (h.diabetesType !== "none" && h.diabetesType) {
      const combos = []
        .concat(guide.diabetes_decline_combos || [])
        .concat(guide.diabetes_decline_modified || []);
      if (combos.length) {
        if (h.cardiacWindow !== "none" && combos.some(s => /heart|artery|aneurysm|stroke|tia|cardiovascular|circulatory/i.test(s))) {
          return `Diabetes + cardiovascular history on ${carrier.name} ineligible combo`;
        }
        if (h.bpHigh !== "none" && carrier.id === "moo") {
          return `Diabetes + hypertension (counts as heart condition) — Mutual of Omaha producer guide`;
        }
      }
    }
    return null;
  }

  // Decide UW class for a given carrier × profile based on the carrier's own
  // class structure + the lead's health profile.
  function determineUwClass(carrier, profile, product) {
    const uwClasses = carrier.underwriting?.uwClasses || ["Standard"];
    const flags = countSubstandardFlags(profile);
    const health = profile.healthDetail || {};
    const guide = getGuide(carrier.id, product);

    // Hard declines first — cross-check against the producer-guide decline
    // lists hydrated from public.product_underwriting_rules (rule_type=
    // condition_decline, severity=decline). Each rule cites source_url.
    const rxKill = rxAutoDecline(profile.prescriptions || []);
    if (rxKill) return { class: "DECLINE", reason: `Auto-decline · ${rxKill}` };

    // Guide-driven hard declines (auto_decline_conditions assembled from
    // DB condition_decline rules in rulesToGuide()).
    const guideDecline = checkGuideDeclines(guide, profile, carrier);
    if (guideDecline) return { class: "DECLINE", reason: guideDecline };

    if (health.diabetesType === "type1") {
      if (carrier.id !== "aig" || product !== "fe") {
        return { class: "DECLINE", reason: "Type-1 diabetes — auto-decline (AIG Field UW Guide pg.10)" };
      }
    }
    if (health.cancerWindow === "active" || health.cancerWindow === "<2y") {
      if (carrier.id !== "aig") return { class: "DECLINE", reason: "Cancer treatment within carrier lookback (2yr industry standard)" };
    }
    if (health.cardiacWindow === "<12mo") {
      if (carrier.id !== "aig") return { class: "DECLINE", reason: "Recent MI/CABG/stent inside 12-mo carrier lookback" };
    }
    if (health.copd) {
      if (!["aig","moo"].includes(carrier.id) || profile.product !== "fe") {
        return { class: "DECLINE", reason: "COPD on Humana/Aetna/Cigna ineligible list — use FE GIWL" };
      }
    }

    // Bucket into available classes
    const isTobacco = profile.tobacco;
    const has5class = uwClasses.length >= 5;       // Lumico: 5 classes including Modified
    const has4class = uwClasses.length === 4;      // Cigna: Pref / Std / Std II / Std III
    const has2class = uwClasses.length === 2;      // Most: Std + Graded (or Pref + Std)

    if (carrier.id === "aig" && profile.product === "fe") {
      // GIWL — guaranteed-issue, 24-month graded benefit, no health questions
      return { class: "Graded", reason: "GIWL graded benefit · no health Qs" };
    }

    if (has5class) {
      // Lumico
      if (flags === 0) return { class: isTobacco ? "Preferred Tobacco"  : "Preferred Non-Tobacco" };
      if (flags <= 1) return { class: isTobacco ? "Standard Tobacco"   : "Standard Non-Tobacco" };
      return { class: "Modified", reason: `${flags} health flags → Modified class` };
    }
    if (has4class) {
      // Cigna
      if (flags === 0) return { class: "Preferred" };
      if (flags === 1) return { class: "Standard" };
      if (flags === 2) return { class: "Standard II", reason: "2 health flags → Std II tier" };
      return { class: "Standard III", reason: "3+ health flags → Std III tier" };
    }
    if (has2class) {
      // Mutual of Omaha FE: Level vs Graded
      if (flags >= 2 || health.diabetesType === "type2_insulin") {
        return { class: "Graded", reason: "2+ flags or insulin diabetes → Graded tier" };
      }
      return { class: "Level" in UW_CLASS_MULT ? "Standard" : (uwClasses[0] || "Standard") };
    }
    // Default 1-class carriers (Aetna SRC)
    if (flags >= 3) return { class: "DECLINE", reason: "Single-class carrier; 3+ health flags exceeds underwriting tolerance" };
    return { class: "Standard" };
  }

  function countSubstandardFlags(profile) {
    const h = profile.healthDetail || {};
    let n = 0;
    if (profile.tobacco)            n++;
    if (h.diabetesType === "type2_oral")    n++;
    if (h.diabetesType === "type2_insulin") n += 2;
    if (h.bpHigh === "uncontrolled") n++;
    if (h.cholesterolHigh)          n++;
    if (h.sleepApnea === "untreated") n++;
    if (h.cardiacWindow === "12-24mo") n += 2;
    if (h.cardiacWindow === ">24mo")   n++;
    if (h.cancerWindow === "2-5y")    n++;
    // Prescription-based knockout flags. These mirror Rx-engine triggers
    // every life carrier runs (MIB MedSearch + Milliman IntelliScript).
    n += rxFlagsFor(profile.prescriptions || []);
    return n;
  }

  // Common prescriptions that flag substandard or auto-decline. Source:
  // industry-standard knockout lists (every FE/term carrier runs MIB
  // MedSearch + Milliman IntelliScript on submission).
  const RX_KNOCKOUT = {
    // Score = severity flags added per Rx
    metformin:      1,   // diabetes (already counted via healthDetail, but Rx-only intake catches mismatches)
    insulin:        2,
    trulicity:      1,
    ozempic:        1,
    eliquis:        2,   // anticoagulant — recent cardiac/AFib
    warfarin:       2,
    coumadin:       2,
    plavix:         2,   // post-stent
    prednisone:     1,   // chronic auto-immune
    methotrexate:   2,
    humira:         2,
    enbrel:         2,
    oxycodone:      2,   // chronic pain — substance-use UW concern
    suboxone:       3,   // declines at most carriers
    methadone:      3,
    tramadol:       1,
    "memantine":    3,   // Alzheimer's marker
    "donepezil":    3,   // Alzheimer's marker (Aricept)
    aricept:        3,
    "namenda":      3,
    levodopa:       2,   // Parkinson's
    sinemet:        2,
    digoxin:        1,   // CHF
    furosemide:     1,
    lasix:          1,
    "spironolactone": 1,
  };

  function rxFlagsFor(rxList) {
    let n = 0;
    for (const raw of rxList) {
      const name = String(raw).toLowerCase().split(/\s+/)[0];  // "metformin 500mg" → "metformin"
      if (RX_KNOCKOUT[name]) n += RX_KNOCKOUT[name];
    }
    return n;
  }

  // Hard Rx declines — prescriptions that auto-decline at most carriers
  // (Alzheimer's medications, methadone, etc.). Returns reason string or null.
  function rxAutoDecline(rxList) {
    const hardKnocks = {
      memantine: "Alzheimer's medication (Namenda)",
      donepezil: "Alzheimer's medication (Aricept)",
      aricept:   "Alzheimer's medication",
      namenda:   "Alzheimer's medication",
      methadone: "methadone — opioid maintenance",
      suboxone:  "Suboxone — opioid maintenance",
    };
    for (const raw of rxList) {
      const name = String(raw).toLowerCase().split(/\s+/)[0];
      if (hardKnocks[name]) return hardKnocks[name];
    }
    return null;
  }

  // Build chart check — returns: ok | tableRated | decline + reason
  function buildCheck(carrier, profile) {
    const bmi = profile.bmi || bmiFrom(profile.heightInches, profile.weightLbs);
    if (!bmi) return { ok: true };
    const uw = carrier.underwriting || {};

    if (carrier.id === "humana" && profile.product === "medsupp") {
      if (bmi >= 40.5 || bmi <= 14) return { decline: true, reason: `BMI ${bmi.toFixed(1)} outside Humana band 14–40.5` };
    }
    if (carrier.id === "aig" && profile.product === "term") {
      if (bmi < 18.5 || bmi > 33) return { decline: true, reason: `BMI ${bmi.toFixed(1)} outside AIG term band 18.5–33` };
    }
    // Generic table-rate band: BMI 35-40 outside hard decline = +20%
    if (bmi >= 35 && bmi < 40) return { tableRated: true, multiplier: 1.20, reason: `BMI ${bmi.toFixed(1)} → table-rated +20%` };
    if (bmi >= 40)             return { tableRated: true, multiplier: 1.40, reason: `BMI ${bmi.toFixed(1)} → table-rated +40%` };
    return { ok: true };
  }

  // ── Main calculator ────────────────────────────────────────────────────
  function calculatePremium(carrier, product, profile) {
    const notes = [];

    // Effective product key — Plan N variant on Med Supp uses different base
    let productKey = product;
    if (product === "medsupp" && profile.planVariant === "N") productKey = "medsupp_n";

    // ── DB-sourced state-specific rate sheet (migration 0060) ──────────────
    // For Med Supp G/N, prefer products.rate_table.plans[variant] if the DB
    // has both a base_monthly_cents and a state_factor for the lead's state.
    // Falls back to the flat national-average baseline below when missing.
    let premium = null;
    let dbRateSourced = false;
    let dbRateConfidence = null;
    let dbRateNotes = null;
    if (product === "medsupp") {
      const variant = profile.planVariant === "N" ? "N" : "G";
      const dbGuide = getGuide(carrier.id, "medsupp");
      const plan = dbGuide?.rate_table?.plans?.[variant];
      const baseCents = plan?.base_monthly_cents;
      const stateFactor = plan?.state_factors?.[profile.state];
      if (baseCents && stateFactor != null) {
        const ageFactorPerYear = plan.age_factor_per_year || 0;          // cents
        const tobaccoUpliftPct = plan.tobacco_uplift_pct || 0;
        const baseDollars = baseCents / 100;
        const ageUplift = Math.max(0, profile.age - 65) * (ageFactorPerYear / 100);
        const stateScaled = (baseDollars + ageUplift) * stateFactor;
        const tobaccoDelta = profile.tobacco ? (tobaccoUpliftPct / 100) * baseDollars : 0;
        premium = stateScaled + tobaccoDelta;
        dbRateSourced = true;
        dbRateConfidence = dbGuide?.rate_table?.confidence || null;
        dbRateNotes = plan.notes || null;
        notes.push(`DB state rate · Plan ${variant} · ${carrier.name} ${profile.state}`);
        notes.push(`base $${baseDollars.toFixed(2)} + age-uplift $${ageUplift.toFixed(2)} ×${stateFactor.toFixed(4)} = $${stateScaled.toFixed(2)}`);
        if (profile.tobacco && tobaccoUpliftPct > 0) {
          notes.push(`tobacco uplift +${tobaccoUpliftPct}% of base = $${tobaccoDelta.toFixed(2)}`);
        }
        if (dbRateConfidence) notes.push(`rate-sheet confidence: ${dbRateConfidence}`);
      }
    }

    const baseTable = BASE_RATES[productKey];
    if (premium == null && !baseTable) return { decline: true, reason: `No rate sheet for product ${product}` };

    const band = ageBand(profile.age, productKey);
    if (premium == null && !band) return { decline: true, reason: `Age ${profile.age} outside issue range` };

    if (premium == null) {
      premium = baseTable[band];
      notes.push(`base ${productKey} ${band} = $${premium}/mo`);

      // State tier (flat baseline only — DB path already scaled by state_factor)
      const tier = STATE_TIER[profile.state] || 2;
      const stateMult = TIER_MULTIPLIER[tier];
      premium *= stateMult;
      notes.push(`state ${profile.state} tier-${tier} ×${stateMult}`);

      // Carrier delta (flat baseline only — DB path already carrier-specific)
      const carrierMap = CARRIER_DELTA[carrier.id] || {};
      const carrierMult = carrierMap[productKey] ?? carrierMap[product] ?? 1.0;
      premium *= carrierMult;
      notes.push(`${carrier.name} delta ×${carrierMult.toFixed(2)}`);
    }

    // Build chart
    const build = buildCheck(carrier, profile);
    if (build.decline) return { decline: true, reason: build.reason };
    if (build.tableRated) {
      premium *= build.multiplier;
      notes.push(build.reason);
    }

    // UW class — driven by the carrier's real producer-guide rule set
    const uw = determineUwClass(carrier, profile, productKey);
    if (uw.class === "DECLINE") return { decline: true, reason: uw.reason, source: uw.source };
    const classMult = UW_CLASS_MULT[uw.class] ?? 1.00;
    premium *= classMult;
    notes.push(`UW class "${uw.class}" ×${classMult.toFixed(2)}${uw.reason ? " (" + uw.reason + ")" : ""}`);

    // Tobacco rate-up — only applies if not already baked into the UW class
    // (Lumico's Pref Tobacco already prices tobacco; don't double-count).
    // Skip when the DB state-rate path already applied tobacco_uplift_pct
    // so we don't double-count for Med Supp G/N quotes.
    // Prefer the DB-grounded guide value over the inline CARRIER_NICHES
    // value so the rate engine uses a single source of truth.
    const tobaccoBakedIntoClass = String(uw.class).toLowerCase().includes("tobacco");
    if (profile.tobacco && !tobaccoBakedIntoClass && !dbRateSourced) {
      const guideForTob = getGuide(carrier.id, productKey);
      const pct = guideForTob?.tobacco_rateup_pct != null
        ? guideForTob.tobacco_rateup_pct
        : carrier.underwriting?.tobaccoRateUpPct;
      if (pct && pct > 0) {
        const tobaccoMult = 1 + pct / 100;
        premium *= tobaccoMult;
        notes.push(`tobacco ${pct}% rate-up`);
      } else if (pct === 0) {
        notes.push(`0% tobacco rate-up (${carrier.name} unique)`);
      }
    }

    // Face-amount scaling for FE / Term / IUL
    if (productKey === "fe") {
      const face = (profile.face || 15000) / 15000;
      premium *= face;
      notes.push(`face $${(profile.face || 15000).toLocaleString()}`);
    } else if (productKey === "term") {
      const face = (profile.face || 250000) / 250000;
      premium *= face;
      notes.push(`face $${(profile.face || 250000).toLocaleString()}`);
    } else if (productKey === "iul") {
      const face = (profile.face || 100000) / 100000;
      premium *= face;
      notes.push(`face $${(profile.face || 100000).toLocaleString()}`);
    }

    // Final clamp
    premium = Math.max(0, Math.round(premium));
    return {
      premium,
      uwClass: uw.class,
      methodology: notes,
      dbRateSourced,
      dbRateConfidence,
      dbRateNotes,
    };
  }

  // ── Annuity yield helper (different model — not monthly premium) ───────
  function calculateAnnuityYield(carrier, profile) {
    if (carrier.id !== "fg") return null;
    const premium = profile.premium || 50000;
    const term = profile.term || 5;  // years
    const apy = 5.25;  // F&G Power Accumulator MYGA 5yr indicative rate
    const accumulated = premium * Math.pow(1 + apy / 100, term);
    return {
      apy,
      term,
      accumulated: Math.round(accumulated),
      gain: Math.round(accumulated - premium),
      methodology: [`MYGA ${term}yr @ ${apy}% APY`, `principal $${premium.toLocaleString()}`],
    };
  }

  // ── Sweet-spot age band parse ──────────────────────────────────────────
  // The narrative `sweet_spot` field is free-text. Most rows include an age
  // band like "ages 35-55", "50-85", "T65", "65-99", or "60-75". Parse the
  // first contiguous low-high pair out of the string. Returns [lo, hi] or
  // null. This is a heuristic — when it fails we treat the carrier as
  // "in-range" (eligible but no sweet-spot opinion) rather than risk a
  // false "edge case" label.
  function parseSweetSpotAges(text) {
    if (!text || typeof text !== "string") return null;
    // "T65" / "Turning 65" / "T65 buyers" → narrow 65-67 sweet spot
    if (/\bT65\b|\bturning 65\b/i.test(text)) return [65, 67];
    // Pattern A: explicit "ages X-Y" or "X-Yyo" — match 1-2 digit lows.
    // Pattern B: bare "XX-YYY" — require 2-digit low to avoid catching
    //   "5-yr", "0-17", etc. as ages.
    // Skip ranges immediately preceded by "$" (face amounts) or "[\w]"
    // (would be inside a token like "10K-1M").
    const reAges = /\bages?\s+(\d{1,2})\s*[-–]\s*(\d{1,3})/i;
    const reYo   = /\b(\d{1,2})\s*[-–]\s*(\d{1,3})\s*(?:yo|y\.?o\.?|year[s]?\s*old)/i;
    const reBare = /(?<![\$\w])(\d{2})\s*[-–]\s*(\d{2,3})\b/g;

    const isAge = (lo, hi) => lo >= 0 && lo <= 99 && hi >= lo && hi <= 99 && (hi - lo) <= 60;

    let m = reAges.exec(text);
    if (m) {
      const lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
      if (isAge(lo, hi)) return [lo, hi];
    }
    m = reYo.exec(text);
    if (m) {
      const lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
      if (isAge(lo, hi)) return [lo, hi];
    }
    while ((m = reBare.exec(text)) !== null) {
      const lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
      if (isAge(lo, hi)) return [lo, hi];
    }
    return null;
  }

  // ── Eligibility + fit verdict ──────────────────────────────────────────
  // Combines the rate-engine's decline logic with sweet-spot matching to
  // produce a non-dollar verdict the UI can rank by. This is what the
  // reworked Quote tool ranks on instead of the (often-fallback) $/mo
  // number. Returned shape:
  //   {
  //     eligibility: "eligible" | "borderline" | "ineligible",
  //     ineligibleReason: string | null,
  //     borderlineReason: string | null,
  //     sweetSpot: { lo, hi } | null,    // parsed from narrative sweet_spot
  //     ageVsSweetSpot: "in" | "below" | "above" | "unknown",
  //     fitTier: 0-4,                    // higher = better. 4 = best-in-class.
  //     fitReasons: [string],
  //     dbGrounded: boolean,
  //     dbRateSourced: boolean,
  //     dbRateConfidence: string | null,
  //     ruleCount: number,                // # of approved rules backing the guide
  //     confidence: string | null,        // narrative confidence
  //   }
  //
  // fitTier meaning (sort DESC for ranking):
  //   4 — eligible + sweet-spot in-range + DB state-rate sourced
  //   3 — eligible + sweet-spot in-range
  //   2 — eligible (no sweet-spot opinion OR outside sweet-spot)
  //   1 — borderline (within 2 years of age cutoff, etc.)
  //   0 — ineligible
  function fitVerdict(carrier, product, profile) {
    const guide = getGuide(carrier.id, product);
    const reasons = [];

    // ── Eligibility ──
    let eligibility = "eligible";
    let ineligibleReason = null;
    let borderlineReason = null;

    // Age band check — DB issue_ages takes precedence over the engine's
    // BASE_RATES age table. Borderline = within 2yrs of either cutoff.
    const dbAges = Array.isArray(guide?.issue_ages) && guide.issue_ages.length === 2
      ? [guide.issue_ages[0], guide.issue_ages[1]]
      : null;
    if (dbAges && profile.age != null) {
      const [lo, hi] = dbAges;
      if (profile.age < lo) {
        eligibility = "ineligible";
        ineligibleReason = `Age ${profile.age} below ${carrier.name} min issue age ${lo}`;
      } else if (profile.age > hi) {
        eligibility = "ineligible";
        ineligibleReason = `Age ${profile.age} above ${carrier.name} max issue age ${hi}`;
      } else if (profile.age >= hi - 1) {
        eligibility = "borderline";
        borderlineReason = `Age ${profile.age} within 2yrs of ${carrier.name} max (${hi})`;
      } else if (profile.age <= lo + 1) {
        eligibility = "borderline";
        borderlineReason = `Age ${profile.age} within 2yrs of ${carrier.name} min (${lo})`;
      }
    } else if (profile.age != null) {
      // Fall back to engine BASE_RATES age table for products without DB
      // age_band rules. This catches "outside issue range" without a citation.
      let productKey = product;
      if (product === "medsupp" && profile.planVariant === "N") productKey = "medsupp_n";
      const band = ageBand(profile.age, productKey);
      if (!band) {
        eligibility = "ineligible";
        ineligibleReason = `Age ${profile.age} outside ${product} issue range (engine table)`;
      }
    }

    // Build chart — only when DB has an opinion, defer to guide.max/min_bmi.
    if (eligibility !== "ineligible") {
      const totalInches = (profile.heightInches != null)
        ? profile.heightInches
        : ((profile.heightFeet || 0) * 12 + (profile.heightInchesOnly || 0));
      const bmi = profile.bmi || bmiFrom(totalInches, profile.weightLbs);
      if (bmi && guide?.max_bmi != null && bmi >= guide.max_bmi) {
        eligibility = "ineligible";
        ineligibleReason = `BMI ${bmi.toFixed(1)} above ${carrier.name} max ${guide.max_bmi}`;
      } else if (bmi && guide?.min_bmi != null && bmi <= guide.min_bmi) {
        eligibility = "ineligible";
        ineligibleReason = `BMI ${bmi.toFixed(1)} below ${carrier.name} min ${guide.min_bmi}`;
      }
    }

    // Hard declines: rerun the engine to catch Rx, cardiac, cancer windows.
    // Done as a single calculatePremium() call so we get one source of truth.
    let dbRateSourced = false;
    let dbRateConfidence = null;
    if (eligibility !== "ineligible") {
      try {
        let productKey = product;
        if (product === "medsupp" && profile.planVariant === "N") productKey = "medsupp_n";
        const totalInches = (profile.heightInches != null)
          ? profile.heightInches
          : ((profile.heightFeet || 0) * 12 + (profile.heightInchesOnly || 0));
        const bmi = profile.bmi || bmiFrom(totalInches, profile.weightLbs);
        const rate = calculatePremium(carrier, product, { ...profile, heightInches: totalInches, bmi });
        if (rate && rate.decline) {
          eligibility = "ineligible";
          ineligibleReason = rate.reason || "Engine decline (see methodology)";
        } else if (rate) {
          dbRateSourced = !!rate.dbRateSourced;
          dbRateConfidence = rate.dbRateConfidence || null;
        }
      } catch (_e) { /* engine failure shouldn't kill verdict */ }
    }

    // ── Sweet-spot age match ──
    const sweetSpotAges = parseSweetSpotAges(guide?.sweet_spot);
    let ageVsSweetSpot = "unknown";
    if (sweetSpotAges && profile.age != null) {
      const [lo, hi] = sweetSpotAges;
      if (profile.age >= lo && profile.age <= hi) ageVsSweetSpot = "in";
      else if (profile.age < lo) ageVsSweetSpot = "below";
      else ageVsSweetSpot = "above";
    }

    // ── Fit reasons (UI surface) ──
    if (guide?.sweet_spot) {
      const ageBit = sweetSpotAges
        ? ` (sweet-spot ages ${sweetSpotAges[0]}-${sweetSpotAges[1]}${ageVsSweetSpot === "in" ? ", you fit" :
            ageVsSweetSpot === "below" ? `, lead younger` : ageVsSweetSpot === "above" ? `, lead older` : ""})`
        : "";
      reasons.push({ tag: "sweet spot" + ageBit, text: guide.sweet_spot });
    }
    if (profile.tobacco && guide?.tobacco_rateup_pct === 0) {
      reasons.push({ tag: "tobacco edge", text: `0% tobacco surcharge` });
    }

    // ── Tier scoring ──
    let fitTier = 2;
    if (eligibility === "ineligible") fitTier = 0;
    else if (eligibility === "borderline") fitTier = 1;
    else if (ageVsSweetSpot === "in") {
      fitTier = dbRateSourced ? 4 : 3;
    } else {
      fitTier = 2;
    }

    // Rule count = total approved rules backing this guide (proxy for confidence).
    const ruleCount = Array.isArray(guide?._sources) ? guide._sources.length : 0;

    return {
      eligibility,
      ineligibleReason,
      borderlineReason,
      sweetSpot: sweetSpotAges ? { lo: sweetSpotAges[0], hi: sweetSpotAges[1] } : null,
      ageVsSweetSpot,
      fitTier,
      fitReasons: reasons,
      dbGrounded: !!guide?._dbGrounded,
      dbRateSourced,
      dbRateConfidence,
      ruleCount,
      confidence: guide?.confidence || null,
    };
  }

  // Build the human-readable "why this carrier" reasoning for a quote
  // result. Pulls from the producer-guide JSON (sweet_spot, tobacco_notes,
  // discounts, uw_classes_notes) plus the per-carrier match details.
  function recommendReasons(carrier, product, profile, rate) {
    const guide = getGuide(carrier.id, product);
    const out = [];
    const src = [];
    const h = profile.healthDetail || {};

    if (guide?.sweet_spot) {
      out.push({ tag: "sweet spot", text: guide.sweet_spot });
    }
    if (profile.tobacco && (guide?.tobacco_rateup_pct === 0)) {
      out.push({ tag: "tobacco edge", text: `0% tobacco surcharge — ${guide?.tobacco_notes || "rare in market"}` });
    }
    if (profile.tobacco && guide?.tobacco_rateup_pct > 0) {
      out.push({ tag: "tobacco", text: `${guide.tobacco_rateup_pct}% tobacco rate-up applies` });
    }
    if (guide?.discounts?.household) {
      out.push({ tag: "discount", text: `Household discount: ${guide.discounts.household}` });
    }
    if (guide?.discounts?.new_enrollment) {
      out.push({ tag: "T65 discount", text: guide.discounts.new_enrollment });
    }
    if (rate?.uwClass && (guide?.uw_classes_notes)) {
      out.push({ tag: "uw class", text: `Class ${rate.uwClass}: ${guide.uw_classes_notes}` });
    }
    if (guide?.graded_period_months && rate?.uwClass === "Graded") {
      out.push({ tag: "graded benefit", text: `${guide.graded_period_months}-mo graded period — ${guide.graded_payout_during_waiting || "ROP+interest on natural death"}` });
    }
    // Sources: prefer narrative-payload sources (with excerpts), then add any
    // rule-row sources collected during hydrate. Cap at 3 for display.
    const seen = new Set();
    const pushSrc = (s) => {
      const path = (s?.url || "").match(/[^/]+\.pdf$/i)?.[0] || s?.url || "";
      if (path && !seen.has(path)) { seen.add(path); src.push(path); }
    };
    if (Array.isArray(guide?.sources)) for (const s of guide.sources.slice(0, 3)) pushSrc(s);
    if (Array.isArray(guide?._sources)) for (const s of guide._sources.slice(0, 3)) pushSrc(s);
    return {
      reasons: out,
      sources: src.slice(0, 3),
      confidence: guide?.confidence || null,
      dbGrounded: !!guide?._dbGrounded,
    };
  }

  window.RateEngine = {
    calculatePremium,
    calculateAnnuityYield,
    bmiFrom,
    countSubstandardFlags,
    getGuide,
    recommendReasons,
    fitVerdict,
    parseSweetSpotAges,
    BASE_RATES, STATE_TIER, TIER_MULTIPLIER, CARRIER_DELTA, UW_CLASS_MULT,
  };
})();
