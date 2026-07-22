/* Unified CRM workspace.
 *
 * This is the agency operating surface for lead -> policy -> client -> cash.
 * Legacy pages remain available through their existing routes during rollout,
 * but the default navigation lands here so users do not have to understand
 * the storage model to complete routine work.
 */
(function () {
  const { useState, useEffect, useMemo } = React;

  const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString();
  const dateLabel = (value) => value
    ? new Date(String(value).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const esc = (value) => String(value || "").toLowerCase();
  const inDateRange = (value, range) => {
    if (range === "all" || !value) return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return true;
    const days = Number(range) || 30;
    return date.getTime() >= Date.now() - days * 86400000;
  };
  const activePolicy = new Set(["pending", "submitted", "app_in", "issued", "active"]);
  const statusTone = (status) => {
    const s = esc(status);
    if (s === "issued" || s === "active" || s === "paid" || s === "reconciled") return "good";
    if (s === "pending" || s === "submitted" || s === "app_in" || s === "partial") return "warn";
    if (s === "lapsed" || s === "cancelled" || s === "rescinded" || s === "error") return "bad";
    return "neutral";
  };

  function Badge({ children, tone }) {
    return <span className={`crm-badge crm-badge-${tone || statusTone(children)}`}>{children}</span>;
  }

  function Modal({ title, children, onClose, wide }) {
    return <div className="crm-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`crm-modal${wide ? " crm-modal-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="crm-modal-head"><h2>{title}</h2><button className="crm-icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>;
  }

  function useWorkspaceData(refreshKey) {
    const [, refresh] = useState(0);
    const [moneyRows, setMoneyRows] = useState({ deposits: [], allocations: [], expenses: [] });
    const [loadingMoney, setLoadingMoney] = useState(false);

    useEffect(() => {
      const fn = () => refresh(n => n + 1);
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
    const agencyId = me?.agency_id || null;

    useEffect(() => {
      let cancelled = false;
      const load = async () => {
        if (!agencyId || !window.AppData?.LIVE || !window.getSupabase) return;
        setLoadingMoney(true);
        try {
          const sb = window.getSupabase();
          const [{ data: deposits, error: depErr }, { data: expenses, error: expErr }] = await Promise.all([
            sb.from("carrier_deposits").select("*").eq("agency_id", agencyId).order("deposit_date", { ascending: false }).limit(300),
            sb.from("agency_expenses").select("*").eq("agency_id", agencyId).order("paid_at", { ascending: false }).limit(300),
          ]);
          if (depErr) throw depErr;
          if (expErr) throw expErr;
          const ids = (deposits || []).map(d => d.id);
          let allocations = [];
          if (ids.length) {
            const { data, error } = await sb.from("deposit_allocations").select("*").in("deposit_id", ids);
            if (error) throw error;
            allocations = data || [];
          }
          if (!cancelled) setMoneyRows({ deposits: deposits || [], allocations, expenses: expenses || [] });
        } catch (e) {
          console.warn("[crm-workspace.money] load failed", e);
          if (!cancelled) setMoneyRows({ deposits: [], allocations: [], expenses: [] });
        } finally {
          if (!cancelled) setLoadingMoney(false);
        }
      };
      load();
      return () => { cancelled = true; };
    }, [agencyId, refreshKey]);

    return { me, agencyId, moneyRows, loadingMoney };
  }

  function LeadModal({ onClose, onSaved }) {
    const me = (window.me && window.me()) || {};
    const [form, setForm] = useState({ name: "", phone: "", email: "", state: "", product: "", source: "Manual", next: "First contact" });
    const [saving, setSaving] = useState(false);
    const save = async (e) => {
      e.preventDefault();
      if (!form.name.trim()) return window.toast?.("Add the lead's name first.", "error");
      setSaving(true);
      try {
        await window.AppData.mutate.pipelineInsert({
          lead: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
          state: form.state.trim() || null, product: form.product.trim() || null,
          stage: "New", source: form.source.trim() || "Manual", next: form.next.trim() || "First contact",
          last: "Added in CRM", owner: me.rep_id || null, ap: 0, days: 0, heat: "fresh", consent: "unknown",
        });
        window.toast?.("Lead added to the pipeline.", "success");
        onSaved?.(); onClose();
      } catch (err) { window.toast?.(err.message || "Lead could not be saved.", "error"); }
      finally { setSaving(false); }
    };
    return <Modal title="Add lead" onClose={onClose}>
      <form className="crm-form" onSubmit={save}>
        <label>Name<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Lead name" /></label>
        <div className="crm-form-grid"><label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-5555" /></label><label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@email.com" /></label></div>
        <div className="crm-form-grid"><label>State<input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="FL" /></label><label>Product interest<input value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} placeholder="Whole life" /></label></div>
        <div className="crm-form-grid"><label>Source<input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></label><label>Next action<input value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} /></label></div>
        <div className="crm-form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Add lead"}</button></div>
      </form>
    </Modal>;
  }

  function DealModal({ lead, onClose, onSaved }) {
    const [Form, setForm] = useState(() => window.DealWriteForm || null);
    const [loadTimedOut, setLoadTimedOut] = useState(false);
    useEffect(() => {
      if (Form) return;
      let attempts = 0;
      const ready = () => { if (window.DealWriteForm) setForm(() => window.DealWriteForm); };
      const timer = setInterval(() => {
        ready();
        attempts += 1;
        if (attempts >= 100) { clearInterval(timer); setLoadTimedOut(true); }
      }, 50);
      window.addEventListener("deal-write:ready", ready);
      return () => { clearInterval(timer); window.removeEventListener("deal-write:ready", ready); };
    }, [Form]);
    if (!Form) return <Modal title="Write deal" onClose={onClose}><div className="crm-empty">{loadTimedOut ? "Deal form could not load. Close and try again." : "Loading deal form…"}</div></Modal>;
    return <Modal title={lead ? `Write deal · ${lead.lead}` : "Write deal"} onClose={onClose} wide>{React.createElement(Form, { defaultLeadId: lead?.id || "", onWritten: () => { onSaved?.(); onClose(); } })}</Modal>;
  }

  function DepositModal({ carriers, agencyId, onClose, onSaved }) {
    const me = (window.me && window.me()) || {};
    const [form, setForm] = useState({ carrierId: carriers[0]?.id || "", gross: "", date: new Date().toISOString().slice(0, 10), notes: "" });
    const [saving, setSaving] = useState(false);
    const save = async (e) => {
      e.preventDefault();
      const gross = Math.round(Number(form.gross) * 100);
      if (!form.carrierId || !gross) return window.toast?.("Choose a carrier and enter the deposit amount.", "error");
      setSaving(true);
      try {
        const sb = window.getSupabase?.();
        if (!sb || !window.AppData?.LIVE) throw new Error("Deposits require a live agency session.");
        const payload = { agency_id: agencyId, carrier_id: form.carrierId, rep_id: me.rep_id || null, deposit_date: form.date, gross_cents: gross, notes: form.notes.trim() || null, allocations: [] };
        const rpc = await sb.rpc("crm_save_deposit", { p_payload: payload });
        const missingRpc = rpc.error && /function .*crm_save_deposit|does not exist|could not find/i.test(rpc.error.message || "");
        if (rpc.error && !missingRpc) throw rpc.error;
        if (missingRpc) {
          const { allocations: _allocations, ...depositRow } = payload;
          const { error } = await sb.from("carrier_deposits").insert(depositRow);
          if (error) throw error;
        }
        window.toast?.("Deposit marked. Allocate it from the deposit row when ready.", "success"); onSaved?.(); onClose();
      } catch (err) { window.toast?.(err.message || "Deposit could not be saved.", "error"); }
      finally { setSaving(false); }
    };
    return <Modal title="Mark carrier deposit" onClose={onClose}>
      <form className="crm-form" onSubmit={save}>
        <label>Carrier<select value={form.carrierId} onChange={e => setForm({ ...form, carrierId: e.target.value })}><option value="">Choose carrier</option>{carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="crm-form-grid"><label>Amount<input type="number" min="0" step="0.01" value={form.gross} onChange={e => setForm({ ...form, gross: e.target.value })} placeholder="0.00" /></label><label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label></div>
        <label>Note<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Statement number or context" /></label>
        <div className="crm-form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Mark deposit"}</button></div>
      </form>
    </Modal>;
  }

  function ExpenseModal({ agencyId, role = "manager", onClose, onSaved }) {
    const me = (window.me && window.me()) || {};
    const ownerLike = ["owner", "admin", "imo_owner", "super_admin"].includes(role);
    const [form, setForm] = useState({ kind: ownerLike ? "other" : "lead_spend", amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
    const [saving, setSaving] = useState(false);
    const save = async (e) => {
      e.preventDefault();
      const amount = Math.round(Number(form.amount) * 100);
      if (!amount) return window.toast?.("Enter an expense amount.", "error");
      setSaving(true);
      try {
        const sb = window.getSupabase?.();
        if (!sb || !window.AppData?.LIVE) throw new Error("Expenses require a live agency session.");
        const payload = { agency_id: agencyId, kind: form.kind, amount_cents: amount, paid_at: form.date, notes: form.notes.trim() || null, paid_by: ownerLike ? "agency" : "rep_oop", paid_by_rep_id: me.rep_id || null };
        const rpc = await sb.rpc("crm_save_expense", { p_payload: payload });
        const missingRpc = rpc.error && /function .*crm_save_expense|does not exist|could not find/i.test(rpc.error.message || "");
        if (rpc.error && !missingRpc) throw rpc.error;
        if (missingRpc) {
          const { error } = await sb.from("agency_expenses").insert(payload);
          if (error) throw error;
        }
        window.toast?.("Expense recorded.", "success"); onSaved?.(); onClose();
      } catch (err) { window.toast?.(err.message || "Expense could not be saved.", "error"); }
      finally { setSaving(false); }
    };
    return <Modal title="Add expense" onClose={onClose}>
      <form className="crm-form" onSubmit={save}>
        <div className="crm-form-grid"><label>Category<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{ownerLike && <><option value="other">Other</option><option value="saas">Software</option><option value="payroll">Payroll</option><option value="professional_services">Professional services</option><option value="licensing">Licensing</option></>}{!ownerLike && <><option value="lead_spend">Lead spend</option><option value="marketing">Marketing</option><option value="training">Training</option><option value="meals">Meals</option><option value="travel">Travel</option></>}</select></label><label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></label></div>
        <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>Note<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What was this for?" /></label>
        <div className="crm-form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save expense"}</button></div>
      </form>
    </Modal>;
  }

  function ClientDrawer({ record, onClose, carriers }) {
    if (!record) return null;
    return <div className="crm-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="crm-drawer"><div className="crm-drawer-head"><div><div className="crm-eyebrow">Client</div><h2>{record.client?.name || record.lead?.lead || "Unnamed"}</h2><div className="crm-muted">{record.client?.phone || record.lead?.phone || "No phone"}{record.client?.email ? ` · ${record.client.email}` : ""}</div></div><button className="crm-icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="crm-drawer-actions"><button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("crm:write-deal", { detail: { lead: record.lead } }))}>Write deal</button><button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("incall:open", { detail: { lead: record.lead } }))}>Call</button></div>
        <div className="crm-detail-section"><div className="crm-detail-label">Pipeline</div><div className="crm-detail-row"><span>Status</span><Badge>{record.lead?.stage || record.policy?.status || "Lead"}</Badge></div><div className="crm-detail-row"><span>Owner</span><strong>{record.owner?.name || "Unassigned"}</strong></div><div className="crm-detail-row"><span>Next action</span><strong>{record.lead?.next || "—"}</strong></div></div>
        <div className="crm-detail-section"><div className="crm-detail-label">Policies</div>{record.policies.length ? record.policies.map(p => <div className="crm-policy-row" key={p.id}><div><strong>{p.product || "Policy"}</strong><div className="crm-muted">{(carriers.find(c => c.id === p.carrierId) || {}).name || "Carrier pending"} · {p.policyNumber || "No number"}</div></div><div className="crm-policy-right"><Badge>{p.status || "pending"}</Badge><strong>{money(p.ap)}</strong></div></div>) : <div className="crm-empty-inline">No policies yet.</div>}</div>
        <div className="crm-detail-section"><div className="crm-detail-label">Financial snapshot</div><div className="crm-detail-stats"><div><span>AP</span><strong>{money(record.ap)}</strong></div><div><span>Expected comp</span><strong>{money(record.expectedComp)}</strong></div><div><span>Policies</span><strong>{record.policies.length}</strong></div></div></div>
      </aside>
    </div>;
  }

  function PageCrmWorkspace({ role = "manager" }) {
    const [refreshKey, setRefreshKey] = useState(0);
    const { me, agencyId, moneyRows, loadingMoney } = useWorkspaceData(refreshKey);
    const [view, setView] = useState(() => { try { return localStorage.getItem("repflow.crm.view") || "pipeline"; } catch { return "pipeline"; } });
    const [scope, setScope] = useState("all");
    const [query, setQuery] = useState("");
    const [dateRange, setDateRange] = useState("30");
    const [modal, setModal] = useState(null);
    const [active, setActive] = useState(null);
    const [prefsLoaded, setPrefsLoaded] = useState(false);
    const allLeads = window.AppData?.PIPELINE || [];
    const policies = window.AppData?.POLICIES || [];
    const clients = window.AppData?.CLIENTS || [];
    const reps = window.AppData?.REPS || [];
    const carriers = window.AppData?.CARRIERS || [];
    const appts = window.AppData?.AGENCY_APPOINTMENTS || [];
    const myRepId = me?.rep_id || me?.repId || null;
    const downline = (window.scopeRepIds && window.scopeRepIds()) || null;
    const allowed = scope === "mine" && myRepId ? new Set([myRepId]) : (downline && downline.length ? new Set(downline) : null);
    const repById = useMemo(() => Object.fromEntries(reps.map(r => [r.id, r])), [reps]);
    const carrierById = useMemo(() => Object.fromEntries(carriers.map(c => [c.id, c])), [carriers]);
    const records = useMemo(() => allLeads.map(lead => {
      const ownPolicies = policies.filter(p => p.leadId === lead.id);
      const client = clients.find(c => c.leadId === lead.id) || null;
      const ownerId = lead.owner || ownPolicies.find(p => p.owner)?.owner || null;
      return { id: lead.id, lead, client, policies: ownPolicies, owner: repById[ownerId] || null, ownerId, ap: ownPolicies.reduce((n, p) => n + (p.ap || 0), lead.ap || 0), expectedComp: ownPolicies.reduce((n, p) => n + (p.expectedCommission || 0), 0) };
    }), [allLeads, policies, clients, repById]);
    const scoped = records.filter(r => (!allowed || !r.ownerId || allowed.has(r.ownerId)) && inDateRange(r.lead.createdAt, dateRange));
    const filtered = scoped.filter(r => {
      const q = esc(query);
      return !q || [r.lead.lead, r.lead.phone, r.lead.email, r.lead.product, r.client?.name, r.owner?.name].some(v => esc(v).includes(q));
    });
    const metrics = useMemo(() => {
      const activePolicies = scoped.flatMap(r => r.policies).filter(p => activePolicy.has(esc(p.status)) && inDateRange(p.createdAt || p.submittedAt || p.issuedAt, dateRange));
      const paid = moneyRows.allocations.filter(a => !allowed || !a.rep_id || allowed.has(a.rep_id)).reduce((n, a) => n + (Number(a.amount_cents) || 0) / 100, 0);
      const received = moneyRows.deposits.filter(d => inDateRange(d.deposit_date, dateRange)).reduce((n, d) => n + (Number(d.gross_cents) || 0) / 100, 0);
      const expenses = moneyRows.expenses.filter(e => inDateRange(e.paid_at, dateRange)).reduce((n, e) => n + (Number(e.amount_cents) || 0) / 100, 0);
      return { needs: scoped.filter(r => !r.policies.length || ["new", "contacted", "quoted"].includes(esc(r.lead.stage))).length, ap: activePolicies.reduce((n, p) => n + (p.ap || 0), 0), expected: scoped.reduce((n, r) => n + r.expectedComp, 0), paid, net: received - expenses };
    }, [scoped, moneyRows, allowed]);

    useEffect(() => {
      try { localStorage.setItem("repflow.crm.view", view); } catch {}
    }, [view]);
    useEffect(() => {
      let cancelled = false;
      const load = async () => {
        const sb = window.getSupabase?.();
        const userId = me?.user_id || me?.userId;
        if (!sb || !userId) { setPrefsLoaded(true); return; }
        try {
          const { data } = await sb.from("user_workspace_preferences").select("preferences").eq("user_id", userId).eq("workspace", "crm").maybeSingle();
          if (!cancelled && data?.preferences) {
            const p = data.preferences;
            if (["pipeline", "clients", "money", "carriers"].includes(p.view)) setView(p.view);
            if (["all", "mine"].includes(p.scope)) setScope(p.scope);
            if (["30", "90", "all"].includes(p.dateRange)) setDateRange(p.dateRange);
          }
        } catch (e) { console.warn("[crm-workspace.preferences] load failed", e); }
        if (!cancelled) setPrefsLoaded(true);
      };
      load();
      return () => { cancelled = true; };
    }, [me?.user_id, me?.userId]);
    useEffect(() => {
      const sb = window.getSupabase?.();
      const userId = me?.user_id || me?.userId;
      if (!prefsLoaded || !sb || !userId) return;
      const timer = setTimeout(() => {
        sb.from("user_workspace_preferences").upsert({ user_id: userId, workspace: "crm", preferences: { view, scope, dateRange }, updated_at: new Date().toISOString() }, { onConflict: "user_id,workspace" }).then(({ error }) => {
          if (error && !/user_workspace_preferences|does not exist/i.test(error.message || "")) console.warn("[crm-workspace.preferences] save failed", error);
        });
      }, 150);
      return () => clearTimeout(timer);
    }, [prefsLoaded, view, scope, dateRange, me?.user_id, me?.userId]);
    useEffect(() => {
      const fn = (e) => { setModal("deal"); if (e.detail?.lead) setActive(records.find(r => r.id === e.detail.lead.id) || null); };
      window.addEventListener("crm:write-deal", fn);
      return () => window.removeEventListener("crm:write-deal", fn);
    }, [records]);

    const refresh = () => { setRefreshKey(n => n + 1); window.dispatchEvent(new Event("data:hydrated")); };
    const title = view === "pipeline" ? "Pipeline" : view === "clients" ? "Clients" : view === "money" ? "Money" : "Carriers";
    return <div className="page-pad crm-workspace" data-crm-view={view}>
      <div className="crm-header"><div><div className="crm-eyebrow">{me?.agency_name || "Agency workspace"}</div><h1>CRM</h1><p>Leads, clients, policies, carriers, and cash in one place.</p></div><div className="crm-header-actions"><button className="btn" onClick={refresh}>Refresh</button><div className="crm-add-wrap"><button className="btn btn-primary" onClick={() => setModal(modal === "menu" ? null : "menu")}>+ Add</button>{modal === "menu" && <div className="crm-add-menu"><button onClick={() => setModal("lead")}>Lead</button><button onClick={() => setModal("deal")}>Deal</button><button onClick={() => setModal("deposit")}>Deposit</button><button onClick={() => setModal("expense")}>Expense</button></div>}</div></div></div>
      <div className="crm-kpis"><div><span>Needs action</span><strong>{metrics.needs}</strong></div><div><span>Active AP</span><strong>{money(metrics.ap)}</strong></div><div><span>Expected comp</span><strong>{money(metrics.expected)}</strong></div><div><span>Paid comp</span><strong className="crm-good-text">{money(metrics.paid)}</strong></div><div><span>Net cash</span><strong>{money(metrics.net)}</strong></div></div>
      <div className="crm-toolbar"><div className="crm-views">{[["pipeline", "Pipeline"], ["clients", "Clients"], ["money", "Money"], ["carriers", "Carriers"]].map(([k, label]) => <button key={k} className={view === k ? "active" : ""} onClick={() => setView(k)}>{label}</button>)}</div><div className="crm-filters"><select value={scope} onChange={e => setScope(e.target.value)}><option value="all">{role === "rep" ? "My work" : "Mine + downline"}</option><option value="mine">Mine only</option></select><select value={dateRange} onChange={e => setDateRange(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search CRM…" /></div></div>
      <div className="crm-view-head"><div><h2>{title}</h2><span>{view === "pipeline" ? `${filtered.length} active records` : view === "clients" ? `${filtered.filter(r => r.client).length} clients` : view === "money" ? `${moneyRows.deposits.length + moneyRows.expenses.length} ledger entries` : `${appts.length || carriers.length} carriers available`}</span></div>{view === "carriers" && <button className="btn" onClick={() => window.gotoPage?.("carrier-appointments")}>Manage appointments</button>}</div>
      {view === "pipeline" && <PipelineView rows={filtered} carrierById={carrierById} onSelect={setActive} onDeal={r => { setActive(r); setModal("deal"); }} />}
      {view === "clients" && <ClientsView rows={filtered.filter(r => r.client)} onSelect={setActive} />}
      {view === "money" && <MoneyView rows={moneyRows} carrierById={carrierById} policyById={Object.fromEntries(policies.map(p => [p.id, p]))} loading={loadingMoney} dateRange={dateRange} />}
      {view === "carriers" && <CarriersView carriers={carriers} appts={appts} />}
      {active && <ClientDrawer record={active} onClose={() => setActive(null)} carriers={carriers} />}
      {modal === "lead" && <LeadModal onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "deal" && <DealModal lead={active?.lead} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "deposit" && <DepositModal carriers={carriers.filter(c => appts.some(a => a.carrierId === c.id) || !appts.length)} agencyId={agencyId} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "expense" && <ExpenseModal agencyId={agencyId} role={role} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>;
  }

  function PipelineView({ rows, carrierById, onSelect, onDeal }) {
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Lead / client</th><th>Stage</th><th>Owner</th><th>Product / carrier</th><th>Next action</th><th className="num">AP</th><th></th></tr></thead><tbody>{rows.map(r => <tr key={r.id} onClick={() => onSelect(r)}><td><strong>{r.client?.name || r.lead.lead || "Unnamed"}</strong><small>{r.lead.phone || r.lead.email || "No contact info"}</small></td><td><Badge>{r.lead.stage || "New"}</Badge></td><td>{r.owner?.name || "Unassigned"}</td><td>{r.lead.product || r.policies[0]?.product || "—"}<small>{r.policies[0]?.carrierId ? carrierById[r.policies[0].carrierId]?.name || "Carrier" : "No policy yet"}</small></td><td>{r.lead.next || "—"}</td><td className="num">{money(r.ap)}</td><td><button className="crm-row-action" onClick={e => { e.stopPropagation(); onDeal(r); }}>Write deal</button></td></tr>)}</tbody></table>{!rows.length && <div className="crm-empty">No pipeline records match this view.</div>}</div>;
  }

  function ClientsView({ rows, onSelect }) {
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Client</th><th>Policies</th><th>Status</th><th>Owner</th><th className="num">AP</th><th className="num">Expected comp</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} onClick={() => onSelect(r)}><td><strong>{r.client.name}</strong><small>{r.client.phone || r.client.email || "No contact info"}</small></td><td>{r.policies.length}</td><td><Badge>{r.policies[0]?.status || r.lead.stage || "Lead"}</Badge></td><td>{r.owner?.name || "Unassigned"}</td><td className="num">{money(r.ap)}</td><td className="num">{money(r.expectedComp)}</td></tr>)}</tbody></table>{!rows.length && <div className="crm-empty">No clients match this view.</div>}</div>;
  }

  function MoneyView({ rows, carrierById, policyById, loading, dateRange }) {
    const ledger = [...rows.deposits.filter(d => inDateRange(d.deposit_date, dateRange)).map(d => { const allocated = rows.allocations.filter(a => a.deposit_id === d.id).reduce((n, a) => n + (a.amount_cents || 0), 0); const gross = Number(d.gross_cents) || 0; return { key: `d-${d.id}`, date: d.deposit_date, kind: "Deposit", title: carrierById[d.carrier_id]?.name || "Carrier deposit", amount: gross / 100, tone: "good", reconciled: allocated === gross && gross > 0, meta: `${(allocated / 100).toLocaleString()} allocated` }; }), ...rows.expenses.filter(e => inDateRange(e.paid_at, dateRange)).map(e => ({ key: `e-${e.id}`, date: e.paid_at, kind: "Expense", title: e.kind || "Expense", amount: -((e.amount_cents || 0) / 100), tone: "bad", meta: e.notes || "" }))].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return <div className="crm-table-wrap">{loading && <div className="crm-loading">Loading money…</div>}<table className="crm-table"><thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Reconciliation</th><th className="num">Amount</th></tr></thead><tbody>{ledger.map(row => <tr key={row.key}><td>{dateLabel(row.date)}</td><td><Badge tone={row.tone}>{row.kind}</Badge></td><td><strong>{row.title}</strong><small>{row.meta}</small></td><td>{row.kind === "Deposit" ? <Badge tone={row.reconciled ? "good" : "warn"}>{row.reconciled ? "Reconciled" : "Review allocation"}</Badge> : "—"}</td><td className={`num ${row.amount < 0 ? "crm-bad-text" : "crm-good-text"}`}>{row.amount < 0 ? "−" : "+"}{money(Math.abs(row.amount))}</td></tr>)}</tbody></table>{!ledger.length && <div className="crm-empty">No deposits or expenses have been recorded yet.</div>}</div>;
  }

  function CarriersView({ carriers, appts }) {
    const appointed = new Set(appts.map(a => a.carrierId));
    const rows = carriers.filter(c => appointed.has(c.id) || !appts.length);
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Carrier</th><th>Appointment</th><th>Products</th><th>Portal access</th><th></th></tr></thead><tbody>{rows.slice(0, 50).map(c => { const a = appts.find(x => x.carrierId === c.id); return <tr key={c.id}><td><strong>{c.name}</strong><small>{c.category || "Life & health"}</small></td><td><Badge>{a?.status || "Available"}</Badge></td><td>{(c.productLines || []).join(", ") || "—"}</td><td>{a?.portalUrl ? <a href={a.portalUrl} target="_blank" rel="noreferrer">Open portal</a> : "Not connected"}</td><td><button className="crm-row-action" onClick={() => window.gotoPage?.("carrier-appointments")}>Manage</button></td></tr>; })}</tbody></table>{!rows.length && <div className="crm-empty">No agency carriers selected yet.</div>}</div>;
  }

  window.PageCrmWorkspace = PageCrmWorkspace;
})();
