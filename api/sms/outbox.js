// /api/sms/outbox — Repflow Agent endpoint.
//
// The local Repflow Agent (running on a rep's Mac or Windows laptop) calls
// this endpoint on a poll interval to fetch pending SMS work, then reports
// success/failure back. Auth is via the agent's bearer token (issued from
// the rep's account; same JWT used by the web app).
//
// Operations (selected via ?op= query param):
//   GET  ?op=claim   — atomically claim up to N pending rows for this agent.
//                      Body: { agent_id, max?: 5 }
//                      Response: { messages: [...] }
//   POST ?op=sent    — mark one row as sent.
//                      Body: { id }
//   POST ?op=failed  — mark one row as failed.
//                      Body: { id, error }

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const ok  = (b, s = 200) => new Response(JSON.stringify(b),                      { status: s, headers: HEADERS });
const err = (s, m)       => new Response(JSON.stringify({ ok: false, error: m }),{ status: s, headers: HEADERS });

async function pg(method, path, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: method === "GET" ? "" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`pg ${method} ${path} ${r.status}: ${t.slice(0, 240)}`);
  }
  if (r.status === 204) return null;
  try { return await r.json(); } catch { return null; }
}

// Verify the bearer JWT belongs to a real auth.users row and resolve their
// agency_ids (so the agent can only claim messages from its own agency).
async function resolveAgent(req) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const jwt = auth.slice(7);
  // Hit /auth/v1/user with the user JWT to validate it
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  // Look up the agencies they're an active member of.
  const members = await pg("GET", `agency_members?user_id=eq.${u.id}&active=eq.true&select=agency_id,rep_id,role`);
  return {
    user_id: u.id,
    email: u.email,
    agencies: (members || []).map(m => ({ agency_id: m.agency_id, rep_id: m.rep_id, role: m.role })),
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (!SERVICE) return err(500, "SUPABASE_SERVICE_ROLE_KEY not set");

  const url = new URL(req.url);
  const op = url.searchParams.get("op") || "claim";

  const agent = await resolveAgent(req);
  if (!agent || agent.agencies.length === 0) return err(401, "invalid agent token or no agency membership");
  const agencyIds = agent.agencies.map(a => a.agency_id);
  const myRepIds  = agent.agencies.map(a => a.rep_id).filter(Boolean);

  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

  if (op === "claim") {
    const max = Math.min(Math.max(parseInt(body.max || 5, 10), 1), 25);
    const agentId = body.agent_id || agent.email || agent.user_id;
    // Pull pending rows for any of our agencies. Prefer rows whose rep_id
    // matches one of our reps; broadcast rows (rep_id null) are also claimable.
    const filter = `or=(rep_id.is.null${myRepIds.length ? `,rep_id.in.(${myRepIds.map(s => `"${s}"`).join(",")})` : ""})`;
    const ag = `agency_id=in.(${agencyIds.map(a => `"${a}"`).join(",")})`;
    const pending = await pg(
      "GET",
      `sms_outbox?status=eq.pending&${ag}&${filter}&order=created_at.asc&limit=${max}&select=id,to_number,body,rep_id,agency_id,source`
    );
    if (!pending || pending.length === 0) return ok({ messages: [] });

    // Atomically claim them
    const ids = pending.map(p => p.id);
    await pg("PATCH", `sms_outbox?id=in.(${ids.map(i => `"${i}"`).join(",")})&status=eq.pending`, {
      status: "claimed",
      claimed_by: agentId,
      claimed_at: new Date().toISOString(),
    });
    return ok({ messages: pending });
  }

  if (op === "sent") {
    if (!body.id) return err(400, "id required");
    await pg("PATCH", `sms_outbox?id=eq.${body.id}`, {
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    return ok({ ok: true });
  }

  if (op === "failed") {
    if (!body.id) return err(400, "id required");
    await pg("PATCH", `sms_outbox?id=eq.${body.id}`, {
      status: "failed",
      error_text: String(body.error || "unspecified").slice(0, 1000),
    });
    return ok({ ok: true });
  }

  return err(400, "unknown op (use claim | sent | failed)");
}
