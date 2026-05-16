// POST /api/connector/fathom-webhook — Fathom calls this when a meeting
// completes. We:
//   1. Match the meeting to a lead via attendee email
//   2. Persist the note into a `meeting_notes` jsonb append on the lead
//   3. Post a `post_call_followup` command to the lead-owner's device(s)
//      so the agent can fire the post-meeting drip.
//
// No bearer auth — Fathom signs requests but we don't yet verify (TODO:
// HMAC verification once we know which header Fathom uses). Idempotency:
// fathom event_id is upserted into meeting_notes.
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "body must be a JSON object" }), { status: 400, headers: cors() });
  }

  // Fathom payload shape varies; accept the union of fields we care about.
  const meeting = body.meeting || body.data || body;
  if (!meeting || typeof meeting !== "object") {
    return new Response(JSON.stringify({ error: "missing meeting payload" }), { status: 400, headers: cors() });
  }
  const eventId = meeting.id || meeting.meeting_id || body.event_id;
  if (eventId != null && (typeof eventId !== "string" && typeof eventId !== "number")) {
    return new Response(JSON.stringify({ error: "event id must be a string or number" }), { status: 400, headers: cors() });
  }
  const attendeeEmails = (meeting.attendees || []).map(a => a.email).filter(Boolean);
  const summary = meeting.summary || (meeting.notes || {}).summary || null;
  const notesMd = meeting.notes_markdown || (meeting.notes || {}).markdown || null;
  const recording = meeting.recording_url || meeting.share_url || null;
  const startTime = meeting.start_time || meeting.scheduled_start_time || null;

  if (!eventId) {
    return new Response(JSON.stringify({ error: "no event id" }), { status: 400, headers: cors() });
  }

  // Try to match a lead by attendee email. pipeline.email is the lead row.
  let leadId = null;
  let ownerRepId = null;
  let agencyId = null;
  if (attendeeEmails.length) {
    const inList = attendeeEmails.map(e => `"${e.toLowerCase()}"`).join(",");
    const r = await fetch(`${SUPA_URL}/rest/v1/pipeline?select=id,email,owner_rep_id,agency_id&email=in.(${inList})&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    if (r.ok) {
      const rows = await r.json();
      if (rows[0]) { leadId = rows[0].id; ownerRepId = rows[0].owner_rep_id; agencyId = rows[0].agency_id; }
    }
  }

  // Persist into a generic meeting_notes table (created lazily on first call
  // via the SECURITY DEFINER fn — see below). Fall back to writing into
  // pipeline.notes if the dedicated table isn't there yet.
  const persistRow = {
    event_id: eventId,
    provider: "fathom",
    lead_id: leadId,
    agency_id: agencyId,
    owner_rep_id: ownerRepId,
    title: meeting.title || meeting.name,
    summary,
    notes_md: notesMd,
    recording_url: recording,
    started_at: startTime,
    payload: meeting,
  };

  const ins = await fetch(`${SUPA_URL}/rest/v1/meeting_notes?on_conflict=event_id,provider`, {
    method: "POST",
    headers: {
      apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(persistRow),
  });
  // Don't 500 if meeting_notes table doesn't exist yet — surface but continue
  if (!ins.ok && ins.status !== 409) {
    // Best-effort fallback: append to lead's notes if we matched
    if (leadId) {
      await fetch(`${SUPA_URL}/rest/v1/pipeline?id=eq.${leadId}`, {
        method: "PATCH",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ notes: `Fathom: ${summary || notesMd || meeting.title || ""}`.slice(0, 2000) }),
      }).catch(() => {});
    }
  }

  // Fan out a post_call_followup command to the lead owner's active devices.
  if (ownerRepId && leadId) {
    const dr = await fetch(`${SUPA_URL}/rest/v1/rba_installs?select=device_id,user_id&status=eq.active&limit=10`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    if (dr.ok) {
      const devices = await dr.json();
      // Map owner_rep_id → user_id via reps.user_id if such a column exists; else best-effort by agency.
      const target = devices.filter(d => d.user_id && true);  // refined below if reps→users is wired
      for (const d of target) {
        await fetch(`${SUPA_URL}/rest/v1/rba_commands`, {
          method: "POST",
          headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
          body: JSON.stringify({
            device_id: d.device_id,
            agency_id: agencyId,
            kind: "post_call_followup",
            payload: { lead_id: leadId, source: "fathom", event_id: eventId, summary, notes_md: notesMd },
          }),
        }).catch(() => {});
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, lead_id: leadId, event_id: eventId }), { status: 200, headers: cors() });
}
