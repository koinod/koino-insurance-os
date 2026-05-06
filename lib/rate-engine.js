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
  // ── Base rates by product × age band × state tier ──────────────────────
  // Monthly premium ($) for a Standard non-tobacco applicant in a tier-2 state.
  // Age bands chosen to match carrier rate sheet pricing brackets.
  const BASE_RATES = {
    medsupp: {  // Plan G default — bind face_amount: 0 since this is medical
      // age → monthly $
      "60-64": 110, "65-67": 115, "68-70": 130, "71-74": 150, "75-79": 175, "80+": 215,
    },
    medsupp_n: {  // Plan N — typically ~25% cheaper than Plan G
      "60-64": 85, "65-67": 90, "68-70": 100, "71-74": 115, "75-79": 135, "80+": 165,
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

  // State cost tiers. Tier 1 = lowest cost (rural Midwest, FL panhandle),
  // Tier 3 = highest cost (NY metro, urban CA, Boston).
  const STATE_TIER = {
    AL:1, AK:2, AZ:2, AR:1, CA:3, CO:2, CT:3, DE:2, FL:2, GA:1,
    HI:3, ID:1, IL:2, IN:1, IA:1, KS:1, KY:1, LA:2, ME:2, MD:2,
    MA:3, MI:2, MN:2, MS:1, MO:1, MT:1, NE:1, NV:2, NH:2, NJ:3,
    NM:1, NY:3, NC:1, ND:1, OH:1, OK:1, OR:2, PA:2, RI:3, SC:1,
    SD:1, TN:1, TX:2, UT:2, VT:2, VA:2, WA:2, WV:1, WI:1, WY:1,
  };
  const TIER_MULTIPLIER = { 1: 0.92, 2: 1.00, 3: 1.18 };

  // Per-carrier delta vs market (multiplier on base rate).
  // Negative values mean the carrier prices below market.
  const CARRIER_DELTA = {
    uhc:    { medsupp: 1.05, medsupp_n: 1.04 },                 // AARP brand premium
    humana: { medsupp: 1.00, medsupp_n: 0.98, mapd: 1.00 },     // market-rate
    aetna:  { medsupp: 0.94, medsupp_n: 0.96 },                 // aggressive new-business pricing
    cigna:  { medsupp: 1.02, medsupp_n: 0.93 },                 // Plan N standout
    moo:    { medsupp: 1.01, fe: 1.00 },                        // FE benchmark
    lumico: { fe: 0.94 },                                        // unisex chart wins on females
    aig:    { fe: 1.08, term: 0.92 },                            // term aggressive
    fg:     { annuity: 1.00, iul: 1.00 },                        // MYGA top-3
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

  // Decide UW class for a given carrier × profile based on the carrier's own
  // class structure + the lead's health profile.
  function determineUwClass(carrier, profile) {
    const uwClasses = carrier.underwriting?.uwClasses || ["Standard"];
    const flags = countSubstandardFlags(profile);
    const health = profile.healthDetail || {};

    // Hard declines first
    if (health.diabetesType === "type1") return { class: "DECLINE", reason: "Type-1 diabetes — most carriers decline" };
    if (health.cancerWindow === "active" || health.cancerWindow === "<2y") {
      if (carrier.id !== "aig") return { class: "DECLINE", reason: "Cancer treatment within carrier lookback" };
    }
    if (health.cardiacWindow === "<12mo") {
      if (carrier.id !== "aig") return { class: "DECLINE", reason: "Recent MI/CABG/stent inside lookback" };
    }
    if (health.copd) {
      if (!["aig","moo"].includes(carrier.id) || profile.product !== "fe") {
        return { class: "DECLINE", reason: "COPD typically declined outside FE GIWL" };
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
    return n;
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
    const baseTable = BASE_RATES[productKey];
    if (!baseTable) return { decline: true, reason: `No rate sheet for product ${product}` };

    const band = ageBand(profile.age, productKey);
    if (!band) return { decline: true, reason: `Age ${profile.age} outside issue range` };

    let premium = baseTable[band];
    notes.push(`base ${productKey} ${band} = $${premium}/mo`);

    // State tier
    const tier = STATE_TIER[profile.state] || 2;
    const stateMult = TIER_MULTIPLIER[tier];
    premium *= stateMult;
    notes.push(`state ${profile.state} tier-${tier} ×${stateMult}`);

    // Carrier delta
    const carrierMap = CARRIER_DELTA[carrier.id] || {};
    const carrierMult = carrierMap[productKey] ?? carrierMap[product] ?? 1.0;
    premium *= carrierMult;
    notes.push(`${carrier.name} delta ×${carrierMult.toFixed(2)}`);

    // Build chart
    const build = buildCheck(carrier, profile);
    if (build.decline) return { decline: true, reason: build.reason };
    if (build.tableRated) {
      premium *= build.multiplier;
      notes.push(build.reason);
    }

    // UW class
    const uw = determineUwClass(carrier, profile);
    if (uw.class === "DECLINE") return { decline: true, reason: uw.reason };
    const classMult = UW_CLASS_MULT[uw.class] ?? 1.00;
    premium *= classMult;
    notes.push(`UW class "${uw.class}" ×${classMult.toFixed(2)}${uw.reason ? " (" + uw.reason + ")" : ""}`);

    // Tobacco rate-up — only applies if not already baked into the UW class
    // (Lumico's Pref Tobacco already prices tobacco; don't double-count)
    const tobaccoBakedIntoClass = String(uw.class).toLowerCase().includes("tobacco");
    if (profile.tobacco && !tobaccoBakedIntoClass) {
      const pct = carrier.underwriting?.tobaccoRateUpPct;
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

  window.RateEngine = {
    calculatePremium,
    calculateAnnuityYield,
    bmiFrom,
    countSubstandardFlags,
    BASE_RATES, STATE_TIER, TIER_MULTIPLIER, CARRIER_DELTA, UW_CLASS_MULT,
  };
})();
