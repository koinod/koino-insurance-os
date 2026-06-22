// /api/me — returns the current viewer's identity (rep + agency + downline ids).
// Closes GAP-X4 — auth identity link.
//
// Reads the user JWT from `Authorization` or `x-supabase-auth` header,
// hits the public.me() Postgres function via PostgREST, joins downline_of() so
// the UI gets the full set of rep_ids the viewer can scope queries to.
//
// Response shape (always 200, fields may be null for unauthed callers):
//   { rep_id, user_id, full_name, handle, role, tier, agency_id, agency_name,
//     upline_id, downline_ids: [text], is_demo: bool, is_super_admin: bool }
//
// FREE: no model calls, no paid services. Pure Postgres RPC.

export const config = { runtime: "edge" };

import { DEMO_AGENCY_ID } from "../lib/demo.js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

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

function decodeJwtPayload(jwt) {
  try {
    const payload = String(jwt || "").split(".")[1];
    if (!payload) return {};
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

async function viewerIsSuperAdmin(jwt, me) {
  if (me?.is_super_admin === true) return true;
  if (!jwt) return false;
  const v = await callRpc("viewer_is_super_admin", {}, jwt);
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.some((row) => row === true || row?.viewer_is_super_admin === true || row?.is_super_admin === true);
  return !!(v && (v.viewer_is_super_admin === true || v.is_super_admin === true));
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: corsHeaders() });
  }

  const auth = req.headers.get("authorization") || req.headers.get("x-supabase-auth") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "") || null;

  // me() returns 0 or 1 row
  const meRows = await callRpc("me", {}, jwt);
  const me = Array.isArray(meRows) && meRows.length > 0 ? meRows[0] : null;
  const isSuperAdmin = await viewerIsSuperAdmin(jwt, me);

  // Handle the case where the user is signed in but not yet in the `reps` table.
  // This happens for new signups who haven't been added to an agency yet.
  if (jwt && (!me || !me.rep_id)) {
    if (isSuperAdmin) {
      const claims = decodeJwtPayload(jwt);
      return new Response(JSON.stringify({
        rep_id: null,
        user_id: claims.sub || null,
        full_name: claims.user_metadata?.full_name || claims.email || "Platform Admin",
        handle: claims.email ? `@${String(claims.email).split("@")[0]}` : "@platform-admin",
        role: "super_admin",
        agency_role: null,
        tier: null,
        agency_id: null,
        agency_name: "Koino HQ",
        upline_id: null,
        downline_ids: [],
        is_demo: false,
        is_super_admin: true,
        authenticated: true,
        needs_onboarding: false,
      }), { status: 200, headers: corsHeaders() });
    }
    return new Response(JSON.stringify({
      rep_id: null,
      user_id: null, // We could decode the JWT to get this if needed
      full_name: "Unmapped User",
      role: "unmapped",
      agency_id: null,
      is_super_admin: false,
      authenticated: true,
      needs_onboarding: true,
    }), { status: 200, headers: corsHeaders() });
  }

  // Anonymous / signed-out callers get the demo identity.
  // Read-only because anon RLS only grants SELECT on Atlas-scoped rows.
  if (!me || !me.rep_id) {
    return new Response(JSON.stringify({
      rep_id: "demo-user",
      user_id: null,
      full_name: "Demo User",
      handle: "@demo",
      role: "owner",
      tier: "bronze",
      agency_id: DEMO_AGENCY_ID,
      agency_name: "Demo Agency",
      upline_id: null,
      downline_ids: [],
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
    role:         isSuperAdmin ? "super_admin" : me.role,
    agency_role:  me.role,
    tier:         me.tier,
    agency_id:    me.agency_id,
    agency_name:  me.agency_name,
    upline_id:    me.upline_id,
    subscription_status: me.subscription_status || "trialing",
    downline_ids,
    is_demo:      me.agency_id === DEMO_AGENCY_ID,
    is_super_admin: isSuperAdmin,
    authenticated: true,
  }), { status: 200, headers: corsHeaders() });
}
