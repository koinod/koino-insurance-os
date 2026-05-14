/* page-admin.jsx — Super-admin platform management panel.
   Only visible to accounts with role = 'super_admin'.
   Cross-agency: queries hit all rows via is_super_admin() RLS bypass. */

(function () {

function PageAdmin() {
  const [tab, setTab]                     = React.useState("agencies");
  const [agencies, setAgencies]           = React.useState([]);
  const [agencyMemCounts, setMemCounts]   = React.useState({});
  const [agLoading, setAgLoading]         = React.useState(true);
  const [members, setMembers]             = React.useState([]);
  const [memberSearch, setMemberSearch]   = React.useState("");
  const [memLoading, setMemLoading]       = React.useState(false);
  const [memAgFilter, setMemAgFilter]     = React.useState(null);
  const [invites, setInvites]             = React.useState([]);
  const [invLoading, setInvLoading]       = React.useState(false);
  const [audit, setAudit]                 = React.useState([]);
  const [auditLoading, setAuditLoading]   = React.useState(false);
  const [broadcastOpen, setBroadcastOpen] = React.useState(false);

  const loadAgencies = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setAgLoading(false); return; }
    setAgLoading(true);
    try {
      const [{ data: ags }, { data: mems }] = await Promise.all([
        sb.from("agencies").select("id,name,slug,plan,state,created_at").order("created_at", { ascending: false }),
        sb.from("agency_members").select("agency_id").eq("active", true),
      ]);
      setAgencies(ags || []);
      const counts = {};
      (mems || []).forEach(m => { counts[m.agency_id] = (counts[m.agency_id] || 0) + 1; });
      setMemCounts(counts);
    } catch (_e) {
      window.toast && window.toast("Failed to load agencies", "error");
    } finally {
      setAgLoading(false);
    }
  }, []);

  const loadMembers = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setMemLoading(true);
    try {
      const { data } = await sb
        .from("agency_members")
        .select("agency_id,user_id,role,rep_id,joined_at,active")
        .order("joined_at", { ascending: false });
      const repsById = Object.fromEntries(
        ((window.AppData && window.AppData.REPS) || []).map(r => [r.id, r])
      );
      setMembers((data || []).map(m => ({ ...m, repName: repsById[m.rep_id]?.name || null })));
    } finally { setMemLoading(false); }
  }, []);

  const loadInvites = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setInvLoading(true);
    try {
      const { data } = await sb
        .from("agency_invites")
        .select("token,agency_id,role,email_hint,expires_at,used_at")
        .order("expires_at", { ascending: false });
      setInvites(data || []);
    } finally { setInvLoading(false); }
  }, []);

  const loadAudit = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setAuditLoading(true);
    try {
      const { data } = await sb
        .from("agency_audit_log")
        .select("id,agency_id,action,actor_role,target,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setAudit(data || []);
    } finally { setAuditLoading(false); }
  }, []);

  React.useEffect(() => { loadAgencies(); }, [loadAgencies]);
  React.useEffect(() => {
    if (tab === "members" && members.length === 0) loadMembers();
    if (tab === "invites" && invites.length === 0) loadInvites();
    if (tab === "audit"   && audit.length   === 0) loadAudit();
  }, [tab]);

  const deleteAgency = async (agencyId, agencyName) => {
    if (!confirm(`Permanently delete "${agencyName}" and ALL its data?\n\nThis cannot be undone.`)) return;
    const typed = prompt("Type DELETE to confirm:");
    if (typed !== "DELETE") { window.toast && window.toast("Cancelled — must type DELETE exactly", "warn"); return; }
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("agencies").delete().eq("id", agencyId);
    if (error) {
      window.toast && window.toast(`Delete failed: ${error.message}`, "error");
    } else {
      window.toast && window.toast(`Deleted ${agencyName}`, "success");
      loadAgencies();
    }
  };

  const toggleMember = async (m) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("agency_members").update({ active: !m.active })
      .eq("agency_id", m.agency_id).eq("user_id", m.user_id);
    if (error) { window.toast && window.toast(`Failed: ${error.message}`, "error"); return; }
    window.toast && window.toast(m.active ? "Member deactivated" : "Member reactivated", "success");
    loadMembers();
  };

  const changeRole = async (m, newRole) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("agency_members").update({ role: newRole })
      .eq("agency_id", m.agency_id).eq("user_id", m.user_id);
    if (error) { window.toast && window.toast(`Failed: ${error.message}`, "error"); return; }
    window.toast && window.toast(`Role → ${newRole}`, "success");
    loadMembers();
  };

  const totalMembers = Object.values(agencyMemCounts).reduce((a, b) => a + b, 0);
  const pendingInvites = invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).length;
  const agNameById = Object.fromEntries(agencies.map(a => [a.id, a.name]));

  const TABS = [
    { k: "agencies", l: "Agencies",   icon: "Building"  },
    { k: "members",  l: "Members",    icon: "Users"     },
    { k: "invites",  l: "Invites",    icon: "Bell"      },
    { k: "audit",    l: "Audit Log",  icon: "Activity"  },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Super Admin</div>
          <div className="page-sub">Platform management · {agencies.length} agenc{agencies.length === 1 ? "y" : "ies"} · {totalMembers} members</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {broadcastOpen && (
            <BroadcastModal
              agencyId={null}
              reps={(window.AppData && window.AppData.REPS) || []}
              onClose={() => setBroadcastOpen(false)}
            />
          )}
          <button className="btn" onClick={() => setBroadcastOpen(true)}>
            <Icons.MessageSquare size={13}/> Broadcast
          </button>
          <button className="btn" onClick={() => { loadAgencies(); if (tab === "members") loadMembers(); if (tab === "invites") loadInvites(); if (tab === "audit") loadAudit(); }}>
            <Icons.RefreshCw size={13}/> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <Shared.KpiCard hero label="Agencies" value={agencies.length} sub="total tenants"/>
        <Shared.KpiCard label="Active members" value={totalMembers} sub="across all agencies"/>
        <Shared.KpiCard label="Pending invites" value={pendingInvites} sub="not yet redeemed"/>
        <Shared.KpiCard label="Audit events" value={audit.length || "—"} sub="last 100"/>
      </div>

      <div className="tab-bar" style={{ marginBottom: 14 }}>
        {TABS.map(t => {
          const Ic = Icons[t.icon];
          return (
            <button key={t.k} className={`tab ${tab === t.k ? "tab-active" : ""}`} onClick={() => setTab(t.k)}>
              {Ic && <Ic size={12}/>} {t.l}
            </button>
          );
        })}
      </div>

      {/* ── Agencies ── */}
      {tab === "agencies" && (
        <div className="panel">
          <div className="panel-h"><Icons.Building size={13}/><h3>All Agencies</h3><span className="meta">{agencies.length} total</span></div>
          {agLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
          ) : agencies.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No agencies found.</div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.8fr 100px 100px 70px 130px 130px" }}>
                <div>Agency</div><div>Plan</div><div>State</div><div>Members</div><div>Created</div><div>Actions</div>
              </div>
              {agencies.map(ag => (
                <div key={ag.id} className="row" style={{ gridTemplateColumns: "1.8fr 100px 100px 70px 130px 130px" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{ag.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ag.slug || ag.id.slice(0, 8)}</div>
                  </div>
                  <div><span className="chip">{ag.plan || "trial"}</span></div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{ag.state || "—"}</div>
                  <div style={{ fontSize: 13 }}>{agencyMemCounts[ag.id] || 0}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{new Date(ag.created_at).toLocaleDateString()}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => {
                      setMemAgFilter(ag.id);
                      setTab("members");
                      if (members.length === 0) loadMembers(); else setMembers(prev => prev);
                    }}>Members</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11, color: "var(--state-danger)" }} onClick={() => deleteAgency(ag.id, ag.name)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Members ── */}
      {tab === "members" && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Users size={13}/><h3>All Members</h3><span className="meta">{members.length} total</span>
            {memAgFilter && (
              <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => setMemAgFilter(null)}>
                Clear filter ×
              </button>
            )}
          </div>
          <div style={{ padding: "8px 14px 4px" }}>
            <input className="text-input" placeholder="Search by name or ID…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ maxWidth: 320 }}/>
          </div>
          {memLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
          ) : (
            <div className="list" style={{ marginTop: 4 }}>
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 120px 100px 100px 100px" }}>
                <div>Member</div><div>Agency</div><div>Role</div><div>Joined</div><div>Status</div><div>Actions</div>
              </div>
              {members
                .filter(m => !memAgFilter || m.agency_id === memAgFilter)
                .filter(m => {
                  if (!memberSearch) return true;
                  const q = memberSearch.toLowerCase();
                  return (m.repName || "").toLowerCase().includes(q)
                    || (m.user_id || "").toLowerCase().includes(q)
                    || (m.rep_id  || "").toLowerCase().includes(q);
                })
                .map((m, i) => (
                  <div key={`${m.agency_id}-${m.user_id}-${i}`} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 120px 100px 100px 100px" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{m.repName || (m.rep_id || "—").slice(0, 8)}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{(m.user_id || "").slice(0, 14)}…</div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{agNameById[m.agency_id] || (m.agency_id || "—").slice(0, 8)}</div>
                    <div>
                      <select value={m.role} onChange={e => changeRole(m, e.target.value)} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--text-primary)", cursor: "pointer" }}>
                        <option value="rep">rep</option>
                        <option value="manager">manager</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                    </div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}</div>
                    <div><span className={`chip ${m.active ? "chip-money" : ""}`}>{m.active ? "active" : "inactive"}</span></div>
                    <div>
                      <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => toggleMember(m)}>
                        {m.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </div>
                ))
              }
              {members.filter(m => !memAgFilter || m.agency_id === memAgFilter).length === 0 && !memLoading && (
                <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No members found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Invites ── */}
      {tab === "invites" && (
        <div className="panel">
          <div className="panel-h"><Icons.Bell size={13}/><h3>All Invites</h3><span className="meta">{invites.length} total</span></div>
          {invLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1.2fr 90px 90px 130px 130px" }}>
                <div>Email hint</div><div>Agency</div><div>Role</div><div>Status</div><div>Expires</div><div>Used</div>
              </div>
              {invites.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No invites found.</div>}
              {invites.map(inv => {
                const expired = !inv.used_at && new Date(inv.expires_at) <= new Date();
                const used    = !!inv.used_at;
                return (
                  <div key={inv.token} className="row" style={{ gridTemplateColumns: "1.4fr 1.2fr 90px 90px 130px 130px" }}>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{inv.email_hint || "(no hint)"}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{agNameById[inv.agency_id] || (inv.agency_id || "—").slice(0, 8)}</div>
                    <div><span className="chip">{inv.role}</span></div>
                    <div><span className={`chip ${used ? "chip-money" : expired ? "chip-danger" : "chip-status"}`}>{used ? "used" : expired ? "expired" : "pending"}</span></div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{new Date(inv.expires_at).toLocaleDateString()}</div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{inv.used_at ? new Date(inv.used_at).toLocaleDateString() : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Audit ── */}
      {tab === "audit" && (
        <div className="panel">
          <div className="panel-h"><Icons.Activity size={13}/><h3>Audit Log</h3><span className="meta">last 100 events · all agencies</span></div>
          {auditLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "140px 1.4fr 1.2fr 90px 100px" }}>
                <div>Time</div><div>Action</div><div>Target</div><div>Actor role</div><div>Agency</div>
              </div>
              {audit.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No audit events found.</div>}
              {audit.map(a => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: "140px 1.4fr 1.2fr 90px 100px" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(a.created_at).toLocaleString()}</div>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{a.action}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.target || "—"}</div>
                  <div><span className="chip">{a.actor_role || "system"}</span></div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{agNameById[a.agency_id] || (a.agency_id || "—").slice(0, 8)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
    const { data: ag } = await sb.from("agencies").select("id, name").limit(1).maybeSingle();
    if (!ag) { setLoading(false); return; }
    setAgency(ag);
    // Notifications targeted to this rep, plus agency-wide broadcasts
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

// ─── Owner broadcast tool ─────────────────────────────────────────────────
// Posts to agency_notifications. recipient_rep_id IS NULL → everyone in
// the agency sees it on their next panel open + via realtime channel.
// Targeted broadcast supported by selecting a single rep in the modal.
function BroadcastModal({ agencyId, reps, onClose }) {
  const [title, setTitle]         = React.useState("");
  const [body, setBody]           = React.useState("");
  const [severity, setSeverity]   = React.useState("info");
  const [recipient, setRecipient] = React.useState("");           // "" = everyone
  const [pageLink, setPageLink]   = React.useState("");
  const [sending, setSending]     = React.useState(false);

  const send = async () => {
    if (!title.trim()) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !agencyId) {
      window.toast && window.toast("Not connected to Supabase yet", "warn");
      return;
    }
    setSending(true);
    const row = {
      agency_id: agencyId,
      title: title.trim(),
      body: body.trim() || null,
      severity,
      kind: recipient ? "direct_message" : "broadcast",
      page_link: pageLink.trim() || null,
      recipient_rep_id: recipient || null,
    };
    const { error } = await sb.from("agency_notifications").insert(row);
    setSending(false);
    if (error) {
      window.toast && window.toast(`Send failed: ${error.message}`, "error");
      return;
    }
    const audience = recipient ? (reps.find(r => r.id === recipient)?.name || "rep") : `${reps.length} producer${reps.length === 1 ? "" : "s"}`;
    window.toast && window.toast(`Sent to ${audience}`, "success");
    onClose();
  };

  return (
    <Shared.Modal title="Broadcast to agency" width={520} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="Audience">
          <Shared.Select value={recipient} onChange={setRecipient}
            options={[{ v: "", l: `Everyone (${reps.length})` }, ...reps.map(r => ({ v: r.id, l: r.name }))]}/>
        </Shared.Field>
        <Shared.Field label="Title *">
          <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AEP Power Hour at 4pm — show up" autoFocus/>
        </Shared.Field>
        <Shared.Field label="Body">
          <textarea className="text-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional details. Markdown not parsed."/>
        </Shared.Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Severity">
            <Shared.Select value={severity} onChange={setSeverity}
              options={[
                { v: "info",    l: "Info" },
                { v: "success", l: "Success / win" },
                { v: "warn",    l: "Warning" },
                { v: "danger",  l: "Urgent / danger" },
              ]}/>
          </Shared.Field>
          <Shared.Field label="Deep link (optional)">
            <input className="text-input" value={pageLink} onChange={(e) => setPageLink(e.target.value)} placeholder="floor / crm / nigo …"/>
          </Shared.Field>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!title.trim() || sending} onClick={send}>
          {sending ? "Sending…" : <><Icons.Send size={11}/> {recipient ? "Send DM" : "Broadcast"}</>}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
      </div>
    </Shared.Modal>
  );
}
window.BroadcastModal = BroadcastModal;

})();
