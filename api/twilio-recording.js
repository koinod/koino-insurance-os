// /api/twilio-recording — webhook from Twilio when a recorded call finishes.
// Writes a vault_artifacts row (kind=Recording, retention=10y) so SOA / TPMO
// audit trails populate automatically.

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

  // Best-effort write to vault. Uses anon key under RLS — in single-tenant
  // production the operator's service role key would land here via env.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
  try {
    await fetch(`${SUPA_URL}/rest/v1/vault_artifacts`, {
      method: "POST",
      headers: { "apikey": anon, "authorization": `Bearer ${anon}`, "content-type": "application/json", "prefer": "return=minimal" },
      body: JSON.stringify({
        kind: "Recording",
        lead_name: `[Twilio call ${to}]`,
        retention: "10y",
        status: "complete",
        artifact_url: recording_url,
        metadata: { recording_sid, call_sid, duration_sec }
      })
    });
  } catch (_e) {}

  return new Response("ok", { status: 200 });
}
