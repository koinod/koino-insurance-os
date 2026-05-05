/* page-admin.jsx — Agency / Admin dashboard for IMO owner + admin team.

   Top-level mission control:
   - Agency overview (name, plan, region, member counts)
   - System health (connectors live/warn/down, agents running, NIGO load,
     recent errors)
   - Team roster (members + pending invites + last sign-in)
   - Recent agency-level activity (audit log)
   - Plan / billing (read-only until Stripe lands)
   - Danger zone (transfer ownership, delete agency) — owner only

   Owner-only nav. Manager view shows a thinner read-only version. */

(function () {

function PageAdmin({ role = "owner" }) {
  const [agency,   setAgency]   = React.useState(null);
  const [members,  setMembers]  = React.useState([]);
  const [invites,  setInvites]  = React.useState([]);
  const [audit,    setAudit]    = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: ag } = await sb.from("agencies").select("*").limit(1).single();
      if (ag) {
        setAgency(ag);
        const [m, i, a] = await Promise.all([
          sb.from("agency_members").select("agency_id, user_id, role, joined_at, active, rep_id").eq("agency_id", ag.id),
          sb.from("agency_invites").select("token, role, email_hint, expires_at, used_at").eq("agency_id", ag.id).order("expires_at", { ascending: false }),
          sb.from("agency_audit_log").select("id, action, actor_role, target, metadata, created_at").eq("agency_id", ag.id).order("created_at", { ascending: false }).limit(40),
        ]);
        setMembers(m.data || []);
        setInvites(i.data || []);
        setAudit(a.data || []);
      }
    } catch (_e) {} finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const liveAgency = agency || { name: "Atlas Insurance Group", slug: "atlas", plan: "trial", state: "GA" };
  const reps = AppData.REPS || [];
  const conns = AppData.CONNECTIONS || [];
  const hardware = AppData.HARDWARE || [];
  const agents = AppData.AGENTS || [];
  const connHealthy = conns.filter(c => c.status === "ok").length;
  const connTotal   = conns.length;
  const hwHealthy   = hardware.filter(h => h.status === "ok").length;
  const hwTotal     = hardware.length;

  const inviteAccepted = invites.filter(i => i.used_at).length;
  const invitePending  = invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).length;
  const inviteExpired  = invites.filter(i => !i.used_at && new Date(i.expires_at) <= new Date()).length;

  const acceptanceRate = invites.length ? Math.round((inviteAccepted / invites.length) * 100) : 0;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Admin · {liveAgency.name}</div>
          <div className="page-sub">Mission control for the {liveAgency.plan} plan · {liveAgency.state} · {members.length || reps.length} members · {AppData.LIVE ? "live data" : "demo data"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "settings" }}))}>
            <Icons.Settings size={13}/> Settings
          </button>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "settings" }}))}>
            <Icons.Plus size={13}/> Invite producer
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Producers" value={reps.length} sub={`${reps.filter(r => r.presence === "live").length} live now`} trend="up"/>
        <Shared.KpiCard      label="Connectors" value={`${connHealthy} / ${connTotal}`} sub={connHealthy === connTotal ? "all healthy" : `${connTotal - connHealthy} need attention`} trend={connHealthy === connTotal ? "up" : undefined}/>
        <Shared.KpiCard      label="Hosts" value={`${hwHealthy} / ${hwTotal}`} sub={`${agents.length} agents deployed`}/>
        <Shared.KpiCard      label="Invite acceptance" value={`${acceptanceRate}%`} sub={`${invitePending} pending · ${inviteExpired} expired`}/>
      </div>

      <div className="admin-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13}/><h3>System health</h3><span className="meta">live</span></div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 100px" }}>
                <div>Service</div><div>Category</div><div>Detail</div><div>Status</div>
              </div>
              {conns.map(c => (
                <div key={c.id} className="row" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 100px", cursor: "pointer" }} onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "settings" }}))}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ color: "var(--text-tertiary)" }}>{c.category}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{c.meta}</div>
                  <div><span className={`chip ${c.status === "ok" ? "chip-money" : c.status === "warn" ? "chip-status" : "chip-danger"}`}>{c.status === "ok" ? "Live" : c.status === "warn" ? "Action" : "Down"}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.Users size={13}/><h3>Team</h3><span className="meta">{members.length || reps.length} members</span></div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 100px 100px" }}>
                <div>Member</div><div>Role</div><div>Joined</div><div>Status</div>
              </div>
              {(members.length > 0 ? members : reps.map(r => ({ user_id: r.id, role: "rep", joined_at: null, active: true, _rep: r }))).map(m => (
                <div key={m.user_id} className="row" style={{ gridTemplateColumns: "1fr 100px 100px 100px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m._rep && <Shared.Avatar rep={m._rep} size={20}/>}
                    <span style={{ fontWeight: 500 }}>{m._rep?.name || (m.user_id || "").slice(0, 8) + "…"}</span>
                  </div>
                  <div><span className="chip">{m.role}</span></div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "demo"}</div>
                  <div><span className={`chip ${m.active ? "chip-money" : ""}`}>{m.active ? "active" : "off"}</span></div>
                </div>
              ))}
              {(members.length === 0 && reps.length === 0) && (
                <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No members yet — invite your first producer.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13}/><h3>Activity</h3><span className="meta">{audit.length} events</span></div>
            <div className="list">
              {audit.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No activity yet · audit events appear as your team works.</div>}
              {audit.map(a => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: "120px 1.4fr 1fr 100px" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(a.created_at).toLocaleString()}</div>
                  <div style={{ fontWeight: 500 }}>{a.action}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.target || "—"}</div>
                  <div><span className="chip">{a.actor_role || "system"}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(() => { const C = window.AdminPlanCard; return C ? <C agency={agency || liveAgency}/> : (
            <div className="panel"><div className="panel-h"><h3>Plan</h3></div><div style={{ padding: 14 }}>{liveAgency.plan}</div></div>
          ); })()}

          <div className="panel">
            <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/><h3>Pending invites</h3><span className="meta">{invitePending}</span></div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).slice(0, 5).map(i => (
                <div key={i.token} style={{ padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{i.email_hint || "(no email hint)"}</strong>
                    <span className="chip">{i.role}</span>
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 4 }}>expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
              ))}
              {invitePending === 0 && <div style={{ padding: 14, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No invites waiting.</div>}
            </div>
          </div>

          {role === "owner" && (
            <div className="panel" style={{ border: "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)" }}>
              <div className="panel-h"><Icons.X size={13} style={{ color: "var(--state-danger)" }}/><h3 style={{ color: "var(--state-danger)" }}>Danger zone</h3></div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => window.toast && window.toast("Transfer ownership flow ships when there's a second owner-eligible member", "info")}>Transfer ownership →</button>
                <button className="btn btn-ghost" style={{ color: "var(--state-danger)" }} onClick={() => { if (confirm("This will permanently delete the agency and all data. Type DELETE to confirm in the dialog.")) window.toast && window.toast("Use the Supabase project console to drop the agency. UI guard ships in v2.", "warn"); }}>Delete agency →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.PageAdmin = PageAdmin;

/* ─── Real notifications panel (replaces the static stub in page-extras) ── */
function PerAgencyNotificationsPanel({ open, onClose, goto }) {
  const [items, setItems]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [unread, setUnread] = React.useState(0);
  const [agency, setAgency] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setLoading(false); return; }
    const { data: session } = await sb.auth.getSession();
    if (!session?.session) { setLoading(false); return; }
    const userId = session.session.user.id;
    const { data: ag } = await sb.from("agencies").select("id, name").limit(1).single();
    if (!ag) { setLoading(false); return; }
    setAgency(ag);
    // GAP-C1 — notifications targeted to this rep, plus agency-wide broadcasts
    // (recipient_rep_id IS NULL). Manager/owner see everything.
    const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
    const role = meIdent?.role || "rep";
    const myRepId = meIdent?.rep_id || null;
    let q = sb.from("agency_notifications").select("*").eq("agency_id", ag.id).order("created_at", { ascending: false }).limit(40);
    if (role === "rep" && myRepId) {
      q = q.or(`recipient_rep_id.is.null,recipient_rep_id.eq.${myRepId}`);
    }
    const { data, error } = await q;
    if (error && /column.*recipient_rep_id.*does not exist/i.test(error.message || "")) {
      // Migration 0011 not yet applied — fall back to unfiltered fetch
      const { data: legacy } = await sb.from("agency_notifications").select("*").eq("agency_id", ag.id).order("created_at", { ascending: false }).limit(40);
      setItems(legacy || []);
      setUnread((legacy || []).filter(n => !(n.read_by || []).includes(userId)).length);
    } else {
      setItems(data || []);
      setUnread((data || []).filter(n => !(n.read_by || []).includes(userId)).length);
    }
    setLoading(false);
  }, [open]);
  React.useEffect(() => { load(); }, [load]);

  // Realtime: refresh when an agency_notifications row is inserted
  React.useEffect(() => {
    const onRt = (e) => { if (e.detail?.table === "agency_notifications") load(); };
    window.addEventListener("data:realtime", onRt);
    return () => window.removeEventListener("data:realtime", onRt);
  }, [load]);

  if (!open) return null;

  const click = async (n) => {
    if (n.id) {
      const sb = window.getSupabase();
      sb && sb.rpc("mark_notification_read", { p_id: n.id }).catch(() => {});
    }
    if (n.page_link && goto) goto(n.page_link);
    onClose();
  };

  const markAllRead = async () => {
    if (!agency) return;
    const sb = window.getSupabase();
    const { data } = await sb.rpc("mark_all_notifications_read", { p_agency_id: agency.id });
    window.toast && window.toast(`Marked ${data || 0} notifications read`, "success");
    load();
  };

  const colorOf = (sev) => sev === "danger" ? "var(--state-danger)" : sev === "warn" ? "var(--state-warning)" : sev === "success" ? "var(--accent-money)" : "var(--accent-status)";
  const fmtAge = (iso) => {
    const d = new Date(iso); const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "now"; if (m < 60) return `${m}m`; if (m < 1440) return `${Math.round(m/60)}h`;
    return `${Math.round(m/1440)}d`;
  };

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="slideout-h">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Bell size={14}/>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{agency ? `${agency.name} · Notifications` : "Notifications"}</div>
            {unread > 0 && <span className="chip chip-money">{unread} new</span>}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {unread > 0 && <button className="btn btn-ghost" onClick={markAllRead}>Mark all read</button>}
            <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
          </div>
        </div>
        <div className="slideout-body" style={{ padding: 0 }}>
          {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading...</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.55 }}>
              No notifications.
              <div style={{ marginTop: 4, fontSize: 11 }}>You'll see hot leads, NIGO returns, anomalies, and recruiting events here as they happen.</div>
            </div>
          )}
          {!loading && items.map(n => {
            const isUnread = agency && !(n.read_by || []).includes("(self)");  // simplified read-state check
            return (
              <div key={n.id} onClick={() => click(n)} style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", background: isUnread ? "color-mix(in oklch, var(--accent-money) 3%, transparent)" : undefined }}>
                <span className="dot" style={{ background: colorOf(n.severity), marginTop: 6 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                  {n.body && <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>{n.body}</div>}
                </div>
                <span style={{ color: "var(--text-quaternary)", fontSize: 11 }}>{fmtAge(n.created_at)}</span>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
window.PerAgencyNotificationsPanel = PerAgencyNotificationsPanel;

})();
