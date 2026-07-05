// /api/invites/create — mints an agency invite token + URL.
// Supports: role, email_hint, upline_rep_id, label, max_uses, perma (no expiry)

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
  body = body || {};

  if (typeof body.agency_id !== "string" || body.agency_id.length === 0 || body.agency_id.length > 64) {
    return new Response(JSON.stringify({ error: "agency_id must be a non-empty string ≤ 64 chars" }), { status: 400 });
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
