import { AccessToken, RoomServiceClient, SipClient } from 'livekit-server-sdk';
import { config } from './config.js';

// HTTP API base derived from the ws:// or wss:// LIVEKIT_URL
const httpBase = config.livekitUrl.replace(/^ws/i, 'http');

export const rooms = new RoomServiceClient(httpBase, config.livekitApiKey, config.livekitApiSecret);
export const sip   = new SipClient(httpBase, config.livekitApiKey, config.livekitApiSecret);

export function roomNameForRep(sessionId)         { return `rep-${sessionId}`; }
export function roomNameForLeg(attemptId)         { return `leg-${attemptId}`; }
export function roomNameForAi(attemptId)          { return `ai-${attemptId}`; }
export function roomNameForVoicemail(attemptId)   { return `vm-${attemptId}`; }

// Mint a join token for the rep's browser. The rep is publisher+subscriber
// in their room; the bridged leg participant publishes lead audio in.
export async function repToken({ sessionId, repId }) {
  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: `rep-${repId}`,
    name: `Rep ${repId}`,
    ttl: '4h',
  });
  at.addGrant({
    roomJoin: true,
    room: roomNameForRep(sessionId),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await at.toJwt();
}

// Mint a token for an AI agent worker to join a leg-handler room.
export async function aiAgentToken({ attemptId, identity = 'ai-handler' }) {
  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    ttl: '1h',
  });
  at.addGrant({
    roomJoin: true,
    room: roomNameForAi(attemptId),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await at.toJwt();
}

export async function ensureRoom(name, { maxParticipants = 8 } = {}) {
  try {
    await rooms.createRoom({ name, maxParticipants, emptyTimeout: 60 });
  } catch (e) {
    // already exists is fine
    if (!/already exists/i.test(String(e?.message))) throw e;
  }
}

export async function deleteRoom(name) {
  try { await rooms.deleteRoom(name); }
  catch (_) { /* ok */ }
}

// Move a participant (the lead) from one room to another. Used when a
// losing leg gets diverted from rep-room → ai-room.
export async function moveParticipant({ fromRoom, toRoom, identity }) {
  // LiveKit doesn't support a single "move" call — remove from old and the
  // SIP participant for the new room is created by recreating SIP dispatch.
  // For our flow we recreate the leg room as needed and update the Twilio
  // call's TwiML to point at the new SIP URI.
  try { await rooms.removeParticipant(fromRoom, identity); }
  catch (_) { /* ok */ }
  await ensureRoom(toRoom);
}
