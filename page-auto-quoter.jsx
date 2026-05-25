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
    { id: "uhc",              name: "UnitedHealthcare AARP", products: ["medsupp"],            requiresLogin: false, note: "Public quoter — no login required" },
    { id: "humana",           name: "Humana",                products: ["medsupp", "mapd"],    requiresLogin: true,  note: "Producer · humana.com/agent" },
    { id: "aetna",            name: "Aetna SRC",             products: ["medsupp"],            requiresLogin: true,  note: "Producer · aetnaseniorsupplemental.com" },
    { id: "cigna",            name: "Cigna (ARLIC)",         products: ["medsupp"],            requiresLogin: true,  note: "Producer · cignaforhcp.com" },
    { id: "moo",              name: "Mutual of Omaha",       products: ["medsupp", "fe"],      requiresLogin: true,  note: "Producer · mutualofomaha.com/agent" },
    { id: "lumico",           name: "Lumico",                products: ["fe"],                  requiresLogin: true,  note: "Producer · lumico.com" },
    { id: "aig",              name: "Corebridge (AIG)",      products: ["fe", "term", "iul"],  requiresLogin: true,  note: "Producer · corebridgefinancial.com" },
    { id: "fg",               name: "F&G",                   products: ["annuity", "iul"],      requiresLogin: true,  note: "Producer · saleslink.fglife.com" },
    { id: "transamerica",     name: "Transamerica",          products: ["fe", "term", "iul"],  requiresLogin: true,  note: "Producer · transamerica.com/agent" },
    { id: "ethos",            name: "Ethos",                 products: ["term"],                requiresLogin: true,  note: "Producer · agents.ethoslife.com" },
    { id: "americanamicable", name: "American Amicable",     products: ["fe", "term"],          requiresLogin: true,  note: "Producer · aalife.com" },
    { id: "instabrain",       name: "Instabrain (multi)",    products: ["fe", "term", "iul"],  requiresLogin: true,  note: "Aggregator · instabrain.ai" },
    { id: "foresters",        name: "Foresters",             products: ["term", "iul"],         requiresLogin: true,  note: "Producer · foresters.com/agents" },
    { id: "sbli",             name: "SBLI",                  products: ["term"],                requiresLogin: true,  note: "Producer · sbli.com/agent" },
  ];

  // Local persistence (until the agent <-> supabase wire is fully live)
  const LS_CREDS = "repflow:auto-quoter:creds";
  const LS_SETTINGS = "repflow:auto-quoter:settings";
  const LS_REQUESTS = "repflow:auto-quoter:requests";
  const LS_SESSIONS = "repflow:auto-quoter:sessions";  // { [carrierId]: { capturedAt, status, lastError } }

  function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function formatAgo(iso) {
    if (!iso) return "never";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000)        return "just now";
    if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  function PageAutoQuoter({ role = "owner" }) {
    const [credentials, setCredentials] = useState(() => loadJSON(LS_CREDS, {}));
    const [settings, setSettings]       = useState(() => loadJSON(LS_SETTINGS, { headless: true, enabledCarriers: ["uhc"] }));
    const [requests, setRequests]       = useState(() => loadJSON(LS_REQUESTS, []));
    const [sessions, setSessions]       = useState(() => loadJSON(LS_SESSIONS, {}));
    const [agentLastSeen, setAgentLastSeen] = useState(null);
    const [capturingCarrier, setCapturingCarrier] = useState(null);

    const [tab, setTab] = useState("quote");  // quote | setup | credentials
    const [expandedCarrier, setExpandedCarrier] = useState(null);
    const [credFilter, setCredFilter] = useState("");          // search input — Credentials tab

    // Profile form state — same shape as page-quote.jsx for shareability
    const [profile, setProfile] = useState({
      name: "", state: "TX", age: 67, gender: "F",
      heightFeet: 5, heightInches: 5, weightLbs: 145, tobacco: false,
      prescriptions: [],   // array of { name, dosage } strings or just names
      healthDetail: { diabetesType: "none", bpHigh: "none", cholesterolHigh: false, sleepApnea: "none", copd: false, cancerWindow: "none", cardiacWindow: "none" },
      product: "medsupp", planVariant: "G", face: 15000, premium: 50000,
    });
    // Convenience derived: total inches for the rate engine. Update both ways.
    const totalInches = (profile.heightFeet || 0) * 12 + (profile.heightInches || 0);
    const [activeRequest, setActiveRequest] = useState(null);  // { id, results: [...] }

    useEffect(() => saveJSON(LS_CREDS, credentials), [credentials]);
    useEffect(() => saveJSON(LS_SETTINGS, settings), [settings]);
    useEffect(() => saveJSON(LS_REQUESTS, requests), [requests]);
    useEffect(() => saveJSON(LS_SESSIONS, sessions), [sessions]);

    // ── Server-side cred persistence (2026-05-24) ────────────────────────
    // Carrier portal creds were localStorage-only — disappeared when the
    // rep used a different browser/device. We now ALSO write to the
    // server via /api/agent/connector-upsert (provider = "carrier_<id>")
    // and rehydrate from /api/agent/connector-list on mount. Local
    // credentials.json export still works for the agent; the new path
    // also lets the agent fetch on-demand via /api/agent/connector-exchange.

    // 1. Rehydrate from server on mount. ONLY populates username — passwords
    //    aren't returned by the list endpoint (decryption requires the agent
    //    flow). Saved-flag tells the UI "creds on file, leave password blank
    //    to keep existing".
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
          if (!session) return;
          const r = await fetch("/api/agent/connector-list", {
            headers: { authorization: `Bearer ${session.access_token}` },
          });
          if (!r.ok) return;
          const { connectors = [] } = await r.json();
          if (cancelled) return;
          const next = {};
          for (const c of connectors) {
            if (!c.provider || !c.provider.startsWith("carrier_")) continue;
            const carrierId = c.provider.slice("carrier_".length);
            next[carrierId] = {
              username: c.account_metadata?.username || "",
              password: "",                 // never rehydrated for security
              _saved_at: c.connected_at,
              _has_password: true,
            };
          }
          if (Object.keys(next).length) {
            setCredentials(prev => ({ ...next, ...prev }));   // local override server if user already typed
          }
        } catch (e) { /* ignore — UI degrades to localStorage-only */ }
      })();
      return () => { cancelled = true; };
    }, []);

    // 2. Debounced save-on-change to server. Skips if the user hasn't typed
    //    anything yet (rehydrate-only state) OR if the password is empty +
    //    we already have one saved (avoid wiping the saved password).
    const credSaveTimers = React.useRef({});
    const saveCredToServer = React.useCallback(async (carrierId, cred) => {
      if (!cred?.username) return;          // nothing to save
      // Skip when user typed username but left password blank AND server
      // already has a password (avoid wiping it).
      if (!cred.password && cred._has_password) return;
      try {
        const sb = window.getSupabase && window.getSupabase();
        const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
        if (!session) return;
        // api_key holds the JSON blob of all carrier-specific cred fields.
        // account_metadata.username surfaced for the list endpoint to
        // round-trip the username without decrypting.
        const apiKey = JSON.stringify({
          username: cred.username || "",
          password: cred.password || "",
          extra:    cred.extra || {},
        });
        const r = await fetch("/api/agent/connector-upsert", {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            provider: `carrier_${carrierId}`,
            account_label: `Carrier portal · ${carrierId}`,
            api_key: apiKey,
            metadata: { username: cred.username || "" },
          }),
        });
        if (r.ok) {
          // Mark as saved so future blanks don't wipe
          setCredentials(prev => ({
            ...prev,
            [carrierId]: { ...(prev[carrierId] || {}), _has_password: true, _saved_at: new Date().toISOString() },
          }));
        }
      } catch (e) { /* silent — localStorage still has it */ }
    }, []);

    useEffect(() => {
      Object.keys(credentials).forEach(carrierId => {
        const cred = credentials[carrierId];
        if (!cred || !cred.username) return;
        // Don't repeatedly save on every keystroke — debounce per carrier.
        if (credSaveTimers.current[carrierId]) clearTimeout(credSaveTimers.current[carrierId]);
        credSaveTimers.current[carrierId] = setTimeout(() => {
          saveCredToServer(carrierId, cred);
        }, 1200);
      });
      return () => Object.values(credSaveTimers.current).forEach(clearTimeout);
    }, [credentials, saveCredToServer]);

    // Poll Supabase for live session + agent state when LIVE
    useEffect(() => {
      if (!window.AppData?.LIVE) return;
      let cancelled = false;
      const tick = async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) return;
          const me = window.me && window.me();
          if (!me?.rep_id) return;
          const { data: rows } = await sb.from("carrier_session_status").select("*").eq("rep_id", me.rep_id);
          if (!cancelled && rows) {
            const next = {};
            rows.forEach(r => { next[r.carrier_id] = { capturedAt: r.captured_at, freshness: r.freshness, lastFailure: r.last_failure, lastQuoteAt: r.last_quote_at }; });
            setSessions(prev => ({ ...prev, ...next }));
          }
          const { data: settingsRow } = await sb.from("auto_quoter_settings").select("agent_last_seen").eq("rep_id", me.rep_id).single();
          if (!cancelled && settingsRow) setAgentLastSeen(settingsRow.agent_last_seen);
        } catch (e) { /* ignore */ }
      };
      tick();
      const handle = setInterval(tick, 5000);
      return () => { cancelled = true; clearInterval(handle); };
    }, []);

    // ── Capture / inspect dispatch ─────────────────────────────────────────
    const captureSession = async (carrierId) => {
      setCapturingCarrier(carrierId);
      const me = window.me && window.me();
      const sb = window.getSupabase && window.getSupabase();
      if (window.AppData?.LIVE && sb && me?.rep_id) {
        try {
          await sb.from("auto_quote_requests").insert({
            rep_id: me.rep_id,
            request_type: "capture_session",
            carrier_id: carrierId,
            profile: {},
            carriers: [carrierId],
            status: "queued",
          });
          window.toast && window.toast(`Capture queued · open the headed Chromium window on your machine and log in to ${carrierId}`, "info");
        } catch (e) {
          window.toast && window.toast(`Capture queue failed: ${e.message}`, "warn");
          setCapturingCarrier(null);
          return;
        }
      } else {
        // Demo mode: simulate a successful capture after 2s
        setTimeout(() => {
          setSessions(prev => ({ ...prev, [carrierId]: { capturedAt: new Date().toISOString(), freshness: "fresh" } }));
          setCapturingCarrier(null);
          window.toast && window.toast(`Demo: ${carrierId} session captured`, "success");
        }, 2000);
        return;
      }
      // Live mode: poll session status until it flips to fresh or 90s timeout
      const start = Date.now();
      const handle = setInterval(async () => {
        if (Date.now() - start > 90_000) { clearInterval(handle); setCapturingCarrier(null); return; }
        try {
          const { data: rows } = await sb.from("carrier_session_status").select("*").eq("rep_id", me.rep_id).eq("carrier_id", carrierId);
          if (rows && rows[0]?.freshness === "fresh") {
            setSessions(prev => ({ ...prev, [carrierId]: { capturedAt: rows[0].captured_at, freshness: rows[0].freshness } }));
            clearInterval(handle);
            setCapturingCarrier(null);
            window.toast && window.toast(`${carrierId} session captured`, "success");
          }
        } catch (e) { /* ignore */ }
      }, 3000);
    };

    const inspectForm = async (carrierId) => {
      const me = window.me && window.me();
      const sb = window.getSupabase && window.getSupabase();
      if (window.AppData?.LIVE && sb && me?.rep_id) {
        try {
          await sb.from("auto_quote_requests").insert({
            rep_id: me.rep_id,
            request_type: "inspect_form",
            carrier_id: carrierId,
            profile: {},
            carriers: [carrierId],
            status: "queued",
          });
          window.toast && window.toast(`Inspect queued · agent will dump ${carrierId} quote-form selectors`, "info");
        } catch (e) {
          window.toast && window.toast(`Inspect queue failed: ${e.message}`, "warn");
        }
      } else {
        window.toast && window.toast("Inspect form requires LIVE mode + a captured session", "warn");
      }
    };

    const setCarrierCred = (carrierId, field, value) => {
      setCredentials(prev => ({
        ...prev,
        [carrierId]: { ...(prev[carrierId] || {}), [field]: value },
      }));
    };

    // Wipe saved creds for a carrier — clears localStorage row + deletes the
    // matching connector_vault row (RLS-scoped: user can only delete their own).
    // Surface 1 calls this from the "Clear" button on each Credentials row.
    const clearCarrierCred = async (carrierId, carrierName) => {
      if (!confirm(`Clear saved login for ${carrierName}? This deletes the server-side credential row too.`)) return;
      // 1) Cancel any pending debounced save so it doesn't resurrect the row.
      if (credSaveTimers.current[carrierId]) {
        clearTimeout(credSaveTimers.current[carrierId]);
        delete credSaveTimers.current[carrierId];
      }
      // 2) Local wipe.
      setCredentials(prev => {
        const next = { ...prev };
        delete next[carrierId];
        return next;
      });
      // 3) Server wipe — direct delete via Supabase client (RLS gates to own rows).
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (sb) {
          const { error } = await sb
            .from("connector_vault")
            .delete()
            .eq("provider", `carrier_${carrierId}`);
          if (error) throw error;
        }
        window.toast && window.toast(`${carrierName} login cleared`, "success");
      } catch (e) {
        window.toast && window.toast(`Cleared locally · server delete failed: ${e.message}`, "warn");
      }
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

      // Snapshot profile with derived totalInches so scrapers + RateEngine
      // get a single canonical height value (some carriers want raw inches,
      // others want ft/in pairs — we send both).
      const profileSnap = {
        ...profile,
        heightInches: totalInches,
        heightFeet: profile.heightFeet,
        heightInchesPart: profile.heightInches,
      };
      const newRequest = {
        id: reqId, profile: profileSnap, carriers: enabled,
        status: "queued", createdAt: new Date().toISOString(),
        results: [],
      };
      setRequests(prev => [newRequest, ...prev].slice(0, 30));
      setActiveRequest(newRequest);

      // ALWAYS run the local RateEngine so the rep sees an instant quote
      // even when no carrier scraper has selectors mapped or the local agent
      // isn't installed yet. If LIVE, ALSO queue the request so the local
      // agent (when running) can push a real scraped premium that overrides
      // the engine estimate.
      simulateAgent(newRequest);

      if (window.AppData?.LIVE) {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (sb) {
            const me = window.me && window.me();
            const { data } = await sb.from("auto_quote_requests").insert({
              rep_id: me?.rep_id, profile: profileSnap, carriers: enabled, status: "queued",
            }).select().single();
            if (data?.id) {
              setRequests(prev => prev.map(r => r.id === reqId ? { ...r, id: data.id, supabaseId: data.id } : r));
            }
          }
        } catch (_e) { /* engine results already streaming, no user impact */ }
      }
      window.toast && window.toast(`Quote running · ${enabled.length} carrier${enabled.length === 1 ? "" : "s"} (engine estimate; live agent overrides when available)`, "info");
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

    // Per-OS install commands. Default OS is auto-detected from userAgent.
    const detectOs = () => {
      const ua = (navigator.userAgent || "").toLowerCase();
      if (ua.includes("mac")) return "macos";
      if (ua.includes("win")) return "windows";
      return "linux";
    };
    const [osTab, setOsTab] = useState(detectOs);
    const INSTALL_CMDS = {
      macos:   `KOINO_REP_ID="${repId}" curl -sSL "https://koino-insurance-os.vercel.app/agent/install.sh" | bash`,
      linux:   `KOINO_REP_ID="${repId}" curl -sSL "https://koino-insurance-os.vercel.app/agent/install.sh" | bash`,
      windows: `$env:KOINO_REP_ID="${repId}"; iwr -useb "https://koino-insurance-os.vercel.app/agent/install.ps1" | iex`,
    };
    const OS_LABELS = {
      macos:   { label: "macOS",   sub: "bash · launchd" },
      linux:   { label: "Linux",   sub: "bash · systemd" },
      windows: { label: "Windows", sub: "PowerShell · Task Scheduler" },
    };
    const installCmd = INSTALL_CMDS[osTab];

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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr 0.7fr 1fr", gap: 8 }}>
                  <Shared.Field label="Age">
                    <input className="text-input" type="number" value={profile.age} onChange={(e) => setProfile(p => ({ ...p, age: +e.target.value }))}/>
                  </Shared.Field>
                  <Shared.Field label="Gender">
                    <Shared.Select value={profile.gender} onChange={(v) => setProfile(p => ({ ...p, gender: v }))} options={[{ v: "F", l: "Female" }, { v: "M", l: "Male" }]}/>
                  </Shared.Field>
                  <Shared.Field label="Height (ft)">
                    <input className="text-input" type="number" min="3" max="7" value={profile.heightFeet} onChange={(e) => setProfile(p => ({ ...p, heightFeet: +e.target.value }))}/>
                  </Shared.Field>
                  <Shared.Field label="Height (in)">
                    <input className="text-input" type="number" min="0" max="11" value={profile.heightInches} onChange={(e) => setProfile(p => ({ ...p, heightInches: +e.target.value }))}/>
                  </Shared.Field>
                  <Shared.Field label="Weight (lbs)">
                    <input className="text-input" type="number" value={profile.weightLbs} onChange={(e) => setProfile(p => ({ ...p, weightLbs: +e.target.value }))}/>
                  </Shared.Field>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: -4 }}>
                  {profile.heightFeet}'{profile.heightInches}" · {totalInches} in · BMI {(((profile.weightLbs || 0) / Math.max(1, totalInches * totalInches)) * 703).toFixed(1)}
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

                <Shared.Field label={`Prescriptions${profile.prescriptions.length ? ` · ${profile.prescriptions.length}` : ""}`}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                    {profile.prescriptions.map((rx, i) => (
                      <span key={i} className="chip" style={{ fontSize: 10.5, padding: "3px 8px" }}>
                        {rx}
                        <button onClick={() => setProfile(p => ({ ...p, prescriptions: p.prescriptions.filter((_, j) => j !== i) }))}
                          style={{ marginLeft: 6, background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <input className="text-input" placeholder="Type med + Enter (e.g. metformin 500mg, lisinopril, eliquis…)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target.value.trim()) {
                        const v = e.target.value.trim();
                        setProfile(p => ({ ...p, prescriptions: [...p.prescriptions, v] }));
                        e.target.value = "";
                        e.preventDefault();
                      }
                    }}/>
                  {/* Quick chips for common ones — saves typing the top 12 */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {["metformin", "lisinopril", "atorvastatin", "amlodipine", "metoprolol", "levothyroxine", "omeprazole", "albuterol", "warfarin", "eliquis", "insulin", "trulicity"].map(rx => {
                      const has = profile.prescriptions.includes(rx);
                      return (
                        <button key={rx} onClick={() => setProfile(p => ({ ...p, prescriptions: has ? p.prescriptions.filter(x => x !== rx) : [...p.prescriptions, rx] }))}
                          className="btn"
                          style={{ padding: "3px 8px", fontSize: 10.5, background: has ? "var(--accent-heat)" : "var(--bg-raised)", color: has ? "white" : "var(--text-secondary)" }}>
                          {rx}
                        </button>
                      );
                    })}
                  </div>
                </Shared.Field>

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
              <div className="panel-h"><Icons.Sparkles size={13} style={{ color: "var(--accent-money)" }}/><h3>One-line install</h3>
                {agentLastSeen && (Date.now() - new Date(agentLastSeen).getTime() < 60_000)
                  ? <span className="chip chip-money" style={{ marginLeft: "auto", fontSize: 10 }}>agent online · {formatAgo(agentLastSeen)}</span>
                  : agentLastSeen
                    ? <span className="chip" style={{ marginLeft: "auto", fontSize: 10, color: "var(--state-warning)" }}>agent stale · last {formatAgo(agentLastSeen)}</span>
                    : <span className="chip" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-tertiary)" }}>agent not seen</span>}
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Run this on the rep's machine. Installs Python deps, Chromium, the local agent, and a service so it restarts on reboot.
                </div>

                {/* ── Liquid glass OS selector ─────────────────────────────── */}
                <div className="os-glass-bar" role="tablist" aria-label="Operating system">
                  {["macos", "linux", "windows"].map(os => {
                    const active = osTab === os;
                    return (
                      <button key={os} role="tab" aria-selected={active} onClick={() => setOsTab(os)}
                        className={"os-glass-btn" + (active ? " is-active" : "")}>
                        <div className="os-glass-label">{OS_LABELS[os].label}</div>
                        <div className="os-glass-sub">{OS_LABELS[os].sub}</div>
                      </button>
                    );
                  })}
                </div>

                <pre className="mono" style={{ background: "var(--bg-raised)", padding: 12, borderRadius: 6, fontSize: 11.5, overflow: "auto", margin: 0, lineHeight: 1.55 }}>
                  {installCmd}
                </pre>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => { navigator.clipboard.writeText(installCmd); window.toast && window.toast(`${OS_LABELS[osTab].label} install command copied`, "success"); }}>
                    <Icons.Copy size={11}/> Copy
                  </button>
                  {osTab === "windows" && (
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", alignSelf: "center", flex: 1 }}>
                      Open <strong>PowerShell</strong> (not Command Prompt). If blocked: run <code style={{ fontSize: 10 }}>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</code> once.
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                  Files installed to <code style={{ fontSize: 10.5 }}>{osTab === "windows" ? "%LOCALAPPDATA%\\Koino\\auto-quoter\\" : "~/.koino/auto-quoter/"}</code>.
                  Credentials stored locally — never leave your machine.
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
              <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
                {SUPPORTED_CARRIERS.map(c => {
                  const enabled = settings.enabledCarriers.includes(c.id);
                  const sess = sessions[c.id];
                  const sessionFresh = sess?.freshness === "fresh";
                  const sessionStale = sess?.freshness === "stale" || sess?.freshness === "expired";
                  const sessionAge = sess?.capturedAt ? formatAgo(sess.capturedAt) : null;
                  const isCapturing = capturingCarrier === c.id;
                  const sessionChipColor =
                    !c.requiresLogin ? "var(--text-tertiary)"
                    : sessionFresh ? "var(--accent-money)"
                    : sessionStale ? "var(--state-warning)"
                    : "var(--state-danger)";
                  const sessionChipText =
                    !c.requiresLogin ? "no login needed"
                    : sessionFresh ? `session · ${sessionAge}`
                    : sessionStale ? `stale · re-capture`
                    : "no session";
                  return (
                    <div key={c.id} style={{
                      display: "flex", flexDirection: "column", gap: 8, padding: 12,
                      background: enabled ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-raised))" : "var(--bg-raised)",
                      border: enabled ? "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" : "1px solid var(--border-subtle)",
                      borderRadius: 6,
                    }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={enabled} onChange={() => toggleCarrier(c.id)} style={{ marginTop: 2 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2 }}>{c.note}</div>
                          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {c.products.map(p => <span key={p} className="chip" style={{ fontSize: 9.5 }}>{p}</span>)}
                            <span className="chip" style={{ fontSize: 9.5, color: sessionChipColor }}>{sessionChipText}</span>
                          </div>
                          {sess?.lastFailure && (
                            <div style={{ fontSize: 10, color: "var(--state-danger)", marginTop: 4 }} title={sess.lastFailure}>
                              ⚠ {(sess.lastFailure || "").slice(0, 60)}
                            </div>
                          )}
                        </div>
                      </label>
                      {c.requiresLogin && (
                        <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}>
                          <button
                            className="btn"
                            disabled={isCapturing}
                            onClick={() => captureSession(c.id)}
                            style={{ flex: 1, padding: "6px 10px", fontSize: 11, opacity: isCapturing ? 0.6 : 1 }}
                            title="Open headed browser, log in once, save the session for headless quotes."
                          >
                            <Icons.Shield size={11}/>
                            {isCapturing ? "waiting for login…" : (sess?.capturedAt ? "Re-capture" : "Capture login")}
                          </button>
                          <button
                            className="btn btn-ghost"
                            disabled={!sess?.capturedAt}
                            onClick={() => inspectForm(c.id)}
                            style={{ padding: "6px 10px", fontSize: 11, opacity: sess?.capturedAt ? 1 : 0.5 }}
                            title="Dump the carrier's quote-form selectors so the scraper can be repaired after a portal redesign."
                          >
                            <Icons.Search size={11}/> Inspect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── CREDENTIALS TAB ──────────────────────────────────────────────── */}
        {/* Density-first rebuild (2026-05-24):                                 */}
        {/*  · filter input filters the 14-carrier list down to 1-2 matches    */}
        {/*  · status pill per row shows (saved · 2d ago) or (not saved)       */}
        {/*  · username + password inline-edit, always visible, no accordion   */}
        {/*  · per-row Test login button — fires capture_session request       */}
        {/*  · per-row Clear button — wipes localStorage + connector_vault row */}
        {tab === "credentials" && (() => {
          const filterLower = credFilter.trim().toLowerCase();
          const credCarriers = SUPPORTED_CARRIERS
            .filter(c => c.requiresLogin)
            .filter(c => !filterLower || c.name.toLowerCase().includes(filterLower) || c.id.includes(filterLower));
          return (
            <div className="panel">
              <div className="panel-h">
                <Icons.Shield size={13}/><h3>Carrier producer credentials</h3>
                <span className="meta" style={{ marginLeft: "auto" }}>{credCarriers.length} of {SUPPORTED_CARRIERS.filter(c => c.requiresLogin).length} · saved server-side, encrypted</span>
                <button className="btn" onClick={downloadCredsJson} style={{ marginLeft: 8 }} title="Download credentials.json for the local agent">
                  <Icons.ArrowUpRight size={11}/> Download .json
                </button>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0 6px" }}>
                  <Icons.Search size={12} style={{ color: "var(--text-tertiary)" }}/>
                  <input
                    className="text-input"
                    value={credFilter}
                    onChange={(e) => setCredFilter(e.target.value)}
                    placeholder="filter carriers… (humana, aetna, aig…)"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  {credFilter && (
                    <button className="btn btn-ghost" onClick={() => setCredFilter("")} style={{ padding: "4px 8px", fontSize: 11 }}>
                      <Icons.X size={10}/> clear filter
                    </button>
                  )}
                </div>

                {credCarriers.length === 0 && (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    No carriers match "{credFilter}".
                  </div>
                )}

                {credCarriers.map(c => {
                  const cred       = credentials[c.id] || {};
                  const hasUser    = !!cred.username;
                  const hasPass    = !!cred.password || !!cred._has_password;
                  const savedAt    = cred._saved_at;
                  const isCapturing = capturingCarrier === c.id;
                  const sess        = sessions[c.id];
                  const sessFresh   = sess?.freshness === "fresh";
                  const sessStale   = sess?.freshness === "stale" || sess?.freshness === "expired";

                  // Status pill: green when both username + password persist
                  // server-side (saved), yellow when partial, grey when none.
                  const status =
                    hasUser && hasPass ? { l: savedAt ? `saved · ${formatAgo(savedAt)}` : "saved", c: "var(--accent-money)" }
                    : hasUser           ? { l: "user only · enter password", c: "var(--state-warning)" }
                                        : { l: "not saved",     c: "var(--text-tertiary)" };

                  return (
                    <div key={c.id} style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1.2fr) minmax(140px, 1.4fr) minmax(120px, 1.2fr) auto",
                      gap: 8, alignItems: "center",
                      padding: "8px 10px",
                      background: hasUser ? "color-mix(in oklch, var(--accent-money) 4%, var(--bg-raised))" : "var(--bg-raised)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 6,
                    }}>
                      {/* col 1 — carrier name + status pill */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                          <span className="chip" style={{ fontSize: 9.5, color: status.c, padding: "1px 6px" }}>{status.l}</span>
                          {sessFresh && <span className="chip" style={{ fontSize: 9.5, color: "var(--accent-money)", padding: "1px 6px" }}>session fresh</span>}
                          {sessStale && <span className="chip" style={{ fontSize: 9.5, color: "var(--state-warning)", padding: "1px 6px" }}>session stale</span>}
                        </div>
                      </div>
                      {/* col 2 — username */}
                      <input
                        className="text-input"
                        value={cred.username || ""}
                        onChange={(e) => setCarrierCred(c.id, "username", e.target.value)}
                        placeholder="username / producer email"
                        style={{ fontSize: 12 }}
                        autoComplete="off"
                      />
                      {/* col 3 — password */}
                      <input
                        className="text-input"
                        type="password"
                        value={cred.password || ""}
                        onChange={(e) => setCarrierCred(c.id, "password", e.target.value)}
                        placeholder={cred._has_password ? "•••••••• (saved · type to replace)" : "password"}
                        style={{ fontSize: 12 }}
                        autoComplete="new-password"
                      />
                      {/* col 4 — action buttons */}
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn"
                          onClick={() => captureSession(c.id)}
                          disabled={isCapturing || !hasUser}
                          title={hasUser ? "Open Chromium, run a test login, capture the session cookie" : "Save a username first"}
                          style={{ padding: "5px 8px", fontSize: 10.5, opacity: (!hasUser || isCapturing) ? 0.55 : 1 }}
                        >
                          <Icons.Shield size={10}/>
                          {isCapturing ? "testing…" : (sess?.capturedAt ? "Re-test" : "Test login")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => clearCarrierCred(c.id, c.name)}
                          disabled={!hasUser && !hasPass && !savedAt}
                          title="Clear saved login for this carrier (deletes local + server credentials)"
                          style={{ padding: "5px 8px", fontSize: 10.5, opacity: (!hasUser && !hasPass && !savedAt) ? 0.4 : 1 }}
                        >
                          <Icons.X size={10}/> Clear
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 6, padding: 10, background: "color-mix(in oklch, var(--accent-money) 6%, var(--bg-raised))", border: "1px solid color-mix(in oklch, var(--accent-money) 20%, transparent)", borderRadius: 6, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--accent-money)" }}>Auto-save:</strong> changes persist within 1.2s of your last keystroke. Passwords are stored encrypted in <code style={{ fontSize: 10.5 }}>connector_vault</code> (server) and your browser's localStorage (local fallback). Server passwords are decrypted only when your local agent fetches them at quote-time.
                </div>
              </div>
            </div>
          );
        })()}

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
