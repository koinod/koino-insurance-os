// Telephony provider abstraction.
//
// Worker code never imports a specific provider — it imports from here.
// The provider is picked at boot time by env var `TELEPHONY_PROVIDER`
// (default: 'twilio'). This lets us migrate Twilio → SignalWire →
// Telnyx as monthly cost matters, without touching session.js,
// touchpoints.js, or any other consumer.
//
// The interface every provider implements:
//
//   placeOutbound({ from, to, attemptId, record }) → { sid }
//   hangup(sid) → void  (safe on already-dead calls)
//   redirect(sid, newUrl) → void  (mid-call TwiML/LaML reroute)
//   sendSms({ from, to, body }) → { sent, id?, error? }
//   providerName → 'twilio' | 'signalwire' | 'telnyx'
//   amdSupport  → 'native' | 'media-stream' | 'none'
//     native = provider does AMD server-side + posts result to a webhook
//     media-stream = we infer AMD from streamed audio (slower setup)
//     none = no AMD; treat every answer as human
//
// URL builders (twimlUrl, statusCallbackUrl, amdCallbackUrl) stay here
// because they're OUR worker's webhook URLs — provider-agnostic.

import { config } from './config.js';
import { logger } from './logger.js';

import * as twilioImpl from './telephony-twilio.js';
import * as signalwireImpl from './telephony-signalwire.js';

const PROVIDERS = {
  twilio: twilioImpl,
  signalwire: signalwireImpl,
};

const chosen = config.telephonyProvider in PROVIDERS
  ? config.telephonyProvider
  : 'twilio';

if (chosen !== config.telephonyProvider) {
  logger.warn({ requested: config.telephonyProvider, used: chosen },
    'unknown telephony provider; falling back to twilio');
}

export const provider = PROVIDERS[chosen];
export const providerName = provider.providerName;
export const amdSupport = provider.amdSupport;

logger.info({ provider: providerName, amdSupport }, 'telephony provider selected');

// ---------- shared webhook URL builders (provider-agnostic) ----------
export function twimlUrl(attemptId) {
  return `${config.publicUrl}/twiml/leg/${attemptId}`;
}
export function statusCallbackUrl() {
  return `${config.publicUrl}/webhook/twilio/status`;
}
export function amdCallbackUrl() {
  return `${config.publicUrl}/webhook/twilio/amd`;
}
export function recordingCallbackUrl() {
  return `${config.publicUrl}/webhook/twilio/recording`;
}

// ---------- delegated operations ----------
export const placeOutbound = (opts) => provider.placeOutbound({
  ...opts,
  twimlUrl: twimlUrl(opts.attemptId),
  statusCallbackUrl: statusCallbackUrl(),
  amdCallbackUrl: amdCallbackUrl(),
  recordingCallbackUrl: recordingCallbackUrl(),
  amdTimeoutMs: config.amdTimeoutMs,
});

export const hangup = (sid) => provider.hangup(sid);
export const redirect = (sid, newUrl) => provider.redirect(sid, newUrl);
export const sendSms = (opts) => provider.sendSms?.(opts) ?? Promise.resolve({ sent: false, error: 'provider_has_no_sms' });
