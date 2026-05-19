// POST /api/agent/agency-capabilities/toggle
//
// Caller: authenticated user with role owner | admin | super_admin (per plan).
// Body:   { kind, enabled, max_per_day?, notes?, agency_id? }
//   - agency_id is only honored if caller is super_admin.
//
// Returns 200 { ok, kind, enabled, max_per_day },
//         401 unauthenticated,
//         403 if role not allowed,
//         400 on bad input.
import {
  SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt,
  writeAgentAudit,
} from "../_lib.js";

export const config = { runtime: "edge" };

const ALLOWED_ROLES = new Set(["owner", "admin", "super_admin"]);

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!SERVICE) return reply(500, { error: "server misconfigured" });

  const jwt = readUserJwt(req);
  const caller = await loadCallerFromJwt(jwt);
  if (!caller) return reply(401, { error: "unauthenticated" });
  if (!ALLOWED_ROLES.has(caller.role)) return reply(403, { error: `role ${caller.role} cannot toggle capabilities` });

  let body = {};
  try { body = await req.json(); } catch {}
  const kind = String(body.kind || "").trim();
  if (!kind || !/^[a-z][a-z0-9_]*$/.test(kind) || kind.length > 64) return reply(400, { error: "invalid kind" });
  if (typeof body.enabled !== "boolean") return reply(400, { error: "enabled must be boolean" });
  const maxPerDay = body.max_per_day == null ? null : Number(body.max_per_day);
  if (maxPerDay !== null && (!Number.isFinite(maxPerDay) || maxPerDay < 0 || maxPerDay > 1_000_000)) return reply(400, { error: "max_per_day out of range" });
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null;

  let agencyId = caller.agency_id;
  if (body.agency_id && body.agency_id !== caller.agency_id) {
    if (caller.role !== "super_admin") return reply(403, { error: "cross-agency toggle requires super_admin" });
    agencyId = body.agency_id;
  }

  const row = {
    agency_id:  agencyId,
    kind,
    enabled:    body.enabled,
    max_per_day: maxPerDay,
    notes,
    enabled_by: caller.user_id,
    enabled_at: new Date().toISOString(),
  };

  // Upsert on (agency_id, kind).
  const r = await fetch(
    `${SUPA_URL}/rest/v1/agency_capabilities?on_conflict=agency_id,kind&select=kind,enabled,max_per_day,notes,enabled_at`,
    {
      method: "POST",
      headers: {
        "apikey": SERVICE,
        "authorization": `Bearer ${SERVICE}`,
        "content-type": "application/json",
        "prefer": "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    }
  );
  if (!r.ok) {
    const t = await r.text();
    return reply(500, { error: "upsert failed", detail: t.slice(0, 500) });
  }
  const out = await r.json();
  const saved = Array.isArray(out) ? out[0] : null;

  await writeAgentAudit({
    agency_id:    agencyId,
    user_id:      caller.user_id,
    rep_id:       caller.rep_id,
    kind,
    ring:         "capability",
    decision:     body.enabled ? "approve" : "deny",
    reason:       body.enabled ? "capability enabled by user" : "capability disabled by user",
    metadata:     { max_per_day: maxPerDay, notes, by_role: caller.role },
  });

  return reply(200, { ok: true, ...saved });
}
