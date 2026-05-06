// /api/twilio-sms — outbound SMS with two-tier delivery.
//
// Tier 1 (preferred): Twilio Programmable Messaging if env configured.
// Tier 2 (fallback):  enqueue into public.sms_outbox so the locally-installed
//                     Repflow Agent on the rep's laptop sends via iMessage
//                     (macOS) or Phone Link / adb (Windows + Android). Caller
//                     gets a 202 with the outbox row id; UI can poll for delivery.
//
// Required env for Tier 1: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID
// Required env for Tier 2: SUPABASE_SERVICE_ROLE_KEY (for the outbox insert)

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function enqueueToOutbox({ to, body, agencyId, repId, source, leadId, threadId }) {
  if (!SERVICE) {
    return { ok: false, reason: "service_role_key_missing" };
  }
  const row = {
    agency_id: agencyId,
    rep_id: repId || null,
    to_number: to,
    body,
    status: "pending",
    source: source || "manual",
    related_lead_id: leadId || null,
    related_thread_id: threadId || null,
  };
  const r = await fetch(`${SUPA_URL}/rest/v1/sms_outbox`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const text = await r.text();
    return { ok: false, reason: `outbox_insert_failed: ${text.slice(0, 200)}` };
  }
  const data = await r.json();
  return { ok: true, outbox_id: Array.isArray(data) ? data[0]?.id : data?.id };
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const SID    = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN  = process.env.TWILIO_AUTH_TOKEN;
  const FROM   = process.env.TWILIO_CALLER_ID;
  const twilioConfigured = !!(SID && TOKEN && FROM);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const to   = String(body.to || "").trim();
  const text = String(body.body || body.text || "").trim();
  const agencyId = body.agency_id || null;
  const repId    = body.rep_id || null;
  const source   = body.source || "manual";
  const leadId   = body.lead_id || null;
  const threadId = body.thread_id || null;
  if (!to || !text) {
    return new Response(JSON.stringify({ error: "missing_to_or_body" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  if (text.length > 1600) {
    return new Response(JSON.stringify({ error: "body_too_long", max: 1600 }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // Tier 2 (no Twilio): enqueue for the local Repflow Agent on the rep's laptop.
  if (!twilioConfigured) {
    if (!agencyId) {
      return new Response(JSON.stringify({
        error: "twilio_not_configured_and_no_agency_for_fallback",
        detail: "Either configure Twilio env vars OR pass agency_id so the local-agent fallback can route this message.",
      }), { status: 503, headers: { "content-type": "application/json" } });
    }
    const r = await enqueueToOutbox({ to, body: text, agencyId, repId, source, leadId, threadId });
    if (!r.ok) {
      return new Response(JSON.stringify({
        error: "fallback_enqueue_failed",
        detail: r.reason,
      }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      delivery: "local_agent",
      outbox_id: r.outbox_id,
      detail: "Twilio not configured. Queued for the Repflow Agent on the rep's laptop. Status: pending → claimed → sent.",
    }), { status: 202, headers: { "content-type": "application/json" } });
  }

  // Tier 1: Twilio messaging REST API
  const form = new URLSearchParams();
  form.set("To",   to);
  form.set("From", FROM);
  form.set("Body", text);

  const auth = btoa(`${SID}:${TOKEN}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Twilio failed (account suspended, number unverified, etc). Fall back
    // to the local-agent outbox if we have agency_id, so a message that
    // would otherwise be lost still has a chance to deliver via the rep's phone.
    if (agencyId) {
      const fb = await enqueueToOutbox({ to, body: text, agencyId, repId, source, leadId, threadId });
      if (fb.ok) {
        return new Response(JSON.stringify({
          ok: true,
          delivery: "local_agent_after_twilio_failure",
          outbox_id: fb.outbox_id,
          twilio_code: j.code,
          twilio_message: j.message,
        }), { status: 202, headers: { "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({
      error: "twilio_error",
      twilio_code: j.code,
      twilio_message: j.message,
    }), { status: r.status, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({
    ok: true,
    sid: j.sid,
    status: j.status,
    to: j.to,
    date_created: j.date_created,
  }), { headers: { "content-type": "application/json" } });
}
