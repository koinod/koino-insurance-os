// /api/twilio-recording — webhook from Twilio when a recorded call finishes.
// Writes a vault_artifacts row (kind=Recording, retention=10y) so SOA / TPMO
// audit trails populate automatically. If OPENAI_API_KEY is set, also fires
// a fire-and-forget transcription job that updates the same row when done.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const text = await req.text();
  const p = new URLSearchParams(text);

  const recording_url = p.get("RecordingUrl") || "";
  const recording_sid = p.get("RecordingSid") || "";
  const call_sid      = p.get("CallSid") || "";
  const duration_sec  = parseInt(p.get("RecordingDuration") || "0", 10);
  const to            = p.get("To") || "";

  // Extract query parameters forwarded from Twilio TwiML bridge
  const urlObj = new URL(req.url, "http://localhost");
  const agency_id = urlObj.searchParams.get("agency_id") || null;
  const rep_id = urlObj.searchParams.get("rep_id") || null;
  const lead_id = urlObj.searchParams.get("lead_id") || null;

  // Use service role key to bypass RLS
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
  
  let artifactId = null;
  const metadata = { recording_sid, call_sid, duration_sec, transcribe_status: "pending" };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/vault_artifacts?select=id`, {
      method: "POST",
      headers: { "apikey": serviceKey, "authorization": `Bearer ${serviceKey}`, "content-type": "application/json", "prefer": "return=representation" },
      body: JSON.stringify({
        kind: "Recording",
        lead_name: `[Twilio call ${to}]`,
        retention: "10y",
        status: "complete",
        artifact_url: recording_url,
        metadata,
        ...(agency_id ? { agency_id } : {}),
        ...(rep_id ? { rep_id } : {}),
        ...(lead_id ? { pipeline_id: lead_id } : {}),
      })
    });
    const rows = await r.json().catch(() => []);
    artifactId = rows?.[0]?.id || null;
  } catch (e) { console.warn("[twilio-recording.artifactCreate]", e); }

  // Fire transcription async (don't block Twilio's webhook on Whisper latency).
  // EdgeRuntime exposes waitUntil via req when available; fall back to a detached fetch.
  if (process.env.OPENAI_API_KEY && recording_url) {
    // Edge runtime requires absolute URLs for fetch — derive from the inbound
    // request URL so the transcribe call works on prod, preview, AND localhost.
    const origin = (() => { try { return new URL(req.url).origin; } catch { return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""; } })();
    const job = transcribeAndPersist({ recording_url, artifactId, serviceKey, origin, metadata });
    if (typeof req.waitUntil === "function") req.waitUntil(job);
    // else: detached promise — Vercel edge will let it run for a few seconds
  }

  return new Response("ok", { status: 200 });
}

async function transcribeAndPersist({ recording_url, artifactId, serviceKey, origin, metadata }) {
  try {
    // Twilio recording URLs need basic auth — pass account SID + auth token
    const sid = process.env.TWILIO_ACCOUNT_SID || "";
    const tok = process.env.TWILIO_AUTH_TOKEN || "";
    const r = await fetch(`${origin || ""}/api/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: recording_url,
        basic_auth: sid && tok ? `${sid}:${tok}` : null,
        language: "en",
        prompt: "Insurance sales call. Names, products: Medicare Supplement Plan G, Plan N, Final Expense, IUL, Annuity, TPMO, SOA.",
      }),
    });
    if (!r.ok) return;
    const j = await r.json();
    if (artifactId) {
      const mergedMetadata = {
        ...metadata,
        transcribe_status: "complete",
        transcript: j.text,
        segments: j.segments
      };
      await fetch(`${SUPA_URL}/rest/v1/vault_artifacts?id=eq.${artifactId}`, {
        method: "PATCH",
        headers: { "apikey": serviceKey, "authorization": `Bearer ${serviceKey}`, "content-type": "application/json", "prefer": "return=minimal" },
        body: JSON.stringify({
          metadata: mergedMetadata,
        }),
      });
    }
  } catch (e) { console.warn("[twilio-recording.transcribeAndPersist]", e); }
}
