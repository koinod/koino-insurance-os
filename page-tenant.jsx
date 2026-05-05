/* page-tenant.jsx — Multi-tenant + invites + Twilio softphone

   - Onboarding wizard for first-time agency owners (post-magic-link)
   - Invite redemption from ?invite=... query parameter
   - Settings → Team tab: invite list + create invite link
   - <TwilioSoftphone> component that lazy-loads the Voice SDK,
     mints a token, registers the device, dials when click-to-call fires
   - Settings → Integrations → Twilio: config dialog (saves to
     connections.config per agency) + test mint button
*/

(function () {

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";

/* ─── Tenant context ───────────────────────────────────────────────────── */
async function loadTenant() {
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) return null;
  const { data: session } = await sb.auth.getSession();
  if (!session?.session) return { authed: false };
  const userId = session.session.user.id;
  const email  = session.session.user.email;
  const { data: members } = await sb.from("agency_members")
    .select("agency_id, role, rep_id, agencies (id, slug, name, plan, state)")
    .eq("user_id", userId).eq("active", true);
  if (!members || members.length === 0) {
    return { authed: true, userId, email, member: null, agency: null };
  }
  const m = members[0];
  return {
    authed: true,
    userId,
    email,
    member: { agency_id: m.agency_id, role: m.role, rep_id: m.rep_id },
    agency: m.agencies,
  };
}
window.loadTenant = loadTenant;

/* ─── Invite redemption — runs once on app load if ?invite=... is present ── */
async function maybeRedeemInvite() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get("invite");
  if (!token) return null;
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) return null;
  const { data: session } = await sb.auth.getSession();
  if (!session?.session) {
    // Not signed in yet — stash the token, redeem after login
    sessionStorage.setItem("repflow.pending_invite", token);
    return null;
  }
  const { data, error } = await sb.rpc("redeem_invite", { p_token: token });
  if (error) {
    window.toast && window.toast(`Invite: ${error.message}`, "error");
    return null;
  }
  // Strip the invite from the URL
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
  window.toast && window.toast("Joined the agency · welcome", "success");
  return data;
}
window.maybeRedeemInvite = maybeRedeemInvite;

/* Listen for sign-in completion to redeem stashed invite */
(function setupInviteListener() {
  const tryRedeem = async () => {
    const stash = sessionStorage.getItem("repflow.pending_invite");
    if (!stash) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { data: session } = await sb.auth.getSession();
    if (!session?.session) return;
    const { error } = await sb.rpc("redeem_invite", { p_token: stash });
    sessionStorage.removeItem("repflow.pending_invite");
    if (!error) window.toast && window.toast("Joined the agency · welcome", "success");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryRedeem);
  } else {
    setTimeout(tryRedeem, 1500);
  }
})();

/* ─── Onboarding wizard — first-time agency owner setup ────────────────── */
function OnboardingWizard({ onComplete }) {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({ name: "", slug: "", state: "TX" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState("");
  const [agencyId, setAgencyId] = React.useState(null);
  const [inviteUrl, setInviteUrl] = React.useState(null);
  const [inviteRole, setInviteRole] = React.useState("rep");

  const STEPS = ["Agency", "Connect carriers", "Invite team", "Done"];

  const createAgency = async () => {
    if (!form.name.trim()) return;
    setBusy(true); setErr("");
    try {
      const sb = window.getSupabase();
      const { data, error } = await sb.rpc("create_agency", { p_name: form.name, p_slug: form.slug, p_state: form.state });
      if (error) throw error;
      setAgencyId(data);
      window.toast && window.toast("Agency created · " + form.name, "success");
      setStep(1);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const mintInvite = async () => {
    if (!agencyId) return;
    setBusy(true);
    try {
      const sb = window.getSupabase();
      const { data: session } = await sb.auth.getSession();
      const r = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ agency_id: agencyId, role: inviteRole })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "mint failed");
      setInviteUrl(j.invite_url);
    } catch (e) {
      window.toast && window.toast(`Invite mint failed: ${e.message}`, "error");
    } finally { setBusy(false); }
  };

  const finish = () => { onComplete && onComplete(agencyId); };

  return (
    <div className="login-shell">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Set up your agency</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{STEPS[step]} · step {step + 1} of {STEPS.length}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent-money)" : "var(--bg-raised)" }}></div>
          ))}
        </div>

        {step === 0 && (
          <>
            <Shared.Field label="Agency name">
              <input className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Atlas Insurance Group" autoFocus/>
            </Shared.Field>
            <Shared.Field label="URL slug">
              <input className="text-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="atlas (auto from name if blank)"/>
            </Shared.Field>
            <Shared.Field label="Primary state">
              <Shared.Select value={form.state} onChange={(v) => setForm({ ...form, state: v })} options={["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"].map(s => ({ v: s, l: s }))}/>
            </Shared.Field>
            {err && <div style={{ color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={createAgency} disabled={busy || !form.name.trim()}>
              {busy ? "Creating..." : "Create agency"}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
              Connect your carrier appointments later from <strong>Settings → Integrations</strong>.
              You can run on demo data and seed leads from a CSV in the meantime.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {["UHC", "Humana Vantage", "Aetna SRC", "Mutual of Omaha", "F&G Annuities"].map(c => (
                <span key={c} className="chip">{c} · skip for now</span>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setStep(2)}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
              Invite your first producer or manager. They'll get a link, sign in with their email, and land in your agency.
            </div>
            <Shared.Field label="Role">
              <Shared.Select value={inviteRole} onChange={setInviteRole} options={[{ v: "rep", l: "Producer (Rep)" }, { v: "manager", l: "Manager" }]}/>
            </Shared.Field>
            {!inviteUrl ? (
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={mintInvite} disabled={busy}>
                {busy ? "Generating..." : <><Icons.Plus size={11}/> Generate invite link</>}
              </button>
            ) : (
              <>
                <div style={{ position: "relative", padding: 10, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 11.5, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "var(--accent-money)", marginTop: 8 }}>
                  {inviteUrl}
                  <button className="btn btn-ghost" style={{ position: "absolute", top: 6, right: 6, fontSize: 11 }} onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => window.toast && window.toast("Copied", "success"))}>
                    <Icons.Copy size={11}/> Copy
                  </button>
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => { setInviteUrl(null); }}>Generate another</button>
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(3)}>Skip for now</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Done</button>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ display: "inline-flex", padding: 14, background: "color-mix(in oklch, var(--accent-money) 14%, transparent)", borderRadius: 999 }}>
              <Icons.Check size={22} style={{ color: "var(--accent-money)" }}/>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>You're set up.</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
              Atlas dashboard with seed data is loaded so you can explore.
              Wire your real carriers + Twilio later in Settings.
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={finish}>
              Open Repflow →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
window.OnboardingWizard = OnboardingWizard;

/* ─── Settings → Team tab — invite list + create ───────────────────────── */
function SettingsTeam() {
  const [members, setMembers] = React.useState([]);
  const [invites, setInvites] = React.useState([]);
  const [agency, setAgency]   = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [role, setRole]         = React.useState("rep");
  const [emailHint, setEmailHint] = React.useState("");
  const [lastUrl, setLastUrl]   = React.useState(null);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { data: ag } = await sb.from("agencies").select("*").limit(1).single();
    setAgency(ag);
    if (!ag) return;
    const { data: m } = await sb.from("agency_members").select("agency_id, user_id, role, joined_at, active").eq("agency_id", ag.id);
    setMembers(m || []);
    const { data: i } = await sb.from("agency_invites").select("token, role, email_hint, expires_at, used_at").eq("agency_id", ag.id).order("expires_at", { ascending: false });
    setInvites(i || []);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!agency) return;
    setCreating(true);
    try {
      const sb = window.getSupabase();
      const { data: session } = await sb.auth.getSession();
      if (!session?.session) { window.toast && window.toast("Sign in required", "error"); return; }
      const r = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ agency_id: agency.id, role, email_hint: emailHint || null })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "mint failed");
      setLastUrl(j.invite_url);
      navigator.clipboard.writeText(j.invite_url).then(() => window.toast && window.toast("Invite link copied to clipboard", "success"));
      load();
    } catch (e) {
      window.toast && window.toast(`Failed: ${e.message}`, "error");
    } finally {
      setCreating(false);
    }
  };

  if (!agency) {
    return <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Sign in to manage your team. Demo mode shows mock-only.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Team</h3>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Icons.Plus size={11}/> Invite producer</button>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 130px" }}>
            <div>User</div><div>Role</div><div>Joined</div>
          </div>
          {members.map(m => (
            <div key={m.user_id} className="row" style={{ gridTemplateColumns: "1fr 100px 130px" }}>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{m.user_id.slice(0, 8)}…</div>
              <div><span className="chip">{m.role}</span></div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{new Date(m.joined_at).toLocaleDateString()}</div>
            </div>
          ))}
          {members.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No team members yet — invite your first producer.</div>}
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Pending invites</h3>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.2fr 100px 1fr 110px 90px" }}>
            <div>Token</div><div>Role</div><div>Email hint</div><div>Expires</div><div>Status</div>
          </div>
          {invites.map(i => {
            const expired = new Date(i.expires_at) < new Date();
            return (
              <div key={i.token} className="row" style={{ gridTemplateColumns: "1.2fr 100px 1fr 110px 90px" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.token.slice(0, 16)}…</div>
                <div><span className="chip">{i.role}</span></div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{i.email_hint || "—"}</div>
                <div style={{ fontSize: 11.5, color: expired ? "var(--state-danger)" : "var(--text-tertiary)" }}>{new Date(i.expires_at).toLocaleDateString()}</div>
                <div><span className={`chip ${i.used_at ? "chip-money" : expired ? "chip-danger" : "chip-status"}`}>{i.used_at ? "joined" : expired ? "expired" : "pending"}</span></div>
              </div>
            );
          })}
          {invites.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No invites yet.</div>}
        </div>
      </div>

      {createOpen && (
        <Shared.Modal title="Invite a producer" width={460} onClose={() => setCreateOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create} disabled={creating}><Icons.Plus size={11}/> {creating ? "Generating..." : "Generate invite"}</button>
          </>
        }>
          <Shared.Field label="Role">
            <Shared.Select value={role} onChange={setRole} options={[{ v: "rep", l: "Producer (Rep)" }, { v: "manager", l: "Manager" }]}/>
          </Shared.Field>
          <Shared.Field label="Email hint (optional)" hint="Just a label so you remember who this was for">
            <input className="text-input" value={emailHint} onChange={(e) => setEmailHint(e.target.value)} placeholder="alice@atlasimo.com"/>
          </Shared.Field>
          {lastUrl && (
            <div style={{ marginTop: 12, padding: 10, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 11.5, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "var(--accent-money)" }}>
              {lastUrl}
              <button className="btn btn-ghost" style={{ position: "absolute", top: 8, right: 8, fontSize: 10 }} onClick={() => navigator.clipboard.writeText(lastUrl)}>Copy</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>Link expires in 7 days · single-use · sign-in via magic link required to redeem</div>
        </Shared.Modal>
      )}
    </div>
  );
}
window.SettingsTeam = SettingsTeam;

/* ─── Twilio config dialog ─────────────────────────────────────────────── */
function TwilioConfigModal({ onClose }) {
  const [form, setForm] = React.useState({
    account_sid: "", api_key_sid: "", api_key_secret: "", twiml_app_sid: "", caller_id: ""
  });
  const [savedSnapshot, setSavedSnapshot] = React.useState(null);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.from("connections").select("config").eq("id", "twilio").single().then(({ data }) => {
      if (data?.config) {
        setSavedSnapshot(data.config);
        setForm(f => ({ ...f, ...data.config, api_key_secret: "" })); // never echo secrets back
      }
    });
  }, []);

  const save = async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { window.toast && window.toast("Sign in required", "error"); return; }
    // Note: we store the SIDs in connections.config; the SECRET goes only to
    // Vercel env via the operator. The UI displays a copyable env-var bundle.
    const config = {
      account_sid: form.account_sid,
      api_key_sid: form.api_key_sid,
      twiml_app_sid: form.twiml_app_sid,
      caller_id: form.caller_id,
      // intentionally omit api_key_secret — that goes server-side only
      configured: !!(form.account_sid && form.api_key_sid && form.twiml_app_sid),
      saved_at: new Date().toISOString(),
    };
    await AppData.mutate.connectionStatus("twilio", config.configured ? "ok" : "warn", config.configured ? "Configured · ready to dial" : "Setup incomplete");
    await sb.from("connections").update({ config }).eq("id", "twilio");
    window.toast && window.toast("Twilio config saved", "success");
    onClose();
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch("/api/twilio-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity: "test-mint" }) });
      const j = await r.json();
      setTestResult({ ok: r.ok, body: j });
    } catch (e) {
      setTestResult({ ok: false, body: { error: String(e) } });
    } finally { setTesting(false); }
  };

  const autoProvision = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch("/api/twilio-app/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (r.ok && j.twiml_app_sid) {
        setForm(f => ({ ...f, twiml_app_sid: j.twiml_app_sid }));
        setTestResult({ ok: true, body: { provisioned: j.twiml_app_sid, voice_url: j.voice_url } });
        window.toast && window.toast(`TwiML app created · ${j.twiml_app_sid.slice(0, 12)}…`, "success");
      } else {
        setTestResult({ ok: false, body: j });
      }
    } catch (e) {
      setTestResult({ ok: false, body: { error: String(e) } });
    } finally { setTesting(false); }
  };

  const envVarBlock = `# Add these to Vercel project (Settings -> Environment Variables)
TWILIO_ACCOUNT_SID=${form.account_sid || "<paste yours>"}
TWILIO_API_KEY_SID=${form.api_key_sid || "<paste yours>"}
TWILIO_API_KEY_SECRET=${form.api_key_secret || "<paste yours>"}
TWILIO_TWIML_APP_SID=${form.twiml_app_sid || "<paste yours>"}`;

  return (
    <Shared.Modal title="Twilio · Voice connector" width={620} onClose={onClose} actions={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={autoProvision} disabled={testing} title="Creates the TwiML app + voice URL automatically using your Twilio account creds">{testing ? "..." : "Auto-create TwiML app"}</button>
        <button className="btn" onClick={test} disabled={testing}>{testing ? "Testing..." : "Test mint"}</button>
        <button className="btn btn-primary" onClick={save}><Icons.Check size={11}/> Save config</button>
      </>
    }>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, lineHeight: 1.55 }}>
        Connect your Twilio account so click-to-call dials right in the browser (no desktop helper needed).
        SIDs are stored on your <span className="mono">connections.config</span> row. The secret stays server-side only — paste it into Vercel env vars below.
      </div>

      <Shared.Field label="Account SID" hint="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
        <input className="text-input" value={form.account_sid} onChange={(e) => setForm({ ...form, account_sid: e.target.value })} placeholder="AC..."/>
      </Shared.Field>
      <Shared.Field label="API Key SID" hint="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
        <input className="text-input" value={form.api_key_sid} onChange={(e) => setForm({ ...form, api_key_sid: e.target.value })} placeholder="SK..."/>
      </Shared.Field>
      <Shared.Field label="API Key Secret" hint="Server-side only — saved to env, not DB">
        <input className="text-input" type="password" value={form.api_key_secret} onChange={(e) => setForm({ ...form, api_key_secret: e.target.value })} placeholder="(paste, won't be stored in DB)"/>
      </Shared.Field>
      <Shared.Field label="TwiML App SID" hint="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx · the app that handles outbound dial">
        <input className="text-input" value={form.twiml_app_sid} onChange={(e) => setForm({ ...form, twiml_app_sid: e.target.value })} placeholder="AP..."/>
      </Shared.Field>
      <Shared.Field label="Caller ID" hint="Verified Twilio number you'll dial from">
        <input className="text-input" value={form.caller_id} onChange={(e) => setForm({ ...form, caller_id: e.target.value })} placeholder="+15555550100"/>
      </Shared.Field>

      <div className="divider"></div>
      <div className="field-l">Server env (paste into Vercel)</div>
      <div style={{ position: "relative", padding: 10, background: "var(--bg-base)", borderRadius: 6, fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", color: "var(--text-secondary)", marginTop: 6 }}>
        {envVarBlock}
        <button className="btn btn-ghost" style={{ position: "absolute", top: 6, right: 6, fontSize: 10 }} onClick={() => navigator.clipboard.writeText(envVarBlock).then(() => window.toast && window.toast("Copied", "success"))}>
          <Icons.Copy size={10}/> Copy
        </button>
      </div>

      {testResult && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: testResult.ok ? "color-mix(in oklch, var(--accent-money) 10%, transparent)" : "color-mix(in oklch, var(--state-danger) 10%, transparent)", fontSize: 12, color: testResult.ok ? "var(--accent-money)" : "var(--state-danger)" }}>
          <strong>{testResult.ok ? "Mint OK" : "Mint failed"}</strong>
          <div className="mono" style={{ fontSize: 10.5, marginTop: 4, color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{JSON.stringify(testResult.body, null, 2).slice(0, 600)}</div>
        </div>
      )}
    </Shared.Modal>
  );
}
window.TwilioConfigModal = TwilioConfigModal;

/* ─── Twilio softphone ───────────────────────────────────────────────────
   Lazy-loads the Voice SDK from CDN. Mints a token (returns null on 503).
   Provides start(phone, leadName) which dials via the registered Device.
   ─────────────────────────────────────────────────────────────────────── */
async function ensureTwilioSdk() {
  if (window.Twilio?.Device) return true;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://media.twiliocdn.com/sdk/js/voice/releases/2.10.2/twilio.min.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

let _twDevice = null;
let _twActive = null;

async function twilioReady() {
  if (_twDevice) return _twDevice;
  const ok = await ensureTwilioSdk();
  if (!ok) return null;
  const r = await fetch("/api/twilio-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
  const j = await r.json();
  if (!r.ok || !j.token) return null;
  _twDevice = new window.Twilio.Device(j.token, { logLevel: "error" });
  await _twDevice.register();
  return _twDevice;
}

/* Twilio-only dial. Returns true if Twilio took the call, false if we should
   fall through to the system dialer. Called by `window.repflowCall` in
   page-platform.jsx — DO NOT call repflowCall back from here (circular loop). */
window.repflowDialTwilio = async function (phone, leadName) {
  const dev = await twilioReady();
  if (!dev) return false;
  if (_twActive) { try { _twActive.disconnect(); } catch (_e) {} }
  _twActive = await dev.connect({ params: { To: phone, leadName: leadName || "" } });
  window.dispatchEvent(new CustomEvent("twilio:active", { detail: { phone, leadName } }));
  window.toast && window.toast(`Dialing ${leadName || phone}`, "info");
  return true;
};

})();
