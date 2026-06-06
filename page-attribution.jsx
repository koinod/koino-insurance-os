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
function useAttribution(agencyId, periodDate, reloadTick = 0) {
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

        // 4) Front-of-funnel — leads acquired this month per vendor, and how
        //    many advanced past "New" (contacted+). Carries lead_source_id
        //    (migration 0077) so per-vendor lead/contact counts + close rate
        //    finally roll up. Scoped by created_at to match the spend period.
        const pipelineP = sb.from("pipeline")
          .select("lead_source_id,stage,created_at")
          .eq("agency_id", agencyId)
          .gte("created_at", startISO)
          .lt("created_at", endISO);

        const [{ data: sources, error: e1 },
               { data: spend,   error: e2 },
               { data: pols,    error: e3 },
               { data: pipe,    error: e4 }] = await Promise.all([sourcesP, spendP, policiesP, pipelineP]);

        if (cancelled) return;
        const err = e1?.message || e2?.message || e3?.message || e4?.message || null;
        // Per-vendor lead + contact counts from pipeline (front of funnel).
        const leadsBySource = {};
        const contactsBySource = {};
        (pipe || []).forEach(p => {
          if (!p.lead_source_id) return;
          leadsBySource[p.lead_source_id] = (leadsBySource[p.lead_source_id] || 0) + 1;
          if (p.stage && p.stage !== "New") {
            contactsBySource[p.lead_source_id] = (contactsBySource[p.lead_source_id] || 0) + 1;
          }
        });
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
          (Object.keys(spendBySource).length > 0 || Object.keys(apBySource).length > 0 || Object.keys(leadsBySource).length > 0);
        setState({ sources: sources || [], spendBySource, apBySource, issuedBySource, leadsBySource, contactsBySource, totalAP, issuedCount, loading: false, err, isLive });
      } catch (e) {
        if (!cancelled) setState(s => ({ ...s, loading: false, err: e.message || String(e) }));
      }
    })();

    return () => { cancelled = true; };
  }, [agencyId, periodDate.getFullYear(), periodDate.getMonth(), reloadTick]);

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

  // In-page management — modal pivots replace the old "go to Settings /
  // Expenses" navigations so vendors + lead-spend are owned by this page.
  const [modal, setModal] = React.useState(null); // null | "new-vendor" | "log-spend" | "manage"
  const [reloadTick, setReloadTick] = React.useState(0);
  const bumpReload = () => setReloadTick(t => t + 1);

  const live = useAttribution(agencyId, periodDate, reloadTick);

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
        // Front-of-funnel now attributed via pipeline.lead_source_id (0077).
        const leads = (live.leadsBySource || {})[s.id] || 0;
        const contacts = (live.contactsBySource || {})[s.id] || 0;
        return {
          id: s.id,
          name: s.vendor ? `${s.name} · ${s.vendor}` : s.name,
          category: s.kind || "—",
          spend,
          leads: leads > 0 ? leads : null,
          contacts: contacts > 0 ? contacts : null,
          quotes: null,
          issued: issued > 0 ? issued : null,
          ap,
          persistency: null,
          // Close rate = issued / contacts (fall back to issued / leads when
          // no stage progression captured yet). CPC/CPL from period spend.
          closeRate: issued > 0 ? (contacts > 0 ? (issued / contacts) * 100 : leads > 0 ? (issued / leads) * 100 : null) : null,
          cpc: spend > 0 && contacts > 0 ? spend / contacts : null,
          cpl: spend > 0 && leads > 0 ? spend / leads : null,
          cpa: ap && issued > 0 && spend > 0 ? spend / issued : null,
          roas: ap != null && spend > 0 ? ap / spend : null,
          status: (spend > 0 || ap != null || leads > 0) ? "ok" : "idle",
        };
      });
    }
    return [];
  }, [mode, live.sources, live.spendBySource, live.apBySource, live.issuedBySource, live.leadsBySource, live.contactsBySource]);

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
    : Object.values(live.leadsBySource || {}).reduce((a, c) => a + c, 0) || null;
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
            className="btn"
            onClick={() => setModal("log-spend")}
            disabled={!agencyId}
            title={agencyId ? "Log a lead-spend expense against a vendor" : "Demo agency — log spend disabled"}
          ><Icons.DollarSign size={13}/> Log spend</button>
          <button
            className="btn"
            onClick={() => setModal("manage")}
            disabled={!agencyId}
            title={agencyId ? "Rename / archive / cost-per-lead per vendor" : "Demo agency — manage disabled"}
          ><Icons.Settings size={13}/> Manage</button>
          <button
            className="btn btn-primary"
            onClick={() => setModal("new-vendor")}
            disabled={!agencyId}
            title={agencyId ? "Create a new lead vendor" : "Demo agency — create disabled"}
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
            <button className="btn btn-primary" onClick={() => setModal("log-spend")} disabled={!agencyId}>
              <Icons.Plus size={13}/> Log lead spend
            </button>
            <button className="btn" onClick={() => setModal("new-vendor")} disabled={!agencyId}>
              <Icons.Plus size={13}/> Add a vendor
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
              Spend is live from <code className="mono" style={{ fontSize: 10.5 }}>agency_expenses</code>. Leads/contacts roll up per vendor from leads tagged at intake (CSV import → "Lead vendor"); issued/AP/ROAS from deals, which inherit the lead's vendor at write time. Tag leads on import to populate the full funnel.
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

      {modal === "new-vendor" && (
        <NewVendorModal agencyId={agencyId} onClose={() => setModal(null)} onSaved={() => { setModal(null); bumpReload(); }} />
      )}
      {modal === "log-spend" && (
        <LogSpendModal agencyId={agencyId} sources={live.sources || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); bumpReload(); }} />
      )}
      {modal === "manage" && (
        <ManageVendorsModal agencyId={agencyId} sources={live.sources || []} onClose={() => setModal(null)} onSaved={() => bumpReload()} />
      )}
    </div>
  );
}

/* ── In-page management modals ─────────────────────────────────────────
 * Three modals replace the old "navigate to Settings / Expenses" pivots
 * so vendors + lead-spend live and are managed on this page. Each one
 * is self-contained: own form state, own supabase call, fires onSaved()
 * to trigger a reload. None of them try to be the full lead-drip
 * connector UI (HMAC / webhooks / field-map live in LeadDrip) — they
 * cover the attribution surface only: name, vendor brand, kind, CPL,
 * active, archived. */

function NewVendorModal({ agencyId, onClose, onSaved }) {
  const [form, setForm] = React.useState({ name: "", vendor: "", kind: "manual", cost_per_lead: "", active: true });
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { window.toast && window.toast("Name is required", "warn"); return; }
    setBusy(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const row = {
        agency_id: agencyId,
        name: form.name.trim(),
        vendor: form.vendor.trim() || null,
        kind: form.kind || "manual",
        cost_per_lead_cents: form.cost_per_lead ? Math.round(parseFloat(form.cost_per_lead) * 100) : null,
        active: !!form.active,
      };
      const { error } = await sb.from("agency_lead_sources").insert(row);
      if (error) throw error;
      window.toast && window.toast(`Vendor "${row.name}" created`, "success");
      onSaved && onSaved();
    } catch (err) {
      window.toast && window.toast(`Create failed: ${err.message || err}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shared.Modal title="New lead vendor" width={460} onClose={onClose} actions={
      <>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="new-vendor-form" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Create vendor"}
        </button>
      </>
    }>
      <form id="new-vendor-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="Display name" hint="What you'll see in tables + dropdowns">
          <input className="input" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Facebook · T65 v3" />
        </Shared.Field>
        <Shared.Field label="Brand / partner" hint="Optional — Facebook, GoatLeads, Convoso, etc.">
          <input className="input" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Facebook" />
        </Shared.Field>
        <Shared.Field label="Channel">
          <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            <option value="manual">Manual / list</option>
            <option value="paid_social">Paid social</option>
            <option value="paid_search">Paid search</option>
            <option value="inbound">Inbound calls</option>
            <option value="referral">Referral</option>
            <option value="webhook">Webhook</option>
          </select>
        </Shared.Field>
        <Shared.Field label="Cost per lead" hint="Optional — dollars per lead (used by ROAS estimates)">
          <input className="input" type="number" min="0" step="0.01" value={form.cost_per_lead} onChange={e => setForm({ ...form, cost_per_lead: e.target.value })} placeholder="0.00" />
        </Shared.Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
          Active (shows up in spend + lead-tagging dropdowns)
        </label>
      </form>
    </Shared.Modal>
  );
}

function LogSpendModal({ agencyId, sources, onClose, onSaved }) {
  const meIdent = (window.me && window.me()) || null;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = React.useState({
    lead_source_id: sources[0]?.id || "",
    amount: "",
    paid_at: today,
    description: "",
    notes: "",
  });
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { window.toast && window.toast("Enter an amount", "warn"); return; }
    if (!form.lead_source_id) { window.toast && window.toast("Pick a vendor", "warn"); return; }
    setBusy(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const row = {
        agency_id: agencyId,
        kind: "lead_spend",
        amount_cents: Math.round(amount * 100),
        description: form.description || null,
        vendor: (sources.find(s => s.id === form.lead_source_id)?.vendor) || null,
        paid_at: form.paid_at,
        paid_by: "agency",
        paid_by_rep_id: null,
        reimbursable: false,
        lead_source_id: form.lead_source_id,
        notes: form.notes || null,
        created_by: meIdent?.user_id || undefined,
      };
      const { error } = await sb.from("agency_expenses").insert(row);
      if (error) throw error;
      window.toast && window.toast(`Logged $${amount.toFixed(2)} lead spend`, "success");
      onSaved && onSaved();
    } catch (err) {
      window.toast && window.toast(`Save failed: ${err.message || err}`, "error");
    } finally {
      setBusy(false);
    }
  };
  if (!sources.length) {
    return (
      <Shared.Modal title="Log lead spend" width={420} onClose={onClose} actions={
        <button className="btn" onClick={onClose}>Close</button>
      }>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          No vendors yet. Create a vendor first ("New vendor"), then come back to log spend against it.
        </div>
      </Shared.Modal>
    );
  }
  return (
    <Shared.Modal title="Log lead spend" width={460} onClose={onClose} actions={
      <>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="log-spend-form" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Log spend"}
        </button>
      </>
    }>
      <form id="log-spend-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shared.Field label="Vendor">
          <select className="input" value={form.lead_source_id} onChange={e => setForm({ ...form, lead_source_id: e.target.value })}>
            {sources.map(s => (
              <option key={s.id} value={s.id}>{s.vendor ? `${s.name} · ${s.vendor}` : s.name}</option>
            ))}
          </select>
        </Shared.Field>
        <Shared.Field label="Amount (USD)">
          <input className="input" type="number" min="0" step="0.01" autoFocus value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="500.00" />
        </Shared.Field>
        <Shared.Field label="Paid on">
          <input className="input" type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} />
        </Shared.Field>
        <Shared.Field label="Description" hint="Optional — shows on the expense row">
          <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="June Facebook spend" />
        </Shared.Field>
        <Shared.Field label="Notes" hint="Optional — internal context">
          <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Shared.Field>
      </form>
    </Shared.Modal>
  );
}

function ManageVendorsModal({ agencyId, sources, onClose, onSaved }) {
  const [drafts, setDrafts] = React.useState(() => sources.map(s => ({
    id: s.id, name: s.name, cost_per_lead: s.cost_per_lead_cents != null ? (s.cost_per_lead_cents / 100).toFixed(2) : "", active: !!s.active, dirty: false,
  })));
  const [busyId, setBusyId] = React.useState(null);
  const [savingAll, setSavingAll] = React.useState(false);
  const setDraft = (id, patch) => setDrafts(arr => arr.map(d => d.id === id ? { ...d, ...patch, dirty: true } : d));
  const buildPatch = (d) => ({
    name: (d.name || "").trim() || "Untitled",
    cost_per_lead_cents: d.cost_per_lead === "" ? null : Math.round(parseFloat(d.cost_per_lead) * 100),
    active: !!d.active,
  });
  const save = async (d) => {
    setBusyId(d.id);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const patch = buildPatch(d);
      const { error } = await sb.from("agency_lead_sources").update(patch).eq("id", d.id);
      if (error) throw error;
      window.toast && window.toast(`Updated "${patch.name}"`, "success");
      setDrafts(arr => arr.map(x => x.id === d.id ? { ...x, dirty: false } : x));
      onSaved && onSaved();
    } catch (err) {
      window.toast && window.toast(`Save failed: ${err.message || err}`, "error");
    } finally {
      setBusyId(null);
    }
  };
  // Save-all-then-close: catches the "edited three rows, hit Done" case
  // where per-row Save was never clicked. Each row's update fires in
  // parallel; any error stops the close so the user can fix and retry.
  const dirtyCount = drafts.filter(d => d.dirty).length;
  const doneClick = async () => {
    if (dirtyCount === 0) { onClose && onClose(); return; }
    setSavingAll(true);
    try {
      const sb = window.getSupabase && window.getSupabase();
      const dirty = drafts.filter(d => d.dirty);
      const results = await Promise.all(dirty.map(d =>
        sb.from("agency_lead_sources").update(buildPatch(d)).eq("id", d.id).then(r => ({ d, error: r.error }))
      ));
      const failed = results.filter(r => r.error);
      if (failed.length) {
        window.toast && window.toast(`${failed.length} save${failed.length > 1 ? "s" : ""} failed — check the rows and try again`, "error");
        return;
      }
      window.toast && window.toast(`Saved ${dirty.length} vendor${dirty.length > 1 ? "s" : ""}`, "success");
      onSaved && onSaved();
      onClose && onClose();
    } finally {
      setSavingAll(false);
    }
  };
  return (
    <Shared.Modal title="Manage vendors" width={620} onClose={dirtyCount > 0 ? undefined : onClose} actions={
      <button className="btn btn-primary" onClick={doneClick} disabled={savingAll}>
        {savingAll ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} & close` : "Done"}
      </button>
    }>
      {sources.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          No vendors yet. Use "New vendor" to create your first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 110px 80px 80px", gap: 8, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, padding: "0 6px" }}>
            <div>Name</div>
            <div style={{ textAlign: "right" }}>Cost / lead</div>
            <div style={{ textAlign: "center" }}>Active</div>
            <div></div>
          </div>
          {drafts.map(d => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 110px 80px 80px", gap: 8, alignItems: "center", padding: "6px", borderRadius: 6, background: d.dirty ? "color-mix(in oklch, var(--accent-money) 6%, transparent)" : "transparent" }}>
              <input className="input" value={d.name} onChange={e => setDraft(d.id, { name: e.target.value })} />
              <input className="input" type="number" min="0" step="0.01" value={d.cost_per_lead} onChange={e => setDraft(d.id, { cost_per_lead: e.target.value })} placeholder="—" style={{ textAlign: "right" }} />
              <label style={{ display: "flex", justifyContent: "center" }}>
                <input type="checkbox" checked={d.active} onChange={e => setDraft(d.id, { active: e.target.checked })} />
              </label>
              <button
                className="btn btn-primary"
                onClick={() => save(d)}
                disabled={!d.dirty || busyId === d.id}
                style={{ padding: "4px 10px", fontSize: 11 }}
              >{busyId === d.id ? "…" : "Save"}</button>
            </div>
          ))}
        </div>
      )}
    </Shared.Modal>
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
