/* page-auth.jsx — Login screen + auth state machine

   Renders ABOVE the main app when no Supabase session is present.
   Once a magic link is clicked + session set, the App mounts.

   Auth round-trip rules (learned the hard way):
   - `?invite=TOKEN` arrives on the URL when a teammate clicks an invite link.
     We MUST stash it to sessionStorage on first paint, before the user clicks
     any auth button. The magic-link redirect strips query params if we don't
     either preserve them in `emailRedirectTo` OR retrieve them from session
     storage on return — we now do both, belt + suspenders.
   - `redeem_invite` runs after `onAuthStateChange` fires, so the user is
     joined into the right agency before `loadTenant` runs.
   - Owners who created an agency via `create_agency` end up with an
     `agency_members` row (role=owner, rep_id=null) but NO `reps` row, so
     `me()` returns null and /api/me falls back to demo identity. We route
     them through ProducerOnboardingWizard too — `provision_rep_for_member`
     handles owners just fine. */

(function () {

function stashInviteFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("invite");
    if (t) {
      sessionStorage.setItem("repflow.pending_invite", t);
      return t;
    }
  } catch {}
  return sessionStorage.getItem("repflow.pending_invite") || null;
}

function LoginScreen() {
  const [email, setEmail]     = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode]       = React.useState("magic"); // magic | password
  const [stage, setStage]     = React.useState("idle"); // idle | sending | sent | error
  const [errMsg, setErrMsg]   = React.useState("");
  const sb = window.getSupabase();
  const pendingInvite = stashInviteFromUrl();
  // ?signup=1 — landing-page CTA path. Focus email + show "Create account" header.
  const isSignup = React.useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("signup") === "1"; }
    catch { return false; }
  }, []);
  const emailRef = React.useRef(null);
  React.useEffect(() => {
    if (isSignup && emailRef.current) {
      try { emailRef.current.focus(); } catch {}
    }
  }, [isSignup]);

  const signInWithPassword = async () => {
    if (!email.trim() || !password) return;
    setStage("sending"); setErrMsg("");
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange in App will pick up the session
    } catch (e) {
      setErrMsg(e.message || String(e));
      setStage("error");
    }
  };

  const send = async () => {
    if (!email.trim()) return;
    setStage("sending");
    try {
      // Preserve `?invite=...` across the magic-link redirect. Supabase
      // honors emailRedirectTo as long as it's listed in the project's
      // "Additional Redirect URLs" — origin+pathname+search is allowed
      // because origin+pathname is registered with `?invite=*` matching.
      const search = pendingInvite ? `?invite=${encodeURIComponent(pendingInvite)}` : "";

      // Allowlisted origins, in priority order. The magic-link email's
      // redirectTo MUST match one of these (Supabase Auth → URL Configuration →
      // Additional Redirect URLs). The first one that matches the current
      // window origin is preferred, so a user on repflow.koino.capital stays
      // on repflow.koino.capital. Localhost is supported for dev. Otherwise
      // we fall through to the canonical production origin.
      const ALLOWED_ORIGINS = [
        "https://repflow.koino.capital",
        "https://koino-insurance-os.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
      ];
      const PROD_ORIGIN = ALLOWED_ORIGINS[0];
      const here = window.location.origin;
      const origin = ALLOWED_ORIGINS.includes(here) ? here : PROD_ORIGIN;
      const redirectTo = origin + (window.location.pathname || "/") + search;

      if (origin !== here) {
        console.info("[auth] redirect origin mismatch — using allowlisted origin:", origin);
      }

      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
      setStage("sent");
    } catch (e) {
      setErrMsg(e.message || String(e));
      setStage("error");
    }
  };

  const skip = () => {
    sessionStorage.setItem("repflow.demo", "1");
    window.__demoSkip = true;
    // Populate AppData with the in-memory seed so the prototype surface has
    // content. (Real signed-in agencies never call this path.)
    if (window.loadDemoSeed) window.loadDemoSeed();
    window.dispatchEvent(new CustomEvent("auth:skip"));
    if (window.hydrateFromSupabase) window.hydrateFromSupabase();
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
              {isSignup ? "Create your account" : "Repflow"}
            </div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {isSignup ? "Enter your work email — we'll send a sign-in link." : "Operator-grade for life & health distribution"}
            </div>
          </div>
        </div>

        {pendingInvite && stage !== "sent" && (
          <div style={{ marginBottom: 12, padding: 10, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 30%, transparent)", borderRadius: 6, color: "var(--accent-status)", fontSize: 12, lineHeight: 1.5 }}>
            <Icons.Mail size={12}/> You're joining via an invite. Sign in with email to accept.
          </div>
        )}

        {stage === "sent" ? (
          <>
            <div style={{ padding: 14, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 8, color: "var(--accent-money)", fontSize: 13, lineHeight: 1.5 }}>
              <Icons.Check size={14}/> Magic link sent to <strong>{email}</strong>. Click it to sign in.
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
              The link points at <code style={{ fontSize: 10.5 }}>{(window.location.origin || "").replace(/^https?:\/\//, "")}</code> — the same domain you opened from.
              {pendingInvite && <> Your invite token is saved · we'll redeem it after sign-in.</>}
              <br/>
              <span style={{ color: "var(--text-tertiary)" }}>
                If the link opens to a localhost page that doesn't load, the project's Supabase auth Site URL needs updating — see Setup tab.
              </span>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setStage("idle"); setEmail(""); }}>← Use a different email</button>
          </>
        ) : (
          <>
            {/* Mode toggle: magic link vs password (password = SMTP-free fallback) */}
            <div className="os-glass-bar" role="tablist" aria-label="Sign-in mode" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
              <button role="tab" aria-selected={mode === "magic"} onClick={() => { setMode("magic"); setErrMsg(""); }}
                className={"os-glass-btn" + (mode === "magic" ? " is-active" : "")}>
                <div className="os-glass-label" style={{ fontSize: 12 }}>Magic link</div>
                <div className="os-glass-sub">EMAIL</div>
              </button>
              <button role="tab" aria-selected={mode === "password"} onClick={() => { setMode("password"); setErrMsg(""); }}
                className={"os-glass-btn" + (mode === "password" ? " is-active" : "")}>
                <div className="os-glass-label" style={{ fontSize: 12 }}>Password</div>
                <div className="os-glass-sub">NO EMAIL NEEDED</div>
              </button>
            </div>

            <div className="field-l">{mode === "magic" ? "Sign in with email" : "Email + password"}</div>
            <input
              ref={emailRef}
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              onKeyDown={(e) => e.key === "Enter" && (mode === "magic" ? send() : signInWithPassword())}
              autoFocus
              style={{ marginTop: 6, fontSize: 14, padding: "10px 12px" }}
            />
            {mode === "password" && (
              <input
                className="text-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={(e) => e.key === "Enter" && signInWithPassword()}
                style={{ marginTop: 8, fontSize: 14, padding: "10px 12px" }}
              />
            )}
            <button
              className="btn btn-primary"
              onClick={mode === "magic" ? send : signInWithPassword}
              disabled={stage === "sending" || !email.trim() || (mode === "password" && !password)}
              style={{ width: "100%", justifyContent: "center", marginTop: 10, padding: "10px 14px", fontSize: 13 }}
            >
              {stage === "sending"
                ? "Signing in…"
                : mode === "magic"
                  ? <><Icons.Send size={12}/> Email me a sign-in link</>
                  : <><Icons.Shield size={12}/> Sign in</>}
            </button>

            <button
              className="btn btn-ghost"
              onClick={async () => {
                const search = pendingInvite ? `?invite=${encodeURIComponent(pendingInvite)}` : "";
                await sb.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin + window.location.pathname + search }
                });
              }}
              style={{ width: "100%", justifyContent: "center", marginTop: 8, fontSize: 13 }}
            >
              <Icons.Chrome size={12} style={{ marginRight: 6 }}/> Sign in with Google
            </button>
            {stage === "error" && (
              <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>
                {errMsg}
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 16, paddingTop: 14 }}>
              <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={skip}>
                Skip → Continue with demo data
              </button>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-quaternary)", textAlign: "center" }}>
                No account required — explore a read-only instance of Repflow.
              </div>
            </div>
          </>
        )}
      </div>
      <div className="login-foot">Repflow · operator-grade for life & health distribution</div>
    </div>
  );
}

function AuthGate({ children }) {
  // ?demo=1 in the URL auto-enters demo mode and persists for the session.
  if (typeof window !== "undefined" && window.location.search.indexOf("demo=1") >= 0) {
    try { sessionStorage.setItem("repflow.demo", "1"); } catch {}
  }

  // Stash any ?invite=TOKEN to sessionStorage IMMEDIATELY on mount so it
  // survives a magic-link redirect even if Supabase strips search params.
  if (typeof window !== "undefined") stashInviteFromUrl();

  const [session, setSession] = React.useState(undefined); // undefined = checking, null = no session, obj = signed in
  const [demo, setDemo]       = React.useState(sessionStorage.getItem("repflow.demo") === "1");
  const [tenant, setTenant]   = React.useState(undefined); // undefined = checking, null = no agency, obj = has agency
  const [redeeming, setRedeeming] = React.useState(false);
  const sb = window.getSupabase();

  // Track tenant errors so we can render a recovery screen instead of a
  // permanent "Loading your agency..." spinner when loadTenant fails.
  const [tenantError, setTenantError] = React.useState(null);

  const refreshTenant = React.useCallback(async () => {
    if (!window.loadTenant) { setTenant(null); return; }
    try {
      setTenantError(null);
      const t = await window.loadTenant();
      // Refresh me() BEFORE flipping tenant — otherwise AuthGate re-renders
      // with fresh tenant.member but stale me ({role:"unmapped", needs_onboarding:true})
      // and `isUnmapped` routes the user back to FirstRun even though they
      // just created their agency. Awaiting refreshMe makes both sources of
      // truth consistent at the next render.
      if (window.refreshMe) {
        try { await window.refreshMe(); } catch (e) { console.error("refreshMe in refreshTenant:", e); }
      }
      setTenant(t);
    } catch (e) {
      // Surface the failure instead of leaving the spinner forever.
      console.error("loadTenant failed:", e);
      setTenantError(e?.message || String(e));
      setTenant(null);
    }
  }, []);

  const redeemAndRefresh = React.useCallback(async () => {
    const token = sessionStorage.getItem("repflow.pending_invite");
    if (!token) { return refreshTenant(); }
    setRedeeming(true);
    try {
      try {
        const { error } = await sb.rpc("redeem_invite", { p_token: token });
        if (error) {
          window.toast && window.toast(`Invite: ${error.message}`, "error");
        } else {
          window.toast && window.toast("Joined the agency · welcome", "success");
        }
      } catch (e) {
        // Network or unexpected throw — don't block the user, just toast and move on.
        window.toast && window.toast(`Invite redeem failed: ${e?.message || e}`, "error");
      }
      try { sessionStorage.removeItem("repflow.pending_invite"); } catch {}
      // Strip the param from the URL so refreshes don't re-redeem
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("invite")) {
          url.searchParams.delete("invite");
          window.history.replaceState({}, "", url.toString());
        }
      } catch {}
    } finally {
      // ALWAYS clear the redeeming flag, even if refreshTenant throws below —
      // otherwise the user gets stuck on "Joining your agency..." forever.
      setRedeeming(false);
      try { await refreshTenant(); } catch (e) { console.error("refreshTenant after redeem:", e); }
    }
  }, [refreshTenant, sb]);

  React.useEffect(() => {
    if (!sb) { setSession(null); return; }
    // .catch is critical — a rejected getSession (network failure, malformed
    // stored token) used to leave session=undefined forever, freezing the app
    // on the "Checking session..." screen.
    sb.auth.getSession()
      .then(({ data }) => {
        const s = data.session || null;
        // A real session always wins over the demo skip flag — clear it so
        // header/sidebar stop calling the user "Guest" or "Demo" after login.
        if (s) {
          try { sessionStorage.removeItem("repflow.demo"); } catch {}
          window.__demoSkip = false;
          setDemo(false);
        }
        setSession(s);
      })
      .catch((e) => {
        console.error("getSession failed:", e);
        setSession(null);
      });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (s) {
        try { sessionStorage.removeItem("repflow.demo"); } catch {}
        window.__demoSkip = false;
        setDemo(false);
      }
      setSession(s);
      // Only trigger tenant refresh on real auth transitions, not silent token
      // refreshes (which fire ~hourly and would re-hit the agency lookup).
      if (s && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED")) {
        redeemAndRefresh();
      }
    });
    const onSkip = () => setDemo(true);
    window.addEventListener("auth:skip", onSkip);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("auth:skip", onSkip); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tenant load also runs whenever session flips to truthy (covers the
  // initial getSession path which doesn't go through onAuthStateChange).
  React.useEffect(() => {
    if (session && tenant === undefined) redeemAndRefresh();
  }, [session, tenant, redeemAndRefresh]);

  if (session === undefined) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Checking session...</div></div>;
  }
  if (redeeming) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Joining your agency...</div></div>;
  }
  if (!session && !demo) return <LoginScreen/>;
  // Tenant lookup failed — give the user a real path forward instead of an
  // infinite spinner. Reload re-runs the whole AuthGate, Sign out wipes state.
  if (session && tenantError) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--state-danger)", marginBottom: 6 }}>Couldn't load your agency</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14, lineHeight: 1.5 }}>{tenantError}</div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={() => { setTenantError(null); setTenant(undefined); refreshTenant(); }}>
            Try again
          </button>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.signOut && window.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  // Signed in but tenant lookup hasn't returned yet — avoid flashing the main
  // app (which would render with the demo/Marcus identity for a beat).
  if (session && tenant === undefined) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading your agency...</div></div>;
  }

  // Handle "unmapped" users who have an auth session but no agency links yet.
  // This covers the specific request to send unmapped accounts through onboarding.
  const me = window.me && window.me();
  // tenant.member is the authoritative signal that the user belongs to an
  // agency. me() is a cached identity lookup that lags by one fetch behind
  // a fresh signup, so ONLY consult it when tenant has no member. Without
  // this guard, the moment after agency creation we re-rendered with
  // tenant.member set but me still "unmapped" → routed back to FirstRun → loop.
  const isUnmapped = !!(session && me && (me.role === "unmapped" || me.needs_onboarding))
                     && !(tenant && tenant.member);

  // No agency_members row at all OR explicitly unmapped → user-type picker.
  if (session && (isUnmapped || (tenant && !tenant.member)) && window.PageFirstRun) {
    const F = window.PageFirstRun;
    return <F session={session} onDone={() => refreshTenant()}/>;
  }
  // Member exists, but their agency hasn't completed onboarding AND they're
  // the owner → resume the agency wizard. Producers (rep/manager) skip this
  // because they don't own the agency setup.
  if (session && tenant && tenant.member && tenant.agency
      && tenant.agency.onboarding_complete === false
      && tenant.member.role === "owner"
      && window.PageFirstRun) {
    const F = window.PageFirstRun;
    return <F session={session} resumeAgency={tenant.agency} onDone={() => refreshTenant()}/>;
  }
  // Member exists but no reps row yet → producer/profile wizard (invitees).
  if (session && tenant && tenant.member && !tenant.member.rep_id && window.ProducerOnboardingWizard) {
    const P = window.ProducerOnboardingWizard;
    return <P tenant={tenant} onComplete={() => refreshTenant()}/>;
  }
  return children;
}

window.AuthGate = AuthGate;
window.LoginScreen = LoginScreen;
window.signOut = async function () {
  const sb = window.getSupabase();
  // Sign out of Supabase first so the SDK clears its own storage. Wrapped in
  // try/catch because a network error here must NEVER prevent the local
  // wipe + reload from happening — that's how users got stuck "signed in"
  // looking at stale data.
  try { if (sb) await sb.auth.signOut(); } catch (e) { console.error("supabase signOut:", e); }

  // Sweep every Repflow-owned key from session + local storage so the next
  // sign-in starts from a true clean slate.
  try {
    sessionStorage.removeItem("repflow.demo");
    sessionStorage.removeItem("repflow.pending_invite");
    sessionStorage.removeItem("repflow.firstRunDone");
    localStorage.removeItem("repflow.onboarding_complete");
    // Also sweep keys matching the pattern
    const sweep = (storage) => {
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k.startsWith("repflow.") || k.startsWith("repflow:") || k === "__repflow_me_v1" || k.includes("supabase.auth.token"))) {
          keys.push(k);
        }
      }
      for (const k of keys) { try { storage.removeItem(k); } catch {} }
    };
    sweep(sessionStorage);
    sweep(localStorage);
  } catch (e) { console.error("storage sweep failed:", e); }

  // Wipe in-memory globals
  window.__me = null;
  window.__activeAgency = null;
  window.__demoSkip = false;
  window.__demoAgencyIds = [];
  window.__authRole = null;
  window.adminImpersonate = null;

  // Final fallback: just clear session entirely if we're in demo mode
  try { sessionStorage.clear(); } catch {}

  // Reload bootstraps the supabase client + AppData hydrate from scratch.
  window.location.reload();
};

})();
