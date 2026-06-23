// GET|POST /api/twilio/twiml-bridge
// TwiML endpoint Twilio hits when the outbound leg is answered (lead picks up).
// Bridges them to the rep's physical phone. Both legs are recorded when enabled.
//
// This is hit by Twilio after /api/dial/outbound places the call with
// Url=.../api/twilio/twiml-bridge?rep_phone=...&caller_id=...
//
// If DEEPGRAM_API_KEY is set, also starts a MediaStream so
// /api/twilio/media-stream can relay audio for live transcription.

export const config = { runtime: "edge" };

function escapeXml(s) {
  return String(s || "").replace(/[<>&"']/g,
    c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
}

export default async function handler(req) {
  const url = new URL(req.url);
  const rep_phone = url.searchParams.get("rep_phone") || "";
  const caller_id = url.searchParams.get("caller_id") || process.env.TWILIO_CALLER_ID || "";
  const agency_id = url.searchParams.get("agency_id") || "";
  const rep_id    = url.searchParams.get("rep_id") || "";
  const lead_id   = url.searchParams.get("lead_id") || "";

  const proto   = req.headers.get("x-forwarded-proto") || "https";
  const host    = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const baseUrl = `${proto}://${host}`;

  if (!rep_phone) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">The call could not be connected. No rep phone number is configured. Please contact your administrator.</Say>
</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const record        = (process.env.TWILIO_RECORD || "true") === "true";
  const hasDeepgram   = !!process.env.DEEPGRAM_API_KEY;

  let streamUrl = `wss://${host}/api/twilio/media-stream`;
  if (agency_id) {
    streamUrl += `?agency_id=${encodeURIComponent(agency_id)}`;
  }

  let callbackUrl = `${baseUrl}/api/twilio-recording`;
  const params = [];
  if (agency_id) params.push(`agency_id=${encodeURIComponent(agency_id)}`);
  if (rep_id) params.push(`rep_id=${encodeURIComponent(rep_id)}`);
  if (lead_id) params.push(`lead_id=${encodeURIComponent(lead_id)}`);
  if (params.length > 0) {
    callbackUrl += `?${params.join("&")}`;
  }

  // Build TwiML. Stream block first (fires immediately on answer), then Dial.
  const recordAttrs = record
    ? ` record="record-from-answer-dual" recordingStatusCallback="${escapeXml(callbackUrl)}"`
    : "";

  let twiml;
  if (hasDeepgram) {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="${escapeXml(streamUrl)}"/>
  </Start>
  <Dial callerId="${escapeXml(caller_id)}" answerOnBridge="true"${recordAttrs} timeout="30">
    <Number>${escapeXml(rep_phone)}</Number>
  </Dial>
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(caller_id)}" answerOnBridge="true"${recordAttrs} timeout="30">
    <Number>${escapeXml(rep_phone)}</Number>
  </Dial>
</Response>`;
  }

  return new Response(twiml, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
  });
}
