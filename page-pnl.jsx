/* page-pnl.jsx — P&L is just an accounting page now.
 *
 * 2026-06-05: stripped the dashboard rewrite. P&L is now a thin
 * tabbed wrapper around the existing PageDeposits (money in) and
 * PageExpenses (money out) — that's the "CRM / accounting page"
 * shape. No charts, no KPI rollups, no by-rep analytics here.
 *
 * Route:  pnl  (set in shared.jsx NAV + app.jsx case "pnl")
 */
(function () {
  const { useState } = React;

  function PagePnL() {
    const [tab, setTab] = useState(() => {
      try { return localStorage.getItem("repflow.pnl.tab") || "deposits"; }
      catch { return "deposits"; }
    });
    const setTabPersist = (t) => {
      setTab(t);
      try { localStorage.setItem("repflow.pnl.tab", t); } catch {}
    };

    const Deposits = window.PageDeposits;
    const Expenses = window.PageExpenses;

    return (
      <div className="page-pnl-host" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          role="tablist"
          aria-label="Accounting"
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 16px 0",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-1)",
          }}
        >
          <TabBtn label="Money in"  active={tab === "deposits"} onClick={() => setTabPersist("deposits")} />
          <TabBtn label="Money out" active={tab === "expenses"} onClick={() => setTabPersist("expenses")} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {tab === "deposits" && (Deposits
            ? <Deposits/>
            : <Missing name="PageDeposits"/>)}
          {tab === "expenses" && (Expenses
            ? <Expenses/>
            : <Missing name="PageExpenses"/>)}
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
          appearance: "none",
          border: "none",
          background: "transparent",
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: active ? "var(--text-primary)" : "var(--text-tertiary)",
          borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
          cursor: "pointer",
          marginBottom: -1,
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
