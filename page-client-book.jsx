/* Page: Client Book — manager team scope
 *
 * Session 1 deliverable 3/3 (2026-05-12). Lists individual clients with
 * primary policy + total premium + expected commission projection. Scoped
 * to the manager's downline via window.scopeRepIds(). Sort + filter by
 * rep / product / status. Row click opens a side-panel client detail.
 *
 * SCHEMA GOTCHA (verified against supabase/migrations/0003):
 *   The directive specified `policies.commission_rate_pct` and
 *   `commission_status`. Actual columns:
 *     - policies.comp_rate_pct        (NOT commission_rate_pct)
 *     - policies.expected_commission_cents  (auto-derived by trigger)
 *     - policies.ap_cents             (NOT annualized_premium)
 *     - no commission_status column — status lives on commissions.kind
 *       and policies.status (issued/active/lapsed/etc.).
 *
 * Projection logic — primary path:
 *   SUM(p.expectedCommission) per client
 *     filtered WHERE policy is not lapsed/cancelled/rescinded.
 * Fallback path (when expectedCommission is null/0):
 *   SUM(p.ap × p.compRatePct / 100) per client.
 * Final fallback (no comp rate):
 *   SUM(commissions.amount) JOIN policies WHERE status != 'cleared'.
 *
 * Hydration source: window.AppData.CLIENTS + POLICIES + COMMISSIONS
 * (data.jsx:435 / 447 / 513). All three hydrate via the same RLS-scoped
 * Supabase pull, so the agency boundary is enforced server-side.
 */
(function () {
  const { useState, useEffect, useMemo } = React;

  const fmt$ = (n) => "$" + Math.round(n || 0).toLocaleString();
  const STATUS_LABEL = {
    pending: "Pending", submitted: "Submitted", app_in: "App In", issued: "Issued",
    active: "Active", lapsed: "Lapsed", cancelled: "Cancelled", rescinded: "Rescinded",
  };
  const POLICY_STATUS_OPTIONS = [
    { v: "submitted", l: "Submitted" },
    { v: "pending", l: "Pending" },
    { v: "app_in", l: "App In" },
    { v: "active", l: "Active" },
    { v: "issued", l: "Issued" },
    { v: "lapsed", l: "Lapsed" },
    { v: "cancelled", l: "Cancelled" },
    { v: "rescinded", l: "Rescinded" },
  ];
  const STATUS_TONE = {
    issued: "var(--accent-money)", active: "var(--accent-money)",
    app_in: "var(--accent-status)", pending: "var(--text-tertiary)",
    lapsed: "var(--state-warning)", cancelled: "var(--state-danger)", rescinded: "var(--state-danger)",
  };
  const ACTIVE_STATUS = new Set(["issued", "active", "app_in", "pending"]);

  function projectCommission(policies, commissions) {
    // Per-policy projected commission:
    //   1. expectedCommission (trigger-derived) if present
    //   2. ap × compRatePct / 100 if both set
    //   3. SUM(commissions.amount JOIN policy_id) WHERE kind != 'cleared'
    let total = 0;
    for (const p of policies) {
      if (!ACTIVE_STATUS.has(p.status)) continue;
      if (p.expectedCommission && p.expectedCommission > 0) {
        total += p.expectedCommission;
        continue;
      }
      if (p.ap && p.compRatePct) {
        total += Math.round((p.ap * p.compRatePct) / 100);
        continue;
      }
      // Final fallback: sum from commissions ledger, exclude cleared
      const polComm = commissions
        .filter(c => c.policyId === p.id && c.kind !== "cleared")
        .reduce((a, c) => a + (c.amount || 0), 0);
      total += polComm;
    }
    return total;
  }

  function deriveClients() {
    const clients   = (window.AppData?.CLIENTS   || []);
    const policies  = (window.AppData?.POLICIES  || []);
    const commissions = (window.AppData?.COMMISSIONS || []);
    const pipeline  = (window.AppData?.PIPELINE  || []);
    const reps      = (window.AppData?.REPS      || []);

    const repById = Object.fromEntries(reps.map(r => [r.id, r]));
    // pipeline.id → owner_rep_id, so we can find the rep that owns the lead
    // that became this client. clients.leadId === pipeline.id.
    const pipelineById = Object.fromEntries(pipeline.map(l => [l.id, l]));

    return clients.map(client => {
      // Match policies via the lead's pipeline_id chain.
      // clients.leadId → pipeline.id → policies.leadId
      const clientLeadId = client.leadId;
      const clientPolicies = policies.filter(p => p.leadId && p.leadId === clientLeadId);

      const primaryPolicy = clientPolicies
        .filter(p => ACTIVE_STATUS.has(p.status))
        .sort((a, b) => (b.ap || 0) - (a.ap || 0))[0] || clientPolicies[0];

      const totalPremium = clientPolicies
        .filter(p => ACTIVE_STATUS.has(p.status))
        .reduce((a, p) => a + (p.ap || 0), 0);
      const projectedCommission = projectCommission(clientPolicies, commissions);

      const lead = clientLeadId ? pipelineById[clientLeadId] : null;
      const ownerRepId = lead?.owner || (primaryPolicy ? primaryPolicy.owner : null);
      const owner = ownerRepId ? repById[ownerRepId] : null;

      // Status surfaced on the row = primary policy status, or "Lead" if no
      // policy has been bound yet.
      const status = primaryPolicy?.status || "lead";

      return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        relationship: client.relationship || "primary",
        product: primaryPolicy?.product || "—",
        totalPremium,
        projectedCommission,
        policyCount: clientPolicies.length,
        status,
        ownerRepId,
        owner,
      };
    });
  }

  function PageClientBook({ role = "manager" }) {
    // Re-render on hydrate / mutation so scope picks up downline ids on
    // first paint and updates when policies get written via Deal Write.
    const [, force] = useState(0);
    useEffect(() => {
      const fn = () => force(n => n + 1);
      window.addEventListener("me:loaded", fn);
      window.addEventListener("data:hydrated", fn);
      window.addEventListener("data:mutated", fn);
      return () => {
        window.removeEventListener("me:loaded", fn);
        window.removeEventListener("data:hydrated", fn);
        window.removeEventListener("data:mutated", fn);
      };
    }, []);

    const me = (window.me && window.me()) || null;
    // null = unfiltered (owner / super_admin); empty arr = me() not loaded;
    // [ids] = manager downline restriction.
    const scopeIds = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;
    const inScope = (ownerId) => !scopeIds || scopeIds.length === 0 || !ownerId || scopeIds.includes(ownerId);

    const allClients = useMemo(deriveClients, [
      window.AppData?.CLIENTS, window.AppData?.POLICIES,
      window.AppData?.COMMISSIONS, window.AppData?.REPS, window.AppData?.PIPELINE,
    ]);
    const scopedClients = allClients.filter(c => inScope(c.ownerRepId));

    const [sort, setSort]         = useState({ key: "projectedCommission", dir: "desc" });
    const [filterRep, setFilterRep]         = useState("all");
    const [filterProduct, setFilterProduct] = useState("all");
    const [filterStatus, setFilterStatus]   = useState("all");
    const [query, setQuery]       = useState("");
    const [activeClient, setActiveClient]   = useState(null);

    const products = useMemo(() => Array.from(new Set(scopedClients.map(c => c.product).filter(p => p && p !== "—"))).sort(), [scopedClients]);
    const statuses = useMemo(() => Array.from(new Set(scopedClients.map(c => c.status))), [scopedClients]);
    const repsInScope = useMemo(() => {
      const seen = new Map();
      scopedClients.forEach(c => { if (c.owner) seen.set(c.owner.id, c.owner); });
      return Array.from(seen.values());
    }, [scopedClients]);

    const filtered = useMemo(() => {
      let rows = scopedClients;
      if (filterRep !== "all") rows = rows.filter(c => c.ownerRepId === filterRep);
      if (filterProduct !== "all") rows = rows.filter(c => c.product === filterProduct);
      if (filterStatus !== "all") rows = rows.filter(c => c.status === filterStatus);
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(c => c.name?.toLowerCase().includes(q) || c.product?.toLowerCase().includes(q));
      }
      const k = sort.key, d = sort.dir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = a[k], bv = b[k];
        if (typeof av === "string") return d * av.localeCompare(bv || "");
        return d * ((av || 0) - (bv || 0));
      });
      return rows;
    }, [scopedClients, filterRep, filterProduct, filterStatus, query, sort]);

    const totalAp           = filtered.reduce((a, c) => a + c.totalPremium, 0);
    const totalProjection   = filtered.reduce((a, c) => a + c.projectedCommission, 0);
    const activeCount       = filtered.filter(c => c.status === "active" || c.status === "issued").length;

    const sortBy = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
    const sortArrow = (key) => sort.key !== key ? "" : (sort.dir === "desc" ? " ↓" : " ↑");

    return (
      <div className="page-pad book-clients">
        <div className="page-h">
          <div>
            <div className="page-title">Client Book</div>
            <div className="page-sub">
              {role === "manager" ? "Your downline · " : ""}
              {filtered.length} client{filtered.length === 1 ? "" : "s"} · projected comp {fmt$(totalProjection)}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => window.AppData?.exportCsv && window.AppData.exportCsv(
              filtered,
              "client-book",
              [
                { k: "name",                 l: "Client" },
                { k: "product",              l: "Primary product" },
                { k: "policyCount",          l: "Policies" },
                { k: "totalPremium",         l: "Total premium", fmt: (v) => "$" + Math.round(v || 0) },
                { k: "projectedCommission",  l: "Projected comp", fmt: (v) => "$" + Math.round(v || 0) },
                { k: "status",               l: "Status" },
                { k: "ownerRepId",           l: "Owner rep" },
              ]
            )}>
              <Icons.ArrowDown size={12}/> Export
            </button>
          </div>
        </div>

        {/* Compact KPI strip — overrides default `.kpi` padding/font sizes
            via the scoped `.book-clients` parent class. Three equal tiles,
            no hero (the projected comp number is already large enough at
            the tightened size). */}
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
          <Shared.KpiCard label="Projected commission" prefix="$"
            value={totalProjection > 0 ? Math.round(totalProjection).toLocaleString() : ""}
            sub={totalProjection > 0 ? "on policies not yet cleared" : <span className="koino-empty">no projection data</span>}/>
          <Shared.KpiCard label="In-force premium" prefix="$"
            value={totalAp > 0 ? Math.round(totalAp).toLocaleString() : ""}
            sub={totalAp > 0 ? `${activeCount} active polic${activeCount === 1 ? "y" : "ies"}` : <span className="koino-empty">no policies in scope</span>}/>
          <Shared.KpiCard label="Clients" value={filtered.length}
            sub={scopedClients.length > 0 && scopedClients.length !== filtered.length ? `filtered from ${scopedClients.length}` : "in scope"}/>
        </div>

        {/* Filter row — single-line, tight. Selects auto-size to longest
            option via `width: auto`; search shrinks to remaining space. */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0 8px" }}>
          <input
            className="text-input filter-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client name or product…"
          />
          <Shared.Select value={filterRep} onChange={setFilterRep}
            options={[{ v: "all", l: "Any rep" }, ...repsInScope.map(r => ({ v: r.id, l: r.name }))]}/>
          <Shared.Select value={filterProduct} onChange={setFilterProduct}
            options={[{ v: "all", l: "Any product" }, ...products.map(p => ({ v: p, l: p }))]}/>
          <Shared.Select value={filterStatus} onChange={setFilterStatus}
            options={[{ v: "all", l: "Any status" }, ...statuses.map(s => ({ v: s, l: STATUS_LABEL[s] || s }))]}/>
        </div>

        <div className="panel">
          <div className="panel-h">
            <Icons.Users size={12}/>
            <h3>Clients</h3>
            <span className="meta">{filtered.length}</span>
          </div>
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.6fr 1.2fr 70px 110px 130px 100px 100px" }}>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("name")}>Client{sortArrow("name")}</button>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("product")}>Product{sortArrow("product")}</button>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-end", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("policyCount")}>Policies{sortArrow("policyCount")}</button>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-end", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("totalPremium")}>Premium{sortArrow("totalPremium")}</button>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-end", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("projectedCommission")}>Proj. comp{sortArrow("projectedCommission")}</button>
              <button className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: 0, fontSize: 10.5, color: "var(--text-tertiary)" }} onClick={() => sortBy("status")}>Status{sortArrow("status")}</button>
              <div></div>
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                {scopedClients.length === 0
                  ? <><span className="koino-empty">book · empty</span><br/>No clients in your team's book yet. Issued policies + lead → client conversions land here.</>
                  : <>No clients match the current filters.</>}
              </div>
            )}
            {filtered.map(c => (
              <div key={c.id} className="row" style={{ gridTemplateColumns: "1.6fr 1.2fr 70px 110px 130px 100px 100px", height: 36, cursor: "pointer" }}
                onClick={() => setActiveClient(c)}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.owner?.name?.split(" ")[0] || "—"}</div>
                </div>
                <div style={{ fontSize: 12, color: c.product === "—" ? "var(--text-quaternary)" : "var(--text-secondary)" }}>{c.product}</div>
                <div className="tabular" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{c.policyCount || 0}</div>
                <div className="tabular" style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {c.totalPremium > 0 ? "$" + c.totalPremium.toLocaleString() : <span className="koino-empty">none</span>}
                </div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--accent-money)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>
                  {c.projectedCommission > 0 ? "$" + Math.round(c.projectedCommission).toLocaleString() : <span className="koino-empty">no proj</span>}
                </div>
                <div>
                  <span className="chip" style={{
                    fontSize: 9.5,
                    color: STATUS_TONE[c.status] || "var(--text-tertiary)",
                    background: `color-mix(in srgb, ${STATUS_TONE[c.status] || "var(--text-tertiary)"} 12%, transparent)`,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>{STATUS_LABEL[c.status] || c.status}</span>
                </div>
                <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10.5 }}><Icons.ChevronRight size={10}/></button>
              </div>
            ))}
          </div>
        </div>

        {activeClient && <ClientDetailSlideout client={activeClient} onClose={() => setActiveClient(null)}/>}
      </div>
    );
  }

  /* Client detail side panel — keeps the manager in the book context while
     reading per-policy detail. Pulls the same projection components used
     in the table so totals match exactly. */
  function ClientDetailSlideout({ client, onClose }) {
    const policies = (window.AppData?.POLICIES || []).filter(p => p.leadId && p.leadId === (window.AppData?.CLIENTS || []).find(c => c.id === client.id)?.leadId);
    const commissions = (window.AppData?.COMMISSIONS || []);

    return (
      <div className="slideout-overlay" onClick={onClose}>
        <aside className="slideout" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
          <div className="slideout-h">
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>{client.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {client.owner?.name || "—"} · {client.policyCount} polic{client.policyCount === 1 ? "y" : "ies"} · {fmt$(client.projectedCommission)} projected comp
              </div>
            </div>
            <button className="icon-btn" onClick={onClose}><Icons.X size={13}/></button>
          </div>
          <div className="slideout-body">
            <div className="field-l">Contact</div>
            <div style={{ marginTop: 4, marginBottom: 14, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {client.phone ? <div>{client.phone}</div> : <span className="koino-empty">no phone</span>}
              {client.email ? <div>{client.email}</div> : <span className="koino-empty">no email</span>}
            </div>

            <div className="field-l">Policies</div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
              {policies.length === 0 && <span className="koino-empty">no policies bound</span>}
              {policies.map(p => <PolicyCard key={p.id} policy={p} commissions={commissions}/>)}
            </div>
          </div>
        </aside>
      </div>
    );
  }

  function PolicyCard({ policy: p, commissions }) {
    const me = (window.me && window.me()) || {};
    const canManage = ["manager", "owner", "admin", "imo_owner", "super_admin"].includes(me.role);
    const paidForPolicy = commissions
      .filter(c => c.policyId === p.id)
      .reduce((a, c) => a + (c.amount || 0), 0);
    const projected = p.expectedCommission || (p.ap && p.compRatePct ? Math.round((p.ap * p.compRatePct) / 100) : 0);
    const terminal = ["lapsed", "cancelled", "rescinded"].includes(p.status);
    const [draftStatus, setDraftStatus] = useState(p.status || "active");
    const [reason, setReason] = useState("");
    const [debt, setDebt] = useState(String(Math.max(0, projected || paidForPolicy || 0)));
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draftAp, setDraftAp] = useState(String(p.ap ?? ""));
    const [draftRate, setDraftRate] = useState(p.compRatePct != null ? String(p.compRatePct) : "");
    const [draftProduct, setDraftProduct] = useState(p.product || "");

    useEffect(() => {
      setDraftStatus(p.status || "active");
      setDebt(String(Math.max(0, projected || paidForPolicy || 0)));
      setDraftAp(String(p.ap ?? ""));
      setDraftRate(p.compRatePct != null ? String(p.compRatePct) : "");
      setDraftProduct(p.product || "");
    }, [p.status, p.ap, p.compRatePct, p.product, projected, paidForPolicy]);

    const save = async () => {
      const amount = Math.max(0, Math.round((Number(debt) || 0) * 100));
      setSaving(true);
      try {
        await window.AppData?.mutate?.policyPersistencyEvent?.(p.id, {
          status: draftStatus,
          reason,
          clawbackCents: ["lapsed", "cancelled", "rescinded"].includes(draftStatus) ? amount : null,
        });
        window.toast && window.toast(`Policy marked ${STATUS_LABEL[draftStatus] || draftStatus}`, "success");
        setReason("");
      } catch (e) {
        window.toast && window.toast(`Policy update failed: ${e?.message || e}`, "error");
      } finally {
        setSaving(false);
      }
    };

    const saveDetails = async () => {
      const apNum = Number(draftAp);
      const rateNum = draftRate === "" ? null : Number(draftRate);
      if (!Number.isFinite(apNum) || apNum < 0) { window.toast && window.toast("AP must be a non-negative number", "error"); return; }
      if (rateNum != null && (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1000)) { window.toast && window.toast("Comp rate must be 0–1000%", "error"); return; }
      setSaving(true);
      try {
        await window.AppData?.mutate?.policyPatch?.(p.id, {
          ap: apNum,
          compRatePct: rateNum,
          product: draftProduct.trim() || null,
        });
        window.toast && window.toast("Policy details updated", "success");
        setEditing(false);
      } catch (e) {
        window.toast && window.toast(`Update failed: ${e?.message || e}`, "error");
      } finally {
        setSaving(false);
      }
    };

    const remove = async () => {
      if (!window.confirm(`Remove this policy?\n\n${p.product || "(no product)"} · $${(p.ap || 0).toLocaleString()} AP\n\nThis deletes the policy row and any linked commissions/clawbacks. Not recoverable from the UI.`)) return;
      setSaving(true);
      try {
        await window.AppData?.mutate?.policyRemove?.(p.id);
        window.toast && window.toast("Policy removed", "success");
      } catch (e) {
        window.toast && window.toast(`Remove failed: ${e?.message || e}`, "error");
        setSaving(false);
      }
    };

    return (
      <div style={{ padding: 10, background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <strong style={{ fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product || "—"}</strong>
          <span style={{
            fontSize: 10,
            color: terminal ? "var(--state-danger)" : "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>{STATUS_LABEL[p.status] || p.status}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
          AP <span className="tabular" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>${(p.ap || 0).toLocaleString()}</span>
          {p.compRatePct ? <> · {p.compRatePct}% comp</> : null}
          {p.issuedAt ? <> · issued {p.issuedAt}</> : null}
        </div>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>Projected</span><br/>
            <span className="tabular" style={{ color: "var(--accent-money)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>${Math.round(projected).toLocaleString()}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-tertiary)" }}>{terminal ? "Debt" : "Paid"}</span><br/>
            <span className="tabular" style={{ fontFamily: "var(--font-mono)", color: terminal ? "var(--state-danger)" : undefined }}>
              ${Math.round(terminal ? Math.max(projected, paidForPolicy) : paidForPolicy).toLocaleString()}
            </span>
          </div>
        </div>

        {canManage && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 82px", gap: 6 }}>
            <select className="text-input" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} disabled={saving} style={{ fontSize: 11.5, padding: "5px 8px" }}>
              {POLICY_STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <input className="text-input" type="number" min="0" step="1" value={debt} onChange={(e) => setDebt(e.target.value)} disabled={saving || !["lapsed", "cancelled", "rescinded"].includes(draftStatus)} style={{ fontSize: 11.5, padding: "5px 8px", textAlign: "right" }}/>
            <input className="text-input" value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} placeholder="Carrier notice / reason" style={{ gridColumn: "1 / -1", fontSize: 11.5, padding: "5px 8px" }}/>
            <button className="btn btn-primary" disabled={saving || draftStatus === p.status} onClick={save} style={{ gridColumn: "1 / -1", justifyContent: "center", fontSize: 11.5 }}>
              {saving ? "Saving..." : <><Icons.Check size={12}/> Save policy status</>}
            </button>

            {/* Edit details (AP / comp rate / product text). Collapsed by
                default — the persistency editor above is the hot path.
                Inline panel keeps everything in the same slideout so the
                manager doesn't have to navigate to Deal Write for a typo. */}
            {!editing ? (
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn btn-ghost" disabled={saving} onClick={() => setEditing(true)} style={{ flex: 1, justifyContent: "center", fontSize: 11.5, padding: "5px 8px" }}>
                  <Icons.Edit size={11}/> Edit AP / rate / product
                </button>
                <button className="btn btn-ghost" disabled={saving} onClick={remove} style={{ flex: "0 0 auto", color: "var(--state-danger)", fontSize: 11.5, padding: "5px 10px" }}>
                  <Icons.X size={11}/> Remove
                </button>
              </div>
            ) : (
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 90px", gap: 6, marginTop: 4 }}>
                <input className="text-input" value={draftProduct} onChange={(e) => setDraftProduct(e.target.value)} disabled={saving} placeholder="Product text" style={{ gridColumn: "1 / -1", fontSize: 11.5, padding: "5px 8px" }}/>
                <input className="text-input" type="number" min="0" step="1" value={draftAp} onChange={(e) => setDraftAp(e.target.value)} disabled={saving} placeholder="AP ($)" style={{ fontSize: 11.5, padding: "5px 8px", textAlign: "right" }}/>
                <input className="text-input" type="number" min="0" step="0.01" value={draftRate} onChange={(e) => setDraftRate(e.target.value)} disabled={saving} placeholder="Comp %" style={{ fontSize: 11.5, padding: "5px 8px", textAlign: "right" }}/>
                <button className="btn btn-primary" disabled={saving} onClick={saveDetails} style={{ justifyContent: "center", fontSize: 11.5 }}>
                  {saving ? "Saving..." : <><Icons.Check size={12}/> Save details</>}
                </button>
                <button className="btn btn-ghost" disabled={saving} onClick={() => setEditing(false)} style={{ justifyContent: "center", fontSize: 11.5 }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  window.PageClientBook = PageClientBook;
})();
