#!/usr/bin/env node
// Number pool warmup. Buy N local DIDs in target area codes, assign them
// to the SIP trunk, register them as `warming` in the phone_numbers
// table. Spam-rotation cron promotes warming → active after 24h with no
// flag, marks `flagged` and auto-rebuys on low connect-rate.
//
// Usage:
//   node scripts/warm-number-pool.js --area=305 --count=5 --agency=<uuid>
//   node scripts/warm-number-pool.js --area=305 --count=5 --agency=<uuid> --dry-run
//
// Buys $1.15/mo per local DID. ALWAYS dry-runs in trial mode (Twilio
// blocks number purchase on trial accounts).

import twilio from 'twilio';
import { config } from '../src/config.js';
import { db } from '../src/db.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const DRY_RUN  = args['dry-run'] || args['n'];
const AREA     = args.area;
const COUNT    = Number(args.count || 5);
const AGENCY   = args.agency;
const TRUNK_SID = process.env.TWILIO_SIP_TRUNK_SID;

if (!AGENCY) { console.error('--agency=<uuid> required'); process.exit(1); }
if (!AREA)   { console.error('--area=<area_code> required'); process.exit(1); }

async function main() {
  const client = twilio(config.twilioSid, config.twilioToken);

  // 1. Check account is upgraded — trial accounts can't purchase
  const acct = await client.api.v2010.accounts(config.twilioSid).fetch();
  if (acct.type === 'Trial' && !DRY_RUN) {
    console.error(`Account is ${acct.type}; number purchase is locked on trial.`);
    console.error('Upgrade at console.twilio.com → top-right menu → Upgrade.');
    process.exit(1);
  }
  console.log(`Account: ${acct.friendlyName} (${acct.type}, balance pending)`);

  // 2. Search for available numbers in the area code
  console.log(`# Searching ${COUNT} available local numbers in area ${AREA}`);
  const available = await client.availablePhoneNumbers('US').local.list({
    areaCode: AREA,
    smsEnabled: true,
    voiceEnabled: true,
    limit: COUNT * 2, // buffer in case some get snapped up between search + purchase
  });
  console.log(` found ${available.length} candidates`);
  if (!available.length) {
    console.error(' no numbers available in this area code; try a different one');
    process.exit(2);
  }

  // 3. Purchase + register
  const purchased = [];
  for (const cand of available.slice(0, COUNT)) {
    if (DRY_RUN) {
      console.log(` [dry-run] would BUY ${cand.phoneNumber}`);
      purchased.push({ e164: cand.phoneNumber, twilio_sid: 'PNxxx', area_code: AREA });
      continue;
    }
    try {
      const bought = await client.incomingPhoneNumbers.create({
        phoneNumber: cand.phoneNumber,
        ...(TRUNK_SID ? { trunkSid: TRUNK_SID } : {}),
        smsUrl: `${config.publicUrl}/webhook/twilio/sms-in`,
        statusCallback: `${config.publicUrl}/webhook/twilio/status`,
      });
      console.log(` ✓ bought ${bought.phoneNumber}  sid=${bought.sid}`);
      purchased.push({ e164: bought.phoneNumber, twilio_sid: bought.sid, area_code: AREA });
    } catch (e) {
      console.error(` ✗ ${cand.phoneNumber} failed:`, e.message);
    }
  }

  if (!purchased.length) { console.error('nothing purchased'); process.exit(3); }

  // 4. Register in phone_numbers table
  console.log(`# Registering ${purchased.length} numbers in phone_numbers table`);
  if (DRY_RUN) {
    console.log(' [dry-run] would INSERT', purchased);
  } else {
    const rows = purchased.map((p) => ({
      agency_id:  AGENCY,
      twilio_sid: p.twilio_sid,
      e164:       p.e164,
      area_code:  p.area_code,
      type:       'local',
      status:     'warming',
    }));
    const { data, error } = await db.from('phone_numbers').insert(rows).select();
    if (error) console.error(' insert failed:', error);
    else       console.log(` ✓ inserted ${data.length} phone_numbers rows`);
  }

  console.log(`\nDone. Numbers start as 'warming'; spam-rotation cron promotes to 'active' after 24h.`);
  console.log(`Estimated monthly cost: $${(purchased.length * 1.15).toFixed(2)}/mo for the numbers themselves.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
