import { config } from './config.js';
import { db, getSession, insertAttempt, updateAttempt, claimWinner, releaseWinner, pickFromNumber, endSession, logCompliance } from './db.js';
import { placeOutbound, hangup, redirect, twimlUrl } from './twilio.js';
import { ensureRoom, roomNameForRep, roomNameForLeg, roomNameForAi, repToken } from './livekit.js';
import { preflight, abandonmentSafe } from './compliance.js';
import { logger } from './logger.js';

// Start a session: create rep room, mint token, return token+room for the UI.
export async function startSession({ agencyId, repId, maxLines = 3, leadQueue = [], toggles = {} }) {
  const roomName = `rep-${repId}-${Date.now()}`;
  await ensureRoom(roomName);

  const insert = {
    agency_id: agencyId,
    rep_id: repId,
    livekit_room: roomName,
    worker_url: config.publicUrl,
    max_lines: Math.min(Math.max(1, maxLines), 10),
    lead_queue: leadQueue,
    toggles: { ...toggles },
    status: 'active',
  };
  const { data, error } = await db.from('dial_sessions').insert(insert).select().single();
  if (error) throw error;

  const token = await repToken({ sessionId: data.id, repId });
  return {
    session: data,
    livekit: { url: config.livekitUrl, room: roomName, token },
  };
}

// Dial the next N (= remaining lines under max_lines) leads from the queue.
// Returns the call_attempts inserted. Idempotent on the queue: caller
// advances queue_position so concurrent dialNext doesn't double-fire.
export async function dialNext({ sessionId }) {
  const sess = await getSession(sessionId);
  if (sess.status !== 'active') return { dialed: 0, reason: `session_${sess.status}` };
  if (sess.current_bridged_attempt_id) return { dialed: 0, reason: 'rep_already_bridged' };

  const guard = await abandonmentSafe(sess.agency_id);
  if (!guard.ok) {
    await endSession(sessionId, 'aborted_compliance');
    logger.warn({ sessionId, rate: guard.rate }, 'session aborted: abandonment > hard_stop');
    return { dialed: 0, reason: 'abandonment_hard_stop', rate: guard.rate };
  }

  const queue = sess.lead_queue || [];
  const slots = sess.max_lines - sess.lines_active;
  const batch = queue.slice(sess.queue_position, sess.queue_position + slots);
  if (!batch.length) return { dialed: 0, reason: 'queue_empty' };

  const batchSeq = Math.floor(sess.queue_position / sess.max_lines);
  const attempts = [];

  for (const lead of batch) {
    const e164 = lead.phone;
    const state = lead.state;
    const areaCode = e164?.replace(/^\+?1/, '').slice(0, 3);

    // Compliance preflight
    const pre = await preflight({ agencyId: sess.agency_id, sessionId, e164, state });
    if (!pre.ok) {
      const attempt = await insertAttempt({
        session_id: sessionId, agency_id: sess.agency_id, rep_id: sess.rep_id,
        lead_id: lead.lead_id ?? null, batch_seq: batchSeq,
        from_number: 'preflight', to_number: e164,
        disposition: pre.disposition, ended_at: new Date().toISOString(),
      });
      attempts.push(attempt);
      continue;
    }

    // Pick from-number from pool; if pool empty, fall back to TWILIO_CALLER_ID.
    const fromNumber = (await pickFromNumber(sess.agency_id, areaCode)) || config.twilioCallerId;
    if (!fromNumber) {
      logger.error({ agencyId: sess.agency_id }, 'no usable from-number; aborting attempt');
      continue;
    }

    // Pre-allocate attempt row so the TwiML callback can find it by id.
    const attempt = await insertAttempt({
      session_id: sessionId, agency_id: sess.agency_id, rep_id: sess.rep_id,
      lead_id: lead.lead_id ?? null, batch_seq: batchSeq,
      from_number: fromNumber, to_number: e164,
    });

    // Pre-create the leg room so AMD/answer can dial right in.
    await ensureRoom(roomNameForLeg(attempt.id));

    try {
      const { sid } = await placeOutbound({
        from: fromNumber, to: e164,
        attemptId: attempt.id,
        record: !!sess.toggles?.record,
      });
      await updateAttempt(attempt.id, {
        twilio_call_sid: sid,
        livekit_room: roomNameForLeg(attempt.id),
      });
      attempts.push({ ...attempt, twilio_call_sid: sid });
    } catch (e) {
      logger.error({ err: e, attemptId: attempt.id }, 'placeOutbound failed');
      await updateAttempt(attempt.id, {
        disposition: 'failed',
        ended_at: new Date().toISOString(),
      });
    }
  }

  // Advance the queue cursor + lines_active counter atomically.
  await db.from('dial_sessions').update({
    queue_position: sess.queue_position + batch.length,
    lines_active: sess.lines_active + attempts.filter(a => a.twilio_call_sid).length,
    stats: { ...sess.stats, dials: (sess.stats?.dials ?? 0) + attempts.length },
  }).eq('id', sessionId);

  return { dialed: attempts.length, attempts };
}

// Called by /webhook/twilio/amd when Twilio reports AMD result.
// Implements the race: first human wins → bridged to rep; losers → AI handler.
export async function onAmdResult({ attemptId, amd }) {
  const { data: attempt } = await db.from('call_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (!attempt) return { ignored: true, reason: 'no_attempt' };

  await updateAttempt(attemptId, {
    amd_result: amd,
    amd_detected_at: new Date().toISOString(),
    answered_at: attempt.answered_at ?? new Date().toISOString(),
  });

  const sess = await getSession(attempt.session_id);
  if (sess.status !== 'active') {
    await hangup(attempt.twilio_call_sid);
    await updateAttempt(attemptId, { disposition: 'cancelled', ended_at: new Date().toISOString() });
    return { handled: 'cancelled' };
  }

  if (amd === 'human') {
    const won = await claimWinner(sess.id, attemptId);
    if (won) {
      // Redirect the call's TwiML to the rep-room SIP URI.
      await redirect(attempt.twilio_call_sid, `${config.publicUrl}/twiml/bridge-rep/${attemptId}`);
      logger.info({ attemptId, sessionId: sess.id }, 'race won; bridged to rep');
      return { handled: 'bridged_to_rep' };
    }
    // Lost the race → divert to AI handler if enabled, else hangup with FTC apology.
    if (sess.toggles?.ai_assistant !== false) {
      await redirect(attempt.twilio_call_sid, `${config.publicUrl}/twiml/divert-ai/${attemptId}`);
      await updateAttempt(attemptId, { disposition: 'abandoned_to_ai' });
      await logCompliance({
        agency_id: sess.agency_id, session_id: sess.id, call_attempt_id: attemptId,
        event_type: 'ai_handled_diversion', to_number: attempt.to_number,
      });
      return { handled: 'diverted_to_ai' };
    }
    // No AI configured — this is a real FTC abandonment. Play the safe-harbor
    // apology TwiML and log it.
    await redirect(attempt.twilio_call_sid, `${config.publicUrl}/twiml/abandon/${attemptId}`);
    await updateAttempt(attemptId, { disposition: 'failed' });
    await logCompliance({
      agency_id: sess.agency_id, session_id: sess.id, call_attempt_id: attemptId,
      event_type: 'abandoned', to_number: attempt.to_number,
    });
    return { handled: 'abandoned_safe_harbor' };
  }

  if (amd === 'machine_end_beep' || amd === 'machine_start') {
    if (sess.toggles?.ai_voicemail !== false) {
      await redirect(attempt.twilio_call_sid, `${config.publicUrl}/twiml/voicemail/${attemptId}`);
      await updateAttempt(attemptId, { disposition: 'voicemail_dropped' });
      return { handled: 'voicemail_dropped' };
    }
    await hangup(attempt.twilio_call_sid);
    await updateAttempt(attemptId, { disposition: 'voicemail_dropped', ended_at: new Date().toISOString() });
    return { handled: 'voicemail_no_ai' };
  }

  if (amd === 'fax' || amd === 'unknown') {
    await hangup(attempt.twilio_call_sid);
    await updateAttempt(attemptId, { disposition: 'failed', ended_at: new Date().toISOString() });
    return { handled: 'fax_or_unknown' };
  }

  return { handled: 'noop', amd };
}

// Called by /webhook/twilio/status on completed/no-answer/busy.
export async function onStatusCallback({ sid, status, durationSec }) {
  const { data: attempt } = await db.from('call_attempts').select('*').eq('twilio_call_sid', sid).maybeSingle();
  if (!attempt) return { ignored: true };

  const final = ['completed','no-answer','busy','failed','canceled'].includes(status);
  if (!final) return { ok: true, status };

  const patch = {
    ended_at: new Date().toISOString(),
    duration_sec: durationSec || null,
  };
  if (!attempt.disposition) {
    patch.disposition = status === 'no-answer' ? 'no_answer'
                      : status === 'busy'      ? 'busy'
                      : status === 'failed'    ? 'failed'
                      : status === 'canceled'  ? 'cancelled'
                      : (attempt.bridged_to_rep_at ? 'connected' : 'no_answer');
  }
  await updateAttempt(attempt.id, patch);

  // If this was the bridged leg, release the rep so they can be re-bridged
  // on the next batch.
  const sess = await getSession(attempt.session_id);
  if (sess.current_bridged_attempt_id === attempt.id) {
    await releaseWinner(sess.id);
  }

  // Decrement lines_active
  await db.from('dial_sessions')
    .update({ lines_active: Math.max(0, (sess.lines_active ?? 1) - 1) })
    .eq('id', sess.id);

  return { ok: true };
}

export async function endSessionById(id) {
  const sess = await getSession(id);
  // Hang up any live call_attempts that haven't ended yet.
  const { data: live } = await db
    .from('call_attempts')
    .select('id, twilio_call_sid')
    .eq('session_id', id)
    .is('ended_at', null);
  for (const a of live ?? []) {
    await hangup(a.twilio_call_sid);
    await updateAttempt(a.id, { disposition: 'cancelled', ended_at: new Date().toISOString() });
  }
  await endSession(id, 'ended');
  return { ok: true };
}
