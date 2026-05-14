/* page-invite-team.jsx — owner/manager UI to mint invite links.
 *
 * Drops a single panel onto the Recruiting page (or anywhere else it's
 * mounted). For each invite:
 *   - Pick the role: rep | manager
 *   - Pick the upline (defaults to current viewer when role=rep; null when
 *     role=manager and viewer is owner)
 *   - Click "Generate link" → POST /api/invites/create
 *   - Copy the resulting URL, share with the new hire
 *
 * Acceptance flow (handled by redeem_invite RPC, wired in page-auth.jsx):
 *   - New user clicks ?invite=TOKEN link → magic-link sign-in
 *   - On first auth event after redirect, redeemAndRefresh() calls
 *     sb.rpc("redeem_invite", { p_token }) which creates the agency_members
 *     row + inserts a reps row with role + upline_rep_id from the invite.
 *   - Then me() returns the new identity → page renders for that role.
 */

(function () {
  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
      window.toast && window.toast("Invite link copied", "success");
    } catch {
      // Fallback: prompt
      try { window.prompt("Copy this invite link:", text); } catch {}
    }
  }

  async function getJwt() {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }

  function InviteTeamPanel() {
    const me = (window.me && window.me()) || null;
    const [role, setRole] = React.useState("rep");
    const [emailHint, setEmailHint] = React.useState("");
    const [uplineRepId, setUplineRepId] = React.useState(me?.rep_id || "");
    const [busy, setBusy] = React.useState(false);
    const [link, setLink] = React.useState(null);
    const [errMsg, setErrMsg] = React.useState("");
    const [recent, setRecent] = React.useState([]);
    // eligibleUplines is loaded from agency_members joined to reps. The role
    // column lives on agency_members, NOT on reps — REPS in window.AppData
    // doesn't carry it, so we have to query directly.
    const [eligibleUplines, setEligibleUplines] = React.useState([]);
    const [authedJwt, setAuthedJwt] = React.useState(null);

    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        const j = await getJwt();
        if (cancelled) return;
        setAuthedJwt(j);
        if (!me?.agency_id) return;
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) return;
          // Pull every active manager who can serve as an upline. Reps always
          // nest under a manager; invited managers can also nest under a manager.
          const { data, error } = await sb
            .from("agency_members")
            .select("rep_id, role")
            .eq("agency_id", me.agency_id)
            .eq("active", true)
            .in("role", ["manager", "super_admin"]);
          if (error || cancelled) return;
          const repsById = Object.fromEntries(((window.AppData && window.AppData.REPS) || []).map(r => [r.id, r]));
          setEligibleUplines((data || [])
            .filter(m => m.rep_id)
            .map(m => ({
              id: m.rep_id,
              role: m.role,
              name: repsById[m.rep_id]?.name || m.rep_id,
            })));
        } catch {}
      })();
      return () => { cancelled = true; };
    }, [me?.agency_id]);

    React.useEffect(() => {
      if (!me) return;
      // Both rep and manager invites default upline to the current user.
      setUplineRepId(me.rep_id || "");
    }, [role, me?.rep_id]);

    if (!me) {
      return (
        <div className="panel" style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          Loading viewer identity…
        </div>
      );
    }
    if (me.role !== "manager" && me.role !== "super_admin") {
      return null;
    }
    if (!authedJwt && !me.is_demo) {
      // We can't tell sync if signed in until JWT resolves; render anyway.
    }
    const isDemoViewer = !!me.is_demo;

    const generate = async () => {
      setBusy(true); setErrMsg(""); setLink(null);
      try {
        const jwt = await getJwt();
        if (!jwt) throw new Error("Not signed in. Sign in as a manager first.");
        const body = {
          agency_id: me.agency_id,
          role,
          email_hint: emailHint || null,
          upline_rep_id: role === "rep" ? (uplineRepId || me.rep_id) : (uplineRepId || null),
        };
        const r = await fetch("/api/invites/create", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${jwt}` },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
        setLink(data);
        setRecent(prev => [{ ...data, ts: new Date().toLocaleString(), email_hint: emailHint, role, upline: body.upline_rep_id }, ...prev].slice(0, 8));
        window.toast && window.toast(`Invite link minted · ${role}`, "success");
      } catch (e) {
        setErrMsg(e.message || String(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <Icons.Plus size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Invite team</h3>
          <span className="meta">links expire in 14 days · single-use</span>
        </div>
        {isDemoViewer && (
          <div style={{ margin: "12px 14px 0", padding: 10, background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)", borderRadius: 6, color: "var(--state-warning)", fontSize: 12, lineHeight: 1.5 }}>
            <Icons.Shield size={12}/> You're in demo mode — invites won't persist. Sign in with your real email to mint links that actually work.
          </div>
        )}
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "120px 1fr 1fr 140px", gap: 10, alignItems: "end" }}>
          <Shared.Field label="Role">
            <Shared.Select
              value={role}
              onChange={setRole}
              options={[{ v: "rep", l: "Producer (Rep)" }, { v: "manager", l: "Manager" }]}
            />
          </Shared.Field>
          <Shared.Field label="Upline (reports to)">
            <Shared.Select
              value={uplineRepId || me.rep_id}
              onChange={setUplineRepId}
              options={[
                { v: me.rep_id, l: `${me.full_name || "You"} (you)` },
                ...eligibleUplines.filter(r => r.id !== me.rep_id).map(r => ({ v: r.id, l: r.name })),
              ]}
            />
          </Shared.Field>
          <Shared.Field label="Email (optional hint)">
            <input className="text-input" value={emailHint} onChange={(e) => setEmailHint(e.target.value)} placeholder="zay@example.com"/>
          </Shared.Field>
          <button className="btn btn-primary" disabled={busy} onClick={generate}>
            {busy ? "Generating…" : <><Icons.Plus size={11}/> Generate link</>}
          </button>
        </div>

        {errMsg && (
          <div style={{ margin: "0 14px 12px", padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>
            {errMsg}
          </div>
        )}

        {link && (
          <div style={{ margin: "0 14px 14px", padding: 12, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Invite link · {link.role}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, fontSize: 11.5, padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 4, wordBreak: "break-all" }}>{link.invite_url}</code>
              <button className="btn btn-primary" onClick={() => copyToClipboard(link.invite_url)}><Icons.Copy size={11}/> Copy</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              Send this to your new hire. They'll click → sign in with their email → land in your agency at {link.role} role automatically.
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="panel-h" style={{ borderBottom: 0 }}>
              <h3 style={{ fontSize: 12 }}>Recently minted (this session)</h3>
            </div>
            <div className="list">
              {recent.map((inv, i) => (
                <div key={i} className="row" style={{ gridTemplateColumns: "1.4fr 100px 100px 1fr 80px", fontSize: 11.5 }}>
                  <div style={{ wordBreak: "break-all", color: "var(--text-secondary)" }}>{inv.invite_url}</div>
                  <div><span className="chip" style={{ fontSize: 10 }}>{inv.role}</span></div>
                  <div style={{ color: "var(--text-tertiary)" }}>{inv.email_hint || "—"}</div>
                  <div style={{ color: "var(--text-tertiary)" }}>{inv.ts}</div>
                  <div><button className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={() => copyToClipboard(inv.invite_url)}><Icons.Copy size={10}/></button></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  window.InviteTeamPanel = InviteTeamPanel;
})();
