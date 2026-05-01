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
