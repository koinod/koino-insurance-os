// /api/twilio-twiml — outbound TwiML endpoint for the Voice SDK softphone.
// Twilio hits this URL when the browser device.connect({ params: { To: ... }})
// fires; we respond with TwiML that tells Twilio to bridge to that number,
// using the operator's verified caller ID.

export const config = { runtime: "edge" };

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
}

export default async function handler(req) {
  // Twilio POSTs application/x-www-form-urlencoded
  let to = "";
  let leadName = "";
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      to = body.To || body.to || "";
      leadName = body.leadName || "";
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      to = params.get("To") || params.get("to") || "";
      leadName = params.get("leadName") || "";
    }
  } else {
    const url = new URL(req.url);
    to = url.searchParams.get("To") || url.searchParams.get("to") || "";
    leadName = url.searchParams.get("leadName") || "";
  }

  const callerId = process.env.TWILIO_CALLER_ID || "";
  const recordEnabled = (process.env.TWILIO_RECORD || "true") === "true";

  let twiml;
  if (!to || !callerId) {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${!callerId
    ? "Twilio caller ID not configured. Set TWILIO_CALLER_ID on the Vercel project."
    : "Missing destination number."}</Say>
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}" answerOnBridge="true"${recordEnabled ? ' record="record-from-answer-dual" recordingStatusCallback="/api/twilio-recording"' : ''} timeout="25">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;
  }

  return new Response(twiml, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" }
  });
}
