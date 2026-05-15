// /api/client-error — accepts a JSON error report from the browser, writes
// to public.client_errors. Lib counterpart: lib/error-reporter.js.
//
// Anonymous writes allowed (the error may happen before auth resolves);
// rate-limited by client-side cooldown in the reporter. RLS on the table
// restricts reads to super_admin.
//
// FREE: no model calls. Pure Supabase insert.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

const cors = () => ({
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
});

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  // Drop obviously empty reports — browser sometimes fires window.error
  // for cross-origin script failures with no message + no stack.
  if (!body.message && !body.stack) {
    return new Response(JSON.stringify({ ok: true, dropped: "empty" }), { status: 200, headers: cors() });
  }

  const row = {
    message:    String(body.message || "").slice(0, 2000),
    stack:      String(body.stack   || "").slice(0, 8000),
    source:     String(body.source  || "").slice(0, 500),
    line_num:   Number(body.line)   || null,
    column_num: Number(body.column) || null,
    page_url:   String(body.url     || "").slice(0, 500),
    user_agent: String(body.user_agent || "").slice(0, 500),
    viewer:     body.viewer || null,
    kind:       String(body.kind || "error").slice(0, 50),
    occurred_at: body.ts || new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/client_errors`, {
      method: "POST",
      headers: {
        "apikey": ANON,
        "authorization": `Bearer ${ANON}`,
        "content-type": "application/json",
        "prefer": "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, status: r.status }), { status: 200, headers: cors() });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: cors() });
  }
}
