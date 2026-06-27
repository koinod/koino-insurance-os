// api/screenshare-token.js — Mint LiveKit capability JWT for screenshare presenters and viewers.
// Runs on Vercel Edge Runtime for maximum performance.

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

async function buildLiveKitJwt({ apiKey, apiSecret, room, identity, name, canPublish, canSubscribe }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 4 * 60 * 60; // 4 hours
  const header = { typ: "JWT", alg: "HS256" };
  const payload = {
    iss: apiKey,
    sub: identity,
    name: name,
    iat: now,
    exp: now + ttl,
    nbf: now,
    jti: `${apiKey}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    video: {
      roomJoin: true,
      room,
      canPublish,
      canSubscribe,
      canPublishData: canPublish,
    }
  };
  const headerEnc  = b64url(JSON.stringify(header));
  const payloadEnc = b64url(JSON.stringify(payload));
  const signed     = await sign(`${headerEnc}.${payloadEnc}`, apiSecret);
  return `${headerEnc}.${payloadEnc}.${signed}`;
}

export default async function handler(req) {
  const corsHeaders = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Parse params from GET or POST query/body
  const url = new URL(req.url);
  let session = url.searchParams.get("session") || url.searchParams.get("s");
  let role = url.searchParams.get("role");

  if (req.method === "POST") {
    try {
      const body = await req.json();
      session = session || body.session || body.s;
      role = role || body.role;
    } catch (_) {}
  }

  session = String(session || "").trim();
  role = String(role || "viewer").trim(); // default to viewer

  if (!session) {
    return new Response(JSON.stringify({ error: "missing_session" }), { status: 400, headers: corsHeaders });
  }

  const roomName = `screenshare-${session}`;
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
  const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

  const isPresenter = role === "presenter";
  const identity = isPresenter
    ? "presenter"
    : `viewer-${Math.random().toString(36).slice(2, 8)}`;
  const name = isPresenter ? "Presenter" : "Viewer";

  try {
    const token = await buildLiveKitJwt({
      apiKey,
      apiSecret,
      room: roomName,
      identity,
      name,
      canPublish: isPresenter,
      canSubscribe: true,
    });

    return new Response(JSON.stringify({
      token,
      url: livekitUrl,
      room: roomName,
      identity,
    }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "token_mint_failed", detail: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
