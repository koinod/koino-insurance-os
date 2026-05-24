#!/usr/bin/env node
// Trial SMS test — send a single iMessage via SendBlue to a verified
// number. Cost: per-message SendBlue rate (covered by your existing
// SendBlue subscription); falls back to Twilio SMS if SendBlue fails.
//
// Usage:
//   node scripts/trial-sms-test.js --to=+1xxxxxxxxxx --msg="Hi from Koino"

import { config } from '../src/config.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const TO = args.to;
const MSG = args.msg || `Hey — Koino Capital test message. Reply STOP to opt out. Schedule any time: https://cal.com/koino`;

if (!TO) { console.error('--to=+1xxxxxxxxxx required'); process.exit(1); }

async function trySendBlue() {
  const key = process.env.SENDBLUE_API_KEY;
  const secret = process.env.SENDBLUE_API_SECRET;
  if (!key || !secret) return { ok: false, lane: 'sendblue', error: 'no_keys' };
  const r = await fetch('https://api.sendblue.co/api/send-message', {
    method: 'POST',
    headers: {
      'sb-api-key-id': key,
      'sb-api-secret-key': secret,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ number: TO, content: MSG }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, lane: 'sendblue', status: r.status, data };
}

async function tryTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_CALLER_ID || '+18449922777';
  if (!sid || !token) return { ok: false, lane: 'twilio', error: 'no_keys' };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: TO, From: from, Body: MSG }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, lane: 'twilio', status: r.status, data };
}

async function main() {
  console.log(`# Sending to ${TO}`);
  console.log(`# Body: ${MSG}`);
  console.log('# 1. Trying SendBlue iMessage lane...');
  const sb = await trySendBlue();
  if (sb.ok) {
    console.log(' ✓ SendBlue sent');
    console.log('   id:', sb.data?.message_handle || sb.data?.uuid || '(no id)');
    return;
  }
  console.log(` ✗ SendBlue failed: ${sb.status} ${JSON.stringify(sb.data).slice(0, 200)}`);

  console.log('# 2. Falling back to Twilio SMS...');
  const tw = await tryTwilio();
  if (tw.ok) {
    console.log(' ✓ Twilio sent');
    console.log('   sid:', tw.data?.sid);
    return;
  }
  console.log(` ✗ Twilio failed: ${tw.status} ${JSON.stringify(tw.data).slice(0, 200)}`);
  process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
