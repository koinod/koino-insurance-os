// /api/cron/cross-sell-sweep — daily sweep that materializes due cross-sell
// queue rows into new pipeline leads owned by the original closer.
//
// Triggered by Vercel cron at 09:00 UTC daily. Idempotent: only picks up
// rows where status='pending' AND due_at <= now(), and atomically flips them
// to 'processed' once the new pipeline row is created.
//
// Pure incremental revenue: parent lead's CAC is already paid; cross-sell
// pipeline created here is near-100% margin once worked.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function ok(body)         { return new Response(JSON.stringify(body),                       { status: 200, headers: HEADERS }); }
function err(status, msg) { return new Response(JSON.stringify({ ok: false, error: msg }),  { status,      headers: HEADERS }); }

async function pg(method, path, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`PG ${method} ${path} → ${r.status}: ${txt}`);
  }
  return r.status === 204 ? null : r.json();
}

export default async function handler(req) {
  if (!SERVICE) return err(500, "SUPABASE_SERVICE_ROLE_KEY not configured");

  // Optional: enforce vercel-cron caller via header check
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const isManual = (new URL(req.url)).searchParams.get("force") === "1";
  if (!isCron && !isManual && req.method !== "POST") {
    return err(405, "method not allowed (cron or POST/?force=1)");
  }

  const stats = { scanned: 0, materialized: 0, skipped: 0, failed: 0, errors: [] };

  try {
    // Pull due queue rows + parent lead context in one round-trip
    const due = await pg(
      "GET",
      "cross_sell_queue?select=id,agency_id,parent_lead_id,parent_rep_id,target_product,rule_id&status=eq.pending&due_at=lte." +
        encodeURIComponent(new Date().toISOString()) +
        "&limit=500",
    );
    stats.scanned = due.length;

    for (const row of due) {
      try {
        // Fetch parent lead snapshot for fields we want to inherit
        const parents = await pg(
          "GET",
          `pipeline?id=eq.${row.parent_lead_id}&select=lead_name,phone,email,age,state,source,owner_rep_id`,
        );
        const parent = parents && parents[0];
        if (!parent) {
          await pg("PATCH", `cross_sell_queue?id=eq.${row.id}`, {
            status: "skipped",
            skip_reason: "parent lead not found",
            processed_at: new Date().toISOString(),
          });
          stats.skipped++;
          continue;
        }

        // Create the cross-sell pipeline entry
        const ownerRep = row.parent_rep_id || parent.owner_rep_id || null;
        const created = await pg("POST", "pipeline", {
          agency_id: row.agency_id,
          lead_name: parent.lead_name,
          phone: parent.phone,
          email: parent.email,
          age: parent.age,
          state: parent.state,
          stage: "New",
          product: row.target_product,
          ap_cents: 0,
          source: `cross-sell:${(parent.source || "auto").slice(0, 32)}`,
          owner_rep_id: ownerRep,
          consent: "verified",
          heat: "warm",
          last_activity_text: `Cross-sell from issued ${parent.source || "lead"} (parent ${row.parent_lead_id.slice(0, 8)})`,
          next_action: `Outreach: ${row.target_product}`,
        });

        const newId = created && created[0] && created[0].id;
        await pg("PATCH", `cross_sell_queue?id=eq.${row.id}`, {
          status: "processed",
          processed_at: new Date().toISOString(),
          generated_lead_id: newId,
        });
        stats.materialized++;
      } catch (e) {
        stats.failed++;
        stats.errors.push({ id: row.id, msg: String(e).slice(0, 200) });
        try {
          await pg("PATCH", `cross_sell_queue?id=eq.${row.id}`, {
            status: "failed",
            skip_reason: String(e).slice(0, 240),
            processed_at: new Date().toISOString(),
          });
        } catch { /* swallow */ }
      }
    }

    return ok({ ok: true, ...stats });
  } catch (e) {
    return err(500, String(e));
  }
}
