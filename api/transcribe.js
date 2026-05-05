// /api/transcribe — speech-to-text for call recordings + live audio chunks.
//
// Two modes:
//   POST { audio_url } → fetch the URL (Twilio recording, etc.), forward to
//     Whisper → return { text, segments }. Used by the post-call pipeline.
//   POST multipart/form-data with `file` → forwards directly. Used by the
//     in-browser live transcriber (5s mic chunks).
//
// Backend: OpenAI Whisper (whisper-1). Falls back to gpt-4o-transcribe if
// OPENAI_TRANSCRIBE_MODEL is set. Graceful 503 with structured body when
// OPENAI_API_KEY isn't configured — same pattern as twilio-sms.
//
// CORS allowed for the same-origin frontend; cap upload at 25 MB (OpenAI limit).

export const config = { runtime: "edge" };

const MAX_BYTES = 25 * 1024 * 1024;

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const KEY   = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  if (!KEY) {
    return new Response(JSON.stringify({
      error: "transcribe_not_configured",
      detail: "Set OPENAI_API_KEY in Vercel project env, then redeploy.",
      missing: ["OPENAI_API_KEY"],
    }), { status: 503, headers: { "content-type": "application/json" } });
  }

  const ct = req.headers.get("content-type") || "";

  // ── Path A: { audio_url } JSON — pull-from-URL (Twilio recording webhook) ──
  if (ct.includes("application/json")) {
    let body;
    try { body = await req.json(); } catch { body = {}; }
    const url = String(body.audio_url || body.url || "").trim();
    const auth = body.basic_auth || null;        // "user:pass" if URL needs Twilio basic auth
    const language = body.language || "en";
    const prompt = body.prompt || "";
    if (!url) {
      return new Response(JSON.stringify({ error: "missing_audio_url" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const headers = {};
    if (auth) headers["authorization"] = "Basic " + btoa(auth);
    const fetchUrl = url.includes("?") ? `${url}&download=true` : `${url}.mp3`;
    const audioR = await fetch(fetchUrl, { headers });
    if (!audioR.ok) {
      return new Response(JSON.stringify({
        error: "audio_fetch_failed", status: audioR.status, url: fetchUrl,
      }), { status: 502, headers: { "content-type": "application/json" } });
    }
    const blob = await audioR.blob();
    if (blob.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "audio_too_large", max_bytes: MAX_BYTES, got: blob.size }), {
        status: 413, headers: { "content-type": "application/json" },
      });
    }
    return await whisperTranscribe(blob, "audio.mp3", { model: MODEL, language, prompt, key: KEY });
  }

  // ── Path B: multipart with `file` — direct upload (live mic chunks) ──
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "missing_file_field" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "audio_too_large", max_bytes: MAX_BYTES, got: file.size }), {
        status: 413, headers: { "content-type": "application/json" },
      });
    }
    const language = form.get("language") || "en";
    const prompt   = form.get("prompt")   || "";
    return await whisperTranscribe(file, file.name || "chunk.webm", { model: MODEL, language, prompt, key: KEY });
  }

  return new Response(JSON.stringify({ error: "unsupported_content_type", got: ct }), {
    status: 415, headers: { "content-type": "application/json" },
  });
}

async function whisperTranscribe(fileLike, filename, { model, language, prompt, key }) {
  const fd = new FormData();
  // Whisper expects `file` + `model`
  fd.append("file", fileLike, filename);
  fd.append("model", model);
  fd.append("response_format", "verbose_json");   // returns segments + words for diarization-lite
  if (language) fd.append("language", language);
  if (prompt)   fd.append("prompt",   prompt);

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "authorization": "Bearer " + key },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({
      error: "openai_error", openai_status: r.status, openai_message: j.error?.message || j.error || "transcription failed",
    }), { status: r.status, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({
    ok: true,
    text: j.text || "",
    duration: j.duration ?? null,
    language: j.language ?? language,
    segments: j.segments || [],
  }), { headers: { "content-type": "application/json" } });
}
