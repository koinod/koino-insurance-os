// /api/invites/revoke — soft-deletes an invite link so it can no longer be used.

import { loadCallerFromJwt, checkRateLimit, verifyRequestOrigin } from "../agent/_lib.js";

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const TOKEN_REGEX = /^rfi_[0-9a-f]{32}$/i;

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
    return new Response(JSON.stringify({ error: `Forbidden: role ${caller.role} cannot revoke invites` }), { status: 403, headers: { "content-type": "application/json" } });
  }

  // 4. Rate Limiting Check
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!checkRateLimit(ip, caller.user_id)) {
    return new Response(JSON.stringify({ error: "too many requests, rate limit exceeded" }), { status: 429, headers: { "content-type": "application/json" } });
  }

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }

  const { token } = body || {};
  if (!token || typeof token !== "string" || !TOKEN_REGEX.test(token)) {
    return new Response(JSON.stringify({ error: "valid token required" }), { status: 400 });
  }

  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/revoke_invite`, {
    method: "POST",
    headers: { "apikey": anonKey, "authorization": `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: token })
  });

  if (!r.ok) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: "revoke failed", detail }), { status: r.status, headers: { "content-type": "application/json" }});
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
