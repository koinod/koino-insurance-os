/* page-deposits.jsx — Carrier deposit ledger.
 *
 * Mounts inside page-book-host.jsx as the "Deposits" tab. Logs actual money
 * received from each carrier and allocates it to specific policies +
 * commission kinds (advance / as_earned / trail / override / renewal /
 * chargeback_recoup / bonus / other). Lives ALONGSIDE the projected
 * `commissions` table — does not mutate it.
 *
 * Data:
 *   public.carrier_deposits         — one row per deposit event
 *   public.deposit_allocations      — N rows per deposit (line items)
 *   public.v_carrier_balance        — derived per (agency, carrier):
 *                                       expected vs received, last deposit,
 *                                       days_since, overdue flag
 *
 * RLS mirrors public.commissions: manager+ can write; reps see only deposits
 * where rep_id = their rep_id.
 */
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;

  const fmt$ = Shared.fmtMoneyCents;
  const fmtDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  const KIND_LABEL = {
    advance:           "Advance",
    as_earned:         "As-earned",
    trail:             "Trail",
    renewal:           "Renewal",
    override:          "Override (downline)",
    chargeback_recoup: "Chargeback recoup",
    bonus:             "Bonus",
    other:             "Other",
  };
  const KIND_COLOR = {
    advance:           "var(--accent-action)",
    as_earned:         "var(--accent-money)",
    trail:             "var(--accent-money)",
    renewal:           "var(--accent-money)",
    override:          "var(--accent-status)",
    chargeback_recoup: "var(--state-warning)",
    bonus:             "var(--accent-money)",
    other:             "var(--text-tertiary)",
  };
  const KIND_OPTIONS = Object.keys(KIND_LABEL);

  /* ── Hooks ───────────────────────────────────────────────────────────── */
  function useCarriers(agencyId) {
    const [rows, setRows] = useState(null);
    useEffect(() => {
      if (!agencyId) return;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) return;
          // Carriers visible to this agency: either global (agency_id null)
          // or explicitly tied to this agency, plus any with an active
          // appointment row.
          const [{ data: carriers }, { data: appts }] = await Promise.all([
            sb.from("carriers")
              .select("id, name, payment_cycle_days, contact_name, contact_phone, contact_email, status")
              .or(`agency_id.is.null,agency_id.eq.${agencyId}`)
              .order("name"),
            sb.from("agency_carrier_appointments")
              .select("carrier_id, status, carrier_name")
              .eq("agency_id", agencyId),
          ]);
          const apptIds = new Set((appts || []).map(a => a.carrier_id));
          const merged = (carriers || []).map(c => ({ ...c, appointed: apptIds.has(c.id) }));
          setRows(merged);
        } catch (e) {
          console.warn("[deposits] carriers load failed", e);
          setRows([]);
        }
      })();
    }, [agencyId]);
    return rows;
  }

  function useBalances(agencyId, refreshKey) {
    const [rows, setRows] = useState(null);
    useEffect(() => {
      if (!agencyId) return;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) return;
          const { data, error } = await sb.from("v_carrier_balance")
            .select("*")
            .eq("agency_id", agencyId)
            // Sort: overdue first, then by most-recently-received, then by name
            .order("overdue", { ascending: false })
            .order("last_deposit_date", { ascending: false, nullsFirst: false })
            .order("carrier_name", { ascending: true });
          if (error) throw error;
          setRows(data || []);
        } catch (e) {
          console.warn("[deposits] balances load failed", e);
          setRows([]);
        }
      })();
    }, [agencyId, refreshKey]);
    return rows;
  }

  function useDeposits(agencyId, refreshKey) {
    const [rows, setRows] = useState(null);
    const [err, setErr]   = useState(null);
    useEffect(() => {
      if (!agencyId) return;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) throw new Error("Supabase not initialized");
          const { data: deps, error: e1 } = await sb
            .from("carrier_deposits")
            .select("*")
            .eq("agency_id", agencyId)
            .order("deposit_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(200);
          if (e1) throw e1;
          if (!deps || !deps.length) { setRows([]); return; }
          const { data: allocs, error: e2 } = await sb
            .from("deposit_allocations")
            .select("*")
            .in("deposit_id", deps.map(d => d.id));
          if (e2) throw e2;
          const byDep = {};
          for (const a of (allocs || [])) {
            (byDep[a.deposit_id] = byDep[a.deposit_id] || []).push(a);
          }
          setRows(deps.map(d => ({ ...d, allocations: byDep[d.id] || [] })));
        } catch (e) {
          console.error("[deposits] load failed", e);
          setErr(e.message || String(e));
          setRows([]);
        }
      })();
    }, [agencyId, refreshKey]);
    return { rows, err };
  }

  // Lazy-loaded policy picker — only fetches when a row asks to attach.
  function usePoliciesLookup(agencyId) {
    const [cache, setCache] = useState(null);
    const ensure = useCallback(async () => {
      if (cache) return cache;
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) return [];
        // No status filter — prod statuses are issued/app_in/pending and may
        // grow over time. Carriers sometimes advance on submission, so any
        // active policy is a valid allocation target.
        const { data } = await sb.from("policies")
          .select("id, policy_number, product_text, carrier_id, ap_cents, expected_commission_cents, issued_at, status, owner_rep_id")
          .eq("agency_id", agencyId)
          .order("issued_at", { ascending: false, nullsFirst: false })
          .limit(500);
        const list = data || [];
        setCache(list);
        return list;
      } catch (e) {
        console.warn("[deposits] policies lookup failed", e);
        return [];
      }
    }, [cache, agencyId]);
    return ensure;
  }

  /* ── Header / KPIs ───────────────────────────────────────────────────── */
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

  /* ── Page ────────────────────────────────────────────────────────────── */
  function PageDeposits() {
    const me = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;
    const [period, setPeriod] = useState("MTD");
    const [refreshKey, setRefreshKey] = useState(0);
    const [showLog, setShowLog]   = useState(false);
    const [openId, setOpenId]     = useState(null);   // expanded deposit row

    const carriers           = useCarriers(agencyId);
    const balances           = useBalances(agencyId, refreshKey);
    const { rows: deposits } = useDeposits(agencyId, refreshKey);
    const policiesLookup     = usePoliciesLookup(agencyId);

    // Realtime: refresh on any deposit/allocation change in this agency.
    useEffect(() => {
      if (!agencyId) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const bump = () => setRefreshKey(k => k + 1);
      const ch = sb.channel("deposits:" + agencyId)
        .on("postgres_changes", { event: "*", schema: "public", table: "carrier_deposits",    filter: `agency_id=eq.${agencyId}` }, bump)
        .on("postgres_changes", { event: "*", schema: "public", table: "deposit_allocations", filter: `agency_id=eq.${agencyId}` }, bump)
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch {} };
    }, [agencyId]);

    if (!me) {
      return <div className="page-pad"><div className="panel" style={{ padding: 32, color: "var(--text-tertiary)" }}>Loading identity…</div></div>;
    }

    const cutoff = useMemo(() => periodCutoff(period), [period]);

    // Period totals from deposits
    const totals = useMemo(() => {
      if (!deposits) return null;
      let received = 0, count = 0, overrideRcvd = 0, ownRcvd = 0, recoupRcvd = 0;
      for (const d of deposits) {
        if (d.deposit_date && new Date(d.deposit_date + "T12:00:00") < cutoff) continue;
        received += d.gross_cents || 0;
        count += 1;
        for (const a of (d.allocations || [])) {
          if (a.kind === "override") overrideRcvd += a.amount_cents || 0;
          else if (a.kind === "chargeback_recoup") recoupRcvd += a.amount_cents || 0;
          else ownRcvd += a.amount_cents || 0;
        }
      }
      return { received, count, overrideRcvd, ownRcvd, recoupRcvd };
    }, [deposits, cutoff]);

    // Overdue + chargeback summaries (lifetime). 2026-06-05: dropped
    // "owed" — comp-rate math was unreliable and is now manual-entry only.
    const carrierSummary = useMemo(() => {
      if (!balances) return null;
      const charged   = balances.reduce((a, b) => a + (b.open_chargeback_cents || 0), 0);
      const lifetime  = balances.reduce((a, b) => a + (b.received_lifetime_cents || 0), 0);
      const overdue   = balances.filter(b => b.overdue);
      return { charged, lifetime, overdue };
    }, [balances]);

    const exportCsv = () => {
      if (!deposits) return;
      const cols = ["deposit_date","carrier_id","gross","statement_ref","alloc_kind","alloc_amount","policy_id","alloc_notes"];
      const lines = [cols.join(",")];
      for (const d of deposits) {
        if (!d.allocations || !d.allocations.length) {
          lines.push([d.deposit_date, d.carrier_id, ((d.gross_cents||0)/100).toFixed(2), d.statement_ref || "", "", "", "", ""].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
        }
        for (const a of (d.allocations || [])) {
          lines.push([
            d.deposit_date, d.carrier_id, ((d.gross_cents||0)/100).toFixed(2), d.statement_ref || "",
            a.kind, ((a.amount_cents||0)/100).toFixed(2), a.policy_id || "", (a.notes || "").replace(/\n/g," "),
          ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
        }
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `carrier_deposits_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Deposits</div>
            <div className="page-sub">
              Manual ledger · log what carriers actually paid, by deal + kind
              {totals && <> · {totals.count} {period} · {fmt$(totals.received)} received</>}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <Shared.SectionPill
              items={[{k:"T30",l:"30d"},{k:"MTD",l:"MTD"},{k:"T90",l:"90d"},{k:"YTD",l:"YTD"},{k:"ALL",l:"All"}]}
              value={period}
              onChange={setPeriod}
              dense
            />
            {deposits && deposits.length > 0 && (
              <button className="btn btn-ghost" onClick={exportCsv} title="Export deposits + allocations"><Icons.ArrowUpRight size={12}/> CSV</button>
            )}
            <button className="btn btn-primary" onClick={() => setShowLog(true)}>
              <Icons.Plus size={13}/> Log deposit
            </button>
          </div>
        </div>

        {/* Overdue strip */}
        {carrierSummary?.overdue?.length > 0 && (
          <div className="panel" style={{ padding: 12, marginBottom: 14, background: "color-mix(in oklch, var(--state-danger) 7%, transparent)", border: "1px solid color-mix(in oklch, var(--state-danger) 35%, transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--state-danger)" }}>
              <strong>{carrierSummary.overdue.length}</strong> carrier{carrierSummary.overdue.length === 1 ? "" : "s"} overdue for a deposit — call them.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {carrierSummary.overdue.slice(0, 6).map(b => (
                <span key={b.carrier_id} className="chip" title={`${b.days_since_last_deposit}d since last deposit · cycle ${b.payment_cycle_days}d`}
                      style={{ color: "var(--state-danger)" }}>
                  {b.carrier_name} · {b.days_since_last_deposit}d
                  {b.carrier_contact_phone ? ` · ${b.carrier_contact_phone}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* KPI row — pure received-side ledger (no projection math) */}
        {totals && carrierSummary && (
          <div className="kpi-row">
            <Shared.KpiCard hero
              label={`Received · ${period}`}
              value={fmt$(totals.received).slice(1)} prefix="$"
              sub={`${totals.count} deposit${totals.count===1?"":"s"}`}/>
            <Shared.KpiCard
              label="Lifetime received"
              value={fmt$(carrierSummary.lifetime).slice(1)} prefix="$"
              sub={`across ${balances?.filter(b => (b.received_lifetime_cents||0) > 0).length || 0} carrier${(balances?.filter(b => (b.received_lifetime_cents||0) > 0).length || 0) === 1 ? "" : "s"}`}/>
            <Shared.KpiCard
              label="Open chargebacks"
              value={fmt$(carrierSummary.charged).slice(1)} prefix="$"
              sub={carrierSummary.charged > 0 ? "carrier debt" : "clear"}
              neg={carrierSummary.charged > 0}/>
            <Shared.KpiCard
              label="Override $ received"
              value={fmt$(totals.overrideRcvd).slice(1)} prefix="$"
              sub={totals.received ? Math.round(totals.overrideRcvd / totals.received * 100) + "% of period" : ""}/>
          </div>
        )}

        {/* Per-carrier balance grid */}
        <div className="panel" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Per-carrier balance</h3>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>received · last deposit · overdue check</span>
          </div>
          {!balances ? (
            <div style={{ color: "var(--text-tertiary)", padding: 14, fontSize: 13 }}>Loading…</div>
          ) : balances.length === 0 ? (
            <div style={{ color: "var(--text-tertiary)", padding: 14, fontSize: 13 }}>
              No carrier activity yet. Log a deposit or place a policy to populate this view.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {balances.map(b => (
                <CarrierBalanceCard key={b.carrier_id} b={b}/>
              ))}
            </div>
          )}
        </div>

        {/* Recent deposits */}
        <div className="panel" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Recent deposits</h3>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>last 200</span>
          </div>
          {!deposits ? (
            <div style={{ color: "var(--text-tertiary)", padding: 14, fontSize: 13 }}>Loading…</div>
          ) : deposits.length === 0 ? (
            <div style={{ color: "var(--text-tertiary)", padding: 14, fontSize: 13 }}>
              No deposits logged yet. Click <strong>Log deposit</strong> to record your first carrier payment.
            </div>
          ) : (
            <div>
              {deposits.map(d => {
                const carrier = carriers?.find(c => c.id === d.carrier_id);
                const allocSum = (d.allocations || []).reduce((a, x) => a + (x.amount_cents || 0), 0);
                const unalloc  = (d.gross_cents || 0) - allocSum;
                const isOpen   = openId === d.id;
                return (
                  <div key={d.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost" style={{ padding: "2px 6px" }} onClick={() => setOpenId(isOpen ? null : d.id)} aria-label="toggle">
                        {isOpen ? "▾" : "▸"}
                      </button>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{carrier?.name || d.carrier_id}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{fmtDate(d.deposit_date)}</div>
                      <div style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: "var(--accent-money)" }}>{fmt$(d.gross_cents)}</div>
                      {d.statement_ref && <span className="chip" style={{ fontSize: 11 }}>ref · {d.statement_ref}</span>}
                      {unalloc > 0 && (
                        <span className="chip" style={{ fontSize: 11, color: "var(--state-warning)" }}>{fmt$(unalloc)} unallocated</span>
                      )}
                      <DeleteDepositBtn dep={d} onDone={() => setRefreshKey(k => k+1)}/>
                    </div>
                    {isOpen && (
                      <div style={{ marginLeft: 26, marginTop: 6 }}>
                        {(d.allocations || []).length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No allocations — deposit recorded but no line items attached.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {d.allocations.map(a => (
                              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                                <span className="chip" style={{ color: KIND_COLOR[a.kind] || "var(--text-tertiary)", fontSize: 10 }}>{KIND_LABEL[a.kind] || a.kind}</span>
                                <span style={{ fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmt$(a.amount_cents)}</span>
                                {a.policy_id && <span style={{ color: "var(--text-tertiary)" }}>policy · {a.policy_id.slice(0,8)}</span>}
                                {a.notes && <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>"{a.notes}"</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {d.notes && (
                          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                            <strong>Note:</strong> {d.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showLog && (
          <LogDepositModal
            agencyId={agencyId}
            carriers={carriers || []}
            policiesLookup={policiesLookup}
            me={me}
            onClose={() => setShowLog(false)}
            onSaved={() => { setShowLog(false); setRefreshKey(k => k+1); }}
          />
        )}
      </div>
    );
  }

  /* ── Carrier balance card ────────────────────────────────────────────── */
  function CarrierBalanceCard({ b }) {
    const cycle = b.payment_cycle_days || 14;
    const overdueStyle = b.overdue ? {
      borderColor: "color-mix(in oklch, var(--state-danger) 50%, transparent)",
      background: "color-mix(in oklch, var(--state-danger) 5%, transparent)",
    } : {};
    return (
      <div className="panel" style={{ padding: 12, ...overdueStyle }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{b.carrier_name}</div>
          {b.overdue && <span className="chip" style={{ color: "var(--state-danger)", fontSize: 10 }}>OVERDUE</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
          cycle {cycle}d{b.last_deposit_date ? ` · last ${b.days_since_last_deposit}d ago` : " · no deposit yet"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
          <div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Received · YTD</div>
            <div style={{ fontWeight: 600, color: "var(--accent-money)" }}>{fmt$(b.received_ytd_cents)}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Received · lifetime</div>
            <div style={{ fontWeight: 600, color: "var(--accent-money)" }}>{fmt$(b.received_lifetime_cents)}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Own production</div>
            <div style={{ fontWeight: 600 }}>{fmt$(b.received_own_cents)}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Overrides</div>
            <div style={{ fontWeight: 600 }}>{fmt$(b.received_override_cents)}</div>
          </div>
        </div>
        {b.open_chargeback_cents > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--state-warning)" }}>
            Open chargebacks · {fmt$(b.open_chargeback_cents)}
          </div>
        )}
        {(b.carrier_contact_phone || b.carrier_contact_email) && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-tertiary)" }}>
            {b.carrier_contact_name && <span>{b.carrier_contact_name}</span>}
            {b.carrier_contact_phone && <a href={`tel:${b.carrier_contact_phone}`} style={{ marginLeft: 6, color: "var(--accent-action)" }}>{b.carrier_contact_phone}</a>}
            {b.carrier_contact_email && <a href={`mailto:${b.carrier_contact_email}`} style={{ marginLeft: 6, color: "var(--accent-action)" }}>{b.carrier_contact_email}</a>}
          </div>
        )}
      </div>
    );
  }

  /* ── Delete button (manager+ only enforced by RLS, fails silently for reps) */
  function DeleteDepositBtn({ dep, onDone }) {
    const [busy, setBusy] = useState(false);
    const click = async () => {
      if (!window.confirm(`Delete deposit on ${dep.deposit_date}? Allocations will be removed too.`)) return;
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        const { error } = await sb.from("carrier_deposits").delete().eq("id", dep.id);
        if (error) throw error;
        window.toast && window.toast("Deposit removed", "info");
        onDone && onDone();
      } catch (e) {
        window.toast && window.toast(e.message || "Delete failed", "error");
        console.warn("[deposits] delete failed", e);
      } finally { setBusy(false); }
    };
    return (
      <button className="btn btn-ghost" disabled={busy} onClick={click} title="Delete deposit" style={{ padding: "2px 8px", fontSize: 11, color: "var(--state-danger)" }}>
        {busy ? "…" : "Delete"}
      </button>
    );
  }

  /* ── Log Deposit modal ──────────────────────────────────────────────── */
  function LogDepositModal({ agencyId, carriers, policiesLookup, me, onClose, onSaved }) {
    const today = new Date().toISOString().slice(0, 10);
    const [carrierId, setCarrierId] = useState("");
    const [date, setDate]           = useState(today);
    const [gross, setGross]         = useState("");
    const [ref, setRef]             = useState("");
    const [notes, setNotes]         = useState("");
    const [allocs, setAllocs]       = useState([{ kind: "as_earned", amount: "", policy_id: "", notes: "" }]);
    const [policies, setPolicies]   = useState(null);
    const [busy, setBusy]           = useState(false);

    const grossCents = useMemo(() => Math.round(parseFloat(gross || "0") * 100) || 0, [gross]);
    const allocSum   = useMemo(() => allocs.reduce((a, x) => a + (Math.round(parseFloat(x.amount || "0") * 100) || 0), 0), [allocs]);
    const overAlloc  = allocSum > grossCents;
    const underAlloc = grossCents > 0 && allocSum < grossCents;
    const canSave    = carrierId && date && grossCents > 0 && !overAlloc && allocs.every(a => !a.amount || (parseFloat(a.amount) >= 0));

    // Limit policy picker to selected carrier
    const carrierPolicies = useMemo(() => {
      if (!policies || !carrierId) return [];
      return policies.filter(p => p.carrier_id === carrierId);
    }, [policies, carrierId]);

    const loadPolicies = async () => {
      if (policies) return;
      const list = await policiesLookup();
      setPolicies(list);
    };

    const addAlloc = () => setAllocs(a => [...a, { kind: "as_earned", amount: "", policy_id: "", notes: "" }]);
    const removeAlloc = (i) => setAllocs(a => a.filter((_, idx) => idx !== i));
    const updateAlloc = (i, patch) => setAllocs(a => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));

    const save = async () => {
      if (!canSave || busy) return;
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("Supabase not connected");
        // Insert deposit
        const { data: dep, error: e1 } = await sb.from("carrier_deposits").insert({
          agency_id:     agencyId,
          carrier_id:    carrierId,
          rep_id:        me?.rep_id || null,
          deposit_date:  date,
          gross_cents:   grossCents,
          statement_ref: ref || null,
          notes:         notes || null,
          created_by:    me?.user_id || null,
        }).select("id").single();
        if (e1) throw e1;
        // Insert allocations (skip empties)
        const allocRows = allocs
          .map(a => ({
            deposit_id:   dep.id,
            agency_id:    agencyId,         // mirrored by trigger but satisfies NOT NULL pre-trigger
            kind:         a.kind,
            amount_cents: Math.round(parseFloat(a.amount || "0") * 100) || 0,
            policy_id:    a.policy_id || null,
            notes:        a.notes || null,
          }))
          .filter(r => r.amount_cents > 0);
        if (allocRows.length) {
          const { error: e2 } = await sb.from("deposit_allocations").insert(allocRows);
          if (e2) throw e2;
        }
        window.toast && window.toast(`Logged ${fmt$(grossCents)} from ${carriers.find(c=>c.id===carrierId)?.name || carrierId}`, "ok");
        onSaved && onSaved();
      } catch (e) {
        window.toast && window.toast(e.message || "Save failed", "error");
        console.error("[deposits] save failed", e);
      } finally { setBusy(false); }
    };

    return (
      <div role="dialog" aria-modal="true" onClick={onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
        <div onClick={(e) => e.stopPropagation()} className="panel"
             style={{ padding: 18, width: "100%", maxWidth: 720, maxHeight: "92vh", overflow: "auto", background: "var(--bg-elevated, var(--bg-surface))" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Log carrier deposit</h2>
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Carrier</div>
              <select className="input" value={carrierId} onChange={e => setCarrierId(e.target.value)} onFocus={loadPolicies}>
                <option value="">— select carrier —</option>
                {carriers
                  .filter(c => c.status !== "inactive")
                  .map(c => <option key={c.id} value={c.id}>{c.name}{c.appointed ? "" : " (not appointed)"}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Deposit date</div>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)}/>
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Gross ($)</div>
              <input className="input" type="number" step="0.01" min="0" value={gross} onChange={e => setGross(e.target.value)} placeholder="0.00"/>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>
              <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Statement ref (check #, EFT id…)</div>
              <input className="input" value={ref} onChange={e => setRef(e.target.value)} placeholder="optional"/>
            </label>
            <label style={{ fontSize: 12 }}>
              <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Notes</div>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional"/>
            </label>
          </div>

          {/* Allocations */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>Allocations · which deals / kinds</h3>
              <div style={{ fontSize: 11, color: overAlloc ? "var(--state-danger)" : underAlloc ? "var(--state-warning)" : "var(--text-tertiary)" }}>
                {fmt$(allocSum)} of {fmt$(grossCents)}
                {overAlloc && " · OVER"}
                {underAlloc && " · unallocated"}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allocs.map((a, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 110px 1fr 80px 28px", gap: 6, alignItems: "center" }}>
                  <select className="input" value={a.kind} onChange={e => updateAlloc(i, { kind: e.target.value })}>
                    {KIND_OPTIONS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <input className="input" type="number" step="0.01" min="0" value={a.amount}
                         onChange={e => updateAlloc(i, { amount: e.target.value })} placeholder="$0.00"/>
                  <select className="input" value={a.policy_id} onChange={e => updateAlloc(i, { policy_id: e.target.value })} onFocus={loadPolicies}
                          disabled={!carrierId}
                          title={!carrierId ? "Select a carrier first" : "Pick a policy (optional)"}>
                    <option value="">— no specific policy —</option>
                    {carrierPolicies.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.status}] {(p.policy_number || p.id.slice(0,8))} · {p.product_text || "—"} · AP {fmt$(p.ap_cents || 0)}
                      </option>
                    ))}
                  </select>
                  <input className="input" value={a.notes} onChange={e => updateAlloc(i, { notes: e.target.value })} placeholder="note"/>
                  <button className="btn btn-ghost" onClick={() => removeAlloc(i)} title="Remove row" style={{ padding: "2px 6px" }}>✕</button>
                </div>
              ))}
            </div>

            <button className="btn btn-ghost" onClick={addAlloc} style={{ marginTop: 8, fontSize: 12 }}>
              <Icons.Plus size={11}/> Add allocation
            </button>
            {underAlloc && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                You can leave allocations unfilled — the deposit will be saved as partially allocated and the unallocated portion will show as a chip on the deposit row.
              </div>
            )}
            {overAlloc && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--state-danger)" }}>
                Allocations exceed gross. The DB will reject this — reduce a line item before saving.
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave || busy}>
              {busy ? "Saving…" : "Save deposit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  window.PageDeposits = PageDeposits;
})();
