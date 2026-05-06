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
    window.dispatchEvent(new CustomEvent("auth:skip"));
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Repflow</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Operator-grade for life & health distribution</div>
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
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@atlasimo.com"
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
                No account, no real data — just the prototype on mocks.
              </div>
            </div>
          </>
        )}
      </div>
      <div className="login-foot">Atlas IMO · powered by Repflow</div>
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

  const refreshTenant = React.useCallback(async () => {
    if (window.loadTenant) {
      const t = await window.loadTenant();
      setTenant(t);
      // Once tenant is loaded, refresh the global window.me() cache so
      // header chips, scopeRepIds, etc. immediately use the right identity.
      if (window.refreshMe) window.refreshMe();
    } else { setTenant(null); }
  }, []);

  const redeemAndRefresh = React.useCallback(async () => {
    const token = sessionStorage.getItem("repflow.pending_invite");
    if (!token) { return refreshTenant(); }
    setRedeeming(true);
    try {
      const { error } = await sb.rpc("redeem_invite", { p_token: token });
      if (error) {
        window.toast && window.toast(`Invite: ${error.message}`, "error");
      } else {
        window.toast && window.toast("Joined the agency · welcome", "success");
      }
      sessionStorage.removeItem("repflow.pending_invite");
      // Strip the param from the URL so refreshes don't re-redeem
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("invite")) {
          url.searchParams.delete("invite");
          window.history.replaceState({}, "", url.toString());
        }
      } catch {}
    } finally {
      setRedeeming(false);
      await refreshTenant();
    }
  }, [refreshTenant, sb]);

  React.useEffect(() => {
    if (!sb) { setSession(null); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) redeemAndRefresh();
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
  // Signed in but tenant lookup hasn't returned yet — avoid flashing the main
  // app (which would render with the demo/Marcus identity for a beat).
  if (session && tenant === undefined) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading your agency...</div></div>;
  }

  // No agency_members row at all → user-type picker (Start / Join / Solo).
  // FirstRun handles the agency creation, invite redemption, or solo flow,
  // then refreshes tenant when done.
  if (session && tenant && !tenant.member && window.PageFirstRun) {
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
  if (sb) await sb.auth.signOut();
  sessionStorage.removeItem("repflow.demo");
  sessionStorage.removeItem("repflow.pending_invite");
  // Drop the cached me() identity too so a fresh sign-in re-resolves it
  try { sessionStorage.removeItem("__repflow_me_v1"); } catch {}
  window.location.reload();
};

})();
