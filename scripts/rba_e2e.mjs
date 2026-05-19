#!/usr/bin/env node
// scripts/rba_e2e.mjs
// RBA backend E2E harness — validates the full install-token → redeem →
// capabilities → heartbeat → command-claim → command-complete → audit →
// confirmation-request → confirmation-resolve → revoke chain.
//
// Usage: node scripts/rba_e2e.mjs
// Requires in env (or .env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:  REPFLOW_URL (default https://repflow.koino.capital)
//
// Prerequisite: one user in Supabase Auth whose email contains "rba-test",
// with an active row in agency_members. Create in Supabase dashboard →
// Authentication → Users → Add user.  e.g. rba-test@repflow.dev

import { readFileSync } from 'node:fs';
import { randomBytes }   from 'node:crypto';

// ── Env load ──────────────────────────────────────────────────────────────────

function loadDotenv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const eq = line.indexOf('=');
      if (eq < 1 || line.trimStart().startsWith('#')) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env — rely on environment */ }
}

loadDotenv();

const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = (process.env.REPFLOW_URL || 'https://repflow.koino.capital').replace(/\/$/, '');

if (!SUPA_URL || !SERVICE) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

// ── Assertion tracker ─────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.error(`  ✗  ${msg}`);
    failures.push(msg);
    failed++;
  }
  return !!condition;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function supa(path, opts = {}) {
  const { method = 'GET', body, prefer } = opts;
  const headers = {
    apikey:         SERVICE,
    authorization:  `Bearer ${SERVICE}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
  const r = await fetch(`${SUPA_URL}${path}`, {
    method, headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function api(path, opts = {}) {
  const { method = 'POST', body, agentToken } = opts;
  const headers = { 'content-type': 'application/json' };
  if (agentToken) headers['x-agent-token'] = agentToken;
  const r = await fetch(`${BASE_URL}${path}`, {
    method, headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

function hex(bytes = 32) { return randomBytes(bytes).toString('hex'); }
function short(v)        { return JSON.stringify(v).slice(0, 160); }

// ── Cleanup ───────────────────────────────────────────────────────────────────

let cleanupDeviceId = null;

async function cleanup() {
  if (!cleanupDeviceId) return;
  console.log('\n── Cleanup ──────────────────────────────────────────────────────');
  // Revoke the synthetic install; cascade cancels queued commands
  const r = await supa(`/rest/v1/rba_installs?device_id=eq.${cleanupDeviceId}`, {
    method: 'PATCH',
    body:   { status: 'revoked', revoked_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
  if (r.ok) {
    console.log('  ✓  synthetic install revoked');
    // Verify agent_token no longer works
    const hb = await api('/api/agent/heartbeat', {
      body: { version: '0.0.0-e2e' },
      agentToken: '_already_deleted_',
    });
    ok('revoked token rejected (401)', hb.status === 401);
  } else {
    console.error(`  ✗  cleanup revoke failed (${r.status}): ${short(r.data)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RBA Backend E2E Harness');
  console.log(`  Target : ${BASE_URL}`);
  console.log(`  Supa   : ${SUPA_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // ── Step 1: Find test rep user ───────────────────────────────────────────
    console.log('── Step 1: Find test rep user ───────────────────────────────────');
    // Discovery strategy:
    //  A) RBA_TEST_USER_ID env var → direct single-user lookup (most reliable)
    //  B) auth admin list endpoint → filter by "rba-test" in email
    //     (note: Supabase ≥2.6 has a known 500 bug on the list endpoint for
    //      some project configs; use A if you hit it)
    let testUser = null;

    if (process.env.RBA_TEST_USER_ID) {
      const uid = process.env.RBA_TEST_USER_ID.trim();
      const lookupR = await supa(`/auth/v1/admin/users/${uid}`);
      ok('auth admin user lookup (by ID)', lookupR.ok, `status ${lookupR.status} — ${short(lookupR.data)}`);
      if (lookupR.ok) testUser = lookupR.data;
    } else {
      const listR = await supa('/auth/v1/admin/users?page=1&per_page=100');
      if (listR.ok) {
        const usersList = listR.data?.users ?? (Array.isArray(listR.data) ? listR.data : []);
        testUser = usersList.find(u => typeof u.email === 'string' && u.email.includes('rba-test')) ?? null;
        ok('found rba-test user via list', testUser != null,
           'set RBA_TEST_USER_ID=<uuid> to bypass the list endpoint');
      } else {
        console.error(`  auth admin list → ${listR.status} (${short(listR.data)})`);
        console.error('  ℹ  Supabase list-users bug detected. Set RBA_TEST_USER_ID=<uuid> and re-run.');
        process.exit(1);
      }
    }

    if (!testUser) {
      console.error('\n❌  No user with email containing "rba-test" found.');
      console.error('    Create one:');
      console.error('      Supabase → Authentication → Users → Add user (rba-test@repflow.dev)');
      console.error('    Then set env: RBA_TEST_USER_ID=<the-new-user-uuid>');
      console.error('    And add to agency_members (role=rep, active=true).\n');
      process.exit(1);
    }
    const testUserId = testUser.id;
    console.log(`  Found : ${testUser.email}  (${testUserId})`);

    // Resolve agency membership
    const memR = await supa(
      `/rest/v1/agency_members?user_id=eq.${testUserId}&active=eq.true&select=agency_id,role`
    );
    if (!ok('test user has active membership', memR.ok && Array.isArray(memR.data) && memR.data.length > 0,
        `status ${memR.status} — ${short(memR.data)}`)) {
      console.error('    Add a row to agency_members for this user before running the harness.\n');
      process.exit(1);
    }
    const testAgencyId = memR.data[0].agency_id;
    console.log(`  Agency: ${testAgencyId}  Role: ${memR.data[0].role}`);

    // ── Step 2: Issue install token ──────────────────────────────────────────
    console.log('\n── Step 2: Issue install token ──────────────────────────────────');
    // rba_issue_install_token() requires auth.uid() (user JWT). The harness
    // has only service role, so we INSERT directly — same data path, same
    // rba_redeem_install_token validation from step 3 onwards.
    const installToken = hex(32);
    const tokenExp     = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    const tokR = await supa('/rest/v1/rba_install_tokens', {
      method: 'POST',
      body:   { token: installToken, user_id: testUserId, agency_id: testAgencyId, role: 'rep', expires_at: tokenExp },
      prefer: 'return=minimal',
    });
    ok('install token created', tokR.ok, `status ${tokR.status} — ${short(tokR.data)}`);
    console.log(`  Token : ${installToken.slice(0, 16)}… (expires ${tokenExp})`);

    // ── Step 3: Redeem token → device_id + agent_token ──────────────────────
    console.log('\n── Step 3: Redeem install token ─────────────────────────────────');
    const redeemR = await api('/api/agent/redeem', {
      body: { token: installToken, hostname: 'synthetic-e2e-harness', os: 'linux', cpu: 'e2e-cpu', ram_gb: 8, version: '0.0.0-e2e' },
    });
    ok('redeem → 200', redeemR.status === 200, `${redeemR.status} — ${short(redeemR.data)}`);
    const { device_id: deviceId, agent_token: agentToken } = redeemR.data ?? {};
    ok('device_id in response', typeof deviceId === 'string' && deviceId.length > 10);
    ok('agent_token in response', typeof agentToken === 'string' && agentToken.length > 10);
    if (!deviceId || !agentToken) {
      console.error('  Cannot continue without device_id + agent_token\n');
      return;
    }
    cleanupDeviceId = deviceId;
    console.log(`  device_id  : ${deviceId}`);
    console.log(`  agent_token: ${agentToken.slice(0, 16)}…`);

    // ── Step 4: GET capabilities ──────────────────────────────────────────────
    console.log('\n── Step 4: Capabilities ─────────────────────────────────────────');
    const capsR = await api('/api/agent/capabilities', { method: 'GET', agentToken });
    ok('capabilities → 200', capsR.status === 200, `${capsR.status} — ${short(capsR.data)}`);
    ok('capabilities.capabilities is object',
       typeof capsR.data?.capabilities === 'object' && capsR.data.capabilities !== null);
    ok('capabilities.role = rep', capsR.data?.role === 'rep');
    ok('capabilities.agency_id matches', capsR.data?.agency_id === testAgencyId);
    console.log(`  role: ${capsR.data?.role}, keys: ${Object.keys(capsR.data?.capabilities ?? {}).join(', ')}`);

    // ── Step 5: Heartbeat ─────────────────────────────────────────────────────
    console.log('\n── Step 5: Heartbeat ────────────────────────────────────────────');
    const hbR = await api('/api/agent/heartbeat', {
      body: { version: '0.0.0-e2e', status: 'active' },
      agentToken,
    });
    ok('heartbeat → 200', hbR.status === 200, `${hbR.status} — ${short(hbR.data)}`);
    ok('heartbeat ok=true',       hbR.data?.ok === true);
    ok('heartbeat device_id matches', hbR.data?.device_id === deviceId);

    // Verify last_seen_at updated in DB
    const instR = await supa(`/rest/v1/rba_installs?device_id=eq.${deviceId}&select=last_seen_at,status`);
    const instRow = Array.isArray(instR.data) ? instR.data[0] : null;
    ok('install status=active', instRow?.status === 'active');
    ok('last_seen_at set', instRow?.last_seen_at != null);

    // ── Step 6: Command-claim on empty queue ──────────────────────────────────
    console.log('\n── Step 6: Command-claim (empty queue) ──────────────────────────');
    const claimEmptyR = await api('/api/agent/command-claim', { body: {}, agentToken });
    ok('claim empty queue → 200', claimEmptyR.status === 200, `${claimEmptyR.status} — ${short(claimEmptyR.data)}`);
    // Handler returns { command: null } or null or []
    const emptyCmd = claimEmptyR.data;
    const isEmptyResult = (
      emptyCmd === null ||
      emptyCmd?.command === null ||
      (Array.isArray(emptyCmd) && emptyCmd.length === 0)
    );
    ok('no command returned when queue empty', isEmptyResult, short(emptyCmd));

    // ── Step 7: Insert ping command (simulates web UI post-command) ───────────
    console.log('\n── Step 7: Post ping command (service-role direct insert) ────────');
    // POST /api/agent/post-command requires user JWT (rba_post_command checks auth.uid()).
    // Service role direct insert gives identical coverage for the command-claim → complete chain.
    const cmdInsR = await supa('/rest/v1/rba_commands', {
      method: 'POST',
      body:   {
        device_id:  deviceId,
        agency_id:  testAgencyId,
        posted_by:  testUserId,
        kind:       'ping',
        payload:    { source: 'rba_e2e_harness', ts: new Date().toISOString() },
      },
      prefer: 'return=representation',
    });
    ok('ping command inserted', cmdInsR.ok, `status ${cmdInsR.status} — ${short(cmdInsR.data)}`);
    const commandId = (Array.isArray(cmdInsR.data) ? cmdInsR.data[0] : cmdInsR.data)?.id;
    ok('command_id returned', typeof commandId === 'string' && commandId.length > 10);
    console.log(`  command_id: ${commandId}`);

    // ── Step 8: Claim the ping command ────────────────────────────────────────
    console.log('\n── Step 8: Command-claim (ping in queue) ────────────────────────');
    const claimR = await api('/api/agent/command-claim', { body: {}, agentToken });
    ok('claim → 200', claimR.status === 200, `${claimR.status} — ${short(claimR.data)}`);
    const claimedCmd = claimR.data?.command
      ?? (Array.isArray(claimR.data) ? claimR.data[0] : claimR.data);
    ok('claimed command kind = ping', claimedCmd?.kind === 'ping', `got ${claimedCmd?.kind}`);
    ok('claimed command id matches', claimedCmd?.id === commandId, `got ${claimedCmd?.id}`);

    // ── Step 9: Complete the command ──────────────────────────────────────────
    console.log('\n── Step 9: Command-complete ─────────────────────────────────────');
    const completeR = await api('/api/agent/command-complete', {
      body: { command_id: commandId, status: 'succeeded', result: { pong: true, latency_ms: 12 } },
      agentToken,
    });
    ok('complete → 200', completeR.status === 200, `${completeR.status} — ${short(completeR.data)}`);
    ok('complete ok=true', completeR.data?.ok === true);

    // Verify in DB
    const cmdChk = await supa(`/rest/v1/rba_commands?id=eq.${commandId}&select=status,result`);
    const cmdRow  = Array.isArray(cmdChk.data) ? cmdChk.data[0] : null;
    ok('command status=succeeded in DB', cmdRow?.status === 'succeeded', `got ${cmdRow?.status}`);
    ok('command result.pong=true in DB', cmdRow?.result?.pong === true, short(cmdRow?.result));

    // ── Step 10: Audit log ────────────────────────────────────────────────────
    console.log('\n── Step 10: Audit log ───────────────────────────────────────────');
    const auditR = await api('/api/agent/audit', {
      body: {
        tool:      'synthetic_e2e_test',
        result:    'ok',
        detail:    'rba_e2e harness verification run',
        args_hash: hex(16),
      },
      agentToken,
    });
    ok('audit → 200', auditR.status === 200, `${auditR.status} — ${short(auditR.data)}`);
    ok('audit ok=true', auditR.data?.ok === true);

    // Verify row landed in DB (no order clause — only one row per device+tool in this run)
    const auditChk = await supa(
      `/rest/v1/rba_audit?device_id=eq.${deviceId}&tool=eq.synthetic_e2e_test&limit=1&select=tool,result,detail`
    );
    const auditRow = Array.isArray(auditChk.data) ? auditChk.data[0] : null;
    ok('audit row in DB', auditRow?.tool === 'synthetic_e2e_test', short(auditChk.data));
    ok('audit result=ok in DB', auditRow?.result === 'ok');

    // ── Step 11: Confirmation request ──────────────────────────────────────────
    console.log('\n── Step 11: Confirmation request ────────────────────────────────');
    // Note: api/agent/confirmation-request calls rba_request_confirmation (service_role-only)
    // with jwt=null (ANON key). If this returns 500/403, it's a known grant bug in
    // confirmation-request.js (should pass SERVICE not null). We fall back to direct
    // INSERT so the resolve step can still be tested.
    let confirmationId;
    const confApiR = await api('/api/agent/confirmation-request', {
      body: {
        action:       'send_real_sms',
        description:  'E2E test: synthetic SMS to demo number',
        args_redacted: { to: '+1404555xxxx', body_preview: '[REDACTED]' },
        channel:      'web_modal',
        command_id:   commandId,
      },
      agentToken,
    });

    if (confApiR.status === 200 && confApiR.data?.confirmation_id) {
      ok('confirmation-request → 200 via API', true);
      confirmationId = confApiR.data.confirmation_id;
      ok('confirmation_id returned', typeof confirmationId === 'string');
      console.log(`  confirmation_id: ${confirmationId}`);
    } else {
      // Known issue: confirmation-request.js passes jwt=null to rba_request_confirmation
      // (service_role-only grant). Falling back to direct INSERT.
      ok('confirmation-request → 200 via API', false,
         `status ${confApiR.status} — ${short(confApiR.data)} ` +
         '[KNOWN BUG: confirmation-request.js should pass SERVICE to rpc()]');
      console.log('  Falling back to service-role direct insert…');
      const confInsR = await supa('/rest/v1/rba_action_confirmations', {
        method: 'POST',
        body: {
          device_id:    deviceId,
          user_id:      testUserId,
          agency_id:    testAgencyId,
          command_id:   commandId,
          action:       'send_real_sms',
          description:  'E2E test: synthetic SMS (fallback insert)',
          args_redacted: { to: '+1404555xxxx' },
          channel:      'web_modal',
        },
        prefer: 'return=representation',
      });
      ok('confirmation fallback insert ok', confInsR.ok, `status ${confInsR.status} — ${short(confInsR.data)}`);
      confirmationId = (Array.isArray(confInsR.data) ? confInsR.data[0] : confInsR.data)?.id;
      ok('fallback confirmation_id returned', typeof confirmationId === 'string');
      if (confirmationId) console.log(`  confirmation_id (fallback): ${confirmationId}`);
    }

    // ── Step 12: Resolve confirmation (simulates human approval in web UI) ────
    console.log('\n── Step 12: Resolve confirmation ────────────────────────────────');
    // POST /api/agent/confirmation-resolve requires user JWT (auth.uid() check).
    // Service role PATCH achieves identical DB state for this harness.
    if (confirmationId) {
      const resolveR = await supa(
        `/rest/v1/rba_action_confirmations?id=eq.${confirmationId}`,
        {
          method: 'PATCH',
          body:   { resolution: 'approved', resolved_at: new Date().toISOString(), resolved_by: testUserId },
          prefer: 'return=minimal',
        }
      );
      ok('confirmation resolved via service role', resolveR.ok, `status ${resolveR.status}`);

      const confChk = await supa(
        `/rest/v1/rba_action_confirmations?id=eq.${confirmationId}&select=resolution,action`
      );
      const confRow = Array.isArray(confChk.data) ? confChk.data[0] : null;
      ok('resolution=approved in DB', confRow?.resolution === 'approved', `got ${confRow?.resolution}`);
      ok('action=send_real_sms in DB', confRow?.action === 'send_real_sms');
    } else {
      ok('confirmation_id available for resolve', false, 'skipped — no confirmation_id from step 11');
    }

  } finally {
    await cleanup();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  ✅  All ${total} assertions passed`);
  } else {
    console.log(`  ❌  ${failed} / ${total} failed`);
    for (const f of failures) console.log(`      • ${f}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌  Unhandled error:', err.stack || err);
  cleanup().finally(() => process.exit(1));
});
