// GET /api/agent/cancel-check?dial_command_id=<uuid>
// Bearer = x-agent-token. Used by the agent's phone_link_dial loop to poll
// between attempts: returns { cancelled: true } when there's a queued
// cancel_dial command targeting dial_command_id.
//
// We mark the matching cancel_dial as 'succeeded' on read so it doesn't
// pile up — it's a one-shot signal.
import { SUPA_URL, SERVICE, cors, loadInstallByToken, readAgentToken } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }),
    { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }),
    { status: 401, headers: cors() });

  const url = new URL(req.url);
  const dialId = url.searchParams.get("dial_command_id");
  if (!dialId) return new Response(JSON.stringify({ error: "dial_command_id required" }),
    { status: 400, headers: cors() });

  // Find a queued/claimed cancel_dial whose payload.dial_command_id matches
  // and whose device_id matches the agent's. PostgREST jsonb filter:
  //   payload->>dial_command_id=eq.<id>
  const r = await fetch(
    `${SUPA_URL}/rest/v1/rba_commands?select=id&device_id=eq.${inst.device_id}&kind=eq.cancel_dial&status=in.(queued,claimed)&payload->>dial_command_id=eq.${encodeURIComponent(dialId)}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  if (!r.ok) return new Response(JSON.stringify({ error: "lookup failed" }),
    { status: 500, headers: cors() });
  const rows = await r.json();
  const cancelled = Array.isArray(rows) && rows.length > 0;

  if (cancelled) {
    // Mark consumed so cancel_dial doesn't loop forever
    await fetch(
      `${SUPA_URL}/rest/v1/rba_commands?id=eq.${rows[0].id}`,
      {
        method: "PATCH",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          result: { acked_by: "agent_cancel_check", dial_command_id: dialId },
        }),
      }
    ).catch(() => {});
  }

  return new Response(JSON.stringify({ cancelled, dial_command_id: dialId }),
    { status: 200, headers: { ...cors(), "cache-control": "no-store" } });
}
