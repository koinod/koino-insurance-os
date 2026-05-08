// /api/transcribe — speech-to-text for call recordings + live audio chunks.
//
// Two modes:
//   POST { audio_url } → fetch URL, transcribe → { text, segments }.
//   POST multipart/form-data with `file` → direct upload (live mic chunks).
//
// Two-tier backend (resilient to either provider being down/unconfigured):
//   1. PRIMARY: OpenAI Whisper (whisper-1 / gpt-4o-transcribe). Industry-best
//      latency + accuracy. Needs OPENAI_API_KEY.
//   2. FALLBACK: Google Gemini 2.0 Flash audio inputs. Free tier covers most
//      transcription budgets. Needs GEMINI_API_KEY.
//   3. If neither key is set, returns a structured 503 with which env var
//      to set (matches the twilio-sms / nipr-verify pattern).

export const config = { runtime: "edge" };

const MAX_BYTES = 25 * 1024 * 1024;

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!OPENAI_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({
      error: "transcribe_not_configured",
      detail: "Set OPENAI_API_KEY (preferred) or GEMINI_API_KEY (fallback) in Vercel project env.",
      missing: ["OPENAI_API_KEY", "GEMINI_API_KEY"],
    }), { status: 503, headers: { "content-type": "application/json" } });
  }

  const ct = req.headers.get("content-type") || "";

  // ── Path A: { audio_url } JSON ─────────────────────────────────────────
  if (ct.includes("application/json")) {
    let body;
    try { body = await req.json(); } catch { body = {}; }
    const url = String(body.audio_url || body.url || "").trim();
    const auth = body.basic_auth || null;
    const language = body.language || "en";
    const prompt = body.prompt || "";
    const filename = body.filename || "audio.mp3";
    const mime = body.mime || "audio/mpeg";
    if (!url) {
      return new Response(JSON.stringify({ error: "missing_audio_url" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    const headers = {};
    if (auth) headers["authorization"] = "Basic " + btoa(auth);
    const fetchUrl = body.passthrough_url ? url : (url.includes("?") ? `${url}&download=true` : `${url}.mp3`);
    const audioR = await fetch(fetchUrl, { headers });
    if (!audioR.ok) {
      return new Response(JSON.stringify({ error: "audio_fetch_failed", status: audioR.status, url: fetchUrl }),
        { status: 502, headers: { "content-type": "application/json" } });
    }
    const blob = await audioR.blob();
    if (blob.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "audio_too_large", max_bytes: MAX_BYTES, got: blob.size }),
        { status: 413, headers: { "content-type": "application/json" } });
    }
    return await transcribe(blob, filename, mime, { language, prompt, OPENAI_KEY, GEMINI_KEY });
  }

  // ── Path B: multipart `file` upload ────────────────────────────────────
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "missing_file_field" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "audio_too_large", max_bytes: MAX_BYTES, got: file.size }),
        { status: 413, headers: { "content-type": "application/json" } });
    }
    const language = form.get("language") || "en";
    const prompt   = form.get("prompt")   || "";
    return await transcribe(file, file.name || "chunk.webm", file.type || "audio/webm", { language, prompt, OPENAI_KEY, GEMINI_KEY });
  }

  return new Response(JSON.stringify({ error: "unsupported_content_type", got: ct }), {
    status: 415, headers: { "content-type": "application/json" },
  });
}

// Try OpenAI first (better diarization + segments); on failure, fall through
// to Gemini. Always returns the same response shape so the client doesn't
// branch on provider.
async function transcribe(blob, filename, mime, { language, prompt, OPENAI_KEY, GEMINI_KEY }) {
  let openaiErr = null;
  if (OPENAI_KEY) {
    try {
      return await whisperTranscribe(blob, filename, { language, prompt, key: OPENAI_KEY });
    } catch (e) { openaiErr = e; /* fall through to Gemini */ }
  }
  if (GEMINI_KEY) {
    try {
      return await geminiTranscribe(blob, filename, mime, { language, prompt, key: GEMINI_KEY });
    } catch (e) {
      return new Response(JSON.stringify({
        error: "all_backends_failed",
        openai: openaiErr?.message || (OPENAI_KEY ? "unknown" : "no_key"),
        gemini: e?.message || "unknown",
      }), { status: 502, headers: { "content-type": "application/json" } });
    }
  }
  // Should be unreachable since handler() guards both keys, but be explicit.
  return new Response(JSON.stringify({ error: "no_backend", openai: openaiErr?.message }), {
    status: 502, headers: { "content-type": "application/json" },
  });
}

async function whisperTranscribe(fileLike, filename, { language, prompt, key }) {
  const fd = new FormData();
  fd.append("file", fileLike, filename);
  fd.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
  fd.append("response_format", "verbose_json");
  if (language) fd.append("language", language);
  if (prompt)   fd.append("prompt",   prompt);
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "authorization": "Bearer " + key },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || j.error || "transcription failed";
    throw new Error(`openai ${r.status}: ${msg}`);
  }
  return new Response(JSON.stringify({
    ok: true, provider: "openai",
    text: j.text || "",
    duration: j.duration ?? null,
    language: j.language ?? language,
    segments: j.segments || [],
  }), { headers: { "content-type": "application/json" } });
}

// Gemini 2.0 Flash supports audio input natively via the inline_data part of
// generateContent. We base64-encode the blob, send it, ask for verbatim
// transcription. No segments (Gemini doesn't return them) — we synthesize a
// single-segment span so the client shape matches.
async function geminiTranscribe(blob, filename, mime, { language, prompt, key }) {
  const arrayBuf = await blob.arrayBuffer();
  // Edge runtime has Buffer-less base64 — manually encode
  const b64 = arrayBufToBase64(arrayBuf);

  const userPrompt =
    `Transcribe this call recording verbatim. Output ONLY the transcript text — no preamble, no commentary, no markdown. ` +
    `Language: ${language}.${prompt ? ` Context: ${prompt}.` : ""} ` +
    `Speakers: identify them as "Rep:" and "Lead:" if you can distinguish. Otherwise just transcribe linearly.`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: userPrompt },
        { inline_data: { mime_type: mime || "audio/webm", data: b64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || "transcription failed";
    throw new Error(`gemini ${r.status}: ${msg}`);
  }
  const text = (j.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || "")
    .join("")
    .trim();
  return new Response(JSON.stringify({
    ok: true, provider: "gemini",
    text,
    duration: null,
    language,
    segments: text ? [{ start: 0, end: 0, text }] : [],
  }), { headers: { "content-type": "application/json" } });
}

function arrayBufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
