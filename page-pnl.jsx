/* page-pnl.jsx — P&L: simple income / expenses / profit ledger.
 *
 * 2026-06-06 (Ian): "PNL should just be a CRM, income, expenses, profit,
 * filtering, easy stuff." Adds a "Summary" tab that unifies carrier_deposits
 * (income) and agency_expenses (expenses) into one filterable transaction
 * table with profit at the top. The existing "Money in" / "Money out" tabs
 * stay as the deep-edit surfaces.
 *
 * Route:  pnl  (set in shared.jsx NAV + app.jsx case "pnl")
 *
 * No projection math, no auto-derived commissions, no per-rep snapshot —
 * everything in Summary is something a person typed in.
 */
(function () {
  const { useState, useEffect, useMemo } = React;

  const fmt$    = Shared.fmtMoneyCents;
  const fmtDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  const DEP_KIND_LABEL = {
    advance:           "Advance",
    as_earned:         "As-earned",
    trail:             "Trail",
    override:          "Override",
    renewal:           "Renewal",
    chargeback_recoup: "Recoup",
    bonus:             "Bonus",
    other:             "Other",
  };

  function periodCutoff(period) {
    const now = new Date();
    switch (period) {
      case "T30": return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      case "MTD": return new Date(now.getFullYear(), now.getMonth(), 1);
      case "T90": return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
      case "YTD": return new Date(now.getFullYear(), 0, 1);
      default:    return new Date(0);
    }
  }

  function PagePnL() {
    const [tab, setTab] = useState(() => {
      try { return localStorage.getItem("repflow.pnl.tab") || "summary"; }
      catch { return "summary"; }
    });
    const setTabPersist = (t) => {
      setTab(t);
      try { localStorage.setItem("repflow.pnl.tab", t); } catch {}
    };

    const Deposits = window.PageDeposits;
    const Expenses = window.PageExpenses;

    return (
      <div className="page-pnl-host" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div role="tablist" aria-label="Accounting"
             style={{ display: "flex", gap: 4, padding: "10px 16px 0", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
          <TabBtn label="Summary"   active={tab === "summary"}  onClick={() => setTabPersist("summary")}/>
          <TabBtn label="Money in"  active={tab === "deposits"} onClick={() => setTabPersist("deposits")}/>
          <TabBtn label="Money out" active={tab === "expenses"} onClick={() => setTabPersist("expenses")}/>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {tab === "summary"  && <PnlSummary/>}
          {tab === "deposits" && (Deposits ? <Deposits/> : <Missing name="PageDeposits"/>)}
          {tab === "expenses" && (Expenses ? <Expenses/> : <Missing name="PageExpenses"/>)}
        </div>
      </div>
    );
  }

  /* ── Summary: unified income+expense ledger with filters ───────────── */
  function PnlSummary() {
    const me = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;
    const [period, setPeriod] = useState("MTD");
    const [kindFilter, setKindFilter] = useState("all"); // all | income | expense
    const [search, setSearch] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [income, setIncome]     = useState(null);
    const [expenses, setExpenses] = useState(null);

    useEffect(() => {
      if (!agencyId) return;
      let cancelled = false;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) { setIncome([]); setExpenses([]); return; }
          const [{ data: deps }, { data: exps }] = await Promise.all([
            sb.from("carrier_deposits")
              .select("id, deposit_date, carrier_id, rep_id, gross_cents, statement_ref, notes")
              .eq("agency_id", agencyId)
              .order("deposit_date", { ascending: false }).limit(1000),
            sb.from("agency_expenses")
              .select("id, paid_at, kind, amount_cents, description, vendor, paid_by_rep_id, notes")
              .eq("agency_id", agencyId)
              .order("paid_at", { ascending: false, nullsFirst: false }).limit(1000),
          ]);
          let allocs = [];
          const ids = (deps || []).map(d => d.id);
          if (ids.length) {
            const { data } = await sb.from("deposit_allocations")
              .select("deposit_id, kind, amount_cents").in("deposit_id", ids);
            allocs = data || [];
          }
          if (cancelled) return;
          const byDep = {};
          for (const a of allocs) (byDep[a.deposit_id] = byDep[a.deposit_id] || []).push(a);
          setIncome((deps || []).map(d => ({ ...d, allocations: byDep[d.id] || [] })));
          setExpenses(exps || []);
        } catch (e) {
          console.warn("[pnl/summary] load failed", e);
          if (!cancelled) { setIncome([]); setExpenses([]); }
        }
      })();
      return () => { cancelled = true; };
    }, [agencyId, refreshKey]);

    // Realtime
    useEffect(() => {
      if (!agencyId) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const bump = () => setRefreshKey(k => k + 1);
      const ch = sb.channel("pnl-summary:" + agencyId)
        .on("postgres_changes", { event: "*", schema: "public", table: "carrier_deposits",    filter: `agency_id=eq.${agencyId}` }, bump)
        .on("postgres_changes", { event: "*", schema: "public", table: "deposit_allocations", filter: `agency_id=eq.${agencyId}` }, bump)
        .on("postgres_changes", { event: "*", schema: "public", table: "agency_expenses",     filter: `agency_id=eq.${agencyId}` }, bump)
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch {} };
    }, [agencyId]);

    if (!me) {
      return <div className="page-pad"><div className="panel" style={{ padding: 32, color: "var(--text-tertiary)" }}>Loading identity…</div></div>;
    }

    const cutoff = useMemo(() => periodCutoff(period), [period]);
    const carriersById = useMemo(() => {
      const list = (window.AppData && window.AppData.CARRIERS) || [];
      return new Map(list.map(c => [c.id, c]));
    }, []);
    const repsById = useMemo(() => {
      const list = (window.AppData && window.AppData.REPS) || [];
      return new Map(list.map(r => [r.id, r]));
    }, []);

    const transactions = useMemo(() => {
      const out = [];
      for (const d of (income || [])) {
        if (d.deposit_date && new Date(d.deposit_date + "T12:00:00") < cutoff) continue;
        const carrier = carriersById.get(d.carrier_id);
        const kindSummary = (d.allocations || []).length
          ? Object.entries(
              (d.allocations || []).reduce((m, a) => { m[a.kind] = (m[a.kind] || 0) + (a.amount_cents || 0); return m; }, {})
            ).sort((a, b) => b[1] - a[1]).map(([k]) => DEP_KIND_LABEL[k] || k).slice(0, 3).join(" · ")
          : "—";
        out.push({
          id: "dep-" + d.id, source: "income",
          date: d.deposit_date,
          kind: kindSummary,
          amount: d.gross_cents || 0,
          who: carrier?.name || d.carrier_id || "—",
          note: d.statement_ref || d.notes || "",
        });
      }
      for (const e of (expenses || [])) {
        if (e.paid_at && new Date(e.paid_at + "T12:00:00") < cutoff) continue;
        const rep = repsById.get(e.paid_by_rep_id);
        out.push({
          id: "exp-" + e.id, source: "expense",
          date: e.paid_at,
          kind: (e.kind || "other").replace(/_/g, " "),
          amount: -(e.amount_cents || 0),
          who: e.vendor || (rep ? (rep.fullName || rep.handle) : (e.description || "—")),
          note: e.description || e.notes || "",
        });
      }
      const q = search.trim().toLowerCase();
      const filtered = out.filter(r => {
        if (kindFilter === "income"  && r.source !== "income") return false;
        if (kindFilter === "expense" && r.source !== "expense") return false;
        if (q && !(`${r.who} ${r.kind} ${r.note}`.toLowerCase().includes(q))) return false;
        return true;
      });
      return filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    }, [income, expenses, cutoff, carriersById, repsById, search, kindFilter]);

    const totals = useMemo(() => {
      let inc = 0, exp = 0;
      for (const t of transactions) {
        if (t.amount >= 0) inc += t.amount;
        else exp += -t.amount;
      }
      return { income: inc, expenses: exp, profit: inc - exp };
    }, [transactions]);

    const loading = income === null || expenses === null;

    const exportCsv = () => {
      const cols = ["date","type","kind","amount","who","note"];
      const lines = [cols.join(",")];
      for (const t of transactions) {
        lines.push([
          t.date || "", t.source, t.kind,
          (t.amount / 100).toFixed(2),
          (t.who || "").replace(/"/g, '""'),
          (t.note || "").replace(/"/g, '""').replace(/\n/g, " "),
        ].map(v => `"${v}"`).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pnl_${period.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    const handleRowClick = (t) => {
      const setTab = (k) => { try { localStorage.setItem("repflow.pnl.tab", k); } catch {} ; window.location.reload(); };
      if (t.source === "income") setTab("deposits");
      else setTab("expenses");
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">P&amp;L · Summary</div>
            <div className="page-sub">
              Income · expenses · profit · what you logged
              {!loading && <> · {transactions.length} {period} txns</>}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <Shared.SectionPill
              items={[{k:"T30",l:"30d"},{k:"MTD",l:"MTD"},{k:"T90",l:"90d"},{k:"YTD",l:"YTD"},{k:"ALL",l:"All"}]}
              value={period} onChange={setPeriod} dense
            />
            {transactions.length > 0 && (
              <button className="btn btn-ghost" onClick={exportCsv} title="Export CSV"><Icons.ArrowUpRight size={12}/> CSV</button>
            )}
          </div>
        </div>

        {/* Inline summary: Income · Expenses · Profit · Margin */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
          <span><span style={{ color: "var(--text-tertiary)" }}>Income</span> <strong style={{ color: "var(--accent-money)", fontSize: 15 }}>{fmt$(totals.income)}</strong></span>
          <span><span style={{ color: "var(--text-tertiary)" }}>Expenses</span> <strong style={{ color: "var(--state-warning)", fontSize: 15 }}>{fmt$(totals.expenses)}</strong></span>
          <span><span style={{ color: "var(--text-tertiary)" }}>Profit</span> <strong style={{ color: totals.profit >= 0 ? "var(--accent-money)" : "var(--state-danger)", fontSize: 15 }}>{fmt$(totals.profit)}</strong></span>
          {totals.income > 0 && (
            <span style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginLeft: "auto" }}>
              Margin · {Math.round((totals.profit / totals.income) * 100)}%
            </span>
          )}
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <Shared.SectionPill
            items={[{k:"all",l:"All"},{k:"income",l:"Income"},{k:"expense",l:"Expenses"}]}
            value={kindFilter} onChange={setKindFilter} dense
          />
          <input
            type="search"
            placeholder="Search carrier · vendor · kind · note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, maxWidth: 380, padding: "6px 10px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 12.5, color: "var(--text-primary)" }}
          />
        </div>

        {/* Transactions table */}
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No transactions in this period. Log a deposit under <strong>Money in</strong> or an expense under <strong>Money out</strong>.
            </div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "80px 90px 130px 1.4fr 120px 1.4fr" }}>
                <div>Date</div>
                <div>Type</div>
                <div>Kind</div>
                <div>Counterparty</div>
                <div className="tabular" style={{ textAlign: "right" }}>Amount</div>
                <div>Note</div>
              </div>
              {transactions.map(t => (
                <div key={t.id} className="row" style={{ gridTemplateColumns: "80px 90px 130px 1.4fr 120px 1.4fr", cursor: "pointer" }}
                     onClick={() => handleRowClick(t)} title="Open source tab to edit">
                  <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{fmtDate(t.date)}</div>
                  <div>
                    <span className="chip" style={{ fontSize: 10.5, color: t.source === "income" ? "var(--accent-money)" : "var(--state-warning)" }}>
                      {t.source === "income" ? "Income" : "Expense"}
                    </span>
                  </div>
                  <div className="cell-truncate" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.kind}</div>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>{t.who}</div>
                  <div className="tabular" style={{ textAlign: "right", fontWeight: 600, color: t.amount >= 0 ? "var(--accent-money)" : "var(--state-warning)" }}>
                    {t.amount >= 0 ? fmt$(t.amount) : "−" + fmt$(-t.amount)}
                  </div>
                  <div className="cell-truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function TabBtn({ label, active, onClick }) {
    return (
      <button
        role="tab"
        aria-selected={active}
        onClick={onClick}
        style={{
          appearance: "none", border: "none", background: "transparent",
          padding: "10px 14px", fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: active ? "var(--text-primary)" : "var(--text-tertiary)",
          borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
          cursor: "pointer", marginBottom: -1,
        }}
      >
        {label}
      </button>
    );
  }

  function Missing({ name }) {
    return (
      <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13 }}>
        {name} not loaded — refresh the page.
      </div>
    );
  }

  window.PagePnL = PagePnL;
})();
