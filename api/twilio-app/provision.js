// /api/twilio-app/provision — auto-creates a TwiML app pointed at our /api/twilio-twiml
// so the operator never has to manually create one in the Twilio console. Returns
// the new TwiML app SID for the client to save into connections.config.
//
// Uses the operator's TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET
// (HTTP Basic auth against the Twilio REST API).

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySec = process.env.TWILIO_API_KEY_SECRET;
  if (!sid || !keySid || !keySec) {
    return new Response(JSON.stringify({
      error: "twilio_not_configured",
      detail: "Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET first.",
      missing: [
        !sid    ? "TWILIO_ACCOUNT_SID"    : null,
        !keySid ? "TWILIO_API_KEY_SID"    : null,
        !keySec ? "TWILIO_API_KEY_SECRET" : null,
      ].filter(Boolean)
    }), { status: 503, headers: { "content-type": "application/json" }});
  }

  const origin = new URL(req.url).origin;
  const voiceUrl = `${origin}/api/twilio-twiml`;

  const auth = "Basic " + btoa(`${keySid}:${keySec}`);
  const form = new URLSearchParams();
  form.set("FriendlyName", "Repflow Voice");
  form.set("VoiceUrl", voiceUrl);
  form.set("VoiceMethod", "POST");

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Applications.json`, {
    method: "POST",
    headers: { "authorization": auth, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!r.ok) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: "provision_failed", detail }), { status: r.status, headers: { "content-type": "application/json" }});
  }
  const j = await r.json();
  return new Response(JSON.stringify({ twiml_app_sid: j.sid, voice_url: voiceUrl, friendly_name: j.friendly_name }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
