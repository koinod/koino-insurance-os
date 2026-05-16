// /api/cron/sms-flush — Phase 2 Twilio sender for the Lead Drip pipeline.
//
// Call: POST (or GET) on a schedule. Hobby plan cron is daily; once Pro is
// enabled, bump the vercel.json schedule to "*/15 * * * *" for near-realtime.
// Auth: Bearer $CRON_SECRET header. Requests without a valid secret are rejected.
//
// What it does each run:
//   1. SELECT sms_outbox where status='pending', limit 50, oldest first
//   2. For each row, apply compliance gates IN ORDER:
//        a) Body must contain "Reply STOP to opt out"     → fail+mark
//        b) Consent gate (pipeline.consent, if related_lead_id)
//        c) STOP-list gate (sms_optouts.phone)
//        d) Quiet-hours gate (9am–8pm in recipient state's local time)
//   3. For rows passing all gates: POST to Twilio's REST API
//   4. PATCH the outbox row with the result (sent / failed / skipped_*)
//        — gated by `?status=eq.pending` so re-runs can't double-send
//   5. Mirror the action into drip_log (best-effort; never blocks)
//
// Env required:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//   SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (and NEXT_PUBLIC_SUPABASE_URL)
//
// Manual testing: pass ?limit=N (capped at 50). Useful for one-row dry-runs.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_KEY = process.env.CRON_SECRET               || "";

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID   || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN    || "";
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER  || process.env.TWILIO_CALLER_ID || "";

// State → IANA timezone. Mirrors lib/dial-rules.js but inlined here so we
// don't drag a browser-side `window.*` module into the edge runtime.
const STATE_TZ = {
  AL: "America/Chicago",     AK: "America/Anchorage",   AZ: "America/Phoenix",
  AR: "America/Chicago",     CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York",    DE: "America/New_York",    FL: "America/New_York",
  GA: "America/New_York",    HI: "Pacific/Honolulu",    ID: "America/Boise",
  IL: "America/Chicago",     IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",     KS: "America/Chicago",     KY: "America/New_York",
  LA: "America/Chicago",     ME: "America/New_York",    MD: "America/New_York",
  MA: "America/New_York",    MI: "America/Detroit",     MN: "America/Chicago",
  MS: "America/Chicago",     MO: "America/Chicago",     MT: "America/Denver",
  NE: "America/Chicago",     NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York",    NM: "America/Denver",      NY: "America/New_York",
  NC: "America/New_York",    ND: "America/Chicago",     OH: "America/New_York",
  OK: "America/Chicago",     OR: "America/Los_Angeles", PA: "America/New_York",
  RI: "America/New_York",    SC: "America/New_York",    SD: "America/Chicago",
  TN: "America/Chicago",     TX: "America/Chicago",     UT: "America/Denver",
  VT: "America/New_York",    VA: "America/New_York",    WA: "America/Los_Angeles",
  WV: "America/New_York",    WI: "America/Chicago",     WY: "America/Denver",
  DC: "America/New_York",
};
const DEFAULT_TZ = "America/New_York";

const QUIET_HOURS_START = 9;   // 9:00 inclusive
const QUIET_HOURS_END   = 20;  // 20:00 (8pm) exclusive

function jsonResp(b, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}

async function pg(path, opts = {}) {
  if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  const r = await fetch(`${SUPA_URL}${path}`, {
    ...opts,
    headers: {
      "apikey":        SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type":  "application/json",
      ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
}

// E.164 normalize. Accepts:
//   "+15551234567" → "+15551234567"
//   "15551234567"  → "+15551234567"
//   "5551234567"   → "+15551234567"   (assume US)
//   "(555) 123-4567" → "+15551234567"
// Returns null if the result isn't a 10- or 11-digit US number.
function normalizeE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15 && String(raw).trim().startsWith("+")) {
    return `+${digits}`;
  }
  return null;
}

// Local hour at the recipient's timezone. Returns 0–23.
function localHour(tz) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", hour12: false,
    });
    const parts = f.formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    // "24" from formatToParts means midnight — normalize.
    return h === 24 ? 0 : h;
  } catch {
    return null;
  }
}

function inQuietHoursWindow(state) {
  const tz = STATE_TZ[(state || "").toUpperCase()] || DEFAULT_TZ;
  const h = localHour(tz);
  if (h == null) return true;  // can't resolve — let it through (don't block on infra hiccup)
  return h >= QUIET_HOURS_START && h < QUIET_HOURS_END;
}

async function sendViaTwilio(to, body) {
  const form = new URLSearchParams();
  form.set("To",   to);
  form.set("From", TWILIO_FROM);
  form.set("Body", body);

  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type":  "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: `twilio ${r.status}: code=${j.code} ${j.message || ""}`.slice(0, 300) };
  }
  return { ok: true, sid: j.sid, status: j.status };
}

// Best-effort drip_log mirror. Never blocks the runner.
async function mirrorToDripLog({ outbox, status, errorText }) {
  try {
    // Find the enrollment that produced this outbox row, if any.
    // sms_outbox.related_lead_id → sequence_enrollments.lead_pipeline_id (active enrollment)
    let enrollmentId = null;
    let sequenceId   = null;
    let stepIdx      = null;

    if (outbox.related_lead_id) {
      const enrolls = await pg(
        `/rest/v1/sequence_enrollments?lead_pipeline_id=eq.${encodeURIComponent(outbox.related_lead_id)}` +
        `&order=enrolled_at.desc&limit=1&select=id,sequence_id,current_step`
      );
      const e = Array.isArray(enrolls) ? enrolls[0] : null;
      if (e) {
        enrollmentId = e.id;
        sequenceId   = e.sequence_id;
        // current_step has already been advanced by drip-runner by the time we
        // get here, so the just-fired step is current_step - 1 (best effort).
        stepIdx = Math.max(0, (e.current_step ?? 1) - 1);
      }
    }

    await pg("/rest/v1/drip_log", {
      method:  "POST",
      headers: { "prefer": "return=minimal" },
      body: JSON.stringify({
        agency_id:     outbox.agency_id || null,
        enrollment_id: enrollmentId,
        sequence_id:   sequenceId,
        step_idx:      stepIdx,
        channel:       "sms",
        audience:      outbox.rep_id ? "rep" : "lead",
        to_number:     outbox.to_number || null,
        body:          outbox.body || null,
        status,
        error_text:    errorText || null,
      }),
    });
  } catch { /* drip_log is journal-only */ }
}

// PATCH only rows still in status='pending'. The ?status=eq.pending filter is
// the idempotency lock — if two flushes race or this row was already updated,
// the WHERE clause returns 0 rows and nothing happens.
async function patchOutboxIfPending(id, patch) {
  return pg(
    `/rest/v1/sms_outbox?id=eq.${encodeURIComponent(id)}&status=eq.pending`,
    {
      method:  "PATCH",
      headers: { "prefer": "return=minimal" },
      body:    JSON.stringify(patch),
    }
  );
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  if (CRON_KEY) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${CRON_KEY}`) return jsonResp({ error: "unauthorized" }, 401);
  }

  // Fail fast if Twilio isn't configured. Per the brief: don't pretend to send.
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return jsonResp({ ok: false, error: "twilio_unconfigured" }, 503);
  }

  // Optional ?limit=N override for manual testing. Cap at 50.
  let limit = 50;
  try {
    const url = new URL(req.url);
    const q = parseInt(url.searchParams.get("limit") || "", 10);
    if (Number.isFinite(q) && q > 0) limit = Math.min(q, 50);
  } catch { /* ignore */ }

  const now = new Date().toISOString();
  let processed = 0, sent = 0, skipped = 0, failed = 0;
  const bySkipReason = {
    missing_stop_language: 0,
    skipped_no_consent:    0,
    skipped_opted_out:     0,
    skipped_quiet_hours:   0,
    bad_phone:             0,
  };
  const errors = [];

  try {
    const rows = await pg(
      `/rest/v1/sms_outbox?status=eq.pending&limit=${limit}&order=created_at.asc` +
      `&select=id,agency_id,rep_id,to_number,body,status,attempts,source,related_lead_id,related_thread_id`
    );
    const queue = Array.isArray(rows) ? rows : [];

    for (const row of queue) {
      processed++;

      // ── Hard rule: every body MUST end with "Reply STOP to opt out". If it
      //    doesn't, mark error_text and don't send. Per the brief.
      if (!String(row.body || "").includes("Reply STOP to opt out")) {
        try {
          await patchOutboxIfPending(row.id, {
            status:     "failed",
            error_text: "missing_stop_language",
            attempts:   (row.attempts || 0) + 1,
          });
        } catch (e) { errors.push(`patch fail ${row.id}: ${e.message}`); }
        failed++;
        bySkipReason.missing_stop_language++;
        await mirrorToDripLog({ outbox: row, status: "failed", errorText: "missing_stop_language" });
        continue;
      }

      // ── Gate A: consent (only enforced if there's a related_lead_id) ──
      if (row.related_lead_id) {
        let leadConsent = null;
        try {
          const leads = await pg(
            `/rest/v1/pipeline?id=eq.${encodeURIComponent(row.related_lead_id)}` +
            `&select=consent,state&limit=1`
          );
          const lead = Array.isArray(leads) ? leads[0] : null;
          leadConsent = lead?.consent ?? null;
          // Stash state on the row for the quiet-hours gate below.
          if (lead) row._state = lead.state || null;
        } catch (e) {
          errors.push(`consent lookup ${row.id}: ${e.message}`);
        }

        if (!leadConsent || String(leadConsent).trim() === "") {
          try {
            await patchOutboxIfPending(row.id, {
              status:     "skipped_no_consent",
              error_text: "no consent on related pipeline lead",
            });
          } catch (e) { errors.push(`patch skip ${row.id}: ${e.message}`); }
          skipped++;
          bySkipReason.skipped_no_consent++;
          await mirrorToDripLog({ outbox: row, status: "skipped_no_consent", errorText: null });
          continue;
        }
      }

      // ── Gate B: STOP-list ──
      try {
        const optouts = await pg(
          `/rest/v1/sms_optouts?phone=eq.${encodeURIComponent(row.to_number)}&select=phone&limit=1`
        );
        if (Array.isArray(optouts) && optouts.length > 0) {
          try {
            await patchOutboxIfPending(row.id, {
              status:     "skipped_opted_out",
              error_text: "recipient on sms_optouts STOP-list",
            });
          } catch (e) { errors.push(`patch optout ${row.id}: ${e.message}`); }
          skipped++;
          bySkipReason.skipped_opted_out++;
          await mirrorToDripLog({ outbox: row, status: "skipped_opted_out", errorText: null });
          continue;
        }
      } catch (e) {
        errors.push(`optout lookup ${row.id}: ${e.message}`);
        // Fail-open on lookup error — but log it. Don't gate on infra hiccups.
      }

      // ── Gate C: quiet-hours (9am–8pm local) ──
      // State was stashed on the row during the consent lookup above (when
      // related_lead_id was set). Rep-audience rows (related_lead_id NULL)
      // have no state to resolve — quiet-hours falls back to Eastern.
      const state = row._state || null;
      if (!inQuietHoursWindow(state)) {
        // Don't mutate the outbox row's status — quiet hours is "wait, retry
        // later", not "rejected forever". Just count it and mirror to drip_log.
        // Future runs will re-pull this same pending row.
        skipped++;
        bySkipReason.skipped_quiet_hours++;
        await mirrorToDripLog({
          outbox: row, status: "skipped_quiet_hours",
          errorText: `outside 9am–8pm local (state=${state || "n/a"})`,
        });
        continue;
      }

      // ── Phone normalize. Fail (not skip) if unusable. ──
      const to = normalizeE164(row.to_number);
      if (!to) {
        try {
          await patchOutboxIfPending(row.id, {
            status:     "failed",
            error_text: `bad_phone: ${row.to_number}`,
            attempts:   (row.attempts || 0) + 1,
          });
        } catch (e) { errors.push(`patch badphone ${row.id}: ${e.message}`); }
        failed++;
        bySkipReason.bad_phone++;
        await mirrorToDripLog({ outbox: row, status: "failed", errorText: "bad_phone" });
        continue;
      }

      // ── Send ──
      const result = await sendViaTwilio(to, row.body);
      if (result.ok) {
        try {
          await patchOutboxIfPending(row.id, {
            status:     "sent",
            sent_at:    new Date().toISOString(),
            twilio_sid: result.sid || null,
          });
          sent++;
          await mirrorToDripLog({ outbox: row, status: "sent", errorText: null });
        } catch (e) {
          // The Twilio send succeeded but the PATCH failed. Log loudly; the
          // row will look like it never sent and a future run will resend it.
          // This is a known idempotency hazard. We accept the (rare) double-
          // send risk over the alternative of marking sent on Twilio failure.
          errors.push(`POST-SEND patch fail ${row.id}: ${e.message}`);
        }
      } else {
        try {
          await patchOutboxIfPending(row.id, {
            status:     "failed",
            error_text: result.error,
            attempts:   (row.attempts || 0) + 1,
          });
        } catch (e) { errors.push(`patch fail ${row.id}: ${e.message}`); }
        failed++;
        await mirrorToDripLog({ outbox: row, status: "failed", errorText: result.error });
      }
    }
  } catch (fatal) {
    console.error("[sms-flush] fatal:", fatal.message);
    return jsonResp({ ok: false, error: fatal.message, processed, sent, skipped, failed }, 500);
  }

  return jsonResp({
    ok: true,
    processed, sent, skipped, failed,
    by_skip_reason: bySkipReason,
    errors: errors.length ? errors : undefined,
    ts: now,
  });
}
