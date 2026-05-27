// POST /api/agent/diagnostic-upload  body: { bundle, size_bytes, expires_at? }
// Bearer = x-agent-token — agent posts its own diagnostic bundle. Service-role
// is used for the insert because the agent token is the credential (no user JWT).
// Returns { diagnostic_id }.
import { cors, loadInstallByToken, readAgentToken, SUPA_URL, SERVICE } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

  if (body.bundle == null) {
    return new Response(JSON.stringify({ error: "bundle is required" }), { status: 400, headers: cors() });
  }
  if (typeof body.size_bytes !== "number" || body.size_bytes < 0) {
    return new Response(JSON.stringify({ error: "size_bytes must be a non-negative number" }), { status: 400, headers: cors() });
  }
  if (body.expires_at != null && typeof body.expires_at !== "string") {
    return new Response(JSON.stringify({ error: "expires_at must be an ISO-8601 string if provided" }), { status: 400, headers: cors() });
  }

  const row = {
    device_id:      inst.device_id,
    agency_id:      inst.agency_id,
    requested_by:   null,
    user_consented: true,
    bundle:         body.bundle,
    size_bytes:     body.size_bytes,
    ...(body.expires_at != null ? { expires_at: body.expires_at } : {}),
  };

  if (!SERVICE) {
    return new Response(JSON.stringify({ error: "service role key not configured" }), { status: 500, headers: cors() });
  }

  const r = await fetch(`${SUPA_URL}/rest/v1/rba_diagnostics`, {
    method: "POST",
    headers: {
      "apikey":        SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type":  "application/json",
      "prefer":        "return=representation",
    },
    body: JSON.stringify(row),
  });

  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!r.ok) {
    return new Response(JSON.stringify({ error: (Array.isArray(data) ? data[0]?.message : data?.message) || "insert failed" }), { status: r.status, headers: cors() });
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  return new Response(JSON.stringify({ diagnostic_id: inserted?.id ?? null }), { status: 200, headers: cors() });
}
