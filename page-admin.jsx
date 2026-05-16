/* page-admin.jsx — Super-admin platform mission control.
   Only visible to accounts with role = 'super_admin'.
   Cross-agency: queries hit all rows via is_super_admin() RLS bypass.

   Layout:
     - Header (title + Broadcast + Refresh)
     - KPI row (Agencies / Members / MRR estimate / Issues)
     - Tab bar: Agencies | Members | Hierarchy | Invites | Billing | Audit
     - Tab content
     - Always-visible Management panel at the bottom:
         System Health (connectors)  ·  Recent Critical Events
*/

(function () {

// Estimated plan pricing per active seat per month. Used for revenue
// estimate until real billing data lands.
const PLAN_PRICE = { trial: 0, starter: 99, basic: 99, pro: 299, enterprise: 999 };
const PLAN_OPTS  = ["trial", "starter", "pro", "enterprise"];

function looksLikeError(action = "") {
  const s = action.toLowerCase();
  return s.includes("error") || s.includes("fail") || s.includes("denied")
      || s.includes("broken") || s.includes("revoke") || s.includes("crash");
}

function PageAdmin() {
  const [tab, setTab]                   = React.useState("agencies");
  const [agencies, setAgencies]         = React.useState([]);
  const [memCounts, setMemCounts]       = React.useState({});
  const [agLoading, setAgLoading]       = React.useState(true);

  const [members, setMembers]           = React.useState([]);
  const [memSearch, setMemSearch]       = React.useState("");
  const [memLoading, setMemLoading]     = React.useState(false);
  const [memAgFilter, setMemAgFilter]   = React.useState(null);

  const [reps, setReps]                 = React.useState([]);
  const [repsLoading, setRepsLoading]   = React.useState(false);
  const [hierAgency, setHierAgency]     = React.useState(null);

  const [invites, setInvites]           = React.useState([]);
  const [invLoading, setInvLoading]     = React.useState(false);

  const [audit, setAudit]               = React.useState([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

  const [broadcastOpen, setBroadcastOpen] = React.useState(false);

  const loadAgencies = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setAgLoading(false); return; }
    setAgLoading(true);
    try {
      const [{ data: ags }, { data: mems }] = await Promise.all([
        sb.from("agencies").select("id,name,slug,plan,state,created_at").order("created_at", { ascending: false }),
        sb.from("agency_members").select("agency_id,role").eq("active", true),
      ]);
      setAgencies(ags || []);
      const counts = {};
      (mems || []).forEach(m => { counts[m.agency_id] = (counts[m.agency_id] || 0) + 1; });
      setMemCounts(counts);
    } catch (_e) {
      window.toast && window.toast("Failed to load agencies", "error");
    } finally { setAgLoading(false); }
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

  const loadReps = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setRepsLoading(true);
    try {
      const { data } = await sb
        .from("reps")
        .select("id,name,agency_id,upline_rep_id")
        .order("name");
      setReps(data || []);
    } finally { setRepsLoading(false); }
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

  React.useEffect(() => { loadAgencies(); loadAudit(); }, [loadAgencies, loadAudit]);
  React.useEffect(() => {
    if (tab === "members"   && members.length === 0) loadMembers();
    if (tab === "hierarchy" && reps.length    === 0) { loadReps(); if (members.length === 0) loadMembers(); }
    if (tab === "invites"   && invites.length === 0) loadInvites();
    if (tab === "billing"   && members.length === 0) loadMembers();
  }, [tab]);

  const refreshAll = () => {
    loadAgencies(); loadAudit();
    if (members.length) loadMembers();
    if (reps.length)    loadReps();
    if (invites.length) loadInvites();
  };

  const deleteAgency = async (agencyId, agencyName) => {
    if (!confirm(`Permanently delete "${agencyName}" and ALL its data?\n\nThis cannot be undone.`)) return;
    const typed = prompt("Type DELETE to confirm:");
    if (typed !== "DELETE") { window.toast && window.toast("Cancelled — must type DELETE exactly", "warn"); return; }
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("agencies").delete().eq("id", agencyId);
    if (error) window.toast && window.toast(`Delete failed: ${error.message}`, "error");
    else { window.toast && window.toast(`Deleted ${agencyName}`, "success"); loadAgencies(); }
  };

  const updateAgencyPlan = async (agencyId, newPlan) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("agencies").update({ plan: newPlan }).eq("id", agencyId);
    if (error) window.toast && window.toast(`Plan update failed: ${error.message}`, "error");
    else { window.toast && window.toast(`Plan → ${newPlan}`, "success"); loadAgencies(); }
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

  const reassignUpline = async (repId, newUpline) => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    const { error } = await sb.from("reps").update({ upline_rep_id: newUpline || null }).eq("id", repId);
    if (error) { window.toast && window.toast(`Reassign failed: ${error.message}`, "error"); return; }
    window.toast && window.toast(`Upline updated`, "success");
    loadReps();
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const agNameById = Object.fromEntries(agencies.map(a => [a.id, a.name]));
  const totalMembers = Object.values(memCounts).reduce((a, b) => a + b, 0);
  const pendingInvites = invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).length;

  const estimatedMRR = agencies.reduce((sum, ag) => {
    const seats = memCounts[ag.id] || 0;
    const price = PLAN_PRICE[(ag.plan || "trial").toLowerCase()] ?? 0;
    return sum + seats * price;
  }, 0);

  const recentErrors = audit.filter(a => looksLikeError(a.action));
  const issuesCount  = recentErrors.length;

  // ── Connector / system health from AppData (frontend health snapshot) ─
  const conns    = (window.AppData && window.AppData.CONNECTIONS) || [];
  const hardware = (window.AppData && window.AppData.HARDWARE)    || [];
  const connHealthy = conns.filter(c => c.status === "ok").length;
  const connWarn    = conns.filter(c => c.status === "warn").length;
  const connDown    = conns.filter(c => c.status === "down" || c.status === "error").length;
  const hwHealthy   = hardware.filter(h => h.status === "ok").length;

  const TABS = [
    { k: "agencies",  l: "Agencies",   icon: "Building"    },
    { k: "members",   l: "Members",    icon: "Users"       },
    { k: "hierarchy", l: "Hierarchy",  icon: "Workflow"    },
    { k: "invites",   l: "Invites",    icon: "Bell"        },
    { k: "billing",   l: "Billing",    icon: "Wallet"      },
    { k: "carriers",  l: "Carriers",   icon: "Shield"      },
    { k: "scrape",    l: "UW Queue",   icon: "Bell"        },
    { k: "devices",   l: "Devices",    icon: "Cpu"         },
    { k: "security",  l: "Security",   icon: "Shield"      },
    { k: "audit",     l: "Audit Log",  icon: "Activity"    },
  ];

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title">Super Admin · Mission Control</div>
          <div className="page-sub">{agencies.length} agenc{agencies.length === 1 ? "y" : "ies"} · {totalMembers} active members · {pendingInvites} pending invite{pendingInvites === 1 ? "" : "s"} · {issuesCount} issue{issuesCount === 1 ? "" : "s"}</div>
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
          <button className="btn" onClick={refreshAll}>
            <Icons.RefreshCw size={13}/> Refresh
          </button>
        </div>
      </div>

      {/* KPI row — equal width */}
      <div className="kpi-row">
        <Shared.KpiCard label="Agencies"        value={agencies.length}                              sub="total tenants"/>
        <Shared.KpiCard label="Active members"  value={totalMembers}                                 sub="across all agencies"/>
        <Shared.KpiCard label="Est. MRR"        value={`$${estimatedMRR.toLocaleString()}`}          sub={`${PLAN_OPTS.length} plan tiers`}/>
        <Shared.KpiCard label="Open issues"     value={issuesCount}                                  sub={issuesCount ? "see Management panel" : "all clear"} trend={issuesCount === 0 ? "up" : undefined}/>
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

      {/* ── Agencies ───────────────────────────────────────────── */}
      {tab === "agencies" && (
        <div className="panel">
          <div className="panel-h"><Icons.Building size={13}/><h3>All Agencies</h3><span className="meta">{agencies.length} total</span></div>
          {agLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
          ) : agencies.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No agencies found.</div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.8fr 120px 90px 80px 130px 200px" }}>
                <div>Agency</div><div>Plan</div><div>State</div><div>Members</div><div>Created</div><div>Actions</div>
              </div>
              {agencies.map(ag => (
                <div key={ag.id} className="row" style={{ gridTemplateColumns: "1.8fr 120px 90px 80px 130px 200px" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{ag.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ag.slug || ag.id.slice(0, 8)}</div>
                  </div>
                  <div>
                    <select value={(ag.plan || "trial").toLowerCase()} onChange={e => updateAgencyPlan(ag.id, e.target.value)} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--text-primary)", cursor: "pointer" }}>
                      {PLAN_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{ag.state || "—"}</div>
                  <div style={{ fontSize: 13 }}>{memCounts[ag.id] || 0}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{new Date(ag.created_at).toLocaleDateString()}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => { setMemAgFilter(ag.id); setTab("members"); if (members.length === 0) loadMembers(); }}>Members</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => { setHierAgency(ag.id); setTab("hierarchy"); if (reps.length === 0) loadReps(); }}>Tree</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11, color: "var(--state-danger)" }} onClick={() => deleteAgency(ag.id, ag.name)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Members ────────────────────────────────────────────── */}
      {tab === "members" && (
        <div className="panel">
          <div className="panel-h">
            <Icons.Users size={13}/><h3>All Members</h3>
            <span className="meta">{members.filter(m => !memAgFilter || m.agency_id === memAgFilter).length} {memAgFilter ? `in ${agNameById[memAgFilter] || "—"}` : "total"}</span>
            {memAgFilter && (
              <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => setMemAgFilter(null)}>Clear filter ×</button>
            )}
          </div>
          <div style={{ padding: "8px 14px 4px" }}>
            <input className="text-input" placeholder="Search by name or ID…" value={memSearch} onChange={e => setMemSearch(e.target.value)} style={{ maxWidth: 320 }}/>
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
                  if (!memSearch) return true;
                  const q = memSearch.toLowerCase();
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

      {/* ── Hierarchy ──────────────────────────────────────────── */}
      {tab === "hierarchy" && (
        <HierarchyView
          agencies={agencies}
          reps={reps}
          members={members}
          hierAgency={hierAgency}
          setHierAgency={setHierAgency}
          loading={repsLoading}
          onReassign={reassignUpline}
          agNameById={agNameById}
        />
      )}

      {/* ── Invites ────────────────────────────────────────────── */}
      {tab === "invites" && (
        <div className="panel">
          <div className="panel-h"><Icons.Bell size={13}/><h3>All Invites</h3><span className="meta">{invites.length} total · {pendingInvites} pending</span></div>
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

      {/* ── Billing ────────────────────────────────────────────── */}
      {tab === "billing" && (
        <BillingView
          agencies={agencies}
          memCounts={memCounts}
          estimatedMRR={estimatedMRR}
          onPlanChange={updateAgencyPlan}
        />
      )}

      {/* ── Carriers (life + annuity catalog) ───────────────────── */}
      {tab === "carriers" && <CarriersAdminView />}

      {/* ── UW Scrape Queue (pending findings from carrier-intel agent) ── */}
      {tab === "scrape" && <ScrapeQueueView />}

      {/* ── Devices (RBA installs across all agencies) ─────────────── */}
      {tab === "devices" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DevicesAdminView />
          <ManualCommandTester />
        </div>
      )}

      {/* ── Security advisor ───────────────────────────────────── */}
      {tab === "security" && <SecurityAdvisorView/>}

      {/* ── Audit ──────────────────────────────────────────────── */}
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
                  <div style={{ fontWeight: 500, fontSize: 12, color: looksLikeError(a.action) ? "var(--state-danger)" : undefined }}>{a.action}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{a.target || "—"}</div>
                  <div><span className="chip">{a.actor_role || "system"}</span></div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{agNameById[a.agency_id] || (a.agency_id || "—").slice(0, 8)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Always-visible MANAGEMENT panel ─────────────────────── */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <Icons.Cpu size={13}/><h3>System Health</h3>
            <span className="meta">{connHealthy} / {conns.length} connectors · {hwHealthy} / {hardware.length} hosts</span>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className={`chip ${connDown === 0 ? "chip-money" : "chip-danger"}`}>{connHealthy} live</span>
            {connWarn > 0 && <span className="chip chip-status">{connWarn} warn</span>}
            {connDown > 0 && <span className="chip chip-danger">{connDown} down</span>}
            <span className="chip">{hwHealthy} hosts ok</span>
          </div>
          {conns.length === 0 ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No connector data yet.</div>
          ) : (
            <div className="list" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="list-h" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 90px" }}>
                <div>Service</div><div>Category</div><div>Detail</div><div>Status</div>
              </div>
              {conns.map(c => (
                <div key={c.id} className="row" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 90px" }}>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{c.name}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{c.category}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{c.meta}</div>
                  <div><span className={`chip ${c.status === "ok" ? "chip-money" : c.status === "warn" ? "chip-status" : "chip-danger"}`}>{c.status === "ok" ? "live" : c.status === "warn" ? "warn" : "down"}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ border: recentErrors.length ? "1px solid color-mix(in oklch, var(--state-danger) 25%, transparent)" : undefined }}>
          <div className="panel-h">
            <Icons.AlertTriangle size={13} style={{ color: recentErrors.length ? "var(--state-danger)" : "var(--text-tertiary)" }}/>
            <h3 style={{ color: recentErrors.length ? "var(--state-danger)" : undefined }}>Recent Errors & Issues</h3>
            <span className="meta">{recentErrors.length} flagged</span>
          </div>
          {recentErrors.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No errors in the last 100 audit events.</div>
          ) : (
            <div className="list">
              {recentErrors.slice(0, 12).map(a => (
                <div key={a.id} className="row" style={{ gridTemplateColumns: "120px 1fr 100px" }}>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{new Date(a.created_at).toLocaleString()}</div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12, color: "var(--state-danger)" }}>{a.action}</div>
                    {a.target && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{a.target}</div>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{agNameById[a.agency_id] || (a.agency_id || "—").slice(0, 8)}</div>
                </div>
              ))}
              {recentErrors.length > 12 && (
                <div style={{ padding: 10, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
                  +{recentErrors.length - 12} more — see Audit tab
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.PageAdmin = PageAdmin;

// ─── Hierarchy view ─────────────────────────────────────────────────────
function HierarchyView({ agencies, reps, members, hierAgency, setHierAgency, loading, onReassign, agNameById }) {
  const selectedAgencyId = hierAgency || (agencies[0]?.id ?? null);
  const repsInAgency = reps.filter(r => r.agency_id === selectedAgencyId);
  const roleByRepId = Object.fromEntries(
    members.filter(m => m.agency_id === selectedAgencyId).map(m => [m.rep_id, m.role])
  );
  const repsById = Object.fromEntries(repsInAgency.map(r => [r.id, r]));
  // Root reps = no upline OR upline points outside this agency
  const roots = repsInAgency.filter(r => !r.upline_rep_id || !repsById[r.upline_rep_id]);
  const childrenOf = (id) => repsInAgency.filter(r => r.upline_rep_id === id);

  // Eligible uplines for a given rep = any manager in same agency, excluding self
  // and excluding descendants (to prevent cycles)
  const descendantsOf = (id) => {
    const out = new Set();
    const walk = (n) => { childrenOf(n).forEach(c => { out.add(c.id); walk(c.id); }); };
    walk(id);
    return out;
  };

  const renderNode = (rep, depth = 0) => {
    const role = roleByRepId[rep.id] || "rep";
    const desc = descendantsOf(rep.id);
    const eligible = repsInAgency.filter(r => r.id !== rep.id && !desc.has(r.id));
    const kids = childrenOf(rep.id);
    return (
      <div key={rep.id} style={{ marginLeft: depth * 18 }}>
        <div className="row" style={{ gridTemplateColumns: "1fr 100px 1fr", padding: "8px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {depth > 0 && <Icons.ArrowRight size={11} style={{ color: "var(--text-quaternary)" }}/>}
            <span style={{ fontWeight: 500, fontSize: 13 }}>{rep.name || rep.id}</span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{rep.id}</span>
          </div>
          <div><span className={`chip ${role === "manager" || role === "super_admin" ? "chip-money" : ""}`}>{role}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>upline:</span>
            <select
              value={rep.upline_rep_id || ""}
              onChange={e => onReassign(rep.id, e.target.value)}
              style={{ flex: 1, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--text-primary)", cursor: "pointer" }}
            >
              <option value="">— top-level —</option>
              {eligible.map(r => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
            </select>
          </div>
        </div>
        {kids.map(k => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Workflow size={13}/>
        <h3>Hierarchy</h3>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Agency:</span>
          <select value={selectedAgencyId || ""} onChange={e => setHierAgency(e.target.value)} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "2px 8px", fontSize: 12, color: "var(--text-primary)", cursor: "pointer", minWidth: 200 }}>
            {agencies.map(ag => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: "10px 14px", color: "var(--text-tertiary)", fontSize: 11.5, borderBottom: "1px solid var(--border-subtle)" }}>
        Drag-free reassignment: change a rep's upline via dropdown. Self and descendants are excluded to prevent cycles.
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>
      ) : roots.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No reps in this agency yet.</div>
      ) : (
        <div>
          <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 1fr", padding: "8px 14px" }}>
            <div>Member</div><div>Role</div><div>Reports to</div>
          </div>
          {roots.map(r => renderNode(r, 0))}
        </div>
      )}
    </div>
  );
}
window.HierarchyView = HierarchyView;

// ─── Billing view ───────────────────────────────────────────────────────
function BillingView({ agencies, memCounts, estimatedMRR, onPlanChange }) {
  const planTotals = {};
  agencies.forEach(ag => {
    const p = (ag.plan || "trial").toLowerCase();
    if (!planTotals[p]) planTotals[p] = { count: 0, members: 0, mrr: 0 };
    const seats = memCounts[ag.id] || 0;
    planTotals[p].count   += 1;
    planTotals[p].members += seats;
    planTotals[p].mrr     += seats * (PLAN_PRICE[p] ?? 0);
  });

  const annualized = estimatedMRR * 12;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="kpi-row">
        <Shared.KpiCard label="Est. MRR"    value={`$${estimatedMRR.toLocaleString()}`} sub="seat × plan price"/>
        <Shared.KpiCard label="Est. ARR"    value={`$${annualized.toLocaleString()}`}   sub="MRR × 12"/>
        <Shared.KpiCard label="Paid agencies" value={agencies.filter(a => (PLAN_PRICE[(a.plan || "trial").toLowerCase()] ?? 0) > 0).length} sub={`of ${agencies.length} total`}/>
        <Shared.KpiCard label="Avg / agency" value={`$${agencies.length ? Math.round(estimatedMRR / agencies.length).toLocaleString() : 0}`} sub="MRR / tenant"/>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Plan distribution</h3><span className="meta">estimated · pre-Stripe</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 100px 100px 100px 100px" }}>
            <div>Plan</div><div>Agencies</div><div>Seats</div><div>Price / seat</div><div>MRR</div>
          </div>
          {PLAN_OPTS.map(p => {
            const t = planTotals[p] || { count: 0, members: 0, mrr: 0 };
            return (
              <div key={p} className="row" style={{ gridTemplateColumns: "1fr 100px 100px 100px 100px" }}>
                <div style={{ fontWeight: 500, textTransform: "capitalize" }}>{p}</div>
                <div>{t.count}</div>
                <div>{t.members}</div>
                <div style={{ color: "var(--text-tertiary)" }}>${PLAN_PRICE[p] ?? 0}</div>
                <div style={{ fontWeight: 500 }}>${t.mrr.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><Icons.Building size={13}/><h3>Per-agency revenue</h3><span className="meta">{agencies.length} tenants</span></div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.6fr 110px 80px 100px 100px" }}>
            <div>Agency</div><div>Plan</div><div>Seats</div><div>MRR</div><div>ARR</div>
          </div>
          {agencies.map(ag => {
            const p = (ag.plan || "trial").toLowerCase();
            const seats = memCounts[ag.id] || 0;
            const mrr = seats * (PLAN_PRICE[p] ?? 0);
            return (
              <div key={ag.id} className="row" style={{ gridTemplateColumns: "1.6fr 110px 80px 100px 100px" }}>
                <div style={{ fontWeight: 500 }}>{ag.name}</div>
                <div>
                  <select value={p} onChange={e => onPlanChange(ag.id, e.target.value)} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--text-primary)", cursor: "pointer" }}>
                    {PLAN_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>{seats}</div>
                <div style={{ fontWeight: 500 }}>${mrr.toLocaleString()}</div>
                <div style={{ color: "var(--text-tertiary)" }}>${(mrr * 12).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
window.BillingView = BillingView;

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

// ─── Carriers admin (life + annuity catalog + per-product underwriting) ───
//
// Read = global catalog of carriers. Selecting one expands a panel showing
// its products (filtered to category in {'life','annuity'}) and the
// approved underwriting rules per product. Super-admin can edit
// carrier_profiles inline (priority / urls / autoquoter flags).
//
// Writing carrier/product/rule rows from scratch is intentionally NOT here —
// the source-of-truth path is scraper → review queue → approve. This screen
// is for review of existing rows + tweaking the metadata that drives the
// recommend API's ranking.

function CarriersAdminView() {
  const [carriers, setCarriers]   = React.useState([]);
  const [profiles, setProfiles]   = React.useState({});
  const [products, setProducts]   = React.useState({}); // {carrier_id: [products]}
  const [rules, setRules]         = React.useState({}); // {product_id: [rules]}
  const [expanded, setExpanded]   = React.useState(null); // carrier_id
  const [loading, setLoading]     = React.useState(true);
  const [savingCid, setSavingCid] = React.useState(null);

  const sb = window.getSupabase && window.getSupabase();

  React.useEffect(() => {
    if (!sb) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [{ data: cs }, { data: ps }] = await Promise.all([
          sb.from("carriers").select("id,name,category,status").in("category", ["life","annuity"]).order("name"),
          sb.from("carrier_profiles").select("*"),
        ]);
        setCarriers(cs || []);
        const pMap = {};
        (ps || []).forEach(p => { pMap[p.carrier_id] = p; });
        setProfiles(pMap);
      } finally { setLoading(false); }
    })();
  }, []);

  const loadProductsFor = async (carrierId) => {
    if (!sb || products[carrierId]) return;
    const { data: prods } = await sb
      .from("products")
      .select("id,carrier_id,name,category,comp_pct,is_active")
      .eq("carrier_id", carrierId)
      .in("category", ["life","annuity"])
      .order("name");
    const list = prods || [];
    setProducts(prev => ({ ...prev, [carrierId]: list }));
    if (list.length === 0) return;
    const ids = list.map(p => p.id);
    const { data: rs } = await sb
      .from("product_underwriting_rules")
      .select("id,product_id,rule_type,severity,payload,review_status,source_url")
      .in("product_id", ids)
      .eq("review_status", "approved")
      .order("rule_type");
    const rMap = {};
    (rs || []).forEach(r => { (rMap[r.product_id] ||= []).push(r); });
    setRules(prev => ({ ...prev, ...rMap }));
  };

  const toggleExpand = (cid) => {
    if (expanded === cid) { setExpanded(null); return; }
    setExpanded(cid);
    loadProductsFor(cid);
  };

  const updateProfile = async (cid, patch) => {
    if (!sb) return;
    setSavingCid(cid);
    const current = profiles[cid] || { carrier_id: cid };
    const next = { ...current, ...patch, carrier_id: cid };
    setProfiles(prev => ({ ...prev, [cid]: next }));
    try {
      await sb.from("carrier_profiles").upsert(next, { onConflict: "carrier_id" });
      window.toast && window.toast(`Saved ${cid}`, "success");
    } catch (e) {
      window.toast && window.toast(`Save failed: ${e.message || e}`, "error");
    } finally { setSavingCid(null); }
  };

  if (loading) {
    return <div className="panel"><div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Loading carriers…</div></div>;
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Shield size={13}/>
        <h3>Life + Annuity Carriers</h3>
        <span className="meta">{carriers.length} carriers · drives /api/carrier-recommend ranking</span>
      </div>
      {carriers.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          No life or annuity carriers in catalog yet. Add via UW Queue (approve scraper findings) or insert into <code>public.carriers</code>.
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 90px 70px 90px 100px 100px 70px" }}>
            <div>Carrier</div><div>Category</div><div>Priority</div><div>Bind hrs</div><div>Comm tier</div><div>Autoquoter</div><div>JIT appt</div>
          </div>
          {carriers.map(c => {
            const prof = profiles[c.id] || {};
            const isOpen = expanded === c.id;
            return (
              <React.Fragment key={c.id}>
                <div className="row" style={{ gridTemplateColumns: "1.4fr 90px 70px 90px 100px 100px 70px", cursor: "pointer" }} onClick={() => toggleExpand(c.id)}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.id} · {c.status}</div>
                  </div>
                  <div><span className="chip">{c.category}</span></div>
                  <div className="mono" style={{ fontSize: 12 }}>{prof.quote_priority ?? 100}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{prof.bind_speed_hours ?? "—"}</div>
                  <div style={{ fontSize: 12 }}>{prof.commission_tier ? prof.commission_tier.toUpperCase() : "—"}</div>
                  <div style={{ fontSize: 12 }}>{prof.autoquoter_supported ? "✓" : "—"}</div>
                  <div style={{ fontSize: 12 }}>{prof.jit_appointment ? "✓" : "—"}</div>
                </div>
                {isOpen && (
                  <div style={{ background: "var(--bg-raised)", padding: 14, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                      <Shared.Field label="Quote priority (lower = first)">
                        <input className="text-input" type="number" defaultValue={prof.quote_priority ?? 100}
                          onBlur={(e) => updateProfile(c.id, { quote_priority: parseInt(e.target.value, 10) || 100 })}/>
                      </Shared.Field>
                      <Shared.Field label="Bind speed (hours)">
                        <input className="text-input" type="number" defaultValue={prof.bind_speed_hours ?? ""}
                          onBlur={(e) => updateProfile(c.id, { bind_speed_hours: e.target.value ? parseInt(e.target.value, 10) : null })}/>
                      </Shared.Field>
                      <Shared.Field label="Commission tier">
                        <Shared.Select value={prof.commission_tier || ""} onChange={(v) => updateProfile(c.id, { commission_tier: v || null })}
                          options={[{ v: "", l: "—" }, { v: "a", l: "A" }, { v: "b", l: "B" }, { v: "c", l: "C" }]}/>
                      </Shared.Field>
                      <Shared.Field label="Scraper slug (agent/scrapers/<x>.py)">
                        <input className="text-input" defaultValue={prof.scraper_slug || ""}
                          onBlur={(e) => updateProfile(c.id, { scraper_slug: e.target.value || null, autoquoter_supported: !!e.target.value })}/>
                      </Shared.Field>
                      <Shared.Field label="Producer portal URL">
                        <input className="text-input" defaultValue={prof.producer_portal_url || ""}
                          onBlur={(e) => updateProfile(c.id, { producer_portal_url: e.target.value || null })}/>
                      </Shared.Field>
                      <Shared.Field label="Quoter URL">
                        <input className="text-input" defaultValue={prof.quoter_url || ""}
                          onBlur={(e) => updateProfile(c.id, { quoter_url: e.target.value || null })}/>
                      </Shared.Field>
                      <Shared.Field label="e-App URL">
                        <input className="text-input" defaultValue={prof.e_app_url || ""}
                          onBlur={(e) => updateProfile(c.id, { e_app_url: e.target.value || null })}/>
                      </Shared.Field>
                      <Shared.Field label="JIT appointment">
                        <Shared.Select value={prof.jit_appointment ? "y" : "n"} onChange={(v) => updateProfile(c.id, { jit_appointment: v === "y" })}
                          options={[{ v: "n", l: "No — appoint first" }, { v: "y", l: "Yes — JIT supported" }]}/>
                      </Shared.Field>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 500 }}>
                      Products + underwriting rules
                    </div>
                    {(products[c.id] || []).length === 0 ? (
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>No products on file for this carrier yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {products[c.id].map(p => {
                          const prules = rules[p.id] || [];
                          return (
                            <div key={p.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                  {p.category} · comp {p.comp_pct ?? "—"}% · {prules.length} rules · {p.is_active ? "active" : "inactive"}
                                </div>
                              </div>
                              {prules.length > 0 && (
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {prules.map(r => (
                                    <span key={r.id} className={`chip ${r.severity === "decline" ? "chip-danger" : r.severity === "rate_up" ? "chip-status" : ""}`} title={JSON.stringify(r.payload)}>
                                      {r.rule_type} → {r.severity}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {savingCid === c.id && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>Saving…</div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Scrape queue review (carrier_scrape_findings → approve/reject) ───────
//
// The carrier-intel agent posts proposed inserts/updates here with raw
// evidence. Approving calls the SECURITY DEFINER fn
// `approve_carrier_scrape_finding` which writes through to live tables.

function ScrapeQueueView() {
  const [findings, setFindings] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [busyId, setBusyId]     = React.useState(null);

  const sb = window.getSupabase && window.getSupabase();

  const reload = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await sb
        .from("carrier_scrape_findings")
        .select("id,carrier_id,product_id,finding_kind,proposed,current_value,source_url,source_quote,confidence,review_status,created_at")
        .eq("review_status", "pending")
        .order("created_at", { ascending: false })
        .limit(100);
      setFindings(data || []);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const reviewerEmail = (() => {
    try {
      const u = window.__SESSION_USER || {};
      return u.email || "super_admin";
    } catch { return "super_admin"; }
  })();

  const approve = async (id) => {
    if (!sb) return;
    setBusyId(id);
    try {
      const { error } = await sb.rpc("approve_carrier_scrape_finding", { p_finding_id: id, p_reviewer: reviewerEmail });
      if (error) throw error;
      window.toast && window.toast("Approved · written to live tables", "success");
      setFindings(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      window.toast && window.toast(`Approve failed: ${e.message || e}`, "error");
    } finally { setBusyId(null); }
  };

  const reject = async (id) => {
    if (!sb) return;
    setBusyId(id);
    try {
      const { error } = await sb.rpc("reject_carrier_scrape_finding", { p_finding_id: id, p_reviewer: reviewerEmail, p_reason: null });
      if (error) throw error;
      setFindings(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      window.toast && window.toast(`Reject failed: ${e.message || e}`, "error");
    } finally { setBusyId(null); }
  };

  if (loading) {
    return <div className="panel"><div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Loading queue…</div></div>;
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Bell size={13}/>
        <h3>Underwriting Scrape Queue</h3>
        <span className="meta">{findings.length} pending · agent-proposed updates to carriers/products/rules</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={reload}>
          <Icons.RefreshCw size={11}/> Reload
        </button>
      </div>
      {findings.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          Inbox zero. The carrier-intel agent will drop new findings here when it next runs.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
          {findings.map(f => (
            <div key={f.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span className="chip">{f.finding_kind}</span>
                <span style={{ fontWeight: 500 }}>{f.carrier_id || "—"}</span>
                {typeof f.confidence === "number" && (
                  <span className="chip" style={{ fontSize: 10 }}>conf {(f.confidence * 100).toFixed(0)}%</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
                  {new Date(f.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11.5 }}>
                <div>
                  <div style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Proposed</div>
                  <pre className="mono" style={{ background: "var(--bg-base)", padding: 8, borderRadius: 4, maxHeight: 180, overflow: "auto", fontSize: 11 }}>
                    {JSON.stringify(f.proposed, null, 2)}
                  </pre>
                </div>
                <div>
                  <div style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Current</div>
                  <pre className="mono" style={{ background: "var(--bg-base)", padding: 8, borderRadius: 4, maxHeight: 180, overflow: "auto", fontSize: 11 }}>
                    {f.current_value ? JSON.stringify(f.current_value, null, 2) : "(none — new row)"}
                  </pre>
                </div>
              </div>
              {f.source_quote && (
                <div style={{ marginTop: 8, padding: 8, background: "var(--bg-raised)", borderRadius: 4, fontSize: 11.5, fontStyle: "italic", color: "var(--text-secondary)" }}>
                  “{f.source_quote}”
                  {f.source_url && (
                    <div style={{ marginTop: 4, fontSize: 10.5 }}>
                      <a href={f.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{f.source_url}</a>
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                <button className="btn btn-primary" disabled={busyId === f.id} onClick={() => approve(f.id)}>
                  {busyId === f.id ? "…" : <><Icons.Check size={11}/> Approve & apply</>}
                </button>
                <button className="btn btn-ghost" disabled={busyId === f.id} onClick={() => reject(f.id)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Devices admin (cross-agency RBA install observability) ─────────────
//
// Lists every install visible to viewer (super_admin sees all; owner+admin
// see their own agency). Click a row to open a drawer with:
//   • capability ledger snapshot
//   • live audit tail (Supabase realtime on rba_audit filtered by device_id)
//   • action buttons: Probe (ping/caps_refresh/models_list), Revoke
//
// Realtime subscription only attached when the drawer is open — collapse
// = unsubscribe so we don't burn quota when the tab is just sitting there.

function DevicesAdminView() {
  const [installs, setInstalls] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [openId, setOpenId]     = React.useState(null);
  const [audit, setAudit]       = React.useState({});
  const [commands, setCommands] = React.useState({});  // {device_id: [recent rba_commands rows]}
  const [anomalies, setAnomalies] = React.useState([]);
  const [busy, setBusy]         = React.useState(null);
  const subRef = React.useRef(null);
  const cmdSubRef = React.useRef(null);

  const sb = window.getSupabase && window.getSupabase();

  const reload = React.useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await sb
        .from("rba_installs")
        .select("device_id,user_id,agency_id,role,hostname,os,cpu,ram_gb,version,models_local,status,installed_at,last_seen_at,revoked_at")
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      setInstalls(data || []);
      // Compute anomalies inline (no LLM, no extra round-trip):
      const now = Date.now();
      const a = [];
      for (const d of data || []) {
        if (d.status !== "active") continue;
        if (!d.last_seen_at) { a.push({ device_id: d.device_id, kind: "no_heartbeat_yet", detail: `${d.hostname || d.device_id.slice(0,8)} hasn't sent a heartbeat` }); continue; }
        const ageHr = (now - new Date(d.last_seen_at).getTime()) / 3600000;
        if (ageHr > 24) a.push({ device_id: d.device_id, kind: "stale_heartbeat", detail: `${d.hostname || d.device_id.slice(0,8)} stale ${Math.floor(ageHr)}h` });
        else if (ageHr > 1) a.push({ device_id: d.device_id, kind: "warm_heartbeat", detail: `${d.hostname || d.device_id.slice(0,8)} stale ${Math.floor(ageHr)}h` });
      }
      // Pull deny rate per device in last 4h
      const since = new Date(now - 4 * 3600000).toISOString();
      const { data: aud } = await sb
        .from("rba_audit")
        .select("device_id,result")
        .gte("created_at", since);
      const byDev = {};
      (aud || []).forEach(r => { (byDev[r.device_id] ||= { ok:0, denied:0, error:0 })[r.result] += 1; });
      Object.entries(byDev).forEach(([deviceId, c]) => {
        const total = c.ok + c.denied + c.error;
        if (total >= 10) {
          if (c.denied / total > 0.3) a.push({ device_id: deviceId, kind: "deny_spike", detail: `${c.denied}/${total} denied (last 4h)` });
          if (c.error  / total > 0.2) a.push({ device_id: deviceId, kind: "error_spike", detail: `${c.error}/${total} errored (last 4h)` });
        }
      });
      setAnomalies(a);
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  React.useEffect(() => {
    if (!sb || !openId) {
      if (subRef.current)    { subRef.current.unsubscribe();    subRef.current = null; }
      if (cmdSubRef.current) { cmdSubRef.current.unsubscribe(); cmdSubRef.current = null; }
      return;
    }
    let cancelled = false;
    (async () => {
      const [audR, cmdR] = await Promise.all([
        sb.from("rba_audit")
          .select("id,tool,result,detail,duration_ms,created_at")
          .eq("device_id", openId)
          .order("created_at", { ascending: false })
          .limit(50),
        sb.from("rba_commands")
          .select("id,kind,payload,status,result,error,created_at,completed_at")
          .eq("device_id", openId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      setAudit(prev => ({ ...prev, [openId]: audR.data || [] }));
      setCommands(prev => ({ ...prev, [openId]: cmdR.data || [] }));
    })();
    const audCh = sb
      .channel(`rba-audit-${openId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rba_audit", filter: `device_id=eq.${openId}` },
        (msg) => {
          setAudit(prev => {
            const cur = prev[openId] || [];
            return { ...prev, [openId]: [msg.new, ...cur].slice(0, 100) };
          });
        })
      .subscribe();
    const cmdCh = sb
      .channel(`rba-cmds-${openId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rba_commands", filter: `device_id=eq.${openId}` },
        (msg) => {
          setCommands(prev => {
            const cur = prev[openId] || [];
            const next = [msg.new, ...cur.filter(r => r.id !== msg.new.id)].slice(0, 30);
            return { ...prev, [openId]: next };
          });
        })
      .subscribe();
    subRef.current = audCh;
    cmdSubRef.current = cmdCh;
    return () => {
      cancelled = true;
      if (subRef.current)    { subRef.current.unsubscribe();    subRef.current = null; }
      if (cmdSubRef.current) { cmdSubRef.current.unsubscribe(); cmdSubRef.current = null; }
    };
  }, [openId]);

  const probe = async (deviceId, kind) => {
    setBusy(`${deviceId}:${kind}`);
    try {
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/post-command", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, kind, payload: kind === "ping" ? { echo: Date.now() } : {} }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      window.toast && window.toast(`${kind} queued · cmd ${String(d.command_id || "").slice(0, 8)}`, "success");
    } catch (e) {
      window.toast && window.toast(`Probe failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  const revoke = async (deviceId) => {
    if (!confirm("Revoke this device? It self-wipes on next heartbeat.")) return;
    setBusy(`${deviceId}:revoke`);
    try {
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/revoke", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${r.status}`);
      }
      window.toast && window.toast("Revoked", "success");
      await reload();
    } catch (e) {
      window.toast && window.toast(`Revoke failed: ${e?.message || e}`, "error");
    } finally { setBusy(null); }
  };

  const fmtAgo = (ts) => {
    if (!ts) return "—";
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60)    return `${Math.floor(s)}s`;
    if (s < 3600)  return `${Math.floor(s/60)}m`;
    if (s < 86400) return `${Math.floor(s/3600)}h`;
    return `${Math.floor(s/86400)}d`;
  };
  const statusChip = (st, lastSeen) => {
    if (st === "revoked") return "chip";
    if (st === "quarantined") return "chip chip-status";
    const stale = lastSeen && (Date.now() - new Date(lastSeen).getTime() > 5 * 60_000);
    return stale ? "chip chip-status" : "chip chip-money";
  };

  if (loading) {
    return <div className="panel"><div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Loading devices…</div></div>;
  }

  const active = installs.filter(d => d.status === "active").length;
  const stale  = installs.filter(d => d.status === "active" && d.last_seen_at && (Date.now() - new Date(d.last_seen_at).getTime() > 24 * 3600_000)).length;

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Cpu size={13}/>
        <h3>Role-Based Agents</h3>
        <span className="meta">
          {active} active · {installs.length} total{stale > 0 ? ` · ${stale} stale >24h` : ""}
          {anomalies.length > 0 ? ` · ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"}` : ""}
        </span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={reload}>
          <Icons.RefreshCw size={11}/> Reload
        </button>
      </div>
      {anomalies.length > 0 && (
        <div style={{ padding: "10px 14px", background: "var(--bg-raised)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>Anomalies (auto-flagged)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {anomalies.map((a, i) => (
              <span key={i} className={`chip ${a.kind === "stale_heartbeat" || a.kind === "deny_spike" || a.kind === "error_spike" ? "chip-danger" : "chip-status"}`}
                    style={{ cursor: "pointer", fontSize: 10.5 }}
                    onClick={() => setOpenId(a.device_id)}
                    title={a.kind}>
                {a.detail}
              </span>
            ))}
          </div>
        </div>
      )}
      {installs.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          No agent installs yet. Reps install via Settings → Agents.
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 90px 100px 1fr 100px 110px 70px" }}>
            <div>Hostname / OS</div><div>Role</div><div>Version</div><div>Models</div><div>Status</div><div>Heartbeat</div><div></div>
          </div>
          {installs.map(d => {
            const open = openId === d.device_id;
            return (
              <React.Fragment key={d.device_id}>
                <div className="row" style={{ gridTemplateColumns: "1.4fr 90px 100px 1fr 100px 110px 70px", cursor: "pointer" }}
                     onClick={() => setOpenId(open ? null : d.device_id)}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{d.hostname || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {d.os || "?"} · {d.ram_gb ? `${d.ram_gb}GB` : "?"} · {(d.user_id || "").slice(0, 8)}
                    </div>
                  </div>
                  <div><span className="chip">{d.role}</span></div>
                  <div className="mono" style={{ fontSize: 11.5 }}>{d.version || "—"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{(d.models_local || []).join(", ") || "—"}</div>
                  <div><span className={statusChip(d.status, d.last_seen_at)}>{d.status}</span></div>
                  <div className="mono" style={{ fontSize: 11.5 }}>{fmtAgo(d.last_seen_at)}</div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-tertiary)" }}>{open ? "▾" : "▸"}</div>
                </div>
                {open && (
                  <div style={{ background: "var(--bg-raised)", padding: 14, borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Device ID</div>
                      <div className="mono" style={{ fontSize: 10.5, wordBreak: "break-all" }}>{d.device_id}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>Installed</div>
                      <div style={{ fontSize: 12 }}>{new Date(d.installed_at).toLocaleString()}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        <button className="btn" disabled={d.status !== "active" || busy === `${d.device_id}:ping`} onClick={() => probe(d.device_id, "ping")}>
                          {busy === `${d.device_id}:ping` ? "…" : "Ping"}
                        </button>
                        <button className="btn" disabled={d.status !== "active" || busy === `${d.device_id}:caps_refresh`} onClick={() => probe(d.device_id, "caps_refresh")}>
                          {busy === `${d.device_id}:caps_refresh` ? "…" : "Refresh caps"}
                        </button>
                        <button className="btn" disabled={d.status !== "active" || busy === `${d.device_id}:models_list`} onClick={() => probe(d.device_id, "models_list")}>
                          {busy === `${d.device_id}:models_list` ? "…" : "Models"}
                        </button>
                        {d.status !== "revoked" && (
                          <button className="btn btn-ghost" disabled={busy === `${d.device_id}:revoke`} onClick={() => revoke(d.device_id)}>
                            {busy === `${d.device_id}:revoke` ? "…" : "Revoke"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
                        Recent commands (subscribed)
                      </div>
                      <div style={{ background: "var(--bg-base)", borderRadius: 6, maxHeight: 280, overflow: "auto" }}>
                        {(commands[d.device_id] || []).length === 0 ? (
                          <div style={{ padding: 14, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                            No commands posted yet.
                          </div>
                        ) : (commands[d.device_id] || []).map(c => (
                          <div key={c.id} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11.5 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                              <span className={`chip ${c.status === "succeeded" ? "chip-money" : c.status === "failed" || c.status === "expired" ? "chip-danger" : "chip-status"}`} style={{ fontSize: 9.5 }}>
                                {c.status}
                              </span>
                              <span style={{ fontWeight: 500 }}>{c.kind}</span>
                              <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10.5 }}>
                                {fmtAgo(c.created_at)} ago
                              </span>
                            </div>
                            {c.error && (
                              <div style={{ marginTop: 3, color: "var(--state-danger)", fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                                {String(c.error).slice(0, 160)}
                              </div>
                            )}
                            {c.result && Object.keys(c.result).length > 0 && (
                              <pre className="mono" style={{ marginTop: 3, padding: "4px 6px", background: "var(--bg-raised)", borderRadius: 4, fontSize: 10, maxHeight: 90, overflow: "auto" }}>
                                {JSON.stringify(c.result, null, 1).slice(0, 400)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
                        Live audit tail (subscribed)
                      </div>
                      <div style={{ background: "var(--bg-base)", borderRadius: 6, maxHeight: 280, overflow: "auto" }}>
                        {(audit[d.device_id] || []).length === 0 ? (
                          <div style={{ padding: 14, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                            No tool calls yet.
                          </div>
                        ) : (audit[d.device_id] || []).map(row => (
                          <div key={row.id} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11.5 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                              <span className={`chip ${row.result === "ok" ? "chip-money" : row.result === "denied" ? "chip-status" : "chip-danger"}`} style={{ fontSize: 9.5 }}>
                                {row.result}
                              </span>
                              <span style={{ fontWeight: 500 }}>{row.tool}</span>
                              {row.duration_ms != null && (
                                <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10.5 }}>
                                  {row.duration_ms}ms · {fmtAgo(row.created_at)} ago
                                </span>
                              )}
                            </div>
                            {row.detail && (
                              <div style={{ marginTop: 3, color: "var(--text-tertiary)", fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
                                {row.detail.slice(0, 200)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Manual command tester (super_admin only) ───────────────────────────
//
// Post arbitrary commands to a chosen device for end-to-end testing
// without writing automation rules. Useful for verifying a new tool
// wires up.

/* ─────────────────────────────────────────────────────────────────────────
   Security advisor view — surfaces public.security_advisor_report() findings.
   The function is super_admin-gated server-side, so this just calls + renders.
   Buckets results by severity, maps to CVSS-like bands, shows remediation SQL.
   ───────────────────────────────────────────────────────────────────────── */
function SecurityAdvisorView() {
  const [findings, setFindings] = React.useState([]);
  const [loading, setLoading]   = React.useState(false);
  const [refreshedAt, setRefreshedAt] = React.useState(null);
  const [filter, setFilter] = React.useState("all");

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("security_advisor_report");
      if (error) throw error;
      setFindings(Array.isArray(data) ? data : []);
      setRefreshedAt(new Date());
    } catch (e) {
      window.toast && window.toast(`Advisor failed: ${e.message || e}`, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const sevOrder = { ERROR: 0, WARN: 1, INFO: 2 };
  const sevColor = { ERROR: "var(--state-danger)", WARN: "var(--state-warning)", INFO: "var(--text-tertiary)" };
  const filtered = (filter === "all" ? findings : findings.filter(f => f.severity === filter))
    .slice()
    .sort((a, b) => (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99));

  const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Shield size={13}/>
        <h3>Security advisor</h3>
        <span className="meta">
          {findings.length} finding{findings.length === 1 ? "" : "s"}
          {refreshedAt && ` · refreshed ${refreshedAt.toLocaleTimeString()}`}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["all","ERROR","WARN","INFO"].map(s => (
            <button key={s} className="btn btn-ghost"
              style={{
                padding: "3px 10px", fontSize: 11,
                background: filter === s ? "var(--bg-raised)" : "transparent",
                color: filter === s ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
              onClick={() => setFilter(s)}>
              {s === "all" ? `All (${findings.length})` : `${s} (${counts[s] || 0})`}
            </button>
          ))}
          <button className="btn" onClick={load} disabled={loading}>
            <Icons.RefreshCw size={11}/> {loading ? "Scanning…" : "Re-scan"}
          </button>
        </div>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 11.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
        CVSS-band mapping: <strong style={{ color: "var(--state-danger)" }}>ERROR</strong> ≈ High/Critical (7.0–9.9) · <strong style={{ color: "var(--state-warning)" }}>WARN</strong> ≈ Medium (4.0–6.9) · <strong>INFO</strong> ≈ Low (0.1–3.9).
        Findings come from a SECURITY DEFINER function over <code className="mono">pg_policies</code> / <code className="mono">pg_proc</code> / <code className="mono">pg_tables</code>.
      </div>
      {loading && findings.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Scanning…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>
          {findings.length === 0
            ? "No findings — clean run."
            : `No ${filter} findings.`}
        </div>
      ) : (
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "80px 110px 1.4fr 1.6fr 1.2fr" }}>
            <div>Severity</div><div>CVSS</div><div>Where</div><div>Issue</div><div>Remediation</div>
          </div>
          {filtered.map((f, i) => (
            <div key={`${f.kind}-${f.table_name}-${i}`} className="row" style={{ gridTemplateColumns: "80px 110px 1.4fr 1.6fr 1.2fr" }}>
              <div>
                <span className="chip" style={{ color: sevColor[f.severity], borderColor: sevColor[f.severity], fontWeight: 600 }}>
                  {f.severity}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }} className="mono">{f.cvss_band}</div>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{f.table_name || f.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-quaternary)" }} className="mono">{f.kind}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{f.message}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }} className="mono cell-truncate" title={f.remediation}>{f.remediation}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TESTER_KINDS = [
  "ping","caps_refresh","models_list","clear_workspace",
  "auto_quote","twilio_dial","draft_sms","draft_email",
  "sendblue_send","fathom_pull_notes","script_review","file_review",
  "browser_run","linkedin_send","linkedin_inbox_scan",
  "fb_pull_lead_forms","ig_dm_reply","meta_dm_send",
];

function ManualCommandTester() {
  const [installs, setInstalls] = React.useState([]);
  const [deviceId, setDeviceId] = React.useState("");
  const [kind, setKind]         = React.useState("ping");
  const [payloadJson, setPayloadJson] = React.useState('{"echo":"test"}');
  const [busy, setBusy]         = React.useState(false);
  const [last, setLast]         = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const { data } = await sb.from("rba_installs")
        .select("device_id,hostname,role,user_id,status").eq("status","active");
      setInstalls(data || []);
    })();
  }, []);

  const post = async () => {
    setBusy(true);
    setLast(null);
    try {
      let payload = {};
      if (payloadJson.trim()) payload = JSON.parse(payloadJson);
      const sb = window.getSupabase();
      const session = (await sb.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      const r = await fetch("/api/agent/post-command", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, kind, payload }),
      });
      const d = await r.json();
      setLast(d);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      window.toast && window.toast(`Posted · cmd ${String(d.command_id || "").slice(0, 8)}`, "success");
    } catch (e) {
      window.toast && window.toast(`Post failed: ${e?.message || e}`, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Cpu size={13}/>
        <h3>Manual command tester</h3>
        <span className="meta">super_admin only · post any command to any device</span>
      </div>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Shared.Field label="Target device">
            <Shared.Select value={deviceId} onChange={setDeviceId}
              options={[{ v: "", l: "— pick a device —" }, ...installs.map(i => ({ v: i.device_id, l: `${i.hostname || i.device_id.slice(0,8)} · ${i.role}` }))]}/>
          </Shared.Field>
          <Shared.Field label="Command kind">
            <Shared.Select value={kind} onChange={setKind} options={TESTER_KINDS.map(k => ({ v: k, l: k }))}/>
          </Shared.Field>
          <Shared.Field label="Payload (JSON)">
            <textarea className="text-input mono" rows={6} value={payloadJson} onChange={e => setPayloadJson(e.target.value)} placeholder='{"to_number":"+15551234567","body":"hi"}'/>
          </Shared.Field>
          <button className="btn btn-primary" disabled={!deviceId || busy} onClick={post}>
            {busy ? "Posting…" : "Post command"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>Last response</div>
          <pre className="mono" style={{ background: "var(--bg-base)", padding: 10, borderRadius: 6, fontSize: 11, maxHeight: 280, overflow: "auto" }}>
            {last ? JSON.stringify(last, null, 2) : "(no response yet)"}
          </pre>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
            After posting, watch the Recent Commands pane in the device drawer to see when the agent claims, runs, and completes the command.
          </div>
        </div>
      </div>
    </div>
  );
}

})();
