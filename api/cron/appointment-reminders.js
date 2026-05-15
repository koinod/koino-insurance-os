// GET /api/cron/appointment-reminders — every 15 min. Scans
// appointments.scheduled within the next 24h / 1h windows and fires
// automation_rules: appointment_reminder_24h / appointment_reminder_1h.
// Idempotent via reminder_24h_fired_at / reminder_1h_fired_at columns.
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET or POST" }), { status: 405, headers: cors() });
  }
  const fromCron = req.headers.get("x-vercel-cron") || (req.headers.get("user-agent") || "").includes("vercel-cron");
  const sec = req.headers.get("x-cron-secret");
  if (!fromCron && (!sec || sec !== process.env.CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors() });
  }

  const now = Date.now();
  const in24h = new Date(now + 24 * 3600 * 1000).toISOString();
  const in23h = new Date(now + 23 * 3600 * 1000).toISOString();
  const in1h  = new Date(now + 1  * 3600 * 1000).toISOString();
  const in55m = new Date(now + 55 * 60   * 1000).toISOString();

  let fired24 = 0, fired1 = 0;

  // 24h window: appointments starting between (now+23h, now+24h) and not yet 24h-fired
  const r24 = await fetch(
    `${SUPA_URL}/rest/v1/appointments?select=id,agency_id,lead_id,owner_rep_id,starts_at,attendee_name,attendee_phone,attendee_email,meeting_url&status=eq.scheduled&reminder_24h_fired_at=is.null&starts_at=gte.${encodeURIComponent(in23h)}&starts_at=lte.${encodeURIComponent(in24h)}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  if (r24.ok) {
    const rows = await r24.json();
    for (const a of rows) {
      await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
        method: "POST",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({
          p_agency_id: a.agency_id, p_trigger: "appointment_reminder_24h",
          p_rep_id: a.owner_rep_id,
          p_context: {
            appointment_id: a.id, lead_id: a.lead_id, starts_at: a.starts_at,
            attendee_name: a.attendee_name, attendee_phone: a.attendee_phone,
            attendee_email: a.attendee_email, meeting_url: a.meeting_url,
          },
        }),
      }).catch(() => {});
      await fetch(`${SUPA_URL}/rest/v1/appointments?id=eq.${a.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ reminder_24h_fired_at: new Date().toISOString() }),
      }).catch(() => {});
      fired24++;
    }
  }

  // 1h window: between (now+55m, now+1h) and not yet 1h-fired
  const r1 = await fetch(
    `${SUPA_URL}/rest/v1/appointments?select=id,agency_id,lead_id,owner_rep_id,starts_at,attendee_name,attendee_phone,attendee_email,meeting_url&status=eq.scheduled&reminder_1h_fired_at=is.null&starts_at=gte.${encodeURIComponent(in55m)}&starts_at=lte.${encodeURIComponent(in1h)}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  if (r1.ok) {
    const rows = await r1.json();
    for (const a of rows) {
      await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
        method: "POST",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({
          p_agency_id: a.agency_id, p_trigger: "appointment_reminder_1h",
          p_rep_id: a.owner_rep_id,
          p_context: {
            appointment_id: a.id, lead_id: a.lead_id, starts_at: a.starts_at,
            attendee_name: a.attendee_name, attendee_phone: a.attendee_phone,
            attendee_email: a.attendee_email, meeting_url: a.meeting_url,
          },
        }),
      }).catch(() => {});
      await fetch(`${SUPA_URL}/rest/v1/appointments?id=eq.${a.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ reminder_1h_fired_at: new Date().toISOString() }),
      }).catch(() => {});
      fired1++;
    }
  }

  return new Response(JSON.stringify({ fired_24h: fired24, fired_1h: fired1 }), { status: 200, headers: cors() });
}
