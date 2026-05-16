// /api/connector/fathom-test — connectivity probe for the Fathom connector.
//
// Fathom AI summarizes Zoom/Teams/Meet calls. We're NOT using it as the
// primary transcript provider right now (Gemini + Whisper handle that), but
// agencies that already use Fathom should be able to ingest its outputs into
// Repflow's call_recordings + AI summary fields.
//
// This endpoint accepts { api_key } and verifies it can list teams via
// Fathom's REST API. Wire to:
//   POST /api/connector/fathom-test  { api_key: "..." }
//   → { ok: true, teams: [...] }   on success
//   → 4xx with { error, detail }    on bad key / bad payload

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  body = body || {};
  if (typeof body.api_key !== "string" || body.api_key.length === 0 || body.api_key.length > 512) {
    return new Response(JSON.stringify({ error: "missing_api_key", detail: "Pass { api_key } as a non-empty string ≤ 512 chars." }),
      { status: 400, headers: { "content-type": "application/json" } });
  }
  const key = body.api_key.trim();

  // Fathom API base — public docs at developers.fathom.video. Read-only
  // probe: list teams the key has access to.
  const r = await fetch("https://api.fathom.video/external/v1/teams", {
    method: "GET",
    headers: { "x-api-key": key, "accept": "application/json" },
  });
  if (r.status === 401 || r.status === 403) {
    return new Response(JSON.stringify({ error: "unauthorized", status: r.status, detail: "Invalid Fathom API key." }),
      { status: 401, headers: { "content-type": "application/json" } });
  }
  if (!r.ok) {
    let detail = "";
    try { detail = await r.text(); } catch {}
    return new Response(JSON.stringify({ error: "fathom_error", status: r.status, detail: detail.slice(0, 400) }),
      { status: 502, headers: { "content-type": "application/json" } });
  }
  const teams = await r.json().catch(() => []);
  return new Response(JSON.stringify({ ok: true, teams: Array.isArray(teams) ? teams : (teams.data || []) }),
    { headers: { "content-type": "application/json" } });
}
