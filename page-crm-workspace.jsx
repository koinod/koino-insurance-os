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

  const policyAllocations = (policyId, allocations) => (allocations || []).filter(a => a.policy_id === policyId);
  const allocatedCents = (policyId, allocations) => policyAllocations(policyId, allocations).reduce((n, a) => n + (Number(a.amount_cents) || 0), 0);
  const policyTags = (policy, allocations) => {
    if (!policy) return [];
    const tags = [];
    if (policy.issuedAt) tags.push({ label: `Issued ${dateLabel(policy.issuedAt)}`, tone: "good" });
    if (policy.initialDraftDate) tags.push({ label: `Draft ${dateLabel(policy.initialDraftDate)}`, tone: "neutral" });
    const paid = allocatedCents(policy.id, allocations);
    if (paid > 0) tags.push({ label: `Deposited ${money(paid / 100)}`, tone: "good" });
    else if (policy.expectedCommission > 0) tags.push({ label: "Awaiting deposit", tone: "warn" });
    if (policy.effectiveAt) tags.push({ label: `Effective ${dateLabel(policy.effectiveAt)}`, tone: "neutral" });
    return tags;
  };

  function PolicyTags({ policy, allocations }) {
    const tags = policyTags(policy, allocations);
    return tags.length ? <div className="crm-row-tags">{tags.map(tag => <Badge key={tag.label} tone={tag.tone}>{tag.label}</Badge>)}</div> : null;
  }

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
    const [DealModalComponent, setDealModalComponent] = useState(() => window.DealWriteModal || null);
    const [loadTimedOut, setLoadTimedOut] = useState(false);
    useEffect(() => {
      if (window.DealWriteModal && !DealModalComponent) setDealModalComponent(() => window.DealWriteModal);
      if (DealModalComponent) return;
      let attempts = 0;
      const ready = () => { if (window.DealWriteModal) setDealModalComponent(() => window.DealWriteModal); };
      const timer = setInterval(() => {
        ready();
        attempts += 1;
        if (attempts >= 100) { clearInterval(timer); setLoadTimedOut(true); }
      }, 50);
      window.addEventListener("deal-write:ready", ready);
      return () => { clearInterval(timer); window.removeEventListener("deal-write:ready", ready); };
    }, [DealModalComponent]);
    if (!DealModalComponent) return <Modal title="Write deal" onClose={onClose}><div className="crm-deal-loader"><strong>{loadTimedOut ? "Deal form could not load" : "Loading deal form…"}</strong><span>{loadTimedOut ? "The form script did not register. Retry before leaving CRM." : "Preparing the policy workspace."}</span>{loadTimedOut && <button className="btn btn-primary" onClick={() => { setLoadTimedOut(false); setDealModalComponent(window.DealWriteModal || null); }}>Retry</button>}</div></Modal>;
    return React.createElement(DealModalComponent, {
      key: lead?.id || "new-deal",
      defaultLeadId: lead?.id || "",
      onClose,
      onWritten: () => { onSaved?.(); onClose?.(); },
    });
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

  function PolicyMilestoneModal({ policy, onClose, onSaved }) {
    const [form, setForm] = useState({
      status: policy.status || "pending",
      issuedAt: policy.issuedAt || "",
      initialDraftDate: policy.initialDraftDate || "",
      effectiveAt: policy.effectiveAt || "",
    });
    const [saving, setSaving] = useState(false);
    const save = async (e) => {
      e.preventDefault();
      const sb = window.getSupabase?.();
      if (!sb || !window.AppData?.LIVE) return window.toast?.("Milestones require a live agency session.", "error");
      setSaving(true);
      try {
        const { error } = await sb.from("policies").update({
          status: form.status,
          issued_at: form.issuedAt || null,
          initial_draft_date: form.initialDraftDate || null,
          effective_at: form.effectiveAt || null,
          updated_at: new Date().toISOString(),
        }).eq("id", policy.id);
        if (error) throw error;
        window.toast?.("Deal milestones saved.", "success");
        window.dispatchEvent(new Event("data:hydrated"));
        onSaved?.(); onClose();
      } catch (err) { window.toast?.(err.message || "Milestones could not be saved.", "error"); }
      finally { setSaving(false); }
    };
    return <Modal title="Deal milestones" onClose={onClose}>
      <form className="crm-form" onSubmit={save}>
        <div className="crm-form-context"><strong>{policy.product || "Policy"}</strong><span>{policy.policyNumber || "No policy number"}</span></div>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="pending">Pending</option><option value="app_in">App in</option><option value="issued">Issued</option><option value="active">Active</option><option value="lapsed">Lapsed</option><option value="cancelled">Cancelled</option></select></label>
        <div className="crm-form-grid"><label>Issue / pay date<input type="date" value={form.issuedAt} onChange={e => setForm({ ...form, issuedAt: e.target.value })} /></label><label>First draft date<input type="date" value={form.initialDraftDate} onChange={e => setForm({ ...form, initialDraftDate: e.target.value })} /></label></div>
        <label>Effective date<input type="date" value={form.effectiveAt} onChange={e => setForm({ ...form, effectiveAt: e.target.value })} /></label>
        <div className="crm-form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save milestones"}</button></div>
      </form>
    </Modal>;
  }

  function PolicyDepositModal({ policy, carrier, agencyId, deposits, allocations, onClose, onSaved }) {
    const me = (window.me && window.me()) || {};
    const matching = deposits.filter(d => d.carrier_id === policy.carrierId);
    const [depositId, setDepositId] = useState(matching[0]?.id || "new");
    const [amount, setAmount] = useState(policy.expectedCommission ? String(policy.expectedCommission) : String(policy.ap || ""));
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [kind, setKind] = useState("advance");
    const [saving, setSaving] = useState(false);
    const save = async (e) => {
      e.preventDefault();
      const amountCents = Math.round(Number(amount) * 100);
      if (!amountCents) return window.toast?.("Enter the deposited amount.", "error");
      const sb = window.getSupabase?.();
      if (!sb || !window.AppData?.LIVE) return window.toast?.("Deposits require a live agency session.", "error");
      const existing = matching.find(d => d.id === depositId);
      const prior = existing ? allocations.filter(a => a.deposit_id === existing.id && a.policy_id !== policy.id).map(a => ({ policy_id: a.policy_id, rep_id: a.rep_id, kind: a.kind, amount_cents: a.amount_cents, notes: a.notes })) : [];
      const samePolicy = existing ? allocations.filter(a => a.deposit_id === existing.id && a.policy_id === policy.id).reduce((n, a) => n + (Number(a.amount_cents) || 0), 0) : 0;
      setSaving(true);
      try {
        const payload = {
          id: existing?.id || null,
          agency_id: agencyId,
          carrier_id: carrier?.id || policy.carrierId,
          rep_id: policy.owner || me.rep_id || null,
          deposit_date: existing?.deposit_date || date,
          gross_cents: existing ? existing.gross_cents : amountCents,
          statement_ref: existing?.statement_ref || null,
          notes: existing?.notes || null,
          allocations: [...prior, { policy_id: policy.id, rep_id: policy.owner || me.rep_id || null, kind, amount_cents: samePolicy + amountCents, notes: "Marked from CRM" }],
        };
        const { error } = await sb.rpc("crm_save_deposit", { p_payload: payload });
        if (error) throw error;
        window.toast?.("Deposit allocated to this deal.", "success");
        window.dispatchEvent(new Event("data:hydrated"));
        onSaved?.(); onClose();
      } catch (err) { window.toast?.(err.message || "Deposit could not be allocated.", "error"); }
      finally { setSaving(false); }
    };
    return <Modal title="Mark deposited" onClose={onClose}>
      <form className="crm-form" onSubmit={save}>
        <div className="crm-form-context"><strong>{policy.product || "Policy"}</strong><span>{carrier?.name || "Carrier pending"}</span></div>
        <label>Carrier deposit<select value={depositId} onChange={e => setDepositId(e.target.value)}><option value="new">New deposit record</option>{matching.map(d => <option key={d.id} value={d.id}>{dateLabel(d.deposit_date)} · {money((Number(d.gross_cents) || 0) / 100)}</option>)}</select></label>
        <div className="crm-form-grid"><label>Amount allocated<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Commission type<select value={kind} onChange={e => setKind(e.target.value)}><option value="advance">Advance</option><option value="as_earned">As earned</option><option value="trail">Trail</option><option value="other">Other</option></select></label></div>
        {depositId === "new" && <label>Deposit date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
        <div className="crm-form-note">Deposited tags are based on the actual deposit allocation ledger.</div>
        <div className="crm-form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Mark deposited"}</button></div>
      </form>
    </Modal>;
  }

  function ClientDrawer({ record, onClose, carriers, agencyId, moneyRows, onSaved }) {
    if (!record) return null;
    const [milestonePolicy, setMilestonePolicy] = React.useState(null);
    const [depositPolicy, setDepositPolicy] = React.useState(null);
    return <div className="crm-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="crm-drawer"><div className="crm-drawer-head"><div><div className="crm-eyebrow">Client</div><h2>{record.client?.name || record.lead?.lead || "Unnamed"}</h2><div className="crm-muted">{record.client?.phone || record.lead?.phone || "No phone"}{record.client?.email ? ` · ${record.client.email}` : ""}</div></div><button className="crm-icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="crm-drawer-actions"><button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("crm:write-deal", { detail: { lead: record.lead } }))}>Write deal</button><button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("incall:open", { detail: { lead: record.lead } }))}>Call</button></div>
        <div className="crm-detail-section"><div className="crm-detail-label">Pipeline</div><div className="crm-detail-row"><span>Status</span><Badge>{record.lead?.stage || record.policy?.status || "Lead"}</Badge></div><div className="crm-detail-row"><span>Owner</span><strong>{record.owner?.name || "Unassigned"}</strong></div><div className="crm-detail-row"><span>Next action</span><strong>{record.lead?.next || "—"}</strong></div></div>
        <div className="crm-detail-section"><div className="crm-detail-label">Policies</div>{record.policies.length ? record.policies.map(p => <div className="crm-policy-row" key={p.id}><div><strong>{p.product || "Policy"}</strong><div className="crm-muted">{(carriers.find(c => c.id === p.carrierId) || {}).name || "Carrier pending"} · {p.policyNumber || "No number"}</div><PolicyTags policy={p} allocations={moneyRows?.allocations} /></div><div className="crm-policy-right"><Badge>{p.status || "pending"}</Badge><strong>{money(p.ap)}</strong><div className="crm-policy-actions"><button className="crm-row-action" onClick={() => setMilestonePolicy(p)}>Milestones</button><button className="crm-row-action" onClick={() => setDepositPolicy(p)}>Deposit</button></div></div></div>) : <div className="crm-empty-inline">No policies yet.</div>}</div>
        <div className="crm-detail-section"><div className="crm-detail-label">Financial snapshot</div><div className="crm-detail-stats"><div><span>AP</span><strong>{money(record.ap)}</strong></div><div><span>Expected comp</span><strong>{money(record.expectedComp)}</strong></div><div><span>Policies</span><strong>{record.policies.length}</strong></div></div></div>
      </aside>
      {milestonePolicy && <PolicyMilestoneModal policy={milestonePolicy} onClose={() => setMilestonePolicy(null)} onSaved={onSaved} />}
      {depositPolicy && <PolicyDepositModal policy={depositPolicy} carrier={carriers.find(c => c.id === depositPolicy.carrierId)} agencyId={agencyId} deposits={moneyRows?.deposits || []} allocations={moneyRows?.allocations || []} onClose={() => setDepositPolicy(null)} onSaved={onSaved} />}
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
      {view === "pipeline" && <PipelineView rows={filtered} carrierById={carrierById} allocations={moneyRows.allocations} onSelect={setActive} onDeal={r => { setActive(r); setModal("deal"); }} />}
      {view === "clients" && <ClientsView rows={filtered.filter(r => r.client)} allocations={moneyRows.allocations} onSelect={setActive} />}
      {view === "money" && <MoneyView rows={moneyRows} carrierById={carrierById} policyById={Object.fromEntries(policies.map(p => [p.id, p]))} loading={loadingMoney} dateRange={dateRange} />}
      {view === "carriers" && <CarriersView carriers={carriers} appts={appts} />}
      {active && <ClientDrawer record={active} onClose={() => setActive(null)} carriers={carriers} agencyId={agencyId} moneyRows={moneyRows} onSaved={() => { setActive(null); refresh(); }} />}
      {modal === "lead" && <LeadModal onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "deal" && <DealModal lead={active?.lead} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "deposit" && <DepositModal carriers={carriers.filter(c => appts.some(a => a.carrierId === c.id) || !appts.length)} agencyId={agencyId} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "expense" && <ExpenseModal agencyId={agencyId} role={role} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>;
  }

  function PipelineView({ rows, carrierById, allocations, onSelect, onDeal }) {
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Lead / client</th><th>Stage</th><th>Owner</th><th>Product / carrier</th><th>Next action</th><th className="num">AP</th><th></th></tr></thead><tbody>{rows.map(r => <tr key={r.id} onClick={() => onSelect(r)}><td><strong>{r.client?.name || r.lead.lead || "Unnamed"}</strong><small>{r.lead.phone || r.lead.email || "No contact info"}</small><PolicyTags policy={r.policies[0]} allocations={allocations} /></td><td><Badge>{r.lead.stage || "New"}</Badge></td><td>{r.owner?.name || "Unassigned"}</td><td>{r.lead.product || r.policies[0]?.product || "—"}<small>{r.policies[0]?.carrierId ? carrierById[r.policies[0].carrierId]?.name || "Carrier" : "No policy yet"}</small></td><td>{r.lead.next || "—"}</td><td className="num">{money(r.ap)}</td><td><button className="crm-row-action" onClick={e => { e.stopPropagation(); onDeal(r); }}>Write deal</button></td></tr>)}</tbody></table>{!rows.length && <div className="crm-empty">No pipeline records match this view.</div>}</div>;
  }

  function ClientsView({ rows, allocations, onSelect }) {
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Client</th><th>Policies</th><th>Status / tags</th><th>Owner</th><th className="num">AP</th><th className="num">Expected comp</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} onClick={() => onSelect(r)}><td><strong>{r.client.name}</strong><small>{r.client.phone || r.client.email || "No contact info"}</small></td><td>{r.policies.length}</td><td><Badge>{r.policies[0]?.status || r.lead.stage || "Lead"}</Badge><PolicyTags policy={r.policies[0]} allocations={allocations} /></td><td>{r.owner?.name || "Unassigned"}</td><td className="num">{money(r.ap)}</td><td className="num">{money(r.expectedComp)}</td></tr>)}</tbody></table>{!rows.length && <div className="crm-empty">No clients match this view.</div>}</div>;
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
