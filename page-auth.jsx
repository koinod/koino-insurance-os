/* page-auth.jsx — Login screen + auth state machine

   Renders ABOVE the main app when no Supabase session is present.
   Once a magic link is clicked + session set, the App mounts. */

(function () {

function LoginScreen() {
  const [email, setEmail]     = React.useState("");
  const [stage, setStage]     = React.useState("idle"); // idle | sending | sent | error
  const [errMsg, setErrMsg]   = React.useState("");
  const sb = window.getSupabase();

  const send = async () => {
    if (!email.trim()) return;
    setStage("sending");
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      setStage("sent");
    } catch (e) {
      setErrMsg(e.message || String(e));
      setStage("error");
    }
  };

  const skip = () => {
    // Demo escape hatch — hide auth screen for the session, app reads mocks
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

        {stage === "sent" ? (
          <>
            <div style={{ padding: 14, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 8, color: "var(--accent-money)", fontSize: 13, lineHeight: 1.5 }}>
              <Icons.Check size={14}/> Magic link sent to <strong>{email}</strong>. Click it to sign in.
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setStage("idle"); setEmail(""); }}>← Use a different email</button>
          </>
        ) : (
          <>
            <div className="field-l">Sign in with email</div>
            <input
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@atlasimo.com"
              onKeyDown={(e) => e.key === "Enter" && send()}
              autoFocus
              style={{ marginTop: 6, fontSize: 14, padding: "10px 12px" }}
            />
            <button
              className="btn btn-primary"
              onClick={send}
              disabled={stage === "sending" || !email.trim()}
              style={{ width: "100%", justifyContent: "center", marginTop: 10, padding: "10px 14px", fontSize: 13 }}
            >
              {stage === "sending" ? "Sending..." : <><Icons.Send size={12}/> Email me a sign-in link</>}
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
  const [session, setSession] = React.useState(undefined); // undefined = checking, null = no session, obj = signed in
  const [demo, setDemo]       = React.useState(sessionStorage.getItem("repflow.demo") === "1");
  const [tenant, setTenant]   = React.useState(undefined); // undefined = checking, null = no agency, obj = has agency
  const sb = window.getSupabase();

  const refreshTenant = React.useCallback(async () => {
    if (window.loadTenant) {
      const t = await window.loadTenant();
      setTenant(t);
    } else { setTenant(null); }
  }, []);

  React.useEffect(() => {
    if (!sb) { setSession(null); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        // Redeem stashed invite if there is one, then refresh tenant
        const stash = sessionStorage.getItem("repflow.pending_invite");
        if (stash) {
          sb.rpc("redeem_invite", { p_token: stash }).then(() => {
            sessionStorage.removeItem("repflow.pending_invite");
            refreshTenant();
          });
        } else {
          refreshTenant();
        }
      }
    });
    const onSkip = () => setDemo(true);
    window.addEventListener("auth:skip", onSkip);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("auth:skip", onSkip); };
  }, []);

  React.useEffect(() => { if (session) refreshTenant(); }, [session, refreshTenant]);

  if (session === undefined) {
    return <div className="login-shell"><div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Checking session...</div></div>;
  }
  if (!session && !demo) return <LoginScreen/>;
  if (session && tenant && !tenant.member && window.OnboardingWizard) {
    const W = window.OnboardingWizard;
    return <W onComplete={() => refreshTenant()}/>;
  }
  return children;
}

window.AuthGate = AuthGate;
window.LoginScreen = LoginScreen;
window.signOut = async function () {
  const sb = window.getSupabase();
  if (sb) await sb.auth.signOut();
  sessionStorage.removeItem("repflow.demo");
  window.location.reload();
};

})();
