// POST /api/connector/calendly-webhook — Calendly v2 webhook ingest.
//
// Subscribe via Calendly settings → Integrations → Webhooks. Handles:
//   • invitee.created  → INSERT appointments + fire automation_fire(appointment_booked)
//   • invitee.canceled → UPDATE appointments.status='canceled'
//
// Verifies Calendly-Webhook-Signature header (HMAC-SHA256, t=<unix>,v1=<sig>)
// against CALENDLY_WEBHOOK_SECRET when configured.
// Idempotent via (source='calendly', external_id=event_uuid).
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

async function verifyCalendly(rawBody, header, secret) {
  if (!secret) return true;
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=", 2)));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let r = 0; for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return r === 0;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const raw = await req.text();
  const ok  = await verifyCalendly(raw, req.headers.get("calendly-webhook-signature"), process.env.CALENDLY_WEBHOOK_SECRET);
  if (!ok) return new Response(JSON.stringify({ error: "bad signature" }), { status: 401, headers: cors() });

  let body = {};
  try { body = JSON.parse(raw); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

  const event = body.event;
  const payload = body.payload || {};
  const externalId = (payload.uri || "").split("/").pop() || (payload.event || {}).uri?.split("/").pop();

  if (!externalId) return new Response("no external id", { status: 200, headers: cors() });

  if (event === "invitee.created") {
    const startsAt = (payload.event || {}).start_time || payload.scheduled_event?.start_time;
    const endsAt   = (payload.event || {}).end_time   || payload.scheduled_event?.end_time;
    const meetingUrl = (payload.event || {}).location?.join_url || (payload.location || {}).join_url || null;
    const attendeeEmail = (payload.email || "").toLowerCase();
    const attendeeName  = payload.name || `${payload.first_name || ""} ${payload.last_name || ""}`.trim();
    const attendeePhone = (payload.questions_and_answers || []).find(q => /phone/i.test(q.question || ""))?.answer;

    // Try to match a lead by email
    let leadId = null, ownerRepId = null, agencyId = null;
    if (attendeeEmail) {
      const r = await fetch(`${SUPA_URL}/rest/v1/pipeline?select=id,owner_rep_id,agency_id&email=eq.${encodeURIComponent(attendeeEmail)}&limit=1`,
        { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]) { leadId = rows[0].id; ownerRepId = rows[0].owner_rep_id; agencyId = rows[0].agency_id; }
      }
    }
    // If no lead, we can't scope to an agency — bail with 200 (idempotent no-op)
    if (!agencyId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no matching lead" }), { status: 200, headers: cors() });
    }

    await fetch(`${SUPA_URL}/rest/v1/appointments?on_conflict=source,external_id`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        agency_id: agencyId, lead_id: leadId, owner_rep_id: ownerRepId,
        source: "calendly", external_id: externalId,
        title: (payload.event || {}).name || "Calendly meeting",
        starts_at: startsAt, ends_at: endsAt,
        attendee_email: attendeeEmail, attendee_name: attendeeName, attendee_phone: attendeePhone,
        meeting_url: meetingUrl,
        status: "scheduled", payload,
      }),
    });

    // Fire automation
    await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        p_agency_id: agencyId, p_trigger: "appointment_booked",
        p_rep_id: ownerRepId,
        p_context: { lead_id: leadId, external_id: externalId, starts_at: startsAt, meeting_url: meetingUrl },
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, lead_id: leadId, external_id: externalId }), { status: 200, headers: cors() });
  }

  if (event === "invitee.canceled") {
    await fetch(`${SUPA_URL}/rest/v1/appointments?source=eq.calendly&external_id=eq.${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ status: "canceled" }),
    });
    return new Response(JSON.stringify({ ok: true, canceled: externalId }), { status: 200, headers: cors() });
  }

  return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200, headers: cors() });
}
