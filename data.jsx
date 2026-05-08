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

// ─── CSV export helper (GAP-RP1) ─────────────────────────────────────────
// Used by Inbox / Pipeline / Commissions / Leaderboard. Any page can call:
//   window.AppData.exportCsv(rows, "filename", [{k:"name",l:"Name"}, ...])
// Properly escapes embedded commas, quotes, newlines.
window.AppData.exportCsv = function (rows, filename, columns) {
  if (!Array.isArray(rows) || rows.length === 0) {
    window.toast && window.toast("Nothing to export", "info");
    return;
  }
  const cols = columns || Object.keys(rows[0]).map(k => ({ k, l: k }));
  const esc = (v) => {
    const s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(c => esc(c.l)).join(",");
  const body   = rows.map(r => cols.map(c => esc(typeof c.fmt === "function" ? c.fmt(r[c.k], r) : r[c.k])).join(",")).join("\n");
  const csv    = header + "\n" + body;
  const blob   = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href = url;
  a.download = (filename || "export") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.toast && window.toast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`, "success");
};

/* ────────────────────────────────────────────────────────────────────────────
   Live Supabase hydration. The publishable key is intentionally public-tier
   (RLS-protected). When the Supabase JS SDK loads (via UMD <script> in
   index.html), this fires and swaps the demo AppData arrays for live rows.

   Pages all read from window.AppData; on hydrate we mutate in place + fire a
   "data:hydrated" event so any mounted component can re-render via state pump.
   ──────────────────────────────────────────────────────────────────────────── */
// Supabase URL + anon key are now centralized in lib/supabase-config.js (loaded
// as the first script in index.html and mobile.html). If they're not yet set
// at the time data.jsx evaluates (script ordering edge case), fall back to
// safe defaults so the rest of the file still parses.
window.SUPABASE_URL  = window.SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
window.SUPABASE_ANON = window.SUPABASE_ANON || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

window.getSupabase = function () {
  if (!window.__supabase && window.supabase?.createClient) {
    window.__supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "repflow.auth" }
    });
  }
  return window.__supabase || null;
};

window.getActiveAgencyId = function () {
  // GAP-X2 — agency scope priority: explicit switcher → me().agency_id → null.
  // null = unscoped (only acceptable on shared reference tables).
  try {
    const explicit = localStorage.getItem("repflow.active_agency");
    if (explicit) return explicit;
  } catch (_e) {}
  if (window.me) {
    const me = window.me();
    if (me && me.agency_id) return me.agency_id;
  }
  return null;
};

window.hydrateFromSupabase = async function () {
  const sb = window.getSupabase();
  if (!sb) return false;
  try {
    // Multi-tenant scope: if the user has selected an active agency via the switcher,
    // pin every query to it. RLS already restricts reads, but explicit scoping is
    // required when the user is a member of multiple agencies.
    const activeAgency = window.getActiveAgencyId();
    // Only force-inject agency_id=eq.X on tables that actually have an
    // agency_id column. Otherwise PostgREST returns 400 "column does not
    // exist" and the entire hydrate falls over for that promise. Tables
    // without agency_id rely on RLS + FK-joined policies for tenant
    // isolation (e.g. coaching_notes scopes via rep_id → reps.agency_id).
    const TABLES_WITH_AGENCY_ID = new Set([
      "reps", "pipeline", "queue", "courses", "recordings", "connections",
      "hardware", "ai_agents", "workflows", "policies", "commissions",
      "payouts", "clawbacks", "agent_deployments", "agent_runs",
      "automation_rules", "automation_runs", "followup_runs",
      "followup_templates", "onboarding_progress", "recruiting_applicants",
      "recruiting_campaigns", "recruiting_messages", "sequence_enrollments",
      "tiering_overrides", "workflow_assignments",
      "agency_scripts", "agency_videos", "agency_docs", "agency_quick_links",
      "agency_lead_sources", "agency_expenses", "expense_allocations",
      "lead_quotes", "sms_outbox", "agency_notifications",
    ]);
    const scope = (q) => {
      if (!activeAgency) return q;
      // q.url.pathname looks like "/rest/v1/<table>"; extract table name.
      try {
        const tbl = (q.url && (q.url.pathname || "").split("/").pop()) || "";
        if (!TABLES_WITH_AGENCY_ID.has(tbl)) return q;
      } catch (_e) { return q; }
      return q.eq("agency_id", activeAgency);
    };
    /* (Older variant of this function below uses unscoped queries; the next
       awaited block applies scope() to every Promise.all entry below.) */
    const [reps, pipeline, queue, courses, recordings, connections, hardware, agents, workflows] = await Promise.all([
      scope(sb.from("reps").select("*").order("mtd_cents", { ascending: false })),
      scope(sb.from("pipeline").select("*").order("days_in_stage", { ascending: false })),
      scope(sb.from("queue").select("*").order("score", { ascending: false })),
      scope(sb.from("courses").select("*")),
      scope(sb.from("recordings").select("*").order("recorded_at", { ascending: false })),
      scope(sb.from("connections").select("*")),
      scope(sb.from("hardware").select("*")),
      scope(sb.from("ai_agents").select("*")),
      scope(sb.from("workflows").select("*")),
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
        owner: p.owner_rep_id, consent: p.consent, heat: p.heat,
        phone: p.phone || null, email: p.email || null,
      }));
    }
    if (queue.data?.length) {
      window.AppData.QUEUE = queue.data.map(q => ({
        id: q.id, lead: q.lead_name, age: q.age, state: q.state, source: q.source,
        product: q.product, elapsed: q.elapsed_seconds, score: q.score,
        phone: q.phone || null, email: q.email || null,
        assignedRepId: q.assigned_rep_id || null,
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
        recruitingCampaignsR, recruitingApplicantsR, recruitingMessagesR,
        followupTemplatesR, workflowAssignmentsR, followupRunsR,
        onboardingProgressR,
        automationRulesR, automationRunsR,
        threadsR, threadMembersR, messagesR, messageReadsR,
        notificationsR,
        tasksR, followupRulesR,
        tierChangesR,
        aepPeriodsR, aepAssignmentsR,
        sequencesR, seqEnrollmentsR,
        tieringOverridesR,
        agentDeploymentsR, agentRunsR,
      ] = await Promise.all([
        // Reference tables (global) — NOT agency-scoped:
        sb.from("carriers").select("*").order("name"),
        sb.from("products").select("*"),
        sb.from("carrier_appointments").select("*"),
        // Tenant-specific tables — GAP-X2 — scope by viewer's agency_id:
        scope(sb.from("policies").select("*").order("issued_at", { ascending: false })),
        scope(sb.from("commissions").select("*").order("earned_at", { ascending: false }).limit(500)),
        scope(sb.from("payouts").select("*").order("period_end", { ascending: false }).limit(100)),
        scope(sb.from("clawbacks").select("*").order("recorded_at", { ascending: false }).limit(100)),
        // Reference:
        sb.from("lead_sources").select("*"),
        // Tenant-specific:
        scope(sb.from("attributions").select("*")),
        scope(sb.from("touchpoints").select("*").order("occurred_at", { ascending: false }).limit(500)),
        // Reference:
        sb.from("nigo_reasons").select("*"),
        // Tenant-specific:
        scope(sb.from("nigos").select("*").order("created_at", { ascending: false }).limit(200)),
        scope(sb.from("forecast_runs").select("*").order("generated_at", { ascending: false }).limit(50)),
        scope(sb.from("forecast_overrides").select("*").order("set_at", { ascending: false }).limit(50)),
        scope(sb.from("coaching_sessions").select("*").order("scheduled_at", { ascending: false }).limit(100)),
        scope(sb.from("coaching_notes").select("*").order("created_at", { ascending: false }).limit(200)),
        scope(sb.from("vault_files").select("*").order("created_at", { ascending: false }).limit(200)),
        scope(sb.from("households").select("*")),
        scope(sb.from("clients").select("*")),
        scope(sb.from("book_entries").select("*")),
        scope(sb.from("recruits").select("*").order("created_at", { ascending: false })),
        scope(sb.from("interviews").select("*").order("scheduled_at", { ascending: false })),
        scope(sb.from("recruiting_campaigns").select("*").order("created_at", { ascending: false })),
        scope(sb.from("recruiting_applicants").select("*").order("enrolled_at", { ascending: false })),
        scope(sb.from("recruiting_messages").select("*").order("sent_at", { ascending: false }).limit(500)),
        scope(sb.from("followup_templates").select("*").order("created_at", { ascending: false })),
        scope(sb.from("workflow_assignments").select("*")),
        scope(sb.from("followup_runs").select("*").order("scheduled_for", { ascending: false }).limit(200)),
        scope(sb.from("onboarding_progress").select("*")),
        scope(sb.from("automation_rules").select("*").order("created_at", { ascending: false })),
        scope(sb.from("automation_runs").select("*").order("scheduled_for", { ascending: false }).limit(200)),
        scope(sb.from("threads").select("*").order("last_message_at", { ascending: false }).limit(50)),
        scope(sb.from("thread_members").select("*")),
        scope(sb.from("messages").select("*").order("created_at", { ascending: false }).limit(500)),
        scope(sb.from("message_reads").select("*")),
        scope(sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(200)),
        scope(sb.from("tasks").select("*").order("due_at", { ascending: true }).limit(200)),
        scope(sb.from("followup_rules").select("*")),
        scope(sb.from("tier_changes").select("*").order("changed_at", { ascending: false }).limit(100)),
        // Reference:
        sb.from("aep_periods").select("*"),
        scope(sb.from("aep_assignments").select("*")),
        // Reference:
        sb.from("sequences").select("*"),
        // Tenant-specific:
        scope(sb.from("sequence_enrollments").select("*").order("enrolled_at", { ascending: false }).limit(200)),
        scope(sb.from("tiering_overrides").select("*")),
        scope(sb.from("agent_deployments").select("*").order("started_at", { ascending: false }).limit(50)),
        scope(sb.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(100)),
      ].map(p => Promise.resolve(p).catch(err => ({ data: [], error: err }))));
      // ↑ Resilience: any single query that throws is converted into `{ data: [],
      // error }` so the rest of the hydrate proceeds. Without this, one missing
      // table (or transient network blip) silently dropped 38 tables on the floor.

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
        targetPremium: cents(p.target_premium_cents),
        compRatePct: p.comp_rate_pct != null ? Number(p.comp_rate_pct) : null,
        expectedCommission: cents(p.expected_commission_cents),
        submissionDate: p.submission_date, initialDraftDate: p.initial_draft_date,
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
      window.AppData.RECRUITING_CAMPAIGNS = mapRows(recruitingCampaignsR, c => ({
        id: c.id, name: c.name, status: c.status, source: c.source,
        budget: cents(c.budget_cents), applied: c.applied || 0,
        contracted: c.contracted || 0, producing: c.producing || 0,
        cpa: cents(c.cpa_cents), createdAt: c.created_at,
        ownerRepId: c.owner_rep_id, pipelineStage: c.pipeline_stage
      }));
      window.AppData.RECRUITING_APPLICANTS = mapRows(recruitingApplicantsR, a => ({
        id: a.id, campaignId: a.campaign_id, name: a.name, handle: a.handle,
        state: a.state, status: a.status, enrolledAt: a.enrolled_at,
        recruiterId: a.recruiter_id
      }));
      window.AppData.RECRUITING_MESSAGES = mapRows(recruitingMessagesR, m => ({
        id: m.id, applicantId: m.applicant_id, direction: m.direction,
        channel: m.channel, body: m.body, aiDrafted: m.ai_drafted,
        sentAt: m.sent_at
      }));
      window.AppData.FOLLOWUP_TEMPLATES = mapRows(followupTemplatesR, t => ({
        id: t.id, ownerRepId: t.owner_rep_id, name: t.name, body: t.body,
        channel: t.channel, delayMinutes: t.delay_minutes,
        triggerEvent: t.trigger_event, scope: t.scope, active: t.active,
        createdAt: t.created_at, updatedAt: t.updated_at
      }));
      window.AppData.WORKFLOW_ASSIGNMENTS = mapRows(workflowAssignmentsR, a => ({
        id: a.id, workflowId: a.workflow_id, repId: a.rep_id,
        enabled: a.enabled, enabledByManagerId: a.enabled_by_manager_id,
        enabledAt: a.enabled_at
      }));
      window.AppData.FOLLOWUP_RUNS = mapRows(followupRunsR, r => ({
        id: r.id, templateId: r.template_id, repId: r.rep_id, leadId: r.lead_id,
        scheduledFor: r.scheduled_for, sentAt: r.sent_at, status: r.status,
        channel: r.channel, recipient: r.recipient, body: r.body_snapshot,
        failureDetail: r.failure_detail, createdAt: r.created_at
      }));
      window.AppData.ONBOARDING_PROGRESS = mapRows(onboardingProgressR, p => ({
        repId: p.rep_id,
        licenseSigned: p.license_signed, licenseSignedAt: p.license_signed_at,
        niprVerified: p.nipr_verified, niprVerifiedAt: p.nipr_verified_at,
        bankingSet: p.banking_set, bankingSetAt: p.banking_set_at,
        kitShipped: p.kit_shipped, kitShippedAt: p.kit_shipped_at,
        firstDial: p.first_dial, firstDialAt: p.first_dial_at,
        notes: p.notes, updatedAt: p.updated_at,
      }));
      window.AppData.AUTOMATION_RULES = mapRows(automationRulesR, r => ({
        id: r.id, ownerRepId: r.owner_rep_id, name: r.name,
        triggerEvent: r.trigger_event, triggerFilter: r.trigger_filter || {},
        channels: r.channels || [], templateId: r.template_id,
        active: r.active, scope: r.scope, updatedAt: r.updated_at,
      }));
      window.AppData.AUTOMATION_RUNS = mapRows(automationRunsR, r => ({
        id: r.id, ruleId: r.rule_id, repId: r.rep_id, leadId: r.lead_id,
        channel: r.channel, recipient: r.recipient, body: r.body_snapshot,
        scheduledFor: r.scheduled_for, sentAt: r.sent_at, status: r.status,
        failureDetail: r.failure_detail, createdAt: r.created_at,
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

    // ────────────────────────────────────────────────────────────────────────
    // Resources hydrate — migration 0010 (agency-shared scripts/videos/docs/
    // links). Without this, every operator sees only their own browser's
    // localStorage which means a manager-uploaded video is invisible to reps.
    // ────────────────────────────────────────────────────────────────────────
    try {
      const [scriptsR, videosR, docsR, linksR] = await Promise.all([
        scope(sb.from("agency_scripts").select("*").order("updated_at", { ascending: false })),
        scope(sb.from("agency_videos").select("*").order("created_at", { ascending: false })),
        scope(sb.from("agency_docs").select("*").order("created_at", { ascending: false })),
        scope(sb.from("agency_quick_links").select("*").order("sort_order", { ascending: true })),
      ]);
      const mapRowsR = (res, fn) => Array.isArray(res?.data) ? res.data.map(fn) : [];
      window.AppData.SCRIPTS_LIB = mapRowsR(scriptsR, r => ({
        id: r.id, title: r.title, cat: r.cat, version: r.version, body: r.body,
        createdBy: r.created_by, updatedAt: r.updated_at, createdAt: r.created_at,
      }));
      window.AppData.VIDEOS = mapRowsR(videosR, r => ({
        id: r.id, title: r.title, cat: r.cat, src: r.src,
        sourceUrl: r.source_url, sourceLabel: r.source_label,
        thumb: r.thumb, durMin: r.dur_min || 0,
        createdBy: r.created_by, createdAt: r.created_at,
      }));
      window.AppData.DOCS = mapRowsR(docsR, r => ({
        id: r.id, title: r.title, cat: r.cat, url: r.url,
        kind: r.kind, gdocKind: r.gdoc_kind, ext: r.ext,
        sizeBytes: r.size_bytes, storagePath: r.storage_path,
        text: r.text_excerpt,
        createdBy: r.created_by, createdAt: r.created_at,
      }));
      window.AppData.QUICK_LINKS = mapRowsR(linksR, r => ({
        id: r.id, cat: r.cat, label: r.label, url: r.url,
        sortOrder: r.sort_order || 0, createdAt: r.created_at,
      }));
    } catch (resErr) {
      // Migration 0010 may not be applied yet — components fall back to seed.
      console.warn("[supabase] resources hydrate skipped:", resErr?.message ?? resErr);
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
    // 0010 — resource tables sync across browsers in real time
    agency_scripts:     "SCRIPTS_LIB",
    agency_videos:      "VIDEOS",
    agency_docs:        "DOCS",
    agency_quick_links: "QUICK_LINKS",
    // GAP-X5 — notifications + commissions stream so badges and PnL update without refresh
    notifications:      "NOTIFICATIONS",
    commissions:        "COMMISSIONS",
  };

  // Same DB→JS shape mapper used by hydrate, narrowed per table
  const toJs = (table, r) => {
    if (table === "pipeline")   return { id: r.id, lead: r.lead_name, age: r.age, state: r.state, stage: r.stage, product: r.product, ap: Math.round(r.ap_cents/100), days: r.days_in_stage, last: r.last_activity_text, next: r.next_action, source: r.source, owner: r.owner_rep_id, consent: r.consent, heat: r.heat, phone: r.phone || null, email: r.email || null };
    if (table === "queue")      return { id: r.id, lead: r.lead_name, age: r.age, state: r.state, source: r.source, product: r.product, elapsed: r.elapsed_seconds, score: r.score, phone: r.phone || null, email: r.email || null, assignedRepId: r.assigned_rep_id || null };
    if (table === "reps")       return { id: r.id, name: r.name, handle: r.handle, tier: r.tier, mtd: Math.round(r.mtd_cents/100), today: Math.round(r.today_cents/100), streak: r.streak_days, dials: r.dials, presence: r.presence, appts: r.appts, color: r.color };
    if (table === "hardware")   return { id: r.id, name: r.name, kind: r.kind, status: r.status, uptime: r.uptime_text, load: r.load_pct, agents: r.agent_count, last: "live" };
    if (table === "ai_agents")  return { id: r.id, name: r.name, host: r.host_id, reqs: r.reqs_per_day, success: parseFloat(r.success_rate), last: "live", desc: r.description };
    if (table === "connections")return { id: r.id, name: r.name, category: r.category, status: r.status, meta: r.meta };
    if (table === "workflows")  return { id: r.id, name: r.name, runs: r.runs_per_day, lastRun: r.last_run };
    if (table === "agent_deployments") return { id: r.id, agent_id: r.agent_id, host_id: r.host_id, status: r.status, manifest: r.manifest, deployed_at: r.deployed_at, last_heartbeat: r.last_heartbeat };
    if (table === "agent_runs") return { id: r.id, deployment_id: r.deployment_id, started_at: r.started_at, finished_at: r.finished_at, status: r.status, log: r.log, exit_code: r.exit_code };
    if (table === "agency_scripts")    return { id: r.id, title: r.title, cat: r.cat, version: r.version, body: r.body, createdBy: r.created_by, updatedAt: r.updated_at, createdAt: r.created_at };
    if (table === "agency_videos")     return { id: r.id, title: r.title, cat: r.cat, src: r.src, sourceUrl: r.source_url, sourceLabel: r.source_label, thumb: r.thumb, durMin: r.dur_min || 0, createdBy: r.created_by, createdAt: r.created_at };
    if (table === "agency_docs")       return { id: r.id, title: r.title, cat: r.cat, url: r.url, kind: r.kind, gdocKind: r.gdoc_kind, ext: r.ext, sizeBytes: r.size_bytes, storagePath: r.storage_path, text: r.text_excerpt, createdBy: r.created_by, createdAt: r.created_at };
    if (table === "agency_quick_links") return { id: r.id, cat: r.cat, label: r.label, url: r.url, sortOrder: r.sort_order || 0, createdAt: r.created_at };
    if (table === "notifications") return { id: r.id, recipient: r.recipient_handle, kind: r.kind, title: r.title, body: r.body, link: r.link, severity: r.severity, readAt: r.read_at, createdAt: r.created_at };
    if (table === "commissions")   return { id: r.id, policyId: r.policy_id, repId: r.rep_id, amount: Math.round((r.amount_cents||0)/100), kind: r.kind, period: r.period_text, earnedAt: r.earned_at, paidAt: r.paid_at, source: r.source };
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
    const previousStage = row?.stage;
    if (row) { row.stage = stage; row.last = "Just now"; }
    _emitMutation("pipeline", "update", id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { error } = await sb.from("pipeline").update({ stage, updated_at: new Date().toISOString(), last_activity_text: "Just now" }).eq("id", id);
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
      }
    }
    // ── Side-effect: keep POLICIES + commission ledger in sync ────────────
    // Stage transitions used to be cosmetic. Now App In / Issued auto-create
    // (or update) a POLICIES row so Today's number, Commissions, Performance,
    // and Book Analytics actually reflect the kanban.
    try {
      if (row && (stage === "App In" || stage === "Issued")) {
        await window.AppData.mutate._syncPolicyFromPipeline(row, stage, previousStage);
      }
    } catch (e) { /* swallow — kanban move shouldn't fail on policy side-effect */ }
  },

  // Internal: ensure a POLICIES row exists for a pipeline deal that has
  // crossed into App In / Issued, and bump its status when the stage advances.
  // Heuristics for filling missing fields:
  //   • carrier — first carrier in CARRIERS that lists this product, fallback null
  //   • product_text — pipeline.product (free-text)
  //   • ap — pipeline.ap (defaults to 0; rep should still complete via Deal Write
  //     for accurate AP, but the row exists so commission ledger is non-zero)
  //   • comp_rate_pct — 22% default (the most common Med Supp first-year rate);
  //     owner can adjust per carrier in Carriers / Resources later
  // The user can still write a fully detailed deal via Floor → Deals to overwrite
  // these defaults; the policyId is stored back on the pipeline row so we don't
  // double-create.
  async _syncPolicyFromPipeline(pipeRow, stage, previousStage) {
    const policies = (window.AppData.POLICIES = window.AppData.POLICIES || []);
    const status = stage === "Issued" ? "issued" : "submitted";
    const existing = policies.find(p =>
      (pipeRow.policyId && p.id === pipeRow.policyId) ||
      (p.leadId === pipeRow.id)
    );
    if (existing) {
      // Just bump status if it advanced.
      if (existing.status !== status) {
        existing.status = status;
        if (stage === "Issued" && !existing.issuedAt) existing.issuedAt = new Date().toISOString();
        _emitMutation("policies", "update", existing.id);
        if (window.AppData.LIVE && typeof existing.id === "string" && !existing.id.startsWith("local-")) {
          const sb = window.getSupabase();
          if (sb) {
            const upd = { status };
            if (stage === "Issued") upd.submission_date = upd.submission_date || new Date().toISOString();
            await sb.from("policies").update(upd).eq("id", existing.id).then(() => {}, () => {});
          }
        }
      }
      pipeRow.policyId = existing.id;
      return existing;
    }
    // Auto-create a stub policy so commission ledger non-zero immediately.
    const carriers = window.AppData.CARRIERS || [];
    const productLower = String(pipeRow.product || "").toLowerCase();
    const carrierGuess = carriers.find(c => {
      // CARRIERS hydrate exposes `productLines` (mapped from product_lines column),
      // not `products`. Old code looked at `c.products` which was always undefined
      // so the fallback `: true` always matched and the first carrier in the list
      // was used regardless of product.
      const products = (c.productLines || c.products || []).map(p => String(p).toLowerCase());
      return productLower.includes("med") ? products.some(p => p.includes("med") || p.includes("supp"))
           : productLower.includes("annuity") ? products.some(p => p.includes("annuity"))
           : productLower.includes("expense") ? products.some(p => p.includes("fe") || p.includes("expense"))
           : true;
    });
    const ap = pipeRow.ap || 0;
    const compRate = 22;
    const expected = Math.round(ap * compRate / 100);
    const newPolicy = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      leadId: pipeRow.id,
      carrierId: carrierGuess?.id || null,
      product: pipeRow.product || null,
      ap, compRatePct: compRate, expectedCommission: expected,
      issuedAt: stage === "Issued" ? new Date().toISOString() : null,
      submissionDate: stage === "App In" ? new Date().toISOString() : null,
      status,
      owner: pipeRow.owner,
      state: pipeRow.state,
      autoCreated: true,  // Deal Write form can detect + complete these
    };
    policies.unshift(newPolicy);
    pipeRow.policyId = newPolicy.id;
    _emitMutation("policies", "insert", newPolicy.id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb && typeof pipeRow.id === "string") {
        try {
          const { data } = await sb.from("policies").insert({
            lead_pipeline_id: pipeRow.id,
            carrier_id: newPolicy.carrierId,
            product_text: newPolicy.product,
            ap_cents: Math.round(ap * 100),
            comp_rate_pct: compRate,
            expected_commission_cents: Math.round(expected * 100),
            status,
            submission_date: newPolicy.submissionDate,
            owner_rep_id: pipeRow.owner,
            state: pipeRow.state,
          }).select().single();
          if (data?.id) {
            newPolicy.id = data.id;
            pipeRow.policyId = data.id;
          }
        } catch (_e) { /* keep local */ }
      }
    }
    const verb = stage === "Issued" ? "Issued" : "Submitted";
    window.toast && window.toast(
      `${verb} · stub policy created · $${expected.toLocaleString()} expected commission. Open Floor → Deals to fill carrier + AP.`,
      "success"
    );
    return newPolicy;
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
          phone: row.phone || null, email: row.email || null,
        };
        // Tolerant insert — strip phone/email if the migration hasn't landed yet.
        let { data, error } = await sb.from("pipeline").insert(dbRow).select().single();
        if (error && /column.*does not exist/i.test(error.message || "")) {
          const { phone, email, ...legacy } = dbRow;
          ({ data, error } = await sb.from("pipeline").insert(legacy).select().single());
        }
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data?.id) row.id = data.id;
      }
    }
    window.AppData.PIPELINE.unshift(row);
    _emitMutation("pipeline", "insert", row.id);
  },

  async pipelineContact(id, patch) {
    // Patch phone / email (and any other future contact fields) on a pipeline row.
    const row = window.AppData.PIPELINE.find(p => p.id === id);
    if (row) Object.assign(row, patch);
    _emitMutation("pipeline", "update", id);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const dbPatch = {};
      if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
      if (patch.email !== undefined) dbPatch.email = patch.email || null;
      try {
        const { error } = await sb.from("pipeline").update(dbPatch).eq("id", id);
        if (error && !/column.*does not exist/i.test(error.message || "")) throw error;
      } catch (_e) { /* tolerant — column may not yet exist */ }
    }
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
      next: "First dial", source: q.source, owner: repId, consent: "verified", heat: "fresh",
      phone: q.phone || null, email: q.email || null,
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

  /* ── Settings & profile ─────────────────────────────────────────────── */
  async orgSettingsSave(patch) {
    // patch: object of key/value pairs to upsert into org_settings
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const rows = Object.entries(patch).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
      const { error } = await sb.from("org_settings").upsert(rows, { onConflict: "key" });
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    window.AppData.ORG_SETTINGS = { ...(window.AppData.ORG_SETTINGS || {}), ...patch };
    _emitMutation("org_settings", "upsert", null);
  },

  async notificationPrefsSave(userId, prefs) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("notification_prefs").upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("notification_prefs", "upsert", userId);
  },

  /* ── Vault artifacts ────────────────────────────────────────────────── */
  async vaultArtifactInsert(artifact) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("vault_artifacts").insert(artifact).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) artifact.id = data.id;
      }
    }
    (window.AppData.VAULT_ARTIFACTS = window.AppData.VAULT_ARTIFACTS || []).unshift(artifact);
    _emitMutation("vault_artifacts", "insert", artifact.id);
  },

  async vaultRetentionUpdate(id, retention) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("vault_artifacts").update({ retention }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("vault_artifacts", "update", id);
  },

  /* ── NIGO workflow ──────────────────────────────────────────────────── */
  async nigoCreate(item) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("nigo_items").insert(item).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) item.id = data.id;
      }
    }
    (window.AppData.NIGO = window.AppData.NIGO || []).unshift(item);
    _emitMutation("nigo_items", "insert", item.id);
  },

  async nigoStatus(id, status, detail) {
    const row = (window.AppData.NIGO || []).find(n => n.id === id);
    if (row) {
      row.status = status;
      if (status === "resolved") row.resolved_at = new Date().toISOString();
      if (detail) row.detail = detail;
    }
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const patch = { status };
      if (status === "resolved") patch.resolved_at = new Date().toISOString();
      if (detail) patch.detail = detail;
      const { error } = await sb.from("nigo_items").update(patch).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("nigo_items", "update", id);
  },

  /* ── Recruiting ─────────────────────────────────────────────────────── */
  async recruitingApplicantAdd(applicant) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("recruiting_applicants").insert(applicant).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) applicant.id = data.id;
      }
    }
    const local = {
      id: applicant.id, campaignId: applicant.campaign_id, name: applicant.name,
      handle: applicant.handle, state: applicant.state, status: applicant.status,
      enrolledAt: applicant.enrolled_at || new Date().toISOString(),
      recruiterId: applicant.recruiter_id,
    };
    (window.AppData.RECRUITING_APPLICANTS = window.AppData.RECRUITING_APPLICANTS || []).unshift(local);
    _emitMutation("recruiting_applicants", "insert", applicant.id);
  },

  async recruitingApplicantSetStatus(id, status) {
    const a = (window.AppData.RECRUITING_APPLICANTS || []).find(x => x.id === id);
    if (a) a.status = status;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("recruiting_applicants").update({ status }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("recruiting_applicants", "update", id);
  },

  async recruitingMessageSend(applicantId, body, channel = "instagram", aiDrafted = false) {
    const msg = { applicant_id: applicantId, direction: "out", channel, body, ai_drafted: aiDrafted, sent_at: new Date().toISOString() };
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("recruiting_messages").insert(msg).select().single();
        if (error) { window.toast && window.toast(`Send failed: ${error.message}`, "error"); throw error; }
        if (data) msg.id = data.id;
      }
    }
    const local = {
      id: msg.id, applicantId: msg.applicant_id, direction: msg.direction,
      channel: msg.channel, body: msg.body, aiDrafted: msg.ai_drafted, sentAt: msg.sent_at,
    };
    (window.AppData.RECRUITING_MESSAGES = window.AppData.RECRUITING_MESSAGES || []).unshift(local);
    _emitMutation("recruiting_messages", "insert", msg.id);
    return local;
  },

  async recruitingCampaignToggle(id, status) {
    const c = (window.AppData.RECRUITING_CAMPAIGNS || []).find(x => x.id === id);
    if (c) c.status = status;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("recruiting_campaigns").update({ status }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("recruiting_campaigns", "update", id);
  },

  /* ── Onboarding progress ──────────────────────────────────────────── */
  async onboardingStepSet(repId, stepKey, value) {
    // stepKey ∈ license_signed / nipr_verified / banking_set / kit_shipped / first_dial
    const list = window.AppData.ONBOARDING_PROGRESS = window.AppData.ONBOARDING_PROGRESS || [];
    let p = list.find(x => x.repId === repId);
    const camelKey = stepKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const atKey = camelKey + "At";
    const now = new Date().toISOString();
    if (!p) {
      p = { repId, [camelKey]: value, [atKey]: value ? now : null };
      list.push(p);
    } else {
      p[camelKey] = value;
      p[atKey] = value ? now : null;
    }
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const me = window.me && window.me();
      const payload = { rep_id: repId, agency_id: me && me.agency_id, [stepKey]: value, [stepKey + "_at"]: value ? now : null, updated_at: now };
      const { error } = await sb.from("onboarding_progress").upsert(payload, { onConflict: "rep_id" });
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("onboarding_progress", "update", repId);
  },

  /* ── Workflows ──────────────────────────────────────────────────────── */
  async workflowToggle(id, active) {
    const w = window.AppData.WORKFLOWS.find(x => x.id === id);
    if (w) w.active = active;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("workflows").update({ active }).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("workflows", "update", id);
  },

  /* ── Workflow assignments (rep-level toggle) ───────────────────────── */
  async workflowAssignmentSetEnabled(workflowId, repId, enabled) {
    const list = window.AppData.WORKFLOW_ASSIGNMENTS = window.AppData.WORKFLOW_ASSIGNMENTS || [];
    const a = list.find(x => x.workflowId === workflowId && x.repId === repId);
    if (a) a.enabled = enabled;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const me = window.me && window.me();
      const agencyId = me && me.agency_id;
      if (a) {
        const { error } = await sb.from("workflow_assignments")
          .update({ enabled }).eq("workflow_id", workflowId).eq("rep_id", repId);
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
      } else if (agencyId) {
        const { error } = await sb.from("workflow_assignments")
          .insert({ workflow_id: workflowId, rep_id: repId, agency_id: agencyId, enabled });
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        list.push({ workflowId, repId, enabled, enabledAt: new Date().toISOString() });
      }
    } else if (!a) {
      list.push({ workflowId, repId, enabled, enabledAt: new Date().toISOString() });
    }
    _emitMutation("workflow_assignments", "update", workflowId + ":" + repId);
  },

  /* ── Follow-up templates ───────────────────────────────────────────── */
  async followupTemplateSave(template) {
    const list = window.AppData.FOLLOWUP_TEMPLATES = window.AppData.FOLLOWUP_TEMPLATES || [];
    const isNew = !template.id;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const me = window.me && window.me();
        const payload = {
          owner_rep_id: template.ownerRepId,
          name: template.name,
          body: template.body,
          channel: template.channel,
          delay_minutes: template.delayMinutes,
          trigger_event: template.triggerEvent,
          scope: template.scope,
          active: template.active !== false,
          updated_at: new Date().toISOString(),
        };
        if (isNew) payload.agency_id = me && me.agency_id;
        const q = isNew
          ? sb.from("followup_templates").insert(payload).select().single()
          : sb.from("followup_templates").update(payload).eq("id", template.id).select().single();
        const { data, error } = await q;
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) template.id = data.id;
      }
    }
    if (isNew) list.unshift({ ...template });
    else {
      const idx = list.findIndex(x => x.id === template.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...template };
    }
    _emitMutation("followup_templates", isNew ? "insert" : "update", template.id);
  },

  async followupTemplateDelete(id) {
    const list = window.AppData.FOLLOWUP_TEMPLATES = window.AppData.FOLLOWUP_TEMPLATES || [];
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("followup_templates").delete().eq("id", id);
      if (error) { window.toast && window.toast(`Delete failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("followup_templates", "delete", id);
  },

  /* ── Follow-up dispatch (creates a scheduled run) ──────────────────── */
  async followupDispatch(templateId, recipientPhone, leadId, repId) {
    const me = window.me && window.me();
    const t = (window.AppData.FOLLOWUP_TEMPLATES || []).find(x => x.id === templateId);
    if (!t) return;
    const scheduledFor = new Date(Date.now() + (t.delayMinutes || 0) * 60 * 1000).toISOString();
    const run = {
      id: "run-" + Date.now(),
      templateId, repId: repId || (me && me.rep_id),
      leadId, scheduledFor, status: "scheduled",
      channel: t.channel, recipient: recipientPhone,
      body: t.body, createdAt: new Date().toISOString(),
    };
    if (window.AppData.LIVE) {
      try {
        const r = await fetch("/api/followup/dispatch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template_id: templateId, recipient: recipientPhone,
            lead_id: leadId, rep_id: run.repId,
          }),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok && json.run) {
          run.id = json.run.id;
          run.status = json.run.status;
        } else {
          run.status = "failed";
          run.failureDetail = (json.error || ("HTTP " + r.status));
        }
      } catch (e) {
        run.status = "failed";
        run.failureDetail = String(e);
      }
    }
    (window.AppData.FOLLOWUP_RUNS = window.AppData.FOLLOWUP_RUNS || []).unshift(run);
    _emitMutation("followup_runs", "insert", run.id);
    return run;
  },

  /* ── Routing rules ──────────────────────────────────────────────────── */
  async routingRuleSave(rule) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const op = rule.id
          ? sb.from("routing_rules").update({ source: rule.src || rule.source, route_to: rule.route || rule.route_to, weight: rule.weight, active: rule.active ?? true }).eq("id", rule.id)
          : sb.from("routing_rules").insert({ source: rule.src || rule.source, route_to: rule.route || rule.route_to, weight: rule.weight, active: rule.active ?? true });
        const { error } = await op;
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
      }
    }
    _emitMutation("routing_rules", rule.id ? "update" : "insert", rule.id);
  },

  async routingRuleDelete(id) {
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from("routing_rules").delete().eq("id", id);
      if (error) { window.toast && window.toast(`Delete failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("routing_rules", "delete", id);
  },

  /* ── Saved views ────────────────────────────────────────────────────── */
  async savedViewSave(userId, page, name, filters) {
    const row = { user_id: userId, page, name, filters };
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("saved_views").insert(row).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) row.id = data.id;
      }
    }
    (window.AppData.SAVED_VIEWS = window.AppData.SAVED_VIEWS || []).push(row);
    _emitMutation("saved_views", "insert", row.id);
    return row;
  },

  /* ── Connections ────────────────────────────────────────────────────── */
  async connectionStatus(id, status, meta) {
    const row = window.AppData.CONNECTIONS.find(c => c.id === id);
    if (row) { row.status = status; if (meta !== undefined) row.meta = meta; }
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const patch = { status, updated_at: new Date().toISOString() };
      if (meta !== undefined) patch.meta = meta;
      const { error } = await sb.from("connections").update(patch).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("connections", "update", id);
  },

  /* ── Queue claim / release (GAP-D2) ─────────────────────────────────────
     Lets a rep claim an unassigned queue lead so peers stop seeing it in
     their "Unassigned" view. Persists locally today; attempts a tolerant
     Supabase write so it starts persisting the moment the migration adds
     `queue.assigned_rep_id`. */
  async queueClaim(queueId, repId) {
    const row = (window.AppData.QUEUE || []).find(q => q.id === queueId);
    if (row) row.assignedRepId = repId;
    _emitMutation("queue", "update", queueId);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      try {
        const { error } = await sb.from("queue").update({ assigned_rep_id: repId }).eq("id", queueId);
        if (error && !/column.*does not exist/i.test(error.message || "")) throw error;
      } catch (_e) { /* tolerant — column may not yet exist */ }
    }
  },
  async queueRelease(queueId) {
    const row = (window.AppData.QUEUE || []).find(q => q.id === queueId);
    if (row) row.assignedRepId = null;
    _emitMutation("queue", "update", queueId);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      try {
        const { error } = await sb.from("queue").update({ assigned_rep_id: null }).eq("id", queueId);
        if (error && !/column.*does not exist/i.test(error.message || "")) throw error;
      } catch (_e) {}
    }
  },

  /* ── Coaching ───────────────────────────────────────────────────────── */
  async coachingNoteCreate(repId, body, sessionId = null) {
    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    const note = {
      id: "tmp-" + Date.now(),
      sessionId, repId, body,
      createdBy: me?.handle || "system",
      createdAt: new Date().toISOString(),
    };
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        const { data, error } = await sb.from("coaching_notes").insert({
          session_id: sessionId, rep_id: repId, body,
          created_by: me?.handle || null,
        }).select().single();
        if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
        if (data) note.id = data.id;
      }
    }
    (window.AppData.COACHING_NOTES = window.AppData.COACHING_NOTES || []).unshift(note);
    _emitMutation("coaching_notes", "insert", note.id);
    return note;
  },

  async coachingSessionResolve(id, outcome, rating, notes) {
    const row = (window.AppData.COACHING_SESSIONS || []).find(s => s.id === id);
    if (row) {
      row.completedAt = new Date().toISOString();
      if (outcome) row.outcome = outcome;
      if (rating != null) row.rating = rating;
      if (notes) row.notes = notes;
    }
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const patch = { completed_at: new Date().toISOString() };
      if (outcome) patch.outcome = outcome;
      if (rating != null) patch.rating = rating;
      if (notes) patch.notes = notes;
      const { error } = await sb.from("coaching_sessions").update(patch).eq("id", id);
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation("coaching_sessions", "update", id);
  },

  /* ── Notifications (manager → rep "focus alert" / broadcast fan-out) ── */
  async notificationCreate({ repId = null, recipientHandle = null, kind = "focus", severity = "info", title, body, pageLink = null }) {
    const note = {
      id: "tmp-" + Date.now(),
      kind, severity, title, body,
      pageLink, repId, recipientHandle,
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    if (window.AppData.LIVE) {
      const sb = window.getSupabase();
      if (sb) {
        // Prefer the create_notification RPC when available (it does fan-out + audit)
        const rpc = await sb.rpc("create_notification", {
          p_kind: kind, p_severity: severity,
          p_title: title, p_body: body,
          p_page_link: pageLink, p_ref_id: repId,
        }).then(r => r).catch(() => ({ error: { message: "rpc_unavailable" } }));
        if (rpc?.error) {
          // Fallback: direct insert
          const { data, error } = await sb.from("agency_notifications").insert({
            kind, severity, title, body, page_link: pageLink, ref_id: repId,
          }).select().single();
          if (error) { window.toast && window.toast(`Send failed: ${error.message}`, "error"); throw error; }
          if (data) note.id = data.id;
        } else if (rpc.data) {
          note.id = rpc.data;
        }
      }
    }
    (window.AppData.NOTIFICATIONS = window.AppData.NOTIFICATIONS || []).unshift(note);
    _emitMutation("agency_notifications", "insert", note.id);
    return note;
  },

  /* ── Resources (migration 0010) — agency_scripts / videos / docs / links ──
     Each helper writes to AppData optimistically AND, when LIVE, persists to
     Supabase so any operator on any browser sees the same library. */
  async _resourceUpsert(table, key, jsRow, dbRow) {
    const list = (window.AppData[key] = window.AppData[key] || []);
    const idx = jsRow.id ? list.findIndex(x => x.id === jsRow.id) : -1;
    if (idx >= 0) list[idx] = { ...list[idx], ...jsRow };
    else list.unshift(jsRow);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return jsRow;
      const me = window.me && window.me();
      const payload = { ...dbRow, agency_id: me && me.agency_id };
      let resp;
      if (jsRow.id && !String(jsRow.id).startsWith("tmp-")) {
        resp = await sb.from(table).update(payload).eq("id", jsRow.id).select().single();
      } else {
        resp = await sb.from(table).insert(payload).select().single();
      }
      const { data, error } = resp;
      if (error) { window.toast && window.toast(`Save failed: ${error.message}`, "error"); throw error; }
      if (data?.id && data.id !== jsRow.id) {
        // swap optimistic id → real one
        const i2 = list.findIndex(x => x.id === jsRow.id);
        if (i2 >= 0) list[i2].id = data.id;
        jsRow.id = data.id;
      }
    }
    _emitMutation(table, jsRow.id ? "update" : "insert", jsRow.id);
    return jsRow;
  },
  async _resourceDelete(table, key, id) {
    const list = (window.AppData[key] = window.AppData[key] || []);
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return;
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) { window.toast && window.toast(`Delete failed: ${error.message}`, "error"); throw error; }
    }
    _emitMutation(table, "delete", id);
  },

  scriptUpsert(s) {
    const id = s.id || ("tmp-" + Date.now());
    const updatedAt = new Date().toISOString();
    return window.AppData.mutate._resourceUpsert(
      "agency_scripts", "SCRIPTS_LIB",
      { id, title: s.title, cat: s.cat || "Open", version: s.version || "v1.0", body: s.body, updatedAt },
      { title: s.title, cat: s.cat || "Open", version: s.version || "v1.0", body: s.body, updated_at: updatedAt },
    );
  },
  scriptDelete: (id) => window.AppData.mutate._resourceDelete("agency_scripts", "SCRIPTS_LIB", id),

  videoUpsert(v) {
    const id = v.id || ("tmp-" + Date.now());
    return window.AppData.mutate._resourceUpsert(
      "agency_videos", "VIDEOS",
      { id, title: v.title, cat: v.cat || "Med Supp", src: v.src, sourceUrl: v.sourceUrl, sourceLabel: v.sourceLabel, thumb: v.thumb || "", durMin: v.durMin || 0 },
      { title: v.title, cat: v.cat || "Med Supp", src: v.src, source_url: v.sourceUrl || null, source_label: v.sourceLabel || null, thumb: v.thumb || null, dur_min: v.durMin || 0 },
    );
  },
  videoDelete: (id) => window.AppData.mutate._resourceDelete("agency_videos", "VIDEOS", id),

  docUpsert(d) {
    const id = d.id || ("tmp-" + Date.now());
    return window.AppData.mutate._resourceUpsert(
      "agency_docs", "DOCS",
      { id, title: d.title, cat: d.cat || "Internal", url: d.url || "", kind: d.kind || "link", gdocKind: d.gdocKind, ext: d.ext, sizeBytes: d.sizeBytes, storagePath: d.storagePath, text: d.text },
      { title: d.title, cat: d.cat || "Internal", url: d.url || null, kind: d.kind || "link", gdoc_kind: d.gdocKind || null, ext: d.ext || null, size_bytes: d.sizeBytes || null, storage_path: d.storagePath || null, text_excerpt: d.text || null },
    );
  },
  docDelete: (id) => window.AppData.mutate._resourceDelete("agency_docs", "DOCS", id),

  quickLinkUpsert(l) {
    const id = l.id || ("tmp-" + Date.now());
    return window.AppData.mutate._resourceUpsert(
      "agency_quick_links", "QUICK_LINKS",
      { id, cat: l.cat || "Internal", label: l.label, url: l.url, sortOrder: l.sortOrder || 0 },
      { cat: l.cat || "Internal", label: l.label, url: l.url, sort_order: l.sortOrder || 0 },
    );
  },
  quickLinkDelete: (id) => window.AppData.mutate._resourceDelete("agency_quick_links", "QUICK_LINKS", id),

  /* ── Messaging (GAP-C2) — threads + messages ──────────────────────────── */
  async threadEnsure({ memberHandles, kind = "dm", subject = "", relatedLeadId = null }) {
    // Find an existing dm-kind thread whose membership matches exactly,
    // otherwise create a new one. Idempotent — opening a DM twice between
    // the same pair yields the same thread.
    const list = (window.AppData.THREADS = window.AppData.THREADS || []);
    const tmList = (window.AppData.THREAD_MEMBERS = window.AppData.THREAD_MEMBERS || []);
    const sortedMembers = [...new Set(memberHandles)].sort();
    if (kind === "dm") {
      for (const t of list) {
        if (t.kind !== "dm") continue;
        const tm = tmList.filter(m => m.threadId === t.id).map(m => m.member).sort();
        if (tm.length === sortedMembers.length && tm.every((h, i) => h === sortedMembers[i])) return t;
      }
    }
    const tmpId = "thr-" + Date.now();
    const row = { id: tmpId, kind, subject, relatedLeadId, lastMessageAt: new Date().toISOString() };
    list.unshift(row);
    sortedMembers.forEach(h => tmList.push({ id: "tm-" + Date.now() + "-" + h, threadId: tmpId, member: h, muted: false }));
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return row;
      const { data, error } = await sb.from("threads").insert({ kind, subject, related_lead_id: relatedLeadId, last_message_at: row.lastMessageAt }).select().single();
      if (error) { window.toast && window.toast(`Thread create failed: ${error.message}`, "error"); throw error; }
      if (data?.id) {
        // remap optimistic id
        row.id = data.id;
        tmList.forEach(m => { if (m.threadId === tmpId) m.threadId = data.id; });
        // persist members
        const memberRows = sortedMembers.map(h => ({ thread_id: data.id, member_handle: h, muted: false }));
        await sb.from("thread_members").insert(memberRows);
      }
    }
    _emitMutation("threads", "insert", row.id);
    return row;
  },

  async messagePost({ threadId, body, metadata }) {
    const list = (window.AppData.MESSAGES = window.AppData.MESSAGES || []);
    const meIdent = window.me && window.me();
    const sender = meIdent?.handle || "(self)";
    const tmpId = "msg-" + Date.now();
    const row = { id: tmpId, threadId, sender, body, createdAt: new Date().toISOString() };
    list.push(row);
    // Bump thread's lastMessageAt for sort order
    const t = (window.AppData.THREADS || []).find(x => x.id === threadId);
    if (t) t.lastMessageAt = row.createdAt;
    if (window.AppData.LIVE) {
      const sb = window.getSupabase(); if (!sb) return row;
      const { data, error } = await sb.from("messages").insert({
        thread_id: threadId, sender_handle: sender, body, metadata: metadata || null,
      }).select().single();
      if (error) { window.toast && window.toast(`Send failed: ${error.message}`, "error"); throw error; }
      if (data?.id) row.id = data.id;
      // Touch thread row
      await sb.from("threads").update({ last_message_at: row.createdAt }).eq("id", threadId).then(() => {}).catch(() => {});
    }
    _emitMutation("messages", "insert", row.id);
    return row;
  },
};

/* ────────────────────────────────────────────────────────────────────────
   Lead quote persistence (migration 0013).
   ──────────────────────────────────────────────────────────────────────── */
window.AppData.mutate.leadQuoteSave = async function ({ leadId, repId, product, inputs, ranked, recommendedCarrierId, notes }) {
  const sb = window.getSupabase && window.getSupabase();
  if (!sb) { window.toast && window.toast("Supabase not connected", "warn"); return null; }
  const me = window.me && window.me();
  const row = {
    agency_id: me?.agency_id, lead_id: leadId || null, rep_id: repId || me?.rep_id || null,
    product, inputs, ranked, recommended_carrier_id: recommendedCarrierId || null, notes: notes || null,
  };
  const { data, error } = await sb.from("lead_quotes").insert(row).select().single();
  if (error) { window.toast && window.toast(`Quote save failed: ${error.message}`, "error"); throw error; }
  _emitMutation("lead_quotes", "insert", data?.id);
  return data;
};

/* ────────────────────────────────────────────────────────────────────────
   Onboarding auto-events.
   Listen for the first dial of the signed-in rep's session and flip
   onboarding_progress.first_dial = true. Idempotent — once set, the
   listener no-ops via a sessionStorage flag.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  const FLAG = "repflow:onboarding:firstDial";
  function maybeFlip() {
    try { if (sessionStorage.getItem(FLAG)) return; } catch (_e) {}
    const me = window.me && window.me();
    const repId = me?.rep_id || (window.AppData?.REPS?.[0]?.id);
    if (!repId) return;
    const row = (window.AppData?.ONBOARDING_PROGRESS || []).find(p => p.repId === repId);
    if (row && row.firstDial) { try { sessionStorage.setItem(FLAG, "1"); } catch (_e) {} return; }
    if (window.AppData?.mutate?.onboardingStepSet) {
      window.AppData.mutate.onboardingStepSet(repId, "first_dial", true)
        .then(() => { try { sessionStorage.setItem(FLAG, "1"); } catch (_e) {} })
        .catch(() => {});
    }
  }
  window.addEventListener("incall:opened", maybeFlip);
  // Belt-and-suspenders: any direct call to repflowDial / repflowCall flips too.
  const origCall = window.repflowCall;
  if (typeof origCall === "function") {
    window.repflowCall = function (...args) { try { maybeFlip(); } catch (_e) {} return origCall.apply(this, args); };
  }
})();
