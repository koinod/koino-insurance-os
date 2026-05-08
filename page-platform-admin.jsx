/* page-platform-admin.jsx — Platform-admin dashboard (role='admin').
 *
 * Spans every agency in the system. Distinct from PageAdmin (which is
 * scoped to one agency for its owner).
 *
 * Pages exposed via Shared.NAV.admin:
 *   platform — overview: agency count, members, MRR, recent signups
 *   agencies — list every agency, drill into one to edit
 *   users    — cross-agency user search + role manage
 *   billing  — plan rollups (Stripe Connect status if configured)
 *   audit    — global audit feed (who did what across agencies)
 *   system   — Supabase health, recent errors, version info
 *
 * Each agency drill-in is an in-place inspector: tabs for Basics, Carriers,
 * Lead sources, Members, Integrations, Compliance, Comp model, Branding,
 * Billing, Danger zone. All mutations RLS-allowed because role='admin'.
 *
 * "Enter as owner" sets `window.adminImpersonate` + sessionStorage flag and
 * the rest of the app re-scopes data queries to that agency_id (a banner
 * across the top makes it visible).
 */

(function () {
  const { useState, useEffect, useMemo, useCallback } = React;

  // ── Helpers ─────────────────────────────────────────────────────────────
  async function listAgencies() {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agencies").select("*").order("created_at", { ascending: false });
    return data || [];
  }
  async function listMembers(agencyId) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_members").select("*").eq("agency_id", agencyId);
    return data || [];
  }
  async function listAllMembers() {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_members").select("*");
    return data || [];
  }
  async function listLeadSources(agencyId) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_lead_sources").select("*").eq("agency_id", agencyId);
    return data || [];
  }
  async function listCarrierAppts(agencyId) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_carrier_appointments").select("*").eq("agency_id", agencyId);
    return data || [];
  }
  async function listIntegrations(agencyId) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_integrations").select("*").eq("agency_id", agencyId);
    return data || [];
  }
  async function listAudit(limit = 100) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return [];
    const { data } = await sb.from("agency_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
    return data || [];
  }

  function fmtAgo(iso) {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "just now";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return `${Math.floor(ms / 86_400_000)}d`;
  }

  // ── Impersonation banner (mounted globally) ─────────────────────────────
  function startImpersonate(agency) {
    sessionStorage.setItem("repflow.impersonate", JSON.stringify({ agency_id: agency.id, name: agency.name, started_at: Date.now() }));
    window.adminImpersonate = agency.id;
    window.dispatchEvent(new CustomEvent("admin:impersonate", { detail: { agency_id: agency.id, name: agency.name } }));
    window.toast && window.toast(`Acting as owner in ${agency.name}`, "info");
  }
  function stopImpersonate() {
    sessionStorage.removeItem("repflow.impersonate");
    window.adminImpersonate = null;
    window.dispatchEvent(new CustomEvent("admin:impersonate", { detail: null }));
    window.toast && window.toast("Returned to admin view", "info");
  }
  // Restore on load
  try {
    const stash = sessionStorage.getItem("repflow.impersonate");
    if (stash) window.adminImpersonate = JSON.parse(stash).agency_id;
  } catch {}

  // ── Impersonation banner — mounted globally above the topbar when an admin
  // has clicked "Enter as owner" on an agency. Replaces the silent flag-flip
  // with a visible state so admins can't forget they're acting as someone else.
  function ImpersonationBanner() {
    const [agency, setAgency] = useState(() => {
      try { const s = sessionStorage.getItem("repflow.impersonate"); return s ? JSON.parse(s) : null; }
      catch { return null; }
    });
    useEffect(() => {
      const fn = (e) => setAgency(e.detail || null);
      window.addEventListener("admin:impersonate", fn);
      return () => window.removeEventListener("admin:impersonate", fn);
    }, []);
    if (!agency) return null;
    return (
      <div style={{
        position: "sticky", top: 0, zIndex: 80,
        background: "color-mix(in oklch, var(--state-warning) 22%, var(--bg-base))",
        borderBottom: "1px solid color-mix(in oklch, var(--state-warning) 50%, transparent)",
        color: "var(--state-warning)",
        padding: "8px 16px",
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 12, fontWeight: 500,
      }}>
        <Icons.Shield size={13}/>
        <span>Acting as owner in <strong>{agency.name}</strong></span>
        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· every mutation will be attributed to admin</span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11, color: "var(--state-warning)", borderColor: "color-mix(in oklch, var(--state-warning) 50%, transparent)" }}
          onClick={() => stopImpersonate()}
        >
          <Icons.X size={11}/> Stop impersonating
        </button>
      </div>
    );
  }
  window.ImpersonationBanner = ImpersonationBanner;

  // ── Page router ─────────────────────────────────────────────────────────
  // Super-admin (Ian, internal team) sees every IMO/agency. Plain admin (IMO
  // operator) sees only their own IMO and its child agencies. Demo users see
  // only their demo agency. The router detects role via window.me().
  function PagePlatformAdmin({ subpage }) {
    const me = window.me && window.me();
    const isSuper = me?.role === "super_admin";
    const sub = subpage || "platform";
    const props = { isSuper, me };
    if (sub === "platform") return <Overview {...props}/>;
    if (sub === "agencies") return <AgenciesList {...props}/>;
    if (sub === "users")    return <UsersList {...props}/>;
    if (sub === "billing")  return <BillingRollup {...props}/>;
    if (sub === "audit")    return <AuditFeed {...props}/>;
    if (sub === "system")   return <SystemHealth {...props}/>;
    return <Overview {...props}/>;
  }

  // ── Overview ────────────────────────────────────────────────────────────
  function Overview({ isSuper, me }) {
    const [agencies, setAgencies] = useState([]);
    const [members,  setMembers]  = useState([]);
    const [audit,    setAudit]    = useState([]);
    useEffect(() => { listAgencies().then(setAgencies); listAllMembers().then(setMembers); listAudit(20).then(setAudit); }, []);

    const imoCount      = agencies.filter(a => a.is_imo)?.length || 0;
    const demoCount     = agencies.filter(a => a.is_demo)?.length || 0;
    const realAgencies  = agencies.filter(a => !a.is_demo)?.length || 0;
    const totalAgencies = agencies.length;
    const totalMembers  = members.length;
    const ownerCount    = members.filter(m => m.role === "owner")?.length || 0;
    const trialCount    = agencies.filter(a => (a.plan || "").toLowerCase() === "trial")?.length || 0;
    const paidCount     = agencies.filter(a => (a.plan || "").toLowerCase() !== "trial")?.length || 0;
    const newThisWeek   = agencies.filter(a => Date.now() - new Date(a.created_at).getTime() < 7 * 86_400_000)?.length || 0;

    const meRow = me || (window.me && window.me());
    const role  = meRow?.role || "guest";
    const looksScopedToOne = meRow && !isSuper && totalAgencies <= 1;

    const headerTitle = isSuper ? "Internal platform · super-admin" : (role === "admin" ? "IMO platform admin" : "Platform overview");
    const headerSub   = isSuper
      ? "Internal team view · every IMO, every agency, every user, including demo. Full mutate."
      : role === "admin"
        ? "Your IMO + every child agency under it. Cannot see other IMOs."
        : "Cross-agency view limited to what RLS allows for your role.";

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">{headerTitle}</div>
            <div className="page-sub">{headerSub}</div>
          </div>
          {isSuper && <span className="chip" style={{ marginLeft: "auto", color: "var(--accent-money)", fontSize: 11 }}>SUPER ADMIN</span>}
          {!isSuper && role === "admin" && <span className="chip" style={{ marginLeft: "auto", fontSize: 11 }}>ADMIN</span>}
        </div>

        {looksScopedToOne && (
          <div style={{ marginBottom: 14, padding: 12, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 30%, transparent)", borderRadius: 8, color: "var(--accent-status)", fontSize: 12.5, lineHeight: 1.55 }}>
            <Icons.Shield size={12}/> <strong>You're viewing this as <span className="mono">{role}</span>, not a super-admin.</strong> RLS limits visibility to agencies you belong to. Sign in as a user with <span className="mono">role='super_admin'</span> to see the entire platform.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
          <Stat label="Agencies"      value={totalAgencies} sub={`${trialCount} trial · ${paidCount} paid`}/>
          <Stat label="Members"       value={totalMembers}  sub={`${ownerCount} owners`}/>
          <Stat label="New this week" value={newThisWeek}   sub="agencies created"/>
          <Stat label="Recent activity" value={audit.length} sub={audit[0] ? `last: ${fmtAgo(audit[0].created_at)} ago` : ""}/>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <div className="panel">
            <div className="panel-h"><Icons.Building size={13}/><h3>Recent agencies</h3>
              <button className="btn" style={{ marginLeft: "auto" }}
                onClick={() => window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "agencies" } }))}>
                View all
              </button>
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "1.4fr 80px 80px 100px 90px" }}>
                <div>Agency</div><div>Plan</div><div>Members</div><div>Created</div><div></div>
              </div>
              {agencies.slice(0, 8).map(a => {
                const memCount = members.filter(m => m.agency_id === a.id).length;
                return (
                  <div key={a.id} className="row" style={{ gridTemplateColumns: "1.4fr 80px 80px 100px 90px" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{a.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{a.slug}</div>
                    </div>
                    <div><span className="chip">{a.plan || "trial"}</span></div>
                    <div className="tabular" style={{ fontSize: 12 }}>{memCount}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAgo(a.created_at)} ago</div>
                    <div>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => window.dispatchEvent(new CustomEvent("admin:open-agency", { detail: a }))}>
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><Icons.Activity size={13}/><h3>Live audit feed</h3></div>
            <div className="list" style={{ maxHeight: 360, overflow: "auto" }}>
              {audit.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No activity yet.
                </div>
              )}
              {audit.map(e => (
                <div key={e.id} className="row" style={{ gridTemplateColumns: "1fr 70px", padding: "8px 12px" }}>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--text-tertiary)" }}>{e.actor_role || "—"}</span>
                    {" "}<strong>{e.action}</strong>{" "}
                    {e.target && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {e.target}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "right" }}>{fmtAgo(e.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Stat({ label, value, sub }) {
    return (
      <div className="panel" style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div className="tabular" style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
      </div>
    );
  }

  // ── Agencies ────────────────────────────────────────────────────────────
  function AgenciesList() {
    const [agencies, setAgencies] = useState([]);
    const [members, setMembers]   = useState([]);
    const [filter, setFilter]     = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [drillIn, setDrillIn]   = useState(null);

    const refresh = useCallback(async () => {
      setAgencies(await listAgencies());
      setMembers(await listAllMembers());
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
      const h = (e) => setDrillIn(e.detail || null);
      window.addEventListener("admin:open-agency", h);
      return () => window.removeEventListener("admin:open-agency", h);
    }, []);

    const filtered = useMemo(() => {
      const q = filter.trim().toLowerCase();
      if (!q) return agencies;
      return agencies.filter(a =>
        (a.name || "").toLowerCase().includes(q) ||
        (a.slug || "").toLowerCase().includes(q) ||
        (a.primary_state || "").toLowerCase().includes(q)
      );
    }, [agencies, filter]);

    if (drillIn) {
      return <AgencyDrillIn agency={drillIn} onClose={() => { setDrillIn(null); refresh(); }} onChange={refresh}/>;
    }

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">All agencies</div>
            <div className="page-sub">{filtered.length} of {agencies.length} · click any row to drill in</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <input className="text-input" placeholder="search name / slug / state…"
              value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 240 }}/>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Icons.Plus size={13}/> New agency
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 80px 80px 90px 100px 90px" }}>
              <div>Agency</div><div>State / contact</div><div>Plan</div><div>Members</div><div>Status</div><div>Created</div><div></div>
            </div>
            {filtered.map(a => {
              const memCount = members.filter(m => m.agency_id === a.id).length;
              const ownerEmail = a.owner_email || "—";
              return (
                <div key={a.id} className="row clickable"
                  style={{ gridTemplateColumns: "1.4fr 1fr 80px 80px 90px 100px 90px", cursor: "pointer" }}
                  onClick={() => setDrillIn(a)}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>/{a.slug}</div>
                  </div>
                  <div style={{ fontSize: 11.5 }}>
                    {a.primary_state || a.state || "—"}
                    {a.phone && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{a.phone}</div>}
                  </div>
                  <div><span className="chip">{a.plan || "trial"}</span></div>
                  <div className="tabular" style={{ fontSize: 12 }}>{memCount}</div>
                  <div>
                    <span className={`chip ${a.status === "active" ? "chip-money" : ""}`}>{a.status || "active"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAgo(a.created_at)} ago</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); setDrillIn(a); }}
                      title="Edit this agency's settings, members, carriers, and config">
                      <Icons.Settings size={11}/> Manage
                    </button>
                    <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); startImpersonate(a); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "today" } })); }}
                      title="Switch into this agency as if you were its owner — see their pipeline, queue, leads">
                      <Icons.ArrowUpRight size={11}/> Switch into
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                No agencies match. Click <strong>New agency</strong> to create one.
              </div>
            )}
          </div>
        </div>

        {createOpen && <CreateAgencyModal onClose={() => setCreateOpen(false)} onCreated={(a) => { setCreateOpen(false); refresh(); setDrillIn(a); }}/>}
      </div>
    );
  }

  // ── Drill-in editor ─────────────────────────────────────────────────────
  function AgencyDrillIn({ agency: initialAgency, onClose, onChange }) {
    const [agency, setAgency] = useState(initialAgency);
    const [tab, setTab] = useState("basics");
    const [saving, setSaving] = useState(false);

    const set = (patch) => setAgency(a => ({ ...a, ...patch }));

    const save = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      setSaving(true);
      try {
        const { error } = await sb.from("agencies").update({
          name: agency.name, slug: agency.slug, plan: agency.plan,
          ein: agency.ein, npn: agency.npn,
          primary_state: agency.primary_state, licensed_states: agency.licensed_states,
          address_line1: agency.address_line1, address_line2: agency.address_line2,
          city: agency.city, state: agency.state, zip: agency.zip,
          phone: agency.phone, website: agency.website,
          logo_url: agency.logo_url, brand_primary: agency.brand_primary, brand_dark: agency.brand_dark,
          timezone: agency.timezone, products: agency.products, default_carriers: agency.default_carriers,
          tpmo_disclosure: agency.tpmo_disclosure, call_recording_consent: agency.call_recording_consent,
          dnc_provider: agency.dnc_provider, dialer_caller_id: agency.dialer_caller_id, dialer_provider: agency.dialer_provider,
          comp_model: agency.comp_model, comp_default_split: agency.comp_default_split, comp_overrides: agency.comp_overrides,
          payouts_provider: agency.payouts_provider, payouts_account_id: agency.payouts_account_id,
          status: agency.status, notes: agency.notes,
        }).eq("id", agency.id);
        if (error) throw error;
        window.toast && window.toast(`${agency.name} saved`, "success");
        onChange && onChange();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message}`, "warn");
      } finally { setSaving(false); }
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <button className="btn btn-ghost" onClick={onClose}>← All agencies</button>
          <div style={{ marginLeft: 12 }}>
            <div className="page-title">{agency.name}</div>
            <div className="page-sub">/{agency.slug} · {agency.plan || "trial"} · created {fmtAgo(agency.created_at)} ago</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => startImpersonate(agency)}>
              <Icons.ArrowUpRight size={12}/> Enter as owner
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : <><Icons.Check size={12}/> Save changes</>}
            </button>
          </div>
        </div>

        <Shared.SectionPill
          items={[
            { k: "basics",       l: "Basics" },
            { k: "contact",      l: "Contact" },
            { k: "licensing",    l: "Licensing" },
            { k: "products",     l: "Products" },
            { k: "carriers",     l: "Carriers" },
            { k: "leadsources",  l: "Lead sources" },
            { k: "members",      l: "Members" },
            { k: "compensation", l: "Compensation" },
            { k: "compliance",   l: "Compliance" },
            { k: "branding",     l: "Branding" },
            { k: "integrations", l: "Integrations" },
            { k: "billing",      l: "Billing" },
            { k: "danger",       l: "Danger zone" },
          ]}
          value={tab}
          onChange={setTab}/>

        {tab === "basics"       && <TabBasics agency={agency} set={set}/>}
        {tab === "contact"      && <TabContact agency={agency} set={set}/>}
        {tab === "licensing"    && <TabLicensing agency={agency} set={set}/>}
        {tab === "products"     && <TabProducts agency={agency} set={set}/>}
        {tab === "carriers"     && <TabCarriers agency={agency}/>}
        {tab === "leadsources"  && <TabLeadSources agency={agency}/>}
        {tab === "members"      && <TabMembers agency={agency}/>}
        {tab === "compensation" && <TabCompensation agency={agency} set={set}/>}
        {tab === "compliance"   && <TabCompliance agency={agency} set={set}/>}
        {tab === "branding"     && <TabBranding agency={agency} set={set}/>}
        {tab === "integrations" && <TabIntegrations agency={agency}/>}
        {tab === "billing"      && <TabBilling agency={agency} set={set}/>}
        {tab === "danger"       && <TabDanger agency={agency} onDeleted={() => onClose()}/>}
      </div>
    );
  }

  // ── Tabs (each is a focused panel) ──────────────────────────────────────
  function TabBasics({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Building size={13}/><h3>Identity</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Agency name"><input className="text-input" value={agency.name || ""} onChange={(e) => set({ name: e.target.value })}/></Shared.Field>
          <Shared.Field label="Slug (URL)"><input className="text-input" value={agency.slug || ""} onChange={(e) => set({ slug: e.target.value })}/></Shared.Field>
          <Shared.Field label="EIN"><input className="text-input" value={agency.ein || ""} onChange={(e) => set({ ein: e.target.value })}/></Shared.Field>
          <Shared.Field label="Agency NPN"><input className="text-input" value={agency.npn || ""} onChange={(e) => set({ npn: e.target.value })}/></Shared.Field>
          <Shared.Field label="Plan"><Shared.Select value={agency.plan || "trial"} onChange={(v) => set({ plan: v })} options={[
            { v: "trial", l: "Trial" }, { v: "starter", l: "Starter ($99/mo)" }, { v: "growth", l: "Growth ($299/mo)" }, { v: "scale", l: "Scale ($799/mo)" },
          ]}/></Shared.Field>
          <Shared.Field label="Status"><Shared.Select value={agency.status || "active"} onChange={(v) => set({ status: v })} options={[
            { v: "active", l: "Active" }, { v: "paused", l: "Paused" }, { v: "trial-expired", l: "Trial expired" }, { v: "terminated", l: "Terminated" },
          ]}/></Shared.Field>
          <Shared.Field label="Trial ends"><input className="text-input" type="date" value={(agency.trial_ends_at || "").slice(0, 10)} onChange={(e) => set({ trial_ends_at: e.target.value })}/></Shared.Field>
          <Shared.Field label="Timezone"><input className="text-input" value={agency.timezone || ""} onChange={(e) => set({ timezone: e.target.value })}/></Shared.Field>
        </div>
      </div>
    );
  }

  function TabContact({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Phone size={13}/><h3>Contact</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Shared.Field label="Phone"><input className="text-input" value={agency.phone || ""} onChange={(e) => set({ phone: e.target.value })}/></Shared.Field>
          <Shared.Field label="Website"><input className="text-input" value={agency.website || ""} onChange={(e) => set({ website: e.target.value })}/></Shared.Field>
          <Shared.Field label="Owner email"><input className="text-input" value={agency.owner_email || ""} disabled/></Shared.Field>
          <Shared.Field label="Address line 1"><input className="text-input" value={agency.address_line1 || ""} onChange={(e) => set({ address_line1: e.target.value })}/></Shared.Field>
          <Shared.Field label="Address line 2"><input className="text-input" value={agency.address_line2 || ""} onChange={(e) => set({ address_line2: e.target.value })}/></Shared.Field>
          <Shared.Field label="City"><input className="text-input" value={agency.city || ""} onChange={(e) => set({ city: e.target.value })}/></Shared.Field>
          <Shared.Field label="State"><input className="text-input" value={agency.state || ""} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2}/></Shared.Field>
          <Shared.Field label="ZIP"><input className="text-input" value={agency.zip || ""} onChange={(e) => set({ zip: e.target.value })}/></Shared.Field>
        </div>
      </div>
    );
  }

  function TabLicensing({ agency, set }) {
    const states = (agency.licensed_states || []);
    const ALL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
    const toggle = (s) => set({ licensed_states: states.includes(s) ? states.filter(x => x !== s) : [...states, s] });
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Shield size={13}/><h3>Licensing</h3>
          <span className="meta" style={{ marginLeft: "auto" }}>{states.length} state{states.length === 1 ? "" : "s"}</span>
        </div>
        <div style={{ padding: 14 }}>
          <Shared.Field label="Primary state">
            <input className="text-input" value={agency.primary_state || ""} onChange={(e) => set({ primary_state: e.target.value.toUpperCase() })} maxLength={2} style={{ width: 80 }}/>
          </Shared.Field>
          <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-tertiary)" }}>Licensed states</div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ALL_STATES.map(s => (
              <button key={s} onClick={() => toggle(s)} className="btn"
                style={{ padding: "4px 8px", fontSize: 10.5, background: states.includes(s) ? "var(--accent-money)" : "var(--bg-raised)", color: states.includes(s) ? "white" : "var(--text-secondary)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function TabProducts({ agency, set }) {
    const PRODUCTS = [
      { v: "medsupp", l: "Medicare Supplement" },
      { v: "mapd",    l: "Medicare Advantage" },
      { v: "pdp",     l: "Part D Rx" },
      { v: "fe",      l: "Final Expense" },
      { v: "term",    l: "Term Life" },
      { v: "wl",      l: "Whole Life" },
      { v: "iul",     l: "IUL" },
      { v: "annuity", l: "Annuity / MYGA" },
      { v: "ltc",     l: "LTC / Hybrid" },
      { v: "aca",     l: "ACA / Marketplace" },
      { v: "dental",  l: "Dental / Vision / Hearing" },
      { v: "cancer",  l: "Cancer / Heart-stroke" },
    ];
    const enabled = agency.products || [];
    const toggle = (p) => set({ products: enabled.includes(p) ? enabled.filter(x => x !== p) : [...enabled, p] });
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13}/><h3>Product lines</h3>
          <span className="meta" style={{ marginLeft: "auto" }}>{enabled.length} of {PRODUCTS.length}</span>
        </div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {PRODUCTS.map(p => {
            const on = enabled.includes(p.v);
            return (
              <label key={p.v} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                background: on ? "color-mix(in oklch, var(--accent-money) 10%, var(--bg-raised))" : "var(--bg-raised)",
                border: on ? "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" : "1px solid var(--border-subtle)",
                borderRadius: 6, cursor: "pointer", fontSize: 12.5,
              }}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.v)}/>
                {p.l}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function TabCarriers({ agency }) {
    const [appts, setAppts] = useState([]);
    const [adding, setAdding] = useState(false);
    const refresh = () => listCarrierAppts(agency.id).then(setAppts);
    useEffect(() => { refresh(); }, [agency.id]);

    const add = async (cid, name) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      await sb.from("agency_carrier_appointments").insert({ agency_id: agency.id, carrier_id: cid, carrier_name: name });
      refresh();
    };
    const remove = async (id) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      await sb.from("agency_carrier_appointments").delete().eq("id", id);
      refresh();
    };

    const supported = window.SUPPORTED_CARRIERS_LIST || [
      { id: "uhc", name: "UnitedHealthcare AARP" }, { id: "humana", name: "Humana" },
      { id: "aetna", name: "Aetna SRC" }, { id: "cigna", name: "Cigna (ARLIC)" },
      { id: "moo", name: "Mutual of Omaha" }, { id: "lumico", name: "Lumico" },
      { id: "aig", name: "Corebridge (AIG)" }, { id: "fg", name: "F&G" },
      { id: "transamerica", name: "Transamerica" }, { id: "ethos", name: "Ethos" },
      { id: "americanamicable", name: "American Amicable" }, { id: "instabrain", name: "Instabrain" },
      { id: "foresters", name: "Foresters" }, { id: "sbli", name: "SBLI" },
    ];
    const available = supported.filter(c => !appts.find(a => a.carrier_id === c.id));

    return (
      <div className="panel">
        <div className="panel-h"><Icons.Bolt size={13}/><h3>Carrier appointments</h3>
          <span className="meta" style={{ marginLeft: "auto" }}>{appts.length} appointed</span>
          <button className="btn" onClick={() => setAdding(!adding)}><Icons.Plus size={11}/> Add</button>
        </div>
        {adding && (
          <div style={{ padding: 10, borderBottom: "1px solid var(--border-subtle)", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {available.map(c => (
              <button key={c.id} className="btn" onClick={() => { add(c.id, c.name); setAdding(false); }}>{c.name}</button>
            ))}
            {available.length === 0 && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>All known carriers already appointed.</span>}
          </div>
        )}
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 90px 1fr 100px" }}>
            <div>Carrier</div><div>NPN</div><div>States</div><div></div>
          </div>
          {appts.map(a => (
            <div key={a.id} className="row" style={{ gridTemplateColumns: "1fr 90px 1fr 100px" }}>
              <div>{a.carrier_name || a.carrier_id}</div>
              <div style={{ fontSize: 11 }}>{a.npn || "—"}</div>
              <div style={{ fontSize: 11 }}>{(a.appointed_states || []).join(", ") || "—"}</div>
              <div><button className="btn btn-ghost" onClick={() => remove(a.id)} style={{ color: "var(--state-danger)" }}>Remove</button></div>
            </div>
          ))}
          {appts.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No carriers appointed yet.</div>}
        </div>
      </div>
    );
  }

  function TabLeadSources({ agency }) {
    const [sources, setSources] = useState([]);
    const [draft, setDraft] = useState({ name: "", vendor: "", cost_per_lead_cents: 0, product: "" });
    const refresh = () => listLeadSources(agency.id).then(setSources);
    useEffect(() => { refresh(); }, [agency.id]);

    const add = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !draft.name) return;
      await sb.from("agency_lead_sources").insert({ ...draft, agency_id: agency.id });
      setDraft({ name: "", vendor: "", cost_per_lead_cents: 0, product: "" });
      refresh();
    };
    const remove = async (id) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      await sb.from("agency_lead_sources").delete().eq("id", id);
      refresh();
    };

    return (
      <div className="panel">
        <div className="panel-h"><Icons.ArrowUpRight size={13}/><h3>Lead sources / vendors</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 80px", gap: 8, alignItems: "end" }}>
          <Shared.Field label="Name"><input className="text-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Mass mail · TX T65"/></Shared.Field>
          <Shared.Field label="Vendor"><input className="text-input" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} placeholder="HotProspector"/></Shared.Field>
          <Shared.Field label="Product"><input className="text-input" value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })} placeholder="medsupp"/></Shared.Field>
          <Shared.Field label="$/lead"><input className="text-input" type="number" step="0.01" value={(draft.cost_per_lead_cents || 0) / 100} onChange={(e) => setDraft({ ...draft, cost_per_lead_cents: Math.round(+e.target.value * 100) })}/></Shared.Field>
          <button className="btn btn-primary" onClick={add}>Add</button>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.5fr 1fr 80px 80px 80px" }}>
            <div>Name</div><div>Vendor</div><div>Product</div><div>$/lead</div><div></div>
          </div>
          {sources.map(s => (
            <div key={s.id} className="row" style={{ gridTemplateColumns: "1.5fr 1fr 80px 80px 80px" }}>
              <div>{s.name}</div>
              <div style={{ fontSize: 11.5 }}>{s.vendor || "—"}</div>
              <div><span className="chip">{s.product || "—"}</span></div>
              <div className="tabular">${((s.cost_per_lead_cents || 0) / 100).toFixed(2)}</div>
              <div><button className="btn btn-ghost" onClick={() => remove(s.id)} style={{ color: "var(--state-danger)" }}>Remove</button></div>
            </div>
          ))}
          {sources.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No lead sources configured.</div>}
        </div>
      </div>
    );
  }

  function TabMembers({ agency }) {
    const [members, setMembers] = useState([]);
    const refresh = () => listMembers(agency.id).then(setMembers);
    useEffect(() => { refresh(); }, [agency.id]);

    const setRole = async (member, role) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      await sb.from("agency_members").update({ role }).eq("agency_id", agency.id).eq("user_id", member.user_id);
      refresh();
    };
    const setActive = async (member, active) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      await sb.from("agency_members").update({ active }).eq("agency_id", agency.id).eq("user_id", member.user_id);
      refresh();
    };

    return (
      <div className="panel">
        <div className="panel-h"><Icons.Users size={13}/><h3>Members</h3>
          <span className="meta" style={{ marginLeft: "auto" }}>{members.length} total</span>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1fr 110px 100px 100px 80px" }}>
            <div>Member</div><div>Role</div><div>Joined</div><div>Active</div><div></div>
          </div>
          {members.map(m => (
            <div key={m.user_id} className="row" style={{ gridTemplateColumns: "1fr 110px 100px 100px 80px" }}>
              <div>
                <div style={{ fontSize: 12.5 }}>{m.rep_id || m.user_id?.slice(0, 8)}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{m.user_id?.slice(0, 8)}</div>
              </div>
              <div>
                <Shared.Select value={m.role} onChange={(v) => setRole(m, v)} options={[
                  { v: "rep", l: "Rep" }, { v: "manager", l: "Manager" }, { v: "owner", l: "Owner" }, { v: "admin", l: "Admin" },
                ]}/>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAgo(m.joined_at)} ago</div>
              <div>
                <button className="btn btn-ghost" onClick={() => setActive(m, !m.active)}
                  style={{ color: m.active ? "var(--accent-money)" : "var(--text-tertiary)" }}>
                  {m.active ? "Active" : "Inactive"}
                </button>
              </div>
              <div></div>
            </div>
          ))}
          {members.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No members in this agency yet.</div>}
        </div>
      </div>
    );
  }

  function TabCompensation({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Compensation</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Shared.Field label="Comp model">
            <Shared.Select value={agency.comp_model || "split"} onChange={(v) => set({ comp_model: v })} options={[
              { v: "split", l: "% Split" }, { v: "salary", l: "Salary" }, { v: "hybrid", l: "Salary + bonus" },
            ]}/>
          </Shared.Field>
          <Shared.Field label="Default split %">
            <input className="text-input" type="number" min="0" max="100" step="0.5"
              value={agency.comp_default_split || 70} onChange={(e) => set({ comp_default_split: +e.target.value })}/>
          </Shared.Field>
          <Shared.Field label="Payouts provider">
            <Shared.Select value={agency.payouts_provider || "stripe"} onChange={(v) => set({ payouts_provider: v })} options={[
              { v: "stripe", l: "Stripe Connect" }, { v: "ach", l: "Direct ACH" }, { v: "manual", l: "Manual / spreadsheet" },
            ]}/>
          </Shared.Field>
        </div>
        <div style={{ padding: 14, fontSize: 11, color: "var(--text-tertiary)" }}>
          Per-product overrides + tier ladders are configured in the Owner-side P&L → Comp tab once an owner is appointed.
        </div>
      </div>
    );
  }

  function TabCompliance({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Shield size={13}/><h3>Compliance</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Call recording consent">
            <Shared.Select value={agency.call_recording_consent || "one-party"} onChange={(v) => set({ call_recording_consent: v })} options={[
              { v: "one-party", l: "One-party (rep consent)" }, { v: "two-party", l: "Two-party (both consent)" },
            ]}/>
          </Shared.Field>
          <Shared.Field label="DNC provider">
            <input className="text-input" value={agency.dnc_provider || ""} onChange={(e) => set({ dnc_provider: e.target.value })} placeholder="e.g. Contact Center Compliance"/>
          </Shared.Field>
          <Shared.Field label="TPMO disclosure" style={{ gridColumn: "1 / -1" }}>
            <textarea className="text-input" rows={3} value={agency.tpmo_disclosure || ""} onChange={(e) => set({ tpmo_disclosure: e.target.value })}
              placeholder="We do not offer every plan available in your area..."/>
          </Shared.Field>
        </div>
      </div>
    );
  }

  function TabBranding({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Sparkles size={13}/><h3>Branding</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Shared.Field label="Logo URL"><input className="text-input" value={agency.logo_url || ""} onChange={(e) => set({ logo_url: e.target.value })}/></Shared.Field>
          <Shared.Field label="Primary brand color"><input className="text-input" type="color" value={agency.brand_primary || "#22c55e"} onChange={(e) => set({ brand_primary: e.target.value })}/></Shared.Field>
          <Shared.Field label="Dark accent"><input className="text-input" type="color" value={agency.brand_dark || "#0f1115"} onChange={(e) => set({ brand_dark: e.target.value })}/></Shared.Field>
        </div>
      </div>
    );
  }

  // Real per-agency integration credential entry. Each kind declares its
  // fields + an optional test endpoint that probes connectivity. Stored on
  // agency_integrations.config (jsonb) — RLS gates by agency_id so other
  // tenants can't read.
  function TabIntegrations({ agency }) {
    const [ints, setInts] = useState([]);
    const [open, setOpen] = useState(null);  // kind currently being edited
    const refresh = () => listIntegrations(agency.id).then(setInts);
    useEffect(() => { refresh(); }, [agency.id]);

    const KINDS = [
      {
        kind: "twilio", label: "Twilio (dialer + SMS)",
        fields: [
          { name: "account_sid",  label: "Account SID",  type: "text" },
          { name: "auth_token",   label: "Auth token",   type: "password" },
          { name: "caller_id",    label: "Caller-ID phone (E.164, e.g. +15125550100)", type: "text" },
          { name: "messaging_service_sid", label: "Messaging service SID (optional)",   type: "text" },
        ],
        docs: "https://console.twilio.com — Account → API keys",
      },
      {
        kind: "fathom", label: "Fathom (call AI summaries)",
        fields: [{ name: "api_key", label: "Fathom API key", type: "password" }],
        testEndpoint: "/api/connector/fathom-test",
        docs: "https://fathom.video/settings/api",
      },
      {
        kind: "stripe", label: "Stripe Connect (payouts)",
        fields: [
          { name: "account_id",      label: "Stripe Connect account ID (acct_…)", type: "text" },
          { name: "publishable_key", label: "Publishable key (pk_…)",            type: "text" },
        ],
        docs: "https://dashboard.stripe.com/connect/accounts",
      },
      {
        kind: "nipr", label: "NIPR PDB (license verify)",
        fields: [
          { name: "user_id",  label: "NIPR PDB User ID",  type: "text" },
          { name: "password", label: "NIPR PDB Password", type: "password" },
        ],
        docs: "https://nipr.com/products/pdb · contracted users only",
      },
      {
        kind: "google_cal", label: "Google Calendar",
        oauth: true,
        docs: "OAuth flow lands on console.cloud.google.com → enable Calendar API",
      },
      {
        kind: "gmail", label: "Gmail send",
        oauth: true,
        docs: "Same OAuth as Google Cal — separate scope",
      },
      {
        kind: "salesforce", label: "Salesforce CRM (lead push)",
        fields: [
          { name: "instance_url", label: "Instance URL (https://*.my.salesforce.com)", type: "text" },
          { name: "client_id",    label: "Connected App Client ID",                    type: "text" },
          { name: "client_secret",label: "Connected App Secret",                       type: "password" },
        ],
        docs: "Setup → App Manager → New Connected App",
      },
      {
        kind: "zapier", label: "Zapier inbound webhooks",
        fields: [
          { name: "webhook_url", label: "Catch Hook URL",  type: "text" },
          { name: "secret",      label: "Shared secret",    type: "password" },
        ],
        docs: "Zapier → Webhooks by Zapier → Catch Hook",
      },
      {
        kind: "brevo", label: "Brevo (email · magic links + invites)",
        fields: [
          { name: "api_key",      label: "Brevo API key",    type: "password" },
          { name: "sender_email", label: "Sender (auth@…)",  type: "text" },
        ],
        docs: "https://app.brevo.com/settings/keys/api",
      },
      {
        kind: "resend", label: "Resend (email · alternative)",
        fields: [
          { name: "api_key",      label: "Resend API key",   type: "password" },
          { name: "sender_email", label: "Sender (e.g. auth@yourdomain.com)", type: "text" },
        ],
        docs: "https://resend.com/api-keys",
      },
    ];

    const save = async (kind, config, status = "connected") => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const existing = ints.find(i => i.kind === kind);
      if (existing) {
        await sb.from("agency_integrations").update({ config, status }).eq("id", existing.id);
      } else {
        await sb.from("agency_integrations").insert({ agency_id: agency.id, kind, config, status });
      }
      window.toast && window.toast(`${kind} saved`, "success");
      refresh();
    };
    const reset = async (kind) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const existing = ints.find(i => i.kind === kind);
      if (existing) await sb.from("agency_integrations").update({ config: {}, status: "unconfigured" }).eq("id", existing.id);
      refresh();
    };

    return (
      <div className="panel">
        <div className="panel-h"><Icons.Plug size={13}/><h3>Integrations</h3>
          <span className="meta" style={{ marginLeft: "auto" }}>per-agency · stored encrypted via RLS</span>
        </div>
        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
          {KINDS.map(k => {
            const i = ints.find(x => x.kind === k.kind);
            const status = i?.status || "unconfigured";
            const color = status === "connected" ? "var(--accent-money)" : status === "error" ? "var(--state-danger)" : "var(--text-tertiary)";
            const isOpen = open === k.kind;
            return (
              <div key={k.kind} style={{ padding: 12, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{k.label}</div>
                    <div style={{ fontSize: 10.5, color, marginTop: 2 }}>● {status}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setOpen(isOpen ? null : k.kind)} style={{ fontSize: 11, padding: "4px 10px" }}>
                    {isOpen ? "Close" : (i ? "Edit" : "Connect")}
                  </button>
                </div>
                {isOpen && (
                  <IntegrationEditor kind={k} existing={i} onSave={save} onReset={reset}/>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function IntegrationEditor({ kind, existing, onSave, onReset }) {
    const [cfg, setCfg]       = useState(existing?.config || {});
    const [testing, setTest]  = useState(null);  // null | "ok" | "fail" | "running"
    const [testMsg, setMsg]   = useState("");

    const set = (name, v) => setCfg(c => ({ ...c, [name]: v }));

    if (kind.oauth) {
      return (
        <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--accent-status) 10%, transparent)", borderRadius: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          <Icons.Shield size={11}/> OAuth flow not yet wired client-side. For now, mark connected manually after completing the connect via Vercel env vars + a one-time browser redirect. Docs: <code style={{ fontSize: 10.5 }}>{kind.docs}</code>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn" onClick={() => onSave(kind.kind, {}, "connected")} style={{ fontSize: 11 }}>Mark connected</button>
            <button className="btn btn-ghost" onClick={() => onReset(kind.kind)} style={{ fontSize: 11 }}>Reset</button>
          </div>
        </div>
      );
    }

    const test = async () => {
      if (!kind.testEndpoint) { window.toast && window.toast("No test endpoint for this connector", "info"); return; }
      setTest("running"); setMsg("");
      try {
        const r = await fetch(kind.testEndpoint, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(cfg),
        });
        const j = await r.json();
        if (r.ok && j.ok) {
          setTest("ok"); setMsg("connected");
        } else {
          setTest("fail"); setMsg(j.detail || j.error || `${r.status}`);
        }
      } catch (e) {
        setTest("fail"); setMsg(String(e?.message || e));
      }
    };

    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {(kind.fields || []).map(f => (
          <Shared.Field key={f.name} label={f.label}>
            <input className="text-input" type={f.type || "text"} value={cfg[f.name] || ""}
              onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder || ""}/>
          </Shared.Field>
        ))}
        {kind.docs && (
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
            <Icons.ArrowUpRight size={10}/> {kind.docs}
          </div>
        )}
        {testMsg && (
          <div style={{ fontSize: 11, padding: 6, borderRadius: 4, background: testing === "ok" ? "color-mix(in oklch, var(--accent-money) 15%, transparent)" : "color-mix(in oklch, var(--state-danger) 15%, transparent)", color: testing === "ok" ? "var(--accent-money)" : "var(--state-danger)" }}>
            {testMsg}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary" onClick={() => onSave(kind.kind, cfg, "connected")} style={{ fontSize: 11 }}>
            <Icons.Check size={11}/> Save
          </button>
          {kind.testEndpoint && (
            <button className="btn" onClick={test} disabled={testing === "running"} style={{ fontSize: 11 }}>
              {testing === "running" ? "testing…" : "Test connection"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => onReset(kind.kind)} style={{ marginLeft: "auto", fontSize: 11, color: "var(--state-danger)" }}>
            Reset
          </button>
        </div>
      </div>
    );
  }

  function TabBilling({ agency, set }) {
    return (
      <div className="panel">
        <div className="panel-h"><Icons.Wallet size={13}/><h3>Billing</h3></div>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Shared.Field label="Stripe Customer ID"><input className="text-input" value={agency.payouts_account_id || ""} onChange={(e) => set({ payouts_account_id: e.target.value })}/></Shared.Field>
          <Shared.Field label="Plan"><Shared.Select value={agency.plan || "trial"} onChange={(v) => set({ plan: v })} options={[
            { v: "trial", l: "Trial" }, { v: "starter", l: "Starter ($99/mo)" }, { v: "growth", l: "Growth ($299/mo)" }, { v: "scale", l: "Scale ($799/mo)" },
          ]}/></Shared.Field>
          <Shared.Field label="Notes" style={{ gridColumn: "1 / -1" }}>
            <textarea className="text-input" rows={3} value={agency.notes || ""} onChange={(e) => set({ notes: e.target.value })}/>
          </Shared.Field>
        </div>
      </div>
    );
  }

  function TabDanger({ agency, onDeleted }) {
    const [confirmText, setConfirmText] = useState("");
    const remove = async () => {
      if (confirmText !== agency.slug) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const { error } = await sb.from("agencies").delete().eq("id", agency.id);
      if (error) {
        window.toast && window.toast(`Delete failed: ${error.message}`, "warn");
      } else {
        window.toast && window.toast(`Agency ${agency.name} deleted`, "info");
        onDeleted();
      }
    };
    return (
      <div className="panel" style={{ borderColor: "color-mix(in oklch, var(--state-danger) 30%, transparent)" }}>
        <div className="panel-h"><Icons.Bell size={13} style={{ color: "var(--state-danger)" }}/><h3 style={{ color: "var(--state-danger)" }}>Danger zone</h3></div>
        <div style={{ padding: 14, fontSize: 12, lineHeight: 1.55 }}>
          Deleting <strong>{agency.name}</strong> cascades to every member, lead, and policy. To confirm, type the slug <code>{agency.slug}</code>:
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input className="text-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={agency.slug} style={{ flex: 1 }}/>
            <button className="btn btn-primary" onClick={remove} disabled={confirmText !== agency.slug}
              style={{ background: "var(--state-danger)", color: "white" }}>
              Delete forever
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Create agency modal ─────────────────────────────────────────────────
  function CreateAgencyModal({ onClose, onCreated }) {
    const [draft, setDraft] = useState({ name: "", slug: "", primary_state: "TX", plan: "trial", phone: "", website: "", owner_email: "" });
    const [saving, setSaving] = useState(false);

    const create = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !draft.name || !draft.slug) return;
      setSaving(true);
      try {
        const { data, error } = await sb.from("agencies").insert({
          name: draft.name, slug: draft.slug, plan: draft.plan,
          primary_state: draft.primary_state, phone: draft.phone, website: draft.website,
          status: "active", trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          onboarding_step: 0, onboarding_complete: false,
        }).select().single();
        if (error) throw error;
        if (draft.owner_email) {
          // Generate invite token
          const token = (crypto.randomUUID && crypto.randomUUID()) || `inv-${Date.now()}`;
          await sb.from("agency_invites").insert({
            token, agency_id: data.id, role: "owner", email_hint: draft.owner_email,
            expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          });
        }
        window.toast && window.toast(`Created ${data.name}`, "success");
        onCreated && onCreated(data);
      } catch (e) {
        window.toast && window.toast(`Create failed: ${e.message}`, "warn");
      } finally { setSaving(false); }
    };

    return (
      <div className="modal-shell" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-h"><h3>New agency</h3><button className="btn btn-ghost" onClick={onClose}>×</button></div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Shared.Field label="Agency name"><input className="text-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} placeholder="Atlas Insurance Group"/></Shared.Field>
            <Shared.Field label="Slug"><input className="text-input" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="atlas"/></Shared.Field>
            <Shared.Field label="Owner email (will receive invite)"><input className="text-input" type="email" value={draft.owner_email} onChange={(e) => setDraft({ ...draft, owner_email: e.target.value })} placeholder="founder@atlas.com"/></Shared.Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Shared.Field label="Primary state"><input className="text-input" value={draft.primary_state} onChange={(e) => setDraft({ ...draft, primary_state: e.target.value.toUpperCase() })} maxLength={2}/></Shared.Field>
              <Shared.Field label="Plan"><Shared.Select value={draft.plan} onChange={(v) => setDraft({ ...draft, plan: v })} options={[
                { v: "trial", l: "Trial (14 days)" }, { v: "starter", l: "Starter" }, { v: "growth", l: "Growth" }, { v: "scale", l: "Scale" },
              ]}/></Shared.Field>
            </div>
            <button className="btn btn-primary" onClick={create} disabled={saving || !draft.name || !draft.slug}
              style={{ marginTop: 6, padding: "10px 14px", fontSize: 13 }}>
              {saving ? "Creating…" : <><Icons.Plus size={12}/> Create agency</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Users (cross-agency) ────────────────────────────────────────────────
  function UsersList() {
    const [members, setMembers] = useState([]);
    const [agencies, setAgencies] = useState([]);
    const [filter, setFilter] = useState("");
    useEffect(() => { listAllMembers().then(setMembers); listAgencies().then(setAgencies); }, []);

    const enriched = members.map(m => ({ ...m, agency: agencies.find(a => a.id === m.agency_id) }));
    const q = filter.trim().toLowerCase();
    const filtered = q ? enriched.filter(m =>
      (m.rep_id || "").toLowerCase().includes(q) ||
      (m.user_id || "").toLowerCase().includes(q) ||
      (m.agency?.name || "").toLowerCase().includes(q)
    ) : enriched;

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">All users</div>
            <div className="page-sub">{filtered.length} of {members.length} memberships across {agencies.length} agencies</div>
          </div>
          <input className="text-input" placeholder="search rep / user / agency…"
            value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: "auto", width: 280 }}/>
        </div>
        <div className="panel">
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1fr 1fr 110px 110px 100px" }}>
              <div>User</div><div>Agency</div><div>Role</div><div>Joined</div><div>Active</div>
            </div>
            {filtered.map(m => (
              <div key={`${m.agency_id}-${m.user_id}`} className="row" style={{ gridTemplateColumns: "1fr 1fr 110px 110px 100px" }}>
                <div>
                  <div style={{ fontSize: 12.5 }}>{m.rep_id || m.user_id?.slice(0, 8)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{m.user_id?.slice(0, 8)}</div>
                </div>
                <div>{m.agency?.name || "—"}</div>
                <div><span className="chip">{m.role}</span></div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAgo(m.joined_at)} ago</div>
                <div><span className={`chip ${m.active ? "chip-money" : ""}`}>{m.active ? "active" : "inactive"}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function BillingRollup() {
    return (
      <div className="page-pad">
        <div className="page-h"><div><div className="page-title">Billing rollup</div><div className="page-sub">Stripe Connect status, MRR, payouts. Wire up once Stripe is connected.</div></div></div>
        <div className="panel" style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)" }}>Stripe integration not wired yet. Use the Integrations tab on each agency to connect.</div>
      </div>
    );
  }

  function AuditFeed() {
    const [audit, setAudit] = useState([]);
    useEffect(() => { listAudit(200).then(setAudit); }, []);
    return (
      <div className="page-pad">
        <div className="page-h"><div><div className="page-title">Global audit log</div><div className="page-sub">Every mutation across every agency · {audit.length} entries</div></div></div>
        <div className="panel">
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "120px 1fr 1fr 100px" }}>
              <div>When</div><div>Action</div><div>Target</div><div>Actor</div>
            </div>
            {audit.map(e => (
              <div key={e.id} className="row" style={{ gridTemplateColumns: "120px 1fr 1fr 100px" }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAgo(e.created_at)} ago</div>
                <div style={{ fontSize: 12 }}><strong>{e.action}</strong></div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.target || "—"}</div>
                <div style={{ fontSize: 11 }}>{e.actor_role || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function SystemHealth() {
    const sb = window.getSupabase && window.getSupabase();
    const [env, setEnv] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      fetch("/api/system/env-status")
        .then(r => r.json())
        .then(j => { setEnv(j.env || []); })
        .finally(() => setLoading(false));
    }, []);

    const byCat = env.reduce((m, e) => { (m[e.category] = m[e.category] || []).push(e); return m; }, {});
    const setCount = env.filter(e => e.set).length;
    const totalCount = env.length;

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">System health</div>
            <div className="page-sub">Supabase project · auth · storage · platform env vars</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)" }}>
            <strong style={{ color: setCount === totalCount ? "var(--accent-money)" : "var(--state-warning)" }}>{setCount}</strong> / {totalCount} env vars set
          </div>
        </div>

        <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>Supabase URL: <code>{sb?.supabaseUrl || "(no client)"}</code></div>
          <div style={{ fontSize: 12 }}>Data mode: <code>{window.AppData?.LIVE ? "LIVE (signed in)" : "demo"}</code></div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Active agency: <code>{window.__activeAgency?.name || "(none)"}</code> {window.__activeAgency?.is_demo && <span className="chip" style={{ marginLeft: 6 }}>DEMO</span>}</div>
        </div>

        {/* Platform env vars — these are set on Vercel, applied across every
            tenant. Per-agency creds live on the Integrations tab inside each
            agency's drill-in. */}
        <div className="panel">
          <div className="panel-h"><Icons.Bolt size={13}/><h3>Platform env vars</h3>
            <span className="meta" style={{ marginLeft: "auto" }}>set in Vercel project settings · presence-only check (values never exposed)</span>
          </div>
          {loading && <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>checking…</div>}
          {!loading && Object.entries(byCat).map(([cat, items]) => (
            <div key={cat}>
              <div style={{ padding: "10px 14px 6px", fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{cat}</div>
              {items.map(e => (
                <div key={e.name} className="row" style={{ gridTemplateColumns: "240px 1fr 90px", padding: "8px 14px", alignItems: "center" }}>
                  <code style={{ fontSize: 11.5 }}>{e.name}</code>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{e.purpose}</div>
                  <span className="chip" style={{ fontSize: 10.5, color: e.set ? "var(--accent-money)" : "var(--state-warning)", textAlign: "center" }}>
                    {e.set ? "● set" : "● missing"}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ padding: 14, borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
            To set or rotate any of these, run from the project root:
            <pre className="mono" style={{ marginTop: 6, padding: 10, background: "var(--bg-raised)", borderRadius: 4, fontSize: 10.5, overflow: "auto" }}>
              vercel env add OPENAI_API_KEY production{"\n"}
              vercel env add GEMINI_API_KEY production{"\n"}
              vercel env add NIPR_USER_ID    production{"\n"}
              # then redeploy:{"\n"}
              vercel --prod
            </pre>
          </div>
        </div>
      </div>
    );
  }

  window.PagePlatformAdmin = PagePlatformAdmin;
  window.AdminImpersonate = { start: startImpersonate, stop: stopImpersonate };
})();
