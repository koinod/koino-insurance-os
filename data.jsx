/* Demo data for Repflow */
const TIERS = ["bronze", "silver", "gold", "platinum", "diamond"];
const TIER_LABELS = { bronze: "BRONZE", silver: "SILVER", gold: "GOLD", platinum: "PLAT", diamond: "DIAMOND" };

const REPS = [
  { id: "marc", name: "Marcus Avila", handle: "@marc", tier: "platinum", mtd: 42310, today: 2840, streak: 18, dials: 87, presence: "live", appts: 4, color: "linear-gradient(135deg,#5b86e5,#36d1dc)" },
  { id: "dani", name: "Dani Rivera", handle: "@dani", tier: "diamond", mtd: 58920, today: 3120, streak: 31, dials: 102, presence: "live", appts: 6, color: "linear-gradient(135deg,#ee0979,#ff6a00)" },
  { id: "tony", name: "Tony Park", handle: "@tony", tier: "gold", mtd: 31480, today: 1240, streak: 9, dials: 64, presence: "live", appts: 3, color: "linear-gradient(135deg,#11998e,#38ef7d)" },
  { id: "kira", name: "Kira Walsh", handle: "@kira", tier: "platinum", mtd: 38770, today: 2010, streak: 14, dials: 71, presence: "idle", appts: 2, color: "linear-gradient(135deg,#f7971e,#ffd200)" },
  { id: "jada", name: "Jada Brooks", handle: "@jada", tier: "gold", mtd: 27340, today: 980, streak: 6, dials: 58, presence: "live", appts: 2, color: "linear-gradient(135deg,#fc466b,#3f5efb)" },
  { id: "luis", name: "Luis Ortiz", handle: "@luis", tier: "silver", mtd: 18620, today: 540, streak: 4, dials: 42, presence: "idle", appts: 1, color: "linear-gradient(135deg,#7f00ff,#e100ff)" },
  { id: "sade", name: "Sade Okafor", handle: "@sade", tier: "gold", mtd: 24180, today: 720, streak: 11, dials: 49, presence: "live", appts: 2, color: "linear-gradient(135deg,#00b09b,#96c93d)" },
  { id: "remy", name: "Remy Chen", handle: "@remy", tier: "silver", mtd: 14920, today: 360, streak: 0, dials: 31, presence: "idle", appts: 0, color: "linear-gradient(135deg,#fa709a,#fee140)" },
  { id: "alex", name: "Alex Bauer", handle: "@alex", tier: "bronze", mtd: 8940, today: 220, streak: 0, dials: 22, presence: "idle", appts: 0, color: "linear-gradient(135deg,#a18cd1,#fbc2eb)" },
];

const PIPELINE = [
  { id: 1, lead: "Cheryl Hampton", age: 67, state: "TX", stage: "Quoted", product: "Med Supp Plan G", ap: 1840, days: 1, last: "Today, 11:14a", next: "SOA scheduled", source: "FB Lead Form", owner: "marc", consent: "verified", heat: "hot" },
  { id: 2, lead: "Robert Mendez", age: 71, state: "FL", stage: "App In", product: "Final Expense $15K", ap: 1320, days: 2, last: "Today, 9:02a", next: "Carrier review", source: "Inbound call", owner: "dani", consent: "verified", heat: "hot" },
  { id: 3, lead: "Linda Cho", age: 64, state: "NV", stage: "Contacted", product: "Med Supp Plan N", ap: 1610, days: 0, last: "8m ago", next: "Quote send", source: "T65 list", owner: "marc", consent: "verified", heat: "fresh" },
  { id: 4, lead: "Jamal Wright", age: 58, state: "GA", stage: "New", product: "Final Expense $25K", ap: 0, days: 0, last: "47s ago", next: "First dial", source: "FB Lead Form", owner: "tony", consent: "verified", heat: "fresh" },
  { id: 5, lead: "Patricia Volker", age: 69, state: "AZ", stage: "Quoted", product: "Med Supp Plan G", ap: 2120, days: 3, last: "Yesterday", next: "Follow-up call", source: "Referral", owner: "kira", consent: "verified", heat: "warm" },
  { id: 6, lead: "Henry Akins", age: 73, state: "OH", stage: "App In", product: "Annuity $50K", ap: 4250, days: 4, last: "2d ago", next: "Carrier sigs", source: "Cross-sell", owner: "dani", consent: "verified", heat: "warm" },
  { id: 7, lead: "Naomi Reese", age: 65, state: "PA", stage: "Issued", product: "Med Supp Plan G", ap: 1780, days: 7, last: "5d ago", next: "Welcome call", source: "T65 list", owner: "jada", consent: "verified", heat: "cold" },
  { id: 8, lead: "Don Phelps", age: 70, state: "MI", stage: "Contacted", product: "Final Expense $10K", ap: 0, days: 1, last: "Today, 8:41a", next: "Re-dial 4p", source: "FB Lead Form", owner: "sade", consent: "verified", heat: "warm" },
  { id: 9, lead: "Anita Boswell", age: 66, state: "NC", stage: "New", product: "Med Supp Plan G", ap: 0, days: 0, last: "12s ago", next: "First dial", source: "Inbound call", owner: "marc", consent: "verified", heat: "fresh" },
  { id: 10, lead: "Carl Greavy", age: 68, state: "WI", stage: "Quoted", product: "Med Supp Plan N", ap: 1490, days: 2, last: "Today, 10:22a", next: "SOA Thursday", source: "Referral", owner: "tony", consent: "verified", heat: "warm" },
  { id: 11, lead: "Ramona Diaz", age: 72, state: "CA", stage: "App In", product: "Final Expense $20K", ap: 1660, days: 1, last: "Today, 12:08p", next: "Beneficiary form", source: "FB Lead Form", owner: "kira", consent: "verified", heat: "hot" },
  { id: 12, lead: "Ed Yamamoto", age: 65, state: "WA", stage: "Issued", product: "Med Supp Plan G", ap: 1820, days: 9, last: "Last week", next: "30-day check", source: "T65 list", owner: "jada", consent: "verified", heat: "cold" },
];

const QUEUE = [
  { id: "q1", lead: "Cheryl Hampton", age: 67, state: "TX", source: "FB Lead Form", product: "Med Supp", elapsed: 14, score: 92 },
  { id: "q2", lead: "Jamal Wright", age: 58, state: "GA", source: "FB Lead Form", product: "Final Expense", elapsed: 47, score: 88 },
  { id: "q3", lead: "Anita Boswell", age: 66, state: "NC", source: "Inbound", product: "Med Supp", elapsed: 12, score: 95 },
  { id: "q4", lead: "Mike Castelli", age: 64, state: "TX", source: "T65 List", product: "Med Supp", elapsed: 102, score: 78 },
  { id: "q5", lead: "Vivian Pak", age: 70, state: "FL", source: "FB Lead Form", product: "Final Expense", elapsed: 28, score: 84 },
  { id: "q6", lead: "Travis Heller", age: 65, state: "CA", source: "Referral", product: "Med Supp", elapsed: 156, score: 81 },
];

const COURSES = [
  { id: "c1", title: "Final Expense Closing 101", track: "FE", durMin: 28, status: "complete" },
  { id: "c2", title: "TPMO Disclaimer Mastery", track: "Compliance", durMin: 12, status: "due" },
  { id: "c3", title: "Med Supp Plan G vs N — when to switch", track: "Med Supp", durMin: 22, status: "in-progress" },
  { id: "c4", title: "AEP Surge Playbook 2026", track: "AEP", durMin: 45, status: "assigned" },
];

const RECORDINGS = [
  { id: "r1", lead: "Cheryl Hampton", date: "Today, 11:14a", durSec: 1842, talkRatio: 38, openQ: 11, ai: "Strong rapport. Closed-ended on 'how do you spend your days now' — try open phrasing.", flags: { tpmo: "ok", soa: "scheduled" }, score: 87 },
  { id: "r2", lead: "Robert Mendez", date: "Today, 9:02a", durSec: 1206, talkRatio: 58, openQ: 4, ai: "Talk ratio too high. Robert tried twice to share medication concern — re-direct rebuttal hurt rapport.", flags: { tpmo: "ok", soa: "captured" }, score: 64 },
  { id: "r3", lead: "Linda Cho", date: "Yesterday, 4:42p", durSec: 920, talkRatio: 42, openQ: 8, ai: "Good price-anchor sequence. Missed cross-sell to Plan F → N alternative.", flags: { tpmo: "ok", soa: "n/a" }, score: 78 },
];

const CONNECTIONS = [
  { id: "twilio", name: "Twilio", category: "Comms", status: "ok", meta: "A2P 10DLC verified · 4 numbers" },
  { id: "convoso", name: "Convoso", category: "Dialer", status: "ok", meta: "Auto-dial · 124 dials/hr avg" },
  { id: "vapi", name: "Vapi", category: "Voice AI", status: "ok", meta: "3 agents deployed" },
  { id: "ipipe", name: "iPipeline iGO", category: "E-app", status: "ok", meta: "Last sync 2m ago" },
  { id: "fire", name: "Firelight", category: "E-app", status: "warn", meta: "Token refresh required" },
  { id: "uhc", name: "UHC Producer", category: "Carrier", status: "ok", meta: "47 appointments active" },
  { id: "humana", name: "Humana Vantage", category: "Carrier", status: "ok", meta: "32 appointments active" },
  { id: "aetna", name: "Aetna SRC", category: "Carrier", status: "ok", meta: "29 appointments active" },
  { id: "stripe", name: "Stripe", category: "Payments", status: "ok", meta: "Override payouts · monthly" },
  { id: "jornaya", name: "Jornaya", category: "Compliance", status: "ok", meta: "LeadiD on 100% of inbound" },
  { id: "trusted", name: "TrustedForm", category: "Compliance", status: "ok", meta: "Certificates retained 13mo" },
  { id: "mailgun", name: "Mailgun", category: "Comms", status: "ok", meta: "98.2% deliverability" },
];

const HARDWARE = [
  { id: "h1", name: "Office Mac Mini — Atlanta", kind: "Mac Mini M4", status: "ok", uptime: "47d 6h", load: 22, agents: 3, last: "12s ago" },
  { id: "h2", name: "Office Mac Mini — Tampa", kind: "Mac Mini M4", status: "ok", uptime: "12d 2h", load: 18, agents: 2, last: "8s ago" },
  { id: "h3", name: "VPS — us-east-1", kind: "Hetzner CCX23", status: "ok", uptime: "92d 14h", load: 31, agents: 4, last: "4s ago" },
  { id: "h4", name: "VPS — us-west-2", kind: "Hetzner CCX23", status: "warn", uptime: "12h", load: 64, agents: 4, last: "2s ago" },
];

const AGENTS = [
  { id: "a1", name: "Lead Enricher", host: "VPS-east", reqs: "1.2k/d", success: 99.4, last: "now", desc: "Pulls property, household, prior policy from carrier APIs." },
  { id: "a2", name: "Speed-to-Lead Dispatcher", host: "VPS-east", reqs: "847/d", success: 99.9, last: "now", desc: "Routes inbound FB leads to producer queue under 60s." },
  { id: "a3", name: "TPMO Compliance Scanner", host: "Mac Mini ATL", reqs: "402/d", success: 100, last: "1m", desc: "Listens to all calls, flags missing disclaimer or scope drift." },
  { id: "a4", name: "Vapi Rebuttal Voice", host: "VPS-west", reqs: "2.1k/d", success: 98.6, last: "now", desc: "On-demand objection rebuttal voice clips during live calls." },
  { id: "a5", name: "SOA Vault Archiver", host: "Mac Mini TPA", reqs: "183/d", success: 100, last: "3m", desc: "Captures, signs, and archives Scope-of-Appointment artifacts." },
  { id: "a6", name: "Persistency Predictor", host: "VPS-east", reqs: "44/d", success: 96.2, last: "12m", desc: "Predicts lapse risk on 12-mo cohort; surfaces save-the-policy actions." },
];

const WORKFLOWS = [
  { id: "w1", name: "FB Lead → Med Supp queue (T65, < 60s)", runs: "412/d", lastRun: "23s ago" },
  { id: "w2", name: "Final Expense intake → app-ready", runs: "118/d", lastRun: "2m ago" },
  { id: "w3", name: "Post-call SOA capture & vault", runs: "204/d", lastRun: "1m ago" },
  { id: "w4", name: "Cross-sell: FE issued → Med Supp 60d", runs: "12/d", lastRun: "3h ago" },
];

window.AppData = { TIERS, TIER_LABELS, REPS, PIPELINE, QUEUE, COURSES, RECORDINGS, CONNECTIONS, HARDWARE, AGENTS, WORKFLOWS, LIVE: false };

/* ────────────────────────────────────────────────────────────────────────────
   Live Supabase hydration. The publishable key is intentionally public-tier
   (RLS-protected). When the Supabase JS SDK loads (via UMD <script> in
   index.html), this fires and swaps the demo AppData arrays for live rows.

   Pages all read from window.AppData; on hydrate we mutate in place + fire a
   "data:hydrated" event so any mounted component can re-render via state pump.
   ──────────────────────────────────────────────────────────────────────────── */
window.SUPABASE_URL  = "https://zybndnqnbxarpkhqpcxq.supabase.co";
window.SUPABASE_ANON = "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W";

window.getSupabase = function () {
  if (!window.__supabase && window.supabase?.createClient) {
    window.__supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "repflow.auth" }
    });
  }
  return window.__supabase || null;
};

window.hydrateFromSupabase = async function () {
  const sb = window.getSupabase();
  if (!sb) return false;
  try {
    const [reps, pipeline, queue, courses, recordings, connections, hardware, agents, workflows] = await Promise.all([
      sb.from("reps").select("*").order("mtd_cents", { ascending: false }),
      sb.from("pipeline").select("*").order("days_in_stage", { ascending: false }),
      sb.from("queue").select("*").order("score", { ascending: false }),
      sb.from("courses").select("*"),
      sb.from("recordings").select("*").order("recorded_at", { ascending: false }),
      sb.from("connections").select("*"),
      sb.from("hardware").select("*"),
      sb.from("ai_agents").select("*"),
      sb.from("workflows").select("*"),
    ]);

    if (reps.data?.length) {
      window.AppData.REPS = reps.data.map(r => ({
        id: r.id, name: r.name, handle: r.handle, tier: r.tier,
        mtd: Math.round(r.mtd_cents / 100), today: Math.round(r.today_cents / 100),
        streak: r.streak_days, dials: r.dials, presence: r.presence,
        appts: r.appts, color: r.color
      }));
    }
    if (pipeline.data?.length) {
      window.AppData.PIPELINE = pipeline.data.map(p => ({
        id: p.id, lead: p.lead_name, age: p.age, state: p.state, stage: p.stage,
        product: p.product, ap: Math.round(p.ap_cents / 100), days: p.days_in_stage,
        last: p.last_activity_text, next: p.next_action, source: p.source,
        owner: p.owner_rep_id, consent: p.consent, heat: p.heat
      }));
    }
    if (queue.data?.length) {
      window.AppData.QUEUE = queue.data.map(q => ({
        id: q.id, lead: q.lead_name, age: q.age, state: q.state, source: q.source,
        product: q.product, elapsed: q.elapsed_seconds, score: q.score
      }));
    }
    if (courses.data?.length) {
      window.AppData.COURSES = courses.data.map(c => ({
        id: c.id, title: c.title, track: c.track, durMin: c.duration_min, status: c.status
      }));
    }
    if (recordings.data?.length) {
      window.AppData.RECORDINGS = recordings.data.map(r => ({
        id: r.id, lead: r.lead_name, repId: r.rep_id,
        date: new Date(r.recorded_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }),
        durSec: r.duration_sec, talkRatio: r.talk_ratio_pct, openQ: r.open_questions,
        ai: r.ai_summary, flags: { tpmo: r.tpmo_flag, soa: r.soa_flag }, score: r.score
      }));
    }
    if (connections.data?.length) {
      window.AppData.CONNECTIONS = connections.data.map(c => ({
        id: c.id, name: c.name, category: c.category, status: c.status, meta: c.meta
      }));
    }
    if (hardware.data?.length) {
      window.AppData.HARDWARE = hardware.data.map(h => ({
        id: h.id, name: h.name, kind: h.kind, status: h.status, uptime: h.uptime_text,
        load: h.load_pct, agents: h.agent_count, last: "live"
      }));
    }
    if (agents.data?.length) {
      window.AppData.AGENTS = agents.data.map(a => ({
        id: a.id, name: a.name, host: a.host_id, reqs: a.reqs_per_day,
        success: parseFloat(a.success_rate), last: "live", desc: a.description
      }));
    }
    if (workflows.data?.length) {
      window.AppData.WORKFLOWS = workflows.data.map(w => ({
        id: w.id, name: w.name, runs: w.runs_per_day,
        lastRun: w.last_run ? new Date(w.last_run).toLocaleString() : "—"
      }));
    }

    // ────────────────────────────────────────────────────────────────────────
    // V2 hydrate — pull the 38 tables added by migration 0002 so the new
    // domain-specific pages (commissions, recruits, NIGOs, AEP, messaging,
    // notifications, coaching, forecast, attribution, book of business,
    // tasks, tier history) have live data on render.
    // Failures here never block the v1 hydrate above.
    // ────────────────────────────────────────────────────────────────────────
    try {
      const [
        carriersR, productsR, apptsR,
        policiesR, commissionsR, payoutsR, clawbacksR,
        leadSourcesR, attributionsR, touchpointsR,
        nigoReasonsR, nigosR,
        forecastRunsR, forecastOverridesR,
        coachingSessionsR, coachingNotesR,
        vaultFilesR,
        householdsR, clientsR, bookEntriesR,
        recruitsR, interviewsR,
        threadsR, threadMembersR, messagesR, messageReadsR,
        notificationsR,
        tasksR, followupRulesR,
        tierChangesR,
        aepPeriodsR, aepAssignmentsR,
        sequencesR, seqEnrollmentsR,
        tieringOverridesR,
        agentDeploymentsR, agentRunsR,
      ] = await Promise.all([
        sb.from("carriers").select("*").order("name"),
        sb.from("products").select("*"),
        sb.from("carrier_appointments").select("*"),
        sb.from("policies").select("*").order("issued_at", { ascending: false }),
        sb.from("commissions").select("*").order("earned_at", { ascending: false }).limit(500),
        sb.from("payouts").select("*").order("period_end", { ascending: false }).limit(100),
        sb.from("clawbacks").select("*").order("recorded_at", { ascending: false }).limit(100),
        sb.from("lead_sources").select("*"),
        sb.from("attributions").select("*"),
        sb.from("touchpoints").select("*").order("occurred_at", { ascending: false }).limit(500),
        sb.from("nigo_reasons").select("*"),
        sb.from("nigos").select("*").order("created_at", { ascending: false }).limit(200),
        sb.from("forecast_runs").select("*").order("generated_at", { ascending: false }).limit(50),
        sb.from("forecast_overrides").select("*").order("set_at", { ascending: false }).limit(50),
        sb.from("coaching_sessions").select("*").order("scheduled_at", { ascending: false }).limit(100),
        sb.from("coaching_notes").select("*").order("created_at", { ascending: false }).limit(200),
        sb.from("vault_files").select("*").order("created_at", { ascending: false }).limit(200),
        sb.from("households").select("*"),
        sb.from("clients").select("*"),
        sb.from("book_entries").select("*"),
        sb.from("recruits").select("*").order("created_at", { ascending: false }),
        sb.from("interviews").select("*").order("scheduled_at", { ascending: false }),
        sb.from("threads").select("*").order("last_message_at", { ascending: false }).limit(50),
        sb.from("thread_members").select("*"),
        sb.from("messages").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("message_reads").select("*"),
        sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
        sb.from("tasks").select("*").order("due_at", { ascending: true }).limit(200),
        sb.from("followup_rules").select("*"),
        sb.from("tier_changes").select("*").order("changed_at", { ascending: false }).limit(100),
        sb.from("aep_periods").select("*"),
        sb.from("aep_assignments").select("*"),
        sb.from("sequences").select("*"),
        sb.from("sequence_enrollments").select("*").order("enrolled_at", { ascending: false }).limit(200),
        sb.from("tiering_overrides").select("*"),
        sb.from("agent_deployments").select("*").order("started_at", { ascending: false }).limit(50),
        sb.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(100),
      ]);

      const cents = (n) => Math.round((Number(n) || 0) / 100);
      const mapRows = (res, fn) => Array.isArray(res?.data) ? res.data.map(fn) : [];

      window.AppData.CARRIERS = mapRows(carriersR, c => ({
        id: c.id, name: c.name, category: c.category, status: c.status,
        productLines: c.product_lines || [], notes: c.notes,
        contact: { name: c.contact_name, phone: c.contact_phone, email: c.contact_email }
      }));
      window.AppData.PRODUCTS = mapRows(productsR, p => ({
        id: p.id, carrierId: p.carrier_id, name: p.name, category: p.category,
        compPct: p.comp_pct ? parseFloat(p.comp_pct) : null,
        compPerApp: p.comp_per_app_cents ? cents(p.comp_per_app_cents) : null,
        active: p.is_active
      }));
      window.AppData.APPOINTMENTS = mapRows(apptsR, a => ({
        id: a.id, carrierId: a.carrier_id, repId: a.rep_id, state: a.state,
        status: a.status, appointedAt: a.appointed_at, npn: a.npn
      }));
      window.AppData.POLICIES = mapRows(policiesR, p => ({
        id: p.id, leadId: p.lead_pipeline_id, carrierId: p.carrier_id,
        productId: p.product_id, policyNumber: p.policy_number,
        product: p.product_text, ap: cents(p.ap_cents),
        issuedAt: p.issued_at, effectiveAt: p.effective_at,
        status: p.status, persistency: p.persistency_status,
        owner: p.owner_rep_id, state: p.state
      }));
      window.AppData.COMMISSIONS = mapRows(commissionsR, c => ({
        id: c.id, policyId: c.policy_id, repId: c.rep_id,
        amount: cents(c.amount_cents), kind: c.kind, period: c.period_text,
        earnedAt: c.earned_at, paidAt: c.paid_at, source: c.source
      }));
      window.AppData.PAYOUTS = mapRows(payoutsR, p => ({
        id: p.id, repId: p.rep_id,
        periodStart: p.period_start, periodEnd: p.period_end,
        gross: cents(p.gross_cents), deductions: cents(p.deductions_cents),
        net: cents(p.net_cents), status: p.status, paidAt: p.paid_at
      }));
      window.AppData.CLAWBACKS = mapRows(clawbacksR, c => ({
        id: c.id, policyId: c.policy_id, repId: c.rep_id,
        amount: cents(c.amount_cents), reason: c.reason,
        recordedAt: c.recorded_at, status: c.status
      }));
      window.AppData.LEAD_SOURCES = mapRows(leadSourcesR, s => ({
        id: s.id, name: s.name, kind: s.kind, vendor: s.vendor,
        costPerLead: s.cost_per_lead_cents ? cents(s.cost_per_lead_cents) : 0
      }));
      window.AppData.ATTRIBUTIONS = mapRows(attributionsR, a => ({
        id: a.id, leadId: a.lead_pipeline_id, sourceId: a.source_id,
        firstTouch: a.first_touch_at, lastTouch: a.last_touch_at,
        model: a.model, creditPct: parseFloat(a.credit_pct)
      }));
      window.AppData.TOUCHPOINTS = mapRows(touchpointsR, t => ({
        id: t.id, leadId: t.lead_pipeline_id, sourceId: t.source_id,
        kind: t.kind, occurredAt: t.occurred_at
      }));
      window.AppData.NIGO_REASONS = mapRows(nigoReasonsR, r => ({
        id: r.id, label: r.label, category: r.category, severity: r.severity
      }));
      window.AppData.NIGOS = mapRows(nigosR, n => ({
        id: n.id, policyId: n.policy_id, pipelineId: n.pipeline_id,
        reasonId: n.reason_id, notes: n.notes, status: n.status,
        assignedTo: n.assigned_to, createdAt: n.created_at, resolvedAt: n.resolved_at
      }));
      window.AppData.FORECAST_RUNS = mapRows(forecastRunsR, f => ({
        id: f.id, generatedAt: f.generated_at, period: f.period_text,
        basis: f.basis, forecast: cents(f.forecast_cents),
        confidence: parseFloat(f.confidence_pct), model: f.model
      }));
      window.AppData.FORECAST_OVERRIDES = mapRows(forecastOverridesR, o => ({
        id: o.id, period: o.period_text, override: cents(o.override_cents),
        reason: o.reason, setBy: o.set_by, setAt: o.set_at
      }));
      window.AppData.COACHING_SESSIONS = mapRows(coachingSessionsR, s => ({
        id: s.id, repId: s.rep_id, coachHandle: s.coach_handle,
        scheduledAt: s.scheduled_at, completedAt: s.completed_at,
        focusArea: s.focus_area, recordingId: s.recording_id,
        outcome: s.outcome, rating: s.rating, notes: s.notes
      }));
      window.AppData.COACHING_NOTES = mapRows(coachingNotesR, n => ({
        id: n.id, sessionId: n.session_id, repId: n.rep_id,
        body: n.body, createdBy: n.created_by, createdAt: n.created_at
      }));
      window.AppData.VAULT_FILES = mapRows(vaultFilesR, v => ({
        id: v.id, filename: v.filename, kind: v.kind,
        policyId: v.policy_id, pipelineId: v.pipeline_id, repId: v.rep_id,
        bucket: v.bucket, path: v.path, sizeBytes: v.size_bytes,
        retentionUntil: v.retention_until
      }));
      window.AppData.HOUSEHOLDS = mapRows(householdsR, h => ({
        id: h.id, name: h.household_name, primaryLeadId: h.primary_lead_id,
        city: h.city, state: h.state
      }));
      window.AppData.CLIENTS = mapRows(clientsR, c => ({
        id: c.id, householdId: c.household_id, name: c.full_name,
        dob: c.dob, phone: c.contact_phone, email: c.contact_email,
        leadId: c.lead_pipeline_id, relationship: c.relationship
      }));
      window.AppData.BOOK_ENTRIES = mapRows(bookEntriesR, b => ({
        id: b.id, repId: b.rep_id, policyId: b.policy_id,
        inForceSince: b.in_force_since, lastReview: b.last_review_at,
        persistency: b.persistency_score ? parseFloat(b.persistency_score) : null
      }));
      window.AppData.RECRUITS = mapRows(recruitsR, r => ({
        id: r.id, name: r.full_name, source: r.source,
        email: r.contact_email, phone: r.contact_phone,
        state: r.license_state, hasLicense: r.has_license,
        status: r.status, recruiter: r.recruiter_handle, createdAt: r.created_at
      }));
      window.AppData.INTERVIEWS = mapRows(interviewsR, i => ({
        id: i.id, recruitId: i.recruit_id, scheduledAt: i.scheduled_at,
        completedAt: i.completed_at, interviewer: i.interviewer,
        outcome: i.outcome, notes: i.notes
      }));
      window.AppData.THREADS = mapRows(threadsR, t => ({
        id: t.id, kind: t.kind, subject: t.subject,
        relatedLeadId: t.related_lead_id, lastMessageAt: t.last_message_at
      }));
      window.AppData.THREAD_MEMBERS = mapRows(threadMembersR, m => ({
        id: m.id, threadId: m.thread_id, member: m.member_handle, muted: m.muted
      }));
      window.AppData.MESSAGES = mapRows(messagesR, m => ({
        id: m.id, threadId: m.thread_id, sender: m.sender_handle,
        body: m.body, createdAt: m.created_at
      }));
      window.AppData.MESSAGE_READS = mapRows(messageReadsR, r => ({
        id: r.id, messageId: r.message_id, reader: r.reader_handle, readAt: r.read_at
      }));
      window.AppData.NOTIFICATIONS = mapRows(notificationsR, n => ({
        id: n.id, recipient: n.recipient_handle, kind: n.kind,
        title: n.title, body: n.body, link: n.link,
        severity: n.severity, readAt: n.read_at, createdAt: n.created_at
      }));
      window.AppData.TASKS = mapRows(tasksR, t => ({
        id: t.id, repId: t.rep_id, kind: t.kind, title: t.title, body: t.body,
        dueAt: t.due_at, completedAt: t.completed_at,
        relatedLeadId: t.related_lead_id, relatedPolicyId: t.related_policy_id,
        priority: t.priority, status: t.status
      }));
      window.AppData.FOLLOWUP_RULES = mapRows(followupRulesR, r => ({
        id: r.id, name: r.name, trigger: r.trigger, action: r.action, active: r.is_active
      }));
      window.AppData.TIER_CHANGES = mapRows(tierChangesR, c => ({
        id: c.id, repId: c.rep_id, from: c.from_tier, to: c.to_tier,
        reason: c.reason, changedBy: c.changed_by, changedAt: c.changed_at
      }));
      window.AppData.AEP_PERIODS = mapRows(aepPeriodsR, p => ({
        id: p.id, name: p.name, startsAt: p.starts_at, endsAt: p.ends_at, status: p.status
      }));
      window.AppData.AEP_ASSIGNMENTS = mapRows(aepAssignmentsR, a => ({
        id: a.id, periodId: a.period_id, repId: a.rep_id, territory: a.territory,
        targetApps: a.target_apps, targetAp: cents(a.target_ap_cents),
        completedApps: a.completed_apps, completedAp: cents(a.completed_ap_cents)
      }));
      window.AppData.SEQUENCES = mapRows(sequencesR, s => ({
        id: s.id, name: s.name, description: s.description,
        steps: s.steps, active: s.is_active
      }));
      window.AppData.SEQUENCE_ENROLLMENTS = mapRows(seqEnrollmentsR, e => ({
        id: e.id, leadId: e.lead_pipeline_id, sequenceId: e.sequence_id,
        owner: e.owner_rep_id, status: e.status, currentStep: e.current_step,
        enrolledAt: e.enrolled_at, nextStepAt: e.next_step_at
      }));
      window.AppData.TIERING_OVERRIDES = mapRows(tieringOverridesR, o => ({
        repId: o.rep_id, tier: o.override_tier, setAt: o.set_at, setBy: o.set_by
      }));
      window.AppData.DEPLOYMENTS = mapRows(agentDeploymentsR, d => ({
        id: d.id, agentId: d.agent_id, hostId: d.host_id, status: d.status,
        manifest: d.manifest, lastHeartbeat: d.last_heartbeat, startedAt: d.started_at
      }));
      window.AppData.AGENT_RUNS = mapRows(agentRunsR, r => ({
        id: r.id, agentId: r.agent_id, hostId: r.host_id,
        startedAt: r.started_at, endedAt: r.ended_at, durationMs: r.duration_ms,
        status: r.status, output: r.output_text, error: r.error_text
      }));
    } catch (v2err) {
      // v2 tables may not exist yet — that's fine, v1 hydrate already succeeded.
      console.warn("[supabase] v2 hydrate skipped:", v2err?.message ?? v2err);
    }

    window.AppData.LIVE = true;
    window.dispatchEvent(new CustomEvent("data:hydrated"));
    return true;
  } catch (err) {
    console.warn("[supabase] hydration failed, staying on demo data:", err);
    return false;
  }
};

// Fire-and-forget on script load. Defers until SDK is ready (UMD may load later).
(function tryHydrate(retries) {
  if (window.supabase?.createClient) { window.hydrateFromSupabase(); return; }
  if (retries > 0) setTimeout(() => tryHydrate(retries - 1), 100);
})(50);

/* ────────────────────────────────────────────────────────────────────────────
   Mutation helpers — every callsite calls window.AppData.mutate.X(...) which:
     1. Updates the local AppData array (optimistic, fires "data:mutated")
     2. If LIVE, writes the change to Supabase under the hood
   The local update keeps demo mode and refresh-resistance both working.
   ──────────────────────────────────────────────────────────────────────────── */

function _emitMutation(table, kind, id) {
  window.dispatchEvent(new CustomEvent("data:mutated", { detail: { table, kind, id } }));
}

/* ────────────────────────────────────────────────────────────────────────────
   Realtime subscriptions — when another operator (or a backend cron) inserts
   or updates a row, mutate the in-memory AppData array in place and dispatch
   data:hydrated so every page re-renders without a refresh.

   Subscribes once, on first hydrate, and shares the channel across pages.
   ──────────────────────────────────────────────────────────────────────────── */
window.subscribeRealtime = function () {
  const sb = window.getSupabase && window.getSupabase();
  if (!sb || window.__rt_subscribed) return;
  window.__rt_subscribed = true;

  const TABLE_TO_KEY = {
    pipeline:    "PIPELINE",
    queue:       "QUEUE",
    reps:        "REPS",
    hardware:    "HARDWARE",
    ai_agents:   "AGENTS",
    connections: "CONNECTIONS",
    workflows:   "WORKFLOWS",
    agent_deployments: "DEPLOYMENTS",
    agent_runs:        "AGENT_RUNS",
  };

  // Same DB→JS shape mapper used by hydrate, narrowed per table
  const toJs = (table, r) => {
    if (table === "pipeline")   return { id: r.id, lead: r.lead_name, age: r.age, state: r.state, stage: r.stage, product: r.product, ap: Math.round(r.ap_cents/100), days: r.days_in_stage, last: r.last_activity_text, next: r.next_action, source: r.source, owner: r.owner_rep_id, consent: r.consent, heat: r.heat };
    if (table === "queue")      return { id: r.id, lead: r.lead_name, age: r.age, state: r.state, source: r.source, product: r.product, elapsed: r.elapsed_seconds, score: r.score };
    if (table === "reps")       return { id: r.id, name: r.name, handle: r.handle, tier: r.tier, mtd: Math.round(r.mtd_cents/100), today: Math.round(r.today_cents/100), streak: r.streak_days, dials: r.dials, presence: r.presence, appts: r.appts, color: r.color };
    if (table === "hardware")   return { id: r.id, name: r.name, kind: r.kind, status: r.status, uptime: r.uptime_text, load: r.load_pct, agents: r.agent_count, last: "live" };
    if (table === "ai_agents")  return { id: r.id, name: r.name, host: r.host_id, reqs: r.reqs_per_day, success: parseFloat(r.success_rate), last: "live", desc: r.description };
    if (table === "connections")return { id: r.id, name: r.name, category: r.category, status: r.status, meta: r.meta };
    if (table === "workflows")  return { id: r.id, name: r.name, runs: r.runs_per_day, lastRun: r.last_run };
    if (table === "agent_deployments") return { id: r.id, agent_id: r.agent_id, host_id: r.host_id, status: r.status, manifest: r.manifest, deployed_at: r.deployed_at, last_heartbeat: r.last_heartbeat };
    if (table === "agent_runs") return { id: r.id, deployment_id: r.deployment_id, started_at: r.started_at, finished_at: r.finished_at, status: r.status, log: r.log, exit_code: r.exit_code };
    return r;
  };

  const channel = sb.channel("repflow-rt");
  Object.keys(TABLE_TO_KEY).forEach(table => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const key = TABLE_TO_KEY[table];
      window.AppData[key] = window.AppData[key] || [];
      const arr = window.AppData[key];
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === "INSERT" && newRow) {
        const mapped = toJs(table, newRow);
        if (!arr.find(x => x.id === mapped.id)) arr.unshift(mapped);
      } else if (eventType === "UPDATE" && newRow) {
        const idx = arr.findIndex(x => x.id === newRow.id);
        if (idx >= 0) arr[idx] = toJs(table, newRow);
      } else if (eventType === "DELETE" && oldRow) {
        const idx = arr.findIndex(x => x.id === oldRow.id);
        if (idx >= 0) arr.splice(idx, 1);
      }
      window.dispatchEvent(new CustomEvent("data:realtime", { detail: { table, eventType, id: (newRow || oldRow)?.id } }));
      window.dispatchEvent(new CustomEvent("data:hydrated"));
    });
  });
  channel.subscribe(status => {
    if (status === "SUBSCRIBED") {
      console.info("[repflow] realtime channel live across", Object.keys(TABLE_TO_KEY).length, "tables");
    }
  });
  return channel;
};

// Auto-subscribe after first hydrate
window.addEventListener("data:hydrated", () => { try { window.subscribeRealtime(); } catch (_e) {} }, { once: true });

window.AppData.mutate = {
  async pipelineStage(id, stage) {
    const row = window.AppData.PIPELINE.find(p => p.id === id);
    if (row) { row.stage = stage; row.last = "Just now"; }
    _emitMutation("pipeline", "update", id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("pipeline").update({ stage, updated_at: new Date().toISOString(), last_activity_text: "Just now" }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
  },

  async pipelineOwner(id, ownerRepId) {
    const row = window.AppData.PIPELINE.find(p => p.id === id);
    if (row) row.owner = ownerRepId;
    _emitMutation("pipeline", "update", id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("pipeline").update({ owner_rep_id: ownerRepId }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
  },

  async pipelineInsert(row) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const dbRow = {
          lead_name: row.lead, age: row.age, state: row.state, stage: row.stage,
          product: row.product, ap_cents: Math.round((row.ap || 0) * 100),
          days_in_stage: row.days || 0, last_activity_text: row.last, next_action: row.next,
          source: row.source, owner_rep_id: row.owner, consent: row.consent, heat: row.heat,
        };
        const { data, error } = await sb.from("pipeline").insert(dbRow).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data?.id) row.id = data.id;
      }
    }
    window.AppData.PIPELINE.unshift(row);
    _emitMutation("pipeline", "insert", row.id);
  },

  async pipelineDelete(id) {
    const idx = window.AppData.PIPELINE.findIndex(p => p.id === id);
    if (idx >= 0) window.AppData.PIPELINE.splice(idx, 1);
    _emitMutation("pipeline", "delete", id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("pipeline").delete().eq("id", id);
      if (error) { window.toast && window.toast(`Delete failed: ${error.message}`, "error"); throw error; }
    }
  },

  async queueAssign(queueId, repId) {
    // Conceptually: take a queue lead, give it to a rep — promote to pipeline.
    const q = window.AppData.QUEUE.find(x => x.id === queueId);
    if (!q) return;
    const newPipeRow = {
      lead: q.lead, age: q.age, state: q.state, stage: "New",
      product: q.product, ap: 0, days: 0, last: "Just routed",
      next: "First dial", source: q.source, owner: repId, consent: "verified", heat: "fresh"
    };
    await this.pipelineInsert(newPipeRow);
    // Remove from queue locally
    const idx = window.AppData.QUEUE.findIndex(x => x.id === queueId);
    if (idx >= 0) window.AppData.QUEUE.splice(idx, 1);
    _emitMutation("queue", "delete", queueId);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      sb.from("queue").delete().eq("id", queueId); // fire-and-forget
    }
  },

  async tieringOverride(repId, tier) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { error } = await sb.from("tiering_overrides").upsert(
          { rep_id: repId, override_tier: tier, set_at: new Date().toISOString() },
          { onConflict: "rep_id" }
        );
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
      }
    }
    _emitMutation("tiering_overrides", "upsert", repId);
  },

  async sequenceEnroll(leadId, sequenceId, ownerRepId) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { error } = await sb.from("sequence_enrollments").insert({
          lead_pipeline_id: leadId, sequence_id: sequenceId, owner_rep_id: ownerRepId,
          status: "active", current_step: 0, enrolled_at: new Date().toISOString()
        });
        if (error) { window.toast && window.toast(`Enroll failed: ${error.message}`, "error"); throw error; }
      }
    }
    _emitMutation("sequence_enrollments", "insert", leadId);
  },
};
