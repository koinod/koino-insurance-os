// GET /api/cron/rba-anomaly-scan — every 6h. Scans rba_installs +
// rba_audit for the same anomalies the admin Devices tab computes
// inline, but persists them as agency-scoped notifications so
// owner/admin/super_admin actually see them in their feed without
// having to open the tab.
import { SUPA_URL, SERVICE, cors } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET or POST" }), { status: 405, headers: cors() });
  }
  const fromCron = req.headers.get("x-vercel-cron") || (req.headers.get("user-agent") || "").includes("vercel-cron");
  const sec = req.headers.get("x-cron-secret");
  if (!fromCron && (!sec || sec !== process.env.CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors() });
  }

  const now = Date.now();
  const since = new Date(now - 4 * 3600000).toISOString();

  const [iR, aR] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/rba_installs?select=device_id,user_id,agency_id,hostname,status,last_seen_at`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }),
    fetch(`${SUPA_URL}/rest/v1/rba_audit?select=device_id,result&created_at=gte.${since}`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }),
  ]);
  const installs = iR.ok ? await iR.json() : [];
  const audit    = aR.ok ? await aR.json() : [];

  const byDev = {};
  audit.forEach(r => { (byDev[r.device_id] ||= { ok:0, denied:0, error:0 })[r.result] += 1; });

  const anomalies = [];
  for (const d of installs) {
    if (d.status !== "active") continue;
    if (d.last_seen_at) {
      const ageHr = (now - new Date(d.last_seen_at).getTime()) / 3600000;
      if (ageHr > 24) anomalies.push({ device_id: d.device_id, agency_id: d.agency_id, kind: "stale_heartbeat", detail: `${d.hostname || d.device_id.slice(0,8)} stale ${Math.floor(ageHr)}h` });
    }
    const c = byDev[d.device_id];
    if (c && (c.ok + c.denied + c.error) >= 10) {
      const total = c.ok + c.denied + c.error;
      if (c.denied / total > 0.3) anomalies.push({ device_id: d.device_id, agency_id: d.agency_id, kind: "deny_spike", detail: `${c.denied}/${total} denied (last 4h)` });
      if (c.error  / total > 0.2) anomalies.push({ device_id: d.device_id, agency_id: d.agency_id, kind: "error_spike", detail: `${c.error}/${total} errored (last 4h)` });
    }
  }

  // Best-effort: write to notifications. Fail silently if the table shape
  // doesn't match what we expect.
  for (const a of anomalies) {
    await fetch(`${SUPA_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        agency_id: a.agency_id,
        kind: "rba_anomaly",
        severity: a.kind === "stale_heartbeat" ? "warn" : "danger",
        title: `Agent anomaly: ${a.kind}`,
        body: a.detail,
        meta: { device_id: a.device_id, kind: a.kind },
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ scanned: installs.length, anomalies: anomalies.length }), { status: 200, headers: cors() });
}
