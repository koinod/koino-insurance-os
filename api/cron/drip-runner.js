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

  try {
    // ── 1. Due enrollments ──────────────────────────────────────────────────
    const enrollments = await pg(
      `/rest/v1/sequence_enrollments?status=eq.active&next_step_at=lte.${encodeURIComponent(now)}&limit=100` +
      `&select=id,lead_pipeline_id,sequence_id,current_step,owner_rep_id,agency_id`
    );
    const rows = Array.isArray(enrollments) ? enrollments : [];

    for (const enroll of rows) {
      processed++;
      try {
        // ── 2. Fetch sequence ───────────────────────────────────────────────
        const seqs = await pg(
          `/rest/v1/sequences?id=eq.${encodeURIComponent(enroll.sequence_id)}&select=id,steps,is_active`
        );
        const seq = Array.isArray(seqs) ? seqs[0] : null;
        if (!seq || !seq.is_active) { skipped++; continue; }

        const steps = Array.isArray(seq.steps) ? seq.steps : [];
        const step  = steps[enroll.current_step];

        if (!step) {
          // Past end — mark completed
          await pg(`/rest/v1/sequence_enrollments?id=eq.${enroll.id}`, {
            method:  "PATCH",
            headers: { "prefer": "return=minimal" },
            body:    JSON.stringify({ status: "completed" }),
          });
          completed++;
          continue;
        }

        // ── 3. Fetch lead ───────────────────────────────────────────────────
        const leads = await pg(
          `/rest/v1/pipeline?id=eq.${encodeURIComponent(enroll.lead_pipeline_id)}&select=id,lead_name,phone,email,agency_id`
        );
        const lead = Array.isArray(leads) ? leads[0] : null;
        const agencyId = enroll.agency_id || lead?.agency_id;
        if (!lead || !agencyId) { skipped++; continue; }

        const ch        = step.ch || step.channel || "SMS";
        const recipient = ch === "Email" ? lead.email : lead.phone;
        const firstName = (lead.lead_name || "").split(" ")[0] || "there";
        const body      = (step.template || step.body || "")
          .replace(/\{\{first\}\}/g,  firstName)
          .replace(/\{\{name\}\}/g,   lead.lead_name || "")
          .replace(/\{\{phone\}\}/g,  lead.phone     || "");

        // ── 4a. Queue sms_outbox ────────────────────────────────────────────
        let outStatus = "skipped";
        if (recipient && ch !== "Email") {
          try {
            await pg("/rest/v1/sms_outbox", {
              method:  "POST",
              headers: { "prefer": "return=minimal" },
              body: JSON.stringify({
                agency_id:        agencyId,
                rep_id:           enroll.owner_rep_id || null,
                to_number:        recipient,
                body,
                status:           "pending",
                source:           "drip-sequence",
                related_lead_id:  enroll.lead_pipeline_id,
              }),
            });
            queued++;
            outStatus = "queued";
          } catch (e) {
            outStatus = "failed";
            errorDetails.push(`sms enroll=${enroll.id}: ${e.message}`);
          }
        }

        // ── 4b. drip_log row ────────────────────────────────────────────────
        try {
          await pg("/rest/v1/drip_log", {
            method:  "POST",
            headers: { "prefer": "return=minimal" },
            body: JSON.stringify({
              agency_id:        agencyId,
              enrollment_id:    enroll.id,
              pipeline_lead_id: enroll.lead_pipeline_id,
              step_index:       enroll.current_step,
              channel:          ch,
              recipient:        recipient || null,
              body_snapshot:    body,
              status:           outStatus,
              fired_at:         now,
            }),
          });
        } catch { /* drip_log best-effort */ }

        // ── 5. Advance enrollment ───────────────────────────────────────────
        const nextIdx     = enroll.current_step + 1;
        const nextStepDef = steps[nextIdx];
        let nextStepAt    = null;
        if (nextStepDef) {
          // step.day is day-offset from enrollment; delta = (nextDay - currentDay) * 24h
          const currentDay = step.day ?? enroll.current_step;
          const nextDay    = nextStepDef.day ?? nextIdx;
          const deltaMs    = Math.max(1, nextDay - currentDay) * 24 * 60 * 60 * 1000;
          nextStepAt       = new Date(Date.now() + deltaMs).toISOString();
        }

        await pg(`/rest/v1/sequence_enrollments?id=eq.${enroll.id}`, {
          method:  "PATCH",
          headers: { "prefer": "return=minimal" },
          body: JSON.stringify({
            current_step: nextIdx,
            next_step_at: nextStepAt,
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

  return jsonResp({ ok: true, processed, queued, completed, skipped, errors, errorDetails, ts: now });
}
