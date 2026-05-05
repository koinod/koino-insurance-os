/* page-auto-quoter.jsx — Auto Quoter (owner)
 *
 * Owner-side hub for the local-agent-driven cross-carrier quoter. Three sections:
 *
 *   1. SETUP — one-line install command + agent status (online / offline / when
 *      last seen). Headless ↔ headed toggle persists to auto_quoter_settings.
 *
 *   2. CREDENTIALS — per-carrier login form. Credentials NEVER hit our DB; the
 *      page only emits a small JSON to the local agent's `credentials.json` via
 *      a download blob. (Until the local-agent-update endpoint is wired, owner
 *      copy-pastes the JSON or downloads it.)
 *
 *   3. QUOTE A LEAD — a profile form (reusing the same shape as page-quote.jsx
 *      → easy migration path to a shared component) + a "Run quote across
 *      enabled carriers" button. On submit: insert into auto_quote_requests,
 *      then live-watch auto_quote_results until status=complete.
 *
 * Local agent picks up the request, runs Playwright per enabled carrier, writes
 * results back. UI renders results as they stream in.
 */

(function () {
  const { useState, useEffect, useMemo } = React;

  // Carrier list — drives credential form rows + carrier-enabled toggles.
  // Keep id in sync with scrapers/<id>.py.
  const SUPPORTED_CARRIERS = [
    { id: "uhc",    name: "UnitedHealthcare AARP", products: ["medsupp"], requiresLogin: false, note: "Public quoter — no login required" },
    { id: "humana", name: "Humana",                 products: ["medsupp", "mapd"], requiresLogin: true,  note: "Producer portal · my.humana.com/agent" },
    { id: "aetna",  name: "Aetna SRC",              products: ["medsupp"], requiresLogin: true,  note: "Producer portal · aetnaseniorproducts.com" },
    { id: "cigna",  name: "Cigna (ARLIC)",          products: ["medsupp"], requiresLogin: true,  note: "Producer portal · agent.cignaforhcp.com" },
    { id: "moo",    name: "Mutual of Omaha",        products: ["medsupp", "fe"], requiresLogin: true, note: "Producer portal · sales.mutualofomaha.com" },
    { id: "lumico", name: "Lumico",                 products: ["fe"], requiresLogin: true, note: "Producer portal · lumicolife.com" },
    { id: "aig",    name: "AIG (Corebridge)",       products: ["fe", "term"], requiresLogin: true, note: "Producer portal · agent.corebridgefinancial.com" },
    { id: "fg",     name: "F&G",                     products: ["annuity", "iul"], requiresLogin: true, note: "Producer portal · agentportal.fglife.com" },
  ];

  // Local persistence (until the agent <-> supabase wire is fully live)
  const LS_CREDS = "repflow:auto-quoter:creds";
  const LS_SETTINGS = "repflow:auto-quoter:settings";
  const LS_REQUESTS = "repflow:auto-quoter:requests";

  function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  function PageAutoQuoter({ role = "owner" }) {
    const [credentials, setCredentials] = useState(() => loadJSON(LS_CREDS, {}));
    const [settings, setSettings]       = useState(() => loadJSON(LS_SETTINGS, { headless: true, enabledCarriers: ["uhc"] }));
    const [requests, setRequests]       = useState(() => loadJSON(LS_REQUESTS, []));

    const [tab, setTab] = useState("quote");  // quote | setup | credentials
    const [expandedCarrier, setExpandedCarrier] = useState(null);

    // Profile form state — same shape as page-quote.jsx for shareability
    const [profile, setProfile] = useState({
      name: "", state: "TX", age: 67, gender: "F",
      heightInches: 65, weightLbs: 145, tobacco: false,
      healthDetail: { diabetesType: "none", bpHigh: "none", cholesterolHigh: false, sleepApnea: "none", copd: false, cancerWindow: "none", cardiacWindow: "none" },
      product: "medsupp", planVariant: "G", face: 15000, premium: 50000,
    });
    const [activeRequest, setActiveRequest] = useState(null);  // { id, results: [...] }

    useEffect(() => saveJSON(LS_CREDS, credentials), [credentials]);
    useEffect(() => saveJSON(LS_SETTINGS, settings), [settings]);
    useEffect(() => saveJSON(LS_REQUESTS, requests), [requests]);

    const setCarrierCred = (carrierId, field, value) => {
      setCredentials(prev => ({
        ...prev,
        [carrierId]: { ...(prev[carrierId] || {}), [field]: value },
      }));
    };

    const toggleCarrier = (carrierId) => {
      setSettings(s => {
        const enabled = new Set(s.enabledCarriers || []);
        enabled.has(carrierId) ? enabled.delete(carrierId) : enabled.add(carrierId);
        return { ...s, enabledCarriers: [...enabled] };
      });
    };

    // ── Run a quote ────────────────────────────────────────────────────────
    const runQuote = async () => {
      const reqId = "req-" + Date.now();
      const enabled = settings.enabledCarriers.filter(cid =>
        SUPPORTED_CARRIERS.find(c => c.id === cid && c.products.includes(profile.product))
      );

      if (enabled.length === 0) {
        window.toast && window.toast(`No enabled carriers offer ${profile.product}. Enable carriers in the Setup tab.`, "warn");
        return;
      }

      const newRequest = {
        id: reqId, profile: { ...profile }, carriers: enabled,
        status: "queued", createdAt: new Date().toISOString(),
        results: [],
      };
      setRequests(prev => [newRequest, ...prev].slice(0, 30));
      setActiveRequest(newRequest);

      // Insert to Supabase if LIVE
      if (window.AppData?.LIVE) {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (sb) {
            const me = window.me && window.me();
            const { data } = await sb.from("auto_quote_requests").insert({
              rep_id: me?.rep_id, profile, carriers: enabled, status: "queued",
            }).select().single();
            if (data?.id) {
              setRequests(prev => prev.map(r => r.id === reqId ? { ...r, id: data.id, supabaseId: data.id } : r));
            }
          }
        } catch (e) { /* fallback to local-only */ }
      } else {
        // Demo mode — simulate the agent by running RateEngine locally and
        // streaming results with realistic delays per carrier.
        simulateAgent(newRequest);
      }
      window.toast && window.toast(`Quote queued · ${enabled.length} carrier${enabled.length === 1 ? "" : "s"}`, "info");
    };

    // ── Demo-mode simulator (when not LIVE) ────────────────────────────────
    // Approximates what the local agent would return by running the offline
    // RateEngine. Real agent replaces this entirely.
    const simulateAgent = (req) => {
      const carriers = req.carriers;
      const niches = window.CARRIER_NICHES || [];
      const RE = window.RateEngine;
      if (!RE) return;

      const schedule = (cid, idx) => {
        setTimeout(() => {
          const carrier = niches.find(c => c.id === cid);
          let result;
          if (!carrier) {
            result = { carrier_id: cid, status: "no_scraper", error: "Carrier not in CARRIER_NICHES" };
          } else if (req.profile.product === "annuity") {
            const a = RE.calculateAnnuityYield(carrier, req.profile);
            if (!a) result = { carrier_id: cid, status: "decline", error: "no annuity offered" };
            else    result = { carrier_id: cid, status: "ok", premium: null, uwClass: `${a.apy}% APY`, raw: a.methodology.join("\n") };
          } else {
            const r = RE.calculatePremium(carrier, req.profile.product, req.profile);
            if (r.decline) result = { carrier_id: cid, status: "decline", error: r.reason };
            else           result = { carrier_id: cid, status: "ok", premium: r.premium, uwClass: r.uwClass, raw: r.methodology.join("\n") };
          }
          setRequests(prev => prev.map(x => {
            if (x.id !== req.id) return x;
            const results = [...x.results, result];
            const status = results.length >= carriers.length ? "complete" : "running";
            return { ...x, results, status };
          }));
          setActiveRequest(prev => {
            if (!prev || prev.id !== req.id) return prev;
            const results = [...prev.results, result];
            const status = results.length >= carriers.length ? "complete" : "running";
            return { ...prev, results, status };
          });
        }, 600 + idx * 700);  // staggered to look realistic
      };
      carriers.forEach((cid, i) => schedule(cid, i));
    };

    // ── Helpers ────────────────────────────────────────────────────────────
    const enabledForProduct = SUPPORTED_CARRIERS
      .filter(c => c.products.includes(profile.product))
      .filter(c => settings.enabledCarriers.includes(c.id));
    const credsForProduct = enabledForProduct.filter(c =>
      !c.requiresLogin || (credentials[c.id]?.username && credentials[c.id]?.password)
    );
    const missingCredCount = enabledForProduct.length - credsForProduct.length;

    const downloadCredsJson = () => {
      const blob = new Blob([JSON.stringify(credentials, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "credentials.json"; a.click();
      URL.revokeObjectURL(url);
    };

    // ── Render ─────────────────────────────────────────────────────────────
    const me = window.me && window.me();
    const repId = me?.rep_id || "demo-rep";
    const installCmd = `KOINO_REP_ID=${repId} curl -sSL https://koino-insurance-os.vercel.app/agent/install.sh | bash`;

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Auto Quoter</div>
            <div className="page-sub">
              Local agent runs Playwright on your machine · pulls real quotes from carrier portals using your producer credentials · credentials never leave your machine
            </div>
          </div>
        </div>

        <Shared.SectionPill
          items={[
            { k: "quote",       l: "Quote a lead" },
            { k: "setup",       l: "Setup" },
            { k: "credentials", l: `Credentials · ${Object.keys(credentials).length}` },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* ─── QUOTE TAB ─────────────────────────────────────────────────── */}
        {tab === "quote" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)", gap: 14 }}>
            {/* Profile form */}
            <div className="panel">
              <div className="panel-h"><Icons.Users size={13}/><h3>Lead profile</h3></div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Shared.Field label="Lead name">
                    <input className="text-input" value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Cheryl Hampton"/>
                  </Shared.Field>
                  <Shared.Field label="State">
                    <input className="text-input" value={profile.state} onChange={(e) => setProfile(p => ({ ...p, state: e.target.value.toUpperCase() }))} placeholder="TX" maxLength={2}/>
                  </Shared.Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <Shared.Field label="Age">
                    <input className="text-input" type="number" value={profile.age} onChange={(e) => setProfile(p => ({ ...p, age: +e.target.value }))}/>
                  </Shared.Field>
                  <Shared.Field label="Gender">
                    <Shared.Select value={profile.gender} onChange={(v) => setProfile(p => ({ ...p, gender: v }))} options={[{ v: "F", l: "Female" }, { v: "M", l: "Male" }]}/>
                  </Shared.Field>
                  <Shared.Field label="Height (in)">
                    <input className="text-input" type="number" value={profile.heightInches} onChange={(e) => setProfile(p => ({ ...p, heightInches: +e.target.value }))}/>
                  </Shared.Field>
                  <Shared.Field label="Weight (lbs)">
                    <input className="text-input" type="number" value={profile.weightLbs} onChange={(e) => setProfile(p => ({ ...p, weightLbs: +e.target.value }))}/>
                  </Shared.Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: profile.product === "medsupp" ? "2fr 1fr" : "1fr", gap: 8 }}>
                  <Shared.Field label="Product">
                    <Shared.Select value={profile.product} onChange={(v) => setProfile(p => ({ ...p, product: v }))} options={[
                      { v: "medsupp", l: "Medicare Supplement" },
                      { v: "mapd",    l: "Medicare Advantage" },
                      { v: "fe",      l: "Final Expense" },
                      { v: "term",    l: "Term Life" },
                      { v: "iul",     l: "IUL" },
                      { v: "annuity", l: "Annuity (MYGA)" },
                    ]}/>
                  </Shared.Field>
                  {profile.product === "medsupp" && (
                    <Shared.Field label="Plan">
                      <Shared.Select value={profile.planVariant} onChange={(v) => setProfile(p => ({ ...p, planVariant: v }))} options={[{ v: "G", l: "Plan G" }, { v: "N", l: "Plan N" }]}/>
                    </Shared.Field>
                  )}
                </div>

                <div className="divider"></div>
                <div className="field-l" style={{ fontWeight: 600 }}>Health profile</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Shared.Field label="Tobacco">
                    <Shared.Select value={profile.tobacco ? "yes" : "no"} onChange={(v) => setProfile(p => ({ ...p, tobacco: v === "yes" }))} options={[{ v: "no", l: "Non-tobacco" }, { v: "yes", l: "Tobacco user" }]}/>
                  </Shared.Field>
                  <Shared.Field label="Diabetes">
                    <Shared.Select value={profile.healthDetail.diabetesType} onChange={(v) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, diabetesType: v } }))} options={[
                      { v: "none", l: "None" }, { v: "type2_oral", l: "Type 2 · oral" },
                      { v: "type2_insulin", l: "Type 2 · insulin" }, { v: "type1", l: "Type 1" },
                    ]}/>
                  </Shared.Field>
                  <Shared.Field label="High BP">
                    <Shared.Select value={profile.healthDetail.bpHigh} onChange={(v) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, bpHigh: v } }))} options={[
                      { v: "none", l: "None" }, { v: "controlled", l: "Controlled" }, { v: "uncontrolled", l: "Uncontrolled" },
                    ]}/>
                  </Shared.Field>
                  <Shared.Field label="Cardiac event">
                    <Shared.Select value={profile.healthDetail.cardiacWindow} onChange={(v) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, cardiacWindow: v } }))} options={[
                      { v: "none", l: "None" }, { v: ">24mo", l: "> 24mo ago" }, { v: "12-24mo", l: "12–24mo ago" }, { v: "<12mo", l: "< 12mo ago" },
                    ]}/>
                  </Shared.Field>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    { l: "High cholesterol", v: profile.healthDetail.cholesterolHigh, set: (v) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, cholesterolHigh: v } })) },
                    { l: "COPD", v: profile.healthDetail.copd, set: (v) => setProfile(p => ({ ...p, healthDetail: { ...p.healthDetail, copd: v } })) },
                  ].map(t => (
                    <button key={t.l} onClick={() => t.set(!t.v)} className="btn"
                      style={{ padding: "5px 10px", fontSize: 11.5, background: t.v ? "var(--accent-heat)" : "var(--bg-raised)", color: t.v ? "white" : "var(--text-secondary)" }}>{t.l}</button>
                  ))}
                </div>

                <div className="divider"></div>

                <button className="btn btn-primary" onClick={runQuote} style={{ padding: "10px 14px", fontSize: 13 }} disabled={enabledForProduct.length === 0}>
                  <Icons.Sparkles size={13}/>
                  Run quote · {enabledForProduct.length} carrier{enabledForProduct.length === 1 ? "" : "s"}
                  {missingCredCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>({missingCredCount} missing creds)</span>}
                </button>
                {enabledForProduct.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    No carriers enabled for {profile.product}. Switch to <strong>Setup</strong> tab to enable.
                  </div>
                )}
              </div>
            </div>

            {/* Live results */}
            <div className="panel">
              <div className="panel-h">
                <Icons.Trophy size={13} style={{ color: "var(--accent-money)" }}/>
                <h3>Quote results</h3>
                {activeRequest && (
                  <span className="meta">
                    {activeRequest.results.length}/{activeRequest.carriers.length} ·
                    <span style={{ color: activeRequest.status === "complete" ? "var(--accent-money)" : "var(--text-secondary)" }}> {activeRequest.status}</span>
                  </span>
                )}
              </div>
              {!activeRequest ? (
                <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                  Build a profile and click <strong>Run quote</strong>. The local agent will pull live rates from each enabled carrier portal in parallel.
                </div>
              ) : (
                <div style={{ padding: 10 }}>
                  {/* Pending carriers */}
                  {activeRequest.carriers
                    .filter(cid => !activeRequest.results.find(r => r.carrier_id === cid))
                    .map(cid => {
                      const c = SUPPORTED_CARRIERS.find(x => x.id === cid);
                      return (
                        <div key={cid} style={{
                          display: "grid", gridTemplateColumns: "1fr 90px",
                          padding: "10px 14px", marginBottom: 4, background: "var(--bg-raised)",
                          borderRadius: 6, fontSize: 12, color: "var(--text-tertiary)",
                        }}>
                          <span><span className="dot" style={{ background: "var(--text-tertiary)", marginRight: 6, animation: "pulse 1.4s infinite" }}/>{c?.name || cid}</span>
                          <span style={{ textAlign: "right" }}>quoting…</span>
                        </div>
                      );
                    })}
                  {/* Returned results, ranked by premium ascending */}
                  {[...activeRequest.results]
                    .sort((a, b) => {
                      if ((a.status === "ok") !== (b.status === "ok")) return a.status === "ok" ? -1 : 1;
                      return (a.premium || 0) - (b.premium || 0);
                    })
                    .map((r, i) => {
                      const c = SUPPORTED_CARRIERS.find(x => x.id === r.carrier_id);
                      const ok = r.status === "ok";
                      return (
                        <div key={r.carrier_id} style={{
                          display: "grid", gridTemplateColumns: "1fr 1.2fr 110px",
                          padding: "11px 14px", marginBottom: 4, alignItems: "center",
                          background: ok && i === 0 ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-raised))" : "var(--bg-raised)",
                          border: ok && i === 0 ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)",
                          borderRadius: 6,
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c?.name || r.carrier_id}
                              {ok && i === 0 && <span className="chip chip-money" style={{ marginLeft: 8, fontSize: 10 }}>cheapest</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                              {ok ? r.uwClass || "Standard" : r.error || r.status}
                            </div>
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.4 }} title={r.raw || ""}>
                            {ok ? (r.raw || "").split("\n").slice(-2).join(" · ") : r.error}
                          </div>
                          <div className="tabular" style={{ fontSize: 16, fontWeight: 700, textAlign: "right",
                            color: ok ? (i === 0 ? "var(--accent-money)" : "var(--text-primary)") : "var(--state-danger)" }}>
                            {ok ? (r.premium ? `$${r.premium}/mo` : (r.uwClass || "—")) : "DECLINE"}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SETUP TAB ─────────────────────────────────────────────────── */}
        {tab === "setup" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="panel">
              <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>One-line install</h3></div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Run this on the rep's machine. Installs Python deps, Chromium, the local agent, and a launchd/systemd unit so the agent restarts on reboot.
                </div>
                <pre className="mono" style={{ background: "var(--bg-raised)", padding: 12, borderRadius: 6, fontSize: 11.5, overflow: "auto", margin: 0, lineHeight: 1.55 }}>
                  {installCmd}
                </pre>
                <button className="btn" onClick={() => { navigator.clipboard.writeText(installCmd); window.toast && window.toast("Install command copied", "success"); }}>
                  <Icons.Copy size={11}/> Copy
                </button>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                  Files installed to <code style={{ fontSize: 10.5 }}>~/.koino/auto-quoter/</code>. Credentials stored locally with chmod 600 — never leave your machine.
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h"><Icons.Settings size={13}/><h3>Browser mode</h3></div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Toggle headless vs visible browser per quote. Headless runs in the background; visible mode lets you watch the agent navigate the carrier portal in real time — useful while debugging a new scraper.
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--bg-raised)", borderRadius: 6, cursor: "pointer" }}>
                  <input type="radio" name="hl" checked={settings.headless} onChange={() => setSettings(s => ({ ...s, headless: true }))}/>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Headless · background</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Browser runs invisibly. Faster, no screen real estate used.</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--bg-raised)", borderRadius: 6, cursor: "pointer" }}>
                  <input type="radio" name="hl" checked={!settings.headless} onChange={() => setSettings(s => ({ ...s, headless: false }))}/>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Headed · on screen</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Visible Chromium window. Use to inspect what the scraper sees on portal layout changes.</div>
                  </div>
                </label>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                  Setting persists to <code style={{ fontSize: 10 }}>~/.koino/auto-quoter/settings.json</code> via the agent's next poll.
                </div>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: "1 / -1" }}>
              <div className="panel-h"><Icons.Bolt size={13} style={{ color: "var(--accent-heat)" }}/><h3>Enabled carriers</h3>
                <span className="meta" style={{ marginLeft: "auto" }}>{settings.enabledCarriers.length} of {SUPPORTED_CARRIERS.length}</span>
              </div>
              <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
                {SUPPORTED_CARRIERS.map(c => {
                  const enabled = settings.enabledCarriers.includes(c.id);
                  const credsOk = !c.requiresLogin || (credentials[c.id]?.username && credentials[c.id]?.password);
                  return (
                    <label key={c.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: 12,
                      background: enabled ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-raised))" : "var(--bg-raised)",
                      border: enabled ? "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" : "1px solid var(--border-subtle)",
                      borderRadius: 6, cursor: "pointer",
                    }}>
                      <input type="checkbox" checked={enabled} onChange={() => toggleCarrier(c.id)} style={{ marginTop: 2 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>{c.note}</div>
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {c.products.map(p => <span key={p} className="chip" style={{ fontSize: 9.5 }}>{p}</span>)}
                          {c.requiresLogin && (
                            <span className="chip" style={{ fontSize: 9.5, color: credsOk ? "var(--accent-money)" : "var(--state-warning)" }}>
                              {credsOk ? "creds ✓" : "creds missing"}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── CREDENTIALS TAB ──────────────────────────────────────────────── */}
        {tab === "credentials" && (
          <div className="panel">
            <div className="panel-h"><Icons.Shield size={13}/><h3>Carrier producer credentials</h3>
              <span className="meta" style={{ marginLeft: "auto" }}>stored locally · never sent to our servers</span>
              <button className="btn" onClick={downloadCredsJson} style={{ marginLeft: 8 }}>
                <Icons.ArrowUpRight size={11}/> Download credentials.json
              </button>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {SUPPORTED_CARRIERS.filter(c => c.requiresLogin).map(c => {
                const cred = credentials[c.id] || {};
                const expanded = expandedCarrier === c.id;
                return (
                  <div key={c.id} style={{ background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                    <button className="btn btn-ghost" onClick={() => setExpandedCarrier(expanded ? null : c.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", width: "100%", textAlign: "left", borderRadius: 6 }}>
                      <Icons.ChevronRight size={12} style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 120ms" }}/>
                      <strong style={{ fontSize: 13 }}>{c.name}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}>{c.note}</span>
                      <span className="chip" style={{ fontSize: 10, marginLeft: 8, color: cred.username ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                        {cred.username ? "configured" : "empty"}
                      </span>
                    </button>
                    {expanded && (
                      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <Shared.Field label="Username">
                          <input className="text-input" value={cred.username || ""} onChange={(e) => setCarrierCred(c.id, "username", e.target.value)} placeholder="producer.email@agency.com"/>
                        </Shared.Field>
                        <Shared.Field label="Password">
                          <input className="text-input" type="password" value={cred.password || ""} onChange={(e) => setCarrierCred(c.id, "password", e.target.value)} placeholder="••••••••"/>
                        </Shared.Field>
                        <Shared.Field label="Producer / NPN # (optional)">
                          <input className="text-input" value={cred.npn || ""} onChange={(e) => setCarrierCred(c.id, "npn", e.target.value)}/>
                        </Shared.Field>
                        <Shared.Field label="Notes">
                          <input className="text-input" value={cred.notes || ""} onChange={(e) => setCarrierCred(c.id, "notes", e.target.value)} placeholder="MFA backup codes etc."/>
                        </Shared.Field>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ marginTop: 10, padding: 12, background: "color-mix(in oklch, var(--state-warning) 10%, var(--bg-raised))", border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)", borderRadius: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--state-warning)" }}>Security:</strong> Credentials live in your browser's localStorage and (after Download) in <code style={{ fontSize: 10.5 }}>~/.koino/auto-quoter/credentials.json</code> on the rep's machine. They are <strong>never</strong> transmitted to our servers. The local agent reads them at quote-time and passes them straight to Playwright.
              </div>
            </div>
          </div>
        )}

        {/* Recent quote requests log — visible regardless of tab */}
        {requests.length > 0 && (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-h"><Icons.Clock size={13}/><h3>Recent quote requests</h3><span className="meta">{requests.length}</span></div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 1.4fr 100px 80px" }}>
                <div>Lead</div><div>Product</div><div>Result</div><div>Carriers</div><div>Status</div>
              </div>
              {requests.slice(0, 10).map(r => {
                const ok = (r.results || []).filter(x => x.status === "ok");
                const cheapest = ok.sort((a, b) => (a.premium || 0) - (b.premium || 0))[0];
                return (
                  <div key={r.id} className="row" style={{ gridTemplateColumns: "1fr 100px 1.4fr 100px 80px" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.profile.name || "—"}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.profile.state} · {r.profile.age}</div>
                    </div>
                    <div><span className="chip">{r.profile.product}</span></div>
                    <div style={{ fontSize: 12 }}>
                      {cheapest ? <>
                        <span style={{ color: "var(--accent-money)", fontWeight: 600 }}>${cheapest.premium}/mo</span>
                        <span style={{ marginLeft: 6, color: "var(--text-tertiary)" }}>{SUPPORTED_CARRIERS.find(x => x.id === cheapest.carrier_id)?.name}</span>
                      </> : <span style={{ color: "var(--text-tertiary)" }}>{(r.results || []).length === 0 ? "pending" : "all declined"}</span>}
                    </div>
                    <div className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{(r.results || []).length}/{r.carriers.length}</div>
                    <div><span className={`chip ${r.status === "complete" ? "chip-money" : "chip-info"}`}>{r.status}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  window.PageAutoQuoter = PageAutoQuoter;
})();
