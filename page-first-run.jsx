/* page-first-run.jsx — Agency-level onboarding wizard.
 *
 * Mounted by <AuthGate> in two situations:
 *   1. The signed-in user has NO agency_members row → user-type picker
 *      (Start a new agency · Join via invite · Continue as solo producer).
 *      Picking "Start" provisions a sub-agency via provision_sub_agency RPC,
 *      then drops the user into the 9-step wizard.
 *   2. The signed-in user IS the owner of an agency where
 *      v_agency_onboarding_status.onboarding_complete is FALSE → wizard
 *      resumes at the next_pending step.
 *
 * Backend contract (2026-05-11 schema):
 *   - public.agency_onboarding_steps     — one row per step per agency
 *   - public.connector_catalog            — config_schema + required_for_roles
 *   - public.role_agent_defaults          — required/suggested agents per role
 *   - rpc start_agency_onboarding(p_agency_id uuid) → jsonb
 *   - rpc complete_onboarding_step(p_agency_id, p_step_key, p_payload jsonb)
 *   - rpc suggested_agents_for_role(p_role text) → setof
 *   - rpc current_agency_id()             — viewer's primary agency
 *   - rpc viewer_agency_ids()             — viewer's accessible agencies
 *   - rpc provision_sub_agency(name, slug, tier, owner_email, primary_state, plan)
 *   - view v_agency_onboarding_status     — derived progress + next_pending
 *
 * Step order: profile → branding → carriers → products → connectors →
 *             agents_install → invite_team → billing → first_lead.
 *
 * Anti-theater: every step submit hits complete_onboarding_step. If an RPC
 * is missing (deployed-only schema mismatch) we surface the error in the
 * step UI rather than silently advancing. */

(function () {

const STEPS = [
  { key: "profile",        label: "Profile",        sub: "Agency details + NPN" },
  { key: "branding",       label: "Branding",       sub: "Logo + brand colors" },
  { key: "carriers",       label: "Carriers",       sub: "Who you're appointed with" },
  { key: "products",       label: "Products",       sub: "Lines of business" },
  { key: "connectors",     label: "Connectors",     sub: "Phone, email, payments" },
  { key: "agents_install", label: "AI agents",      sub: "Auto-pilot your queue" },
  { key: "invite_team",    label: "Invite team",    sub: "Add managers + reps" },
  { key: "billing",        label: "Billing",        sub: "Pick a plan" },
  { key: "first_lead",     label: "First lead",     sub: "See it work" },
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

/* ─── Status helpers ─────────────────────────────────────────────────────── */
async function fetchStatus(sb, agencyId) {
  // The view is keyed on agency_id (column may be `id` or `agency_id` depending
  // on the view definition — we try both because the doc names slug+name).
  try {
    const r = await sb.from("v_agency_onboarding_status")
      .select("*").eq("agency_id", agencyId).maybeSingle();
    if (r.data) return { status: r.data, error: null };
  } catch (e) { console.warn("[firstRun.statusByAgencyId]", e); }
  try {
    const r2 = await sb.from("v_agency_onboarding_status")
      .select("*").eq("id", agencyId).maybeSingle();
    if (r2.data) return { status: r2.data, error: null };
  } catch (e) { console.warn("[firstRun.statusById]", e); }
  // Fallback: read agency_onboarding_steps directly + derive next_pending
  try {
    const r3 = await sb.from("agency_onboarding_steps")
      .select("step_key, status, payload, sort_order")
      .eq("agency_id", agencyId);
    if (r3.error) throw r3.error;
    const rows = r3.data || [];
    const done = rows.filter(r => r.status === "completed").map(r => r.step_key);
    const ordered = STEPS.map(s => rows.find(r => r.step_key === s.key) || { step_key: s.key, status: "pending" });
    const next = ordered.find(r => r.status !== "completed")?.step_key || null;
    return {
      status: {
        onboarding_complete: next === null,
        complete_steps: done.length,
        total_steps: STEPS.length,
        next_pending: next,
        done_steps: done,
        pending_steps: ordered.filter(r => r.status !== "completed").map(r => r.step_key),
      },
      error: null,
    };
  } catch (e) {
    return { status: null, error: String(e?.message || e) };
  }
}

async function ensureStarted(sb, agencyId) {
  // Idempotent — start_agency_onboarding seeds step rows if absent.
  try { await sb.rpc("start_agency_onboarding", { p_agency_id: agencyId }); } catch (e) { console.warn("[firstRun.start_agency_onboarding]", e); }
}

async function completeStep(sb, agencyId, stepKey, payload) {
  const { data, error } = await sb.rpc("complete_onboarding_step", {
    p_agency_id: agencyId, p_step_key: stepKey, p_payload: payload || {},
  });
  if (error) throw error;
  return data;
}

/* ─── User-type picker (no membership yet) ───────────────────────────────── */
function StartPicker({ session, onPicked }) {
  const [mode, setMode] = React.useState("pick"); // pick | start | join | provisioning
  const [name, setName] = React.useState("");
  const [primaryState, setPrimaryState] = React.useState("");
  const [inviteToken, setInviteToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const sb = window.getSupabase();

  const startAgency = async (kind) => {
    if (!name.trim()) { setErr("Agency name is required."); return; }
    setBusy(true); setErr("");
    try {
      const slug = slugify(name);
      const { data, error } = await sb.rpc("provision_sub_agency", {
        p_name: name.trim(),
        p_slug: slug,
        p_tier: kind === "solo" ? "solo" : "agency",
        p_owner_email: session.user.email,
        p_primary_state: primaryState || null,
        p_plan: "trial",
      });
      if (error) throw error;
      // RPC returns either a uuid or jsonb { agency_id } — handle both
      const agencyId = (data && typeof data === "object") ? (data.agency_id || data.id) : data;
      if (!agencyId) throw new Error("Provision returned no agency_id");
      try { localStorage.setItem("repflow.active_agency", agencyId); } catch {}
      await ensureStarted(sb, agencyId);
      window.toast && window.toast(`${name} provisioned · let's set it up`, "success");
      onPicked({ agencyId, name: name.trim(), slug, primaryState });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const joinViaToken = async () => {
    if (!inviteToken.trim()) { setErr("Paste the invite token."); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await sb.rpc("redeem_invite", { p_token: inviteToken.trim() });
      if (error) throw error;
      window.toast && window.toast("Invite redeemed · welcome", "success");
      onPicked({ joined: true });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="login-shell">
      <div className="login-card" style={{ maxWidth: 540 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Welcome to Repflow</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Signed in as {session?.user?.email}</div>
          </div>
        </div>

        {mode === "pick" && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
              How do you want to use Repflow?
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button className="btn" style={{ justifyContent: "flex-start", padding: 14, height: "auto" }} onClick={() => setMode("start")}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>Start a new agency</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>You're the owner. Recruit reps + appoint carriers under your IMO.</div>
                </div>
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", padding: 14, height: "auto" }} onClick={() => setMode("join")}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>Join with an invite</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>You got a link or token from a manager or upline.</div>
                </div>
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", padding: 14, height: "auto" }} onClick={() => { setName(session?.user?.email?.split("@")?.[0] || "My book"); setMode("start"); /* solo kind below */ }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>I'm a solo producer</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>Just me. No team yet. Repflow as my book.</div>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === "start" && (
          <>
            <Shared.Field label="Agency name">
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas Insurance Group" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Resident state" hint="The state of your producer license">
              <Shared.Select value={primaryState} onChange={setPrimaryState} options={[{ v: "", l: "Pick one…" }, ...US_STATES.map(s => ({ v: s, l: s }))]}/>
            </Shared.Field>
            {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMode("pick"); setErr(""); }} disabled={busy}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => startAgency("agency")} disabled={busy || !name.trim()}>
                {busy ? "Provisioning…" : "Create agency →"}
              </button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <Shared.Field label="Invite token" hint="The string after ?invite= in the link you got">
              <input className="text-input" value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="abc123…" autoFocus/>
            </Shared.Field>
            {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMode("pick"); setErr(""); }} disabled={busy}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={joinViaToken} disabled={busy || !inviteToken.trim()}>
                {busy ? "Redeeming…" : "Join agency →"}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="login-foot">Repflow · Insurance OS</div>
    </div>
  );
}

/* ─── Wizard chrome ──────────────────────────────────────────────────────── */
function WizardChrome({ agencyName, currentKey, doneSet, totalSteps, children }) {
  const idx = STEPS.findIndex(s => s.key === currentKey);
  const step = STEPS[idx] || STEPS[0];
  return (
    <div className="login-shell" style={{ alignItems: "flex-start", paddingTop: 36 }}>
      <div className="login-card" style={{ maxWidth: 720, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div className="sb-brand-mark" style={{ width: 32, height: 32, fontSize: 16 }}>R</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>{agencyName || "Your agency"}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{step.label} · step {idx + 1} of {STEPS.length}</div>
          </div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>{doneSet.size}/{totalSteps || STEPS.length}</div>
        </div>

        {/* progress dots */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {STEPS.map((s, i) => {
            const isDone = doneSet.has(s.key);
            const isHere = s.key === currentKey;
            return (
              <div key={s.key} title={s.label} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: isDone ? "var(--accent-money)" : isHere ? "var(--accent-info)" : "var(--bg-raised)",
              }}/>
            );
          })}
        </div>

        <div style={{ marginBottom: 6, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>{step.sub}</div>
        <div style={{ height: 1, background: "var(--border-subtle)", margin: "10px 0 14px" }}/>

        {children}
      </div>
      <div className="login-foot" style={{ marginTop: 14 }}>Repflow · Insurance OS</div>
    </div>
  );
}

/* ─── Step renderers ─────────────────────────────────────────────────────── */
function StepProfile({ agency, onSubmit, busy, err }) {
  const [form, setForm] = React.useState({
    legal_name: agency?.name || "",
    npn: "", ein: "", phone: "", email: "",
    address_line1: "", address_city: "", address_state: agency?.primaryState || "", address_zip: "",
  });
  const valid = form.legal_name.trim().length > 1;
  return (
    <>
      <Shared.Field label="Legal name"><input className="text-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} autoFocus/></Shared.Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Shared.Field label="NPN" hint="National Producer Number (8 digits)"><input className="text-input" value={form.npn} onChange={(e) => setForm({ ...form, npn: e.target.value.replace(/\D/g, "") })} placeholder="19384726"/></Shared.Field>
        <Shared.Field label="EIN" hint="Federal tax ID (optional)"><input className="text-input" value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} placeholder="12-3456789"/></Shared.Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Shared.Field label="Main phone"><input className="text-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (404) 555-0142"/></Shared.Field>
        <Shared.Field label="Contact email"><input className="text-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ops@atlasimo.com"/></Shared.Field>
      </div>
      <Shared.Field label="Street address"><input className="text-input" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="100 Peachtree St NE"/></Shared.Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
        <Shared.Field label="City"><input className="text-input" value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} placeholder="Atlanta"/></Shared.Field>
        <Shared.Field label="State"><Shared.Select value={form.address_state} onChange={(v) => setForm({ ...form, address_state: v })} options={[{ v: "", l: "—" }, ...US_STATES.map(s => ({ v: s, l: s }))]}/></Shared.Field>
        <Shared.Field label="ZIP"><input className="text-input" value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} placeholder="30303"/></Shared.Field>
      </div>
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={!valid || busy} onClick={() => onSubmit(form)}>
        {busy ? "Saving…" : "Save profile + continue →"}
      </button>
    </>
  );
}

function StepBranding({ onSubmit, busy, err }) {
  const [form, setForm] = React.useState({ logo_url: "", primary_color: "#0a8c61", dark_color: "#0c0d11" });
  return (
    <>
      <Shared.Field label="Logo URL" hint="Drop a hosted image URL — Vercel Blob, S3, public Drive, etc."><input className="text-input" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…/logo.png"/></Shared.Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Shared.Field label="Primary brand color">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} style={{ width: 42, height: 32, border: 0, background: "transparent", cursor: "pointer" }}/>
            <input className="text-input" style={{ flex: 1 }} value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })}/>
          </div>
        </Shared.Field>
        <Shared.Field label="Dark accent">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={form.dark_color} onChange={(e) => setForm({ ...form, dark_color: e.target.value })} style={{ width: 42, height: 32, border: 0, background: "transparent", cursor: "pointer" }}/>
            <input className="text-input" style={{ flex: 1 }} value={form.dark_color} onChange={(e) => setForm({ ...form, dark_color: e.target.value })}/>
          </div>
        </Shared.Field>
      </div>
      <div style={{ marginTop: 8, padding: 12, background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
        {form.logo_url
          ? <img src={form.logo_url} alt="" style={{ height: 28, width: 28, borderRadius: 4, objectFit: "cover", background: form.dark_color }} onError={(e) => { e.target.style.display = "none"; }}/>
          : <div style={{ width: 28, height: 28, borderRadius: 4, background: form.primary_color }}/>
        }
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Preview · this is roughly how the sidebar mark will look.</div>
      </div>
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy} onClick={() => onSubmit(form)}>
        {busy ? "Saving…" : "Save branding + continue →"}
      </button>
    </>
  );
}

function StepCarriers({ sb, onSubmit, busy, err }) {
  const [carriers, setCarriers] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [extra, setExtra] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    (async () => {
      try {
        const r = await sb.from("carriers").select("id, name, category").order("name");
        if (Array.isArray(r.data)) setCarriers(r.data);
      } catch (e) { console.warn("[firstRun.carriersLoad]", e); }
      setLoading(false);
    })();
  }, []);
  const toggle = (id) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 8 }}>
        Pick the carriers you (or your agency) are appointed with. We use these to filter quote engines + commission calc.
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading carrier list…</div>
      ) : carriers.length === 0 ? (
        <div style={{ padding: 16, background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.55 }}>
          No carriers in the master catalog yet. Type their names below — your appointed list will be saved with the agency for now.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto", padding: 4 }}>
          {carriers.map(c => {
            const on = selected.has(c.id);
            return (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: on ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: on ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)" }}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.id)}/>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{c.category || ""}</span>
              </label>
            );
          })}
        </div>
      )}
      <Shared.Field label="Other carriers (comma-separated)" hint="We'll add these to your appointed list as text"><input className="text-input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Mutual of Omaha, F&G, ..."/></Shared.Field>
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy} onClick={() => onSubmit({
        carrier_ids: Array.from(selected),
        carrier_text: extra.split(",").map(s => s.trim()).filter(Boolean),
      })}>
        {busy ? "Saving…" : selected.size + extra.split(",").filter(s => s.trim()).length === 0 ? "Skip this step →" : "Save carriers + continue →"}
      </button>
    </>
  );
}

const PRODUCT_LINES = [
  { k: "med_supp",   l: "Medicare Supplement (Medigap)" },
  { k: "med_adv",    l: "Medicare Advantage (Part C)" },
  { k: "pdp",        l: "Prescription Drug Plans (Part D)" },
  { k: "final_exp",  l: "Final Expense / whole life" },
  { k: "term_life",  l: "Term life" },
  { k: "iul",        l: "Indexed Universal Life (IUL)" },
  { k: "annuity",    l: "Annuities" },
  { k: "ltc",        l: "Long-term care" },
  { k: "aca",        l: "ACA / under-65 health" },
  { k: "ancillary",  l: "Ancillary (dental/vision/hearing)" },
];

function StepProducts({ onSubmit, busy, err }) {
  const [selected, setSelected] = React.useState(new Set());
  const toggle = (k) => { const s = new Set(selected); if (s.has(k)) s.delete(k); else s.add(k); setSelected(s); };
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 8 }}>
        Which lines of business do you sell? You can change this later in Settings → Carriers.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {PRODUCT_LINES.map(p => {
          const on = selected.has(p.k);
          return (
            <label key={p.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: on ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: on ? "1px solid var(--accent-money)" : "1px solid var(--border-subtle)" }}>
              <input type="checkbox" checked={on} onChange={() => toggle(p.k)}/>
              <span style={{ flex: 1 }}>{p.l}</span>
            </label>
          );
        })}
      </div>
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy || selected.size === 0} onClick={() => onSubmit({ product_lines: Array.from(selected) })}>
        {busy ? "Saving…" : "Save products + continue →"}
      </button>
    </>
  );
}

function StepConnectors({ sb, onSubmit, busy, err }) {
  const [catalog, setCatalog] = React.useState([]);
  const [connected, setConnected] = React.useState(new Set());
  const [loading, setLoading] = React.useState(true);
  const [configFor, setConfigFor] = React.useState(null);
  React.useEffect(() => {
    (async () => {
      try {
        const r = await sb.from("connector_catalog").select("*").order("sort_order", { ascending: true });
        if (Array.isArray(r.data)) setCatalog(r.data);
      } catch (e) { console.warn("[firstRun.catalogLoad]", e); }
      try {
        const cur = await sb.from("connections").select("id, status");
        if (Array.isArray(cur.data)) setConnected(new Set(cur.data.filter(c => c.status === "ok").map(c => c.id)));
      } catch (e) { console.warn("[firstRun.connectionsLoad]", e); }
      setLoading(false);
    })();
  }, []);
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        Connect at least one phone provider so you can dial. Email + payments can wait.
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading connector catalog…</div>
      ) : catalog.length === 0 ? (
        <div style={{ padding: 16, background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.55 }}>
          Connector catalog is empty in your project. You can configure connectors later from Settings → Connectors.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
          {catalog.map(c => {
            const isConnected = connected.has(c.id) || connected.has(c.connector_key);
            return (
              <div key={c.id || c.connector_key} className="panel" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label || c.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{c.description || c.category || ""}</div>
                </div>
                {isConnected
                  ? <span className="chip chip-money" style={{ fontSize: 10.5 }}>connected</span>
                  : <button className="btn" style={{ fontSize: 11.5 }} onClick={() => setConfigFor(c.connector_key || c.id)}>Connect</button>
                }
              </div>
            );
          })}
        </div>
      )}
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => onSubmit({ skipped: true })}>Skip for now →</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => onSubmit({ connected: Array.from(connected) })}>
          {busy ? "Saving…" : "Continue →"}
        </button>
      </div>
      {configFor && window.ConnectorConfigModal && (() => {
        const M = window.ConnectorConfigModal;
        return <M connectorId={configFor} onClose={() => {
          setConfigFor(null);
          // refresh connected set
          sb.from("connections").select("id, status").then(({ data }) => {
            if (Array.isArray(data)) setConnected(new Set(data.filter(c => c.status === "ok").map(c => c.id)));
          });
        }}/>;
      })()}
    </>
  );
}

function StepAgents({ sb, onSubmit, busy, err }) {
  const [agents, setAgents] = React.useState([]);
  const [picks, setPicks] = React.useState({}); // agent_key -> bool
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    (async () => {
      try {
        const r = await sb.rpc("suggested_agents_for_role", { p_role: "owner" });
        if (Array.isArray(r.data)) {
          setAgents(r.data);
          const init = {};
          r.data.forEach(a => { init[a.agent_key || a.id] = !!a.required; });
          setPicks(init);
        }
      } catch (e) {
        // Don't block: agents are optional
      }
      setLoading(false);
    })();
  }, []);
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        These agents run in the background. Required ones are pre-checked — they keep compliance + speed-to-lead alive.
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading agent defaults…</div>
      ) : agents.length === 0 ? (
        <div style={{ padding: 16, background: "var(--bg-raised)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1.55 }}>
          No agent defaults set up yet. You can install agents later from Settings → Agents.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
          {agents.map(a => {
            const key = a.agent_key || a.id;
            const required = !!a.required;
            const on = !!picks[key];
            return (
              <label key={key} className="panel" style={{ padding: 12, display: "flex", gap: 10, alignItems: "flex-start", cursor: required ? "not-allowed" : "pointer", opacity: required ? 0.85 : 1 }}>
                <input type="checkbox" checked={on} disabled={required} onChange={() => setPicks({ ...picks, [key]: !on })} style={{ marginTop: 2 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {a.label || a.name || key}
                    {required && <span className="chip chip-status" style={{ marginLeft: 6, fontSize: 10 }}>required</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.45 }}>{a.description || ""}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy} onClick={() => onSubmit({
        agents: Object.entries(picks).filter(([, v]) => v).map(([k]) => k),
      })}>
        {busy ? "Saving…" : "Install agents + continue →"}
      </button>
    </>
  );
}

function StepInviteTeam({ sb, agencyId, onSubmit, busy, err }) {
  const [rows, setRows] = React.useState([
    { email: "", role: "manager" },
    { email: "", role: "rep" },
    { email: "", role: "rep" },
  ]);
  const [sent, setSent] = React.useState([]);
  const [sending, setSending] = React.useState(false);
  const upd = (i, k, v) => setRows(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const sendOne = async (email, role) => {
    if (!email.trim()) return null;
    try {
      // Try RPC mint_invite first; fall back to /api/invites/create if missing.
      let token = null;
      try {
        const r = await sb.rpc("mint_invite", { p_agency_id: agencyId, p_role: role, p_email_hint: email.trim() });
        token = r?.data?.token || r?.data || null;
      } catch (e) { console.warn("[firstRun.mintInvite]", e); }
      if (!token) {
        const r2 = await fetch("/api/invites/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agency_id: agencyId, role, email_hint: email.trim() }),
        });
        const j = await r2.json().catch(() => ({}));
        token = j?.token || null;
      }
      return token;
    } catch (e) {
      return null;
    }
  };
  const sendAll = async () => {
    setSending(true);
    const out = [];
    for (const r of rows) {
      if (!r.email.trim()) continue;
      const tok = await sendOne(r.email, r.role);
      out.push({ email: r.email.trim(), role: r.role, token: tok, link: tok ? `${window.location.origin}/?invite=${encodeURIComponent(tok)}` : null });
    }
    setSent(out);
    setSending(false);
    if (out.length) window.toast && window.toast(`${out.length} invite${out.length === 1 ? "" : "s"} minted`, "success");
  };
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        Generate invite links for your first managers + reps. We won't auto-email — copy the link and send it yourself.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 6 }}>
            <input className="text-input" value={r.email} onChange={(e) => upd(i, "email", e.target.value)} placeholder="teammate@email.com"/>
            <Shared.Select value={r.role} onChange={(v) => upd(i, "role", v)} options={[
              { v: "manager", l: "Manager" },
              { v: "rep",     l: "Rep" },
              { v: "admin",   l: "Admin" },
            ]}/>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11.5 }} onClick={() => setRows([...rows, { email: "", role: "rep" }])}>+ Add another</button>
      <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={sending || !rows.some(r => r.email.trim())} onClick={sendAll}>
        {sending ? "Minting…" : "Mint invite links"}
      </button>
      {sent.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: "var(--bg-raised)", borderRadius: 6 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 6 }}>Invite links</div>
          {sent.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", fontSize: 11.5 }}>
              <span style={{ minWidth: 160, color: "var(--text-secondary)" }}>{s.email}</span>
              <span style={{ minWidth: 60, color: "var(--text-tertiary)" }}>{s.role}</span>
              {s.link
                ? <code style={{ flex: 1, fontSize: 10.5, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.link}</code>
                : <span style={{ flex: 1, color: "var(--state-danger)" }}>failed</span>}
              {s.link && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => navigator.clipboard.writeText(s.link).then(() => window.toast && window.toast("Copied", "success"))}>Copy</button>}
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => onSubmit({ skipped: true })}>Skip — I'll invite later</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => onSubmit({ minted: sent.map(s => ({ email: s.email, role: s.role })) })}>
          {busy ? "Saving…" : "Continue →"}
        </button>
      </div>
    </>
  );
}

function StepBilling({ agencyId, onSubmit, busy, err }) {
  const [plan, setPlan] = React.useState("trial");
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const startCheckout = async () => {
    setCheckoutBusy(true);
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agency_id: agencyId, plan }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.url) { window.open(j.url, "_blank", "noopener,noreferrer"); }
      else { window.toast && window.toast(j?.error || "Stripe checkout unavailable — add STRIPE_SECRET_KEY in Vercel.", "warn"); }
    } catch (e) {
      window.toast && window.toast("Stripe call failed — set up your keys and try later.", "warn");
    } finally { setCheckoutBusy(false); }
  };
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        Pick a plan. You can stay on trial and switch later from Settings → Billing.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {[
          { k: "trial",    name: "Trial",        price: "$0",     desc: "14 days, full features, no card required." },
          { k: "starter",  name: "Starter",      price: "$49/mo", desc: "Single producer, 1 phone number, 2 connectors." },
          { k: "growth",   name: "Growth",       price: "$249/mo", desc: "Up to 10 seats, 5 numbers, unlimited connectors." },
          { k: "scale",    name: "Scale",        price: "$899/mo", desc: "Unlimited seats, IMO hierarchy, custom carriers." },
        ].map(p => {
          const on = plan === p.k;
          return (
            <label key={p.k} className="panel" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", cursor: "pointer", border: on ? "1px solid var(--accent-money)" : undefined }}>
              <input type="radio" name="plan" checked={on} onChange={() => setPlan(p.k)}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {p.price}</span></div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{p.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
      {plan !== "trial" && (
        <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={startCheckout} disabled={checkoutBusy}>
          {checkoutBusy ? "Opening Stripe…" : "Open Stripe Checkout"}
        </button>
      )}
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy} onClick={() => onSubmit({ plan })}>
        {busy ? "Saving…" : "Continue →"}
      </button>
    </>
  );
}

function StepFirstLead({ sb, agencyId, onSubmit, busy, err }) {
  const [form, setForm] = React.useState({ name: "", phone: "", state: "", product: "Med Supp Plan G", source: "manual" });
  const valid = form.name.trim().length > 1;
  const submit = async () => {
    // Best-effort: insert into pipeline as "New", then complete the step.
    try {
      await sb.from("pipeline").insert({
        agency_id: agencyId,
        lead_name: form.name.trim(),
        phone: form.phone || null,
        state: form.state || null,
        stage: "New",
        product: form.product || null,
        source: form.source,
        ap_cents: 0,
        days_in_stage: 0,
        consent: "self-attested",
        heat: "fresh",
      });
    } catch (e) {
      // Don't block — the wizard still finishes; user can add leads later.
      console.warn("first lead insert failed:", e?.message || e);
    }
    onSubmit({ first_lead: form });
  };
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        Add one real lead so you can see the pipeline before you go.
      </div>
      <Shared.Field label="Lead name"><input className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cheryl Hampton" autoFocus/></Shared.Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
        <Shared.Field label="Phone"><input className="text-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0142"/></Shared.Field>
        <Shared.Field label="State"><Shared.Select value={form.state} onChange={(v) => setForm({ ...form, state: v })} options={[{ v: "", l: "—" }, ...US_STATES.map(s => ({ v: s, l: s }))]}/></Shared.Field>
      </div>
      <Shared.Field label="Product / interest"><input className="text-input" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}/></Shared.Field>
      <Shared.Field label="Source"><Shared.Select value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={[
        { v: "manual",      l: "Manual entry" },
        { v: "referral",    l: "Referral" },
        { v: "fb-leads",    l: "Facebook lead form" },
        { v: "inbound",     l: "Inbound call" },
        { v: "list",        l: "T65 / mailing list" },
      ]}/></Shared.Field>
      {err && <div style={{ color: "var(--state-danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => onSubmit({ skipped: true })}>Skip — finish wizard</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !valid} onClick={submit}>
          {busy ? "Saving…" : "Add lead + finish →"}
        </button>
      </div>
    </>
  );
}

/* ─── Step dispatcher ────────────────────────────────────────────────────── */
function StepBody({ stepKey, sb, agency, onSubmit, busy, err }) {
  switch (stepKey) {
    case "profile":        return <StepProfile        agency={agency} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "branding":       return <StepBranding       onSubmit={onSubmit} busy={busy} err={err}/>;
    case "carriers":       return <StepCarriers       sb={sb} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "products":       return <StepProducts       onSubmit={onSubmit} busy={busy} err={err}/>;
    case "connectors":     return <StepConnectors     sb={sb} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "agents_install": return <StepAgents         sb={sb} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "invite_team":    return <StepInviteTeam     sb={sb} agencyId={agency?.id} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "billing":        return <StepBilling        agencyId={agency?.id} onSubmit={onSubmit} busy={busy} err={err}/>;
    case "first_lead":     return <StepFirstLead      sb={sb} agencyId={agency?.id} onSubmit={onSubmit} busy={busy} err={err}/>;
    default:               return <div style={{ padding: 14, color: "var(--text-tertiary)" }}>Unknown step: {stepKey}</div>;
  }
}

/* ─── Wizard wrapper ─────────────────────────────────────────────────────── */
function AgencyWizard({ agency, onDone }) {
  const sb = window.getSupabase();
  const [statusRow, setStatusRow] = React.useState(null);
  const [statusErr, setStatusErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!agency?.id) return;
    const { status, error } = await fetchStatus(sb, agency.id);
    setStatusRow(status); setStatusErr(error);
    if (status?.onboarding_complete) onDone && onDone();
  }, [sb, agency?.id, onDone]);

  React.useEffect(() => {
    (async () => {
      if (!agency?.id) return;
      await ensureStarted(sb, agency.id);
      await refresh();
    })();
  }, [agency?.id]);

  if (!agency?.id) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No agency loaded. Reload the page.</div></div>;
  }
  if (statusErr) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--state-danger)", marginBottom: 6 }}>Onboarding state unreadable</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14, lineHeight: 1.5 }}>{statusErr}</div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={refresh}>Try again</button>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={() => onDone && onDone()}>Open Repflow anyway</button>
        </div>
      </div>
    );
  }
  if (!statusRow) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading onboarding…</div></div>;
  }

  const nextKey = statusRow.next_pending || STEPS[0].key;
  const doneSet = new Set(statusRow.done_steps || []);

  const submitStep = async (payload) => {
    setBusy(true); setErr("");
    try {
      // P6 — when the operator fills out their first agency profile, also
      // seed their own public.profiles row with the overlapping fields so
      // Settings → Profile shows real values on first open instead of
      // empty inputs. save_profile preserves keys not sent, so this only
      // upserts what we know from the form.
      if (nextKey === "profile" && payload) {
        try {
          const userPatch = {};
          if (payload.legal_name)    userPatch.full_name = payload.legal_name;
          if (payload.email)         userPatch.email     = payload.email;
          if (payload.phone)         userPatch.phone     = payload.phone;
          if (payload.npn)           userPatch.npn       = payload.npn;
          if (Object.keys(userPatch).length > 0) {
            await sb.rpc("save_profile", { p: userPatch });
          }
        } catch (_userErr) { /* non-blocking — agency profile still saves below */ }
      }
      await completeStep(sb, agency.id, nextKey, payload || {});
      await refresh();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <WizardChrome agencyName={agency.name || statusRow.name} currentKey={nextKey} doneSet={doneSet} totalSteps={statusRow.total_steps}>
      <StepBody stepKey={nextKey} sb={sb} agency={agency} onSubmit={submitStep} busy={busy} err={err}/>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <button className="btn btn-ghost" style={{ fontSize: 11.5 }} onClick={() => onDone && onDone()}>
          Finish later · open Repflow
        </button>
        <div style={{ fontSize: 11, color: "var(--text-quaternary)" }}>
          You can revisit incomplete steps from Settings → Onboarding.
        </div>
      </div>
    </WizardChrome>
  );
}

/* ─── Top-level entry ─────────────────────────────────────────────────────── */
function PageFirstRun({ session, resumeAgency, onDone }) {
  // Two paths:
  //   A. No agency yet → user-type picker → provision_sub_agency → wizard
  //   B. Agency exists but onboarding incomplete → straight into wizard
  const [agency, setAgency] = React.useState(resumeAgency ? { id: resumeAgency.id, name: resumeAgency.name, slug: resumeAgency.slug } : null);

  if (!agency) {
    return (
      <StartPicker
        session={session}
        onPicked={(picked) => {
          if (picked.joined) { onDone && onDone(); return; }
          setAgency({ id: picked.agencyId, name: picked.name, slug: picked.slug, primaryState: picked.primaryState });
        }}
      />
    );
  }
  return <AgencyWizard agency={agency} onDone={() => onDone && onDone()}/>;
}

window.PageFirstRun = PageFirstRun;

})();
