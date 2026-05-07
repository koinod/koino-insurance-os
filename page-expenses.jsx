/* page-expenses.jsx — Owner expenses + lead-spend attribution.
 *
 * Three views, role-gated:
 *   - Owner   → full ledger, add/edit/delete, reimbursement workflow,
 *               per-source ROAS, per-rep spend, payment-source breakdown.
 *   - Manager → read of downline scope + ability to add lead-spend &
 *               recruiting-ad expenses (per migration 0017 RLS policy).
 *   - Rep     → "spend on me" — what was allocated to my book + my own OOP
 *               and pending reimbursements.
 *
 * Data flow: pulls public.agency_expenses + expense_allocations on mount via
 * supabase client. No window.AppData hydration dependency, so the page works
 * before data.jsx has finished loading the rest of the world.
 */

(function () {
  const { useState, useEffect, useMemo, useCallback } = React;

  const KIND_LABEL = {
    lead_spend: "Lead spend",
    recruiting_ad: "Recruiting ads",
    marketing: "Marketing",
    saas: "Software / SaaS",
    payroll: "Payroll",
    commissions: "Commissions paid",
    rent: "Rent",
    equipment: "Equipment",
    licensing: "Licensing",
    training: "Training",
    travel: "Travel",
    meals: "Meals",
    professional_services: "Professional services",
    other: "Other",
  };
  const KIND_COLOR = {
    lead_spend: "var(--accent-action)",
    recruiting_ad: "var(--accent-status)",
    marketing: "var(--accent-status)",
    saas: "var(--text-tertiary)",
    payroll: "var(--state-warning)",
    commissions: "var(--accent-money)",
  };
  const PAID_BY_LABEL = {
    agency: "Agency account",
    owner_personal: "Owner · personal",
    owner_amex: "Owner · Amex",
    llc_card: "LLC card",
    rep_oop: "Rep · out of pocket",
    manager_oop: "Manager · out of pocket",
    other: "Other",
  };

  const fmt$ = (cents) => "$" + (Math.round((cents || 0) / 100)).toLocaleString();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  function useExpenses(agencyId) {
    const [rows, setRows] = useState(null);   // null = loading
    const [err, setErr]   = useState(null);

    const reload = useCallback(async () => {
      if (!agencyId) return;
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("Supabase not initialized");
        const { data, error } = await sb
          .from("agency_expenses")
          .select("*")
          .eq("agency_id", agencyId)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        console.error("[expenses] load failed", e);
        setErr(e.message || String(e));
        setRows([]);
      }
    }, [agencyId]);

    useEffect(() => { reload(); }, [reload]);
    return { rows, err, reload };
  }

  function useLeadSources(agencyId) {
    const [sources, setSources] = useState([]);
    useEffect(() => {
      if (!agencyId) return;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) return;
          const { data } = await sb.from("agency_lead_sources")
            .select("id, name, vendor, cost_per_lead_cents, active")
            .eq("agency_id", agencyId)
            .order("name");
          setSources(data || []);
        } catch {}
      })();
    }, [agencyId]);
    return sources;
  }

  function PageExpenses({ role = "owner" }) {
    const me = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;
    const { rows: expenses, err, reload } = useExpenses(agencyId);
    const sources = useLeadSources(agencyId);
    const [filter, setFilter] = useState({ kind: "all", paid_by: "all", period: "MTD" });
    const [showAdd, setShowAdd] = useState(false);
    const [editing, setEditing] = useState(null);

    if (!me) {
      return <div className="page-pad"><div className="panel" style={{ padding: 32, color: "var(--text-tertiary)" }}>Loading identity…</div></div>;
    }

    const isOwner   = role === "owner" || role === "admin" || me.role === "owner" || me.role === "admin";
    const isManager = role === "manager" || (me.role === "manager");
    const myRepId   = me.rep_id;
    const myDownline = (typeof window !== "undefined" && window.scopeRepIds && window.scopeRepIds()) || null;

    // Filter by period
    const cutoff = useMemo(() => {
      const now = new Date();
      if (filter.period === "MTD") return new Date(now.getFullYear(), now.getMonth(), 1);
      if (filter.period === "YTD") return new Date(now.getFullYear(), 0, 1);
      if (filter.period === "T30") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      if (filter.period === "T90") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
      return new Date(0);
    }, [filter.period]);

    const visible = useMemo(() => {
      if (!expenses) return null;
      return expenses.filter(e => {
        if (filter.kind !== "all" && e.kind !== filter.kind) return false;
        if (filter.paid_by !== "all" && e.paid_by !== filter.paid_by) return false;
        if (e.paid_at && new Date(e.paid_at) < cutoff) return false;
        // Manager scope: only their downline OOP or expenses they created
        if (isManager && !isOwner) {
          if (e.paid_by_rep_id && myDownline && !myDownline.includes(e.paid_by_rep_id) && e.paid_by_rep_id !== myRepId) {
            return false;
          }
        }
        // Rep view: only their own
        if (!isOwner && !isManager) {
          if (e.paid_by_rep_id !== myRepId) return false;
        }
        return true;
      });
    }, [expenses, filter, cutoff, isOwner, isManager, myRepId, myDownline]);

    const totals = useMemo(() => {
      if (!visible) return null;
      const total = visible.reduce((a, e) => a + (e.amount_cents || 0), 0);
      const byKind = {};
      const byPaidBy = {};
      const reimbPending = visible.filter(e => e.reimbursable && !e.reimbursed_at).reduce((a, e) => a + (e.amount_cents || 0), 0);
      for (const e of visible) {
        byKind[e.kind] = (byKind[e.kind] || 0) + (e.amount_cents || 0);
        byPaidBy[e.paid_by] = (byPaidBy[e.paid_by] || 0) + (e.amount_cents || 0);
      }
      return { total, byKind, byPaidBy, reimbPending, count: visible.length };
    }, [visible]);

    const exportCsv = () => {
      if (!visible) return;
      const cols = ["paid_at","kind","description","vendor","amount","paid_by","paid_by_rep_id","reimbursable","reimbursed_at","lead_source_id","notes"];
      const rows = [cols.join(",")];
      for (const e of visible) {
        const vals = [
          e.paid_at || "",
          e.kind,
          (e.description || "").replace(/"/g, '""'),
          (e.vendor || "").replace(/"/g, '""'),
          ((e.amount_cents || 0) / 100).toFixed(2),
          e.paid_by,
          e.paid_by_rep_id || "",
          e.reimbursable ? "yes" : "no",
          e.reimbursed_at || "",
          e.lead_source_id || "",
          (e.notes || "").replace(/"/g, '""').replace(/\n/g, " "),
        ].map(v => `"${v}"`);
        rows.push(vals.join(","));
      }
      const blob = new Blob([rows.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `expenses_${filter.period}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Expenses</div>
            <div className="page-sub">
              {isOwner ? "Full ledger" : isManager ? "Downline + my spend" : "Allocated to me"}
              {totals && <> · {totals.count} entries · {fmt$(totals.total)} {filter.period}</>}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Shared.SectionPill
              items={[{k:"T30",l:"30d"},{k:"MTD",l:"MTD"},{k:"T90",l:"90d"},{k:"YTD",l:"YTD"},{k:"ALL",l:"All"}]}
              value={filter.period}
              onChange={(v) => setFilter(f => ({ ...f, period: v }))}
              dense
            />
            {visible && visible.length > 0 && (
              <button className="btn btn-ghost" onClick={exportCsv}><Icons.ArrowUpRight size={12}/> Export CSV</button>
            )}
            {(isOwner || isManager) && (
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                <Icons.Plus size={13}/> Log expense
              </button>
            )}
          </div>
        </div>

        {err && (
          <div className="panel" style={{ padding: 14, marginBottom: 14, background: "color-mix(in oklch, var(--state-danger) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)", color: "var(--state-danger)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span>Could not load expenses: {err}</span>
            <button className="btn btn-ghost" onClick={reload}>Retry</button>
          </div>
        )}

        <div className="panel" style={{ padding: 10, marginBottom: 14, background: "color-mix(in oklch, var(--accent-status) 6%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-status) 25%, transparent)", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <Icons.Shield size={11} style={{ color: "var(--accent-status)" }}/>{" "}
          <strong>Payroll &amp; producer comp tracked in your existing payroll system</strong> — Expenses captures the rest: lead spend, ads, tools, rent, reimbursements. Comp data lives in P&amp;L → Comp tab (read-only rollup from your payroll provider).
        </div>

        {/* KPI row */}
        {totals && (
          <div className="kpi-row">
            <Shared.KpiCard hero label={`Total spend · ${filter.period}`} value={fmt$(totals.total).slice(1)} prefix="$" sub={`${totals.count} entries`}/>
            <Shared.KpiCard label="Lead spend" value={fmt$(totals.byKind.lead_spend || 0).slice(1)} prefix="$"/>
            <Shared.KpiCard label="Recruiting + marketing" value={fmt$((totals.byKind.recruiting_ad || 0) + (totals.byKind.marketing || 0)).slice(1)} prefix="$"/>
            <Shared.KpiCard label="Pending reimbursements" value={fmt$(totals.reimbPending).slice(1)} prefix="$" trend={totals.reimbPending > 0 ? "up" : undefined}/>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginTop: 14 }}>
          {/* Ledger */}
          <div className="panel">
            <div className="panel-h">
              <h3>Ledger</h3>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <Shared.Select
                  value={filter.kind}
                  onChange={(v) => setFilter(f => ({ ...f, kind: v }))}
                  options={[{ v: "all", l: "All kinds" }, ...Object.keys(KIND_LABEL).map(k => ({ v: k, l: KIND_LABEL[k] }))]}
                />
                <Shared.Select
                  value={filter.paid_by}
                  onChange={(v) => setFilter(f => ({ ...f, paid_by: v }))}
                  options={[{ v: "all", l: "All payers" }, ...Object.keys(PAID_BY_LABEL).map(k => ({ v: k, l: PAID_BY_LABEL[k] }))]}
                />
              </div>
            </div>
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "80px 130px 1.6fr 1fr 110px 110px 60px" }}>
                <div>Date</div><div>Kind</div><div>Description</div><div>Paid by</div>
                <div className="tabular" style={{ textAlign: "right" }}>Amount</div>
                <div>Reimburse</div><div></div>
              </div>
              {visible == null && (
                <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>Loading…</div>
              )}
              {visible && visible.length === 0 && (
                <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                  No expenses match the current filters.
                  {(isOwner || isManager) && <> <button className="btn btn-ghost" onClick={() => setShowAdd(true)} style={{ padding: "2px 8px" }}>Log one →</button></>}
                </div>
              )}
              {visible && visible.map(e => (
                <div key={e.id} className="row" style={{ gridTemplateColumns: "80px 130px 1.6fr 1fr 110px 110px 60px", cursor: isOwner ? "pointer" : "default" }}
                     onClick={() => isOwner && setEditing(e)}>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{fmtDate(e.paid_at)}</div>
                  <div>
                    <span className="chip" style={{ fontSize: 10.5, color: KIND_COLOR[e.kind] || "var(--text-secondary)", borderColor: `color-mix(in oklch, ${KIND_COLOR[e.kind] || "var(--text-tertiary)"} 30%, transparent)`, background: `color-mix(in oklch, ${KIND_COLOR[e.kind] || "var(--text-tertiary)"} 10%, transparent)` }}>
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12.5 }}>{e.description || e.vendor || "(no description)"}</div>
                    {e.vendor && e.description && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.vendor}</div>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {PAID_BY_LABEL[e.paid_by] || e.paid_by}
                    {e.paid_by_rep_id && <div style={{ fontSize: 10.5 }}>{e.paid_by_rep_id}</div>}
                  </div>
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{fmt$(e.amount_cents)}</div>
                  <div>
                    {e.reimbursable
                      ? (e.reimbursed_at
                          ? <span style={{ fontSize: 11, color: "var(--accent-money)" }}>✓ Paid back</span>
                          : <span style={{ fontSize: 11, color: "var(--state-warning)" }}>Pending</span>)
                      : <span style={{ fontSize: 11, color: "var(--text-quaternary)" }}>—</span>}
                  </div>
                  <div onClick={(ev) => ev.stopPropagation()}>
                    {isOwner && (
                      <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 11 }} onClick={() => setEditing(e)}>Edit</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right rail: breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <BreakdownPanel title="By kind" data={totals?.byKind} labels={KIND_LABEL}/>
            <BreakdownPanel title="By payment source" data={totals?.byPaidBy} labels={PAID_BY_LABEL}/>
            {isOwner && <ReimburseQueue expenses={visible} onUpdate={reload}/>}
            {isOwner && <PerSourceRoasPanel agencyId={agencyId} expenses={visible} sources={sources}/>}
          </div>
        </div>

        {showAdd && (
          <ExpenseModal
            agencyId={agencyId}
            sources={sources}
            myRepId={myRepId}
            isOwner={isOwner}
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); reload(); }}
          />
        )}
        {editing && (
          <ExpenseModal
            existing={editing}
            agencyId={agencyId}
            sources={sources}
            myRepId={myRepId}
            isOwner={isOwner}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); reload(); }}
          />
        )}
      </div>
    );
  }

  function BreakdownPanel({ title, data, labels }) {
    if (!data) return null;
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;
    const total = entries.reduce((a, [, v]) => a + v, 0);
    if (entries.length === 0) return null;
    return (
      <div className="panel">
        <div className="panel-h"><h3>{title}</h3><span className="meta">{fmt$(total)}</span></div>
        <div style={{ padding: 14 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "1.4fr 70px 1fr", padding: "5px 0", alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>{labels[k] || k}</span>
              <span className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{fmt$(v)}</span>
              <div style={{ height: 6, background: "var(--bg-raised)", borderRadius: 3, marginLeft: 14, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((v / max) * 100)}%`, height: "100%", background: "var(--accent-money)" }}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ReimburseQueue({ expenses, onUpdate }) {
    const pending = (expenses || []).filter(e => e.reimbursable && !e.reimbursed_at);
    if (pending.length === 0) return null;
    const total = pending.reduce((a, e) => a + (e.amount_cents || 0), 0);

    const markPaid = async (e) => {
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) return;
        await sb.from("agency_expenses").update({
          reimbursed_at: new Date().toISOString(),
          reimbursed_amount_cents: e.amount_cents,
        }).eq("id", e.id);
        window.toast && window.toast("Marked reimbursed", "success");
        onUpdate && onUpdate();
      } catch (err) {
        window.toast && window.toast(`Failed: ${err.message}`, "error");
      }
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Bell size={13} style={{ color: "var(--state-warning)" }}/>
          <h3>Reimbursements pending</h3>
          <span className="meta">{fmt$(total)}</span>
        </div>
        <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.slice(0, 6).map(e => (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", alignItems: "center", padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 6, fontSize: 12 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{e.description || e.vendor}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {e.paid_by_rep_id || PAID_BY_LABEL[e.paid_by]} · {fmtDate(e.paid_at)}
                </div>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 500 }}>{fmt$(e.amount_cents)}</div>
              <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11, justifyContent: "center" }} onClick={() => markPaid(e)}>
                Pay back
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function PerSourceRoasPanel({ agencyId, expenses, sources }) {
    if (!expenses || expenses.length === 0 || sources.length === 0) return null;
    const bySource = {};
    for (const e of expenses) {
      if (e.kind !== "lead_spend") continue;
      const sid = e.lead_source_id || "untagged";
      bySource[sid] = (bySource[sid] || 0) + (e.amount_cents || 0);
    }
    const rows = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
    if (rows.length === 0) return null;

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.TrendingUp size={13}/>
          <h3>Lead spend by source</h3>
          <span className="meta">tag spend → ROAS</span>
        </div>
        <div className="list">
          <div className="list-h" style={{ gridTemplateColumns: "1.4fr 90px 80px" }}>
            <div>Source</div>
            <div className="tabular" style={{ textAlign: "right" }}>Spend</div>
            <div className="tabular" style={{ textAlign: "right" }}>%</div>
          </div>
          {rows.map(([sid, cents]) => {
            const source = sources.find(s => s.id === sid);
            const total = rows.reduce((a, [, c]) => a + c, 0);
            const pct = total ? Math.round((cents / total) * 100) : 0;
            return (
              <div key={sid} className="row" style={{ gridTemplateColumns: "1.4fr 90px 80px" }}>
                <div style={{ fontSize: 12.5 }}>
                  {source ? source.name : <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>untagged</span>}
                  {source?.vendor && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{source.vendor}</div>}
                </div>
                <div className="tabular" style={{ textAlign: "right" }}>{fmt$(cents)}</div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function ExpenseModal({ existing, agencyId, sources, myRepId, isOwner, onClose, onSaved }) {
    const initial = existing ? {
      kind: existing.kind || "lead_spend",
      amount: ((existing.amount_cents || 0) / 100).toFixed(2),
      description: existing.description || "",
      vendor: existing.vendor || "",
      paid_at: (existing.paid_at || new Date().toISOString().slice(0, 10)),
      paid_by: existing.paid_by || "agency",
      paid_by_rep_id: existing.paid_by_rep_id || "",
      reimbursable: !!existing.reimbursable,
      lead_source_id: existing.lead_source_id || "",
      notes: existing.notes || "",
    } : {
      kind: "lead_spend",
      amount: "",
      description: "",
      vendor: "",
      paid_at: new Date().toISOString().slice(0, 10),
      paid_by: "agency",
      paid_by_rep_id: "",
      reimbursable: false,
      lead_source_id: "",
      notes: "",
    };
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const REPS = (window.AppData && window.AppData.REPS) || [];

    const submit = async (e) => {
      e.preventDefault();
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) { window.toast && window.toast("Enter an amount", "warn"); return; }
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        const row = {
          agency_id: agencyId,
          kind: form.kind,
          amount_cents: Math.round(amount * 100),
          description: form.description || null,
          vendor: form.vendor || null,
          paid_at: form.paid_at,
          paid_by: form.paid_by,
          paid_by_rep_id: form.paid_by_rep_id || null,
          reimbursable: !!form.reimbursable,
          lead_source_id: form.lead_source_id || null,
          notes: form.notes || null,
        };
        if (existing) {
          const { error } = await sb.from("agency_expenses").update(row).eq("id", existing.id);
          if (error) throw error;
          window.toast && window.toast("Expense updated", "success");
        } else {
          const { error } = await sb.from("agency_expenses").insert(row);
          if (error) throw error;
          window.toast && window.toast("Expense logged", "success");
        }
        onSaved && onSaved();
      } catch (err) {
        window.toast && window.toast(`Save failed: ${err.message || err}`, "error");
      } finally {
        setBusy(false);
      }
    };

    const remove = async () => {
      if (!existing) return;
      if (!window.confirm("Delete this expense?")) return;
      try {
        const sb = window.getSupabase && window.getSupabase();
        await sb.from("agency_expenses").delete().eq("id", existing.id);
        window.toast && window.toast("Expense deleted", "success");
        onSaved && onSaved();
      } catch (err) {
        window.toast && window.toast(`Delete failed: ${err.message}`, "error");
      }
    };

    return (
      <Shared.Modal title={existing ? "Edit expense" : "Log expense"} width={620} onClose={onClose} actions={
        <>
          {existing && isOwner && <button className="btn btn-ghost" style={{ color: "var(--state-danger)" }} onClick={remove}>Delete</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : existing ? "Save" : "Log expense"}
          </button>
        </>
      }>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Kind">
              <Shared.Select value={form.kind} onChange={(v) => set("kind", v)}
                options={Object.keys(KIND_LABEL).map(k => ({ v: k, l: KIND_LABEL[k] }))}/>
            </Shared.Field>
            <Shared.Field label="Amount ($) *">
              <input className="text-input" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="500.00" required autoFocus={!existing}/>
            </Shared.Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Vendor">
              <input className="text-input" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="FB Ads, Convoso, AHIP, …"/>
            </Shared.Field>
            <Shared.Field label="Date paid">
              <input className="text-input" type="date" value={form.paid_at} onChange={(e) => set("paid_at", e.target.value)}/>
            </Shared.Field>
          </div>
          <Shared.Field label="Description">
            <input className="text-input" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What did this dollar buy?"/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Shared.Field label="Paid by (account)">
              <Shared.Select value={form.paid_by} onChange={(v) => set("paid_by", v)}
                options={Object.keys(PAID_BY_LABEL).map(k => ({ v: k, l: PAID_BY_LABEL[k] }))}/>
            </Shared.Field>
            {(form.paid_by === "rep_oop" || form.paid_by === "manager_oop") && REPS.length > 0 && (
              <Shared.Field label="Which rep paid OOP">
                <Shared.Select value={form.paid_by_rep_id} onChange={(v) => set("paid_by_rep_id", v)}
                  options={[{ v: "", l: "— Select rep —" }, ...REPS.map(r => ({ v: r.id, l: `${r.name} (${r.id})` }))]}/>
              </Shared.Field>
            )}
          </div>
          {form.kind === "lead_spend" && sources.length > 0 && (
            <Shared.Field label="Tied to lead source (for ROAS)">
              <Shared.Select value={form.lead_source_id} onChange={(v) => set("lead_source_id", v)}
                options={[{ v: "", l: "— Untagged —" }, ...sources.map(s => ({ v: s.id, l: `${s.name}${s.vendor ? ` · ${s.vendor}` : ""}` }))]}/>
            </Shared.Field>
          )}
          {(form.paid_by === "rep_oop" || form.paid_by === "manager_oop") && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={!!form.reimbursable} onChange={(e) => set("reimbursable", e.target.checked)}/>
              Reimbursable — adds to the rep's pending-reimbursement queue
            </label>
          )}
          <Shared.Field label="Notes">
            <textarea className="text-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional context…"/>
          </Shared.Field>
        </form>
      </Shared.Modal>
    );
  }

  window.PageExpenses = PageExpenses;
})();
