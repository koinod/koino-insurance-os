// POST /api/agent/dispatch-cancel-dial { dial_command_id }
// Auth: user JWT.
//
// User clicks Stop in the UI → POST here → we look up the original
// dial command, validate the caller can see it (RLS via JWT), then
// insert a cancel_dial command targeting the same device. The agent's
// phone_link_dial loop polls /api/agent/cancel-check between attempts
// and will halt + flag cancelled=true.
import { SUPA_URL, SERVICE, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }),
    { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }),
    { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  const dialId = body.dial_command_id;
  if (!dialId) return new Response(JSON.stringify({ error: "dial_command_id required" }),
    { status: 400, headers: cors() });

  // Look up the dial command via the user's JWT so RLS scopes correctly
  const dr = await fetch(
    `${SUPA_URL}/rest/v1/rba_commands?select=id,device_id,agency_id,kind,status&id=eq.${dialId}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${jwt}` } }
  );
  if (!dr.ok) return new Response(JSON.stringify({ error: "lookup failed" }),
    { status: dr.status, headers: cors() });
  const rows = await dr.json();
  const dialCmd = rows[0];
  if (!dialCmd) return new Response(JSON.stringify({ error: "dial command not found or not visible" }),
    { status: 404, headers: cors() });
  if (dialCmd.kind !== "phone_link_dial") return new Response(JSON.stringify({
    error: `not a dial command (kind=${dialCmd.kind})`,
  }), { status: 400, headers: cors() });
  if (dialCmd.status === "succeeded" || dialCmd.status === "failed" || dialCmd.status === "expired") {
    return new Response(JSON.stringify({ error: `dial already terminal (status=${dialCmd.status})` }),
      { status: 409, headers: cors() });
  }

  // Insert a cancel_dial command targeting the same device, with the dial id in payload
  const ins = await fetch(`${SUPA_URL}/rest/v1/rba_commands?select=id`, {
    method: "POST",
    headers: {
      apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json", prefer: "return=representation",
    },
    body: JSON.stringify({
      device_id: dialCmd.device_id,
      agency_id: dialCmd.agency_id,
      kind: "cancel_dial",
      payload: { dial_command_id: dialId, requested_at: new Date().toISOString() },
      expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    }),
  });
  if (!ins.ok) return new Response(JSON.stringify({ error: "couldn't queue cancel" }),
    { status: 500, headers: cors() });
  const cancel = (await ins.json())[0];
  return new Response(JSON.stringify({
    cancel_command_id: cancel.id,
    dial_command_id: dialId,
    note: "Cancel queued. Agent will pick it up between dial attempts (polls every interval)."
  }), { status: 200, headers: cors() });
}
