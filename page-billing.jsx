/* page-billing.jsx — Pricing modal, plan upgrade flows, agency switcher,
   audit-log instrumentation. */

(function () {

const PLANS = [
  {
    id: "rep_solo",
    name: "Rep Solo",
    priceLabel: "$97/mo",
    pitch: "Standalone rep dashboard. Bring your own carriers, your own leads, your own pipeline. Upgrade to Agency when you scale beyond yourself.",
    bullets: [
      "Pipeline + dial queue + call review for one producer",
      "AI co-pilot + click-to-call (Twilio softphone)",
      "Compliance vault + SOA generator",
      "Mobile rep app",
      "No setup fee · cancel anytime",
    ],
    trial: "Optional 7-day free trial",
    cta: "Start Solo",
    color: "var(--accent-status)",
  },
  {
    id: "agency_setup",
    name: "Agency Starter",
    priceLabel: "$5,000 setup + $997/mo",
    pitch: "Full IMO operating system. The $5k onboarding fee covers white-glove setup, carrier integrations, producer onboarding, and your first 30 days. No charge until day 31.",
    bullets: [
      "Everything in Rep Solo, for the whole team",
      "Multi-tenant: invite producers, scope by role",
      "Recruiting workbench + sequences + inbound DM AI",
      "Tiering, NIGO, attribution, P&L, forecasting",
      "Owner dashboard + per-agency notifications",
      "Audit log + compliance export",
    ],
    badge: "Most teams pick this",
    cta: "Start Agency",
    color: "var(--accent-money)",
    highlight: true,
  },
  {
    id: "agency_trial_7d",
    name: "Try Agency · 7 days",
    priceLabel: "Free for 7 days",
    pitch: "Want to kick the tires before committing the $5k setup? Run the full agency stack for 7 days; convert and the setup fee bills at trial end.",
    bullets: [
      "Full Agency Starter feature set during trial",
      "Setup fee + first month bill at trial end",
      "Cancel before day 7 — no charge, no questions",
      "Your data stays in your Supabase project either way",
    ],
    cta: "Start 7-day trial",
    color: "var(--state-info)",
  },
];
window.PRICING_PLANS = PLANS;

function PricingModal({ onClose, currentTier, agencyId, customerEmail }) {
  const [busy, setBusy] = React.useState(null);
  const [err, setErr]   = React.useState("");

  const startCheckout = async (plan) => {
    setBusy(plan); setErr("");
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, agency_id: agencyId, customer_email: customerEmail }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "stripe_not_configured" ? "Stripe not connected — see Settings → Integrations → Stripe (admin only)" : (j.error || "checkout failed"));
      if (j.url) window.location.href = j.url;
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(null); }
  };

  return (
    <Shared.Modal title="Choose a plan" width={920} onClose={onClose} actions={
      <button className="btn btn-ghost" onClick={onClose}>Maybe later</button>
    }>
      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {PLANS.map(p => (
          <div key={p.id} className="panel" style={{ padding: 18, position: "relative", borderColor: p.highlight ? p.color : undefined, boxShadow: p.highlight ? `0 0 0 1px ${p.color}, 0 12px 28px -16px rgba(0,0,0,0.5)` : undefined, opacity: currentTier === p.id ? 0.6 : 1 }}>
            {p.badge && <span className="chip" style={{ position: "absolute", top: 10, right: 10, background: `color-mix(in oklch, ${p.color} 14%, transparent)`, color: p.color, borderColor: `color-mix(in oklch, ${p.color} 30%, transparent)` }}>{p.badge}</span>}
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{p.id === "rep_solo" ? "Solo" : p.id === "agency_setup" ? "Agency" : "Trial"}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, marginTop: 6 }}>{p.name}</div>
            <div className="tabular" style={{ fontSize: 18, fontWeight: 500, color: p.color, marginTop: 4 }}>{p.priceLabel}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}>{p.pitch}</div>
            <ul style={{ margin: "12px 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {p.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            {p.trial && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{p.trial}</div>}
            <button className={`btn ${p.highlight ? "btn-primary" : ""}`} style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => startCheckout(p.id)} disabled={busy != null || currentTier === p.id}>
              {busy === p.id ? "Redirecting..." : currentTier === p.id ? "Current plan" : p.cta}
            </button>
          </div>
        ))}
      </div>
      {err && <div style={{ marginTop: 12, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>{err}</div>}
      <div style={{ marginTop: 14, padding: 10, background: "var(--bg-raised)", borderRadius: 6, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
        Stripe handles every charge. We never see your card. Cancel from the billing portal at any time.
        Payment failures pause the subscription; data stays put for 30 days while you sort it out.
      </div>
    </Shared.Modal>
  );
}
window.PricingModal = PricingModal;

/* ─── Plan card for Admin (replaces the static one) ────────────────────── */
function AdminPlanCard({ agency }) {
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [portalBusy, setPortalBusy]   = React.useState(false);

  const plan         = agency?.tier || "agency_starter";
  const planLabel    = plan === "rep_solo" ? "Rep Solo" : plan === "agency_starter" ? "Agency Starter" : plan === "agency_growth" ? "Agency Growth" : "Agency Enterprise";
  const status        = agency?.subscription_status || "trial";
  const trialEndsAt   = agency?.trial_ends_at ? new Date(agency.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))) : null;
  const monthly       = agency?.monthly_price_cents != null ? agency.monthly_price_cents / 100 : (plan === "rep_solo" ? 97 : 997);
  const periodEnd     = agency?.current_period_end ? new Date(agency.current_period_end) : null;

  const openPortal = async () => {
    if (!agency?.subscription_id) { setPricingOpen(true); return; }
    setPortalBusy(true);
    try {
      const sb = window.getSupabase();
      const { data: session } = await sb.auth.getSession();
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ agency_id: agency.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "portal failed");
      window.location.href = j.url;
    } catch (e) {
      window.toast && window.toast(`Couldn't open billing portal: ${e.message}`, "error");
    } finally { setPortalBusy(false); }
  };

  return (
    <div className="panel">
      <div className="panel-h">
        <Icons.Folder size={13}/>
        <h3>Plan</h3>
        <span className="chip" style={{ marginLeft: "auto", color: status === "active" ? "var(--accent-money)" : status === "trialing" ? "var(--state-info)" : status === "past_due" ? "var(--state-danger)" : "var(--text-tertiary)" }}>{status}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>{planLabel}</div>
        <div className="tabular" style={{ fontSize: 14, color: "var(--accent-money)", marginTop: 2 }}>${monthly.toFixed(0)}/mo</div>

        {trialDaysLeft != null && trialDaysLeft > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: "color-mix(in oklch, var(--state-info) 10%, transparent)", borderRadius: 6, fontSize: 12, color: "var(--state-info)" }}>
            <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left in trial.</strong> {agency?.trial_kind === "agency_trial_7d" ? "$5,000 setup + $997 first month bills at end." : "Then $997/mo recurring."}
          </div>
        )}

        {periodEnd && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Renews {periodEnd.toLocaleDateString()} at ${monthly.toFixed(0)}.
          </div>
        )}

        <div className="divider"></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!agency?.subscription_id ? (
            <>
              <button className="btn btn-primary" style={{ justifyContent: "center" }} onClick={() => setPricingOpen(true)}>
                <Icons.ArrowUpRight size={12}/> Activate subscription
              </button>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                $5k Agency · $97 Rep Solo · 7-day free trial available
              </div>
            </>
          ) : (
            <>
              <button className="btn" style={{ justifyContent: "center" }} onClick={openPortal} disabled={portalBusy}>
                <Icons.ArrowUpRight size={12}/> {portalBusy ? "Loading..." : "Manage billing"}
              </button>
              <button className="btn btn-ghost" style={{ justifyContent: "center", fontSize: 11 }} onClick={() => setPricingOpen(true)}>Change plan</button>
            </>
          )}
        </div>
      </div>
      {pricingOpen && (
        <PricingModal currentTier={plan} agencyId={agency?.id} customerEmail={null} onClose={() => setPricingOpen(false)}/>
      )}
    </div>
  );
}
window.AdminPlanCard = AdminPlanCard;

/* ─── Agency switcher in Topbar (only renders if user has > 1 membership) ── */
function AgencySwitcher() {
  const [memberships, setMemberships] = React.useState([]);
  const [active, setActive] = React.useState(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(async ({ data }) => {
      if (!data?.session) return;
      
      const isSuper = window.isSuperAdmin && window.isSuperAdmin();
      let memberships = [];

      if (isSuper) {
        // Super admin sees ALL agencies.
        const { data: allAgencies } = await sb.from("agencies").select("id, slug, name").order("name");
        memberships = (allAgencies || []).map(a => ({
          agency_id: a.id,
          role: "super_admin",
          agencies: a
        }));
      } else {
        // Regular user sees only their memberships.
        const { data: m } = await sb.from("agency_members").select("agency_id, role, agencies(id, slug, name)").eq("user_id", data.session.user.id).eq("active", true);
        memberships = m || [];
      }

      if (memberships.length > 0) {
        setMemberships(memberships);
        const stored = localStorage.getItem("repflow.active_agency");
        const found = memberships.find(x => x.agency_id === stored) || memberships[0];
        if (found) setActive(found);
      }
    });
  }, []);

  if (memberships.length < 2) return null;

  const switchTo = (m) => {
    setActive(m); setOpen(false);
    localStorage.setItem("repflow.active_agency", m.agency_id);
    window.toast && window.toast(`Switched to ${m.agencies.name}`, "info");
    window.hydrateFromSupabase && window.hydrateFromSupabase();
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setOpen(o => !o)}>
        <Icons.Folder size={11}/>
        <span style={{ fontWeight: 500 }}>{active?.agencies?.name || "—"}</span>
        <Icons.ChevronDown size={11}/>
      </button>
      {open && (
        <div style={{ position: "absolute", top: 36, right: 0, minWidth: 240, padding: 4, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 8, boxShadow: "var(--shadow-floating)", zIndex: 50 }}>
          {memberships.map(m => (
            <button key={m.agency_id} onClick={() => switchTo(m)} className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", background: active?.agency_id === m.agency_id ? "var(--bg-raised)" : "transparent" }}>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{m.agencies.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{m.role}</div>
              </div>
              {active?.agency_id === m.agency_id && <Icons.Check size={11} style={{ color: "var(--accent-money)" }}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
window.AgencySwitcher = AgencySwitcher;

/* ─── Audit-log instrumentation: monkey-patch mutate.* to also append audit events ── */
(function instrumentAudit() {
  if (!window.AppData?.mutate) {
    setTimeout(instrumentAudit, 100);
    return;
  }
  const m = window.AppData.mutate;

  const tryAudit = async (action, target, metadata) => {
    if (!window.AppData.LIVE) return;  // demo mode: skip
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return;
    try {
      const { data: ag } = await sb.from("agencies").select("id").limit(1).single();
      if (!ag) return;
      sb.rpc("log_audit", { p_agency_id: ag.id, p_action: action, p_target: target || null, p_metadata: metadata || {}, p_actor_role: null }).then(() => {});
    } catch (_e) {}
  };

  const wrap = (name, action, getTarget, getMetadata) => {
    const orig = m[name];
    if (typeof orig !== "function") return;
    m[name] = async function (...args) {
      const result = await orig.apply(this, args);
      tryAudit(action, getTarget ? getTarget(...args) : null, getMetadata ? getMetadata(...args) : null);
      return result;
    };
  };

  wrap("pipelineStage",      "pipeline.stage",      (id, stage) => String(id),       (id, stage) => ({ stage }));
  wrap("pipelineOwner",      "pipeline.reassign",   (id) => String(id),               (id, owner) => ({ owner_rep_id: owner }));
  wrap("pipelineInsert",     "pipeline.insert",     (row) => row?.lead || "—",        (row) => ({ product: row?.product, source: row?.source }));
  wrap("pipelineDelete",     "pipeline.delete",     (id) => String(id),               null);
  wrap("queueAssign",        "queue.assign",        (qid, rid) => String(qid),         (qid, rid) => ({ rep_id: rid }));
  wrap("tieringOverride",    "tiering.override",    (rid, tier) => rid,                (rid, tier) => ({ tier }));
  wrap("sequenceEnroll",     "sequence.enroll",     (lid, sid) => String(lid),         (lid, sid, rid) => ({ sequence_id: sid, owner: rid }));
  wrap("orgSettingsSave",    "org.settings.save",    null,                               (patch) => patch);
  wrap("vaultArtifactInsert","vault.upload",         (a) => a?.kind || "—",              (a) => ({ lead: a?.lead_name }));
  wrap("vaultRetentionUpdate","vault.retention",     (id) => String(id),                 (id, ret) => ({ retention: ret }));
  wrap("nigoCreate",          "nigo.create",          (n) => n?.reason || "—",            (n) => ({ pipeline_id: n?.pipeline_id }));
  wrap("nigoStatus",          "nigo.status",          (id, s) => String(id),              (id, s) => ({ status: s }));
  wrap("recruitingApplicantAdd","recruit.applicant.add", (a) => a?.name || "—",            (a) => ({ campaign_id: a?.campaign_id }));
  wrap("recruitingMessageSend", "recruit.message.send", (aid) => String(aid),               (aid, body, ch) => ({ channel: ch, body_len: (body || "").length }));
  wrap("workflowToggle",      "workflow.toggle",      (id, a) => String(id),              (id, a) => ({ active: a }));
  wrap("routingRuleSave",     "routing.save",         (r) => r?.source || "—",            (r) => ({ route: r?.route_to, weight: r?.weight }));
  wrap("connectionStatus",    "connection.status",    (id) => String(id),                  (id, s, meta) => ({ status: s, meta }));
})();

})();
