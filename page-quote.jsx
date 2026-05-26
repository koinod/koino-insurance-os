/* page-quote.jsx — Owner Quote Tool (real rate engine)
 *
 * Builds a detailed lead profile, runs it through window.RateEngine, and
 * returns dollar-denominated monthly premiums per appointed carrier with
 * UW class assignment + decline reasons. Every underwriting rule and
 * narrative bullet ("Best pick · per official underwriting") comes from
 * `public.product_underwriting_rules` (DB-only as of migration 0058).
 * The legacy `lib/carrier-underwriting.deprecated.json` is no longer read.
 *
 * Sections:
 *   1. Lead profile  — name + contact + state + age + height/weight (auto BMI)
 *   2. Health profile — tobacco, diabetes type, BP, cholesterol, COPD, sleep
 *                       apnea, cancer/cardiac lookback, plus auto-decline
 *                       trigger conditions (stroke, AFib, CHF, dialysis,
 *                       HIV, transplant, dementia, mental-health)
 *   3. Product       — Med Supp (Plan G/N) / FE / Term / IUL / MYGA
 *   4. Best Pick     — top-ranked carrier + WHY (cited from producer guide)
 *   5. Carrier match — full ranked list with declines + UW reasoning
 *   6. Saved quotes  — localStorage persistence, send + convert flow
 */

(function () {
  const { useState, useEffect, useMemo } = React;

  function loadQuotes() {
    try { return JSON.parse(localStorage.getItem("repflow:quotes") || "[]"); } catch { return []; }
  }
  function saveQuotes(quotes) {
    try { localStorage.setItem("repflow:quotes", JSON.stringify(quotes)); } catch {}
  }

  const STATE_OPTS = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY"
    .split(" ").map(s => ({ v: s, l: s }));

  const PRODUCT_LABELS = {
    medsupp: "Medicare Supplement",
    mapd:    "Medicare Advantage",
    fe:      "Final Expense",
    term:    "Term Life",
    iul:     "IUL",
    annuity: "Annuity (MYGA)",
  };

  function loadPresets() {
    try {
      const v = JSON.parse(localStorage.getItem("repflow:quote-presets") || "null");
      return Array.isArray(v) ? v : DEFAULT_PRESETS;
    } catch { return DEFAULT_PRESETS; }
  }
  function savePresetsLS(presets) {
    try { localStorage.setItem("repflow:quote-presets", JSON.stringify(presets)); } catch {}
  }

  const DEFAULT_PRESETS = [
    { id: "t65-clean",  label: "T65 · clean health",
      patch: { age: 65, tobacco: false, heightFeet: 5, heightInches: 7, weightLbs: 165,
               healthDetail: emptyHealth({ diabetesType: "none", bpHigh: "none" }), product: "medsupp" }},
    { id: "t65-tobac",  label: "T65 · tobacco user",
      patch: { age: 65, tobacco: true, heightFeet: 5, heightInches: 10, weightLbs: 180,
               healthDetail: emptyHealth({ diabetesType: "none", bpHigh: "controlled" }), product: "medsupp" }},
    { id: "70-typ2",    label: "70yo · type-2 diabetic",
      patch: { age: 70, tobacco: false, heightFeet: 5, heightInches: 5, weightLbs: 195,
               healthDetail: emptyHealth({ diabetesType: "type2_oral", bpHigh: "controlled", cholesterolHigh: true, sleepApnea: "cpap" }), product: "medsupp" }},
    { id: "fe-late60",  label: "FE · late-60s avg health",
      patch: { age: 68, tobacco: false, heightFeet: 5, heightInches: 6, weightLbs: 175,
               healthDetail: emptyHealth({ bpHigh: "controlled", cholesterolHigh: true }), product: "fe" }},
    { id: "fe-rated",   label: "FE · graded benefit case",
      patch: { age: 72, tobacco: true, heightFeet: 5, heightInches: 5, weightLbs: 220,
               healthDetail: emptyHealth({ diabetesType: "type2_insulin", bpHigh: "uncontrolled", cholesterolHigh: true, sleepApnea: "cpap", cancerWindow: "2-5y" }), product: "fe" }},
    { id: "annuity",    label: "Annuity · 50K rollover",
      patch: { age: 64, tobacco: false, heightFeet: 5, heightInches: 8, weightLbs: 175,
               healthDetail: emptyHealth(), product: "annuity" }},
  ];

  function emptyHealth(overrides) {
    return {
      diabetesType:    "none",
      a1c:             "",
      bpHigh:          "none",
      cholesterolHigh: false,
      sleepApnea:      "none",
      copd:            false,
      cancerWindow:    "none",
      cardiacWindow:   "none",
      strokeTia:       false,
      afib:            false,
      chf:             false,
      pacemaker:       false,
      dialysis:        false,
      oxygen:          false,
      hivAids:         false,
      organTransplant: false,
      dementia:        false,
      bipolarSchiz:    false,
      ...(overrides || {}),
    };
  }

  // Default lead profile shape
  const DEFAULT_PROFILE = {
    name: "", phone: "", email: "",
    state: "TX", age: 67, gender: "F",
    heightFeet: 5, heightInches: 5,
    weightLbs: 145,
    tobacco: false,
    prescriptions: [],
    healthDetail: emptyHealth(),
    product: "medsupp",
    planVariant: "G",
    face: 15000,
    premium: 50000,
  };

  // Friendly product → underwriting-guide key map
  const RX_SUGGESTIONS = [
    "metformin", "lisinopril", "atorvastatin", "amlodipine", "metoprolol",
    "levothyroxine", "omeprazole", "albuterol", "warfarin", "eliquis",
    "insulin", "trulicity", "ozempic", "plavix", "humira", "prednisone",
  ];

  // ── Group health flags into UI sections ────────────────────────────────
  // Each section renders as a flex-wrap row of toggle chips inside the
  // health panel. Conditions split by impact bucket so reps can scan fast.
  const AUTO_DECLINE_CHIPS = [
    { k: "strokeTia",       l: "Stroke / TIA" },
    { k: "afib",            l: "AFib" },
    { k: "chf",             l: "CHF / cardiomyopathy" },
    { k: "pacemaker",       l: "Pacemaker" },
    { k: "dialysis",        l: "Dialysis / ESRD" },
    { k: "oxygen",          l: "Home oxygen" },
    { k: "hivAids",         l: "HIV / AIDS" },
    { k: "organTransplant", l: "Organ transplant" },
    { k: "dementia",        l: "Alzheimer's / dementia" },
    { k: "bipolarSchiz",    l: "Bipolar / schizophrenia" },
  ];
  const SECONDARY_CHIPS = [
    { k: "cholesterolHigh", l: "High cholesterol" },
    { k: "copd",            l: "COPD" },
  ];

  function PageQuote({ role = "owner" }) {
    const [profile, setProfile] = useState(DEFAULT_PROFILE);
    const [quotes,  setQuotes]  = useState(loadQuotes);
    const [presets, setPresets] = useState(loadPresets);
    const [presetsEdit, setPresetsEdit] = useState(false);

    // Re-render whenever CARRIERS, CARRIER_NICHES or the carrier UW guide
    // JSON finishes loading.
    const [, force] = useState(0);
    useEffect(() => {
      const h = () => force(n => n + 1);
      window.addEventListener("data:hydrated", h);
      window.addEventListener("data:mutated", h);
      window.addEventListener("carrier-uw:loaded", h);
      return () => {
        window.removeEventListener("data:hydrated", h);
        window.removeEventListener("data:mutated", h);
        window.removeEventListener("carrier-uw:loaded", h);
      };
    }, []);

    // Carrier selection — null means "all appointed carriers for this product"
    const [selectedCarrierIds, setSelectedCarrierIds] = useState(null);
    // Agent request tracking
    const [agentReqId, setAgentReqId]     = useState(null);
    const [agentResults, setAgentResults] = useState({});
    // idle | queued | running | done
    const [agentRunStatus, setAgentRunStatus] = useState("idle");

    // Poll auto_quote_results for the active agent request
    useEffect(() => {
      if (!agentReqId) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !window.AppData?.LIVE) return;
      let cancelled = false;
      const poll = async () => {
        try {
          const { data } = await sb
            .from("auto_quote_results")
            .select("*")
            .eq("request_id", agentReqId);
          if (cancelled || !data) return;
          const map = {};
          data.forEach(r => { map[r.carrier_id] = r; });
          setAgentResults(map);
          if (data.length > 0 &&
              data.every(r => ["ok","decline","error","no_creds","no_scraper"].includes(r.status))) {
            setAgentRunStatus("done");
          }
        } catch (e) { console.warn("[quote.agentRunPoll]", e); }
      };
      setAgentRunStatus("running");
      poll();
      const iv = setInterval(poll, 3000);
      return () => { cancelled = true; clearInterval(iv); };
    }, [agentReqId]);

    const set = (patch) => setProfile(p => ({ ...p, ...patch }));
    const setHealth = (patch) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, ...patch } }));

    const niches = window.CARRIER_NICHES || [];

    // Filter to agency-appointed carriers.
    //
    // The gate is now `agency_carrier_appointments.status IN (self|bridge|active)`,
    // surfaced via window.AppData.AGENCY_APPOINTMENTS (loaded by data.jsx,
    // RLS-scoped to the viewer's agency). Migration 0069c adds the public
    // view v_agency_writable_carriers + RPC my_writable_carriers() that this
    // mirrors server-side — keep them in sync.
    //
    // Carrier-id normalization: agency_carrier_appointments stores either
    // short ids (Atlas legacy: aetna/uhc/moo) or long catalog ids (new UI:
    // aetna_src/uhc_aarp/mutual_omaha). Both must resolve to the same short
    // niche id used by CARRIER_NICHES.
    const LONG_TO_SHORT = {
      uhc_aarp: "uhc", mutual_omaha: "moo", aetna_src: "aetna",
    };
    const normalizeNicheId = (raw) => {
      const id = String(raw || "").toLowerCase();
      return LONG_TO_SHORT[id] || id;
    };

    const appointedIds = useMemo(() => {
      const appts = window.AppData?.AGENCY_APPOINTMENTS || [];
      // No data hydrated yet → return null = "filter not ready, show all"
      // (avoids a flash of empty state on initial paint).
      if (!Array.isArray(appts)) return null;
      // 'pending' counts as writable too — migration 0069e backfills every
      // (agency × catalog carrier) row as 'pending' by default so all
      // agencies see the full catalog out of the box. Managers explicitly
      // mark rows 'not_pursuing' to hide. 'self' / 'bridge' / 'active' carry
      // appointment semantics, but for *visibility* the only excluded state
      // is 'not_pursuing'.
      const writable = appts.filter(a =>
        ["self", "bridge", "active", "pending"].includes(String(a.status || "").toLowerCase())
      );
      // Hydrated but empty → return empty Set so the empty-state CTA
      // renders. Distinct from "not ready yet" above.
      const ids = new Set(writable.map(a => normalizeNicheId(a.carrierId)));
      return ids;
    }, [window.AppData?.AGENCY_APPOINTMENTS?.length]);

    // Carriers eligible for this product after appointment filter — drives checkboxes
    const eligibleForProduct = useMemo(() => {
      const eligible = niches.filter(c => c.products.includes(profile.product));
      return appointedIds === null ? eligible : eligible.filter(c => appointedIds.has(c.id));
    }, [profile.product, niches.length, appointedIds]);

    const toggleCarrierSelection = (carrierId) => {
      setSelectedCarrierIds(prev => {
        const base = prev || new Set(eligibleForProduct.map(c => c.id));
        const next = new Set(base);
        next.has(carrierId) ? next.delete(carrierId) : next.add(carrierId);
        return next.size === eligibleForProduct.length ? null : next;
      });
    };

    const runQuoteAgent = async () => {
      const toRun = quoteResults.quoted.map(r => r.carrier.id);
      if (toRun.length === 0) {
        window.toast && window.toast("No quoted carriers to run agent against", "warn");
        return;
      }
      const sb = window.getSupabase && window.getSupabase();
      const me = window.me && window.me();
      if (!sb || !me?.rep_id || !window.AppData?.LIVE) {
        window.toast && window.toast(
          window.AppData?.LIVE
            ? "Not signed in — connect to Supabase to dispatch the agent"
            : "Demo mode — agent request row still inserted when you go live",
          "warn"
        );
        return;
      }
      try {
        setAgentRunStatus("queued");
        setAgentResults({});
        const { data, error } = await sb.from("auto_quote_requests").insert({
          rep_id: me.rep_id,
          profile: profileForEngine,
          carriers: toRun,
          status: "queued",
          request_type: "quote",
        }).select("id").single();
        if (error) throw error;
        setAgentReqId(data.id);
        // Analytics: capture for PostHog funnel (lead → quote → deal).
        try {
          window.posthog && window.posthog.capture && window.posthog.capture("quote_run", {
            request_id:    data.id,
            carrier_count: toRun.length,
            carriers:      toRun,
            product:       profileForEngine?.product || null,
            state:         profileForEngine?.state || null,
            age:           profileForEngine?.age || null,
            bmi:           bmi || null,
            request_type:  "quote",
          });
        } catch (_e) { /* analytics never blocks the request */ }
        window.toast && window.toast(
          `Live rates requested · ${toRun.length} carrier${toRun.length === 1 ? "" : "s"} · results stream in as the agent finishes each portal`,
          "info"
        );
      } catch (e) {
        setAgentRunStatus("idle");
        window.toast && window.toast("Queue failed: " + (e.message || e), "error");
      }
    };

    const totalInches = (profile.heightFeet || 0) * 12 + (profile.heightInches || 0);
    const bmi = window.RateEngine?.bmiFrom?.(totalInches, profile.weightLbs);
    const profileForEngine = { ...profile, heightInches: totalInches, bmi };

    // Subscribe to the rate-engine's UW grounding status so the footer +
    // header indicator update live when the DB hydrate completes.
    // MUST be declared above the quoteResults useMemo below — that useMemo's
    // dep array references groundingTick. Moved up to avoid the TDZ
    // ReferenceError ("Cannot access 'groundingTick' before initialization").
    const [groundingTick, setGroundingTick] = useState(0);
    useEffect(() => {
      const fn = () => setGroundingTick(n => n + 1);
      window.addEventListener("carrier-uw:loaded", fn);
      return () => window.removeEventListener("carrier-uw:loaded", fn);
    }, []);

    // Run rate engine across appointed + user-selected carriers for this product.
    //
    // RANKING MODEL (reworked 2026-05-24):
    // Sort by FIT QUALITY, not by $/mo. The engine's $/mo number is only
    // DB-grounded for ~5 carriers × 2 plans × 3-4 states (see UW_GROUNDING.
    // rate_tables_loaded). Everywhere else it's a heuristic. So we lead with
    // eligibility + sweet-spot match (DB-cited narrative), and present the
    // dollar number as a de-emphasized secondary signal labeled as either
    // "DB rate" (authoritative) or "engine estimate" (~approximate).
    const quoteResults = useMemo(() => {
      if (!window.RateEngine) return { quoted: [], borderline: [], ineligible: [], all: [] };
      const productKey = profile.product;
      const eligible = niches.filter(c => c.products.includes(productKey));
      const appointed = appointedIds === null ? eligible : eligible.filter(c => appointedIds.has(c.id));
      // User-narrowed selection — null means all appointed
      const filtered = selectedCarrierIds === null
        ? appointed
        : appointed.filter(c => selectedCarrierIds.has(c.id));

      const results = filtered.map(carrier => {
        // Run fit verdict (eligibility + sweet-spot + tier scoring).
        const verdict = window.RateEngine.fitVerdict?.(carrier, productKey, profileForEngine)
          || { eligibility: "eligible", fitTier: 2, fitReasons: [], dbGrounded: false, dbRateSourced: false, ruleCount: 0 };

        if (productKey === "annuity") {
          const ann = window.RateEngine.calculateAnnuityYield(carrier, profileForEngine);
          if (!ann) return { carrier, verdict: { ...verdict, eligibility: "ineligible", ineligibleReason: "Annuity not offered by this carrier" } };
          return {
            carrier,
            verdict,
            annuity: ann,
            premium: null,
            uwClass: null,
            methodology: ann.methodology,
            displayValue: `${ann.apy}% APY · 5yr`,
            displaySub: `$${ann.accumulated.toLocaleString()} at maturity (gain $${ann.gain.toLocaleString()})`,
            dbRateSourced: false,
          };
        }

        const rate = window.RateEngine.calculatePremium(carrier, productKey, profileForEngine);
        if (rate.decline) {
          // Decline from the engine — pin the verdict to ineligible with
          // the engine reason if the verdict didn't already flag it.
          return {
            carrier,
            verdict: {
              ...verdict,
              eligibility: "ineligible",
              ineligibleReason: verdict.ineligibleReason || rate.reason,
              fitTier: 0,
            },
            decline: true,
            reason: rate.reason,
            source: rate.source,
          };
        }
        const reco = window.RateEngine.recommendReasons?.(carrier, productKey, profileForEngine, rate) || { reasons: [], sources: [], dbGrounded: false };
        return {
          carrier,
          verdict,
          premium: rate.premium,
          uwClass: rate.uwClass,
          methodology: rate.methodology,
          // displayValue is now PRICE-SECONDARY: see the JSX renderer for the
          // DB-vs-estimate typography split. Keep the legacy field for the
          // saved-quote write path + the SMS composer.
          displayValue: `$${rate.premium}/mo`,
          displaySub: rate.uwClass,
          reasons: reco.reasons,
          sources: reco.sources,
          confidence: reco.confidence,
          dbGrounded: !!reco.dbGrounded,
          dbRateSourced: !!rate.dbRateSourced,
          dbRateConfidence: rate.dbRateConfidence || null,
          dbRateNotes: rate.dbRateNotes || null,
        };
      });

      // Annuity stays priced-sorted because the APY IS the comparison signal.
      if (productKey === "annuity") {
        const quoted   = results.filter(r => r.verdict.eligibility !== "ineligible").sort((a, b) => (b.annuity?.apy || 0) - (a.annuity?.apy || 0));
        const ineligible = results.filter(r => r.verdict.eligibility === "ineligible");
        return { quoted, borderline: [], ineligible, all: results };
      }

      // Sort by fit-tier DESC, then rule-count DESC (more rules = more
      // confidence the verdict is real), then $/mo ASC as a tiebreaker.
      const sortByFit = (a, b) => {
        const ta = a.verdict?.fitTier ?? 0;
        const tb = b.verdict?.fitTier ?? 0;
        if (tb !== ta) return tb - ta;
        const ra = a.verdict?.ruleCount ?? 0;
        const rb = b.verdict?.ruleCount ?? 0;
        if (rb !== ra) return rb - ra;
        return (a.premium || 99999) - (b.premium || 99999);
      };
      const quoted     = results.filter(r => r.verdict.eligibility === "eligible").sort(sortByFit);
      const borderline = results.filter(r => r.verdict.eligibility === "borderline").sort(sortByFit);
      const ineligible = results.filter(r => r.verdict.eligibility === "ineligible");
      return { quoted, borderline, ineligible, all: results };
    }, [JSON.stringify(profileForEngine), niches.length, appointedIds, groundingTick,
        selectedCarrierIds === null ? "" : [...selectedCarrierIds].sort().join(",")]);

    // Best pick: top of the fit-ranked list. For DOLLAR display we only call
    // it "BEST FIT" if it scored fitTier >= 3 (eligible + sweet-spot in-range).
    // Otherwise it's just "Top eligible" — i.e. "we couldn't find a strong
    // match; this is the carrier least likely to bounce you."
    const best = quoteResults.quoted[0];
    const runnerUp = quoteResults.quoted[1];
    const bestIsStrongFit = (best?.verdict?.fitTier ?? 0) >= 3;

    const applyPreset = (p) => {
      setProfile(prev => ({ ...prev, ...p.patch }));
      window.toast && window.toast(`Loaded preset: ${p.label}`, "info");
    };

    const savePresetFromProfile = () => {
      const label = (window.prompt("Preset name?", "") || "").trim();
      if (!label) return;
      const { name, phone, email, ...patch } = profile;
      const next = [...presets, { id: "p-" + Date.now(), label, patch }];
      setPresets(next); savePresetsLS(next);
      window.toast && window.toast(`Preset saved: ${label}`, "success");
    };
    const deletePreset = (id) => {
      const next = presets.filter(p => p.id !== id);
      setPresets(next); savePresetsLS(next);
    };
    const renamePreset = (p) => {
      const label = (window.prompt("Rename preset:", p.label) || "").trim();
      if (!label || label === p.label) return;
      const next = presets.map(x => x.id === p.id ? { ...x, label } : x);
      setPresets(next); savePresetsLS(next);
    };
    const overwritePreset = (p) => {
      if (!window.confirm(`Overwrite "${p.label}" with current profile?`)) return;
      const { name, phone, email, ...patch } = profile;
      const next = presets.map(x => x.id === p.id ? { ...x, patch } : x);
      setPresets(next); savePresetsLS(next);
      window.toast && window.toast(`Preset updated: ${p.label}`, "success");
    };
    const resetPresets = () => {
      if (!window.confirm("Reset presets to defaults? Custom presets will be lost.")) return;
      setPresets(DEFAULT_PRESETS); savePresetsLS(DEFAULT_PRESETS);
    };

    const saveQuote = () => {
      const q = {
        id: "q-" + Date.now(),
        savedAt: new Date().toISOString(),
        profile: { ...profileForEngine },
        ranked: quoteResults.quoted.slice(0, 5).map(r => ({
          id: r.carrier.id, name: r.carrier.name, premium: r.premium, uwClass: r.uwClass, displayValue: r.displayValue,
        })),
        bestReasons: best?.reasons || [],
        bestSources: best?.sources || [],
        status: "draft",
        sentTo: null,
      };
      const next = [q, ...quotes];
      setQuotes(next); saveQuotes(next);
      window.toast && window.toast(`Quote saved · best: ${best?.carrier.name || "no match"}`, "success");
    };

    // Compose a short SMS-style body summarising the best pick. Stays
    // under ~320 chars so it lands as one or two segments without
    // truncation. Format: greeting + carrier · premium · class · CTA.
    const composeQuoteMessage = (q) => {
      const best = (q.ranked || [])[0];
      const leadFirst = (q.profile?.name || "").split(" ")[0] || "there";
      const productLabel = PRODUCT_LABELS[q.profile?.product] || q.profile?.product || "your coverage";
      const meIdent = (window.me && window.me()) || {};
      const repFirst = (meIdent.full_name || meIdent.name || "").split(" ")[0] || "your producer";
      if (!best) {
        return `Hi ${leadFirst}, here's a quick note from ${repFirst} on your ${productLabel} — give me a call to walk through the carrier options.`;
      }
      const price = best.displayValue || (best.premium ? `$${best.premium}/mo` : "—");
      const klass = best.uwClass ? ` (${best.uwClass})` : "";
      return `Hi ${leadFirst}, it's ${repFirst}. Pulled your ${productLabel}: best fit is ${best.name} at ${price}${klass}. Reply YES to lock it in or call me with questions.`;
    };

    const sendQuote = async (q) => {
      const phone = (q.profile.phone || "").trim();
      const email = (q.profile.email || "").trim();
      const channel = phone ? "SMS" : email ? "email" : null;
      if (!channel) {
        window.toast && window.toast("Add a phone or email to the lead before sending", "warn");
        return;
      }
      const messageBody = composeQuoteMessage(q);
      const meIdent = (window.me && window.me()) || {};

      // Optimistic UI: mark sending. Revert if the network fails.
      const markStatus = (status, extra = {}) => {
        const next = quotes.map(x => x.id === q.id ? { ...x, status, ...extra } : x);
        setQuotes(next); saveQuotes(next);
      };
      markStatus("sending");

      if (channel === "SMS") {
        try {
          const r = await fetch("/api/twilio-sms", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              to: phone,
              body: messageBody,
              agency_id: meIdent.agency_id || null,
              rep_id:    meIdent.rep_id    || null,
              source:    "quote_send",
              lead_id:   q.profile?.lead_id || null,
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok && r.status !== 202) {
            markStatus("draft", { sentTo: null });
            window.toast && window.toast(`SMS send failed: ${j.error || r.status}`, "error");
            return;
          }
          // 200 (Twilio) or 202 (local-agent outbox) both count as sent
          markStatus("sent", { sentTo: "SMS", sentAt: new Date().toISOString(), deliveryDetail: j.delivery || (j.sid ? "twilio" : "queued") });
          window.toast && window.toast(
            `Quote sent via SMS to ${q.profile.name || phone}` + (j.delivery === "local_agent" ? " (queued to local agent)" : ""),
            "success"
          );
        } catch (e) {
          markStatus("draft", { sentTo: null });
          window.toast && window.toast("SMS network error: " + (e.message || e), "error");
        }
        return;
      }

      // Email channel — no server endpoint wired yet, so open the rep's
      // default mail client pre-filled. Reliable on every device, no
      // creds needed, and the rep can edit before sending.
      try {
        const subject = `Your ${PRODUCT_LABELS[q.profile?.product] || "insurance"} quote`;
        const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`;
        window.open(href, "_blank");
        markStatus("sent", { sentTo: "email", sentAt: new Date().toISOString(), deliveryDetail: "mailto_handoff" });
        window.toast && window.toast(`Email draft opened for ${q.profile.name || email}`, "success");
      } catch (e) {
        markStatus("draft", { sentTo: null });
        window.toast && window.toast("Email handoff failed: " + (e.message || e), "error");
      }
    };

    const markConverted = (q) => {
      const next = quotes.map(x => x.id === q.id ? { ...x, status: "converted" } : x);
      setQuotes(next); saveQuotes(next);
      window.toast && window.toast("Marked converted — feeds carrier-mix analytics", "success");
    };

    /** Hand off a quote to the deal-write form: stash carrier + annualized AP
     *  + lead contact in sessionStorage, flip Floor into Deals mode, navigate.
     *  Rep still picks product + comp%. Closes the quote→deal retype gap. */
    const writeDealFromQuote = (q) => {
      const best = (q.ranked || [])[0];
      if (!best) {
        window.toast && window.toast("No carrier ranked yet — re-run the quote first", "warn");
        return;
      }
      const monthly = Number(best.premium) || 0;
      const annual  = monthly > 0 ? Math.round(monthly * 12) : "";
      const nameParts = String(q.profile?.name || "").trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || "";
      const lastName  = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
      const prefill = {
        source: "quote",
        carrierId: best.id || "",
        ap: annual,
        newLead: {
          firstName,
          lastName,
          state: q.profile?.state || "",
          phone: q.profile?.phone || "",
          email: q.profile?.email || "",
        },
      };
      try {
        sessionStorage.setItem("repflow.dealwrite.prefill", JSON.stringify(prefill));
        sessionStorage.setItem("repflow.floor.mode", "deals");
      } catch {}
      // Mark the quote converted locally too, so the carrier-mix funnel stays accurate.
      const next = quotes.map(x => x.id === q.id ? { ...x, status: "converted" } : x);
      setQuotes(next); saveQuotes(next);
      setTimeout(() => { window.gotoPage && window.gotoPage("floor"); }, 30);
    };

    const deleteQuote = (q) => {
      setQuotes(prev => {
        const next = prev.filter(x => x.id !== q.id);
        saveQuotes(next); return next;
      });
    };

    const conversionRate = quotes.length === 0 ? null
      : Math.round((quotes.filter(q => q.status === "converted").length / quotes.length) * 100);

    const heightDisplay = `${profile.heightFeet}'${profile.heightInches}"`;
    const totalAppointed = niches.filter(c => c.products.includes(profile.product))
      .filter(c => appointedIds === null || appointedIds.has(c.id))?.length;

    // (groundingTick state + listener declared earlier — above quoteResults
    // useMemo — so the dep array can reference it without hitting TDZ.)
    const grounding = window.UW_GROUNDING || { status: "loading", carriers: 0, products: 0, rules: 0 };

    // Recent live-rate runs (last 5 RBA sessions for this rep). Surfaces
    // historical agent dispatches inline so the rep can flip back to a
    // 10-min-old result without leaving the Quote tab. Folds the former
    // /auto-quoter page into Quote tool — credentials + install screens
    // still live under Admin → Auto-Quoter.
    const [recentRuns, setRecentRuns] = useState([]);
    useEffect(() => {
      const sb = window.getSupabase && window.getSupabase();
      const meIdent = window.me && window.me();
      if (!sb || !meIdent?.rep_id || !window.AppData?.LIVE) return;
      let cancelled = false;
      const fetchRuns = async () => {
        try {
          const { data } = await sb
            .from("auto_quote_requests")
            .select("id, profile, status, created_at, auto_quote_results(status, carrier_id, premium_cents)")
            .eq("rep_id", meIdent.rep_id)
            .order("created_at", { ascending: false })
            .limit(5);
          if (!cancelled) setRecentRuns(data || []);
        } catch (_) {}
      };
      fetchRuns();
      const iv = setInterval(fetchRuns, 8000);
      return () => { cancelled = true; clearInterval(iv); };
    }, [agentReqId, agentRunStatus]);

    const loadRunIntoProfile = (run) => {
      if (!run?.profile) return;
      setProfile(p => ({ ...p, ...run.profile }));
      window.toast && window.toast("Profile loaded from prior live-rates run", "info");
    };

    const timeAgo = (iso) => {
      if (!iso) return "—";
      const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 60)    return `${s}s ago`;
      if (s < 3600)  return `${Math.round(s / 60)}m ago`;
      if (s < 86400) return `${Math.round(s / 3600)}h ago`;
      return `${Math.round(s / 86400)}d ago`;
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Quote Tool</div>
            <div className="page-sub">
              Real-rate engine · {totalAppointed} appointed carrier{totalAppointed === 1 ? "" : "s"} for {PRODUCT_LABELS[profile.product]} ·
              {appointedIds === null ? " (demo: all carriers shown)" : ` filtered to your appointments`}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {grounding.status === "ready" && (
                <>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "1px 7px", borderRadius: 10, fontSize: 10.5, fontWeight: 600,
                    background: "color-mix(in oklch, var(--accent-money) 12%, transparent)",
                    color: "var(--accent-money)",
                    border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)",
                  }}>● DB-grounded</span>
                  <span>{grounding.carriers} carrier{grounding.carriers === 1 ? "" : "s"} · {grounding.products} product{grounding.products === 1 ? "" : "s"} · {grounding.rules} approved rule{grounding.rules === 1 ? "" : "s"} loaded from <code style={{ fontSize: 10 }}>product_underwriting_rules</code></span>
                </>
              )}
              {grounding.status === "loading" && (
                <span>Loading underwriting rules from database…</span>
              )}
              {grounding.status === "empty" && (
                <span style={{ color: "var(--state-warning)" }}>⚠ Underwriting DB is empty — recommendations are roster-only until rules are approved.</span>
              )}
              {grounding.status === "error" && (
                <span style={{ color: "var(--state-danger)" }}>⚠ Underwriting DB unreachable: {grounding.error || "unknown error"}. Verify by manual producer-guide check before binding.</span>
              )}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "resources" } }))}>
              <Icons.Folder size={13}/> Carrier appointments
            </button>
            <button className="btn btn-primary" onClick={saveQuote} disabled={quoteResults.quoted.length === 0}>
              <Icons.Plus size={13}/> Save quote
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="kpi-row">
          <Shared.KpiCard label="Quotes saved" value={quotes.length}/>
          <Shared.KpiCard label="Quotes sent"  value={quotes.filter(q => q.status === "sent" || q.status === "converted").length} sub="via SMS/email"/>
          <Shared.KpiCard label="Conversion"   value={conversionRate === null ? "—" : `${conversionRate}%`} sub="quoted → policy"/>
          <Shared.KpiCard
            label={bestIsStrongFit ? "Best fit" : "Top eligible"}
            value={best ? (best.dbRateSourced ? best.displayValue : `~${best.displayValue || "—"}`) : "—"}
            sub={best ? `${best.carrier.name}${best.dbRateSourced ? "" : " · engine estimate"}` : "no match"}
            trend={quoteResults.quoted.length > 0 ? "up" : undefined}/>
        </div>

        {/* Presets */}
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-h">
            <Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/>
            <h3>Quick presets</h3>
            <span className="meta">
              {presetsEdit ? "click name to rename · ↻ to overwrite · × to delete" : "click to load"}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px" }}
                      onClick={savePresetFromProfile} title="Save current profile as a new preset">
                <Icons.Plus size={11}/> Save current
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px" }}
                      onClick={() => setPresetsEdit(v => !v)}>
                {presetsEdit ? "Done" : "Edit"}
              </button>
              {presetsEdit && (
                <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "2px 8px", color: "var(--text-dim)" }}
                        onClick={resetPresets} title="Reset to default presets">
                  Reset
                </button>
              )}
            </div>
          </div>
          <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.length === 0 && (
              <span className="meta" style={{ fontSize: 11, padding: "4px 2px" }}>
                No presets — click "Save current" to capture this profile.
              </span>
            )}
            {presets.map(p => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <button className="btn btn-ghost" style={{ fontSize: 11.5 }}
                        onClick={() => presetsEdit ? renamePreset(p) : applyPreset(p)}
                        title={presetsEdit ? "Click to rename" : "Click to load"}>
                  {p.label}
                </button>
                {presetsEdit && (
                  <>
                    <button className="btn btn-ghost"
                            style={{ fontSize: 11, padding: "2px 6px" }}
                            onClick={() => overwritePreset(p)}
                            title="Overwrite with current profile">↻</button>
                    <button className="btn btn-ghost"
                            style={{ fontSize: 12, padding: "2px 6px", color: "var(--accent-danger, #ef4444)" }}
                            onClick={() => deletePreset(p.id)}
                            title="Delete preset">×</button>
                  </>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Two-column: profile + ranked quotes — auto-fit wraps on narrow */}
        <div className="quote-grid" style={{ marginTop: 14 }}>
          {/* LEFT — Profile */}
          <div className="panel" style={{ containerType: "inline-size" }}>
            <div className="panel-h"><Icons.Users size={13}/><h3>Lead profile</h3></div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Contact + state */}
              <div className="quote-fields">
                <Shared.Field label="Lead name">
                  <input className="text-input" value={profile.name} onChange={(e) => set({ name: e.target.value })} placeholder="Cheryl Hampton"/>
                </Shared.Field>
                <Shared.Field label="State">
                  <Shared.Select value={profile.state} onChange={(v) => set({ state: v })} options={STATE_OPTS}/>
                </Shared.Field>
                <Shared.Field label="Phone">
                  <input className="text-input" value={profile.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(512) 555-0142"/>
                </Shared.Field>
                <Shared.Field label="Email">
                  <input className="text-input" value={profile.email} onChange={(e) => set({ email: e.target.value })} placeholder="lead@example.com"/>
                </Shared.Field>
              </div>

              <div className="divider"></div>

              {/* Demographics + build */}
              <div className="quote-fields quote-fields--narrow">
                <Shared.Field label="Age">
                  <input className="text-input" type="number" value={profile.age} onChange={(e) => set({ age: +e.target.value })}/>
                </Shared.Field>
                <Shared.Field label="Gender">
                  <Shared.Select value={profile.gender} onChange={(v) => set({ gender: v })} options={[{ v: "F", l: "Female" }, { v: "M", l: "Male" }]}/>
                </Shared.Field>
                <Shared.Field label="Height ft">
                  <input className="text-input" type="number" min="3" max="7" value={profile.heightFeet} onChange={(e) => set({ heightFeet: +e.target.value })}/>
                </Shared.Field>
                <Shared.Field label={`Height in · ${heightDisplay}`}>
                  <input className="text-input" type="number" min="0" max="11" value={profile.heightInches} onChange={(e) => set({ heightInches: +e.target.value })}/>
                </Shared.Field>
                <Shared.Field label={`Weight · BMI ${bmi ? bmi.toFixed(1) : "—"}`}>
                  <input className="text-input" type="number" value={profile.weightLbs} onChange={(e) => set({ weightLbs: +e.target.value })}/>
                </Shared.Field>
              </div>

              {/* Product + variant */}
              <div className="quote-fields">
                <Shared.Field label="Product">
                  <Shared.Select value={profile.product} onChange={(v) => set({ product: v })} options={Object.entries(PRODUCT_LABELS).map(([v, l]) => ({ v, l }))}/>
                </Shared.Field>
                {profile.product === "medsupp" && (
                  <Shared.Field label="Plan">
                    <Shared.Select value={profile.planVariant} onChange={(v) => set({ planVariant: v })} options={[{ v: "G", l: "Plan G" }, { v: "N", l: "Plan N" }]}/>
                  </Shared.Field>
                )}
                {(profile.product === "fe" || profile.product === "term" || profile.product === "iul") && (
                  <Shared.Field label="Face amount ($)">
                    <input className="text-input" type="number" value={profile.face} onChange={(e) => set({ face: +e.target.value })}/>
                  </Shared.Field>
                )}
                {profile.product === "annuity" && (
                  <Shared.Field label="Premium ($)">
                    <input className="text-input" type="number" value={profile.premium} onChange={(e) => set({ premium: +e.target.value })}/>
                  </Shared.Field>
                )}
              </div>

              <div className="divider"></div>

              {/* Health profile heading */}
              <div className="field-l" style={{ fontWeight: 600 }}>Health profile</div>

              {/* Tobacco / Diabetes / BP / Sleep apnea / lookbacks */}
              <div className="quote-fields">
                <Shared.Field label="Tobacco">
                  <Shared.Select value={profile.tobacco ? "yes" : "no"} onChange={(v) => set({ tobacco: v === "yes" })}
                    options={[{ v: "no", l: "Non-tobacco" }, { v: "yes", l: "Tobacco user" }]}/>
                </Shared.Field>
                <Shared.Field label="Diabetes">
                  <Shared.Select value={profile.healthDetail.diabetesType} onChange={(v) => setHealth({ diabetesType: v })}
                    options={[
                      { v: "none",            l: "None" },
                      { v: "type2_oral",      l: "Type 2 · oral meds" },
                      { v: "type2_insulin",   l: "Type 2 · insulin" },
                      { v: "type1",           l: "Type 1" },
                    ]}/>
                </Shared.Field>
                {profile.healthDetail.diabetesType !== "none" && (
                  <Shared.Field label="A1C (optional)" hint="if known — carriers care above 9">
                    <input className="text-input" type="number" step="0.1" placeholder="e.g. 7.2"
                      value={profile.healthDetail.a1c || ""}
                      onChange={(e) => setHealth({ a1c: e.target.value })}/>
                  </Shared.Field>
                )}
                <Shared.Field label="High blood pressure">
                  <Shared.Select value={profile.healthDetail.bpHigh} onChange={(v) => setHealth({ bpHigh: v })}
                    options={[
                      { v: "none",          l: "None" },
                      { v: "controlled",    l: "Controlled · meds" },
                      { v: "uncontrolled",  l: "Uncontrolled" },
                    ]}/>
                </Shared.Field>
                <Shared.Field label="Sleep apnea">
                  <Shared.Select value={profile.healthDetail.sleepApnea} onChange={(v) => setHealth({ sleepApnea: v })}
                    options={[
                      { v: "none",        l: "None" },
                      { v: "cpap",        l: "CPAP-treated" },
                      { v: "untreated",   l: "Untreated" },
                    ]}/>
                </Shared.Field>
                <Shared.Field label="Cancer history">
                  <Shared.Select value={profile.healthDetail.cancerWindow} onChange={(v) => setHealth({ cancerWindow: v })}
                    options={[
                      { v: "none",     l: "None" },
                      { v: "5y+",      l: "Clean 5+ years" },
                      { v: "2-5y",     l: "2–5 years ago" },
                      { v: "<2y",      l: "< 2 years ago" },
                      { v: "active",   l: "Active treatment" },
                    ]}/>
                </Shared.Field>
                <Shared.Field label="Cardiac event">
                  <Shared.Select value={profile.healthDetail.cardiacWindow} onChange={(v) => setHealth({ cardiacWindow: v })}
                    options={[
                      { v: "none",      l: "None" },
                      { v: ">24mo",     l: "> 24 months ago" },
                      { v: "12-24mo",   l: "12–24 months ago" },
                      { v: "<12mo",     l: "< 12 months ago" },
                    ]}/>
                </Shared.Field>
              </div>

              {/* Common quick toggles */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SECONDARY_CHIPS.map(t => {
                  const v = profile.healthDetail[t.k];
                  return (
                    <button key={t.k} onClick={() => setHealth({ [t.k]: !v })} className="btn"
                      style={{ padding: "5px 10px", fontSize: 11.5, background: v ? "var(--accent-heat)" : "var(--bg-raised)", color: v ? "white" : "var(--text-secondary)" }}>
                      {v ? "✓ " : ""}{t.l}
                    </button>
                  );
                })}
              </div>

              {/* Auto-decline triggers */}
              <div className="field-l" style={{ fontWeight: 600, marginTop: 2 }}>
                Auto-decline triggers
                <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0 }}>
                  any one of these knocks out most carriers
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {AUTO_DECLINE_CHIPS.map(t => {
                  const v = profile.healthDetail[t.k];
                  return (
                    <button key={t.k} onClick={() => setHealth({ [t.k]: !v })} className="btn"
                      style={{ padding: "5px 10px", fontSize: 11.5, background: v ? "var(--state-danger)" : "var(--bg-raised)", color: v ? "white" : "var(--text-secondary)" }}>
                      {v ? "✓ " : ""}{t.l}
                    </button>
                  );
                })}
              </div>

              {/* Prescriptions */}
              <Shared.Field label={`Prescriptions${(profile.prescriptions || []).length ? ` · ${profile.prescriptions.length}` : ""}`}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                  {(profile.prescriptions || []).map((rx, i) => (
                    <span key={i} className="chip" style={{ fontSize: 10.5, padding: "3px 8px" }}>
                      {rx}
                      <button onClick={() => set({ prescriptions: profile.prescriptions.filter((_, j) => j !== i) })}
                        style={{ marginLeft: 6, background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}>×</button>
                    </span>
                  ))}
                </div>
                <input className="text-input" placeholder="Type med + Enter (e.g. metformin 500mg, lisinopril, eliquis…)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      const v = e.target.value.trim();
                      set({ prescriptions: [...(profile.prescriptions || []), v] });
                      e.target.value = "";
                      e.preventDefault();
                    }
                  }}/>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {RX_SUGGESTIONS.map(rx => {
                    const has = (profile.prescriptions || []).includes(rx);
                    return (
                      <button key={rx} onClick={() => set({ prescriptions: has ? profile.prescriptions.filter(x => x !== rx) : [...(profile.prescriptions || []), rx] })}
                        className="btn"
                        style={{ padding: "3px 8px", fontSize: 10.5, background: has ? "var(--accent-heat)" : "var(--bg-raised)", color: has ? "white" : "var(--text-secondary)" }}>
                        {rx}
                      </button>
                    );
                  })}
                </div>
              </Shared.Field>
            </div>
          </div>

          {/* RIGHT — Ranked quotes */}
          <div className="panel">
            <div className="panel-h">
              <Icons.Trophy size={13} style={{ color: "var(--accent-money)" }}/>
              <h3>Carrier quotes · {PRODUCT_LABELS[profile.product]}{profile.product === "medsupp" ? ` Plan ${profile.planVariant}` : ""}</h3>
              <span className="meta">
                {quoteResults.quoted.length} eligible
                {quoteResults.borderline.length > 0 && ` · ${quoteResults.borderline.length} borderline`}
                {quoteResults.ineligible.length > 0 && ` · ${quoteResults.ineligible.length} excluded`}
              </span>
            </div>

            {/* Empty-state CTA — agency has zero appointments OR none cover
                this product. Hydration-tristate: appointedIds === null means
                "not loaded yet" (don't render); empty Set means "loaded, no
                writable carriers" (show CTA). Without this, the quoter went
                silently blank with no explanation. */}
            {appointedIds !== null && eligibleForProduct.length === 0 && (
              <div style={{
                padding: "14px 16px", margin: "10px",
                background: "color-mix(in oklch, var(--state-warning) 8%, transparent)",
                border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)",
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  No carriers available for {PRODUCT_LABELS[profile.product]}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                  {appointedIds.size === 0
                    ? "Your agency has no carrier appointments set up yet."
                    : `You have ${appointedIds.size} carrier${appointedIds.size === 1 ? "" : "s"} appointed, but none of them sell ${PRODUCT_LABELS[profile.product]}.`}
                  {" "}Set status to <em>Self</em> (you're contracted directly) or
                  <em> Bridge</em> (you're writing under another producer's NPN)
                  on the carriers you can quote.
                </div>
                <button className="btn btn-primary"
                  onClick={() => window.gotoPage && window.gotoPage("carrier-appointments")}
                  style={{ fontSize: 12, padding: "5px 12px" }}>
                  Set up Carrier Appointments →
                </button>
              </div>
            )}

            {/* Carrier selection chips — deselect to narrow quote comparison */}
            {eligibleForProduct.length > 0 && (
              <div style={{
                padding: "7px 10px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
              }}>
                <span style={{ fontSize: 10, color: "var(--text-quaternary)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Quote:</span>
                {eligibleForProduct.map(c => {
                  const sel = selectedCarrierIds === null || selectedCarrierIds.has(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleCarrierSelection(c.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10.5, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                        fontWeight: sel ? 600 : 400,
                        background: sel ? "color-mix(in oklch, var(--accent-money) 14%, transparent)" : "var(--bg-raised)",
                        color: sel ? "var(--accent-money)" : "var(--text-tertiary)",
                        border: sel ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)",
                      }}>
                      {sel && <span style={{ fontSize: 9 }}>✓</span>}
                      {c.name}
                    </button>
                  );
                })}
                {selectedCarrierIds !== null && (
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={() => setSelectedCarrierIds(null)}>All</button>
                )}
              </div>
            )}

            {/* Best Pick recommendation banner — leads with eligibility + fit,
                NOT with price. The dollar number is shown secondary, labeled
                "DB rate" only when the engine sourced it from
                products.rate_table.plans[variant].state_factors[state] (mig
                0060). Otherwise it's labeled "engine estimate" with a
                muted-typography "~" prefix so the rep doesn't read the
                number as authoritative — see CLAUDE.md guiding principle 5. */}
            {best && profile.product !== "annuity" && (
              <div className="quote-pick">
                <div>
                  <div className="quote-pick-h">
                    {bestIsStrongFit ? "BEST FIT · per official underwriting" : "TOP ELIGIBLE · no strong sweet-spot match"}
                  </div>
                  <div className="quote-pick-name">{best.carrier.name}</div>
                  <div className="quote-pick-why">
                    {/* Lead with eligibility + sweet-spot match (verdict) */}
                    {best.verdict && (
                      <div className="reason-row">
                        <span className="reason-tag" style={{
                          background: "color-mix(in oklch, var(--accent-money) 18%, transparent)",
                          color: "var(--accent-money)",
                        }}>{best.verdict.eligibility === "eligible" ? "eligible ✓" : best.verdict.eligibility}</span>
                        <span>
                          {best.verdict.ageVsSweetSpot === "in" && best.verdict.sweetSpot &&
                            <>In carrier sweet-spot ({best.verdict.sweetSpot.lo}–{best.verdict.sweetSpot.hi}). </>
                          }
                          {best.verdict.ageVsSweetSpot === "above" && best.verdict.sweetSpot &&
                            <>Above sweet-spot ({best.verdict.sweetSpot.lo}–{best.verdict.sweetSpot.hi}) — still binds, just not the ideal age band. </>
                          }
                          {best.verdict.ageVsSweetSpot === "below" && best.verdict.sweetSpot &&
                            <>Below sweet-spot ({best.verdict.sweetSpot.lo}–{best.verdict.sweetSpot.hi}) — still binds, but the carrier doesn't lead with this age. </>
                          }
                          {best.verdict.ageVsSweetSpot === "unknown" &&
                            <>Sweet-spot age band not parsed from narrative. </>
                          }
                          {best.verdict.ruleCount} approved rule{best.verdict.ruleCount === 1 ? "" : "s"} backing this carrier.
                        </span>
                      </div>
                    )}
                    {(best.reasons || []).slice(0, 2).map((r, i) => (
                      <div key={i} className="reason-row">
                        <span className="reason-tag">{r.tag}</span>
                        <span>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  {/* Price block: DB-sourced = bold money. Engine-estimate =
                      smaller, muted, ~ prefix, italic "engine estimate" sub. */}
                  {best.dbRateSourced ? (
                    <>
                      <div className="quote-pick-price">{best.displayValue}</div>
                      <div className="quote-pick-class" style={{ color: "var(--accent-money)" }}>
                        DB rate{best.dbRateConfidence ? ` · ${best.dbRateConfidence}` : ""}
                      </div>
                      <div className="quote-pick-class">{best.uwClass || "—"}</div>
                    </>
                  ) : (
                    <>
                      <div className="quote-pick-price" style={{
                        fontSize: 16, color: "var(--text-secondary)", fontWeight: 500,
                      }}>~{best.displayValue}</div>
                      <div className="quote-pick-class" style={{ fontStyle: "italic", color: "var(--text-quaternary)" }}>
                        engine estimate · not authoritative
                      </div>
                      <div className="quote-pick-class">{best.uwClass || "—"}</div>
                    </>
                  )}
                </div>
                {(best.sources || []).length > 0 && (
                  <div className="quote-pick-source">
                    Source: {best.sources.join(" · ")}
                    {best.confidence && <span style={{ marginLeft: 8 }}>· confidence {best.confidence}</span>}
                  </div>
                )}
              </div>
            )}

            {best && profile.product === "annuity" && (
              <div className="quote-pick">
                <div>
                  <div className="quote-pick-h">Best annuity</div>
                  <div className="quote-pick-name">{best.carrier.name}</div>
                  <div className="quote-pick-why">{best.displaySub}</div>
                </div>
                <div>
                  <div className="quote-pick-price">{best.displayValue}</div>
                </div>
              </div>
            )}

            {quoteResults.quoted.length === 0 && quoteResults.borderline.length === 0 && quoteResults.ineligible.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                No appointed carriers offer {PRODUCT_LABELS[profile.product]}. Add appointments in <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "resources" } })); }} style={{ color: "var(--accent-money)" }}>Resources → Carriers</a>.
              </div>
            ) : (
              <div style={{ padding: 10 }}>
                {/* Excluded-carriers callout (top of the list per spec) —
                    "X carriers excluded — see why" with the per-carrier
                    reason. Visible whenever any ineligible carriers exist
                    so the rep knows it's NOT a quote-engine bug that
                    Lumico isn't showing up for an 82-year-old lead. */}
                {quoteResults.ineligible.length > 0 && profile.product !== "annuity" && (
                  <details style={{
                    marginBottom: 10, padding: "8px 10px", borderRadius: 6,
                    background: "color-mix(in oklch, var(--state-warning) 6%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--state-warning) 22%, transparent)",
                    fontSize: 11.5,
                  }}>
                    <summary style={{ cursor: "pointer", color: "var(--state-warning)", fontWeight: 600 }}>
                      {quoteResults.ineligible.length} carrier{quoteResults.ineligible.length === 1 ? "" : "s"} excluded — see why
                    </summary>
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3, color: "var(--text-secondary)" }}>
                      {quoteResults.ineligible.map(r => (
                        <div key={r.carrier.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ fontWeight: 600, minWidth: 140, color: "var(--text-tertiary)", textDecoration: "line-through" }}>{r.carrier.name}</span>
                          <span style={{ color: "var(--state-danger)" }}>{r.verdict?.ineligibleReason || r.reason || "Engine decline"}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Eligible carriers — sorted by fit tier (not price). */}
                {quoteResults.quoted.map((r, i) => {
                  const c = r.carrier;
                  const v = r.verdict || {};
                  // Prefer the DB-sourced guide for the displayed UW metadata;
                  // fall back to the inline CARRIER_NICHES roster fields only
                  // when the carrier has no DB grounding (badge will warn).
                  const guide = window.RateEngine?.getGuide?.(c.id, profile.product) || null;
                  const uw = c.underwriting || {};
                  const tobPct = guide?.tobacco_rateup_pct != null ? guide.tobacco_rateup_pct : uw.tobaccoRateUpPct;
                  const uwClasses = Array.isArray(guide?.uw_classes) ? guide.uw_classes : uw.uwClasses;
                  // Lead the reason text with the sweet-spot match (most
                  // signal-rich), falling back to engine narrative reasons
                  // and finally the methodology trail.
                  const sweetSpotText = v.sweetSpot
                    ? (v.ageVsSweetSpot === "in"
                        ? `In sweet-spot (${v.sweetSpot.lo}-${v.sweetSpot.hi})`
                        : v.ageVsSweetSpot === "above"
                          ? `Outside sweet-spot — lead older than ${v.sweetSpot.hi}`
                          : v.ageVsSweetSpot === "below"
                            ? `Outside sweet-spot — lead younger than ${v.sweetSpot.lo}`
                            : null)
                    : null;
                  const reasonText = sweetSpotText
                    || (r.reasons || []).slice(0, 2).map(x => x.text).join(" · ")
                    || (r.methodology || []).slice(-2).join(" · ")
                    || "—";
                  const isBest = r === best && bestIsStrongFit;
                  const isRunnerUp = r === runnerUp && bestIsStrongFit && (v.fitTier ?? 0) >= 2;
                  return (
                    <div key={c.id} className={"quote-row" + (isBest ? " is-best" : "")}>
                      <div>
                        <div className="qr-name">{c.name}
                          {/* BEST FIT / RUNNER-UP — only when there's a real
                              sweet-spot match. Otherwise no chip; the panel
                              header already says "TOP ELIGIBLE · no strong
                              sweet-spot match" so we don't lie. */}
                          {isBest && (
                            <span className="chip chip-money" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>BEST FIT</span>
                          )}
                          {isRunnerUp && (
                            <span className="chip" style={{
                              marginLeft: 8, fontSize: 9.5, fontWeight: 600,
                              padding: "1px 6px", borderRadius: 3,
                              background: "color-mix(in oklch, var(--accent-money) 8%, transparent)",
                              color: "var(--accent-money)",
                              border: "1px solid color-mix(in oklch, var(--accent-money) 22%, transparent)",
                            }}>RUNNER-UP</span>
                          )}
                          {/* Eligibility verdict chip — eligible = green check */}
                          <span title={v.ineligibleReason || v.borderlineReason || "Passed every approved underwriting rule for this lead profile."}
                                style={{
                                  marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                  borderRadius: 3, fontWeight: 600,
                                  background: "color-mix(in oklch, var(--accent-money) 14%, transparent)",
                                  color: "var(--accent-money)",
                                  border: "1px solid color-mix(in oklch, var(--accent-money) 32%, transparent)",
                                }}>eligible ✓</span>
                          {/* Sweet-spot indicator — only when DB had a parseable band */}
                          {v.sweetSpot && v.ageVsSweetSpot === "in" && (
                            <span title={`Lead age ${profile.age} sits inside ${c.name}'s sweet-spot ages ${v.sweetSpot.lo}-${v.sweetSpot.hi} (per producer-guide narrative).`}
                                  style={{
                                    marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                    borderRadius: 3, fontWeight: 600,
                                    background: "color-mix(in oklch, var(--accent-money) 8%, transparent)",
                                    color: "var(--accent-money)",
                                    border: "1px solid color-mix(in oklch, var(--accent-money) 22%, transparent)",
                                  }}>sweet-spot ✓</span>
                          )}
                          {/* DB grounding badge — was always visible before */}
                          {r.dbGrounded ? (
                            <span title="Underwriting rules sourced from approved product_underwriting_rules rows"
                                  style={{
                                    marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                    borderRadius: 3, fontWeight: 600,
                                    background: "color-mix(in oklch, var(--accent-money) 12%, transparent)",
                                    color: "var(--accent-money)",
                                    border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)",
                                  }}>DB ✓</span>
                          ) : (
                            <span title="No approved underwriting rules in the database for this carrier — verify against the producer guide before binding."
                                  style={{
                                    marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                    borderRadius: 3, fontWeight: 600,
                                    background: "color-mix(in oklch, var(--state-warning) 10%, transparent)",
                                    color: "var(--state-warning)",
                                    border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)",
                                  }}>no DB rules</span>
                          )}
                          {/* DB state rate badge (migration 0060) — surfaces when calculatePremium
                              honored products.rate_table.plans[variant].state_factors[profile.state]
                              instead of the flat national-average baseline. */}
                          {r.dbRateSourced && (
                            <span title={`DB state rate · Plan ${profile.planVariant} · ${profile.state}${r.dbRateNotes ? "\n\n" + r.dbRateNotes : ""}`}
                                  style={{
                                    marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                    borderRadius: 3, fontWeight: 600,
                                    background: "color-mix(in oklch, var(--accent-money) 18%, transparent)",
                                    color: "var(--accent-money)",
                                    border: "1px solid color-mix(in oklch, var(--accent-money) 40%, transparent)",
                                  }}>DB state rate{r.dbRateConfidence ? ` · ${r.dbRateConfidence}` : ""}</span>
                          )}
                          {/* Live agent result badge */}
                          {agentResults[c.id] && (() => {
                            const ar = agentResults[c.id];
                            if (ar.status === "ok") return (
                              <span className="chip chip-money" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px" }}>
                                live ${Math.round((ar.premium_cents || 0) / 100)}/mo
                              </span>
                            );
                            if (ar.status === "decline") return (
                              <span className="chip chip-danger" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px" }}>live: decline</span>
                            );
                            if (ar.status === "no_creds") return (
                              <span className="chip" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", color: "var(--state-warning)" }}>no creds</span>
                            );
                            return (
                              <span className="chip" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", color: "var(--text-tertiary)" }}>
                                {ar.status}
                              </span>
                            );
                          })()}
                          {/* Pending agent indicator */}
                          {agentReqId && !agentResults[c.id] && agentRunStatus !== "done" && agentRunStatus !== "idle" && (
                            <span className="chip" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", color: "var(--text-tertiary)" }}>
                              <span className="dot dot-live" style={{ width: 4, height: 4, marginRight: 3 }}/>agent…
                            </span>
                          )}
                        </div>
                        <div className="qr-meta">
                          {tobPct != null && <span>tob+{tobPct}% · </span>}
                          {Array.isArray(uwClasses) && <span>{uwClasses.length}-class UW</span>}
                          {r.confidence && <span> · {r.confidence} confidence</span>}
                          {v.ruleCount > 0 && <span> · {v.ruleCount} rule{v.ruleCount === 1 ? "" : "s"}</span>}
                        </div>
                      </div>
                      <div className="qr-reason" title={(r.methodology || []).join("\n")}>{reasonText}</div>
                      <div>
                        {/* Price block: DB-sourced rates get full visual
                            emphasis (large, money color). Engine estimates
                            get smaller, italic, "~" prefix + "engine
                            estimate" sub-label so the rep can't mistake
                            them for binding numbers. */}
                        {r.dbRateSourced ? (
                          <>
                            <div className={"qr-price tabular" + (isBest ? " qr-price-best" : "")}>
                              {r.displayValue}
                            </div>
                            <div className="qr-class" style={{ color: "var(--accent-money)", fontWeight: 600 }}>
                              DB rate{r.dbRateConfidence ? ` · ${r.dbRateConfidence}` : ""}
                            </div>
                            <div className="qr-class">{r.displaySub || "—"}</div>
                          </>
                        ) : (
                          <>
                            <div className="qr-price tabular" style={{
                              fontSize: 14, color: "var(--text-secondary)",
                              fontWeight: 500, fontStyle: "normal",
                            }}>
                              ~{r.displayValue}
                            </div>
                            <div className="qr-class" style={{ fontStyle: "italic", color: "var(--text-quaternary)" }}>
                              engine estimate
                            </div>
                            <div className="qr-class">{r.displaySub || "—"}</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Borderline carriers — eligible but on the age cutoff edge.
                    Shown below the main list so the rep can see them but
                    they don't compete for visual primacy with the strong
                    eligibles above. */}
                {quoteResults.borderline.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, color: "var(--state-warning)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 6, paddingLeft: 4, fontWeight: 600 }}>
                      Borderline ({quoteResults.borderline.length}) — verify before binding
                    </div>
                    {quoteResults.borderline.map(r => {
                      const c = r.carrier;
                      const v = r.verdict || {};
                      return (
                        <div key={c.id} className="quote-row" style={{ opacity: 0.85 }}>
                          <div>
                            <div className="qr-name" style={{ color: "var(--text-secondary)" }}>
                              {c.name}
                              <span style={{
                                marginLeft: 6, fontSize: 9.5, padding: "1px 6px",
                                borderRadius: 3, fontWeight: 600,
                                background: "color-mix(in oklch, var(--state-warning) 14%, transparent)",
                                color: "var(--state-warning)",
                                border: "1px solid color-mix(in oklch, var(--state-warning) 32%, transparent)",
                              }}>borderline ⚠</span>
                            </div>
                            <div className="qr-meta">{v.borderlineReason || "Within carrier limits, but at an edge"}</div>
                          </div>
                          <div className="qr-reason" title={(r.methodology || []).join("\n")}>
                            {r.reasons?.[0]?.text || (r.methodology || []).slice(-2).join(" · ") || "—"}
                          </div>
                          <div>
                            {r.dbRateSourced ? (
                              <div className="qr-price tabular">{r.displayValue}</div>
                            ) : (
                              <div className="qr-price tabular" style={{
                                fontSize: 14, color: "var(--text-tertiary)", fontWeight: 500,
                              }}>~{r.displayValue || "—"}</div>
                            )}
                            <div className="qr-class" style={{ fontStyle: r.dbRateSourced ? "normal" : "italic", color: r.dbRateSourced ? "var(--accent-money)" : "var(--text-quaternary)" }}>
                              {r.dbRateSourced ? "DB rate" : "engine estimate"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Methodology footnote — leans hard into "engine estimate
                    is approximate, DB rate is the only authoritative
                    number". Removes the prior framing that implied the
                    engine number was usable for sales conversations. */}
                <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                  <strong>How this list is ranked:</strong> carriers are sorted by <em>fit quality</em> — eligibility plus sweet-spot age match per the producer-guide narrative — <em>not</em> by price. Carriers tagged <strong>DB rate</strong> use migration 0060's state-specific rate sheets (<code style={{ fontSize: 10.5 }}>products.rate_table.plans</code>) and the dollar number is authoritative within its confidence band. Carriers showing <strong>~$X/mo · engine estimate</strong> use a heuristic (base rate × state cost tier × per-carrier delta × UW class × tobacco rate-up × build chart × face-amount factor) — treat that number as an order-of-magnitude approximation, never as a binding quote. To replace estimates with binding numbers, click <strong>Get live carrier rates</strong> below. Currently loaded from <code style={{ fontSize: 10.5 }}>public.product_underwriting_rules</code>: {grounding.carriers} carrier{grounding.carriers === 1 ? "" : "s"} · {grounding.products} product{grounding.products === 1 ? "" : "s"} · {grounding.rules} rule{grounding.rules === 1 ? "" : "s"}{grounding.rate_tables_loaded ? ` · ${grounding.rate_tables_loaded} state rate sheet${grounding.rate_tables_loaded === 1 ? "" : "s"}` : ""}.
                </div>

                {/* Get live carrier rates — dispatches the RBA (Role-Based
                    Agent) to log into each appointed carrier's portal and
                    return binding quotes. Inserts auto_quote_requests row;
                    the local Playwright agent on the rep's machine polls
                    that table, runs the carrier flows, and streams results
                    back into agentResults (badges render on each carrier row). */}
                <div style={{
                  marginTop: 10, padding: "10px 12px",
                  background: "color-mix(in oklch, var(--accent-money) 5%, var(--bg-elevated))",
                  border: "1px solid color-mix(in oklch, var(--accent-money) 20%, var(--border-subtle))",
                  borderRadius: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <button
                    className="btn btn-primary"
                    onClick={runQuoteAgent}
                    disabled={quoteResults.quoted.length === 0 || agentRunStatus === "queued" || agentRunStatus === "running"}
                    style={{ padding: "8px 14px", fontSize: 12.5 }}
                  >
                    <Icons.Sparkles size={13}/>
                    Get live carrier rates
                    {(agentRunStatus === "queued" || agentRunStatus === "running") && (
                      <span style={{ marginLeft: 6, fontSize: 10.5, opacity: 0.75 }}>{agentRunStatus}…</span>
                    )}
                  </button>

                  {agentRunStatus === "done" && (() => {
                    const liveOk = Object.values(agentResults).filter(r => r.status === "ok").length;
                    const liveFail = Object.values(agentResults).filter(r => !["ok"].includes(r.status)).length;
                    return (
                      <span style={{ fontSize: 11.5, color: "var(--accent-money)" }}>
                        {liveOk} live quote{liveOk !== 1 ? "s" : ""} returned
                        {liveFail > 0 && <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>· {liveFail} need manual</span>}
                      </span>
                    );
                  })()}

                  {agentRunStatus === "idle" && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                      Replaces engine estimates above with binding quotes pulled from each carrier's portal (~60-90s). Requires the local RBA agent + carrier creds — set up in <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "admin" } })); }} style={{ color: "var(--accent-money)" }}>Admin → Auto-Quoter</a>.
                    </span>
                  )}

                  {agentRunStatus !== "idle" && agentReqId && (
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
                      req {agentReqId.slice(0, 8)}…
                    </span>
                  )}
                </div>

                {/* Recent live runs — last 5 RBA dispatches for this rep.
                    Click a row to re-populate the profile from that run so
                    the rep can flip back to a 10-min-old quote without
                    leaving the Quote tab. */}
                {recentRuns.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, paddingLeft: 2 }}>
                      Recent live runs · {recentRuns.length}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {recentRuns.map(run => {
                        const results = Array.isArray(run.auto_quote_results) ? run.auto_quote_results : [];
                        const okCount   = results.filter(r => r.status === "ok").length;
                        const failCount = results.filter(r => r.status && r.status !== "ok").length;
                        const p = run.profile || {};
                        const productLabel = PRODUCT_LABELS[p.product] || p.product || "—";
                        const isActive = run.id === agentReqId;
                        return (
                          <div key={run.id}
                               onClick={() => loadRunIntoProfile(run)}
                               title="Load this profile back into the form"
                               style={{
                                 display: "grid", gridTemplateColumns: "70px 100px 70px 1fr auto",
                                 alignItems: "center", gap: 10, padding: "6px 10px",
                                 borderRadius: 5, cursor: "pointer", fontSize: 11.5,
                                 background: isActive ? "color-mix(in oklch, var(--accent-money) 10%, transparent)" : "var(--bg-raised)",
                                 border: "1px solid " + (isActive ? "color-mix(in oklch, var(--accent-money) 35%, transparent)" : "var(--border-subtle)"),
                               }}>
                            <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{timeAgo(run.created_at)}</span>
                            <span className="chip" style={{ fontSize: 10 }}>{productLabel}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{p.state || "—"} · {p.age || "—"}</span>
                            <span style={{ color: "var(--text-secondary)" }}>
                              {okCount > 0 && <span style={{ color: "var(--accent-money)", fontWeight: 600 }}>{okCount} live</span>}
                              {okCount > 0 && failCount > 0 && <span style={{ color: "var(--text-tertiary)" }}> · </span>}
                              {failCount > 0 && <span style={{ color: "var(--text-tertiary)" }}>{failCount} skipped</span>}
                              {okCount === 0 && failCount === 0 && <span style={{ color: "var(--text-tertiary)" }}>{run.status || "pending"}</span>}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                              {run.id.slice(0, 6)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent quotes */}
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-h">
            <Icons.Clock size={13}/>
            <h3>Recent quotes</h3>
            <span className="meta">{quotes.length}</span>
          </div>
          {quotes.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>No quotes saved yet. Build one above and click <strong>Save quote</strong>.</div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.2fr 130px 100px 1fr 110px 130px" }}>
                <div>Lead</div><div>Product</div><div>State/Age</div><div>Best quote</div><div>Status</div><div></div>
              </div>
              {quotes.map(q => (
                <div key={q.id} className="row" style={{ gridTemplateColumns: "1.2fr 130px 100px 1fr 110px 130px" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{q.profile.name || <span style={{ color: "var(--text-tertiary)" }}>—</span>}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{new Date(q.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div><span className="chip">{PRODUCT_LABELS[q.profile.product] || q.profile.product}</span></div>
                  <div className="tabular" style={{ color: "var(--text-tertiary)" }}>{q.profile.state} · {q.profile.age}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {q.ranked[0]?.name || "—"}
                    {q.ranked[0]?.displayValue && <span className="tabular" style={{ marginLeft: 6, color: "var(--accent-money)", fontWeight: 600 }}>{q.ranked[0].displayValue}</span>}
                  </div>
                  <div>
                    <span className={`chip ${q.status === "converted" ? "chip-money" : q.status === "sent" ? "chip-info" : ""}`}>
                      {q.status}{q.sentTo ? ` · ${q.sentTo}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {q.status === "draft" && (
                      <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => sendQuote(q)} title="Send to lead">
                        <Icons.Send size={11}/> Send
                      </button>
                    )}
                    {q.status !== "converted" && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--accent-money)" }} onClick={() => writeDealFromQuote(q)} title="Write a policy from this quote — prefills carrier, AP, contact">
                        <Icons.Check size={11}/> Write deal
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => deleteQuote(q)} title="Delete"><Icons.X size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  window.PageQuote = PageQuote;
})();
