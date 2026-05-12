// /api/me — returns the current viewer's identity (rep + agency + downline ids).
// Closes GAP-X4 — auth identity link.
//
// Reads the user JWT from `Authorization` or `x-supabase-auth` header,
// hits the public.me() Postgres function via PostgREST, joins downline_of() so
// the UI gets the full set of rep_ids the viewer can scope queries to.
//
// Response shape (always 200, fields may be null for unauthed callers):
//   { rep_id, user_id, full_name, handle, role, tier, agency_id, agency_name,
//     upline_id, downline_ids: [text], is_demo: bool }
//
// FREE: no model calls, no paid services. Pure Postgres RPC.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";
// Atlas Insurance Group (the seeded demo tenant) — agencies.id from the live DB.
const DEMO_AGENCY_ID = "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-supabase-auth, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

async function callRpc(fn, body, jwt) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": ANON,
      "authorization": `Bearer ${jwt || ANON}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: corsHeaders() });
  }

  const auth = req.headers.get("authorization") || req.headers.get("x-supabase-auth") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "") || null;

  // me() and viewer_is_super_admin() in parallel — the second one returns true
  // even when me() returns 0 rows (e.g. a fresh super-admin who hasn't been
  // onboarded into any IMO yet). Both gracefully fall through to false / null
  // on legacy projects where 0019 hasn't been applied.
  const [meRows, superRows] = await Promise.all([
    callRpc("me", {}, jwt),
    callRpc("viewer_is_super_admin", {}, jwt),
  ]);
  const me = Array.isArray(meRows) && meRows.length > 0 ? meRows[0] : null;
  // viewer_is_super_admin returns a scalar boolean (PostgREST wraps it in an
  // array when the function returns "table"; here it's a scalar, so it's
  // either the literal boolean or `[true]`/`[false]`).
  const isSuper = (() => {
    if (typeof superRows === "boolean") return superRows;
    if (Array.isArray(superRows) && superRows.length > 0) {
      const v = superRows[0];
      if (typeof v === "boolean") return v;
      if (v && typeof v === "object" && "viewer_is_super_admin" in v) return !!v.viewer_is_super_admin;
    }
    return !!(me && me.is_super_admin);
  })();

  // Anonymous / signed-out callers get the demo identity: Marcus, the Atlas
  // owner. Read-only because anon RLS only grants SELECT on Atlas-scoped rows
  // (see migration 0006_anon_demo_read). Gives ?demo=1 visitors the full
  // owner view — fleet KPIs, P&L, predictive cards — without an account.
  if (!me || !me.rep_id) {
    // Super-admins with no rep row yet still get a usable identity so the
    // platform-admin shell can mount. They land on a "you have no agency
    // membership — pick one to act as" empty state once routed.
    if (isSuper && jwt) {
      return new Response(JSON.stringify({
        rep_id: null,
        user_id: null,                 // server-side: client extracts from sb.auth.getUser if needed
        full_name: "Platform admin",
        handle: "@super",
        role: "super_admin",
        tier: null,
        agency_id: null,
        agency_name: "KOINO HQ",
        upline_id: null,
        downline_ids: [],
        is_demo: false,
        is_super_admin: true,
        authenticated: true,
      }), { status: 200, headers: corsHeaders() });
    }
    const downlineRows = await callRpc("downline_of", { root_rep_id: "marc" }, null);
    const downline_ids = Array.isArray(downlineRows)
      ? downlineRows.map(r => (typeof r === "string" ? r : r.rep_id)).filter(Boolean)
      : [];
    return new Response(JSON.stringify({
      rep_id: "marc",
      user_id: null,
      full_name: "Marcus Avila",
      handle: "@marc",
      role: "owner",
      tier: "diamond",
      agency_id: DEMO_AGENCY_ID,
      agency_name: "Atlas Insurance Group",
      upline_id: null,
      downline_ids,
      is_demo: true,
      is_super_admin: false,
      authenticated: false,
    }), { status: 200, headers: corsHeaders() });
  }

  // downline_of(me.rep_id) returns text[] via PostgREST
  const downlineRows = await callRpc("downline_of", { root_rep_id: me.rep_id }, jwt);
  const downline_ids = Array.isArray(downlineRows)
    ? downlineRows.map(r => (typeof r === "string" ? r : r.rep_id)).filter(Boolean)
    : [];

  return new Response(JSON.stringify({
    rep_id:       me.rep_id,
    user_id:      me.user_id,
    full_name:    me.full_name,
    handle:       me.handle,
    // role from agency_members; if the user is a super-admin allowlist member
    // but their agency_members.role is something tame (e.g. 'rep' in their own
    // test IMO), we still expose 'super_admin' to the frontend so the right
    // sidebar nav shows up. The DB layer doesn't care about this — RLS reads
    // is_super_admin() directly via viewer_agency_ids().
    role:         isSuper ? "super_admin" : me.role,
    tier:         me.tier,
    agency_id:    me.agency_id,
    agency_name:  me.agency_name,
    upline_id:    me.upline_id,
    downline_ids,
    is_demo:      me.agency_id === DEMO_AGENCY_ID,
    is_super_admin: isSuper,
    authenticated: true,
  }), { status: 200, headers: corsHeaders() });
}
