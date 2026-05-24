import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock env BEFORE importing the modules under test, since config.js reads
// env at module-load time.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'sb_test_xxx';
process.env.TWILIO_ACCOUNT_SID ??= 'ACtest';
process.env.TWILIO_AUTH_TOKEN ??= 'test';
process.env.CALLING_WINDOW_START = '8';
process.env.CALLING_WINDOW_END = '21';

const { inCallingWindow, TWO_PARTY_STATES } = await import('../src/compliance.js');

test('inCallingWindow: noon ET inside window for FL', () => {
  const noonEt = new Date('2026-05-23T16:00:00Z'); // 12:00 ET
  assert.equal(inCallingWindow('FL', noonEt), true);
});

test('inCallingWindow: 6am ET outside window for FL', () => {
  const sixEt = new Date('2026-05-23T10:00:00Z'); // 06:00 ET
  assert.equal(inCallingWindow('FL', sixEt), false);
});

test('inCallingWindow: 7pm PT inside for CA but outside for NY', () => {
  const nineteenPt = new Date('2026-05-24T02:00:00Z'); // 19:00 PT = 22:00 ET
  assert.equal(inCallingWindow('CA', nineteenPt), true);
  assert.equal(inCallingWindow('NY', nineteenPt), false);
});

test('TWO_PARTY_STATES contains California and excludes Texas', () => {
  assert.ok(TWO_PARTY_STATES.has('CA'));
  assert.ok(!TWO_PARTY_STATES.has('TX'));
});
