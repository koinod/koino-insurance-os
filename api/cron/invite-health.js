// /api/cron/invite-health — nightly scan for broken state in the invite +
// downline flow. After redeem_invite silently lost rep-creation in migration
// 0037 and sat broken for 2+ days, the team needs to be told the moment any
// future regression produces an orphan, a dangling upline, or an unredeemed
// invite. This cron is that signal.
//
// Daily at 13:00 UTC (see vercel.json). Calls public.invite_health_snapshot()
// via the service role; for each agency with any non-zero count, inserts an
// agency_notifications row targeted at every owner/admin/imo_owner in that
// agency. Idempotent: a 'invite_health_alert' row for the same agency in the
// last 22 hours suppresses re-firing.
//
// Auth: CRON_SECRET like the rest of api/cron/*.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function json(p, s = 200) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function authKey(req) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function pgRpc(fn, args = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function pgGet(path, query = "") {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}${query ? "?" + query : ""}`, {
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
  if (!r.ok) throw new Error(`pg ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export default async function handler(req) {
  if (CRON_SECRET && authKey(req) !== CRON_SECRET) return json({ ok: false, error: "auth" }, 401);
  if (!SERVICE)                                     return json({ ok: false, error: "service role key not set" }, 500);

  const summary = {
    agencies_scanned: 0,
    agencies_with_issues: 0,
    alerts_sent: 0,
    suppressed_dup: 0,
    total_orphans: 0,
    total_dangling: 0,
    total_cross_agency: 0,
    total_expired: 0,
    errors: 0,
  };

  try {
    const snapshot = await pgRpc("invite_health_snapshot");
    summary.agencies_scanned = snapshot.length;

    const cutoffISO = new Date(Date.now() - 22 * 3600_000).toISOString();

    for (const row of snapshot) {
      const problems = (row.orphans || 0)
                     + (row.dangling_uplines || 0)
                     + (row.cross_agency_uplines || 0)
                     + (row.expired_unredeemed_14d || 0);
      if (problems === 0) continue;
      summary.agencies_with_issues++;
      summary.total_orphans       += (row.orphans || 0);
      summary.total_dangling      += (row.dangling_uplines || 0);
      summary.total_cross_agency  += (row.cross_agency_uplines || 0);
      summary.total_expired       += (row.expired_unredeemed_14d || 0);

      // Idempotency — suppress within 22h
      const existing = await pgGet(
        "agency_notifications",
        `select=id&agency_id=eq.${row.agency_id}&kind=eq.invite_health_alert&created_at=gt.${cutoffISO}&limit=1`,
      ).catch(() => []);
      if (existing.length > 0) { summary.suppressed_dup++; continue; }

      // Audit row in invite_events for forensics
      await pgInsert("invite_events", {
        event:     "health_alert",
        agency_id: row.agency_id,
        payload:   {
          orphans:                row.orphans || 0,
          dangling_uplines:       row.dangling_uplines || 0,
          cross_agency_uplines:   row.cross_agency_uplines || 0,
          expired_unredeemed_14d: row.expired_unredeemed_14d || 0,
          pending_invites:        row.pending_invites || 0,
        },
      }).catch((e) => console.warn("[invite-health.audit_insert]", e.message));

      // Find every active owner-ish member in this agency to notify
      const recipients = await pgGet(
        "agency_members",
        `select=rep_id&agency_id=eq.${row.agency_id}&active=eq.true&role=in.(owner,admin,imo_owner,super_admin)`,
      ).catch(() => []);

      const parts = [];
      if (row.orphans)              parts.push(`${row.orphans} orphan member${row.orphans===1?'':'s'} (no rep row)`);
      if (row.dangling_uplines)     parts.push(`${row.dangling_uplines} dangling upline${row.dangling_uplines===1?'':'s'}`);
      if (row.cross_agency_uplines) parts.push(`${row.cross_agency_uplines} cross-agency upline${row.cross_agency_uplines===1?'':'s'}`);
      if (row.expired_unredeemed_14d) parts.push(`${row.expired_unredeemed_14d} expired invite${row.expired_unredeemed_14d===1?'':'s'} (14d)`);
      const title = `Invite hierarchy needs attention · ${parts[0]}`;
      const body  = parts.join(' · ') + ` · See Admin → Invite activity for token-level forensics.`;

      for (const r of recipients) {
        if (!r.rep_id) continue;
        await pgInsert("agency_notifications", {
          agency_id: row.agency_id,
          kind: "invite_health_alert",
          severity: "warn",
          title,
          body,
          page_link: "admin",
          ref_id: null,
          recipient_rep_id: r.rep_id,
        }).catch((e) => { console.warn("[invite-health.notify_insert]", e.message); summary.errors++; });
        summary.alerts_sent++;
      }
    }
  } catch (e) {
    summary.errors++;
    summary.error_detail = e?.message || String(e);
  }

  return json({ ok: true, ...summary });
}
