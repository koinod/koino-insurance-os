/* page-imo.jsx — IMO / Platform Admin surface (koino.capital skin).
 *
 *   Design system: koino.capital (near-black bg + teal-green #00d4aa accent,
 *   JetBrains Mono for tabular numbers + labels, tighter card padding, denser
 *   grids). Scoped via the .koino-skin wrapper class — does not bleed into
 *   the rest of the app.
 *
 *   For role = "admin" or "imo_owner" (and "super_admin", which sees every
 *   IMO).  Six subpages routed from index.html:
 *
 *     platform  →  Overview: fleet aggregates (sub-agencies + producers +
 *                  in-flight policies + premium), pending onboardings,
 *                  recent provisioning.
 *     agencies  →  Sub-agency fleet table with drill-in.  Provision new
 *                  sub-agency action.  Switch active agency.
 *     users     →  Cross-agency member list — role, agency, last sign-in,
 *                  invite + remove.
 *     billing   →  Per-sub-agency plan/MRR roll-up.
 *     audit     →  Cross-agency agency_audit_log (latest 200) + filters.
 *     system    →  Env health, RPC reachability, viewer_agency_ids() sanity.
 *
 *   Demo agencies (is_demo=true) are hidden from production fleet views by
 *   default; super_admin sees them with a "demo" chip and can toggle off.
 *
 *   Exposes BOTH window.PageImo and window.PagePlatformAdmin so the existing
 *   index.html routing (which references PagePlatformAdmin) resolves.
 */

(function () {

const DEMO_AGENCY_IDS = new Set([
  "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9",  // Atlas (seeded demo)
]);

// ─── helpers ───────────────────────────────────────────────────────────────
function fmtMoney(cents) {
  if (cents == null || isNaN(cents)) return "—";
  const n = Math.round(cents / 100);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}
function fmtAge(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
function isDemoRow(row) {
  if (!row) return false;
  if (row.is_demo === true) return true;
  if (row.id && DEMO_AGENCY_IDS.has(row.id)) return true;
  return false;
}
function slugify(s) {
  return String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// ─── Tab bar (koino skin) ──────────────────────────────────────────────────
const TABS = [
  { id: "platform", label: "Overview" },
  { id: "agencies", label: "Agencies" },
  { id: "users",    label: "Members" },
  { id: "billing",  label: "Billing" },
  { id: "audit",    label: "Audit log" },
  { id: "system",   label: "System" },
];

function TabBar({ active, onChange }) {
  return (
    <div className="k-tabs">
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`k-tab ${active === t.id ? "on" : ""}`}>
          <span className="k-tab-dot"/>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI ────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, hero }) {
  return (
    <div className={`k-kpi ${hero ? "k-hero" : ""}`}>
      <div className="k-kpi-label">{label}</div>
      <div className="k-kpi-value">{value}</div>
      {sub && <div className="k-kpi-sub">{sub}</div>}
    </div>
  );
}

// ─── Fleet hydration ───────────────────────────────────────────────────────
function useFleet(includeDemo) {
  const [state, setState] = React.useState({
    loading: true, agencies: [], memberCounts: {}, lastActive: {},
    metrics: { policies: 0, premiumCents: 0, producers: 0, liveNow: 0, audit7d: 0, activePremiumCents: 0 },
    err: null,
  });

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setState(s => ({ ...s, loading: false, err: "Supabase not initialized" })); return; }
    setState(s => ({ ...s, loading: true, err: null }));
    try {
      const { data: ag, error: agErr } = await sb
        .from("agencies")
        .select("id, name, slug, plan, is_demo, primary_state, created_at, onboarding_complete, parent_agency_id, suspended_at")
        .order("created_at", { ascending: false });
      if (agErr) throw agErr;

      const filtered = (ag || []).filter(a => includeDemo || !isDemoRow(a));
      const ids = filtered.map(a => a.id);

      const memberCounts = {};
      const lastActive = {};
      let producers = 0;
      let liveNow = 0;
      let policies = 0;
      let premiumCents = 0;
      let activePremiumCents = 0;
      let audit7d = 0;
      const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

      if (ids.length > 0) {
        const [{ data: members }, { data: audit }, { data: reps }, { data: pols }] = await Promise.all([
          sb.from("agency_members").select("agency_id, active").in("agency_id", ids),
          sb.from("agency_audit_log").select("agency_id, created_at").in("agency_id", ids).order("created_at", { ascending: false }).limit(2000),
          sb.from("reps").select("id, agency_id, presence").in("agency_id", ids),
          sb.from("policies").select("agency_id, status, ap_cents").in("agency_id", ids),
        ]);

        for (const m of (members || [])) {
          if (m.active === false) continue;
          memberCounts[m.agency_id] = (memberCounts[m.agency_id] || 0) + 1;
        }
        for (const ev of (audit || [])) {
          if (!lastActive[ev.agency_id]) lastActive[ev.agency_id] = ev.created_at;
          if (new Date(ev.created_at).getTime() > sevenDaysAgo) audit7d += 1;
        }
        producers = (reps || []).length;
        liveNow = (reps || []).filter(r => r.presence === "live").length;
        for (const p of (pols || [])) {
          policies += 1;
          const ap = Number(p.ap_cents || 0);
          premiumCents += ap;
          // "Active" = anything not explicitly cancelled/lapsed. policies.status
          // values in the schema are issued/in_force/cancelled/lapsed; treat any
          // unrecognized status as active so envs without the column don't go
          // to zero.
          const status = (p.status || "").toLowerCase();
          if (status !== "cancelled" && status !== "lapsed") activePremiumCents += ap;
        }
      }

      setState({
        loading: false, agencies: filtered, memberCounts, lastActive,
        metrics: { policies, premiumCents, producers, liveNow, audit7d, activePremiumCents },
        err: null,
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, err: String(e?.message || e) }));
    }
  }, [includeDemo]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const onRt = (e) => {
      const t = e.detail?.table;
      if (t === "agency_audit_log" || t === "agencies" || t === "agency_members") load();
    };
    window.addEventListener("data:realtime", onRt);
    return () => window.removeEventListener("data:realtime", onRt);
  }, [load]);

  return [state, load];
}

// ─── Status chip ────────────────────────────────────────────────────────────
function StatusChip({ kind = "neutral", children }) {
  const cls = kind === "live" ? "k-chip-live"
            : kind === "warn" ? "k-chip-warn"
            : kind === "danger" ? "k-chip-danger"
            : kind === "demo" ? "k-chip-demo"
            : "";
  return <span className={`k-chip ${cls}`}>{children}</span>;
}

// ─── 1. Overview ────────────────────────────────────────────────────────────
function OverviewTab({ fleet, reload, isSuperAdmin, includeDemo, setIncludeDemo, onOpenProvision, onSwitchAgency }) {
  const { loading, agencies, memberCounts, lastActive, metrics, err } = fleet;
  // Stale-first sort for pending onboarding — the one that's been sitting
  // longest is the one most likely to need a nudge.
  const pendingOnboard = agencies
    .filter(a => !a.onboarding_complete)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const fresh = agencies.slice(0, 6);
  const totalMembers = Object.values(memberCounts).reduce((a, b) => a + b, 0);
  const stalestDays = pendingOnboard[0]
    ? Math.max(0, Math.round((Date.now() - new Date(pendingOnboard[0].created_at)) / 86400000))
    : 0;

  return (
    <div className="k-stack">
      <div className="k-kpis">
        <Kpi hero label="Sub-agencies" value={agencies.length} sub={pendingOnboard.length > 0 ? `${pendingOnboard.length} mid-onboarding · stalest ${stalestDays}d` : "all live"}/>
        <Kpi label="Producers"        value={metrics.producers} sub={`${metrics.liveNow} live now · ${totalMembers} member${totalMembers === 1 ? "" : "s"}`}/>
        <Kpi label="Active AP"        value={fmtMoney(metrics.activePremiumCents)} sub={`${metrics.policies} policies in book`}/>
        <Kpi label="Activity (7d)"    value={metrics.audit7d} sub="events across fleet"/>
      </div>

      {err && (
        <div className="k-card">
          <div className="k-card-h">
            <h3 style={{ color: "var(--k-danger)" }}>Fleet failed to load</h3>
            <div className="k-actions"><button className="k-btn k-btn-ghost" onClick={reload}>Retry</button></div>
          </div>
          <div className="k-error">{err}</div>
        </div>
      )}

      <div className="k-2col">
        <div className="k-card">
          <div className="k-card-h">
            <h3>Recent sub-agencies</h3>
            <span className="k-meta">{fresh.length} / {agencies.length}</span>
            <div className="k-actions">
              {isSuperAdmin && (
                <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:"0.7rem", color:"var(--k-t3)", fontFamily:"var(--k-mono)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} style={{ accentColor:"var(--k-a)" }}/>
                  Demo
                </label>
              )}
              <button className="k-btn k-btn-primary" onClick={onOpenProvision}>+ Provision</button>
            </div>
          </div>
          <div className="k-table">
            <div className="k-tr k-head" style={{ gridTemplateColumns:"1.4fr 1fr 70px 70px 70px 70px" }}>
              <div>Agency</div><div>State · Plan</div><div>Members</div><div>Active</div><div>Onboard</div><div></div>
            </div>
            {loading && <div className="k-empty">Loading…</div>}
            {!loading && fresh.length === 0 && (
              <div className="k-empty">
                No sub-agencies yet.<br/>Click <strong style={{ color:"var(--k-a)" }}>Provision</strong> to onboard your first.
              </div>
            )}
            {fresh.map(a => (
              <div key={a.id} className="k-tr k-body" style={{ gridTemplateColumns:"1.4fr 1fr 70px 70px 70px 70px" }}>
                <div>
                  <div className="k-cell-name">{a.name}</div>
                  <div className="k-cell-sub">{a.slug}</div>
                </div>
                <div style={{ color:"var(--k-t2)" }}>
                  {a.primary_state || "—"} · {a.plan || "—"}
                  {isDemoRow(a) && <span style={{ marginLeft:6 }}><StatusChip kind="demo">demo</StatusChip></span>}
                </div>
                <div className="k-num">{memberCounts[a.id] || 0}</div>
                <div className="k-mono" style={{ fontSize:"0.7rem", color:"var(--k-t3)" }}>{fmtAge(lastActive[a.id])}</div>
                <div><StatusChip kind={a.onboarding_complete ? "live" : "warn"}>{a.onboarding_complete ? "live" : "pending"}</StatusChip></div>
                <div><button className="k-btn k-btn-ghost" onClick={() => onSwitchAgency(a)}>Open →</button></div>
              </div>
            ))}
          </div>
        </div>

        <div className="k-card">
          <div className="k-card-h">
            <h3>Pending onboarding</h3>
            <span className="k-meta">{pendingOnboard.length}</span>
          </div>
          <div className="k-card-body" style={{ padding:8 }}>
            {pendingOnboard.length === 0 && <div className="k-empty">All sub-agencies finished setup.</div>}
            {pendingOnboard.slice(0, 8).map(a => {
              const days = Math.max(0, Math.round((Date.now() - new Date(a.created_at)) / 86400000));
              const isStale = days >= 7;
              return (
                <div key={a.id} style={{ padding:"8px 10px", background:"var(--k-s2)", borderRadius:6, marginBottom:6, fontSize:"0.78rem", border:`1px solid ${isStale ? "rgba(245,158,11,0.35)" : "var(--k-b)"}` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                    <strong style={{ minWidth:0, overflow:"hidden", textOverflow:"ellipsis" }}>{a.name}</strong>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      {isStale && <StatusChip kind="warn">{days}d stale</StatusChip>}
                      <button className="k-btn k-btn-ghost" onClick={() => onSwitchAgency(a)}>Resume →</button>
                    </div>
                  </div>
                  <div className="k-mono" style={{ fontSize:"0.65rem", color:"var(--k-t3)", marginTop:3 }}>
                    Created {new Date(a.created_at).toLocaleDateString()} · {a.primary_state || "no state"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Agencies fleet ──────────────────────────────────────────────────────
function AgenciesTab({ fleet, reload, isSuperAdmin, includeDemo, setIncludeDemo, onOpenProvision, onSwitchAgency }) {
  const { loading, agencies, memberCounts, lastActive, err } = fleet;
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");

  const filtered = agencies.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !(a.slug || "").includes(search.toLowerCase())) return false;
    if (filter === "onboarding" && a.onboarding_complete) return false;
    if (filter === "live" && !a.onboarding_complete) return false;
    return true;
  });

  return (
    <div className="k-card">
      <div className="k-card-h">
        <h3>All sub-agencies</h3>
        <span className="k-meta">{filtered.length} visible · {agencies.length} total</span>
        <div className="k-actions">
          <input className="k-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width:140 }}/>
          <select className="k-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width:130 }}>
            <option value="all">All</option>
            <option value="live">Live only</option>
            <option value="onboarding">Mid-onboarding</option>
          </select>
          {isSuperAdmin && (
            <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:"0.7rem", color:"var(--k-t3)", fontFamily:"var(--k-mono)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
              <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} style={{ accentColor:"var(--k-a)" }}/>
              Demo
            </label>
          )}
          <button className="k-btn k-btn-ghost" onClick={reload}>↻</button>
          <button className="k-btn k-btn-primary" onClick={onOpenProvision}>+ Provision</button>
        </div>
      </div>
      {err && <div className="k-error">{err}</div>}
      <div className="k-table">
        <div className="k-tr k-head" style={{ gridTemplateColumns:"1.6fr 70px 90px 70px 80px 80px 80px" }}>
          <div>Agency</div><div>State</div><div>Plan</div><div>Members</div><div>Last active</div><div>Status</div><div></div>
        </div>
        {loading && <div className="k-empty">Loading fleet…</div>}
        {!loading && filtered.length === 0 && !err && (
          <div className="k-empty">
            {agencies.length === 0 ? "No sub-agencies yet — Provision your first." : "No agencies match the current filter."}
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="k-tr k-body" style={{ gridTemplateColumns:"1.6fr 70px 90px 70px 80px 80px 80px" }}>
            <div style={{ minWidth:0 }}>
              <div className="k-cell-name" style={{ display:"flex", gap:6, alignItems:"center" }}>
                {a.name}
                {isDemoRow(a) && <StatusChip kind="demo">demo</StatusChip>}
              </div>
              <div className="k-cell-sub">{a.slug}</div>
            </div>
            <div style={{ color:"var(--k-t2)" }}>{a.primary_state || "—"}</div>
            <div style={{ color:"var(--k-t2)" }}>{a.plan || "—"}</div>
            <div className="k-num">{memberCounts[a.id] || 0}</div>
            <div className="k-mono" style={{ fontSize:"0.7rem", color:"var(--k-t3)" }}>{fmtAge(lastActive[a.id])}</div>
            <div><StatusChip kind={a.onboarding_complete ? "live" : "warn"}>{a.onboarding_complete ? "live" : "onboarding"}</StatusChip></div>
            <div><button className="k-btn k-btn-ghost" onClick={() => onSwitchAgency(a)}>Open →</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 3. Members ─────────────────────────────────────────────────────────────
function MembersTab({ fleet, reload }) {
  const { agencies } = fleet;
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [filterAg, setFilterAg] = React.useState("");
  const [filterRole, setFilterRole] = React.useState("");
  const [busy, setBusy] = React.useState(null);

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setLoading(true); setErr(null);
    try {
      const ids = agencies.map(a => a.id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }
      const { data, error } = await sb
        .from("agency_members")
        .select("user_id, agency_id, role, rep_id, joined_at, active")
        .in("agency_id", ids)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [agencies]);
  React.useEffect(() => { load(); }, [load]);

  const agencyById = React.useMemo(() => Object.fromEntries(agencies.map(a => [a.id, a])), [agencies]);

  const filtered = rows.filter(r => {
    if (filterAg && r.agency_id !== filterAg) return false;
    if (filterRole && r.role !== filterRole) return false;
    return true;
  });

  const setRole = async (row, newRole) => {
    if (newRole === row.role) return;
    setBusy(`${row.user_id}|${row.agency_id}`);
    const sb = window.getSupabase();
    try {
      const rpc = await sb.rpc("update_member_role", {
        p_agency_id: row.agency_id, p_user_id: row.user_id, p_role: newRole,
      });
      if (rpc.error && /function .* does not exist/i.test(rpc.error.message || "")) {
        const { error } = await sb.from("agency_members").update({ role: newRole })
          .eq("agency_id", row.agency_id).eq("user_id", row.user_id);
        if (error) throw error;
      } else if (rpc.error) { throw rpc.error; }
      window.toast && window.toast(`Role updated → ${newRole}`, "success");
      load();
    } catch (e) {
      window.toast && window.toast(`Update failed: ${e.message || e}`, "error");
    } finally { setBusy(null); }
  };

  const deactivate = async (row) => {
    if (!confirm(`Remove this member from ${agencyById[row.agency_id]?.name || "agency"}?`)) return;
    setBusy(`${row.user_id}|${row.agency_id}`);
    const sb = window.getSupabase();
    try {
      const rpc = await sb.rpc("deactivate_member", {
        p_agency_id: row.agency_id, p_user_id: row.user_id,
      });
      if (rpc.error && /function .* does not exist/i.test(rpc.error.message || "")) {
        const { error } = await sb.from("agency_members").update({ active: false })
          .eq("agency_id", row.agency_id).eq("user_id", row.user_id);
        if (error) throw error;
      } else if (rpc.error) { throw rpc.error; }
      window.toast && window.toast("Member deactivated", "success");
      load();
    } catch (e) {
      window.toast && window.toast(`Remove failed: ${e.message || e}`, "error");
    } finally { setBusy(null); }
  };

  return (
    <div className="k-card">
      <div className="k-card-h">
        <h3>Members across sub-agencies</h3>
        <span className="k-meta">{filtered.length} / {rows.length}</span>
        <div className="k-actions">
          <select className="k-select" style={{ width:180 }} value={filterAg} onChange={(e) => setFilterAg(e.target.value)}>
            <option value="">All agencies</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="k-select" style={{ width:120 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="imo_owner">imo_owner</option>
            <option value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="manager">manager</option>
            <option value="rep">rep</option>
          </select>
          <button className="k-btn k-btn-ghost" onClick={load}>↻</button>
        </div>
      </div>
      {err && <div className="k-error">{err}</div>}
      <div className="k-table">
        <div className="k-tr k-head" style={{ gridTemplateColumns:"1.4fr 1.6fr 130px 90px 70px 90px" }}>
          <div>Member</div><div>Agency</div><div>Role</div><div>Joined</div><div>Status</div><div></div>
        </div>
        {loading && <div className="k-empty">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="k-empty">No members match the filter.</div>}
        {filtered.map(r => {
          const ag = agencyById[r.agency_id];
          const key = `${r.user_id}|${r.agency_id}`;
          const myBusy = busy === key;
          return (
            <div key={key} className="k-tr k-body" style={{ gridTemplateColumns:"1.4fr 1.6fr 130px 90px 70px 90px" }}>
              <div className="k-mono" style={{ fontSize:"0.7rem" }}>{(r.user_id || "").slice(0, 12)}…</div>
              <div style={{ minWidth:0 }}>
                <div className="k-cell-name" style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ag?.name || r.agency_id?.slice(0, 8)}</div>
                {ag && isDemoRow(ag) && <div style={{ marginTop:2 }}><StatusChip kind="demo">demo</StatusChip></div>}
              </div>
              <div>
                <select className="k-select" style={{ width:"100%" }} value={r.role} disabled={myBusy} onChange={(e) => setRole(r, e.target.value)}>
                  <option value="imo_owner">imo_owner</option>
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="rep">rep</option>
                </select>
              </div>
              <div className="k-mono" style={{ fontSize:"0.7rem", color:"var(--k-t3)" }}>{r.joined_at ? new Date(r.joined_at).toLocaleDateString() : "—"}</div>
              <div><StatusChip kind={r.active ? "live" : "neutral"}>{r.active ? "active" : "off"}</StatusChip></div>
              <div>{r.active && <button className="k-btn k-btn-ghost k-btn-danger" disabled={myBusy} onClick={() => deactivate(r)}>Remove</button>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. Billing roll-up ─────────────────────────────────────────────────────
function BillingTab({ fleet }) {
  const { agencies, memberCounts, loading } = fleet;
  const PLAN_MRR = {
    trial: 0, rep_solo: 9700, agency_setup: 99700,
    starter: 49700, growth: 99700, scale: 249700,
  };
  const byPlan = {};
  let mrrCents = 0;
  for (const a of agencies) {
    const p = a.plan || "trial";
    byPlan[p] = (byPlan[p] || 0) + 1;
    mrrCents += PLAN_MRR[p] || 0;
  }
  const totalMembers = Object.values(memberCounts).reduce((a, b) => a + b, 0);
  const paying = agencies.filter(a => a.plan && a.plan !== "trial").length;

  return (
    <div className="k-stack">
      <div className="k-kpis" style={{ gridTemplateColumns:"repeat(3, minmax(0, 1fr))" }}>
        <Kpi hero label="Est. MRR" value={fmtMoney(mrrCents)} sub="from agency plan tiers"/>
        <Kpi label="Paying agencies" value={paying} sub={`${agencies.length - paying} on trial`}/>
        <Kpi label="Members billed" value={totalMembers} sub="across all sub-agencies"/>
      </div>

      <div className="k-card">
        <div className="k-card-h"><h3>By plan</h3></div>
        <div className="k-table">
          <div className="k-tr k-head" style={{ gridTemplateColumns:"1fr 80px 110px" }}>
            <div>Plan</div><div>Agencies</div><div>Est. MRR</div>
          </div>
          {Object.entries(byPlan).map(([plan, count]) => (
            <div key={plan} className="k-tr k-body" style={{ gridTemplateColumns:"1fr 80px 110px" }}>
              <div className="k-cell-name">{plan}</div>
              <div className="k-num">{count}</div>
              <div className="k-num">{fmtMoney(count * (PLAN_MRR[plan] || 0))}</div>
            </div>
          ))}
          {Object.keys(byPlan).length === 0 && !loading && <div className="k-empty">No agencies yet.</div>}
        </div>
      </div>

      <div className="k-card">
        <div className="k-card-h"><h3>Per sub-agency</h3></div>
        <div className="k-table">
          <div className="k-tr k-head" style={{ gridTemplateColumns:"1.6fr 90px 80px 100px" }}>
            <div>Agency</div><div>Plan</div><div>Members</div><div>Est. MRR</div>
          </div>
          {agencies.map(a => (
            <div key={a.id} className="k-tr k-body" style={{ gridTemplateColumns:"1.6fr 90px 80px 100px" }}>
              <div className="k-cell-name">{a.name}{isDemoRow(a) && <span style={{ marginLeft:6 }}><StatusChip kind="demo">demo</StatusChip></span>}</div>
              <div style={{ color:"var(--k-t2)" }}>{a.plan || "trial"}</div>
              <div className="k-num">{memberCounts[a.id] || 0}</div>
              <div className="k-num">{fmtMoney(PLAN_MRR[a.plan || "trial"] || 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 5. Audit log ───────────────────────────────────────────────────────────
function AuditTab({ fleet }) {
  const { agencies } = fleet;
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [filterAg, setFilterAg] = React.useState("");
  const [filterRole, setFilterRole] = React.useState("");

  const load = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    setLoading(true); setErr(null);
    try {
      const ids = agencies.map(a => a.id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }
      let q = sb.from("agency_audit_log")
        .select("id, agency_id, action, actor_role, target, metadata, created_at")
        .in("agency_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filterAg)   q = q.eq("agency_id", filterAg);
      if (filterRole) q = q.eq("actor_role", filterRole);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setLoading(false); }
  }, [agencies, filterAg, filterRole]);
  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    const onRt = (e) => { if (e.detail?.table === "agency_audit_log") load(); };
    window.addEventListener("data:realtime", onRt);
    return () => window.removeEventListener("data:realtime", onRt);
  }, [load]);

  const agencyById = React.useMemo(() => Object.fromEntries(agencies.map(a => [a.id, a])), [agencies]);

  return (
    <div className="k-card">
      <div className="k-card-h">
        <h3>Cross-agency audit log</h3>
        <span className="k-meta">{rows.length} events</span>
        <div className="k-actions">
          <select className="k-select" style={{ width:180 }} value={filterAg} onChange={(e) => setFilterAg(e.target.value)}>
            <option value="">All agencies</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="k-select" style={{ width:130 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">All actors</option>
            <option value="imo_owner">imo_owner</option>
            <option value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="manager">manager</option>
            <option value="rep">rep</option>
            <option value="system">system</option>
          </select>
          <button className="k-btn k-btn-ghost" onClick={load}>↻</button>
        </div>
      </div>
      {err && <div className="k-error">{err}</div>}
      <div className="k-table">
        <div className="k-tr k-head" style={{ gridTemplateColumns:"130px 1.2fr 1.4fr 1fr 90px" }}>
          <div>When</div><div>Agency</div><div>Action</div><div>Target</div><div>Actor</div>
        </div>
        {loading && <div className="k-empty">Loading…</div>}
        {!loading && rows.length === 0 && !err && (
          <div className="k-empty">No events match. {agencies.length === 0 && "Provision a sub-agency first."}</div>
        )}
        {rows.map(ev => {
          const ag = agencyById[ev.agency_id];
          return (
            <div key={ev.id} className="k-tr k-body" style={{ gridTemplateColumns:"130px 1.2fr 1.4fr 1fr 90px" }}>
              <div className="k-mono" style={{ fontSize:"0.7rem", color:"var(--k-t3)" }}>{new Date(ev.created_at).toLocaleString()}</div>
              <div style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{ag?.name || ev.agency_id.slice(0, 8)}</div>
              <div className="k-cell-name">{ev.action}</div>
              <div className="k-mono" style={{ fontSize:"0.7rem", color:"var(--k-t3)", overflow:"hidden", textOverflow:"ellipsis" }}>{ev.target || "—"}</div>
              <div><StatusChip>{ev.actor_role || "system"}</StatusChip></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 6. System health ───────────────────────────────────────────────────────
function SystemTab({ fleet, reload }) {
  const [probes, setProbes] = React.useState({
    me: { state: "checking" }, agencyIds: { state: "checking" },
    audit: { state: "checking" }, twilio: { state: "checking" },
    transcribe: { state: "checking" },
  });

  const run = React.useCallback(async () => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setProbes(p => ({ ...p, me: { state: "error", detail: "supabase not initialized" } })); return; }

    try {
      const r = await sb.rpc("me");
      if (r.error) setProbes(p => ({ ...p, me: { state: "error", detail: r.error.message } }));
      else setProbes(p => ({ ...p, me: { state: "ok", detail: Array.isArray(r.data) && r.data.length > 0 ? `rep ${r.data[0].rep_id}` : "no rep row" } }));
    } catch (e) { setProbes(p => ({ ...p, me: { state: "error", detail: String(e) } })); }

    try {
      const r = await sb.rpc("viewer_agency_ids");
      if (r.error) setProbes(p => ({ ...p, agencyIds: { state: "error", detail: r.error.message } }));
      else {
        const ids = Array.isArray(r.data) ? r.data.map(x => x.viewer_agency_ids || x).filter(Boolean) : [];
        setProbes(p => ({ ...p, agencyIds: {
          state: ids.length > 0 ? "ok" : "warn",
          detail: ids.length > 0 ? `${ids.length} agency_id${ids.length === 1 ? "" : "s"} visible` : "no agency memberships",
        } }));
      }
    } catch (e) { setProbes(p => ({ ...p, agencyIds: { state: "error", detail: String(e) } })); }

    try {
      const r = await sb.from("agency_audit_log").select("id", { count: "exact", head: true }).limit(1);
      if (r.error) setProbes(p => ({ ...p, audit: { state: "error", detail: r.error.message } }));
      else setProbes(p => ({ ...p, audit: { state: "ok", detail: `${r.count ?? 0} events visible` } }));
    } catch (e) { setProbes(p => ({ ...p, audit: { state: "error", detail: String(e) } })); }

    try {
      const r = await fetch("/api/twilio-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (r.status === 503) setProbes(p => ({ ...p, twilio: { state: "warn", detail: "env vars missing" } }));
      else if (r.ok)         setProbes(p => ({ ...p, twilio: { state: "ok", detail: "ready" } }));
      else                   setProbes(p => ({ ...p, twilio: { state: "error", detail: `HTTP ${r.status}` } }));
    } catch (e) { setProbes(p => ({ ...p, twilio: { state: "error", detail: String(e) } })); }
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503) setProbes(p => ({ ...p, transcribe: { state: "warn", detail: "OPENAI_API_KEY missing" } }));
      else if (j.error === "missing_audio_url") setProbes(p => ({ ...p, transcribe: { state: "ok", detail: "ready" } }));
      else if (r.ok)         setProbes(p => ({ ...p, transcribe: { state: "ok", detail: "ready" } }));
      else                   setProbes(p => ({ ...p, transcribe: { state: "error", detail: `HTTP ${r.status}` } }));
    } catch (e) { setProbes(p => ({ ...p, transcribe: { state: "error", detail: String(e) } })); }
  }, []);
  React.useEffect(() => { run(); }, [run]);

  const probeRows = [
    { id: "me",         label: "RPC me()",                hint: "Returns the signed-in viewer's rep + agency identity",   p: probes.me },
    { id: "agencyIds",  label: "RPC viewer_agency_ids()", hint: "Returns the set of agency_ids RLS will allow for reads", p: probes.agencyIds },
    { id: "audit",      label: "agency_audit_log read",   hint: "Cross-agency audit trail must be readable here",         p: probes.audit },
    { id: "twilio",     label: "Twilio (voice + SMS)",    hint: "Required for live dial + transcription",                 p: probes.twilio },
    { id: "transcribe", label: "Transcription (OpenAI)",  hint: "Whisper backs live call coaching",                       p: probes.transcribe },
  ];

  const tone = (s) => s === "ok" ? "var(--k-a)" : s === "warn" ? "var(--k-warn)" : s === "checking" ? "var(--k-t3)" : "var(--k-danger)";
  const stateLabel = (s) => s === "ok" ? "ok" : s === "warn" ? "action" : s === "checking" ? "…" : "error";
  const chipKind = (s) => s === "ok" ? "live" : s === "warn" ? "warn" : s === "checking" ? "neutral" : "danger";

  return (
    <div className="k-stack">
      <div className="k-card">
        <div className="k-card-h">
          <h3>System health</h3>
          <span className="k-meta">{probeRows.filter(r => r.p.state === "ok").length} / {probeRows.length} ok</span>
          <div className="k-actions"><button className="k-btn k-btn-ghost" onClick={run}>↻ Re-probe</button></div>
        </div>
        <div>
          {probeRows.map(r => (
            <div key={r.id} className="k-probe">
              <span className="k-probe-dot" style={{ background: tone(r.p.state) }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="k-probe-label">
                  {r.label}
                  <StatusChip kind={chipKind(r.p.state)}>{stateLabel(r.p.state)}</StatusChip>
                </div>
                <div className="k-probe-hint">{r.hint}</div>
                {r.p.detail && <div className="k-probe-detail">{r.p.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="k-card">
        <div className="k-card-h"><h3>Fleet sanity</h3></div>
        <div className="k-card-body">
          <div style={{ fontSize:"0.82rem", lineHeight:1.7 }}>
            <div><span className="k-num" style={{ color:"var(--k-a)", fontWeight:700 }}>{fleet.agencies.length}</span> sub-agencies in this viewer's scope.</div>
            <div><span className="k-num" style={{ color:"var(--k-a)", fontWeight:700 }}>{fleet.metrics.producers}</span> producers in scope across them.</div>
          </div>
          <div style={{ marginTop:8, color:"var(--k-t3)", fontSize:"0.72rem", lineHeight:1.5 }}>
            If viewer_agency_ids() returns 1 and you expect more, the agency_members rows for the other sub-agencies are missing or inactive — check the Members tab.
          </div>
          <button className="k-btn" style={{ marginTop:10 }} onClick={reload}>Re-hydrate fleet</button>
        </div>
      </div>
    </div>
  );
}

// ─── Provision modal ────────────────────────────────────────────────────────
function ProvisionModal({ onClose, onProvisioned }) {
  const [name, setName]   = React.useState("");
  const [state, setState] = React.useState("");
  const [tier, setTier]   = React.useState("agency");
  const [plan, setPlan]   = React.useState("trial");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy]   = React.useState(false);
  const [err, setErr]     = React.useState("");

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.email) setEmail(data.session.user.email);
    });
  }, []);

  const provision = async () => {
    if (!name.trim()) { setErr("Agency name is required."); return; }
    if (!email.trim()) { setErr("Owner email is required."); return; }
    setBusy(true); setErr("");
    try {
      const sb = window.getSupabase();
      const { data, error } = await sb.rpc("provision_sub_agency", {
        name: name.trim(), slug: slugify(name), tier,
        owner_email: email.trim(), primary_state: state || null, plan,
      });
      if (error) throw error;
      const agencyId = (data && typeof data === "object") ? (data.agency_id || data.id) : data;
      window.toast && window.toast(`${name.trim()} provisioned`, "success");
      onProvisioned && onProvisioned(agencyId);
      onClose();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

  // Use the koino skin INSIDE the modal as well (Shared.Modal renders a
  // portaled div that doesn't inherit the .koino-skin wrapper).
  return (
    <Shared.Modal title="Provision new sub-agency" width={560} onClose={onClose}>
      <div className="koino-skin" style={{ background:"transparent", color:"inherit" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontFamily:"var(--k-mono)", fontSize:"0.65rem", color:"var(--k-t3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Agency name *</span>
            <input className="k-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas Insurance Group" autoFocus/>
          </label>
          <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontFamily:"var(--k-mono)", fontSize:"0.65rem", color:"var(--k-t3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Owner email *</span>
            <input className="k-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com"/>
            <span style={{ fontSize:"0.7rem", color:"var(--k-t3)" }}>Magic-link sign-in goes here.</span>
          </label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontFamily:"var(--k-mono)", fontSize:"0.65rem", color:"var(--k-t3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>State</span>
              <select className="k-select" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Pick…</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontFamily:"var(--k-mono)", fontSize:"0.65rem", color:"var(--k-t3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Tier</span>
              <select className="k-select" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="solo">Solo producer</option>
                <option value="agency">Agency</option>
                <option value="imo">IMO (nested)</option>
              </select>
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontFamily:"var(--k-mono)", fontSize:"0.65rem", color:"var(--k-t3)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Plan</span>
              <select className="k-select" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="scale">Scale</option>
              </select>
            </label>
          </div>
          <div style={{ padding:10, background:"var(--k-ad)", border:"1px solid rgba(0,212,170,0.25)", borderRadius:6, fontSize:"0.72rem", color:"var(--k-t2)", lineHeight:1.55 }}>
            Calls <span className="k-mono" style={{ color:"var(--k-a)" }}>provision_sub_agency</span> as the signed-in user. Creates the agency row, seeds default carriers + connector slots, and grants the owner email an agency_members row with role = <strong style={{ color:"var(--k-t)" }}>owner</strong>. Onboarding wizard fires on next sign-in.
          </div>
          {err && <div style={{ color:"var(--k-danger)", fontSize:"0.75rem", fontFamily:"var(--k-mono)" }}>{err}</div>}
        </div>
        <div style={{ marginTop:14, display:"flex", gap:8 }}>
          <button className="k-btn k-btn-primary" disabled={busy || !name.trim() || !email.trim()} onClick={provision}>
            {busy ? "Provisioning…" : "+ Provision"}
          </button>
          <button className="k-btn k-btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Shared.Modal>
  );
}

// ─── Page shell ─────────────────────────────────────────────────────────────
function PageImo({ subpage = "platform" }) {
  const [active, setActive] = React.useState(subpage);
  React.useEffect(() => { setActive(subpage); }, [subpage]);

  const me = (typeof window !== "undefined" && window.me && window.me()) || null;
  const isSuperAdmin = !!(me && me.role === "super_admin");
  const [includeDemo, setIncludeDemo] = React.useState(isSuperAdmin);
  React.useEffect(() => { setIncludeDemo(isSuperAdmin); }, [isSuperAdmin]);

  const [fleet, reload] = useFleet(includeDemo);
  const [provisionOpen, setProvisionOpen] = React.useState(false);

  const switchAgency = (a) => {
    try { localStorage.setItem("repflow.active_agency", a.id); } catch {}
    window.toast && window.toast(`Active agency → ${a.name}`, "info");
    if (window.hydrateFromSupabase) window.hydrateFromSupabase();
    if (a.onboarding_complete === false) {
      window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "today" } }));
    } else {
      window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "admin" } }));
    }
  };

  const ROLE_LABEL = isSuperAdmin ? "Super admin · all IMOs" : (me?.role === "imo_owner" ? "IMO owner" : "Platform admin");

  return (
    <div className="koino-skin page-pad" style={{ minHeight:"100%" }}>
      <div className="k-h">
        <div style={{ flex:1, minWidth:0 }}>
          <div className="k-h-title">{ROLE_LABEL}</div>
          <div className="k-h-sub">
            {fleet.agencies.length} sub-agencies · {fleet.metrics.producers} producers · {fmtMoney(fleet.metrics.premiumCents)} AP
            {includeDemo && <span style={{ marginLeft:8 }}><StatusChip kind="demo">demo included</StatusChip></span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="k-btn" onClick={reload}>↻ Refresh</button>
          <button className="k-btn k-btn-primary" onClick={() => setProvisionOpen(true)}>+ Provision sub-agency</button>
        </div>
      </div>

      <TabBar active={active} onChange={(t) => {
        setActive(t);
        window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: t } }));
      }}/>

      {active === "platform" && <OverviewTab fleet={fleet} reload={reload} isSuperAdmin={isSuperAdmin} includeDemo={includeDemo} setIncludeDemo={setIncludeDemo} onOpenProvision={() => setProvisionOpen(true)} onSwitchAgency={switchAgency}/>}
      {active === "agencies" && <AgenciesTab fleet={fleet} reload={reload} isSuperAdmin={isSuperAdmin} includeDemo={includeDemo} setIncludeDemo={setIncludeDemo} onOpenProvision={() => setProvisionOpen(true)} onSwitchAgency={switchAgency}/>}
      {active === "users"    && <MembersTab  fleet={fleet} reload={reload}/>}
      {active === "billing"  && <BillingTab  fleet={fleet}/>}
      {active === "audit"    && <AuditTab    fleet={fleet}/>}
      {active === "system"   && <SystemTab   fleet={fleet} reload={reload}/>}

      {provisionOpen && (
        <ProvisionModal onClose={() => setProvisionOpen(false)} onProvisioned={() => { reload(); }}/>
      )}
    </div>
  );
}

window.PageImo = PageImo;
window.PagePlatformAdmin = PageImo;

})();
