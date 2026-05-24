import { config } from './config.js';
import { db, logCompliance, getAbandonmentRate } from './db.js';

// State → IANA timezone (US lower-48 + AK/HI). Approximate; states that
// straddle two TZs are mapped to their majority TZ. Good enough for the
// FTC 8am–9pm window check; not for billing.
const STATE_TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York',
  LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver',
  NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', SD: 'America/Chicago',
  TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
  DC: 'America/New_York',
};

// Two-party recording-consent states (require disclosure played at call start).
// As of 2026, the conservative set used by most enterprise dialers:
export const TWO_PARTY_STATES = new Set([
  'CA','CT','FL','IL','MD','MA','MT','NV','NH','PA','WA',
]);

export function inCallingWindow(stateCode, now = new Date()) {
  const tz = STATE_TZ[stateCode?.toUpperCase()] || 'America/New_York';
  const hr = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', hour12: false,
  }).format(now));
  return hr >= config.callingWindowStart && hr < config.callingWindowEnd;
}

// SMS opt-out check (existing table sms_optouts).
export async function isPhoneSmsOptedOut(agencyId, e164) {
  const { data, error } = await db
    .from('sms_optouts')
    .select('phone')
    .eq('agency_id', agencyId)
    .eq('phone', e164)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// DNC check — for now: scrub against agency-level opt-outs (sms_optouts
// proxies as "do not contact" since insurance leads who opt-out of SMS
// generally don't want voice either). National DNC SAN scrubbing is a
// Phase 2 add — leaves a TODO so it doesn't silently get forgotten.
export async function isPhoneDnc(agencyId, e164) {
  return await isPhoneSmsOptedOut(agencyId, e164);
  // TODO(phase-2): cross-reference national DNC list via FreeCarrierLookup
  // or DNC.com SAN — see services/power-dialer/README.md "Compliance roadmap".
}

// Preflight check for a single attempt. Returns either { ok: true } or
// { ok: false, disposition: 'dnc_blocked'|'window_blocked', reason }.
// The session worker logs a compliance_events row + a call_attempts row
// stamped with the disposition so it's auditable but doesn't dial.
export async function preflight({ agencyId, sessionId, e164, state }) {
  if (await isPhoneDnc(agencyId, e164)) {
    await logCompliance({
      agency_id: agencyId, session_id: sessionId,
      event_type: 'dnc_block', to_number: e164, state,
    });
    return { ok: false, disposition: 'dnc_blocked', reason: 'opted_out' };
  }
  if (!inCallingWindow(state)) {
    await logCompliance({
      agency_id: agencyId, session_id: sessionId,
      event_type: 'window_block', to_number: e164, state,
    });
    return { ok: false, disposition: 'window_blocked', reason: `outside ${config.callingWindowStart}-${config.callingWindowEnd}` };
  }
  return { ok: true };
}

// FTC 3% abandonment guard. Worker calls this before each batch; if
// agency is over hardStop, marks session aborted_compliance and returns
// false to halt further dialing.
export async function abandonmentSafe(agencyId) {
  const rate = await getAbandonmentRate(agencyId);
  return { ok: rate < config.abandonmentHardStop, rate };
}
