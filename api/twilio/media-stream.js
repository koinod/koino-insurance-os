// /api/twilio/media-stream — Twilio MediaStream WebSocket relay to Deepgram.
//
// ⚠  LIMITATION: Vercel Serverless Functions are single-request/response with
//    a 10–60 second max execution window. Twilio MediaStream keeps a WebSocket
//    open for the full call duration. This endpoint works on Vercel Pro for
//    calls under ~55s; for longer calls it must run on a persistent host
//    (Fly.io, Railway, a VPS, etc.).
//
//    Deploy path: set MEDIA_STREAM_HOST=wss://your-persistent-host in Vercel
//    env and update the twiml-bridge stream URL to use that host instead.
//
// When DEEPGRAM_API_KEY is not set: logs a warning and returns 503. The
// twiml-bridge skips the <Stream> directive entirely when DEEPGRAM_API_KEY is
// absent, so Twilio won't attempt to connect here.
//
// When DEEPGRAM_API_KEY is set: upgrades to WebSocket, receives Twilio mulaw
// audio, forwards to Deepgram Streaming ASR, inserts final utterances into
// live_transcript_segments via Supabase service role.

import { SUPA_URL, SERVICE } from "../agent/_lib.js";

export const config = { runtime: "nodejs" };  // needs Node.js for WebSocket upgrade

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

export default async function handler(req, res) {
  if (!DEEPGRAM_KEY) {
    console.warn("[media-stream] DEEPGRAM_API_KEY not set — streaming transcription disabled");
    res.status(503).json({
      error: "deepgram_not_configured",
      message: "Set DEEPGRAM_API_KEY in Vercel env to enable live transcription.",
      missing: ["DEEPGRAM_API_KEY"],
    });
    return;
  }

  // Verify this is a WebSocket upgrade request
  if (req.headers.upgrade !== "websocket") {
    res.status(400).json({
      error: "websocket_required",
      message: "This endpoint accepts Twilio MediaStream WebSocket connections only.",
    });
    return;
  }

  // Upgrade the HTTP connection to a WebSocket.
  // In Vercel's Node.js runtime, socket upgrade is available via res.socket.
  const socket = res.socket;
  if (!socket) {
    res.status(500).json({ error: "no_socket" });
    return;
  }

  // Perform the WebSocket handshake manually (no `ws` dependency).
  const key    = req.headers["sec-websocket-key"] || "";
  const accept = await computeWsAccept(key);
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  res.end();  // hand off to raw socket

  let callSid = null;
  let dgWs    = null;
  let buffer  = Buffer.alloc(0);

  // Connect to Deepgram Streaming ASR
  const DG_URL =
    "wss://api.deepgram.com/v1/listen" +
    "?model=nova-2-phonecall&encoding=mulaw&sample_rate=8000" +
    "&channels=1&diarize=true&interim_results=true&utterance_end_ms=1000";

  try {
    dgWs = new WebSocket(DG_URL, { headers: { authorization: `Token ${DEEPGRAM_KEY}` } });
  } catch (e) {
    console.error("[media-stream] Deepgram connect failed:", e.message);
    socket.destroy();
    return;
  }

  dgWs.on("message", async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const alt = msg?.channel?.alternatives?.[0];
    if (!alt?.transcript || alt.transcript.trim() === "") return;

    // Derive speaker: Deepgram diarize assigns word-level speaker integers
    const words   = alt.words || [];
    const speaker = words[0]?.speaker === 0 ? "rep" : words[0]?.speaker === 1 ? "lead" : "unknown";

    if (SERVICE && callSid) {
      await fetch(`${SUPA_URL}/rest/v1/live_transcript_segments`, {
        method:  "POST",
        headers: {
          apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
          "content-type": "application/json", prefer: "return=minimal",
        },
        body: JSON.stringify({
          call_sid:    callSid,
          speaker,
          text:        alt.transcript.trim(),
          is_final:    msg.is_final || false,
          ts_offset_ms: words[0]?.start != null ? Math.round(words[0].start * 1000) : null,
        }),
      }).catch((e) => console.warn("[media-stream] segment insert failed:", e.message));
    }
  });

  dgWs.on("error", (e) => console.warn("[media-stream] Deepgram ws error:", e.message));

  // ── Twilio WebSocket frame parser ─────────────────────────────────────────
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const firstByte  = buffer[0];
      const secondByte = buffer[1];
      const masked     = (secondByte & 0x80) !== 0;
      let payloadLen   = secondByte & 0x7f;
      let offset       = 2;
      if (payloadLen === 126) { if (buffer.length < 4) break; payloadLen = buffer.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (buffer.length < 10) break; payloadLen = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + payloadLen) break;
      const mask     = masked ? buffer.slice(offset, offset + 4) : null;
      let payload    = buffer.slice(offset + maskLen, offset + maskLen + payloadLen);
      if (masked) { for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
      buffer = buffer.slice(offset + maskLen + payloadLen);

      const opcode = firstByte & 0x0f;
      if (opcode === 0x8) { dgWs?.close(); socket.end(); return; }
      if (opcode === 0x1 || opcode === 0x0) {
        // Text frame — Twilio sends JSON events
        let ev;
        try { ev = JSON.parse(payload.toString()); } catch { continue; }
        if (ev.event === "start") {
          callSid = ev.start?.callSid || ev.streamSid || null;
        } else if (ev.event === "media" && ev.media?.payload && dgWs?.readyState === 1) {
          const mulaw = Buffer.from(ev.media.payload, "base64");
          dgWs.send(mulaw);
        }
      }
    }
  });

  socket.on("end",   () => { dgWs?.close(); });
  socket.on("error", (e) => { console.warn("[media-stream] socket error:", e.message); dgWs?.close(); });
}

// WebSocket handshake accept key per RFC 6455
async function computeWsAccept(key) {
  const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  const combined = key + GUID;
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-1", enc.encode(combined));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}
