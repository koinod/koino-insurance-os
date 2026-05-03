// /api/invites/create — owner-only. Mints an agency invite token + URL.
// Forwards the user JWT to Supabase so the RLS-secured mint_invite RPC runs
// under the authenticated user's identity.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zybndnqnbxarpkhqpcxq.supabase.co";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), { status: 401, headers: { "content-type": "application/json" }});
  }
  const jwt = auth.slice(7);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W";

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  const { agency_id, role = "rep", email_hint = null } = body || {};
  if (!agency_id) return new Response(JSON.stringify({ error: "agency_id required" }), { status: 400 });

  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/mint_invite`, {
    method: "POST",
    headers: { "apikey": anonKey, "authorization": `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ p_agency_id: agency_id, p_role: role, p_email_hint: email_hint })
  });
  if (!r.ok) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: "mint failed", detail }), { status: r.status, headers: { "content-type": "application/json" }});
  }
  const token = (await r.text()).replace(/"/g, "");
  const origin = new URL(req.url).origin;
  const invite_url = `${origin}/?invite=${token}`;
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return new Response(JSON.stringify({ token, invite_url, expires_at, role }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
