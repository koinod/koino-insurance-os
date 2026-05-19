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

const LOGIN_PATH = "/login";

function isLoginPath() {
  try {
    const p = window.location.pathname || "/";
    return p === LOGIN_PATH || p === LOGIN_PATH + "/";
  } catch { return false; }
}

// Honor ?next= from /login. Sanitize to a same-origin pathname+search so a
// crafted ?next=https://evil.example/ can't bounce the user off-site after
// sign-in. Defaults to "/".
function nextFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw) return "/";
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/";
    return (u.pathname || "/") + (u.search || "") + (u.hash || "");
  } catch { return "/"; }
}

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
  // intent: "signin" (returning user) | "signup" (new account → onboarding).
  // Seeded from ?signup=1 so landing-page CTAs still land on the right screen.
  const initialIntent = (() => {
    try { return new URLSearchParams(window.location.search).get("signup") === "1" ? "signup" : "signin"; }
    catch { return "signin"; }
  })();
  const [intent, setIntent]   = React.useState(initialIntent);
  const isSignup              = intent === "signup";
  const [email, setEmail]     = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode]       = React.useState("magic"); // magic | password
  const [stage, setStage]     = React.useState("idle"); // idle | sending | sent | error
  const [errMsg, setErrMsg]   = React.useState("");
  const sb = window.getSupabase();
  const pendingInvite = stashInviteFromUrl();
  const emailRef = React.useRef(null);
  React.useEffect(() => {
    if (emailRef.current) {
      try { emailRef.current.focus(); } catch {}
    }
  }, [isSignup]);

  // Keep ?signup= in the URL in sync with the toggle so a refresh + magic-link
  // round-trip preserve the user's intent. replaceState so we don't pollute
  // back-button history.
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (isSignup) url.searchParams.set("signup", "1");
      else url.searchParams.delete("signup");
      window.history.replaceState({}, "", url.toString());
    } catch {}
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

  // Sign-up path: creates the auth user. AuthGate then sees session+no
  // agency_member → renders PageFirstRun → ProducerOnboardingWizard. If email
  // confirmation is enabled in Supabase, the user gets the same "check your
  // email" UX as a magic link (Supabase returns session=null until confirm).
  const signUpWithPassword = async () => {
    if (!email.trim() || !password) return;
    setStage("sending"); setErrMsg("");
    try {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      // No session means email confirmation is required — surface the "sent" UI
      // so the user knows to check their inbox. Confirmed signups drop straight
      // into AuthGate which routes them to onboarding.
      if (!data?.session) setStage("sent");
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
      // Magic-link round-trip ALWAYS lands on /login so AuthGate runs the
      // post-signin redirect + onboarding gating in one place.
      const redirectTo = origin + LOGIN_PATH + search;

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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div className="sb-brand-mark" style={{ width: 36, height: 36, fontSize: 18 }}>R</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
              {isSignup ? "Create your account" : "Repflow"}
            </div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {isSignup ? "Sign up — we'll walk you through onboarding next." : "Operator-grade for life & health distribution"}
            </div>
          </div>
        </div>

        {/* Top-level Sign in / Sign up toggle. Hidden after the email-sent
            confirmation so we don't tempt the user to switch mid-flow. */}
        {stage !== "sent" && (
          <div className="os-glass-bar" role="tablist" aria-label="Account intent" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
            <button role="tab" aria-selected={!isSignup} onClick={() => { setIntent("signin"); setErrMsg(""); }}
              className={"os-glass-btn" + (!isSignup ? " is-active" : "")}>
              <div className="os-glass-label" style={{ fontSize: 12 }}>Sign in</div>
              <div className="os-glass-sub">EXISTING ACCOUNT</div>
            </button>
            <button role="tab" aria-selected={isSignup} onClick={() => { setIntent("signup"); setErrMsg(""); }}
              className={"os-glass-btn" + (isSignup ? " is-active" : "")}>
              <div className="os-glass-label" style={{ fontSize: 12 }}>Sign up</div>
              <div className="os-glass-sub">NEW · ONBOARDING</div>
            </button>
          </div>
        )}

        {pendingInvite && stage !== "sent" && (
          <div style={{ marginBottom: 12, padding: 10, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 30%, transparent)", borderRadius: 6, color: "var(--accent-status)", fontSize: 12, lineHeight: 1.5 }}>
            <Icons.Mail size={12}/> You're joining via an invite. Sign in with email to accept.
          </div>
        )}

        {stage === "sent" ? (
          <>
            <div style={{ padding: 14, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 8, color: "var(--accent-money)", fontSize: 13, lineHeight: 1.5 }}>
              <Icons.Check size={14}/> {isSignup ? "Confirmation" : "Magic"} link sent to <strong>{email}</strong>. Click it to {isSignup ? "finish signing up — onboarding starts right after" : "sign in"}.
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

            <div className="field-l">
              {mode === "magic"
                ? (isSignup ? "Sign up with email" : "Sign in with email")
                : (isSignup ? "Pick a password" : "Email + password")}
            </div>
            <input
              ref={emailRef}
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (mode === "magic") return send();
                return isSignup ? signUpWithPassword() : signInWithPassword();
              }}
              autoFocus
              style={{ marginTop: 6, fontSize: 14, padding: "10px 12px" }}
            />
            {mode === "password" && (
              <input
                className="text-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "Create a password" : "Password"}
                onKeyDown={(e) => e.key === "Enter" && (isSignup ? signUpWithPassword() : signInWithPassword())}
                style={{ marginTop: 8, fontSize: 14, padding: "10px 12px" }}
              />
            )}
            <button
              className="btn btn-primary"
              onClick={mode === "magic" ? send : (isSignup ? signUpWithPassword : signInWithPassword)}
              disabled={stage === "sending" || !email.trim() || (mode === "password" && !password)}
              style={{ width: "100%", justifyContent: "center", marginTop: 10, padding: "10px 14px", fontSize: 13 }}
            >
              {stage === "sending"
                ? (isSignup ? "Creating account…" : "Signing in…")
                : mode === "magic"
                  ? <><Icons.Send size={12}/> {isSignup ? "Email me a sign-up link" : "Email me a sign-in link"}</>
                  : <><Icons.Shield size={12}/> {isSignup ? "Create account & continue" : "Sign in"}</>}
            </button>
            {isSignup && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5, textAlign: "center" }}>
                After {mode === "magic" ? "you click the email link" : "you create your account"}, we'll walk you through agency setup.
              </div>
            )}

            <button
              className="btn btn-ghost"
              onClick={async () => {
                const search = pendingInvite ? `?invite=${encodeURIComponent(pendingInvite)}` : "";
                const { error } = await sb.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin + LOGIN_PATH + search }
                });
                if (error) {
                  // Common path: provider disabled in Supabase Auth dashboard.
                  // Surface something useful instead of silently failing.
                  setStage("error");
                  setErrMsg(
                    /provider is not enabled/i.test(error.message || "")
                      ? "Google sign-in isn't set up yet. Use the email link above."
                      : `Google sign-in failed: ${error.message}`
                  );
                }
              }}
              style={{ width: "100%", justifyContent: "center", marginTop: 8, fontSize: 13 }}
            >
              <Icons.Chrome size={12} style={{ marginRight: 6 }}/> {isSignup ? "Sign up with Google" : "Sign in with Google"}
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
  // Unauthed visitor routing:
  //   /login       → render LoginScreen inline (the only path that does)
  //   /  (bare)    → bounce to /landing (marketing splash; the funnel entry)
  //   anything else (deep link, ?invite, ?signup, ?next, OAuth callback)
  //                → bounce to /login?next=… so we preserve their intent
  //                  and don't drop them on the marketing page after they
  //                  followed a real link.
  if (!session && !demo) {
    if (isLoginPath()) return <LoginScreen/>;
    try {
      const path   = window.location.pathname || "/";
      const search = window.location.search || "";
      const hash   = window.location.hash || "";
      const bareRoot = path === "/" && !search && !hash;
      if (bareRoot) {
        window.location.replace("/landing");
      } else {
        const cur = path + search + hash;
        const incoming = new URLSearchParams(search);
        const out = new URLSearchParams();
        const signup = incoming.get("signup");
        const invite = incoming.get("invite");
        if (signup) out.set("signup", signup);
        if (invite) out.set("invite", invite);
        if (cur && cur !== "/" && cur !== LOGIN_PATH) out.set("next", cur);
        const qs = out.toString();
        window.location.replace(LOGIN_PATH + (qs ? "?" + qs : ""));
      }
    } catch { window.location.replace(LOGIN_PATH); }
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Redirecting…</div></div>;
  }
  // Past the login wall (real session OR demo skip) but URL is still /login —
  // send the user to ?next or "/" so app chrome (and the onboarding gating
  // below) renders under the right URL.
  if ((session || demo) && isLoginPath()) {
    const target = nextFromUrl();
    window.location.replace(target);
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{session ? "Signing you in…" : "Loading demo…"}</div></div>;
  }
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
  // the owner → resume the agency wizard. Producers (rep) skip this because
  // they don't own the agency setup. Managers/super_admins are included so
  // an agency where the DB role is "manager" (the post-retirement default
  // for what used to be "owner") still resumes correctly.
  const OWNER_LIKE = new Set(["owner", "manager", "super_admin", "admin", "imo_owner"]);
  if (session && tenant && tenant.member && tenant.agency
      && tenant.agency.onboarding_complete === false
      && OWNER_LIKE.has(tenant.member.role)
      && window.PageFirstRun) {
    const F = window.PageFirstRun;
    return <F session={session} resumeAgency={tenant.agency} onDone={() => refreshTenant()}/>;
  }
  // Member exists but no reps row yet → producer/profile wizard.
  // Scope: producer roles ONLY. Managers/owners/admins legitimately may not
  // have a rep_id (they don't sell), and the wizard collects rep-specific
  // info (NPN, licensed states, carrier appts) that's nonsensical for them.
  // Without this guard, any manager whose provision_rep_for_member RPC
  // silently failed (or who simply never needed a rep_id) got trapped in
  // an onboarding loop on every login.
  const memberRole = tenant?.member?.role;
  const needsProducerProfile = memberRole === "rep" || memberRole === "producer";
  if (session && tenant && tenant.member && !tenant.member.rep_id && needsProducerProfile && window.ProducerOnboardingWizard) {
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
