// POST /api/connector/calendly-webhook — Calendly v2 webhook ingest.
//
// Subscribe via Calendly settings → Integrations → Webhooks. Handles:
//   • invitee.created  → INSERT appointments + fire automation_fire(appointment_booked)
//   • invitee.canceled → UPDATE appointments.status='canceled'
//
// No bearer auth (Calendly signs requests but signature verification is
// follow-on). Idempotent via (source='calendly', external_id=event_uuid).
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

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
