// POST /api/agent/lead-create — agent inserts a real lead in public.pipeline.
// Bearer = x-agent-token. Uses service role to bypass RLS, but scoped:
// the lead's agency_id is forced to the install's agency_id (agent can't
// create leads in other tenants).
//
// Body:
//   { lead, phone, email, state, age, product, source, notes,
//     stage, heat, consent, ap }
// Returns:
//   { lead_id, stage, agency_id, owner_rep_id, created_at }
import { SUPA_URL, SERVICE, cors, loadInstallByToken, readAgentToken } from "./_lib.js";

export const config = { runtime: "edge" };

// Pipeline table CHECK constraints (verified against DB 2026-05-15):
//   stage   ∈ {New, Contacted, Quoted, App In, Issued, Cancelled, Lost}
//   heat    ∈ {fresh, hot, warm, cold}
//   consent ∈ {verified, pending, none}
const ALLOWED_STAGES = new Set(["New","Contacted","Quoted","App In","Issued","Cancelled","Lost"]);
const ALLOWED_HEAT   = new Set(["fresh","warm","hot","cold"]);
const ALLOWED_CONSENT= new Set(["verified","pending","none"]);
// Map common synonyms to allowed values so callers don't need to memorize.
const CONSENT_ALIAS  = { verbal: "pending", written: "verified", yes: "verified", no: "none" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }
  const lead = String(body.lead || "").trim();
  if (!lead) return new Response(JSON.stringify({ error: "lead (name) required" }), { status: 400, headers: cors() });

  const stage   = ALLOWED_STAGES.has(body.stage)   ? body.stage   : "New";
  const heat    = ALLOWED_HEAT.has(body.heat)      ? body.heat    : "warm";
  const consentRaw = body.consent || "pending";
  const consent = ALLOWED_CONSENT.has(consentRaw)
                  ? consentRaw
                  : (CONSENT_ALIAS[consentRaw] || "pending");

  // Owner rep — the install's user_id, mapped to a rep row if one exists.
  // Best-effort lookup via agency_members.rep_id.
  let ownerRepId = null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/agency_members?select=rep_id&user_id=eq.${inst.user_id}&agency_id=eq.${inst.agency_id}&active=eq.true&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    if (r.ok) {
      const rows = await r.json();
      if (rows[0]?.rep_id) ownerRepId = rows[0].rep_id;
    }
  } catch {}

  const row = {
    lead_name: lead,
    age: body.age || null,
    state: body.state || null,
    stage,
    product: body.product || null,
    ap_cents: Math.round((Number(body.ap) || 0) * 100),
    days_in_stage: 0,
    last_activity_text: body.notes || null,
    next_action: null,
    source: body.source || "agent",
    owner_rep_id: ownerRepId,
    consent,
    heat,
    agency_id: inst.agency_id,
    phone: body.phone || null,
    email: body.email || null,
  };

  const ins = await fetch(`${SUPA_URL}/rest/v1/pipeline?select=id,stage,agency_id,owner_rep_id,created_at`, {
    method: "POST",
    headers: {
      apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json", prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!ins.ok) {
    return new Response(JSON.stringify({ error: "insert failed", detail: await ins.text() }), { status: 500, headers: cors() });
  }
  const created = (await ins.json())[0];
  return new Response(JSON.stringify({
    lead_id: created.id, stage: created.stage,
    agency_id: created.agency_id, owner_rep_id: created.owner_rep_id,
    created_at: created.created_at,
    note: "Lead created by agent. Visible in CRM under " + (inst.agency_id ? "this agency" : "(no agency)") + ".",
  }), { status: 200, headers: cors() });
}
