/* page-quote.jsx — Owner Quote Tool (real rate engine)
 *
 * Builds a detailed lead profile, runs it through window.RateEngine, and
 * returns dollar-denominated monthly premiums per appointed carrier with
 * UW class assignment + decline reasons. The recommendation cites the
 * actual producer-guide rule (from /lib/carrier-underwriting.json) that
 * drove the pick.
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

  const PRESETS = [
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

    const set = (patch) => setProfile(p => ({ ...p, ...patch }));
    const setHealth = (patch) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, ...patch } }));

    const niches = window.CARRIER_NICHES || [];

    // Filter to agency-appointed carriers.
    const appointedIds = useMemo(() => {
      const c = window.AppData?.CARRIERS || [];
      if (c.length === 0) return null;
      const nameToNiche = {
        "uhc":    ["uhc", "united"],
        "humana": ["humana"],
        "aetna":  ["aetna"],
        "moo":    ["mutual", "omaha"],
        "cigna":  ["cigna", "loyal", "arlic"],
        "lumico": ["lumico", "swiss"],
        "aig":    ["aig", "corebridge"],
        "fg":     ["fg", "fidelity"],
      };
      const ids = new Set();
      for (const niche of niches) {
        const keywords = nameToNiche[niche.id] || [niche.id];
        if (c.some(carrier => keywords.some(kw => (carrier.name || "").toLowerCase().includes(kw)))) {
          ids.add(niche.id);
        }
      }
      return ids;
    }, [niches.length, window.AppData?.CARRIERS?.length]);

    const totalInches = (profile.heightFeet || 0) * 12 + (profile.heightInches || 0);
    const bmi = window.RateEngine?.bmiFrom?.(totalInches, profile.weightLbs);
    const profileForEngine = { ...profile, heightInches: totalInches, bmi };

    // Run rate engine across appointed carriers that sell this product.
    const quoteResults = useMemo(() => {
      if (!window.RateEngine) return { quoted: [], declined: [] };
      const productKey = profile.product;
      const eligible = niches.filter(c => c.products.includes(productKey));
      const filtered = appointedIds === null ? eligible : eligible.filter(c => appointedIds.has(c.id));

      const results = filtered.map(carrier => {
        if (productKey === "annuity") {
          const ann = window.RateEngine.calculateAnnuityYield(carrier, profileForEngine);
          if (!ann) return { carrier, decline: true, reason: "Annuity not offered by this carrier" };
          return {
            carrier,
            annuity: ann,
            premium: null,
            uwClass: null,
            methodology: ann.methodology,
            displayValue: `${ann.apy}% APY · 5yr`,
            displaySub: `$${ann.accumulated.toLocaleString()} at maturity (gain $${ann.gain.toLocaleString()})`,
          };
        }
        const rate = window.RateEngine.calculatePremium(carrier, productKey, profileForEngine);
        if (rate.decline) {
          return { carrier, decline: true, reason: rate.reason, source: rate.source };
        }
        const reco = window.RateEngine.recommendReasons?.(carrier, productKey, profileForEngine, rate) || { reasons: [], sources: [] };
        return {
          carrier,
          premium: rate.premium,
          uwClass: rate.uwClass,
          methodology: rate.methodology,
          displayValue: `$${rate.premium}/mo`,
          displaySub: rate.uwClass,
          reasons: reco.reasons,
          sources: reco.sources,
          confidence: reco.confidence,
        };
      });

      const quoted   = results.filter(r => !r.decline).sort((a, b) => {
        if (productKey === "annuity") return (b.annuity?.apy || 0) - (a.annuity?.apy || 0);
        return (a.premium || 0) - (b.premium || 0);
      });
      const declined = results.filter(r => r.decline);
      return { quoted, declined };
    }, [JSON.stringify(profileForEngine), niches.length, appointedIds]);

    const best = quoteResults.quoted[0];

    const applyPreset = (p) => {
      setProfile(prev => ({ ...prev, ...p.patch }));
      window.toast && window.toast(`Loaded preset: ${p.label}`, "info");
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

    const sendQuote = (q) => {
      const channel = q.profile.phone ? "SMS" : q.profile.email ? "email" : null;
      if (!channel) {
        window.toast && window.toast("Add a phone or email to the lead before sending", "warn");
        return;
      }
      const next = quotes.map(x => x.id === q.id ? { ...x, sentTo: channel, status: "sent" } : x);
      setQuotes(next); saveQuotes(next);
      window.toast && window.toast(`Quote sent via ${channel} to ${q.profile.name || "lead"}`, "success");
    };

    const markConverted = (q) => {
      const next = quotes.map(x => x.id === q.id ? { ...x, status: "converted" } : x);
      setQuotes(next); saveQuotes(next);
      window.toast && window.toast("Marked converted — feeds carrier-mix analytics", "success");
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

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Quote Tool</div>
            <div className="page-sub">
              Real-rate engine · {totalAppointed} appointed carrier{totalAppointed === 1 ? "" : "s"} for {PRODUCT_LABELS[profile.product]} ·
              {appointedIds === null ? " (demo: all carriers shown)" : ` filtered to your appointments`}
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
          <Shared.KpiCard label="Best quote"
            value={best?.displayValue || "—"}
            sub={best?.carrier.name || "no match"}
            trend={quoteResults.quoted.length > 0 ? "up" : undefined}/>
        </div>

        {/* Presets */}
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-h">
            <Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/>
            <h3>Quick presets</h3>
            <span className="meta">click to load</span>
          </div>
          <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map(p => (
              <button key={p.id} className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => applyPreset(p)}>
                {p.label}
              </button>
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
                {quoteResults.quoted.length} quoted · {quoteResults.declined.length} declined
              </span>
            </div>

            {/* Best Pick recommendation banner — explains WHY citing producer guide */}
            {best && profile.product !== "annuity" && (
              <div className="quote-pick">
                <div>
                  <div className="quote-pick-h">Best pick · per official underwriting</div>
                  <div className="quote-pick-name">{best.carrier.name}</div>
                  <div className="quote-pick-why">
                    {(best.reasons || []).slice(0, 3).map((r, i) => (
                      <div key={i} className="reason-row">
                        <span className="reason-tag">{r.tag}</span>
                        <span>{r.text}</span>
                      </div>
                    ))}
                    {!best.reasons?.length && (
                      <div style={{ color: "var(--text-tertiary)" }}>
                        Cheapest binding carrier for this profile after applying state tier, build chart, and UW class.
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="quote-pick-price">{best.displayValue}</div>
                  <div className="quote-pick-class">{best.uwClass || "—"}</div>
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

            {quoteResults.quoted.length === 0 && quoteResults.declined.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                No appointed carriers offer {PRODUCT_LABELS[profile.product]}. Add appointments in <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "resources" } })); }} style={{ color: "var(--accent-money)" }}>Resources → Carriers</a>.
              </div>
            ) : (
              <div style={{ padding: 10 }}>
                {quoteResults.quoted.map((r, i) => {
                  const c = r.carrier;
                  const uw = c.underwriting || {};
                  const reasonText = (r.reasons || []).slice(0, 2).map(x => x.text).join(" · ")
                    || (r.methodology || []).slice(-2).join(" · ")
                    || "—";
                  return (
                    <div key={c.id} className={"quote-row" + (i === 0 ? " is-best" : "")}>
                      <div>
                        <div className="qr-name">{c.name}
                          {i === 0 && <span className="chip chip-money" style={{ marginLeft: 8, fontSize: 10 }}>cheapest</span>}
                        </div>
                        <div className="qr-meta">
                          {uw.tobaccoRateUpPct != null && <span>tob+{uw.tobaccoRateUpPct}% · </span>}
                          {Array.isArray(uw.uwClasses) && <span>{uw.uwClasses.length}-class</span>}
                          {r.confidence && <span> · {r.confidence} confidence</span>}
                        </div>
                      </div>
                      <div className="qr-reason" title={(r.methodology || []).join("\n")}>{reasonText}</div>
                      <div>
                        <div className={"qr-price tabular" + (i === 0 ? " qr-price-best" : "")}>
                          {r.displayValue}
                        </div>
                        <div className="qr-class">{r.displaySub || "—"}</div>
                      </div>
                    </div>
                  );
                })}

                {quoteResults.declined.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 12, marginBottom: 6, paddingLeft: 4 }}>
                      Declined ({quoteResults.declined.length})
                    </div>
                    {quoteResults.declined.map(r => (
                      <div key={r.carrier.id} className="quote-row is-decline">
                        <div className="qr-name" style={{ color: "var(--text-secondary)", textDecoration: "line-through" }}>{r.carrier.name}</div>
                        <div className="qr-reason" style={{ color: "var(--state-danger)" }}>{r.reason}</div>
                        <div></div>
                      </div>
                    ))}
                  </>
                )}

                <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
                  Premiums calculated by <code style={{ fontSize: 10.5 }}>window.RateEngine</code> against carrier-specific producer guides loaded from <code style={{ fontSize: 10.5 }}>/lib/carrier-underwriting.json</code> (Humana GNHHNV6EN, Cigna ARLIC, Aetna CGFLP04359, AIG AGLC101638, Lumico LUM-SIFE-UWGuide, Mutual of Omaha Living Promise UW Guide). Base rates from medicare.gov Plan Finder. Hover any reason cell for the full calculation chain.
                </div>
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
                    {q.status === "sent" && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--accent-money)" }} onClick={() => markConverted(q)} title="Mark converted">
                        <Icons.Check size={11}/> Won
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
