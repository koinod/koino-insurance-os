// /api/twilio-token — mints a Twilio Voice Capability JWT for the browser
// softphone. Returns 503 with a clear next-step when Twilio creds are not set,
// so the UI can show "Connect Twilio" rather than break.
//
// Required env vars (per agency, set on Vercel project):
//   TWILIO_ACCOUNT_SID
//   TWILIO_API_KEY_SID
//   TWILIO_API_KEY_SECRET
//   TWILIO_TWIML_APP_SID  (the TwiML app that handles the outbound dial)
//
// In multi-tenant production these would come from connections.config per
// agency_id, decoded server-side. This Edge fn does the standard JWT shape
// (HS256) so any Twilio Voice SDK ≥ 2.x will accept the token.

export const config = { runtime: "edge" };

const enc = new TextEncoder();
function b64url(input) {
  const bytes = typeof input === "string" ? enc.encode(input) : new Uint8Array(input);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function sign(content, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(content));
  return b64url(sig);
}

async function buildVoiceJwt({ accountSid, apiKeySid, apiKeySecret, appSid, identity }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 60 * 60; // 1 hour
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    sub: accountSid,
    iat: now,
    exp: now + ttl,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: appSid }
      }
    }
  };
  const headerEnc  = b64url(JSON.stringify(header));
  const payloadEnc = b64url(JSON.stringify(payload));
  const signed     = await sign(`${headerEnc}.${payloadEnc}`, apiKeySecret);
  return `${headerEnc}.${payloadEnc}.${signed}`;
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const accountSid    = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid     = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret  = process.env.TWILIO_API_KEY_SECRET;
  const appSid        = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !appSid) {
    return new Response(JSON.stringify({
      error: "twilio_not_configured",
      detail: "Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID on the Vercel project (Settings -> Environment Variables) to enable browser dialing.",
      missing: [
        !accountSid    ? "TWILIO_ACCOUNT_SID"    : null,
        !apiKeySid     ? "TWILIO_API_KEY_SID"    : null,
        !apiKeySecret  ? "TWILIO_API_KEY_SECRET" : null,
        !appSid        ? "TWILIO_TWIML_APP_SID"  : null,
      ].filter(Boolean)
    }), { status: 503, headers: { "content-type": "application/json" }});
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const identity = (body && body.identity) || "repflow-user-" + Math.random().toString(36).slice(2, 8);

  try {
    const token = await buildVoiceJwt({ accountSid, apiKeySid, apiKeySecret, appSid, identity });
    return new Response(JSON.stringify({ token, identity, expires_in: 3600 }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "mint_failed", detail: String(err) }), { status: 500, headers: { "content-type": "application/json" }});
  }
}
