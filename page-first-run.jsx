/* page-first-run.jsx — User-type picker + branched onboarding wizards.
 *
 * Renders ABOVE the main app whenever the signed-in user lacks a complete
 * agency setup. Three branches:
 *
 *   1. "Start a new agency" → multi-step AgencyWizard (8 steps)
 *      Uses RPCs `create_agency_for_owner` (step 1 commit) and
 *      `update_agency_onboarding` (subsequent steps + final complete).
 *      User becomes owner of the agency they create.
 *
 *   2. "Join an existing agency" → invite-token entry → existing
 *      `redeem_invite` RPC. ProducerOnboardingWizard handles the rest.
 *
 *   3. "Solo producer" → creates an agency-of-one with sensible defaults.
 *      Same RPC as branch 1, but skips most steps.
 *
 * After completion, sets `repflow.firstRunDone` and reloads → App.jsx auth
 * sync routes to the proper dashboard for the new role.
 */

(function () {
  const { useState, useEffect, useMemo } = React;

  function FirstRun({ session, onDone }) {
    // If the user arrived with a pending invite token (from sessionStorage,
    // stashed by AuthGate before the magic-link redirect), skip the picker
    // and route them straight into JoinFlow. Invited users are always
    // joining an existing agency — they shouldn't see the "Start a new
    // agency" / "Solo" cards at all.
    const hasPendingInvite = (() => {
      try { return !!sessionStorage.getItem("repflow.pending_invite"); } catch { return false; }
    })();
    const [path, setPath] = useState(hasPendingInvite ? "join" : null);

    if (!path) return <UserTypePicker onPick={setPath}/>;
    if (path === "join")  return <JoinFlow session={session} onDone={onDone} onBack={() => setPath(null)}/>;
    if (path === "solo")  return <SoloFlow session={session} onDone={onDone} onBack={() => setPath(null)}/>;
    if (path === "owner") return <AgencyWizard session={session} onDone={onDone} onBack={() => setPath(null)}/>;
    return null;
  }

  // ── User-type picker (3 cards) ──────────────────────────────────────────
  function UserTypePicker({ onPick }) {
    return (
      <div className="login-shell" style={{ paddingTop: 60 }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}>Welcome to Repflow</div>
            <div style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: 14 }}>
              Pick what fits — you can always add more later.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Card
              icon={<Icons.Building size={28}/>}
              title="Start a new agency"
              tag="OWNER / IMO"
              desc="You're spinning up a new IMO/agency. Configure brand, products, carriers, and team — invite producers when you're ready."
              cta="Create agency"
              onClick={() => onPick("owner")}
            />
            <Card
              icon={<Icons.Mail size={28}/>}
              title="Join an existing agency"
              tag="PRODUCER / MANAGER"
              desc="You got an invite link or token from your upline. Paste it and we'll redeem and route you into your team."
              cta="Enter invite"
              onClick={() => onPick("join")}
            />
            <Card
              icon={<Icons.Phone size={28}/>}
              title="Solo producer"
              tag="INDEPENDENT"
              desc="One-person shop. We'll create an agency-of-one with sensible defaults, you can add carriers and start dialing in 60 seconds."
              cta="Solo setup"
              onClick={() => onPick("solo")}
            />
          </div>
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--text-tertiary)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>Your agency starts at zero — no demo data, no leftover sample leads.</div>
            <button className="btn btn-ghost" style={{ alignSelf: "center" }} onClick={() => window.signOut && window.signOut()}>
              <Icons.X size={11}/> Use a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  function Card({ icon, title, tag, desc, cta, onClick }) {
    return (
      <button onClick={onClick} className="panel" style={{
        display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left",
        padding: 20, gap: 12, cursor: "pointer", border: "1px solid var(--border-subtle)", background: "var(--bg-elevated)",
        transition: "transform 120ms ease, border-color 120ms ease",
      }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in oklch, var(--accent-money) 50%, transparent)"; }}
         onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, background: "color-mix(in oklch, var(--accent-money) 15%, var(--bg-raised))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-money)" }}>{icon}</div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{tag}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55, flex: 1 }}>{desc}</div>
        <div className="btn btn-primary" style={{ justifyContent: "center", padding: "8px 14px", marginTop: 4 }}>
          {cta} <Icons.ArrowUpRight size={12}/>
        </div>
      </button>
    );
  }

  // ── Branch 1: Owner — multi-step agency wizard ──────────────────────────
  function AgencyWizard({ session, onDone, onBack }) {
    const [step, setStep]   = useState(0);
    const [agencyId, setId] = useState(null);
    const [busy, setBusy]   = useState(false);
    const [err,  setErr]    = useState("");
    const [form, setForm]   = useState({
      name: "", slug: "", owner_name: "",
      ein: "", npn: "", website: "", phone: "",
      address_line1: "", address_line2: "", city: "", state: "", zip: "",
      primary_state: "", licensed_states: [],
      products: [], default_carriers: [],
      comp_model: "split", comp_default_split: 70,
      tpmo_disclosure: "", call_recording_consent: "one-party",
      brand_primary: "#22c55e", brand_dark: "#0f1115", logo_url: "",
      timezone: "America/New_York", plan: "trial",
    });
    const set = (patch) => setForm(f => ({ ...f, ...patch }));

    const STEPS = [
      "Identity", "Contact", "Licensing", "Products",
      "Carriers", "Compensation", "Compliance", "Branding", "Plan", "Review",
    ];

    const persist = async (complete = false) => {
      setBusy(true); setErr("");
      try {
        const sb = window.getSupabase();
        const payload = { ...form, complete };
        if (!agencyId) {
          const { data, error } = await sb.rpc("create_agency_for_owner", { payload });
          if (error) throw error;
          setId(data);
        } else {
          const { error } = await sb.rpc("update_agency_onboarding", { p_agency_id: agencyId, payload });
          if (error) throw error;
        }
      } catch (e) { setErr(String(e.message || e)); throw e; }
      finally { setBusy(false); }
    };

    const next = async () => {
      try { await persist(false); setStep(s => s + 1); } catch {}
    };
    const finish = async () => {
      try {
        await persist(true);
        try { sessionStorage.setItem("repflow.firstRunDone", "1"); } catch {}
        window.toast && window.toast(`${form.name} is live · welcome aboard.`, "success");
        onDone && onDone();
      } catch {}
    };

    const ALL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
    const toggleState   = (s) => set({ licensed_states: form.licensed_states.includes(s) ? form.licensed_states.filter(x => x !== s) : [...form.licensed_states, s] });
    const toggleProduct = (p) => set({ products: form.products.includes(p) ? form.products.filter(x => x !== p) : [...form.products, p] });
    const toggleCarrier = (c) => set({ default_carriers: form.default_carriers.includes(c) ? form.default_carriers.filter(x => x !== c) : [...form.default_carriers, c] });

    const PRODUCTS = [
      { v: "medsupp", l: "Medicare Supplement" }, { v: "mapd", l: "Medicare Advantage" },
      { v: "pdp", l: "Part D Rx" }, { v: "fe", l: "Final Expense" },
      { v: "term", l: "Term Life" }, { v: "wl", l: "Whole Life" },
      { v: "iul", l: "IUL" }, { v: "annuity", l: "Annuity / MYGA" },
      { v: "ltc", l: "LTC / Hybrid" }, { v: "aca", l: "ACA / Marketplace" },
      { v: "dental", l: "DVH" }, { v: "cancer", l: "Cancer / Heart-stroke" },
    ];
    const CARRIERS = [
      { v: "uhc", l: "UnitedHealthcare AARP" }, { v: "humana", l: "Humana" },
      { v: "aetna", l: "Aetna SRC" }, { v: "cigna", l: "Cigna (ARLIC)" },
      { v: "moo", l: "Mutual of Omaha" }, { v: "lumico", l: "Lumico" },
      { v: "aig", l: "Corebridge (AIG)" }, { v: "fg", l: "F&G" },
      { v: "transamerica", l: "Transamerica" }, { v: "ethos", l: "Ethos" },
      { v: "americanamicable", l: "American Amicable" }, { v: "instabrain", l: "Instabrain" },
      { v: "foresters", l: "Foresters" }, { v: "sbli", l: "SBLI" },
    ];

    return (
      <div className="login-shell" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="login-card" style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
                {form.name || "New agency"}
              </div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                {STEPS[step]} · step {step + 1} of {STEPS.length}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 3, marginBottom: 18 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent-money)" : "var(--bg-raised)" }}/>
            ))}
          </div>

          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Shared.Field label="Agency name"><input className="text-input" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your agency name"/></Shared.Field>
              <Shared.Field label="Slug (URL)"><input className="text-input" value={form.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="auto-derived if blank"/></Shared.Field>
              <Shared.Field label="Your name"><input className="text-input" value={form.owner_name} onChange={(e) => set({ owner_name: e.target.value })} placeholder="Your full name"/></Shared.Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Shared.Field label="EIN (optional now)"><input className="text-input" value={form.ein} onChange={(e) => set({ ein: e.target.value })}/></Shared.Field>
                <Shared.Field label="Agency NPN (optional now)"><input className="text-input" value={form.npn} onChange={(e) => set({ npn: e.target.value })}/></Shared.Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Shared.Field label="Phone"><input className="text-input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(512) 555-0100"/></Shared.Field>
                <Shared.Field label="Website"><input className="text-input" value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://atlasimo.com"/></Shared.Field>
              </div>
              <Shared.Field label="Address line 1"><input className="text-input" value={form.address_line1} onChange={(e) => set({ address_line1: e.target.value })}/></Shared.Field>
              <Shared.Field label="Address line 2"><input className="text-input" value={form.address_line2} onChange={(e) => set({ address_line2: e.target.value })}/></Shared.Field>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                <Shared.Field label="City"><input className="text-input" value={form.city} onChange={(e) => set({ city: e.target.value })}/></Shared.Field>
                <Shared.Field label="State"><input className="text-input" value={form.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2}/></Shared.Field>
                <Shared.Field label="ZIP"><input className="text-input" value={form.zip} onChange={(e) => set({ zip: e.target.value })}/></Shared.Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <Shared.Field label="Primary state"><input className="text-input" value={form.primary_state} onChange={(e) => set({ primary_state: e.target.value.toUpperCase() })} maxLength={2} style={{ width: 100 }} placeholder="TX"/></Shared.Field>
              <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)" }}>Click each state where the agency is licensed:</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ALL_STATES.map(s => (
                  <button key={s} onClick={() => toggleState(s)} className="btn"
                    style={{ padding: "5px 9px", fontSize: 11, background: form.licensed_states.includes(s) ? "var(--accent-money)" : "var(--bg-raised)", color: form.licensed_states.includes(s) ? "white" : "var(--text-secondary)" }}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)" }}>{form.licensed_states.length} state{form.licensed_states.length === 1 ? "" : "s"}</div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Pick the product lines this agency writes:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PRODUCTS.map(p => {
                  const on = form.products.includes(p.v);
                  return (
                    <label key={p.v} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", fontSize: 12.5,
                      background: on ? "color-mix(in oklch, var(--accent-money) 12%, var(--bg-raised))" : "var(--bg-raised)",
                      border: on ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)",
                      borderRadius: 6,
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggleProduct(p.v)}/>
                      {p.l}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Pre-select carriers your producers usually quote (you can change this anytime):</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {CARRIERS.map(c => {
                  const on = form.default_carriers.includes(c.v);
                  return (
                    <label key={c.v} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", fontSize: 12.5,
                      background: on ? "color-mix(in oklch, var(--accent-money) 12%, var(--bg-raised))" : "var(--bg-raised)",
                      border: on ? "1px solid color-mix(in oklch, var(--accent-money) 35%, transparent)" : "1px solid var(--border-subtle)",
                      borderRadius: 6,
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggleCarrier(c.v)}/>
                      {c.l}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Shared.Field label="Comp model">
                <Shared.Select value={form.comp_model} onChange={(v) => set({ comp_model: v })} options={[
                  { v: "split", l: "% Split (most common)" }, { v: "salary", l: "Salary" }, { v: "hybrid", l: "Salary + bonus" },
                ]}/>
              </Shared.Field>
              <Shared.Field label={`Default split — producer gets ${form.comp_default_split}%`}>
                <input type="range" min="40" max="95" step="1" value={form.comp_default_split} onChange={(e) => set({ comp_default_split: +e.target.value })} style={{ width: "100%" }}/>
              </Shared.Field>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>You can override per-producer or per-product later in Admin → Compensation.</div>
            </div>
          )}

          {step === 6 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Shared.Field label="Call recording consent">
                <Shared.Select value={form.call_recording_consent} onChange={(v) => set({ call_recording_consent: v })} options={[
                  { v: "one-party", l: "One-party (rep consent only)" }, { v: "two-party", l: "Two-party (both consent)" },
                ]}/>
              </Shared.Field>
              <Shared.Field label="TPMO disclosure (Med Adv / PDP only)">
                <textarea className="text-input" rows={4} value={form.tpmo_disclosure} onChange={(e) => set({ tpmo_disclosure: e.target.value })}
                  placeholder="We do not offer every plan available in your area..."/>
              </Shared.Field>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>The TPMO disclosure is auto-injected into call scripts when MAPD/PDP leads come up.</div>
            </div>
          )}

          {step === 7 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Shared.Field label="Primary brand color"><input className="text-input" type="color" value={form.brand_primary} onChange={(e) => set({ brand_primary: e.target.value })}/></Shared.Field>
                <Shared.Field label="Dark accent"><input className="text-input" type="color" value={form.brand_dark} onChange={(e) => set({ brand_dark: e.target.value })}/></Shared.Field>
              </div>
              <Shared.Field label="Logo URL (drop in later if blank)"><input className="text-input" value={form.logo_url} onChange={(e) => set({ logo_url: e.target.value })} placeholder="https://..."/></Shared.Field>
              <Shared.Field label="Timezone">
                <Shared.Select value={form.timezone} onChange={(v) => set({ timezone: v })} options={[
                  { v: "America/New_York", l: "Eastern" }, { v: "America/Chicago", l: "Central" },
                  { v: "America/Denver", l: "Mountain" }, { v: "America/Los_Angeles", l: "Pacific" },
                  { v: "America/Phoenix", l: "Arizona" }, { v: "America/Anchorage", l: "Alaska" },
                  { v: "Pacific/Honolulu", l: "Hawaii" },
                ]}/>
              </Shared.Field>
            </div>
          )}

          {step === 8 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                Select a starting plan for your agency. You can change this or add a custom domain later.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { id: "trial", name: "14-Day Free Trial", desc: "Full feature access, no card required today.", price: "$0" },
                  { id: "growth", name: "Growth", desc: "Up to 5 producers, auto-dialer included.", price: "$499/mo" },
                  { id: "scale", name: "Scale", desc: "Unlimited producers, AI co-pilot, custom docs.", price: "$1,299/mo" },
                  { id: "enterprise", name: "Enterprise", desc: "Custom IMO volume, dedicated OCI nodes.", price: "Custom" },
                ].map(p => (
                  <button key={p.id} className="panel" onClick={() => set({ plan: p.id })}
                    style={{
                      textAlign: "left", padding: 12, border: form.plan === p.id ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)",
                      background: form.plan === p.id ? "color-mix(in oklch, var(--accent-money) 8%, var(--bg-elevated))" : "var(--bg-elevated)",
                      transition: "border-color 120ms"
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "var(--accent-money)", fontWeight: 600 }}>{p.price}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{p.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                <Icons.Shield size={11}/> Subscription verification is currently in <strong>Manual Mode</strong>. Trials are auto-approved.
              </div>
            </div>
          )}

          {step === 9 && (
            <div>
              <div style={{ padding: 14, background: "var(--bg-raised)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6 }}>
                <div><strong>{form.name}</strong> · /{form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</div>
                <div style={{ color: "var(--text-tertiary)" }}>
                  {form.primary_state || "—"} · {form.licensed_states.length} state{form.licensed_states.length === 1 ? "" : "s"} licensed
                </div>
                <div style={{ marginTop: 6 }}>
                  <strong>{form.products.length}</strong> product line{form.products.length === 1 ? "" : "s"} ·{" "}
                  <strong>{form.default_carriers.length}</strong> carrier{form.default_carriers.length === 1 ? "" : "s"}
                </div>
                <div style={{ marginTop: 6, color: "var(--text-tertiary)" }}>
                  Plan: <span style={{ textTransform: "capitalize", color: "var(--accent-money)", fontWeight: 600 }}>{form.plan}</span> · {form.comp_default_split}% producer split
                </div>
              </div>
              <div style={{ marginTop: 12, padding: 12, background: "color-mix(in oklch, var(--accent-money) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)", borderRadius: 6, fontSize: 12, lineHeight: 1.55 }}>
                <Icons.Check size={12} style={{ color: "var(--accent-money)" }}/>{" "}
                Once you click <strong>Create agency</strong>, you'll land on the empty Owner dashboard. No demo data — your agency starts at zero.
              </div>
            </div>
          )}

          {err && (
            <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>{err}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={() => step === 0 ? onBack() : setStep(s => s - 1)} disabled={busy}>Back</button>
            <div style={{ flex: 1 }}/>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next} disabled={busy || (step === 0 && !form.name.trim())}>
                {busy ? "Saving…" : <>Continue <Icons.ArrowUpRight size={12}/></>}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={finish} disabled={busy}>
                {busy ? "Creating…" : <><Icons.Check size={12}/> Create agency</>}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Branch 2: Join via invite ───────────────────────────────────────────
  function JoinFlow({ session, onDone, onBack }) {
    const [token, setToken] = useState(() => {
      try {
        const stash = sessionStorage.getItem("repflow.pending_invite") || "";
        return stash;
      } catch { return ""; }
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState("");

    const redeem = async () => {
      if (!token.trim()) return;
      setBusy(true); setErr("");
      try {
        const sb = window.getSupabase();
        const { error } = await sb.rpc("redeem_invite", { p_token: token.trim() });
        if (error) throw error;
        try { sessionStorage.removeItem("repflow.pending_invite"); sessionStorage.setItem("repflow.firstRunDone", "1"); } catch {}
        window.toast && window.toast("Joined · welcome aboard.", "success");
        onDone && onDone();
      } catch (e) { setErr(String(e.message || e)); }
      finally { setBusy(false); }
    };

    return (
      <div className="login-shell">
        <div className="login-card">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>Redeem invite</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 4 }}>
              Paste the token your upline sent you. We'll route you into the right team and role automatically.
            </div>
          </div>
          <Shared.Field label="Invite token">
            <input className="text-input" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="abc123-def456-..." autoFocus
              onKeyDown={(e) => e.key === "Enter" && redeem()}/>
          </Shared.Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Back</button>
            <button className="btn btn-primary" onClick={redeem} disabled={busy || !token.trim()}
              style={{ flex: 1, justifyContent: "center", padding: "10px 14px" }}>
              {busy ? "Redeeming…" : <><Icons.Check size={12}/> Join agency</>}
            </button>
          </div>
          {err && <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
        </div>
      </div>
    );
  }

  // ── Branch 3: Solo producer ─────────────────────────────────────────────
  function SoloFlow({ session, onDone, onBack }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState("");
    const [form, setForm] = useState({
      name: "", state: "TX", products: ["medsupp"],
    });
    const set = (patch) => setForm(f => ({ ...f, ...patch }));

    const create = async () => {
      setBusy(true); setErr("");
      try {
        const sb = window.getSupabase();
        const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-solo";
        const payload = {
          name: form.name + " (Solo)", slug, plan: "solo",
          primary_state: form.state, licensed_states: [form.state],
          products: form.products, default_carriers: ["uhc", "humana"],
          comp_model: "split", comp_default_split: 100,
          call_recording_consent: "one-party",
          complete: true,
        };
        const { error } = await sb.rpc("create_agency_for_owner", { payload });
        if (error) throw error;
        try { sessionStorage.setItem("repflow.firstRunDone", "1"); } catch {}
        window.toast && window.toast("Solo agency live · let's dial.", "success");
        onDone && onDone();
      } catch (e) { setErr(String(e.message || e)); }
      finally { setBusy(false); }
    };

    return (
      <div className="login-shell">
        <div className="login-card" style={{ maxWidth: 480 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>Solo setup</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 4 }}>
              60-second config. Defaults you can change later.
            </div>
          </div>
          <Shared.Field label="Your name (used on agency)">
            <input className="text-input" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your full name"/>
          </Shared.Field>
          <Shared.Field label="Primary state">
            <input className="text-input" value={form.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2} style={{ width: 100 }}/>
          </Shared.Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Back</button>
            <button className="btn btn-primary" onClick={create} disabled={busy || !form.name.trim()}
              style={{ flex: 1, justifyContent: "center", padding: "10px 14px" }}>
              {busy ? "Creating…" : <><Icons.Check size={12}/> Create solo agency</>}
            </button>
          </div>
          {err && <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
        </div>
      </div>
    );
  }

  window.PageFirstRun = FirstRun;
})();
