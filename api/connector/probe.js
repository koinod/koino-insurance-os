// POST /api/connector/probe — manual or scheduled probe of one connector.
// Body: { vault_id, provider, kind: 'manual' | 'lazy' | 'nightly' }
// Bearer = user JWT (manual) OR x-cron-secret (nightly).
//
// Probe strategy per provider:
//   twilio   — GET Accounts/{sid}.json with auth
//   sendblue — GET /api/me with key
//   fathom   — GET /v1/me with bearer
//   gmail    — GET userinfo (OAuth) — stubbed pending OAuth wiring
//   <stubbed> — returns yellow with detail "no probe wired"
//
// Result is written to connector_health via service-role RPC and reflected
// in connector_vault.status when red.
import { SUPA_URL, SERVICE, cors, readUserJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

async function loadVault(vaultId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/connector_vault?id=eq.${vaultId}&select=*`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function probeTwilio(v) {
  const sid = (v.account_metadata || {}).account_sid;
  const tok = v.api_key_enc || v.access_token_enc;
  if (!sid || !tok) return { status: "red", detail: "missing account_sid or auth_token" };
  const t0 = Date.now();
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
    { headers: { authorization: "Basic " + btoa(`${sid}:${tok}`) } });
  const lat = Date.now() - t0;
  if (r.ok) return { status: "green", detail: "Twilio API reachable", latency_ms: lat };
  if (r.status === 401) return { status: "red", detail: "Twilio auth rejected", latency_ms: lat };
  return { status: "yellow", detail: `HTTP ${r.status}`, latency_ms: lat };
}

async function probeSendBlue(v) {
  const key = v.api_key_enc;
  const meta = v.account_metadata || {};
  if (!key) return { status: "red", detail: "missing api_key" };
  const t0 = Date.now();
  // SendBlue's docs: GET /api/me — returns the account.
  const r = await fetch("https://api.sendblue.co/api/me", {
    headers: {
      "sb-api-key-id": meta.api_key_id || "",
      "sb-api-secret-key": key,
      "content-type": "application/json",
    },
  });
  const lat = Date.now() - t0;
  if (r.ok) return { status: "green", detail: "SendBlue API reachable", latency_ms: lat };
  if (r.status === 401 || r.status === 403) return { status: "red", detail: "SendBlue auth rejected", latency_ms: lat };
  return { status: "yellow", detail: `HTTP ${r.status}`, latency_ms: lat };
}

async function probeFathom(v) {
  const key = v.api_key_enc;
  if (!key) return { status: "red", detail: "missing api_key" };
  const t0 = Date.now();
  const r = await fetch("https://api.fathom.video/v1/me",
    { headers: { authorization: `Bearer ${key}` } });
  const lat = Date.now() - t0;
  if (r.ok) return { status: "green", detail: "Fathom API reachable", latency_ms: lat };
  if (r.status === 401) return { status: "red", detail: "Fathom auth rejected", latency_ms: lat };
  return { status: "yellow", detail: `HTTP ${r.status}`, latency_ms: lat };
}

const PROBES = {
  twilio: probeTwilio,
  sendblue: probeSendBlue,
  fathom: probeFathom,
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;
  const jwt = readUserJwt(req);
  if (!isCron && !jwt) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  if (!body.vault_id) return new Response(JSON.stringify({ error: "vault_id required" }), { status: 400, headers: cors() });
  const kind = ["manual", "lazy", "nightly"].includes(body.kind) ? body.kind : "manual";

  const v = await loadVault(body.vault_id);
  if (!v) return new Response(JSON.stringify({ error: "vault row not found" }), { status: 404, headers: cors() });

  const fn = PROBES[v.provider];
  let result = fn ? await fn(v).catch(e => ({ status: "red", detail: String(e).slice(0, 200) }))
                  : { status: "yellow", detail: `no probe wired for ${v.provider}` };

  // Write health row via SECURITY DEFINER RPC.
  await fetch(`${SUPA_URL}/rest/v1/rpc/connector_health_set`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      p_vault_id: v.id, p_probe: kind, p_status: result.status,
      p_detail: result.detail || null, p_latency: result.latency_ms || null,
    }),
  });

  return new Response(JSON.stringify(result), { status: 200, headers: { ...cors(), "cache-control": "no-store" } });
}
