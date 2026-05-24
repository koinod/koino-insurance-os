#!/usr/bin/env node
// Spam-health rotation cron. Run every hour:
//   - For each `active` number, recompute 24h connect-rate and abandons
//   - Mark `flagged` if connect-rate < threshold (~25% in our model) or
//     abandons-per-attempt > 5%
//   - For each `warming` number with 24h of clean history, promote to
//     `active`
//   - For each `flagged` number, retire it (release back to Twilio if
//     RETIRE_RELEASE=true) and trigger a replacement buy
//
// Usage:
//   node scripts/health-rotate-numbers.js [--dry-run]
//
// Wire in launchd or Fly.io cron (every 60min).

import { db } from '../src/db.js';
import { logger } from '../src/logger.js';

const DRY = process.argv.includes('--dry-run');

const CONNECT_RATE_FLOOR = Number(process.env.NUMBER_CONNECT_RATE_FLOOR  || 0.25);
const ABANDON_RATE_CEIL  = Number(process.env.NUMBER_ABANDON_RATE_CEIL   || 0.05);
const WARMING_HOURS      = Number(process.env.NUMBER_WARMING_HOURS       || 24);
const RETIRE_RELEASE     = (process.env.RETIRE_RELEASE === 'true');

async function recompute24h() {
  // Re-aggregate from call_attempts in the last 24h, per from_number.
  const { data: rows, error } = await db.rpc('recompute_phone_number_health_24h', {});
  if (error && error.code === 'PGRST202') {
    // RPC doesn't exist yet; fall back to manual aggregation here.
    console.warn('recompute_phone_number_health_24h RPC missing; using manual fallback');
    return await recomputeManual();
  }
  if (error) throw error;
  return rows;
}

async function recomputeManual() {
  // Pull all phone_numbers, join against call_attempts of last 24h, update counters.
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: nums } = await db.from('phone_numbers').select('id, e164');
  const updates = [];
  for (const n of nums || []) {
    const { data: attempts } = await db
      .from('call_attempts')
      .select('id, disposition, bridged_to_rep_at')
      .eq('from_number', n.e164)
      .gte('fired_at', cutoff);
    const attempts_24h = (attempts || []).length;
    const connects_24h = (attempts || []).filter((a) => a.disposition === 'connected').length;
    const abandons_24h = (attempts || []).filter((a) => a.disposition === 'failed' && !a.bridged_to_rep_at).length;
    updates.push({ id: n.id, attempts_24h, connects_24h, abandons_24h });
  }
  for (const u of updates) {
    await db.from('phone_numbers').update({
      attempts_24h: u.attempts_24h,
      connects_24h: u.connects_24h,
      abandons_24h: u.abandons_24h,
      last_health_check: new Date().toISOString(),
    }).eq('id', u.id);
  }
  return updates;
}

async function main() {
  logger.info({ DRY }, 'health-rotate-numbers starting');
  const updates = await recompute24h();

  // Apply state transitions
  const { data: nums } = await db.from('phone_numbers')
    .select('id, e164, status, attempts_24h, connects_24h, abandons_24h, acquired_at, twilio_sid, agency_id, area_code');

  let flagged = 0, promoted = 0, retired = 0;
  for (const n of nums || []) {
    const connectRate = n.attempts_24h ? n.connects_24h / n.attempts_24h : 1;
    const abandonRate = n.attempts_24h ? n.abandons_24h / n.attempts_24h : 0;

    // active → flagged
    if (n.status === 'active' && n.attempts_24h >= 10) {
      if (connectRate < CONNECT_RATE_FLOOR || abandonRate > ABANDON_RATE_CEIL) {
        logger.info({ e164: n.e164, connectRate, abandonRate }, 'flagging');
        flagged++;
        if (!DRY) await db.from('phone_numbers').update({
          status: 'flagged', flagged_at: new Date().toISOString(),
          flagged_reason: `connect=${connectRate.toFixed(2)} abandon=${abandonRate.toFixed(2)}`,
        }).eq('id', n.id);
      }
    }

    // warming → active
    if (n.status === 'warming') {
      const ageHours = (Date.now() - new Date(n.acquired_at).getTime()) / 3600_000;
      if (ageHours >= WARMING_HOURS && n.attempts_24h >= 5 && connectRate >= CONNECT_RATE_FLOOR) {
        logger.info({ e164: n.e164 }, 'promoting warming → active');
        promoted++;
        if (!DRY) await db.from('phone_numbers').update({ status: 'active' }).eq('id', n.id);
      }
    }

    // flagged → retired (releases Twilio number if RETIRE_RELEASE=true)
    if (n.status === 'flagged') {
      logger.info({ e164: n.e164 }, 'retiring');
      retired++;
      if (!DRY) {
        await db.from('phone_numbers').update({
          status: 'retired', released_at: new Date().toISOString(),
        }).eq('id', n.id);
        if (RETIRE_RELEASE) {
          // TODO: release via Twilio REST + auto-buy replacement
          // Deferred until first paying tenant — releasing on a $1.15/mo number
          // is rarely worth the spam-trail risk for an experiment.
        }
      }
    }
  }

  logger.info({ flagged, promoted, retired, total: nums?.length || 0 }, 'health-rotate done');
}

main().catch((e) => { logger.error({ err: e }, 'fatal'); process.exit(1); });
