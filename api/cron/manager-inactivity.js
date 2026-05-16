// /api/cron/manager-inactivity — daily auto-escalation for inactive managers.
//
// GAP-OE2 — agencies were silently degrading whenever a manager stopped
// running 1:1s, marking notes, or auditing activity. By the time the owner
// noticed, the downline had drifted for weeks. This cron does the noticing.
//
// Daily at 09:00 UTC (see vercel.json). For each agency, finds managers
// (agency_members.role = 'manager') with zero recent activity across:
//   - coaching_notes.created_at within last 5 days
//   - coaching_sessions.completed_at within last 5 days
//   - agency_audit_log.created_at within last 5 days (filtered by actor)
// and inserts an agency-scoped notification targeted at the owner role.
//
// Idempotent: a notification is only inserted when no existing
// 'manager_inactive' row exists for the same recipient + same target rep
// in the last 5 days.
//
// Auth: hard-gated on CRON_SECRET like the rest of api/worker/*.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

const INACTIVE_DAYS = 5;

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

async function pgGet(path, query = "") {
  const url = `${SUPA_URL}/rest/v1/${path}${query ? "?" + query : ""}`;
  const r = await fetch(url, {
    headers: { "apikey": SERVICE, "authorization": `Bearer ${SERVICE}` },
  });
  if (!r.ok) throw new Error(`pg ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function pgInsert(table, row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
      "prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`pg ${table} insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export default async function handler(req) {
  if (CRON_SECRET && authKey(req) !== CRON_SECRET) return json({ ok: false, error: "auth" }, 401);
  if (!SERVICE)                                     return json({ ok: false, error: "service role key not set" }, 500);

  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400_000).toISOString();
  const summary = { agencies: 0, managers_checked: 0, alerts_sent: 0, errors: 0 };

  try {
    // Pull every agency-member row in the manager role across the platform.
    // Multi-tenant safe: each row carries agency_id + rep_id + handle.
    const managers = await pgGet(
      "agency_members",
      `select=agency_id,rep_id,user_id&role=eq.manager&active=eq.true`,
    );
    summary.managers_checked = managers.length;
    const byAgency = {};
    for (const m of managers) {
      if (!m.agency_id) continue;
      (byAgency[m.agency_id] ||= []).push(m);
    }
    summary.agencies = Object.keys(byAgency).length;

    for (const [agencyId, mgrs] of Object.entries(byAgency)) {
      // Resolve the owner of this agency to use as recipient
      const owners = await pgGet(
        "agency_members",
        `select=rep_id&agency_id=eq.${agencyId}&role=eq.owner&active=eq.true&limit=1`,
      );
      const ownerRepId = owners[0]?.rep_id;
      if (!ownerRepId) continue;

      for (const mgr of mgrs) {
        if (!mgr.rep_id) continue;
        // Has the manager touched anything in the last N days?
        const [notes, sessions, audits] = await Promise.all([
          pgGet("coaching_notes",    `select=id&agency_id=eq.${agencyId}&created_by=eq.${mgr.rep_id}&created_at=gt.${cutoff}&limit=1`).catch(() => []),
          pgGet("coaching_sessions", `select=id&agency_id=eq.${agencyId}&coach_handle=eq.${mgr.rep_id}&completed_at=gt.${cutoff}&limit=1`).catch(() => []),
          pgGet("agency_audit_log",  `select=id&agency_id=eq.${agencyId}&actor_role=eq.manager&created_at=gt.${cutoff}&limit=1`).catch(() => []),
        ]);
        const recentTouches = (notes.length || 0) + (sessions.length || 0) + (audits.length || 0);
        if (recentTouches > 0) continue;

        // Idempotency — skip if we already alerted on this manager recently.
        const existing = await pgGet(
          "agency_notifications",
          `select=id&agency_id=eq.${agencyId}&kind=eq.manager_inactive&ref_id=eq.${mgr.rep_id}&created_at=gt.${cutoff}&limit=1`,
        ).catch(() => []);
        if (existing.length > 0) continue;

        // Get a friendly manager name from reps if available
        let mgrName = mgr.rep_id;
        try {
          const reps = await pgGet("reps", `select=name&id=eq.${mgr.rep_id}&limit=1`);
          if (reps[0]?.name) mgrName = reps[0].name;
        } catch (e) { console.warn("[cron.manager-inactivity.repNameLookup]", mgr.rep_id, e); }

        await pgInsert("agency_notifications", {
          agency_id: agencyId,
          kind: "manager_inactive",
          severity: "warn",
          title: `${mgrName} inactive ${INACTIVE_DAYS}+ days`,
          body: `No coaching notes, sessions, or audit activity from ${mgrName} since ${cutoff.slice(0, 10)}. Drop in or reassign their book.`,
          page_link: "tree",
          ref_id: mgr.rep_id,
          recipient_rep_id: ownerRepId,
        });
        summary.alerts_sent++;
      }
    }
  } catch (e) {
    summary.errors++;
    summary.error_detail = e?.message || String(e);
  }

  return json({ ok: true, ...summary });
}
