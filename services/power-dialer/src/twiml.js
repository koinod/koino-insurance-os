// TwiML response builders. Twilio fetches these at attempt URLs; we render
// XML that tells Twilio what to do with the lead-side audio.
//
// Why hand-rolled instead of twilio.twiml.VoiceResponse:
//   - shorter; fewer deps in the hot path
//   - LiveKit SIP URI assembly is opaque in the SDK
//
// Each builder takes (attempt, session, config) and returns a TwiML string.

import { TWO_PARTY_STATES } from './compliance.js';

function sipUri({ room, identity }) {
  // Format: sip:<identity>@<livekit-sip-domain>;room=<roomname>
  // The actual SIP domain is provisioned per-trunk in LiveKit; we expect
  // LIVEKIT_SIP_DOMAIN env var to be set after trunk provisioning.
  // Fallback (dev) uses the trunk SID directly.
  const domain = process.env.LIVEKIT_SIP_DOMAIN || `${process.env.LIVEKIT_SIP_TRUNK_SID || 'sip'}.sip.livekit.cloud`;
  return `sip:${identity}@${domain}?x-livekit-room=${encodeURIComponent(room)}`;
}

export function dialIntoRoom({ room, identity, recordOnConnect = false, leadState = null }) {
  const consent = TWO_PARTY_STATES.has(leadState?.toUpperCase?.())
    ? `<Say voice="Polly.Joanna">This call may be recorded for quality and training.</Say>`
    : '';
  const record = recordOnConnect ? ` record="record-from-answer-dual"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${consent}
  <Dial${record} answerOnBridge="true" timeLimit="3600">
    <Sip>${sipUri({ room, identity })}</Sip>
  </Dial>
</Response>`;
}

// Played when a lead loses the race AND ai_assistant is disabled. FTC
// safe-harbor: prerecorded apology with caller name+number within 2s of
// the called party's greeting.
export function abandonResponse() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">Hello, this is Koino Capital. We apologize for the inconvenience but our representative had to step away. We will call you back shortly.</Say>
  <Hangup/>
</Response>`;
}

// Voicemail TwiML — plays a per-lead TTS message after the beep. The AI
// agent worker (Python LiveKit Agent) is responsible for generating the
// audio; this TwiML simply dials into the voicemail room where the agent
// will publish the audio track.
export function voicemailResponse({ attemptId }) {
  return dialIntoRoom({
    room: `vm-${attemptId}`,
    identity: `lead-${attemptId}`,
    recordOnConnect: false,
  });
}

// Divert-to-AI: same as dialIntoRoom but into the AI handler room.
export function divertAiResponse({ attemptId }) {
  return dialIntoRoom({
    room: `ai-${attemptId}`,
    identity: `lead-${attemptId}`,
    recordOnConnect: true,
  });
}

// Bridge-to-rep: dial lead into the rep's session room.
export function bridgeRepResponse({ attempt, sess }) {
  return dialIntoRoom({
    room: sess.livekit_room,
    identity: `lead-${attempt.id}`,
    recordOnConnect: !!sess.toggles?.record,
    leadState: null, // disclosure already played at leg start if enabled
  });
}

// Initial AnswerUrl — placeholder TwiML that just answers and waits for
// AMD to fire. We hold the call in the leg room until the AMD callback
// tells us where to send it. The simpler alternative — answer with a
// silent <Pause length="60"/> — also works.
export function holdInLegRoom({ attempt }) {
  return dialIntoRoom({
    room: `leg-${attempt.id}`,
    identity: `lead-${attempt.id}`,
    recordOnConnect: false,
  });
}
