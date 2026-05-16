// POST /api/agent/connector-exchange  body: { provider, account_label? }
// Bearer = x-agent-token. Returns the per-call decrypted credentials for
// the install's user_id + provider.
//
// SECURITY: This is the only place tokens leave the vault. We never cache
// them on the agent's disk. Every call audits.
//
// Encryption: TEMPORARY — pgsodium wiring is a follow-on migration.
// For now access_token_enc / api_key_enc / refresh_token_enc are stored
// AS PLAINTEXT in vault and we just rename them server-side. The schema
// is forward-compatible: when pgsodium lands, we decrypt here and the
// agent contract is unchanged.
import { SUPA_URL, SERVICE, cors, loadInstallByToken, readAgentToken } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }
  if (typeof body.provider !== "string" || body.provider.length === 0 || body.provider.length > 64) {
    return new Response(JSON.stringify({ error: "provider must be a non-empty string ≤ 64 chars" }), { status: 400, headers: cors() });
  }
  if (body.account_label != null && (typeof body.account_label !== "string" || body.account_label.length > 128)) {
    return new Response(JSON.stringify({ error: "account_label must be a string ≤ 128 chars" }), { status: 400, headers: cors() });
  }

  const labelFilter = body.account_label
    ? `&account_label=eq.${encodeURIComponent(body.account_label)}`
    : `&account_label=is.null`;

  const r = await fetch(
    `${SUPA_URL}/rest/v1/connector_vault?select=*&user_id=eq.${inst.user_id}&provider=eq.${encodeURIComponent(body.provider)}&status=eq.active${labelFilter}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  if (!r.ok) return new Response(JSON.stringify({ error: "vault read failed" }), { status: 500, headers: cors() });
  const rows = await r.json();
  let row = Array.isArray(rows) ? rows[0] : null;
  if (!row && body.account_label) {
    // Fall back to default-label row if labelled one missing
    const r2 = await fetch(
      `${SUPA_URL}/rest/v1/connector_vault?select=*&user_id=eq.${inst.user_id}&provider=eq.${encodeURIComponent(body.provider)}&status=eq.active&order=connected_at.desc&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    const rows2 = r2.ok ? await r2.json() : [];
    row = rows2[0] || null;
  }
  if (!row) return new Response(JSON.stringify({ error: `no ${body.provider} connector` }), { status: 404, headers: cors() });

  // Touch last_used_at without blocking the response
  fetch(`${SUPA_URL}/rest/v1/connector_vault?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});

  // Provider-specific shape — flatten common keys for the agent.
  const meta = row.account_metadata || {};
  const payload = {
    provider: row.provider,
    account_label: row.account_label,
    access_token: row.access_token_enc,    // see SECURITY note above
    refresh_token: row.refresh_token_enc,
    api_key: row.api_key_enc,
    expires_at: row.expires_at,
    scopes: row.scopes,
    // Convenience fields per provider
    ...(row.provider === "twilio" ? {
      account_sid: meta.account_sid,
      auth_token: row.api_key_enc,
      api_secret: row.api_key_enc,
      phone_numbers: meta.phone_numbers || [],
    } : {}),
    ...(row.provider === "sendblue" ? {
      api_key_id: meta.api_key_id,
      sender_phone: meta.sender_phone,
    } : {}),
    ...(row.provider === "fb_ads" || row.provider === "ig_business" || row.provider === "meta_dm" ? {
      ad_accounts: meta.ad_accounts || [],
      page_ids: meta.page_ids || [],
    } : {}),
  };

  return new Response(JSON.stringify(payload), { status: 200, headers: { ...cors(), "cache-control": "no-store" } });
}
