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

/* ─── Tenant context ───────────────────────────────────────────────────── */
async function loadTenant() {
  // EVERY exit path returns a defined object — never throws to the caller.
  // AuthGate's refreshTenant catches any throw, but we make the contract
  // explicit here so the spinner never gets stuck on a silent rejection.
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) return null;
  let session = null;
  try {
    const r = await sb.auth.getSession();
    session = r?.data?.session || null;
  } catch (e) {
    console.error("loadTenant getSession failed:", e);
    throw new Error(`Session check failed: ${e?.message || e}`);
  }
  if (!session) return { authed: false };
  const userId = session.user.id;
  const email  = session.user.email;
  let members = null;
  let memberError = null;
  // First try with onboarding_complete so AuthGate can resume the wizard
  // for owners who exited mid-flow. If the column doesn't exist on this
  // schema yet (42703), fall back to the legacy select — no onboarding
  // resume but the user still gets through.
  try {
    const r = await sb.from("agency_members")
      .select("agency_id, role, rep_id, agencies (id, slug, name, plan, state, onboarding_complete)")
      .eq("user_id", userId).eq("active", true);
    members = r.data;
    memberError = r.error;
  } catch (e) {
    memberError = e;
  }
  if (memberError && /onboarding_complete|42703/i.test(String(memberError?.message || memberError?.code || memberError))) {
    try {
      const r = await sb.from("agency_members")
        .select("agency_id, role, rep_id, agencies (id, slug, name, plan, state)")
        .eq("user_id", userId).eq("active", true);
      members = r.data;
      memberError = r.error;
    } catch (e) {
      memberError = e;
    }
  }
  if (memberError) {
    // RLS denies, network error, etc. Surface so AuthGate can render a
    // recovery screen instead of routing the user to FirstRun.
    throw new Error(`Agency membership lookup failed: ${memberError.message || memberError}`);
  }
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
  // Analytics: capture for PostHog activation funnel.
  try {
    window.posthog && window.posthog.capture && window.posthog.capture("invite_redeemed", {
      source:       "tenant_picker",
      token_prefix: String(token).slice(0, 8),
    });
  } catch (_e) { /* analytics never blocks */ }
  // Strip the invite from the URL
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
  window.toast && window.toast("Joined the agency · welcome", "success");
  return data;
}
window.maybeRedeemInvite = maybeRedeemInvite;

/* Invite redemption is owned by AuthGate.redeemAndRefresh in page-auth.jsx —
 * the previous setTimeout-based listener used to race AuthGate and toast a
 * spurious "already used" error after the real redemption succeeded. */

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
      // Analytics: capture for PostHog SaaS-side new-tenant funnel.
      try {
        window.posthog && window.posthog.capture && window.posthog.capture("agency_created", {
          agency_id: data,
          name:      form.name,
          state:     form.state,
          source:    "tenant_setup_wizard",
        });
      } catch (_e) { /* analytics never blocks */ }
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
      const me = (window.me && window.me()) || null;
      // First invite from the owner: rep invites get upline=owner so the new
      // hire is correctly slotted under them. Manager invites stay top-level
      // (upline=null) — they'll then mint their own rep invites under
      // themselves from the Recruiting page.
      const upline_rep_id = inviteRole === "rep" && me?.rep_id ? me.rep_id : null;
      const r = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ agency_id: agencyId, role: inviteRole, upline_rep_id })
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
              <input className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your agency name" autoFocus/>
            </Shared.Field>
            <Shared.Field label="URL slug">
              <input className="text-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from name if blank"/>
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
              {(() => {
                // Live: pull this agency's appointed carriers, else show a
                // generic prompt rather than fake names like "UHC", "Aetna SRC".
                const liveCarriers = (AppData.CARRIERS || []).map(c => c.name).filter(Boolean);
                const isDemo = (window.Shared && window.Shared.isDemoAgency && window.Shared.isDemoAgency()) || false;
                const list = liveCarriers.length > 0
                  ? liveCarriers
                  : (isDemo ? ["UHC", "Humana Vantage", "Aetna SRC", "Mutual of Omaha", "F&G Annuities"] : []);
                if (list.length === 0) {
                  return <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontStyle: "italic" }}>No carriers added yet · add them later from Settings → Carriers</span>;
                }
                return list.map(c => (
                  <span key={c} className="chip">{c} · skip for now</span>
                ));
              })()}
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
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>Agency created · {form.name}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
              One last step — set up your producer profile so commissions, license states,
              and caller ID route to the right person.
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={finish}>
              Set up your profile →
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
  const viewer = (window.me && window.me()) || null;
  const [members, setMembers] = React.useState([]);
  const [invites, setInvites] = React.useState([]);
  const [allReps, setAllReps] = React.useState([]);
  const [agency, setAgency]   = React.useState(undefined); // undefined=loading, null=none
  const [loadErr, setLoadErr] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [role, setRole]         = React.useState("rep");
  const [emailHint, setEmailHint] = React.useState("");
  const [uplineRepId, setUplineRepId] = React.useState("");
  const [lastUrl, setLastUrl]   = React.useState(null);

  const OWNER_LIKE = React.useMemo(() => new Set(["owner", "super_admin", "admin", "imo_owner"]), []);
  const isOwnerLike = OWNER_LIKE.has(viewer?.role);
  const repById = React.useMemo(
    () => Object.fromEntries((allReps || []).map(r => [r.id, r])),
    [allReps]
  );
  const roleByRepId = React.useMemo(
    () => Object.fromEntries((members || []).filter(m => m.rep_id).map(m => [m.rep_id, m.role])),
    [members]
  );
  const downlineRepIds = React.useMemo(() => {
    const rootId = viewer?.rep_id;
    if (!rootId) return new Set();
    const scoped = new Set();
    const visit = (repId) => {
      if (!repId || scoped.has(repId)) return;
      scoped.add(repId);
      for (const rep of allReps || []) {
        if (rep.upline_id === repId) visit(rep.id);
      }
    };
    visit(rootId);
    return scoped;
  }, [allReps, viewer?.rep_id]);
  const eligibleUplines = React.useMemo(() => {
    if (isOwnerLike) return allReps || [];
    if (!viewer?.rep_id) return [];
    return (allReps || []).filter(r => downlineRepIds.has(r.id));
  }, [allReps, downlineRepIds, isOwnerLike, viewer?.rep_id]);
  const uplineOptions = React.useMemo(() => {
    const seen = new Set();
    const opts = [];
    if (isOwnerLike) {
      seen.add("none");
      opts.push({ v: "none", l: "Top level" });
    }
    for (const rep of eligibleUplines) {
      if (!rep?.id || seen.has(rep.id)) continue;
      seen.add(rep.id);
      const roleLabel = roleByRepId[rep.id] ? ` (${roleByRepId[rep.id]})` : "";
      const selfLabel = rep.id === viewer?.rep_id ? " · you" : "";
      opts.push({ v: rep.id, l: `${rep.name || rep.id}${roleLabel}${selfLabel}` });
    }
    if (!opts.length && viewer?.rep_id) {
      opts.push({ v: viewer.rep_id, l: `${viewer.full_name || "You"} · you` });
    }
    return opts;
  }, [eligibleUplines, isOwnerLike, roleByRepId, viewer?.full_name, viewer?.rep_id]);

  React.useEffect(() => {
    if (!createOpen) return;
    if (uplineOptions.some(o => o.v === uplineRepId)) return;
    if (viewer?.rep_id && uplineOptions.some(o => o.v === viewer.rep_id)) {
      setUplineRepId(viewer.rep_id);
      return;
    }
    if (isOwnerLike && uplineOptions.some(o => o.v === "none")) {
      setUplineRepId("none");
      return;
    }
    setUplineRepId(uplineOptions[0]?.v || "");
  }, [createOpen, isOwnerLike, uplineOptions, uplineRepId, viewer?.rep_id]);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setAgency(null); return; }

    // Resolve the active agency by:
    //   (1) explicit agency switcher in localStorage,
    //   (2) me().agency_id (the current viewer's tenant),
    //   (3) first row anon RLS lets us read (Atlas in demo mode).
    let agencyId = null;
    try { agencyId = localStorage.getItem("repflow.active_agency"); } catch {}
    if (!agencyId && window.me) {
      const m = window.me();
      if (m && m.agency_id) agencyId = m.agency_id;
    }

    let ag = null;
    let err = null;
    if (agencyId) {
      const r = await sb.from("agencies").select("*").eq("id", agencyId).maybeSingle();
      ag = r.data; err = r.error;
    }
    if (!ag) {
      // Fallback — first agency RLS lets us see (Atlas under anon, the owner's
      // agency under authed). maybeSingle avoids the silent 0-row error that
      // .single() throws when the policy filters everything out.
      const r = await sb.from("agencies").select("*").limit(1).maybeSingle();
      ag = r.data; err = err || r.error;
    }
    if (err && !ag) setLoadErr(err.message || String(err));
    setAgency(ag || null);
    if (!ag) return;
    const [m, i, reps] = await Promise.all([
      sb.from("agency_members").select("agency_id, user_id, role, rep_id, joined_at, active").eq("agency_id", ag.id),
      sb.from("agency_invites").select("token, role, email_hint, expires_at, used_at, upline_rep_id").eq("agency_id", ag.id).order("expires_at", { ascending: false }),
      sb.from("reps").select("id, name, user_id, email, upline_id").eq("agency_id", ag.id).order("name", { ascending: true }),
    ]);
    setMembers(m.data || []);
    setInvites(i.data || []);
    setAllReps(reps.data || []);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!agency) return;
    if (emailHint && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailHint.trim())) {
      window.toast && window.toast("Email hint looks malformed", "error");
      return;
    }
    setCreating(true);
    try {
      const sb = window.getSupabase();
      const { data: session } = await sb.auth.getSession();
      if (!session?.session) { window.toast && window.toast("Sign in required", "error"); return; }
      const finalUpline = uplineRepId === "none" || !uplineRepId ? null : uplineRepId;
      const r = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ agency_id: agency.id, role, email_hint: emailHint || null, upline_rep_id: finalUpline })
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

  if (agency === undefined) {
    return <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Loading team…</div>;
  }
  if (!agency) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>
        <Icons.Users size={20} style={{ display: "inline-block", color: "var(--text-quaternary)" }}/>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No agency to manage</div>
        <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
          {loadErr ? <>Could not load: <span className="mono">{loadErr}</span></> : <>Sign in to a real agency to manage your team and invites. Demo mode is read-only.</>}
        </div>
        {loadErr && (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setLoadErr(null); load(); }}>
            <Icons.RefreshCw size={11}/> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Team</h3>
          <button
            className="btn btn-primary"
            onClick={() => {
              setRole("rep");
              setEmailHint("");
              setLastUrl(null);
              setCreateOpen(true);
            }}
          >
            <Icons.Plus size={11}/> Invite teammate
          </button>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 110px 1fr 130px" }}>
            <div>User</div><div>Role</div><div>Reports to</div><div>Joined</div>
          </div>
          {members.map(m => {
            // Resolve a friendly name from the linked reps row when available;
            // fall back to a short user_id when the row hasn't been provisioned yet.
            const repRow = m.rep_id ? repById[m.rep_id] : null;
            const label = repRow?.name || (m.user_id ? `user-${String(m.user_id).slice(0, 8)}` : "—");
            const reportsTo = repRow?.upline_id ? (repById[repRow.upline_id]?.name || repRow.upline_id) : "Top level";
            return (
              <div key={m.user_id} className="row" style={{ gridTemplateColumns: "1fr 110px 1fr 130px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{label}</span>
                  {!m.rep_id && <span className="chip" style={{ fontSize: 9.5, color: "var(--state-warning)" }}>profile pending</span>}
                </div>
                <div><span className="chip">{m.role}</span></div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{reportsTo}</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}</div>
              </div>
            );
          })}
          {members.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No team members yet — invite your first producer.</div>}
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Pending invites</h3>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.2fr 100px 1fr 1fr 110px 90px" }}>
            <div>Token</div><div>Role</div><div>Email hint</div><div>Reports to</div><div>Expires</div><div>Status</div>
          </div>
          {invites.map(i => {
            const expired = !!i.expires_at && new Date(i.expires_at) < new Date();
            const reportsTo = i.upline_rep_id ? (repById[i.upline_rep_id]?.name || i.upline_rep_id) : "Top level";
            return (
              <div key={i.token} className="row" style={{ gridTemplateColumns: "1.2fr 100px 1fr 1fr 110px 90px" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.token.slice(0, 16)}…</div>
                <div><span className="chip">{i.role}</span></div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{i.email_hint || "—"}</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{reportsTo}</div>
                <div style={{ fontSize: 11.5, color: expired ? "var(--state-danger)" : "var(--text-tertiary)" }}>{i.expires_at ? new Date(i.expires_at).toLocaleDateString() : "Never"}</div>
                <div><span className={`chip ${i.used_at ? "chip-money" : expired ? "chip-danger" : "chip-status"}`}>{i.used_at ? "joined" : expired ? "expired" : "pending"}</span></div>
              </div>
            );
          })}
          {invites.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No invites yet.</div>}
        </div>
      </div>

      {createOpen && (
        <Shared.Modal title="Invite teammate" width={520} onClose={() => setCreateOpen(false)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create} disabled={creating}><Icons.Plus size={11}/> {creating ? "Generating..." : "Generate invite"}</button>
          </>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
            <Shared.Field label="Role">
              <Shared.Select value={role} onChange={setRole} options={[{ v: "rep", l: "Producer (Rep)" }, { v: "manager", l: "Manager" }]}/>
            </Shared.Field>
            <Shared.Field label="Reports to" hint="They'll land in this branch of the hierarchy after they redeem the invite">
              {uplineOptions.length > 0 ? (
                <Shared.Select value={uplineRepId} onChange={setUplineRepId} options={uplineOptions}/>
              ) : (
                <div style={{ minHeight: 36, display: "flex", alignItems: "center", padding: "0 10px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 12 }}>
                  No hierarchy nodes available yet
                </div>
              )}
            </Shared.Field>
          </div>
          <Shared.Field label="Email hint (optional)" hint="Just a label so you remember who this was for">
            <input className="text-input" value={emailHint} onChange={(e) => setEmailHint(e.target.value)} placeholder="alice@atlasimo.com"/>
          </Shared.Field>
          {lastUrl && (
            <div style={{ position: "relative", marginTop: 12, padding: 10, background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 11.5, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "var(--accent-money)" }}>
              {lastUrl}
              <button className="btn btn-ghost" style={{ position: "absolute", top: 8, right: 8, fontSize: 10 }} onClick={() => navigator.clipboard.writeText(lastUrl)}>Copy</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>Link expires in 14 days by default · single-use · sign-in via magic link required to redeem</div>
        </Shared.Modal>
      )}
    </div>
  );
}
window.SettingsTeam = SettingsTeam;

/* ─── Settings → Carriers tab — manage appointed carriers + product lines ──
   Owner-only (RLS gates the writes server-side via "owner write agency"-style
   policies). Manager + rep see read-only. Hits the public.carriers table that
   the resources page already reads via AppData.CARRIERS. */
// Display label → DB enum. carriers_category_check requires one of:
//   med_supp, medicare_advantage, final_expense, annuity, life, aca, dental,
//   vision, part_d, other. Don't pass the display string raw — the insert
//   silently 23514s and the form looks broken.
const CARRIER_CATEGORIES = [
  { l: "Med Supp",      v: "med_supp" },
  { l: "Med Adv",       v: "medicare_advantage" },
  { l: "Part D",        v: "part_d" },
  { l: "Final Expense", v: "final_expense" },
  { l: "Term / Whole",  v: "life" },
  { l: "IUL",           v: "life" },
  { l: "Annuity",       v: "annuity" },
  { l: "ACA",           v: "aca" },
  { l: "Dental",        v: "dental" },
  { l: "Vision",        v: "vision" },
  { l: "Other",         v: "other" },
];
// agency_carrier_appointments.status now drives runtime access. Keep the
// common workflow vocabulary here instead of the older catalog statuses.
const CARRIER_STATUSES = [
  { v: "self",          l: "Self / direct" },
  { v: "bridge",        l: "Bridge" },
  { v: "pending",       l: "Pending appointment" },
  { v: "not_pursuing",  l: "Not pursuing" },
];
const CARRIER_PRODUCT_LINES = ["Medicare Supplement", "Medicare Advantage", "Part D", "Final Expense", "Term Life", "Whole Life", "IUL", "Annuity", "ACA", "Dental", "Vision", "Hospital Indemnity"];

// Slugify a carrier name → stable id used for the connector_vault provider
// key. Format: alphanumerics + hyphens, trimmed/lowercased. "Mutual of Omaha"
// → "mutual-of-omaha". Per-user creds (one rep can have multiple agencies)
// are stored as provider="carrier_<slug>" so the auto-quoter + Settings tab
// see the same row when the names align. Auto-quoter's fixed ids (uhc,
// humana, aetna…) match this slug for the canonical 14.
function carrierSlugForName(name) {
  return String(name || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
function carrierPrefKey(raw) {
  return window.repflowCarrierPrefKey
    ? window.repflowCarrierPrefKey(raw)
    : carrierSlugForName(typeof raw === "object" ? (raw?.carrier_id || raw?.id || raw?.name) : raw);
}

function SettingsCarriers({ canEdit = true, role = "rep" }) {
  const [carriers, setCarriers] = React.useState(undefined); // undefined = loading
  const [catalog, setCatalog]   = React.useState([]);
  const [agencyId, setAgencyId] = React.useState(null);
  const [editing, setEditing]   = React.useState(null); // null = closed, {} = new, {id...} = edit
  const [busy, setBusy]         = React.useState(false);
  const [err, setErr]           = React.useState(null);
  // ── Per-carrier login editor (2026-05-24) ──────────────────────────────
  // Inline expander under the carrier row, NOT a modal-within-modal. Stores
  // user portal credentials in connector_vault via /api/agent/connector-upsert.
  // Per-user rows — each rep has their own login even when the agency-level
  // carrier row is shared. RLS scopes vault rows to user_id = auth.uid().
  const [loginEditing, setLoginEditing] = React.useState(null); // carrier.id (db row id) of currently-open editor
  const [loginForm, setLoginForm]       = React.useState({ username: "", password: "" });
  const [loginSaving, setLoginSaving]   = React.useState(false);
  const [loginVault, setLoginVault]     = React.useState({});   // { [slug]: { username, _has_password, _saved_at } }
  const loginCarrier = React.useMemo(() => (carriers || []).find(c => c.id === loginEditing) || null, [carriers, loginEditing]);
  const loginSlug    = loginCarrier ? carrierPrefKey(loginCarrier) : null;

  // Rehydrate per-user vault state for the carriers shown. Same shape as
  // the auto-quoter Credentials tab. Passwords never round-trip.
  const reloadVault = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/agent/connector-list", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!r.ok) return;
      const { connectors = [] } = await r.json();
      const next = {};
      for (const c of connectors) {
        if (!c.provider || !c.provider.startsWith("carrier_")) continue;
        const slug = carrierPrefKey(c.provider.slice("carrier_".length));
        next[slug] = {
          username: c.account_metadata?.username || "",
          _has_password: true,
          _saved_at: c.connected_at,
        };
      }
      setLoginVault(next);
    } catch { /* ignore */ }
  }, []);
  React.useEffect(() => { reloadVault(); }, [reloadVault]);

  const openLoginEditor = (c) => {
    const slug = carrierPrefKey(c);
    const existing = loginVault[slug] || {};
    setLoginForm({ username: existing.username || "", password: "" });
    setLoginEditing(c.id);
  };
  const closeLoginEditor = () => {
    setLoginEditing(null);
    setLoginForm({ username: "", password: "" });
  };
  const saveLogin = async () => {
    if (!loginCarrier || !loginSlug) return;
    if (!loginForm.username.trim()) {
      window.toast && window.toast("Enter a username", "warn");
      return;
    }
    setLoginSaving(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
      if (!session) { window.toast && window.toast("Sign in to save logins", "error"); setLoginSaving(false); return; }
      const existing = loginVault[loginSlug] || {};
      // Empty-password discipline: if the row already has a password saved
      // and the user left password blank, keep the existing one — don't wipe.
      const password = loginForm.password.trim();
      if (!password && !existing._has_password) {
        window.toast && window.toast("Enter a password (or leave blank only if one is already saved)", "warn");
        setLoginSaving(false);
        return;
      }
      // If password is blank but one exists, skip the save entirely (no-op).
      // The Auto-quoter has the same skip path. Otherwise upsert.
      if (password) {
        const apiKey = JSON.stringify({
          username: loginForm.username.trim(),
          password,
          extra: {},
        });
        const r = await fetch("/api/agent/connector-upsert", {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            provider: window.repflowCarrierProvider ? window.repflowCarrierProvider(loginSlug) : `carrier_${loginSlug}`,
            account_label: `Carrier portal · ${loginCarrier.name}`,
            api_key: apiKey,
            metadata: { username: loginForm.username.trim() },
          }),
        });
        if (!r.ok) {
          const errBody = await r.text().catch(() => "");
          throw new Error(errBody || `HTTP ${r.status}`);
        }
      }
      window.toast && window.toast(`${loginCarrier.name} login saved`, "success");
      await reloadVault();
      closeLoginEditor();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message}`, "error");
    } finally {
      setLoginSaving(false);
    }
  };
  const clearLogin = async () => {
    if (!loginCarrier || !loginSlug) return;
    if (!confirm(`Clear saved login for ${loginCarrier.name}? Deletes the server-side credential row too.`)) return;
    setLoginSaving(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (sb) {
        const providers = window.repflowCarrierProviderAliases
          ? window.repflowCarrierProviderAliases(loginSlug)
          : [`carrier_${loginSlug}`];
        const { error } = await sb.from("connector_vault").delete().in("provider", providers);
        if (error) throw error;
      }
      window.toast && window.toast(`${loginCarrier.name} login cleared`, "success");
      await reloadVault();
      closeLoginEditor();
    } catch (e) {
      window.toast && window.toast(`Clear failed: ${e.message}`, "error");
    } finally {
      setLoginSaving(false);
    }
  };

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setCarriers([]); return; }

    let aid = null;
    try { aid = localStorage.getItem("repflow.active_agency"); } catch {}
    if (!aid && window.me) { const m = window.me(); if (m?.agency_id) aid = m.agency_id; }
    setAgencyId(aid);

    try {
      const [{ data: catalogRows, error: catalogErr }, { data: appts, error: apptErr }] = await Promise.all([
        sb.from("carriers").select("*").order("name"),
        aid
          ? sb.from("agency_carrier_appointments").select("*").eq("agency_id", aid).order("carrier_name")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (catalogErr) throw catalogErr;
      if (apptErr) throw apptErr;
      const catalogList = catalogRows || [];
      const catalogById = new Map(catalogList.map(c => [c.id, c]));
      setCatalog(catalogList);
      const rows = (appts || []).map((a) => {
        const ref = catalogById.get(a.carrier_id) || {};
        return {
          id: a.id,
          agency_id: a.agency_id,
          carrier_id: a.carrier_id || "",
          name: a.carrier_name || ref.name || a.carrier_id,
          category: a.category || ref.category || "other",
          status: a.status || (a.active === false ? "not_pursuing" : "pending"),
          contact_name: a.contact_name || ref.contact_name || "",
          contact_phone: a.contact_phone || ref.contact_phone || "",
          contact_email: a.contact_email || ref.contact_email || "",
          product_lines: Array.isArray(a.product_lines) ? a.product_lines : (ref.product_lines || []),
          npn: a.npn,
          appointed_states: a.appointed_states || [],
          comp_rate_pct: a.comp_rate_pct,
          notes: a.notes || "",
          active: a.active !== false,
        };
      });
      setErr(null);
      setCarriers(rows);
    } catch (e) {
      setErr(e?.message || String(e));
      setCarriers([]);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing?.name?.trim()) return;
    if (!agencyId) {
      window.toast && window.toast("Pick an active agency before adding carriers", "error");
      return;
    }
    const ref = catalog.find(c => c.id === editing.carrier_id) || null;
    const VALID_CATS = new Set(["med_supp","medicare_advantage","final_expense","annuity","life","aca","dental","vision","part_d","other"]);
    const VALID_STATUSES = new Set(["self","bridge","pending","not_pursuing","active","paused","terminated"]);
    const cat = VALID_CATS.has(editing.category) ? editing.category : (ref?.category || "other");
    const stat = VALID_STATUSES.has(editing.status) ? editing.status : "pending";
    setBusy(true);
    try {
      const row = {
        id: editing.id || undefined,
        carrierId: editing.carrier_id || null,
        carrierName: editing.name.trim(),
        category: cat,
        status: stat,
        contactName:  editing.contact_name  || ref?.contact_name  || null,
        contactPhone: editing.contact_phone || ref?.contact_phone || null,
        contactEmail: editing.contact_email || ref?.contact_email || null,
        productLines: editing.product_lines || ref?.product_lines || [],
        notes: editing.notes || null,
        active: stat !== "not_pursuing",
      };
      await window.AppData.mutate.agencyAppointmentUpsert(row);
      window.toast && window.toast(`${editing.id ? "Updated" : "Added"} ${row.carrierName}`, "success");
      setEditing(null);
      await load();
      if (window.hydrateFromSupabase) window.hydrateFromSupabase();
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message}`, "error");
    } finally { setBusy(false); }
  };

  const remove = async (c) => {
    if (!confirm(`Remove ${c.name}? Existing policies stay; the carrier just stops appearing in pickers.`)) return;
    try {
      await window.AppData.mutate.agencyAppointmentDelete(c.id);
      window.toast && window.toast(`Removed ${c.name}`, "success");
      await load();
      if (window.hydrateFromSupabase) window.hydrateFromSupabase();
    } catch (e) {
      window.toast && window.toast(`Delete failed: ${e.message}`, "error");
    }
  };

  const toggleProductLine = (pl) => {
    setEditing(e => {
      const lines = e.product_lines || [];
      return { ...e, product_lines: lines.includes(pl) ? lines.filter(x => x !== pl) : [...lines, pl] };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Appointed carriers</h3>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
              Carriers your agency holds appointments with. Drives quote tools, deal-write product lists, and Resources directory.
            </div>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({ status: "pending", product_lines: [], carrier_id: "" })}>
              <Icons.Plus size={11}/> Add carrier
            </button>
          )}
        </div>

        {carriers === undefined && (
          <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading carriers…</div>
        )}
        {err && (
          <div style={{ padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>
            {err}
          </div>
        )}

        {carriers && carriers.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)" }}>
            <Icons.Folder size={20} style={{ display: "inline-block", color: "var(--text-quaternary)" }}/>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontWeight: 500 }}>No carriers yet</div>
            <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Add the carriers you're appointed with so reps can quote, write deals, and pre-call scrub against them.
            </div>
            {canEdit && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setEditing({ status: "pending", product_lines: [], carrier_id: "" })}>
                <Icons.Plus size={11}/> Add your first carrier
              </button>
            )}
          </div>
        )}

        {carriers && carriers.length > 0 && (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 100px 110px 1fr 80px 120px" }}>
              <div>Carrier</div><div>Category</div><div>Status</div><div>Product lines</div><div>Contact</div><div style={{ textAlign: "right" }}>Actions</div>
            </div>
            {carriers.map(c => {
              const slug = carrierPrefKey(c);
              const vault = loginVault[slug] || null;
              const hasLogin = !!vault;
              const isOpen = loginEditing === c.id;
              return (
                <React.Fragment key={c.id}>
                  <div className="row" style={{ gridTemplateColumns: "1.4fr 100px 110px 1fr 80px 120px", height: 42 }}>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.category || "—"}</div>
                    <div>
                      <span className={`chip ${["self", "active"].includes(c.status) ? "chip-money" : ["bridge", "pending"].includes(c.status) ? "chip-status" : "chip-danger"}`}>{c.status || "pending"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(c.product_lines && c.product_lines.length) ? c.product_lines.join(", ") : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {c.contact_email ? <a href={`mailto:${c.contact_email}`} style={{ color: "var(--accent-money)" }}>email</a> : c.contact_phone || "—"}
                    </div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        className="icon-btn"
                        title={hasLogin ? `Edit login — saved ${vault._saved_at ? new Date(vault._saved_at).toLocaleDateString() : ""}` : "Add producer-portal login"}
                        onClick={() => isOpen ? closeLoginEditor() : openLoginEditor(c)}
                        style={{ color: hasLogin ? "var(--accent-money)" : "var(--text-tertiary)" }}
                      >
                        <Icons.Lock size={11}/>
                      </button>
                      {canEdit && (
                        <>
                          <button className="icon-btn" title="Edit carrier details" onClick={() => setEditing({ ...c })}><Icons.Edit size={11}/></button>
                          <button className="icon-btn" title="Remove carrier" onClick={() => remove(c)}><Icons.X size={11}/></button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Inline login editor — opens directly under the carrier row.    */}
                  {/* No modal-within-modal: this lives in the page, not the carrier */}
                  {/* edit modal. Saves to connector_vault (per-user, RLS-scoped).   */}
                  {isOpen && (
                    <div style={{
                      gridColumn: "1 / -1",
                      padding: "12px 14px",
                      background: "color-mix(in oklch, var(--accent-money) 5%, var(--bg-raised))",
                      border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)",
                      borderRadius: 6,
                      margin: "2px 4px 6px",
                      display: "flex", flexDirection: "column", gap: 10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Icons.Lock size={12} style={{ color: "var(--accent-money)" }}/>
                        <strong style={{ fontSize: 12.5 }}>Your {c.name} producer-portal login</strong>
                        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                          stored encrypted · per-user · the local agent uses it to fetch live quotes
                        </span>
                        <button className="icon-btn" style={{ marginLeft: "auto" }} title="Close" onClick={closeLoginEditor}><Icons.X size={11}/></button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                        <Shared.Field label="Username">
                          <input
                            className="text-input"
                            value={loginForm.username}
                            onChange={(e) => setLoginForm(f => ({ ...f, username: e.target.value }))}
                            placeholder="producer.email@agency.com"
                            autoComplete="off"
                            autoFocus
                          />
                        </Shared.Field>
                        <Shared.Field label="Password">
                          <input
                            className="text-input"
                            type="password"
                            value={loginForm.password}
                            onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                            placeholder={vault?._has_password ? "•••••••• (saved · type to replace)" : "password"}
                            autoComplete="new-password"
                            onKeyDown={(e) => { if (e.key === "Enter") saveLogin(); if (e.key === "Escape") closeLoginEditor(); }}
                          />
                        </Shared.Field>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary" onClick={saveLogin} disabled={loginSaving || !loginForm.username.trim()}>
                            <Icons.Check size={11}/> {loginSaving ? "Saving…" : "Save login"}
                          </button>
                          {hasLogin && (
                            <button className="btn btn-ghost" onClick={clearLogin} disabled={loginSaving} title="Delete saved login for this carrier">
                              <Icons.X size={10}/> Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        Saved as <code style={{ fontSize: 10 }}>{window.repflowCarrierProvider ? window.repflowCarrierProvider(slug) : `carrier_${slug}`}</code>. Same row the Auto-Quoter Credentials tab reads.
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <Shared.Modal title={editing.id ? `Edit · ${editing.name || "Carrier"}` : "Add carrier"} width={560} onClose={() => setEditing(null)} actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !editing.name?.trim()}>
              <Icons.Check size={11}/> {busy ? "Saving…" : "Save carrier"}
            </button>
          </>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Catalog carrier">
              <Shared.Select
                value={editing.carrier_id || ""}
                onChange={(v) => {
                  const ref = catalog.find(c => c.id === v) || null;
                  setEditing({
                    ...editing,
                    carrier_id: v || "",
                    name: ref?.name || editing.name || "",
                    category: ref?.category || editing.category || "other",
                    contact_name: ref?.contact_name || editing.contact_name || "",
                    contact_email: ref?.contact_email || editing.contact_email || "",
                    contact_phone: ref?.contact_phone || editing.contact_phone || "",
                    product_lines: ref?.product_lines || editing.product_lines || [],
                  });
                }}
                options={[{ v: "", l: "Custom / manual" }, ...catalog.map(c => ({ v: c.id, l: c.name }))]}
              />
            </Shared.Field>
            <Shared.Field label="Carrier name">
              <input className="text-input" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="UnitedHealthcare" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Category">
              <Shared.Select value={editing.category || "other"} onChange={(v) => setEditing({ ...editing, category: v })} options={CARRIER_CATEGORIES}/>
            </Shared.Field>
            <Shared.Field label="Status">
              <Shared.Select value={editing.status || "pending"} onChange={(v) => setEditing({ ...editing, status: v })} options={CARRIER_STATUSES}/>
            </Shared.Field>
            <Shared.Field label="Contact name">
              <input className="text-input" value={editing.contact_name || ""} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} placeholder="Producer rep"/>
            </Shared.Field>
            <Shared.Field label="Contact email">
              <input className="text-input" type="email" value={editing.contact_email || ""} onChange={(e) => setEditing({ ...editing, contact_email: e.target.value })} placeholder="contracting@carrier.com"/>
            </Shared.Field>
            <Shared.Field label="Contact phone">
              <input className="text-input" value={editing.contact_phone || ""} onChange={(e) => setEditing({ ...editing, contact_phone: e.target.value })} placeholder="+1 (555) 555-5555"/>
            </Shared.Field>
          </div>

          <Shared.Field label="Product lines" hint={`${(editing.product_lines || []).length} selected`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "var(--bg-raised)", borderRadius: 6 }}>
              {CARRIER_PRODUCT_LINES.map(pl => (
                <button
                  key={pl}
                  type="button"
                  onClick={() => toggleProductLine(pl)}
                  className={`chip ${(editing.product_lines || []).includes(pl) ? "chip-money" : ""}`}
                  style={{ cursor: "pointer", border: 0, fontWeight: 500 }}
                >
                  {pl}
                </button>
              ))}
            </div>
          </Shared.Field>

          <Shared.Field label="Notes (optional)">
            <textarea
              className="text-input"
              value={editing.notes || ""}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              placeholder="Commission grid notes, contracting URL, contact context…"
              rows={3}
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </Shared.Field>
        </Shared.Modal>
      )}
      {/* Per-rep visibility toggles. Visible to every role (owner/manager
          can edit the underlying carrier list above; everyone — including
          reps — can prune which carriers show up in their own Quote tool
          and Deal-write dropdowns). Stored as reps.carrier_prefs jsonb. */}
      <CarrierPrefsTable carriers={carriers || []} agencyId={agencyId} />
    </div>
  );
}
window.SettingsCarriers = SettingsCarriers;

// ─── Per-rep carrier-visibility toggles ──────────────────────────────────
// Reads/writes reps.carrier_prefs jsonb for the signed-in user. Shape:
//   { quotes: { aetna: false, ... }, deals: { ... } }
// Empty / missing key = visible (the default). Only explicit `false` hides.
// Used by page-quote (CARRIER_NICHES filter) and page-deal-write (carrier
// dropdown filter) so a rep can declutter the surfaces they use daily.
function CarrierPrefsTable({ carriers, agencyId }) {
  const [prefs, setPrefs]   = React.useState(null);
  const [repId, setRepId]   = React.useState(null);
  const [busy,  setBusy]    = React.useState(false);
  const [saved, setSaved]   = React.useState("");

  React.useEffect(() => {
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        const sess = (await sb.auth.getSession())?.data?.session;
        const uid = sess?.user?.id;
        if (!uid) return;
        const { data } = await sb.from("reps")
          .select("id,carrier_prefs")
          .eq("user_id", uid)
          .maybeSingle();
        if (data) {
          setRepId(data.id);
          setPrefs(data.carrier_prefs || {});
        } else {
          // No rep row for this user — start with empty prefs (read-only state).
          setPrefs({});
        }
      } catch (_e) { setPrefs({}); }
    })();
  }, [agencyId]);

  const get = (kind, id) => {
    const v = prefs?.[kind]?.[id];
    return v !== false; // anything not explicitly false = visible
  };
  const toggle = async (kind, id) => {
    if (!repId) {
      window.toast && window.toast("Sign in first to save carrier preferences", "warn");
      return;
    }
    const next = { ...(prefs || {}) };
    next[kind] = { ...(next[kind] || {}) };
    next[kind][id] = !get(kind, id);          // flip current effective value
    setPrefs(next);
    setBusy(true); setSaved("");
    try {
      const sb = window.getSupabase();
      const { error } = await sb.from("reps").update({ carrier_prefs: next }).eq("id", repId);
      if (error) throw error;
      setSaved("Saved");
      setTimeout(() => setSaved(""), 1200);
      // Notify any open Quote / Deal-write surface to re-filter immediately.
      try { window.dispatchEvent(new CustomEvent("carrier-prefs:changed", { detail: next })); } catch {}
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e?.message || e}`, "error");
      // Roll back local state
      setPrefs(prev => {
        const r = { ...(prev || {}) };
        r[kind] = { ...(r[kind] || {}) };
        r[kind][id] = !next[kind][id];
        return r;
      });
    } finally { setBusy(false); }
  };

  if (prefs === null) {
    return <div style={{ marginTop: 18, padding: 14, color: "var(--text-tertiary)", fontSize: 12 }}>Loading your carrier preferences…</div>;
  }
  if (!carriers.length) return null;

  return (
    <div style={{ marginTop: 18, padding: 16, background: "var(--bg-raised)", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-tertiary)" }}>
          My carrier visibility
        </h4>
        <span style={{ fontSize: 11, color: "var(--text-quaternary)" }}>
          Toggle which carriers show up in your Quote tool and Deal-write dropdowns. Personal — doesn't affect teammates.
        </span>
        {saved && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent-money)" }}>{saved}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 6, alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>Carrier</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textAlign: "center" }}>Quotes</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textAlign: "center" }}>Deals</div>
        {carriers.map(c => {
          const key = carrierPrefKey(c);
          const onQ = get("quotes", key);
          const onD = get("deals",  key);
          return (
            <React.Fragment key={c.id}>
              <div style={{ fontSize: 12.5, padding: "6px 0" }}>{c.name || key}</div>
              <div style={{ textAlign: "center" }}>
                <button disabled={busy} className={`chip ${onQ ? "chip-money" : ""}`} style={{ cursor: busy ? "wait" : "pointer", border: 0, minWidth: 56 }} onClick={() => toggle("quotes", key)}>
                  {onQ ? "on" : "off"}
                </button>
              </div>
              <div style={{ textAlign: "center" }}>
                <button disabled={busy} className={`chip ${onD ? "chip-money" : ""}`} style={{ cursor: busy ? "wait" : "pointer", border: 0, minWidth: 56 }} onClick={() => toggle("deals", key)}>
                  {onD ? "on" : "off"}
                </button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

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
    sb.from("connections").select("config").eq("id", "twilio").maybeSingle().then(({ data }) => {
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
  if (_twActive) { try { _twActive.disconnect(); } catch (e) { console.warn("[tenant.twilioDisconnect]", e); } }
  _twActive = await dev.connect({ params: { To: phone, leadName: leadName || "" } });
  window.dispatchEvent(new CustomEvent("twilio:active", { detail: { phone, leadName } }));
  window.toast && window.toast(`Dialing ${leadName || phone}`, "info");
  return true;
};

})();
