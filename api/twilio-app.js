// POST /api/twilio-app — Twilio call StatusCallback. Receives status
// transitions (initiated/ringing/answered/completed/no-answer/busy/failed/
// canceled). When status='completed' AND duration > 0, fires the
// automation_rules trigger 'call_completed' for the lead's owner —
// fan-out to that rep's active devices via automation_fire RPC.
//
// Recording webhook is separate (api/twilio-recording.js) so the audio
// path doesn't block the post-call drip.
import { SUPA_URL, SERVICE, cors } from "./agent/_lib.js";

export const config = { runtime: "edge" };

async function verifyTwilio(url, params, sig, authToken) {
  if (!authToken) return true;
  if (!sig) return false;
  let data = url;
  const keys = Array.from(params.keys()).sort();
  for (const k of keys) data += k + (params.get(k) || "");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const out = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(out)));
  return b64 === sig;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const ct = req.headers.get("content-type") || "";
  const text = await req.text();
  let p;
  if (ct.includes("application/x-www-form-urlencoded")) {
    p = new URLSearchParams(text);
  } else {
    try { p = new URLSearchParams(Object.entries(JSON.parse(text))); }
    catch { return new Response(JSON.stringify({ error: "bad body" }), { status: 400, headers: cors() }); }
  }

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host  = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const url   = `${proto}://${host}${new URL(req.url).pathname}`;
  const sig   = req.headers.get("x-twilio-signature");
  const ok    = await verifyTwilio(url, p, sig, process.env.TWILIO_AUTH_TOKEN);
  if (!ok) return new Response("bad signature", { status: 401 });

  const callSid   = p.get("CallSid") || "";
  const status    = p.get("CallStatus") || "";
  const duration  = parseInt(p.get("CallDuration") || "0", 10);
  const direction = p.get("Direction") || "";
  const to        = p.get("To") || "";
  const fromNum   = p.get("From") || "";

  // Act on TERMINAL events only — Twilio sends many status events per call.
  // We persist a call_events row for every terminal outcome (so the web
  // power-dialer can auto-advance on no-answer/busy/failed, not just on a
  // completed conversation); automation_fire below still keys off duration.
  const TERMINAL = new Set(["completed", "no-answer", "busy", "failed", "canceled"]);
  if (!callSid || !TERMINAL.has(status)) {
    return new Response("ok", { status: 200 });
  }

  // Look up the lead by phone match (E.164). pipeline.phone is normalised
  // server-side; we accept loose match via like.
  const target = direction.startsWith("outbound") ? to : fromNum;
  let lead = null;
  if (target) {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/pipeline?select=id,owner_rep_id,agency_id,phone&phone=eq.${encodeURIComponent(target)}&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      lead = rows[0] || null;
    }
  }
  let initialEvent = null;
  if (callSid) {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/call_events?select=rep_id,agency_id,lead_id&call_sid=eq.${encodeURIComponent(callSid)}&order=created_at.asc&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    ).catch(() => null);
    if (r?.ok) {
      const rows = await r.json().catch(() => []);
      initialEvent = rows[0] || null;
    }
  }
  const repId = lead?.owner_rep_id || initialEvent?.rep_id || null;
  const agencyId = lead?.agency_id || initialEvent?.agency_id || null;
  const leadId = lead?.id || initialEvent?.lead_id || null;

  // Persist the call event (best-effort)
  await fetch(`${SUPA_URL}/rest/v1/call_events`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      call_sid: callSid, status, duration_sec: duration, direction,
      to_number: to, from_number: fromNum,
      lead_id: leadId, agency_id: agencyId, rep_id: repId,
    }),
  }).catch(() => {});

  if (lead && repId && agencyId && duration > 0) {
    // Fire automation_rules: call_completed
    await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        p_agency_id: agencyId,
        p_trigger: "call_completed",
        p_rep_id: repId,
        p_context: {
          lead_id: leadId, call_sid: callSid, duration_sec: duration,
          direction, to_number: to, from_number: fromNum,
        },
      }),
    }).catch(() => {});
  } else if (lead && agencyId && duration === 0) {
    // Missed-call / no-answer triggers
    await fetch(`${SUPA_URL}/rest/v1/rpc/automation_fire`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        p_agency_id: agencyId,
        p_trigger: "call_missed",
        p_rep_id: repId,
        p_context: { lead_id: leadId, call_sid: callSid, direction, to_number: to, from_number: fromNum },
      }),
    }).catch(() => {});
  }

  return new Response("ok", { status: 200 });
}
