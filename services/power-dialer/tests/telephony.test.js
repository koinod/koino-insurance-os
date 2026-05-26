// Telephony abstraction tests.
//
// These run WITHOUT real network calls — they verify the abstraction
// layer's provider-selection wiring + that both impls expose the same
// interface. End-to-end provider-specific behavior is exercised by the
// session-start smoke (curl) when live keys exist.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set required env BEFORE importing config (config reads env at module load).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'sb_test_xxx';
process.env.TWILIO_ACCOUNT_SID ??= 'AC_test';
process.env.TWILIO_AUTH_TOKEN ??= 'tok_test';
process.env.POWER_DIALER_PUBLIC_URL ??= 'http://test.local';

test('twilio impl exposes the required interface surface', async () => {
  const m = await import('../src/telephony-twilio.js');
  assert.equal(m.providerName, 'twilio');
  assert.ok(m.amdSupport === 'native' || m.amdSupport === 'media-stream');
  assert.equal(typeof m.placeOutbound, 'function');
  assert.equal(typeof m.hangup, 'function');
  assert.equal(typeof m.redirect, 'function');
  assert.equal(typeof m.sendSms, 'function');
});

test('signalwire impl exposes the same interface surface', async () => {
  const m = await import('../src/telephony-signalwire.js');
  assert.equal(m.providerName, 'signalwire');
  assert.ok(m.amdSupport === 'native' || m.amdSupport === 'media-stream');
  assert.equal(typeof m.placeOutbound, 'function');
  assert.equal(typeof m.hangup, 'function');
  assert.equal(typeof m.redirect, 'function');
  assert.equal(typeof m.sendSms, 'function');
});

test('signalwire throws helpful error when env not set', async () => {
  // Make sure no SIGNALWIRE_* env vars are set
  delete process.env.SIGNALWIRE_SPACE;
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  const m = await import('../src/telephony-signalwire.js');
  await assert.rejects(
    m.placeOutbound({
      from: '+15551234567', to: '+15557654321', attemptId: 'x', record: false,
      twimlUrl: 'http://t/x', statusCallbackUrl: 'http://t/s',
      amdCallbackUrl: 'http://t/a', recordingCallbackUrl: 'http://t/r',
      amdTimeoutMs: 4000,
    }),
    /SIGNALWIRE_/,
    'expected error mentioning SIGNALWIRE_ env'
  );
});

test('telephony.js URL builders use config.publicUrl', async () => {
  const t = await import('../src/telephony.js');
  const u1 = t.twimlUrl('abc-123');
  assert.ok(u1.includes('/twiml/leg/abc-123'));
  assert.ok(u1.startsWith('http'));
  assert.ok(t.statusCallbackUrl().includes('/webhook/twilio/status'));
  assert.ok(t.amdCallbackUrl().includes('/webhook/twilio/amd'));
});

test('default provider when TELEPHONY_PROVIDER unset is twilio', async () => {
  delete process.env.TELEPHONY_PROVIDER;
  // Re-import config + telephony (Node caches modules; force re-eval via dynamic import bust)
  const cfg = await import('../src/config.js?bust=1');
  assert.equal(cfg.config.telephonyProvider, 'twilio');
});
