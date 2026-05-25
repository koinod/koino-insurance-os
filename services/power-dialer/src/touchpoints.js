// SMS pre/post + email touchpoints.
//
// Three transports:
//   1. SendBlue iMessage — preferred when the lead has an iMessage-capable
//      number (better delivery, blue bubble, trust)
//   2. Twilio SMS — fallback for Android/landline, and primary when
//      toggles.sms_lane === 'twilio_only'
//   3. Resend email — for rep-notification and lead-recap
//
// Templates render with the existing token set (the autodialer pages use
// the same set): {first} {last} {state} {product} {rep} {calendly}.

import { config } from './config.js';
import { db, logCompliance } from './db.js';
import { logger } from './logger.js';
import { isPhoneSmsOptedOut } from './compliance.js';

const CALENDLY_URL = process.env.CALENDLY_URL || 'https://cal.com/koino';
const RESEND_KEY   = process.env.RESEND_API_KEY || '';
const RESEND_FROM  = process.env.RESEND_FROM    || 'Koino Capital <notify@koino.capital>';

// ---- template renderer -----------------------------------------------
export function renderTemplate(tpl, lead, repName) {
  if (!tpl) return '';
  const first = lead.name?.split(' ')?.[0] || 'there';
  const last  = lead.name?.split(' ')?.slice(1).join(' ') || '';
  return tpl
    .replaceAll('{first}',    first)
    .replaceAll('{last}',     last)
    .replaceAll('{state}',    lead.state || '')
    .replaceAll('{product}',  lead.product || 'insurance')
    .replaceAll('{rep}',      repName || 'our team')
    .replaceAll('{calendly}', CALENDLY_URL);
}

const PRE_CALL_DEFAULT = '{first} — {rep} from Koino calling in 30s about your {product} request. Tap to schedule instead: {calendly}';
const POST_CALL_DEFAULTS = {
  connected:         '{first}, great talking with you — recap + next steps coming. Schedule any follow-up: {calendly}',
  voicemail_dropped: '{first} — sorry I missed you. Tap here to grab a 15-min slot: {calendly}',
  abandoned_to_ai:   '{first} — my AI assistant chatted with you while I stepped away. Grab a real call here: {calendly}',
  no_answer:         '{first} — caught me right when I was reaching out. Lets connect: {calendly}',
  busy:              '{first} — your line was busy. Try back at {calendly} when you have a sec.',
  callback:          '{first}, looping back as promised. Pick any open slot: {calendly}',
  appointment:       '{first} — locked in. See you then. Confirmation: {calendly}',
  not_interested:    '',  // do not send to opted-out
};

// ---- SendBlue + Twilio SMS senders ----------------------------------
async function sendBlueSms({ to, body }) {
  if (!config.sendblueKey || !config.sendblueSecret) {
    return { sent: false, lane: 'sendblue', error: 'sendblue_not_configured' };
  }
  try {
    const r = await fetch('https://api.sendblue.co/api/send-message', {
      method: 'POST',
      headers: {
        'sb-api-key-id':   config.sendblueKey,
        'sb-api-secret-key': config.sendblueSecret,
        'content-type':    'application/json',
      },
      body: JSON.stringify({ number: to, content: body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, lane: 'sendblue', error: j.error || r.statusText };
    return { sent: true, lane: 'sendblue', id: j.message_handle || j.uuid };
  } catch (e) {
    return { sent: false, lane: 'sendblue', error: e.message };
  }
}

async function twilioSms({ to, from, body }) {
  if (!config.twilioSid || !config.twilioToken) {
    return { sent: false, lane: 'twilio', error: 'twilio_not_configured' };
  }
  try {
    const form = new URLSearchParams({ To: to, From: from || config.twilioCallerId, Body: body });
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: 'Basic ' + Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString('base64'),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, lane: 'twilio', error: j.message || r.statusText };
    return { sent: true, lane: 'twilio', id: j.sid };
  } catch (e) {
    return { sent: false, lane: 'twilio', error: e.message };
  }
}

// Top-level send: picks lane based on session.toggles.sms_lane.
// Returns { sent, lane, id?, error? }. Never throws.
export async function sendSms({ to, from, body, lane = 'sendblue_then_twilio', agencyId, sessionId }) {
  if (!to || !body) return { sent: false, error: 'missing_to_or_body' };

  // SMS opt-out check (sms_optouts table) — never bypassed.
  if (agencyId && await isPhoneSmsOptedOut(agencyId, to)) {
    await logCompliance({
      agency_id: agencyId, session_id: sessionId,
      event_type: 'dnc_block', to_number: to,
      metadata: { channel: 'sms' },
    });
    return { sent: false, error: 'opted_out' };
  }

  if (lane === 'twilio_only') return await twilioSms({ to, from, body });

  const sb = await sendBlueSms({ to, body });
  if (sb.sent) return sb;
  logger.warn({ to, err: sb.error }, 'sendblue failed; falling back to twilio');
  return await twilioSms({ to, from, body });
}

// ---- pre-call SMS ----------------------------------------------------
// Fires ~30s before the dial. Skip if no consent, opted-out, last_sms < 4h,
// or template empty.
export async function preCallSms({ session, lead, repName }) {
  if (!session.toggles?.sms_pre) return { sent: false, skipped: 'toggle_off' };
  const tpl = session.toggles?.sms_pre_template || PRE_CALL_DEFAULT;
  const body = renderTemplate(tpl, lead, repName);
  if (!body) return { sent: false, skipped: 'empty_template' };
  return await sendSms({
    to: lead.phone, body,
    lane: session.toggles?.sms_lane,
    agencyId: session.agency_id, sessionId: session.id,
  });
}

// ---- post-call SMS ---------------------------------------------------
export async function postCallSms({ session, attempt, lead, repName, disposition }) {
  if (!session.toggles?.sms_post) return { sent: false, skipped: 'toggle_off' };
  const customTplKey = `sms_post_${disposition}_template`;
  const tpl = session.toggles?.[customTplKey] || POST_CALL_DEFAULTS[disposition] || '';
  if (!tpl) return { sent: false, skipped: 'no_template_for_disposition' };
  const body = renderTemplate(tpl, lead, repName);
  return await sendSms({
    to: attempt.to_number, body,
    lane: session.toggles?.sms_lane,
    agencyId: session.agency_id, sessionId: session.id,
  });
}

// ---- email to rep on connect / disposition --------------------------
export async function sendEmail({ to, subject, html }) {
  if (!RESEND_KEY) return { sent: false, error: 'resend_not_configured' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, error: j.message || r.statusText };
    return { sent: true, id: j.id };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

// Resolve rep email from the reps table.
export async function getRepEmail(repId) {
  if (!repId) return null;
  const { data, error } = await db.from('reps').select('email').eq('id', repId).maybeSingle();
  if (error) return null;
  return data?.email || null;
}

export async function emailRepOnDisposition({ session, attempt, lead, disposition }) {
  if (!session.toggles?.email) return { sent: false, skipped: 'toggle_off' };
  const repEmail = await getRepEmail(session.rep_id);
  if (!repEmail) return { sent: false, skipped: 'rep_email_unknown' };
  const subject = `Call ${disposition.replace('_', ' ')}: ${lead.name || attempt.to_number}`;
  const html = `
    <div style="font-family:Inter,sans-serif">
      <h2>${subject}</h2>
      <table style="border-collapse:collapse">
        <tr><td><b>Lead</b></td><td>${lead.name || ''} (${lead.state || ''})</td></tr>
        <tr><td><b>Phone</b></td><td>${attempt.to_number}</td></tr>
        <tr><td><b>Disposition</b></td><td>${disposition}</td></tr>
        <tr><td><b>Duration</b></td><td>${attempt.duration_sec || 0}s</td></tr>
        <tr><td><b>AI summary</b></td><td>${attempt.ai_summary || '(none)'}</td></tr>
      </table>
      <p><a href="${CALENDLY_URL}">Schedule follow-up via Calendly</a></p>
    </div>`;
  return await sendEmail({ to: repEmail, subject, html });
}
