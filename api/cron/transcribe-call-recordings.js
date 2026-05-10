// /api/cron/transcribe-call-recordings — sweep call_recordings rows where
// transcript_url is null, generate a transcript via /api/transcribe, store
// the text inline (transcript_url stays null until we add a separate
// transcripts bucket; for now the text lives on the row).
//
// Runs from vercel.json crons. Safe to invoke manually for backfills:
//   curl -X POST https://koino-insurance-os.vercel.app/api/cron/transcribe-call-recordings
//
// Idempotent: only picks rows where transcript_text IS NULL.

export const config = { runtime: "edge" };

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://jfphwmzwteermalzwojp.supabase.co";
// Service role bypasses RLS — required to read across all agencies + write
// transcript_text. Set on Vercel: SUPABASE_SERVICE_ROLE_KEY.
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE   = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
const BATCH_LIMIT   = parseInt(process.env.TRANSCRIBE_BATCH || "5", 10);

export default async function handler(req) {
  // Vercel cron is a GET; manual triggers are POST. Accept both.
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({
      error: "service_role_not_configured",
      detail: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel project env so the worker can read across all agencies.",
    }), { status: 503, headers: { "content-type": "application/json" } });
  }

  const sbHeaders = {
    "apikey": SERVICE_KEY,
    "authorization": `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
  };

  // 1) Pick a batch of un-transcribed recordings (oldest first)
  const listUrl = `${SUPABASE_URL}/rest/v1/call_recordings?transcript_url=is.null&audio_path=not.is.null&order=started_at.asc&limit=${BATCH_LIMIT}`;
  const listR = await fetch(listUrl, { headers: sbHeaders });
  if (!listR.ok) {
    return new Response(JSON.stringify({ error: "list_failed", status: listR.status }),
      { status: 502, headers: { "content-type": "application/json" } });
  }
  const rows = await listR.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, note: "nothing_to_transcribe" }),
      { headers: { "content-type": "application/json" } });
  }

  const results = [];
  for (const row of rows) {
    try {
      // 2) Generate a signed URL for the audio file (private bucket)
      const signR = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/call-recordings/${encodeURIComponent(row.audio_path)}`, {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({ expiresIn: 600 }),
      });
      const signJ = await signR.json().catch(() => ({}));
      if (!signR.ok || !signJ.signedURL) {
        results.push({ id: row.id, error: `sign_failed: ${signR.status}` });
        continue;
      }
      const signedUrl = `${SUPABASE_URL}/storage/v1${signJ.signedURL}`;

      // 3) Hit /api/transcribe with the signed URL
      const txR = await fetch(new URL("/api/transcribe", req.url).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audio_url: signedUrl,
          passthrough_url: true,
          mime: row.audio_mime || "audio/webm",
          filename: row.audio_path.split("/").pop(),
          language: "en",
          prompt: "Insurance sales call between an insurance producer (rep) and a senior shopper (lead). Common terms: Med Supp, Plan G, Plan N, Final Expense, AEP, MAPD, NIGO, premium, AP, carrier names (UnitedHealthcare, Humana, Aetna, Cigna, Mutual of Omaha).",
        }),
      });
      const txJ = await txR.json().catch(() => ({}));
      if (!txR.ok || !txJ.ok) {
        results.push({ id: row.id, error: txJ.error || `transcribe_${txR.status}` });
        continue;
      }

      // 4) Write transcript text back to the row.
      const updR = await fetch(`${SUPABASE_URL}/rest/v1/call_recordings?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { ...sbHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({
          // We don't have a separate transcripts bucket yet; stash in
          // notes||audio_excerpt-style. Use a dedicated transcript_url with
          // a "data:text/plain;base64,..." prefix so the UI can render it
          // without an extra storage hop.
          transcript_url: "data:text/plain;base64," + arrayBufToBase64(new TextEncoder().encode(txJ.text || "")),
        }),
      });
      if (!updR.ok) {
        results.push({ id: row.id, error: `update_failed_${updR.status}` });
        continue;
      }
      results.push({ id: row.id, provider: txJ.provider, chars: (txJ.text || "").length });
    } catch (e) {
      results.push({ id: row.id, error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: results.length,
    results,
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
