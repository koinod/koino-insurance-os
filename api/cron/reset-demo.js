// /api/cron/reset-demo — automatic demo agency reset every 4 hours.
//
// Calls public.reset_demo_agency('atlas') via Supabase RPC using the service
// role key. Service role bypasses RLS and has no caller JWT, so the RPC's
// is_super_admin() check is skipped — the service role is trusted implicitly.
//
// Schedules via vercel.json crons (see entry below). Can also be hit manually
// from /admin or via curl with the CRON_SECRET header for an on-demand reset.
//
// Auth: CRON_SECRET bearer token (same pattern as api/cron/manager-inactivity).

export const config = { runtime: "edge" };

const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE    = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function json(p, s = 200) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function authKey(req) {
  const h = req.headers.get("authorization") || "";
  return h.replace(/^Bearer\s+/i, "");
}

export default async function handler(req) {
  if (CRON_SECRET && authKey(req) !== CRON_SECRET) {
    return json({ ok: false, error: "auth" }, 401);
  }
  if (!SERVICE) {
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
  }

  const slug = new URL(req.url).searchParams.get("slug") || "atlas";

  try {
    const rpcUrl = `${SUPA_URL}/rest/v1/rpc/reset_demo_agency`;
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "apikey":        SERVICE,
        "authorization": `Bearer ${SERVICE}`,
        "content-type":  "application/json",
        "prefer":        "return=representation",
      },
      body: JSON.stringify({ p_slug: slug }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("[cron.reset-demo] RPC error", r.status, text.slice(0, 300));
      return json({ ok: false, status: r.status, error: text.slice(0, 300) }, 500);
    }

    const result = await r.json();
    console.log("[cron.reset-demo] seeded", result);
    return json({ ok: true, slug, result });

  } catch (e) {
    console.error("[cron.reset-demo] exception", e?.message);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
}
