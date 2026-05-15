// POST /api/agent/connector-upsert — write/refresh a connector token.
// Bearer = user JWT. Body:
//   { provider, account_label?, access_token, refresh_token?, api_key?,
//     metadata?, scopes?, expires_at? }
//
// SECURITY: server-side encryption (pgsodium) is a follow-on migration.
// For now we pass plaintext through; the storage column is named *_enc to
// preserve forward compatibility.
import { rpc, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  if (!body.provider) return new Response(JSON.stringify({ error: "provider required" }), { status: 400, headers: cors() });

  const r = await rpc("connector_upsert_token", {
    p_provider: body.provider,
    p_account_label: body.account_label || null,
    p_access_token_enc: body.access_token || null,
    p_refresh_token_enc: body.refresh_token || null,
    p_api_key_enc: body.api_key || null,
    p_metadata: body.metadata || {},
    p_scopes: body.scopes || [],
    p_expires_at: body.expires_at || null,
  }, jwt);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "upsert failed" }), { status: r.status, headers: cors() });
  return new Response(JSON.stringify({ vault_id: r.data }), { status: 200, headers: cors() });
}
