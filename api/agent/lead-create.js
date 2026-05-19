<<<<<<< HEAD
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
  body = body || {};
  if (typeof body.lead !== "string" || body.lead.length === 0 || body.lead.length > 200) {
    return new Response(JSON.stringify({ error: "lead (name) must be a non-empty string ≤ 200 chars" }), { status: 400, headers: cors() });
  }
  for (const k of ["phone","email","state","product","source","notes","stage","heat","consent"]) {
    if (body[k] != null && (typeof body[k] !== "string" || body[k].length > 500)) {
      return new Response(JSON.stringify({ error: `${k} must be a string ≤ 500 chars` }), { status: 400, headers: cors() });
    }
  }
  if (body.age != null && (typeof body.age !== "number" || !Number.isFinite(body.age) || body.age < 0 || body.age > 130)) {
    return new Response(JSON.stringify({ error: "age must be a number 0–130" }), { status: 400, headers: cors() });
  }
  if (body.ap != null && (typeof body.ap !== "number" || !Number.isFinite(Number(body.ap)))) {
    return new Response(JSON.stringify({ error: "ap must be a number" }), { status: 400, headers: cors() });
  }
  const lead = String(body.lead).trim();
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
=======
// POST /api/agent/lead-create — agent inserts a row into public.pipeline.
// Authenticated via x-agent-token. Resolves agency_id + rep_id from the
// install, then writes via service role (bypasses RLS).
//
// Body: {
//   lead:    string (required, mapped to pipeline.lead_name),
//   phone:   string (optional, folded into last_activity_text),
//   email:   string (optional, folded into last_activity_text),
//   state:   string (optional, US state code),
//   age:     int    (optional),
//   product: string (optional, e.g. "Med Supp Plan G"),
//   source:  string (optional, e.g. "agent", "IG DM", "FB Lead Form"),
//   notes:   string (optional, appended to last_activity_text),
//   stage:   string (optional, default 'New', enum check),
//   heat:    string (optional, default 'warm', enum check),
//   consent: string (optional, default 'pending', enum check),
//   ap:      number (optional, USD; stored as ap_cents)
// }
//
// Returns: { lead_id, stage, agency_id, owner_rep_id, created_at }

import { SUPA_URL, SERVICE, cors, loadInstallByToken, readAgentToken, writeAgentAudit } from "./_lib.js";

export const config = { runtime: "edge" };

const STAGE_ENUM   = new Set(["New", "Contacted", "Quoted", "App In", "Issued", "Lost"]);
const HEAT_ENUM    = new Set(["fresh", "hot", "warm", "cold"]);
const CONSENT_ENUM = new Set(["verified", "pending", "none"]);

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST")    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst  = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}

  const lead_name = String(body.lead || body.name || "").trim();
  if (!lead_name) return new Response(JSON.stringify({ error: "lead (name) required" }), { status: 400, headers: cors() });

  const stage   = STAGE_ENUM.has(body.stage)     ? body.stage   : "New";
  const heat    = HEAT_ENUM.has(body.heat)       ? body.heat    : "warm";
  const consent = CONSENT_ENUM.has(body.consent) ? body.consent : "pending";

  const ap_cents = Number.isFinite(body.ap) ? Math.round(Number(body.ap) * 100) : 0;

  const activityParts = [];
  if (body.phone) activityParts.push(`☎ ${String(body.phone).slice(0, 24)}`);
  if (body.email) activityParts.push(`✉ ${String(body.email).slice(0, 64)}`);
  if (body.notes) activityParts.push(String(body.notes).slice(0, 400));
  const last_activity_text = activityParts.join(" · ") || null;

  // Resolve owner_rep_id: reps.user_id → reps.id (text). Scope by agency.
  let owner_rep_id = null;
  try {
    const rr = await fetch(
      `${SUPA_URL}/rest/v1/reps?select=id&user_id=eq.${encodeURIComponent(inst.user_id)}&agency_id=eq.${encodeURIComponent(inst.agency_id)}&limit=1`,
      { headers: { "apikey": SERVICE, "authorization": `Bearer ${SERVICE}` } },
    );
    if (rr.ok) {
      const rows = await rr.json();
      if (Array.isArray(rows) && rows.length) owner_rep_id = rows[0].id;
    }
  } catch { /* leave null — agency may not have a reps mapping yet */ }

  const row = {
    lead_name,
    age:     Number.isFinite(body.age) ? Number(body.age) : null,
    state:   body.state ? String(body.state).slice(0, 4).toUpperCase() : null,
    stage,
    product: body.product || null,
    ap_cents,
    last_activity_text,
    source:  body.source || "agent",
    owner_rep_id,
    consent,
    heat,
  };

  const ins = await fetch(`${SUPA_URL}/rest/v1/pipeline?select=id,stage,owner_rep_id,created_at`, {
    method: "POST",
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
      "prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!ins.ok) {
    const errText = await ins.text();
    return new Response(JSON.stringify({ error: "pipeline insert failed", detail: errText.slice(0, 300) }), { status: 500, headers: cors() });
  }

  const inserted = (await ins.json())[0] || {};

  writeAgentAudit({
    agency_id: inst.agency_id,
    user_id:   inst.user_id,
    rep_id:    owner_rep_id,
    kind:      "create_lead",
    ring:      "execute",
    decision:  "execute",
    metadata:  { lead_id: inserted.id, lead_name },
  }).catch(() => {});

  return new Response(JSON.stringify({
    lead_id:      inserted.id,
    stage:        inserted.stage,
    agency_id:    inst.agency_id,
    owner_rep_id: inserted.owner_rep_id,
    created_at:   inserted.created_at,
>>>>>>> 6144dbb (feat(agent-platform): AI sidebar + lead-create + tool catalog reconciliation)
  }), { status: 200, headers: cors() });
}
