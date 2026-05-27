/* page-attribution.jsx — Lead Vendors page + ROI loop
 *
 * Acquisition cost → Pipeline outcomes → Commissions, by vendor / state /
 * product / month. Owner sees the full org view; manager sees their
 * downline (real scoping comes from RLS).
 *
 * DATA — live (2026-05-25):
 *   - vendor catalog: public.agency_lead_sources
 *   - spend:          public.v_lead_source_spend  (monthly rollup of
 *                     agency_expenses where kind='lead_spend')
 *   - realized AP:    public.policies  (sum ap_cents per month, agency-
 *                     scoped). Per-source AP/issued/contacts is "—" until
 *                     pipeline.source carries lead_source_id consistently
 *                     across the dial path. Today it's a free-text field
 *                     with near-zero coverage — surfacing partial joins
 *                     would lie about the data.
 *
 * Demo (`?demo=1`): falls back to a small mocked vendor set marked
 * "Demo data" in the KPI strip. Real agencies with no spend tagged see
 * an empty-state CTA pointing to page-expenses / Log expense.
 *
 * Reads window.me() for the agency id; respects window.scopeRepIds() for
 * future per-rep / manager-downline scoping when that wiring lands.
 */

(function () {

const DEMO_VENDORS = [
  { id: "v1", name: "Facebook · T65 v3 creative",   category: "Paid social", spend: 4820, leads: 142, contacts: 124, quotes: 41, issued: 14, ap: 26840, persistency: 92, status: "ok"   },
  { id: "v2", name: "Facebook · FE 2026 lookalike", category: "Paid social", spend: 3140, leads: 96,  contacts: 78,  quotes: 22, issued: 8,  ap: 12480, persistency: 84, status: "ok"   },
  { id: "v3", name: "Inbound calls · Convoso",       category: "Inbound",     spend: 1280, leads: 38,  contacts: 38,  quotes: 24, issued: 14, ap: 28110, persistency: 96, status: "ok"   },
  { id: "v4", name: "T65 list · DataMail",            category: "List",        spend: 1840, leads: 184, contacts: 92,  quotes: 22, issued: 6,  ap:  9340, persistency: 81, status: "ok"   },
  { id: "v5", name: "Referral · Producer downline",  category: "Referral",    spend:  120, leads: 34,  contacts: 32,  quotes: 18, issued: 11, ap: 22180, persistency: 94, status: "ok"   },
  { id: "v6", name: "LinkedIn · agency owners",      category: "Paid social", spend: 2410, leads: 48,  contacts: 22,  quotes:  9, issued: 2,  ap:  3240, persistency: 78, status: "warn" },
  { id: "v7", name: "Google · 'medicare supplement'", category: "Paid search", spend: 6240, leads: 88,  contacts: 52,  quotes: 31, issued: 12, ap: 24400, persistency: 93, status: "ok"   },
];

const DEMO_BY_STATE = [
  { state: "TX", spend: 4820, ap: 18420, lift: 3.82 },
  { state: "FL", spend: 3140, ap: 12480, lift: 3.97 },
  { state: "GA", spend: 1280, ap:  9340, lift: 7.30 },
  { state: "NV", spend:  840, ap:  6210, lift: 7.39 },
  { state: "AZ", spend: 1610, ap:  3210, lift: 1.99 },
  { state: "OH", spend: 1240, ap:  4820, lift: 3.89 },
  { state: "PA", spend:  920, ap:  6480, lift: 7.04 },
];

const DEMO_BY_PRODUCT = [
  { p: "Med Supp Plan G", spend: 6840, ap: 28840, lift: 4.22 },
  { p: "Med Supp Plan N", spend: 1240, ap:  4820, lift: 3.89 },
  { p: "Final Expense",    spend: 4820, ap: 18420, lift: 3.82 },
  { p: "Annuity",          spend: 2140, ap: 12420, lift: 5.81 },
];

// Period helper — given a Date, returns first/last day of its month.
function monthBounds(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/* useAttribution(agencyId, periodDate) — pulls everything the page needs
 * from Supabase in one shot. Returns { sources, spendBySource, totalAP,
 * issuedCount, loading, err, isLive } where isLive flags whether we have
 * actually-tagged spend (controls demo/empty-state fallbacks). */
function useAttribution(agencyId, periodDate) {
  const [state, setState] = React.useState({
    sources: [], spendBySource: {}, apBySource: {}, issuedBySource: {},
    totalAP: 0, issuedCount: 0,
    loading: true, err: null, isLive: false,
  });

  React.useEffect(() => {
    let cancelled = false;
    if (!agencyId) { setState(s => ({ ...s, loading: false })); return; }
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { setState(s => ({ ...s, loading: false, err: "supabase unavailable" })); return; }

    const { startISO, endISO } = monthBounds(periodDate);

    (async () => {
      try {
        // 1) Vendor catalog — every active source for this agency.
        const sourcesP = sb.from("agency_lead_sources")
          .select("id,name,vendor,kind,product,state,cost_per_lead_cents,active")
          .eq("agency_id", agencyId)
          .order("name");

        // 2) Spend per source for the selected month, via the pre-aggregated
        //    view. View bucket = first-of-month UTC.
        const spendP = sb.from("v_lead_source_spend")
          .select("lead_source_id,spend_cents,expense_count,source_name")
          .eq("agency_id", agencyId)
          .gte("month", startISO)
          .lt("month", endISO);

        // 3) Realized AP — issued policies that landed this month. Now
        //    carries lead_source_id (migration 0071) so AP rolls up
        //    per vendor. Rows with a null lead_source_id still count
        //    toward the blended KPIs, just not toward any one vendor.
        const policiesP = sb.from("policies")
          .select("ap_cents,lead_source_id")
          .eq("agency_id", agencyId)
          .gte("issued_at", startISO)
          .lt("issued_at", endISO);

        const [{ data: sources, error: e1 },
               { data: spend,   error: e2 },
               { data: pols,    error: e3 }] = await Promise.all([sourcesP, spendP, policiesP]);

        if (cancelled) return;
        const err = e1?.message || e2?.message || e3?.message || null;
        const spendBySource = {};
        (spend || []).forEach(s => {
          spendBySource[s.lead_source_id] = (spendBySource[s.lead_source_id] || 0) + (s.spend_cents || 0);
        });
        // Per-vendor realized AP + issued count, keyed by lead_source_id.
        const apBySource = {};
        const issuedBySource = {};
        (pols || []).forEach(p => {
          if (!p.lead_source_id) return;
          apBySource[p.lead_source_id] = (apBySource[p.lead_source_id] || 0) + (p.ap_cents || 0);
          issuedBySource[p.lead_source_id] = (issuedBySource[p.lead_source_id] || 0) + 1;
        });
        const totalAP    = (pols || []).reduce((a, p) => a + (p.ap_cents || 0), 0);
        const issuedCount = (pols || []).length;
        // Live once we have either tagged spend OR attributed AP to show.
        const isLive     = (sources || []).length > 0 &&
          (Object.keys(spendBySource).length > 0 || Object.keys(apBySource).length > 0);
        setState({ sources: sources || [], spendBySource, apBySource, issuedBySource, totalAP, issuedCount, loading: false, err, isLive });
      } catch (e) {
        if (!cancelled) setState(s => ({ ...s, loading: false, err: e.message || String(e) }));
      }
    })();

    return () => { cancelled = true; };
  }, [agencyId, periodDate.getFullYear(), periodDate.getMonth()]);

  return state;
}

function PageAttribution({ role = "owner" }) {
  const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
  const agencyId = meIdent?.agency_id || null;
  const isDemo = !!(window.isDemoAgency && window.isDemoAgency());

  const [tab, setTab] = React.useState("vendors");
  const [sort, setSort] = React.useState({ key: "roas", dir: "desc" });
  const [periodDate, setPeriodDate] = React.useState(() => new Date());
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const periodLabel = periodDate.toLocaleString("en-US", { month: "long" });

  const live = useAttribution(agencyId, periodDate);

  // ── Choose the rendering set ───────────────────────────────────────────
  // Three modes:
  //   demo  — sandbox or no agency yet → show DEMO_* with a "Demo data" chip
  //   live  — agency has tagged spend → real numbers, partial table
  //   empty — agency has no spend tagged → empty-state CTA, no rows
  const mode = isDemo
    ? "demo"
    : live.isLive
      ? "live"
      : live.loading
        ? "loading"
        : "empty";

  // Build the row set the table renders.
  const rows = React.useMemo(() => {
    if (mode === "demo") {
      return DEMO_VENDORS.map(v => ({
        ...v,
        closeRate: v.contacts ? (v.issued / v.contacts) * 100 : 0,
        cpa:        v.issued ? v.spend / v.issued : 0,
        cpc:        v.contacts ? v.spend / v.contacts : 0,
        cpl:        v.leads ? v.spend / v.leads : 0,
        roas:       v.spend ? v.ap / v.spend : 0,
      }));
    }
    if (mode === "live") {
      return live.sources.map(s => {
        const spendCents = live.spendBySource[s.id] || 0;
        const spend = spendCents / 100;
        // Realized AP + issued count now attributed per vendor via
        // policies.lead_source_id (deal-write stamps it). null still
        // renders as "—" for the columns we don't yet attribute (leads,
        // contacts, quotes) since those need pipeline.source wiring.
        const apCents = live.apBySource[s.id] || 0;
        const ap = apCents > 0 ? apCents / 100 : null;
        const issued = live.issuedBySource[s.id] || 0;
        return {
          id: s.id,
          name: s.vendor ? `${s.name} · ${s.vendor}` : s.name,
          category: s.kind || "—",
          spend,
          // Still-unattributed columns — null renders as "—"
          leads: null, contacts: null, quotes: null,
          issued: issued > 0 ? issued : null,
          ap,
          persistency: null,
          closeRate: null, cpc: null, cpl: null,
          cpa: ap && issued > 0 && spend > 0 ? spend / issued : null,
          roas: ap != null && spend > 0 ? ap / spend : null,
          status: (spend > 0 || ap != null) ? "ok" : "idle",
        };
      });
    }
    return [];
  }, [mode, live.sources, live.spendBySource, live.apBySource, live.issuedBySource]);

  const sortBy = (k) => setSort(s => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [rows, sort.key, sort.dir]);

  const SortH = ({ k, label, right }) => (
    <div onClick={() => sortBy(k)} style={{ cursor: "pointer", textAlign: right ? "right" : "left", display: "flex", gap: 4, justifyContent: right ? "flex-end" : "flex-start" }}>
      {label}{sort.key === k && <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{sort.dir === "desc" ? "↓" : "↑"}</span>}
    </div>
  );

  // KPI totals — depend on mode.
  const totalSpend = mode === "demo"
    ? DEMO_VENDORS.reduce((a, v) => a + v.spend, 0)
    : Object.values(live.spendBySource || {}).reduce((a, c) => a + c, 0) / 100;
  const totalAP    = mode === "demo"
    ? DEMO_VENDORS.reduce((a, v) => a + v.ap, 0)
    : (live.totalAP || 0) / 100;
  const totalLeads = mode === "demo"
    ? DEMO_VENDORS.reduce((a, v) => a + v.leads, 0)
    : null; // unknown until pipeline source-tagging lands
  const totalIssued = mode === "demo"
    ? DEMO_VENDORS.reduce((a, v) => a + v.issued, 0)
    : live.issuedCount || 0;
  const blendedROAS = totalSpend ? totalAP / totalSpend : 0;
  const blendedCPA  = totalIssued ? totalSpend / totalIssued : 0;

  return (
    <div className="page-pad">
      <div className="page-h">
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Lead Vendors · Attribution
            {mode === "demo" && <span className="chip" style={{ background: "color-mix(in oklch, var(--accent-status) 12%, transparent)", color: "var(--accent-status)", borderColor: "color-mix(in oklch, var(--accent-status) 35%, transparent)" }}>Demo data</span>}
            {mode === "live" && <span className="chip chip-money">Live · {periodLabel}</span>}
            {mode === "empty" && <span className="chip" style={{ color: "var(--text-tertiary)" }}>No data yet</span>}
          </div>
          <div className="page-sub">Acquisition cost → Pipeline outcomes → Commissions, by vendor / state / product</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, position: "relative" }}>
          <button className="btn" onClick={() => setPickerOpen(o => !o)}><Icons.Calendar size={13}/> {periodLabel}</button>
          {pickerOpen && (
            <div
              onMouseLeave={() => setPickerOpen(false)}
              style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, padding: 8, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 8, zIndex: 20, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, minWidth: 220 }}
            >
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                <button
                  key={m}
                  className={`chip ${m === periodLabel ? "chip-money" : ""}`}
                  style={{ cursor: "pointer", border: 0 }}
                  onClick={() => {
                    const next = new Date(periodDate.getFullYear(), i, 1);
                    setPeriodDate(next);
                    setPickerOpen(false);
                    window.toast && window.toast(`Period: ${m}`, "info");
                  }}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          <button
            className="btn"
            onClick={() => {
              const headers = ["Vendor","Category","Spend","Leads","Contacts","Issued","AP","CloseRate%","CPA","CPC","ROAS"];
              const fmt = (v) => v == null ? "" : v;
              const csvRows = sorted.map(v => [
                v.name, v.category, v.spend, fmt(v.leads), fmt(v.contacts), fmt(v.issued), fmt(v.ap),
                v.closeRate != null ? v.closeRate.toFixed(1) : "",
                v.cpa  != null ? Math.round(v.cpa)  : "",
                v.cpc  != null ? Math.round(v.cpc)  : "",
                v.roas != null ? v.roas.toFixed(2) : "",
              ]);
              const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url;
              a.download = `attribution-${periodLabel.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
              window.toast && window.toast(`Exported ${csvRows.length} vendors`, "success");
            }}
          ><Icons.ArrowUpRight size={13}/> Export</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              try { sessionStorage.setItem("repflow.settings.tab", "integrations"); } catch {}
              if (window.gotoPage) window.gotoPage("settings");
              window.toast && window.toast("New vendor → connect via Settings → Integrations", "info");
            }}
          ><Icons.Plus size={13}/> New vendor</button>
        </div>
      </div>

      {mode === "live" && live.err && (
        <div className="panel" style={{ padding: 10, marginBottom: 8, color: "var(--state-warning)", fontSize: 12 }}>
          Partial data — {live.err}
        </div>
      )}

      <div className="kpi-row">
        <Shared.KpiCard hero label="Spend MTD" prefix="$" value={Math.round(totalSpend).toLocaleString()} sub={totalLeads != null ? `${totalLeads} leads` : `${rows.length} sources`}/>
        <Shared.KpiCard      label="Realized AP" prefix="$" value={Math.round(totalAP).toLocaleString()} sub={`${totalIssued} issued`} trend="up"/>
        <Shared.KpiCard      label="Blended ROAS" value={blendedROAS.toFixed(2) + "x"} trend={blendedROAS >= 3 ? "up" : undefined}/>
        <Shared.KpiCard      label="Blended CPA" prefix="$" value={Math.round(blendedCPA).toLocaleString()}/>
      </div>

      <Shared.SectionPill
        items={[{k:"vendors",l:"By vendor"},{k:"state",l:"By state"},{k:"product",l:"By product"},{k:"roi",l:"ROI explorer"}]}
        value={tab}
        onChange={setTab}
      />

      {mode === "empty" && (
        <div className="panel" style={{ padding: 32, textAlign: "center" }}>
          <Icons.TrendingUp size={28} style={{ color: "var(--text-quaternary)" }}/>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>No attribution data yet</div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 520, marginInline: "auto", lineHeight: 1.55 }}>
            ROAS rolls up the moment you tag a <strong>lead spend</strong> expense to a
            <strong> lead source</strong>. Log an expense, attach it to a vendor, and this page
            populates immediately.
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => window.gotoPage && window.gotoPage("expenses")}>
              <Icons.Plus size={13}/> Log lead spend
            </button>
            <button className="btn" onClick={() => { try { sessionStorage.setItem("repflow.settings.tab", "lead-sources"); } catch {} window.gotoPage && window.gotoPage("settings"); }}>
              <Icons.Settings size={13}/> Manage lead sources
            </button>
          </div>
        </div>
      )}

      {tab === "vendors" && mode !== "empty" && (
        <div className="panel">
          <div className="panel-h">
            <h3>By vendor · {periodLabel}</h3>
            <span className="meta">{rows.length} source{rows.length === 1 ? "" : "s"}</span>
          </div>
          {mode === "live" && (
            <div style={{ padding: "8px 14px", fontSize: 11.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
              Spend is live from <code className="mono" style={{ fontSize: 10.5 }}>agency_expenses</code> · issued/AP/ROAS roll up per vendor from deals tagged with a lead vendor at write time. Leads/contacts show "—" until pipeline.source carries a lead_source_id (see Settings → Lead sources to wire intake forms).
            </div>
          )}
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "minmax(220px, 1.6fr) 110px 90px 80px 70px 80px 90px 100px 90px" }}>
              <SortH k="name" label="Vendor"/>
              <div>Category</div>
              <SortH k="spend" label="Spend" right/>
              <SortH k="leads" label="Leads" right/>
              <SortH k="cpl"   label="CPL"   right/>
              <SortH k="issued" label="Issued" right/>
              <SortH k="cpa"   label="CPA"   right/>
              <SortH k="ap"    label="AP"    right/>
              <SortH k="roas"  label="ROAS"  right/>
            </div>
            {sorted.map(v => (
              <div key={v.id} className="row" style={{ gridTemplateColumns: "minmax(220px, 1.6fr) 110px 90px 80px 70px 80px 90px 100px 90px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.status === "warn" ? "var(--state-warning)" : v.status === "idle" ? "var(--text-quaternary)" : "var(--accent-money)", flexShrink: 0 }}/>
                  <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>{v.name}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{v.category || "—"}</div>
                <div className="tabular" style={{ textAlign: "right" }}>${Math.round(v.spend).toLocaleString()}</div>
                <NumCell value={v.leads} right/>
                <NumCell value={v.cpl != null ? `$${v.cpl.toFixed(2)}` : null} right/>
                <NumCell value={v.issued} right colorIfTruthy="var(--accent-money)"/>
                <NumCell value={v.cpa != null ? `$${Math.round(v.cpa).toLocaleString()}` : null} right/>
                <NumCell value={v.ap != null ? `$${v.ap.toLocaleString()}` : null} right/>
                <NumCell value={v.roas != null ? `${v.roas.toFixed(2)}x` : null} right colorIfTruthy={v.roas != null && v.roas >= 3 ? "var(--accent-money)" : v.roas != null && v.roas < 2 ? "var(--state-danger)" : undefined}/>
              </div>
            ))}
            {rows.length === 0 && mode === "loading" && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading attribution data…</div>
            )}
          </div>
        </div>
      )}

      {tab === "state" && mode === "demo" && <PanelByState rows={DEMO_BY_STATE}/>}
      {tab === "state" && mode === "live" && <PanelByStateLive sources={live.sources} spendBySource={live.spendBySource}/>}

      {tab === "product" && mode === "demo" && <PanelByProduct rows={DEMO_BY_PRODUCT}/>}
      {tab === "product" && mode === "live" && <PanelByProductLive sources={live.sources} spendBySource={live.spendBySource}/>}

      {tab === "roi" && (
        <div className="panel" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icons.Sparkles size={14} style={{ color: "var(--accent-money)" }}/>
            <h3 style={{ margin: 0, fontSize: 14 }}>ROI explorer</h3>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {mode === "demo" && "Demo ROI cards — switch off ?demo=1 and tag a few lead-spend expenses to see real cut/scale recommendations."}
            {mode === "live" && totalSpend === 0 && "No spend tagged this month. Log a lead-spend expense and tie it to a source to populate the ROI loop."}
            {mode === "live" && totalSpend > 0 && (
              <>
                Blended ROAS this {periodLabel}: <strong>{blendedROAS.toFixed(2)}x</strong> ·
                Spend: <strong>${Math.round(totalSpend).toLocaleString()}</strong> ·
                Realized AP: <strong>${Math.round(totalAP).toLocaleString()}</strong> ·
                Issued: <strong>{totalIssued}</strong>.
                Per-vendor ROAS is live on the <strong>By vendor</strong> tab for deals tagged with a lead vendor at write time — tag more deals to sharpen cut/scale calls.
              </>
            )}
            {mode === "empty" && "Log a lead-spend expense and attach it to a vendor — ROI cards appear automatically."}
          </div>
        </div>
      )}
    </div>
  );
}

function NumCell({ value, right, colorIfTruthy }) {
  if (value == null || value === "") {
    return <div className="tabular" style={{ textAlign: right ? "right" : "left", color: "var(--text-quaternary)" }}>—</div>;
  }
  return <div className="tabular" style={{ textAlign: right ? "right" : "left", color: colorIfTruthy || undefined }}>{value}</div>;
}

function PanelByState({ rows }) {
  return (
    <div className="panel">
      <div className="panel-h"><h3>By state</h3><span className="meta">{rows.length} states</span></div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "70px 110px 110px 100px" }}>
          <div>State</div><div className="tabular" style={{ textAlign: "right" }}>Spend</div><div className="tabular" style={{ textAlign: "right" }}>AP</div><div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
        </div>
        {rows.map(r => (
          <div key={r.state} className="row" style={{ gridTemplateColumns: "70px 110px 110px 100px" }}>
            <div style={{ fontWeight: 500 }}>{r.state}</div>
            <div className="tabular" style={{ textAlign: "right" }}>${r.spend.toLocaleString()}</div>
            <div className="tabular" style={{ textAlign: "right" }}>${r.ap.toLocaleString()}</div>
            <div className="tabular" style={{ textAlign: "right", color: r.lift >= 3 ? "var(--accent-money)" : "var(--state-warning)" }}>{r.lift.toFixed(2)}x</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelByStateLive({ sources, spendBySource }) {
  const byState = {};
  sources.forEach(s => {
    if (!s.state) return;
    const spend = (spendBySource[s.id] || 0) / 100;
    byState[s.state] = (byState[s.state] || 0) + spend;
  });
  const rows = Object.entries(byState).map(([state, spend]) => ({ state, spend })).sort((a, b) => b.spend - a.spend);
  if (rows.length === 0) {
    return <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No state-tagged sources yet. Add a state on your lead sources to break down spend by geography.</div>;
  }
  return (
    <div className="panel">
      <div className="panel-h"><h3>By state · spend</h3><span className="meta">{rows.length} state{rows.length === 1 ? "" : "s"}</span></div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "80px 1fr 120px" }}>
          <div>State</div><div></div><div className="tabular" style={{ textAlign: "right" }}>Spend</div>
        </div>
        {rows.map(r => (
          <div key={r.state} className="row" style={{ gridTemplateColumns: "80px 1fr 120px" }}>
            <div style={{ fontWeight: 500 }}>{r.state}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>AP attribution coming with pipeline source-tagging</div>
            <div className="tabular" style={{ textAlign: "right" }}>${Math.round(r.spend).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelByProduct({ rows }) {
  return (
    <div className="panel">
      <div className="panel-h"><h3>By product</h3><span className="meta">{rows.length} products</span></div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1fr 110px 110px 100px" }}>
          <div>Product</div><div className="tabular" style={{ textAlign: "right" }}>Spend</div><div className="tabular" style={{ textAlign: "right" }}>AP</div><div className="tabular" style={{ textAlign: "right" }}>ROAS</div>
        </div>
        {rows.map(r => (
          <div key={r.p} className="row" style={{ gridTemplateColumns: "1fr 110px 110px 100px" }}>
            <div>{r.p}</div>
            <div className="tabular" style={{ textAlign: "right" }}>${r.spend.toLocaleString()}</div>
            <div className="tabular" style={{ textAlign: "right" }}>${r.ap.toLocaleString()}</div>
            <div className="tabular" style={{ textAlign: "right", color: r.lift >= 3 ? "var(--accent-money)" : "var(--state-warning)" }}>{r.lift.toFixed(2)}x</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelByProductLive({ sources, spendBySource }) {
  const byProduct = {};
  sources.forEach(s => {
    if (!s.product) return;
    const spend = (spendBySource[s.id] || 0) / 100;
    byProduct[s.product] = (byProduct[s.product] || 0) + spend;
  });
  const rows = Object.entries(byProduct).map(([p, spend]) => ({ p, spend })).sort((a, b) => b.spend - a.spend);
  if (rows.length === 0) {
    return <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No product-tagged sources yet. Add a product on your lead sources to see spend by product line.</div>;
  }
  return (
    <div className="panel">
      <div className="panel-h"><h3>By product · spend</h3><span className="meta">{rows.length} product{rows.length === 1 ? "" : "s"}</span></div>
      <div className="list">
        <div className="list-h" style={{ gridTemplateColumns: "1fr 120px" }}>
          <div>Product</div><div className="tabular" style={{ textAlign: "right" }}>Spend</div>
        </div>
        {rows.map(r => (
          <div key={r.p} className="row" style={{ gridTemplateColumns: "1fr 120px" }}>
            <div>{r.p}</div>
            <div className="tabular" style={{ textAlign: "right" }}>${Math.round(r.spend).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.PageAttribution = PageAttribution;
})();
