// GET /api/agent/connector-list — list the caller's connectors with health.
// Bearer = user JWT.
import { SUPA_URL, SERVICE, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  const [vR, hR] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/connector_vault?select=id,provider,account_label,account_metadata,status,connected_at,last_used_at,expires_at`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${jwt}` } }),
    fetch(`${SUPA_URL}/rest/v1/connector_health?select=vault_id,probe_kind,status,detail,latency_ms,checked_at&order=checked_at.desc&limit=200`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${jwt}` } }),
  ]);
  const vault = vR.ok ? await vR.json() : [];
  const health = hR.ok ? await hR.json() : [];
  const latestByVault = {};
  for (const h of health) {
    if (!latestByVault[h.vault_id]) latestByVault[h.vault_id] = h;
  }
  const out = vault.map(v => ({ ...v, health: latestByVault[v.id] || null }));
  return new Response(JSON.stringify({ connectors: out }), { status: 200, headers: cors() });
}
