// /api/cron/drip-runner — cadence runner for Lead Drip sequences.
//
// Call: POST (or GET) on a schedule — recommended every 15 min via Vercel cron.
// Auth: Bearer $CRON_SECRET header. Requests without a valid secret are rejected.
//
// What it does each run:
//   1. Find sequence_enrollments where status='active' AND next_step_at <= now()
//   2. For each enrollment, resolve the sequence steps + pipeline lead
//   3. Queue an sms_outbox row (picked up by the existing /api/sms/outbox poller)
//   4. Write a drip_log row for audit / debugging
//   5. Advance current_step + compute next_step_at; mark 'completed' at end
//
// The sms_outbox agent (SailorsBot1 / any rep machine) then sends via Twilio.
// Email channel: future — currently logs to drip_log with status='queued'.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_KEY = process.env.CRON_SECRET               || "";

function jsonResp(b, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}

async function pg(path, opts = {}) {
  const key = SERVICE;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  const r = await fetch(`${SUPA_URL}${path}`, {
    ...opts,
    headers: {
      "apikey":        key,
      "authorization": `Bearer ${key}`,
      "content-type":  "application/json",
      ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  // Protect from arbitrary external callers
  if (CRON_KEY) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${CRON_KEY}`) return jsonResp({ error: "unauthorized" }, 401);
  }

  const now = new Date().toISOString();
  let processed = 0, queued = 0, completed = 0, skipped = 0, errors = 0;
  const errorDetails = [];

  // Read the send-enabled flag. When false, we still process enrollments and
  // write drip_log rows, but sms_outbox rows are queued with status='dry_run'
  // so the Phase 2 sms-flush (Twilio sender) skips them. This is what lets
  // Ian read the queued copy before turning real sends on.
  let sendEnabled = false;
  try {
    const flagRows = await pg(`/rest/v1/org_settings?key=eq.drip.send_enabled&select=value&limit=1`);
    sendEnabled = Boolean(Array.isArray(flagRows) && flagRows[0]?.value === true);
  } catch { /* missing row = default false, which is the safe path */ }
  const outboxStatus = sendEnabled ? "pending" : "dry_run";
  const logStatusBase = sendEnabled ? "queued"  : "dry_run";

  try {
    // ── 1. Due enrollments — column is next_send_at per the schema ──────
    const enrollments = await pg(
      `/rest/v1/sequence_enrollments?status=eq.active&next_send_at=lte.${encodeURIComponent(now)}&limit=100` +
      `&select=id,lead_pipeline_id,sequence_id,current_step,owner_rep_id,agency_id`
    );
    const rows = Array.isArray(enrollments) ? enrollments : [];

    for (const enroll of rows) {
      processed++;
      try {
        // ── 2. Fetch sequence (with audience + agency_id now) ────────────
        const seqs = await pg(
          `/rest/v1/sequences?id=eq.${encodeURIComponent(enroll.sequence_id)}&select=id,steps,is_active,audience`
        );
        const seq = Array.isArray(seqs) ? seqs[0] : null;
        if (!seq || !seq.is_active) { skipped++; continue; }

        const steps = Array.isArray(seq.steps) ? seq.steps : [];
        const step  = steps[enroll.current_step];

        if (!step) {
          await pg(`/rest/v1/sequence_enrollments?id=eq.${enroll.id}`, {
            method:  "PATCH",
            headers: { "prefer": "return=minimal" },
            body:    JSON.stringify({ status: "completed" }),
          });
          completed++;
          continue;
        }

        // ── 3. Resolve recipient based on audience ───────────────────────
        // audience='lead' → use pipeline.phone/email.
        // audience='rep'  → use reps.phone for owner_rep_id.
        const audience = seq.audience || "lead";
        let recipient = null;
        let leadAgencyId = null;
        let nameFirst = "there";
        let nameFull  = "";

        if (audience === "rep") {
          if (enroll.owner_rep_id) {
            const reps = await pg(`/rest/v1/reps?id=eq.${encodeURIComponent(enroll.owner_rep_id)}&select=id,name,phone,agency_id&limit=1`);
            const rep = Array.isArray(reps) ? reps[0] : null;
            if (rep) {
              recipient    = rep.phone;
              leadAgencyId = rep.agency_id;
              nameFull     = rep.name || "";
              nameFirst    = (rep.name || "").split(" ")[0] || "there";
            }
          }
        } else {
          const leads = await pg(
            `/rest/v1/pipeline?id=eq.${encodeURIComponent(enroll.lead_pipeline_id)}&select=id,lead_name,phone,email,state,product,age,agency_id&limit=1`
          );
          const lead = Array.isArray(leads) ? leads[0] : null;
          if (lead) {
            const ch = step.channel || step.ch || "sms";
            recipient    = ch.toLowerCase() === "email" ? lead.email : lead.phone;
            leadAgencyId = lead.agency_id;
            nameFull     = lead.lead_name || "";
            nameFirst    = (lead.lead_name || "").split(" ")[0] || "there";
          }
        }

        const agencyId = enroll.agency_id || leadAgencyId;
        if (!agencyId) { skipped++; continue; }

        const ch   = (step.channel || step.ch || "sms").toLowerCase();
        const tmpl = step.body || step.template || "";

        // Template substitution. The migration's seed copy uses {{lead.first_name}},
        // {{rep.name}}, etc. — support both flat and dotted forms.
        const body = tmpl
          .replace(/\{\{\s*lead\.first_name\s*\}\}/g, nameFirst)
          .replace(/\{\{\s*lead\.name\s*\}\}/g,       nameFull)
          .replace(/\{\{\s*rep\.first_name\s*\}\}/g,  nameFirst)
          .replace(/\{\{\s*rep\.name\s*\}\}/g,        nameFull)
          .replace(/\{\{\s*first\s*\}\}/g,            nameFirst)
          .replace(/\{\{\s*name\s*\}\}/g,             nameFull)
          .replace(/\{\{[^}]+\}\}/g, "");   // strip unresolved tokens so we never SMS a literal "{{...}}"

        // ── 4a. Queue sms_outbox (status reflects send_enabled flag) ─────
        let rowStatus = "skipped";
        if (recipient && ch !== "email") {
          try {
            await pg("/rest/v1/sms_outbox", {
              method:  "POST",
              headers: { "prefer": "return=minimal" },
              body: JSON.stringify({
                agency_id:        agencyId,
                rep_id:           enroll.owner_rep_id || null,
                to_number:        recipient,
                body,
                status:           outboxStatus,
                source:           "drip-sequence",
                related_lead_id:  audience === "lead" ? enroll.lead_pipeline_id : null,
              }),
            });
            queued++;
            rowStatus = logStatusBase;
          } catch (e) {
            rowStatus = "error";
            errors++;
            errorDetails.push(`sms enroll=${enroll.id}: ${e.message}`);
          }
        }

        // ── 4b. drip_log row (matches migration 0031 schema) ─────────────
        try {
          await pg("/rest/v1/drip_log", {
            method:  "POST",
            headers: { "prefer": "return=minimal" },
            body: JSON.stringify({
              agency_id:     agencyId,
              enrollment_id: enroll.id,
              sequence_id:   enroll.sequence_id,
              step_idx:      enroll.current_step,
              channel:       ch,
              audience,
              to_number:     recipient || null,
              body,
              status:        rowStatus,
              error_text:    null,
            }),
          });
        } catch { /* drip_log is journal-only; never block the runner on it */ }

        // ── 5. Advance enrollment — column is next_send_at ───────────────
        const nextIdx     = enroll.current_step + 1;
        const nextStepDef = steps[nextIdx];
        let nextSendAt    = null;
        if (nextStepDef) {
          const currentDay = step.day ?? enroll.current_step;
          const nextDay    = nextStepDef.day ?? nextIdx;
          const deltaMs    = Math.max(1, nextDay - currentDay) * 24 * 60 * 60 * 1000;
          nextSendAt       = new Date(Date.now() + deltaMs).toISOString();
        }

        await pg(`/rest/v1/sequence_enrollments?id=eq.${enroll.id}`, {
          method:  "PATCH",
          headers: { "prefer": "return=minimal" },
          body: JSON.stringify({
            current_step: nextIdx,
            next_send_at: nextSendAt,
            status:       nextIdx >= steps.length ? "completed" : "active",
          }),
        });

        if (nextIdx >= steps.length) completed++;
      } catch (e) {
        errors++;
        errorDetails.push(`enroll=${enroll.id}: ${e.message}`);
      }
    }
  } catch (fatal) {
    console.error("[drip-runner] fatal:", fatal.message);
    return jsonResp({ ok: false, error: fatal.message }, 500);
  }

  return jsonResp({
    ok: true,
    mode: sendEnabled ? "live" : "dry_run",
    processed, queued, completed, skipped, errors, errorDetails,
    ts: now,
  });
}
