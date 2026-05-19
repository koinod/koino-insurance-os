/* page-pnl.jsx — Manager + Owner P&L surface
 *
 * Route:  pnl  (set in shared.jsx NAV + app.jsx case "pnl")
 * Roles:  manager, owner, super_admin  (rep sees Client Book instead)
 *
 * Data:
 *   manager_pnl_snapshot RPC  → by-rep table + top KPIs (summed client-side)
 *   Direct commissions query  → daily Net trend chart (day buckets)
 *   Realtime on policies + agency_expenses → refresh within 2 s of FAB log
 */
(function () {
  const { useState, useEffect, useCallback, useMemo } = React;

  const fmt$    = Shared.fmtMoneyCents;
  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  /* ── Date range helpers ─────────────────────────────────────────────────── */
  function isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function rangeFor(key, custom) {
    const now   = new Date();
    const today = isoToday();
    switch (key) {
      case "today":   return { from: today, to: today };
      case "week": {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay()); // Sunday
        return { from: d.toISOString().slice(0, 10), to: today };
      }
      case "month":
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
          to:   today,
        };
      case "quarter": {
        const q = Math.floor(now.getMonth() / 3);
        return {
          from: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10),
          to:   today,
        };
      }
      case "ytd":
        return {
          from: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
          to:   today,
        };
      case "custom":
        return custom && custom.from && custom.to ? custom : { from: today, to: today };
      default:
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
          to:   today,
        };
    }
  }

  function lastPeriodFor(key, range) {
    const now = new Date();
    switch (key) {
      case "today": {
        const yd = new Date(now);
        yd.setDate(yd.getDate() - 1);
        const s = yd.toISOString().slice(0, 10);
        return { from: s, to: s };
      }
      case "week": {
        const s = new Date(now); s.setDate(s.getDate() - s.getDay() - 7);
        const e = new Date(s);   e.setDate(e.getDate() + 6);
        return { from: s.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) };
      }
      case "month": {
        const pm  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const pme = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: pm.toISOString().slice(0, 10), to: pme.toISOString().slice(0, 10) };
      }
      case "quarter": {
        const q   = Math.floor(now.getMonth() / 3);
        const pqs = new Date(now.getFullYear(), (q - 1) * 3, 1);
        const pqe = new Date(now.getFullYear(),  q      * 3, 0);
        return { from: pqs.toISOString().slice(0, 10), to: pqe.toISOString().slice(0, 10) };
      }
      case "ytd": {
        const ly = now.getFullYear() - 1;
        return {
          from: new Date(ly, 0, 1).toISOString().slice(0, 10),
          to:   new Date(ly, 11, 31).toISOString().slice(0, 10),
        };
      }
      default:
        return null;
    }
  }

  function daysBetween(from, to) {
    const days = [];
    const cur  = new Date(from + "T12:00:00");
    const end  = new Date(to   + "T12:00:00");
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  /* ── PagePnL ────────────────────────────────────────────────────────────── */
  function PagePnL({ role }) {
    const me      = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;

    const [period,      setPeriod]      = useState("month");
    const [custom,      setCustom]      = useState({ from: "", to: "" });
    const [rows,        setRows]        = useState(null);   // current period rep rows
    const [prevRows,    setPrevRows]    = useState(null);
    const [trend,       setTrend]       = useState(null);   // [{day, net}]
    const [selRep,      setSelRep]      = useState(null);
    const [logDeal,     setLogDeal]     = useState(false);
    const [logExp,      setLogExp]      = useState(false);
    const [loading,     setLoading]     = useState(true);
    const [err,         setErr]         = useState(null);

    const range     = useMemo(() => rangeFor(period, custom), [period, custom]);
    const prevRange = useMemo(() => lastPeriodFor(period, range), [period, range]);

    const loadTrend = useCallback(async (sb, repIds) => {
      if (!agencyId || !sb) return;
      try {
        const fromTs = range.from + "T00:00:00Z";
        const toTs   = range.to   + "T23:59:59Z";

        const [{ data: commD }, { data: expD }] = await Promise.all([
          repIds.length > 0
            ? sb.from("commissions")
                .select("earned_at, amount_cents")
                .in("rep_id", repIds)
                .gte("earned_at", fromTs)
                .lte("earned_at", toTs)
            : Promise.resolve({ data: [] }),
          sb.from("agency_expenses")
            .select("paid_at, amount_cents")
            .eq("agency_id", agencyId)
            .gte("paid_at", range.from)
            .lte("paid_at", range.to),
        ]);

        const buckets = {};
        for (const d of daysBetween(range.from, range.to)) buckets[d] = { comm: 0, exp: 0 };

        for (const c of (commD || [])) {
          const d = c.earned_at?.slice(0, 10);
          if (d && buckets[d]) buckets[d].comm += c.amount_cents || 0;
        }
        for (const e of (expD || [])) {
          const d = e.paid_at;
          if (d && buckets[d]) buckets[d].exp += e.amount_cents || 0;
        }

        setTrend(
          daysBetween(range.from, range.to).map((d) => ({
            day: d,
            net: (buckets[d].comm - buckets[d].exp) / 100,
          }))
        );
      } catch {
        setTrend([]);
      }
    }, [agencyId, range]);

    const load = useCallback(async () => {
      if (!agencyId) return;
      setLoading(true);
      setErr(null);
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("Supabase not connected");

        const [{ data: cur, error: e1 }, { data: prev }] = await Promise.all([
          sb.rpc("manager_pnl_snapshot", {
            p_agency_id: agencyId,
            p_from:      range.from,
            p_to:        range.to,
            p_scope:     "agency",
          }),
          prevRange
            ? sb.rpc("manager_pnl_snapshot", {
                p_agency_id: agencyId,
                p_from:      prevRange.from,
                p_to:        prevRange.to,
                p_scope:     "agency",
              })
            : Promise.resolve({ data: [] }),
        ]);
        if (e1) throw e1;

        const curRows = cur || [];
        setRows(curRows);
        setPrevRows(prev || []);

        const repIds = curRows.map((r) => r.rep_id);
        await loadTrend(sb, repIds);
      } catch (e) {
        const msg = e.message || String(e);
        setErr(msg);
        setRows([]);
        // High-signal: surface RPC-missing / schema-cache misses to the
        // /api/client-error pipeline so the Telegram drift alert fires.
        // (Caught errors don't hit window.onerror, so we route manually.)
        if (typeof window !== "undefined" && window.reportClientError &&
            /Could not find the function|schema cache|PGRST20/i.test(msg)) {
          try { window.reportClientError({ message: msg, kind: "rpc-drift", source: "page-pnl/manager_pnl_snapshot" }); } catch {}
        }
      } finally {
        setLoading(false);
      }
    }, [agencyId, range, prevRange, loadTrend]);

    // Initial load + range changes
    useEffect(() => { load(); }, [load]);

    // Realtime: reload when policies or agency_expenses change in this agency
    useEffect(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !agencyId) return;
      const ch = sb
        .channel("pnl-realtime-" + agencyId)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "policies",
          filter: `agency_id=eq.${agencyId}`,
        }, load)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "agency_expenses",
          filter: `agency_id=eq.${agencyId}`,
        }, load)
        .subscribe();
      return () => sb.removeChannel(ch);
    }, [agencyId, load]);

    // Listen for manual refresh events (from FAB quick-log)
    useEffect(() => {
      window.addEventListener("pnl:refresh", load);
      return () => window.removeEventListener("pnl:refresh", load);
    }, [load]);

    /* KPI aggregation */
    const kpis = useMemo(() => {
      if (!rows) return null;
      const ap   = rows.reduce((a, r) => a + (r.submitted_ap_cents  || 0), 0);
      const comm = rows.reduce((a, r) => a + (r.earned_comm_cents   || 0), 0);
      const exp  = rows.reduce((a, r) => a + (r.expenses_cents      || 0), 0);
      return { ap, comm, exp, net: comm - exp };
    }, [rows]);

    const prevKpis = useMemo(() => {
      if (!prevRows) return null;
      const ap   = prevRows.reduce((a, r) => a + (r.submitted_ap_cents || 0), 0);
      const comm = prevRows.reduce((a, r) => a + (r.earned_comm_cents  || 0), 0);
      const exp  = prevRows.reduce((a, r) => a + (r.expenses_cents     || 0), 0);
      return { ap, comm, exp, net: comm - exp };
    }, [prevRows]);

    const pctDelta = (cur, prev) => {
      if (!prev || prev === 0) return null;
      return Math.round(((cur - prev) / Math.abs(prev)) * 10) / 10;
    };
    const pctStr = (p) => p == null ? null : (p > 0 ? "+" : "") + p + "% vs prior";
    const trendOf = (p) => (p == null ? undefined : p > 0 ? "up" : "dn");

    const PERIODS = [
      { k: "today",   l: "Today" },
      { k: "week",    l: "This Week" },
      { k: "month",   l: "This Month" },
      { k: "quarter", l: "Quarter" },
      { k: "ytd",     l: "YTD" },
      { k: "custom",  l: "Custom" },
    ];

    return (
      <div className="page-pad">
        {/* Header */}
        <div className="page-h">
          <div>
            <div className="page-title">P&L</div>
            <div className="page-sub">
              {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
              {rows && ` · ${rows.length} active ${rows.length === 1 ? "rep" : "reps"}`}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Shared.SectionPill items={PERIODS} value={period} onChange={setPeriod} dense/>
            {period === "custom" && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
                <input className="text-input" type="date" value={custom.from} style={{ width: 130 }}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}/>
                <span style={{ color: "var(--text-tertiary)" }}>→</span>
                <input className="text-input" type="date" value={custom.to} style={{ width: 130 }}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}/>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {err && (
          <div className="panel" style={{
            padding: "10px 14px", marginBottom: 14, fontSize: 12.5,
            background: "color-mix(in oklch, var(--state-danger) 8%, transparent)",
            border:     "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)",
            color:      "var(--state-danger)",
            display:    "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>Load error: {err}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={load}>Retry</button>
          </div>
        )}

        {/* KPI row */}
        {loading && !kpis && (
          <div className="kpi-row">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="kpi"><Shared.Skeleton height={60}/></div>
            ))}
          </div>
        )}
        {kpis && (
          <div className="kpi-row">
            <Shared.KpiCard
              label="Submitted AP"
              value={fmt$(kpis.ap).slice(1)} prefix="$"
              sub={pctStr(pctDelta(kpis.ap, prevKpis?.ap))}
              trend={trendOf(pctDelta(kpis.ap, prevKpis?.ap))}
            />
            <Shared.KpiCard
              label="Earned Comm"
              value={fmt$(kpis.comm).slice(1)} prefix="$"
              sub={pctStr(pctDelta(kpis.comm, prevKpis?.comm))}
              trend={trendOf(pctDelta(kpis.comm, prevKpis?.comm))}
            />
            <Shared.KpiCard
              label="Expenses"
              value={fmt$(kpis.exp).slice(1)} prefix="$"
              sub={pctStr(pctDelta(kpis.exp, prevKpis?.exp))}
              trend={kpis.exp > (prevKpis?.exp || 0) ? "dn" : "up"}
            />
            <NetCard net={kpis.net} prevNet={prevKpis?.net}/>
          </div>
        )}

        {/* Body: by-rep table + trend */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, marginTop: 14 }}>

          {/* By-rep table */}
          <div className="panel">
            <div className="panel-h">
              <h3>By rep</h3>
              <span className="meta">click row for details</span>
              {loading && rows && (
                <div style={{ marginLeft: "auto", width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--accent-money)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }}/>
              )}
            </div>
            <RepTable rows={rows} loading={loading} onSelect={setSelRep}/>
          </div>

          {/* Trend chart */}
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-h">
              <h3>Daily net</h3>
              <span className="meta">{range.from === range.to ? "today" : `${daysBetween(range.from, range.to).length}d`}</span>
            </div>
            <div style={{ flex: 1, padding: "6px 14px 14px", display: "flex", alignItems: "flex-end", minHeight: 110 }}>
              <TrendBarChart data={trend || []}/>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setLogDeal(true)}>
            <Icons.Plus size={13}/> Log a deal
          </button>
          <button className="btn" onClick={() => setLogExp(true)}>
            <Icons.Wallet size={13}/> Log an expense
          </button>
          <div style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 2px" }}/>
          <button className="btn btn-ghost" onClick={() => window.gotoPage && window.gotoPage("expenses")}>
            Open Expenses →
          </button>
          <button className="btn btn-ghost" onClick={() => window.gotoPage && window.gotoPage("book")}>
            Open Client Book →
          </button>
        </div>

        {/* Modals via window.* so cross-file JSX guard is clean */}
        {logDeal && (() => { const D = window.QuickLogDeal; return D ? <D onClose={() => setLogDeal(false)}/> : null; })()}
        {logExp  && (() => { const E = window.QuickLogExpense; return E ? <E onClose={() => setLogExp(false)}/> : null; })()}

        {/* Rep drawer */}
        {selRep && (
          <RepDrawer rep={selRep} agencyId={agencyId} range={range} onClose={() => setSelRep(null)}/>
        )}
      </div>
    );
  }

  /* ── NetCard ────────────────────────────────────────────────────────────── */
  function NetCard({ net, prevNet }) {
    const pct     = prevNet && prevNet !== 0
      ? Math.round(((net - prevNet) / Math.abs(prevNet)) * 10) / 10
      : null;
    const isNeg   = net < 0;
    const accent  = isNeg ? "var(--state-danger)" : "var(--accent-money)";
    const tgt     = (window.__activeAgency?.config?.monthly_target_cents) || null;
    const pctGoal = tgt ? Math.min(100, Math.max(0, Math.round((net / tgt) * 100))) : null;

    return (
      <div className="kpi hero" style={{ borderTop: `2px solid ${accent}` }}>
        <div className="kpi-label">Net</div>
        <div className="kpi-val tabular money"
          style={{ color: accent, fontSize: "1.85rem" }}>
          {isNeg ? "-" : ""}${Math.abs(Math.round((net || 0) / 100)).toLocaleString()}
        </div>
        {pct != null && (
          <div className="kpi-meta">
            <span className={pct > 0 ? "up tabular" : "dn tabular"}>
              {pct > 0 ? <Icons.TrendingUp size={12}/> : <Icons.TrendingDown size={12}/>}
              {" "}{pct > 0 ? "+" : ""}{pct}% vs prior
            </span>
          </div>
        )}
        {pctGoal != null && (
          <div style={{ marginTop: 8, height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height:     "100%",
              width:      `${pctGoal}%`,
              background: accent,
              transition: "width 600ms ease",
            }}/>
          </div>
        )}
        {pctGoal != null && (
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            {pctGoal}% of monthly target
          </div>
        )}
      </div>
    );
  }

  /* ── RepTable ────────────────────────────────────────────────────────────── */
  function RepTable({ rows, loading, onSelect }) {
    if (loading && !rows) {
      return (
        <div style={{ padding: 20 }}>
          <Shared.Skeleton count={5} height={34} gap={6}/>
        </div>
      );
    }
    if (!rows || rows.length === 0) {
      return (
        <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
          No rep activity in this period.
        </div>
      );
    }

    const cols = "1.5fr 60px 110px 110px 110px 110px";
    return (
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: cols }}>
          <div>Rep</div>
          <div className="tabular" style={{ textAlign: "right" }}>Deals</div>
          <div className="tabular" style={{ textAlign: "right" }}>Submitted AP</div>
          <div className="tabular" style={{ textAlign: "right" }}>Earned Comm</div>
          <div className="tabular" style={{ textAlign: "right" }}>Expenses</div>
          <div className="tabular" style={{ textAlign: "right" }}>Net</div>
        </div>
        {rows.map((r) => {
          const net   = (r.earned_comm_cents || 0) - (r.expenses_cents || 0);
          const isNeg = net < 0;
          return (
            <div key={r.rep_id} className="row"
              style={{ gridTemplateColumns: cols, cursor: "pointer" }}
              onClick={() => onSelect(r)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Shared.Avatar rep={{ id: r.rep_id, name: r.rep_name || r.rep_id }} size={22}/>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.rep_name || r.rep_id}</div>
                  {r.rep_handle && (
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.rep_handle}</div>
                  )}
                </div>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontSize: 12.5 }}>
                {r.deals || 0}
              </div>
              <div className="tabular" style={{ textAlign: "right", fontSize: 12.5 }}>
                {fmt$(r.submitted_ap_cents || 0)}
              </div>
              <div className="tabular" style={{ textAlign: "right", fontSize: 12.5 }}>
                {fmt$(r.earned_comm_cents || 0)}
              </div>
              <div className="tabular" style={{ textAlign: "right", fontSize: 12.5 }}>
                {fmt$(r.expenses_cents || 0)}
              </div>
              <div className="tabular" style={{
                textAlign:  "right",
                fontSize:   13,
                fontWeight: 600,
                color:      isNeg ? "var(--state-danger)" : "var(--accent-money)",
              }}>
                {isNeg ? "-" : ""}{fmt$(Math.abs(net))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── RepDrawer ──────────────────────────────────────────────────────────── */
  function RepDrawer({ rep, agencyId, range, onClose }) {
    const [policies,  setPolicies]  = useState(null);
    const [expenses,  setExpenses]  = useState(null);

    useEffect(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !agencyId || !rep) return;
      Promise.all([
        sb.from("policies")
          .select("id,product_text,ap_cents,expected_commission_cents,comp_rate_pct,status,submission_date,carrier_id")
          .eq("agency_id",    agencyId)
          .eq("owner_rep_id", rep.rep_id)
          .gte("submission_date", range.from)
          .lte("submission_date", range.to)
          .order("submission_date", { ascending: false })
          .limit(50),
        sb.from("agency_expenses")
          .select("id,kind,amount_cents,description,paid_at,paid_by")
          .eq("agency_id",      agencyId)
          .eq("paid_by_rep_id", rep.rep_id)
          .gte("paid_at", range.from)
          .lte("paid_at", range.to)
          .order("paid_at", { ascending: false })
          .limit(50),
      ]).then(([{ data: p }, { data: e }]) => {
        setPolicies(p || []);
        setExpenses(e || []);
      });
    }, [agencyId, rep, range]);

    const net = (rep.earned_comm_cents || 0) - (rep.expenses_cents || 0);

    return (
      <div style={{
        position:   "fixed",
        top:        0, right: 0, bottom: 0,
        width:      430,
        background: "var(--bg-raised)",
        borderLeft: "1px solid var(--border-subtle)",
        zIndex:     40,
        display:    "flex",
        flexDirection: "column",
        boxShadow:  "-8px 0 32px color-mix(in oklch, black 25%, transparent)",
      }}>
        {/* Header */}
        <div style={{
          padding:       "13px 16px",
          borderBottom:  "1px solid var(--border-subtle)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
        }}>
          <Shared.Avatar rep={{ id: rep.rep_id, name: rep.rep_name || rep.rep_id }} size={30}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{rep.rep_name || rep.rep_id}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{rep.rep_handle}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icons.X size={14}/></button>
        </div>

        {/* Mini KPI strip */}
        <div style={{
          display:       "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          padding:       "10px 14px",
          gap:           8,
          borderBottom:  "1px solid var(--border-subtle)",
        }}>
          {[
            { label: "Earned",   val: rep.earned_comm_cents || 0, hi: false },
            { label: "Expenses", val: rep.expenses_cents    || 0, hi: false },
            { label: "Net",      val: net,                         hi: true  },
          ].map(({ label, val, hi }) => (
            <div key={label} style={{ background: "var(--bg-base)", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>{label}</div>
              <div className="tabular" style={{
                fontSize:   13,
                fontWeight: 600,
                color:      hi
                  ? (val < 0 ? "var(--state-danger)" : "var(--accent-money)")
                  : "var(--text-primary)",
              }}>
                {val < 0 ? "-" : ""}{fmt$(Math.abs(val))}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>

          {/* Policies */}
          <div style={{
            fontSize:       11,
            fontWeight:     600,
            color:          "var(--text-tertiary)",
            textTransform:  "uppercase",
            letterSpacing:  "0.06em",
            marginBottom:   6,
          }}>
            Policies ({rep.deals || 0})
          </div>
          {!policies && <Shared.Skeleton count={3} height={28} gap={6}/>}
          {policies && policies.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>None in period</div>
          )}
          {policies && policies.map((p) => (
            <div key={p.id} style={{
              padding:      "8px 10px",
              background:   "var(--bg-base)",
              borderRadius: 6,
              marginBottom: 6,
              fontSize:     12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{p.product_text || "—"}</span>
                  {p.carrier_id && (
                    <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 6 }}>
                      {p.carrier_id}
                    </span>
                  )}
                </div>
                <span className="tabular" style={{ fontWeight: 600, color: "var(--accent-money)", fontSize: 12.5 }}>
                  {fmt$(p.expected_commission_cents || 0)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 11, color: "var(--text-tertiary)", flexWrap: "wrap" }}>
                <span>AP {fmt$(p.ap_cents || 0)}</span>
                {p.comp_rate_pct != null && <><span>·</span><span>{p.comp_rate_pct}% comp</span></>}
                <span>·</span><span>{p.status || "—"}</span>
                <span>·</span><span>{fmtDate(p.submission_date)}</span>
              </div>
            </div>
          ))}

          {/* Expenses */}
          <div style={{
            fontSize:       11,
            fontWeight:     600,
            color:          "var(--text-tertiary)",
            textTransform:  "uppercase",
            letterSpacing:  "0.06em",
            margin:         "14px 0 6px",
          }}>
            Expenses ({(expenses || []).length})
          </div>
          {!expenses && <Shared.Skeleton count={2} height={28} gap={6}/>}
          {expenses && expenses.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>None in period</div>
          )}
          {expenses && expenses.map((e) => (
            <div key={e.id} style={{
              padding:       "8px 10px",
              background:    "var(--bg-base)",
              borderRadius:  6,
              marginBottom:  6,
              fontSize:      12,
              display:       "flex",
              justifyContent:"space-between",
              alignItems:    "center",
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>{e.description || e.kind}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtDate(e.paid_at)}</div>
              </div>
              <span className="tabular" style={{ fontWeight: 600, color: "var(--state-danger)", fontSize: 12.5 }}>
                -{fmt$(e.amount_cents || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── TrendBarChart (native SVG — no Recharts dep) ───────────────────────── */
  function TrendBarChart({ data }) {
    if (!data || data.length === 0) {
      return (
        <div style={{
          width: "100%", height: 110,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-tertiary)", fontSize: 12,
        }}>
          No data
        </div>
      );
    }
    const W      = 268;
    const H      = 100;
    const midY   = H / 2;
    const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.net)));
    const barW   = Math.max(1, Math.floor((W / data.length) - 1));

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H }}
        preserveAspectRatio="none"
      >
        {/* Zero axis */}
        <line x1={0} y1={midY} x2={W} y2={midY}
          stroke="var(--border-subtle)" strokeWidth={0.8}/>
        {data.map((d, i) => {
          const x  = Math.floor(i * (W / data.length));
          const h  = Math.max(2, Math.round((Math.abs(d.net) / maxAbs) * (H / 2 - 4)));
          const y  = d.net >= 0 ? midY - h : midY;
          const cl = d.net >= 0 ? "var(--accent-money)" : "var(--state-danger)";
          return (
            <rect key={i} x={x} y={y} width={barW} height={h} fill={cl} opacity={0.85}/>
          );
        })}
      </svg>
    );
  }

  window.PagePnL = PagePnL;
})();
