// /api/cron/score-reps — GAP-X1 predictive engine, nightly server-side scoring.
//
// The risk/breakout heuristics used to run client-side each render off live
// reps.* columns — no history, no trend, recomputed per viewer. This cron
// computes one durable snapshot per rep per day into rep_score_snapshots so
// the Today predictive cards read a consistent, trendable score.
//
// Daily at 08:00 UTC (see vercel.json). Idempotent: upserts on
// (rep_id, as_of_date), so re-running the same day overwrites cleanly.
//
// Formulas are kept IN SYNC with page-today.jsx::computeRiskScore /
// computeBreakoutScore. If you change one, change both. Inputs are stored in
// `inputs` jsonb for transparency (every score traces to raw signals).
//
// Auth: hard-gated on CRON_SECRET like the rest of api/cron/*.

export const config = { runtime: "edge" };

const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

// Mirror of _TIER_TARGETS_FALLBACK in page-today.jsx (dollars).
const TIER_FALLBACK = {
  bronze:   12000,
  silver:   20000,
  gold:     35000,
  platinum: 50000,
  diamond:  null,
};

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
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}${query ? "?" + query : ""}`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  if (!r.ok) throw new Error(`pg GET ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// dollars in, matching the client which works in dollar units.
function tierThreshold(tierTargets, tier) {
  const fromCfg = tierTargets && tierTargets[tier] && tierTargets[tier].threshold;
  return fromCfg || TIER_FALLBACK[tier] || 12000;
}
function computeRisk(rep, thr) {
  let s = 0;
  const today = (rep.today_cents || 0) / 100;
  const mtd   = (rep.mtd_cents   || 0) / 100;
  if ((rep.streak_days || 0) === 0) s += 30;
  if (today === 0)                  s += 25;
  if ((rep.dials || 0) < 30)        s += 20;
  if (mtd < thr * 0.4)              s += 15;
  if (rep.presence === "off")       s += 10;
  if ((rep.streak_days || 0) >= 14) s -= 15;
  return Math.max(0, Math.min(100, s));
}
function computeBreakout(rep, thr) {
  let s = 0;
  const today = (rep.today_cents || 0) / 100;
  const mtd   = (rep.mtd_cents   || 0) / 100;
  if (mtd >= thr * 1.3) s += 30;
  const avgToday = mtd / 22;
  if (today >= avgToday * 1.5 && today > 500) s += 25;
  if ((rep.streak_days || 0) >= 10) s += 20;
  if (rep.presence === "live" && (rep.dials || 0) >= 60) s += 15;
  if ((rep.appts || 0) >= 4) s += 10;
  return Math.max(0, Math.min(100, s));
}

export default async function handler(req) {
  if (!CRON_SECRET || authKey(req) !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  if (!SERVICE) return json({ ok: false, error: "service_role_key_missing" }, 500);

  const today = new Date().toISOString().slice(0, 10);
  let reps = [], agencies = [];
  try {
    [reps, agencies] = await Promise.all([
      pgGet("reps", "select=id,agency_id,streak_days,today_cents,mtd_cents,dials,presence,tier,appts&limit=5000"),
      pgGet("agencies", "select=id,config"),
    ]);
  } catch (e) {
    return json({ ok: false, error: e?.message || "fetch failed" }, 500);
  }

  const tierByAgency = new Map(agencies.map(a => [a.id, (a.config && a.config.tier_targets) || null]));

  const rows = reps.map(rep => {
    const thr = tierThreshold(tierByAgency.get(rep.agency_id), rep.tier || "bronze");
    const risk = computeRisk(rep, thr);
    const breakout = computeBreakout(rep, thr);
    return {
      agency_id: rep.agency_id,
      rep_id: rep.id,
      as_of_date: today,
      risk_score: risk,
      breakout_score: breakout,
      inputs: {
        tier: rep.tier, tier_threshold: thr,
        streak_days: rep.streak_days || 0, today_cents: rep.today_cents || 0,
        mtd_cents: rep.mtd_cents || 0, dials: rep.dials || 0,
        presence: rep.presence, appts: rep.appts || 0,
      },
    };
  }).filter(r => r.agency_id && r.rep_id);

  if (rows.length === 0) return json({ ok: true, scored: 0, as_of_date: today, note: "no reps" });

  // Upsert on (rep_id, as_of_date) — idempotent same-day re-runs.
  const resp = await fetch(`${SUPA_URL}/rest/v1/rep_score_snapshots?on_conflict=rep_id,as_of_date`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    return json({ ok: false, error: `upsert ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 500);
  }

  const flagged = rows.filter(r => r.risk_score >= 50).length;
  const breakouts = rows.filter(r => r.breakout_score >= 50).length;
  return json({ ok: true, as_of_date: today, scored: rows.length, at_risk: flagged, breakouts });
}
