import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

// Load repo-root .env.local first (dev on mac mini), then real env wins.
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local');
if (existsSync(ENV_LOCAL)) {
  for (const line of readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env: ${name}`);
  return v;
}

function opt(name, dflt) {
  return process.env[name] ?? dflt;
}

export const config = {
  // server
  port: Number(opt('POWER_DIALER_PORT', 9787)),
  host: opt('POWER_DIALER_HOST', '0.0.0.0'),
  publicUrl: opt('POWER_DIALER_PUBLIC_URL', 'http://localhost:9787'), // where Twilio webhooks land
  logLevel: opt('LOG_LEVEL', 'info'),

  // supabase — optional at config load so one-off provisioning scripts
  // (provision-sip-trunk.js, provision-business-profile.js) can run
  // without a service role. The worker itself will fail loudly at first
  // DB call if the key is missing in real serving paths.
  supabaseUrl: opt('NEXT_PUBLIC_SUPABASE_URL', ''),
  supabaseServiceKey: opt('SUPABASE_SERVICE_ROLE_KEY', ''),

  // twilio — same: scripts may run dry without these
  twilioSid: opt('TWILIO_ACCOUNT_SID', ''),
  twilioToken: opt('TWILIO_AUTH_TOKEN', ''),
  twilioCallerId: opt('TWILIO_CALLER_ID', ''), // fallback "from" when pool not in play
  twilioRecord: (opt('TWILIO_RECORD', 'true') === 'true'),

  // livekit (self-hosted on mac mini by default)
  livekitUrl: opt('LIVEKIT_URL', 'ws://localhost:7880'),
  livekitApiKey: opt('LIVEKIT_API_KEY', 'devkey'),
  livekitApiSecret: opt('LIVEKIT_API_SECRET', 'secret'),
  livekitSipTrunkSid: opt('LIVEKIT_SIP_TRUNK_SID', ''), // set after trunk provisioning

  // sendblue (iMessage SMS lane)
  sendblueKey: opt('SENDBLUE_API_KEY', ''),
  sendblueSecret: opt('SENDBLUE_API_SECRET', ''),

  // compliance knobs
  abandonmentHardStop: Number(opt('ABANDONMENT_HARD_STOP', '0.025')), // 2.5%
  callingWindowStart: Number(opt('CALLING_WINDOW_START', '8')), // 8am lead-local
  callingWindowEnd: Number(opt('CALLING_WINDOW_END', '21')),   // 9pm lead-local
  amdTimeoutMs: Number(opt('AMD_TIMEOUT_MS', '4000')),         // give up on AMD after 4s

  // worker identity (used by failover / horizontal scaling)
  workerId: opt('POWER_DIALER_WORKER_ID', `worker-${process.pid}`),
};

export const ENV_LOCAL_PATH = ENV_LOCAL;
