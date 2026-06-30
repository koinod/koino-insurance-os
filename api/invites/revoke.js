// /api/invites/revoke — soft-deletes an invite link so it can no longer be used.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), { status: 401, headers: { "content-type": "application/json" }});
  }
  const jwt = auth.slice(7);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }

  const { token } = body || {};
  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ error: "token required" }), { status: 400 });
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
