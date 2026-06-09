// /api/agent/quote-map — saved rate-path maps (carrier_quote_maps).
//
//  • GET  with x-agent-token  + ?carrier=<id>  → the install agency's active
//      map for that carrier (or all active maps when ?carrier omitted). The
//      local quote agent calls this to replay a mapped carrier. Service-role
//      read, scoped to the install's agency_id — never cross-agency.
//  • GET  with user JWT       + ?carrier=<id>? → the caller's agency maps,
//      RLS-scoped via PostgREST. UI read for the map editor.
//  • POST with user JWT       { carrier_id, ... }                → upsert a map
//      for the caller's agency (RLS: owner/manager/admin/super only).
import { SUPA_URL, SERVICE, ANON, cors, loadInstallByToken, readAgentToken, readUserJwt, loadCallerFromJwt } from "./_lib.js";

export const config = { runtime: "edge" };

const resp = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors(), "cache-control": "no-store" } });

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const url = new URL(req.url);
  const carrier = (url.searchParams.get("carrier") || "").trim();

  // ── Agent path: agent_token → that install's agency. Read-only. ──────────
  const agentTok = readAgentToken(req);
  if (agentTok) {
    if (req.method !== "GET") return resp(405, { error: "GET only for agent token" });
    const inst = await loadInstallByToken(agentTok);
    if (!inst) return resp(401, { error: "invalid agent token" });
    let q = `${SUPA_URL}/rest/v1/carrier_quote_maps?select=*&agency_id=eq.${inst.agency_id}&active=eq.true`;
    if (carrier) q += `&carrier_id=eq.${encodeURIComponent(carrier)}`;
    const r = await fetch(q, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    if (!r.ok) return resp(500, { error: "map read failed" });
    const rows = await r.json();
    return resp(200, carrier ? (rows[0] || null) : rows);
  }

  // ── UI path: user JWT, RLS-scoped. ───────────────────────────────────────
  const jwt = readUserJwt(req);
  if (!jwt) return resp(401, { error: "not authenticated" });

  if (req.method === "GET") {
    let q = `${SUPA_URL}/rest/v1/carrier_quote_maps?select=*&order=carrier_id.asc`;
    if (carrier) q += `&carrier_id=eq.${encodeURIComponent(carrier)}`;
    const r = await fetch(q, { headers: { apikey: ANON, authorization: `Bearer ${jwt}` } });
    const rows = r.ok ? await r.json() : [];
    return resp(r.ok ? 200 : r.status, carrier ? (rows[0] || null) : rows);
  }

  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch { return resp(400, { error: "bad json" }); }
    if (!body.carrier_id || typeof body.carrier_id !== "string") {
      return resp(400, { error: "carrier_id required" });
    }
    const caller = await loadCallerFromJwt(jwt);
    if (!caller?.agency_id) return resp(403, { error: "no agency for caller" });

    // Include agency_id explicitly so the (agency_id, carrier_id) upsert
    // conflict target resolves. The BEFORE INSERT trigger no-ops when it's set.
    const row = {
      agency_id: caller.agency_id,
      carrier_id: body.carrier_id,
      quote_url: body.quote_url ?? null,
      login_url: body.login_url ?? null,
      logged_in_indicator: body.logged_in_indicator ?? null,
      steps: Array.isArray(body.steps) ? body.steps : [],
      fields: Array.isArray(body.fields) ? body.fields : [],
      submit_selector: body.submit_selector ?? null,
      rate_selector: body.rate_selector ?? null,
      rate_regex: body.rate_regex ?? null,
      notes: body.notes ?? null,
      active: body.active !== false,
      updated_by: caller.user_id || null,
    };
    // RLS (manager write policy) still applies because we pass the user JWT.
    const r = await fetch(
      `${SUPA_URL}/rest/v1/carrier_quote_maps?on_conflict=agency_id,carrier_id`,
      {
        method: "POST",
        headers: {
          apikey: ANON,
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(row),
      }
    );
    const text = await r.text();
    if (!r.ok) return resp(r.status, { error: text || "save failed" });
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return resp(200, Array.isArray(data) ? (data[0] || null) : data);
  }

  return resp(405, { error: "method not allowed" });
}
