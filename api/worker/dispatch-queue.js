// /api/worker/dispatch-queue — cron-driven queue processor.
//
// Vercel cron hits this every 5 minutes (see vercel.json). Pulls scheduled
// followup_runs and automation_runs whose `scheduled_for <= now()`, fans them
// out to the right channel adapter, and updates status:
//   scheduled → sending → sent/failed/pending_creds
//
// Channels:
//   sms        → Twilio (POST /Accounts/{sid}/Messages.json)
//   imessage   → SendBlue (POST /api/send-message)
//   email      → Mailgun (POST /v3/{domain}/messages)
//   phone_link → local desktop relay (status flips to sent immediately;
//                actual delivery happens out-of-band via the rep's machine)
//
// Idempotent: the WHERE clause filters to status='scheduled', so a second
// invocation skips runs already in flight. Each row is updated to 'sending'
// before its adapter call and 'sent'/'failed' after.
//
// Authorization: cron requests are unauthenticated by Vercel design. We
// hard-gate on a CRON_SECRET env var (must be passed in the
// `Authorization: Bearer ...` header) so randoms can't trigger the
// processor and exhaust quotas.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
// Service role bypasses RLS — needed because the cron has no user JWT.
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const CRON_SECRET = process.env.CRON_SECRET || "";

function jsonResponse(p, s = 200) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authKey() {
  // Service role lets us bypass RLS for the queue update. Falls back to anon
  // (which will only succeed if RLS allows it — generally won't for updates).
  return SERVICE || ANON;
}

async function sbFetch(path, init = {}) {
  const headers = {
    apikey: ANON,
    authorization: `Bearer ${authKey()}`,
    "content-type": "application/json",
    ...(init.headers || {}),
  };
  return fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers });
}

// ─── channel adapters ────────────────────────────────────────────────────

async function sendSms({ recipient, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const ks  = process.env.TWILIO_API_KEY_SID;
  const sk  = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_CALLER_ID;
  const missing = ["TWILIO_ACCOUNT_SID","TWILIO_API_KEY_SID","TWILIO_API_KEY_SECRET","TWILIO_CALLER_ID"]
    .filter(k => !process.env[k]);
  if (missing.length) return { ok: false, reason: `missing env: ${missing.join(", ")}`, pendingCreds: true };
  if (!recipient) return { ok: false, reason: "no recipient phone" };

  const auth = btoa(`${ks}:${sk}`);
  const form = new URLSearchParams({ From: from, To: recipient, Body: body || "" });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return { ok: false, reason: `Twilio ${r.status}: ${detail.slice(0, 160)}` };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: true, providerId: j.sid || null };
}

async function sendIMessage({ recipient, body }) {
  const key    = process.env.SENDBLUE_API_KEY;
  const secret = process.env.SENDBLUE_API_SECRET;
  const from   = process.env.SENDBLUE_FROM_PHONE;
  const missing = ["SENDBLUE_API_KEY","SENDBLUE_API_SECRET"].filter(k => !process.env[k]);
  if (missing.length) return { ok: false, reason: `missing env: ${missing.join(", ")}`, pendingCreds: true };
  if (!recipient) return { ok: false, reason: "no recipient phone" };

  const r = await fetch("https://api.sendblue.co/api/send-message", {
    method: "POST",
    headers: {
      "sb-api-key-id": key,
      "sb-api-secret-key": secret,
      "content-type": "application/json",
    },
    body: JSON.stringify({ number: recipient, content: body || "", from_number: from }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return { ok: false, reason: `SendBlue ${r.status}: ${detail.slice(0, 160)}` };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: true, providerId: j.message_handle || null };
}

async function sendEmail({ recipient, body }) {
  const key    = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const missing = ["MAILGUN_API_KEY","MAILGUN_DOMAIN"].filter(k => !process.env[k]);
  if (missing.length) return { ok: false, reason: `missing env: ${missing.join(", ")}`, pendingCreds: true };
  if (!recipient) return { ok: false, reason: "no recipient email" };

  const auth = btoa(`api:${key}`);
  const from = `outreach@${domain}`;
  const form = new URLSearchParams({ from, to: recipient, subject: "Follow-up", text: body || "" });
  const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return { ok: false, reason: `Mailgun ${r.status}: ${detail.slice(0, 160)}` };
  }
  return { ok: true, providerId: null };
}

async function sendPhoneLink(_args) {
  // Local channel — the rep's desktop helper polls a separate queue. Mark as
  // 'sent' here so the row clears; the desktop helper updates a separate
  // delivery log when it actually dials.
  return { ok: true, providerId: null, note: "queued for local desktop helper" };
}

const ADAPTERS = {
  sms:        sendSms,
  imessage:   sendIMessage,
  email:      sendEmail,
  phone_link: sendPhoneLink,
};

// ─── queue processing ────────────────────────────────────────────────────

async function processTable(table, agencyScope = null) {
  const nowIso = new Date().toISOString();
  // Pull a batch of scheduled rows whose time has passed.
  // agencyScope: when set (user-JWT invocation), only drain that agency's rows
  // so a tenant can't trigger another tenant's queue. Cron passes null = all.
  const scope = agencyScope ? `&agency_id=eq.${encodeURIComponent(agencyScope)}` : "";
  const r = await sbFetch(
    `${table}?select=*&status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(nowIso)}${scope}&limit=25`
  );
  if (!r.ok) return { table, error: `fetch ${r.status}` };
  const rows = await r.json().catch(() => []);
  const results = [];

  for (const row of rows) {
    // Optimistic claim: flip to 'sending' so concurrent worker invocations
    // don't double-send.
    const claimR = await sbFetch(
      `${table}?id=eq.${row.id}&status=eq.scheduled`,
      { method: "PATCH", body: JSON.stringify({ status: "sending" }) }
    );
    if (!claimR.ok) { results.push({ id: row.id, claim: "lost" }); continue; }

    const adapter = ADAPTERS[row.channel] || null;
    let outcome;
    if (!adapter) {
      outcome = { ok: false, reason: `unknown channel "${row.channel}"` };
    } else {
      try {
        outcome = await adapter({ recipient: row.recipient, body: row.body_snapshot });
      } catch (e) {
        outcome = { ok: false, reason: `adapter threw: ${String(e).slice(0, 160)}` };
      }
    }

    const finalStatus = outcome.ok
      ? "sent"
      : (outcome.pendingCreds ? "pending_creds" : "failed");
    const patch = {
      status: finalStatus,
      sent_at: outcome.ok ? new Date().toISOString() : null,
      failure_detail: outcome.ok ? null : (outcome.reason || "unknown"),
    };
    await sbFetch(`${table}?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    results.push({ id: row.id, status: finalStatus, channel: row.channel, detail: outcome.reason || outcome.note || null });
  }

  return { table, processed: rows.length, results };
}

export default async function handler(req) {
  // Vercel cron sends a GET; ad-hoc invocations may send POST. Both fine.
  if (req.method !== "GET" && req.method !== "POST") return new Response("GET/POST only", { status: 405 });

  // Auth: TWO accepted forms.
  //   1. CRON_SECRET in Authorization or x-vercel-cron-auth header — drains
  //      every agency. This is the daily backstop run.
  //   2. User Supabase JWT in Authorization — drains only that user's agency.
  //      Lets the client fire-and-forget after sb.rpc("automation_fire", ...)
  //      so a lead_created SMS goes out within seconds instead of waiting 24h.
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-vercel-cron-auth") || "";
  let agencyScope = null;     // null = drain all (cron); uuid = single-agency (user JWT)
  let authedAs = "none";
  if (CRON_SECRET && (authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET)) {
    authedAs = "cron";
  } else if (authHeader.startsWith("Bearer ")) {
    // Resolve caller's agency via me() so we can scope the drain.
    const jwt = authHeader.slice(7);
    try {
      const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: "{}",
      });
      if (meR.ok) {
        const rows = await meR.json();
        const me = Array.isArray(rows) ? rows[0] : rows;
        if (me && me.agency_id) {
          agencyScope = me.agency_id;
          authedAs = "user";
        }
      }
    } catch (_e) { /* fall through to unauthorized */ }
    if (!agencyScope) return jsonResponse({ error: "unauthorized" }, 401);
  } else {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (!SERVICE) {
    // Without service role, we can't update other-agency rows. Return early
    // with a clear note so deployment status surfaces it.
    return jsonResponse({
      ok: false,
      detail: "SUPABASE_SERVICE_ROLE_KEY not set; queue processor cannot bypass RLS for cross-agency updates",
    });
  }

  const [followups, automations] = await Promise.all([
    processTable("followup_runs",   agencyScope),
    processTable("automation_runs", agencyScope),
  ]);
  return jsonResponse({ ok: true, ranAt: new Date().toISOString(), authedAs, agencyScope, followups, automations });
}
