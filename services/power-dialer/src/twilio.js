import twilio from 'twilio';
import { config } from './config.js';

export const twi = twilio(config.twilioSid, config.twilioToken);

// Build the TwiML callback URL the worker will serve. Twilio fetches this
// when the lead picks up — we return TwiML that dials a SIP URI pointing
// at the leg's LiveKit room.
export function twimlUrl(attemptId) {
  return `${config.publicUrl}/twiml/leg/${attemptId}`;
}

export function statusCallbackUrl() {
  return `${config.publicUrl}/webhook/twilio/status`;
}

export function amdCallbackUrl() {
  return `${config.publicUrl}/webhook/twilio/amd`;
}

// Place one outbound leg. The lead-side audio gets bridged into the leg's
// LiveKit room via a SIP URI in the TwiML we return on AnswerUrl.
export async function placeOutbound({ from, to, attemptId, record }) {
  const call = await twi.calls.create({
    to,
    from,
    url: twimlUrl(attemptId),
    method: 'POST',
    statusCallback: statusCallbackUrl(),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    machineDetection: 'DetectMessageEnd', // returns machine_end_beep when ready for VM drop
    asyncAmd: true,
    asyncAmdStatusCallback: amdCallbackUrl(),
    asyncAmdStatusCallbackMethod: 'POST',
    machineDetectionTimeout: Math.ceil(config.amdTimeoutMs / 1000),
    record: !!record,
    recordingStatusCallback: `${config.publicUrl}/webhook/twilio/recording`,
    recordingStatusCallbackMethod: 'POST',
  });
  return { sid: call.sid };
}

export async function hangup(sid) {
  if (!sid) return;
  try { await twi.calls(sid).update({ status: 'completed' }); }
  catch (e) { if (e.status !== 404) throw e; }
}

// Redirect an in-flight call to new TwiML (used to switch a lead from
// "ringing room" to "AI handler room" when they lose the race).
export async function redirect(sid, newUrl) {
  await twi.calls(sid).update({ url: newUrl, method: 'POST' });
}
