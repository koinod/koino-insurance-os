// POST /api/call-recording-upload — receive a finished in-browser call
// recording and land it in the SAME pipeline the coaching engine already
// consumes.
//
// Why this exists (2026-06-14): recordings were broken because two data models
// never connected. api/twilio-recording.js writes `vault_artifacts`, but the
// coaching crons (transcribe-call-recordings, score-recent-calls) read
// `call_recordings` + the `call-recordings` storage bucket. Nothing wrote
// call_recordings, so scoring starved. The standalone recorder posts here; we
// upload to the bucket + insert the call_recordings row with service role, and
// the existing crons transcribe + score it — zero new backend scoring work.
//
// multipart/form-data fields:
//   file          — the audio blob (required)
//   lead_name     — optional label
//   lead_id       — optional pipeline uuid
//   duration_sec  — optional integer
//   channels      — 'mic' | 'mic+system' | 'system' (default 'mic')
//   mime          — audio mime (default audio/webm)
// Auth: caller's Supabase JWT in `x-supabase-auth: Bearer <jwt>` (or
// Authorization). We resolve rep_id + agency_id via public.me() so the row is
// owned correctly and RLS-visible to the rep.
import { SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt } from "./agent/_lib.js";

export const config = { runtime: "edge" };

const BUCKET = "call-recordings";
const MAX_BYTES = 60 * 1024 * 1024; // 60MB hard cap — a 30-min opus call is ~15MB

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });
  if (!SERVICE) return new Response(JSON.stringify({ error: "service_role_not_configured" }), { status: 503, headers: cors() });

  // Resolve the caller. The recording must belong to a real rep.
  const jwt = readUserJwt(req);
  const me = await loadCallerFromJwt(jwt);
  if (!me || !me.rep_id) {
    return new Response(JSON.stringify({ error: "unauthorized", detail: "no rep identity resolved from JWT" }), { status: 401, headers: cors() });
  }

  let form;
  try { form = await req.formData(); } catch { return new Response(JSON.stringify({ error: "expected multipart/form-data" }), { status: 400, headers: cors() }); }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return new Response(JSON.stringify({ error: "missing file" }), { status: 400, headers: cors() });
  }
  const bytes = file.size || 0;
  if (bytes === 0) return new Response(JSON.stringify({ error: "empty file" }), { status: 400, headers: cors() });
  if (bytes > MAX_BYTES) return new Response(JSON.stringify({ error: "file too large", max_bytes: MAX_BYTES }), { status: 413, headers: cors() });

  const mime = String(form.get("mime") || file.type || "audio/webm");
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
  const durationSec = parseInt(form.get("duration_sec") || "0", 10) || null;
  const channels = String(form.get("channels") || "mic");
  const leadName = (form.get("lead_name") ? String(form.get("lead_name")) : null);
  const leadId = (form.get("lead_id") ? String(form.get("lead_id")) : null);

  // Storage path: agency/rep/<uuid>.<ext> — scoped + collision-free.
  const id = crypto.randomUUID();
  const path = `${me.agency_id || "noagency"}/${me.rep_id}/${id}.${ext}`;

  // 1) Upload the audio to the call-recordings bucket (service role).
  const upR = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": mime, "x-upsert": "true" },
    // Buffer rather than stream: a ReadableStream body needs `duplex: 'half'`
    // and isn't reliable across edge/undici. 60MB cap keeps this memory-safe.
    body: await file.arrayBuffer(),
  });
  if (!upR.ok) {
    const detail = await upR.text().catch(() => "");
    return new Response(JSON.stringify({ error: "upload_failed", status: upR.status, detail: detail.slice(0, 300) }), { status: 502, headers: cors() });
  }

  // 2) Insert the call_recordings row. transcript_url stays null → the
  //    transcribe cron picks it up; score-recent-calls then coaches it.
  const nowIso = new Date().toISOString();
  const startedAt = durationSec ? new Date(Date.now() - durationSec * 1000).toISOString() : nowIso;
  const insR = await fetch(`${SUPA_URL}/rest/v1/call_recordings?select=id`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({
      id,
      rep_id: me.rep_id,
      agency_id: me.agency_id,
      lead_id: leadId,
      lead_name: leadName,
      started_at: startedAt,
      ended_at: nowIso,
      duration_sec: durationSec,
      audio_path: path,
      audio_bytes: bytes,
      audio_mime: mime,
      source: "recorder",
      channels,
    }),
  });
  if (!insR.ok) {
    const detail = await insR.text().catch(() => "");
    // Best-effort cleanup so we don't orphan a blob with no row.
    fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }).catch(() => {});
    return new Response(JSON.stringify({ error: "insert_failed", status: insR.status, detail: detail.slice(0, 300) }), { status: 502, headers: cors() });
  }

  return new Response(JSON.stringify({ ok: true, id, audio_path: path, bytes, duration_sec: durationSec }), { status: 200, headers: cors() });
}
