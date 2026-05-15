/* rba-confirmations.jsx — global host for high-risk action confirmations.
 *
 * Subscribes to public.rba_action_confirmations realtime for the current
 * user's pending rows. When one arrives, surfaces a modal:
 *   • Lists action + description + redacted args
 *   • Approve / Deny buttons → /api/agent/confirmation-resolve
 *   • Auto-dismiss when expires_at passes
 *
 * Mounted globally from app.jsx so it works across every page.
 */

(function () {

function RBAConfirmationsHost() {
  const [pending, setPending] = React.useState([]);
  const [busy, setBusy]       = React.useState(null);
  const [me, setMe]           = React.useState(null);
  const subRef = React.useRef(null);

  // Resolve user_id once
  React.useEffect(() => {
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const session = (await sb.auth.getSession())?.data?.session;
      if (session?.user?.id) setMe(session.user.id);
    })();
  }, []);

  const reload = React.useCallback(async () => {
    if (!me) return;
    const sb = window.getSupabase();
    const { data } = await sb
      .from("rba_action_confirmations")
      .select("id,action,description,args_redacted,channel,expires_at,created_at")
      .eq("user_id", me)
      .is("resolution", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    setPending(data || []);
  }, [me]);

  React.useEffect(() => { reload(); }, [reload]);

  // Realtime subscribe to inserts for this user
  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !me) return;
    if (subRef.current) subRef.current.unsubscribe();
    const ch = sb
      .channel(`rba-conf-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rba_action_confirmations", filter: `user_id=eq.${me}` },
        (msg) => setPending(prev => [...prev, msg.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rba_action_confirmations", filter: `user_id=eq.${me}` },
        (msg) => setPending(prev => prev.filter(p => p.id !== msg.new.id || msg.new.resolution == null)))
      .subscribe();
    subRef.current = ch;
    return () => { if (subRef.current) { subRef.current.unsubscribe(); subRef.current = null; } };
  }, [me]);

  // Tick to expire client-side
  React.useEffect(() => {
    if (pending.length === 0) return;
    const t = setInterval(() => {
      setPending(prev => prev.filter(p => new Date(p.expires_at).getTime() > Date.now()));
    }, 5000);
    return () => clearInterval(t);
  }, [pending.length]);

  const resolve = async (id, resolution) => {
    setBusy(id);
    try {
      const sb = window.getSupabase();
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/confirmation-resolve", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmation_id: id, resolution }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${r.status}`);
      }
      setPending(prev => prev.filter(p => p.id !== id));
      window.toast && window.toast(resolution === "approved" ? "Approved — agent will proceed" : "Denied", "success");
    } catch (e) {
      window.toast && window.toast(`Resolve failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  if (pending.length === 0) return null;
  const top = pending[0];
  const remaining = pending.length - 1;

  // Inline modal — doesn't depend on Shared.Modal because we want it on top
  // of any other modal too.
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, zIndex: 99999,
      margin: 16, width: 380, padding: 14,
      background: "var(--bg-elevated, #fff)", borderRadius: 10,
      boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
      border: "1px solid var(--border-subtle, #ddd)",
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span className="chip chip-status" style={{ fontSize: 10 }}>{top.action}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}>
          expires {fmtTimeUntil(top.expires_at)}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Agent wants to:</div>
      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.4 }}>
        {top.description}
      </div>
      {top.args_redacted && Object.keys(top.args_redacted).length > 0 && (
        <pre className="mono" style={{ fontSize: 10.5, background: "var(--bg-raised)", padding: 6, borderRadius: 4, maxHeight: 80, overflow: "auto", marginBottom: 10 }}>
          {JSON.stringify(top.args_redacted, null, 2)}
        </pre>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-primary" disabled={busy === top.id} onClick={() => resolve(top.id, "approved")} style={{ flex: 1 }}>
          {busy === top.id ? "…" : "Approve"}
        </button>
        <button className="btn btn-ghost" disabled={busy === top.id} onClick={() => resolve(top.id, "denied")} style={{ flex: 1 }}>
          Deny
        </button>
      </div>
      {remaining > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
          + {remaining} more pending
        </div>
      )}
    </div>
  );
}

function fmtTimeUntil(ts) {
  const s = (new Date(ts).getTime() - Date.now()) / 1000;
  if (s <= 0) return "now";
  if (s < 60) return `${Math.floor(s)}s`;
  return `${Math.floor(s / 60)}m`;
}

window.RBAConfirmationsHost = RBAConfirmationsHost;

})();
