// /api/invites/create — mints an agency invite token + URL.
// Supports: role, email_hint, upline_rep_id, label, max_uses, perma (no expiry)

import { loadCallerFromJwt, checkRateLimit, verifyRequestOrigin } from "../agent/_lib.js";

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // 1. Verify request origin
  if (!verifyRequestOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden: unauthorized origin" }), { status: 403, headers: { "content-type": "application/json" } });
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), { status: 401, headers: { "content-type": "application/json" }});
  }
  const jwt = auth.slice(7);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

  // 2. Load caller identity and verify authorization
  const caller = await loadCallerFromJwt(jwt);
  if (!caller) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  // 3. Enforce Server-Side Role Guard
  const ALLOWED_CREATOR_ROLES = ["owner", "manager", "super_admin", "admin", "imo_owner"];
  if (!ALLOWED_CREATOR_ROLES.includes(caller.role)) {
    return new Response(JSON.stringify({ error: `Forbidden: role ${caller.role} cannot mint invites` }), { status: 403, headers: { "content-type": "application/json" } });
  }

  // 4. Rate Limiting Check
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!checkRateLimit(ip, caller.user_id)) {
    return new Response(JSON.stringify({ error: "too many requests, rate limit exceeded" }), { status: 429, headers: { "content-type": "application/json" } });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  body = body || {};

  // 5. Input Validation
  if (typeof body.agency_id !== "string" || !UUID_REGEX.test(body.agency_id)) {
    return new Response(JSON.stringify({ error: "agency_id must be a valid UUID string" }), { status: 400 });
  }
  const ALLOWED_INVITE_ROLES = ["rep","manager","owner","admin"];
  if (body.role != null && (typeof body.role !== "string" || !ALLOWED_INVITE_ROLES.includes(body.role))) {
    return new Response(JSON.stringify({ error: `role must be one of: ${ALLOWED_INVITE_ROLES.join(", ")}` }), { status: 400 });
  }
  if (body.email_hint != null && (typeof body.email_hint !== "string" || body.email_hint.length > 320)) {
    return new Response(JSON.stringify({ error: "email_hint must be a string ≤ 320 chars" }), { status: 400 });
  }
  if (body.upline_rep_id != null && (typeof body.upline_rep_id !== "string" || body.upline_rep_id.length > 64)) {
    return new Response(JSON.stringify({ error: "upline_rep_id must be a string ≤ 64 chars" }), { status: 400 });
  }
  if (body.label != null && (typeof body.label !== "string" || body.label.length > 128)) {
    return new Response(JSON.stringify({ error: "label must be a string ≤ 128 chars" }), { status: 400 });
  }

  const {
    agency_id,
    role = "rep",
    email_hint = null,
    upline_rep_id = null,
    label = null,
    max_uses = 1,
    perma = false,
    expires_at = null,
  } = body;

  // Validate expiry date format and logical boundary
  if (expires_at != null) {
    if (isNaN(Date.parse(expires_at))) {
      return new Response(JSON.stringify({ error: "expires_at must be a valid date string" }), { status: 400 });
    }
    if (new Date(expires_at) <= new Date()) {
      return new Response(JSON.stringify({ error: "expires_at must be a date in the future" }), { status: 400 });
    }
  }

  // Validate max uses
  if (max_uses != null) {
    const parsedMax = parseInt(max_uses, 10);
    if (isNaN(parsedMax) || parsedMax < 1 || parsedMax > 1000) {
      return new Response(JSON.stringify({ error: "max_uses must be an integer between 1 and 1000" }), { status: 400 });
    }
  }


  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/mint_invite`, {
    method: "POST",
    headers: { "apikey": anonKey, "authorization": `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_agency_id:     agency_id,
      p_role:          role,
      p_email_hint:    email_hint,
      p_upline_rep_id: upline_rep_id,
      p_label:         label,
      p_max_uses:      perma ? null : (Number.isInteger(max_uses) && max_uses > 0 ? max_uses : 1),
      p_perma:         !!perma,
      p_expires_at:    perma ? null : expires_at,
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: "mint failed", detail }), { status: r.status, headers: { "content-type": "application/json" }});
  }
  const token = (await r.text()).replace(/"/g, "");
  const origin = new URL(req.url).origin;
  const invite_url = `${origin}/?invite=${token}`;
  const final_expires_at = perma ? null : (expires_at ? expires_at : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());

  return new Response(JSON.stringify({ token, invite_url, expires_at: final_expires_at, role, label, max_uses: perma ? null : max_uses, perma }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
