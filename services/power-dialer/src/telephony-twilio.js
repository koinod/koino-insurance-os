// Twilio implementation of the telephony interface.
//
// Uses the official Twilio Node SDK. Auth precedence:
//   1. TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET  (preferred — scoped)
//   2. TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN     (legacy)
//
// AMD strategy: native (Twilio server-side AMD with async webhook).

import twilio from 'twilio';
import { config } from './config.js';

export const providerName = 'twilio';
export const amdSupport = 'native';

function client() {
  // Auth: API Key preferred, Auth Token fallback. Account SID always in URL.
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  if (apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid: config.twilioSid });
  }
  return twilio(config.twilioSid, config.twilioToken);
}

export async function placeOutbound({
  from, to, attemptId, record,
  twimlUrl, statusCallbackUrl, amdCallbackUrl, recordingCallbackUrl, amdTimeoutMs,
}) {
  const c = client();
  const call = await c.calls.create({
    to, from,
    url: twimlUrl, method: 'POST',
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    machineDetection: 'DetectMessageEnd',
    asyncAmd: true,
    asyncAmdStatusCallback: amdCallbackUrl,
    asyncAmdStatusCallbackMethod: 'POST',
    machineDetectionTimeout: Math.ceil(amdTimeoutMs / 1000),
    record: !!record,
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackMethod: 'POST',
  });
  return { sid: call.sid };
}

export async function hangup(sid) {
  if (!sid) return;
  try { await client().calls(sid).update({ status: 'completed' }); }
  catch (e) { if (e.status !== 404) throw e; }
}

export async function redirect(sid, newUrl) {
  await client().calls(sid).update({ url: newUrl, method: 'POST' });
}

export async function sendSms({ from, to, body }) {
  if (!from || !to || !body) return { sent: false, error: 'missing_to_from_or_body' };
  try {
    const msg = await client().messages.create({ from, to, body });
    return { sent: true, id: msg.sid };
  } catch (e) {
    return { sent: false, error: `twilio ${e.status || ''}: ${e.message}` };
  }
}
